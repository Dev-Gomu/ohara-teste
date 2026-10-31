// Acervo (a Biblioteca): tudo o que você guardou. Duas visões no mesmo lugar: as matérias (cards) e todos os cartões (o antigo Gerenciar).
// "Criar ›" (Alt C) abre a Área de trabalho, na aba de cartões, na aula certa. Só liga peças que já existem.
import { desenharMaterias } from './materias.js';
import { desenharCartoes } from './flashcards/gerenciar.js';
import { aulaParaCriar } from '../../nucleo/aulas.js';
import { registrar } from '../atalhos.js';
import * as pref from '../preferencias.js';

/** `modo`: 'materias' (cards das matérias) ou 'cartoes' (todos os cartões). Devolve a função de limpeza. */
export function desenharBiblioteca(raiz, ctx, modo = 'materias') {
  const cartoes = modo === 'cartoes', sessao = ctx.sessao;
  raiz.innerHTML = `<div class="fc"><div class="fc-topo"><h1>Acervo</h1><div class="fc-abas" role="tablist" aria-label="Acervo">` +
    `<button type="button" role="tab" data-ir="#materias" aria-selected="${!cartoes}" class="${cartoes ? '' : 'on'}">Matérias</button>` +
    `<button type="button" role="tab" data-ir="#cartoes" aria-selected="${cartoes}" class="${cartoes ? 'on' : ''}">Todos os cartões</button>` +
    (cartoes ? '<button type="button" data-criar="1" title="Criar cartões na Área de trabalho (Alt C)">Criar ›<kbd>Alt C</kbd></button>' : '') +
    `</div></div><div class="fc-corpo ${cartoes ? 'fc-gerenciar' : 'fc-materias'}" id="bib-corpo"></div></div>`;
  const corpo = raiz.querySelector('#bib-corpo');

  function criar() {
    const d = new Date(ctx.agora()), p = (n) => String(n).padStart(2, '0');
    const aula = aulaParaCriar(sessao.estado(), pref.ler('ohara.at.ultima'), `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
    if (!aula) { ctx.aviso('Crie uma matéria e uma aula primeiro.'); return; }
    location.hash = `#aula/${aula.id}?cartoes`;
  }
  raiz.querySelector('.fc-abas').onclick = (e) => {
    const ir = e.target.closest('[data-ir]');
    if (ir) { location.hash = ir.dataset.ir; return; }
    if (e.target.closest('[data-criar]')) criar();
  };
  const desregistrar = cartoes ? registrar({ 'Alt+KeyC': () => { criar(); } }) : () => {};
  const limpeza = cartoes ? desenharCartoes(corpo, ctx) : desenharMaterias(corpo, ctx);
  document.title = `${cartoes ? 'Todos os cartões' : 'Acervo'} · Ohara`;
  return () => { if (typeof limpeza === 'function') limpeza(); desregistrar(); };
}
