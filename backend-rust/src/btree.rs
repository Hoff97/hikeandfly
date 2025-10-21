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

    pub fn in_interval<'a>(
        &'a self,
        lower: &'a [f32],
        upper: &'a [f32],
    ) -> Box<dyn Iterator<Item = &'a T> + 'a> {
        if let Some(ref items) = self.items {
            Box::new(items.iter().filter_map(move |(point, item)| {
                if point
                    .iter()
                    .zip(lower.iter().zip(upper.iter()))
                    .all(|(p, (l, u))| p >= l && p <= u)
                {
                    Some(item)
                } else {
                    None
                }
            }))
        } else {
            let mut left_iter: Box<dyn Iterator<Item = &'a T>> = Box::new(iter::empty());
            let mut right_iter: Box<dyn Iterator<Item = &'a T>> = Box::new(iter::empty());
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
            Box::new(left_iter.chain(right_iter))
        }
    }
}

#[cfg(test)]
#[path = "./btree_test.rs"]
mod btree_test;
