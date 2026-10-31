// Sessão: abre o banco guardado no aparelho, mantém o estado em memória e grava a cada mudança (com atraso).
// As telas só chamam `estado()` e `aplicar(...)`; não sabem de SQLite nem de IndexedDB.
import { abrirBanco, exportarBanco } from '../armazenamento/banco.js';
import { fazerBackup, lerBackup, restaurarBackup } from '../armazenamento/backup.js';
import { abrirIndexedDB } from '../armazenamento/indexeddb.js';
import { carregarEstado, salvarEstado, gravarAnotacao, inserirVersao, listarVersoes, ultimaVersaoEm } from '../armazenamento/repositorio.js';
import { anexarArquivo } from '../nucleo/arquivos.js';
import { esvaziarLixeira } from '../nucleo/materias.js';
import { registrarBloco } from '../nucleo/foco.js';
import { reconciliarPlano, planoMudou, marcarTarefaFeita, lerDisponibilidade, validarDisponibilidade } from '../nucleo/planejador.js';
import { criarCartao, alterarCartao, cartoesParaExportar, marcarExportados } from '../nucleo/cartoes.js';
import { LIMITE_IMAGEM_BYTES, MAX_IMAGENS_LADO } from '../nucleo/cartoes.js';
import { chaveImagem, imagensDoCartao } from '../nucleo/materias.js';
import { gerarApkg } from '../armazenamento/apkg.js';
import { gerarPacote, analisarPacote, aplicarPacote } from '../armazenamento/troca.js';
import { criarAnkiConnect, enviarCartoes, situacaoDoAnki } from '../armazenamento/ankiconnect.js';
import { atualizarAnotacao, deveGuardarVersao, textoDoDelta, versoesParaApagar, VERSOES_MAX } from '../nucleo/anotacoes.js';
import { criarGravador } from '../armazenamento/gravador.js';
import { descarregarPendencias } from './pendencias.js';
import { visivel } from '../nucleo/anos.js';

const carregarScript = (src) => new Promise((ok, erro) => {
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar o SQLite.')); document.head.appendChild(s);
});

