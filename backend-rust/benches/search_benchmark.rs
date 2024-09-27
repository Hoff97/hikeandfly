use criterion::{black_box, criterion_group, criterion_main, Criterion};

use backend_rust::search::{prepare_search, search, SearchQuery};

fn criterion_benchmark(c: &mut Criterion) {
    c.bench_function("search", |b| {
        let query = SearchQuery {
            glide_ratio: 1.0 / 8.0,
            trim_speed: 38.0,
            wind_direction: 0.0,
            wind_speed: 0.0,
            additional_height: 10.0,
            safety_margin: 0.0,
            start_distance: 0.0,
        };
        let (height, start_ix, config) =
            prepare_search(47.42124381683321, 10.985727310180666, 30.0, &query);
        b.iter(|| {
            let _result = search(black_box(start_ix), black_box(height), black_box(&config));
        })
    });
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);
