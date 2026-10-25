// Núcleo (regras puras, sem I/O): tratamento de texto do usuário.

const SUBSTITUICOES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa um texto para ir para dentro de HTML. Todo texto do usuário passa por aqui antes de ir à tela. */
export function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => SUBSTITUICOES[c]);
}

/** Tira espaços das pontas e junta espaços repetidos (nomes de matéria, de aula etc.). */
export function normalizarNome(valor) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

/** 1536 → "1,5 KB"; usado para mostrar espaço de armazenamento. */
export function formatarBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  const un = ['B', 'KB', 'MB', 'GB']; let i = 0, v = n;
  while (v >= 1024 && i < un.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(v < 10 ? 1 : 0).replace('.', ',')} ${un[i]}`;
}
