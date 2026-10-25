// Núcleo (regras puras, sem I/O): arquivos .ics (iCalendar). Lê o que o Google Agenda exporta (eventos únicos e repetidos
// por DIARIAMENTE, SEMANALMENTE com BYDAY, ou MENSALMENTE no mesmo dia, com COUNT, UNTIL, INTERVAL e EXDATE) e escreve o plano
// de estudo. Horários com fuso (TZID) são tratados como horário do aparelho; horários em UTC ("Z") são convertidos pelo deslocamento.
import { somarDias, diasEntre, diaDaSemana, diasDoMes } from './datas.js';

const p2 = (n) => String(n).padStart(2, '0');
const desescapar = (t) => t.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
const escapar = (t) => String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');

/** Linhas lógicas (com as continuações desdobradas) → { nome, params, valor }. */
function propriedades(texto) {
  const linhas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').reduce((acc, l) => { if (/^[ \t]/.test(l) && acc.length) acc[acc.length - 1] += l.slice(1); else acc.push(l); return acc; }, []);
  return linhas.filter(Boolean).map((l) => {
    const i = l.indexOf(':'); if (i < 0) return { nome: l.toUpperCase(), params: {}, valor: '' };
    const [nome, ...ps] = l.slice(0, i).split(';');
    return { nome: nome.toUpperCase(), params: Object.fromEntries(ps.map((p) => { const [k, ...v] = p.split('='); return [k.toUpperCase(), v.join('=')]; })), valor: l.slice(i + 1) };
  });
}

/** "20261026T080000" / "…Z" / "20261026" → { local: 'AAAA-MM-DDTHH:MM' | null, dia, diaInteiro }. */
function lerData(valor, params, deslocamentoMin) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(valor.trim());
  if (!m) return null;
  const dia = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] === undefined || params.VALUE === 'DATE') return { local: null, dia, diaInteiro: true };
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (m[7]) ms += deslocamentoMin * 60000;
  return { local: new Date(ms).toISOString().slice(0, 16), dia: new Date(ms).toISOString().slice(0, 10), diaInteiro: false };
}

/** Eventos do arquivo (sem expandir repetições). */
export function lerIcs(texto, deslocamentoMin = 0) {
  const props = propriedades(texto), eventos = [];
  let atual = null;
  for (const p of props) {
    if (p.nome === 'BEGIN' && p.valor.toUpperCase() === 'VEVENT') atual = { exdates: [], rrule: null, titulo: '', uid: '' };
    else if (p.nome === 'END' && p.valor.toUpperCase() === 'VEVENT') { if (atual?.uid && atual.inicio && !atual.inicio.diaInteiro && !atual.cancelado) eventos.push(atual); atual = null; }
    else if (atual) {
      if (p.nome === 'UID') atual.uid = p.valor.trim();
      else if (p.nome === 'SUMMARY') atual.titulo = desescapar(p.valor).trim();
      else if (p.nome === 'DTSTART') atual.inicio = lerData(p.valor, p.params, deslocamentoMin);
      else if (p.nome === 'DTEND') atual.fim = lerData(p.valor, p.params, deslocamentoMin);
      else if (p.nome === 'RRULE') atual.rrule = Object.fromEntries(p.valor.split(';').map((x) => x.split('=')).map(([k, v]) => [k.toUpperCase(), v ?? '']));
      else if (p.nome === 'EXDATE') for (const v of p.valor.split(',')) { const d = lerData(v, p.params, deslocamentoMin); if (d) atual.exdates.push(d.local ?? d.dia); }
      else if (p.nome === 'RECURRENCE-ID') atual.recorrenciaId = lerData(p.valor, p.params, deslocamentoMin)?.local ?? null;
      else if (p.nome === 'STATUS' && p.valor.toUpperCase() === 'CANCELLED') atual.cancelado = true;
    }
  }
  return eventos;
}

const BYDAY = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const somarMin = (local, min) => new Date(Date.parse(local + ':00Z') + min * 60000).toISOString().slice(0, 16);

