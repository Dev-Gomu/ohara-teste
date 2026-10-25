// Núcleo (regras puras, sem I/O): Planejador. Entrada: provas, aulas, dificuldade por matéria, horas disponíveis por dia da
// semana. Saída: tarefas do plano (estudo para prova e revisões em 1, 7 e 30 dias), uma lista que o app guarda e reconcilia a cada dia.
//
// Regra do estudo para prova: cada aula que cai na prova pede 1, 2 ou 3 blocos conforme a dificuldade da matéria (1 a 3).
// Os blocos vão para os dias entre hoje (ou o dia depois da aula) e a véspera da prova, respeitando as horas disponíveis,
// espaçados e puxados para perto da prova (os dias mais próximos ficam mais cheios). O que não cabe fica na última vaga e é marcado `sem_vaga`.
// Atrasos: o que não foi feito é replanejado a partir de hoje, sempre antes da prova.
import { somarDias, diasEntre, diaDaSemana } from './datas.js';
import { normalizarNome } from './texto.js';
import { ativas } from './materias.js';

export const DISPONIBILIDADE_PADRAO = [120, 120, 120, 120, 120, 60, 0];   // segunda … domingo, em minutos
export const REVISOES_DIAS = [1, 7, 30];
export const MIN_REVISAO = 15;
export const MIN_BLOCO = 25;
export const ATRASO_MAXIMO_REVISAO = 14;   // revisão atrasada há mais de 14 dias deixa de ser cobrada

export function validarDisponibilidade(lista) {
  if (!Array.isArray(lista) || lista.length !== 7 || lista.some((n) => !Number.isInteger(n) || n < 0 || n > 1440)) throw new Error('Informe os minutos de cada dia da semana (0 a 1440).');
  return lista;
}

export function lerDisponibilidade(texto) {
  try { return validarDisponibilidade(JSON.parse(texto)); } catch { return [...DISPONIBILIDADE_PADRAO]; }
}

// ---------- provas ----------
export function criarProva(estado, { disciplinaId, titulo, data, aulas = [] }, agora) {
  if (!ativas(estado.disciplinas).some((d) => d.id === disciplinaId)) throw new Error('A matéria não existe.');
  const t = normalizarNome(titulo) || 'Prova';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '') || Number.isNaN(Date.parse(data))) throw new Error('Informe a data da prova.');
  const doDisc = new Set(ativas(estado.aulas).filter((a) => a.disciplina_id === disciplinaId).map((a) => a.id));
  const ids = [...new Set(aulas)].filter((id) => doDisc.has(id));
  const prova = { id: (estado.provas ?? []).reduce((m, p) => Math.max(m, p.id), 0) + 1, disciplina_id: disciplinaId, titulo: t.slice(0, 80), data, aulas: JSON.stringify(ids), criado_em: agora, excluido_em: null };
  return { estado: { ...estado, provas: [...(estado.provas ?? []), prova] }, prova };
}
export const aulasDaProva = (p) => { try { return JSON.parse(p.aulas); } catch { return []; } };

export function alterarProva(estado, id, { titulo, data, aulas }) {
  const atual = (estado.provas ?? []).find((p) => p.id === id && !p.excluido_em);
  if (!atual) throw new Error('Prova não encontrada.');
  const { estado: e2, prova } = criarProva({ ...estado, provas: [] }, { disciplinaId: atual.disciplina_id, titulo: titulo ?? atual.titulo, data: data ?? atual.data, aulas: aulas ?? aulasDaProva(atual) }, atual.criado_em);
  return { ...estado, provas: estado.provas.map((p) => (p.id === id ? { ...prova, id, criado_em: atual.criado_em } : p)) };
}
export function excluirProva(estado, id, agora) {
  if (!(estado.provas ?? []).some((p) => p.id === id && !p.excluido_em)) throw new Error('Prova não encontrada.');
  return { ...estado, provas: estado.provas.map((p) => (p.id === id ? { ...p, excluido_em: agora } : p)) };
}
export function restaurarProva(estado, id) {
  const p = (estado.provas ?? []).find((x) => x.id === id);
  if (!p || !p.excluido_em) throw new Error('Essa prova não está na lixeira.');
  return { ...estado, provas: estado.provas.map((x) => (x.id === id ? { ...x, excluido_em: null } : x)) };
}
export const provasFuturas = (estado, hoje) => ativas(estado.provas ?? []).filter((p) => p.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));

