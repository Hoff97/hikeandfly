use std::{
    collections::{HashMap, HashSet},
    vec,
};

use serde::{Deserialize, Serialize};

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

    pub fn total_nodes(&self) -> IndexType {
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

pub trait OrderedLengthTypeTrait<T>: Sized {
    fn init_type(node: &PrefixTrieBuilder<T>) -> Self;
    fn insert_ordered_lengths(
        node: &PrefixTrieBuilder<T>,
        trie: &mut PrefixTrie<T, Self>,
        ix: IndexType,
    );
}

impl<T: Clone + Default> OrderedLengthTypeTrait<T> for VecOfVec<LengthType> {
    fn init_type(node: &PrefixTrieBuilder<T>) -> Self {
        let total_nodes = node.total_nodes();
        let mut lengths_in_order = vec![0; total_nodes];
        node.compute_children_in_order(
            &mut lengths_in_order,
            &|node: &PrefixTrieBuilder<T>| node.lengths.len(),
            0,
        );
        VecOfVec::new(lengths_in_order)
    }

    fn insert_ordered_lengths(
        node: &PrefixTrieBuilder<T>,
        trie: &mut PrefixTrie<T, Self>,
        ix: IndexType,
    ) where
        Self: Sized,
    {
        let mut lengths: Vec<usize> = node.lengths.iter().cloned().collect();
        lengths.sort_unstable();

        let length_ix = trie.ordered_lengths.indices[ix];
        for (i, l) in lengths.iter().enumerate() {
            trie.ordered_lengths.data[length_ix + i] = *l as LengthType;
        }
    }
}
impl<T> OrderedLengthTypeTrait<T> for () {
    fn init_type(_node: &PrefixTrieBuilder<T>) -> Self {}

    fn insert_ordered_lengths(
        _node: &PrefixTrieBuilder<T>,
        _trie: &mut PrefixTrie<T, Self>,
        _ix: IndexType,
    ) where
        Self: Sized,
    {
    }
}

impl<T: Clone + Default> PrefixTrieBuilder<T> {
    pub fn finalize<OrderedLengthType: OrderedLengthTypeTrait<T>>(
        self,
    ) -> PrefixTrie<T, OrderedLengthType> {
        let total_nodes = self.total_nodes();

        let mut num_children_in_order = vec![0; total_nodes];
        self.compute_children_in_order(
            &mut num_children_in_order,
            &|node: &PrefixTrieBuilder<T>| node.children.len(),
            0,
        );

        let mut num_items_in_order = vec![0; total_nodes];
        self.compute_children_in_order(
            &mut num_items_in_order,
            &|node: &PrefixTrieBuilder<T>| node.items.len(),
            0,
        );

        let mut trie = PrefixTrie {
            children: VecOfVec::new(num_children_in_order),
            leafs: vec![false; total_nodes],
            items: VecOfVec::new(num_items_in_order),
            ordered_lengths: OrderedLengthType::init_type(&self),
            characters: vec!['\0'; total_nodes],
        };

        self.finalize_node(&mut trie, 0);
        trie
    }

    fn finalize_node<OrderedLengthType: OrderedLengthTypeTrait<T>>(
        self,
        trie: &mut PrefixTrie<T, OrderedLengthType>,
        mut current_ix: IndexType,
    ) {
        let my_ix = current_ix;

        OrderedLengthType::insert_ordered_lengths(&self, trie, current_ix);

        let items_ix = trie.items.indices[my_ix];
        for (i, item) in self.items.into_iter().enumerate() {
            trie.items.data[items_ix + i] = item;
        }
        trie.leafs[my_ix] = self.lengths.iter().any(|x| *x == 0);

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
            trie.children.data[child_ix + i] = current_ix;
            trie.characters[current_ix] = c;

            let child_nodes = child.total_nodes();
            child.finalize_node(trie, current_ix);
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
struct VecOfVec<T> {
    data: Vec<T>,
    indices: Vec<usize>,
}

fn cumsum(lengths: Vec<usize>) -> Vec<usize> {
    let mut indices = vec![0; lengths.len() + 1];
    let mut sum = 0;
    for (i, length) in lengths.iter().enumerate() {
        sum += *length;
        indices[i + 1] = sum;
    }
    indices
}

impl<T: Default + Clone> VecOfVec<T> {
    fn new(lengths: Vec<usize>) -> Self {
        VecOfVec {
            data: vec![T::default(); lengths.iter().sum()],
            indices: cumsum(lengths),
        }
    }

    fn ix(&self, ix: usize) -> VecOfVecIterator<'_, T> {
        VecOfVecIterator {
            vec_of_vec: self,
            current_ix: self.indices[ix],
            end_ix: self.indices[ix + 1],
        }
    }
}

struct VecOfVecIterator<'a, T> {
    vec_of_vec: &'a VecOfVec<T>,
    current_ix: usize,
    end_ix: usize,
}

impl<'a, T> Iterator for VecOfVecIterator<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        if self.current_ix < self.end_ix {
            let item = &self.vec_of_vec.data[self.current_ix];
            self.current_ix += 1;
            Some(item)
        } else {
            None
        }
    }
}

