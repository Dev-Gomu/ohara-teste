// Núcleo (regras puras, sem I/O): o texto-fonte dos flashcards e a conversão dele em HTML seguro.
// O que a pessoa escreve fica guardado como está (cartao.frente e cartao.verso); o HTML é só para mostrar e exportar.
//
//   @ Frente do cartão            (a frente; pode ter mais linhas até a primeira seção)
//   # Seção                       (bloco do verso)        ## Subseção
//   - item  ·  1. item            (listas)
//   (+) a favor  ·  (-) contra  ·  (?) dúvida     (marcadores clínicos)
//   a | b | c                     (colunas: de 2 a 4 células na mesma linha)
//   **negrito**  *itálico*  ==destaque==  `código`
//   ---                           (separa vários cartões no mesmo texto)
import { escaparHtml } from './texto.js';

const SEPARADOR = /^\s*-{3,}\s*$/;
const FRENTE = /^\s*@\s?(.*)$/;
const SECAO = /^\s*(#{1,2})\s*(.*)$/;
const ITEM = /^\s*[-*]\s+(.*)$/;
const NUMERADO = /^\s*\d+[.)]\s+(.*)$/;
const MARCADOR = /^\s*\(([+\-−?])\)\s*(.*)$/;

const limpa = (t) => String(t ?? '').replace(/\r\n?/g, '\n');

/** Divide um texto em vários cartões pela linha `---`. Blocos vazios somem. */
export function dividirCartoes(texto) {
  const blocos = []; let atual = [];
  for (const linha of limpa(texto).split('\n')) {
    if (SEPARADOR.test(linha)) { blocos.push(atual.join('\n')); atual = []; } else atual.push(linha);
  }
  blocos.push(atual.join('\n'));
  return blocos.filter((b) => b.trim());
}

/** Separa o texto de UM cartão em frente e verso (texto-fonte). A frente vai do `@` até a primeira seção. */
export function analisarCartao(texto) {
  const linhas = limpa(texto).split('\n');
  const frente = [], verso = []; let fase = 'antes';
  for (const linha of linhas) {
    if (fase === 'antes') {
      const m = FRENTE.exec(linha);
      if (m) { frente.push(m[1]); fase = 'frente'; } else if (SECAO.test(linha)) { fase = 'verso'; verso.push(linha); } else if (linha.trim()) { frente.push(linha); fase = 'frente'; }
    } else if (fase === 'frente') {
      if (SECAO.test(linha)) { fase = 'verso'; verso.push(linha); } else frente.push(linha);
    } else verso.push(linha);
  }
  const corta = (ls) => ls.join('\n').replace(/^\n+|\s+$/g, '');
  return { frente: corta(frente), verso: corta(verso) };
}

/** Texto-fonte completo de um cartão já guardado (para editar de novo). */
export const montarTexto = ({ frente = '', verso = '' }) => `@ ${frente}${verso ? `\n${verso}` : ''}`;

/** Marcas dentro da linha: **negrito**, *itálico*, ==destaque== e `código`. Escapa o HTML antes, então não passa tag nenhuma. */
export function inline(texto) {
  return escaparHtml(texto)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
}

export const renderizarFrente = (frente) => limpa(frente).split('\n').filter((l) => l.trim()).map((l) => `<p>${inline(l)}</p>`).join('');

/** O verso em HTML: seções, listas, marcadores clínicos e colunas. Tudo escapado. */
export function renderizarVerso(verso) {
  const saida = []; let lista = null, secao = false;
  const fechaLista = () => { if (lista) { saida.push(`</${lista}>`); lista = null; } };
  const fechaSecao = () => { fechaLista(); if (secao) { saida.push('</section>'); secao = false; } };
  const abreSecao = () => { if (!secao) { saida.push('<section class="fc-sec">'); secao = true; } };
  const abreLista = (tag, classe = '') => { if (lista !== tag + classe) { fechaLista(); saida.push(`<${tag}${classe ? ` class="${classe}"` : ''}>`); lista = tag + classe; } };
  for (const linha of limpa(verso).split('\n')) {
    let m;
    if (!linha.trim()) { fechaLista(); continue; }
    if ((m = SECAO.exec(linha))) {
      const nivel = m[1].length;
      if (nivel === 1) { fechaSecao(); saida.push('<section class="fc-sec">'); secao = true; saida.push(`<h4>${inline(m[2])}</h4>`); } else { abreSecao(); fechaLista(); saida.push(`<h5>${inline(m[2])}</h5>`); }
    } else if ((m = MARCADOR.exec(linha))) {
      abreSecao(); const s = m[1] === '-' ? '−' : m[1]; abreLista('ul', 'fc-mk'); saida.push(`<li class="${s === '+' ? 'mais' : s === '−' ? 'menos' : 'duvida'}"><b>${s}</b> ${inline(m[2])}</li>`);
    } else if ((m = ITEM.exec(linha))) { abreSecao(); abreLista('ul'); saida.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = NUMERADO.exec(linha))) { abreSecao(); abreLista('ol'); saida.push(`<li>${inline(m[1])}</li>`); }
    else if (/\s\|\s/.test(linha) && linha.split(/\s\|\s/).length <= 4) {
      abreSecao(); fechaLista(); const celulas = linha.split(/\s\|\s/);
      saida.push(`<div class="fc-cols fc-cols-${celulas.length}">${celulas.map((c) => `<div>${inline(c.trim())}</div>`).join('')}</div>`);
    } else { abreSecao(); fechaLista(); saida.push(`<p>${inline(linha)}</p>`); }
  }
  fechaSecao();
  return saida.join('');
}

/** Texto simples curto (para listas): tira as marcas e junta as linhas. */
export function resumo(texto, max = 90) {
  const t = limpa(texto).split('\n').map((l) => l.replace(/^\s*(#{1,2}|[-*]|\d+[.)]|\([+\-−?]\))\s*/, '').replace(/[*=`]/g, '').trim()).filter(Boolean).join(' · ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Modelos que já vêm no app. O texto é o ponto de partida do editor. */
export const MODELOS_PADRAO = [
  { nome: 'Doença', texto: '@ Nome da doença\n# Definição\n\n# Epidemiologia\n\n# Fisiopatologia\n\n# Quadro clínico\n\n# Diagnóstico\n\n# Tratamento\n' },
  { nome: 'Farmacologia', texto: '@ Nome do fármaco\n# Classe\n\n# Mecanismo de ação\n\n# Indicações\n\n# Efeitos adversos\n\n# Contraindicações\n' },
  { nome: 'Semiologia', texto: '@ Sinal ou manobra\n# Conceito\n\n# Técnica\n\n# Achados\n(+) \n(-) \n' },
  { nome: 'Pergunta e resposta', texto: '@ Pergunta\n# Resposta\n' },
];

/** Quantos cartões o texto vai gerar e quais têm problema (frente ou verso vazios), para avisar antes de salvar. */
export function conferir(texto) {
  const cartoes = dividirCartoes(texto).map(analisarCartao);
  return { cartoes, problemas: cartoes.map((c, i) => (!c.frente ? `Cartão ${i + 1}: falta a frente (linha com @).` : !c.verso ? `Cartão ${i + 1}: falta o verso (use # Seção).` : null)).filter(Boolean) };
}
