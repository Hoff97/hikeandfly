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
self.addEventListener("install", () => {
  self.skipWaiting();
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
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/static/index.html"), {
    denylist: [
      /^\/(flight_cone|flight_cone_ws|flight_cone_bounds|raw_height_image|height_map|agl_image|height_image|kml|search_ws|flying_sites|opentopomap|stats)/,
    ],
  }),
);

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

function isTileRequest(url: URL): boolean {
  return (
    /^https:\/\/[abc]\.tile\.opentopomap\.org\//.test(url.href) ||
    /^https:\/\/[abc]\.tile\.openstreetmap\.org\//.test(url.href) ||
    /^https:\/\/server\.arcgisonline\.com\//.test(url.href) ||
    url.pathname.startsWith("/opentopomap/")
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isTileRequest(url)) return;

  event.respondWith(
    caches.open(MAP_TILE_CACHE).then(async (cache) => {
      // Look up by URL string so it matches what offline.ts put() with a URL key.
      const cached = await cache.match(event.request.url);
      if (cached !== undefined) return cached;

      try {
        // Cross-origin tiles need no-cors; same-origin proxy tiles use the
        // original request so cookies / auth headers are preserved.
        const fetchReq =
          url.origin !== self.location.origin
            ? new Request(event.request.url, { mode: "no-cors" })
            : event.request;
        const response = await fetch(fetchReq);
        if (response.ok || response.type === "opaque") {
          // Store with URL string key so lookups are unambiguous.
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
