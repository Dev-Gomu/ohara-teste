// Registro central de atalhos de teclado. Em vez de cada tela pôr o próprio keydown no document, ela chama registrar() com um
// mapa { 'Alt+KeyS': função } e guarda a função devolvida para desregistrar ao sair. O mais recente vale primeiro (um atalho
// da tela sobrepõe o de baixo). A função devolve `false` se não tratou (a tecla segue adiante); qualquer outra coisa conta como
// tratado (o navegador não faz a ação dele). Nomes das teclas: ver nucleo/atalhos.js.
import { combinacao } from '../nucleo/atalhos.js';

const pilhas = { normal: [], captura: [] };
let ligado = false;

function despachar(pilha, e) {
  if (e.isComposing) return;
  const c = combinacao(e);
  for (let i = pilha.length - 1; i >= 0; i--) {
    const f = pilha[i].mapa[c];
    if (f && f(e) !== false) { e.preventDefault(); return; }
  }
}
function ligar() {
  if (ligado) return; ligado = true;
  document.addEventListener('keydown', (e) => despachar(pilhas.normal, e));
  document.addEventListener('keydown', (e) => despachar(pilhas.captura, e), true);
}

/** `mapa`: { combinação: função(e) }. `captura: true` age antes dos outros ouvintes (ex.: o treino tem prioridade sobre o Esc global). Devolve desregistrar(). */
export function registrar(mapa, { captura = false } = {}) {
  ligar();
  const pilha = captura ? pilhas.captura : pilhas.normal, item = { mapa };
  pilha.push(item);
  return () => { const i = pilha.indexOf(item); if (i >= 0) pilha.splice(i, 1); };
}

/** Embrulha um atalho para só valer fora de campos de texto (input, select, textarea, editor). */
export const foraDeCampos = (f) => (e) => (e.target.closest?.('input,select,textarea,[contenteditable]') ? false : f(e));
