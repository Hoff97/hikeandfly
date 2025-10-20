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
            current.lengths.insert(word.len() - i);
            current = current.children.entry(c).or_default();
        }
        current.lengths.insert(0);
    }

    pub fn total_characters(&self) -> usize {
        let mut total = self.children.len();
        for child in self.children.values() {
            total += child.total_characters();
        }
        total
    }

    pub fn total_leafs(&self) -> usize {
        let mut total = 0;
        if self.lengths.contains(&0) {
            total += 1;
        }
        for child in self.children.values() {
            total += child.total_leafs();
        }
        total
    }

    pub fn finalize(self, max_id: Option<usize>) -> PrefixTrie {
        let mut lengths: Vec<usize> = self.lengths.iter().cloned().collect();
        lengths.sort_unstable();
        let mut max_id = max_id.unwrap_or(0);

        let mut trie = PrefixTrie {
            ordered_lengths: lengths,
            id: max_id,
            children: HashMap::new(),
        };
        max_id += 1;
        for (child_char, child) in self.children {
            let new_child = child.finalize(Some(max_id));
            max_id = new_child.id + 1;
            trie.children.insert(child_char, new_child);
        }
        trie
    }
}

impl Default for PrefixTrieBuilder {
    fn default() -> Self {
        PrefixTrieBuilder::new()
    }
}

#[derive(Clone)]
pub struct PrefixTrie {
    children: HashMap<char, PrefixTrie>,
    ordered_lengths: Vec<usize>,
    id: usize,
}

impl PrefixTrie {
    pub fn branching_factor(&self) -> usize {
        self.children.len()
    }

    pub fn branching_factor_counts(&self, counts: &mut HashMap<usize, usize>) {
        counts
            .entry(self.branching_factor())
            .and_modify(|c| *c += 1)
            .or_insert(1);
        for child in self.children.values() {
            child.branching_factor_counts(counts);
        }
    }

    pub fn get_child(&self, c: char) -> Option<&PrefixTrie> {
        self.children.get(&c)
    }

    pub fn search(&self, word: &str) -> bool {
        let mut current = self;
        for c in word.chars() {
            match current.get_child(c) {
                Some(child) => current = child,
                None => return false,
            }
        }
        current.ordered_lengths.contains(&0)
    }

    pub fn continuations<'a>(&'a self, prefix: &'a str) -> Box<dyn Iterator<Item = String> + 'a> {
        let mut current = self;
        for c in prefix.chars() {
            match current.get_child(c) {
                Some(child) => current = child,
                None => return Box::new(std::iter::empty()),
            }
        }

        Box::new(
            current
                .ordered_lengths
                .iter()
                .flat_map(|&x| current.childs_of_lengths(x))
                .map(move |suffix| {
                    let mut full = String::new();
                    full.push_str(prefix);
                    full.push_str(&suffix);
                    full
                }),
        )
    }

    pub fn childs_of_lengths(&self, length: usize) -> Box<dyn Iterator<Item = String> + '_> {
        if !self.ordered_lengths.contains(&length) {
            return Box::new(std::iter::empty());
        }

        if length == 0 {
            return Box::new(vec!["".to_string()].into_iter());
        }

        Box::new(self.children.iter().flat_map(move |(c, child)| {
            let suffixes = child.childs_of_lengths(length - 1);
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
        distance: usize,
        continuations: bool,
    ) -> PrefixTrieMaxDistanceIterator<'a> {
        PrefixTrieMaxDistanceIterator {
            current_distance: 0,
            max_distance: distance,
            inner_iterator: self.find_with_exact_edit_distance_stack(word, 0, continuations, None),
            beginning_stack: (self, word, String::new()),
            continuations,
        }
    }

    pub fn find_with_exact_edit_distance_stack<'a>(
        &'a self,
        word: &'a str,
        distance: usize,
        continuations: bool,
        visited: Option<HashMap<(usize, &'a str, String), usize>>,
    ) -> PrefixTrieExactDistanceIterator<'a> {
        PrefixTrieExactDistanceIterator {
            stack: vec![(self, word, distance, String::new())],
            continuations,
            visited: visited.unwrap_or_default(),
        }
    }
}

