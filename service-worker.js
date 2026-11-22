// À chaque mise en ligne : incrémenter ASSET_VERSION ici ET les « ?v=… » de index.html
const ASSET_VERSION = '22';
const CACHE_NAME = `ffme-cache-v${ASSET_VERSION}`;
const urlsToCache = [
  './',
  'index.html',
  `styles.css?v=${ASSET_VERSION}`,
  `school.js?v=${ASSET_VERSION}`,
  `app.js?v=${ASSET_VERSION}`,
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

  // Hors navigation, on revalide auprès du serveur plutôt que de prendre une copie périmée
  // du cache HTTP du navigateur (GitHub Pages met les fichiers en cache 10 min).
  const networkRequest = event.request.mode === 'navigate'
    ? fetch(event.request)
    : fetch(event.request, { cache: 'no-cache' });
  event.respondWith(
    networkRequest.then(response => {
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

// Additionne le compteur des notifications déjà affichées avec ce « tag » (regroupement)
async function getExistingCount(tag) {
  let count = 0;
  try {
    const existing = await self.registration.getNotifications({ tag });
    existing.forEach(notification => {
      count += (notification.data && Number(notification.data.count)) || 0;
    });
  } catch (error) {
    count = 0;
  }
  return count;
}

async function showPushNotification(data) {
  const icon = new URL('icon-192.png', appBaseUrl).toString();
  const url = new URL(data.url || './', appBaseUrl).toString();
  // Remplace la notification précédente du même sujet sans re-vibrer (renotify: false)
  const show = (title, body, tag, extra = {}) => self.registration.showNotification(title, {
    body,
    tag,
    renotify: false,
    icon,
    badge: icon,
    data: { url, ...extra }
  });

  // Séances reçues : « Nouvelle séance » puis « Tu as reçu N séances »
  if (data.type === 'sessions_assigned') {
    const count = await getExistingCount(SESSIONS_TAG) + (Number(data.count) || 1);
    const title = count > 1 ? `Tu as reçu ${count} séances !` : 'Nouvelle séance !';
    const body = count > 1
      ? "Ouvre l'app pour les découvrir."
      : (data.sessionName ? `« ${data.sessionName} » t'attend.` : "Une nouvelle séance t'attend.");
    return show(title, body, SESSIONS_TAG, { count });
  }

  // Message : début du message, puis « N messages non lus » (une notification par expéditeur)
  if (data.type === 'message') {
    const tag = `message-${data.senderId || 'inconnu'}`;
    const count = await getExistingCount(tag) + 1;
    const body = count > 1 ? `${count} messages non lus` : (data.preview || 'Nouveau message');
    return show(data.senderName || 'Nouveau message', body, tag, { count, chatUserId: data.senderId || '' });
  }

  // Alertes des coachs (cloche activée sur le profil de l'athlète)
  if (data.type === 'athlete_no_sessions') {
    return show(
      'Plus de séance à faire',
      `${data.athleteName || 'Un athlète'} a terminé toutes ses séances.`,
      `coach-no-sessions-${data.athleteId || ''}`
    );
  }
  if (data.type === 'athlete_high_rpe') {
    return show(
      "Ressenti d'effort élevé",
      `${data.athleteName || 'Un athlète'} : ${data.count || 3} de ses ${data.window || 6} dernières séances à un RPE de 8 ou plus.`,
      `coach-high-rpe-${data.athleteId || ''}`
    );
  }

  return show(data.title || 'HDF Climbing', data.body || '', 'general');
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || appIndexUrl;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const appWindow = windows.find(client => client.url.startsWith(appBaseUrl) && 'focus' in client);
      if (appWindow) {
        // App déjà ouverte : on lui demande d'ouvrir directement la conversation
        if (data.chatUserId) appWindow.postMessage({ type: 'open-chat', userId: data.chatUserId });
        return appWindow.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
