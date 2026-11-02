// Núcleo (regras puras, sem I/O): a grade semanal. Um HORÁRIO é uma regra ("quarta, 08:00–12:00, Propedêutica, toda semana");
// as aulas futuras são VIRTUAIS (calculadas pela regra) e só viram aula de verdade (com slides, anotações, cartões) quando
// são abertas ou quando chega o dia. Mudar o horário vale daqui para frente: o horário antigo é encerrado e nasce um novo,
// então o passado e o conteúdo já guardado nunca mudam. Exceções (cancelar, mover) valem para uma data só.
// Mesmo estado e mesma convenção de materias.js; dias são "AAAA-MM-DD", horas "HH:MM", dia da semana 0 = segunda … 6 = domingo.

import { ativas, proximoId } from './materias.js';
import { criarAula, excluirAula, alterarAula } from './aulas.js';
import { somarDias, diasEntre, diaDaSemana, inicioDaSemana } from './datas.js';

export const REPETICOES = ['semanal', 'quinzenal'];
const DIA = /^\d{4}-\d{2}-\d{2}$/, HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const horarios = (e) => e.grade ?? [], excecoes = (e) => e.excecoes ?? [];

function diaValido(v, rotulo) {
  if (!DIA.test(v ?? '') || Number.isNaN(Date.parse(v))) throw new Error(`${rotulo} inválido: use AAAA-MM-DD.`);
  return v;
}

function validar(estado, d) {
  if (!ativas(estado.disciplinas).some((m) => m.id === d.disciplinaId)) throw new Error('A matéria não existe.');
  if (!Number.isInteger(d.diaSemana) || d.diaSemana < 0 || d.diaSemana > 6) throw new Error('Dia da semana inválido.');
  if (!HORA.test(d.inicio ?? '') || !HORA.test(d.fim ?? '')) throw new Error('Hora inválida: use HH:MM.');
  if (d.fim <= d.inicio) throw new Error('O fim precisa ser depois do início.');
  const repete = d.repete ?? 'semanal';
  if (!REPETICOES.includes(repete)) throw new Error('Repetição inválida: use semanal ou quinzenal.');
  const desde = diaValido(d.desde, 'Início');
  const ate = d.ate ? diaValido(d.ate, 'Fim') : null;
  if (ate && ate < desde) throw new Error('O fim da grade não pode ser antes do início.');
  let ancora = d.ancora ?? null;
  if (repete === 'quinzenal') {
    if (!ancora) ancora = somarDias(desde, (d.diaSemana - diaDaSemana(desde) + 7) % 7);
    diaValido(ancora, 'Semana de referência');
    if (diaDaSemana(ancora) !== d.diaSemana) throw new Error('A data de referência precisa cair no mesmo dia da semana do horário.');
  } else ancora = null;
  return { disciplina_id: d.disciplinaId, dia_semana: d.diaSemana, inicio: d.inicio, fim: d.fim, repete, ancora, desde, ate, rotulo: String(d.rotulo ?? '').trim().slice(0, 20), local: String(d.local ?? '').trim().slice(0, 80) };
}

export function criarHorario(estado, dados, agora) {
  const h = { id: proximoId(horarios(estado)), ...validar(estado, dados), criado_em: agora, excluido_em: null };
  return { estado: { ...estado, grade: [...horarios(estado), h] }, horario: h };
}

const paraDados = (h) => ({ disciplinaId: h.disciplina_id, diaSemana: h.dia_semana, inicio: h.inicio, fim: h.fim, repete: h.repete, ancora: h.ancora, desde: h.desde, ate: h.ate, rotulo: h.rotulo, local: h.local });
const acha = (estado, id) => { const h = ativas(horarios(estado)).find((x) => x.id === id); if (!h) throw new Error('Horário não encontrado.'); return h; };

/** Datas (AAAA-MM-DD) em que o horário cai entre `de` e `ate`, já respeitando início, fim e a alternância da quinzenal. */
export function diasDoHorario(h, de, ate) {
  const ini = de > h.desde ? de : h.desde, fim = h.ate && h.ate < ate ? h.ate : ate, dias = [];
  if (ini > fim) return dias;
  for (let d = somarDias(ini, (h.dia_semana - diaDaSemana(ini) + 7) % 7); d <= fim; d = somarDias(d, 7)) {
    if (h.repete === 'quinzenal' && (diasEntre(inicioDaSemana(h.ancora), inicioDaSemana(d)) / 7) % 2 !== 0) continue;
    dias.push(d);
  }
  return dias;
}

/** A aula tem algo do usuário (anotação, arquivo, marcador ou cartão)? Se sim, nunca some sozinha. */
export function aulaTemConteudo(estado, aula) {
  const doAula = (l, campo = 'aula_id') => ativas(l ?? []).some((x) => x[campo] === aula.id);
  return !!(aula.anotacoes ?? '').trim() || doAula(estado.arquivos) || doAula(estado.marcadores) || doAula(estado.cartoes);
}

