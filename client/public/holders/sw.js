// LUNC Dev Wallet Scope — minimal service worker.
// Strategy: NETWORK-FIRST for everything. The network response is always
// used when reachable, so live chain/API data is never stale. The cache
// holds only the page shell and is used solely as an offline fallback.
var CACHE = 'luncscope-shell-v1';
var SHELL = '/holders/';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.add(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  // Only GET requests are handled; everything else passes straight through.
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match(SHELL);
        return Response.error();
      });
    })
  );
});
