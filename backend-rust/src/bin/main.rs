use core::f32;
use std::{
    cmp::{max, min},
    collections::HashMap,
    hash::{Hash, Hasher},
    io::Cursor,
};

use backend_rust::{
    colors::{f32_color_to_u8, lerp},
    height_data::HeightGrid,
    search::{search_from_point, GridIx, Node, SearchQuery},
};
use image::{DynamicImage, GenericImage, ImageFormat, Rgba};
use quick_xml::{
    events::{BytesEnd, BytesStart, BytesText, Event},
    Writer,
};
use rocket::{
    fs::FileServer,
    http::ContentType,
    response::Redirect,
    serde::{json::Json, Serialize},
};

use ndarray::{s, Array2};

use cached::proc_macro::cached;

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
const TRIM_SPEED_MAXIMUM: f32 = 50.0;
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
    pub additional_height: Distance,
    pub safety_margin: Distance,
    pub start_distance: Distance,
}

impl SearchQueryHashable {
    pub fn to_search_query(&self) -> SearchQuery {
        SearchQuery {
            glide_ratio: self.glide_ratio.0,
            trim_speed: self.trim_speed.0,
            wind_direction: self.wind_direction.0,
            wind_speed: self.wind_speed.0,
            additional_height: self.additional_height.0,
            safety_margin: self.safety_margin.0,
            start_distance: self.start_distance.0,
        }
    }
}

#[cached]
fn search_from_point_memoized(
    latitude: Distance,
    longitude: Distance,
    cell_size: Distance,
    query: SearchQueryHashable,
) -> (Vec<Node>, HeightGrid) {
    let (explored, height_grid) = search_from_point(
        latitude.0,
        longitude.0,
        cell_size.0,
        query.to_search_query(),
    );
    (
        explored
            .values
            .into_iter()
            .filter(|x| x.is_some())
            .map(|x| x.unwrap())
            .collect(),
        height_grid,
    )
}

pub fn search_from_request(
    lat: f32,
    lon: f32,
    cell_size_opt: Option<f32>,
    glide_number_opt: Option<f32>,
    additional_height_opt: Option<f32>,
    wind_speed_opt: Option<f32>,
    wind_direction_opt: Option<f32>,
    trim_speed_opt: Option<f32>,
    safety_margin_opt: Option<f32>,
    start_distance_opt: Option<f32>,
) -> (Vec<Node>, HeightGrid, Array2<f32>, Array2<f32>) {
    let cell_size = cell_size_opt
        .unwrap_or(CELL_SIZE_DEFAULT)
        .max(CELL_SIZE_MINIMUM)
        .min(CELL_SIZE_MAXIMUM);
    let glide_number = glide_number_opt
        .unwrap_or(GLIDE_NUMBER_DEFAULT)
        .max(GLIDE_NUMBER_MINIMUM)
        .min(GLIDE_NUMBER_MAXIMUM);
    let additional_height = additional_height_opt
        .unwrap_or(ADDITIONAL_HEIGHT_DEFAULT)
        .max(ADDITIONAL_HEIGHT_MINIMUM)
        .min(ADDITIONAL_HEIGHT_MAXIMUM);
    let wind_speed = wind_speed_opt
        .unwrap_or(WIND_SPEED_DEFAULT)
        .max(WIND_SPEED_MINIMUM)
        .min(WIND_SPEED_MAXIMUM);
    let wind_direction = wind_direction_opt.unwrap_or(WIND_DIRECTION_DEFAULT);
    let trim_speed = trim_speed_opt
        .unwrap_or(TRIM_SPEED_DEFAULT)
        .max(TRIM_SPEED_MINIMUM)
        .min(TRIM_SPEED_MAXIMUM);
    let safety_margin = safety_margin_opt
        .unwrap_or(SAFETY_MARGIN_DEFAULT)
        .max(SAFETY_MARGIN_MINIMUM);
    let start_distance = start_distance_opt
        .unwrap_or(START_DISTANCE_DEFAULT)
        .max(START_DISTANCE_MINIMUM);

    let lat_rounded = (lat * 1000.0).round() / 1000.0;
    let lon_rounded = (lon * 1000.0).round() / 1000.0;

    let (explored, grid) = search_from_point_memoized(
        Distance(lat_rounded),
        Distance(lon_rounded),
        Distance(cell_size),
        SearchQueryHashable {
            additional_height: Distance(additional_height),
            wind_speed: Distance(wind_speed),
            wind_direction: Distance(wind_direction),
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

    for node in explored.iter() {
        if node.reachable {
            heights[(node.ix.0 as usize, node.ix.1 as usize)] =
                node.height - grid.heights[(node.ix.0 as usize, node.ix.1 as usize)] as f32;
            node_heights[(node.ix.0 as usize, node.ix.1 as usize)] = node.height;
        }
    }

    return (explored, grid, heights, node_heights);
}

#[derive(Serialize)]

struct NodeResponse {
    index: GridIx,
    height: f32,
    distance: f32,
    lat: f32,
    lon: f32,
    reference: Option<GridIx>,
    size: f32,
    agl: f32,
    gl: i16,
}

#[derive(Serialize)]
struct FlightConeResponse {
    nodes: Vec<NodeResponse>,
    cell_size: f32,
    angular_resolution: (f32, f32),
    lat: (f32, f32),
    lon: (f32, f32),
    grid_shape: (usize, usize),
}

#[get("/flight_cone?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_flight_cone(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> Json<FlightConeResponse> {
    let (explored, grid, _, _) = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

    let (lats, lons) = grid.get_coordinates_for_indices();
    let resolution = grid.get_angular_resolution();

    let mut response = FlightConeResponse {
        nodes: vec![],
        cell_size: grid.cell_size,
        angular_resolution: resolution,
        lat: grid.latitudes,
        lon: grid.longitudes,
        grid_shape: (grid.heights.shape()[0], grid.heights.shape()[1]),
    };

    for node in explored {
        if node.reachable {
            response.nodes.push(NodeResponse {
                index: node.ix,
                height: node.height,
                distance: node.distance,
                lat: lats[node.ix.0 as usize],
                lon: lons[node.ix.1 as usize],
                reference: node.reference,
                size: grid.cell_size,
                agl: node.height - grid.heights[(node.ix.0 as usize, node.ix.1 as usize)] as f32,
                gl: grid.heights[(node.ix.0 as usize, node.ix.1 as usize)],
            })
        }
    }

    return Json(response);
}

const DEFAULT_LERP_COLORS: [[f32; 4]; 3] = [
    [255.0, 0.0, 0.0, 255.0],
    [180.0, 190.0, 0.0, 255.0],
    [0.0, 150.0, 255.0, 255.0],
];
const DEFAULT_LERP_STEPS: [f32; 3] = [0.0, 0.5, 1.0];

#[get("/agl_image?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_agl_image<'a>(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> (ContentType, Vec<u8>) {
    let (_, _, heights, _) = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

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

    let mut img = DynamicImage::new_rgba8(imgy as u32, imgx as u32);

    // Iterate over the coordinates and pixels of the image
    for x in 0..imgx {
        for y in 0..imgy {
            let ix = (x, y);
            if heights_sub[ix] > 0.0 {
                let agl = heights_sub[ix];
                let s = (agl - hmin) / (hmax - hmin);
                img.put_pixel(
                    y as u32,
                    (imgx - x) as u32 - 1,
                    Rgba(f32_color_to_u8(lerp(
                        &DEFAULT_LERP_COLORS,
                        &DEFAULT_LERP_STEPS,
                        s,
                    ))),
                );
            } else {
                img.put_pixel(y as u32, (imgx - x) as u32 - 1, Rgba([255, 255, 255, 0]));
            }
        }
    }

    let mut c = Cursor::new(Vec::new());
    img.write_to(&mut c, ImageFormat::Png).expect("");
    (ContentType::PNG, c.into_inner())
}

