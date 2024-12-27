use core::f32;

use crate::height_data::HeightGrid;

use super::{get_effective_glide_ratio, search, search_from_point, SearchConfig, SearchQuery};

use approx::assert_relative_eq;
use ndarray::Array2;
use proptest::{prop_assert_eq, prop_compose, proptest};

prop_compose! {
    fn speed_wind_speed(max_speed: f32)
                (speed in 10.0..max_speed, wind_speed in -max_speed..max_speed) -> (f32, f32) {
        (speed, wind_speed.min(speed - 0.1))
    }
}

proptest! {
    #[test]
    fn get_effective_glide_ratio_no_wind(glide_ratio in 0.05..0.5f32, speed in 10.0..50.0f32) {
        let result = get_effective_glide_ratio(0.0, 0.0, speed, glide_ratio);

        prop_assert_eq!(result.speed, speed);
        prop_assert_eq!(result.glide_ratio, glide_ratio);
    }

    #[test]
    fn get_effective_glide_ratio_wind(glide_ratio in 0.05..0.5f32, (speed, wind_speed) in speed_wind_speed(50.0)) {
        let result = get_effective_glide_ratio(f32::consts::PI, wind_speed, speed, glide_ratio);

        prop_assert_eq!(result.speed, speed - wind_speed);
        prop_assert_eq!(result.glide_ratio, glide_ratio/((speed - wind_speed)/speed));
    }

    #[test]
    fn get_effective_glide_ratio_side_wind(glide_ratio in 0.05..0.5f32, speed in 10.0..50.0f32) {
        let result = get_effective_glide_ratio(f32::consts::PI/2.0, speed/2.0f32.sqrt(), speed, glide_ratio);

        assert_relative_eq!(result.speed, speed/2.0f32.sqrt(), max_relative = 0.01);
        assert_relative_eq!(result.glide_ratio, glide_ratio*2.0f32.sqrt(), max_relative = 0.01);
    }
}

#[test]
fn test_search_from_point() {
    let query = SearchQuery {
        glide_ratio: 0.5,
        trim_speed: 38.0,
        wind_direction: 0.0,
        wind_speed: 0.0,
        additional_height: 10.0,
        safety_margin: 0.0,
        start_distance: 0.0,
        start_height: None,
    };
    let _ = search_from_point(47.6954, 11.8681, 200.0, query);
}

fn square(start: (usize, usize), end: (usize, usize), height: i16, grid: &mut Array2<i16>) {
    for i in start.0..=end.0 {
        for j in start.1..=end.1 {
            grid[[i, j]] = height;
        }
    }
}

fn line(
    start: (usize, usize),
    end: (usize, usize),
    start_height: i16,
    end_height: i16,
    grid: &mut Array2<i16>,
) {
    let dx = end.0 as isize - start.0 as isize;
    let dy = end.1 as isize - start.1 as isize;
    let length = ((dx * dx + dy * dy) as f32).sqrt().ceil() as isize;
    for i in 0..length {
        let x = start.0 as isize + (dx * i as isize / length);
        let y = start.1 as isize + (dy * i as isize / length);
        grid[[x as usize, y as usize]] =
            start_height + (end_height - start_height) * i as i16 / length as i16;
    }
}

// Test search with a simple grid
//   ||00|01|02|03|04|05|06|07|08|09|10|11|12|13|14|
//---||---------------------------------------------
// 00||  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
// 01||  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
// 02||  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
// 03||  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
// 04||  |  |  |  |  |  |  |  |35|35|  |  |  |  |  |
// 05||  |  |  |  |  |  |25|  |35|35|  |  |  |  |  |
// 06||  |  |  |  |  |30|  |  |  |  |  |  |  |  |  |
// 07||  |  |  |  |35|  |  |  |  |  |  |60|  |  |  |
// 08||  |  |  |40|  |  |  |  |  |  |  |60|  |  |  |
// 09||  |  |  |  |  |  |  |  |  |  |  |60|  |  |  |
// 10||  |  |  |  |  |  |  |  |  |xx|  |60|  |  |  |
// 11||  |  |  |  |  |  |  |  |  |  |  |60|  |  |  |
// 12||  |  |  |40|45|  |  |  |  |  |  |60|  |  |  |
// 13||  |  |  |  |35|40|  |  |  |  |  |60|  |  |  |
// 14||  |  |  |  |  |30|35|  |  |  |  |60|  |  |  |
// 15||  |  |  |  |  |  |25|30|  |  |  |60|  |  |  |
// 16||  |  |  |  |  |  |  |20|  |  |  |60|  |  |  |
// 17||  |  |  |  |  |  |  |  |  |  |  |60|  |  |  |
// 18||  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
// 19||  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

