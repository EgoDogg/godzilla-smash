/* Godzilla Smash — offline service worker (cache-first app shell) */
// CACHE is the AUTHORITY for the live asset version. Keep in sync with
// js/config.js CACHE_VERSION (the in-page console probe) — bump BOTH to ship.
const CACHE = 'gz-v16';
const ASSETS = ['./', './index.html', './manifest.json', './icon-512.png', './icon-192.png',
  './js/config.js', './js/utils.js', './js/iso.js', './js/assets.js', './js/archetypes.js', './js/sprites_special.js',
  './js/audio.js', './js/economy.js', './js/entities.js', './js/world.js', './js/world_events.js',
  './js/input.js', './js/render.js', './js/ui.js', './js/game.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((resp) => {
        // Only cache successful same-origin responses — never a 404/opaque error
        // (caching those would poison the offline shell).
        if (resp && resp.ok && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => {
        // Offline + uncached. Serve the app shell ONLY for navigations. For any other
        // resource (scripts, etc.) return a 503 — NEVER HTML-as-JS: on a partial cache
        // a <script> fed index.html would silently break boot.
        if (e.request.mode === 'navigate' || e.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('/* offline: resource not cached */', {
          status: 503, statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
    )
  );
});
