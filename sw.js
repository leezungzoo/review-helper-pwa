const CACHE = 'review-helper-v32';
const ASSETS = ['./', './index.html', './style.css', './app.js?v=32', './manifest.webmanifest', './icon.svg', './app-icon-user.png', './forest-banner-user.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(response => response || fetch(event.request))));
