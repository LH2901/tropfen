// Service Worker: hält alle Dateien offline bereit.
// Bei jeder Änderung an einer Datei VERSION erhöhen, sonst kommt das Update nicht an.
const VERSION = 'tropfen-v1.1.0';
const DATEIEN = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './zuordnung.js',
  './logik.js',
  './plan.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (ev) => {
  // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neue Version gespeichert wird
  ev.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(DATEIEN.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const treffer = await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
      return treffer || fetch(req);
    })
  );
});
