// Componente: o cartão pronto (frente em faixa na cor da matéria + verso). Só devolve texto HTML (nada de DOM nem estado),
// para a prévia e qualquer outra tela desenharem o mesmo cartão. A cor vem da variável CSS --mc do elemento que contém.
import { renderizarFrente, renderizarVerso } from '../../nucleo/flashcards_texto.js';

/** { frente, verso }: texto-fonte do cartão (como em cartao.frente e cartao.verso). Devolve os dois lados prontos. */
export function cartaoProntoHtml({ frente = '', verso = '' }) {
  return `<article class="fc-card fc-faixa"><header><span>FRENTE</span><span class="k">F</span></header><div class="corpo frente">${frente ? renderizarFrente(frente) : '<p class="vazio">Falta a frente: comece uma linha com @ e um espaço.</p>'}</div></article>` +
    `<article class="fc-card fc-faixa-verso"><header><span>VERSO</span><span class="k">V</span></header><div class="corpo verso">${verso ? renderizarVerso(verso) : '<p class="vazio">Falta o verso: escreva abaixo da frente.</p>'}</div></article>`;
}
