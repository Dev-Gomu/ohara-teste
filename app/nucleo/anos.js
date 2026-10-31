// Núcleo (regras puras, sem I/O): anos letivos. "Encerrar o ano" arquiva todas as matérias de hoje num grupo com nome (ex.: "2º ano de
// medicina"): `disciplina.ano_id` aponta para o ano; sem `ano_id` = ano atual. As matérias arquivadas saem das telas do dia a dia
// (`visivel`), mas continuam no Acervo, só para consulta, e dá para reabrir o ano. Nada é apagado.
import { normalizarNome } from './texto.js';
import { ativas, proximoId, LIMITE_NOME } from './materias.js';

const lista = (estado) => estado.anos ?? [];
const vivas = (estado) => ativas(estado.disciplinas).filter((d) => d.ano_id == null);

export const anosEncerrados = (estado) => ativas(lista(estado));
export const materiasDoAnoAtual = vivas;
export const materiasDoAno = (estado, anoId) => ativas(estado.disciplinas).filter((d) => d.ano_id === anoId);

export function encerrarAno(estado, nome, agora) {
  const limpo = normalizarNome(nome);
  if (!limpo) throw new Error('Dê um nome ao ano.');
  if (limpo.length > LIMITE_NOME) throw new Error(`O nome pode ter no máximo ${LIMITE_NOME} letras.`);
  const alvo = new Set(vivas(estado).map((d) => d.id));
  if (!alvo.size) throw new Error('Não há matérias no ano atual para encerrar.');
  if (anosEncerrados(estado).some((a) => a.nome.toLowerCase() === limpo.toLowerCase())) throw new Error('Já existe um ano com esse nome.');
  const ano = { id: proximoId(lista(estado)), nome: limpo, criado_em: agora, excluido_em: null };
  return { estado: { ...estado, anos: [...lista(estado), ano], disciplinas: estado.disciplinas.map((d) => (alvo.has(d.id) ? { ...d, ano_id: ano.id } : d)) }, ano };
}

/** As matérias do ano voltam para o ano atual e o ano deixa de existir. Recusa se algum nome já estiver em uso no ano atual. */
export function reabrirAno(estado, anoId) {
  if (!anosEncerrados(estado).some((a) => a.id === anoId)) throw new Error('Ano não encontrado.');
  const nomes = new Set(vivas(estado).map((d) => d.nome.toLowerCase()));
  const repetida = materiasDoAno(estado, anoId).find((d) => nomes.has(d.nome.toLowerCase()));
  if (repetida) throw new Error(`O ano atual já tem a matéria "${repetida.nome}". Renomeie uma das duas antes de reabrir.`);
  return { ...estado, anos: lista(estado).map((a) => (a.id === anoId ? { ...a, excluido_em: new Date(0).toISOString() } : a)), disciplinas: estado.disciplinas.map((d) => (d.ano_id === anoId ? { ...d, ano_id: null } : d)) };
}

export function renomearAno(estado, id, nome) {
  const limpo = normalizarNome(nome);
  if (!limpo) throw new Error('Dê um nome ao ano.');
  if (limpo.length > LIMITE_NOME) throw new Error(`O nome pode ter no máximo ${LIMITE_NOME} letras.`);
  if (!anosEncerrados(estado).some((a) => a.id === id)) throw new Error('Ano não encontrado.');
  if (anosEncerrados(estado).some((a) => a.id !== id && a.nome.toLowerCase() === limpo.toLowerCase())) throw new Error('Já existe um ano com esse nome.');
  return { ...estado, anos: lista(estado).map((a) => (a.id === id ? { ...a, nome: limpo } : a)) };
}

/** Números do ano (ou do atual, com `anoId` null): matérias, aulas e cartões. */
export function resumoDoAno(estado, anoId = null) {
  const ds = anoId == null ? vivas(estado) : materiasDoAno(estado, anoId), ids = new Set(ds.map((d) => d.id));
  const aulas = ativas(estado.aulas).filter((a) => ids.has(a.disciplina_id)), aulaIds = new Set(aulas.map((a) => a.id));
  return { materias: ds.length, aulas: aulas.length, cartoes: ativas(estado.cartoes ?? []).filter((c) => aulaIds.has(c.aula_id)).length };
}

export const aulaArquivada = (estado, aulaId) => {
  const a = estado.aulas.find((x) => x.id === aulaId), d = a && estado.disciplinas.find((x) => x.id === a.disciplina_id);
  return !!d && d.ano_id != null;
};

/**
 * O estado que as telas do dia a dia enxergam: sem as matérias arquivadas e tudo o que é delas. Sem nada arquivado devolve o MESMO
 * objeto (identidade estável). O histórico de estudo (blocos de foco) não é filtrado: a sequência de dias continua contando.
 */
export function visivel(estado) {
  const fora = new Set(estado.disciplinas.filter((d) => d.ano_id != null).map((d) => d.id));
  if (!fora.size) return estado;
  const aulasFora = new Set(estado.aulas.filter((a) => fora.has(a.disciplina_id)).map((a) => a.id));
  const sem = (l, campo, conj) => (l ?? []).filter((x) => !conj.has(x[campo]));
  return {
    ...estado,
    disciplinas: estado.disciplinas.filter((d) => !fora.has(d.id)),
    aulas: estado.aulas.filter((a) => !aulasFora.has(a.id)),
    arquivos: sem(estado.arquivos, 'aula_id', aulasFora), marcadores: sem(estado.marcadores, 'aula_id', aulasFora), cartoes: sem(estado.cartoes, 'aula_id', aulasFora),
    provas: sem(estado.provas, 'disciplina_id', fora), tarefas: sem(estado.tarefas, 'disciplina_id', fora), pastas: sem(estado.pastas, 'disciplina_id', fora),
  };
}
