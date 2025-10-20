#![allow(unused_variables)]
use core::f32;
use std::{
    cmp::{max, min, Ordering},
    f32::consts::PI,
    fs::{self, File},
    hash::{Hash, Hasher},
    io::{BufRead, BufReader, Cursor},
};

use once_cell::sync::OnceCell;
use rocket_ws::{Stream, WebSocket};

use backend_rust::{
    colors::{f32_color_to_u8, lerp},
    height_data::{location_supported, HeightGrid},
    search::{search_from_point, GridIx, Node, SearchQuery},
    textsearch::{PrefixTrie, SearchIndex},
};

use image::{DynamicImage, GenericImage, ImageFormat, Rgba};
use quick_xml::{
    events::{BytesEnd, BytesStart, BytesText, Event},
    Writer,
};
use rocket::{
    fs::FileServer,
    http::{ContentType, Status},
    response::Redirect,
    serde::{json::Json, Serialize},
};

use ndarray::{s, Array2};

use cached::proc_macro::cached;
use serde::Deserialize;

#[macro_use]
extern crate rocket;

#[get("/")]
fn index() -> Redirect {
    Redirect::to("/static/index.html")
}

const CELL_SIZE_DEFAULT: f32 = 200.0;
const CELL_SIZE_MINIMUM: f32 = 30.0;
const CELL_SIZE_MAXIMUM: f32 = 500.0;
const GLIDE_NUMBER_DEFAULT: f32 = 8.0;
const GLIDE_NUMBER_MAXIMUM: f32 = 15.0;
const GLIDE_NUMBER_MINIMUM: f32 = 1.0;
const ADDITIONAL_HEIGHT_DEFAULT: f32 = 10.0;
const ADDITIONAL_HEIGHT_MAXIMUM: f32 = 1000.0;
const ADDITIONAL_HEIGHT_MINIMUM: f32 = 0.0;
const WIND_SPEED_DEFAULT: f32 = 0.0;
const WIND_SPEED_MINIMUM: f32 = 0.0;
const WIND_SPEED_MAXIMUM: f32 = 50.0;
const WIND_DIRECTION_DEFAULT: f32 = 0.0;
const TRIM_SPEED_DEFAULT: f32 = 38.0;
const TRIM_SPEED_MINIMUM: f32 = 0.0;
const TRIM_SPEED_MAXIMUM: f32 = 80.0;
const SAFETY_MARGIN_DEFAULT: f32 = 0.0;
const SAFETY_MARGIN_MINIMUM: f32 = 0.0;
const START_DISTANCE_DEFAULT: f32 = 0.0;
const START_DISTANCE_MINIMUM: f32 = 0.0;

#[derive(Debug, Clone)]
struct Distance(f32);

impl Distance {
    fn canonicalize(&self) -> i32 {
        (self.0 * 1024.0 * 1024.0).round() as i32
    }
}

impl PartialEq for Distance {
    fn eq(&self, other: &Distance) -> bool {
        self.canonicalize() == other.canonicalize()
    }
}

impl Eq for Distance {}

impl Hash for Distance {
    fn hash<H>(&self, state: &mut H)
    where
        H: Hasher,
    {
        self.canonicalize().hash(state);
    }
}

#[derive(Hash, PartialEq, Eq, Clone)]
struct SearchQueryHashable {
    pub glide_ratio: Distance,
    pub trim_speed: Distance,
    pub wind_direction: Distance,
    pub wind_speed: Distance,
    pub start_height: Option<Distance>,
    pub additional_height: Distance,
    pub safety_margin: Distance,
    pub start_distance: Distance,
}

impl SearchQueryHashable {
    pub fn search_query(self) -> SearchQuery {
        SearchQuery {
            glide_ratio: self.glide_ratio.0,
            trim_speed: self.trim_speed.0,
            wind_direction: self.wind_direction.0,
            wind_speed: self.wind_speed.0,
            start_height: self.start_height.map(|x| x.0),
            additional_height: self.additional_height.0,
            safety_margin: self.safety_margin.0,
            start_distance: self.start_distance.0,
        }
    }
}

#[cached(size = 1000, sync_writes = "by_key")]
fn search_from_point_memoized(
    latitude: Distance,
    longitude: Distance,
    cell_size: Distance,
    query: SearchQueryHashable,
) -> (Vec<Node>, HeightGrid, f32, GridIx) {
    let search_result =
        search_from_point(latitude.0, longitude.0, cell_size.0, query.search_query());
    (
        search_result.explored.into_it().collect(),
        search_result.height_grid,
        search_result.ground_height,
        search_result.start_ix,
    )
}

