import { LatLng, LatLngBounds } from "leaflet";

export interface Settings {
  startHeight: number | undefined;
  additionalHeight: number;
  glideNumber: number;
  gridSize: number;
  minGridSize: number;
  trimSpeed: number;
  windSpeed: number;
  windDirection: number;
  safetyMargin: number;
  startDistance: number;
  abortController: AbortController | undefined;
  doLiveHoverSearch: boolean;
  fastInternet: boolean;
}

export type SetSettings = (
  settings: Settings | ((settings: Settings) => Settings)
) => void;

export interface ReducedNodeResponse {
  i: number[];
  r: number[] | undefined;
}

export interface GridTile {
  index: number[];
  height: number;
  distance: number;
  reference: number[];
  agl: number;
}

export interface ConeSearchResponse {
  nodes?: GridTile[];
  cell_size: number;
  min_cell_size: number;
  lat: number[];
  lon: number[];
  start_ix: number[];
  grid_shape: number[];
  angular_resolution: number[];
  start_height: number;
}

export interface GridState {
  loading: "done" | "grid" | "image";
  response: ConeSearchResponse | undefined;
  startPosition: LatLng | undefined;
  grid: GridTile[][] | undefined;
}

export interface ImageState {
  heightAGLUrl: string | undefined;
  bounds: LatLngBounds;
}

export interface PathAndNode {
  path: LatLng[] | undefined;
  node: GridTile | undefined;
  fixed: boolean;
  heightPoints: HeightPoint[] | undefined;
  cursorNode: HeightPoint | undefined;
  setPath: (path: LatLng[] | undefined) => void;
  setNode: (node: GridTile | undefined) => void;
  setFixed: (fixed: boolean) => void;
  setHeightPoints: (heightPoints: HeightPoint[] | undefined) => void;
  setCursorNode: (cursorNode: HeightPoint | undefined) => void;
}

export interface HeightPoint {
  location: LatLng;
  height: number;
  groundHeight: number;
  distance: number;
  closest_node: GridTile;
}
