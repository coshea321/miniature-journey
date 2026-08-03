// ── Single source of truth — bump this and everything updates ──
const VERSION = 'v391 · 03/08/2026';
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
// cache: "reload" forces these fetches past the normal HTTP cache (v389).
// GitHub Pages serves index.html with a short max-age, so without this a
// new SW installing inside that window could populate the freshly-named
// hearth-vNNN cache with the PREVIOUS build's index.html — cache name says
// vNNN, contents are vNNN-1. It self-heals on a later open via the fetch
// handler's background refresh, but costs another open or two first.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
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
//  - app shell ('/' and index.html): CACHE-FIRST with background refresh
//    (v373) so opening is instant and never waits on the network; updates
//    land via the refreshed cache + the in-page update banner
//  - other same-origin assets: cache-first
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('/sw.js')) return;
  if (url.origin !== self.location.origin) return;

  const isShell = e.request.mode === 'navigate' ||
                  url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isShell) {
    // Cache-first with background refresh (v373). The cached shell paints
    // immediately — opening never waits on the network at all (v295's
    // network-first-with-3.5s-cap still cost 3.5s on every bad-signal
    // open). The network fetch still runs on every open and updates the
    // cache, so the shell a device serves is at most one open behind what
    // it could last download; the page's own update banner offers anything
    // newer that the SW update finds. With no cached copy yet (first ever
    // visit) we wait on the network exactly as before.
    e.respondWith((() => {
      const refresh = fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      });
      return caches.match(e.request, { ignoreSearch: true })
        .then(cached => cached || caches.match('./index.html'))
        .then(cached => {
          if (cached) {
            refresh.catch(() => {}); // background refresh may fail offline — fine
            return cached;
          }
          return refresh;
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
