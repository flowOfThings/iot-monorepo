/* eslint-disable no-restricted-globals */

// --- IMPORTS MUST BE FIRST ---
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

// --- VERSIONING ---
const SW_VERSION = 'v7';
const SENSOR_CACHE = `sensor-data-cache-${SW_VERSION}`;
const STATIC_CACHE = `static-assets-${SW_VERSION}`;
const IMAGE_CACHE = `images-${SW_VERSION}`;

// --- FORCE NEW SW TO ACTIVATE IMMEDIATELY ---
self.skipWaiting();
clientsClaim();

// --- PRECACHE BUILD FILES ---
precacheAndRoute(self.__WB_MANIFEST);

// --- SAFE PRE-CACHE FOR API ENDPOINT ---
// Install will try to fetch the real API; if that fails we write a short realistic series
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SENSOR_CACHE);
        const apiUrl = 'https://django-iot-backend.onrender.com/api/data/';

        // If there's already a cached entry, keep it — don't overwrite with fallback.
        const existing = await cache.match(apiUrl);
        if (existing) {
          // eslint-disable-next-line no-console
          console.log('SW install: existing /api/data/ found, skipping fallback write');
          return;
        }

        // Best-effort: try to fetch and cache the real API response
        try {
          const resp = await fetch(apiUrl, { cache: 'no-store' });
          if (resp && resp.ok) {
            await cache.put(apiUrl, resp.clone());
            // eslint-disable-next-line no-console
            console.log('SW install: cached real API response');
            return;
          }
        } catch (err) {
          // fetch failed — fall through to put fallback
          // eslint-disable-next-line no-console
          console.warn('SW install: fetch failed, will write fallback', err);
        }

        // Fallback: a short realistic series so the chart renders meaningfully offline
        const now = Date.now();
        const fallbackPayload = [
          { timestamp: new Date(now - 11 * 60 * 1000).toISOString(), temperature: 21.5, humidity: 45.0 },
          { timestamp: new Date(now - 10 * 60 * 1000).toISOString(), temperature: 21.7, humidity: 44.0 },
          { timestamp: new Date(now - 9 * 60 * 1000).toISOString(),  temperature: 21.6, humidity: 44.5 },
          { timestamp: new Date(now - 8 * 60 * 1000).toISOString(),  temperature: 21.8, humidity: 44.0 },
          { timestamp: new Date(now - 7 * 60 * 1000).toISOString(),  temperature: 22.0, humidity: 43.5 },
          { timestamp: new Date(now - 6 * 60 * 1000).toISOString(),  temperature: 22.3, humidity: 43.0 },
          { timestamp: new Date(now - 5 * 60 * 1000).toISOString(),  temperature: 22.1, humidity: 43.2 }
        ];

        const fallbackResponse = new Response(JSON.stringify(fallbackPayload), {
          headers: { 'Content-Type': 'application/json' },
        });
        await cache.put(apiUrl, fallbackResponse);
        // eslint-disable-next-line no-console
        console.log('SW install: wrote fallback payload to cache', apiUrl);
      } catch (err) {
        // Swallow install-time errors so install doesn't fail.
        // eslint-disable-next-line no-console
        console.warn('SW install: unexpected error (ignored):', err);
      }
    })()
  );
});

// --- CLEANUP OLD CACHES ON ACTIVATE ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => ![SENSOR_CACHE, STATIC_CACHE, IMAGE_CACHE].includes(k))
            .map((k) => caches.delete(k))
        );
        // Claim clients so the new SW takes control immediately
        await self.clients.claim();
        // eslint-disable-next-line no-console
        console.log('SW activate: cleaned old caches, active version', SW_VERSION);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('SW activate: cleanup error (ignored):', err);
      }
    })()
  );
});

// --- APP SHELL ROUTING ---
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');

registerRoute(
  ({ request, url }) => {
    if (request.mode !== 'navigate') return false;
    if (url.pathname.startsWith('/_')) return false;
    if (url.pathname.match(fileExtensionRegexp)) return false;
    return true;
  },
  createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html')
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
// Try network, cache successful responses under the URL string, fall back to cache or fallback JSON.
registerRoute(
  ({ url }) =>
    url.origin === 'https://django-iot-backend.onrender.com' && url.pathname.startsWith('/api/data/'),
  async ({ request }) => {
    const cache = await caches.open(SENSOR_CACHE);
    const apiKey = request.url; // stable string key

    // Try network first
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok) {
        // Update cache with fresh response (best-effort)
        try {
          await cache.put(apiKey, networkResponse.clone());
          // eslint-disable-next-line no-console
          console.log('SW runtime: cached network response for', apiKey);
        } catch (err) {
          // ignore cache.put errors
          // eslint-disable-next-line no-console
          console.warn('SW runtime: cache.put failed (ignored)', err);
        }
        return networkResponse;
      }
    } catch (err) {
      // network failed — fall back to cache below
      // eslint-disable-next-line no-console
      console.warn('SW runtime: network fetch failed, will try cache', err);
    }

    // Try to return cached response by exact URL
    try {
      const cached = await cache.match(apiKey);
      if (cached) {
        // eslint-disable-next-line no-console
        console.log('SW runtime: serving cached exact match for', apiKey);
        return cached;
      }
    } catch (err) {
      // ignore
    }

    // If exact match not found, search keys for any entry that contains the API path (handles query params)
    try {
      const keys = await cache.keys();
      // eslint-disable-next-line no-console
      console.log('SW runtime: cache keys:', keys.map(k => k.url));
      const matchReq = keys.find((req) => req.url && req.url.includes('/api/data/'));
      if (matchReq) {
        const cached = await cache.match(matchReq.url || matchReq);
        if (cached) {
          // eslint-disable-next-line no-console
          console.log('SW runtime: serving cached fuzzy match for', matchReq.url || matchReq);
          return cached;
        }
      }
    } catch (err) {
      // ignore
    }

    // As a last resort, return a safe fallback JSON (same shape as install fallback)
    const fallbackPayload = [
      { timestamp: new Date().toISOString(), temperature: 21.0, humidity: 44.0 }
    ];
    // eslint-disable-next-line no-console
    console.log('SW runtime: returning inline fallback payload');
    return new Response(JSON.stringify(fallbackPayload), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
);

// --- ALLOW SKIPWAITING VIA MESSAGE ---
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});