// ============================================================
// SERVICE WORKER - cache solo dello "shell" statico dell'app.
// I dati (Firestore/Storage) restano gestiti dagli SDK Firebase,
// che hanno già la propria persistenza offline.
// ============================================================

const CACHE_NAME = "archivio-famiglia-v1";

const SHELL_FILES = [
  "./index.html",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/documenti.js",
  "./js/app.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomi) =>
      Promise.all(
        nomi
          .filter((nome) => nome !== CACHE_NAME)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Non intercettare mai chiamate a Firebase/Google APIs: devono
  // passare sempre dalla rete (o gestite dalla persistenza SDK).
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebasestorage.app") ||
    url.hostname.includes("gstatic.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((risposta) => {
      return risposta || fetch(event.request);
    })
  );
});
