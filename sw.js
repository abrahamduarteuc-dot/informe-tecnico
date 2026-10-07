/* Service worker: deja la app disponible sin conexión.
   No guarda datos de usuario; solo los archivos de la propia página. */
const CACHE = "informe-v2";

/* lo imprescindible para abrir la app */
const NUCLEO = [
  "./",
  "./index.html",
  "./exportar.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];
/* lo pesado: se intenta guardar, pero si falla no impide instalar */
const OPCIONAL = [
  "./xlsx.full.min.js",
  "./docx.min.js",
  "./jspdf.umd.min.js",
  "./jspdf.plugin.autotable.min.js",
  "./carlito-regular.ttf",
  "./carlito-bold.ttf"
];
const FUENTES_WEB = ["fonts.googleapis.com", "fonts.gstatic.com"];
const ESTATICO = /\.(?:ttf|png)$|xlsx\.full\.min\.js$|docx\.min\.js$|jspdf[^/]*\.js$/;

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(NUCLEO).then(() => Promise.all(OPCIONAL.map(u => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* primero la red (así llegan las actualizaciones); si no responde en 4 s o no hay señal, la copia guardada */
function redPrimero(req, clave) {
  return new Promise(resolve => {
    let listo = false;
    const usarCopia = () => caches.match(clave || req).then(hit => { if (hit && !listo) { listo = true; resolve(hit); } });
    const t = setTimeout(usarCopia, 4000);
    fetch(req).then(r => {
      clearTimeout(t);
      if (r && r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(clave || req, copia)); }
      if (!listo) { listo = true; resolve(r); }
    }).catch(() => {
      clearTimeout(t);
      caches.match(clave || req).then(hit => { if (!listo) { listo = true; resolve(hit || Response.error()); } });
    });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    e.respondWith(redPrimero(req, "./index.html"));
    return;
  }
  const propio = url.origin === self.location.origin;
  if (!propio && !FUENTES_WEB.includes(url.hostname)) return;

  /* archivos pesados que casi no cambian: primero lo guardado */
  if (!propio || ESTATICO.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r && (r.ok || r.type === "opaque")) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return r;
      }))
    );
    return;
  }
  /* el resto (exportar.js, manifiesto): primero la red */
  e.respondWith(redPrimero(req));
});
