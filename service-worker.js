const CACHE_NAME = 'ffme-cache-v19';
const urlsToCache = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
].map(path => new URL(path, self.registration.scope).toString());
const appBaseUrl = self.registration.scope;
const appIndexUrl = new URL('index.html', appBaseUrl).toString();

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('ffme-cache-') && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      return caches.open(CACHE_NAME)
        .then(cache => cache.put(event.request, response.clone()))
        .then(() => response, () => response);
    }).catch(() => caches.match(event.request).then(response => {
      if (response) return response;
      if (event.request.mode === 'navigate') return caches.match(appIndexUrl);
      return Response.error();
    }))
  );
});

// === NOTIFICATIONS PUSH ===
// Les séances reçues coup sur coup sont regroupées : chaque nouvelle notification REMPLACE la
// précédente (même « tag », sans nouvelle vibration) et le compteur s'additionne.
// Ex. 6 attributions à la suite => une seule notification « Tu as reçu 6 séances ! ».
const SESSIONS_TAG = 'sessions-assigned';

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {};
  }
  event.waitUntil(showPushNotification(data));
});

async function showPushNotification(data) {
  const icon = new URL('icon-192.png', appBaseUrl).toString();
  const url = new URL(data.url || './', appBaseUrl).toString();

  if (data.type === 'sessions_assigned') {
    let previousCount = 0;
    try {
      const existing = await self.registration.getNotifications({ tag: SESSIONS_TAG });
      existing.forEach(notification => {
        previousCount += (notification.data && Number(notification.data.count)) || 0;
      });
    } catch (error) {
      previousCount = 0;
    }
    const count = previousCount + (Number(data.count) || 1);
    const title = count > 1 ? `Tu as reçu ${count} séances !` : 'Nouvelle séance !';
    const body = count > 1
      ? "Ouvre l'app pour les découvrir."
      : (data.sessionName ? `« ${data.sessionName} » t'attend.` : "Une nouvelle séance t'attend.");
    return self.registration.showNotification(title, {
      body,
      tag: SESSIONS_TAG,
      renotify: false,
      icon,
      badge: icon,
      data: { count, url }
    });
  }

  return self.registration.showNotification(data.title || 'HDF Training', {
    body: data.body || '',
    icon,
    badge: icon,
    data: { url }
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || appIndexUrl;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const appWindow = windows.find(client => client.url.startsWith(appBaseUrl) && 'focus' in client);
      if (appWindow) return appWindow.focus();
      return self.clients.openWindow(target);
    })
  );
});
