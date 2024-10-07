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
  loading: boolean;
  response: ConeSearchResponse | undefined;
  startPosition: LatLng | undefined;
  grid: GridTile[][] | undefined;
}

export interface ImageState {
  heightAGLUrl: string;
  heightUrl: string;
  bounds: LatLngBounds;
}

export interface PathAndNode {
  path: LatLng[] | undefined;
  node: GridTile | undefined;
  setPath: (path: LatLng[] | undefined) => void;
  setNode: (node: GridTile | undefined) => void;
}
