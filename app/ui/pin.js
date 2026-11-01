// PIN da tela de Notas (só trava a tela; ver nucleo/pin.js). O registro fica neste aparelho (preferências), fora do backup e fora do banco.
// "Aberto" = PIN certo digitado e atividade nos últimos 2 minutos. Sem PIN criado, a tela de Notas pede para criar um.
import { criarRegistroPin, conferirPin, expirou } from '../nucleo/pin.js';
import * as pref from './preferencias.js';

const CHAVE = 'ohara.pin';
let ultima = null;   // ms da última atividade com as notas abertas; null = trancado

export const temPin = () => !!pref.ler(CHAVE);
export const aberto = (agora) => temPin() && !expirou(ultima, agora);
export const abrir = (agora) => { ultima = agora; };
export const trancar = () => { ultima = null; };
/** Chamar a cada toque ou tecla na tela de Notas: só prolonga se já estava aberta (não reabre uma trancada). */
export const atividade = (agora) => { if (ultima != null && !expirou(ultima, agora)) ultima = agora; };
export const definirPin = (pin, agora) => { pref.gravar(CHAVE, criarRegistroPin(pin, Math.random())); ultima = agora; };
export const confere = (pin) => conferirPin(pref.ler(CHAVE), pin);
export const removerPin = () => { pref.remover(CHAVE); ultima = null; };

const SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M13 9l4 6M17 9l-4 6"/></svg>';
const CADEADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/**
 * Desenha o teclado numérico dentro de `no` e devolve a função que o desfaz. `modo`: 'abrir' (pede o PIN) | 'criar' (pede e repete).
 * `aoAcertar(pin)` roda quando o PIN confere (abrir) ou quando os dois digitados são iguais (criar). `extra` = HTML de um link discreto (ex.: "Esqueci").
 */
export function telaDoPin(no, { modo, titulo, aoAcertar, extra = '' }) {
  let digitos = '', primeiro = null, msg = '';
  const frase = () => (modo === 'criar' ? (primeiro == null ? 'Escolha um PIN de 4 a 6 números' : 'Digite o mesmo PIN de novo') : 'Digite o PIN para ver as notas');
  function desenhar() {
    no.innerHTML = `<div class="pin"><div class="pin-ic">${CADEADO}</div><h2>${titulo}</h2><p class="pin-sub">${msg || frase()}</p>` +
      `<div class="pin-pts" aria-live="polite" aria-label="${digitos.length} números digitados">${Array.from({ length: 6 }, (_, i) => `<i class="${i < digitos.length ? 'on' : ''}"></i>`).join('')}</div>` +
      `<div class="pin-teclas">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}` +
      `<button type="button" data-n="apagar" aria-label="Apagar">${SETA}</button><button type="button" data-n="0">0</button><button type="button" class="ok" data-n="ok" ${digitos.length < 4 ? 'disabled' : ''}>OK</button></div>` +
      (extra ? `<div class="pin-extra">${extra}</div>` : '') + '</div>';
  }
  function confirmar() {
    if (digitos.length < 4) return;
    if (modo === 'abrir') {
      if (confere(digitos)) { aoAcertar(digitos); return; }
      digitos = ''; msg = 'PIN errado. Tente de novo.';
    } else if (primeiro == null) { primeiro = digitos; digitos = ''; msg = ''; }
    else if (primeiro === digitos) { aoAcertar(digitos); return; }
    else { primeiro = null; digitos = ''; msg = 'Os dois não são iguais. Comece de novo.'; }
    desenhar();
  }
  function tecla(t) {
    if (t === 'apagar') digitos = digitos.slice(0, -1);
    else if (t === 'ok') { confirmar(); return; }
    else if (digitos.length < 6) digitos += t;
    msg = ''; desenhar();
  }
  const clique = (ev) => { const b = ev.target.closest('[data-n]'); if (b && no.contains(b)) tecla(b.dataset.n); };
  const teclado = (ev) => {
    if (!no.isConnected || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (/^\d$/.test(ev.key)) { ev.preventDefault(); tecla(ev.key); }
    else if (ev.key === 'Backspace') { ev.preventDefault(); tecla('apagar'); }
    else if (ev.key === 'Enter' && !ev.target.closest?.('button[data-a],a')) { ev.preventDefault(); tecla('ok'); }
  };
  no.addEventListener('click', clique); document.addEventListener('keydown', teclado);
  desenhar();
  return () => { no.removeEventListener('click', clique); document.removeEventListener('keydown', teclado); };
}
