use crate::textsearch::{PrefixTrieBuilder, SearchIndex};

#[test]
fn test_prefix_trie_search() {
    let words = vec![
        "Hello", "helium", "hero", "her", "abba", "aber", "alla", "all",
    ];
    let mut prefix_trie_builder = PrefixTrieBuilder::new();
    for word in &words {
        prefix_trie_builder.insert(word);
    }
    let trie = prefix_trie_builder.finalize();

    assert!(trie.search("Hello"));
    assert!(trie.search("helium"));
    assert!(!trie.search("helicopter"));
    assert!(trie.search("her"));
    assert!(!trie.search("he"));
    assert!(trie.search("abba"));
    assert!(!trie.search("abc"));
}

#[test]
fn test_prefix_trie_continuations() {
    let words = vec![
        "hello", "helium", "hero", "her", "abba", "aber", "alla", "all",
    ];
    let mut prefix_trie_builder = PrefixTrieBuilder::new();
    for word in &words {
        prefix_trie_builder.insert(word);
    }
    let trie = prefix_trie_builder.finalize();

    assert_eq!(
        trie.continuations("he", 0).collect::<Vec<_>>(),
        vec!["her", "hero", "hello", "helium"]
    );
}

#[test]
fn test_prefix_trie_exact_edit_distance_stack() {
    let words = vec!["hero"];
    let mut prefix_trie_builder = PrefixTrieBuilder::new();
    for word in &words {
        prefix_trie_builder.insert(word);
    }
    let trie = prefix_trie_builder.finalize();

    assert_eq!(
        trie.find_with_exact_edit_distance_stack("her", 1, false, None)
            .flatten()
            .collect::<Vec<String>>(),
        vec!["hero".to_string()]
    );

    assert_eq!(
        trie.find_with_exact_edit_distance_stack("her", 2, false, None)
            .flatten()
            .collect::<Vec<String>>(),
        Vec::<String>::new()
    );
}

#[test]
fn test_prefix_trie_exact_edit_distance_stack_2() {
    let words = vec!["aber"];
    let mut prefix_trie_builder = PrefixTrieBuilder::new();
    for word in &words {
        prefix_trie_builder.insert(word);
    }
    let trie = prefix_trie_builder.finalize();

    assert_eq!(
        trie.find_with_exact_edit_distance_stack("her", 2, false, None)
            .flatten()
            .collect::<Vec<String>>(),
        vec!["aber".to_string()]
    );
}

#[test]
fn test_prefix_trie_max_edit_distance() {
    let words = vec![
        "hello", "helium", "hero", "her", "abba", "aber", "alla", "all",
    ];
    let mut prefix_trie_builder = PrefixTrieBuilder::new();
    for word in &words {
        prefix_trie_builder.insert(word);
    }
    let trie = prefix_trie_builder.finalize();

    assert_eq!(
        trie.find_with_max_edit_distance("her", 2, false)
            .flatten()
            .collect::<Vec<_>>(),
        vec!["her".to_string(), "hero".to_string(), "aber".to_string(),]
    );
}

#[test]
fn test_prefix_trie_max_edit_distance_with_continuation() {
    let words = vec![
        "hello", "helium", "hero", "her", "abba", "aber", "alla", "all",
    ];
    let mut prefix_trie_builder = PrefixTrieBuilder::new();
    for word in &words {
        prefix_trie_builder.insert(word);
    }
    let trie = prefix_trie_builder.finalize();

    assert_eq!(
        trie.find_with_max_edit_distance("hello", 2, true)
            .flatten()
            .collect::<Vec<_>>(),
        vec![
            "hello".to_string(),
            "hero".to_string(),
            "helium".to_string(),
        ]
    );
}

#[test]
fn test_search_index_search() {
    let words = vec![
        "hello", "helium", "hero", "her", "abba", "aber", "alla", "all",
    ];
    let mut index_builder = SearchIndex::new();
    for word in &words {
        index_builder.insert(word, word.chars().rev().collect::<String>());
    }
    let index = index_builder.finalize();

    assert_eq!(index.search("hello"), Some(&"olleh".to_string()));
    assert_eq!(index.search("her"), Some(&"reh".to_string()));
    assert_eq!(index.search("helicopter"), None);
    assert_eq!(index.search("abba"), Some(&"abba".to_string()));
    assert_eq!(index.search("aber"), Some(&"reba".to_string()));
    assert_eq!(index.search("alla"), Some(&"alla".to_string()));
    assert_eq!(index.search("all"), Some(&"lla".to_string()));
}

#[test]
fn test_search_index_continuations() {
    let words = vec![
        "hello", "helium", "hero", "her", "abba", "aber", "alla", "all",
    ];
    let mut index_builder = SearchIndex::new();
    for word in &words {
        index_builder.insert(word, word.chars().rev().collect::<String>());
    }
    let index = index_builder.finalize();

    assert_eq!(
        index.continuations("he").collect::<Vec<_>>(),
        vec![
            &"reh".to_string(),
            &"oreh".to_string(),
            &"olleh".to_string(),
            &"muileh".to_string()
        ]
    );
}
