/* eslint-disable no-restricted-globals */

// --- IMPORTS MUST BE FIRST ---
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';

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

// --- PRE-CACHE API FALLBACK RESPONSE ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SENSOR_CACHE).then((cache) => {
      const fallbackData = new Response(
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            temperature: 0,
            humidity: 0,
          },
        ]),
        { headers: { "Content-Type": "application/json" } }
      );
      return cache.put(
        "https://django-iot-backend.onrender.com/api/data/",
        fallbackData
      );
    })
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
  ({ url }) =>
    url.origin === self.location.origin &&
    url.pathname.endsWith('.png'),
  new StaleWhileRevalidate({
    cacheName: IMAGE_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 50 })],
  })
);

// --- MANIFEST + FAVICON CACHING ---
registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    (url.pathname.endsWith('/manifest.json') ||
     url.pathname.endsWith('/favicon.ico')),
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 10 })],
  })
);

// --- API CACHING (fresh online, fallback offline) ---
registerRoute(
  ({ url }) =>
    url.origin === 'https://django-iot-backend.onrender.com' &&
    url.pathname.startsWith('/api/data/'),
  async ({ request }) => {
    try {
      const response = await fetch(request);
      const cache = await caches.open(SENSOR_CACHE);
      cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cache = await caches.open(SENSOR_CACHE);
      const cachedResponse = await cache.match(request);
      return cachedResponse || new Response("[]", {
        headers: { "Content-Type": "application/json" },
      });
    }
  }
);

// --- ALLOW SKIPWAITING VIA MESSAGE ---
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});