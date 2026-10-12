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

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification ? payload.notification.title : '🚌 Transpais';
  const options = {
    body: payload.notification ? payload.notification.body : 'Tu autobús está listo para abordar.',
    icon: 'https://www.transpais.com.mx/favicon.ico',
    vibrate: [200, 100, 200]
  };

  self.registration.showNotification(title, options);
});