pub struct SearchFromRequestResult {
    explored: Vec<Node>,
    height_grid: HeightGrid,
    heights: Array2<f32>,
    node_heights: Array2<f32>,
    height_at_start: f32,
    start_ix: GridIx,
    in_safety_margin: Array2<bool>,
}

#[allow(clippy::too_many_arguments)]
pub fn search_from_request(
    lat: f32,
    lon: f32,
    cell_size_opt: Option<f32>,
    glide_number_opt: Option<f32>,
    additional_height_opt: Option<f32>,
    start_height: Option<f32>,
    wind_speed_opt: Option<f32>,
    wind_direction_opt: Option<f32>,
    trim_speed_opt: Option<f32>,
    safety_margin_opt: Option<f32>,
    start_distance_opt: Option<f32>,
) -> SearchFromRequestResult {
    let cell_size = cell_size_opt
        .unwrap_or(CELL_SIZE_DEFAULT)
        .clamp(CELL_SIZE_MINIMUM, CELL_SIZE_MAXIMUM);
    let glide_number = glide_number_opt
        .unwrap_or(GLIDE_NUMBER_DEFAULT)
        .clamp(GLIDE_NUMBER_MINIMUM, GLIDE_NUMBER_MAXIMUM);
    let additional_height = additional_height_opt
        .unwrap_or(ADDITIONAL_HEIGHT_DEFAULT)
        .clamp(ADDITIONAL_HEIGHT_MINIMUM, ADDITIONAL_HEIGHT_MAXIMUM);
    let wind_speed = wind_speed_opt
        .unwrap_or(WIND_SPEED_DEFAULT)
        .clamp(WIND_SPEED_MINIMUM, WIND_SPEED_MAXIMUM);
    let wind_direction = wind_direction_opt.unwrap_or(WIND_DIRECTION_DEFAULT);
    let trim_speed = trim_speed_opt
        .unwrap_or(TRIM_SPEED_DEFAULT)
        .clamp(TRIM_SPEED_MINIMUM, TRIM_SPEED_MAXIMUM);
    let safety_margin = safety_margin_opt
        .unwrap_or(SAFETY_MARGIN_DEFAULT)
        .max(SAFETY_MARGIN_MINIMUM);
    let start_distance = start_distance_opt
        .unwrap_or(START_DISTANCE_DEFAULT)
        .max(START_DISTANCE_MINIMUM);

    let accuracy = 10000.0;

    let lat_rounded = (lat * accuracy).round() / accuracy;
    let lon_rounded = (lon * accuracy).round() / accuracy;

    let (explored, grid, height_at_start, start_ix) = search_from_point_memoized(
        Distance(lat_rounded),
        Distance(lon_rounded),
        Distance(cell_size),
        SearchQueryHashable {
            start_height: start_height.map(Distance),
            additional_height: Distance(additional_height),
            wind_speed: Distance(wind_speed),
            wind_direction: Distance(wind_direction / 180.0 * PI),
            glide_ratio: Distance(1.0 / glide_number),
            trim_speed: Distance(trim_speed),
            safety_margin: Distance(safety_margin),
            start_distance: Distance(start_distance),
        },
    );

    let mut heights =
        Array2::from_elem((grid.heights.shape()[0], grid.heights.shape()[1]), -1000.0);
    let mut node_heights =
        Array2::from_elem((grid.heights.shape()[0], grid.heights.shape()[1]), -1000.0);
    let mut in_safety_margin =
        Array2::from_elem((grid.heights.shape()[0], grid.heights.shape()[1]), false);

    for node in explored.iter() {
        if node.reachable {
            heights[(node.ix.0 as usize, node.ix.1 as usize)] =
                node.height - grid.heights[(node.ix.0 as usize, node.ix.1 as usize)] as f32;
            node_heights[(node.ix.0 as usize, node.ix.1 as usize)] = node.height;
            in_safety_margin[(node.ix.0 as usize, node.ix.1 as usize)] = node.in_safety_margin;
        }
    }

    SearchFromRequestResult {
        explored,
        height_grid: grid,
        heights,
        node_heights,
        height_at_start,
        start_ix,
        in_safety_margin,
    }
}

