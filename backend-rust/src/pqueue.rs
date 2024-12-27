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
pub struct HeapNode<P, V, K> {
    pub priority: P,
    pub item: V,
    pub key: K,
}

#[derive(Debug)]
pub struct PriorityQueue<P, V, K, MapType: MapLike<K, usize> = HashMapWrap<K, usize>> {
    heap: Vec<HeapNode<P, V, K>>,
    positions: MapType,
}

impl<P, V, K, MapType: MapLike<K, usize>> PriorityQueue<P, V, K, MapType> {
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

impl<P, V, K, MapType: Default + MapLike<K, usize>> PriorityQueue<P, V, K, MapType> {
    pub fn new() -> Self {
        Self {
            heap: Vec::new(),
            positions: MapType::default(),
        }
    }
}

impl<P, V, K, MapType: Default + MapLike<K, usize>> Default for PriorityQueue<P, V, K, MapType> {
    fn default() -> Self {
        Self::new()
    }
}

impl<P, V, K, MapType: MapLike<K, usize>> PriorityQueue<P, V, K, MapType> {
    pub fn new_with_map(map: MapType) -> Self {
        Self {
            heap: Vec::new(),
            positions: map,
        }
    }

    pub fn new_with_map_and_capacity(map: MapType, capacity: usize) -> Self {
        Self {
            heap: Vec::with_capacity(capacity),
            positions: map,
        }
    }
}

impl<P: PartialOrd + Copy, V, K: Eq + Hash + Copy, MapType: MapLike<K, usize>>
    PriorityQueue<P, V, K, MapType>
{
    pub fn push(&mut self, key: K, item: V, priority: P) {
        self.heap.push(HeapNode {
            priority,
            item,
            key,
        });

        let ix = self.heap.len() - 1;

        self.positions.insert(key, ix);

        self.siftup(ix);
    }

    pub fn update_priority(&mut self, key: K, priority: P) -> &mut HeapNode<P, V, K> {
        let ix = self
            .positions
            .get(&key)
            .expect("Update priority called with invalid key");

        let node = self.heap.get_mut(ix).unwrap();
        let old_priority = node.priority;
        node.priority = priority;

        let new_ix = if old_priority > priority {
            self.siftup(ix)
        } else {
            self.siftdown(ix)
        };

        self.heap.get_mut(new_ix).unwrap()
    }

    pub fn update_priority_if_less(
        &mut self,
        key: K,
        priority: P,
    ) -> Option<&mut HeapNode<P, V, K>> {
        let ix = self
            .positions
            .get(&key)
            .expect("Update priority called with invalid key");

        let node = self.heap.get_mut(ix).unwrap();
        let old_priority = node.priority;

        if old_priority <= priority {
            return None;
        }
        node.priority = priority;
        let new_ix = self.siftup(ix);

        self.heap.get_mut(new_ix)
    }

    pub fn pop(&mut self) -> Option<HeapNode<P, V, K>> {
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

    pub fn get(&self, key: &K) -> Option<&HeapNode<P, V, K>> {
        let position = self.positions.get(key);
        self.heap.get(position?)
    }

    pub fn get_mut(&mut self, key: &K) -> Option<&mut HeapNode<P, V, K>> {
        let position = self.positions.get(key);
        self.heap.get_mut(position?)
    }

    fn siftup(&mut self, mut ix: usize) -> usize {
        let newitem: &HeapNode<P, V, K> =
            self.heap.get(ix).expect("siftup called with invalid index");
        let key = newitem.key;
        let priority = newitem.priority;

        while ix > 0 {
            let parent_ix = (ix - 1) >> 1;
            let parent = self.heap.get(parent_ix).unwrap();
            let parent_key = parent.key;
            if priority >= parent.priority {
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
        let newitem_priority = newitem.priority;
        let newitem_key = newitem.key;

        // Bubble up the smaller child until hitting a leaf.
        let mut child_ix = (ix << 1) + 1;

        while child_ix < end_ix {
            // Set childpos to index of smaller child.
            let right_ix = child_ix + 1;

            if right_ix < end_ix
                && self.heap.get(right_ix).unwrap().priority
                    < self.heap.get(child_ix).unwrap().priority
            {
                child_ix = right_ix
            }
            // Move the smaller child up.
            let child = self.heap.get(child_ix).unwrap();
            let child_key = child.key;
            let child_priority = child.priority;

            if child_priority >= newitem_priority {
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

pub struct PriorityQueueIterator<P, V, K, MapType: MapLike<K, usize>> {
    priority_queue: PriorityQueue<P, V, K, MapType>,
}

impl<P: PartialOrd + Copy, V, K: Eq + Hash + Copy, MapType: MapLike<K, usize>> IntoIterator
    for PriorityQueue<P, V, K, MapType>
{
    type Item = HeapNode<P, V, K>;
    type IntoIter = PriorityQueueIterator<P, V, K, MapType>;

    fn into_iter(self) -> Self::IntoIter {
        PriorityQueueIterator {
            priority_queue: self,
        }
    }
}

impl<P: PartialOrd + Copy, V, K: Eq + Hash + Copy, MapType: MapLike<K, usize>> Iterator
    for PriorityQueueIterator<P, V, K, MapType>
{
    type Item = HeapNode<P, V, K>;

    fn next(&mut self) -> Option<Self::Item> {
        self.priority_queue.pop()
    }
}

#[cfg(test)]
#[path = "./pqueue_test.rs"]
mod pqueue_test;
