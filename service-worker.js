const CACHE_NAME = 'ffme-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

// Installation et mise en cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Interception des requêtes pour servir le cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});