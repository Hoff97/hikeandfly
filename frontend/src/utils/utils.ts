import { LatLng, LatLngBounds } from "leaflet";
import {
  ConeSearchResponse,
  GridState,
  GridTile,
  ImageState,
  PathAndNode,
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

function setupGrid(cone: ConeSearchResponse): GridTile[][] {
  if (cone.nodes === undefined) {
    return [];
  }

  const grid = new Array(cone.grid_shape[0]);
  for (let node of cone.nodes) {
    if (grid[node.index[0]] === undefined) {
      grid[node.index[0]] = new Array(cone.grid_shape[1]);
    }

    grid[node.index[0]][node.index[1]] = node;
  }
  return grid;
}

export async function doSearchFromLocation(
  setImageState: (state: ImageState | undefined) => void,
  setGrid: (grid: GridState) => void,
  setSettings: (settings: Settings) => void,
  latLng: LatLng,
  settings: Settings,
  pathAndNode: PathAndNode,
  map: MapLeaflet | undefined
) {
  setImageState(undefined);
  setGrid({
    loading: true,
    grid: undefined,
    response: undefined,
    startPosition: undefined,
  });
  pathAndNode.setNode(undefined);
  pathAndNode.setPath(undefined);

  let url = new URL(window.location.origin + "/flight_cone_bounds");
  url.search = getSearchParams(latLng, settings).toString();

  let response = await fetch(url);

  if (response.status === 404) {
    setGrid({
      loading: false,
      grid: undefined,
      response: undefined,
      startPosition: undefined,
    });
    alert("Location not yet supported!");
    return;
  }

  let cone: ConeSearchResponse = await response.json();

  setGrid({
    loading: false,
    grid: undefined,
    response: cone,
    startPosition: latLng,
  });

  const newSettings = {
    ...settings,
    gridSize: cone.cell_size,
    minGridSize: cone.min_cell_size,
  };
  setSettings(newSettings);

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

  updateSearchParams(latLng, newSettings);

  let grid_url = new URL(window.location.origin + "/flight_cone");
  grid_url.search = getSearchParams(latLng, settings).toString();

  let grid_response = await fetch(grid_url);
  let cone_grid: ConeSearchResponse = await grid_response.json();

  const grid = setupGrid(cone_grid);
  setGrid({
    loading: false,
    grid: grid,
    response: cone,
    startPosition: latLng,
  });
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
  setSettings: (settings: Settings) => void,
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
