// Service worker: offline-first app shell (cache-first, versioned).
const CACHE_NAME = 'block-puzzle-v1';

const APP_SHELL = [
    './',
    './index.html',
    './css/style.css',
    './script/core.js',
    './script/main.js',
    './manifest.webmanifest',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/maskable-512.png',
    './assets/icons/apple-touch-icon.png',
    './assets/fonts/poppins-400.woff2',
    './assets/fonts/poppins-600.woff2',
    './assets/fonts/poppins-700.woff2',
    './assets/bomb_icon.png',
    './assets/swap_icon.png',
    './assets/ingame_currency.png',
    './assets/gemstone_ruby.png',
    './assets/gemstone_sapphire.png',
    './assets/gemstone_emerald.png',
    './assets/gemstone_amethyst.png',
    './assets/gemstone_diamond.png',
    './assets/gemstone_stone.png',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // Same-origin only; let the network handle everything else.
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        // Navigation: network first so new deploys show up, cache fallback offline.
        event.respondWith(
            fetch(request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html').then(r => r || Response.error()))
        );
        return;
    }

    const isCode = /\.(js|css|webmanifest)$/.test(url.pathname);

    if (isCode) {
        // Code assets: network first so new deploys reach returning players,
        // cache fallback for offline.
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request).then(r => r || Response.error()))
        );
        return;
    }

    // Images and fonts: cache first, then network (and cache successful fetches).
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            });
        })
    );
});
