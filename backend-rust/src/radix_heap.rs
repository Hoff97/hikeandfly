use crate::map_like::{HashMapWrap, MapLike};
use std::{cmp::Reverse, default::Default, fmt::Debug, hash::Hash, num::Wrapping};

#[derive(Clone, Debug)]
pub struct HeapNode<P, V, K> {
    pub priority: P,
    pub item: V,
    pub key: K,
}

impl<P, V, K: Eq> PartialEq for HeapNode<P, V, K> {
    fn eq(&self, other: &Self) -> bool {
        self.key == other.key
    }
}

impl<P, V, K: Eq> Eq for HeapNode<P, V, K> {}

impl<P, V, K: Hash> Hash for HeapNode<P, V, K> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.key.hash(state);
    }
}

type Bucket<P, V, K> = Vec<HeapNode<P, V, K>>;

pub struct RadixHeap<P, V, K, MapType: MapLike<K, (usize, usize)> = HashMapWrap<K, (usize, usize)>>
{
    len: usize,
    top: P,
    buckets: Vec<Bucket<P, V, K>>,
    positions: MapType,
}

impl<
        P: Debug + Clone,
        V: Debug + Clone,
        K: Debug + Clone,
        MapType: MapLike<K, (usize, usize)> + Debug,
    > Debug for RadixHeap<P, V, K, MapType>
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut filtered_buckets = self
            .buckets
            .clone()
            .into_iter()
            .rev()
            .skip_while(|x| x.is_empty())
            .collect::<Vec<_>>();
        filtered_buckets.reverse();

        f.debug_struct("RadixHeap")
            .field("top", &self.top)
            .field("buckets", &filtered_buckets)
            .field("positions", &self.positions)
            .finish()
    }
}

impl<P: Radix + Ord + Copy, V, K: Clone, MapType: MapLike<K, (usize, usize)> + Default>
    RadixHeap<P, V, K, MapType>
{
    pub fn new(top: P) -> Self {
        Self {
            len: 0,
            top: top,
            buckets: (0..=P::RADIX_BITS).map(|_| Bucket::default()).collect(),
            positions: MapType::default(),
        }
    }
}

