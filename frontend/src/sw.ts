/// <reference lib="webworker" />

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
// ---------------------------------------------------------------------------
// Background tile download
// ---------------------------------------------------------------------------

// Types for our download message protocol.
interface StartTileDownloadMessage {
  type: "START_TILE_DOWNLOAD";
  downloadId: string;
  urls: string[];
  concurrency: number;
  useBackgroundFetch?: boolean;
}

interface TileDownloadProgressMessage {
  type: "TILE_DOWNLOAD_PROGRESS";
  downloadId: string;
  done: number;
  total: number;
  totalBytes: number;
}

interface TileDownloadCompleteMessage {
  type: "TILE_DOWNLOAD_COMPLETE";
  downloadId: string;
  totalBytes: number;
}

interface TileDownloadFailedMessage {
  type: "TILE_DOWNLOAD_FAILED";
  downloadId: string;
  error: string;
}

export type TileDownloadMessage =
  | TileDownloadProgressMessage
  | TileDownloadCompleteMessage
  | TileDownloadFailedMessage;

const MAP_TILE_CACHE_BG = "map-tiles";
const BG_FETCH_PREFIX = "offline-tiles";
const BG_FETCH_STALL_TIMEOUT_MS = 8_000;

const bgFetchTotals = new Map<string, number>();
const bgFetchDone = new Map<string, number>();
const bgFetchWatchdogs = new Map<string, number>();
const bgFetchSource = new Map<string, "background-fetch" | "streaming">();
// Tracks downloads already completed via direct result listeners so the global
// SW backgroundfetchsuccess/fail handlers (used on SW restart) don't double-fire.
const bgFetchCompleted = new Set<string>();

type BgFetchRecord = { request: Request; responseReady: Promise<Response> };
type BgFetchRegistrationLike = {
  downloaded: number;
  downloadTotal: number;
  matchAll?: () => Promise<BgFetchRecord[]>;
};

function clearBgFetchState(downloadId: string): void {
  bgFetchTotals.delete(downloadId);
  bgFetchDone.delete(downloadId);
  bgFetchSource.delete(downloadId);
  bgFetchCompleted.add(downloadId);
  const timerId = bgFetchWatchdogs.get(downloadId);
  if (timerId !== undefined) {
    clearTimeout(timerId);
    bgFetchWatchdogs.delete(downloadId);
  }
}

function toBgFetchId(downloadId: string): string {
  return `${BG_FETCH_PREFIX}:${downloadId}`;
}

function fromBgFetchId(id: string): string | undefined {
  if (!id.startsWith(`${BG_FETCH_PREFIX}:`)) {
    return undefined;
  }
  return id.slice(BG_FETCH_PREFIX.length + 1);
}

async function getMatchedRecordCount(
  registration: BgFetchRegistrationLike,
): Promise<number> {
  if (typeof registration.matchAll !== "function") {
    return 0;
  }
  try {
    const records = await registration.matchAll();
    return records.length;
  } catch {
    return 0;
  }
}

async function emitBackgroundFetchProgress(
  downloadId: string,
  registration: BgFetchRegistrationLike,
): Promise<void> {
  const total = bgFetchTotals.get(downloadId) ?? 1;
  const bytesTotal = registration.downloadTotal;
  const bytesDone = registration.downloaded;
  const recordsDone = await getMatchedRecordCount(registration);
  const byteEstimatedDone =
    bytesTotal > 0
      ? Math.round((total * bytesDone) / bytesTotal)
      : (bgFetchDone.get(downloadId) ?? 0) + 1;
  const done = Math.max(
    0,
    Math.min(
      total,
      Math.max(
        recordsDone,
        byteEstimatedDone,
        bgFetchDone.get(downloadId) ?? 0,
      ),
    ),
  );
  bgFetchDone.set(downloadId, done);

  await broadcastToClients({
    type: "TILE_DOWNLOAD_PROGRESS",
    downloadId,
    done,
    total,
    totalBytes: bytesDone,
  });
}

