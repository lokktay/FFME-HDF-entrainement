const CACHE_NAME = 'ffme-cache-v10'; // On change de version pour forcer la mise à jour
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

// 1. Installation du Service Worker
self.addEventListener('install', event => {
  self.skipWaiting(); // Force l'activation immédiate
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Ancien cache supprimé :', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. Interception des requêtes (La correction est ici !)
self.addEventListener('fetch', event => {
  // RÈGLE D'OR : On ignore toutes les requêtes POST, PUT, DELETE et les requêtes Firebase
  if (
      event.request.method !== 'GET' || 
      event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('identitytoolkit.googleapis.com') ||
      event.request.url.includes('google.com')
  ) {
      return; // On laisse passer la requête normalement, sans y toucher
  }

  // Pour les autres requêtes (HTML, CSS, JS, images), on utilise le cache
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Trouvé dans le cache
        }
        return fetch(event.request).then(
          function(networkResponse) {
            // On ne met en cache que les réponses valides
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            var responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
  );
});
