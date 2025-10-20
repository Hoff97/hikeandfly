use std::{
    fs::File,
    io::{BufRead, BufReader},
};

use backend_rust::textsearch::PrefixTrieBuilder;
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
struct Location {
    name: String,
    center: Vec<f32>,
}

fn textsearch(c: &mut Criterion) {
    let mut prefix_trie_builder = PrefixTrieBuilder::new();
    let r = File::open("testdata/test_data.jsonl").unwrap();
    let reader = BufReader::new(r);
    for line in reader.lines() {
        let location: Location = serde_json::from_str(&line.unwrap()).unwrap();
        prefix_trie_builder.insert(location.name.to_ascii_lowercase().as_str());
    }
    let trie = prefix_trie_builder.finalize();

    c.bench_function("textsearch_exact", |b| {
        b.iter(|| {
            let _result = trie.search(black_box("Zugspitze"));
        })
    });

    c.bench_function("textsearch_editdistance_2", |b| {
        b.iter(|| {
            let it = trie.find_with_max_edit_distance(
                black_box("Zugspitze"),
                black_box(2),
                black_box(false),
            );
            for x in it.flatten().take(10) {
                black_box(x);
            }
        })
    });

    c.bench_function("textsearch_editdistance_5", |b| {
        b.iter(|| {
            let it = trie.find_with_max_edit_distance(
                black_box("Zugspitze"),
                black_box(4),
                black_box(false),
            );
            for x in it.flatten().take(10) {
                black_box(x);
            }
        })
    });
}

criterion_group!(benches, textsearch);
criterion_main!(benches);
