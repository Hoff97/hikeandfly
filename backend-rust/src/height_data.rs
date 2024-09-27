use byteorder::{BigEndian, ByteOrder};
use cached::proc_macro::cached;
use ndarray::linspace;
use ndarray::s;
use ndarray::Array;
use ndarray::Array1;
use ndarray::Array2;
use ndarray::ArrayView;
use ndarray::ArrayViewMut;
use ndarray::AssignElem;
use ndarray::Ix2;
use std::f32::consts::PI;
use std::fs::File;
use std::io::BufReader;
use std::io::Read;

const HGT_SIZE: usize = 3601;
const HGT_SIZE_SQUARED: usize = HGT_SIZE * HGT_SIZE;
const HGT_N_BYTES: usize = HGT_SIZE_SQUARED << 1;

const ANGLE_TO_RADIANS: f32 = PI / 180.0;
const ARC_SECOND_IN_M_EQUATOR: f32 = 1852.0 / 60.0;
const ARC_SECOND_IN_DEGREE: f32 = 1.0 / (60.0 * 60.0); //TODO is this safe

#[cached]
pub fn load_hgt(latitude: i32, longitude: i32) -> Array2<i16> {
    assert!(latitude >= 0, "South not supported for now");
    assert!(longitude >= 0, "West not supported for now");
    // TODO: South and west

    let file_name = format!("./data/N{}E{:03}.hgt", latitude, longitude);
    let file = File::open(file_name).expect("Could not open hgt file");
    let mut reader = BufReader::new(file);
    let mut content = Vec::<u8>::with_capacity(HGT_N_BYTES);

    let total_read = reader
        .read_to_end(&mut content)
        .expect("Could not read hgt file");

    assert!(total_read == HGT_N_BYTES, "Wrong number of bytes read!");

    let mut result_vec = Vec::<i16>::with_capacity(HGT_SIZE_SQUARED);
    for i in (0..HGT_N_BYTES).step_by(2) {
        let mut r = BigEndian::read_i16(&content[i..i + 2]);
        if r < -1000 && result_vec.len() >= 1 {
            r = result_vec[result_vec.len() - 1];
        }
        if r < -1000 && result_vec.len() >= HGT_SIZE {
            r = result_vec[result_vec.len() - HGT_SIZE - 1]
        }
        if r < -1000 && result_vec.len() >= HGT_SIZE - 1 {
            r = result_vec[result_vec.len() - HGT_SIZE]
        }
        if r < -1000 && result_vec.len() >= HGT_SIZE + 1 {
            r = result_vec[result_vec.len() - HGT_SIZE - 2]
        }
        if r < -1000 {
            panic!("No suitable replacement for outlier height value found!");
        }
        result_vec.push(r);
    }

    return Array::from_shape_vec((HGT_SIZE, HGT_SIZE), result_vec).unwrap();
}

#[cached]
pub fn read_hgt_file(latitude: i32, longitude: i32) -> Vec<u8> {
    let file_name = format!("./data/N{}E{:03}.hgt", latitude, longitude);
    let file = File::open(file_name).expect("Could not open hgt file");
    let mut reader = BufReader::new(file);
    let mut content = Vec::<u8>::with_capacity(HGT_N_BYTES);

    let total_read = reader
        .read_to_end(&mut content)
        .expect("Could not read hgt file");

    assert!(total_read == HGT_N_BYTES, "Wrong number of bytes read!");

    return content;
}

pub fn load_hgt_to_array(latitude: i32, longitude: i32, array: &mut ArrayViewMut<'_, i16, Ix2>) {
    let bytes = read_hgt_file(latitude, longitude);

    for i in (0..HGT_N_BYTES).step_by(2) {
        let ix = i >> 1;
        let x = ix / HGT_SIZE;
        let y = ix % HGT_SIZE;

        let mut r = BigEndian::read_i16(&bytes[i..i + 2]);
        if r < -1000 && y > 0 {
            r = array[(x, y - 1)];
        }
        if r < -1000 && x > 0 {
            r = array[(x - 1, y)]
        }
        if r < -1000 && x > 0 && y < HGT_SIZE - 1 {
            r = array[(x - 1, y + 1)]
        }
        if r < -1000 && x > 0 && y > 0 {
            r = array[(x - 1, y - 1)]
        }
        if r < -1000 {
            panic!("No suitable replacement for outlier height value found!");
        }

        array[(x, y)].assign_elem(r);
    }
}

