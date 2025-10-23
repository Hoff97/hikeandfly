use std::{
    fs::{self, File},
    io::{BufRead, BufReader},
};

use backend_rust::{
    textsearch::SearchIndex,
    types::{Location, LocationInfo, SearchLocation},
};
use serde::Serialize;

fn main() {
    println!("Building search index...");
    let mut ix = SearchIndex::new();

    let paths = fs::read_dir("./data").unwrap();

    let mut additional_info_map = std::collections::HashMap::<String, usize>::new();
    let mut additional_info_vec = vec![];

    for path in paths {
        let path = path.unwrap().path();
        if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            println!("Loading search data from {:?}", path);
            let r = File::open(path).unwrap();
            let reader = BufReader::new(r);
            for line in reader.lines() {
                let location: Location = serde_json::from_str(&line.unwrap()).unwrap();

                let ad = location.additional_info.unwrap_or_default();
                let additional_info_ix = if let Some(&ix) = additional_info_map.get(&ad) {
                    ix
                } else {
                    let ix = additional_info_vec.len();
                    additional_info_map.insert(ad.clone(), ix);
                    additional_info_vec.push(ad);
                    ix
                };

                ix.insert(
                    location.name.as_str(),
                    LocationInfo {
                        center: location.center,
                        additional_info_ix,
                    },
                );
            }
        }
    }
    let search_index = SearchLocation {
        index: ix.finalize(),
        additional_info: additional_info_vec,
    };

    let mut s = flexbuffers::FlexbufferSerializer::new();
    search_index.serialize(&mut s).unwrap();

    let buf = s.take_buffer();
    fs::write("./data/search_index.fb", buf).unwrap();
    println!("Wrote search index to ./data/search_index.fb");
    println!(
        "Number of nodes: {}",
        search_index.index.trie.items.data.len()
    );
    println!(
        "Number of additional info entries: {}",
        search_index.index.trie.children.data.len()
    );
}
