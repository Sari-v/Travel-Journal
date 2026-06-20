const CACHE = 'tj-v5';
const CORE = [
  './', './index.html', './db.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(
    CORE.map(u => c.add(new Request(u, { mode: u.startsWith('http') ? 'no-cors' : 'same-origin' })).catch(() => {}))
  )).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Cross-origin (Leaflet CDN, Wikipedia images): cache-first for speed.
  if (url.origin !== self.location.origin) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => { try { c.put(e.request, copy); } catch (_) {} }); return res;
    })));
    return;
  }
  // Same-origin app shell + data: NETWORK-FIRST so new deploys always show.
  // Cache is only the offline fallback.
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => { try { c.put(e.request, copy); } catch (_) {} }); return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))));
});
