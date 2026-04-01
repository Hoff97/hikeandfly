import { LatLng, LatLngBounds } from "leaflet";
import {
  ConeSearchResponse,
  GridState,
  GridTile,
  HeightMapResponse,
  HeightPoint,
  ImageState,
  PathAndNode,
  ReducedNodeResponse,
  SetSettings,
  Settings,
} from "./types";
import { computeFlightCone } from "../wasm/glide";
import { findStoredHeightMap, isLocationDownloaded } from "./offline";

import { Map as MapLeaflet } from "leaflet";

interface HeightMapMetaResponse {
  cell_size: number;
  min_cell_size: number;
  lat: [number, number];
  lon: [number, number];
  start_ix: [number, number];
  grid_shape: [number, number];
  start_height?: number;
}

interface GeoBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

let cachedLargeHeightMap: HeightMapResponse | undefined;

function getEffectiveGlideRatio(
  effectiveWindAngle: number,
  windSpeed: number,
  trimSpeed: number,
  glideRatio: number,
): number {
  const sideWind = Math.sin(effectiveWindAngle) * windSpeed;
  const backWind = Math.cos(effectiveWindAngle) * windSpeed;

  const restSpeedSquared = trimSpeed * trimSpeed - sideWind * sideWind;
  if (restSpeedSquared <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const restSpeed = Math.sqrt(restSpeedSquared);
  const effectiveSpeed = restSpeed + backWind;
  if (effectiveSpeed <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return glideRatio / (effectiveSpeed / trimSpeed);
}

export function updateSearchParams(
  latLng: LatLng | undefined,
  settings: Settings,
) {
  const searchParams = getSearchParams(latLng, settings);

  const url = new URL(window.location.origin);
  url.pathname = window.location.pathname;
  url.search = searchParams.toString();

  window.history.replaceState({}, "", url);
}

export function getSearchParams(
  latlng: LatLng | undefined,
  settings: Settings,
) {
  let dict: any = {
    cell_size: settings.gridSize.toString(),
    glide_number: settings.glideNumber.toString(),
    additional_height: settings.additionalHeight.toString(),
    wind_speed: settings.windSpeed.toString(),
    trim_speed: settings.trimSpeed.toString(),
    wind_direction: settings.windDirection.toString(),
    safety_margin: settings.safetyMargin.toString(),
    start_distance: settings.startDistance.toString(),
  };
  if (settings.startHeight !== undefined) {
    dict["start_height"] = settings.startHeight.toString();
  }
  if (latlng !== undefined) {
    dict["lat"] = latlng.lat.toString();
    dict["lon"] = latlng.lng.toString();
  }

  return new URLSearchParams(dict);
}

function getHeightAt(
  ix: number[],
  heightData: ImageData,
  gridShape: number[],
): number {
  let x = ix[1];
  let y = gridShape[0] - ix[0] - 1;

  let a = heightData.data[(y * gridShape[1] + x) * 4];
  let b = heightData.data[(y * gridShape[1] + x) * 4 + 1];

  return a * 256 + b;
}

function estimateSearchMarginMeters(
  settings: Settings,
  terrainHeight?: number,
): number {
  const defaultGroundHeight = 1500;
  const groundHeight = terrainHeight ?? defaultGroundHeight;
  const estimatedStartHeight =
    settings.startHeight !== undefined
      ? settings.startHeight
      : groundHeight + settings.additionalHeight;
  const glideRatio = Math.max(1 / settings.glideNumber, 0.01);
  const effectiveSpeedFactor = Math.max(
    (settings.trimSpeed - settings.windSpeed) / Math.max(settings.trimSpeed, 1),
    0.1,
  );
  const effectiveGlideRatio = glideRatio / effectiveSpeedFactor;
  const estimatedRange = estimatedStartHeight / effectiveGlideRatio;

  return Math.round(Math.max(5000, Math.min(120000, estimatedRange + 2000)));
}

function lookupTerrainHeight(map: HeightMapResponse, latLng: LatLng): number {
  const [row, col] = toGridIndex(latLng.lat, latLng.lng, map);
  return map.heights[row * map.grid_shape[1] + col];
}

function computeRequiredBounds(latLng: LatLng, marginM: number): GeoBounds {
  const earthMetersPerDegree = 111_320;
  const latDelta = marginM / earthMetersPerDegree;
  const lonScale = Math.max(Math.cos((latLng.lat * Math.PI) / 180), 0.05);
  const lonDelta = marginM / (earthMetersPerDegree * lonScale);

  return {
    latMin: latLng.lat - latDelta,
    latMax: latLng.lat + latDelta,
    lonMin: latLng.lng - lonDelta,
    lonMax: latLng.lng + lonDelta,
  };
}

function mapContainsBounds(map: HeightMapResponse, bounds: GeoBounds): boolean {
  return (
    bounds.latMin >= map.lat[0] &&
    bounds.latMax <= map.lat[1] &&
    bounds.lonMin >= map.lon[0] &&
    bounds.lonMax <= map.lon[1]
  );
}

function toGridIndex(
  lat: number,
  lon: number,
  map: HeightMapResponse,
): [number, number] {
  const rows = map.grid_shape[0];
  const cols = map.grid_shape[1];

  const row = Math.floor(
    ((lat - map.lat[0]) / (map.lat[1] - map.lat[0])) * rows,
  );
  const col = Math.floor(
    ((lon - map.lon[0]) / (map.lon[1] - map.lon[0])) * cols,
  );

  return [
    Math.max(0, Math.min(rows - 1, row)),
    Math.max(0, Math.min(cols - 1, col)),
  ];
}

function cropHeightMap(
  map: HeightMapResponse,
  latLng: LatLng,
  marginM: number,
): HeightMapResponse {
  const rows = map.grid_shape[0];
  const cols = map.grid_shape[1];
  const [centerRow, centerCol] = toGridIndex(latLng.lat, latLng.lng, map);

  const halfSpan = Math.max(1, Math.ceil(marginM / map.cell_size));

  // The desired row/col range — may extend outside the stored map.
  const desiredRowStart = centerRow - halfSpan;
  const desiredRowEnd = centerRow + halfSpan;
  const desiredColStart = centerCol - halfSpan;
  const desiredColEnd = centerCol + halfSpan;

  const outRows = desiredRowEnd - desiredRowStart + 1;
  const outCols = desiredColEnd - desiredColStart + 1;

  // Fill with a very high value outside downloaded area so glide calculation stops at coverage boundaries.
  const croppedHeights = new Array<number>(outRows * outCols).fill(9999);

  for (let row = desiredRowStart; row <= desiredRowEnd; row++) {
    if (row < 0 || row >= rows) continue;
    for (let col = desiredColStart; col <= desiredColEnd; col++) {
      if (col < 0 || col >= cols) continue;
      const outRow = row - desiredRowStart;
      const outCol = col - desiredColStart;
      croppedHeights[outRow * outCols + outCol] = map.heights[row * cols + col];
    }
  }

  const latPerRow = (map.lat[1] - map.lat[0]) / rows;
  const lonPerCol = (map.lon[1] - map.lon[0]) / cols;
  const latStart = map.lat[0] + desiredRowStart * latPerRow;
  const latEnd = map.lat[0] + (desiredRowEnd + 1) * latPerRow;
  const lonStart = map.lon[0] + desiredColStart * lonPerCol;
  const lonEnd = map.lon[0] + (desiredColEnd + 1) * lonPerCol;

  return {
    cell_size: map.cell_size,
    min_cell_size: map.min_cell_size,
    lat: [latStart, latEnd],
    lon: [lonStart, lonEnd],
    start_ix: [halfSpan, halfSpan],
    grid_shape: [outRows, outCols],
    heights: croppedHeights,
  };
}

function getHeightMapMetaUrl(
  latLng: LatLng,
  cellSize: number,
  marginM?: number,
): URL {
  const url = new URL(window.location.origin + "/height_map_meta");
  url.searchParams.set("lat", latLng.lat.toString());
  url.searchParams.set("lon", latLng.lng.toString());
  url.searchParams.set("cell_size", cellSize.toString());
  if (marginM !== undefined) {
    url.searchParams.set("margin_m", marginM.toString());
  }
  return url;
}

function getHeightMapImageUrl(
  latLng: LatLng,
  cellSize: number,
  marginM?: number,
): URL {
  const url = new URL(window.location.origin + "/height_map_image");
  url.searchParams.set("lat", latLng.lat.toString());
  url.searchParams.set("lon", latLng.lng.toString());
  url.searchParams.set("cell_size", cellSize.toString());
  if (marginM !== undefined) {
    url.searchParams.set("margin_m", marginM.toString());
  }
  return url;
}

function getHeightMapJsonUrl(
  latLng: LatLng,
  cellSize: number,
  marginM?: number,
): URL {
  const url = new URL(window.location.origin + "/height_map");
  url.searchParams.set("lat", latLng.lat.toString());
  url.searchParams.set("lon", latLng.lng.toString());
  url.searchParams.set("cell_size", cellSize.toString());
  if (marginM !== undefined) {
    url.searchParams.set("margin_m", marginM.toString());
  }
  return url;
}

async function decodeHeightsFromImageResponse(
  imageResponse: Response,
  expectedShape: [number, number],
): Promise<number[]> {
  const blob = await imageResponse.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const { imageData, img } = await loadImageData(new URL(objectUrl));
    if (img.height !== expectedShape[0] || img.width !== expectedShape[1]) {
      throw new Error("Height map image dimensions do not match metadata");
    }

    const heights: number[] = new Array(expectedShape[0] * expectedShape[1]);
    for (let row = 0; row < expectedShape[0]; row++) {
      for (let col = 0; col < expectedShape[1]; col++) {
        const height = getHeightAt([row, col], imageData, [
          img.height,
          img.width,
        ]);
        heights[row * expectedShape[1] + col] = height;
      }
    }

    return heights;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchHeightMapPngWithMeta(
  latLng: LatLng,
  cellSize: number,
  marginM: number | undefined,
  signal: AbortSignal,
): Promise<{ map: HeightMapResponse; meta: HeightMapMetaResponse }> {
  const metaUrl = getHeightMapMetaUrl(latLng, cellSize, marginM);
  const imageUrl = getHeightMapImageUrl(latLng, cellSize, marginM);

  const [metaResponse, imageResponse] = await Promise.all([
    fetch(metaUrl, { signal }),
    fetch(imageUrl, { signal }),
  ]);

  if (metaResponse.status === 404 || imageResponse.status === 404) {
    throw new Error("Location not yet supported");
  }
  if (!metaResponse.ok || !imageResponse.ok) {
    throw new Error("Failed to fetch height map metadata/image");
  }

  const meta = (await metaResponse.json()) as HeightMapMetaResponse;
  const heights = await decodeHeightsFromImageResponse(
    imageResponse,
    meta.grid_shape,
  );

  return {
    map: {
      cell_size: meta.cell_size,
      min_cell_size: meta.min_cell_size,
      lat: meta.lat,
      lon: meta.lon,
      start_ix: meta.start_ix,
      grid_shape: meta.grid_shape,
      heights,
    },
    meta,
  };
}

async function fetchHeightMapJson(
  latLng: LatLng,
  cellSize: number,
  marginM: number | undefined,
  signal: AbortSignal,
): Promise<HeightMapResponse> {
  const response = await fetch(getHeightMapJsonUrl(latLng, cellSize, marginM), {
    signal,
  });
  if (response.status === 404) {
    throw new Error("Location not yet supported");
  }
  if (!response.ok) {
    throw new Error("Failed to fetch height map JSON");
  }
  return (await response.json()) as HeightMapResponse;
}

async function getHeightMapForLocalCompute(
  latLng: LatLng,
  settings: Settings,
  signal: AbortSignal,
): Promise<HeightMapResponse> {
  if (
    cachedLargeHeightMap !== undefined &&
    Math.abs(cachedLargeHeightMap.cell_size - settings.gridSize) < 0.001
  ) {
    const terrainHeight = lookupTerrainHeight(cachedLargeHeightMap, latLng);
    const requiredMargin = estimateSearchMarginMeters(settings, terrainHeight);
    const requiredBounds = computeRequiredBounds(latLng, requiredMargin);
    if (mapContainsBounds(cachedLargeHeightMap, requiredBounds)) {
      return cropHeightMap(cachedLargeHeightMap, latLng, requiredMargin);
    }
  }

  const storedHeightMap = await findStoredHeightMap(
    latLng.lat,
    latLng.lng,
    settings.gridSize,
  );
  if (storedHeightMap !== undefined) {
    const terrainHeight = lookupTerrainHeight(storedHeightMap, latLng);
    const requiredMargin = estimateSearchMarginMeters(settings, terrainHeight);
    return cropHeightMap(storedHeightMap, latLng, requiredMargin);
  }

  // Let the backend choose a sufficiently large initial margin and report start height.
  try {
    const initial = await fetchHeightMapPngWithMeta(
      latLng,
      settings.gridSize,
      undefined,
      signal,
    );
    const terrainHeight =
      initial.meta.start_height ?? lookupTerrainHeight(initial.map, latLng);
    const requiredMargin = estimateSearchMarginMeters(settings, terrainHeight);
    const requiredBounds = computeRequiredBounds(latLng, requiredMargin);

    if (mapContainsBounds(initial.map, requiredBounds)) {
      cachedLargeHeightMap = initial.map;
      return cropHeightMap(initial.map, latLng, requiredMargin);
    }

    cachedLargeHeightMap = (
      await fetchHeightMapPngWithMeta(
        latLng,
        settings.gridSize,
        requiredMargin,
        signal,
      )
    ).map;
    return cropHeightMap(cachedLargeHeightMap, latLng, requiredMargin);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    cachedLargeHeightMap = await fetchHeightMapJson(
      latLng,
      settings.gridSize,
      undefined,
      signal,
    );
    const terrainHeight = lookupTerrainHeight(cachedLargeHeightMap, latLng);
    const requiredMargin = estimateSearchMarginMeters(settings, terrainHeight);
    const requiredBounds = computeRequiredBounds(latLng, requiredMargin);

    if (!mapContainsBounds(cachedLargeHeightMap, requiredBounds)) {
      cachedLargeHeightMap = await fetchHeightMapJson(
        latLng,
        settings.gridSize,
        requiredMargin,
        signal,
      );
    }

    return cropHeightMap(cachedLargeHeightMap, latLng, requiredMargin);
  }
}

function createAglImageData(
  cone: ConeSearchResponse,
  nodes: GridTile[],
): ImageData {
  const width = cone.grid_shape[1];
  const height = cone.grid_shape[0];
  const imageData = new ImageData(width, height);

  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 255;
    imageData.data[i + 1] = 255;
    imageData.data[i + 2] = 0;
    imageData.data[i + 3] = 255;
  }

  for (const node of nodes) {
    const x = node.index[1];
    const y = cone.grid_shape[0] - node.index[0] - 1;
    const idx = (y * width + x) * 4;

    const agl = Math.max(Math.round(node.agl), 0);
    imageData.data[idx] = Math.floor(agl / 256);
    imageData.data[idx + 1] = agl % 256;
    imageData.data[idx + 2] = node.inSafetyMargin ? 128 : 255;
    imageData.data[idx + 3] = 255;
  }

  return imageData;
}

function initializeGrid(cone: ConeSearchResponse): GridTile[][] {
  const grid = new Array(cone.grid_shape[0]);
  for (let i = 0; i < cone.grid_shape[0]; i++) {
    grid[i] = new Array(cone.grid_shape[1]);
  }
  return grid;
}

function clearOverlayCanvas(width: number, height: number): void {
  const canvas = document.getElementById("canvas-overlay") as HTMLCanvasElement;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Could not get canvas context");
  }
  ctx.clearRect(0, 0, width, height);
}

function createOverlayLoadingMask(
  imageData: ImageData,
): CanvasRenderingContext2D {
  const canvas = document.getElementById("canvas-overlay") as HTMLCanvasElement;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Could not get canvas context");
  }

  ctx.clearRect(0, 0, imageData.width, imageData.height);
  ctx.fillStyle = "rgba(0,0,0,255)";
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 2] !== 0) {
      const ix = i / 4;
      const x = ix % imageData.width;
      const y = Math.floor(ix / imageData.width);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  return ctx;
}