#[derive(Serialize)]
struct NodeResponse {
    index: GridIx,
    height: i16,
    distance: i32,
    reference: Option<GridIx>,
    agl: i16,
}

#[derive(Serialize)]
struct ReducedNodeResponse {
    // Index of the node in the grid
    i: GridIx,
    // Reference to another node (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    r: Option<GridIx>,
}

#[derive(Serialize)]
struct FlightConeResponse {
    nodes: Option<Vec<NodeResponse>>,
    cell_size: f32,
    min_cell_size: f32,
    angular_resolution: (f32, f32),
    lat: (f32, f32),
    lon: (f32, f32),
    start_ix: GridIx,
    grid_shape: (usize, usize),
    start_height: f32,
}

#[allow(clippy::too_many_arguments)]
#[get("/flight_cone?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<start_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_flight_cone(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    start_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> Result<Json<FlightConeResponse>, Status> {
    if !location_supported(lat, lon) {
        return Result::Err(Status::NotFound);
    }

    let search_from_request_result = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        start_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

    let grid = search_from_request_result.height_grid;
    let explored = search_from_request_result.explored;
    let height_at_start = search_from_request_result.height_at_start;
    let start_ix = search_from_request_result.start_ix;

    let resolution = grid.get_angular_resolution();

    let mut response = FlightConeResponse {
        nodes: None,
        cell_size: grid.cell_size,
        angular_resolution: resolution,
        start_ix,
        lat: grid.latitudes,
        lon: grid.longitudes,
        min_cell_size: grid.min_cell_size,
        grid_shape: (grid.heights.shape()[0], grid.heights.shape()[1]),
        start_height: height_at_start,
    };

    let mut nodes = vec![];

    for node in explored {
        if node.reachable {
            nodes.push(NodeResponse {
                index: node.ix,
                height: node.height as i16,
                distance: node.distance as i32,
                reference: node.reference,
                agl: node.height as i16 - grid.heights[(node.ix.0 as usize, node.ix.1 as usize)],
            })
        }
    }

    response.nodes = Some(nodes);

    Result::Ok(Json(response))
}

#[allow(clippy::too_many_arguments)]
#[get("/flight_cone_ws/ws?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<start_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_flight_cone_stream(
    ws: WebSocket,
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    start_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> Stream!['static] {
    let search_from_request_result = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        start_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

    let grid = search_from_request_result.height_grid;
    let explored = search_from_request_result.explored;

    let mut nodes = vec![];
    let mut distances = std::collections::HashMap::<GridIx, f32>::new();

    for node in explored {
        if node.reachable {
            distances.insert(node.ix, node.distance);
            nodes.push(node);
        }
    }

    // Group nodes by reference, sort by distance of the reference
    let groups = nodes.iter().fold(
        std::collections::HashMap::<Option<GridIx>, Vec<&Node>>::new(),
        |mut acc, node| {
            acc.entry(node.reference).or_default().push(node);
            acc
        },
    );
    let mut groups = groups
        .into_iter()
        .map(|(a, b)| (a.map(|ix| distances[&ix]).unwrap_or(-1.0), b))
        .collect::<Vec<_>>();
    groups.sort_by(|a, b| {
        if a.0 < b.0 {
            Ordering::Less
        } else {
            Ordering::Greater
        }
    });
    let returned_nodes = groups
        .into_iter()
        .flat_map(|(_, mut v)| {
            v.sort_by(|a, b| {
                if a.distance < b.distance {
                    Ordering::Less
                } else {
                    Ordering::Greater
                }
            });
            v
        })
        .cloned()
        .collect::<Vec<_>>();

    let mut last_reference = None;

    Stream! { ws =>
        let chunk_size = 20000;
        for i in (0..returned_nodes.len()).step_by(chunk_size) {
            let n = returned_nodes[i..(i + chunk_size).min(returned_nodes.len())].iter().map(|node| {
                let reference = if node.reference == last_reference {
                    None
                } else {
                    last_reference = node.reference;
                    node.reference
                };
                ReducedNodeResponse {
                    i: node.ix,
                    r: reference,
                }
            }).collect::<Vec<_>>();
            let response_str = serde_json::to_string(&n).unwrap();
            yield rocket_ws::Message::Text(response_str);
        }
    }
}

