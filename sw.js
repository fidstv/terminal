const CACHE_NAME = 'transpais-fids-v5'; // súbelo (v5, v6...) cada vez que cambies index.html

const STATIC_ASSETS = ['./', 'index.html', 'manifest.json', 'logo.png'];

// Librerías de Firebase: se guardan para poder arrancar aunque no haya internet
const FIREBASE_LIBS = [
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled([
      ...STATIC_ASSETS.map((a) => cache.add(a).catch(() => console.warn('No se pudo guardar:', a))),
      ...FIREBASE_LIBS.map((u) =>
        fetch(new Request(u, { mode: 'no-cors' })).then((r) => cache.put(u, r)).catch(() => console.warn('No se pudo guardar:', u)))
    ])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;
  if (req.method !== 'GET') return;
  if (url.includes('firebaseio.com') || url.includes('identitytoolkit') || url.includes('googleapis.com')) return;
  if (req.headers.has('range')) return; // los audios piden rangos; se dejan pasar a la red

  const sameOrigin = url.startsWith(self.location.origin);

  // Librerías de Firebase: primero caché
  if (FIREBASE_LIBS.includes(url)) {
    event.respondWith(caches.match(url).then((c) => c || fetch(req)));
    return;
  }

  // Páginas y archivos propios: primero red (así llegan las versiones nuevas), caché si no hay internet
  if (sameOrigin) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req).then((c) =>
          c || (req.mode === 'navigate' ? caches.match('index.html').then((i) => i || caches.match('./')) : undefined))
      )
    );
  }
});
