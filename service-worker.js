/* Gezi Pro — Service Worker
   Offline-first app shell. Veri katmanı IndexedDB'de (bkz. js/idb.js);
   bu SW yalnızca statik kabuğu (HTML/CSS/JS + Leaflet) önbelleğe alır. */

const VERSION    = 'gezi-pro-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const CDN_CACHE   = `${VERSION}-cdn`;

// Subpath (drboybeyi.github.io/gezi-pro) altında çalışsın diye relative.
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/auth.js',
  './js/firebase-config.js',
  './js/state.js',
  './js/idb.js',
  './js/db.js',
  './js/photos.js',
  './js/components/toast.js',
  './js/components/sheet.js',
  './js/components/photoForm.js',
  './js/views/login.js',
  './js/views/galeri.js',
  './js/views/harita.js',
  './js/utils/maps.js',
  './js/utils/exif.js',
  './js/utils/thumbnail.js',
  './assets/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      // Tek bir 404 tüm precache'i düşürmesin: tek tek, best-effort.
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Firebase (RTDB/Auth/Storage) çağrıları asla cache'lenmez.
  if (/firebaseio|firebasedatabase|googleapis|gstatic|firebaseapp/.test(url.hostname)) {
    return; // ağa bırak
  }

  // SPA navigasyonu: network-first, çevrimdışıyken kabuk index'i.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Leaflet gibi CDN varlıkları: cache-first (ilk yüklemeden sonra çevrimdışı çalışır).
  if (!sameOrigin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CDN_CACHE).then(c => c.put(req, clone));
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // Same-origin kabuk: stale-while-revalidate.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        const clone = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(req, clone));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
