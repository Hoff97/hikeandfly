use crate::btree::BTree;

#[test]
fn test_btree_in_interval() {
    let items = vec![
        (vec![1.0, 2.0], "a"),
        (vec![2.0, 3.0], "b"),
        (vec![3.0, 4.0], "c"),
        (vec![4.0, 5.0], "d"),
        (vec![6.0, 7.0], "e"),
        (vec![20.0, 5.0], "f"),
        (vec![21.0, 5.0], "g"),
        (vec![4.0, -2.0], "h"),
        (vec![4.0, 5.0], "i"),
        (vec![4.0, 5.0], "j"),
        (vec![4.0, 5.0], "k"),
    ];

    let btree = BTree::new(items, Some(4), None);

    let lower = vec![2.0, 2.5];
    let upper = vec![4.0, 4.5];

    let result: Vec<_> = btree.in_interval(&lower, &upper).collect();
    assert_eq!(result, vec![(vec![3.0, 4.0], "c"), (vec![2.0, 3.0], "b")]);
}
