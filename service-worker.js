// Service Worker disabilitato — deregistra se stesso e cancella tutte le cache
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomi) => Promise.all(nomi.map((nome) => caches.delete(nome))))
      .then(() => self.clients.claim())
  );
});
