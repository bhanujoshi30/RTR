// This file must be in the public directory.

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
// "Default" Firebase project (the one given to firebase.initializeApp())
const firebaseConfig = {
  apiKey: "AIzaSyAnmbpcC_CG6QH7MJf1QkwNQiBTx98HflQ",
  authDomain: "rtr-poc-v2.firebaseapp.com",
  projectId: "rtr-poc-v2",
  storageBucket: "rtr-poc-v2.firebasestorage.app",
  messagingSenderId: "718759830596",
  appId: "1:718759830596:web:22f974944373fbf6b10811",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    '[firebase-messaging-sw.js] Received background message ',
    payload
  );
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link;
  if (link) {
    event.waitUntil(clients.openWindow(link));
  }
});