const reais = (estado) => ativas(estado.aulas).filter((a) => a.tipo === 'aula' && a.inicio);

/**
 * Ocorrências da grade entre `de` e `ate` que AINDA SÃO virtuais (sem aula de verdade), em ordem:
 * { grade_id, disciplina_id, dia, inicio: 'AAAA-MM-DDTHH:MM', fim, rotulo, local, movida_de }.
 * Fica de fora o que foi cancelado, o que já virou aula (ligada ao horário) e uma aula da mesma matéria que começa na mesma hora.
 */
export function ocorrenciasVirtuais(estado, de, ate) {
  const vivas = new Set(ativas(estado.disciplinas).map((m) => m.id));
  const ligadas = new Set(ativas(estado.aulas).filter((a) => a.grade_id != null).map((a) => `${a.grade_id}|${a.grade_dia}`));
  const comeco = new Set(reais(estado).map((a) => `${a.disciplina_id}|${a.inicio}`));
  const saida = [];
  for (const h of ativas(horarios(estado))) {
    if (!vivas.has(h.disciplina_id)) continue;
    const ex = new Map(excecoes(estado).filter((x) => x.grade_id === h.id).map((x) => [x.dia, x]));
    // ocorrências movidas para dentro do intervalo, vindas de fora dele
    const candidatos = new Set(diasDoHorario(h, de, ate));
    for (const x of ex.values()) if (x.tipo === 'movida' && x.novo_dia >= de && x.novo_dia <= ate) for (const d of diasDoHorario(h, x.dia, x.dia)) candidatos.add(d);
    for (const dia of [...candidatos].sort()) {
      if (ligadas.has(`${h.id}|${dia}`)) continue;
      const x = ex.get(dia);
      if (x?.tipo === 'cancelada') continue;
      const novo = x?.tipo === 'movida';
      const d = novo ? x.novo_dia : dia, ini = novo ? x.novo_inicio : h.inicio, fim = novo ? x.novo_fim : h.fim;
      if (d < de || d > ate) continue;
      if (comeco.has(`${h.disciplina_id}|${d}T${ini}`)) continue;
      saida.push({ grade_id: h.id, disciplina_id: h.disciplina_id, dia: d, inicio: `${d}T${ini}`, fim: `${d}T${fim}`, rotulo: h.rotulo, local: h.local, grade_dia: dia, movida_de: novo ? dia : null });
    }
  }
  return saida.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.disciplina_id - b.disciplina_id);
}

/** Ocorrências canceladas ("sem aula") entre `de` e `ate`, para a Agenda mostrar riscadas e deixar restaurar: { grade_id, disciplina_id, dia, inicio, fim, rotulo, local, cancelada: true }. */
export function ocorrenciasCanceladas(estado, de, ate) {
  const vivas = new Set(ativas(estado.disciplinas).map((m) => m.id)), saida = [];
  for (const x of excecoes(estado).filter((e) => e.tipo === 'cancelada' && e.dia >= de && e.dia <= ate)) {
    const h = ativas(horarios(estado)).find((y) => y.id === x.grade_id);
    if (h && vivas.has(h.disciplina_id)) saida.push({ grade_id: h.id, disciplina_id: h.disciplina_id, dia: x.dia, inicio: `${x.dia}T${h.inicio}`, fim: `${x.dia}T${h.fim}`, rotulo: h.rotulo, local: h.local, grade_dia: x.dia, cancelada: true });
  }
  return saida.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Aulas de verdade (marcadas `virtual: false`) e virtuais (`virtual: true`, sem id) do intervalo, juntas e em ordem. */
export function aulasEfetivas(estado, de, ate) {
  const vivas = new Set(ativas(estado.disciplinas).map((m) => m.id));
  const doDia = reais(estado).filter((a) => vivas.has(a.disciplina_id) && a.inicio.slice(0, 10) >= de && a.inicio.slice(0, 10) <= ate).map((a) => ({ ...a, virtual: false }));
  const virtuais = ocorrenciasVirtuais(estado, de, ate).map((o) => ({ id: null, disciplina_id: o.disciplina_id, titulo: '', tipo: 'aula', inicio: o.inicio, fim: o.fim, rotulo: o.rotulo, local: o.local, grade_id: o.grade_id, grade_dia: o.grade_dia, virtual: true }));
  return [...doDia, ...virtuais].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.disciplina_id - b.disciplina_id);
}

