import type { SearchResult } from "../components/SearchCard";
import type { HeightMapResponse } from "./types";
import { LatLngBounds } from "leaflet";

const OFFLINE_DB_NAME = "hikeandfly-offline";
const OFFLINE_DB_VERSION = 1;
const DOWNLOADS_STORE = "downloads";
const HEIGHT_MAPS_STORE = "heightMaps";
const FLYING_SITES_STORE = "flyingSites";

export const MAP_TILE_CACHE_NAME = "map-tiles";

export type OfflineTileLayer =
  | "OpenTopoMap Proxy"
  | "OpenStreetMap"
  | "Satellite";

export const OFFLINE_TILE_LAYERS: OfflineTileLayer[] = [
  "OpenTopoMap Proxy",
  "OpenStreetMap",
  "Satellite",
];

export type BoundsTuple = [number, number, number, number];

export interface OfflineDownloadRecord {
  id: string;
  name: string;
  createdAt: number;
  bounds: BoundsTuple;
  gridSize: number;
  baseLayerName: string;
  tileLayers?: OfflineTileLayer[];
  tileZooms: number[];
  tileCount: number;
  siteCount: number;
}

interface StoredHeightMapRecord {
  id: string;
  downloadId: string;
  bounds: BoundsTuple;
  gridSize: number;
  map: HeightMapResponse;
  createdAt: number;
}

interface StoredFlyingSitesRecord {
  id: string;
  downloadId: string;
  bounds: BoundsTuple;
  sites: SearchResult[];
  createdAt: number;
}

export interface OfflineDownloadProgress {
  active: boolean;
  label: string;
  completed: number;
  total: number;
}

interface HeightMapMetaResponse {
  cell_size: number;
  min_cell_size: number;
  lat: [number, number];
  lon: [number, number];
  start_ix: [number, number];
  grid_shape: [number, number];
}

let offlineAreaSelectionActive = false;

export function setOfflineAreaSelectionActive(active: boolean): void {
  offlineAreaSelectionActive = active;
}

