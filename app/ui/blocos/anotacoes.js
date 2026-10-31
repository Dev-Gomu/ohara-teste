// Bloco Anotações da Área de trabalho: o texto da aula no Quill, salvo sozinho, com marcador de página, marcados e histórico.
// Segue o contrato dos blocos de ui/componentes/mosaico.js. O texto continua guardado como antes (sessao.salvarAnotacao).
import { escaparHtml } from '../../nucleo/texto.js';
import { textoDoDelta } from '../../nucleo/anotacoes.js';
import { criarMarcador, removerMarcador, marcadoresDaAula, descreverMarcador } from '../../nucleo/marcadores.js';
import { abrirMenu } from '../menu.js';
import { registrarPendencia } from '../pendencias.js';
import * as pref from '../preferencias.js';
import { reguaHtml, bolhaHtml, ICONE_MARCAR, marcarAtivos, aplicarFormato, perguntarLink } from './regua.js';
import { REALCE, GRUPOS, caberRegua } from '../../nucleo/formatacao.js';

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
const CHAVE_BARRA = 'ohara.barraEd';   // 'visivel' = régua fixa; qualquer outra coisa = modo fantasma (padrão)

/** `slides`: o bloco Slides (página e arquivo atuais para o Marcar). `abrirSlides()`: garante que o bloco Slides esteja aberto. */
export function criarBlocoAnotacoes({ sessao, ctx, aulaId, slides, abrirSlides = () => {} }) {
  const el = document.createElement('section'), cabecalho = document.createElement('header');
  el.className = 'at-bloco at-notas'; cabecalho.className = 'at-cab';
  cabecalho.innerHTML = `<b class="mo-tit" data-g="titulo">Anotações</b><span class="at-regua" data-k="regua" role="toolbar" aria-label="Formatação">${reguaHtml()}<button type="button" class="at-fi at-mais" data-k="mais" aria-expanded="false" aria-label="Mais formatações" title="Mais formatações" hidden>⋯</button><div class="at-mais-painel" data-k="mais-painel" hidden></div></span><span class="mo-esp"></span>` +
    `<button type="button" class="at-redondo" data-k="marcar" aria-label="Marcar a linha com a página do slide (Ctrl M)" title="Marcar a linha · Ctrl M">${ICONE_MARCAR}</button>` +
    `<button type="button" class="at-redondo at-aa" data-k="aa" aria-pressed="false" aria-label="Barra de formatação (Alt T)" title="Barra de formatação · Alt T">Aa</button>` +
    `<button type="button" class="mo-ib" data-k="menu" aria-label="Mais opções das anotações" aria-haspopup="menu" title="Opções das anotações">⋮</button>`;
  el.append(cabecalho);
  el.insertAdjacentHTML('beforeend', `<div class="at-corpo"><div class="at-editor" data-k="editor"></div>` +
    `<div class="at-bolha" data-k="bolha" role="toolbar" aria-label="Formatar o trecho selecionado" hidden>${bolhaHtml()}</div><div class="at-painel" data-k="marcados" hidden></div><div class="at-painel" data-k="historico" hidden></div><span class="at-salvo" data-k="salvo" aria-live="polite"></span></div>`);
  const $ = (k) => el.querySelector(`[data-k="${k}"]`);
  let quill = null, temporizador = null, pendente = false, iniciou = false, destruido = false, fixa = pref.ler(CHAVE_BARRA, '') === 'visivel';

  const aula = () => sessao.estado().aulas.find((a) => a.id === aulaId);
  function salvarAgora() {
    if (!pendente || !quill) return;
    clearTimeout(temporizador); temporizador = null; pendente = false;
    try { sessao.salvarAnotacao(aulaId, JSON.stringify(quill.getContents())); $('salvo').textContent = `Salvo às ${hora()}`; }
    catch (e) { $('salvo').textContent = 'Não salvou: ' + e.message; pendente = true; }
  }
  const tiraPendencia = registrarPendencia(salvarAgora);

  // ---- barra de formatação: fixa (régua no cabeçalho) ou fantasma
  function aplicarBarra(v) {
    fixa = v; el.classList.toggle('at-fantasma', !v); $('aa').setAttribute('aria-pressed', String(v));
    pref.gravar(CHAVE_BARRA, v ? 'visivel' : 'oculta'); aoMudarBarra();
  }
  function aoMudarBarra() { if (fixa) { esconderBolha(); agendarAjuste(); } else { fecharMais(); } }

  // ---- régua numa linha só: o que não cabe vai para o "⋯" (os mesmos botões mudam de lugar)
  let larguras = null, quadro = 0;
  const maisBtn = () => $('mais'), maisPainel = () => $('mais-painel');
  function fecharMais() { maisPainel().hidden = true; maisBtn().setAttribute('aria-expanded', 'false'); }
  function agendarAjuste() { cancelAnimationFrame(quadro); quadro = requestAnimationFrame(ajustarRegua); }
  function ajustarRegua() {
    if (!fixa || el.hidden || !cabecalho.clientWidth) return;
    const regua = $('regua'), titulo = cabecalho.querySelector('[data-g="titulo"]'), grupo = (id) => regua.querySelector(`.at-fg[data-g="${id}"]`) ?? maisPainel().querySelector(`.at-fg[data-g="${id}"]`);
    if (!larguras) {   // mede uma vez, com tudo à vista na régua
      if (maisPainel().querySelector('.at-fg')) return;
      titulo.hidden = false; larguras = { titulo: titulo.offsetWidth + 8 };
      for (const g of GRUPOS.filter((x) => x.itens)) larguras[g.id] = grupo(g.id).offsetWidth + 10;
    }
    const cs = getComputedStyle(cabecalho), gap = parseFloat(cs.columnGap) || 6;
    const outros = [...cabecalho.children].filter((c) => c !== titulo && c !== regua && !c.classList.contains('mo-esp') && !c.hidden);
    const fixo = outros.reduce((t, c) => t + c.offsetWidth + gap, 0) + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 24;
    const r = caberRegua(larguras, cabecalho.clientWidth - fixo, 40);
    titulo.hidden = r.noMais.includes('titulo');
    for (const g of GRUPOS.filter((x) => x.itens)) { const e = grupo(g.id); if (r.noMais.includes(g.id)) maisPainel().append(e); else regua.insertBefore(e, maisBtn()); }
    maisBtn().hidden = !r.noMais.some((id) => id !== 'titulo'); if (maisBtn().hidden) fecharMais();
  }
  const obsCab = new ResizeObserver(agendarAjuste); obsCab.observe(cabecalho);
  const aoTocarFora = (e) => { if (!maisPainel().hidden && !e.target.closest('[data-k="mais"],[data-k="mais-painel"]')) fecharMais(); };
  document.addEventListener('pointerdown', aoTocarFora);

  // ---- menu flutuante sobre o texto selecionado (modo fantasma)
  const bolha = () => $('bolha');
  function esconderBolha() { bolha().hidden = true; }
  function mostrarBolha(r) {
    const bo = bolha();
    if (fixa || !r || !r.length || !quill || el.hidden) { esconderBolha(); return; }
    bo.hidden = false;
    const b = quill.getBounds(r.index, r.length), ed = $('editor').getBoundingClientRect(), co = el.querySelector('.at-corpo').getBoundingClientRect();
    const w = bo.offsetWidth, esq = ed.left - co.left + b.left + b.width / 2 - w / 2, topo = ed.top - co.top + b.top - bo.offsetHeight - 10;
    const x = Math.max(8, Math.min(co.width - w - 8, esq));
    bo.style.left = `${x}px`; bo.style.top = `${Math.max(8, topo)}px`; bo.style.setProperty('--seta', `${Math.max(14, Math.min(w - 26, ed.left - co.left + b.left + b.width / 2 - x - 6))}px`);
  }
  bolha().addEventListener('mousedown', (e) => e.preventDefault());
  bolha().addEventListener('click', (e) => { const f = e.target.closest('[data-f]'); if (f && quill) aplicarFormato(quill, f.dataset.f); });
  const alternarBarra = () => { aplicarBarra(!fixa); if (fixa) quill?.focus(); };

  // ---- marcador de página
  function marcar() {
    if (!quill) return;
    const sel = quill.getSelection(true) || { index: Math.max(0, quill.getLength() - 1) };
    const [linha, desloc] = quill.getLine(sel.index);
    const inicio = sel.index - desloc, bruto = linha.domNode.textContent || '';
    if (bruto.startsWith('◆')) { ctx.aviso('Essa linha já está marcada.'); return; }
    const pag = slides.pagina();
    sessao.aplicar((e) => criarMarcador(e, aulaId, { arquivoId: slides.arquivoId(), pagina: pag, trecho: bruto.trim() }, new Date().toISOString()).estado);
    quill.insertText(inicio, `◆ ${pag ? `p.${pag} ` : ''}`, { bold: true }, 'user');
    desenharMarcados(); ctx.aviso(pag ? `◆ Marcado no slide ${pag}.` : '◆ Linha marcada.');
  }
  function desenharMarcados() {
    const ms = marcadoresDaAula(sessao.estado(), aulaId), p = $('marcados');
    p.innerHTML = `<div class="at-ph"><b>Marcados na aula</b><button type="button" class="mo-ib" data-k="fechar-painel" aria-label="Fechar"><svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg></button></div>` + (ms.length
      ? ms.map((m) => `<div class="at-it"><button type="button" class="ir" data-pag="${m.pagina ?? ''}" data-arq="${m.arquivo_id ?? ''}">${escaparHtml(descreverMarcador(m))}</button><button type="button" class="x" data-rem="${m.id}" aria-label="Remover marcador">×</button></div>`).join('')
      : '<p class="at-nada">Nenhum marcador. Use o botão de marcar ou Ctrl+M no texto.</p>');
  }
  $('marcados').addEventListener('click', async (e) => {
    const ir = e.target.closest('.ir'), x = e.target.closest('.x');
    if (e.target.closest('[data-k="fechar-painel"]')) { $('marcados').hidden = true; return; }
    if (x) { sessao.aplicar((s) => removerMarcador(s, Number(x.dataset.rem), new Date().toISOString())); desenharMarcados(); }
    else if (ir && ir.dataset.pag) { abrirSlides(); await slides.abrirArquivoPorId(Number(ir.dataset.arq)); slides.irPara(Number(ir.dataset.pag)); }
  });

  // ---- histórico de versões
  function desenharHistorico() {
    const h = $('historico'), vs = sessao.listarVersoes(aulaId);
    h.innerHTML = `<div class="at-ph"><b>Versões do texto</b><button type="button" class="mo-ib" data-k="fechar-painel" aria-label="Fechar"><svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg></button></div>` + (vs.length
      ? `<p class="at-nada">Restaurar guarda o texto de agora no histórico.</p>` + vs.map((v) => `<div class="at-it"><span class="t">${escaparHtml(dataHora(v.criado_em))}<small>${escaparHtml(textoDoDelta(v.conteudo).slice(0, 90) || '(vazio)')}</small></span><button type="button" class="btn peq sec" data-v="${v.id}">Restaurar</button></div>`).join('')
      : '<p class="at-nada">Ainda não há versões anteriores. O histórico guarda um ponto de volta a cada 5 minutos de escrita.</p>');
  }
  $('historico').addEventListener('click', (e) => {
    if (e.target.closest('[data-k="fechar-painel"]')) { $('historico').hidden = true; return; }
    const b = e.target.closest('[data-v]'); if (!b) return;
    try { salvarAgora(); quill.setContents(JSON.parse(sessao.restaurarVersao(aulaId, Number(b.dataset.v))), 'silent'); $('salvo').textContent = 'Versão restaurada'; } catch (err) { ctx.aviso(err.message); }
    desenharHistorico();
  });
  function alternarPainel(nome) {
    const outro = nome === 'marcados' ? 'historico' : 'marcados', p = $(nome); salvarAgora();
    $(outro).hidden = true; p.hidden = !p.hidden;
    if (!p.hidden) { if (nome === 'marcados') desenharMarcados(); else desenharHistorico(); }
  }
  const painelAberto = () => !$('marcados').hidden || !$('historico').hidden;
  function fecharPaineis() { $('marcados').hidden = true; $('historico').hidden = true; }

  // ---- botões do cabeçalho
  cabecalho.addEventListener('mousedown', (e) => { if (e.target.closest('.at-fi,[data-k="marcar"],[data-k="aa"]')) e.preventDefault(); });   // não tirar a seleção do texto
  cabecalho.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'), k = e.target.closest('[data-k]')?.dataset.k;
    if (f && quill) { aplicarFormato(quill, f.dataset.f); if (f.closest('[data-k="mais-painel"]')) fecharMais(); }
    else if (k === 'mais') { const p = maisPainel(); p.hidden = !p.hidden; maisBtn().setAttribute('aria-expanded', String(!p.hidden)); }
    else if (k === 'marcar') marcar(); else if (k === 'aa') alternarBarra();
    else if (k === 'menu') {
      const n = marcadoresDaAula(sessao.estado(), aulaId).length;
      abrirMenu($('menu'), [
        { rotulo: `Ver marcados (${n})`, fazer: () => alternarPainel('marcados') },
        { rotulo: 'Histórico de versões do texto', fazer: () => alternarPainel('historico') },
        { rotulo: fixa ? 'Ocultar a barra de formatação (Alt T)' : 'Mostrar a barra de formatação (Alt T)', fazer: alternarBarra },
      ]);
    }
  });

  // ---- o editor
  async function iniciar() {
    iniciou = true;
    try {
      const Quill = await carregarQuill(); if (destruido) return;
      quill = new Quill($('editor'), { theme: 'snow', placeholder: 'Escreva as anotações da aula…  (# título, - lista, > citação; Ctrl K link)',
        formats: ['header', 'bold', 'italic', 'underline', 'strike', 'background', 'code', 'blockquote', 'list', 'indent', 'link'], modules: { toolbar: false } });
    } catch (e) { $('salvo').textContent = e.message; return; }
    quill.root.setAttribute('spellcheck', 'true'); quill.root.setAttribute('lang', 'pt-BR');
    // "# ", "## ", "### " e "> " no começo da linha viram título e citação (as listas "- " e "1. " o Quill já faz).
    quill.keyboard.addBinding({ key: ' ', collapsed: true, prefix: /^(#{1,3})$/ }, function (range, c) { const n = c.prefix.length; quill.deleteText(range.index - n, n, 'user'); quill.formatLine(range.index - n, 1, 'header', n, 'user'); return false; });
    quill.keyboard.addBinding({ key: ' ', collapsed: true, prefix: /^>$/ }, function (range) { quill.deleteText(range.index - 1, 1, 'user'); quill.formatLine(range.index - 1, 1, 'blockquote', true, 'user'); return false; });
    quill.keyboard.addBinding({ key: 'K', shortKey: true }, () => { const u = perguntarLink(); if (u) quill.format('link', u, 'user'); return false; });
    try { const d = aula().anotacoes; if (d) quill.setContents(JSON.parse(d), 'silent'); } catch { /* texto antigo ilegível: começa vazio, o original continua no histórico */ }
    quill.on('editor-change', () => marcarAtivos(el, quill));
    quill.on('selection-change', (r) => mostrarBolha(r));
    quill.root.addEventListener('scroll', esconderBolha, { passive: true });
    quill.on('text-change', (_d, _v, origem) => {
      if (origem === 'silent') return;
      pendente = true; clearTimeout(temporizador); temporizador = setTimeout(salvarAgora, 600); $('salvo').textContent = 'Escrevendo…';
    });
    // Atalhos de formatação (Ctrl no Linux/Windows, Cmd no Mac). Alt sozinho é do sistema (ver nucleo/teclado.js).
    quill.root.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey, c = e.code;
      if (e.key.toLowerCase() === 'm' && !e.metaKey && (e.ctrlKey || e.altKey)) { e.preventDefault(); marcar(); return; }   // Ctrl+M ou Alt+M: marcar a linha
      if (ctrl && e.altKey && !e.shiftKey && /^Digit[123]$/.test(c)) { e.preventDefault(); const n = Number(c.slice(5)); quill.format('header', quill.getFormat().header === n ? false : n, 'user'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'Digit7') { e.preventDefault(); aplicarFormato(quill, 'ordered'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'Digit8') { e.preventDefault(); aplicarFormato(quill, 'bullet'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'Digit9') { e.preventDefault(); aplicarFormato(quill, 'check'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'KeyX') { e.preventDefault(); quill.format('strike', !quill.getFormat().strike, 'user'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'KeyH') { e.preventDefault(); aplicarFormato(quill, 'realce'); }
      else if (ctrl && !e.shiftKey && !e.altKey && c === 'KeyE') { e.preventDefault(); quill.format('code', !quill.getFormat().code, 'user'); }
      else if (ctrl && !e.shiftKey && !e.altKey && c === 'Backslash') { e.preventDefault(); const r = quill.getSelection(); if (r) quill.removeFormat(r.index, r.length, 'user'); }
    });
    if (el.contains(document.activeElement) && document.activeElement === el) quill.focus();
  }

  const aoSair = () => salvarAgora();
  addEventListener('pagehide', aoSair); document.addEventListener('visibilitychange', aoSair);
  aplicarBarra(fixa);

  return {
    nome: 'anotacoes', titulo: 'Anotações', el, cabecalho,
    mostrar() { if (!iniciou) iniciar(); agendarAjuste(); },
    esconder() { salvarAgora(); fecharPaineis(); esconderBolha(); fecharMais(); },
    focar() { quill?.focus(); },
    aoRedimensionar() {},
    salvar: salvarAgora,
    destruir() { destruido = true; cancelAnimationFrame(quadro); obsCab.disconnect(); salvarAgora(); tiraPendencia(); removeEventListener('pagehide', aoSair); document.removeEventListener('pointerdown', aoTocarFora); document.removeEventListener('visibilitychange', aoSair); },
    alternarBarra, painelAberto, fecharPaineis, marcar,
    /** Fecha o que está por cima do texto (menu flutuante, painéis, ⋯). Devolve se havia algo aberto. */
    fecharTransitorios() { const fez = !bolha().hidden || painelAberto() || !maisPainel().hidden; esconderBolha(); fecharPaineis(); fecharMais(); return fez; },
    abrirMenu: () => $('menu').click(),
    quill: () => quill,
    REALCE,
  };
}
