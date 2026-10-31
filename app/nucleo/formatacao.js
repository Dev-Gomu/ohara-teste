// Núcleo (regras puras, sem DOM nem Quill): a régua de formatação das anotações.
// `some` = ordem em que o grupo vai para o "⋯" quando falta espaço (1 sai primeiro; 0 nunca sai).

export const GRUPOS = [
  { id: 'titulo', some: 4 },
  { id: 'cabecalhos', itens: ['h1', 'h2'], some: 3 },
  { id: 'texto', itens: ['bold', 'italic', 'underline', 'realce'], some: 0 },
  { id: 'listas', itens: ['bullet', 'ordered', 'check'], some: 1 },
  { id: 'link', itens: ['link'], some: 2 },
];

export const REALCE = 'rgba(255, 196, 46, .42)';

/** `larguras`: { id: px } de cada grupo; `disponivel`: px; `folga`: px do botão "⋯". Tira grupos na ordem de `some` até caber. */
export function caberRegua(larguras, disponivel, folga = 0) {
  const ordem = GRUPOS.filter((g) => g.id in larguras);
  const total = (ids) => ids.reduce((s, id) => s + larguras[id], 0);
  let visiveis = ordem.map((g) => g.id);
  if (total(visiveis) <= disponivel) return { visiveis, noMais: [] };
  const noMais = [];
  for (const g of [...ordem].filter((x) => x.some > 0).sort((a, b) => a.some - b.some)) {
    visiveis = visiveis.filter((id) => id !== g.id); noMais.push(g.id);
    if (total(visiveis) + folga <= disponivel) break;
  }
  return { visiveis, noMais };
}

/** O que fazer ao tocar no botão `f` com o formato atual `fmt` (quill.getFormat()). */
export function proximoFormato(fmt, f) {
  if (f === 'h1' || f === 'h2') { const n = Number(f[1]); return { tipo: 'linha', nome: 'header', valor: fmt.header === n ? false : n }; }
  if (f === 'bullet' || f === 'ordered') return { tipo: 'linha', nome: 'list', valor: fmt.list === f ? false : f };
  if (f === 'check') return { tipo: 'linha', nome: 'list', valor: fmt.list === 'checked' || fmt.list === 'unchecked' ? false : 'unchecked' };
  if (f === 'realce') return { tipo: 'trecho', nome: 'background', valor: fmt.background ? false : REALCE };
  if (f === 'link') return { tipo: 'link' };
  return { tipo: 'trecho', nome: f, valor: !fmt[f] };
}

/** Botões "ativos" (fundo suave) para o formato atual. */
export function ativos(fmt) {
  const r = [];
  if (fmt.header === 1) r.push('h1'); if (fmt.header === 2) r.push('h2');
  for (const k of ['bold', 'italic', 'underline']) if (fmt[k]) r.push(k);
  if (fmt.background) r.push('realce');
  if (fmt.list === 'bullet' || fmt.list === 'ordered') r.push(fmt.list);
  if (fmt.list === 'checked' || fmt.list === 'unchecked') r.push('check');
  if (fmt.link) r.push('link');
  return r;
}
