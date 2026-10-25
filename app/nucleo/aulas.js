// Núcleo (regras puras, sem I/O): Aulas e livros. Mesmo estado e mesma convenção de materias.js.

import { normalizarNome } from './texto.js';
import { ativas, proximoId, LIMITE_NOME } from './materias.js';

export const TIPOS = ['aula', 'livro'];
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function validarMomento(valor, rotulo) {
  if (valor == null || valor === '') return null;
  if (!DATA_HORA.test(valor) || Number.isNaN(Date.parse(valor))) throw new Error(`${rotulo} inválido: use AAAA-MM-DDTHH:MM.`);
  return valor;
}

function validar({ titulo, tipo = 'aula', inicio, fim }) {
  const limpo = normalizarNome(titulo);
  if (!limpo) throw new Error('Dê um título à aula.');
  if (limpo.length > LIMITE_NOME) throw new Error(`O título pode ter no máximo ${LIMITE_NOME} letras.`);
  if (!TIPOS.includes(tipo)) throw new Error('Tipo inválido: use aula ou livro.');
  const i = validarMomento(inicio, 'Início');
  const f = validarMomento(fim, 'Fim');
  if (i && f && f < i) throw new Error('O fim não pode ser antes do início.');
  return { titulo: limpo, tipo, inicio: i, fim: f };
}

export function criarAula(estado, disciplinaId, dados, agora) {
  if (!ativas(estado.disciplinas).some((d) => d.id === disciplinaId)) throw new Error('A matéria não existe.');
  const aula = { id: proximoId(estado.aulas), disciplina_id: disciplinaId, ...validar(dados), anotacoes: '', criado_em: agora, excluido_em: null };
  return { estado: { ...estado, aulas: [...estado.aulas, aula] }, aula };
}

export function alterarAula(estado, id, dados) {
  const atual = estado.aulas.find((a) => a.id === id && !a.excluido_em);
  if (!atual) throw new Error('Aula não encontrada.');
  const novo = validar({ ...atual, ...dados });
  return { ...estado, aulas: estado.aulas.map((a) => (a.id === id ? { ...a, ...novo } : a)) };
}

export function excluirAula(estado, id, agora) {
  if (!estado.aulas.some((a) => a.id === id && !a.excluido_em)) throw new Error('Aula não encontrada.');
  return { ...estado, aulas: estado.aulas.map((a) => (a.id === id ? { ...a, excluido_em: agora } : a)) };
}

export function restaurarAula(estado, id) {
  const a = estado.aulas.find((x) => x.id === id);
  if (!a || !a.excluido_em) throw new Error('Essa aula não está na lixeira.');
  if (!ativas(estado.disciplinas).some((d) => d.id === a.disciplina_id)) throw new Error('Restaure a matéria antes de restaurar a aula.');
  return { ...estado, aulas: estado.aulas.map((x) => (x.id === id ? { ...x, excluido_em: null } : x)) };
}

export const aulasDaMateria = (estado, disciplinaId) =>
  ativas(estado.aulas).filter((a) => a.disciplina_id === disciplinaId).sort((x, y) => (x.inicio ?? '').localeCompare(y.inicio ?? ''));

/** Aulas em andamento no instante `agoraLocal` (AAAA-MM-DDTHH:MM): base do "Em aula agora". */
export const emAulaAgora = (estado, agoraLocal) =>
  ativas(estado.aulas).filter((a) => a.inicio && a.fim && a.inicio <= agoraLocal && agoraLocal < a.fim);

/** "2026-10-26T08:00" → "26/10 08:00". Sem valor, devolve "". */
export function formatarMomento(m) {
  if (!m) return '';
  const [d, h] = m.split('T');
  const [, mes, dia] = d.split('-');
  return `${dia}/${mes} ${h}`;
}

/** Texto do horário de uma aula: "26/10 08:00 – 10:00", ou só o início, ou "". */
export function descreverHorario(a) {
  if (!a.inicio) return '';
  if (!a.fim) return formatarMomento(a.inicio);
  const mesmoDia = a.inicio.slice(0, 10) === a.fim.slice(0, 10);
  return `${formatarMomento(a.inicio)} – ${mesmoDia ? a.fim.slice(11) : formatarMomento(a.fim)}`;
}
