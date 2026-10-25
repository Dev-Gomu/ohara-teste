// Backup .zip e restauração. O .zip tem: info.json, ohara.sqlite e (no backup completo) arquivos/<id>.
// Restaurar valida tudo ANTES de mexer em qualquer coisa e guarda uma cópia dos dados atuais.
import { zipSync, unzipSync, strToU8, strFromU8 } from '../vendor/fflate.mjs';
import { abrirBanco, exportarBanco, MIGRACOES } from './banco.js';
import { carregarEstado } from './repositorio.js';

export const CHAVE_SEGURANCA = 'antes-da-restauracao';

/** Gera o .zip. `completo` inclui os arquivos (PDFs e imagens) guardados à parte. Devolve { bytes, nome }. */
export async function fazerBackup({ db, armazenamento, completo = false, agora = new Date().toISOString() }) {
  const itens = {
    'info.json': strToU8(JSON.stringify({ app: 'ohara', versao_esquema: MIGRACOES.length, tipo: completo ? 'completo' : 'dados', criado_em: agora }, null, 1)),
    'ohara.sqlite': exportarBanco(db),
  };
  if (completo) {
    for (const id of await armazenamento.listarArquivos()) {
      const blob = await armazenamento.lerArquivo(id);
      if (blob) itens[`arquivos/${id}`] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  return { bytes: zipSync(itens, { level: 6 }), nome: `ohara-backup-${agora.slice(0, 10)}${completo ? '-completo' : ''}.zip` };
}

/** Lê e valida um .zip de backup. Lança Error com mensagem para o usuário se não servir. Não altera nada. */
export function lerBackup(SQL, zip) {
  let itens;
  try { itens = unzipSync(zip); } catch { throw new Error('Este arquivo não é um backup do Ohara (não abriu como .zip).'); }
  if (!itens['info.json'] || !itens['ohara.sqlite']) throw new Error('Este arquivo não é um backup do Ohara (faltam partes).');
  let info;
  try { info = JSON.parse(strFromU8(itens['info.json'])); } catch { throw new Error('O backup está danificado (info ilegível).'); }
  if (info?.app !== 'ohara' || !Number.isInteger(info.versao_esquema)) throw new Error('Este arquivo não é um backup do Ohara.');
  if (info.versao_esquema > MIGRACOES.length) {
    throw new Error(`Este backup foi feito por uma versão mais nova do Ohara (dados v${info.versao_esquema}; este app entende até a v${MIGRACOES.length}). Atualize o app e tente de novo.`);
  }
  let db;
  try { db = abrirBanco(SQL, itens['ohara.sqlite']); } catch { throw new Error('O backup está danificado (os dados não abriram).'); }
  const arquivos = Object.entries(itens).filter(([n]) => n.startsWith('arquivos/') && n.length > 9).map(([n, bytes]) => [n.slice(9), bytes]);
  const estado = carregarEstado(db);
  return { info, db, arquivos, resumo: { criado_em: info.criado_em, tipo: info.tipo, materias: estado.disciplinas.filter((d) => !d.excluido_em).length, aulas: estado.aulas.filter((a) => !a.excluido_em).length, arquivos: arquivos.length } };
}

/**
 * Substitui os dados atuais pelos do backup. Guarda antes uma cópia dos dados atuais (lerExtra(CHAVE_SEGURANCA)).
 * Devolve o banco novo, já migrado para a versão atual e gravado.
 */
export async function restaurarBackup({ SQL, armazenamento, dbAtual, zip, agora = new Date().toISOString() }) {
  const lido = lerBackup(SQL, zip);                      // valida tudo antes de tocar em qualquer dado
  await armazenamento.gravarExtra(CHAVE_SEGURANCA, { bytes: exportarBanco(dbAtual), gravado_em: agora });
  for (const [id, bytes] of lido.arquivos) await armazenamento.gravarArquivo(Number(id), new Blob([bytes]));
  await armazenamento.gravarBanco(exportarBanco(lido.db));
  return lido.db;
}