type IndexType = usize;
type LengthType = u16;
type DistanceType = u8;
type VisitedType = HashMap<(IndexType, usize), DistanceType>;

#[derive(Clone, Serialize, Deserialize)]
pub struct PrefixTrie<T, OrderedLengthType> {
    children: VecOfVec<IndexType>,
    items: VecOfVec<T>,
    leafs: Vec<bool>,
    characters: Vec<char>,
    ordered_lengths: OrderedLengthType,
}

impl<T: Clone + Default, OrderedLengthType> PrefixTrie<T, OrderedLengthType> {
    pub fn get_child(&self, c: char, ix: IndexType) -> Option<&IndexType> {
        self.children
            .ix(ix)
            .find(|child_ix| self.characters[**child_ix] == c)
    }

    pub fn search(&self, word: &str) -> bool {
        let mut current_ix = 0;

        for c in word.chars() {
            match self.get_child(c, current_ix) {
                Some(child) => current_ix = *child,
                None => return false,
            }
        }
        self.leafs[current_ix]
    }

    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        word: &'a str,
        distance: DistanceType,
        continuations: bool,
    ) -> PrefixTrieMaxDistanceIterator<'a, T, OrderedLengthType> {
        PrefixTrieMaxDistanceIterator {
            current_distance: 0,
            max_distance: distance,
            inner_iterator: self.find_with_exact_edit_distance_stack(word, 0, continuations, None),
            beginning_stack: (0, 0, String::new()),
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
    ) -> PrefixTrieExactDistanceIterator<'a, T, OrderedLengthType> {
        PrefixTrieExactDistanceIterator {
            stack: vec![(0, 0, distance, String::new())],
            continuations,
            visited: visited.unwrap_or_default(),
            trie: self,
            word: word.chars().collect(),
        }
    }
}

impl<T: Clone + Default> PrefixTrie<T, VecOfVec<LengthType>> {
    pub fn continuations<'a>(
        &'a self,
        prefix: &'a str,
        ix: IndexType,
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
                .ix(current_ix)
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
        ix: IndexType,
        length: LengthType,
    ) -> Box<dyn Iterator<Item = (String, &T)> + '_> {
        if !self.ordered_lengths.ix(ix).any(|x| *x == length) {
            return Box::new(std::iter::empty());
        }

        if length == 0 {
            return Box::new(self.items.ix(ix).map(|item| (String::new(), item)));
        }

        Box::new(self.children.ix(ix).flat_map(move |child_ix| {
            let suffixes = self.childs_of_lengths(*child_ix, length - 1);
            suffixes.map(move |(suffix, item)| {
                let mut s = String::new();
                s.push(self.characters[*child_ix]);
                s.push_str(&suffix);
                (s, item)
            })
        }))
    }
}

pub struct PrefixTrieMaxDistanceIterator<'a, T, OrderedLengthType> {
    current_distance: DistanceType,
    max_distance: DistanceType,
    inner_iterator: PrefixTrieExactDistanceIterator<'a, T, OrderedLengthType>,
    beginning_stack: (IndexType, usize, String),
    continuations: bool,
    trie: &'a PrefixTrie<T, OrderedLengthType>,
    word: Vec<char>,
}

