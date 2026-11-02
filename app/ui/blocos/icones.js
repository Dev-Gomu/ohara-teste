// Identificação dos blocos da Mesa: ícone fantasma no lugar do nome (o nome vai na dica e no leitor de tela).
const SVG = {
  slides: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>',
  anotacoes: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  cartoes: '<rect x="3" y="8" width="14" height="11" rx="2.5"/><path d="M7 5h12a2 2 0 0 1 2 2v8"/>',
};
export const ICONE_BLOCO = SVG;
const NOME = { slides: 'Slides', anotacoes: 'Anotações', cartoes: 'Cartões' };
export const tituloDoBloco = (bloco, extra = '') => `<b class="mo-tit"${extra} role="img" aria-label="${NOME[bloco]}" title="${NOME[bloco]}"><svg viewBox="0 0 24 24" aria-hidden="true">${SVG[bloco]}</svg></b>`;
