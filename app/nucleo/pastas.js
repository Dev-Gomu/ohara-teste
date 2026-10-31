// Núcleo (regras puras, sem I/O): pastas da matéria (por exemplo, os bimestres). Cada aula está em no máximo uma pasta
// (`aula.pasta_id`); sem pasta = só aparece em "Todas". Excluir a pasta vai para a lixeira e as aulas continuam existindo.
import { normalizarNome } from './texto.js';
import { ativas, proximoId, LIMITE_NOME } from './materias.js';

const lista = (estado) => estado.pastas ?? [];

export function criarPasta(estado, disciplinaId, nome, agora) {
  if (!ativas(estado.disciplinas).some((d) => d.id === disciplinaId)) throw new Error('A matéria não existe.');
  const limpo = normalizarNome(nome);
  if (!limpo) throw new Error('Dê um nome à pasta.');
  if (limpo.length > LIMITE_NOME) throw new Error(`O nome pode ter no máximo ${LIMITE_NOME} letras.`);
  if (pastasDaMateria(estado, disciplinaId).some((p) => p.nome.toLowerCase() === limpo.toLowerCase())) throw new Error('Já existe uma pasta com esse nome.');
  const pasta = { id: proximoId(lista(estado)), disciplina_id: disciplinaId, nome: limpo, criado_em: agora, excluido_em: null };
  return { estado: { ...estado, pastas: [...lista(estado), pasta] }, pasta };
}

export function renomearPasta(estado, id, nome) {
  const atual = ativas(lista(estado)).find((p) => p.id === id);
  if (!atual) throw new Error('Pasta não encontrada.');
  const limpo = normalizarNome(nome);
  if (!limpo) throw new Error('Dê um nome à pasta.');
  if (limpo.length > LIMITE_NOME) throw new Error(`O nome pode ter no máximo ${LIMITE_NOME} letras.`);
  if (pastasDaMateria(estado, atual.disciplina_id).some((p) => p.id !== id && p.nome.toLowerCase() === limpo.toLowerCase())) throw new Error('Já existe uma pasta com esse nome.');
  return { ...estado, pastas: lista(estado).map((p) => (p.id === id ? { ...p, nome: limpo } : p)) };
}

export function excluirPasta(estado, id, agora) {
  if (!ativas(lista(estado)).some((p) => p.id === id)) throw new Error('Pasta não encontrada.');
  return { ...estado, pastas: lista(estado).map((p) => (p.id === id ? { ...p, excluido_em: agora } : p)) };
}

export function restaurarPasta(estado, id) {
  const p = lista(estado).find((x) => x.id === id);
  if (!p || !p.excluido_em) throw new Error('Essa pasta não está na lixeira.');
  return { ...estado, pastas: lista(estado).map((x) => (x.id === id ? { ...x, excluido_em: null } : x)) };
}

/** Põe a aula na pasta (`pastaId` null = tira da pasta). */
export function moverAula(estado, aulaId, pastaId) {
  const aula = ativas(estado.aulas).find((a) => a.id === aulaId);
  if (!aula) throw new Error('Aula não encontrada.');
  if (pastaId != null && !pastasDaMateria(estado, aula.disciplina_id).some((p) => p.id === pastaId)) throw new Error('Essa pasta não é desta matéria.');
  return { ...estado, aulas: estado.aulas.map((a) => (a.id === aulaId ? { ...a, pasta_id: pastaId ?? null } : a)) };
}

export const pastasDaMateria = (estado, disciplinaId) => ativas(lista(estado)).filter((p) => p.disciplina_id === disciplinaId);

/** Aulas de uma pasta (`pastaId` número), ou todas as da matéria (`null`). Aula de pasta excluída só aparece em "todas". Ordem: data, depois título. */
export function aulasDaPasta(estado, disciplinaId, pastaId = null) {
  const vivas = new Set(pastasDaMateria(estado, disciplinaId).map((p) => p.id));
  return ativas(estado.aulas)
    .filter((a) => a.disciplina_id === disciplinaId && (pastaId == null || (a.pasta_id === pastaId && vivas.has(pastaId))))
    .sort((x, y) => (x.inicio ?? '').localeCompare(y.inicio ?? '') || x.titulo.localeCompare(y.titulo));
}

/** Quantas aulas há em cada pasta viva, mais `todas`: { todas, [pastaId]: n }. */
export function contagemPorPasta(estado, disciplinaId) {
  const r = { todas: aulasDaPasta(estado, disciplinaId).length };
  for (const p of pastasDaMateria(estado, disciplinaId)) r[p.id] = aulasDaPasta(estado, disciplinaId, p.id).length;
  return r;
}