function updateGrid(
  cone: ConeSearchResponse,
  grid: GridTile[][] | undefined,
  ctx: CanvasRenderingContext2D,
  options:
    | {
        mode: "server";
        nodes: ReducedNodeResponse[];
        settings: Settings;
        lastReference: number[] | undefined;
        heightData: ImageData;
      }
    | {
        mode: "local";
        nodes: GridTile[];
      },
): number[] | undefined {
  if (grid === undefined) {
    return undefined;
  }

  if (options.mode === "local") {
    for (const node of options.nodes) {
      grid[node.index[0]][node.index[1]] = node;
      const x = node.index[1];
      const y = cone.grid_shape[0] - node.index[0] - 1;
      ctx.clearRect(x, y, 1, 1);
    }
    return undefined;
  }

  let lastReference = options.lastReference;
  for (const reducedResp of options.nodes) {
    const insertedNode: GridTile = {
      index: reducedResp.i,
      height: 0,
      distance: 0,
      reference: [],
      agl: 0,
    };
    grid[reducedResp.i[0]][reducedResp.i[1]] = insertedNode;

    if (reducedResp.r === undefined && lastReference === undefined) {
      insertedNode.height =
        options.settings.startHeight !== undefined
          ? options.settings.startHeight
          : cone.start_height + options.settings.additionalHeight;
      insertedNode.distance = 0;
      insertedNode.agl = getHeightAt(
        reducedResp.i,
        options.heightData,
        cone.grid_shape,
      );
      insertedNode.reference = undefined;
      const x = insertedNode.index[1];
      const y = cone.grid_shape[0] - insertedNode.index[0] - 1;
      ctx.clearRect(x, y, 1, 1);
      continue;
    }

    if (reducedResp.r === undefined && lastReference !== undefined) {
      insertedNode.reference = lastReference;
    } else {
      lastReference = reducedResp.r;
      insertedNode.reference = reducedResp.r;
    }

    const ref = grid[insertedNode.reference![0]][insertedNode.reference![1]];
    const diff = [
      insertedNode.index[0] - ref.index[0],
      insertedNode.index[1] - ref.index[1],
    ];

    const windDir = (options.settings.windDirection / 180.0) * Math.PI;
    const angle = Math.atan2(diff[0], diff[1]);
    const effectiveWindAngle = windDir + angle + Math.PI / 2;
    const refDistance =
      Math.sqrt(diff[0] * diff[0] + diff[1] * diff[1]) * cone.cell_size;

    insertedNode.distance = ref.distance + refDistance;
    insertedNode.height =
      ref.height -
      refDistance *
        getEffectiveGlideRatio(
          effectiveWindAngle,
          options.settings.windSpeed,
          options.settings.trimSpeed,
          1 / options.settings.glideNumber,
        );
    insertedNode.agl = getHeightAt(
      reducedResp.i,
      options.heightData,
      cone.grid_shape,
    );

    const x = insertedNode.index[1];
    const y = cone.grid_shape[0] - insertedNode.index[0] - 1;
    ctx.clearRect(x, y, 1, 1);
  }

  return lastReference;
}