/** Datas (AAAA-MM-DD) das ocorrências de uma regra, a partir do dia de início, até `ate` (inclusive). */
function diasDaRegra(dia0, r, ate) {
  const intervalo = Math.max(1, Number(r.INTERVAL) || 1), limiteCount = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : null;
  const fim = until && until < ate ? until : ate, dias = [];
  const aceita = (d) => { if (d > fim) return false; dias.push(d); return dias.length < limiteCount; };
  const freq = (r.FREQ ?? '').toUpperCase();
  if (freq === 'DAILY') { for (let d = dia0, i = 0; d <= fim; d = somarDias(d, intervalo)) { if (!aceita(d)) break; if (++i > 5000) break; } }
  else if (freq === 'WEEKLY') {
    const alvo = (r.BYDAY ? r.BYDAY.split(',').map((x) => BYDAY[x.slice(-2)]).filter((x) => x !== undefined) : [diaDaSemana(dia0)]).sort((a, b) => a - b);
    const semana0 = somarDias(dia0, -diaDaSemana(dia0));
    loop: for (let s = semana0, i = 0; s <= fim && i < 1000; s = somarDias(s, 7 * intervalo), i++) {
      for (const d of alvo) { const dia = somarDias(s, d); if (dia < dia0) continue; if (!aceita(dia)) break loop; }
    }
  } else if (freq === 'MONTHLY') {
    const [a0, m0, d0] = dia0.split('-').map(Number);
    for (let k = 0; k < 600; k += intervalo) {
      const t = a0 * 12 + (m0 - 1) + k, a = Math.floor(t / 12), m = (t % 12) + 1;
      if (d0 > diasDoMes(a, m)) continue;
      const dia = `${a}-${p2(m)}-${p2(d0)}`; if (dia > fim) break; if (!aceita(dia)) break;
    }
  } else aceita(dia0);                                           // repetição não suportada: só a primeira ocorrência
  return dias;
}

/**
 * Ocorrências entre `de` e `ate` (AAAA-MM-DD, inclusive), já com a chave de identificação:
 * evento único → o código do evento; repetido → código + início original da ocorrência (assim mudar uma só não duplica).
 * Resultado: [{ chave, titulo, inicio, fim }] ordenado por início.
 */
export function ocorrencias(eventos, de, ate) {
  const saida = [], substituidas = new Set(eventos.filter((e) => e.recorrenciaId).map((e) => `${e.uid}|${e.recorrenciaId}`));
  for (const e of eventos) {
    const dur = e.fim?.local ? Math.round((Date.parse(e.fim.local + ':00Z') - Date.parse(e.inicio.local + ':00Z')) / 60000) : null, hora = e.inicio.local.slice(11);
    if (e.recorrenciaId) { if (e.inicio.dia >= de && e.inicio.dia <= ate) saida.push({ chave: `${e.uid}|${e.recorrenciaId}`, titulo: e.titulo, inicio: e.inicio.local, fim: e.fim?.local ?? null }); continue; }
    if (!e.rrule) { if (e.inicio.dia >= de && e.inicio.dia <= ate) saida.push({ chave: e.uid, titulo: e.titulo, inicio: e.inicio.local, fim: e.fim?.local ?? null }); continue; }
    for (const dia of diasDaRegra(e.inicio.dia, e.rrule, ate)) {
      const inicio = `${dia}T${hora}`;
      if (dia < de || e.exdates.includes(inicio) || e.exdates.includes(dia) || substituidas.has(`${e.uid}|${inicio}`)) continue;
      saida.push({ chave: `${e.uid}|${inicio}`, titulo: e.titulo, inicio, fim: dur == null ? null : somarMin(inicio, dur) });
    }
  }
  return saida.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

// ---------- escrita ----------
const dobrar = (linha) => {
  const enc = new TextEncoder(); if (enc.encode(linha).length <= 75) return linha;
  const partes = []; let atual = '', tam = 0;
  for (const ch of linha) { const b = enc.encode(ch).length; if (tam + b > (partes.length ? 74 : 75)) { partes.push(atual); atual = ''; tam = 0; } atual += ch; tam += b; }
  partes.push(atual); return partes.join('\r\n ');
};
const compacto = (dia) => dia.replaceAll('-', '');

/** Plano de estudo (tarefas) e provas como eventos de dia inteiro. `nomes`: Map id da matéria → nome. */
export function gerarIcs({ tarefas = [], provas = [], nomes = new Map() }, agoraIso) {
  const stamp = agoraIso.replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z', L = [];
  const evento = (uid, dia, resumo, descricao) => L.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${compacto(dia)}`, `DTEND;VALUE=DATE:${compacto(somarDias(dia, 1))}`, `SUMMARY:${escapar(resumo)}`, ...(descricao ? [`DESCRIPTION:${escapar(descricao)}`] : []), 'END:VEVENT');
  L.push('BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ohara//Plano de estudo//PT-BR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Ohara');
  for (const p of provas.filter((x) => !x.excluido_em)) evento(`ohara-prova-${p.id}@ohara.local`, p.data, `Prova: ${p.titulo} (${nomes.get(p.disciplina_id) ?? 'matéria'})`, '');
  for (const t of tarefas.filter((x) => !x.excluido_em && !x.feita_em)) evento(`ohara-${t.chave.replaceAll('|', '-')}@ohara.local`, t.dia, `${t.tipo === 'revisao' ? 'Revisão' : 'Estudo'}: ${nomes.get(t.disciplina_id) ?? ''} — ${t.titulo} (${t.minutos} min)`, t.sem_vaga ? 'Não cabe nas horas disponíveis: aumente o tempo livre ou mova a prova.' : '');
  L.push('END:VCALENDAR');
  return L.map(dobrar).join('\r\n') + '\r\n';
}
