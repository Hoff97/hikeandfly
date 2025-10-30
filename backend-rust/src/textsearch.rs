use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    iter::Sum,
    ops::{Add, AddAssign, Sub},
    vec,
};

pub struct PrefixTrieBuilder<T> {
    children: HashMap<char, PrefixTrieBuilder<T>>,
    lengths: HashSet<usize>,
    items: Vec<T>,
}

impl<T: Clone + Default> PrefixTrieBuilder<T> {
    pub fn new() -> Self {
        PrefixTrieBuilder {
            children: HashMap::new(),
            lengths: HashSet::new(),
            items: Vec::new(),
        }
    }

    pub fn insert(&mut self, word: &str, item: T) {
        let mut current = self;
        for (i, c) in word.chars().enumerate() {
            let l = word.len() - i;
            current.lengths.insert(l);
            current = current.children.entry(c).or_default();
        }
        current.items.push(item);
        current.lengths.insert(0);
    }

    pub fn total_nodes(&self) -> usize {
        let mut total = 1;
        for child in self.children.values() {
            total += child.total_nodes();
        }
        total
    }

    pub fn compute_children_in_order<A>(
        &self,
        result: &mut Vec<A>,
        c: &impl Fn(&PrefixTrieBuilder<T>) -> A,
        mut cur_ix: usize,
    ) {
        result[cur_ix] = c(self);
        cur_ix += 1;

        let mut ch = self
            .children
            .iter()
            .map(|x| {
                let t = x.1.total_nodes();
                (x.0, x.1, t)
            })
            .collect::<Vec<_>>();
        ch.sort_by_key(|x| (x.2 as isize).wrapping_neg());

        for (_, child, _) in ch {
            let child_nodes = child.total_nodes();
            child.compute_children_in_order(result, c, cur_ix);
            cur_ix += child_nodes;
        }
    }
}

pub trait OrderedLengthTypeTrait<T, IxType>: Sized {
    fn init_type(node: &PrefixTrieBuilder<T>) -> Self;
    fn insert_ordered_lengths(
        node: &PrefixTrieBuilder<T>,
        trie: &mut PrefixTrie<T, Self, IxType>,
        ix: usize,
    );
}

impl<
        T: Clone + Default,
        IxType: Default
            + Clone
            + Copy
            + TryFrom<usize>
            + AddAssign
            + Sum
            + TryInto<usize>
            + Add
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd,
    > OrderedLengthTypeTrait<T, IxType> for VecOfVec<LengthType, IxType>
where
    <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
    <IxType as TryInto<usize>>::Error: std::fmt::Debug,
{
    fn init_type(node: &PrefixTrieBuilder<T>) -> Self {
        let total_nodes = node.total_nodes();
        let mut lengths_in_order = vec![IxType::default(); total_nodes];
        node.compute_children_in_order(
            &mut lengths_in_order,
            &|node: &PrefixTrieBuilder<T>| {
                node.lengths
                    .len()
                    .try_into()
                    .expect("Cant convert from usize to IxType")
            },
            0,
        );
        VecOfVec::new(lengths_in_order)
    }

    fn insert_ordered_lengths(
        node: &PrefixTrieBuilder<T>,
        trie: &mut PrefixTrie<T, Self, IxType>,
        ix: usize,
    ) where
        Self: Sized,
    {
        let mut lengths: Vec<usize> = node.lengths.iter().cloned().collect();
        lengths.sort_unstable();

        let length_ix = trie.ordered_lengths.indices[ix];
        for (i, l) in lengths.iter().enumerate() {
            trie.ordered_lengths.data[length_ix.try_into().unwrap() + i] = *l as LengthType;
        }
    }
}
impl<T, IxType> OrderedLengthTypeTrait<T, IxType> for () {
    fn init_type(_node: &PrefixTrieBuilder<T>) -> Self {}

    fn insert_ordered_lengths(
        _node: &PrefixTrieBuilder<T>,
        _trie: &mut PrefixTrie<T, Self, IxType>,
        _ix: usize,
    ) where
        Self: Sized,
    {
    }
}

