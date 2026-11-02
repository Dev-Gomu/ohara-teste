// Casca das zonas (ver nucleo/zonas.js): marca as regiões de cada tela e dá a elas o mesmo teclado da Mesa.
//   Tab / Shift Tab salta de zona (em ui/teclado.js) · Enter na zona entra no campo · Esc de dentro sobe para a zona e, da zona, para o menu de cima
//   Alt H J K L (ou setas) com o foco na zona vão à zona vizinha · Alt T / Alt F / Alt B: barra de cima, campo e barra de baixo da zona · Alt , e Alt . : controle anterior e próximo da barra
import { zonasDaTela } from '../nucleo/zonas.js';
import { vizinho } from '../nucleo/teclado.js';
import { registrar } from './atalhos.js';

export const ZONA = '[data-zona]';
const CONTROLES = 'button,a[href],select,input:not([type="hidden"]),textarea,summary,[contenteditable="true"],.ql-editor';
const util = (el) => !el.disabled && el.getClientRects().length > 0 && !el.closest('[hidden],[inert]');
const controles = (raiz) => (raiz ? [...raiz.querySelectorAll(CONTROLES)].filter(util) : []);

/** Marca as zonas da tela atual (de novo a cada mudança do conteúdo). */
function marcar(raiz) {
  const tela = document.documentElement.dataset.tela;
  for (const z of zonasDaTela(tela)) {
    raiz.querySelectorAll(z.sel).forEach((el) => {
      if (el.dataset.zona === z.nome) return;
      el.dataset.zona = z.nome; el.tabIndex = -1; el.setAttribute('role', 'group'); el.setAttribute('aria-label', z.rotulo === 'titulo' ? (el.querySelector('h2,summary')?.textContent.trim() || z.nome) : z.nome);
      el.dataset.zonaTopo = z.topo ?? ''; el.dataset.zonaBase = z.base ?? '';
    });
  }
}
const zonaDoFoco = () => document.activeElement?.closest?.(ZONA) ?? null;
const secoes = (z) => {
  const topo = z.dataset.zonaTopo ? z.querySelector(z.dataset.zonaTopo) : null, base = z.dataset.zonaBase ? z.querySelector(z.dataset.zonaBase) : null;
  return { topo, base };
};
/** Em que parte da zona o foco está: 'topo', 'base' ou 'campo'. */
function secaoDe(z) {
  const at = document.activeElement, { topo, base } = secoes(z);
  return topo?.contains(at) ? 'topo' : base?.contains(at) ? 'base' : 'campo';
}
function campoDe(z) {
  const { topo, base } = secoes(z);
  return controles(z).find((c) => !topo?.contains(c) && !base?.contains(c)) ?? controles(z)[0] ?? null;
}
export function irParaSecao(z, secao) {
  const { topo, base } = secoes(z);
  const alvo = secao === 'topo' ? controles(topo)[0] ?? controles(z)[0] : secao === 'base' ? controles(base).at(-1) ?? controles(z).at(-1) : campoDe(z);
  if (!alvo) return false; alvo.focus({ preventScroll: false }); return true;
}

export function iniciarZonas() {
  const app = document.getElementById('app'); if (!app) return;
  let espera = 0;
  const agendar = () => { clearTimeout(espera); espera = setTimeout(() => marcar(app), 30); };
  new MutationObserver(agendar).observe(app, { childList: true, subtree: true });
  addEventListener('hashchange', () => setTimeout(agendar, 0)); agendar();

  // Enter na zona entra no campo
  app.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
    if (e.key === 'Enter' && e.target?.dataset?.zona !== undefined) { if (irParaSecao(e.target, 'campo')) e.preventDefault(); }
    else if (e.key === 'Escape') {   // de dentro: sobe para a zona; da zona: vai ao menu de cima
      if (document.querySelector('#lancador:not([hidden]),#ajuda-atalhos:not([hidden]),.menu-pop,.novo-item-fundo')) return;
      const z = e.target?.closest?.(ZONA); if (!z) return;
      if (e.target !== z) { z.focus({ preventScroll: true }); e.preventDefault(); }
      else { const nav = document.querySelector('#nav a.on') ?? document.querySelector('#nav a'); if (nav) { nav.focus(); e.preventDefault(); } }
    }
  });
  // Alt H J K L / Alt + setas com o foco na zona: zona vizinha (sem Alt, só vale com o foco na própria zona)
  app.addEventListener('ohara-mover', (e) => {
    const z = e.target?.closest?.(ZONA); if (!z || (e.detail.simples && e.target !== z)) return;
    const lista = [...app.querySelectorAll(ZONA)].filter((x) => x.getClientRects().length && !x.closest('[hidden]')), i = lista.indexOf(z);
    const j = i < 0 ? -1 : vizinho(lista.map((x) => { const r = x.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }), i, e.detail.direcao);
    if (j >= 0) { lista[j].focus({ preventScroll: false }); e.preventDefault(); }
    else if (!e.detail.simples) e.preventDefault();
  });
  const comZona = (f) => () => { const z = zonaDoFoco(); if (!z) return false; return f(z) === false ? false : undefined; };
  const passo = (d) => (z) => { const { topo, base } = secoes(z), sec = secaoDe(z); if (sec === 'campo') return false; const l = controles(sec === 'topo' ? topo : base), i = l.indexOf(document.activeElement); if (i < 0) return false; l[Math.min(l.length - 1, Math.max(0, i + d))].focus(); };
  return registrar({
    'Alt+KeyT': comZona((z) => irParaSecao(z, 'topo') ? undefined : false), 'Alt+KeyF': comZona((z) => irParaSecao(z, 'campo') ? undefined : false), 'Alt+KeyB': comZona((z) => irParaSecao(z, 'base') ? undefined : false),
    'Alt+Comma': comZona(passo(-1)), 'Alt+Period': comZona(passo(1)),
  });
}
