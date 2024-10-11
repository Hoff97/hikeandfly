use std::cmp::Ordering;
use std::collections::HashMap;
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

#[derive(Debug)]
pub struct HeapNode<V, K> {
    pub item: V,
    pub key: K,
}

#[derive(Debug)]
pub struct PriorityQueue<
    V,
    K,
    C: Fn(&V, &V) -> Ordering,
    MapType: MapLike<K, usize> = HashMapWrap<K, usize>,
> {
    pub heap: Vec<HeapNode<V, K>>,
    pub positions: MapType,
    pub comp: C,
}

impl<V, K, C: Fn(&V, &V) -> Ordering, MapType: MapLike<K, usize>> PriorityQueue<V, K, C, MapType> {
    pub fn len(&self) -> usize {
        self.heap.len()
    }

    pub fn is_empty(&self) -> bool {
        self.heap.is_empty()
    }

    pub fn capacity(&self) -> usize {
        self.heap.capacity()
    }
}

impl<V, K, C: Fn(&V, &V) -> Ordering, MapType: Default + MapLike<K, usize>>
    PriorityQueue<V, K, C, MapType>
{
    pub fn new(comp: C) -> Self {
        Self {
            heap: Vec::new(),
            positions: MapType::default(),
            comp,
        }
    }
}

impl<V, K, C: Fn(&V, &V) -> Ordering, MapType: MapLike<K, usize>> PriorityQueue<V, K, C, MapType> {
    pub fn new_with_map(comp: C, map: MapType) -> Self {
        Self {
            heap: Vec::new(),
            positions: map,
            comp,
        }
    }

    pub fn new_with_map_and_capacity(comp: C, map: MapType, capacity: usize) -> Self {
        Self {
            heap: Vec::with_capacity(capacity),
            positions: map,
            comp,
        }
    }
}

impl<V, K: Eq + Hash + Copy, C: Fn(&V, &V) -> Ordering, MapType: MapLike<K, usize>>
    PriorityQueue<V, K, C, MapType>
{
    pub fn push(&mut self, key: K, item: V) {
        self.heap.push(HeapNode { item, key });

        let ix = self.heap.len() - 1;

        self.positions.insert(key, ix);

        self.siftup(ix);
    }

    pub fn pop(&mut self) -> Option<HeapNode<V, K>> {
        let len = self.len();
        if len == 0 {
            return None;
        }

        self.heap.swap(0, len - 1);
        let element = self.heap.pop().unwrap();
        self.positions.remove_entry(&element.key);

        if len == 1 {
            return Some(element);
        }

        self.positions.set(self.heap.first()?.key, 0);

        self.siftdown(0);

        Some(element)
    }

    pub fn contains_key(&self, key: &K) -> bool {
        self.positions.contains_key(key)
    }

    pub fn get(&self, key: &K) -> Option<&HeapNode<V, K>> {
        let position = self.positions.get(key);
        self.heap.get(position?)
    }

    pub fn get_mut(&mut self, key: &K) -> Option<&mut HeapNode<V, K>> {
        let position = self.positions.get(key);
        self.heap.get_mut(position?)
    }

    pub fn correct_position(&mut self, key: K) {
        let position = self.positions.get(&key).unwrap();
        self.siftup(position);
    }

    fn siftup(&mut self, mut ix: usize) -> usize {
        let newitem: &HeapNode<V, K> = self.heap.get(ix).expect("siftup called with invalid index");
        let key = newitem.key;

        while ix > 0 {
            let parent_ix = (ix - 1) >> 1;
            let parent = self.heap.get(parent_ix).unwrap();
            let parent_key = parent.key;
            if (self.comp)(&self.heap.get(ix).unwrap().item, &parent.item) != Ordering::Less {
                break;
            }

            self.heap.swap(ix, parent_ix);
            self.positions.set(parent_key, ix);
            ix = parent_ix;
        }

        self.positions.set(key, ix);

        ix
    }

    fn siftdown(&mut self, mut ix: usize) -> usize {
        let end_ix = self.len();
        let newitem = self
            .heap
            .get(ix)
            .expect("siftdown called with invalid index");
        let newitem_key = newitem.key;

        // Bubble up the smaller child until hitting a leaf.
        let mut child_ix = (ix << 1) + 1;

        while child_ix < end_ix {
            // Set childpos to index of smaller child.
            let right_ix = child_ix + 1;

            if right_ix < end_ix
                && (self.comp)(
                    &self.heap.get(right_ix).unwrap().item,
                    &self.heap.get(child_ix).unwrap().item,
                ) == Ordering::Less
            {
                child_ix = right_ix
            }
            // Move the smaller child up.
            let child = self.heap.get(child_ix).unwrap();
            let child_key = child.key;

            if (self.comp)(&child.item, &self.heap.get(ix).unwrap().item) != Ordering::Less {
                break;
            }

            self.heap.swap(ix, child_ix);
            self.positions.set(child_key, ix);

            ix = child_ix;
            child_ix = (ix << 1) + 1;
        }

        self.positions.set(newitem_key, ix);

        ix
    }
}

pub struct PriorityQueueIterator<V, K, C: Fn(&V, &V) -> Ordering, MapType: MapLike<K, usize>> {
    priority_queue: PriorityQueue<V, K, C, MapType>,
}

impl<V, K: Eq + Hash + Copy, C: Fn(&V, &V) -> Ordering, MapType: MapLike<K, usize>> IntoIterator
    for PriorityQueue<V, K, C, MapType>
{
    type Item = HeapNode<V, K>;
    type IntoIter = PriorityQueueIterator<V, K, C, MapType>;

    fn into_iter(self) -> Self::IntoIter {
        PriorityQueueIterator {
            priority_queue: self,
        }
    }
}

impl<V, K: Eq + Hash + Copy, C: Fn(&V, &V) -> Ordering, MapType: MapLike<K, usize>> Iterator
    for PriorityQueueIterator<V, K, C, MapType>
{
    type Item = HeapNode<V, K>;

    fn next(&mut self) -> Option<Self::Item> {
        self.priority_queue.pop()
    }
}

#[cfg(test)]
#[path = "./pqueue_test.rs"]
mod pqueue_test;
