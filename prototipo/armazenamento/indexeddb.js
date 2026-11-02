// Armazenamento no IndexedDB do navegador (mesma interface de memoria.js).
// Loja "extras": cópias de segurança avulsas (ex.: os dados de antes de restaurar um backup).
// Loja "banco": as 2 últimas cópias do banco SQLite inteiro. Loja "arquivos": PDFs e imagens, um blob por id.
// Gravar uma cópia nova e apagar a mais velha acontecem na MESMA transação: ou vale tudo ou nada.

import { COPIAS_GUARDADAS } from './memoria.js';

const NOME = 'ohara';
const VERSAO = 2;

const esperar = (req) => new Promise((ok, erro) => { req.onsuccess = () => ok(req.result); req.onerror = () => erro(req.error); });
const concluir = (tx) => new Promise((ok, erro) => { tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error); tx.onabort = () => erro(tx.error ?? new Error('Gravação cancelada.')); });

export function abrirIndexedDB(fabrica = globalThis.indexedDB, nome = NOME) {
  return new Promise((ok, erro) => {
    const req = fabrica.open(nome, VERSAO);
    req.onupgradeneeded = () => {
      const nomes = req.result.objectStoreNames;
      if (!nomes.contains('banco')) req.result.createObjectStore('banco', { keyPath: 'seq', autoIncrement: true });
      if (!nomes.contains('arquivos')) req.result.createObjectStore('arquivos');
      if (!nomes.contains('extras')) req.result.createObjectStore('extras');   // v2: cópia de segurança antes de restaurar backup
    };
    req.onsuccess = () => ok(criar(req.result));
    req.onerror = () => erro(req.error);
  });
}

function criar(db) {
  return {
    async gravarBanco(bytes) {
      const tx = db.transaction('banco', 'readwrite');
      const loja = tx.objectStore('banco');
      loja.add({ bytes: new Uint8Array(bytes), gravado_em: new Date().toISOString() });
      const chaves = await esperar(loja.getAllKeys());
      chaves.sort((a, b) => b - a).slice(COPIAS_GUARDADAS).forEach((k) => loja.delete(k));
      await concluir(tx);
    },
    async lerCopias() {
      const todas = await esperar(db.transaction('banco').objectStore('banco').getAll());
      return todas.sort((a, b) => b.seq - a.seq).slice(0, COPIAS_GUARDADAS);
    },
    async lerBanco() { return (await this.lerCopias())[0] ?? null; },
    async gravarArquivo(id, blob) { const tx = db.transaction('arquivos', 'readwrite'); tx.objectStore('arquivos').put(blob, id); await concluir(tx); },
    async lerArquivo(id) { return (await esperar(db.transaction('arquivos').objectStore('arquivos').get(id))) ?? null; },
    async apagarArquivo(id) { const tx = db.transaction('arquivos', 'readwrite'); tx.objectStore('arquivos').delete(id); await concluir(tx); },
    async gravarExtra(nome, valor) { const tx = db.transaction('extras', 'readwrite'); tx.objectStore('extras').put(valor, nome); await concluir(tx); },
    async lerExtra(nome) { return (await esperar(db.transaction('extras').objectStore('extras').get(nome))) ?? null; },
    async listarArquivos() { return esperar(db.transaction('arquivos').objectStore('arquivos').getAllKeys()); },
    fechar() { db.close(); },
  };
}
