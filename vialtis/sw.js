const V = '3';   // súbelo junto con VIALTIS_VERSION de config.js y los ?v= de index.html
const CACHE = 'vialtis-' + V;
const ASSETS = ['./', 'index.html', 'styles.css?v=' + V, 'config.js?v=' + V, 'core.js?v=' + V, 'auth.js?v=' + V, 'voz.js?v=' + V, 'tv.js?v=' + V, 'panel.js?v=' + V, 'qrcode.js?v=' + V, 'manifest.json', 'icon.svg'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS).catch(function () {}); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('vialtis-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
/* Primero la red (para tomar versiones nuevas); si no hay internet, lo guardado: así la TV arranca aunque se caiga el internet */
self.addEventListener('fetch', function (e) {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(function (res) { if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); } return res; }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match('index.html'); }); }));
});
