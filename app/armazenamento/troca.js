// Troca de dados entre aparelhos (tablet ↔ PC) por pacote .zip: o mesmo formato do backup, mais `troca.json` (impressão digital do
// estado e marcos das trocas anteriores). As regras de decisão estão em nucleo/troca.js; aqui só se lê, grava e calcula a impressão.
import { carregarEstado } from './repositorio.js';
import { fazerBackup, lerBackup, restaurarBackup } from './backup.js';
import { conteudoParaImpressao, decidirTroca, estadoVazio, arquivosQueFaltam, marcosDepoisDaTroca, nomeDoAparelho, unirMarcos } from '../nucleo/troca.js';
import { chaveImagemCartao } from '../nucleo/materias.js';

export const CHAVE_TROCA = 'troca';

export function linhasDeConfig(db) {
  const r = db.exec('SELECT chave, valor FROM config');
  return r.length ? r[0].values : [];
}

/** Impressão digital (SHA-256, 32 letras) do conteúdo do banco. */
export async function impressaoDigital(db) {
  const bytes = new TextEncoder().encode(conteudoParaImpressao(carregarEstado(db), linhasDeConfig(db)));
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** { aparelho: { id, nome }, marcos } guardado fora do banco (assim restaurar um backup não apaga o histórico de trocas). */
export async function lerEstadoTroca(armazenamento, userAgent = globalThis.navigator?.userAgent ?? '') {
  const guardado = await armazenamento.lerExtra(CHAVE_TROCA);
  if (guardado?.aparelho?.id) return guardado;
  return { aparelho: { id: globalThis.crypto.randomUUID(), nome: nomeDoAparelho(userAgent) }, marcos: [] };
}
const gravarEstadoTroca = (armazenamento, estado) => armazenamento.gravarExtra(CHAVE_TROCA, estado);

/** Gera o pacote de troca. Anota o estado de agora como marco (o outro aparelho vai reconhecê-lo). */
export async function gerarPacote({ db, armazenamento, completo = false, agora = new Date().toISOString(), userAgent }) {
  const est = await lerEstadoTroca(armazenamento, userAgent), impressao = await impressaoDigital(db);
  const marcos = marcosDepoisDaTroca({ impressao, marcos: est.marcos }, null, 'envio');
  const troca = { app: 'ohara', aparelho: est.aparelho, impressao, marcos, gerado_em: agora };
  const r = await fazerBackup({ db, armazenamento, completo, agora, extras: { 'troca.json': JSON.stringify(troca) }, prefixoNome: `ohara-troca-${est.aparelho.nome.toLowerCase()}` });
  await gravarEstadoTroca(armazenamento, { ...est, marcos });
  return { ...r, impressao };
}

/** Lê o pacote (sem alterar nada) e diz o que fazer. Um .zip de backup comum também serve (sem histórico, só entra se o aparelho estiver vazio ou igual). */
export async function analisarPacote({ SQL, db, armazenamento, zip, userAgent }) {
  const lido = lerBackup(SQL, zip), est = await lerEstadoTroca(armazenamento, userAgent);
  const doPacote = { impressao: await impressaoDigital(lido.db), marcos: Array.isArray(lido.troca?.marcos) ? lido.troca.marcos : [] };
  const local = { impressao: await impressaoDigital(db), marcos: est.marcos, vazio: estadoVazio(carregarEstado(db)) };
  const decisao = decidirTroca(local, doPacote);
  const presentes = [...lido.arquivos.map(([id]) => id), ...(await armazenamento.listarArquivos())];
  return {
    ...decisao, local, doPacote, lido,
    origem: lido.troca?.aparelho?.nome ?? null, geradoEm: lido.troca?.gerado_em ?? lido.info.criado_em,
    resumo: lido.resumo, faltam: arquivosQueFaltam(carregarEstado(lido.db), presentes, chaveImagemCartao).length,
  };
}

/**
 * Aplica a decisão. `escolha`: 'pacote' (substitui os dados daqui) ou 'meu' (só dá o pacote como visto). Se os dados daqui forem
 * trocados num conflito, a versão de antes volta em `copiaLocal` (.zip para o usuário guardar) e também fica no aparelho (extras).
 * Devolve { db, copiaLocal } (db só quando mudou).
 */
export async function aplicarPacote({ SQL, db, armazenamento, zip, analise, escolha, agora = new Date().toISOString(), userAgent }) {
  const est = await lerEstadoTroca(armazenamento, userAgent);
  if (escolha === 'meu' || analise.acao === 'igual' || analise.acao === 'nada_novo') {
    const marcos = marcosDepoisDaTroca(analise.local, analise.doPacote, 'meu', null);
    await gravarEstadoTroca(armazenamento, { ...est, marcos });
    return { db: null, copiaLocal: null };
  }
  const copiaLocal = analise.acao === 'conflito' ? await fazerBackup({ db, armazenamento, completo: false, agora, prefixoNome: `ohara-antes-da-troca-${est.aparelho.nome.toLowerCase()}` }) : null;
  const novo = await restaurarBackup({ SQL, armazenamento, dbAtual: db, zip, agora });
  const marcos = marcosDepoisDaTroca(analise.local, analise.doPacote, 'pacote', await impressaoDigital(novo));
  await gravarEstadoTroca(armazenamento, { ...est, marcos: unirMarcos(marcos) });
  return { db: novo, copiaLocal };
}
