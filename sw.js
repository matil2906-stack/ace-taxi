const CACHE_NAME = 'ace-taxi-v1';
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
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
