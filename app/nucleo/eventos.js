// Núcleo (regras puras, sem I/O): itens da Agenda além da prova — trabalho, compromisso e lembrete — e a visão que junta tudo.
// Mesmo estado e mesma convenção de materias.js: cada função devolve um estado novo e nunca altera o recebido; exclusão = lixeira.
// A prova continua em planejador.js (baralhos e plano dependem dela); aqui está o que só a Agenda enxerga.

import { normalizarNome } from './texto.js';
import { ativas, proximoId } from './materias.js';
import { camposDaAgenda, aulasDaProva, criarProva, alterarProva, excluirProva, restaurarProva } from './planejador.js';
import { somarDias } from './datas.js';

export const TIPOS_EVENTO = ['trabalho', 'compromisso', 'lembrete'];
const FREQUENCIAS = ['semanal', 'mensal'];
const lista = (estado) => estado.eventos ?? [];
const DIA = /^\d{4}-\d{2}-\d{2}$/, HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function repeticao(repete, tipo, data) {
  if (!repete) return '';
  if (tipo !== 'compromisso') throw new Error('Só compromisso pode se repetir.');
  if (!data) throw new Error('Para repetir, informe a data do primeiro dia.');
  const { freq, ate = null } = typeof repete === 'string' ? JSON.parse(repete) : repete;
  if (!FREQUENCIAS.includes(freq)) throw new Error('Repetição inválida: use semanal ou mensal.');
  if (ate !== null && (!DIA.test(ate) || ate < data)) throw new Error('A data final da repetição não pode ser antes do início.');
  return JSON.stringify({ freq, ate });
}

function validar(estado, dados) {
  const { tipo, disciplinaId = null, titulo, horaFim } = dados;
  if (!TIPOS_EVENTO.includes(tipo)) throw new Error('Tipo inválido: use trabalho, compromisso ou lembrete.');
  if (disciplinaId !== null && !ativas(estado.disciplinas).some((d) => d.id === disciplinaId)) throw new Error('A matéria não existe.');
  if (tipo === 'trabalho' && disciplinaId === null) throw new Error('Escolha a matéria do trabalho.');
  const t = normalizarNome(titulo);
  if (!t) throw new Error('Dê um título.');
  const campos = camposDaAgenda(dados);
  if ((tipo === 'compromisso' || tipo === 'lembrete') && !campos.data) throw new Error('Informe a data.');
  const fim = horaFim == null || horaFim === '' ? null : horaFim;
  if (fim !== null && !HORA.test(fim)) throw new Error('Hora final inválida: use HH:MM.');
  if (fim !== null && campos.hora && fim < campos.hora) throw new Error('O fim não pode ser antes do início.');
  return { tipo, disciplina_id: disciplinaId, titulo: t.slice(0, 80), ...campos, hora_fim: fim, repete: repeticao(dados.repete, tipo, campos.data) };
}

export function criarEvento(estado, dados, agora) {
  const evento = { id: proximoId(lista(estado)), ...validar(estado, dados), feito_em: null, criado_em: agora, excluido_em: null };
  return { estado: { ...estado, eventos: [...lista(estado), evento] }, evento };
}

export function alterarEvento(estado, id, dados) {
  const atual = ativas(lista(estado)).find((e) => e.id === id);
  if (!atual) throw new Error('Item não encontrado.');
  const pega = (campo, coluna = campo) => (campo in dados ? dados[campo] : atual[coluna]);
  const novo = validar(estado, {
    tipo: atual.tipo, disciplinaId: pega('disciplinaId', 'disciplina_id'), titulo: pega('titulo'), data: pega('data'), hora: pega('hora'), horaFim: pega('horaFim', 'hora_fim'),
    local: pega('local'), observacao: pega('observacao'), peso: pega('peso'), repete: pega('repete'),
  });
  return { ...estado, eventos: lista(estado).map((e) => (e.id === id ? { ...e, ...novo } : e)) };
}

export function excluirEvento(estado, id, agora) {
  if (!ativas(lista(estado)).some((e) => e.id === id)) throw new Error('Item não encontrado.');
  return { ...estado, eventos: lista(estado).map((e) => (e.id === id ? { ...e, excluido_em: agora } : e)) };
}

export function restaurarEvento(estado, id) {
  const e = lista(estado).find((x) => x.id === id);
  if (!e || !e.excluido_em) throw new Error('Esse item não está na lixeira.');
  return { ...estado, eventos: lista(estado).map((x) => (x.id === id ? { ...x, excluido_em: null } : x)) };
}

/** Trabalho entregue / lembrete feito (e desfazer). Compromisso não tem "feito". */
export function marcarFeito(estado, id, agora, feito = true) {
  const atual = ativas(lista(estado)).find((e) => e.id === id);
  if (!atual) throw new Error('Item não encontrado.');
  if (atual.tipo === 'compromisso') throw new Error('Compromisso não tem "feito".');
  return { ...estado, eventos: lista(estado).map((e) => (e.id === id ? { ...e, feito_em: feito ? agora : null } : e)) };
}

