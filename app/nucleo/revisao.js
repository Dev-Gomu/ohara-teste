// Núcleo (regras puras, sem I/O): a revisão dos cartões no Treino (repetição espaçada, no estilo SM-2). Cada cartão revisado tem uma
// linha em `estado.revisoes` (facilidade, intervalo em dias, quando vence) e cada resposta vira uma linha em `estado.revisoes_log`.
// Datas são texto "AAAA-MM-DD" (dia local). Cartão sem linha de revisão é "novo". Nada de IA: só conta.
import { ativas } from './materias.js';
import { somarDias, diasEntre } from './datas.js';
import { aulasDaPasta } from './pastas.js';

export const RESPOSTAS = ['errei', 'dificil', 'bom', 'facil'];
export const NOVOS_POR_DIA = 12;
export const MINUTOS_POR_CARTAO = 0.3;
const FACILIDADE_INICIAL = 2.5, FACILIDADE_MIN = 1.3;

const lista = (estado, chave) => estado[chave] ?? [];

/** O que acontece com um cartão (`rev` = a linha de revisão ou null se for novo) para cada resposta, sem gravar nada. */
export function proximaRevisao(rev, resposta) {
  const E = rev?.facilidade ?? FACILIDADE_INICIAL, I = rev?.intervalo ?? 0, novo = !rev || !rev.repeticoes;
  const lapsos = rev?.lapsos ?? 0;
  if (resposta === 'errei') return { facilidade: Math.max(FACILIDADE_MIN, E - (novo ? 0 : 0.2)), intervalo: 0, repeticoes: 0, lapsos: lapsos + (novo ? 0 : 1) };
  const mais = (dias, dE) => ({ facilidade: Math.max(FACILIDADE_MIN, E + dE), intervalo: dias, repeticoes: (rev?.repeticoes ?? 0) + 1, lapsos });
  if (novo) return mais({ dificil: 1, bom: 2, facil: 4 }[resposta], { dificil: -0.15, bom: 0, facil: 0.15 }[resposta]);
  if (resposta === 'dificil') return mais(Math.max(I + 1, Math.round(I * 1.2)), -0.15);
  if (resposta === 'bom') return mais(Math.max(I + 1, Math.round(I * E)), 0);
  return mais(Math.max(I + 2, Math.round(I * E * 1.3)), 0.15);
}

/** "1 min", "2 dias", "1 mês"... para mostrar nos botões. */
export function rotuloIntervalo(dias) {
  if (dias <= 0) return '1 min';
  if (dias === 1) return '1 dia';
  if (dias < 30) return `${dias} dias`;
  if (dias < 365) { const m = Math.round(dias / 30); return `${m} ${m === 1 ? 'mês' : 'meses'}`; }
  const a = Math.round(dias / 365 * 10) / 10; return `${String(a).replace('.', ',')} ${a === 1 ? 'ano' : 'anos'}`;
}

export const rotulosDosBotoes = (rev) => Object.fromEntries(RESPOSTAS.map((r) => [r, rotuloIntervalo(proximaRevisao(rev, r).intervalo)]));

/** Grava a resposta: atualiza (ou cria) a revisão do cartão e acrescenta ao registro. `hoje`: AAAA-MM-DD; `agora`: ISO. */
export function responder(estado, cartaoId, resposta, hoje, agora) {
  if (!RESPOSTAS.includes(resposta)) throw new Error('Resposta inválida.');
  if (!ativas(estado.cartoes ?? []).some((c) => c.id === cartaoId)) throw new Error('Cartão não encontrado.');
  const atual = lista(estado, 'revisoes').find((r) => r.cartao_id === cartaoId) ?? null, p = proximaRevisao(atual, resposta);
  const nova = { cartao_id: cartaoId, ...p, vence_dia: somarDias(hoje, p.intervalo), ultima_em: agora };
  const log = { id: lista(estado, 'revisoes_log').reduce((m, x) => Math.max(m, x.id), 0) + 1, cartao_id: cartaoId, dia: hoje, resposta, novo: atual ? 0 : 1, criado_em: agora };
  return { ...estado, revisoes: [...lista(estado, 'revisoes').filter((r) => r.cartao_id !== cartaoId), nova], revisoes_log: [...lista(estado, 'revisoes_log'), log] };
}

// ---------- escopo: de onde vêm os cartões ----------

