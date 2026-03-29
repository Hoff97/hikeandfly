import { LatLng, LatLngBounds } from "leaflet";
import {
  ConeSearchResponse,
  GridState,
  GridTile,
  HeightMapResponse,
  HeightPoint,
  ImageState,
  PathAndNode,
  SetSettings,
  Settings,
} from "./types";
import { computeFlightCone } from "../wasm/glide";

import { Map as MapLeaflet } from "leaflet";

interface HeightMapMetaResponse {
  cell_size: number;
  min_cell_size: number;
  lat: [number, number];
  lon: [number, number];
  start_ix: [number, number];
  grid_shape: [number, number];
}

interface GeoBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

let cachedLargeHeightMap: HeightMapResponse | undefined;

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

function estimateSearchMarginMeters(settings: Settings): number {
  const defaultGroundHeight = 1500;
  const estimatedStartHeight =
    settings.startHeight !== undefined
      ? settings.startHeight
      : defaultGroundHeight + settings.additionalHeight;
  const glideRatio = Math.max(1 / settings.glideNumber, 0.01);
  const effectiveSpeedFactor = Math.max(
    (settings.trimSpeed - settings.windSpeed) / Math.max(settings.trimSpeed, 1),
    0.1,
  );
  const effectiveGlideRatio = glideRatio / effectiveSpeedFactor;
  const estimatedRange = estimatedStartHeight / effectiveGlideRatio;

  return Math.round(Math.max(5000, Math.min(120000, estimatedRange + 2000)));
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
  const rowStart = Math.max(0, centerRow - halfSpan);
  const rowEnd = Math.min(rows - 1, centerRow + halfSpan);
  const colStart = Math.max(0, centerCol - halfSpan);
  const colEnd = Math.min(cols - 1, centerCol + halfSpan);

  const croppedRows = rowEnd - rowStart + 1;
  const croppedCols = colEnd - colStart + 1;
  const croppedHeights: number[] = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    const offset = row * cols;
    for (let col = colStart; col <= colEnd; col++) {
      croppedHeights.push(map.heights[offset + col]);
    }
  }

  const latStart = map.lat[0] + (rowStart / rows) * (map.lat[1] - map.lat[0]);
  const latEnd = map.lat[0] + ((rowEnd + 1) / rows) * (map.lat[1] - map.lat[0]);
  const lonStart = map.lon[0] + (colStart / cols) * (map.lon[1] - map.lon[0]);
  const lonEnd = map.lon[0] + ((colEnd + 1) / cols) * (map.lon[1] - map.lon[0]);

  return {
    cell_size: map.cell_size,
    min_cell_size: map.min_cell_size,
    lat: [latStart, latEnd],
    lon: [lonStart, lonEnd],
    start_ix: [centerRow - rowStart, centerCol - colStart],
    grid_shape: [croppedRows, croppedCols],
    heights: croppedHeights,
  };
}

function getHeightMapMetaUrl(
  latLng: LatLng,
  cellSize: number,
  marginM: number,
): URL {
  const url = new URL(window.location.origin + "/height_map_meta");
  url.searchParams.set("lat", latLng.lat.toString());
  url.searchParams.set("lon", latLng.lng.toString());
  url.searchParams.set("cell_size", cellSize.toString());
  url.searchParams.set("margin_m", marginM.toString());
  return url;
}

function getHeightMapImageUrl(
  latLng: LatLng,
  cellSize: number,
  marginM: number,
): URL {
  const url = new URL(window.location.origin + "/height_map_image");
  url.searchParams.set("lat", latLng.lat.toString());
  url.searchParams.set("lon", latLng.lng.toString());
  url.searchParams.set("cell_size", cellSize.toString());
  url.searchParams.set("margin_m", marginM.toString());
  return url;
}

function getHeightMapJsonUrl(
  latLng: LatLng,
  cellSize: number,
  marginM: number,
): URL {
  const url = new URL(window.location.origin + "/height_map");
  url.searchParams.set("lat", latLng.lat.toString());
  url.searchParams.set("lon", latLng.lng.toString());
  url.searchParams.set("cell_size", cellSize.toString());
  url.searchParams.set("margin_m", marginM.toString());
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
  marginM: number,
  signal: AbortSignal,
): Promise<HeightMapResponse> {
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
    cell_size: meta.cell_size,
    min_cell_size: meta.min_cell_size,
    lat: meta.lat,
    lon: meta.lon,
    start_ix: meta.start_ix,
    grid_shape: meta.grid_shape,
    heights,
  };
}

