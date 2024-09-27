pub fn lerp_f32(a: f32, b: f32, s: f32) -> f32 {
    a + (b - a) * s
}

pub fn lerp_color(a: &[f32; 4], b: &[f32; 4], s: f32) -> [f32; 4] {
    [
        lerp_f32(a[0], b[0], s),
        lerp_f32(a[1], b[1], s),
        lerp_f32(a[2], b[2], s),
        lerp_f32(a[3], b[3], s),
    ]
}

pub fn lerp<const S: usize>(lerp_colors: &[[f32; 4]; S], steps: &[f32; S], s: f32) -> [f32; 4] {
    for i in 0..(S - 1) {
        if s >= steps[i] && s < steps[i + 1] {
            return lerp_color(
                &lerp_colors[i],
                &lerp_colors[i + 1],
                (s - steps[i]) / (steps[i + 1] - steps[i]),
            );
        }
    }
    return lerp_colors[S - 1];
}

pub fn f32_color_to_u8(color: [f32; 4]) -> [u8; 4] {
    return [
        color[0].trunc().min(255.0).max(0.0) as u8,
        color[1].trunc().min(255.0).max(0.0) as u8,
        color[2].trunc().min(255.0).max(0.0) as u8,
        color[3].trunc().min(255.0).max(0.0) as u8,
    ];
}

#[cfg(test)]
#[path = "./colors_test.rs"]
mod colors_test;