#[allow(clippy::too_many_arguments)]
#[get("/flight_cone_bounds?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<start_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_flight_cone_bounds(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    start_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> Result<Json<FlightConeResponse>, Status> {
    if !location_supported(lat, lon) {
        return Result::Err(Status::NotFound);
    }

    let search_from_request_result = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        start_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

    let grid = search_from_request_result.height_grid;
    let height_at_start = search_from_request_result.height_at_start;
    let start_ix = search_from_request_result.start_ix;

    let resolution = grid.get_angular_resolution();

    let response = FlightConeResponse {
        nodes: None,
        cell_size: grid.cell_size,
        angular_resolution: resolution,
        start_ix,
        lat: grid.latitudes,
        lon: grid.longitudes,
        min_cell_size: grid.min_cell_size,
        grid_shape: (grid.heights.shape()[0], grid.heights.shape()[1]),
        start_height: height_at_start,
    };

    Result::Ok(Json(response))
}

const DEFAULT_LERP_COLORS: [[f32; 4]; 3] = [
    [255.0, 0.0, 0.0, 255.0],
    [180.0, 190.0, 0.0, 255.0],
    [0.0, 150.0, 255.0, 255.0],
];
const SAFETY_MARGIN_LERP_COLORS: [[f32; 4]; 3] = [
    [255.0 / 5.0 * 3.0, 0.0, 0.0, 255.0],
    [180.0 / 5.0 * 3.0, 190.0 / 5.0 * 3.0, 0.0, 255.0],
    [0.0, 150.0 / 5.0 * 3.0, 255.0 / 5.0 * 3.0, 255.0],
];
const DEFAULT_LERP_STEPS: [f32; 3] = [0.0, 0.5, 1.0];

#[allow(clippy::too_many_arguments)]
#[get("/agl_image?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<start_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_agl_image(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    start_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> (ContentType, Vec<u8>) {
    let search_from_request_result = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        start_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

    let heights = search_from_request_result.heights;
    let in_safety_margin = search_from_request_result.in_safety_margin;

    let mut imgx = heights.shape()[0];
    let mut imgy = heights.shape()[1];

    let mut hmin = f32::MAX;
    let mut hmax = f32::MIN;
    let mut x_lower = usize::MAX;
    let mut x_upper = usize::MIN;
    let mut y_lower = usize::MAX;
    let mut y_upper = usize::MIN;

    for x in 0..imgx {
        for y in 0..imgy {
            if heights[(x, y)] > 0.0 {
                hmin = hmin.min(heights[(x, y)]);
                hmax = hmax.max(heights[(x, y)]);

                x_lower = min(x_lower, x);
                x_upper = max(x_upper, x);
                y_lower = min(y_lower, y);
                y_upper = max(y_upper, y);
            }
        }
    }

    hmin = hmin.max(safety_margin.unwrap_or(0.0));

    if x_lower == usize::MAX {
        imgx = 1;
        imgy = 1;
        x_lower = 0;
        x_upper = 0;
        y_lower = 0;
        y_upper = 0;
    } else {
        imgx = (x_upper - x_lower) + 1;
        imgy = (y_upper - y_lower) + 1;
    }

    let heights_sub = heights.slice(s![x_lower..(x_upper + 1), y_lower..(y_upper + 1)]);
    let safety_margin_sub =
        in_safety_margin.slice(s![x_lower..(x_upper + 1), y_lower..(y_upper + 1)]);

    let mut img = DynamicImage::new_rgba8(imgy as u32, imgx as u32);

    // Iterate over the coordinates and pixels of the image
    for x in 0..imgx {
        for y in 0..imgy {
            let ix = (x, y);
            if heights_sub[ix] > 0.0 {
                let agl = heights_sub[ix];
                let s = ((agl - hmin) / (hmax - hmin)).clamp(0.0, 1.0);

                if safety_margin_sub[ix] {
                    img.put_pixel(
                        y as u32,
                        (imgx - x) as u32 - 1,
                        Rgba(f32_color_to_u8(lerp(
                            &SAFETY_MARGIN_LERP_COLORS,
                            &DEFAULT_LERP_STEPS,
                            s,
                        ))),
                    );
                } else {
                    img.put_pixel(
                        y as u32,
                        (imgx - x) as u32 - 1,
                        Rgba(f32_color_to_u8(lerp(
                            &DEFAULT_LERP_COLORS,
                            &DEFAULT_LERP_STEPS,
                            s,
                        ))),
                    );
                }
            } else {
                img.put_pixel(y as u32, (imgx - x) as u32 - 1, Rgba([255, 255, 255, 0]));
            }
        }
    }

    let mut c = Cursor::new(Vec::new());
    img.write_to(&mut c, ImageFormat::Png).expect("");
    (ContentType::PNG, c.into_inner())
}