/**
 * `escopo`: { tipo: 'tudo' } | { tipo: 'ano', materiaId } | { tipo: 'bimestre', materiaId, pastaId } | { tipo: 'aula', aulaId }.
 * Devolve os cartões vivos (do ano atual, que é o que `estado` mostra), em ordem de aula e de criação.
 */
export function cartoesDoEscopo(estado, escopo) {
  const aulas = ativas(estado.aulas), mats = new Set(ativas(estado.disciplinas).map((d) => d.id));
  let ids;
  if (escopo.tipo === 'aula') ids = new Set([escopo.aulaId]);
  else if (escopo.tipo === 'bimestre') ids = new Set(aulasDaPasta(estado, escopo.materiaId, escopo.pastaId).map((a) => a.id));
  else if (escopo.tipo === 'ano') ids = new Set(aulas.filter((a) => a.disciplina_id === escopo.materiaId).map((a) => a.id));
  else ids = new Set(aulas.filter((a) => mats.has(a.disciplina_id)).map((a) => a.id));
  return ativas(estado.cartoes ?? []).filter((c) => ids.has(c.aula_id)).sort((a, b) => a.aula_id - b.aula_id || a.id - b.id);
}

/** A pasta (bimestre) "atual" da matéria: a da aula mais recente que já começou; senão a da primeira que vai começar. null se não houver pasta. */
export function bimestreAtual(estado, materiaId, agoraLocal) {
  const aulas = ativas(estado.aulas).filter((a) => a.disciplina_id === materiaId && a.inicio).sort((x, y) => x.inicio.localeCompare(y.inicio));
  const feitas = aulas.filter((a) => a.inicio <= agoraLocal), alvo = feitas.length ? feitas[feitas.length - 1] : aulas[0];
  return alvo?.pasta_id ?? null;
}

// ---------- fila do dia ----------

const novosHoje = (estado, hoje) => lista(estado, 'revisoes_log').filter((l) => l.dia === hoje && l.novo).length;

/**
 * Fila de treino: primeiro os vencidos (os mais atrasados antes), depois os novos, até o limite de novos por dia (já descontados os
 * estudados hoje). Com `todos`, devolve todos os cartões do escopo, vencidos ou não (revisar mesmo sem vencer).
 */
export function filaDoTreino(estado, escopo, hoje, { todos = false, limiteNovos = NOVOS_POR_DIA } = {}) {
  const cartoes = cartoesDoEscopo(estado, escopo), revs = new Map(lista(estado, 'revisoes').map((r) => [r.cartao_id, r]));
  if (todos) return cartoes;
  const vencidos = cartoes.filter((c) => revs.has(c.id) && revs.get(c.id).vence_dia <= hoje).sort((a, b) => revs.get(a.id).vence_dia.localeCompare(revs.get(b.id).vence_dia) || a.id - b.id);
  const sobra = Math.max(0, limiteNovos - novosHoje(estado, hoje));
  return [...vencidos, ...cartoes.filter((c) => !revs.has(c.id)).slice(0, sobra)];
}

export function contagemDoTreino(estado, escopo, hoje, opcoes = {}) {
  const fila = filaDoTreino(estado, escopo, hoje, opcoes), revs = new Set(lista(estado, 'revisoes').map((r) => r.cartao_id));
  const novos = fila.filter((c) => !revs.has(c.id)).length;
  return { total: fila.length, novos, vencidos: fila.length - novos, minutos: Math.max(fila.length ? 1 : 0, Math.round(fila.length * MINUTOS_POR_CARTAO)) };
}

// ---------- estatísticas ----------

/** Sequência de dias seguidos com treino (se hoje ainda não treinou, conta a partir de ontem) e % de acertos (bom ou fácil) nos últimos 7 dias. */
export function estatisticasDoTreino(estado, hoje) {
  const log = lista(estado, 'revisoes_log'), dias = new Set(log.map((l) => l.dia));
  let d = dias.has(hoje) ? hoje : somarDias(hoje, -1), sequencia = 0;
  while (dias.has(d)) { sequencia++; d = somarDias(d, -1); }
  const sete = log.filter((l) => diasEntre(l.dia, hoje) >= 0 && diasEntre(l.dia, hoje) < 7);
  return { sequencia, acertos7: sete.length ? Math.round(sete.filter((l) => l.resposta === 'bom' || l.resposta === 'facil').length / sete.length * 100) : null, ultimos7: Array.from({ length: 7 }, (_, i) => dias.has(somarDias(hoje, i - 6))) };
}
