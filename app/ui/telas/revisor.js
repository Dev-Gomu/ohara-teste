// Treino (revisor de flashcards): o antigo "Treinar" como tela própria (hoje é uma demonstração: mostra os cartões e conta as respostas).
import { criarTelaTreinar } from './flashcards/treinar.js';

export function desenharRevisor(raiz, ctx) {
  document.title = 'Treino · Ohara';
  raiz.innerHTML = '<div class="fc"><div class="fc-topo"><h1>Treino</h1></div><div class="fc-corpo fc-treinar" id="fc-corpo"></div></div>';
  const limpeza = criarTelaTreinar({ sessao: ctx.sessao, raiz })(raiz.querySelector('#fc-corpo'));
  return () => { if (typeof limpeza === 'function') limpeza(); };
}
