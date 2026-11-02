// Núcleo (regras puras, sem I/O): a "linha do dia" da tela Hoje. Posiciona as aulas do dia numa régua de horas e diz
// onde está o "agora". O estudo do plano não tem horário (só dia), então não entra na régua: aparece numa lista.
import { ativas } from './materias.js';

export const HORA_MIN = 6, HORA_MAX = 24;
const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Aulas de `dia` ("AAAA-MM-DD") de matérias ativas, com início e fim em minutos desde 00:00, ordenadas.
 * Aula sem fim vale 1 hora; fim antes do início vale 1 hora também (dado ruim não vira bloco negativo).
 */
export function aulasDoDia(estado, dia) {
  const mats = new Set(ativas(estado.disciplinas).map((d) => d.id));
  return ativas(estado.aulas).filter((a) => a.inicio && a.inicio.slice(0, 10) === dia && mats.has(a.disciplina_id))
    .map((a) => {
      const ini = minutos(a.inicio.slice(11, 16)), fimBruto = a.fim && a.fim.slice(0, 10) === dia ? minutos(a.fim.slice(11, 16)) : ini + 60;
      return { id: a.id, disciplina_id: a.disciplina_id, titulo: a.titulo, ini, fim: fimBruto > ini ? fimBruto : ini + 60 };
    }).sort((x, y) => x.ini - y.ini || x.fim - y.fim);
}

/** Faixa de horas inteiras que cobre as aulas, nunca menor que `padrao` (8 a 21) e dentro de 6 a 24. */
export function faixaDeHoras(aulas, padrao = [8, 21]) {
  let de = padrao[0], ate = padrao[1];
  for (const a of aulas) { de = Math.min(de, Math.floor(a.ini / 60)); ate = Math.max(ate, Math.ceil(a.fim / 60)); }
  return { de: Math.max(HORA_MIN, de), ate: Math.min(HORA_MAX, ate) };
}

/** Estado de cada aula em relação a `agoraMin` (minutos desde 00:00 de hoje): 'passou', 'agora' ou 'depois'. */
export const situacaoDaAula = (a, agoraMin) => (a.fim <= agoraMin ? 'passou' : a.ini <= agoraMin ? 'agora' : 'depois');

/** Posição vertical (0 a 1) de um instante dentro da faixa; null se estiver fora dela. */
export function posicao(min, faixa) {
  const de = faixa.de * 60, ate = faixa.ate * 60;
  return min < de || min > ate ? null : (min - de) / (ate - de);
}

/** Sete dias da semana de `hoje`, de segunda a domingo: [{ dia, n, hoje, nome }]. `inicio` é a segunda. */
export function diasDaSemana(inicio, hoje, somar) {
  const nomes = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
  return nomes.map((nome, i) => { const dia = somar(inicio, i); return { dia, n: Number(dia.slice(8, 10)), hoje: dia === hoje, nome }; });
}

/**
 * Sugere horário para o estudo do plano (que só tem o dia) nas lacunas entre as aulas, da hora atual em diante, com `pausa` de folga
 * antes e depois de cada aula e entre os blocos. Mantém a ordem recebida. Devolve { colocados: [{ tarefa, ini, fim }], sobram: [tarefa] }
 * (sobram = o que não coube antes de `fimMin`). É sugestão: nada é gravado.
 */
export function encaixarEstudo(aulas, tarefas, { agoraMin, inicioMin = 8 * 60, fimMin = 22 * 60, pausa = 5 } = {}) {
  const ocupados = aulas.map((a) => [a.ini, a.fim]);
  const colocados = [], sobram = [];
  let cursor = Math.max(inicioMin, Math.ceil(agoraMin / 5) * 5);
  for (const t of tarefas) {
    const dur = t.minutos;
    let s = cursor, achou = false;
    while (s + dur <= fimMin) {
      const choque = ocupados.find(([a, b]) => s < b + pausa && s + dur + pausa > a);
      if (!choque) { achou = true; break; }
      s = Math.max(s + 5, choque[1] + pausa);
    }
    if (achou) { colocados.push({ tarefa: t, ini: s, fim: s + dur }); ocupados.push([s, s + dur]); cursor = s + dur + pausa; }
    else sobram.push(t);
  }
  return { colocados, sobram };
}
