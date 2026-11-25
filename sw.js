// Offline start for Video Map.
//
// Only the app's own files are handled here. The map, place data, YouTube
// and video links are on other sites and always go straight to the network.

const VERSION = '1.13.0';
const CACHE = `video-map-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/lib.js',
  './js/landmarks.js',
  './js/models.js',
  './js/districts.js',
  './js/districts-data.js',
  './js/plots.js',
  './js/roadside.js',
  './js/cuttings.js',
  './js/airliner.js',
  './js/sky.js',
  './js/stars.js',
  './js/flights.js',
  './js/dress.js',
  './js/roofs.js',
  './js/walls.js',
  './js/shade.js',
  './js/map.js',
  './js/life.js',
  './js/fleet.js',
  './js/signals.js',
  './js/people.js',
  './js/houses.js',
  './js/boulevard.js',
  './js/kafd.js',
  './js/kafd-data.js',
  './js/kapsarc-data.js',
  './js/famous.js',
  './js/solids.js',
  './js/props.js',
  './js/fronts.js',
  './js/kit.js',
  './models/pagoda.vmm',
  './models/pagoda.jpg',
  './models/hall.vmm',
  './models/hall.jpg',
  './models/pylon.vmm',
  './models/pylon.jpg',
  './models/church.vmm',
  './models/church.jpg',
  './models/house.vmm',
  './models/fronts.jpg',
  './js/lights.js',
  './js/scene.js',
  './js/sight.js',
  './js/services.js',
  './vendor/maplibre/maplibre-gl.js',
  './vendor/maplibre/maplibre-gl.css',
  './vendor/maplibre/mapbox-gl-rtl-text.js',
  './vendor/pmtiles/pmtiles.js',
  './vendor/earcut/earcut.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// How long to wait for the network before showing the saved copy.
const NETWORK_WAIT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('video-map-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  if (request.headers.has('range')) return; // partial requests (media seeking) cannot be saved
  event.respondWith(freshThenSaved(request));
});

// Newest version when the connection is good; the saved copy when it is slow or gone.
async function freshThenSaved(request) {
  const cache = await caches.open(CACHE);
  let saved = await cache.match(request, { ignoreSearch: true });
  if (!saved && request.mode === 'navigate') saved = await cache.match('./index.html');

  const fresh = fetch(request).then((response) => {
    // Only complete, successful answers are worth keeping.
    if (response.status === 200) cache.put(request, response.clone()).catch(() => {});
    return response;
  });

  if (!saved) return fresh;

  const fallback = saved;
  const waited = new Promise((resolve) => setTimeout(() => resolve(fallback), NETWORK_WAIT_MS));
  return Promise.race([fresh.catch(() => fallback), waited]);
}