async function finalizeBackgroundFetchSuccess(
  downloadId: string,
  registration: { matchAll: () => Promise<BgFetchRecord[]> },
): Promise<void> {
  const cache = await caches.open(MAP_TILE_CACHE_BG);
  const records = await registration.matchAll();
  const expectedTotal = bgFetchTotals.get(downloadId) ?? records.length;

  let totalBytes = 0;
  let successCount = 0;
  for (const entry of records) {
    try {
      const response = await entry.responseReady;
      if (response.ok) {
        const size = (await response.clone().blob()).size;
        totalBytes += size;
        successCount += 1;
        await cache.put(entry.request.url, response.clone());
      }
    } catch {
      // Failed entries are counted through successCount check below.
    }
  }

  await broadcastToClients({
    type: "TILE_DOWNLOAD_PROGRESS",
    downloadId,
    done: Math.min(expectedTotal, successCount),
    total: expectedTotal,
    totalBytes,
  });

  if (successCount < expectedTotal) {
    await broadcastToClients({
      type: "TILE_DOWNLOAD_FAILED",
      downloadId,
      error: `Background fetch incomplete (${successCount}/${expectedTotal} tiles succeeded)`,
    });
    clearBgFetchState(downloadId);
    return;
  }

  await broadcastToClients({
    type: "TILE_DOWNLOAD_COMPLETE",
    downloadId,
    totalBytes,
  });
  clearBgFetchState(downloadId);
}

async function broadcastToClients(msg: TileDownloadMessage): Promise<void> {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(msg);
  }
}

async function isPageVisible(): Promise<boolean> {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  return clients.some((c) => (c as WindowClient).visibilityState === "visible");
}

async function cacheTileInSw(cache: Cache, url: string): Promise<number> {
  const cached = await cache.match(url);
  if (cached !== undefined) {
    return 0;
  }
  try {
    const response = await fetch(url);
    if (response.ok) {
      const blob = await response.clone().blob();
      await cache.put(url, response);
      return blob.size;
    }
  } catch {
    // Network error — skip this tile silently.
  }
  return 0;
}

async function runTileDownload(
  downloadId: string,
  urls: string[],
  concurrency: number,
): Promise<void> {
  const cache = await caches.open(MAP_TILE_CACHE_BG);
  const total = urls.length;
  let done = 0;
  let totalBytes = 0;
  let lastNotifiedPercent = -1;

  const updateNotification = async (label: string) => {
    if (!("Notification" in self) || Notification.permission !== "granted") {
      return;
    }
    if (await isPageVisible()) {
      return;
    }
    // Show progress notification only when page is hidden.
    const reg = await self.registration;
    await reg.showNotification("Hike & Fly — Downloading offline map", {
      body: label,
      tag: `offline-download-${downloadId}`,
      renotify: false,
      silent: true,
    } as NotificationOptions);
  };

  const onTileDone = async (bytes: number) => {
    done += 1;
    totalBytes += bytes;

    const progress: TileDownloadProgressMessage = {
      type: "TILE_DOWNLOAD_PROGRESS",
      downloadId,
      done,
      total,
      totalBytes,
    };
    await broadcastToClients(progress);

    // Throttle notifications to avoid flooding, update every 5%.
    const percent = Math.floor((done / total) * 100);
    if (percent >= lastNotifiedPercent + 5) {
      lastNotifiedPercent = percent;
      await updateNotification(`${percent}% complete (${done}/${total} tiles)`);
    }
  };

  let nextIndex = 0;
  const runWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= urls.length) return;
      const bytes = await cacheTileInSw(cache, urls[index]);
      await onTileDone(bytes);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, runWorker),
  );

  const complete: TileDownloadCompleteMessage = {
    type: "TILE_DOWNLOAD_COMPLETE",
    downloadId,
    totalBytes,
  };
  await broadcastToClients(complete);

  // Show completion notification if page is in background.
  if ("Notification" in self && Notification.permission === "granted") {
    if (!(await isPageVisible())) {
      const reg = await self.registration;
      await reg.showNotification("Hike & Fly — Offline map ready", {
        body: "Your offline area has been downloaded successfully.",
        tag: `offline-download-${downloadId}`,
        renotify: true,
        silent: false,
      } as NotificationOptions);
    }
  }
}

