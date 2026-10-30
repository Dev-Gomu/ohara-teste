// Nuvem = pasta do aplicativo no Google Drive (escopo drive.appdata: o app só enxerga essa pasta, nada do resto do Drive).
// Guarda UM arquivo (o pacote de troca). `obterToken()` devolve o token de acesso ou lança ErroAutorizacao; `fetch` é injetado para testar.
// Duas proteções: (1) uma operação por vez (dois cliques seguidos não criam dois arquivos); (2) se acharem duplicados, vale o mais recente e os outros são apagados.
import { ErroVersao } from './sincronia.js';

export const NOME_ARQUIVO = 'ohara-sync.zip';
export class ErroAutorizacao extends Error { constructor(msg = 'É preciso autorizar o Google Drive de novo.') { super(msg); this.name = 'ErroAutorizacao'; } }
const API = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export function criarNuvemDrive({ obterToken, fetch: busca = globalThis.fetch.bind(globalThis) }) {
  let fila = Promise.resolve();
  const umPorVez = (f) => { const r = fila.then(f, f); fila = r.catch(() => {}); return r; };

  async function chamar(url, opcoes = {}) {
    const token = await obterToken();
    const r = await busca(url, { ...opcoes, headers: { Authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) } });
    if (r.status === 401 || r.status === 403) throw new ErroAutorizacao();
    if (!r.ok) throw new Error(`O Google Drive respondeu ${r.status}.`);
    return r;
  }
  async function achar() {
    const q = encodeURIComponent(`name='${NOME_ARQUIVO}' and trashed=false`);
    const r = await chamar(`${API}?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&fields=files(id,version,modifiedTime)`);
    const { files = [] } = await r.json();
    for (const extra of files.slice(1)) chamar(`${API}/${extra.id}`, { method: 'DELETE' }).catch(() => {});   // duplicado: fica só o mais recente
    return files[0] ?? null;
  }
  const versaoDe = (f) => `${f.version}`;

  return {
    ler: () => umPorVez(async () => {
      const f = await achar(); if (!f) return null;
      const bytes = new Uint8Array(await (await chamar(`${API}/${f.id}?alt=media`)).arrayBuffer());
      return { bytes, versao: versaoDe(f) };
    }),
    /** `versaoEsperada`: a versão que lemos (null = não devia existir). Se mudou nesse meio tempo, lança ErroVersao. */
    gravar: (bytes, versaoEsperada) => umPorVez(async () => {
      const f = await achar();
      if (f && versaoEsperada !== null && versaoDe(f) !== versaoEsperada) throw new ErroVersao();
      if (!f && versaoEsperada !== null) throw new ErroVersao();
      if (f && versaoEsperada === null) throw new ErroVersao();
      if (f) {
        const r = await chamar(`${UPLOAD}/${f.id}?uploadType=media&fields=version`, { method: 'PATCH', headers: { 'Content-Type': 'application/zip' }, body: bytes });
        return versaoDe(await r.json());
      }
      const limite = 'ohara' + Math.random().toString(36).slice(2);
      const corpo = new Blob([`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: NOME_ARQUIVO, parents: ['appDataFolder'] })}\r\n--${limite}\r\nContent-Type: application/zip\r\n\r\n`, bytes, `\r\n--${limite}--`]);
      const r = await chamar(`${UPLOAD}?uploadType=multipart&fields=version`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: corpo });
      return versaoDe(await r.json());
    }),
  };
}
