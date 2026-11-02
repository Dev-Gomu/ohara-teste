// Motor visual do mosaico da Mesa: grade, cabeçalho como alça de arrastar, vãos que redimensionam, foco, ampliar.
// Não conhece Slides, Anotações nem Cartões: recebe blocos prontos (contrato abaixo). A regra está em nucleo/mosaico.js.
import * as M from '../../nucleo/mosaico.js';
import { ehToqueDuplo } from '../../nucleo/gestos.js';
import { escaparHtml } from '../../nucleo/texto.js';

const SEM_ALCA = 'button,select,input,textarea,a,[data-sem-alca],[contenteditable="true"],.ql-editor';
const ico = (p) => `<svg class="at-s" viewBox="0 0 18 18" aria-hidden="true">${p}</svg>`;
const ICO_AMPLIAR = ico('<path d="M10 8l5-5M11 3h4v4M8 10l-5 5M7 15H3v-4"/>'), ICO_RECOLHER = ico('<path d="M15 3l-5 5M10 4v4h4M3 15l5-5M8 14v-4H4"/>'), ICO_FECHAR = ico('<path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/>');
const NOMES = { slides: 'Slide', anotacoes: 'Anotações', cartoes: 'Cartão' }, SECOES = { topo: 'Barra de topo', campo: 'Campo', base: 'Barra de baixo' };
const LARGURA_EMPILHA = 820;
const REDUZ = matchMedia('(prefers-reduced-motion: reduce)');
const HYPR = 'cubic-bezier(.05,.9,.1,1.05)';   // curva "popin" do Hyprland: arranca rápido e passa um fio do ponto
const caixa = (el) => ({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });   // abaixo disso os blocos empilham em coluna e a tela rola

/**
 * `grade`: elemento vazio que vira a grade. `blocos`: { slides, anotacoes, cartoes }, cada um:
 *   { el, cabecalho, mostrar(), esconder(), focar(), aoRedimensionar(), salvar(), destruir() }
 *   (`el` é a <section> inteira; `cabecalho` a faixa de cima, onde o motor acrescenta ⤢ e ✕ e que serve de alça).
 * `aoMudar(arranjo)`: depois de cada mudança que deve ser guardada. `aoFocar(nome)`: o bloco em foco mudou.
 */
