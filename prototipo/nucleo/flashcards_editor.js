// Núcleo (regras puras, sem I/O): o modelo do editor de cartões. O editor mostra o cartão já formatado (sem as marcas);
// aqui ficam as regras que ligam as linhas do editor ao texto-fonte guardado (cartao.frente e cartao.verso).
//
// Sintaxe digitada, no começo da linha: @ frente (abre um cartão novo) · # seção · ? dúvida · (+) (-) (?) — estes valem COM ou SEM
// espaço depois; - item · 1. item · + a favor · -- contra precisam do espaço (senão "-5 mmHg", "1.5 mg" e "+3" virariam lista).  Dentro da linha: **negrito** e ==destaque==.
// Forma guardada (aceita pelo núcleo antigo, flashcards_texto.js): @, #, -, (+), (-), (?) e "---" entre cartões.
// O verso pode começar sem seção: ao guardar, entra um "# " vazio logo depois da frente; ao abrir, ele some.

/** Marcas reconhecidas (digitadas ou guardadas). A ordem importa: `--` e `(-)` antes de `-`. */
export const MARCAS = [
  ['frente', /^@\s?/], ['secao', /^##?\s?/], ['menos', /^(\([-−]\)\s?|--\s)/], ['mais', /^(\(\+\)\s?|\+\s)/],
  ['duvida', /^(\(\?\)\s?|\?\s?)/], ['item', /^[-*]\s/], ['num', /^\d+[.)]\s/],
];
export const TIPOS_LISTA = ['item', 'num', 'mais', 'menos', 'duvida'];
const GUARDADO = { frente: '@ ', secao: '# ', mais: '(+) ', menos: '(-) ', duvida: '(?) ', item: '- ', texto: '' };
const DIGITADO = { frente: '@ ', secao: '# ', mais: '+ ', menos: '-- ', duvida: '? ', item: '- ', texto: '' };

/** Se o texto começa com uma marca (e espaço), devolve { tipo, resto }; senão null. */
export function detectarMarca(texto) {
  for (const [tipo, re] of MARCAS) { const m = re.exec(texto); if (m) return { tipo, resto: texto.slice(m[0].length) }; }
  return null;
}

/** Texto-fonte (guardado ou digitado) em linhas { t: tipo, x: texto com **negrito** e ==destaque== }. */
export function linhasDeFonte(fonte) {
  const saida = [];
  for (const l of String(fonte ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*-{3,}\s*$/.test(l)) continue;                                   // o separador antigo: agora o @ abre o cartão
    const m = detectarMarca(l), t = m ? m.tipo : 'texto', x = m ? m.resto : l;
    if (t === 'secao' && !x.trim() && saida.at(-1)?.t === 'frente') continue; // verso que começa sem seção
    saida.push({ t, x });
  }
  return saida;
}

/** Linhas do editor em texto. `guardado` = forma que o resto do app entende; senão a forma curta de digitar. */
export function serializar(linhas, guardado = true) {
  const P = guardado ? GUARDADO : DIGITADO, saida = [];
  let primeiro = true, aberto = false, n = 0;
  for (const { t, x } of linhas) {
    if (t === 'frente') { if (guardado && !primeiro) saida.push('---'); primeiro = false; aberto = true; n = 0; saida.push(P.frente + x); continue; }
    n = t === 'num' ? n + 1 : 0;
    if (guardado && aberto && t !== 'secao' && x.trim()) { saida.push('# '); aberto = false; }
    if (t === 'secao') aberto = false;
    saida.push(t === 'num' ? `${n}. ${x}` : P[t] + x);
  }
  return saida.join('\n');
}

export const paraGuardado = (fonte) => serializar(linhasDeFonte(fonte), true);
export const paraDigitado = (fonte) => serializar(linhasDeFonte(fonte), false);

/** Quantos cartões o texto tem (cada @ abre um). */
export const contarCartoes = (fonte) => linhasDeFonte(fonte).filter((l) => l.t === 'frente').length;
