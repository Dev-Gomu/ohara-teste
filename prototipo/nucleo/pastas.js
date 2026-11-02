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
  const pasta = { id: proximoId(lista(estado)), disciplina_id: disciplinaId, nome: limpo, estrela: 0, criado_em: agora, excluido_em: null };
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

// ---------- bimestre atual (estrela) ----------
// Cada matéria pode ter UMA pasta com estrela: o bimestre em que ela está agora. Aulas novas caem nela e a prova a usa como padrão.
// A ordem das pastas é a ordem de criação (o botão "Iniciar novo bimestre" cria na ordem certa).
const ORDINAL = /^(\d+)º Bimestre$/i;
const nomeDoBimestre = (n) => `${n}º Bimestre`;
export const ordinalDaPasta = (p) => { const m = ORDINAL.exec(p.nome ?? ''); return m ? Number(m[1]) : null; };

/** A pasta com estrela da matéria, ou null. */
export const pastaAtual = (estado, disciplinaId) => pastasDaMateria(estado, disciplinaId).find((p) => p.estrela) ?? null;

/** Põe a estrela na pasta (e tira das outras da mesma matéria). `pastaId` null não mexe; use `tirarEstrela`. */
export function marcarEstrela(estado, pastaId) {
  const alvo = ativas(lista(estado)).find((p) => p.id === pastaId);
  if (!alvo) throw new Error('Pasta não encontrada.');
  return { ...estado, pastas: lista(estado).map((p) => (p.disciplina_id === alvo.disciplina_id ? { ...p, estrela: p.id === pastaId ? 1 : 0 } : p)) };
}
export function tirarEstrela(estado, disciplinaId) {
  return { ...estado, pastas: lista(estado).map((p) => (p.disciplina_id === disciplinaId ? { ...p, estrela: 0 } : p)) };
}

/** Cria "1º Bimestre" … "4º Bimestre" que ainda não existem na matéria; se não havia estrela, o 1º que existir ganha. Nunca apaga nem renomeia nada. */
export function criarBimestres(estado, disciplinaId, agora, quantos = 4) {
  let e = estado;
  for (let n = 1; n <= quantos; n++) {
    if (!pastasDaMateria(e, disciplinaId).some((p) => p.nome.toLowerCase() === nomeDoBimestre(n).toLowerCase())) e = criarPasta(e, disciplinaId, nomeDoBimestre(n), agora).estado;
  }
  if (!pastaAtual(e, disciplinaId)) { const primeira = pastasDaMateria(e, disciplinaId).find((p) => ordinalDaPasta(p) === 1); if (primeira) e = marcarEstrela(e, primeira.id); }
  return e;
}

const materiasDoAno = (estado) => ativas(estado.disciplinas).filter((d) => d.ano_id == null);

/** O bimestre em que a maioria das matérias do ano está (pelo nome da pasta com estrela), ex.: "2º Bimestre"; null se ninguém tem estrela. */
export function bimestreAtualGeral(estado) {
  const cont = new Map();
  for (const d of materiasDoAno(estado)) { const p = pastaAtual(estado, d.id); if (p) cont.set(p.nome, (cont.get(p.nome) ?? 0) + 1); }
  return [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** Nomes de pasta que existem em alguma matéria do ano, na ordem dos bimestres (para o filtro do Acervo). */
export function bimestresDoAno(estado) {
  const nomes = new Set();
  for (const d of materiasDoAno(estado)) for (const p of pastasDaMateria(estado, d.id)) nomes.add(p.nome);
  return [...nomes].sort((a, b) => (ordinalDaPasta({ nome: a }) ?? 99) - (ordinalDaPasta({ nome: b }) ?? 99) || a.localeCompare(b));
}

/**
 * "Iniciar novo bimestre": em todas as matérias do ano atual cria (ou reaproveita) a pasta do próximo bimestre e passa a estrela para ela.
 * O número é o maior bimestre com estrela + 1 (ou 1, se ninguém tem estrela ainda). Devolve { estado, nome, materias }.
 */
export function iniciarNovoBimestre(estado, agora) {
  const mats = materiasDoAno(estado);
  if (!mats.length) throw new Error('Crie uma matéria primeiro.');
  const estrelas = mats.map((d) => pastaAtual(estado, d.id)).filter(Boolean).map(ordinalDaPasta).filter((n) => n != null);
  const novo = (estrelas.length ? Math.max(...estrelas) : 0) + 1, nome = nomeDoBimestre(novo);
  let e = estado;
  for (const d of mats) {
    let pasta = pastasDaMateria(e, d.id).find((p) => p.nome.toLowerCase() === nome.toLowerCase());
    if (!pasta) { const r = criarPasta(e, d.id, nome, agora); e = r.estado; pasta = r.pasta; }
    e = marcarEstrela(e, pasta.id);
  }
  return { estado: e, nome, materias: mats.length };
}

/** Pastas da matéria da primeira até `pastaId`, na ordem de criação ("Marcar do 1º até aqui"). */
export function pastasAteAqui(estado, disciplinaId, pastaId) {
  const todas = pastasDaMateria(estado, disciplinaId).sort((a, b) => a.id - b.id), i = todas.findIndex((p) => p.id === pastaId);
  return i < 0 ? [] : todas.slice(0, i + 1).map((p) => p.id);
}