impl<'a, T: Clone + Default, OrderedLengthType> Iterator
    for PrefixTrieMaxDistanceIterator<'a, T, OrderedLengthType>
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
                            self.beginning_stack.2.clone(),
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

pub struct PrefixTrieExactDistanceIterator<'a, T, OrderedLengthType> {
    stack: Vec<(IndexType, usize, DistanceType, String)>,
    continuations: bool,
    visited: VisitedType,
    trie: &'a PrefixTrie<T, OrderedLengthType>,
    word: Vec<char>,
}

impl<'a, T: Clone + Default, OrderedLengthType> Iterator
    for PrefixTrieExactDistanceIterator<'a, T, OrderedLengthType>
{
    type Item = Box<dyn Iterator<Item = (String, &'a T)> + 'a>;

    fn next(&mut self) -> Option<Self::Item> {
        while let Some(top) = self.stack.pop() {
            let (node, word_ix, distance, prefix) = top;
            if let Some(d) = self.visited.get_mut(&(node, word_ix)) {
                if distance <= *d {
                    continue;
                }
                *d = distance;
            } else {
                self.visited.insert((node, word_ix), distance);
            }

            let mut to_return: Option<Self::Item> = None;

            let p = prefix.clone();
            if distance == 0 && (word_ix == self.word.len()) && self.trie.leafs[node] {
                if self.continuations {
                    to_return = Some(Box::new(
                        self.trie.items.ix(node).map(move |item| (p.clone(), item)),
                    ));
                } else {
                    return Some(Box::new(
                        self.trie.items.ix(node).map(move |item| (p.clone(), item)),
                    ));
                }
            }

            if word_ix < self.word.len() {
                let c = self.word[word_ix];

                if distance == 0 {
                    // Match
                    if let Some(child) = self.trie.get_child(c, node) {
                        self.stack.push((*child, word_ix + 1, distance, {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(c);
                            new_prefix
                        }));
                    }
                    continue;
                }

                for child in self.trie.children.ix(node) {
                    // Substitution
                    let character = self.trie.characters[*child];
                    if character != c {
                        self.stack.push((*child, word_ix + 1, distance - 1, {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(character);
                            new_prefix
                        }));
                    }
                }

                // Deletion
                self.stack
                    .push((node, word_ix + 1, distance - 1, prefix.clone()));

                // Insertion
                for child in self.trie.children.ix(node) {
                    let character = self.trie.characters[*child];
                    if character != c {
                        self.stack.push((*child, word_ix, distance - 1, {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(character);
                            new_prefix
                        }));
                    }
                }

                // Match
                if let Some(child) = self.trie.get_child(c, node) {
                    self.stack.push((*child, word_ix + 1, distance, {
                        let mut new_prefix = prefix.clone();
                        new_prefix.push(c);
                        new_prefix
                    }));
                }
            } else {
                if distance == 0 && !self.continuations {
                    continue;
                }
                for child in self.trie.children.ix(node) {
                    let character = self.trie.characters[*child];
                    self.stack.push((
                        *child,
                        word_ix,
                        if distance > 0 { distance - 1 } else { distance },
                        {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(character);
                            new_prefix
                        },
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
    trie: TrieType,
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

    pub fn finalize<OrderedLengthType: OrderedLengthTypeTrait<T>>(
        self,
    ) -> SearchIndex<PrefixTrie<T, OrderedLengthType>> {
        SearchIndex {
            trie: self.trie.finalize(),
        }
    }
}

impl<T: Clone + Default> SearchIndex<PrefixTrie<T, VecOfVec<LengthType>>> {
    pub fn continuations<'a>(&'a self, prefix: &'a str) -> Box<dyn Iterator<Item = &'a T> + 'a> {
        Box::new(self.trie.continuations(prefix, 0).map(|x| x.1))
    }
}

impl<T: Clone + Default, OrderedLengthType> SearchIndex<PrefixTrie<T, OrderedLengthType>> {
    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        key: &'a str,
        max_distance: DistanceType,
        continuations: bool,
    ) -> PrefixTrieMaxDistanceIterator<'a, T, OrderedLengthType> {
        self.trie
            .find_with_max_edit_distance(key, max_distance, continuations)
    }
}

#[cfg(test)]
#[path = "./textsearch_test.rs"]
mod textsearch_test;
