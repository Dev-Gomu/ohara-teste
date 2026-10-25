// Núcleo (regras puras, sem I/O): números do estudo para Hoje e Painel. Um dia "conta" na sequência quando
// atinge a meta diária. Dias antes do primeiro uso nunca são "não estudou".
import { somarDias, diasEntre, inicioDaSemana, diasDoMes, diaDaSemana } from './datas.js';

const validos = (blocos) => (blocos ?? []).filter((b) => !b.excluido_em);

export function minutosPorDia(blocos) {
  const m = new Map();
  for (const b of validos(blocos)) m.set(b.dia, (m.get(b.dia) ?? 0) + b.minutos_feitos);
  return m;
}

/** 'meta' (atingiu), 'parcial' (estudou, mas abaixo), 'nao' (zero), 'futuro' ou 'antes' (antes do primeiro uso). */
export function situacaoDoDia(dia, minutos, hoje, metaMin, inicioUso) {
  if (dia > hoje) return 'futuro';
  if (inicioUso && dia < inicioUso) return 'antes';
  const m = minutos.get(dia) ?? 0;
  return m >= metaMin ? 'meta' : m > 0 ? 'parcial' : 'nao';
}

/**
 * Sequência: dias seguidos que atingiram a meta, contados até hoje (se hoje já atingiu) ou até ontem.
 * `emRisco`: há sequência, mas hoje ainda não atingiu a meta (o dia de hoje pode salvá-la).
 */
export function sequencia(blocos, hoje, metaMin) {
  const min = minutosPorDia(blocos), bateu = (d) => (min.get(d) ?? 0) >= metaMin;
  const hojeAtingido = bateu(hoje);
  let dia = hojeAtingido ? hoje : somarDias(hoje, -1), dias = 0;
  while (bateu(dia)) { dias++; dia = somarDias(dia, -1); }
  return { dias, hojeAtingido, emRisco: dias > 0 && !hojeAtingido, minutosHoje: min.get(hoje) ?? 0 };
}

/** Cobrança (tela C): ontem ficou abaixo da meta, e ontem já era dia de uso. Devolve null se não há o que cobrar. */
export function cobrancaDeOntem(blocos, hoje, metaMin, inicioUso) {
  const ontem = somarDias(hoje, -1), min = minutosPorDia(blocos);
  const s = situacaoDoDia(ontem, min, hoje, metaMin, inicioUso);
  if (s === 'nao') return { tipo: 'nao', minutos: 0 };
  if (s === 'parcial') return { tipo: 'parcial', minutos: min.get(ontem) };
  return null;
}

/** Semana de segunda a domingo que contém `hoje`: total de minutos e minutos por matéria (id → min; null = sem matéria). */
export function resumoDaSemana(blocos, hoje) {
  const ini = inicioDaSemana(hoje), fim = somarDias(ini, 6), porMateria = new Map();
  let total = 0;
  for (const b of validos(blocos)) if (b.dia >= ini && b.dia <= fim) { total += b.minutos_feitos; porMateria.set(b.disciplina_id ?? null, (porMateria.get(b.disciplina_id ?? null) ?? 0) + b.minutos_feitos); }
  return { inicio: ini, fim, total, porMateria: [...porMateria].map(([id, minutos]) => ({ id, minutos })).sort((a, b) => b.minutos - a.minutos) };
}

/** Células do calendário de um mês (ano, mes 1–12): { vazio } para o recuo da primeira semana, ou { dia, n, situacao, hoje, aulas: [disciplina_id] }. */
export function calendarioDoMes(ano, mes, { blocos, aulas = [], hoje, metaMin, inicioUso }) {
  const min = minutosPorDia(blocos), p = (n) => String(n).padStart(2, '0');
  const primeiro = `${ano}-${p(mes)}-01`, celulas = [];
  for (let i = 0; i < diaDaSemana(primeiro); i++) celulas.push({ vazio: true });
  for (let n = 1; n <= diasDoMes(ano, mes); n++) {
    const dia = `${ano}-${p(mes)}-${p(n)}`;
    celulas.push({ dia, n, situacao: situacaoDoDia(dia, min, hoje, metaMin, inicioUso), hoje: dia === hoje,
      aulas: aulas.filter((a) => !a.excluido_em && a.inicio && a.inicio.slice(0, 10) === dia).map((a) => a.disciplina_id) });
  }
  return celulas;
}

export const horasMinutos = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')} min` : ''}` : `${min} min`);
export { diasEntre };
