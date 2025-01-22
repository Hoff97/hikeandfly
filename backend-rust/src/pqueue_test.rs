use crate::pqueue::PriorityQueue;

use super::HasPriority;

type TestPQueue = PriorityQueue<usize, usize>;

impl HasPriority for usize {
    type Priority = usize;

    fn priority(&self) -> &Self::Priority {
        self
    }

    fn priority_mut(&mut self) -> &mut Self::Priority {
        self
    }
}

#[test]
fn test_pqueue_starts_empty() {
    let pqueue: TestPQueue = PriorityQueue::new();
    assert_eq!(pqueue.len(), 0);
}

#[test]
fn test_pqueue_with_capacity() {
    let pqueue: TestPQueue = PriorityQueue::new_with_capacity(5);
    assert_eq!(pqueue.len(), 0);
    assert_eq!(pqueue.capacity(), 5);
}

#[test]
fn test_pqueue_only_inserts_in_order() {
    let mut pqueue: TestPQueue = PriorityQueue::new();

    pqueue.push(0, 0);
    pqueue.push(1, 1);
    pqueue.push(2, 2);
    pqueue.push(3, 3);
    pqueue.push(4, 4);

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![0, 1, 2, 3, 4])
}

#[test]
fn test_pqueue_inserts_out_of_order() {
    let mut pqueue: TestPQueue = PriorityQueue::new();

    pqueue.push(1, 1);
    pqueue.push(2, 2);
    pqueue.push(5, 5);
    pqueue.push(3, 3);
    pqueue.push(6, 6);
    pqueue.push(7, 7);
    pqueue.push(4, 4);
    pqueue.push(8, 8);
    pqueue.push(9, 9);
    pqueue.push(10, 10);
    pqueue.push(11, 11);

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
}

#[test]
fn test_pqueue_inserts_out_of_order_2() {
    let mut pqueue: TestPQueue = PriorityQueue::new();

    pqueue.push(0, 0);
    pqueue.push(1, 1);
    pqueue.push(2, 2);
    pqueue.push(3, 3);
    pqueue.push(4, 4);
    pqueue.push(8, 8);

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![0, 1, 2, 3, 4, 8])
}

#[test]
fn test_pqueue_inserts_and_pops() {
    let mut pqueue: TestPQueue = PriorityQueue::new();

    pqueue.push(0, 0);
    pqueue.push(3, 3);
    pqueue.push(5, 5);
    pqueue.pop();
    pqueue.push(4, 4);
    pqueue.push(2, 2);
    pqueue.pop();
    pqueue.push(9, 9);
    pqueue.push(22, 22);
    pqueue.push(6, 6);
    pqueue.pop();
    pqueue.push(7, 7);
    pqueue.push(1, 1);

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![1, 4, 5, 6, 7, 9, 22])
}

#[test]
fn test_pqueue_update_priority() {
    let mut pqueue: TestPQueue = PriorityQueue::new();

    pqueue.push(0, 0);
    pqueue.push(3, 3);
    pqueue.push(5, 5);
    pqueue.pop();
    pqueue.push(4, 4);
    pqueue.push(2, 2);
    pqueue.update_priority(2, 8);
    pqueue.pop();
    pqueue.push(9, 9);
    pqueue.push(22, 22);
    pqueue.push(6, 6);
    pqueue.update_priority(4, 7);
    pqueue.pop();
    pqueue.push(3, 3);
    pqueue.push(1, 1);
    pqueue.update_priority(22, 2);

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![1, 2, 3, 6, 7, 8, 9])
}

#[test]
fn test_pqueue_update_priority_if_less() {
    let mut pqueue: TestPQueue = PriorityQueue::new();

    pqueue.push(0, 0);
    pqueue.push(3, 3);
    pqueue.push(5, 5);
    pqueue.pop();
    pqueue.push(4, 4);
    pqueue.push(2, 2);
    assert!(pqueue.update_priority_if_less(3, 0).is_some());
    pqueue.pop();
    pqueue.push(9, 9);
    pqueue.push(22, 22);
    pqueue.push(6, 6);
    assert!(pqueue.update_priority_if_less(4, 7).is_none());
    pqueue.pop();
    pqueue.push(3, 3);
    pqueue.push(0, 0);
    assert!(pqueue.update_priority_if_less(22, 1).is_some());

    let ordered = pqueue.into_iter().map(|x| x.item).collect::<Vec<usize>>();
    assert_eq!(ordered, vec![0, 1, 3, 4, 5, 6, 9]);
}