async function loadImageData(imageSRC: URL) {
  let { ctx, img } = await drawImageToCanvas(imageSRC);
  let imageData = ctx.getImageData(0, 0, img.width, img.height);
  return { imageData, img };
}

async function drawImageToCanvas(imageSRC: URL) {
  let p = new Promise<HTMLImageElement>((resolve, reject) => {
    var img = new Image();
    img.src = imageSRC.toString();
    img.onload = () => resolve(img);
  });

  let img = await p;

  let canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  var ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Could not get canvas context");
  }
  ctx.drawImage(img, 0, 0);
  return { ctx, img, canvas };
}

const default_lerp_colors = [
  [255.0, 0.0, 0.0],
  [180.0, 190.0, 0.0],
  [0.0, 150.0, 255.0],
];
const diffs = [
  [180.0 - 255.0, 190.0 - 0.0, 0.0 - 0.0],
  [0.0 - 180.0, 150.0 - 190.0, 255.0 - 0.0],
];
const safety_margin_lerp_colors = [
  [(255.0 / 5.0) * 3.0, 0.0, 0.0],
  [(180.0 / 5.0) * 3.0, (190.0 / 5.0) * 3.0, 0.0],
  [0.0, (150.0 / 5.0) * 3.0, (255.0 / 5.0) * 3.0],
];
const safety_margin_diffs = [
  [((180.0 - 255.0) / 5.0) * 3.0, ((190.0 - 0.0) / 5.0) * 3.0, 0.0 - 0.0],
  [
    0.0 - (180.0 / 5.0) * 3.0,
    ((150.0 - 190.0) / 5.0) * 3.0,
    ((255.0 - 0.0) / 5.0) * 3.0,
  ],
];
const default_lerp_steps = [0.0, 0.5, 1.0];
const step_diffs = [0.5 - 0.0, 1.0 - 0.5];

