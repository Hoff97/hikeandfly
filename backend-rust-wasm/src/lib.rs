use std::f32::consts::PI;

use backend_rust::{
    height_data::HeightGrid,
    search::{search_from_height_grid, SearchQuery},
};
use ndarray::Array2;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
struct HeightMapInput {
    heights: Vec<i16>,
    grid_shape: [usize; 2],
    cell_size: f32,
    min_cell_size: f32,
    lat: [f32; 2],
    lon: [f32; 2],
    start_ix: [u16; 2],
}

#[derive(Debug, Deserialize)]
struct SearchInput {
    glide_number: f32,
    additional_height: f32,
    start_height: Option<f32>,
    wind_speed: f32,
    wind_direction: f32,
    trim_speed: f32,
    safety_margin: f32,
    start_distance: f32,
}

#[derive(Debug, Deserialize)]
struct FlightConeRequest {
    height_map: HeightMapInput,
    search: SearchInput,
}

#[derive(Debug, Serialize)]
struct FlightConeNode {
    index: [u16; 2],
    reference: Option<[u16; 2]>,
    height: f32,
    distance: f32,
    agl: f32,
    in_safety_margin: bool,
}

#[derive(Debug, Serialize)]
struct FlightConeResponse {
    nodes: Vec<FlightConeNode>,
    cell_size: f32,
    min_cell_size: f32,
    lat: [f32; 2],
    lon: [f32; 2],
    start_ix: [u16; 2],
    grid_shape: [usize; 2],
    start_height: f32,
}

#[wasm_bindgen]
pub fn compute_flight_cone(request: JsValue) -> Result<JsValue, JsValue> {
    let request: FlightConeRequest = serde_wasm_bindgen::from_value(request)
        .map_err(|e| JsValue::from_str(&format!("Invalid request payload: {e}")))?;

    let expected_len = request.height_map.grid_shape[0] * request.height_map.grid_shape[1];
    if request.height_map.heights.len() != expected_len {
        return Err(JsValue::from_str(
            "Invalid height map payload: grid shape does not match values length",
        ));
    }

    let grid = HeightGrid {
        heights: Array2::from_shape_vec(
            (
                request.height_map.grid_shape[0],
                request.height_map.grid_shape[1],
            ),
            request.height_map.heights,
        )
        .map_err(|e| JsValue::from_str(&format!("Could not create height grid: {e}")))?,
        cell_size: request.height_map.cell_size,
        min_cell_size: request.height_map.min_cell_size,
        latitudes: (request.height_map.lat[0], request.height_map.lat[1]),
        longitudes: (request.height_map.lon[0], request.height_map.lon[1]),
    };

    let query = SearchQuery {
        glide_ratio: 1.0 / request.search.glide_number,
        trim_speed: request.search.trim_speed,
        wind_direction: request.search.wind_direction / 180.0 * PI,
        wind_speed: request.search.wind_speed,
        start_height: request.search.start_height,
        additional_height: request.search.additional_height,
        safety_margin: request.search.safety_margin,
        start_distance: request.search.start_distance,
    };

    let start_ix = (
        request.height_map.start_ix[0],
        request.height_map.start_ix[1],
    );
    let result = search_from_height_grid(grid, start_ix, query);

    let start_height = result
        .explored
        .iter()
        .find(|n| n.ix == result.start_ix)
        .map(|n| n.height)
        .unwrap_or(result.ground_height);

    let nodes = result
        .explored
        .iter()
        .filter(|node| node.reachable)
        .map(|node| FlightConeNode {
            index: [node.ix.0, node.ix.1],
            reference: node.reference.map(|r| [r.0, r.1]),
            height: node.height,
            distance: node.distance,
            agl: node.height
                - result.height_grid.heights[(node.ix.0 as usize, node.ix.1 as usize)] as f32,
            in_safety_margin: node.in_safety_margin,
        })
        .collect::<Vec<_>>();

    let response = FlightConeResponse {
        nodes,
        cell_size: result.height_grid.cell_size,
        min_cell_size: result.height_grid.min_cell_size,
        lat: [
            result.height_grid.latitudes.0,
            result.height_grid.latitudes.1,
        ],
        lon: [
            result.height_grid.longitudes.0,
            result.height_grid.longitudes.1,
        ],
        start_ix: [result.start_ix.0, result.start_ix.1],
        grid_shape: [
            result.height_grid.heights.shape()[0],
            result.height_grid.heights.shape()[1],
        ],
        start_height,
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Could not serialize response: {e}")))
}
