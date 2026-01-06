/* eslint-disable no-restricted-globals */

// --- IMPORTS MUST BE FIRST ---
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

// --- VERSIONING ---
const SW_VERSION = 'v6';
const SENSOR_CACHE = `sensor-data-cache-${SW_VERSION}`;
const STATIC_CACHE = `static-assets-${SW_VERSION}`;
const IMAGE_CACHE = `images-${SW_VERSION}`;

// --- FORCE NEW SW TO ACTIVATE IMMEDIATELY ---
self.skipWaiting();
clientsClaim();

// --- PRECACHE BUILD FILES ---
precacheAndRoute(self.__WB_MANIFEST);

// --- SAFE PRE-CACHE FOR API ENDPOINT ---
// This ensures the install step never fails when offline.
// We attempt to fetch the real endpoint and cache it; if that fails we write a valid fallback JSON.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SENSOR_CACHE);
        const apiUrl = 'https://django-iot-backend.onrender.com/api/data/';

        // Try to fetch the real API once during install (best-effort).
        // If network is available and returns 200, cache that response.
        // If fetch fails (offline or network error), write a safe fallback response into the cache.
        try {
          const resp = await fetch(apiUrl, { cache: 'no-store' });
          if (resp && resp.ok) {
            await cache.put(apiUrl, resp.clone());
            return;
          }
        } catch (err) {
          // fetch failed — fall through to put fallback
        }

        // Fallback: put a minimal but valid JSON response so the app can parse it offline.
        const fallbackPayload = [
          {
            timestamp: new Date().toISOString(),
            temperature: 0,
            humidity: 0,
          },
        ];
        const fallbackResponse = new Response(JSON.stringify(fallbackPayload), {
          headers: { 'Content-Type': 'application/json' },
        });
        await cache.put(apiUrl, fallbackResponse);
      } catch (err) {
        // Swallow any install-time errors so install doesn't fail.
        // Logging is safe for debugging in DevTools.
        // eslint-disable-next-line no-console
        console.warn('SW install: failed to pre-cache API (ignored):', err);
      }
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
      // Claim clients so the new SW takes control immediately
      await self.clients.claim();
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
// Try network, cache successful responses, fall back to cache or fallback JSON.
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
        } catch (err) {
          // ignore cache.put errors
        }
        return networkResponse;
      }
    } catch (err) {
      // network failed — fall back to cache below
    }

    // Try to return cached response by exact URL
    try {
      const cached = await cache.match(apiKey);
      if (cached) return cached;
    } catch (err) {
      // ignore
    }

    // If exact match not found, search keys for any entry that contains the API path (handles query params)
    try {
      const keys = await cache.keys();
      const matchReq = keys.find((req) => req.url && req.url.includes('/api/data/'));
      if (matchReq) {
        const cached = await cache.match(matchReq.url || matchReq);
        if (cached) return cached;
      }
    } catch (err) {
      // ignore
    }

    // As a last resort, return a safe fallback JSON (same shape as install fallback)
    const fallbackPayload = [
      {
        timestamp: new Date().toISOString(),
        temperature: 0,
        humidity: 0,
      },
    ];
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