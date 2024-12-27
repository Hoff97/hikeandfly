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

#[test]
fn test_search_detailed() {
    let heights = Array2::zeros((10, 10));
    let start_height = 80.0;
    let mut config = SearchConfig {
        grid: HeightGrid {
            heights,
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
            start_height: Some(start_height),
            additional_height: 0.0,
            safety_margin: 0.0,
            start_distance: 0.0,
        },
    };

    square((1, 2), (1, 7), 55, &mut config.grid.heights);
    config.grid.heights[[8, 3]] = 60;
    config.grid.heights[[7, 4]] = 55;
    config.grid.heights[[6, 5]] = 50;
    config.grid.heights[[5, 6]] = 45;
    config.grid.heights[[8, 4]] = 60;
    config.grid.heights[[7, 5]] = 55;
    config.grid.heights[[6, 6]] = 50;
    config.grid.heights[[5, 7]] = 45;
    config.grid.heights[[4, 7]] = 40;

    config.grid.heights[[3, 2]] = 75;
    config.grid.heights[[3, 1]] = 75;
    config.grid.heights[[3, 0]] = 75;
    config.grid.heights[[4, 2]] = 75;
    config.grid.heights[[5, 1]] = 75;
    // Test search with a simple grid
    //   ||00|01|02|03|04|05|06|07|08|09|
    //---||-----------------------------|
    // 00||  |  |  |75|  |  |  |  |  |  |
    // 01||  |  |  |75|  |75|  |  |  |  |
    // 02||  |55|  |75|75|  |  |  |  |  |
    // 03||  |55|  |  |  |  |  |  |60|  |
    // 04||  |55|  |xx|  |  |  |55|60|  |
    // 05||  |55|  |  |  |  |50|55|  |  |
    // 06||  |55|  |  |  |45|50|  |  |  |
    // 07||  |55|  |  |40|45|  |  |  |  |
    // 08||  |  |  |  |  |  |  |  |  |  |
    // 09||  |  |  |  |  |  |  |  |  |  |

    let expected_ref = vec![
        //   0     1     2     3     4     5     6     7     8     9
        vec![2, 1, 2, 1, 2, 3, 0, 0, 6, 0, 6, 0, 6, 2, 3, 4, 3, 4, 3, 4], // 0
        vec![0, 3, 2, 1, 2, 3, 0, 0, 0, 0, 0, 0, 6, 2, 3, 4, 3, 4, 3, 4], // 1
        vec![0, 3, 0, 0, 2, 3, 0, 0, 0, 0, 5, 3, 3, 4, 3, 4, 7, 2, 7, 2], // 2
        vec![3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 6, 3, 0, 0, 9, 2], // 3
        vec![3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 0, 0, 0, 0, 0, 0], // 4
        vec![3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0], // 5
        vec![0, 5, 0, 0, 3, 4, 3, 4, 3, 4, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0], // 6
        vec![0, 5, 0, 0, 3, 4, 3, 4, 3, 4, 0, 0, 6, 8, 6, 8, 0, 0, 0, 0], // 7
        vec![2, 8, 2, 8, 3, 4, 3, 4, 3, 4, 4, 8, 4, 8, 4, 8, 0, 0, 0, 0], // 8
        vec![2, 8, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 6, 9, 6, 9, 0, 0], // 9
    ]
    .into_iter()
    .map(|x| x.chunks(2).map(|x| (x[0], x[1])).collect::<Vec<_>>())
    .collect::<Vec<_>>();

    let result = search((3, 4), start_height, &config);

    assert_eq!(result.queue.len(), 0);
    let explored = result.explored;

    let mut res = vec![vec!["   ".to_string(); 10]; 10];

    for n in explored.values.iter().flatten() {
        if n.reachable {
            if let Some(parent) = n.reference {
                res[n.ix.1 as usize][n.ix.0 as usize] = format!("{},{}", parent.0, parent.1);
            } else {
                res[n.ix.1 as usize][n.ix.0 as usize] = "xxx".to_string();
            }
        }
    }

    let result_str = res
        .into_iter()
        .map(|x| x.join(" "))
        .collect::<Vec<String>>()
        .join("\n");

    println!("{}", result_str);

    for n in explored.values.into_iter().flatten() {
        if n.reachable {
            if let Some(parent) = n.reference {
                if parent != expected_ref[n.ix.1 as usize][n.ix.0 as usize] {
                    println!("Failed at {:?}", n.ix);
                }
                assert_eq!(parent, expected_ref[n.ix.1 as usize][n.ix.0 as usize]);
            } else {
                assert_eq!(n.ix, expected_ref[n.ix.1 as usize][n.ix.0 as usize]);
            }
        } else {
            assert_eq!((0, 0), expected_ref[n.ix.1 as usize][n.ix.0 as usize]);
        }
    }
}
