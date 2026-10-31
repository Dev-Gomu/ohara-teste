// Núcleo (regras puras, sem I/O): o que a tela Hoje mostra no calendário de semanas, nas próximas provas e na agenda compacta.
// Datas são texto "AAAA-MM-DD"; horários, minutos desde 00:00.
import { ativas } from './materias.js';
import { provasFuturas } from './planejador.js';
import { somarDias, diasEntre, inicioDaSemana } from './datas.js';
import { aulasDoDia } from './linhadia.js';

export const SEMANAS_PADRAO = 6;

/**
 * Janela do calendário: `semanas` semanas inteiras (segunda a domingo) a partir da semana de `hoje` (mais `deslocamento` semanas).
 * Cada dia: { dia, n, hoje, passado, primeiroDoMes, mes, provas: [disciplina_id, …] }, com as provas ativas daquele dia (uma entrada por prova).
 * `semana: 0` marca a semana de hoje.
 */
export function janelaDeSemanas(estado, hoje, { semanas = SEMANAS_PADRAO, deslocamento = 0 } = {}) {
  const ini = somarDias(inicioDaSemana(hoje), deslocamento * 7);
  const porDia = new Map();
  for (const p of ativas(estado.provas ?? [])) { if (!porDia.has(p.data)) porDia.set(p.data, []); porDia.get(p.data).push(p.disciplina_id); }
  const ativasIds = new Set(ativas(estado.disciplinas).map((d) => d.id));
  const linhas = [];
  for (let s = 0; s < semanas; s++) {
    const dias = [];
    for (let k = 0; k < 7; k++) {
      const dia = somarDias(ini, s * 7 + k), n = Number(dia.slice(8, 10)), mes = Number(dia.slice(5, 7));
      dias.push({ dia, n, mes, hoje: dia === hoje, passado: dia < hoje, primeiroDoMes: n === 1, provas: (porDia.get(dia) ?? []).filter((id) => ativasIds.has(id)) });
    }
    linhas.push({ atual: dias.some((d) => d.hoje), dias });
  }
  return linhas;
}

/** "hoje", "amanhã" ou "em N dias" (N ≥ 2); dias passados viram "há N dias". */
export function textoDias(n) {
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}

/**
 * Próximas provas agrupadas por data: [{ dia, n, mes, disciplinas: [id, …], em: dias até a data, texto }]. Só de matérias ativas.
 * `limite` corta o número de DATAS (não de provas); `total` diz quantas datas existem.
 */
export function proximasProvasPorData(estado, hoje, limite = 5) {
  const ativasIds = new Set(ativas(estado.disciplinas).map((d) => d.id));
  const grupos = new Map();
  for (const p of provasFuturas(estado, hoje)) {
    if (!ativasIds.has(p.disciplina_id)) continue;
    if (!grupos.has(p.data)) grupos.set(p.data, []);
    grupos.get(p.data).push(p.disciplina_id);
  }
  const todas = [...grupos].map(([dia, disciplinas]) => { const em = diasEntre(hoje, dia); return { dia, n: Number(dia.slice(8, 10)), mes: Number(dia.slice(5, 7)), disciplinas, em, texto: textoDias(em) }; });
  return { datas: todas.slice(0, limite), total: todas.length };
}

/**
 * Agenda compacta do dia: cada aula é UM bloco (a duração só aparece no horário). Devolve itens em ordem:
 * { tipo: 'aula', id, disciplina_id, titulo, ini, fim, situacao: 'passou' | 'agora' | 'depois', fracao (0 a 1 dentro da aula atual, senão null) }
 * e { tipo: 'livre', ini, fim } entre duas aulas separadas por pelo menos `livreMin` minutos.
 * `marcadorEntre`: se o agora cai numa lacuna (ou antes da primeira aula / depois da última), o índice do item DEPOIS do qual o marcador fica (−1 = antes de todos).
 */
export function agendaCompacta(estado, hoje, agoraMin, { livreMin = 45 } = {}) {
  const aulas = aulasDoDia(estado, hoje), itens = [];
  aulas.forEach((a, i) => {
    if (i > 0 && a.ini - aulas[i - 1].fim >= livreMin) itens.push({ tipo: 'livre', ini: aulas[i - 1].fim, fim: a.ini });
    const situacao = a.fim <= agoraMin ? 'passou' : a.ini <= agoraMin ? 'agora' : 'depois';
    itens.push({ tipo: 'aula', id: a.id, disciplina_id: a.disciplina_id, titulo: a.titulo, ini: a.ini, fim: a.fim, situacao, fracao: situacao === 'agora' ? (agoraMin - a.ini) / (a.fim - a.ini) : null });
  });
  let marcadorEntre = null;
  if (!itens.some((x) => x.tipo === 'aula' && x.situacao === 'agora')) {
    marcadorEntre = -1;
    itens.forEach((x, i) => { if (x.fim <= agoraMin) marcadorEntre = i; });
  }
  return { itens, marcadorEntre };
}

/** Primeiro dia depois de `hoje` (até `limite` dias à frente) que tem aula; null se não houver. Usado quando hoje não tem aula. */
export function proximoDiaComAula(estado, hoje, limite = 30) {
  for (let i = 1; i <= limite; i++) { const d = somarDias(hoje, i); if (aulasDoDia(estado, d).length) return d; }
  return null;
}

// Medidas da agenda compacta (px): precisam bater com estilos/telas/hoje.css para o marcador de agora cair no lugar certo.
export const ALTURA_AULA = 46, ALTURA_LIVRE = 28, VAO = 6;

/** Posição (px, a partir do topo da lista) do marcador de agora, dado o resultado de `agendaCompacta`. Dentro da aula atual ele anda na proporção do tempo; numa lacuna "livre", também. */
export function posicaoDoMarcador({ itens, marcadorEntre }, agoraMin) {
  let y = 0; const topos = [];
  for (const it of itens) { topos.push(y); y += (it.tipo === 'livre' ? ALTURA_LIVRE : ALTURA_AULA) + VAO; }
  const atual = itens.findIndex((x) => x.tipo === 'aula' && x.situacao === 'agora');
  if (atual >= 0) return topos[atual] + ALTURA_AULA * itens[atual].fracao;
  if (marcadorEntre === -1) return -VAO / 2;
  const prox = itens[marcadorEntre + 1];
  if (prox && prox.tipo === 'livre' && agoraMin >= prox.ini && agoraMin < prox.fim) return topos[marcadorEntre + 1] + ALTURA_LIVRE * ((agoraMin - prox.ini) / (prox.fim - prox.ini));
  return topos[marcadorEntre] + (itens[marcadorEntre].tipo === 'livre' ? ALTURA_LIVRE : ALTURA_AULA) + VAO / 2;
}
