use crate::colors::lerp_f32;

#[test]
fn test_lerp_f32() {
    assert_eq!(lerp_f32(0.0, 10.0, 0.5), 5.0);
    assert_eq!(lerp_f32(0.0, 10.0, 1.0), 10.0);
    assert_eq!(lerp_f32(0.0, 10.0, 0.0), 0.0);

    assert_eq!(lerp_f32(1.0, 6.0, 0.5), 3.5);
    assert_eq!(lerp_f32(1.0, 6.0, 1.0), 6.0);
    assert_eq!(lerp_f32(1.0, 6.0, 0.0), 1.0);

    assert_eq!(lerp_f32(3.5, 7.75, 0.5), 5.625);
    assert_eq!(lerp_f32(3.5, 7.75, 0.25), 4.5625);
    assert_eq!(lerp_f32(3.5, 8.5, 0.2), 4.5);
}
