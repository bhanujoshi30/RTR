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

  // Check if the payload has a data field
  if (payload.data) {
    const notificationTitle = payload.data.title;
    const notificationOptions = {
      body: payload.data.body,
      icon: '/favicon.ico',
      data: {
        link: payload.data.link,
      },
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  } else {
    console.log('[firebase-messaging-sw.js] Received background message without data field.');
  }
});

self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received.', event.notification);
  event.notification.close();

  const link = event.notification.data?.link;
  if (link) {
    console.log(`[firebase-messaging-sw.js] Opening window: ${link}`);
    event.waitUntil(clients.openWindow(link));
  } else {
    console.log('[firebase-messaging-sw.js] No link found on notification.');
  }
});
