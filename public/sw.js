// Service worker: guarda o "esqueleto" do app e o SDK do Firebase para abrir mesmo sem sinal.
// Os dados em si ficam no cache offline do Firestore (IndexedDB), não aqui.
const VERSAO = "cesta-v1";
const ESQUELETO = [
  "./",
  "index.html",
  "app.js",
  "logica.js",
  "styles.css",
  "firebase-config.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSAO).then((c) => c.addAll(ESQUELETO)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mesmaOrigem = url.origin === self.location.origin;
  const sdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  // Chamadas ao Firestore e ao Auth (googleapis.com) passam direto.
  if (!mesmaOrigem && !sdk) return;

  // Responde com o que está guardado e atualiza em segundo plano.
  e.respondWith(
    caches.match(req).then((guardado) => {
      const rede = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(VERSAO).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => guardado);
      return guardado || rede;
    })
  );
});