async function runBackgroundFetchDownload(
  downloadId: string,
  urls: string[],
  concurrency: number,
): Promise<void> {
  const reg = self.registration as ServiceWorkerRegistration & {
    backgroundFetch?: {
      fetch: (
        id: string,
        requests: Array<string | Request>,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
      getIds?: () => Promise<string[]>;
    };
  };

  if (reg.backgroundFetch === undefined) {
    throw new Error("Background Fetch API is not available");
  }

  if (typeof reg.backgroundFetch.fetch !== "function") {
    throw new Error("Background Fetch API is not functional");
  }

  // Probe API health first; some engines expose the shape but reject usage.
  if (typeof reg.backgroundFetch.getIds === "function") {
    await reg.backgroundFetch.getIds();
  }

  bgFetchTotals.set(downloadId, urls.length);
  bgFetchDone.set(downloadId, 1);
  bgFetchSource.set(downloadId, "background-fetch");

  // Some browsers expose backgroundFetch but never dispatch progress/success
  // events. If that happens, automatically fall back to streaming mode.
  const watchdog = setTimeout(() => {
    if (bgFetchSource.get(downloadId) !== "background-fetch") {
      return;
    }
    bgFetchSource.set(downloadId, "streaming");
    void runTileDownload(downloadId, urls, concurrency).catch(
      async (err: unknown) => {
        await broadcastToClients({
          type: "TILE_DOWNLOAD_FAILED",
          downloadId,
          error: err instanceof Error ? err.message : String(err),
        });
        clearBgFetchState(downloadId);
      },
    );
  }, BG_FETCH_STALL_TIMEOUT_MS);
  bgFetchWatchdogs.set(downloadId, watchdog);

  // Emit a first progress message immediately so UI does not appear stuck
  // while the browser schedules and starts background fetch internals.
  await broadcastToClients({
    type: "TILE_DOWNLOAD_PROGRESS",
    downloadId,
    done: 1,
    total: Math.max(1, urls.length),
    totalBytes: 0,
  });

  const rawResult = await reg.backgroundFetch.fetch(
    toBgFetchId(downloadId),
    urls,
    {
      title: "Downloading offline map",
      icons: [{ src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" }],
      downloadTotal: undefined,
    },
  );

  // Attach listeners directly to the BackgroundFetchRegistration object.
  // The global self.addEventListener("backgroundfetchsuccess" / "fail") handlers
  // below are kept as fallback for SW-restart scenarios only.
  const bfReg = rawResult as {
    addEventListener: (type: string, listener: () => void) => void;
    downloaded: number;
    downloadTotal: number;
    matchAll: () => Promise<
      Array<{ request: Request; responseReady: Promise<Response> }>
    >;
  };

  bfReg.addEventListener("progress", () => {
    if (bgFetchSource.get(downloadId) === "streaming") return;

    // First progress event confirms BF is running — cancel the stall watchdog.
    const timerId = bgFetchWatchdogs.get(downloadId);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      bgFetchWatchdogs.delete(downloadId);
    }

    void emitBackgroundFetchProgress(downloadId, bfReg);
  });

  bfReg.addEventListener("fetchsuccess", () => {
    if (bgFetchSource.get(downloadId) === "streaming") return;
    void (async () => {
      try {
        await finalizeBackgroundFetchSuccess(downloadId, bfReg);
      } catch (err) {
        await broadcastToClients({
          type: "TILE_DOWNLOAD_FAILED",
          downloadId,
          error: err instanceof Error ? err.message : String(err),
        });
        clearBgFetchState(downloadId);
      }
    })();
  });

  bfReg.addEventListener("fetchfail", () => {
    if (bgFetchSource.get(downloadId) === "streaming") return;
    void broadcastToClients({
      type: "TILE_DOWNLOAD_FAILED",
      downloadId,
      error: "Background fetch failed",
    });
    clearBgFetchState(downloadId);
  });
}

// ---------------------------------------------------------------------------
// Global BF events – used as fallback when the SW restarts mid-download and
// the per-registration listeners above are no longer in memory.
// bgFetchCompleted guards against double-firing when direct listeners already
// handled the event in the same SW lifetime.
// ---------------------------------------------------------------------------
self.addEventListener("backgroundfetchprogress", (event) => {
  const extendableEvent = event as ExtendableEvent;
  const bfEvent = event as Event & {
    registration: {
      id: string;
      downloaded: number;
      downloadTotal: number;
      matchAll?: () => Promise<BgFetchRecord[]>;
    };
  };
  const downloadId = fromBgFetchId(bfEvent.registration.id);
  if (downloadId === undefined) {
    return;
  }
  if (bgFetchCompleted.has(downloadId)) {
    return;
  }
  if (bgFetchSource.get(downloadId) === "streaming") {
    return;
  }

  extendableEvent.waitUntil(
    emitBackgroundFetchProgress(downloadId, bfEvent.registration),
  );
});

self.addEventListener("backgroundfetchsuccess", (event) => {
  const extendableEvent = event as ExtendableEvent;
  const bfEvent = event as Event & {
    registration: {
      id: string;
      matchAll: () => Promise<
        Array<{ request: Request; responseReady: Promise<Response> }>
      >;
    };
  };
  const downloadId = fromBgFetchId(bfEvent.registration.id);
  if (downloadId === undefined) {
    return;
  }
  if (bgFetchCompleted.has(downloadId)) {
    return;
  }
  if (bgFetchSource.get(downloadId) === "streaming") {
    return;
  }

  extendableEvent.waitUntil(
    (async () => {
      await finalizeBackgroundFetchSuccess(downloadId, bfEvent.registration);
    })().catch(async (err: unknown) => {
      await broadcastToClients({
        type: "TILE_DOWNLOAD_FAILED",
        downloadId,
        error: err instanceof Error ? err.message : String(err),
      });
      clearBgFetchState(downloadId);
    }),
  );
});

self.addEventListener("backgroundfetchfail", (event) => {
  const extendableEvent = event as ExtendableEvent;
  const bfEvent = event as Event & { registration: { id: string } };
  const downloadId = fromBgFetchId(bfEvent.registration.id);
  if (downloadId === undefined) {
    return;
  }
  if (bgFetchCompleted.has(downloadId)) {
    return;
  }
  if (bgFetchSource.get(downloadId) === "streaming") {
    return;
  }
  extendableEvent.waitUntil(
    (async () => {
      await broadcastToClients({
        type: "TILE_DOWNLOAD_FAILED",
        downloadId,
        error: "Background fetch failed",
      });
      clearBgFetchState(downloadId);
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data as StartTileDownloadMessage | { type: string };
  if (data?.type !== "START_TILE_DOWNLOAD") {
    return;
  }
  const msg = data as StartTileDownloadMessage;

  event.waitUntil(
    (async () => {
      if (msg.useBackgroundFetch) {
        try {
          await runBackgroundFetchDownload(
            msg.downloadId,
            msg.urls,
            msg.concurrency,
          );
          return;
        } catch {
          // Fall back immediately to in-SW streaming download so downloads
          // still start on browsers with partial/buggy Background Fetch support.
        }
      }

      await runTileDownload(msg.downloadId, msg.urls, msg.concurrency);
      clearBgFetchState(msg.downloadId);
    })().catch(async (err: unknown) => {
      const failed: TileDownloadFailedMessage = {
        type: "TILE_DOWNLOAD_FAILED",
        downloadId: msg.downloadId,
        error: err instanceof Error ? err.message : String(err),
      };
      await broadcastToClients(failed);
    }),
  );
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
        /^\/(flight_cone|flight_cone_ws|flight_cone_bounds|raw_height_image|height_map|agl_image|height_image|kml|search_ws|flying_sites|opentopomap|openstreetmap|satellite|stats)/,
      ],
    }),
  );
}

const API_PATH_PATTERN =
  /^\/(flight_cone|flight_cone_ws|flight_cone_bounds|raw_height_image|height_map|agl_image|height_image|kml|search_ws|flying_sites|opentopomap|openstreetmap|satellite|stats)/;

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

// Only intercept same-origin proxy tile requests.
// Cross-origin tile providers use no-cors mode which produces opaque responses
// that browsers like Firefox refuse to serve offline. Limiting to same-origin
// proxy endpoints avoids this.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    !(
      url.pathname.startsWith("/opentopomap/") ||
      url.pathname.startsWith("/openstreetmap/") ||
      url.pathname.startsWith("/satellite/")
    )
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
