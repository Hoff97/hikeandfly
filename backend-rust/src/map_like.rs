use std::collections::HashMap;
use std::fmt::Debug;
use std::hash::Hash;

pub trait MapLike<K, V> {
    fn insert(&mut self, key: K, value: V);

    fn get(&self, key: &K) -> Option<V>;

    fn remove_entry(&mut self, key: &K);

    fn contains_key(&self, key: &K) -> bool;

    fn set(&mut self, key: K, value: V);
}

pub struct HashMapWrap<K, V> {
    hash_map: HashMap<K, V>,
}

impl<K: Debug, V: Debug> Debug for HashMapWrap<K, V> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.hash_map.fmt(f)
    }
}

impl<K: Eq + Hash, V: Clone> MapLike<K, V> for HashMapWrap<K, V> {
    fn insert(&mut self, key: K, value: V) {
        self.hash_map.insert(key, value);
    }

    fn get(&self, key: &K) -> Option<V> {
        self.hash_map.get(key).cloned()
    }

    fn remove_entry(&mut self, key: &K) {
        self.hash_map.remove_entry(key);
    }

    fn contains_key(&self, key: &K) -> bool {
        self.hash_map.contains_key(key)
    }

    fn set(&mut self, key: K, value: V) {
        self.hash_map.insert(key, value);
    }
}

impl<K, V> Default for HashMapWrap<K, V> {
    fn default() -> HashMapWrap<K, V> {
        HashMapWrap {
            hash_map: HashMap::<K, V>::new(),
        }
    }
}
