/* eslint-disable no-restricted-globals */

// --- IMPORTS MUST BE FIRST ---
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

// --- VERSIONING ---
const SW_VERSION = 'v9';
const SENSOR_CACHE = `sensor-data-cache-${SW_VERSION}`;
const STATIC_CACHE = `static-assets-${SW_VERSION}`;
const IMAGE_CACHE = `images-${SW_VERSION}`;

// --- FORCE NEW SW TO ACTIVATE IMMEDIATELY ---
self.skipWaiting();
clientsClaim();

// --- PRECACHE BUILD FILES ---
precacheAndRoute(self.__WB_MANIFEST);

// --- PRECACHE OFFLINE FALLBACK PAGE ---
precacheAndRoute([
  { url: '/offline.html', revision: SW_VERSION }
]);

// --- SAFE PRE-CACHE FOR API ENDPOINT ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SENSOR_CACHE);
        const apiUrl = 'https://django-iot-backend.onrender.com/api/data/';

        const existing = await cache.match(apiUrl);
        if (existing) return;

        try {
          const resp = await fetch(apiUrl, { cache: 'no-store' });
          if (resp && resp.ok) {
            await cache.put(apiUrl, resp.clone());
            return;
          }
        } catch (_) {}

        const now = Date.now();
        const fallbackPayload = [
          { timestamp: new Date(now - 11 * 60000).toISOString(), temperature: 21.5, humidity: 45.0 },
          { timestamp: new Date(now - 10 * 60000).toISOString(), temperature: 21.7, humidity: 44.0 },
          { timestamp: new Date(now - 9 * 60000).toISOString(), temperature: 21.6, humidity: 44.5 },
          { timestamp: new Date(now - 8 * 60000).toISOString(), temperature: 21.8, humidity: 44.0 },
          { timestamp: new Date(now - 7 * 60000).toISOString(), temperature: 22.0, humidity: 43.5 },
          { timestamp: new Date(now - 6 * 60000).toISOString(), temperature: 22.3, humidity: 43.0 },
          { timestamp: new Date(now - 5 * 60000).toISOString(), temperature: 22.1, humidity: 43.2 }
        ];

        await cache.put(
          apiUrl,
          new Response(JSON.stringify(fallbackPayload), {
            headers: { 'Content-Type': 'application/json' },
          })
        );
      } catch (_) {}
    })()
  );
});

// --- CLEANUP OLD CACHES ON ACTIVATE ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![SENSOR_CACHE, STATIC_CACHE, IMAGE_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// --- ANDROID-FRIENDLY NAVIGATION WITH OFFLINE FALLBACK ---
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async () => {
    const cache = await caches.open(STATIC_CACHE);

    // Try STATIC_CACHE first
    const cached = await cache.match('/index.html');
    if (cached) return cached;

    // Try precache (Workbox stores index.html there)
    const precached = await caches.match('/index.html');
    if (precached) return precached;

    // Offline fallback page
    const offline = await caches.match('/offline.html');
    if (offline) return offline;

    // Last resort: network (only works online)
    return fetch('/index.html');
  }
);

// --- IMAGE CACHING ---
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.png'),
  new StaleWhileRevalidate({
    cacheName: IMAGE_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 50 })],
  })
);

// --- MANIFEST + FAVICON CACHING ---
registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    (url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('/favicon.ico')),
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 10 })],
  })
);

// --- API ROUTE: resilient handler for /api/data/ ---
registerRoute(
  ({ url }) =>
    url.origin === 'https://django-iot-backend.onrender.com' &&
    url.pathname.startsWith('/api/data/'),
  async ({ request }) => {
    const cache = await caches.open(SENSOR_CACHE);
    const apiKey = request.url;

    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok) {
        try {
          await cache.put(apiKey, networkResponse.clone());
        } catch (_) {}
        return networkResponse;
      }
    } catch (_) {}

    const exact = await cache.match(apiKey);
    if (exact) return exact;

    const keys = await cache.keys();
    const fuzzy = keys.find((req) => req.url.includes('/api/data/'));
    if (fuzzy) {
      const cached = await cache.match(fuzzy.url);
      if (cached) return cached;
    }

    return new Response(
      JSON.stringify([{ timestamp: new Date().toISOString(), temperature: 21.0, humidity: 44.0 }]),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
);

// --- ALLOW SKIPWAITING VIA MESSAGE ---
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});