function lerp_f32(a: number, d: number, s: number): number {
  return a + d * s;
}

function lerp_color(a: number[], d: number[], s: number): number[] {
  return [
    lerp_f32(a[0], d[0], s),
    lerp_f32(a[1], d[1], s),
    lerp_f32(a[2], d[2], s),
  ];
}

function lerp(
  lerp_colors: number[][],
  diffs: number[][],
  steps: number[],
  s: number,
): number[] {
  for (let i = 0; i < steps.length - 1; i++) {
    if (s >= steps[i] && s < steps[i + 1]) {
      return lerp_color(
        lerp_colors[i],
        diffs[i],
        (s - steps[i]) / step_diffs[i],
      );
    }
  }
  return lerp_colors[steps.length - 1];
}

function drawAGLImage(aglData: ImageData) {
  let canvas = document.getElementById("canvas-image") as HTMLCanvasElement;
  canvas.width = aglData.width;
  canvas.height = aglData.height;
  var ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Could not get canvas context");
  }

  let hmin = 1000000.0;
  let hmax = -1.0;

  let ix = 0;
  for (let y = 0; y < aglData.height; y++) {
    for (let x = 0; x < aglData.width; x++) {
      if (aglData.data[ix + 2] === 0) {
        ix = ix + 4;
        continue;
      }
      let a = aglData.data[ix];
      let b = aglData.data[ix + 1];
      let height = (a << 8) + b;
      hmin = Math.min(hmin, height);
      hmax = Math.max(hmax, height);

      ix = ix + 4;
    }
  }

  let hdiff = hmax - hmin;

  let imageData = ctx.createImageData(aglData.width, aglData.height);

  ix = 0;
  for (let y = 0; y < aglData.height; y++) {
    for (let x = 0; x < aglData.width; x++) {
      if (aglData.data[ix + 2] === 0) {
        ix = ix + 4;
        continue;
      }
      let a = aglData.data[ix];
      let b = aglData.data[ix + 1];
      let height = (a << 8) + b;
      let safety_margin = aglData.data[ix + 2] === 128;

      let color = lerp(
        safety_margin ? safety_margin_lerp_colors : default_lerp_colors,
        safety_margin ? safety_margin_diffs : diffs,
        default_lerp_steps,
        (height - hmin) / hdiff,
      );

      imageData.data[ix] = color[0];
      imageData.data[ix + 1] = color[1];
      imageData.data[ix + 2] = color[2];
      imageData.data[ix + 3] = 255;

      ix = ix + 4;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return;
}

export async function doSearchFromLocation(
  setImageState: (state: ImageState | undefined) => void,
  setGrid: (grid: GridState) => void,
  setSettings: SetSettings,
  latLng: LatLng,
  settings: Settings,
  pathAndNode: PathAndNode,
  map: MapLeaflet | undefined,
  imageOnly: boolean = false,
) {
  latLng = latLng.wrap();

  // When fully offline and the clicked location has not been downloaded, bail
  // early before setting the loading spinner so the UI stays responsive.
  if (!imageOnly && !navigator.onLine) {
    const covered = await isLocationDownloaded(latLng);
    if (!covered) {
      alert(
        "This area has not been downloaded for offline use.\nDownload it first using the Offline button.",
      );
      return;
    }
  }

  if (!imageOnly) {
    setImageState(undefined);
  }
  let grid: GridState = {
    loading: "image",
    grid: undefined,
    response: undefined,
    startPosition: undefined,
  };
  setGrid(grid);
  pathAndNode.setNode(undefined);
  pathAndNode.setPath(undefined);
  pathAndNode.setFixed(false);
  pathAndNode.setHeightPoints(undefined);
  pathAndNode.setCursorNode(undefined);

  if (settings.abortController !== undefined) {
    settings.abortController.abort();
  }

  let controller = new AbortController();
  setSettings({ ...settings, abortController: controller });
  let cone: ConeSearchResponse;
  let imageData: ImageData;
  const shouldUseLocalCompute =
    settings.localComputeEnabled || !navigator.onLine;

  try {
    if (shouldUseLocalCompute) {
      const heightMap = await getHeightMapForLocalCompute(
        latLng,
        settings,
        controller.signal,
      );

      const wasmResult = await computeFlightCone({
        height_map: {
          heights: heightMap.heights,
          grid_shape: [heightMap.grid_shape[0], heightMap.grid_shape[1]],
          cell_size: heightMap.cell_size,
          min_cell_size: heightMap.min_cell_size,
          lat: [heightMap.lat[0], heightMap.lat[1]],
          lon: [heightMap.lon[0], heightMap.lon[1]],
          start_ix: [heightMap.start_ix[0], heightMap.start_ix[1]],
        },
        search: {
          glide_number: settings.glideNumber,
          additional_height: settings.additionalHeight,
          start_height: settings.startHeight,
          wind_speed: settings.windSpeed,
          wind_direction: settings.windDirection,
          trim_speed: settings.trimSpeed,
          safety_margin: settings.safetyMargin,
          start_distance: settings.startDistance,
        },
      });

      cone = {
        nodes: undefined,
        cell_size: wasmResult.cell_size,
        min_cell_size: wasmResult.min_cell_size,
        lat: [wasmResult.lat[0], wasmResult.lat[1]],
        lon: [wasmResult.lon[0], wasmResult.lon[1]],
        start_ix: [wasmResult.start_ix[0], wasmResult.start_ix[1]],
        grid_shape: [wasmResult.grid_shape[0], wasmResult.grid_shape[1]],
        angular_resolution: [
          (wasmResult.lat[1] - wasmResult.lat[0]) / wasmResult.grid_shape[0],
          (wasmResult.lon[1] - wasmResult.lon[0]) / wasmResult.grid_shape[1],
        ],
        start_height: wasmResult.start_height,
      };

      const nodes = wasmResult.nodes.map((node) => ({
        index: [node.index[0], node.index[1]],
        reference: node.reference
          ? [node.reference[0], node.reference[1]]
          : undefined,
        height: node.height,
        distance: node.distance,
        agl: node.agl,
        inSafetyMargin: node.in_safety_margin,
      }));

      imageData = createAglImageData(cone, nodes);

      let newSettings = settings;
      setSettings((prev) => {
        newSettings = {
          ...prev,
          gridSize: cone.cell_size,
          minGridSize: cone.min_cell_size,
        };
        return newSettings;
      });

      const bounds = new LatLngBounds(
        new LatLng(cone.lat[0], cone.lon[0]),
        new LatLng(cone.lat[1], cone.lon[1]),
      );
      setImageState({ bounds });
      if (!imageOnly) {
        updateSearchParams(latLng, newSettings);
      }
      await new Promise((r) => setTimeout(r, 100));
      drawAGLImage(imageData);

      if (imageOnly) {
        clearOverlayCanvas(imageData.width, imageData.height);
        if (map !== undefined) {
          map.flyToBounds(bounds);
        }
        grid.loading = "done";
        grid.response = cone;
        grid.startPosition = latLng;
        setGrid(grid);
        return;
      }

      const overlayCtx = createOverlayLoadingMask(imageData);
      grid.loading = "grid";
      grid.response = cone;
      grid.startPosition = latLng;
      grid.grid = initializeGrid(cone);
      updateGrid(cone, grid.grid, overlayCtx, {
        mode: "local",
        nodes,
      });
      setGrid({ ...grid, loading: "done" });
    } else {
      const searchParams = getSearchParams(latLng, settings).toString();
      const boundsUrl = new URL(window.location.origin + "/flight_cone_bounds");
      boundsUrl.search = searchParams;

      const response = await fetch(boundsUrl, {
        signal: controller.signal,
      });
      if (response.status === 404) {
        grid.loading = "done";
        setGrid(grid);
        alert("Location not yet supported!");
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch flight cone bounds from server");
      }

      cone = (await response.json()) as ConeSearchResponse;

      let newSettings = settings;
      setSettings((prev) => {
        newSettings = {
          ...prev,
          gridSize: cone.cell_size,
          minGridSize: cone.min_cell_size,
        };
        return newSettings;
      });

      const rawHeightUrl = new URL(
        window.location.origin + "/raw_height_image",
      );
      rawHeightUrl.search = searchParams;
      imageData = (await loadImageData(rawHeightUrl)).imageData;

      const bounds = new LatLngBounds(
        new LatLng(cone.lat[0], cone.lon[0]),
        new LatLng(cone.lat[1], cone.lon[1]),
      );
      setImageState({ bounds });
      if (!imageOnly) {
        updateSearchParams(latLng, newSettings);
      }
      await new Promise((r) => setTimeout(r, 100));
      drawAGLImage(imageData);

      if (imageOnly) {
        clearOverlayCanvas(imageData.width, imageData.height);
        if (map !== undefined) {
          map.flyToBounds(bounds);
        }
        grid.loading = "done";
        grid.response = cone;
        grid.startPosition = latLng;
        setGrid(grid);
        return;
      }

      const overlayCtx = createOverlayLoadingMask(imageData);
      grid.loading = "grid";
      grid.response = cone;
      grid.startPosition = latLng;
      grid.grid = initializeGrid(cone);
      setGrid({ ...grid });

      const wsUrl = new URL(window.location.origin + "/flight_cone_ws/ws");
      wsUrl.search = searchParams;
      const socket = new WebSocket(
        `${window.location.protocol === "https:" ? "wss" : "ws"}://${wsUrl.host}/flight_cone_ws/ws?${wsUrl.searchParams.toString()}`,
      );

      controller.signal.addEventListener("abort", () => {
        socket.close();
      });

      let lastReference: number[] | undefined;
      socket.onmessage = (event) => {
        const nodes = JSON.parse(event.data) as ReducedNodeResponse[];
        lastReference = updateGrid(cone, grid.grid, overlayCtx, {
          mode: "server",
          nodes,
          settings,
          lastReference,
          heightData: imageData,
        });
        setGrid({ ...grid, grid: grid.grid });
      };
      socket.onclose = () => {
        setGrid({ ...grid, loading: "done", grid: grid.grid });
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    if (
      error instanceof Error &&
      error.message === "Location not yet supported"
    ) {
      grid.loading = "done";
      setGrid(grid);
      alert("Location not yet supported!");
      return;
    }
    throw error;
  }
}

export function ixToLatLon(ix: number[], response: ConeSearchResponse) {
  let lat =
    response.lat[0] +
    ((ix[0] + 0.5) / response.grid_shape[0]) *
      (response.lat[1] - response.lat[0]);
  let lon =
    response.lon[0] +
    ((ix[1] + 0.5) / response.grid_shape[1]) *
      (response.lon[1] - response.lon[0]);
  return new LatLng(lat, lon);
}

export function searchFromCurrentLocation(
  setImageState: (state: ImageState | undefined) => void,
  setGrid: (grid: GridState) => void,
  setSettings: SetSettings,
  settings: Settings,
  pathAndNode: PathAndNode,
  map: MapLeaflet,
) {
  if (!("geolocation" in navigator)) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (position.coords.altitude !== null) {
        const newSettings: Settings = {
          ...settings,
          startHeight: position.coords.altitude,
        };
        setSettings(newSettings);
        doSearchFromLocation(
          setImageState,
          setGrid,
          setSettings,
          new LatLng(position.coords.latitude, position.coords.longitude),
          newSettings,
          pathAndNode,
          map,
        );
      } else {
        doSearchFromLocation(
          setImageState,
          setGrid,
          setSettings,
          new LatLng(position.coords.latitude, position.coords.longitude),
          settings,
          pathAndNode,
          map,
        );
      }
    },
    null,
    {
      enableHighAccuracy: true,
    },
  );
}

export function nodeInGrid(
  latlng: LatLng,
  grid: GridState,
): GridTile | undefined {
  if (grid.response === undefined || grid.grid === undefined) {
    return;
  }

  if (
    latlng.lat >= grid.response.lat[0] &&
    latlng.lat <= grid.response.lat[1] &&
    latlng.lng >= grid.response.lon[0] &&
    latlng.lng <= grid.response.lon[1]
  ) {
    const latIx = Math.floor(
      ((latlng.lat - grid.response.lat[0]) /
        (grid.response.lat[1] - grid.response.lat[0])) *
        grid.response.grid_shape[0],
    );
    const lonIx = Math.floor(
      ((latlng.lng - grid.response.lon[0]) /
        (grid.response.lon[1] - grid.response.lon[0])) *
        grid.response.grid_shape[1],
    );

    if (
      grid.grid[latIx] !== undefined &&
      grid.grid[latIx][lonIx] !== undefined
    ) {
      return grid.grid[latIx][lonIx];
    }
  }
  return undefined;
}

export function setPath(
  node: GridTile,
  grid: GridState,
  pathAndNode: PathAndNode,
): GridTile[] {
  if (grid.grid === undefined) {
    return [];
  }

  let nodes = [];

  let current = node;
  let path = [];
  while (current.reference !== undefined) {
    let latlng = new LatLng(0, 0);
    if (grid.response !== undefined) {
      latlng = ixToLatLon(current.index, grid.response);
    }

    latlng.alt = current.height;
    path.push(latlng);
    nodes.push(current);

    current = grid.grid[current.reference[0]][current.reference[1]];
  }
  let latlng = new LatLng(0, 0);
  latlng.alt = current.height;
  if (grid.response !== undefined) {
    latlng = ixToLatLon(current.index, grid.response);
  }
  path.push(latlng);
  nodes.push(current);
  path.reverse();
  pathAndNode.setPath(path);
  pathAndNode.setNode(node);

  return nodes;
}

function heightsBetweenNodes(
  a: GridTile,
  b: GridTile,
  grid: GridState,
): HeightPoint[] {
  if (grid.response === undefined || grid.grid === undefined) {
    return [];
  }

  let diff = [b.index[0] - a.index[0], b.index[1] - a.index[1]];
  let length = Math.sqrt(diff[0] * diff[0] + diff[1] * diff[1]);
  let nPoints = Math.ceil(length);

  let distance_diff = b.distance - a.distance;
  let height_diff = b.height - a.height;

  let points = [
    {
      location: ixToLatLon(a.index, grid.response),
      height: a.height,
      groundHeight: a.height - a.agl,
      distance: a.distance,
      closest_node: a,
    },
  ];

  for (let i = 1; i < nPoints; i++) {
    let fraction = i / nPoints;
    let ix = [a.index[0] + fraction * diff[0], a.index[1] + fraction * diff[1]];
    let rounded_ix = [Math.floor(ix[0]), Math.floor(ix[1])];
    if (
      grid.grid[rounded_ix[0]] !== undefined &&
      grid.grid[rounded_ix[0]][rounded_ix[1]] !== undefined
    ) {
      let closest_node = grid.grid[rounded_ix[0]][rounded_ix[1]];

      points.push({
        location: ixToLatLon(ix, grid.response),
        height: a.height + height_diff * fraction,
        groundHeight: closest_node.height - closest_node.agl,
        distance: a.distance + distance_diff * fraction,
        closest_node: closest_node,
      });
    }
  }

  return points;
}

export function computeHeights(
  nodes: GridTile[],
  grid: GridState,
): HeightPoint[] {
  if (grid.response === undefined || grid.grid === undefined) {
    return [];
  }

  nodes.reverse();

  let height_arr: HeightPoint[] = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    let a = nodes[i];
    let b = nodes[i + 1];

    height_arr = height_arr.concat(heightsBetweenNodes(a, b, grid));
  }

  if (nodes.length > 1) {
    let a = nodes[nodes.length - 1];
    height_arr.push({
      location: ixToLatLon(a.index, grid.response),
      height: a.height,
      groundHeight: a.height - a.agl,
      distance: a.distance,
      closest_node: a,
    });
  }

  return height_arr;
}
