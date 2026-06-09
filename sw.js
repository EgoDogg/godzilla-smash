/* Godzilla Smash — offline service worker (cache-first app shell) */
const CACHE = 'gz-v12';
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
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return resp;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