impl<T: Clone + Default> PrefixTrieBuilder<T> {
    pub fn finalize<
        IxType: Default
            + Clone
            + Copy
            + TryFrom<usize>
            + AddAssign
            + Sum
            + TryInto<usize>
            + Add
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd,
        OrderedLengthType: OrderedLengthTypeTrait<T, IxType>,
    >(
        self,
    ) -> PrefixTrie<T, OrderedLengthType, IxType>
    where
        <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
        <IxType as TryInto<usize>>::Error: std::fmt::Debug,
    {
        let total_nodes = self.total_nodes();

        let mut num_children_in_order = vec![IxType::default(); total_nodes];
        self.compute_children_in_order(
            &mut num_children_in_order,
            &|node: &PrefixTrieBuilder<T>| node.children.len().try_into().unwrap(),
            0,
        );

        let mut num_items_in_order: Vec<IxType> = vec![IxType::default(); total_nodes];
        self.compute_children_in_order(
            &mut num_items_in_order,
            &|node: &PrefixTrieBuilder<T>| node.items.len().try_into().unwrap(),
            0,
        );

        let mut trie = PrefixTrie {
            children: VecOfVec::new(num_children_in_order),
            leafs: vec![false; total_nodes],
            items: VecOfVec::new(num_items_in_order),
            ordered_lengths: OrderedLengthType::init_type(&self),
            characters: vec!['\0'; total_nodes],
            prefixes: vec![String::new(); total_nodes],
        };

        self.finalize_node(&mut trie, 0, "".to_string());
        trie
    }

    fn finalize_node<
        IxType: Default
            + Clone
            + Copy
            + TryFrom<usize>
            + AddAssign
            + Sum
            + TryInto<usize>
            + Add
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd,
        OrderedLengthType: OrderedLengthTypeTrait<T, IxType>,
    >(
        self,
        trie: &mut PrefixTrie<T, OrderedLengthType, IxType>,
        mut current_ix: usize,
        current_prefix: String,
    ) where
        <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
        <IxType as TryInto<usize>>::Error: std::fmt::Debug,
    {
        let my_ix = current_ix;

        OrderedLengthType::insert_ordered_lengths(&self, trie, current_ix);

        let items_ix = trie.items.indices[my_ix];
        for (i, item) in self.items.into_iter().enumerate() {
            trie.items.data[items_ix.try_into().unwrap() + i] = item;
        }
        trie.leafs[my_ix] = self.lengths.iter().any(|x| *x == 0);
        trie.prefixes[my_ix] = current_prefix.clone();

        current_ix += 1;

        let mut ch = self
            .children
            .into_iter()
            .map(|x| {
                let t = x.1.total_nodes();
                (x.0, x.1, t)
            })
            .collect::<Vec<_>>();
        ch.sort_by_key(|x| (x.2 as isize).wrapping_neg());

        let child_ix = trie.children.indices[my_ix];
        for (i, (c, child, _)) in ch.into_iter().enumerate() {
            if current_ix > IxType::MAX.try_into().unwrap() {
                panic!("PrefixTrie too large");
            }
            trie.children.data[child_ix.try_into().unwrap() + i] = current_ix.try_into().unwrap();
            trie.characters[current_ix] = c;

            let mut new_prefix = current_prefix.clone();
            new_prefix.push(c);

            let child_nodes = child.total_nodes();
            child.finalize_node(trie, current_ix, new_prefix);
            current_ix += child_nodes;
        }
    }
}

impl<T: Clone + Default> Default for PrefixTrieBuilder<T> {
    fn default() -> Self {
        PrefixTrieBuilder::new()
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct VecOfVec<T, IxType> {
    pub data: Vec<T>,
    pub indices: Vec<IxType>,
}

pub trait MaxValue {
    const MAX: Self;
}

impl MaxValue for u8 {
    const MAX: Self = u8::MAX;
}
impl MaxValue for u16 {
    const MAX: Self = u16::MAX;
}
impl MaxValue for u32 {
    const MAX: Self = u32::MAX;
}
impl MaxValue for u64 {
    const MAX: Self = u64::MAX;
}
impl MaxValue for usize {
    const MAX: Self = usize::MAX;
}

fn cumsum<IxType: Default + Copy + AddAssign + MaxValue + Sub<Output = IxType> + PartialOrd>(
    lengths: Vec<IxType>,
) -> Vec<IxType> {
    let mut indices = vec![IxType::default(); lengths.len() + 1];
    let mut sum = IxType::default();
    for (i, length) in lengths.iter().enumerate() {
        if IxType::MAX - *length < sum {
            panic!("VecOfVec too large");
        }
        sum += *length;
        indices[i + 1] = sum;
    }
    indices
}

impl<
        T: Default + Clone,
        IxType: Default
            + Copy
            + AddAssign
            + Sum
            + TryInto<usize>
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd,
    > VecOfVec<T, IxType>
where
    <IxType as TryInto<usize>>::Error: std::fmt::Debug,
{
    fn new(lengths: Vec<IxType>) -> Self {
        VecOfVec {
            data: vec![T::default(); lengths.iter().cloned().sum::<IxType>().try_into().unwrap()],
            indices: cumsum(lengths),
        }
    }

    fn ix(&self, ix: usize) -> VecOfVecIterator<'_, T, IxType> {
        VecOfVecIterator {
            vec_of_vec: self,
            current_ix: self.indices[ix],
            end_ix: self.indices[ix + 1],
        }
    }
}

struct VecOfVecIterator<'a, T, IxType> {
    vec_of_vec: &'a VecOfVec<T, IxType>,
    current_ix: IxType,
    end_ix: IxType,
}