export function isOfflineAreaSelectionActive(): boolean {
  return offlineAreaSelectionActive;
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openOfflineDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await action(store);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return result;
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOWNLOADS_STORE)) {
        db.createObjectStore(DOWNLOADS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(HEIGHT_MAPS_STORE)) {
        db.createObjectStore(HEIGHT_MAPS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FLYING_SITES_STORE)) {
        db.createObjectStore(FLYING_SITES_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function boundsToTuple(bounds: LatLngBounds): BoundsTuple {
  return [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ];
}

function tupleContainsBounds(
  container: BoundsTuple,
  inner: BoundsTuple,
): boolean {
  return (
    inner[0] >= container[0] &&
    inner[1] >= container[1] &&
    inner[2] <= container[2] &&
    inner[3] <= container[3]
  );
}

function tuplesIntersect(a: BoundsTuple, b: BoundsTuple): boolean {
  return !(a[3] < b[1] || a[1] > b[3] || a[2] < b[0] || a[0] > b[2]);
}

function area(bounds: BoundsTuple): number {
  return Math.abs((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]));
}

function tupleToBounds(bounds: BoundsTuple): LatLngBounds {
  return new LatLngBounds([bounds[0], bounds[1]], [bounds[2], bounds[3]]);
}

function getSubdomain(x: number, y: number): string {
  return ["a", "b", "c"][(x + y) % 3];
}

function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (clampLat(lat) * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      2 ** zoom,
  );
}

function clampTileX(x: number, zoom: number): number {
  const max = 2 ** zoom - 1;
  return Math.max(0, Math.min(max, x));
}

function clampTileY(y: number, zoom: number): number {
  const max = 2 ** zoom - 1;
  return Math.max(0, Math.min(max, y));
}

// Use same-origin proxy tile endpoints for all offline-cached layers.
// Cross-origin tile providers return opaque (no-cors) responses which
// Firefox and some other browsers refuse to serve from a service worker
// while offline.
function tileProxyUrl(
  layer: OfflineTileLayer,
  zoom: number,
  x: number,
  y: number,
): string {
  if (layer === "OpenStreetMap") {
    return `${window.location.origin}/openstreetmap/${getSubdomain(x, y)}/${zoom}/${x}/${y}.png`;
  }
  if (layer === "Satellite") {
    return `${window.location.origin}/satellite/${zoom}/${y}/${x}.jpg`;
  }
  return `${window.location.origin}/opentopomap/${getSubdomain(x, y)}/${zoom}/${x}/${y}.png`;
}

export function buildTileZoomLevels(currentZoom: number): number[] {
  // Always include zooms 13 and 15 as useful intermediate levels for offline use.
  const zooms = new Set<number>([13, 15]);
  for (
    let zoom = Math.max(0, currentZoom - 2);
    zoom <= Math.min(18, currentZoom + 2);
    zoom += 2
  ) {
    zooms.add(zoom);
  }
  return Array.from(zooms).sort((a, b) => a - b);
}

function buildTileRange(
  bounds: LatLngBounds,
  zoom: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const west = clampTileX(lonToTileX(bounds.getWest(), zoom), zoom);
  const east = clampTileX(lonToTileX(bounds.getEast(), zoom), zoom);
  const north = clampTileY(latToTileY(bounds.getNorth(), zoom), zoom);
  const south = clampTileY(latToTileY(bounds.getSouth(), zoom), zoom);

  return {
    minX: Math.min(west, east),
    maxX: Math.max(west, east),
    minY: Math.min(north, south),
    maxY: Math.max(north, south),
  };
}

export function buildTileUrlsForBounds(
  bounds: LatLngBounds,
  zoomLevels: number[],
  tileLayers: OfflineTileLayer[] = ["OpenTopoMap Proxy"],
): string[] {
  const urls = new Set<string>();
  for (const zoom of zoomLevels) {
    const { minX, maxX, minY, maxY } = buildTileRange(bounds, zoom);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (const layer of tileLayers) {
          urls.add(tileProxyUrl(layer, zoom, x, y));
        }
      }
    }
  }
  return Array.from(urls);
}

function buildTileUrlsForRecord(record: OfflineDownloadRecord): string[] {
  return buildTileUrlsForBounds(
    tupleToBounds(record.bounds),
    record.tileZooms,
    record.tileLayers ?? ["OpenTopoMap Proxy"],
  );
}

async function decodeHeightMapFromBlob(
  blob: Blob,
  expectedShape: [number, number],
): Promise<number[]> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("Failed to decode height map image"));
      image.src = objectUrl;
    });

    if (img.height !== expectedShape[0] || img.width !== expectedShape[1]) {
      throw new Error("Stored height map dimensions do not match metadata");
    }

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("Could not get canvas context");
    }
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const heights: number[] = new Array(expectedShape[0] * expectedShape[1]);

    for (let row = 0; row < expectedShape[0]; row++) {
      for (let col = 0; col < expectedShape[1]; col++) {
        const x = col;
        const y = expectedShape[0] - row - 1;
        const offset = (y * expectedShape[1] + x) * 4;
        heights[row * expectedShape[1] + col] =
          imageData.data[offset] * 256 + imageData.data[offset + 1];
      }
    }

    return heights;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function computeViewportMarginMeters(bounds: LatLngBounds): number {
  const center = bounds.getCenter();
  const latHalfSpanMeters =
    ((bounds.getNorth() - bounds.getSouth()) / 2) * 111_320;
  const lonScale = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.05);
  const lonHalfSpanMeters =
    ((bounds.getEast() - bounds.getWest()) / 2) * 111_320 * lonScale;
  return Math.ceil(Math.max(latHalfSpanMeters, lonHalfSpanMeters));
}

function mapCoversBounds(
  map: HeightMapResponse,
  bounds: LatLngBounds,
): boolean {
  const latMin = Math.min(map.lat[0], map.lat[1]);
  const latMax = Math.max(map.lat[0], map.lat[1]);
  const lonMin = Math.min(map.lon[0], map.lon[1]);
  const lonMax = Math.max(map.lon[0], map.lon[1]);

  return (
    bounds.getSouth() >= latMin &&
    bounds.getNorth() <= latMax &&
    bounds.getWest() >= lonMin &&
    bounds.getEast() <= lonMax
  );
}

