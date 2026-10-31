// Botões de formatação das anotações (régua e menu flutuante). Só desenha botões e aplica o formato no Quill;
// as regras (qual formato aplicar, o que cabe na régua) estão em nucleo/formatacao.js.
import { GRUPOS, proximoFormato, ativos } from '../../nucleo/formatacao.js';

export const svg = (p) => `<svg class="at-s" viewBox="0 0 18 18" aria-hidden="true">${p}</svg>`;
export const ICONE_MARCAR = svg('<path d="M5 2.5h8v13l-4-3-4 3z"/>');
const ROTULOS = {
  h1: 'H1', h2: 'H2', bold: '<b>B</b>', italic: '<i>I</i>', underline: '<u>U</u>',
  realce: svg('<path d="M11 3l4 4-6 6H5v-4z"/><path d="M3 16h12"/>'),
  bullet: svg('<circle cx="3.5" cy="5" r="1" fill="currentColor"/><circle cx="3.5" cy="9" r="1" fill="currentColor"/><circle cx="3.5" cy="13" r="1" fill="currentColor"/><path d="M7 5h9M7 9h9M7 13h9"/>'),
  ordered: '1.',
  check: svg('<rect x="2.5" y="2.5" width="13" height="13" rx="3"/><path d="M6 9l2.5 2.5L12.5 7"/>'),
  link: svg('<path d="M7.5 10.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2L9 4.8"/><path d="M10.5 7.5a3 3 0 00-4.2 0L3.7 10.1a3 3 0 004.2 4.2L9 13.2"/>'),
};
const DICAS = { h1: 'Título 1 (Ctrl Alt 1)', h2: 'Título 2 (Ctrl Alt 2)', bold: 'Negrito (Ctrl B)', italic: 'Itálico (Ctrl I)', underline: 'Sublinhado (Ctrl U)', realce: 'Marca-texto (Ctrl Shift H)', bullet: 'Lista com marcadores (Ctrl Shift 8)', ordered: 'Lista numerada (Ctrl Shift 7)', check: 'Lista de tarefas (Ctrl Shift 9)', link: 'Link (Ctrl K)' };

const botao = (f) => `<button type="button" class="at-fi" data-f="${f}" title="${DICAS[f]}" aria-label="${DICAS[f]}">${ROTULOS[f]}</button>`;
/** Os grupos com botões (sem o título), na ordem da régua. */
export const grupoHtml = (g) => `<span class="at-fg" data-g="${g.id}">${g.itens.map(botao).join('')}</span>`;
export const reguaHtml = () => GRUPOS.filter((g) => g.itens).map(grupoHtml).join('');
export const bolhaHtml = () => ['h1', 'h2', 'bold', 'italic', 'underline', 'realce', 'bullet', 'ordered', 'link'].map(botao).join('');

/** Acende (fundo suave) os botões do formato atual. `raiz`: o elemento com os botões. */
export function marcarAtivos(raiz, quill) {
  const r = quill.getSelection(), lista = ativos(r ? quill.getFormat(r) : {});
  raiz.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', lista.includes(b.dataset.f)));
}

export const perguntarLink = () => { const u = prompt('Endereço do link (https://…):', 'https://'); return u && u !== 'https://' ? u.trim() : null; };

/** Aplica o formato `f` (um dos botões) à seleção do Quill. */
export function aplicarFormato(quill, f) {
  if (!quill.getSelection()) quill.focus();
  const p = proximoFormato(quill.getFormat(), f);
  if (p.tipo === 'link') { const u = perguntarLink(); if (u) quill.format('link', u, 'user'); return; }
  quill.format(p.nome, p.valor, 'user');
}
