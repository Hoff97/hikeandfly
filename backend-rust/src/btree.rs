use std::iter;

pub struct BTree<T> {
    left: Option<Box<BTree<T>>>,
    right: Option<Box<BTree<T>>>,
    value: f32,
    items: Option<Vec<(Vec<f32>, T)>>,
    dimension: usize,
}

const MIN_ITEMS_TO_SPLIT: usize = 100;

fn variance(mut data: impl Iterator<Item = f32>) -> f32 {
    let first = data.next().unwrap();
    let mut count = 1;
    let mut sum = 0.0;
    let mut sum_sq = 0.0;

    for x in data {
        count += 1;
        let xp = x - first;
        sum += xp;
        sum_sq += xp * xp;
    }

    if count > 1 {
        let ex2 = sum_sq / (count as f32);
        let ex = sum / (count as f32);
        ex2 - ex * ex
    } else {
        0.0
    }
}

fn median(data: &mut [f32]) -> f32 {
    data.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = data.len();
    for (i, d) in data.iter().enumerate() {
        if i >= n / 2 - 1 && data[i - 1] != *d {
            return *d;
        }
    }
    data[n / 2]
}

fn l2_distance(a: &[f32], b: &[f32]) -> f32 {
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| {
            let diff = x - y;
            diff * diff
        })
        .sum()
}

struct MergeByDistance<'a, T> {
    left: Box<dyn Iterator<Item = (Vec<f32>, T)> + 'a>,
    right: Box<dyn Iterator<Item = (Vec<f32>, T)> + 'a>,
    middle: Vec<f32>,
    left_next: Option<(Vec<f32>, T, f32)>,
    right_next: Option<(Vec<f32>, T, f32)>,
}

impl<'a, T: Clone> Iterator for MergeByDistance<'a, T> {
    type Item = (Vec<f32>, T);

    fn next(&mut self) -> Option<Self::Item> {
        if self.left_next.is_none() {
            if let Some((point, item)) = self.left.next() {
                let dist = l2_distance(&point, &self.middle);
                self.left_next = Some((point, item, dist));
            }
        }
        if self.right_next.is_none() {
            if let Some((point, item)) = self.right.next() {
                let dist = l2_distance(&point, &self.middle);
                self.right_next = Some((point, item, dist));
            }
        }

        match (self.left_next.take(), self.right_next.take()) {
            (Some((lp, li, ld)), Some((rp, ri, rd))) => {
                if ld <= rd {
                    self.right_next = Some((rp, ri, rd));
                    Some((lp, li))
                } else {
                    self.left_next = Some((lp, li, ld));
                    Some((rp, ri))
                }
            }
            (Some((lp, li, _)), None) => Some((lp, li)),
            (None, Some((rp, ri, _))) => Some((rp, ri)),
            (None, None) => None,
        }
    }
}

impl<T> BTree<T> {
    pub fn new(items: Vec<(Vec<f32>, T)>, min_split: Option<usize>, depth: Option<usize>) -> Self {
        let d = depth.unwrap_or(0);
        if items.len() > min_split.unwrap_or(MIN_ITEMS_TO_SPLIT) && d < 20 {
            let n_dims = items[0].0.len();
            let variances = (0..n_dims)
                .map(|d| variance(items.iter().map(|(point, _)| point[d])))
                .collect::<Vec<f32>>();
            let (best_dim, _) = variances
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
                .unwrap();
            let median = median(
                &mut items
                    .iter()
                    .map(|(point, _)| point[best_dim])
                    .collect::<Vec<f32>>(),
            );

            let (left_items, right_items): (Vec<_>, Vec<_>) = items
                .into_iter()
                .partition(|(point, _)| point[best_dim] < median);

            BTree {
                left: Some(Box::new(BTree::new(left_items, min_split, Some(d + 1)))),
                right: Some(Box::new(BTree::new(right_items, min_split, Some(d + 1)))),
                value: median,
                items: None,
                dimension: best_dim,
            }
        } else {
            BTree {
                left: None,
                right: None,
                value: 0.0,
                items: Some(items),
                dimension: 0,
            }
        }
    }
}

impl<T: Clone> BTree<T> {
    pub fn in_interval<'a>(
        &'a self,
        lower: &'a [f32],
        upper: &'a [f32],
    ) -> Box<dyn Iterator<Item = (Vec<f32>, T)> + 'a> {
        let middle = lower
            .iter()
            .zip(upper.iter())
            .map(|(l, u)| (l + u) / 2.0)
            .collect::<Vec<f32>>();

        if let Some(ref items) = self.items {
            let mut cloned = items
                .clone()
                .iter()
                .map(|x| (x.0.clone(), x.1.clone(), l2_distance(&x.0, &middle)))
                .collect::<Vec<_>>();
            cloned.sort_by(|x, y| x.2.partial_cmp(&y.2).unwrap());

            Box::new(cloned.into_iter().filter_map(move |(point, item, _)| {
                if point
                    .iter()
                    .zip(lower.iter().zip(upper.iter()))
                    .all(|(p, (l, u))| p >= l && p <= u)
                {
                    Some((point, item))
                } else {
                    None
                }
            }))
        } else {
            let mut left_iter: Box<dyn Iterator<Item = (Vec<f32>, T)> + 'a> =
                Box::new(iter::empty());
            let mut right_iter: Box<dyn Iterator<Item = (Vec<f32>, T)> + 'a> =
                Box::new(iter::empty());
            if lower[self.dimension] < self.value {
                if let Some(ref left) = self.left {
                    left_iter = Box::new(left.in_interval(lower, upper));
                }
            }
            if upper[self.dimension] >= self.value {
                if let Some(ref right) = self.right {
                    right_iter = Box::new(right.in_interval(lower, upper));
                }
            }
            Box::new(MergeByDistance {
                left: left_iter,
                right: right_iter,
                middle: middle,
                left_next: None,
                right_next: None,
            })
        }
    }
}

#[cfg(test)]
#[path = "./btree_test.rs"]
mod btree_test;