async function fetchHeightMapForBounds(
  bounds: LatLngBounds,
  gridSize: number,
): Promise<HeightMapResponse> {
  const center = bounds.getCenter();
  // Include a small buffer to avoid off-by-one/grid rounding misses at bounds edges.
  let marginMeters =
    computeViewportMarginMeters(bounds) +
    Math.max(500, Math.round(gridSize * 8));

  for (let attempt = 0; attempt < 4; attempt++) {
    const metaUrl = new URL(window.location.origin + "/height_map_meta");
    metaUrl.search = new URLSearchParams({
      lat: center.lat.toString(),
      lon: center.lng.toString(),
      cell_size: gridSize.toString(),
      margin_m: marginMeters.toString(),
    }).toString();

    const imageUrl = new URL(window.location.origin + "/height_map_image");
    imageUrl.search = metaUrl.search;

    const [metaResponse, imageResponse] = await Promise.all([
      fetch(metaUrl),
      fetch(imageUrl),
    ]);
    if (!metaResponse.ok || !imageResponse.ok) {
      throw new Error("Failed to download height map data");
    }

    const meta = (await metaResponse.json()) as HeightMapMetaResponse;
    const heights = await decodeHeightMapFromBlob(
      await imageResponse.blob(),
      meta.grid_shape,
    );

    const map: HeightMapResponse = {
      cell_size: meta.cell_size,
      min_cell_size: meta.min_cell_size,
      lat: meta.lat,
      lon: meta.lon,
      start_ix: meta.start_ix,
      grid_shape: meta.grid_shape,
      heights,
    };

    if (mapCoversBounds(map, bounds)) {
      return map;
    }

    marginMeters = Math.round(
      marginMeters * 1.35 + Math.max(500, gridSize * 6),
    );
  }

  throw new Error("Downloaded height map does not fully cover selected area");
}

async function fetchFlyingSitesForBounds(
  bounds: LatLngBounds,
): Promise<SearchResult[]> {
  const url = new URL(window.location.origin + "/flying_sites");
  url.search = new URLSearchParams({
    min_lat: bounds.getSouth().toString(),
    max_lat: bounds.getNorth().toString(),
    min_lon: bounds.getWest().toString(),
    max_lon: bounds.getEast().toString(),
    limit: "5000",
  }).toString();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to download flying site data");
  }
  return (await response.json()) as SearchResult[];
}

// Use plain URL string as cache key so the service worker's
// cache.match(event.request.url) lookup finds the same entry.
async function cacheTileUrl(cache: Cache, url: string): Promise<void> {
  const cached = await cache.match(url);
  if (cached !== undefined) {
    return;
  }
  // All supported offline tile URLs are same-origin proxy URLs.
  // Keep a no-cors fallback path for any future cross-origin additions.
  const fetchReq = url.startsWith(window.location.origin)
    ? url
    : new Request(url, { mode: "no-cors" });
  const response = await fetch(fetchReq);
  if (response.ok || response.type === "opaque") {
    await cache.put(url, response.clone());
  }
}

async function cacheTileUrlsConcurrently(
  cache: Cache,
  urls: string[],
  concurrency: number,
  onStored: (done: number, total: number) => void,
): Promise<void> {
  if (urls.length === 0) {
    return;
  }

  const workerCount = Math.max(1, Math.min(concurrency, urls.length));
  let nextIndex = 0;
  let done = 0;

  const runWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= urls.length) {
        return;
      }

      await cacheTileUrl(cache, urls[index]);
      done += 1;
      onStored(done, urls.length);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
}

