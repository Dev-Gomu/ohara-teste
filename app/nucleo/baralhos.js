// Núcleo (regras puras, sem I/O): baralhos do Treino (estudo personalizado). Um baralho é um nome mais as provas e/ou aulas escolhidas
// (listas de ids guardadas em JSON, como a prova guarda as aulas). Os cartões do baralho são os das aulas das provas somadas às aulas
// soltas; se a prova mudar de aulas, o baralho acompanha. Exclusão = lixeira.
import { ativas } from './materias.js';
import { normalizarNome } from './texto.js';
import { aulasDaProva } from './planejador.js';

export const LIMITE_NOME_BARALHO = 60;

export const lerIds = (texto) => { try { const l = JSON.parse(texto); return Array.isArray(l) ? l.filter(Number.isInteger) : []; } catch { return []; } };
const lista = (estado) => estado.baralhos ?? [];

export function baralhosAtivos(estado) { return ativas(lista(estado)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); }

function validar(estado, { nome, provas = [], aulas = [] }) {
  const n = normalizarNome(nome);
  if (!n) throw new Error('Dê um nome ao baralho.');
  const provasVivas = new Set(ativas(estado.provas ?? []).map((p) => p.id)), aulasVivas = new Set(ativas(estado.aulas).map((a) => a.id));
  const p = [...new Set(provas)].filter((id) => provasVivas.has(id)), a = [...new Set(aulas)].filter((id) => aulasVivas.has(id));
  if (!p.length && !a.length) throw new Error('Escolha ao menos uma prova ou uma aula.');
  return { nome: n.slice(0, LIMITE_NOME_BARALHO), provas: JSON.stringify(p), aulas: JSON.stringify(a) };
}

export function criarBaralho(estado, dados, agora) {
  const v = validar(estado, dados);
  const baralho = { id: lista(estado).reduce((m, b) => Math.max(m, b.id), 0) + 1, ...v, criado_em: agora, excluido_em: null };
  return { estado: { ...estado, baralhos: [...lista(estado), baralho] }, baralho };
}

export function alterarBaralho(estado, id, dados) {
  const atual = ativas(lista(estado)).find((b) => b.id === id);
  if (!atual) throw new Error('Baralho não encontrado.');
  const v = validar(estado, { nome: dados.nome ?? atual.nome, provas: dados.provas ?? lerIds(atual.provas), aulas: dados.aulas ?? lerIds(atual.aulas) });
  return { ...estado, baralhos: lista(estado).map((b) => (b.id === id ? { ...b, ...v } : b)) };
}

export function excluirBaralho(estado, id, agora) {
  if (!ativas(lista(estado)).some((b) => b.id === id)) throw new Error('Baralho não encontrado.');
  return { ...estado, baralhos: lista(estado).map((b) => (b.id === id ? { ...b, excluido_em: agora } : b)) };
}

export function restaurarBaralho(estado, id) {
  const b = lista(estado).find((x) => x.id === id);
  if (!b || !b.excluido_em) throw new Error('Esse baralho não está na lixeira.');
  return { ...estado, baralhos: lista(estado).map((x) => (x.id === id ? { ...x, excluido_em: null } : x)) };
}

/** Conjunto de ids das aulas do baralho (aulas das provas + aulas soltas), só de aulas e matérias ativas. */
export function aulasDoBaralho(estado, baralho) {
  const mats = new Set(ativas(estado.disciplinas).map((d) => d.id)), vivas = new Map(ativas(estado.aulas).filter((a) => mats.has(a.disciplina_id)).map((a) => [a.id, a]));
  const ids = new Set(lerIds(baralho.aulas));
  const provas = new Set(lerIds(baralho.provas));
  for (const p of ativas(estado.provas ?? [])) if (provas.has(p.id)) for (const a of aulasDaProva(p)) ids.add(a);
  return new Set([...ids].filter((id) => vivas.has(id)));
}

/** Resumo do baralho para mostrar na lista: quantas provas e aulas, e a próxima prova (data). */
export function resumoDoBaralho(estado, baralho) {
  const provas = ativas(estado.provas ?? []).filter((p) => lerIds(baralho.provas).includes(p.id)).sort((a, b) => (a.data ?? '9999').localeCompare(b.data ?? '9999'));
  return { provas, aulas: aulasDoBaralho(estado, baralho).size };
}
