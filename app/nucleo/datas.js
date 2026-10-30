// Núcleo (regras puras, sem I/O): datas como texto "AAAA-MM-DD" (dia local) e "AAAA-MM-DDTHH:MM" (hora local).
// Tudo por cálculo em UTC sobre o texto, para não depender do fuso do computador onde roda o teste.

const p2 = (n) => String(n).padStart(2, '0');
const paraUtc = (dia) => { const [a, m, d] = dia.split('-').map(Number); return Date.UTC(a, m - 1, d); };
const deUtc = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };

export const somarDias = (dia, n) => deUtc(paraUtc(dia) + n * 86400000);
export const diasEntre = (de, ate) => Math.round((paraUtc(ate) - paraUtc(de)) / 86400000);
/** 0 = segunda … 6 = domingo. */
export const diaDaSemana = (dia) => (new Date(paraUtc(dia)).getUTCDay() + 6) % 7;
export const inicioDaSemana = (dia) => somarDias(dia, -diaDaSemana(dia));
export const diasDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Instante (ms desde 1970) → dia local, dado o deslocamento do fuso em minutos (Brasil: -180). */
export const diaLocalDeMs = (ms, deslocamentoMin) => deUtc(ms + deslocamentoMin * 60000);
export const horaLocalDeMs = (ms, deslocamentoMin) => new Date(ms + deslocamentoMin * 60000).toISOString().slice(0, 16);

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS_SEMANA = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** "2026-10-26" → "26 de outubro". */
export const dataPorExtenso = (dia) => { const [, m, d] = dia.split('-').map(Number); return `${d} de ${MESES[m - 1]}`; };
/** "Segunda, 26 de outubro". */
export const diaComSemana = (dia) => { const s = DIAS_SEMANA[diaDaSemana(dia)]; return `${s[0].toUpperCase()}${s.slice(1)}, ${dataPorExtenso(dia)}`; };
