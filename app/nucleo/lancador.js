// Núcleo (regras puras, sem I/O): a busca do "Ir para…" (lançador). Acha telas, matérias e aulas digitando só um pedaço.
import { ativas } from './materias.js';

export const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** 0 = não casa; quanto maior, melhor: começa com > começa uma palavra > contém (mais perto do início) > letras na ordem. */
export function pontuar(texto, consulta) {
  const t = semAcento(texto), q = semAcento(consulta).trim();
  if (!q) return 1;
  if (t.startsWith(q)) return 100;
  if (t.includes(' ' + q)) return 80;
  const i = t.indexOf(q);
  if (i >= 0) return Math.max(40, 70 - i);
  let k = 0; for (const c of t) if (c === q[k]) k++;
  return k === q.length ? 20 : 0;
}

/** Itens do lançador: telas fixas, matérias, aulas e ações. `hash` leva a uma tela; `acao` pede algo à casca. */
export function itensDoLancador(estado) {
  const mats = ativas(estado.disciplinas), porId = new Map(mats.map((m) => [m.id, m]));
  const telas = [['Hoje', '#hoje', 'Alt 1'], ['Matérias', '#materias', 'Alt 2'], ['Sala de Foco', '#foco', 'Alt 3'], ['Planejar', '#planejar', 'Alt 4'], ['Painel', '#painel', 'Alt 5'], ['Cartões', '#cartoes', 'Alt 6'], ['Ajustes', '#ajustes', 'Alt 7']]
    .map(([titulo, hash, atalho]) => ({ tipo: 'tela', titulo, detalhe: atalho, hash }));
  const materias = mats.map((m) => ({ tipo: 'matéria', titulo: m.nome, detalhe: 'matéria', hash: `#materias/${m.id}` }));
  const aulas = ativas(estado.aulas).filter((a) => porId.has(a.disciplina_id)).sort((x, y) => (y.inicio ?? '').localeCompare(x.inicio ?? ''))
    .map((a) => ({ tipo: 'aula', titulo: a.titulo, detalhe: `${porId.get(a.disciplina_id).nome}${a.inicio ? ' · ' + a.inicio.slice(8, 10) + '/' + a.inicio.slice(5, 7) : ''}`, hash: `#aula/${a.id}` }));
  const acoes = [{ tipo: 'ação', titulo: 'Fixar ou soltar a barra lateral', detalhe: 'Alt B', acao: 'barra' }, { tipo: 'ação', titulo: 'Tela cheia de foco', detalhe: 'Alt Enter', acao: 'foco' }, { tipo: 'ação', titulo: 'Atalhos do teclado', detalhe: '?', acao: 'ajuda' }];
  return [...telas, ...materias, ...aulas, ...acoes];
}

/** Os melhores itens para a consulta (título vale mais que detalhe). Sem consulta, devolve as telas e ações primeiro. */
export function filtrar(itens, consulta, limite = 9) {
  const q = String(consulta ?? '').trim();
  const pontos = itens.map((it, ordem) => ({ it, ordem, p: Math.max(pontuar(it.titulo, q), pontuar(it.detalhe, q) / 2) }));
  const ok = q ? pontos.filter((x) => x.p > 0) : pontos.filter((x) => x.it.tipo !== 'aula');
  return ok.sort((a, b) => b.p - a.p || a.ordem - b.ordem).slice(0, limite).map((x) => x.it);
}