pub fn arcsecond_in_meters(latitude: f32) -> f32 {
    return (latitude * ANGLE_TO_RADIANS).cos() * ARC_SECOND_IN_M_EQUATOR;
}

pub fn meter_in_arcseconds(latitude: f32) -> f32 {
    return 1.0 / arcsecond_in_meters(latitude);
}

#[derive(Clone)]
pub struct HeightGrid {
    pub heights: Array2<i16>,
    pub cell_size: f32,
    pub latitudes: (f32, f32),
    pub longitudes: (f32, f32),
}

pub fn usize_f32(x: usize) -> f32 {
    f32::from(x as u16)
}

pub fn f32_usize(x: f32) -> usize {
    usize::from(x as u16)
}

pub fn i32_f32(x: i32) -> f32 {
    f32::from(x as i16)
}

pub fn scale_2d_array(values: &ArrayView<'_, i16, Ix2>, scales: (f32, f32)) -> Array2<i16> {
    //TODO: Specialize for square shapes?
    let size_x = values.shape()[0] as u16;
    let size_y = values.shape()[1] as u16;

    let n_elems_x = (f32::from(size_x) * scales.0).ceil() as usize;
    let n_elems_y = (f32::from(size_y) * scales.1).ceil() as usize;

    let x_indices = Array1::from_iter(linspace(0.0, f32::from(size_x - 1), n_elems_x)).round();
    let y_indices = Array1::from_iter(linspace(0.0, f32::from(size_y - 1), n_elems_y)).round();

    let mut result = Array2::zeros((n_elems_x, n_elems_y));
    for (new_x, old_x) in x_indices.iter().enumerate() {
        for (new_y, old_y) in y_indices.iter().enumerate() {
            result[[new_x, new_y]] = values[[old_x.clone() as usize, old_y.clone() as usize]]
        }
    }
    result
}

impl HeightGrid {
    pub fn scale(&self, factor: f32) -> HeightGrid {
        HeightGrid {
            heights: scale_2d_array(&self.heights.view(), (factor, factor)),
            cell_size: self.cell_size / factor,
            latitudes: self.latitudes,
            longitudes: self.longitudes,
        }
    }

    pub fn get_angular_resolution(&self) -> (f32, f32) {
        (
            (self.latitudes.1 - self.latitudes.0) / self.heights.shape()[0] as f32,
            (self.longitudes.1 - self.longitudes.0) / self.heights.shape()[1] as f32,
        )
    }

    pub fn get_coordinates_for_indices(&self) -> (Vec<f32>, Vec<f32>) {
        let lats = linspace(self.latitudes.0, self.latitudes.1, self.heights.shape()[0]);
        let lons = linspace(
            self.longitudes.0,
            self.longitudes.1,
            self.heights.shape()[1],
        );

        (Vec::from_iter(lats), Vec::from_iter(lons))
    }
}

pub fn get_height_at_point(latitude: f32, longitude: f32) -> i16 {
    let lat_i = latitude.trunc();
    let lon_i = longitude.trunc();

    let data = load_hgt(lat_i as i32, lon_i as i32);

    let lat_ix = ((latitude - lat_i) * usize_f32(data.shape()[0])).trunc() as usize;
    let lon_ix = ((longitude - lon_i) * usize_f32(data.shape()[1])).trunc() as usize;

    return data
        .get((data.shape()[0] - lat_ix - 1, lon_ix))
        .unwrap()
        .clone();
}

