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

export function criarAula(estado, disciplinaId, dados, agora, icsUid = null) {
  if (!ativas(estado.disciplinas).some((d) => d.id === disciplinaId)) throw new Error('A matéria não existe.');
  const aula = { id: proximoId(estado.aulas), disciplina_id: disciplinaId, ...validar(dados), anotacoes: '', ics_uid: icsUid, pasta_id: dados.pastaId ?? null, criado_em: agora, excluido_em: null };
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

/** A próxima aula da matéria a partir de `agoraLocal` (AAAA-MM-DDTHH:MM), ou null. Aula em andamento não conta (já começou). */
export const proximaAula = (estado, disciplinaId, agoraLocal) =>
  ativas(estado.aulas).filter((a) => a.disciplina_id === disciplinaId && a.inicio && a.inicio > agoraLocal)
    .sort((x, y) => x.inicio.localeCompare(y.inicio))[0] ?? null;

/** "hoje 20:00", "amanhã 08:00" ou "qua 04/11 13:00". `hoje` é AAAA-MM-DD; `somarDias` vem de datas.js (sem I/O aqui). */
export function rotuloDaAula(a, hoje, somarDias, diaDaSemana) {
  const dia = a.inicio.slice(0, 10), hora = a.inicio.slice(11, 16);
  if (dia === hoje) return `hoje ${hora}`;
  if (dia === somarDias(hoje, 1)) return `amanhã ${hora}`;
  const nomes = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  return `${nomes[diaDaSemana(dia)]} ${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`;
}

const DIAS_ABREV = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
/**
 * Rodapé do card da matéria: só o dia da semana e o horário ("Qui · 13:00").
 * Se há aula em andamento, é o início dela (e `agora` vem verdadeiro, para o card ganhar o anel); senão, o da próxima aula; sem nenhuma, texto vazio.
 * `diaDaSemana` vem de datas.js (0 = segunda), para este arquivo continuar sem depender dele.
 */
export function rotuloDoCard(estado, disciplinaId, agoraLocal, diaDaSemana) {
  const atual = emAulaAgora(estado, agoraLocal).find((a) => a.disciplina_id === disciplinaId);
  const a = atual ?? proximaAula(estado, disciplinaId, agoraLocal);
  if (!a) return { texto: '', agora: false };
  return { texto: `${DIAS_ABREV[diaDaSemana(a.inicio.slice(0, 10))]} · ${a.inicio.slice(11, 16)}`, agora: !!atual };
}

/**
 * Aula em que a Área de trabalho abre para criar cartões: a guardada (se ainda existir e a matéria estiver ativa); senão a aula mais
 * recente que já começou; senão a primeira que ainda vai começar; senão null. `agoraLocal`: AAAA-MM-DDTHH:MM.
 */
export function aulaParaCriar(estado, guardadaId, agoraLocal) {
  const mats = new Set(ativas(estado.disciplinas).map((d) => d.id));
  const aulas = ativas(estado.aulas).filter((a) => mats.has(a.disciplina_id));
  const g = aulas.find((a) => a.id === Number(guardadaId));
  if (g) return g;
  const ini = (a) => a.inicio ?? '';
  const passadas = aulas.filter((a) => a.inicio && a.inicio <= agoraLocal).sort((x, y) => ini(y).localeCompare(ini(x)));
  if (passadas.length) return passadas[0];
  return aulas.filter((a) => a.inicio).sort((x, y) => ini(x).localeCompare(ini(y)))[0] ?? aulas[0] ?? null;
}

/**
 * Aula em que o botão "Área de trabalho" do menu abre: a que está acontecendo agora; senão a última em que você mexeu (se ainda existir);
 * senão a mais recente que já começou; senão a próxima. `null` se não houver nenhuma aula. `agoraLocal`: AAAA-MM-DDTHH:MM.
 */
export function aulaParaAbrirAgora(estado, ultimaId, agoraLocal) {
  const mats = new Set(ativas(estado.disciplinas).map((d) => d.id));
  const agora = emAulaAgora(estado, agoraLocal).find((a) => mats.has(a.disciplina_id));
  return agora ?? aulaParaCriar(estado, ultimaId, agoraLocal);
}
