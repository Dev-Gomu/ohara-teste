// Tela Flashcards: três abas (Criar, Gerenciar, Treinar), cada uma em seu módulo. Pensada para o teclado: dá para fazer tudo sem clicar.
import { criarTelaCriar } from './criar.js';
import { criarTelaTreinar } from './treinar.js';
import { desenharCartoes } from './gerenciar.js';
import * as pref from '../../preferencias.js';
import { registrar } from '../../atalhos.js';

const ABAS = [['criar', 'Criar', 'C'], ['gerenciar', 'Gerenciar', 'G'], ['treinar', 'Treinar', 'T']];

export function desenharFlashcards(raiz, ctx) {
  const sessao = ctx.sessao;
  let aba = pref.ler('ohara.fc.aba', 'criar'), limpezaAba = null;
  const rascunho = { texto: pref.ler('ohara.fc.texto'), aula: pref.ler('ohara.fc.aula'), etiquetas: pref.ler('ohara.fc.etiquetas'), atual: 0 };   // o texto em andamento sobrevive à troca de aba
  const $ = (s, r = raiz) => r.querySelector(s);
  document.title = 'Flashcards · Ohara';

  raiz.innerHTML = `<div class="fc"><div class="fc-topo"><h1>Flashcards</h1><div class="fc-abas" role="tablist" aria-label="Seções dos flashcards">` +
    ABAS.map(([k, nome, tecla]) => `<button type="button" role="tab" data-aba="${k}" title="${nome} (Alt ${tecla})">${nome}<kbd>Alt ${tecla}</kbd></button>`).join('') +
    `</div></div><div class="fc-corpo" id="fc-corpo"></div></div>`;

  const desenhar = { criar: criarTelaCriar({ sessao, ctx, raiz, rascunho }), gerenciar: (corpo) => desenharCartoes(corpo, ctx), treinar: criarTelaTreinar({ sessao, raiz }) };
  function irPara(k) {
    if (limpezaAba) { limpezaAba(); limpezaAba = null; }
    aba = k; pref.gravar('ohara.fc.aba', k);
    raiz.querySelectorAll('.fc-abas button').forEach((b) => { const on = b.dataset.aba === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    const corpo = $('#fc-corpo'); corpo.className = `fc-corpo fc-${k}`; corpo.onclick = corpo.onsubmit = corpo.onchange = null;
    limpezaAba = desenhar[k](corpo) ?? null;
  }
  raiz.querySelector('.fc-abas').onclick = (e) => { const b = e.target.closest('[data-aba]'); if (b) irPara(b.dataset.aba); };

  // Alt C, G e T trocam de aba
  const desregistrar = registrar({ 'Alt+KeyC': () => irPara('criar'), 'Alt+KeyG': () => irPara('gerenciar'), 'Alt+KeyT': () => irPara('treinar') });
  irPara(ABAS.some(([k]) => k === aba) ? aba : 'criar');
  return () => { if (limpezaAba) limpezaAba(); desregistrar(); };
}