pub struct PrefixTrieMaxDistanceIterator<'a> {
    current_distance: usize,
    max_distance: usize,
    inner_iterator: PrefixTrieExactDistanceIterator<'a>,
    beginning_stack: (&'a PrefixTrie, &'a str, String),
    continuations: bool,
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
                    }
                }
            }
        }
        None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Modification {
    Match(char),
    Substitution(char, char),
    Insertion(char),
    Deletion(char),
}

pub struct PrefixTrieExactDistanceIterator<'a> {
    stack: Vec<(&'a PrefixTrie, &'a str, usize, String)>,
    continuations: bool,
    visited: HashMap<(usize, &'a str, String), usize>,
}

impl<'a> Iterator for PrefixTrieExactDistanceIterator<'a> {
    type Item = Box<dyn Iterator<Item = String> + 'a>;

    fn next(&mut self) -> Option<Self::Item> {
        while let Some(top) = self.stack.pop() {
            let (node, word, distance, prefix) = top;
            if let Some(d) = self.visited.get_mut(&(node.id, word, prefix.clone())) {
                if distance <= *d {
                    continue;
                }
                *d = distance;
            } else {
                self.visited
                    .insert((node.id, word, prefix.clone()), distance);
            }

            let mut to_return: Option<Self::Item> = None;

            let p = prefix.clone();
            if distance == 0 && word.is_empty() && node.ordered_lengths.contains(&0) {
                if self.continuations {
                    to_return = Some(Box::new(std::iter::once(p)));
                } else {
                    return Some(Box::new(std::iter::once(p)));
                }
            }

            if !word.is_empty() {
                let c = word.chars().next().unwrap();
                let rest = &word[c.len_utf8()..];

                if node.children.contains_key(&c) {
                    let child = node.children.get(&c).unwrap();
                    self.stack.push((child, rest, distance, {
                        let mut new_prefix = prefix.clone();
                        new_prefix.push(c);
                        new_prefix
                    }));
                }

                if distance == 0 {
                    continue;
                }

                for child in &node.children {
                    if *child.0 != c {
                        self.stack.push((child.1, rest, distance - 1, {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(*child.0);
                            new_prefix
                        }));
                    }
                }

                self.stack.push((node, rest, distance - 1, prefix.clone()));

                for child in &node.children {
                    if *child.0 != c {
                        self.stack.push((child.1, word, distance - 1, {
                            let mut new_prefix = prefix.clone();
                            new_prefix.push(*child.0);
                            new_prefix
                        }));
                    }
                }
            } else {
                if distance == 0 && !self.continuations {
                    continue;
                }
                for child in &node.children {
                    self.stack.push((
                        child.1,
                        word,
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
    elements: HashMap<String, T>,
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
        self.elements.insert(key.to_string(), element);
    }

    pub fn finalize(self) -> SearchIndex<PrefixTrie, T> {
        SearchIndex {
            trie: self.trie.finalize(None),
            elements: self.elements,
        }
    }
}

impl<T> SearchIndex<PrefixTrie, T> {
    pub fn search(&self, key: &str) -> Option<&T> {
        if self.trie.search(key) {
            self.elements.get(key)
        } else {
            None
        }
    }

    pub fn continuations<'a>(&'a self, prefix: &'a str) -> Box<dyn Iterator<Item = &'a T> + 'a> {
        let keys = self.trie.continuations(prefix);
        Box::new(keys.filter_map(move |found| self.elements.get(&found)))
    }

    pub fn find_with_max_edit_distance<'a>(
        &'a self,
        key: &'a str,
        max_distance: usize,
        continuations: bool,
    ) -> impl Iterator<Item = (String, &'a T)> + 'a {
        self.trie
            .find_with_max_edit_distance(key, max_distance, continuations)
            .flatten()
            .map(move |found_key| {
                let element = self.elements.get(&found_key).unwrap();
                (found_key, element)
            })
    }
}

#[cfg(test)]
#[path = "./textsearch_test.rs"]
mod textsearch_test;
