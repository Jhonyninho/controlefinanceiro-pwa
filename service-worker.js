const CACHE_NAME = 'controle-financeiro-v2';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ===============================
// INSTALL
// ===============================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

// ===============================
// ACTIVATE
// ===============================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ===============================
// FETCH (COM SUPORTE A NAVEGAÇÃO)
// ===============================
self.addEventListener('fetch', event => {

  // 👉 Trata navegação (ESSENCIAL PARA PWA INSTALL)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(res => res || fetch('./index.html'))
    );
    return;
  }

  // 👉 Demais arquivos
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});
