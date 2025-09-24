import { LatLng, LatLngBounds } from "leaflet";
import {
  ConeSearchResponse,
  GridState,
  GridTile,
  HeightPoint,
  ImageState,
  PathAndNode,
  ReducedNodeResponse,
  SetSettings,
  Settings,
} from "./types";

import { Map as MapLeaflet } from "leaflet";

export function updateSearchParams(
  latLng: LatLng | undefined,
  settings: Settings
) {
  const searchParams = getSearchParams(latLng, settings);

  const url = new URL(window.location.origin);
  url.pathname = window.location.pathname;
  url.search = searchParams.toString();

  window.history.replaceState({}, "", url);
}

export function getSearchParams(
  latlng: LatLng | undefined,
  settings: Settings
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

function get_effective_glide_ratio(
  effective_wind_angle: number,
  wind_speed: number,
  trim_speed: number,
  glide_ratio: number
) {
  let side_wind = Math.sin(effective_wind_angle) * wind_speed;
  let back_wind = Math.cos(effective_wind_angle) * wind_speed;

  let rs = trim_speed * trim_speed - side_wind * side_wind;
  if (rs <= 0) {
    return parseFloat("inf");
  }

  let rest_speed = Math.sqrt(rs);

  let effective_speed = rest_speed + back_wind;
  if (effective_speed <= 0.0) {
    return parseFloat("inf");
  }

  let effective_glide_ratio = glide_ratio / (effective_speed / trim_speed);

  return effective_glide_ratio;
}

function getHeightAt(
  ix: number[],
  heightData: ImageData,
  gridShape: number[]
): number {
  let x = ix[1];
  let y = gridShape[0] - ix[0] - 1;

  let a = heightData.data[(y * gridShape[1] + x) * 4];
  let b = heightData.data[(y * gridShape[1] + x) * 4 + 1];

  return a * 256 + b;
}

function updateGrid(
  cone: ConeSearchResponse,
  grid: GridTile[][] | undefined,
  nodes: ReducedNodeResponse[] | undefined,
  settings: Settings,
  lastReference: number[] | undefined,
  ctx: CanvasRenderingContext2D,
  heightData: ImageData
) {
  if (nodes === undefined || grid === undefined) {
    return lastReference;
  }

  for (let reducedResp of nodes) {
    let insertedNode: GridTile = {
      index: reducedResp.i,
      height: 0,
      distance: 0,
      reference: [],
      agl: 0,
    };
    grid[reducedResp.i[0]][reducedResp.i[1]] = insertedNode;

    if (reducedResp.r === undefined && lastReference === undefined) {
      insertedNode.height =
        settings.startHeight !== undefined
          ? settings.startHeight
          : cone.start_height + settings.additionalHeight;
      insertedNode.distance = 0;
      insertedNode.agl = getHeightAt(
        reducedResp.i,
        heightData,
        cone.grid_shape
      );
      // @ts-ignore
      insertedNode.reference = undefined;
      continue;
    } else if (reducedResp.r === undefined && lastReference !== undefined) {
      insertedNode.reference = lastReference;
    } else {
      lastReference = reducedResp.r;
      // @ts-ignore
      insertedNode.reference = reducedResp.r;
    }
    let ref = grid[insertedNode.reference[0]][insertedNode.reference[1]];

    let diff = [
      insertedNode.index[0] - ref.index[0],
      insertedNode.index[1] - ref.index[1],
    ];

    let windDir = (settings.windDirection / 180.0) * Math.PI;
    let angle = Math.atan2(diff[0], diff[1]);
    let effective_wind_angle = windDir + angle + Math.PI / 2;

    let ref_distance =
      Math.sqrt(diff[0] * diff[0] + diff[1] * diff[1]) * cone.cell_size;
    let newDistance = ref.distance + ref_distance;
    insertedNode.distance = newDistance;

    let effective_glide_ratio = get_effective_glide_ratio(
      effective_wind_angle,
      settings.windSpeed,
      settings.trimSpeed,
      1 / settings.glideNumber
    );
    let height_loss = ref_distance * effective_glide_ratio;
    let newHeight = ref.height - height_loss;
    insertedNode.height = newHeight;
    insertedNode.agl = getHeightAt(reducedResp.i, heightData, cone.grid_shape);

    let x = insertedNode.index[1];
    let y = cone.grid_shape[0] - insertedNode.index[0] - 1;
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
  s: number
): number[] {
  for (let i = 0; i < steps.length - 1; i++) {
    if (s >= steps[i] && s < steps[i + 1]) {
      return lerp_color(
        lerp_colors[i],
        diffs[i],
        (s - steps[i]) / step_diffs[i]
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
        (height - hmin) / hdiff
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
  imageOnly: boolean = false
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

  let url = new URL(window.location.origin + "/flight_cone_bounds");
  url.search = getSearchParams(latLng, settings).toString();

  if (settings.abortController !== undefined) {
    settings.abortController.abort();
  }

  let controller = new AbortController();
  setSettings({ ...settings, abortController: controller });

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    throw error;
  }

  if (response.status === 404) {
    grid.loading = "done";
    setGrid(grid);
    alert("Location not yet supported!");
    return;
  }

  let cone: ConeSearchResponse;
  try {
    cone = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    throw error;
  }

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
    let heightAglUrl = new URL(window.location.origin + "/agl_image");
    heightAglUrl.search = searchParams;
    let heightUrl = new URL(window.location.origin + "/height_image");
    heightUrl.search = searchParams;

    const bounds = new LatLngBounds(
      new LatLng(cone.lat[0], cone.lon[0]),
      new LatLng(cone.lat[1], cone.lon[1])
    );
    let imageState: ImageState = {
      heightAGLUrl: heightAglUrl.toString(),
      bounds,
    };
    setImageState(imageState);
    if (map !== undefined) {
      map.flyToBounds(bounds);
    }
    return;
  }

  let rawHeightUrl = new URL(window.location.origin + "/raw_height_image");
  rawHeightUrl.search = searchParams;
  let { imageData, img } = await loadImageData(rawHeightUrl);

  const bounds = new LatLngBounds(
    new LatLng(cone.lat[0], cone.lon[0]),
    new LatLng(cone.lat[1], cone.lon[1])
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
  canvas.width = img.width;
  canvas.height = img.height;
  var ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Could not get canvas context");
  }
  ctx.fillStyle = "rgba(0,0,0,255)";
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 2] !== 0) {
      let ix = i / 4;
      let x = ix % img.width | 0;
      let y = Math.floor(ix / img.width);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  let grid_url = new URL(window.location.origin + "/flight_cone");
  grid_url.search = getSearchParams(latLng, settings).toString();

  grid.grid = new Array(cone.grid_shape[0]);
  for (let i = 0; i < cone.grid_shape[0]; i++) {
    grid.grid[i] = new Array(cone.grid_shape[1]);
  }
  setGrid(grid);
  const socket = new WebSocket(
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${
      grid_url.host
    }/flight_cone_ws/ws?${grid_url.searchParams.toString()}`
  );
  let total = 0;
  controller.signal.addEventListener("abort", () => {
    socket.close();
  });
  let lastReference: number[] | undefined = undefined;
  socket.onmessage = (event) => {
    let nodes = JSON.parse(event.data) as ReducedNodeResponse[];
    total += nodes.length;
    lastReference = updateGrid(
      cone,
      grid.grid,
      nodes,
      settings,
      lastReference,
      // @ts-ignore
      ctx,
      imageData
    );
    setGrid(grid);
  };
  socket.onclose = () => {
    console.log("WebSocket closed with total nodes", total);
    setGrid({ ...grid, loading: "done" });
  };
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
  map: MapLeaflet
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
          map
        );
      } else {
        doSearchFromLocation(
          setImageState,
          setGrid,
          setSettings,
          new LatLng(position.coords.latitude, position.coords.longitude),
          settings,
          pathAndNode,
          map
        );
      }
    },
    null,
    {
      enableHighAccuracy: true,
    }
  );
}

export function nodeInGrid(
  latlng: LatLng,
  grid: GridState
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
        grid.response.grid_shape[0]
    );
    const lonIx = Math.floor(
      ((latlng.lng - grid.response.lon[0]) /
        (grid.response.lon[1] - grid.response.lon[0])) *
        grid.response.grid_shape[1]
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
  pathAndNode: PathAndNode
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
  grid: GridState
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
  grid: GridState
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
