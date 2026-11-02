// Núcleo (regras puras, sem I/O): arquivos anexados à aula (PDF e imagem). O conteúdo (blob) fica no armazenamento;
// aqui só o registro: nome, tipo, tamanho. Exclusão vai para a lixeira, como o resto.
import { normalizarNome } from './texto.js';
import { ativas, proximoId } from './materias.js';

export const LIMITE_BYTES = 100 * 1048576;
const IMAGENS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** 'pdf', 'imagem' ou null. Confia no tipo informado pelo navegador e, se vier vazio (acontece no Android), na extensão. */
export function tipoDoArquivo(nome, mime) {
  const m = String(mime ?? '').toLowerCase();
  const ext = String(nome ?? '').toLowerCase().split('.').pop();
  if (m === 'application/pdf' || (!m && ext === 'pdf')) return 'pdf';
  if (m.startsWith('image/') && Object.values(IMAGENS).includes(m)) return 'imagem';
  if (!m && IMAGENS[ext]) return 'imagem';
  return null;
}

export const mimeDoArquivo = (nome, mime) => (mime || (tipoDoArquivo(nome, '') === 'pdf' ? 'application/pdf' : IMAGENS[String(nome).toLowerCase().split('.').pop()] || ''));

export function anexarArquivo(estado, aulaId, { nome, tipo_mime, tamanho }, agora) {
  if (!ativas(estado.aulas).some((a) => a.id === aulaId)) throw new Error('A aula não existe.');
  const limpo = normalizarNome(nome);
  if (!limpo) throw new Error('O arquivo precisa de um nome.');
  const mime = mimeDoArquivo(limpo, tipo_mime);
  if (!tipoDoArquivo(limpo, mime)) throw new Error('Só dá para anexar PDF ou imagem (PNG, JPG, WEBP, GIF). Se for PowerPoint, converta para PDF antes.');
  if (!(tamanho > 0)) throw new Error('O arquivo está vazio.');
  if (tamanho > LIMITE_BYTES) throw new Error('O arquivo passa de 100 MB.');
  const arquivo = { id: proximoId(estado.arquivos), aula_id: aulaId, nome: limpo, tipo_mime: mime, tamanho, criado_em: agora, excluido_em: null };
  return { estado: { ...estado, arquivos: [...estado.arquivos, arquivo] }, arquivo };
}

export function excluirArquivo(estado, id, agora) {
  if (!estado.arquivos.some((a) => a.id === id && !a.excluido_em)) throw new Error('Arquivo não encontrado.');
  return { ...estado, arquivos: estado.arquivos.map((a) => (a.id === id ? { ...a, excluido_em: agora } : a)) };
}

export function restaurarArquivo(estado, id) {
  const f = estado.arquivos.find((a) => a.id === id);
  if (!f || !f.excluido_em) throw new Error('Esse arquivo não está na lixeira.');
  if (!ativas(estado.aulas).some((a) => a.id === f.aula_id)) throw new Error('Restaure a aula antes de restaurar o arquivo.');
  return { ...estado, arquivos: estado.arquivos.map((a) => (a.id === id ? { ...a, excluido_em: null } : a)) };
}

export const arquivosDaAula = (estado, aulaId) => ativas(estado.arquivos).filter((a) => a.aula_id === aulaId).sort((x, y) => x.id - y.id);
export const ehPdf = (arquivo) => tipoDoArquivo(arquivo.nome, arquivo.tipo_mime) === 'pdf';
