// Sessão: abre o banco guardado no aparelho, mantém o estado em memória e grava a cada mudança (com atraso).
// As telas só chamam `estado()` e `aplicar(...)`; não sabem de SQLite nem de IndexedDB.
import { abrirBanco, exportarBanco } from '../armazenamento/banco.js';
import { fazerBackup, lerBackup, restaurarBackup } from '../armazenamento/backup.js';
import { abrirIndexedDB } from '../armazenamento/indexeddb.js';
import { carregarEstado, salvarEstado, gravarAnotacao, inserirVersao, listarVersoes, ultimaVersaoEm } from '../armazenamento/repositorio.js';
import { anexarArquivo } from '../nucleo/arquivos.js';
import { esvaziarLixeira } from '../nucleo/materias.js';
import { registrarBloco } from '../nucleo/foco.js';
import { atualizarAnotacao, deveGuardarVersao, textoDoDelta, versoesParaApagar, VERSOES_MAX } from '../nucleo/anotacoes.js';
import { criarGravador } from '../armazenamento/gravador.js';

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
  const gravador = criarGravador(armazenamento, () => exportarBanco(db), { aoFalhar });

  const dia = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  addEventListener('pagehide', () => gravador.descarregar());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') gravador.descarregar(); });

  const lerCfg = (chave) => { const r = db.exec('SELECT valor FROM config WHERE chave = ?', [chave]); return r.length ? r[0].values[0][0] : null; };
  const gravarCfg = (chave, valor) => { db.run('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)', [chave, String(valor)]); gravador.agendar(); };
  if (!lerCfg('inicio_uso')) gravarCfg('inicio_uso', dia());          // dias antes disso nunca são "não estudou"

  return {
    estado: () => estado,
    /** Grava os blocos concluídos (da Sala de Foco) no estado. */
    registrarBlocos(registros, agora = new Date().toISOString()) {
      let novo = estado; for (const r of registros) novo = registrarBloco(novo, r, agora);
      salvarEstado(db, novo); estado = novo; gravador.agendar();
    },
    /** Sessão de foco em andamento (guardada no banco para sobreviver a recarregar a página). */
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
    lerConfig: lerCfg,
    gravarConfig: gravarCfg,
    /** Gera o .zip e anota a data do último backup. Devolve { bytes, nome }. */
    async fazerBackup(completo) {
      const agora = new Date().toISOString();
      const r = await fazerBackup({ db, armazenamento, completo, agora });
      this.gravarConfig('ultimo_backup', agora);
      return r;
    },
    /** Confere o .zip sem alterar nada; devolve o resumo ou lança Error com mensagem para o usuário. */
    resumoDoBackup: (zip) => lerBackup(SQL, zip).resumo,
    /** Troca TODOS os dados pelos do backup (guardando uma cópia dos atuais). */
    async restaurar(zip) {
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
