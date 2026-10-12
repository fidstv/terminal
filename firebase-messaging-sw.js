importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
  apiKey: "AIzaSyBCu8E1b_xoHeqpRuchnanao9vfTy84OIQ",
  databaseURL: "https://transpais-fids-default-rtdb.firebaseio.com",
  messagingSenderId: "33890288863"
});

const messaging = firebase.messaging();

// Recibir la señal Push de Google cuando la pantalla está apagada o el navegador cerrado
messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification ? payload.notification.title : '🚌 Transpais';
  const options = {
    body: payload.notification ? payload.notification.body : 'Tu autobús está listo para abordar.',
    icon: 'https://www.transpais.com.mx/favicon.ico',
    vibrate: [200, 100, 200]
  };

  self.registration.showNotification(title, options);
});
