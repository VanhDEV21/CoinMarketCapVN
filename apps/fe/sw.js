// sw.js — Service Worker for client-side caching of market API
// Strategy: Network-first for /api/coins/*; fallback to cache when offline.
// Each successful network call overwrites the cache entry (fresh replaces old).

const CACHE_NAME = 'coinapp-coins-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Optionally clean old caches here
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Adjust this predicate if your API origin/paths differ
  const isCoinsApi = url.pathname.startsWith('/api/coins/')
                  || url.pathname === '/api/coins'
                  || url.pathname.startsWith('/api/coins?');
  if (!isCoinsApi) return;

  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Always hit the network, then update cache (fresh replaces old)
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      cache.put(request, response.clone());
      return response;
    }
    // Fallback to cache if non-OK network response
    const cached = await cache.match(request);
    if (cached) return cached;
    return response || new Response('Network error', { status: 502 });
  } catch (err) {
    // Offline: serve cached if available
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: true, message: 'Offline and no cache' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503
    });
  }
}