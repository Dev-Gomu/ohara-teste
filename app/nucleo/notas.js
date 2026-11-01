// Núcleo (regras puras, sem I/O): notas e pesos da matéria.
// Matéria → semestre → bimestre → itens avaliados (prova, trabalho, quiz…). Nada das regras fica fixo no código: o "esquema de avaliação"
// (nota mínima, pesos dos semestres e dos bimestres, bônus) vive em `disciplina.notas_cfg` (JSON), por matéria e, como a matéria é do ano,
// por ano. Item = { id, disciplina_id, bimestre (1 a 4), titulo, tipo, peso (relativo), nota (null = pendente), bonus, reposicao_de, origem }.
// Prova faltada fica "pendente": não vale zero, só marca a média como "parcial". A reposição ocupa o lugar do item original.
import { normalizarNome } from './texto.js';
import { ativas, proximoId, LIMITE_NOME } from './materias.js';
import { pastaAtual, ordinalDaPasta, pastasDaMateria } from './pastas.js';

export const TIPOS = { prova: 'Prova', trabalho: 'Trabalho', quiz: 'Quiz', outro: 'Outro' };
export const NOTA_MAXIMA = 10;
const lista = (estado) => estado.avaliacoes ?? [];

/** Esquema padrão: 2 semestres de 2 bimestres, tudo igual, mínimo 7,0, sem bônus. `pesos_bimestre` = peso de cada bimestre dentro do semestre (soma 100). */
export function esquemaPadrao() {
  return { minimo: 7, pesos_semestre: [50, 50], pesos_bimestre: [50, 50, 50, 50], bonus_bimestre: [0, 0, 0, 0], bonus_semestre: [0, 0] };
}

const numero = (v, padrao) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : padrao);
const arranjo = (v, n, padrao) => Array.from({ length: n }, (_, i) => numero(Array.isArray(v) ? v[i] : undefined, padrao[i]));

/** Esquema da matéria (o guardado completado com o padrão, para nunca faltar campo). */
export function esquemaDaMateria(materia) {
  const p = esquemaPadrao();
  let g = {};
  try { g = materia?.notas_cfg ? JSON.parse(materia.notas_cfg) : {}; } catch { g = {}; }
  return {
    minimo: numero(g.minimo, p.minimo),
    pesos_semestre: arranjo(g.pesos_semestre, 2, p.pesos_semestre),
    pesos_bimestre: arranjo(g.pesos_bimestre, 4, p.pesos_bimestre),
    bonus_bimestre: arranjo(g.bonus_bimestre, 4, p.bonus_bimestre),
    bonus_semestre: arranjo(g.bonus_semestre, 2, p.bonus_semestre),
  };
}

