// Casca do teclado: liga as regras de nucleo/teclado.js ao navegador (foco, janelas "Ir para…" e "Atalhos"). Sem regra de negócio aqui.
import { interpretar, vizinho, proximaZona, AJUDA } from '../nucleo/teclado.js';
import { filtrar, itensDoLancador } from '../nucleo/lancador.js';
import { escaparHtml } from '../nucleo/texto.js';

const SELETOR = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"]),.ql-editor,[contenteditable="true"],.mo-bloco';
const digitando = (el) => !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

/** `app`: { estado(), barra: { alternar(), aberta(), abrir(), fixa() } }. */
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
    if (it.hash) location.hash = it.hash; else if (it.acao === 'ajuda') abrirAjuda();
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
    const meu = document.activeElement?.closest?.('.mo-bloco');
    return [...escopo.querySelectorAll(SELETOR)].filter((el) => visivel(el) && !dentroDaBarraFechada(el) && (el.classList.contains('mo-bloco') ? !meu || el !== meu : (!el.closest('.mo-bloco') || el.closest('.mo-bloco') === meu)));
  }
  function irParaFoco(el) { el.focus({ preventScroll: true }); if (!el.closest('.mo-bloco')) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }   // a Mesa não rola: foco sem deslocar o PDF
  function mover(direcao, { exigeFoco = false, simples = false } = {}) {   // devolve se o foco andou
    const atual = document.activeElement, bloco = simples ? atual?.closest?.('.mo-bloco') : null;   // sem Alt dentro de um bloco: não sai dele
    const lista = focaveis().filter((el) => !bloco || bloco.contains(el)), i = lista.indexOf(atual);
    if (i < 0 && exigeFoco) return false;
    if (i < 0) {                                       // nada em foco: entra pelo conteúdo (ou pelo menu, se pediu esquerda)
      if (direcao === 'esq' && abrirBarraEIrPara()) return true;
      const p = (lista.filter((el) => !el.closest('#nav')))[0] ?? lista[0]; p?.focus({ preventScroll: true }); return !!p;
    }
    const noMenu = !!atual.closest('#nav');
    if (noMenu) {                                       // menu de cima: ← → andam entre os itens, ↓ entra no conteúdo
      const nav = lista.filter((el) => el.closest('#nav')), k = nav.indexOf(atual);
      if (direcao === 'dir' || direcao === 'esq') { const alvo = nav[k + (direcao === 'dir' ? 1 : -1)]; if (alvo) { irParaFoco(alvo); return true; } return false; }
      if (direcao === 'baixo') return entrarNoConteudo();
      return false;
    }
    const j = vizinho(lista.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }), i, direcao);
    if (j >= 0) { irParaFoco(lista[j]); return true; }
    return direcao === 'esq' && !noMenu && !bloco && abrirBarraEIrPara();   // dentro de um bloco, o fim da fila é o fim
  }
  // Tab entre zonas: o menu e cada bloco do mosaico. Sem mosaico na tela, o Tab segue normal.
  function zonas() {
    const z = [...document.querySelectorAll('.mo-bloco')].filter((el) => !el.hidden && el.getClientRects().length);
    if (!z.length) return [];
    const nav = document.querySelector('#nav');
    if (nav && !(html.dataset.barra === 'solta' && !html.dataset.barraAberta)) z.unshift(nav);
    return z;
  }
  function saltarZona(passo) {
    const z = zonas(); if (!z.length) return false;
    let i = z.findIndex((el) => el.contains(document.activeElement)); if (i < 0 && passo > 0 && z[0].id === 'nav' && z.length > 1) i = 0;   // de fora de tudo, o Tab entra direto no primeiro bloco
    const alvo = z[proximaZona(z.length, i, passo)];
    if (alvo.id === 'nav') (alvo.querySelector('a.on') ?? alvo.querySelector('a,button'))?.focus(); else alvo.focus({ preventScroll: true });
    return true;
  }
  function entrarNoConteudo() {
    const b = document.querySelector('.mo-bloco.mo-foco:not([hidden])') ?? [...document.querySelectorAll('.mo-bloco')].find((x) => !x.hidden);
    const alvo = b ?? focaveis().find((el) => !el.closest('#nav'));
    if (!alvo) return false; alvo.focus({ preventScroll: true }); return true;
  }
  function abrirBarraEIrPara() {
    if (html.dataset.barra === 'solta') app.barra.abrir();
    const alvo = document.querySelector('#nav a.on') ?? document.querySelector('#nav a');
    if (alvo) { alvo.focus(); return true; } return false;
  }

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;   // quem tratou antes (slide, menu) já resolveu
    const r = interpretar(e, { digitando: digitando(document.activeElement) });
    if (!r) return;
    if (aberto() && r.acao !== 'sair' && r.acao !== 'lancador' && r.acao !== 'ajuda') return;
    if (r.acao === 'lembrete') { e.preventDefault(); fechar(); app.novoLembrete?.(); return; }
    switch (r.acao) {
      case 'tela': e.preventDefault(); fechar(); location.hash = '#' + r.tela; break;
      case 'lancador': e.preventDefault(); if (!lancador.hidden) fechar(); else abrirLancador(); break;
      case 'ajuda': e.preventDefault(); if (!ajuda.hidden) fechar(); else abrirAjuda(); break;
      case 'mover': {
        if (!r.seta) e.preventDefault();
        const ev = new CustomEvent('ohara-mover', { detail: { direcao: r.direcao, simples: !!r.simples }, cancelable: true, bubbles: true });
        const livre = (document.activeElement ?? document.body).dispatchEvent(ev);                // a tela (ex.: Mesa) pode tratar e cancelar
        const dentro = !!document.activeElement?.closest?.('.mo-bloco');
        if (r.seta) { if (!livre || mover(r.direcao, { exigeFoco: true, simples: true })) e.preventDefault(); }  // seta solta só toma a tecla se foi para algum lugar
        else if (livre) mover(r.direcao, { exigeFoco: dentro, simples: !!r.simples });
        break;
      }
      case 'zona': if (saltarZona(r.passo)) e.preventDefault(); break;
      case 'sair':
        if (aberto()) { e.preventDefault(); fechar(); }
        else if (document.activeElement?.closest?.('#nav') && entrarNoConteudo()) e.preventDefault();   // Esc no menu de cima volta ao conteúdo
        else if (html.dataset.barraAberta) { e.preventDefault(); html.removeAttribute('data-barra-aberta'); }
        break;
    }
  });
  return { abrirLancador, abrirAjuda, fechar };
}
