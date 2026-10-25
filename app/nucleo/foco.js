// Núcleo (regras puras, sem I/O): Sala de Foco. O tempo vem sempre dos instantes de início (em ms), nunca de um
// contador: continua certo com a tela apagada ou o app fechado. A sessão ativa é um objeto simples que o app guarda
// no banco; `avancar` resolve tudo o que aconteceu enquanto ninguém olhava.
import { normalizarNome } from './texto.js';

export const CONFIG_PADRAO = { foco_min: 25, pausa_min: 5, pausa_longa_min: 15, blocos_ate_pausa_longa: 4, meta_diaria_min: 120, meta_semanal_min: 600 };
const LIMITES = { foco_min: [1, 180], pausa_min: [1, 60], pausa_longa_min: [1, 120], blocos_ate_pausa_longa: [2, 10], meta_diaria_min: [5, 1440], meta_semanal_min: [5, 10080] };
export const ROTULOS_CONFIG = {
  foco_min: 'Minutos de cada bloco', pausa_min: 'Minutos de pausa', pausa_longa_min: 'Minutos da pausa longa',
  blocos_ate_pausa_longa: 'Blocos até a pausa longa', meta_diaria_min: 'Meta diária (minutos)', meta_semanal_min: 'Meta semanal (minutos)',
};

/** Valida um valor de configuração (texto ou número). Lança Error com mensagem para o usuário. */
export function validarConfig(chave, valor) {
  const [min, max] = LIMITES[chave] ?? [];
  if (min === undefined) throw new Error('Configuração desconhecida.');
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${ROTULOS_CONFIG[chave]}: use um número inteiro de ${min} a ${max}.`);
  return n;
}

/** `lerValor(chave)` devolve o texto guardado ou null. Valor guardado inválido volta ao padrão. */
export function lerConfigFoco(lerValor) {
  const c = {};
  for (const k of Object.keys(CONFIG_PADRAO)) { try { c[k] = lerValor(k) == null ? CONFIG_PADRAO[k] : validarConfig(k, lerValor(k)); } catch { c[k] = CONFIG_PADRAO[k]; } }
  return c;
}

const MIN = 60000;

/** Começa um bloco de foco. `tipo`: 'foco' ou 'anki' (Revisão no Anki, que também conta como estudo). */
export function iniciarBloco(config, { tarefa = '', disciplinaId = null, tipo = 'foco' }, agoraMs, ciclo = 0, minutos = config.foco_min) {
  if (!['foco', 'anki'].includes(tipo)) throw new Error('Tipo de bloco inválido.');
  const m = validarConfig('foco_min', minutos);
  return { fase: 'foco', inicio_ms: agoraMs, duracao_ms: m * MIN, tipo, tarefa: normalizarNome(tarefa).slice(0, 120), disciplina_id: disciplinaId, ciclo };
}

export const restanteMs = (s, agoraMs) => Math.max(0, s.inicio_ms + s.duracao_ms - agoraMs);
export const progresso = (s, agoraMs) => Math.min(1, Math.max(0, (agoraMs - s.inicio_ms) / s.duracao_ms));

/** Texto "mm:ss" (ou "h:mm:ss") de uma duração em ms; arredonda para cima, como um cronômetro regressivo. */
export function formatarRelogio(ms) {
  const t = Math.ceil(Math.max(0, ms) / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function registroDe(s, feitos, estado, diaLocal) {
  return { disciplina_id: s.disciplina_id, tarefa: s.tarefa, tipo: s.tipo, dia: diaLocal, inicio: new Date(s.inicio_ms).toISOString(), minutos_previstos: Math.round(s.duracao_ms / MIN), minutos_feitos: feitos, estado };
}

/**
 * Resolve o que aconteceu até `agoraMs`. Devolve { sessao, registros }: `sessao` é a sessão que continua (ou null) e
 * `registros` os blocos concluídos (a gravar). `diaDe(ms)` converte um instante no dia local.
 * Se o app ficou fechado, bloco e pausa que já acabaram são resolvidos de uma vez.
 */
export function avancar(sessao, agoraMs, config, diaDe) {
  const registros = [];
  let s = sessao;
  while (s && restanteMs(s, agoraMs) === 0) {
    if (s.fase === 'foco') {
      registros.push(registroDe(s, Math.round(s.duracao_ms / MIN), 'concluido', diaDe(s.inicio_ms)));
      const ciclo = s.ciclo + 1, longa = ciclo % config.blocos_ate_pausa_longa === 0;
      s = { fase: 'pausa', inicio_ms: s.inicio_ms + s.duracao_ms, duracao_ms: (longa ? config.pausa_longa_min : config.pausa_min) * MIN, tipo: s.tipo, tarefa: s.tarefa, disciplina_id: s.disciplina_id, ciclo, longa };
    } else s = null;
  }
  return { sessao: s, registros };
}

/** Abandona o bloco em andamento: conta só os minutos inteiros feitos (menos de 1 minuto não vira registro). */
export function abandonar(sessao, agoraMs, diaDe) {
  if (!sessao || sessao.fase !== 'foco') return { sessao: null, registro: null };
  const feitos = Math.min(Math.floor((agoraMs - sessao.inicio_ms) / MIN), Math.round(sessao.duracao_ms / MIN));
  return { sessao: null, registro: feitos >= 1 ? registroDe(sessao, feitos, 'abandonado', diaDe(sessao.inicio_ms)) : null };
}

/** Termina a pausa antes da hora; o ciclo continua para a pausa longa chegar na hora certa. */
export const pularPausa = (sessao) => (sessao?.fase === 'pausa' ? null : sessao);

export function registrarBloco(estado, registro, agora) {
  const id = (estado.blocos ?? []).reduce((m, b) => Math.max(m, b.id), 0) + 1;
  const bloco = { id, ...registro, criado_em: agora, excluido_em: null };
  return { ...estado, blocos: [...(estado.blocos ?? []), bloco] };
}
