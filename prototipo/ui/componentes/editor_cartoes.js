// Editor de cartões: um campo editável onde cada linha já aparece como vai ficar no cartão (as marcas @ # - + -- ? somem
// ao digitar e viram o formato). Só mexe no próprio DOM; as regras de texto estão em nucleo/flashcards_editor.js.
// Digitar a marca e um espaço no começo da linha muda o tipo dela; **negrito** e ==destaque== formatam ao fechar.
import { linhasDeFonte, serializar, detectarMarca, TIPOS_LISTA } from '../../nucleo/flashcards_editor.js';

const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const inl = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
const ZW = /​/g;
const linhaHtml = (t, x) => `<div class="l" data-t="${t}">${inl(x) || '<br>'}</div>`;

/** Texto de uma linha com **negrito** e ==destaque== (lê o que está no DOM). */
function textoLinha(no) {
  let s = '';
  no.childNodes.forEach((c) => {
    if (c.nodeType === 3) s += c.data.replace(ZW, '');
    else if (c.nodeName !== 'BR') { const i = textoLinha(c); s += /^(STRONG|B)$/.test(c.nodeName) ? `**${i}**` : c.nodeName === 'MARK' ? `==${i}==` : i; }
  });
  return s;
}

/**
 * `ed`: o <div contenteditable> (a tela cria). `op`: { aoMudar(fonteGuardada), aoCartao(indice), aoTab(), aoSalvar() }.
 * Devolve a API: definir, fonte, digitado, foco, novoCartao, tipo, negrito, destaque, irParaCartao, cartaoAtual, desfazer, refazer, destruir.
 */