#[get("/height_image?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_height_image<'a>(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> (ContentType, Vec<u8>) {
    let (_, _, _, heights) = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

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

    let mut img = DynamicImage::new_rgba8(imgy as u32, imgx as u32);

    // Iterate over the coordinates and pixels of the image
    for x in 0..imgx {
        for y in 0..imgy {
            let ix = (x, y);
            if heights_sub[ix] > 0.0 {
                let height = heights_sub[ix];
                let s = (height - hmin) / (hmax - hmin);
                img.put_pixel(
                    y as u32,
                    (imgx - x) as u32 - 1,
                    Rgba(f32_color_to_u8(lerp(
                        &DEFAULT_LERP_COLORS,
                        &DEFAULT_LERP_STEPS,
                        s,
                    ))),
                );
            } else {
                img.put_pixel(y as u32, (imgx - x) as u32 - 1, Rgba([255, 255, 255, 0]));
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
        return heights[(x, y)];
    } else {
        return node.height;
    }
}

#[get("/kml?<lat>&<lon>&<cell_size>&<glide_number>&<additional_height>&<wind_speed>&<wind_direction>&<trim_speed>&<safety_margin>&<start_distance>")]
fn get_kml<'a>(
    lat: f32,
    lon: f32,
    cell_size: Option<f32>,
    glide_number: Option<f32>,
    additional_height: Option<f32>,
    wind_speed: Option<f32>,
    wind_direction: Option<f32>,
    trim_speed: Option<f32>,
    safety_margin: Option<f32>,
    start_distance: Option<f32>,
) -> (ContentType, Vec<u8>) {
    let (nodes, height_grid, heights, node_heights) = search_from_request(
        lat,
        lon,
        cell_size,
        glide_number,
        additional_height,
        wind_speed,
        wind_direction,
        trim_speed,
        safety_margin,
        start_distance,
    );

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

#[launch]
fn rocket() -> _ {
    rocket::build()
        .mount("/", routes![index])
        .mount("/", routes![get_flight_cone])
        .mount("/", routes![get_agl_image])
        .mount("/", routes![get_height_image])
        .mount("/", routes![get_kml])
        .mount("/static", FileServer::from("./static"))
}