const CACHE_NAME = 'transpais-fids-v3';

// Archivos estáticos indispensables para arrancar sin internet
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'logo.png'
];

// 1. INSTALACIÓN ROBUSTA: Guarda cada archivo individualmente sin cancelar si alguno falta
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) => {
          return cache.add(asset).catch((err) => {
            console.warn('No se pudo guardar en caché el archivo opcional:', asset);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVACIÓN: Limpia cachés antiguos para liberar memoria
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. INTERCEPCIÓN (FETCH): Responde desde la memoria si no hay red
self.addEventListener('fetch', (event) => {
  const requestUrl = event.request.url;

  // No interceptar llamadas a la base de datos de Firebase
  if (requestUrl.includes('firebaseio.com') || requestUrl.includes('identitytoolkit')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          (requestUrl.startsWith(self.location.origin) || requestUrl.includes('/Audio/'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('index.html') || caches.match('./');
        }
      });
    })
  );
});

// 4. NOTIFICACIONES
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: 'https://www.transpais.com.mx/favicon.ico',
      vibrate: [200, 100, 200]
    });
  }
});
