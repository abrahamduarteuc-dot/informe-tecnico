/* Service worker: deja la app disponible sin conexión.
   No guarda datos de usuario; solo los archivos de la propia página. */
const CACHE = "informe-v1";
const NUCLEO = [
  "./",
  "./index.html",
  "./xlsx.full.min.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];
const FUENTES = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(NUCLEO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // La página: primero la red (así llegan las actualizaciones), y si no hay señal, la copia guardada.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", copia)); return r; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Archivos propios y tipografías: primero lo guardado, y si falta, la red (y se guarda).
  if (url.origin === self.location.origin || FUENTES.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r && (r.ok || r.type === "opaque")) {
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return r;
      }))
    );
  }
});