/** Transforma a ocorrência virtual (horário + data original) em aula de verdade e devolve { estado, aula }. Se já existe, devolve a existente. */
export function materializar(estado, gradeId, dia, agora) {
  const h = acha(estado, gradeId);
  const ja = ativas(estado.aulas).find((a) => a.grade_id === gradeId && a.grade_dia === dia);
  if (ja) return { estado, aula: ja };
  const o = ocorrenciasVirtuais(estado, somarDias(dia, -400), somarDias(dia, 400)).find((x) => x.grade_id === gradeId && x.grade_dia === dia);
  if (!o) throw new Error('Essa aula não existe mais na grade (foi cancelada ou já virou aula).');
  const m = estado.disciplinas.find((x) => x.id === h.disciplina_id);
  const titulo = `${m.nome}${h.rotulo ? ` ${h.rotulo}` : ''}`;
  const r = criarAula(estado, h.disciplina_id, { titulo, inicio: o.inicio, fim: o.fim }, agora);
  const aula = { ...r.aula, grade_id: gradeId, grade_dia: dia };
  return { estado: { ...r.estado, aulas: r.estado.aulas.map((a) => (a.id === aula.id ? aula : a)) }, aula };
}

/** Todas as ocorrências virtuais de um dia viram aulas (o que acontece "no dia"). */
export function materializarDoDia(estado, dia, agora) {
  let e = estado;
  for (const o of ocorrenciasVirtuais(estado, dia, dia)) e = materializar(e, o.grade_id, o.grade_dia, agora).estado;
  return e;
}

const semExcecao = (estado, gradeId, dia) => excecoes(estado).filter((x) => !(x.grade_id === gradeId && x.dia === dia));
const novaExcecao = (estado, x, agora) => ({ ...estado, excecoes: [...semExcecao(estado, x.grade_id, x.dia), { id: proximoId(excecoes(estado)), novo_dia: null, novo_inicio: null, novo_fim: null, ...x, criado_em: agora }] });

/** "Sem aula" naquela data. Se a aula já existe e tem conteúdo, recusa (o conteúdo é do usuário); se estiver vazia, vai para a lixeira. */
export function cancelarOcorrencia(estado, gradeId, dia, agora) {
  acha(estado, gradeId);
  let e = estado;
  const aula = ativas(e.aulas).find((a) => a.grade_id === gradeId && a.grade_dia === dia);
  if (aula) {
    if (aulaTemConteudo(e, aula)) throw new Error('Essa aula já tem anotações, arquivos ou cartões. Exclua-a pela aula (vai para a lixeira) se for mesmo apagar.');
    e = excluirAula(e, aula.id, agora);
  }
  return novaExcecao(e, { grade_id: gradeId, dia, tipo: 'cancelada' }, agora);
}

/** Desfaz um cancelamento ou uma mudança de lugar daquela data. */
export function restaurarOcorrencia(estado, gradeId, dia) {
  if (!excecoes(estado).some((x) => x.grade_id === gradeId && x.dia === dia)) throw new Error('Não há mudança nessa data.');
  return { ...estado, excecoes: semExcecao(estado, gradeId, dia) };
}

/** Muda uma aula de dia e/ou hora (só ela). Se já é aula de verdade, muda a própria aula; senão guarda a exceção. */
export function moverOcorrencia(estado, gradeId, dia, { novoDia, inicio, fim }, agora) {
  acha(estado, gradeId);
  diaValido(novoDia, 'Dia');
  if (!HORA.test(inicio ?? '') || !HORA.test(fim ?? '') || fim <= inicio) throw new Error('Horário inválido.');
  const aula = ativas(estado.aulas).find((a) => a.grade_id === gradeId && a.grade_dia === dia);
  if (aula) return alterarAula(estado, aula.id, { inicio: `${novoDia}T${inicio}`, fim: `${novoDia}T${fim}` });
  return novaExcecao(estado, { grade_id: gradeId, dia, tipo: 'movida', novo_dia: novoDia, novo_inicio: inicio, novo_fim: fim }, agora);
}

/** Aulas vazias, de verdade e ligadas ao horário, de `aPartirDe` em diante, vão para a lixeira (as com conteúdo ficam); o horário novo as recalcula. */
function limparFuturasVazias(estado, gradeId, aPartirDe, agora) {
  let e = estado;
  for (const a of ativas(e.aulas).filter((x) => x.grade_id === gradeId && x.grade_dia >= aPartirDe)) if (!aulaTemConteudo(e, a)) e = excluirAula(e, a.id, agora);
  return e;
}

