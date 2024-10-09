use super::{search_from_point, SearchQuery};

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
    let _ = search_from_point(47.6954, 11.8681, 200.0, query);
}
