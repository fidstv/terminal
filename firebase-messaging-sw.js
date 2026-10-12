importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
  apiKey: "AIzaSyBCu8E1b_xoHeqpRuchnanao9vfTy84OIQ",
  databaseURL: "https://transpais-fids-default-rtdb.firebaseio.com",
  projectId: "transpais-fids",
  messagingSenderId: "562920108882",
  appId: "1:562920108882:web:4b61a6cd076c407eb8408b"
});

const messaging = firebase.messaging();
const ICON = 'https://www.transpais.com.mx/favicon.ico';

self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

/* Mensajes FCM en segundo plano.
   Si el mensaje trae "notification", el navegador ya lo muestra solo;
   mostrarlo aquí también lo duplicaría. Para controlar el aviso, enviar solo "data". */
messaging.onBackgroundMessage(function(payload) {
  if (payload.notification) return;
  const d = payload.data || {};
  return self.registration.showNotification(d.title || '🚌 Transpais', {
    body: d.body || 'Tu autobús está listo para abordar.',
    icon: ICON,
    vibrate: [200, 100, 200],
    tag: d.tag || 'transpais',
    renotify: true,
    data: { url: d.url || './' }
  });
});

/* Aviso pedido desde la página (antes estaba en un archivo aparte sin registrar) */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: ICON,
      vibrate: [200, 100, 200],
      data: { url: event.data.url || './' }
    });
  }
});

/* Al tocar la notificación se abre o se enfoca la página */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
