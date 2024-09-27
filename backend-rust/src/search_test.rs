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
    };
    let result = search_from_point(47.695412103118734, 11.868152618408203, 200.0, query);
}
