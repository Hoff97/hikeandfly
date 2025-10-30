use serde::{Deserialize, Serialize};

use crate::textsearch::{PrefixTrie, SearchIndex};

#[derive(Serialize, Deserialize, Clone)]
pub struct Location {
    pub name: String,
    pub center: Vec<f32>,
    pub additional_info: Option<String>,
}

impl Default for Location {
    fn default() -> Self {
        Location {
            name: String::new(),
            center: vec![0.0, 0.0],
            additional_info: None,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct LocationInfo {
    pub center: Vec<f32>,
    pub additional_info_ix: usize,
}

impl Default for LocationInfo {
    fn default() -> Self {
        LocationInfo {
            center: vec![0.0, 0.0],
            additional_info_ix: 0,
        }
    }
}

unsafe impl Send for SearchLocation {}

#[derive(Serialize, Deserialize)]
pub struct SearchLocation {
    pub index: SearchIndex<PrefixTrie<LocationInfo, (), u32>>,
    pub additional_info: Vec<String>,
}
