const CACHE_NAME = 'transpais-fids-v2';

// Archivos estáticos indispensables para arrancar sin internet
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'logo.png'
];

// 1. INSTALACIÓN: Guarda los recursos base en la memoria local de la TV
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVACIÓN: Limpia versiones antiguas de caché para liberar memoria
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

// 3. INTERCEPCIÓN (FETCH): Entrega archivos desde la caché local si no hay internet
self.addEventListener('fetch', (event) => {
  const requestUrl = event.request.url;

  // No interceptar llamadas a la base de datos en tiempo real de Firebase
  if (requestUrl.includes('firebaseio.com') || requestUrl.includes('identitytoolkit')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Si el archivo (HTML, imagen o MP3) ya está en caché, entregarlo al instante
      if (cachedResponse) {
        return cachedResponse;
      }

      // Si no está en caché, descargarlo de la red y guardar una copia para el futuro
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
        // Fallback si la navegación falla por falta total de red
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});

// 4. MANTENIMIENTO: Escuchador para notificaciones emergentes
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: 'https://www.transpais.com.mx/favicon.ico',
      vibrate: [200, 100, 200]
    });
  }
});