async function fetchHeightMapJson(
  latLng: LatLng,
  cellSize: number,
  marginM: number,
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
  const normalMargin = estimateSearchMarginMeters(settings);
  const normalBounds = computeRequiredBounds(latLng, normalMargin);

  if (
    cachedLargeHeightMap !== undefined &&
    Math.abs(cachedLargeHeightMap.cell_size - settings.gridSize) < 0.001 &&
    mapContainsBounds(cachedLargeHeightMap, normalBounds)
  ) {
    return cropHeightMap(cachedLargeHeightMap, latLng, normalMargin);
  }

  const largeMargin = normalMargin * 2;
  try {
    cachedLargeHeightMap = await fetchHeightMapPngWithMeta(
      latLng,
      settings.gridSize,
      largeMargin,
      signal,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    cachedLargeHeightMap = await fetchHeightMapJson(
      latLng,
      settings.gridSize,
      largeMargin,
      signal,
    );
  }

  return cropHeightMap(cachedLargeHeightMap, latLng, normalMargin);
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

function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Could not get canvas context");
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
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
  let nodes: GridTile[];

  try {
    if (settings.localComputeEnabled) {
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

      nodes = wasmResult.nodes.map((node) => ({
        index: [node.index[0], node.index[1]],
        reference: node.reference
          ? [node.reference[0], node.reference[1]]
          : undefined,
        height: node.height,
        distance: node.distance,
        agl: node.agl,
        inSafetyMargin: node.in_safety_margin,
      }));
    } else {
      const flightConeUrl = new URL(window.location.origin + "/flight_cone");
      flightConeUrl.search = getSearchParams(latLng, settings).toString();

      const response = await fetch(flightConeUrl, {
        signal: controller.signal,
      });
      if (response.status === 404) {
        grid.loading = "done";
        setGrid(grid);
        alert("Location not yet supported!");
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch flight cone from server");
      }

      const serverCone = (await response.json()) as ConeSearchResponse;
      cone = serverCone;
      nodes = (serverCone.nodes ?? []).map((node) => ({
        index: [node.index[0], node.index[1]],
        reference: node.reference
          ? [node.reference[0], node.reference[1]]
          : undefined,
        height: node.height,
        distance: node.distance,
        agl: node.agl,
        inSafetyMargin: node.inSafetyMargin,
      }));
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

  const imageData = createAglImageData(cone, nodes);

  grid.loading = imageOnly ? "done" : "grid";
  grid.response = cone;
  grid.startPosition = latLng;
  setGrid(grid);

  let newSettings = settings;

  setSettings((prev) => {
    newSettings = {
      ...prev,
      gridSize: cone.cell_size,
      minGridSize: cone.min_cell_size,
    };
    return newSettings;
  });

  const searchParams = getSearchParams(latLng, settings).toString();

  if (imageOnly) {
    const bounds = new LatLngBounds(
      new LatLng(cone.lat[0], cone.lon[0]),
      new LatLng(cone.lat[1], cone.lon[1]),
    );
    let imageState: ImageState = {
      heightAGLUrl: imageDataToDataUrl(imageData),
      bounds,
    };
    setImageState(imageState);
    if (map !== undefined) {
      map.flyToBounds(bounds);
    }
    return;
  }

  const bounds = new LatLngBounds(
    new LatLng(cone.lat[0], cone.lon[0]),
    new LatLng(cone.lat[1], cone.lon[1]),
  );
  let imageState: ImageState = {
    heightAGLUrl: undefined,
    bounds,
  };
  setImageState(imageState);
  updateSearchParams(latLng, newSettings);
  await new Promise((r) => setTimeout(r, 100));
  drawAGLImage(imageData);

  let canvas = document.getElementById("canvas-overlay") as HTMLCanvasElement;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  var ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Could not get canvas context");
  }
  ctx.fillStyle = "rgba(0,0,0,255)";
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 2] !== 0) {
      let ix = i / 4;
      let x = (ix % imageData.width) | 0;
      let y = Math.floor(ix / imageData.width);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  grid.grid = new Array(cone.grid_shape[0]);
  for (let i = 0; i < cone.grid_shape[0]; i++) {
    grid.grid[i] = new Array(cone.grid_shape[1]);
  }

  for (const node of nodes) {
    grid.grid[node.index[0]][node.index[1]] = node;
  }

  setGrid({ ...grid, loading: "done" });
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
