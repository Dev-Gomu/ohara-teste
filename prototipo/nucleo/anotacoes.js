// Núcleo (regras puras, sem I/O): anotações da aula. O conteúdo é o "Delta" do Quill guardado como texto JSON.
// Histórico: uma versão nova só é guardada se a última tem mais de 5 minutos; ficam as 50 mais recentes.

export const VERSOES_MAX = 50;
export const INTERVALO_VERSAO_MS = 5 * 60 * 1000;

/** Texto puro de um Delta (para saber se há conteúdo e para pré-visualizar). Conteúdo ilegível vira ''. */
export function textoDoDelta(conteudo) {
  try {
    const d = JSON.parse(conteudo);
    return (d.ops ?? []).map((o) => (typeof o.insert === 'string' ? o.insert : '')).join('').trim();
  } catch { return ''; }
}

export const deltaValido = (conteudo) => { try { return Array.isArray(JSON.parse(conteudo).ops); } catch { return false; } };

/** `ultimaEm`: ISO da última versão guardada (ou null). Guarda se for a primeira ou se passou o intervalo. */
export function deveGuardarVersao(ultimaEm, agora) {
  return !ultimaEm || new Date(agora) - new Date(ultimaEm) >= INTERVALO_VERSAO_MS;
}

/** De uma lista de ids de versões (qualquer ordem), quais apagar para sobrarem só as `max` mais novas (maior id = mais nova). */
export const versoesParaApagar = (ids, max = VERSOES_MAX) => [...ids].sort((a, b) => b - a).slice(max);

export function atualizarAnotacao(estado, aulaId, conteudo) {
  if (!deltaValido(conteudo)) throw new Error('Conteúdo de anotação inválido.');
  if (!estado.aulas.some((a) => a.id === aulaId && !a.excluido_em)) throw new Error('Aula não encontrada.');
  return { ...estado, aulas: estado.aulas.map((a) => (a.id === aulaId ? { ...a, anotacoes: conteudo } : a)) };
}