async function verifyTileUrlsCached(
  cache: Cache,
  urls: string[],
): Promise<number> {
  let missing = 0;
  for (const url of urls) {
    const cached = await cache.match(url);
    if (cached === undefined) {
      missing++;
    }
  }
  return missing;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (
    !("storage" in navigator) ||
    typeof navigator.storage.persist !== "function"
  ) {
    return false;
  }
  return navigator.storage.persist();
}

export async function listOfflineDownloads(): Promise<OfflineDownloadRecord[]> {
  return withStore(DOWNLOADS_STORE, "readonly", async (store) => {
    return (await promisifyRequest(store.getAll())) as OfflineDownloadRecord[];
  });
}

export async function getOfflineDownloadForBounds(
  bounds: LatLngBounds,
): Promise<OfflineDownloadRecord | undefined> {
  const downloads = await listOfflineDownloads();
  const viewport = boundsToTuple(bounds);
  return downloads
    .filter((entry) => tupleContainsBounds(entry.bounds, viewport))
    .sort((a, b) => area(a.bounds) - area(b.bounds))[0];
}

// Find the smallest stored height map whose bounds contain the given center
// point at the requested grid size.  We only require the center to be contained
// (not the full search radius) so that locations near the boundary of a
// downloaded area can still use the stored map — cropHeightMapWithPad will
// zero-fill any region that extends outside the stored coverage.
export async function findStoredHeightMap(
  lat: number,
  lon: number,
  gridSize: number,
): Promise<HeightMapResponse | undefined> {
  const maps = await withStore(HEIGHT_MAPS_STORE, "readonly", async (store) => {
    return (await promisifyRequest(store.getAll())) as StoredHeightMapRecord[];
  });

  const matches = maps
    .filter(
      (entry) =>
        Math.abs(entry.gridSize - gridSize) <= Math.max(1, gridSize * 0.03) &&
        lat >= entry.bounds[0] &&
        lat <= entry.bounds[2] &&
        lon >= entry.bounds[1] &&
        lon <= entry.bounds[3],
    )
    .sort((a, b) => {
      const gridDiff =
        Math.abs(a.gridSize - gridSize) - Math.abs(b.gridSize - gridSize);
      if (Math.abs(gridDiff) > 0.001) {
        return gridDiff;
      }
      return area(a.bounds) - area(b.bounds);
    });

  return matches[0]?.map;
}

export async function isLocationDownloaded(latLng: {
  lat: number;
  lng: number;
}): Promise<boolean> {
  const downloads = await listOfflineDownloads();
  const { lat, lng } = latLng;
  return downloads.some(
    (entry) =>
      lat >= entry.bounds[0] &&
      lat <= entry.bounds[2] &&
      lng >= entry.bounds[1] &&
      lng <= entry.bounds[3],
  );
}

export async function getPreferredOfflineGridSize(
  bounds: LatLngBounds,
): Promise<number | undefined> {
  return (await getOfflineDownloadForBounds(bounds))?.gridSize;
}

export async function getOfflineFlyingSites(
  bounds: LatLngBounds,
): Promise<SearchResult[]> {
  const viewport = boundsToTuple(bounds);
  const windows = await withStore(
    FLYING_SITES_STORE,
    "readonly",
    async (store) => {
      return (await promisifyRequest(
        store.getAll(),
      )) as StoredFlyingSitesRecord[];
    },
  );

  const merged = new Map<string, SearchResult>();
  for (const entry of windows) {
    if (!tuplesIntersect(entry.bounds, viewport)) {
      continue;
    }

    for (const site of entry.sites) {
      const lat = site.center[1];
      const lon = site.center[0];
      if (
        lat >= viewport[0] &&
        lat <= viewport[2] &&
        lon >= viewport[1] &&
        lon <= viewport[3]
      ) {
        const key = `${site.name}_${site.center[0]}_${site.center[1]}`;
        merged.set(key, site);
      }
    }
  }

  return Array.from(merged.values());
}

