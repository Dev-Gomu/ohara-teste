// "Atualizar o app": apaga a cópia guardada no aparelho (só os arquivos do programa, nunca os seus dados) e baixa tudo de novo.
export async function atualizarApp(aviso) {
  if (!navigator.onLine) { aviso('Sem internet: não dá para atualizar agora.'); return; }
  aviso('Atualizando…');
  try {
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (globalThis.caches) for (const k of await caches.keys()) if (k.startsWith('ohara-')) await caches.delete(k);
  } catch { /* se falhar, recarregar já ajuda */ }
  location.reload();
}
