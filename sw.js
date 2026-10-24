// ACE Taxi — service worker : notifications push + installation de l'application.
// Aucun contenu n'est mis en cache : l'application affiche toujours les données à jour.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // requis pour l'installation, laisse le navigateur gérer le réseau

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'ACE Taxi', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'ACE Taxi';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.id || undefined,
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200]
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); c.postMessage({ type: 'open-url', url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
