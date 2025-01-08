use std::collections::HashMap;
use std::hash::Hash;

pub trait MapLike<K, V> {
    fn insert(&mut self, key: K, value: V);

    fn get(&self, key: &K) -> Option<V>;

    /**
     * # Safety
     * Only call this when you know the map contains the respective key.
     */
    unsafe fn get_unsafe(&self, key: &K) -> V;

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

    unsafe fn get_unsafe(&self, key: &K) -> V {
        self.hash_map.get(key).unwrap().clone()
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

pub trait HasPriority {
    type Priority: PartialOrd + Copy;

    fn priority(&self) -> &Self::Priority;
    fn priority_mut(&mut self) -> &mut Self::Priority;
}

impl HasPriority for f32 {
    type Priority = f32;

    fn priority(&self) -> &Self::Priority {
        self
    }

    fn priority_mut(&mut self) -> &mut Self::Priority {
        self
    }
}

#[derive(Debug)]
pub struct PriorityQueue<V: HasPriority, K, MapType: MapLike<K, usize> = HashMapWrap<K, usize>> {
    heap: Vec<HeapNode<V, K>>,
    positions: MapType,
}

impl<V: HasPriority, K, MapType: MapLike<K, usize>> PriorityQueue<V, K, MapType> {
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

impl<V: HasPriority, K, MapType: Default + MapLike<K, usize>> PriorityQueue<V, K, MapType> {
    pub fn new() -> Self {
        Self {
            heap: Vec::new(),
            positions: MapType::default(),
        }
    }
}

impl<V: HasPriority, K, MapType: Default + MapLike<K, usize>> Default
    for PriorityQueue<V, K, MapType>
{
    fn default() -> Self {
        Self::new()
    }
}

impl<V: HasPriority, K, MapType: MapLike<K, usize>> PriorityQueue<V, K, MapType> {
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

impl<V: HasPriority, K: Copy, MapType: MapLike<K, usize>> PriorityQueue<V, K, MapType> {
    pub fn push(&mut self, key: K, item: V) {
        self.heap.push(HeapNode { item, key });

        let ix = self.heap.len() - 1;

        self.positions.insert(key, ix);

        self.siftup(ix);
    }

    pub fn update_priority(&mut self, key: K, priority: V::Priority) -> &mut HeapNode<V, K> {
        let ix = self
            .positions
            .get(&key)
            .expect("Update priority called with invalid key");

        // Safety: Positions only contains valid indices.
        let node = unsafe { self.heap.get_unchecked_mut(ix) };
        let old_priority = *node.item.priority();
        *node.item.priority_mut() = priority;

        let new_ix = if old_priority > priority {
            self.siftup(ix)
        } else {
            self.siftdown(ix)
        };

        // Safety: Siftup/Siftdown return a valid index.
        unsafe { self.heap.get_unchecked_mut(new_ix) }
    }

    /**
     * # Safety
     * Only call this when you know the queue contains the respective key.
     */
    pub unsafe fn update_priority_unsafe(
        &mut self,
        key: K,
        priority: V::Priority,
    ) -> &mut HeapNode<V, K> {
        let ix = self.positions.get_unsafe(&key);

        // Safety: Positions only contains valid indices.
        let node = unsafe { self.heap.get_unchecked_mut(ix) };
        let old_priority = *node.item.priority();
        *node.item.priority_mut() = priority;

        let new_ix = if old_priority > priority {
            self.siftup(ix)
        } else {
            self.siftdown(ix)
        };

        // Safety: Siftup/Siftdown return a valid index.
        unsafe { self.heap.get_unchecked_mut(new_ix) }
    }

    /**
     * # Safety
     * Only call this when you know the queue contains the respective key.
     */
    pub unsafe fn update_priority_if_less_unsafe(
        &mut self,
        key: K,
        priority: V::Priority,
    ) -> Option<&mut HeapNode<V, K>> {
        let ix = self.positions.get_unsafe(&key);

        // Safety: Positions only contains valid indices.
        let node = unsafe { self.heap.get_unchecked_mut(ix) };
        let old_priority = *node.item.priority();

        if old_priority <= priority {
            return None;
        }
        *node.item.priority_mut() = priority;
        let new_ix = self.siftup(ix);

        // Safety: Siftup returns a valid index.
        unsafe { Some(self.heap.get_unchecked_mut(new_ix)) }
    }

    pub fn update_priority_if_less(
        &mut self,
        key: K,
        priority: V::Priority,
    ) -> Option<&mut HeapNode<V, K>> {
        let ix = self
            .positions
            .get(&key)
            .expect("Update priority called with invalid key");

        // Safety: Positions only contains valid indices.
        let node = unsafe { self.heap.get_unchecked_mut(ix) };
        let old_priority = *node.item.priority();

        if old_priority <= priority {
            return None;
        }
        *node.item.priority_mut() = priority;
        let new_ix = self.siftup(ix);

        // Safety: Siftup returns a valid index.
        unsafe { Some(self.heap.get_unchecked_mut(new_ix)) }
    }

    pub fn pop(&mut self) -> Option<HeapNode<V, K>> {
        let len = self.len();
        if len == 0 {
            return None;
        }

        let data_ptr = self.heap.as_mut_ptr();
        unsafe { std::ptr::swap(data_ptr.add(0), data_ptr.add(len - 1)) };
        // TODO: Dont check on length twice here?
        let element = unsafe { self.heap.pop().unwrap_unchecked() };
        self.positions.remove_entry(&element.key);

        if len == 1 {
            return Some(element);
        }

        self.positions
            .set(unsafe { self.heap.get_unchecked(0) }.key, 0);

        self.siftdown(0);

        Some(element)
    }

    pub fn contains_key(&self, key: &K) -> bool {
        self.positions.contains_key(key)
    }

    pub fn get(&self, key: &K) -> Option<&HeapNode<V, K>> {
        // TODO: Get unsafe variant?
        let position = self.positions.get(key);
        // Safety: Positions only contains valid indices.
        unsafe { Some(self.heap.get_unchecked(position?)) }
    }

    pub fn get_mut(&mut self, key: &K) -> Option<&mut HeapNode<V, K>> {
        let position = self.positions.get(key);
        // Safety: Positions only contains valid indices.
        unsafe { Some(self.heap.get_unchecked_mut(position?)) }
    }

    fn siftup(&mut self, mut ix: usize) -> usize {
        let newitem = unsafe { self.heap.get_unchecked(ix) };
        let key = newitem.key;
        let priority = *newitem.item.priority();

        while ix > 0 {
            let parent_ix = (ix - 1) >> 1;
            // Safety: parent_ix is guaranteed to be a valid index since ix > 0
            // and positions only contains valid indices.
            let parent = unsafe { self.heap.get_unchecked(parent_ix) };
            let parent_key = parent.key;
            if priority >= *parent.item.priority() {
                break;
            }

            let data_ptr = self.heap.as_mut_ptr();
            unsafe { std::ptr::swap(data_ptr.add(ix), data_ptr.add(parent_ix)) };
            self.positions.set(parent_key, ix);
            ix = parent_ix;
        }

        self.positions.set(key, ix);

        ix
    }

    fn siftdown(&mut self, mut ix: usize) -> usize {
        let end_ix = self.len();
        let newitem = unsafe { self.heap.get_unchecked(ix) };
        let newitem_priority = *newitem.item.priority();
        let newitem_key = newitem.key;

        // Bubble up the smaller child until hitting a leaf.
        let mut child_ix = (ix << 1) + 1;

        while child_ix < end_ix {
            // Set childpos to index of smaller child.
            let right_ix = child_ix + 1;

            // Safety: We already checked that child_ix is less than end_ix.
            if right_ix < end_ix
                && unsafe {
                    self.heap.get_unchecked(right_ix).item.priority()
                        < self.heap.get_unchecked(child_ix).item.priority()
                }
            {
                child_ix = right_ix
            }
            // Move the smaller child up.
            // Safety: We already checked that child_ix is less than end_ix.
            let child = unsafe { self.heap.get_unchecked(child_ix) };
            let child_key = child.key;
            let child_priority = *child.item.priority();

            if child_priority >= newitem_priority {
                break;
            }

            let data_ptr = self.heap.as_mut_ptr();
            unsafe { std::ptr::swap(data_ptr.add(ix), data_ptr.add(child_ix)) };
            self.positions.set(child_key, ix);

            ix = child_ix;
            child_ix = (ix << 1) + 1;
        }

        self.positions.set(newitem_key, ix);

        ix
    }
}

pub struct PriorityQueueIterator<V: HasPriority, K, MapType: MapLike<K, usize>> {
    priority_queue: PriorityQueue<V, K, MapType>,
}

impl<V: HasPriority, K: Eq + Hash + Copy, MapType: MapLike<K, usize>> IntoIterator
    for PriorityQueue<V, K, MapType>
{
    type Item = HeapNode<V, K>;
    type IntoIter = PriorityQueueIterator<V, K, MapType>;

    fn into_iter(self) -> Self::IntoIter {
        PriorityQueueIterator {
            priority_queue: self,
        }
    }
}

impl<V: HasPriority, K: Eq + Hash + Copy, MapType: MapLike<K, usize>> Iterator
    for PriorityQueueIterator<V, K, MapType>
{
    type Item = HeapNode<V, K>;

    fn next(&mut self) -> Option<Self::Item> {
        self.priority_queue.pop()
    }
}

#[cfg(test)]
#[path = "./pqueue_test.rs"]
mod pqueue_test;
