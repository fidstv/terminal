// Configuración Firebase RTDB
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "vialtis-app.firebaseapp.com",
  databaseURL: "https://vialtis-app.firebaseio.com",
  projectId: "vialtis-app",
  storageBucket: "vialtis-app.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
