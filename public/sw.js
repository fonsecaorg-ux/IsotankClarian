const CACHE = 'isotank-v1';
const ASSETS = ['/'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
);

self.addEventListener('fetch', e => {
  // Network-first para o POST /generate (sempre online)
  if (e.request.method === 'POST') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
