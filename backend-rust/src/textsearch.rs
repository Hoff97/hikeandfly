use std::{
    collections::{HashMap, HashSet},
    vec,
};

pub struct PrefixTrieBuilder {
    children: HashMap<char, PrefixTrieBuilder>,
    lengths: HashSet<usize>,
}

impl PrefixTrieBuilder {
    pub fn new() -> Self {
        PrefixTrieBuilder {
            children: HashMap::new(),
            lengths: HashSet::new(),
        }
    }

    pub fn insert(&mut self, word: &str) {
        let mut current = self;
        for (i, c) in word.chars().enumerate() {
            let l = word.len() - i;
            current.lengths.insert(l);
            current = current.children.entry(c).or_default();
        }
        current.lengths.insert(0);
    }

    pub fn total_nodes(&self) -> IndexType {
        let mut total = 1;
        for child in self.children.values() {
            total += child.total_nodes();
        }
        total
    }

    pub fn finalize(self) -> PrefixTrie {
        let total_nodes = self.total_nodes();

        let mut trie = PrefixTrie {
            children: vec![HashMap::new(); total_nodes],
            leafs: vec![false; total_nodes],
            ordered_lengths: vec![vec![]; total_nodes],
        };

        self.finalize_node(&mut trie, 0);
        trie
    }

    fn finalize_node(self, trie: &mut PrefixTrie, mut current_ix: IndexType) {
        let my_ix = current_ix;
        trie.ordered_lengths[my_ix] = {
            let mut lengths: Vec<usize> = self.lengths.into_iter().collect();
            lengths.sort_unstable();
            lengths.into_iter().map(|x| x as LengthType).collect()
        };
        trie.leafs[my_ix] = trie.ordered_lengths[my_ix].contains(&0);

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

        for (c, child, _) in ch {
            trie.children[my_ix].insert(c, current_ix);

            let child_nodes = child.total_nodes();
            child.finalize_node(trie, current_ix);
            current_ix += child_nodes;
        }
    }
}

impl Default for PrefixTrieBuilder {
    fn default() -> Self {
        PrefixTrieBuilder::new()
    }
}

type IndexType = usize;
type LengthType = u16;
type DistanceType = u8;
type VisitedType = HashMap<(IndexType, usize), DistanceType>;

#[derive(Clone)]
pub struct PrefixTrie {
    children: Vec<HashMap<char, IndexType>>,
    leafs: Vec<bool>,
    ordered_lengths: Vec<Vec<LengthType>>,
}

impl PrefixTrie {
    pub fn get_child(&self, c: char, ix: IndexType) -> Option<&IndexType> {
        self.children[ix].iter().find_map(|(child_char, child_ix)| {
            if *child_char == c {
                Some(child_ix)
            } else {
                None
            }
        })
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

    pub fn continuations<'a>(
        &'a self,
        prefix: &'a str,
        ix: IndexType,
    ) -> Box<dyn Iterator<Item = String> + 'a> {
        let mut current_ix = ix;
        for c in prefix.chars() {
            match self.get_child(c, current_ix) {
                Some(child) => current_ix = *child,
                None => return Box::new(std::iter::empty()),
            }
        }

        Box::new(
            self.ordered_lengths[current_ix]
                .iter()
                .flat_map(move |&x| self.childs_of_lengths(current_ix, x))
                .map(move |suffix| {
                    let mut full = String::new();
                    full.push_str(prefix);
                    full.push_str(&suffix);
                    full
                }),
        )
    }

    pub fn childs_of_lengths(
        &self,
        ix: IndexType,
        length: LengthType,
    ) -> Box<dyn Iterator<Item = String> + '_> {
        if !self.ordered_lengths[ix].contains(&length) {
            return Box::new(std::iter::empty());
        }

        if length == 0 {
            return Box::new(vec!["".to_string()].into_iter());
        }

        Box::new(self.children[ix].iter().flat_map(move |(c, child)| {
            let suffixes = self.childs_of_lengths(*child, length - 1);
            suffixes.map(move |suffix| {
                let mut s = String::new();
                s.push(*c);
                s.push_str(&suffix);
                s
            })
        }))
    }

    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        word: &'a str,
        distance: DistanceType,
        continuations: bool,
    ) -> PrefixTrieMaxDistanceIterator<'a> {
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
    ) -> PrefixTrieExactDistanceIterator<'a> {
        PrefixTrieExactDistanceIterator {
            stack: vec![(0, 0, distance, String::new())],
            continuations,
            visited: visited.unwrap_or_default(),
            trie: self,
            word: word.chars().collect(),
        }
    }
}

