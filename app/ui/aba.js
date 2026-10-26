// A "aba suave" das pastas (visual Pastas): a aba desce para o corpo numa curva em S, sem degrau. É um desenho de 190×33 que
// herda a cor da pasta (currentColor) e termina rente ao topo do corpo; o resto do contorno é CSS (border-radius).
export const ABA = '<svg class="aba" viewBox="0 0 152 33" aria-hidden="true"><path d="M0 33V14Q0 0 14 0H86C118 0 120 33 152 33Z" fill="currentColor"/>' +
  '<path d="M14 .7H86C118 .7 120 32.6 152 32.6" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.1" stroke-linecap="round"/></svg>';

/** Três letras da matéria, sem acento e em caixa-alta ("Microparasitologia" → "MIC"). */
export const codigoDaMateria = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