#[allow(clippy::too_many_arguments)]
#[get("/height_image?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<start_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_height_image(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    start_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> (ContentType, Vec<u8>) {
    let search_from_request_result = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        start_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

    let heights = search_from_request_result.node_heights;
    let safety_margin = search_from_request_result.in_safety_margin;

    let mut imgx = heights.shape()[0];
    let mut imgy = heights.shape()[1];

    let mut hmin = f32::MAX;
    let mut hmax = f32::MIN;
    let mut x_lower = usize::MAX;
    let mut x_upper = usize::MIN;
    let mut y_lower = usize::MAX;
    let mut y_upper = usize::MIN;

    for x in 0..imgx {
        for y in 0..imgy {
            if heights[(x, y)] > 0.0 {
                hmin = hmin.min(heights[(x, y)]);
                hmax = hmax.max(heights[(x, y)]);

                x_lower = min(x_lower, x);
                x_upper = max(x_upper, x);
                y_lower = min(y_lower, y);
                y_upper = max(y_upper, y);
            }
        }
    }

    imgx = (x_upper - x_lower) + 1;
    imgy = (y_upper - y_lower) + 1;

    let heights_sub = heights.slice(s![x_lower..(x_upper + 1), y_lower..(y_upper + 1)]);
    let safety_margin_sub = safety_margin.slice(s![x_lower..(x_upper + 1), y_lower..(y_upper + 1)]);

    let mut img = DynamicImage::new_rgba8(imgy as u32, imgx as u32);

    // Iterate over the coordinates and pixels of the image
    for x in 0..imgx {
        for y in 0..imgy {
            let ix = (x, y);
            if heights_sub[ix] > 0.0 {
                let height = heights_sub[ix];
                let s = (height - hmin) / (hmax - hmin);

                if safety_margin_sub[ix] {
                    img.put_pixel(
                        y as u32,
                        (imgx - x) as u32 - 1,
                        Rgba(f32_color_to_u8(lerp(
                            &SAFETY_MARGIN_LERP_COLORS,
                            &DEFAULT_LERP_STEPS,
                            s,
                        ))),
                    );
                } else {
                    img.put_pixel(
                        y as u32,
                        (imgx - x) as u32 - 1,
                        Rgba(f32_color_to_u8(lerp(
                            &DEFAULT_LERP_COLORS,
                            &DEFAULT_LERP_STEPS,
                            s,
                        ))),
                    );
                }
            } else {
                img.put_pixel(y as u32, (imgx - x) as u32 - 1, Rgba([255, 255, 255, 0]));
            }
        }
    }

    let mut c = Cursor::new(Vec::new());
    img.write_to(&mut c, ImageFormat::Png).expect("");
    (ContentType::PNG, c.into_inner())
}

#[allow(clippy::too_many_arguments)]
#[get("/raw_height_image?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<start_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_raw_height_image(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    start_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> (ContentType, Vec<u8>) {
    let search_from_request_result = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        start_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

    let heights = search_from_request_result.heights;
    let in_safety_margin = search_from_request_result.in_safety_margin;

    let mut imgx = heights.shape()[0];
    let mut imgy = heights.shape()[1];

    let mut hmin = f32::MAX;
    let mut hmax = f32::MIN;
    let mut x_lower = usize::MAX;
    let mut x_upper = usize::MIN;
    let mut y_lower = usize::MAX;
    let mut y_upper = usize::MIN;

    for x in 0..imgx {
        for y in 0..imgy {
            if heights[(x, y)] > 0.0 {
                hmin = hmin.min(heights[(x, y)]);
                hmax = hmax.max(heights[(x, y)]);

                x_lower = min(x_lower, x);
                x_upper = max(x_upper, x);
                y_lower = min(y_lower, y);
                y_upper = max(y_upper, y);
            }
        }
    }

    imgx = (x_upper - x_lower) + 1;
    imgy = (y_upper - y_lower) + 1;

    let heights_sub = heights.slice(s![x_lower..(x_upper + 1), y_lower..(y_upper + 1)]);
    let safety_margin_sub =
        in_safety_margin.slice(s![x_lower..(x_upper + 1), y_lower..(y_upper + 1)]);

    let mut img = DynamicImage::new_rgb8(imgy as u32, imgx as u32);

    // Iterate over the coordinates and pixels of the image
    for x in 0..imgx {
        for y in 0..imgy {
            let ix = (x, y);
            if heights_sub[ix] >= 0.0 {
                let height = heights_sub[ix].round() as i32;
                let safety_margin = safety_margin_sub[ix];
                img.put_pixel(
                    y as u32,
                    (imgx - x) as u32 - 1,
                    Rgba([
                        (height / 256) as u8,
                        (height % 256) as u8,
                        if safety_margin { 128 } else { 255 },
                        255,
                    ]),
                );
            } else {
                img.put_pixel(y as u32, (imgx - x) as u32 - 1, Rgba([255, 255, 0, 255]));
            }
        }
    }

    let mut c = Cursor::new(Vec::new());
    img.write_to(&mut c, ImageFormat::Png).expect("");
    (ContentType::PNG, c.into_inner())
}

