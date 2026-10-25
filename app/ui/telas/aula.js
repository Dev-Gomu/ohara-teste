// Tela da Aula: slide (PDF ou imagem) à esquerda, anotações à direita; em pé, duas abas.
// Cada painel cuida do próprio DOM (leitor e editor ficam vivos); a tela só é redesenhada ao entrar nela.
import { escaparHtml, formatarBytes } from '../../nucleo/texto.js';
import { ativas } from '../../nucleo/materias.js';
import { descreverHorario } from '../../nucleo/aulas.js';
import { arquivosDaAula, excluirArquivo, restaurarArquivo, ehPdf } from '../../nucleo/arquivos.js';
import { criarMarcador, removerMarcador, marcadoresDaAula, descreverMarcador } from '../../nucleo/marcadores.js';
import { textoDoDelta } from '../../nucleo/anotacoes.js';
import { cartoesDaAula, excluirCartao, restaurarCartao, importarTexto } from '../../nucleo/cartoes.js';
import { criarLeitor } from '../leitor.js';

const carregarScript = (src) => new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não consegui carregar o editor.')); document.head.appendChild(s); });
async function carregarQuill() {
  if (!globalThis.Quill) {
    if (!document.querySelector('link[data-quill]')) document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'vendor/quill.snow.css' })).dataset.quill = '1';
    await carregarScript('vendor/quill.js');
  }
  return globalThis.Quill;
}
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Desenha a tela e devolve uma função de limpeza (grava o que estiver pendente e solta o leitor). */
export function desenharAula(raiz, ctx, aulaId) {
  const sessao = ctx.sessao;
  const estado0 = sessao.estado();
  const aula = estado0.aulas.find((a) => a.id === aulaId && !a.excluido_em);
  const materia = aula && ativas(estado0.disciplinas).find((d) => d.id === aula.disciplina_id);
  if (!aula || !materia) { raiz.innerHTML = '<h1>Aula não encontrada</h1><p class="sub"><a class="voltar" href="#materias">← Voltar às matérias</a></p>'; return () => {}; }
  document.title = `${aula.titulo} · Ohara`;
  raiz.className = 'cheia';

  let modoCartoes = false, rascunho = { frente: '', verso: '', etiquetas: '', pagina: null, marcadorId: null }, ultimaSelecao = '', erroCartao = '', leitor = null, quill = null, arquivoAtual = null, temporizador = null, pendente = false, aba = 'slide', historicoAberto = false;
  const lista = () => arquivosDaAula(sessao.estado(), aulaId);

  raiz.innerHTML = `<div class="topo"><div class="tt"><a class="voltar" href="#materias/${materia.id}">← ${escaparHtml(materia.nome)}</a>` +
    `<b>${escaparHtml(aula.titulo)}</b><small>${aula.tipo === 'livro' ? 'Livro' : 'Aula'}${descreverHorario(aula) ? ' · ' + escaparHtml(descreverHorario(aula)) : ''}</small></div>` +
    `<div class="abas" role="tablist"><button type="button" data-aba="slide" class="on">Slide</button><button type="button" data-aba="notas">Anotações</button></div></div>` +
    `<div class="aula" data-aba="slide">` +
    `<section class="painel" id="p-slide"><div class="cab"><select id="sel-arq" aria-label="Arquivo"></select>` +
    `<label class="btn peq sec">Anexar<input type="file" id="anexar" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf" hidden></label>` +
    `<button type="button" class="btn peq sec" id="remover" hidden>Remover</button><span class="esp"></span><span id="pag">—</span><button type="button" id="menos" aria-label="Diminuir">−</button><span id="zoom">100%</span><button type="button" id="mais" aria-label="Aumentar">+</button></div>` +
    `<p class="erro" id="erro-slide" hidden></p><div id="leitor"><p class="vazio" id="sem-arq"></p></div></section>` +
    `<section class="painel" id="p-notas"><div class="cab"><button type="button" class="btn peq" id="marcar" title="Ctrl+M">Marcar ◆</button>` +
    `<span class="esp" id="salvo"></span><button type="button" class="btn peq sec" id="modo">Cartões</button><button type="button" class="btn peq sec" id="hist">Histórico</button></div>` +
    `<div id="hist-lista" hidden></div><div id="cartoes-modo" hidden></div><div id="editor"></div><div class="marc"><h2>Marcados na aula</h2><div id="marcados"></div></div></section></div>`;
  const $ = (s) => raiz.querySelector(s);

  // ----- arquivos e leitor -----
  function desenharSeletor() {
    const l = lista(), sel = $('#sel-arq');
    sel.innerHTML = l.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join('');
    sel.hidden = !l.length; $('#remover').hidden = !l.length;
    if (arquivoAtual) sel.value = String(arquivoAtual.id);
    $('#sem-arq').textContent = l.length ? '' : 'Nenhum arquivo ainda. Toque em Anexar para escolher um PDF ou uma imagem.';
  }
  function mostrarErro(m) { const e = $('#erro-slide'); e.textContent = m || ''; e.hidden = !m; }
  async function abrirArquivo(f) {
    arquivoAtual = f; mostrarErro('');
    const blob = await sessao.lerArquivo(f.id);
    if (!blob) { mostrarErro('O conteúdo deste arquivo não está neste aparelho (restaure um backup completo).'); return; }
    try { await leitor.abrir(ehPdf(f) ? 'pdf' : 'imagem', blob, Number(sessao.lerConfig(`pagina_${f.id}`)) || 1); } catch (e) { mostrarErro(e.message); }
  }
  leitor = criarLeitor($('#leitor'), {
    aoMudarPagina: (n, total) => { $('#pag').textContent = `Página ${n} de ${total}`; if (arquivoAtual && leitor.total > 1) sessao.gravarConfig(`pagina_${arquivoAtual.id}`, n); },
    aoMudarZoom: (z) => { $('#zoom').textContent = Math.round(z * 100) + '%'; },
  });
  $('#sel-arq').onchange = (e) => { const f = lista().find((x) => x.id === Number(e.target.value)); if (f) abrirArquivo(f); };
  $('#remover').onclick = async () => {
    const f = arquivoAtual; if (!f) return;
    sessao.aplicar((e) => excluirArquivo(e, f.id, new Date().toISOString()));
    arquivoAtual = null; leitor.fechar(); desenharSeletor(); mostrarErro('');
    const resto = lista(); if (resto.length) await abrirArquivo(resto[resto.length - 1]); else $('#pag').textContent = '—';
    ctx.aviso(`"${f.nome}" foi para a lixeira.`, { texto: 'Desfazer', fazer: async () => { sessao.aplicar((e) => restaurarArquivo(e, f.id)); desenharSeletor(); await abrirArquivo(f); desenharSeletor(); } });
  };
  $('#mais').onclick = () => leitor.mais(); $('#menos').onclick = () => leitor.menos();
  $('#anexar').onchange = async (e) => {
    const arq = e.target.files[0]; e.target.value = ''; if (!arq) return;
    try { const reg = await sessao.anexar(aulaId, arq); desenharSeletor(); await abrirArquivo(reg); ctx.aviso(`"${reg.nome}" anexado (${formatarBytes(reg.tamanho)}).`); }
    catch (err) { mostrarErro(err.message); }
  };

  // ----- editor, marcador e histórico -----
  function salvarAgora() {
    if (!pendente || !quill) return;
    clearTimeout(temporizador); temporizador = null; pendente = false;
    try { sessao.salvarAnotacao(aulaId, JSON.stringify(quill.getContents())); $('#salvo').textContent = `Salvo às ${hora()}`; }
    catch (e) { $('#salvo').textContent = 'Não salvou: ' + e.message; pendente = true; }
  }
  function marcar() {
    if (!quill) return;
    const sel = quill.getSelection(true) || { index: Math.max(0, quill.getLength() - 1) };
    const [linha, desloc] = quill.getLine(sel.index);
    const inicio = sel.index - desloc, texto = (linha.domNode.textContent || '').replace(/^◆\s*(p\.\d+\s*)?/, '').trim();
    if ((linha.domNode.textContent || '').startsWith('◆')) { ctx.aviso('Essa linha já está marcada.'); return; }
    const pag = arquivoAtual && leitor.total > 1 ? leitor.pagina : null;
    sessao.aplicar((e) => criarMarcador(e, aulaId, { arquivoId: arquivoAtual?.id ?? null, pagina: pag, trecho: texto }, new Date().toISOString()).estado);
    quill.insertText(inicio, `◆ ${pag ? `p.${pag} ` : ''}`, { bold: true }, 'user');
    desenharMarcados();
  }
  function desenharMarcados() {
    const ms = marcadoresDaAula(sessao.estado(), aulaId);
    $('#marcados').innerHTML = ms.length ? ms.map((m) => `<div class="it"><button type="button" class="ir" data-pag="${m.pagina ?? ''}" data-arq="${m.arquivo_id ?? ''}">${escaparHtml(descreverMarcador(m))}</button><button type="button" class="x" data-rem="${m.id}" aria-label="Remover marcador">×</button></div>`).join('')
      : '<p class="vazio">Nenhum marcador. Use o botão Marcar ou Ctrl+M no texto.</p>';
  }
  $('#marcados').onclick = async (e) => {
    const ir = e.target.closest('.ir'), x = e.target.closest('.x');
    if (x) { sessao.aplicar((s) => removerMarcador(s, Number(x.dataset.rem), new Date().toISOString())); desenharMarcados(); }
    else if (ir && ir.dataset.pag) {
      const f = lista().find((a) => a.id === Number(ir.dataset.arq));
      if (f && f.id !== arquivoAtual?.id) { await abrirArquivo(f); desenharSeletor(); }
      aba = 'slide'; $('.aula').dataset.aba = aba; raiz.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('on', b.dataset.aba === aba));
      leitor.irPara(Number(ir.dataset.pag));
    }
  };
  $('#marcar').onclick = marcar;
  raiz.querySelectorAll('.abas button').forEach((b) => { b.onclick = () => { aba = b.dataset.aba; $('.aula').dataset.aba = aba; raiz.querySelectorAll('.abas button').forEach((x) => x.classList.toggle('on', x === b)); }; });

  function desenharHistorico() {
    const h = $('#hist-lista'); h.hidden = !historicoAberto; if (!historicoAberto) return;
    const vs = sessao.listarVersoes(aulaId);
    h.innerHTML = vs.length ? `<p class="sub">Versões anteriores do texto. Restaurar guarda o texto de agora no histórico.</p>` + vs.map((v) => `<div class="lin"><div class="t">${escaparHtml(dataHora(v.criado_em))}<small>${escaparHtml(textoDoDelta(v.conteudo).slice(0, 90) || '(vazio)')}</small></div><button type="button" class="btn peq sec" data-v="${v.id}">Restaurar</button></div>`).join('')
      : '<p class="sub">Ainda não há versões anteriores. O histórico guarda um ponto de volta a cada 5 minutos de escrita.</p>';
  }
  $('#hist').onclick = () => { salvarAgora(); historicoAberto = !historicoAberto; desenharHistorico(); };
  $('#hist-lista').onclick = (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    try { salvarAgora(); quill.setContents(JSON.parse(sessao.restaurarVersao(aulaId, Number(b.dataset.v))), 'silent'); $('#salvo').textContent = 'Versão restaurada'; } catch (err) { ctx.aviso(err.message); }
    desenharHistorico();
  };

  // ----- modo de produção de cartões (depois da aula) -----
  function desenharCartoes() {
    const pn = $('#p-notas'); pn.classList.toggle('modo-cartoes', modoCartoes); $('#cartoes-modo').hidden = !modoCartoes; $('#modo').textContent = modoCartoes ? 'Anotações' : 'Cartões';
    if (!modoCartoes) return;
    const ms = marcadoresDaAula(sessao.estado(), aulaId), cs = cartoesDaAula(sessao.estado(), aulaId);
    $('#cartoes-modo').innerHTML = `<div class="marc" style="max-height:none;border:0"><h2>Marcados na aula</h2>${ms.length ? ms.map((m) => `<div class="it"><span class="ir" style="cursor:default">${escaparHtml(descreverMarcador(m))}</span><button type="button" class="btn peq sec" data-c="virar" data-id="${m.id}">Virar cartão</button></div>`).join('') : '<p class="vazio">Nada marcado. Marque linhas com Ctrl+M enquanto anota.</p>'}</div>` +
      `<form id="cartao" class="form" style="padding:14px"><label class="c">Frente<textarea class="in" name="frente" maxlength="2000">${escaparHtml(rascunho.frente)}</textarea></label><label class="c">Verso<textarea class="in" name="verso" maxlength="2000">${escaparHtml(rascunho.verso)}</textarea></label>` +
      `<div class="acoes"><button type="button" class="btn peq sec" data-c="sel-frente">Seleção do texto → frente</button><button type="button" class="btn peq sec" data-c="sel-verso">Seleção do texto → verso</button></div>` +
      `<label class="c">Etiquetas (opcional)<input class="in" name="etiquetas" value="${escaparHtml(rascunho.etiquetas)}" autocomplete="off"></label><label class="c">Imagem (opcional)<input class="in" type="file" name="imagem" accept="image/png,image/jpeg,image/webp,image/gif"></label>` +
      (erroCartao ? `<p class="erro">${escaparHtml(erroCartao)}</p>` : '') + `<div class="acoes"><button class="btn peq" type="submit">Criar cartão</button></div></form>` +
      `<details style="padding:0 14px 8px"><summary class="sub">Importar vários de uma vez (Frente :: Verso)</summary><form id="importar-aula" class="form"><textarea class="in" name="texto" placeholder="Pergunta :: Resposta"></textarea><div class="acoes"><button class="btn peq sec" type="submit">Importar</button></div></form></details>` +
      `<div style="padding:0 14px 14px"><h2>Cartões desta aula (${cs.length})</h2>${cs.map((c) => `<div class="cartao"><div class="t"><b>${escaparHtml(c.frente)}</b>${escaparHtml(c.verso)}${c.pagina ? `<small>slide ${c.pagina}</small>` : ''}</div><button type="button" class="btn peq sec" data-c="excluir" data-id="${c.id}">Excluir</button></div>`).join('') || '<p class="vazio" style="margin:0">Nenhum cartão ainda.</p>'}</div>`;
  }
  $('#modo').onclick = () => { salvarAgora(); modoCartoes = !modoCartoes; if (modoCartoes) { rascunho.pagina = arquivoAtual && leitor.total > 1 ? leitor.pagina : null; } desenharCartoes(); };
  $('#cartoes-modo').onclick = (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const lerCampos = () => { const f = new FormData($('#cartao')); rascunho = { ...rascunho, frente: f.get('frente'), verso: f.get('verso'), etiquetas: f.get('etiquetas') }; };
    if (b.dataset.c === 'virar') { const m = marcadoresDaAula(sessao.estado(), aulaId).find((x) => x.id === Number(b.dataset.id)); lerCampos(); rascunho = { ...rascunho, frente: m.trecho, pagina: m.pagina, marcadorId: m.id }; }
    else if (b.dataset.c === 'sel-frente' || b.dataset.c === 'sel-verso') { lerCampos(); if (!ultimaSelecao) { erroCartao = 'Selecione um trecho no editor de anotações primeiro.'; desenharCartoes(); return; } erroCartao = ''; rascunho[b.dataset.c === 'sel-frente' ? 'frente' : 'verso'] = ultimaSelecao; }
    else if (b.dataset.c === 'excluir') { const id = Number(b.dataset.id); sessao.aplicar((s) => excluirCartao(s, id, new Date().toISOString())); ctx.aviso('Cartão enviado para a lixeira.', { texto: 'Desfazer', fazer: () => { sessao.aplicar((s) => restaurarCartao(s, id)); desenharCartoes(); } }); }
    desenharCartoes();
  };
  $('#cartoes-modo').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try {
      if (e.target.id === 'cartao') {
        await sessao.criarCartao(aulaId, { frente: f.get('frente'), verso: f.get('verso'), etiquetas: f.get('etiquetas'), pagina: rascunho.pagina, marcadorId: rascunho.marcadorId }, f.get('imagem')?.size ? f.get('imagem') : null);
        rascunho = { frente: '', verso: '', etiquetas: f.get('etiquetas'), pagina: rascunho.pagina, marcadorId: null }; erroCartao = ''; ctx.aviso('Cartão criado.'); desenharMarcados();
      } else if (e.target.id === 'importar-aula') {
        let r; sessao.aplicar((s) => { r = importarTexto(s, aulaId, f.get('texto'), new Date().toISOString(), () => globalThis.crypto.randomUUID()); return r.estado; });
        ctx.aviso(`${r.criados.length} criados${r.ignorados.length ? `, ${r.ignorados.length} ignorados (linha ${r.ignorados.map((i) => i.linha).join(', ')})` : ''}.`);
      }
    } catch (err) { erroCartao = err.message; }
    desenharCartoes();
  };

  const aoSair = () => salvarAgora();
  addEventListener('pagehide', aoSair); document.addEventListener('visibilitychange', aoSair);
  const limpar = () => { removeEventListener('pagehide', aoSair); document.removeEventListener('visibilitychange', aoSair); salvarAgora(); leitor.fechar(); raiz.className = ''; };

  desenharSeletor(); desenharMarcados();
  const l = lista();
  if (l.length) abrirArquivo(l[l.length - 1]);

  carregarQuill().then((Quill) => {
    quill = new Quill($('#editor'), { theme: 'snow', placeholder: 'Escreva as anotações da aula…', modules: { toolbar: [['bold', 'italic'], [{ list: 'ordered' }, { list: 'bullet' }], [{ header: [1, 2, false] }]] } });
    try { const d = sessao.estado().aulas.find((a) => a.id === aulaId).anotacoes; if (d) quill.setContents(JSON.parse(d), 'silent'); } catch { /* texto antigo ilegível: começa vazio, o original continua no histórico */ }
    quill.on('selection-change', (r) => { if (r && r.length) ultimaSelecao = quill.getText(r.index, r.length).trim(); });
    quill.on('text-change', (_d, _v, origem) => {
      if (origem === 'silent') return;
      pendente = true; clearTimeout(temporizador); temporizador = setTimeout(salvarAgora, 600); $('#salvo').textContent = 'Escrevendo…';
    });
    // Ctrl+M (ou Alt+M, Ctrl+Shift+M se o teclado/Android capturar o primeiro) só vale dentro do editor.
    quill.root.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm' && !e.metaKey && (e.ctrlKey || e.altKey)) { e.preventDefault(); marcar(); }
    });
  }).catch((e) => { $('#salvo').textContent = e.message; });

  return limpar;
}
