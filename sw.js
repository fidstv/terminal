const V = '32'; // súbelo junto con window.FIDS_VERSION en config.js y con los ?v= de index.html cada vez que publiques cambios
const CACHE_NAME = 'vialtis-v' + V;

const STATIC_ASSETS = ['./', 'index.html', 'styles.css?v=' + V, 'config.js?v=' + V, 'demo.js?v=' + V, 'app.js?v=' + V, 'manifest.json', 'manifest-pasajero.json', 'icon.svg', 'logo.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

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

  // Fuente de Google: se guarda la primera vez con internet para poder usarla sin conexión
  if (url.startsWith('https://fonts.googleapis.com/') || url.startsWith('https://fonts.gstatic.com/')) {
    event.respondWith(
      caches.match(req).then((c) => c || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
    return;
  }
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
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true }).then((c) =>
          c || (req.mode === 'navigate' ? caches.match('index.html').then((i) => i || caches.match('./')) : undefined))
      )
    );
  }
});


/* ===== Avisos con la app cerrada (Web Push) ===== */
self.addEventListener('push', function (event) {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { p = { body: event.data ? event.data.text() : '' }; }
  const n = p.notification || p.data || p;
  event.waitUntil(self.registration.showNotification(n.title || 'Aviso', {
    body: n.body || '', tag: n.tag || 'aviso', icon: 'icon-192.png', badge: 'icon-192.png',
    vibrate: [300, 150, 300], renotify: true, data: { url: n.url || './' }
  }));
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
