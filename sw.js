const CACHE_NAME = 'financeflow-cache-v36';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=36',
  './parser.js?v=36',
  './charts.js?v=36',
  './gdrive.js?v=36',
  './app.js?v=36',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching assets for offline support...');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event (Cleanup old caches)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Clearing old service worker cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network falling back to cache, or Cache first depending on request)
self.addEventListener('fetch', (e) => {
  // Only intercept HTTP/S requests (ignore chrome-extension, etc.)
  if (!e.request.url.startsWith(self.location.origin) && !e.request.url.startsWith('https://cdn.jsdelivr.net')) {
    return;
  }

  // Network-First strategy for normal files to ensure sync logic updates correctly, falling back to cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache clone if response is valid
        if (res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone);
          });
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
