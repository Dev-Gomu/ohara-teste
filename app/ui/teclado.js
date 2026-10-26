// Casca do teclado: liga as regras de nucleo/teclado.js ao navegador (foco, janelas "Ir para…" e "Atalhos"). Sem regra de negócio aqui.
import { interpretar, vizinho, AJUDA } from '../nucleo/teclado.js';
import { filtrar, itensDoLancador } from '../nucleo/lancador.js';
import { escaparHtml } from '../nucleo/texto.js';

const SELETOR = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"]),.ql-editor';
const digitando = (el) => !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

/** `app`: { estado(), barra: { alternar(), aberta(), abrir(), fixa() }, foco: { alternar(), ativo(), sair() } }. */
export function iniciarTeclado(app) {
  const html = document.documentElement;
  const lancador = document.createElement('div'), ajuda = document.createElement('div');
  lancador.id = 'lancador'; lancador.hidden = true; lancador.setAttribute('role', 'dialog'); lancador.setAttribute('aria-modal', 'true'); lancador.setAttribute('aria-label', 'Ir para');
  lancador.innerHTML = '<div class="caixa"><input type="text" id="lanc-q" placeholder="Ir para… (matéria, aula ou tela)" autocomplete="off" spellcheck="false" aria-label="Ir para"><ul id="lanc-l" role="listbox"></ul><p class="dica">↑ ↓ escolhem · Enter abre · Esc fecha</p></div>';
  ajuda.id = 'ajuda-atalhos'; ajuda.hidden = true; ajuda.setAttribute('role', 'dialog'); ajuda.setAttribute('aria-modal', 'true'); ajuda.setAttribute('aria-label', 'Atalhos do teclado');
  ajuda.innerHTML = '<div class="caixa larga"><h2>Atalhos do teclado</h2><div class="grupos">' + AJUDA.map((g) => `<section><h3>${escaparHtml(g.grupo)}</h3>${g.itens.map(([t, d]) => `<div class="at"><kbd>${escaparHtml(t)}</kbd><span>${escaparHtml(d)}</span></div>`).join('')}</section>`).join('') + '</div><p class="dica">Esc fecha</p></div>';
  document.body.append(lancador, ajuda);

  let itens = [], sel = 0, voltarPara = null;
  const aberto = () => !lancador.hidden || !ajuda.hidden;
  function fechar() {
    lancador.hidden = true; ajuda.hidden = true;
    if (voltarPara && document.contains(voltarPara)) voltarPara.focus(); voltarPara = null;
  }
  function desenharLista() {
    const l = lancador.querySelector('#lanc-l');
    l.innerHTML = itens.length ? itens.map((it, i) => `<li role="option" data-i="${i}" class="${i === sel ? 'on' : ''}" aria-selected="${i === sel}"><span class="t">${escaparHtml(it.titulo)}</span><span class="d">${escaparHtml(it.detalhe ?? '')}</span><span class="k">${escaparHtml(it.tipo)}</span></li>`).join('') : '<li class="nada">Nada encontrado.</li>';
    l.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  function abrirLancador() {
    voltarPara = document.activeElement; ajuda.hidden = true; lancador.hidden = false;
    const q = lancador.querySelector('#lanc-q'); q.value = ''; sel = 0;
    itens = filtrar(itensDoLancador(app.estado()), '', 9); desenharLista(); q.focus();
  }
  function abrirAjuda() { voltarPara = document.activeElement; lancador.hidden = true; ajuda.hidden = false; ajuda.querySelector('.caixa').focus?.(); }
  function ativar(i) {
    const it = itens[i]; if (!it) return;
    const volta = voltarPara; voltarPara = null; fechar(); voltarPara = null;
    if (it.hash) location.hash = it.hash; else if (it.acao === 'barra') app.barra.alternar(); else if (it.acao === 'foco') app.foco.alternar(); else if (it.acao === 'ajuda') abrirAjuda();
    if (!it.hash && volta && document.contains(volta)) volta.focus();
  }
  lancador.addEventListener('input', (e) => { if (e.target.id !== 'lanc-q') return; sel = 0; itens = filtrar(itensDoLancador(app.estado()), e.target.value, 9); desenharLista(); });
  lancador.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); sel = Math.min(itens.length - 1, sel + 1); desenharLista(); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); sel = Math.max(0, sel - 1); desenharLista(); }
    else if (e.key === 'Enter') { e.preventDefault(); ativar(sel); }
  });
  lancador.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) ativar(Number(li.dataset.i)); else if (!e.target.closest('.caixa')) fechar(); });
  ajuda.addEventListener('click', (e) => { if (!e.target.closest('.caixa')) fechar(); });

  const visivel = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.disabled && !el.closest('[hidden],[inert]');
  const dentroDaBarraFechada = (el) => el.closest('#nav') && html.dataset.barra === 'solta' && !html.dataset.barraAberta;
  function focaveis() {
    const escopo = !lancador.hidden ? lancador : !ajuda.hidden ? ajuda : document;
    return [...escopo.querySelectorAll(SELETOR)].filter((el) => visivel(el) && !dentroDaBarraFechada(el) && !(html.dataset.foco && el.closest('#nav')));
  }
  function irParaFoco(el) { el.focus(); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
  function mover(direcao) {
    const lista = focaveis(), atual = document.activeElement, i = lista.indexOf(atual);
    if (i < 0) {                                       // nada em foco: entra pelo conteúdo (ou pelo menu, se pediu esquerda)
      if (direcao === 'esq' && abrirBarraEIrPara()) return;
      ((lista.filter((el) => !el.closest('#nav')))[0] ?? lista[0])?.focus(); return;
    }
    const noMenu = !!atual.closest('#nav');
    if (noMenu && direcao === 'dir') {                 // do menu para a direita: o item do conteúdo na altura mais próxima
      const y = atual.getBoundingClientRect().y, alvo = lista.filter((el) => !el.closest('#nav')).sort((p, q) => Math.abs(p.getBoundingClientRect().y - y) - Math.abs(q.getBoundingClientRect().y - y))[0];
      if (alvo) { irParaFoco(alvo); if (html.dataset.barra === 'solta') html.removeAttribute('data-barra-aberta'); return; }
    }
    const j = vizinho(lista.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }), i, direcao);
    if (j >= 0) { irParaFoco(lista[j]); return; }
    if (direcao === 'esq' && !noMenu) abrirBarraEIrPara();
  }
  function abrirBarraEIrPara() {
    if (html.dataset.foco) return false;
    if (html.dataset.barra === 'solta') app.barra.abrir();
    const alvo = document.querySelector('#nav a.on') ?? document.querySelector('#nav a');
    if (alvo) { alvo.focus(); return true; } return false;
  }

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;   // quem tratou antes (slide, menu) já resolveu
    const r = interpretar(e, { digitando: digitando(document.activeElement) });
    if (!r) return;
    if (aberto() && r.acao !== 'sair' && r.acao !== 'lancador' && r.acao !== 'ajuda') return;
    switch (r.acao) {
      case 'tela': e.preventDefault(); fechar(); location.hash = '#' + r.tela; break;
      case 'barra': e.preventDefault(); app.barra.alternar(); break;
      case 'foco': e.preventDefault(); app.foco.alternar(); break;
      case 'lancador': e.preventDefault(); if (!lancador.hidden) fechar(); else abrirLancador(); break;
      case 'ajuda': e.preventDefault(); if (!ajuda.hidden) fechar(); else abrirAjuda(); break;
      case 'divisoria': e.preventDefault(); document.dispatchEvent(new CustomEvent('ohara-divisoria', { detail: r.delta })); break;
      case 'mover': {
        e.preventDefault();
        const ev = new CustomEvent('ohara-mover', { detail: { direcao: r.direcao }, cancelable: true, bubbles: true });
        if ((document.activeElement ?? document.body).dispatchEvent(ev)) mover(r.direcao);       // a tela (ex.: Aula) pode tratar e cancelar
        break;
      }
      case 'sair':
        if (aberto()) { e.preventDefault(); fechar(); }
        else if (html.dataset.foco) { e.preventDefault(); app.foco.sair(); }
        else if (html.dataset.barraAberta) { e.preventDefault(); html.removeAttribute('data-barra-aberta'); }
        break;
    }
  });
  return { abrirLancador, abrirAjuda, fechar, alternarFoco: () => app.foco.alternar() };
}
