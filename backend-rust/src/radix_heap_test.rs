use super::RadixHeap;

type TestPQueue = RadixHeap<usize, usize, usize>;

#[test]
fn test_pqueue_starts_empty() {
    let pqueue: TestPQueue = TestPQueue::new(0);
    assert_eq!(pqueue.len(), 0);
}

#[test]
fn test_pqueue_only_inserts_in_order() {
    let mut pqueue: TestPQueue = TestPQueue::new(0);

    pqueue.push(0, 0, 0);
    pqueue.push(1, 1, 1);
    pqueue.push(2, 2, 2);
    pqueue.push(3, 3, 3);
    pqueue.push(4, 4, 4);

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![0, 1, 2, 3, 4])
}

#[test]
fn test_pqueue_inserts_out_of_order() {
    let mut pqueue: TestPQueue = TestPQueue::new(0);

    pqueue.push(0, 0, 0);
    pqueue.push(3, 3, 3);
    pqueue.push(1, 1, 1);
    pqueue.push(4, 4, 4);
    pqueue.push(2, 2, 2);

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![0, 1, 2, 3, 4])
}

#[test]
fn test_pqueue_inserts_and_pops() {
    let mut pqueue: TestPQueue = TestPQueue::new(0);

    pqueue.push(0, 0, 0);
    pqueue.push(3, 3, 3);
    pqueue.push(5, 5, 5);
    pqueue.pop();
    pqueue.push(4, 4, 4);
    pqueue.push(2, 2, 2);
    pqueue.pop();
    pqueue.push(9, 9, 9);
    pqueue.push(22, 22, 22);
    pqueue.push(6, 6, 6);
    pqueue.pop();
    pqueue.push(7, 7, 7);
    pqueue.push(3, 3, 3);

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![3, 4, 5, 6, 7, 9, 22])
}

#[test]
fn test_pqueue_update_priority_if_less() {
    let mut pqueue: TestPQueue = TestPQueue::new(0);

    pqueue.push(0, 0, 0);
    println!("pqueue: {:?}", pqueue);
    pqueue.push(3, 3, 3);
    println!("pqueue: {:?}", pqueue);
    pqueue.push(5, 5, 5);
    println!("pqueue: {:?}", pqueue);
    pqueue.pop();
    println!("pqueue: {:?}", pqueue);
    pqueue.push(4, 4, 4);
    pqueue.push(2, 2, 2);
    pqueue.pop();
    println!("pqueue: {:?}", pqueue);
    pqueue.push(9, 9, 9);
    pqueue.push(22, 22, 22);
    pqueue.push(7, 7, 7);
    assert!(pqueue.update_priority_if_less(4, 7).is_none());

    println!("pqueue: {:?}", pqueue);
    pqueue.pop();

    println!("pqueue: {:?}", pqueue);
    pqueue.push(6, 6, 6);
    assert!(pqueue.update_priority_if_less(22, 3).is_some());

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![22, 4, 5, 6, 7, 9]);
}

#[test]
fn test_pqueue_update_priority() {
    let mut pqueue: TestPQueue = TestPQueue::new(0);

    pqueue.push(0, 0, 0);
    pqueue.push(1, 1, 1);
    pqueue.push(2, 2, 2);
    pqueue.push(3, 3, 3);
    pqueue.push(4, 4, 4);
    pqueue.push(5, 5, 5);

    pqueue.push(6, 6, 6);

    pqueue.push(7, 7, 7);

    pqueue.pop();
    pqueue.pop();
    println!("pqueue: {:?}", pqueue);
    pqueue.pop();
    println!("pqueue: {:?}", pqueue);
    pqueue.pop();
    println!("pqueue: {:?}", pqueue);
    pqueue.pop();
    println!("pqueue: {:?}", pqueue);
}