#[test]
fn test_search_detailed() {
    let mut heights = Array2::zeros((15, 20));
    square((11, 7), (11, 17), 60, &mut heights);
    square((8, 4), (9, 5), 35, &mut heights);
    line((3, 12), (7, 16), 40, 20, &mut heights);
    line((4, 12), (7, 15), 45, 30, &mut heights);

    line((3, 8), (6, 5), 40, 25, &mut heights);

    let config = SearchConfig {
        grid: HeightGrid {
            heights: heights,
            cell_size: 100.0,
            min_cell_size: 10.0,
            latitudes: (0.0, 30.0),
            longitudes: (0.0, 30.0),
        },
        query: SearchQuery {
            glide_ratio: 0.1,
            trim_speed: 38.0,
            wind_direction: 0.0,
            wind_speed: 0.0,
            start_height: Some(90.0),
            additional_height: 0.0,
            safety_margin: 0.0,
            start_distance: 0.0,
        },
    };
    let result = search((9, 10), 90.0, &config);

    assert_eq!(result.queue.len(), 0);
    let explored = result.explored;
    let mut res = vec![vec![String::from("__"); 15]; 20];
    let expected_res = "\n
    __ __ __ __ __ __ __ __ __ __ __ __ __ __ __\n
    __ __ __ __ __ __ __ __ __ __ __ __ __ __ __\n
    __ __ __ __ __ __ __ 06 __ __ 09 __ __ __ __\n
    __ __ __ __ __ __ __ 16 14 09 19 __ __ __ __\n
    __ __ __ __ __ __ __ 26 ## ## 29 __ __ __ __\n
    __ __ __ __ __ __ __ 36 39 40 39 36 32 22 __\n
    __ __ __ __ __ __ __ __ 49 50 49 39 34 32 __\n
    __ __ __ __ __ __ __ __ 58 60 58 ## 44 40 32\n
    __ __ __ __ __ __ __ __ 68 70 68 62 54 45 36\n
    __ 09 19 29 39 49 58 68 76 80 76 68 58 49 39\n
    __ 10 20 30 40 50 60 70 80 xx 80 70 60 50 40\n
    __ 09 19 29 39 49 58 68 76 80 76 68 58 49 39\n
    __ __ __ __ __ __ __ __ 68 70 68 62 54 45 36\n
    __ __ __ __ __ __ __ __ 58 60 58 ## 44 40 32\n
    __ __ __ __ __ __ __ __ 49 50 49 ## 34 32 __\n
    __ __ __ __ __ __ __ __ 39 40 39 ## 24 22 __\n
    __ __ __ __ __ __ __ __ 29 30 29 ## 14 13 __\n
    __ __ __ __ __ __ __ __ 19 20 19 ## 04 03 00\n
    __ __ __ __ __ __ __ __ 09 10 09 __ __ __ __\n
    __ __ __ __ __ __ __ __ __ __ __ __ __ __ __\n";
    // 1  2  3  4  5  6  7  8  9  10 11 12 13 14

    for item in explored.values {
        if let Some(n) = item {
            if n.reachable {
                if n.ix == (9, 18) {
                    println!("{:?}", n.ix);
                }
                res[n.ix.1 as usize][n.ix.0 as usize] = format!("{:0>2.0}", n.height);
            }
        }
    }

    let result_str = res
        .into_iter()
        .map(|x| x.join(" "))
        .collect::<Vec<String>>()
        .join("\n");

    println!("{}", result_str);

    assert_eq!(result_str, expected_res);
}
