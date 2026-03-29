import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import type { PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

// TypeScript: narrow globalThis to ServiceWorkerGlobalScope so we get proper
// types without needing the full "webworker" lib (all SW types we need are
// present in lib.dom in TypeScript 5.x).
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// Activate the new SW immediately when it installs, and claim all open clients.
const APP_RUNTIME_CACHE = "app-runtime";
const APP_SHELL_URLS = ["/static/", "/static/index.html", "/index.html"];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  // Best-effort warmup for app shell URLs so the app can bootstrap offline
  // even if navigation fallback key differs across dev/prod paths.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_RUNTIME_CACHE);
      await Promise.all(
        APP_SHELL_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) {
              await cache.put(url, response.clone());
            }
          } catch {
            // Ignore individual warmup failures; runtime requests will retry.
          }
        }),
      );
    })(),
  );
});
clientsClaim();

// Also handle the SKIP_WAITING message sent by workbox-window for autoUpdate.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Precache all static assets emitted by Vite.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Navigation fallback: serve the SPA shell for all navigate requests that are
// not backend API endpoints.
//
// In dev/prod, the precached URL key can vary with base path handling
// (`/index.html`, `/static/index.html`, or `/static/`). We probe the known
// candidates to avoid runtime registration errors.
const navigationFallbackCandidates = [
  "/static/index.html",
  "/index.html",
  "/static/",
  "/",
];

let navigationHandler: ReturnType<typeof createHandlerBoundToURL> | undefined;
for (const candidate of navigationFallbackCandidates) {
  try {
    navigationHandler = createHandlerBoundToURL(candidate);
    break;
  } catch {
    // Try next candidate.
  }
}

if (navigationHandler !== undefined) {
  registerRoute(
    new NavigationRoute(navigationHandler, {
      denylist: [
        /^\/(flight_cone|flight_cone_ws|flight_cone_bounds|raw_height_image|height_map|agl_image|height_image|kml|search_ws|flying_sites|opentopomap|stats)/,
      ],
    }),
  );
}

const API_PATH_PATTERN =
  /^\/(flight_cone|flight_cone_ws|flight_cone_bounds|raw_height_image|height_map|agl_image|height_image|kml|search_ws|flying_sites|opentopomap|stats)/;

function isRuntimeDependencyRequest(request: Request, url: URL): boolean {
  if (url.origin !== self.location.origin) {
    return false;
  }
  if (API_PATH_PATTERN.test(url.pathname)) {
    return false;
  }

  if (request.mode === "navigate") {
    return true;
  }

  if (url.pathname.startsWith("/static/assets/")) {
    return true;
  }

  return /\.(js|mjs|css|wasm|json|map)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isRuntimeDependencyRequest(event.request, url)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached !== undefined) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(APP_RUNTIME_CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        if (event.request.mode === "navigate") {
          const cache = await caches.open(APP_RUNTIME_CACHE);
          return (
            (await cache.match("/static/")) ??
            (await cache.match("/static/index.html")) ??
            (await cache.match("/index.html")) ??
            new Response("Offline", { status: 503, statusText: "Offline" })
          );
        }

        return new Response("Offline asset unavailable", {
          status: 503,
          statusText: "Offline",
        });
      }
    })(),
  );
});

// ---------------------------------------------------------------------------
// Map tile caching
//
// We deliberately use the raw Cache API here – NOT Workbox strategies.
// Workbox strategies call cacheNames.getRuntimeName(cacheName), which prefixes
// every cache name with the SW scope:
//   e.g.  "workbox-map-tiles-https://example.com/static/"
// That would not match the plain "map-tiles" cache that offline.ts writes to
// from the page context, so tiles pre-fetched offline would never be found.
//
// Keys are the plain URL *string*, consistent with what offline.ts stores
// (see cacheTileUrl).
// ---------------------------------------------------------------------------

const MAP_TILE_CACHE = "map-tiles";

// Only intercept same-origin proxy tile requests (/opentopomap/...).
// Cross-origin tile providers (opentopomap.org, openstreetmap.org, arcgis)
// use no-cors mode which produces opaque responses that browsers like Firefox
// refuse to serve offline. Limiting to the same-origin proxy avoids this.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith("/opentopomap/")
  ) {
    return;
  }

  event.respondWith(
    caches.open(MAP_TILE_CACHE).then(async (cache) => {
      // Look up by URL string so it matches what offline.ts put() with a URL key.
      const cached = await cache.match(event.request.url);
      if (cached !== undefined) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          await cache.put(event.request.url, response.clone());
        }
        return response;
      } catch {
        return new Response("Tile not available offline", {
          status: 503,
          statusText: "Offline",
        });
      }
    }),
  );
});
