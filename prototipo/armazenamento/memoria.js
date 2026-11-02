// Armazenamento em memória: mesma interface do IndexedDB (indexeddb.js), usado nos testes.
// Interface: gravarBanco(bytes) · lerCopias() (da mais nova para a mais antiga) · lerBanco() ·
//            gravarExtra(nome, valor) · lerExtra(nome) (cópias de segurança avulsas) · gravarArquivo(id, blob) · lerArquivo(id) · apagarArquivo(id) · listarArquivos()
// Guarda sempre as 2 últimas cópias do banco.

export const COPIAS_GUARDADAS = 2;

export function criarArmazenamentoMemoria(relogio = () => new Date().toISOString()) {
  let copias = []; // mais nova primeiro
  let seq = 0;
  const arquivos = new Map();
  const extras = new Map();
  return {
    async gravarBanco(bytes) {
      copias = [{ seq: ++seq, bytes: new Uint8Array(bytes), gravado_em: relogio() }, ...copias].slice(0, COPIAS_GUARDADAS);
    },
    async lerCopias() { return copias.map((c) => ({ ...c, bytes: new Uint8Array(c.bytes) })); },
    async lerBanco() { return (await this.lerCopias())[0] ?? null; },
    async gravarArquivo(id, blob) { arquivos.set(id, blob); },
    async lerArquivo(id) { return arquivos.get(id) ?? null; },
    async apagarArquivo(id) { arquivos.delete(id); },
    async gravarExtra(nome, valor) { extras.set(nome, valor); },
    async lerExtra(nome) { return extras.get(nome) ?? null; },
    async listarArquivos() { return [...arquivos.keys()]; },
  };
}