fn single_element(name: &str, content: &str, writer: &mut Writer<Cursor<Vec<u8>>>) {
    start(name, writer);
    writer
        .write_event(Event::Text(BytesText::new(content)))
        .unwrap();
    end(name, writer);
}

fn start(name: &str, writer: &mut Writer<Cursor<Vec<u8>>>) {
    //writer.write_indent().unwrap();
    writer
        .write_event(Event::Start(BytesStart::new(name)))
        .unwrap();
}

fn end(name: &str, writer: &mut Writer<Cursor<Vec<u8>>>) {
    //writer.write_indent().unwrap();
    writer.write_event(Event::End(BytesEnd::new(name))).unwrap();
}

fn interpolate(node: &Node, px: u16, py: u16, heights: &Array2<f32>) -> f32 {
    let x = min((node.ix.0 + px) as usize, heights.shape()[0] - 1);
    let y = min((node.ix.1 + py) as usize, heights.shape()[1] - 1);
    if heights[(x, y)] > -1000.0 {
        heights[(x, y)]
    } else {
        node.height
    }
}

#[allow(clippy::too_many_arguments)]
#[get("/kml?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<start_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_kml(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    start_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> (ContentType, Vec<u8>) {
    let search_from_request_result = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        start_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

    let heights = search_from_request_result.heights;
    let node_heights = search_from_request_result.node_heights;
    let height_grid = search_from_request_result.height_grid;
    let nodes = search_from_request_result.explored;

    let imgx = heights.shape()[0];
    let imgy = heights.shape()[1];
    let mut hmin = f32::MAX;
    let mut hmax = f32::MIN;
    for x in 0..imgx {
        for y in 0..imgy {
            if heights[(x, y)] > -1000.0 {
                hmin = hmin.min(heights[(x, y)]);
                hmax = hmax.max(heights[(x, y)]);
            }
        }
    }

    let lat_resolution =
        (height_grid.latitudes.1 - height_grid.latitudes.0) / height_grid.heights.shape()[0] as f32;
    let lon_resolution = (height_grid.longitudes.1 - height_grid.longitudes.0)
        / height_grid.heights.shape()[1] as f32;

    let lat_r_2 = lat_resolution / 2.0;
    let lon_r_2 = lon_resolution / 2.0;

    let cursor = Cursor::new(Vec::new());
    let mut writer = Writer::new_with_indent(cursor, b' ', 4);

    let mut elem = BytesStart::new("kml");
    elem.push_attribute(("xmlns", "http://www.opengis.net/kml/2.2"));
    writer.write_event(Event::Start(elem)).unwrap();
    start("Document", &mut writer);

    for node in nodes {
        if node.reachable {
            let x = node.ix.0 as f32 * lat_resolution + height_grid.latitudes.0;
            let y = node.ix.1 as f32 * lon_resolution + height_grid.longitudes.0;

            let agl = heights[(node.ix.0 as usize, node.ix.1 as usize)];
            let s = ((agl - hmin) / (hmax - hmin)).clamp(0.0, 1.0);
            let color = f32_color_to_u8(lerp(&DEFAULT_LERP_COLORS, &DEFAULT_LERP_STEPS, s));

            let color_string = format!(
                "{:02x}{:02x}{:02x}{:02x}",
                150u8, color[2], color[1], color[0],
            );

            start("Placemark", &mut writer);

            start("Style", &mut writer);
            start("LineStyle", &mut writer);

            single_element("color", color_string.as_str(), &mut writer); //TODO: Fix color
            end("LineStyle", &mut writer);
            start("PolyStyle", &mut writer);
            single_element("color", color_string.as_str(), &mut writer);
            single_element("outline", "1", &mut writer);
            end("PolyStyle", &mut writer);
            end("Style", &mut writer);

            start("Polygon", &mut writer);
            single_element("altitudeMode", "absolute", &mut writer);
            start("outerBoundaryIs", &mut writer);
            start("LinearRing", &mut writer);
            start("coordinates", &mut writer);

            writer.write_indent().unwrap();
            writer
                .write_event(Event::Text(BytesText::new(
                    format!("{},{},{}", y - lon_r_2, x - lat_r_2, node.height).as_str(),
                )))
                .unwrap();
            writer.write_indent().unwrap();
            writer
                .write_event(Event::Text(BytesText::new(
                    format!(
                        "{},{},{}",
                        y - lon_r_2,
                        x + lat_r_2,
                        interpolate(&node, 1, 0, &node_heights)
                    )
                    .as_str(),
                )))
                .unwrap();
            writer.write_indent().unwrap();
            writer
                .write_event(Event::Text(BytesText::new(
                    format!(
                        "{},{},{}",
                        y + lon_r_2,
                        x + lat_r_2,
                        interpolate(&node, 1, 1, &node_heights)
                    )
                    .as_str(),
                )))
                .unwrap();
            writer.write_indent().unwrap();
            writer
                .write_event(Event::Text(BytesText::new(
                    format!(
                        "{},{},{}",
                        y + lon_r_2,
                        x - lat_r_2,
                        interpolate(&node, 0, 1, &node_heights)
                    )
                    .as_str(),
                )))
                .unwrap();
            writer.write_indent().unwrap();
            writer
                .write_event(Event::Text(BytesText::new(
                    format!("{},{},{}", y - lon_r_2, x - lat_r_2, node.height).as_str(),
                )))
                .unwrap();
            writer.write_indent().unwrap();

            end("coordinates", &mut writer);
            end("LinearRing", &mut writer);
            end("outerBoundaryIs", &mut writer);
            end("Polygon", &mut writer);

            end("Placemark", &mut writer);
        }
    }

    end("Document", &mut writer);
    end("kml", &mut writer);

    (ContentType::XML, writer.into_inner().into_inner())
}