impl<'a, T, IxType: AddAssign + PartialOrd + TryFrom<usize> + TryInto<usize> + Copy> Iterator
    for VecOfVecIterator<'a, T, IxType>
where
    <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
    <IxType as TryInto<usize>>::Error: std::fmt::Debug,
{
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        if self.current_ix < self.end_ix {
            let item = &self.vec_of_vec.data[self.current_ix.try_into().unwrap()];
            self.current_ix += 1.try_into().unwrap();
            Some(item)
        } else {
            None
        }
    }
}

type LengthType = u16;
type DistanceType = u8;
type WordIxType = u8;
type VisitedType = Vec<DistanceType>;

#[derive(Clone, Serialize, Deserialize)]
pub struct PrefixTrie<T, OrderedLengthType, IxType> {
    pub children: VecOfVec<IxType, IxType>,
    pub items: VecOfVec<T, IxType>,
    leafs: Vec<bool>,
    characters: Vec<char>,
    ordered_lengths: OrderedLengthType,
    prefixes: Vec<String>,
}

impl<
        T: Clone + Default,
        OrderedLengthType,
        IxType: Default
            + Copy
            + AddAssign
            + Sum
            + TryInto<usize>
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd,
    > PrefixTrie<T, OrderedLengthType, IxType>
{
    pub fn get_child(&self, c: char, ix: IxType) -> Option<&IxType>
    where
        IxType: TryFrom<usize>,
        <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
        <IxType as TryInto<usize>>::Error: std::fmt::Debug,
    {
        self.children
            .ix(ix.try_into().unwrap())
            .find(|child_ix| self.characters[(**child_ix).try_into().unwrap()] == c)
    }

    pub fn search(&self, word: &str) -> bool
    where
        IxType: TryFrom<usize>,
        <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
        <IxType as TryInto<usize>>::Error: std::fmt::Debug,
    {
        let mut current_ix = IxType::default();

        for c in word.chars() {
            match self.get_child(c, current_ix) {
                Some(child) => current_ix = *child,
                None => return false,
            }
        }
        self.leafs[current_ix.try_into().unwrap()]
    }

    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        word: &'a str,
        distance: DistanceType,
        continuations: bool,
    ) -> PrefixTrieMaxDistanceIterator<'a, T, OrderedLengthType, IxType> {
        PrefixTrieMaxDistanceIterator {
            current_distance: 0,
            max_distance: distance,
            inner_iterator: self.find_with_exact_edit_distance_stack(word, 0, continuations, None),
            beginning_stack: (IxType::default(), 0, String::new()),
            continuations,
            trie: self,
            word: word.chars().collect(),
        }
    }

    pub fn find_with_exact_edit_distance_stack<'a>(
        &'a self,
        word: &'a str,
        distance: DistanceType,
        continuations: bool,
        visited: Option<VisitedType>,
    ) -> PrefixTrieExactDistanceIterator<'a, T, OrderedLengthType, IxType> {
        PrefixTrieExactDistanceIterator {
            stack: vec![(IxType::default(), 0, distance)],
            continuations,
            visited: visited.unwrap_or(vec![DistanceType::MAX; self.characters.len()]),
            trie: self,
            word: word.chars().collect(),
        }
    }
}

impl<
        T: Clone + Default,
        IxType: Default
            + Copy
            + AddAssign
            + Sum
            + TryInto<usize>
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd
            + TryFrom<usize>,
    > PrefixTrie<T, VecOfVec<LengthType, IxType>, IxType>