const soma = (a) => a.reduce((t, x) => t + x, 0);
const entre = (v, min, max, nome) => { if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${nome} deve ficar entre ${min} e ${max}.`); return v; };

/** Grava o esquema da matéria. Valida: mínimo 0–10, bônus 0–10, pesos positivos e, em cada semestre, bimestres somando 100%. */
export function definirEsquema(estado, disciplinaId, novo) {
  const d = ativas(estado.disciplinas).find((x) => x.id === disciplinaId);
  if (!d) throw new Error('A matéria não existe.');
  const e = { ...esquemaDaMateria(d), ...novo };
  entre(e.minimo, 0, NOTA_MAXIMA, 'A nota mínima');
  for (const b of [...e.bonus_bimestre, ...e.bonus_semestre]) entre(b, 0, NOTA_MAXIMA, 'O bônus');
  for (const p of e.pesos_semestre) entre(p, 1, 100, 'O peso do semestre');
  for (const p of e.pesos_bimestre) entre(p, 1, 99, 'O peso do bimestre');
  for (const s of [0, 1]) if (Math.abs(e.pesos_bimestre[s * 2] + e.pesos_bimestre[s * 2 + 1] - 100) > 1e-6) throw new Error('Os dois bimestres de um semestre precisam somar 100%.');
  return { ...estado, disciplinas: estado.disciplinas.map((x) => (x.id === disciplinaId ? { ...x, notas_cfg: JSON.stringify(e) } : x)) };
}

const limparTitulo = (t) => {
  const l = normalizarNome(t);
  if (!l) throw new Error('Dê um nome ao item.');
  if (l.length > LIMITE_NOME) throw new Error(`O nome pode ter no máximo ${LIMITE_NOME} letras.`);
  return l;
};
const lerNota = (v) => (v === '' || v == null ? null : entre(Number(String(v).replace(',', '.')), 0, NOTA_MAXIMA, 'A nota'));
const lerPeso = (v) => entre(Number(String(v ?? 1).replace(',', '.')), 0.1, 1000, 'O peso');
const lerBonus = (v) => (v === '' || v == null ? 0 : entre(Number(String(v).replace(',', '.')), 0, NOTA_MAXIMA, 'O bônus'));

/** Item novo. `dados` = { bimestre, titulo, tipo, peso, nota, bonus, origem }. Devolve { estado, item }. */
export function criarItem(estado, disciplinaId, dados, agora) {
  if (!ativas(estado.disciplinas).some((d) => d.id === disciplinaId)) throw new Error('A matéria não existe.');
  const bimestre = Number(dados.bimestre);
  if (![1, 2, 3, 4].includes(bimestre)) throw new Error('Escolha o bimestre.');
  const item = {
    id: proximoId(lista(estado)), disciplina_id: disciplinaId, bimestre, titulo: limparTitulo(dados.titulo),
    tipo: Object.hasOwn(TIPOS, dados.tipo) ? dados.tipo : 'prova', peso: lerPeso(dados.peso), nota: lerNota(dados.nota), bonus: lerBonus(dados.bonus),
    reposicao_de: null, origem: dados.origem ?? '', criado_em: agora, excluido_em: null,
  };
  return { estado: { ...estado, avaliacoes: [...lista(estado), item] }, item };
}

/** Altera só o que vier em `dados` (bimestre, titulo, tipo, peso, nota, bonus). Nota vazia = volta a "pendente". */
export function alterarItem(estado, id, dados) {
  const atual = ativas(lista(estado)).find((x) => x.id === id);
  if (!atual) throw new Error('Item não encontrado.');
  const n = { ...atual };
  if ('bimestre' in dados) { if (![1, 2, 3, 4].includes(Number(dados.bimestre))) throw new Error('Escolha o bimestre.'); n.bimestre = Number(dados.bimestre); }
  if ('titulo' in dados) n.titulo = limparTitulo(dados.titulo);
  if ('tipo' in dados && Object.hasOwn(TIPOS, dados.tipo)) n.tipo = dados.tipo;
  if ('peso' in dados) n.peso = lerPeso(dados.peso);
  if ('nota' in dados) n.nota = lerNota(dados.nota);
  if ('bonus' in dados) n.bonus = lerBonus(dados.bonus);
  return { ...estado, avaliacoes: lista(estado).map((x) => (x.id === id ? n : x)) };
}

/** Lança a reposição de um item: uma nota que, quando existe, ocupa o lugar do original. Uma reposição por item (se já há, devolve o mesmo estado com a nota nova). */
export function lancarReposicao(estado, idOriginal, nota, agora) {
  const orig = ativas(lista(estado)).find((x) => x.id === idOriginal && x.reposicao_de == null);
  if (!orig) throw new Error('Item não encontrado.');
  const valor = lerNota(nota);
  const ja = ativas(lista(estado)).find((x) => x.reposicao_de === idOriginal);
  if (ja) return { ...estado, avaliacoes: lista(estado).map((x) => (x.id === ja.id ? { ...x, nota: valor } : x)) };
  const rep = { ...orig, id: proximoId(lista(estado)), titulo: `Reposição de ${orig.titulo}`.slice(0, LIMITE_NOME), nota: valor, bonus: 0, reposicao_de: idOriginal, origem: '', criado_em: agora, excluido_em: null };
  return { ...estado, avaliacoes: [...lista(estado), rep] };
}

export function excluirItem(estado, id, agora) {
  if (!ativas(lista(estado)).some((x) => x.id === id)) throw new Error('Item não encontrado.');
  return { ...estado, avaliacoes: lista(estado).map((x) => (x.id === id || x.reposicao_de === id ? { ...x, excluido_em: x.excluido_em ?? agora } : x)) };
}
export function restaurarItem(estado, id) {
  const it = lista(estado).find((x) => x.id === id);
  if (!it || !it.excluido_em) throw new Error('Esse item não está na lixeira.');
  const t = it.excluido_em;
  return { ...estado, avaliacoes: lista(estado).map((x) => ((x.id === id || (x.reposicao_de === id && x.excluido_em === t)) ? { ...x, excluido_em: null } : x)) };
}

/** Provas da Agenda desta matéria que ainda não viraram item de nota (para "Trazer da Agenda"): { origem, titulo, bimestre, peso }. */
export function provasDaAgenda(estado, disciplinaId) {
  const usadas = new Set(ativas(lista(estado)).filter((x) => x.disciplina_id === disciplinaId).map((x) => x.origem).filter(Boolean));
  const pastas = pastasDaMateria(estado, disciplinaId);
  return ativas(estado.provas ?? []).filter((p) => p.disciplina_id === disciplinaId && !usadas.has(`prova:${p.id}`)).map((p) => ({
    origem: `prova:${p.id}`, titulo: p.titulo, bimestre: ordinalDaPasta(pastas.find((x) => x.id === p.bimestre_id) ?? {}) ?? null, peso: p.peso ?? 1,
  }));
}

/** Média ponderada: [{ w, v, par }]. Quem não tem valor (pendente) fica fora da conta e deixa a média "parcial". */
function ponderar(partes) {
  const com = partes.filter((x) => x.v != null && x.w > 0);
  if (!com.length) return { v: null, par: true };
  const w = soma(com.map((x) => x.w));
  return { v: soma(com.map((x) => x.w * x.v)) / w, par: com.length < partes.length || com.some((x) => x.par) };
}
const comBonus = (a, bonus) => (a.v == null ? a : { ...a, v: Math.min(NOTA_MAXIMA, a.v + (bonus || 0)) });

/** Os itens de um bimestre já com a reposição no lugar do original: [{ id, titulo, tipo, peso, nota (efetiva), bonus, reposicao (bool), origem }]. */
function itensDoBimestre(estado, disciplinaId, bimestre) {
  const todos = ativas(lista(estado)).filter((x) => x.disciplina_id === disciplinaId && x.bimestre === bimestre);
  const reps = new Map(todos.filter((x) => x.reposicao_de != null).map((x) => [x.reposicao_de, x]));
  return todos.filter((x) => x.reposicao_de == null).sort((a, b) => a.id - b.id).map((x) => {
    const r = reps.get(x.id), usaRep = r && r.nota != null;
    return { id: x.id, titulo: x.titulo, tipo: x.tipo, peso: x.peso, nota: usaRep ? r.nota : x.nota, bonus: usaRep ? 0 : x.bonus, reposicao: !!usaRep, origem: x.origem };
  });
}

/** Bimestre atual da matéria (1 a 4) pela pasta com estrela, ou null. */
export const bimestreAtual = (estado, disciplinaId) => { const p = pastaAtual(estado, disciplinaId); const n = p ? ordinalDaPasta(p) : null; return n >= 1 && n <= 4 ? n : null; };

/** Tudo o que a tela mostra, calculado de uma vez. `nota` = null quando não há nada lançado; `parcial` quando falta algum valor. */
export function calcularNotas(estado, disciplinaId) {
  const d = ativas(estado.disciplinas).find((x) => x.id === disciplinaId);
  if (!d) throw new Error('A matéria não existe.');
  const esq = esquemaDaMateria(d), atual = bimestreAtual(estado, disciplinaId);
  const semestres = [0, 1].map((s) => {
    const bimestres = [0, 1].map((k) => {
      const n = s * 2 + k + 1, itens = itensDoBimestre(estado, disciplinaId, n), pesoTotal = soma(itens.map((i) => i.peso));
      const m = comBonus(ponderar(itens.map((i) => ({ w: i.peso, v: i.nota == null ? null : Math.min(NOTA_MAXIMA, i.nota + i.bonus) }))), esq.bonus_bimestre[n - 1]);
      return { n, peso: esq.pesos_bimestre[n - 1], media: m.v, parcial: m.par, bonus: esq.bonus_bimestre[n - 1], atual: atual === n,
        itens: itens.map((i) => ({ ...i, pct: pesoTotal ? (i.peso / pesoTotal) * 100 : 0 })) };
    });
    const m = comBonus(ponderar(bimestres.map((b) => ({ w: b.peso, v: b.media, par: b.parcial }))), esq.bonus_semestre[s]);
    return { n: s + 1, peso: esq.pesos_semestre[s], media: m.v, parcial: m.par, bonus: esq.bonus_semestre[s], atual: atual != null && Math.ceil(atual / 2) === s + 1, bimestres };
  });
  const ano = ponderar(semestres.map((s) => ({ w: s.peso, v: s.media, par: s.parcial })));
  return { minimo: esq.minimo, esquema: esq, atual, semestres, ano: { media: ano.v, parcial: ano.par }, preciso: precisoNoSegundo(semestres, esq) };
}

/**
 * "Preciso de X no 2º semestre": a nota que o 2º semestre precisa ter para a média do ano chegar ao mínimo, com os pesos do esquema
 * (padrão 50/50: 2 × mínimo − média do 1º). { valor (arredondado para cima, 1 casa), situacao: 'ok' (já garantido) | 'precisa' | 'dificil' (acima de 10) | 'sem-base' }.
 */
export function precisoNoSegundo(semestres, esq) {
  const m1 = semestres[0].media;
  if (m1 == null) return { valor: null, situacao: 'sem-base' };
  const [w1, w2] = esq.pesos_semestre, bruto = (esq.minimo * (w1 + w2) - w1 * m1) / w2;
  const valor = Math.ceil(bruto * 10 - 1e-9) / 10;
  if (bruto <= 0) return { valor: 0, situacao: 'ok' };
  return { valor, situacao: valor > NOTA_MAXIMA ? 'dificil' : 'precisa' };
}

/** Nota para a tela: 1 casa, vírgula; null vira "—". */
export const formatarNota = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