/** Dias em que um item cai entre `de` e `ate` (inclusive). Sem repetição: a própria data, se estiver no intervalo. */
export function diasDoItem(item, de, ate) {
  if (!item.data) return [];
  const rep = item.repete ? JSON.parse(item.repete) : null;
  if (!rep) return item.data >= de && item.data <= ate ? [item.data] : [];
  const fim = rep.ate && rep.ate < ate ? rep.ate : ate, dias = [];
  const [a, m, d] = item.data.split('-').map(Number);
  for (let i = 0; i < 400; i++) {
    let dia;
    if (rep.freq === 'semanal') dia = somarDias(item.data, 7 * i);
    else {
      const ano = a + Math.floor((m - 1 + i) / 12), mes = ((m - 1 + i) % 12) + 1, ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      dia = `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
    }
    if (dia > fim) break;
    if (dia >= de) dias.push(dia);
  }
  return dias;
}

/**
 * Tudo o que a Agenda mostra entre `de` e `ate`, em ordem de data e hora: provas e eventos de matérias ativas (ou sem matéria).
 * Cada linha: { origem: 'prova' | 'evento', id, tipo, disciplina_id, titulo, dia, hora, hora_fim, local, observacao, peso, feito, repete }.
 */
export function itensDaAgenda(estado, de, ate) {
  const vivas = new Set(ativas(estado.disciplinas).map((d) => d.id));
  const saida = [];
  for (const p of ativas(estado.provas ?? [])) {
    if (!vivas.has(p.disciplina_id) || !p.data || p.data < de || p.data > ate) continue;
    saida.push({ origem: 'prova', id: p.id, tipo: 'prova', disciplina_id: p.disciplina_id, titulo: p.titulo, dia: p.data, hora: p.hora, hora_fim: null, local: p.local, observacao: p.observacao, peso: p.peso, feito: false, repete: '' });
  }
  for (const e of ativas(lista(estado))) {
    if (e.disciplina_id !== null && !vivas.has(e.disciplina_id)) continue;
    for (const dia of diasDoItem(e, de, ate)) saida.push({ origem: 'evento', id: e.id, tipo: e.tipo, disciplina_id: e.disciplina_id, titulo: e.titulo, dia, hora: e.hora, hora_fim: e.hora_fim, local: e.local, observacao: e.observacao, peso: e.peso, feito: !!e.feito_em, repete: e.repete });
  }
  return saida.sort((x, y) => x.dia.localeCompare(y.dia) || (x.hora ?? '').localeCompare(y.hora ?? '') || x.titulo.localeCompare(y.titulo));
}

/** Provas ativas a que falta data, hora ou peso (seção "A completar"): [{ prova, faltam: ['data', 'hora', 'peso'] }]. */
export function aCompletar(estado) {
  const vivas = new Set(ativas(estado.disciplinas).map((d) => d.id));
  return ativas(estado.provas ?? []).filter((p) => vivas.has(p.disciplina_id))
    .map((prova) => ({ prova, faltam: ['data', 'hora', 'peso'].filter((c) => prova[c] == null) }))
    .filter((x) => x.faltam.length)
    .sort((a, b) => (a.prova.data ?? '9999').localeCompare(b.prova.data ?? '9999'));
}

/** Provas sem data (para a indicação discreta da Hub). */
export const provasSemData = (estado) => aCompletar(estado).filter((x) => x.faltam.includes('data')).length;

/** Trabalhos de data já passada que não foram entregues, do mais antigo ao mais novo. */
export const atrasados = (estado, hoje) => ativas(lista(estado)).filter((e) => e.tipo === 'trabalho' && e.data && e.data < hoje && !e.feito_em).sort((a, b) => a.data.localeCompare(b.data));

/**
 * Salva um item da Agenda de qualquer tipo (prova ou evento): cria sem `id`, altera com `id`. `dados`: { tipo, disciplinaId, titulo, data, hora,
 * horaFim, local, observacao, peso, repete }. Na alteração, só vale o que vier em `dados`. Devolve { estado, origem, id }.
 */
export function salvarItem(estado, { tipo, id = null, ...dados }, agora) {
  if (tipo === 'prova') {
    if (id === null) { const r = criarProva(estado, dados, agora); return { estado: r.estado, origem: 'prova', id: r.prova.id }; }
    return { estado: alterarProva(estado, id, dados), origem: 'prova', id };
  }
  if (id === null) { const r = criarEvento(estado, { tipo, ...dados }, agora); return { estado: r.estado, origem: 'evento', id: r.evento.id }; }
  return { estado: alterarEvento(estado, id, dados), origem: 'evento', id };
}

/** Exclui (lixeira) ou restaura um item pelo par { origem: 'prova' | 'evento', id }. */
export const excluirItem = (estado, origem, id, agora) => (origem === 'prova' ? excluirProva(estado, id, agora) : excluirEvento(estado, id, agora));
export const restaurarItem = (estado, origem, id) => (origem === 'prova' ? restaurarProva(estado, id) : restaurarEvento(estado, id));

export { aulasDaProva };