export function criarMosaico(grade, { blocos, arranjo, aoMudar = () => {}, aoFocar = () => {} }) {
  let a = M.normalizar(arranjo), ampliado = null, redim = false;
  const mostrados = new Set(), nomes = Object.keys(blocos);
  const empilhado = () => innerWidth < LARGURA_EMPILHA;

  grade.classList.add('mo-grade');
  const vazio = Object.assign(document.createElement('div'), { className: 'mo-vazio', innerHTML: 'Nenhum bloco aberto<small>Alt S · Alt A · Alt C</small>' });
  const vaoV = Object.assign(document.createElement('div'), { className: 'mo-vao mo-v', hidden: true }), vaoH = Object.assign(document.createElement('div'), { className: 'mo-vao mo-h', hidden: true });
  for (const nome of nomes) {
    const b = blocos[nome];
    b.el.classList.add('mo-bloco'); b.el.dataset.bloco = nome; b.el.tabIndex = -1; b.cabecalho.classList.add('mo-cab');
    b.cabecalho.insertAdjacentHTML('beforeend', '<button type="button" class="mo-ib" data-mo="ampliar" aria-label="Ampliar o bloco (Alt M)" title="Ampliar (Alt M)">'+ICO_AMPLIAR+'</button><button type="button" class="mo-ib" data-mo="fechar" aria-label="Fechar o bloco (Alt W)" title="Fechar (Alt W)">'+ICO_FECHAR+'</button>');
    grade.append(b.el); ligarArrasto(nome, b);
  }
  grade.append(vazio, vaoV, vaoH);

  const visiveis = () => M.visiveis(a);
  const focarEl = (nome) => { if (nome && blocos[nome]) blocos[nome].el.focus({ preventScroll: true }); };
  const todosRedim = () => { for (const n of mostrados) blocos[n].aoRedimensionar(); };

  function posicionar() {
    const v = visiveis(), ok = !empilhado() && !ampliado && v.length >= 2;
    vaoV.hidden = !ok; vaoH.hidden = !(ok && v.length === 3);
    if (!ok) return;
    const m = grade.getBoundingClientRect(), r = v.map((n) => blocos[n].el.getBoundingClientRect());
    Object.assign(vaoV.style, { left: `${(r[0].right + r[1].left) / 2 - m.left - 13}px`, top: '0px', width: '26px', height: `${m.height}px` });
    if (v.length === 3) Object.assign(vaoH.style, { left: `${r[1].left - m.left}px`, top: `${(r[1].bottom + r[2].top) / 2 - m.top - 13}px`, width: `${r[1].width}px`, height: '26px' });
  }

  // ---- abrir, fechar e trocar blocos (popin): quem entra surge de 87% do tamanho, quem sai volta a 87% e some, quem fica desliza para o novo lugar
  const fantasmas = new Map();
  function terminarFantasmas() { for (const fim of [...fantasmas.values()]) fim(); fantasmas.clear(); }
  function animarTroca(antes, entrou, saiu) {
    for (const nome of saiu) {
      const b0 = antes.get(nome), el = blocos[nome].el; if (!b0) continue;
      el.hidden = false; Object.assign(el.style, { position: 'absolute', left: `${b0.l}px`, top: `${b0.t}px`, width: `${b0.w}px`, height: `${b0.h}px`, gridArea: 'auto', zIndex: '3', pointerEvents: 'none', transformOrigin: '50% 50%' });
      const fim = () => { fantasmas.delete(nome); an.cancel(); el.hidden = true; for (const k of ['position', 'left', 'top', 'width', 'height', 'gridArea', 'zIndex', 'pointerEvents', 'transformOrigin']) el.style[k] = ''; };
      const an = el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.87)' }], { duration: 200, easing: 'cubic-bezier(.3,0,.8,.15)', fill: 'forwards' });
      fantasmas.set(nome, fim); an.finished.then(() => fantasmas.get(nome) === fim && fim(), () => {});
    }
    for (const nome of nomes) {
      const el = blocos[nome].el;
      if (entrou.includes(nome)) { el.style.transformOrigin = '50% 50%'; el.animate([{ opacity: 0, transform: 'scale(.87)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 250, easing: HYPR }).finished.then(() => { el.style.transformOrigin = ''; }, () => {}); }
      else if (mostrados.has(nome) && antes.has(nome)) {
        const a0 = antes.get(nome), a1 = caixa(el);
        if (a0.l !== a1.l || a0.t !== a1.t || a0.w !== a1.w || a0.h !== a1.h) { el.style.transformOrigin = '0 0'; el.animate([{ transform: `translate(${a0.l - a1.l}px,${a0.t - a1.t}px) scale(${a0.w / a1.w},${a0.h / a1.h})` }, { transform: 'none' }], { duration: 260, easing: HYPR }).finished.then(() => { el.style.transformOrigin = ''; }, () => {}); }
      }
    }
  }

  function render(anim = false) {
    terminarFantasmas();
    const antes = anim && !REDUZ.matches && !empilhado() ? new Map([...mostrados].filter((n) => !blocos[n].el.hidden).map((n) => [n, caixa(blocos[n].el)])) : null, entrou = [], saiu = [];
    if (ampliado && !visiveis().includes(ampliado)) ampliado = null;
    const emp = empilhado(), d = M.disposicao(a, ampliado);
    grade.classList.toggle('mo-empilha', emp); grade.classList.toggle('mo-redim', redim); grade.toggleAttribute('data-ampliado', !!ampliado);
    grade.style.gridTemplateColumns = emp ? '' : d.colunas; grade.style.gridTemplateRows = emp ? '' : d.linhas;
    for (const nome of nomes) {
      const b = blocos[nome], lug = d.lugar[nome];
      const mostra = emp ? (ampliado ? nome === ampliado : a.abertos.includes(nome)) : !!lug;
      b.el.hidden = !mostra; b.el.style.order = String(a.ordem.indexOf(nome));
      b.el.style.gridColumn = lug && !emp ? lug.coluna : ''; b.el.style.gridRow = lug && !emp ? lug.linha : '';
      b.el.classList.toggle('mo-foco', mostra && nome === a.foco); b.el.toggleAttribute('data-ampliado', ampliado === nome);
      const bAmp = b.cabecalho.querySelector('[data-mo="ampliar"]'), rec = ampliado === nome;
      if (bAmp) { bAmp.innerHTML = rec ? ICO_RECOLHER : ICO_AMPLIAR; bAmp.title = rec ? 'Recolher (Alt M)' : 'Ampliar (Alt M)'; bAmp.setAttribute('aria-label', rec ? 'Recolher o bloco (Alt M)' : 'Ampliar o bloco (Alt M)'); }
      if (mostra && !mostrados.has(nome)) { mostrados.add(nome); entrou.push(nome); b.mostrar(); }
      else if (!mostra && mostrados.has(nome)) { mostrados.delete(nome); saiu.push(nome); b.esconder(); }
    }
    vazio.hidden = !(a.abertos.length === 0);
    posicionar();
    if (antes && !empilhado()) animarTroca(antes, entrou, saiu);
  }
  const mudar = (novo, { guardar = true, anim = false } = {}) => { a = novo; render(anim); if (guardar) aoMudar(a); todosRedim(); };

  function marcarFoco(nome) {
    if (a.foco === nome) return;
    a = { ...a, foco: nome };
    for (const n of nomes) blocos[n].el.classList.toggle('mo-foco', n === nome && mostrados.has(n));
    aoFocar(nome);
  }
  // ---- marca a seção em que o foco está no bloco (data-sec); sem rodapé (a trilha foi removida a pedido do usuário)
  function atualizarTrilha() {
    const at = document.activeElement, bl = at?.closest?.('.mo-bloco');
    for (const n of nomes) delete blocos[n].el.dataset.sec;
    if (!bl || !grade.contains(at) || bl.hidden) return;
    const nome = bl.dataset.bloco, b = blocos[nome], sec = at === bl ? null : secaoDoFoco(b);
    if (sec) bl.dataset.sec = sec;
  }
  grade.addEventListener('focusin', atualizarTrilha); grade.addEventListener('focusout', () => setTimeout(atualizarTrilha, 0));
  grade.addEventListener('focusin', (e) => { const el = e.target.closest('.mo-bloco'); if (el && mostrados.has(el.dataset.bloco)) marcarFoco(el.dataset.bloco); });
  grade.addEventListener('pointerdown', (e) => { const el = e.target.closest('.mo-bloco'); if (el && mostrados.has(el.dataset.bloco)) marcarFoco(el.dataset.bloco); }, true);
  grade.addEventListener('click', (e) => {
    const bt = e.target.closest('[data-mo]'), el = bt?.closest('.mo-bloco'); if (!bt || !el) return;
    if (bt.dataset.mo === 'ampliar') { marcarFoco(el.dataset.bloco); api.ampliar(); } else if (bt.dataset.mo === 'fechar') api.fechar(el.dataset.bloco);
  });
  // seções do bloco: topo (cabeçalho), campo (miolo) e base (rodapé, só os Cartões)
  const controles = (raiz) => raiz ? [...raiz.querySelectorAll('button,a[href],select,input:not([type="hidden"]),summary')].filter((x) => !x.disabled && x.getClientRects().length && !x.closest('[hidden]')) : [];
  const raizDa = (b, secao) => secao === 'topo' ? b.cabecalho : b.el.querySelector('.at-rodape');
  const secaoDoFoco = (b) => { const at = document.activeElement; return at && b.cabecalho.contains(at) ? 'topo' : at?.closest?.('.at-rodape') ? 'base' : 'campo'; };
  function entrar(nome) { blocos[nome].focar(); }
  grade.addEventListener('keydown', (e) => {   // Esc de dentro do bloco volta o foco ao bloco (nível dos mosaicos); Esc no bloco segue para quem sai do foco
    const el = e.target.closest?.('.mo-bloco');
    if (e.key === 'Escape' && el && el !== e.target && !e.defaultPrevented && !redim) { e.preventDefault(); el.focus({ preventScroll: true }); }
  });
  grade.addEventListener('keydown', (e) => {   // Enter com o foco no próprio bloco entra no campo
    if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.shiftKey && e.target.classList?.contains('mo-bloco')) { e.preventDefault(); entrar(e.target.dataset.bloco); }
  });

  // ---- arrastar o cabeçalho sobre outro bloco para trocar os dois de lugar
  function ligarArrasto(nome, b) {
    const alca = b.cabecalho; let ini = null, ativo = false, alvo = null;
    alca.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest(SEM_ALCA) || ampliado || empilhado() || visiveis().length < 2) return;
      ini = { x: e.clientX, y: e.clientY }; ativo = false; alca.setPointerCapture(e.pointerId);
    });
    alca.addEventListener('pointermove', (e) => {
      if (!ini) return;
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if (!ativo && Math.hypot(dx, dy) > 6) { ativo = true; b.el.classList.add('mo-arrasta'); }
      if (!ativo) return;
      b.el.style.transform = `translate(${dx}px,${dy}px)`;
      const t = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest?.('.mo-bloco')).find((x) => x && x !== b.el);
      if (alvo && alvo !== t) alvo.classList.remove('mo-alvo');
      alvo = t ?? null; alvo?.classList.add('mo-alvo');
    });
    const fim = () => {
      if (!ini) return;
      const eraArrasto = ativo; ini = null; ativo = false; b.el.classList.remove('mo-arrasta'); b.el.style.transform = '';
      const destino = alvo?.dataset.bloco; alvo?.classList.remove('mo-alvo'); alvo = null;
      if (eraArrasto && destino) mudar(M.trocar(a, nome, destino), { anim: true });
    };
    alca.addEventListener('pointerup', fim); alca.addEventListener('pointercancel', fim);
  }

  // ---- vãos: arrastar muda o tamanho; dois toques voltam ao padrão
  function ligarVao(el, eixo) {
    let anterior = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const agora = { t: performance.now(), x: e.clientX, y: e.clientY };
      if (ehToqueDuplo(anterior, agora)) { anterior = null; mudar(M.tamanhosPadrao(a)); return; }
      anterior = agora; el.setPointerCapture(e.pointerId); el.classList.add('mo-on');
    });
    el.addEventListener('pointermove', (e) => {
      if (!el.classList.contains('mo-on')) return;
      const m = grade.getBoundingClientRect();
      a = eixo === 'v' ? M.definirTamanho(a, 'largura', (e.clientX - m.left) / m.width * 100) : M.definirTamanho(a, 'altura', (e.clientY - m.top) / m.height * 100);
      render();
    });
    const fim = () => { if (!el.classList.contains('mo-on')) return; el.classList.remove('mo-on'); aoMudar(a); todosRedim(); };
    el.addEventListener('pointerup', fim); el.addEventListener('pointercancel', fim);
  }
  ligarVao(vaoV, 'v'); ligarVao(vaoH, 'h');

  const aoRedimJanela = () => { if (empilhado() !== grade.classList.contains('mo-empilha')) render(); else posicionar(); };
  addEventListener('resize', aoRedimJanela);
  const obs = new ResizeObserver(() => posicionar()); obs.observe(grade);

  const api = {
    arranjo: () => a,
    ampliado: () => ampliado,
    comFoco: () => a.foco,
    aberto: (n) => a.abertos.includes(n),
    emRedim: () => redim,
    modoRedim(ligar) { redim = !!ligar; grade.classList.toggle('mo-redim', redim); },
    focar(nome) { if (mostrados.has(nome)) focarEl(nome); },
    abrir(nome) { if (!a.abertos.includes(nome)) api.alternar(nome); else { ampliado = null; render(); focarEl(nome); } },
    alternar(nome) {
      ampliado = null; mudar(M.alternar(a, nome), { anim: true });
      focarEl(a.foco);
      return a.abertos.includes(nome);
    },
    fechar(nome) { if (a.abertos.includes(nome)) api.alternar(nome); },
    ampliar(nome = a.foco) {
      if (!nome || !visiveis().includes(nome)) return;
      ampliado = ampliado ? null : nome; render(); focarEl(nome); todosRedim();
    },
    /** Foco para o bloco vizinho. Devolve se mexeu. */
    mover(direcao) {
      if (ampliado) { const n = M.proximoAmpliado(a, ampliado, direcao); ampliado = n; a = { ...a, foco: n }; render(); focarEl(n); todosRedim(); return true; }
      const v = M.vizinho(a, a.foco, direcao); if (!v) return false;
      focarEl(v); return true;
    },
    /** Alt X: troca o bloco em foco pelo que está escondido (só com 2 abertos). Devolve se mexeu. */
    substituir() {
      const n = M.substituir(a); if (n === a) return false;
      ampliado = null; mudar(n, { anim: true }); focarEl(a.foco); return true;
    },
    /** Alt T · Alt F · Alt B: vai para a barra de topo, o campo ou a barra de baixo do bloco em foco. Devolve se foi. */
    irPara(secao) {
      const n = a.foco, b = n && mostrados.has(n) ? blocos[n] : null; if (!b) return false;
      if (secao === 'campo') { b.focar(); return true; }
      const c = controles(raizDa(b, secao))[0]; if (!c) return false;
      c.focus({ preventScroll: true }); return true;
    },
    /** Alt , · Alt . : elemento anterior ou próximo dentro da seção (só nas barras). */
    passo(d) {
      const n = a.foco, b = n && mostrados.has(n) ? blocos[n] : null; if (!b) return false;
      const sec = secaoDoFoco(b); if (sec === 'campo') return false;
      const l = controles(raizDa(b, sec)), i = l.indexOf(document.activeElement); if (i < 0) return false;
      const alvo = l[Math.min(l.length - 1, Math.max(0, i + d))]; alvo.focus({ preventScroll: true }); return true;
    },
    trocarCom(direcao) {
      const v = ampliado ? null : M.vizinho(a, a.foco, direcao); if (!v) return false;
      mudar(M.trocar(a, a.foco, v), { anim: true }); return true;
    },
    redimensionar(eixo, delta) { mudar(M.redimensionar(a, eixo, delta)); },
    padraoTamanhos() { ampliado = null; mudar(M.tamanhosPadrao(a)); },
    padraoOrdem() { ampliado = null; mudar(M.ordemPadrao(a)); },
    destruir() { removeEventListener('resize', aoRedimJanela); obs.disconnect(); },
  };
  render();
  return api;
}