where
    <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
    <IxType as TryInto<usize>>::Error: std::fmt::Debug,
{
    pub fn continuations<'a>(
        &'a self,
        prefix: &'a str,
        ix: IxType,
    ) -> Box<dyn Iterator<Item = (String, &'a T)> + 'a> {
        let mut current_ix = ix;
        for c in prefix.chars() {
            match self.get_child(c, current_ix) {
                Some(child) => current_ix = *child,
                None => return Box::new(std::iter::empty()),
            }
        }

        Box::new(
            self.ordered_lengths
                .ix(current_ix.try_into().unwrap())
                .flat_map(move |&x| self.childs_of_lengths(current_ix, x))
                .map(move |(suffix, item)| {
                    let mut full = String::new();
                    full.push_str(prefix);
                    full.push_str(&suffix);
                    (full, item)
                }),
        )
    }

    pub fn childs_of_lengths(
        &self,
        ix: IxType,
        length: LengthType,
    ) -> Box<dyn Iterator<Item = (String, &T)> + '_> {
        if !self
            .ordered_lengths
            .ix(ix.try_into().unwrap())
            .any(|x| *x == length)
        {
            return Box::new(std::iter::empty());
        }

        if length == 0 {
            return Box::new(
                self.items
                    .ix(ix.try_into().unwrap())
                    .map(|item| (String::new(), item)),
            );
        }

        Box::new(
            self.children
                .ix(ix.try_into().unwrap())
                .flat_map(move |child_ix| {
                    let suffixes = self.childs_of_lengths(*child_ix, length - 1);
                    suffixes.map(move |(suffix, item)| {
                        let mut s = String::new();
                        s.push(self.characters[(*child_ix).try_into().unwrap()]);
                        s.push_str(&suffix);
                        (s, item)
                    })
                }),
        )
    }
}

pub struct PrefixTrieMaxDistanceIterator<'a, T, OrderedLengthType, IxType> {
    current_distance: DistanceType,
    max_distance: DistanceType,
    inner_iterator: PrefixTrieExactDistanceIterator<'a, T, OrderedLengthType, IxType>,
    beginning_stack: (IxType, WordIxType, String),
    continuations: bool,
    trie: &'a PrefixTrie<T, OrderedLengthType, IxType>,
    word: Vec<char>,
}

impl<
        'a,
        T: Clone + Default,
        OrderedLengthType,
        IxType: Default
            + Clone
            + Copy
            + TryFrom<usize>
            + AddAssign
            + Sum
            + TryInto<usize>
            + Add
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd
            + std::hash::Hash
            + Eq,
    > Iterator for PrefixTrieMaxDistanceIterator<'a, T, OrderedLengthType, IxType>
where
    <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
    <IxType as TryInto<usize>>::Error: std::fmt::Debug,
{
    type Item = Box<dyn Iterator<Item = (String, &'a T)> + 'a>;

    fn next(&mut self) -> Option<Self::Item> {
        while self.current_distance <= self.max_distance {
            match self.inner_iterator.next() {
                Some(item) => {
                    return Some(item);
                }
                None => {
                    self.current_distance += 1;
                    self.inner_iterator = PrefixTrieExactDistanceIterator {
                        stack: vec![(
                            self.beginning_stack.0,
                            self.beginning_stack.1,
                            self.current_distance,
                        )],
                        continuations: self.continuations,
                        visited: self.inner_iterator.visited.clone(),
                        trie: self.trie,
                        word: self.word.clone(),
                    }
                }
            }
        }
        None
    }
}

pub struct PrefixTrieExactDistanceIterator<'a, T, OrderedLengthType, IxType> {
    stack: Vec<(IxType, WordIxType, DistanceType)>,
    continuations: bool,
    visited: VisitedType,
    trie: &'a PrefixTrie<T, OrderedLengthType, IxType>,
    word: Vec<char>,
}

impl<
        'a,
        T: Clone + Default,
        OrderedLengthType,
        IxType: Eq
            + std::hash::Hash
            + Default
            + Copy
            + AddAssign
            + Sum
            + TryInto<usize>
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd
            + TryFrom<usize>,
    > Iterator for PrefixTrieExactDistanceIterator<'a, T, OrderedLengthType, IxType>