// ---------- necessidades do plano ----------
const blocosPorDificuldade = (d) => ({ 1: 1, 2: 2, 3: 3 })[d ?? 2] ?? 2;

/**
 * O que o plano pede, sem datas de execução: revisões com dia fixo e blocos de estudo com janela.
 * `inicioUso`: aulas anteriores a essa data não geram revisões (não cria dívida de um passado que o app não viu).
 */
export function necessidades(estado, hoje, inicioUso = null) {
  const nec = [];
  const mats = new Map(ativas(estado.disciplinas).map((d) => [d.id, d]));
  const aulas = ativas(estado.aulas).filter((a) => mats.has(a.disciplina_id));
  const aulasPorId = new Map(aulas.map((a) => [a.id, a]));
  for (const a of aulas) {
    if (a.tipo !== 'aula' || !a.inicio) continue;
    const dia = a.inicio.slice(0, 10);
    if (inicioUso && dia < inicioUso) continue;
    for (const n of REVISOES_DIAS) {
      const quando = somarDias(dia, n);
      if (diasEntre(quando, hoje) > ATRASO_MAXIMO_REVISAO) continue;
      nec.push({ chave: `rev|${a.id}|${n}`, tipo: 'revisao', disciplina_id: a.disciplina_id, aula_id: a.id, prova_id: null, titulo: `Revisão de ${n} ${n === 1 ? 'dia' : 'dias'} · ${a.titulo}`, minutos: MIN_REVISAO, dia: quando });
    }
  }
  for (const p of provasFuturas(estado, hoje)) {
    const mat = mats.get(p.disciplina_id); if (!mat) continue;
    for (const id of aulasDaProva(p)) {
      const a = aulasPorId.get(id); if (!a) continue;
      const depoisDaAula = a.inicio ? somarDias(a.inicio.slice(0, 10), 1) : hoje;
      for (let n = 1; n <= blocosPorDificuldade(mat.dificuldade); n++) {
        nec.push({ chave: `est|${p.id}|${a.id}|${n}`, tipo: 'estudo', disciplina_id: mat.id, aula_id: a.id, prova_id: p.id, titulo: `Estudar · ${a.titulo}${blocosPorDificuldade(mat.dificuldade) > 1 ? ` (${n}/${blocosPorDificuldade(mat.dificuldade)})` : ''}`, minutos: MIN_BLOCO, de: depoisDaAula > hoje ? depoisDaAula : hoje, ate: somarDias(p.data, -1), prova: p.data, j: n, k: blocosPorDificuldade(mat.dificuldade) });
      }
    }
  }
  return nec;
}

/**
 * Distribui blocos de estudo pelos dias; devolve Map chave → { dia, sem_vaga }. `capacidade(dia)` = minutos livres.
 * Os `k` blocos de uma mesma aula ficam espaçados na janela (estudo espaçado) e a posição ideal de cada um é puxada para
 * perto da prova (expoente 0,6): com muitos blocos, os dias próximos da prova ficam mais cheios. Se o dia ideal não tem
 * folga, usa o vizinho mais próximo (o posterior primeiro).
 */
function distribuir(blocos, capacidade) {
  const resultado = new Map(), usado = new Map();
  const livre = (dia) => capacidade(dia) - (usado.get(dia) ?? 0);
  for (const b of blocos) {
    if (b.ate < b.de) { resultado.set(b.chave, { dia: b.de, sem_vaga: true }); usado.set(b.de, (usado.get(b.de) ?? 0) + b.minutos); continue; }
    const n = diasEntre(b.de, b.ate) + 1;
    const alvo = Math.min(n - 1, Math.round(Math.pow((b.j - 0.5) / b.k, 0.6) * (n - 1)));
    let escolhido = null;
    for (let d = 0; d < n && !escolhido; d++) {
      for (const i of d === 0 ? [alvo] : [alvo + d, alvo - d]) {
        if (i < 0 || i >= n) continue;
        const dia = somarDias(b.de, i);
        if (livre(dia) >= b.minutos) { escolhido = dia; break; }
      }
    }
    if (escolhido) { resultado.set(b.chave, { dia: escolhido, sem_vaga: false }); usado.set(escolhido, (usado.get(escolhido) ?? 0) + b.minutos); }
    else { resultado.set(b.chave, { dia: b.ate, sem_vaga: true }); usado.set(b.ate, (usado.get(b.ate) ?? 0) + b.minutos); }
  }
  return resultado;
}

