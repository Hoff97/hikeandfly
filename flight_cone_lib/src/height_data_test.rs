use approx::assert_relative_eq;

use crate::height_data::get_height_at_point;

use super::{get_height_data_around_point, load_hgt};

#[test]
fn test_load_hgt() {
    let data = load_hgt(47, 11);

    assert_eq!(data.get((22, 35)).unwrap().clone(), 644i16);
    assert_eq!(data.get((1065, 2354)).unwrap().clone(), 1067i16);
    assert_eq!(data.get((3456, 2985)).unwrap().clone(), 2472i16);
    assert_eq!(data.get((3443, 3292)).unwrap().clone(), 2561i16);
    assert_eq!(data.get((1922, 848)).unwrap().clone(), 1105i16);
}

#[test]
fn test_height_data_at_point() {
    assert_eq!(get_height_at_point(47.534, 11.7645), 1183);
    assert_eq!(get_height_at_point(47.0324, 11.3235), 1713);
    assert_eq!(get_height_at_point(47.87345, 11.01324), 717);
    assert_eq!(get_height_at_point(47.9943, 11.999234), 486);
}

#[test]
fn test_get_height_data_around_point() {
    let height_grid = get_height_data_around_point(47.05, 11.05, None);

    assert_eq!(height_grid.heights.shape()[0], 973);
    assert_eq!(height_grid.heights.shape()[1], 973);
    assert_relative_eq!(height_grid.cell_size, 30.832, max_relative = 0.01);
    assert_relative_eq!(height_grid.latitudes.0, 46.915, max_relative = 0.01);
    assert_relative_eq!(height_grid.latitudes.1, 47.185, max_relative = 0.01);
    assert_relative_eq!(height_grid.longitudes.0, 10.852, max_relative = 0.01);
    assert_relative_eq!(height_grid.longitudes.1, 11.248, max_relative = 0.01);

    assert_eq!(height_grid.heights.get((125, 654)).unwrap().clone(), 2436);
    assert_eq!(height_grid.heights.get((583, 762)).unwrap().clone(), 2388);
    assert_eq!(height_grid.heights.get((76, 234)).unwrap().clone(), 3149);
    assert_eq!(height_grid.heights.get((22, 423)).unwrap().clone(), 2448);
    assert_eq!(height_grid.heights.get((7, 5)).unwrap().clone(), 3156);
    assert_eq!(height_grid.heights.get((13, 920)).unwrap().clone(), 2648);
    assert_eq!(height_grid.heights.get((15, 956)).unwrap().clone(), 2131);
    assert_eq!(height_grid.heights.get((970, 967)).unwrap().clone(), 2085);
}