pub struct PrefixTrieMaxDistanceIterator<'a> {
    current_distance: DistanceType,
    max_distance: DistanceType,
    inner_iterator: PrefixTrieExactDistanceIterator<'a>,
    beginning_stack: (IndexType, usize, String),
    continuations: bool,
    trie: &'a PrefixTrie,
    word: Vec<char>,
}

impl<'a> Iterator for PrefixTrieMaxDistanceIterator<'a> {
    type Item = Box<dyn Iterator<Item = String> + 'a>;

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

pub struct PrefixTrieExactDistanceIterator<'a> {
    stack: Vec<(IndexType, usize, DistanceType, String)>,
    continuations: bool,
    visited: VisitedType,
    trie: &'a PrefixTrie,
    word: Vec<char>,
}

impl<'a> Iterator for PrefixTrieExactDistanceIterator<'a> {
    type Item = Box<dyn Iterator<Item = String> + 'a>;

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
                    to_return = Some(Box::new(std::iter::once(p)));
                } else {
                    return Some(Box::new(std::iter::once(p)));
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

                for child in self.trie.children[node].iter() {
                    // Substitution
                    if *child.0 != c {
                        self.stack.push((*child.1, word_ix + 1, distance - 1, {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(*child.0);
                            new_prefix
                        }));
                    }
                }

                // Deletion
                self.stack
                    .push((node, word_ix + 1, distance - 1, prefix.clone()));

                // Insertion
                for child in self.trie.children[node].iter() {
                    if *child.0 != c {
                        self.stack.push((*child.1, word_ix, distance - 1, {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(*child.0);
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
                for child in self.trie.children[node].iter() {
                    self.stack.push((
                        *child.1,
                        word_ix,
                        if distance > 0 { distance - 1 } else { distance },
                        {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(*child.0);
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

#[derive(Clone)]
pub struct SearchIndex<TrieType, T> {
    trie: TrieType,
    elements: HashMap<String, Vec<T>>,
}

impl<T> Default for SearchIndex<PrefixTrieBuilder, T> {
    fn default() -> Self {
        SearchIndex::new()
    }
}

impl<T> SearchIndex<PrefixTrieBuilder, T> {
    pub fn new() -> Self {
        SearchIndex {
            trie: PrefixTrieBuilder::new(),
            elements: HashMap::new(),
        }
    }

    pub fn insert(&mut self, key: &str, element: T) {
        self.trie.insert(key);
        let entry = self.elements.entry(key.to_string()).or_default();
        entry.push(element);
    }

    pub fn finalize(self) -> SearchIndex<PrefixTrie, T> {
        SearchIndex {
            trie: self.trie.finalize(),
            elements: self.elements,
        }
    }
}

impl<T> SearchIndex<PrefixTrie, T> {
    pub fn search(&self, key: &str) -> Option<&Vec<T>> {
        if self.trie.search(key) {
            self.elements.get(key)
        } else {
            None
        }
    }

    pub fn continuations<'a>(&'a self, prefix: &'a str) -> Box<dyn Iterator<Item = &'a T> + 'a> {
        let keys = self.trie.continuations(prefix, 0);
        Box::new(
            keys.flat_map(move |found| self.elements.get(&found).into_iter())
                .flatten(),
        )
    }

    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        key: &'a str,
        max_distance: DistanceType,
        continuations: bool,
    ) -> impl Iterator<Item = (String, &'a T)> + 'a {
        self.trie
            .find_with_max_edit_distance(key, max_distance, continuations)
            .flatten()
            .filter_map(move |found_key| {
                self.elements
                    .get(&found_key)
                    .map(move |v| v.iter().map(move |e| (found_key.clone(), e)))
            })
            .flatten()
    }
}

#[cfg(test)]
#[path = "./textsearch_test.rs"]
mod textsearch_test;
