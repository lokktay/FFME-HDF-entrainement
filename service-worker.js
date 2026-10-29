const CACHE_NAME = 'ffme-cache-auto-3';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

// Installation basique
self.addEventListener('install', event => {
  self.skipWaiting(); // Force l'installation immédiate
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  self.clients.claim(); // Prend le contrôle immédiatement
});

// STRATÉGIE NETWORK-FIRST (L'automatisation magique)
self.addEventListener('fetch', event => {
  event.respondWith(
    // 1. On tente d'abord de récupérer le fichier sur internet
    fetch(event.request)
      .then(networkResponse => {
        // Si ça marche (l'utilisateur a du réseau), on met à jour le cache avec la nouvelle version
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // 2. Si le fetch échoue (mode hors-ligne), on va piocher dans le cache
        return caches.match(event.request);
      })
  );
});
