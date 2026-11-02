// Núcleo (regras puras, sem I/O): marcadores ("Marcados na aula"): guardam a linha do editor e a página do slide.
import { normalizarNome } from './texto.js';
import { ativas, proximoId } from './materias.js';

export const LIMITE_TRECHO = 120;

export function criarMarcador(estado, aulaId, { arquivoId = null, pagina = null, trecho }, agora) {
  if (!ativas(estado.aulas).some((a) => a.id === aulaId)) throw new Error('A aula não existe.');
  let t = normalizarNome(trecho);
  if (t.length > LIMITE_TRECHO) t = t.slice(0, LIMITE_TRECHO - 1).trimEnd() + '…';
  const marcador = {
    id: proximoId(estado.marcadores), aula_id: aulaId, arquivo_id: arquivoId,
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : null, trecho: t || '(linha em branco)', criado_em: agora, excluido_em: null,
  };
  return { estado: { ...estado, marcadores: [...estado.marcadores, marcador] }, marcador };
}

export function removerMarcador(estado, id, agora) {
  if (!estado.marcadores.some((m) => m.id === id && !m.excluido_em)) throw new Error('Marcador não encontrado.');
  return { ...estado, marcadores: estado.marcadores.map((m) => (m.id === id ? { ...m, excluido_em: agora } : m)) };
}

/** Da aula, na ordem em que foram feitos. */
export const marcadoresDaAula = (estado, aulaId) => ativas(estado.marcadores).filter((m) => m.aula_id === aulaId).sort((x, y) => x.id - y.id);

/** "p. 3 · Biodisponibilidade = fração…" para a lista. */
export const descreverMarcador = (m) => `${m.pagina ? `p. ${m.pagina} · ` : ''}${m.trecho}`;