where
    <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
    <IxType as TryInto<usize>>::Error: std::fmt::Debug,
{
    type Item = Box<dyn Iterator<Item = (String, &'a T)> + 'a>;

    fn next(&mut self) -> Option<Self::Item> {
        while let Some(top) = self.stack.pop() {
            //println!("Visited size: {}", self.visited.len());
            /*println!(
                "Word length: {}, Number of nodes: {}",
                self.word.len(),
                self.trie.children.len()
            );*/
            let (node, word_ix, distance) = top;
            let effective_position = word_ix + distance;
            let existing_distance = self.visited[node.try_into().unwrap()];
            if existing_distance != DistanceType::MAX {
                if effective_position <= existing_distance {
                    continue;
                }
                self.visited[node.try_into().unwrap()] = effective_position;
            } else {
                self.visited[node.try_into().unwrap()] = effective_position;
            }

            let mut to_return: Option<Self::Item> = None;

            if distance == 0
                && (word_ix == self.word.len() as u8)
                && self.trie.leafs[node.try_into().unwrap()]
            {
                let prefix = self.trie.prefixes[node.try_into().unwrap()].clone();
                if self.continuations {
                    to_return = Some(Box::new(
                        self.trie
                            .items
                            .ix(node.try_into().unwrap())
                            .map(move |item| (prefix.clone(), item)),
                    ));
                } else {
                    return Some(Box::new(
                        self.trie
                            .items
                            .ix(node.try_into().unwrap())
                            .map(move |item| (prefix.clone(), item)),
                    ));
                }
            }

            if word_ix < self.word.len() as u8 {
                let c = self.word[word_ix as usize];

                if distance == 0 {
                    // Match
                    if let Some(child) = self.trie.get_child(c, node) {
                        self.stack.push((*child, word_ix + 1, distance));
                    }
                    continue;
                }

                for child in self.trie.children.ix(node.try_into().unwrap()) {
                    // Substitution
                    let character = self.trie.characters[(*child).try_into().unwrap()];
                    if character != c {
                        self.stack.push((*child, word_ix + 1, distance - 1));
                    }
                }

                // Deletion
                self.stack.push((node, word_ix + 1, distance - 1));

                // Insertion
                for child in self.trie.children.ix(node.try_into().unwrap()) {
                    let character = self.trie.characters[(*child).try_into().unwrap()];
                    if character != c {
                        self.stack.push((*child, word_ix, distance - 1));
                    }
                }

                // Match
                if let Some(child) = self.trie.get_child(c, node) {
                    self.stack.push((*child, word_ix + 1, distance));
                }
            } else {
                if distance == 0 && !self.continuations {
                    continue;
                }
                for child in self.trie.children.ix(node.try_into().unwrap()) {
                    self.stack.push((
                        *child,
                        word_ix,
                        if distance > 0 { distance - 1 } else { distance },
                    ));
                }
            }

            if to_return.is_some() {
                return to_return;
            }
        }
        None
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SearchIndex<TrieType> {
    pub trie: TrieType,
}

impl<T: Clone + Default> Default for SearchIndex<PrefixTrieBuilder<T>> {
    fn default() -> Self {
        SearchIndex::new()
    }
}

impl<T: Clone + Default> SearchIndex<PrefixTrieBuilder<T>> {
    pub fn new() -> Self {
        SearchIndex {
            trie: PrefixTrieBuilder::new(),
        }
    }

    pub fn insert(&mut self, key: &str, element: T) {
        self.trie.insert(key, element);
    }

    pub fn finalize<
        IxType: Default
            + Clone
            + Copy
            + TryFrom<usize>
            + AddAssign
            + Sum
            + TryInto<usize>
            + Add
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd,
        OrderedLengthType: OrderedLengthTypeTrait<T, IxType>,
    >(
        self,
    ) -> SearchIndex<PrefixTrie<T, OrderedLengthType, IxType>>
    where
        <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
        <IxType as TryInto<usize>>::Error: std::fmt::Debug,
    {
        SearchIndex {
            trie: self.trie.finalize(),
        }
    }
}

impl<
        T: Clone + Default,
        IxType: Default
            + Clone
            + Copy
            + TryFrom<usize>
            + AddAssign
            + Sum
            + TryInto<usize>
            + Add
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd,
    > SearchIndex<PrefixTrie<T, VecOfVec<LengthType, IxType>, IxType>>
where
    <IxType as TryFrom<usize>>::Error: std::fmt::Debug,
    <IxType as TryInto<usize>>::Error: std::fmt::Debug,
{
    pub fn continuations<'a>(&'a self, prefix: &'a str) -> Box<dyn Iterator<Item = &'a T> + 'a> {
        Box::new(
            self.trie
                .continuations(prefix, IxType::default())
                .map(|x| x.1),
        )
    }
}

impl<
        T: Clone + Default,
        OrderedLengthType,
        IxType: Default
            + Clone
            + Copy
            + TryFrom<usize>
            + AddAssign
            + Sum
            + TryInto<usize>
            + Add
            + MaxValue
            + Sub<Output = IxType>
            + PartialOrd,
    > SearchIndex<PrefixTrie<T, OrderedLengthType, IxType>>
{
    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        key: &'a str,
        max_distance: DistanceType,
        continuations: bool,
    ) -> PrefixTrieMaxDistanceIterator<'a, T, OrderedLengthType, IxType> {
        self.trie
            .find_with_max_edit_distance(key, max_distance, continuations)
    }
}

#[cfg(test)]
#[path = "./textsearch_test.rs"]
mod textsearch_test;
