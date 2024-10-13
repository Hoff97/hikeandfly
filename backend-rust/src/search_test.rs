use core::f32;

use super::{get_effective_glide_ratio, prepare_search, search, search_from_point, SearchQuery};

use approx::assert_relative_eq;
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
fn test_search() {
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
    let result = search_from_point(47.6954, 11.8681, 200.0, query);
    println!("yay");
}

#[test]
fn test_search_2() {
    let query = SearchQuery {
        glide_ratio: 1.0 / 8.0,
        trim_speed: 38.0,
        wind_direction: 0.0,
        wind_speed: 0.0,
        additional_height: 10.0,
        safety_margin: 0.0,
        start_distance: 0.0,
        start_height: None,
    };
    let search_setup = prepare_search(47.4212, 10.9857, 30.0, query);

    search(
        search_setup.start_ix,
        search_setup.start_height,
        &search_setup.config,
    );
}