#[derive(Serialize, Deserialize, Clone)]
struct Location {
    name: String,
    center: Vec<f32>,
}

fn search_index() -> &'static SearchIndex<PrefixTrie, Location> {
    static INSTANCE: OnceCell<SearchIndex<PrefixTrie, Location>> = OnceCell::new();
    INSTANCE.get_or_init(|| {
        println!("Building search index...");
        let mut ix = SearchIndex::new();

        let paths = fs::read_dir("./data").unwrap();

        for path in paths {
            let path = path.unwrap().path();
            if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                println!("Loading search data from {:?}", path);
                let r = File::open(path).unwrap();
                let reader = BufReader::new(r);
                for line in reader.lines() {
                    let location: Location = serde_json::from_str(&line.unwrap()).unwrap();
                    ix.insert(location.name.to_ascii_lowercase().as_str(), location);
                }
            }
        }
        ix.finalize()
    })
}

#[allow(clippy::too_many_arguments)]
#[get("/search?<query>")]
fn search(query: String) -> Result<Json<Vec<Location>>, Status> {
    let ix = search_index();

    let q = query.as_str().to_ascii_lowercase();
    let result = ix.find_with_max_edit_distance(&q, 2, true).take(10);

    Result::Ok(Json(
        result
            .map(|x| Location {
                name: x.1.name.clone(),
                center: x.1.center.clone(),
            })
            .collect(),
    ))
}

#[launch]
fn rocket() -> _ {
    search_index();

    rocket::build()
        .mount("/", routes![index])
        .mount("/", routes![get_flight_cone])
        .mount("/", routes![get_flight_cone_stream])
        .mount("/", routes![get_raw_height_image])
        .mount("/", routes![get_flight_cone_bounds])
        .mount("/", routes![search])
        .mount("/", routes![get_agl_image])
        .mount("/", routes![get_height_image])
        .mount("/", routes![get_kml])
        .mount("/static", FileServer::from("./static"))
}