pub fn get_height_data_around_point(
    latitude: f32,
    longitude: f32,
    distance_m_opt: Option<f32>,
) -> HeightGrid {
    let distance_m = distance_m_opt.unwrap_or(15000.0);

    let distance_degree_lat = distance_m * ARC_SECOND_IN_DEGREE / ARC_SECOND_IN_M_EQUATOR;
    let distance_degree_lon = meter_in_arcseconds(latitude) * distance_m * ARC_SECOND_IN_DEGREE;

    let lower_latitude = latitude - distance_degree_lat;
    let upper_latitude = latitude + distance_degree_lat;

    let lower_longitude = longitude - distance_degree_lon;
    let upper_longitude = longitude + distance_degree_lon;

    let lower_lat_i = lower_latitude.trunc() as i32;
    let upper_lat_i = upper_latitude.trunc() as i32;

    let lower_lon_i = lower_longitude.trunc() as i32;
    let upper_lon_i = upper_longitude.trunc() as i32;

    let n_lat = upper_lat_i - lower_lat_i + 1;
    let n_lon = upper_lon_i - lower_lon_i + 1;

    let mut arr = Array2::zeros(((n_lat as usize) * HGT_SIZE, (n_lon as usize) * HGT_SIZE));

    for lat_i in lower_lat_i..upper_lat_i + 1 {
        for lon_i in lower_lon_i..upper_lon_i + 1 {
            //let lat_ix = (n_lat - (lat_i - lower_lat_i) - 1) as usize;
            let lat_ix = (lat_i - lower_lat_i) as usize;
            let lon_ix = (lon_i - lower_lon_i) as usize;

            let mut sub_slice = arr.slice_mut(s![
                lat_ix * HGT_SIZE..(lat_ix + 1) * HGT_SIZE;-1,
                lon_ix * HGT_SIZE..(lon_ix + 1) * HGT_SIZE
            ]);

            let data = load_hgt(lat_i, lon_i);
            sub_slice.assign(&data);

            //load_hgt_to_array(lat_i, lon_i, &mut sub_slice);
        }
    }
    let degree_per_lat_ix = i32_f32((upper_lat_i + 1) - lower_lat_i) / usize_f32(arr.shape()[0]);
    let degree_per_lon_ix = i32_f32((upper_lon_i + 1) - lower_lon_i) / usize_f32(arr.shape()[1]);

    let lower_lat_ix =
        f32_usize(((lower_latitude - i32_f32(lower_lat_i)) / degree_per_lat_ix).trunc());
    let upper_lat_ix =
        f32_usize(((upper_latitude - i32_f32(lower_lat_i)) / degree_per_lat_ix).trunc());

    let lower_lon_ix =
        f32_usize(((lower_longitude - i32_f32(lower_lon_i)) / degree_per_lon_ix).trunc());
    let upper_lon_ix =
        f32_usize(((upper_longitude - i32_f32(lower_lon_i)) / degree_per_lon_ix).trunc());

    let result_arr = arr.slice(s![lower_lat_ix..upper_lat_ix, lower_lon_ix..upper_lon_ix]);

    let lat_resolution_degree =
        (upper_latitude - lower_latitude) / usize_f32(result_arr.shape()[0]);
    let lon_resolution_degree =
        (upper_longitude - lower_longitude) / usize_f32(result_arr.shape()[1]);

    let lat_resolution_meters =
        lat_resolution_degree / ARC_SECOND_IN_DEGREE * ARC_SECOND_IN_M_EQUATOR;
    let lon_resolution_meters =
        lon_resolution_degree / ARC_SECOND_IN_DEGREE * arcsecond_in_meters(latitude);

    let max_resolution = f32::max(lat_resolution_meters, lon_resolution_meters);

    let final_grid = scale_2d_array(
        &result_arr,
        (
            lat_resolution_meters / max_resolution,
            lon_resolution_meters / max_resolution,
        ),
    );

    return HeightGrid {
        heights: final_grid,
        cell_size: max_resolution,
        latitudes: (lower_latitude, upper_latitude),
        longitudes: (lower_longitude, upper_longitude),
    };
}

#[cfg(test)]
#[path = "./height_data_test.rs"]
mod height_data_test;