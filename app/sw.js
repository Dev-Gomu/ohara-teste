// Service worker do Ohara: guarda todos os arquivos do app e abre sem internet.
// `arquivos.js` (gerado) traz a lista e a versão; a versão é a soma dos arquivos, então qualquer alteração
// cria um cache novo e o antigo é apagado. O navegador compara o sw.js e o arquivos.js a cada abertura.
importScripts('arquivos.js');
const CACHE = 'ohara-' + self.OHARA.versao;
const LISTA = ['./', ...self.OHARA.arquivos];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(LISTA.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ohara-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true })).then((achou) => achou || fetch(e.request)));
});
self.addEventListener('message', (e) => { if (e.data === 'versao') e.source.postMessage({ versao: self.OHARA.versao }); });
