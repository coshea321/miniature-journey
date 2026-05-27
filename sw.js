// ── Single source of truth — bump this and everything updates ──
const VERSION = 'v130 · 27/05/2026 22:53';
const CACHE   = 'hearth-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
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

// Fetch: cache-first for same-origin assets, but never cache sw.js itself
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never intercept requests for the SW file itself
  // Never cache sw.js or index.html — always fetch fresh
  if (url.pathname.endsWith('/sw.js')) return;
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) return;
  if (url.origin === self.location.origin) {
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
  }
});