/** Muda o horário daqui para frente. `aPartirDe` antes ou igual ao início do horário = muda o próprio; depois = encerra o antigo e cria o novo. */
export function alterarHorario(estado, id, dados, aPartirDe, agora) {
  const h = acha(estado, id);
  diaValido(aPartirDe, 'Data');
  const novos = { ...paraDados(h), ...dados };
  if (aPartirDe <= h.desde) {
    const v = validar(estado, novos);
    return { ...estado, grade: horarios(estado).map((x) => (x.id === id ? { ...x, ...v } : x)) };
  }
  validar(estado, { ...novos, desde: aPartirDe });
  let e = { ...estado, grade: horarios(estado).map((x) => (x.id === id ? { ...x, ate: somarDias(aPartirDe, -1) } : x)) };
  e = limparFuturasVazias(e, id, aPartirDe, agora);
  const r = criarHorario(e, { ...novos, desde: aPartirDe }, agora);
  // as aulas que ficaram (têm conteúdo) passam a pertencer ao horário novo, para ele não criar uma virtual por cima
  return { ...r.estado, aulas: r.estado.aulas.map((a) => (a.grade_id === id && a.grade_dia >= aPartirDe ? { ...a, grade_id: r.horario.id } : a)) };
}

/** Tira o horário daqui para frente (antes do início dele, vai para a lixeira). */
export function excluirHorario(estado, id, aPartirDe, agora) {
  const h = acha(estado, id);
  diaValido(aPartirDe, 'Data');
  if (aPartirDe <= h.desde) return limparFuturasVazias({ ...estado, grade: horarios(estado).map((x) => (x.id === id ? { ...x, excluido_em: agora } : x)) }, id, '0000-00-00', agora);
  return limparFuturasVazias({ ...estado, grade: horarios(estado).map((x) => (x.id === id ? { ...x, ate: somarDias(aPartirDe, -1) } : x)) }, id, aPartirDe, agora);
}

/** Feriado trocou a alternância: a quinzenal passa a cair nas semanas opostas a partir de `aPartirDe`. */
export function inverterQuinzenal(estado, id, aPartirDe, agora) {
  const h = acha(estado, id);
  if (h.repete !== 'quinzenal') throw new Error('Só horário quinzenal pode ser invertido.');
  return alterarHorario(estado, id, { ancora: somarDias(h.ancora, 7) }, aPartirDe, agora);
}

export const horariosDaMateria = (estado, disciplinaId) => ativas(horarios(estado)).filter((h) => h.disciplina_id === disciplinaId);

/**
 * Descobre a grade a partir das aulas que já existem (por exemplo, as importadas do Google Agenda): aulas da mesma matéria, no mesmo
 * dia da semana e no mesmo horário, pelo menos 3, semanais ou quinzenais. Devolve sugestões [{ disciplinaId, diaSemana, inicio, fim,
 * repete, desde, ancora, aulas: [ids] }]. Não altera nada.
 */
export function sugerirGrade(estado) {
  const grupos = new Map();
  for (const a of reais(estado).filter((x) => x.fim && x.grade_id == null && x.inicio.slice(0, 10) === x.fim.slice(0, 10))) {
    const dia = a.inicio.slice(0, 10), chave = `${a.disciplina_id}|${diaDaSemana(dia)}|${a.inicio.slice(11)}|${a.fim.slice(11)}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push({ id: a.id, dia });
  }
  const saida = [];
  for (const [chave, itens] of grupos) {
    if (itens.length < 3) continue;
    itens.sort((x, y) => x.dia.localeCompare(y.dia));
    const folgas = itens.slice(1).map((x, i) => Math.round(diasEntre(itens[i].dia, x.dia) / 7)).sort((a, b) => a - b), mediana = folgas[Math.floor(folgas.length / 2)];
    if (mediana !== 1 && mediana !== 2) continue;
    const [disciplinaId, diaSemana, inicio, fim] = chave.split('|');
    saida.push({ disciplinaId: Number(disciplinaId), diaSemana: Number(diaSemana), inicio, fim, repete: mediana === 1 ? 'semanal' : 'quinzenal', desde: itens[0].dia, ancora: itens[0].dia, aulas: itens.map((x) => x.id) });
  }
  return saida.sort((a, b) => a.disciplinaId - b.disciplinaId || a.diaSemana - b.diaSemana || a.inicio.localeCompare(b.inicio));
}

/** Cria os horários sugeridos e liga as aulas já existentes a eles (nada é apagado nem muda de data). */
export function aplicarGrade(estado, sugestoes, agora) {
  let e = estado;
  for (const s of sugestoes) {
    const r = criarHorario(e, { disciplinaId: s.disciplinaId, diaSemana: s.diaSemana, inicio: s.inicio, fim: s.fim, repete: s.repete, desde: s.desde, ancora: s.repete === 'quinzenal' ? s.ancora : null }, agora);
    e = r.estado;
    const ids = new Set(s.aulas);
    e = { ...e, aulas: e.aulas.map((a) => (ids.has(a.id) ? { ...a, grade_id: r.horario.id, grade_dia: a.inicio.slice(0, 10) } : a)) };
  }
  return e;
}
