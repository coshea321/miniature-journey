// ── Single source of truth — bump this and everything updates ──
const VERSION = 'v322 · 10/07/2026';
const CACHE   = 'hearth-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './purify.min.js',
  './icon-192.png',
  './icon-512.png'
];

// Install: cache all assets, skip waiting immediately
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: delete old caches, take control, tell pages to reload + send version
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: VERSION }));
      })
  );
});

// Respond to version requests from the page
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'GET_VERSION') {
    e.source.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
});

// Fetch strategy:
//  - sw.js itself: never intercepted (browser always fetches it fresh)
//  - app shell ('/' and index.html): NETWORK-FIRST so updates land
//    immediately, falling back to the cached copy when offline —
//    without the fallback the installed app fails to open offline
//  - other same-origin assets: cache-first
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('/sw.js')) return;
  if (url.origin !== self.location.origin) return;

  const isShell = e.request.mode === 'navigate' ||
                  url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isShell) {
    // Network-first with a 3.5s cap (v295). On a connection that is present
    // but not passing data ("lie-fi"), plain network-first waited for the
    // browser's own timeout — a near-blank screen for up to a minute. If the
    // network hasn't answered within 3.5s, serve the cached shell; a late
    // network response still lands in the cache for next open. With no cached
    // copy yet (first ever visit) we keep waiting on the network as before.
    e.respondWith((() => {
      const network = fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      });
      const cachedShell = () =>
        caches.match(e.request, { ignoreSearch: true })
          .then(cached => cached || caches.match('./index.html'));
      const timer = new Promise(resolve => setTimeout(resolve, 3500, '__timeout__'));
      return Promise.race([network.catch(() => '__failed__'), timer]).then(winner => {
        if (winner !== '__timeout__' && winner !== '__failed__') return winner;
        return cachedShell().then(cached => cached || network);
      });
    })());
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