export function criarEditorCartoes(ed, { aoMudar = () => {}, aoCartao = () => {}, aoTab = () => {}, aoSalvar = () => {} } = {}) {
  const passado = [], futuro = []; let ultimo = '', atrasoSnap = 0, cartaoVisto = 0;
  const linhas = () => [...ed.children].map((d) => ({ t: d.dataset.t || 'texto', x: textoLinha(d) }));
  const fonte = () => serializar(linhas(), true), digitado = () => serializar(linhas(), false);
  const vazia = (d) => !textoLinha(d).trim();
  const atual = () => { let n = getSelection().anchorNode; while (n && n.parentNode !== ed) n = n.parentNode; return n && n.nodeType === 1 ? n : null; };

  function renumera() { let n = 0; for (const d of ed.children) { if (d.dataset.t === 'num') d.dataset.n = ++n; else n = 0; } }
  function normaliza() {
    const s = getSelection(), ancora = s.rangeCount && s.isCollapsed ? { n: s.anchorNode, o: s.anchorOffset } : null;
    for (const c of [...ed.childNodes]) if (c.nodeType === 3 || c.nodeName !== 'DIV') {
      const d = document.createElement('div'); c.replaceWith(d); d.append(c);
      if (ancora && ancora.n === c) { const r = document.createRange(); r.setStart(c, ancora.o); r.collapse(true); s.removeAllRanges(); s.addRange(r); }   // mover o nó solta o cursor: devolve onde estava
    }
    for (const d of ed.children) { d.classList.add('l'); if (!d.dataset.t) d.dataset.t = 'texto'; if (!d.firstChild || (!d.textContent && d.childNodes.length > 1 && !d.querySelector(':not(br)'))) d.innerHTML = '<br>'; }   // linha vazia = um só <br>
    if (!ed.children.length) ed.innerHTML = linhaHtml('texto', '');
  }
  function caretEm(el, inicio) {
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(!!inicio);
    if (!inicio && el.lastChild?.nodeName === 'BR') { r.setEndBefore(el.lastChild); r.collapse(false); }
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  const indiceDoCartao = () => { const d = atual(); if (!d) return cartaoVisto; let n = -1; for (const x of ed.children) { if (x.dataset.t === 'frente') n++; if (x === d) break; } return Math.max(0, n); };
  const total = () => [...ed.children].filter((d) => d.dataset.t === 'frente').length;

  // ---- histórico próprio (o do navegador não enxerga as conversões automáticas)
  const posCaret = () => { const d = atual(); if (!d) return null; const r = getSelection().getRangeAt(0), pre = document.createRange(); pre.selectNodeContents(d); pre.setEnd(r.startContainer, r.startOffset); return { li: [...ed.children].indexOf(d), off: pre.toString().length }; };
  function poeCaret(p) {
    const d = p && ed.children[Math.min(p.li, ed.children.length - 1)]; if (!d) return;
    const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let resto = p.off, n;
    while ((n = w.nextNode())) { if (resto <= n.data.length) { const r = document.createRange(); r.setStart(n, resto); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } resto -= n.data.length; }
    caretEm(d);
  }
  function snap(forcar) { const src = fonte(); if (!forcar && src === ultimo) return; passado.push({ src, c: posCaret() }); if (passado.length > 200) passado.shift(); futuro.length = 0; ultimo = src; }
  function definir(src, { semHistorico = false } = {}) {
    ed.innerHTML = linhasDeFonte(src).map(({ t, x }) => linhaHtml(t, x)).join('');
    normaliza(); renumera(); cartaoVisto = 0; if (!semHistorico) snap(true); else ultimo = fonte();
    aoMudar(fonte()); aoCartao(0);
  }
  function mudou() { renumera(); aoMudar(fonte()); clearTimeout(atrasoSnap); atrasoSnap = setTimeout(() => snap(), 350); const n = indiceDoCartao(); if (n !== cartaoVisto) { cartaoVisto = n; aoCartao(n); } }
  function voltar(dir) {
    clearTimeout(atrasoSnap); const agora = fonte();
    if (dir < 0) { if (agora !== ultimo) snap(); if (passado.length < 2) return; const e = passado.pop(); futuro.push({ src: agora, c: posCaret() }); const alvo = passado.at(-1); definir(alvo.src, { semHistorico: true }); ultimo = alvo.src; poeCaret(alvo.c); }
    else { const e = futuro.pop(); if (!e) return; passado.push({ src: agora, c: posCaret() }); definir(e.src, { semHistorico: true }); ultimo = e.src; poeCaret(e.c); }
  }

  // ---- conversões ao digitar
  function gatilho(d) {
    const txt = d.textContent.replace(ZW, '');
    if (d.dataset.t !== 'texto' && !/^[@#?]/.test(txt)) return false;   // linha que já tem tipo (ex.: cartão apagado) também aceita @ # ? no começo
    const m = detectarMarca(txt); if (!m) return false;
    d.dataset.t = m.tipo; d.innerHTML = inl(m.resto) || '<br>'; caretEm(d); return true;
  }
  function inlineAuto() {                          // **negrito** e ==destaque== viram formato assim que o par fecha, mesmo no meio da linha
    const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return; let n = s.anchorNode; if (n.nodeType !== 3) return;
    for (let volta = 0; volta < 8; volta++) {
      const off = s.anchorOffset; let achou = null;
      for (const [re, tag] of [[/\*\*([^*\s][^*]*?)\*\*/, 'strong'], [/==([^=\s][^=]*?)==/, 'mark']]) {
        const m = re.exec(n.data); if (m && (off >= m.index + m[0].length || off <= m.index)) { achou = { m, tag }; break; }
      }
      if (!achou) return;
      const { m, tag } = achou, fim = m.index + m[0].length, el = document.createElement(tag); el.textContent = m[1];
      const ant = document.createTextNode(n.data.slice(0, m.index)), dep = document.createTextNode('\u200B' + n.data.slice(fim));
      n.replaceWith(ant, el, dep);
      const r = document.createRange(); if (off >= fim) { r.setStart(dep, 1 + off - fim); n = dep; } else { r.setStart(ant, off); n = ant; }
      r.collapse(true); s.removeAllRanges(); s.addRange(r);
    }
  }
  function negrito() { ed.focus(); document.execCommand('bold'); mudou(); }
  function destacar() { const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return; try { s.getRangeAt(0).surroundContents(document.createElement('mark')); } catch { return; } mudou(); }
  function tipo(t) { ed.focus(); const d = atual() || ed.lastElementChild; if (!d) return; d.dataset.t = d.dataset.t === t ? 'texto' : t; caretEm(d); mudou(); }
  /** Abre um cartão novo logo depois do cartão atual (ou no fim) e põe o cursor na frente dele. */
  function novoCartao() {
    ed.focus(); let d = atual() || ed.lastElementChild;
    while (d.nextElementSibling && d.nextElementSibling.dataset.t !== 'frente') d = d.nextElementSibling;
    const n = document.createElement('div'); n.className = 'l'; n.dataset.t = 'frente'; n.innerHTML = '<br>';
    d.after(n); caretEm(n, true); n.scrollIntoView({ block: 'center' }); mudou();
  }
  function irParaCartao(i) { const f = [...ed.children].filter((x) => x.dataset.t === 'frente')[i]; if (!f) return; ed.focus(); caretEm(f); f.scrollIntoView({ block: 'center' }); cartaoVisto = i; aoCartao(i); }

  // ---- eventos
  const aoInput = (e) => { normaliza(); /* apagou tudo: volta ao editor em branco */ if (/^delete/.test(e?.inputType) && ed.children.length === 1 && vazia(ed.firstChild)) ed.firstChild.dataset.t = 'texto'; const d = atual(); if (d && !gatilho(d)) inlineAuto(); mudou(); };
  function aoTeclar(e) {
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === 'Tab' && !ctrl && !e.altKey && !e.shiftKey) { e.preventDefault(); aoTab(); return; }
    if (ctrl && !e.altKey) {
      if (k === 'z') { e.preventDefault(); voltar(e.shiftKey ? 1 : -1); } else if (k === 'y') { e.preventDefault(); voltar(1); }
      else if (e.key === 'Enter') { e.preventDefault(); aoSalvar(); }
      else if (k === 'b') { e.preventDefault(); negrito(); } else if (k === 'e') { e.preventDefault(); destacar(); }
      return;
    }
    if (e.altKey) return;
    const d = atual(); if (!d) return;
    if (e.key === 'Enter') {
      e.preventDefault(); const t = d.dataset.t, ant = d.previousElementSibling;
      const fimDoCartao = !d.nextElementSibling || d.nextElementSibling.dataset.t === 'frente';
      if ((t === 'texto' || TIPOS_LISTA.includes(t)) && vazia(d) && fimDoCartao && ant && !['frente', 'secao'].includes(ant.dataset.t)) { d.dataset.t = 'frente'; caretEm(d, true); mudou(); return; }   // Enter duas vezes no fim: cartão novo
      if (TIPOS_LISTA.includes(t) && vazia(d)) { d.dataset.t = 'texto'; mudou(); return; }
      const r = getSelection().getRangeAt(0); r.deleteContents();
      const cauda = document.createRange(); cauda.setStart(r.endContainer, r.endOffset); cauda.setEnd(d, d.childNodes.length);
      const novo = document.createElement('div'); novo.className = 'l'; novo.dataset.t = TIPOS_LISTA.includes(t) ? t : 'texto'; novo.append(cauda.extractContents());
      if (!novo.firstChild) novo.innerHTML = '<br>'; if (!d.firstChild) d.innerHTML = '<br>';
      d.after(novo); renumera(); caretEm(novo, true); mudou();
    } else if (e.key === 'Backspace') {
      const r = getSelection().getRangeAt(0); if (!r.collapsed) return;
      const pre = document.createRange(); pre.selectNodeContents(d); pre.setEnd(r.startContainer, r.startOffset);
      if (pre.toString().replace(ZW, '') !== '') return;
      if (d.dataset.t !== 'texto') { e.preventDefault(); d.dataset.t = 'texto'; mudou(); }
    }
  }
  function aoColar(e) {
    e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); if (!t) return;
    if (!/\n/.test(t) && !detectarMarca(t)) { document.execCommand('insertText', false, t); return; }
    const d = atual(), x = document.createElement('div'); x.innerHTML = linhasDeFonte(t).map(({ t: tt, x: xx }) => linhaHtml(tt, xx)).join(''); const novos = [...x.children];
    if (d && vazia(d)) d.replaceWith(...novos); else if (d) d.after(...novos); else ed.append(...novos);
    normaliza(); caretEm(novos.at(-1)); mudou();
  }
  const aoSelecao = () => {
    for (const x of ed.querySelectorAll('.atual')) x.classList.remove('atual');
    if (document.activeElement !== ed) return; atual()?.classList.add('atual');
    const n = indiceDoCartao(); if (n !== cartaoVisto) { cartaoVisto = n; aoCartao(n); }
  };
  ed.addEventListener('input', aoInput); ed.addEventListener('keydown', aoTeclar); ed.addEventListener('paste', aoColar);
  ed.addEventListener('beforeinput', (e) => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') e.preventDefault(); });
  document.addEventListener('selectionchange', aoSelecao);

  return {
    definir, fonte, digitado, novoCartao, tipo, negrito, destaque: destacar, irParaCartao, total,
    foco: () => { ed.focus(); }, cartaoAtual: () => cartaoVisto, desfazer: () => voltar(-1), refazer: () => voltar(1), tirarFoto: () => snap(true),
    destruir: () => { clearTimeout(atrasoSnap); document.removeEventListener('selectionchange', aoSelecao); },
  };
}
