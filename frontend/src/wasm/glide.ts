export interface WasmSearchInput {
  glide_number: number;
  additional_height: number;
  start_height: number | undefined;
  wind_speed: number;
  wind_direction: number;
  trim_speed: number;
  safety_margin: number;
  start_distance: number;
}

export interface WasmHeightMapInput {
  heights: number[];
  grid_shape: [number, number];
  cell_size: number;
  min_cell_size: number;
  lat: [number, number];
  lon: [number, number];
  start_ix: [number, number];
}

export interface WasmFlightConeRequest {
  height_map: WasmHeightMapInput;
  search: WasmSearchInput;
}

export interface WasmFlightConeNode {
  index: [number, number];
  reference: [number, number] | undefined;
  height: number;
  distance: number;
  agl: number;
  in_safety_margin: boolean;
}

export interface WasmFlightConeResponse {
  nodes: WasmFlightConeNode[];
  cell_size: number;
  min_cell_size: number;
  lat: [number, number];
  lon: [number, number];
  start_ix: [number, number];
  grid_shape: [number, number];
  start_height: number;
}

type WasmApi = {
  default: (
    moduleOrPath?:
      | WebAssembly.Module
      | BufferSource
      | string
      | URL
      | Response
      | Promise<Response>,
  ) => Promise<unknown>;
  compute_flight_cone: (request: unknown) => unknown;
};

let initPromise: Promise<WasmApi> | undefined;

async function loadWasmApi(): Promise<WasmApi> {
  if (initPromise !== undefined) {
    return initPromise;
  }

  initPromise = import("./pkg/glide_wasm.js") as Promise<WasmApi>;
  return initPromise;
}

export async function computeFlightCone(
  request: WasmFlightConeRequest,
): Promise<WasmFlightConeResponse> {
  const wasm = await loadWasmApi();
  await wasm.default();
  return wasm.compute_flight_cone(request) as WasmFlightConeResponse;
}