impl<
        P: Radix + Ord + Copy + Debug,
        V: Debug,
        K: Clone + Debug,
        MapType: MapLike<K, (usize, usize)>,
    > RadixHeap<P, V, K, MapType>
{
    pub fn new_with_map(map: MapType, top: P) -> Self {
        Self {
            len: 0,
            top: top,
            buckets: (0..=P::RADIX_BITS).map(|_| Bucket::default()).collect(),
            positions: map,
        }
    }

    fn constrain(&mut self) {
        let index = self.buckets.iter().position(|bucket| !bucket.is_empty());

        let (buckets, repush) = match index {
            None | Some(0) => return,
            Some(index) => {
                let (buckets, rest) = self.buckets.split_at_mut(index);
                (buckets, &mut rest[0])
            }
        };

        let top = repush
            .iter()
            .min_by_key(|x| x.priority)
            .expect("Expected non-empty bucket");

        self.top = P::from(i32::from(top.priority) - 1);

        repush.drain(..).for_each(|n| {
            let radix_distance = n.priority.radix_distance(&self.top) as usize;
            self.positions.set(
                n.key.to_owned(),
                (radix_distance, buckets[radix_distance].len()),
            );
            buckets[radix_distance].push(n);
        });
    }

    #[inline]
    pub fn push(&mut self, key: K, item: V, priority: P) {
        assert!(priority >= self.top);
        let radix_distance = priority.radix_distance(&self.top) as usize;
        let bucket = &mut self.buckets[radix_distance];

        self.positions
            .set(key.to_owned(), (radix_distance, bucket.len()));

        bucket.push(HeapNode {
            priority,
            item,
            key,
        });
        self.len += 1;
    }

    #[inline]
    pub fn pop(&mut self) -> Option<HeapNode<P, V, K>> {
        // TODO: Can we avoid having bucket 0 at all?
        let ret = self.buckets[0].pop().or_else(|| {
            self.constrain();
            self.buckets[0].pop()
        });

        match ret {
            Some(x) => {
                self.len -= 1;
                self.positions.remove_entry(&x.key);
                self.top = x.priority;

                //println!("Pop: {:?}", x.priority);

                Some(x)
            }
            None => None,
        }
    }

    pub fn update_priority_if_less(
        &mut self,
        key: K,
        priority: P,
    ) -> Option<&mut HeapNode<P, V, K>> {
        if priority < self.top {
            println!("Update: {:?}>={:?}", priority, self.top);
            let n = self.get_mut(&key).unwrap();
            println!("Node: {:?}", n);
        }

        assert!(priority >= self.top);

        let ix = self
            .positions
            .get(&key)
            .expect("Update priority called with invalid key");

        let node = self.get_mut(&key).unwrap();

        let old_priority = node.priority;

        if old_priority <= priority {
            return None;
        }
        node.priority = priority;

        let old_radix_distance = old_priority.radix_distance(&self.top) as usize;
        let new_radix_distance = priority.radix_distance(&self.top) as usize;

        if old_radix_distance == new_radix_distance {
            return self.get_mut(&key);
        } else {
            if self.buckets[old_radix_distance].len() > 1 {
                let last_key = self.buckets[old_radix_distance].last().unwrap().key.clone();
                self.positions.set(last_key, ix)
            }

            let n = self.buckets[old_radix_distance].swap_remove(ix.1);
            self.buckets[new_radix_distance].push(n);

            self.positions.set(
                key,
                (
                    new_radix_distance,
                    self.buckets[new_radix_distance].len() - 1,
                ),
            );

            return self.buckets[new_radix_distance].last_mut();
        }
    }

    pub fn contains_key(&self, key: &K) -> bool {
        self.positions.contains_key(key)
    }

    pub fn get(&self, key: &K) -> Option<&HeapNode<P, V, K>> {
        let position = self.positions.get(key);
        self.buckets
            .get(position?.0)
            .map(|x| x.get(position?.1))
            .flatten()
    }

    pub fn get_mut(&mut self, key: &K) -> Option<&mut HeapNode<P, V, K>> {
        let position = self.positions.get(key);
        self.buckets
            .get_mut(position?.0)
            .map(|x| x.get_mut(position?.1))
            .flatten()
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.len
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    #[inline]
    pub fn top(&self) -> P {
        self.top
    }

    pub fn shrink_to_fit(&mut self) {
        for bucket in &mut self.buckets {
            bucket.shrink_to_fit();
        }
    }
}

/// A number that can be compared using radix distance
pub trait Radix {
    fn radix_similarity(&self, other: &Self) -> u32;

    fn radix_distance(&self, other: &Self) -> u32 {
        Self::RADIX_BITS - self.radix_similarity(other)
    }

    /// The value returned by `radix_similarty` if all bits are equal
    const RADIX_BITS: u32;
}

macro_rules! radix_wrapper_impl {
    ($t:ident) => {
        impl<T: Radix> Radix for $t<T> {
            #[inline]
            fn radix_similarity(&self, other: &$t<T>) -> u32 {
                self.0.radix_similarity(&other.0)
            }

            const RADIX_BITS: u32 = T::RADIX_BITS;
        }
    };
}

radix_wrapper_impl!(Reverse);
radix_wrapper_impl!(Wrapping);

macro_rules! radix_int_impl {
    ($t:ty) => {
        impl Radix for $t {
            #[inline]
            fn radix_similarity(&self, other: &$t) -> u32 {
                (self ^ other).leading_zeros()
            }

            const RADIX_BITS: u32 = (std::mem::size_of::<$t>() * 8) as u32;
        }
    };
}

pub struct RadixHeapIterator<P, V, K, MapType: MapLike<K, (usize, usize)>> {
    radix_heap: RadixHeap<P, V, K, MapType>,
}

impl<
        P: Ord + Radix + Copy + Debug,
        V: Debug,
        K: Eq + Hash + Copy + Debug,
        MapType: MapLike<K, (usize, usize)>,
    > IntoIterator for RadixHeap<P, V, K, MapType>
{
    type Item = HeapNode<P, V, K>;
    type IntoIter = RadixHeapIterator<P, V, K, MapType>;

    fn into_iter(self) -> Self::IntoIter {
        RadixHeapIterator { radix_heap: self }
    }
}

impl<
        P: Ord + Radix + Copy + Debug,
        V: Debug,
        K: Eq + Hash + Copy + Debug,
        MapType: MapLike<K, (usize, usize)>,
    > Iterator for RadixHeapIterator<P, V, K, MapType>
{
    type Item = HeapNode<P, V, K>;

    fn next(&mut self) -> Option<Self::Item> {
        self.radix_heap.pop()
    }
}

radix_int_impl!(i8);
radix_int_impl!(i16);
radix_int_impl!(i32);
radix_int_impl!(i64);
radix_int_impl!(i128);
radix_int_impl!(isize);

radix_int_impl!(u8);
radix_int_impl!(u16);
radix_int_impl!(u32);
radix_int_impl!(u64);
radix_int_impl!(u128);
radix_int_impl!(usize);

macro_rules! radix_float_impl {
    ($t:ty, $bits:ty, $wrapper:path) => {
        impl Radix for $wrapper {
            #[inline]
            fn radix_similarity(&self, other: &$wrapper) -> u32 {
                let self_bits: $bits = self.to_bits();
                let other_bits: $bits = other.to_bits();
                self_bits.radix_similarity(&other_bits)
            }

            const RADIX_BITS: u32 = <$bits>::RADIX_BITS;
        }
    };
}

radix_float_impl!(f32, u32, ordered_float::NotNan<f32>);

radix_float_impl!(f64, u64, ordered_float::NotNan<f64>);

#[cfg(test)]
#[path = "./radix_heap_test.rs"]
mod radix_heap_test;