export async function iniciarSessao({ nomeBanco = 'ohara', aoFalhar = () => {} } = {}) {
  await carregarScript('vendor/sql-wasm.js');
  const SQL = await globalThis.initSqlJs({ locateFile: (f) => 'vendor/' + f });
  const armazenamento = await abrirIndexedDB(globalThis.indexedDB, nomeBanco);
  const guardado = await armazenamento.lerBanco();
  let db = abrirBanco(SQL, guardado?.bytes);
  let estado = carregarEstado(db);
  const ouvintesGravou = new Set(), visCache = { de: null, v: null };
  const gravador = criarGravador(armazenamento, () => exportarBanco(db), { aoFalhar, aoGravar: () => ouvintesGravou.forEach((f) => { try { f(); } catch { /* quem ouve não pode atrapalhar a gravação */ } }) });

  const dia = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // Ao sair, primeiro as telas gravam o que está pendente (ex.: anotação no atraso de 600 ms); só então o gravador descarrega.
  const aoSair = () => { descarregarPendencias(); gravador.descarregar(); };
  addEventListener('pagehide', aoSair);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') aoSair(); });
  // Criar e atualizar cartão esperam gravar imagens: em fila, para dois salvamentos seguidos não usarem o mesmo id nem pisar no estado um do outro.
  let fila = Promise.resolve();
  const emFila = (fn) => { const r = fila.then(fn); fila = r.catch(() => {}); return r; };

  const lerCfg = (chave) => { const r = db.exec('SELECT valor FROM config WHERE chave = ?', [chave]); return r.length ? r[0].values[0][0] : null; };
  const gravarCfg = (chave, valor) => { db.run('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)', [chave, String(valor)]); gravador.agendar(); };
  if (!lerCfg('inicio_uso')) gravarCfg('inicio_uso', dia());          // dias antes disso nunca são "não estudou"

  return {
    /** O que as telas do dia a dia enxergam: sem as matérias de anos arquivados (o mesmo objeto, se não houver nenhum). */
    estado: () => { if (visCache.de !== estado) { visCache.de = estado; visCache.v = visivel(estado); } return visCache.v; },
    /** Tudo, inclusive os anos arquivados (Acervo, consulta). Para gravar, use `aplicar((e) => ...)`: ele já recebe o estado completo. */
    estadoCompleto: () => estado,
    /** Grava os blocos concluídos (da Sala de Foco) no estado. */
    registrarBlocos(registros, agora = new Date().toISOString()) {
      let novo = estado;
      for (const r of registros) { novo = registrarBloco(novo, r, agora); if (r.tarefa_id && r.estado === 'concluido' && novo.tarefas.some((t) => t.id === r.tarefa_id)) novo = marcarTarefaFeita(novo, r.tarefa_id, agora); }
      salvarEstado(db, novo); estado = novo; gravador.agendar();
    },
    /** Sessão de foco em andamento (guardada no banco para sobreviver a recarregar a página). */
    /** Põe o plano em dia (replaneja atrasos, tira o que deixou de valer). Chamar ao abrir Hoje, Planejar e Foco. */
    sincronizarPlano(hoje, agora = new Date().toISOString()) {
      const novo = reconciliarPlano(estado, hoje, lerDisponibilidade(lerCfg('disponibilidade')), lerCfg('inicio_uso'), agora);
      if (planoMudou(estado.tarefas, novo)) { estado = { ...estado, tarefas: novo }; salvarEstado(db, estado); gravador.agendar(); }
    },
    disponibilidade: () => lerDisponibilidade(lerCfg('disponibilidade')),
    gravarDisponibilidade(lista) { gravarCfg('disponibilidade', JSON.stringify(validarDisponibilidade(lista))); },
    /**
     * Cria o cartão. `imagem`: um File (vai na frente, como antes) ou { frente: [File], verso: [File] } (até MAX_IMAGENS_LADO por lado).
     * As imagens são guardadas antes, para nunca ficar cartão apontando para imagem que não existe.
     */
    criarCartao: (aulaId, dados, imagem = null) => emFila(async () => {
      const lista = (x) => [].concat(x ?? []).filter(Boolean);
      const lados = imagem && typeof imagem.type !== 'string' ? { frente: lista(imagem.frente), verso: lista(imagem.verso) } : { frente: lista(imagem), verso: [] };
      for (const f of [...lados.frente, ...lados.verso]) if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type) || f.size > LIMITE_IMAGEM_BYTES) throw new Error('A imagem do cartão deve ser PNG, JPG, WEBP ou GIF de até 5 MB.');
      if (lados.frente.length > MAX_IMAGENS_LADO || lados.verso.length > MAX_IMAGENS_LADO) throw new Error(`Cada lado do cartão aceita até ${MAX_IMAGENS_LADO} imagens.`);
      const id = estado.cartoes.reduce((m, c) => Math.max(m, c.id), 0) + 1;
      const novo = criarCartao(estado, aulaId, { ...dados, temImagem: lados.frente.length, temImagemVerso: lados.verso.length }, new Date().toISOString(), globalThis.crypto.randomUUID()).estado;
      for (const lado of ['frente', 'verso']) for (const [j, f] of lados[lado].entries()) await armazenamento.gravarArquivo(chaveImagem(id, lado, j), f);
      salvarEstado(db, novo); estado = novo; gravador.agendar();
    }),
    /**
     * Atualiza o texto de um cartão salvo e, se `imagens` ({ frente: [File], verso: [File] }) vier, troca TODAS as suas imagens por essas.
     * Ordem de segurança: valida tudo, grava as imagens novas, grava o cartão e só então apaga as que sobraram.
     */
    atualizarCartao: (id, dados, imagens = null) => emFila(async () => {
      const atual = estado.cartoes.find((c) => c.id === id && !c.excluido_em);
      if (!atual) throw new Error('Cartão não encontrado.');
      const lados = imagens ? { frente: [].concat(imagens.frente ?? []).filter(Boolean), verso: [].concat(imagens.verso ?? []).filter(Boolean) } : null;
      if (lados) {
        for (const f of [...lados.frente, ...lados.verso]) if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type) || f.size > LIMITE_IMAGEM_BYTES) throw new Error('A imagem do cartão deve ser PNG, JPG, WEBP ou GIF de até 5 MB.');
        if (lados.frente.length > MAX_IMAGENS_LADO || lados.verso.length > MAX_IMAGENS_LADO) throw new Error(`Cada lado do cartão aceita até ${MAX_IMAGENS_LADO} imagens.`);
      }
      const novo = alterarCartao(estado, id, { ...dados, ...(lados ? { temImagem: lados.frente.length, temImagemVerso: lados.verso.length } : {}) }, new Date().toISOString());
      // As imagens novas caem nas mesmas chaves das antigas: guarda as antigas para devolvê-las se algo falhar antes de o cartão ser salvo.
      const antigas = [];
      if (lados) { const n = imagensDoCartao(atual); for (const lado of ['frente', 'verso']) for (let j = 0; j < Math.min(n[lado], lados[lado].length); j++) antigas.push([chaveImagem(id, lado, j), await armazenamento.lerArquivo(chaveImagem(id, lado, j))]); }
      try {
        if (lados) for (const lado of ['frente', 'verso']) for (const [j, f] of lados[lado].entries()) await armazenamento.gravarArquivo(chaveImagem(id, lado, j), f);
        salvarEstado(db, novo);
      } catch (e) {
        for (const [k, b] of antigas) if (b) { try { await armazenamento.gravarArquivo(k, b); } catch { /* melhor esforço */ } }
        throw e;
      }
      estado = novo; gravador.agendar();
      if (lados) { const antes = imagensDoCartao(atual); for (const lado of ['frente', 'verso']) for (let j = lados[lado].length; j < antes[lado]; j++) await armazenamento.apagarArquivo(chaveImagem(id, lado, j)); }
    }),
    /** Uma imagem do cartão (`lado` 'frente' ou 'verso', posição `j`), ou null. */
    lerImagemLado: (id, lado, j = 0) => armazenamento.lerArquivo(chaveImagem(id, lado, j)),
    lerImagemCartao: (id) => armazenamento.lerArquivo(chaveImagem(id, 'frente', 0)),
    /** Imagens dos cartões (Map id → { frente: [{ bytes, extensao }], verso: [...] }), para o .apkg e para o AnkiConnect. */
    async imagensDosCartoes(itens) {
      const imagens = new Map(), EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
      for (const { cartao } of itens) {
        const entrada = { frente: [], verso: [] }, n = imagensDoCartao(cartao);
        for (const lado of ['frente', 'verso']) for (let j = 0; j < n[lado]; j++) {
          const b = await armazenamento.lerArquivo(chaveImagem(cartao.id, lado, j)); if (!b) continue;
          entrada[lado].push({ bytes: new Uint8Array(await b.arrayBuffer()), extensao: EXT[b.type] ?? 'png' });
        }
        if (entrada.frente.length || entrada.verso.length) imagens.set(cartao.id, entrada);
      }
      return imagens;
    },
    /** Gera o .apkg dos cartões (todos, de uma matéria ou de uma aula) e marca como enviados. Devolve { bytes, nome, total }. */
    async exportarCartoes(filtro = {}) {
      const itens = cartoesParaExportar(estado, filtro), imagens = await this.imagensDosCartoes(itens);
      const r = await gerarApkg(SQL, itens, imagens);
      const novo = marcarExportados(estado, itens.map((i) => i.cartao.id), new Date().toISOString());
      salvarEstado(db, novo); estado = novo; gravador.agendar();
      return r;
    },
    /** Envia direto ao Anki aberto neste computador (AnkiConnect) e marca como enviados os que chegaram. Devolve o relatório. */
    async enviarAoAnki(filtro = {}) {
      const itens = cartoesParaExportar(estado, filtro), r = await enviarCartoes(criarAnkiConnect(), itens, await this.imagensDosCartoes(itens));
      if (r.enviados.length) { const novo = marcarExportados(estado, r.enviados, new Date().toISOString()); salvarEstado(db, novo); estado = novo; gravador.agendar(); }
      return r;
    },
    situacaoDoAnki: () => situacaoDoAnki(criarAnkiConnect()),
    /** Troca entre aparelhos: gerar o pacote, ler o pacote do outro (sem alterar nada) e aplicar a decisão. */
    async gerarPacoteTroca(completo) { descarregarPendencias(); await gravador.descarregar(); return gerarPacote({ db, armazenamento, completo }); },
    async analisarPacoteTroca(zip) { descarregarPendencias(); await gravador.descarregar(); return analisarPacote({ SQL, db, armazenamento, zip }); },
    async aplicarPacoteTroca(zip, analise, escolha) {
      descarregarPendencias();
      await gravador.descarregar();
      const r = await aplicarPacote({ SQL, db, armazenamento, zip, analise, escolha });
      if (r.db) { db = r.db; estado = carregarEstado(db); }
      return { trocou: !!r.db, copiaLocal: r.copiaLocal };
    },
    lerFocoAtivo() { try { return JSON.parse(lerCfg('foco_ativo') || 'null'); } catch { return null; } },
    gravarFocoAtivo(s) { gravarCfg('foco_ativo', JSON.stringify(s)); },
    /** `mudar(estado)` devolve o estado novo (ou lança Error com mensagem para o usuário). Só então grava. */
    aplicar(mudar) {
      const novo = mudar(estado);
      salvarEstado(db, novo);
      estado = novo;
      gravador.agendar();
    },
    descarregar: () => gravador.descarregar(),
    /** Chama `f` toda vez que os dados forem gravados no aparelho. Devolve a função que para de ouvir. */
    aoGravar(f) { ouvintesGravou.add(f); return () => ouvintesGravou.delete(f); },
    lerConfig: lerCfg,
    gravarConfig: gravarCfg,
    /** Gera o .zip e anota a data do último backup. Devolve { bytes, nome }. */
    async fazerBackup(completo) {
      descarregarPendencias();
      const agora = new Date().toISOString();
      const r = await fazerBackup({ db, armazenamento, completo, agora });
      this.gravarConfig('ultimo_backup', agora);
      return r;
    },
    /** Confere o .zip sem alterar nada; devolve o resumo ou lança Error com mensagem para o usuário. */
    resumoDoBackup: (zip) => lerBackup(SQL, zip).resumo,
    /** Troca TODOS os dados pelos do backup (guardando uma cópia dos atuais). */
    async restaurar(zip) {
      descarregarPendencias();
      await gravador.descarregar();
      db = await restaurarBackup({ SQL, armazenamento, dbAtual: db, zip });
      estado = carregarEstado(db);
    },
    /** Anexa um arquivo (File) à aula: guarda o conteúdo primeiro e só então o registro, para nunca ficar registro sem arquivo. */
    async anexar(aulaId, arquivo) {
      const { estado: novo, arquivo: reg } = anexarArquivo(estado, aulaId, { nome: arquivo.name, tipo_mime: arquivo.type, tamanho: arquivo.size }, new Date().toISOString());
      await armazenamento.gravarArquivo(reg.id, arquivo);
      salvarEstado(db, novo); estado = novo; gravador.agendar();
      return reg;
    },
    lerArquivo: (id) => armazenamento.lerArquivo(id),
    /** Esvazia a lixeira e apaga também os conteúdos dos arquivos. Devolve a contagem apagada. */
    async esvaziarLixeira() {
      const r = esvaziarLixeira(estado);
      salvarEstado(db, r.estado); estado = r.estado; gravador.agendar();
      for (const id of r.arquivosApagados) await armazenamento.apagarArquivo(id);
      return r.apagados;
    },
    /** Grava o texto da aula. Antes de uma nova rodada de edição (5 min depois da última versão), guarda o texto anterior no histórico. */
    salvarAnotacao(aulaId, conteudo, agora = new Date().toISOString()) {
      const aula = estado.aulas.find((a) => a.id === aulaId);
      if (aula && aula.anotacoes !== conteudo && textoDoDelta(aula.anotacoes) && deveGuardarVersao(ultimaVersaoEm(db, aulaId), agora)) {
        inserirVersao(db, aulaId, aula.anotacoes, agora, VERSOES_MAX, versoesParaApagar);
      }
      estado = atualizarAnotacao(estado, aulaId, conteudo);
      gravarAnotacao(db, aulaId, conteudo); gravador.agendar();
    },
    listarVersoes: (aulaId) => listarVersoes(db, aulaId),
    /** Volta a uma versão do histórico; o texto de agora vira uma versão, então dá para desfazer. */
    restaurarVersao(aulaId, versaoId, agora = new Date().toISOString()) {
      const v = listarVersoes(db, aulaId).find((x) => x.id === versaoId);
      if (!v) throw new Error('Versão não encontrada.');
      const aula = estado.aulas.find((a) => a.id === aulaId);
      if (textoDoDelta(aula.anotacoes)) inserirVersao(db, aulaId, aula.anotacoes, agora, VERSOES_MAX, versoesParaApagar);
      estado = atualizarAnotacao(estado, aulaId, v.conteudo);
      gravarAnotacao(db, aulaId, v.conteudo); gravador.agendar();
      return v.conteudo;
    },
    armazenamento,
    get db() { return db; },
  };
}
