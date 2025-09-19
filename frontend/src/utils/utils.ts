import { LatLng, LatLngBounds } from "leaflet";
import {
  ConeSearchResponse,
  GridState,
  GridTile,
  HeightPoint,
  ImageState,
  PathAndNode,
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

function updateGrid(
  cone: ConeSearchResponse,
  grid: GridTile[][] | undefined,
  nodes: GridTile[] | undefined
) {
  if (nodes === undefined || grid === undefined) {
    return 0;
  }

  let maxDistance = 0;

  for (let node of nodes) {
    if (grid[node.index[0]] === undefined) {
      grid[node.index[0]] = new Array(cone.grid_shape[1]);
    }

    grid[node.index[0]][node.index[1]] = node;
    maxDistance = Math.max(maxDistance, node.distance);
  }
  return maxDistance;
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
    maxLoadDistance: undefined,
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
  let heightAglUrl = new URL(window.location.origin + "/agl_image");
  heightAglUrl.search = searchParams;
  let heightUrl = new URL(window.location.origin + "/height_image");
  heightUrl.search = searchParams;

  const bounds = new LatLngBounds(
    new LatLng(cone.lat[0], cone.lon[0]),
    new LatLng(cone.lat[1], cone.lon[1])
  );
  setImageState({
    heightAGLUrl: heightAglUrl.toString(),
    heightUrl: heightUrl.toString(),
    bounds,
  });
  if (map !== undefined) {
    map.flyToBounds(bounds);
  }

  if (imageOnly) {
    return;
  }

  updateSearchParams(latLng, newSettings);

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
  socket.onmessage = (event) => {
    let nodes = JSON.parse(event.data) as GridTile[];
    total += nodes.length;
    let newDistance = updateGrid(cone, grid.grid, nodes);
    setGrid({ ...grid, maxLoadDistance: newDistance });
  };
  socket.onclose = () => {
    console.log("WebSocket closed with total nodes", total);
    setGrid({ ...grid, loading: "done", maxLoadDistance: undefined });
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
      console.log(position);
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
  while (current.reference !== null) {
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
