import type { SearchResult } from "../components/SearchCard";
import type { HeightMapResponse } from "./types";
import { LatLngBounds } from "leaflet";

const OFFLINE_DB_NAME = "hikeandfly-offline";
const OFFLINE_DB_VERSION = 1;
const DOWNLOADS_STORE = "downloads";
const HEIGHT_MAPS_STORE = "heightMaps";
const FLYING_SITES_STORE = "flyingSites";

export const MAP_TILE_CACHE_NAME = "map-tiles";

export type BoundsTuple = [number, number, number, number];

export interface OfflineDownloadRecord {
  id: string;
  name: string;
  createdAt: number;
  bounds: BoundsTuple;
  gridSize: number;
  baseLayerName: string;
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

function tileUrlForLayer(
  baseLayerName: string,
  zoom: number,
  x: number,
  y: number,
): string {
  const subdomain = getSubdomain(x, y);
  switch (baseLayerName) {
    case "OpenTopoMap Proxy":
      return `${window.location.origin}/opentopomap/${subdomain}/${zoom}/${x}/${y}.png`;
    case "OpenStreetMap":
      return `https://${subdomain}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
    case "Satellite":
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
    case "OpenTopoMap":
    default:
      return `https://${subdomain}.tile.opentopomap.org/${zoom}/${x}/${y}.png`;
  }
}

function buildTileZoomLevels(currentZoom: number): number[] {
  const result: number[] = [];
  for (
    let zoom = Math.max(0, currentZoom - 2);
    zoom <= Math.min(18, currentZoom + 2);
    zoom += 2
  ) {
    result.push(zoom);
  }
  return result;
}

function buildTileUrls(
  bounds: LatLngBounds,
  currentZoom: number,
  baseLayerName: string,
): string[] {
  const urls = new Set<string>();
  for (const zoom of buildTileZoomLevels(currentZoom)) {
    const minX = lonToTileX(bounds.getWest(), zoom);
    const maxX = lonToTileX(bounds.getEast(), zoom);
    const minY = latToTileY(bounds.getNorth(), zoom);
    const maxY = latToTileY(bounds.getSouth(), zoom);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        urls.add(tileUrlForLayer(baseLayerName, zoom, x, y));
      }
    }
  }
  return Array.from(urls);
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

async function fetchHeightMapForBounds(
  bounds: LatLngBounds,
  gridSize: number,
): Promise<HeightMapResponse> {
  const center = bounds.getCenter();
  const marginMeters = computeViewportMarginMeters(bounds);

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

  return {
    cell_size: meta.cell_size,
    min_cell_size: meta.min_cell_size,
    lat: meta.lat,
    lon: meta.lon,
    start_ix: meta.start_ix,
    grid_shape: meta.grid_shape,
    heights,
  };
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

async function cacheTileUrl(cache: Cache, url: string): Promise<void> {
  const request = new Request(
    url,
    url.startsWith(window.location.origin) ? undefined : { mode: "no-cors" },
  );
  const cached = await cache.match(request);
  if (cached !== undefined) {
    return;
  }

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
  }
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

export async function findStoredHeightMap(
  requiredBounds: BoundsTuple,
  gridSize: number,
): Promise<HeightMapResponse | undefined> {
  const maps = await withStore(HEIGHT_MAPS_STORE, "readonly", async (store) => {
    return (await promisifyRequest(store.getAll())) as StoredHeightMapRecord[];
  });

  const matches = maps
    .filter(
      (entry) =>
        entry.gridSize === gridSize &&
        tupleContainsBounds(entry.bounds, requiredBounds),
    )
    .sort((a, b) => area(a.bounds) - area(b.bounds));

  return matches[0]?.map;
}

export async function getPreferredOfflineGridSize(
  bounds: LatLngBounds,
): Promise<number | undefined> {
  const downloads = await listOfflineDownloads();
  const viewport = boundsToTuple(bounds);
  const candidates = downloads
    .filter((entry) => tupleContainsBounds(entry.bounds, viewport))
    .map((entry) => entry.gridSize)
    .sort((a, b) => a - b);
  return candidates[0];
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
  baseLayerName: string,
  onProgress: (progress: OfflineDownloadProgress) => void,
): Promise<void> {
  const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tileZooms = buildTileZoomLevels(currentZoom);
  const tileUrls = buildTileUrls(bounds, currentZoom, baseLayerName);
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
  for (const url of tileUrls) {
    await cacheTileUrl(tileCache, url);
    advance(`Tiles stored (${completed - 2}/${tileUrls.length})`);
  }

  const record: OfflineDownloadRecord = {
    id: downloadId,
    name: `Window ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    bounds: boundsToTuple(bounds),
    gridSize,
    baseLayerName,
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
