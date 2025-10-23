use std::{
    collections::{HashMap, HashSet},
    vec,
};

pub struct PrefixTrieBuilder<T> {
    children: HashMap<char, PrefixTrieBuilder<T>>,
    lengths: HashSet<usize>,
    items: Vec<T>,
}

impl<T: Clone> PrefixTrieBuilder<T> {
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

    pub fn finalize(self) -> PrefixTrie<T> {
        let total_nodes = self.total_nodes();

        let mut trie = PrefixTrie {
            children: vec![Vec::new(); total_nodes],
            leafs: vec![false; total_nodes],
            items: vec![Vec::new(); total_nodes],
            ordered_lengths: vec![vec![]; total_nodes],
            characters: vec!['\0'; total_nodes],
        };

        self.finalize_node(&mut trie, 0);
        trie
    }

    fn finalize_node(self, trie: &mut PrefixTrie<T>, mut current_ix: IndexType) {
        let my_ix = current_ix;
        trie.ordered_lengths[my_ix] = {
            let mut lengths: Vec<usize> = self.lengths.into_iter().collect();
            lengths.sort_unstable();
            lengths.into_iter().map(|x| x as LengthType).collect()
        };
        trie.items[my_ix] = self.items;
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
            trie.children[my_ix].push(current_ix);
            trie.characters[current_ix] = c;

            let child_nodes = child.total_nodes();
            child.finalize_node(trie, current_ix);
            current_ix += child_nodes;
        }
    }
}

impl<T: Clone> Default for PrefixTrieBuilder<T> {
    fn default() -> Self {
        PrefixTrieBuilder::new()
    }
}

type IndexType = usize;
type LengthType = u16;
type DistanceType = u8;
type VisitedType = HashMap<(IndexType, usize), DistanceType>;

#[derive(Clone)]
pub struct PrefixTrie<T> {
    children: Vec<Vec<IndexType>>,
    items: Vec<Vec<T>>,
    leafs: Vec<bool>,
    characters: Vec<char>,
    ordered_lengths: Vec<Vec<LengthType>>,
}

impl<T> PrefixTrie<T> {
    pub fn get_child(&self, c: char, ix: IndexType) -> Option<&IndexType> {
        self.children[ix].iter().find_map(|child_ix| {
            let child_char = &self.characters[*child_ix];
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
    ) -> Box<dyn Iterator<Item = (String, &T)> + 'a> {
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
        if !self.ordered_lengths[ix].contains(&length) {
            return Box::new(std::iter::empty());
        }

        if length == 0 {
            return Box::new(self.items[ix].iter().map(|item| (String::new(), item)));
        }

        Box::new(self.children[ix].iter().flat_map(move |child_ix| {
            let suffixes = self.childs_of_lengths(*child_ix, length - 1);
            suffixes.map(move |(suffix, item)| {
                let mut s = String::new();
                s.push(self.characters[*child_ix]);
                s.push_str(&suffix);
                (s, item)
            })
        }))
    }

    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        word: &'a str,
        distance: DistanceType,
        continuations: bool,
    ) -> PrefixTrieMaxDistanceIterator<'a, T> {
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
    ) -> PrefixTrieExactDistanceIterator<'a, T> {
        PrefixTrieExactDistanceIterator {
            stack: vec![(0, 0, distance, String::new())],
            continuations,
            visited: visited.unwrap_or_default(),
            trie: self,
            word: word.chars().collect(),
        }
    }
}

pub struct PrefixTrieMaxDistanceIterator<'a, T> {
    current_distance: DistanceType,
    max_distance: DistanceType,
    inner_iterator: PrefixTrieExactDistanceIterator<'a, T>,
    beginning_stack: (IndexType, usize, String),
    continuations: bool,
    trie: &'a PrefixTrie<T>,
    word: Vec<char>,
}

impl<'a, T> Iterator for PrefixTrieMaxDistanceIterator<'a, T> {
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

pub struct PrefixTrieExactDistanceIterator<'a, T> {
    stack: Vec<(IndexType, usize, DistanceType, String)>,
    continuations: bool,
    visited: VisitedType,
    trie: &'a PrefixTrie<T>,
    word: Vec<char>,
}

impl<'a, T> Iterator for PrefixTrieExactDistanceIterator<'a, T> {
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
                        self.trie.items[node]
                            .iter()
                            .map(move |item| (p.clone(), item)),
                    ));
                } else {
                    return Some(Box::new(
                        self.trie.items[node]
                            .iter()
                            .map(move |item| (p.clone(), item)),
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

                for child in self.trie.children[node].iter() {
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
                for child in self.trie.children[node].iter() {
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
                for child in self.trie.children[node].iter() {
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

#[derive(Clone)]
pub struct SearchIndex<TrieType> {
    trie: TrieType,
}

impl<T: Clone> Default for SearchIndex<PrefixTrieBuilder<T>> {
    fn default() -> Self {
        SearchIndex::new()
    }
}

impl<T: Clone> SearchIndex<PrefixTrieBuilder<T>> {
    pub fn new() -> Self {
        SearchIndex {
            trie: PrefixTrieBuilder::new(),
        }
    }

    pub fn insert(&mut self, key: &str, element: T) {
        self.trie.insert(key, element);
    }

    pub fn finalize(self) -> SearchIndex<PrefixTrie<T>> {
        SearchIndex {
            trie: self.trie.finalize(),
        }
    }
}

impl<T: Clone> SearchIndex<PrefixTrie<T>> {
    pub fn continuations<'a>(&'a self, prefix: &'a str) -> Box<dyn Iterator<Item = &'a T> + 'a> {
        Box::new(self.trie.continuations(prefix, 0).map(|x| x.1))
    }

    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        key: &'a str,
        max_distance: DistanceType,
        continuations: bool,
    ) -> PrefixTrieMaxDistanceIterator<'a, T> {
        self.trie
            .find_with_max_edit_distance(key, max_distance, continuations)
    }
}

#[cfg(test)]
#[path = "./textsearch_test.rs"]
mod textsearch_test;