/**
 * Reconcilia o plano guardado com o que o plano pede hoje. Mantém o que já foi feito; replaneja o que falta
 * (atrasos incluídos); remove o que não é mais pedido (prova apagada, aula apagada). Devolve a lista nova de tarefas.
 */
export function reconciliarPlano(estado, hoje, disponibilidade, inicioUso, agora) {
  const existentes = estado.tarefas ?? [], porChave = new Map(existentes.map((t) => [t.chave, t]));
  const nec = necessidades(estado, hoje, inicioUso), pedidas = new Set(nec.map((n) => n.chave));
  let proximoId = existentes.reduce((m, t) => Math.max(m, t.id), 0) + 1;
  const resultado = existentes.filter((t) => t.feita_em && !t.excluido_em);    // feitas ficam como estão
  const feitas = new Set(resultado.map((t) => t.chave));
  const pendentes = nec.filter((n) => !feitas.has(n.chave));

  // revisões: dia fixo; atrasadas passam para hoje
  const revisoes = pendentes.filter((n) => n.tipo === 'revisao').map((n) => ({ ...n, dia_planejado: n.dia < hoje ? hoje : n.dia }));
  const cap = (dia) => Math.max(0, (disponibilidade[diaDaSemana(dia)] ?? 0) - revisoes.filter((r) => r.dia_planejado === dia).reduce((s, r) => s + r.minutos, 0)
    - resultado.filter((t) => t.dia === dia && t.tipo === 'estudo' && !t.feita_em).reduce((s, t) => s + t.minutos, 0));
  // mesmo dia já cumprido conta como uso da capacidade
  const feitoNoDia = (dia) => resultado.filter((t) => t.feita_em && t.feita_em.slice(0, 10) === dia).reduce((s, t) => s + t.minutos, 0);
  const capacidade = (dia) => Math.max(0, cap(dia) - feitoNoDia(dia));
  const estudo = pendentes.filter((n) => n.tipo === 'estudo').sort((a, b) => a.prova.localeCompare(b.prova) || a.chave.localeCompare(b.chave, 'pt', { numeric: true }));
  const dist = distribuir(estudo, capacidade);

  const montar = (n, dia, sem_vaga) => {
    const antiga = porChave.get(n.chave);
    return { id: antiga?.id ?? proximoId++, chave: n.chave, tipo: n.tipo, disciplina_id: n.disciplina_id, aula_id: n.aula_id, prova_id: n.prova_id, titulo: n.titulo,
      minutos: n.minutos, dia, dia_original: antiga?.dia_original ?? (n.tipo === 'revisao' ? n.dia : dia), sem_vaga: sem_vaga ? 1 : 0, feita_em: null, criado_em: antiga?.criado_em ?? agora, excluido_em: null };
  };
  for (const r of revisoes) resultado.push(montar(r, r.dia_planejado, false));
  for (const n of estudo) { const d = dist.get(n.chave); resultado.push(montar(n, d.dia, d.sem_vaga)); }
  return resultado.sort((a, b) => a.dia.localeCompare(b.dia) || a.id - b.id);
}

export const planoMudou = (antes, depois) => JSON.stringify(antes ?? []) !== JSON.stringify(depois);

export function marcarTarefaFeita(estado, tarefaId, agora) {
  if (!(estado.tarefas ?? []).some((t) => t.id === tarefaId)) throw new Error('Tarefa não encontrada.');
  return { ...estado, tarefas: estado.tarefas.map((t) => (t.id === tarefaId ? { ...t, feita_em: agora } : t)) };
}
export function desmarcarTarefa(estado, tarefaId) {
  return { ...estado, tarefas: estado.tarefas.map((t) => (t.id === tarefaId ? { ...t, feita_em: null } : t)) };
}

/** Tarefas pendentes do dia (inclui as atrasadas, que já foram replanejadas para hoje) e as feitas hoje. */
export function tarefasDoDia(estado, dia) {
  const t = estado.tarefas ?? [];
  return { pendentes: t.filter((x) => !x.feita_em && x.dia === dia), feitas: t.filter((x) => x.feita_em && x.feita_em.slice(0, 10) === dia), atrasadas: t.filter((x) => !x.feita_em && x.dia === dia && x.dia_original < dia) };
}
