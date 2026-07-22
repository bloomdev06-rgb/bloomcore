/* BloomCore Service Worker — stratégie network-first anti-stale.
 *
 * ponytail: le SW avait été retiré exprès pour éviter les versions figées après déploiement.
 * On le réintroduit UNIQUEMENT en network-first sur la navigation (le HTML n'est JAMAIS servi
 * depuis le cache tant que le réseau répond) → un nouveau déploiement est toujours pris. Seuls
 * les assets hashés /assets/* (déjà `immutable` côté serveur) sont servis cache-first. /api et
 * /uploads passent au réseau sans interception. Bump CACHE_VERSION à chaque déploiement pour
 * purger l'ancien app-shell.
 */
const CACHE_VERSION = 'bloomcore-v1';
const APP_SHELL = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // tiers (tuiles OSM…) : laisser passer
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return; // dynamique : réseau direct

  // Navigation / HTML → network-first (jamais figé), repli cache si offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_VERSION).then((c) => c.put('/index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Assets hashés immuables → cache-first (retombe sur le réseau au 1er accès).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }
  // reste (icône, manifest…) : cache-first léger.
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});

// --- Web Push (Chantier 2) : reçoit le push et l'affiche ; clic → ouvre/focus l'URL. ---
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'BloomCore';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/' },
      tag: data.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.navigate(target); return client.focus(); }
      }
      return self.clients.openWindow(target);
    }),
  );
});
