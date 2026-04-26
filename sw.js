importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCBKvI7dSauqWzeFd0KEDIMS8EJTZ5xj4Y",
  authDomain: "ace-taxi-a60b9.firebaseapp.com",
  projectId: "ace-taxi-a60b9",
  storageBucket: "ace-taxi-a60b9.firebasestorage.app",
  messagingSenderId: "390648146701",
  appId: "1:390648146701:web:fe0280d8239e97e1e1de44"
});

const messaging = firebase.messaging();

// Notif reçue quand l'app est en arrière-plan
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'ACE TAXI', {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data || {}
  });
});

// Cache PWA
const CACHE_NAME = 'ace-taxi-v2';
const urlsToCache = [
  '/patron.html',
  '/employe.html',
  '/manifest-patron.json',
  '/manifest-employe.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