export async function downloadOfflineWindow(
  bounds: LatLngBounds,
  gridSize: number,
  currentZoom: number,
  tileLayers: OfflineTileLayer[],
  onProgress: (progress: OfflineDownloadProgress) => void,
): Promise<void> {
  const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tileZooms = buildTileZoomLevels(currentZoom);
  const selectedLayers: OfflineTileLayer[] =
    tileLayers.length > 0 ? tileLayers : ["OpenTopoMap Proxy"];
  const tileUrls = buildTileUrlsForBounds(bounds, tileZooms, selectedLayers);
  const totalSteps = tileUrls.length + 3;
  let completed = 0;

  const advance = (label: string) => {
    completed += 1;
    onProgress({
      active: true,
      label,
      completed,
      total: totalSteps,
    });
  };

  onProgress({
    active: true,
    label: "Requesting persistent storage",
    completed,
    total: totalSteps,
  });
  await requestPersistentStorage();

  const heightMap = await fetchHeightMapForBounds(bounds, gridSize);
  advance("Height map stored");

  const flyingSites = await fetchFlyingSitesForBounds(bounds);
  advance("Flying sites stored");

  const tileCache = await caches.open(MAP_TILE_CACHE_NAME);
  const tileDownloadConcurrency = Math.min(
    16,
    Math.max(4, navigator.hardwareConcurrency ?? 8),
  );
  await cacheTileUrlsConcurrently(
    tileCache,
    tileUrls,
    tileDownloadConcurrency,
    (done, total) => {
      advance(`Tiles stored (${done}/${total})`);
    },
  );
  const missingTiles = await verifyTileUrlsCached(tileCache, tileUrls);
  if (missingTiles > 0) {
    console.warn(
      `${missingTiles} of ${tileUrls.length} tiles could not be cached (network errors during download).`,
    );
  }

  const record: OfflineDownloadRecord = {
    id: downloadId,
    name: `Window ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    bounds: boundsToTuple(bounds),
    gridSize,
    baseLayerName: selectedLayers[0],
    tileLayers: selectedLayers,
    tileZooms,
    tileCount: tileUrls.length,
    siteCount: flyingSites.length,
  };

  const heightMapRecord: StoredHeightMapRecord = {
    id: `${downloadId}-height-map`,
    downloadId,
    bounds: [
      heightMap.lat[0],
      heightMap.lon[0],
      heightMap.lat[1],
      heightMap.lon[1],
    ],
    gridSize: heightMap.cell_size,
    map: heightMap,
    createdAt: Date.now(),
  };

  const sitesRecord: StoredFlyingSitesRecord = {
    id: `${downloadId}-sites`,
    downloadId,
    bounds: boundsToTuple(bounds),
    sites: flyingSites,
    createdAt: Date.now(),
  };

  await withStore(DOWNLOADS_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.put(record));
    return undefined;
  });
  await withStore(HEIGHT_MAPS_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.put(heightMapRecord));
    return undefined;
  });
  await withStore(FLYING_SITES_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.put(sitesRecord));
    return undefined;
  });

  onProgress({
    active: false,
    label: "Offline download completed",
    completed: totalSteps,
    total: totalSteps,
  });
}

export async function deleteOfflineDownload(downloadId: string): Promise<void> {
  const downloads = await listOfflineDownloads();
  const record = downloads.find((entry) => entry.id === downloadId);
  if (record === undefined) {
    return;
  }

  await withStore(DOWNLOADS_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.delete(downloadId));
    return undefined;
  });
  await withStore(HEIGHT_MAPS_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.delete(`${downloadId}-height-map`));
    return undefined;
  });
  await withStore(FLYING_SITES_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.delete(`${downloadId}-sites`));
    return undefined;
  });

  const cache = await caches.open(MAP_TILE_CACHE_NAME);
  for (const url of buildTileUrlsForRecord(record)) {
    await cache.delete(url);
  }
}

export async function clearOfflineDownloads(): Promise<void> {
  await withStore(DOWNLOADS_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.clear());
    return undefined;
  });
  await withStore(HEIGHT_MAPS_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.clear());
    return undefined;
  });
  await withStore(FLYING_SITES_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.clear());
    return undefined;
  });
  await caches.delete(MAP_TILE_CACHE_NAME);
}
