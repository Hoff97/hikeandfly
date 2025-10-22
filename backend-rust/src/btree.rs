use std::{f32::consts::PI, iter};

pub struct BTree<T> {
    left: Option<Box<BTree<T>>>,
    right: Option<Box<BTree<T>>>,
    value: f32,
    items: Option<Vec<(Vec<f32>, T)>>,
    dimension: usize,
}

const MIN_ITEMS_TO_SPLIT: usize = 20;

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

fn l2_distance_squared(a: &[f32], b: &[f32]) -> f32 {
    let lat1 = a[1];
    let lon1 = a[0];
    let lat2 = b[1];
    let lon2 = b[0];

    let r = 6371e3; // metres
    let phi1 = lat1 * PI / 180.0; // φ, λ in radians
    let phi2 = lat2 * PI / 180.0;
    let deltaphi = (lat2 - lat1) * PI / 180.0;
    let delta_lambda = (lon2 - lon1) * PI / 180.0;

    let a = (deltaphi / 2.0).sin() * (deltaphi / 2.0).sin()
        + phi1.cos() * phi2.cos() * (delta_lambda / 2.0).sin() * (delta_lambda / 2.0).sin();
    let c = 2.0 * a.atan2((1.0 - a).sqrt());

    r * c
}

struct MergeByDistance<'a, T> {
    left_iter: Box<dyn Iterator<Item = (&'a Vec<f32>, &'a T, f32)> + 'a>,
    right_iter: Box<dyn Iterator<Item = (&'a Vec<f32>, &'a T, f32)> + 'a>,
    left_next: Option<(&'a Vec<f32>, &'a T, f32)>,
    right_next: Option<(&'a Vec<f32>, &'a T, f32)>,
}

impl<'a, T> Iterator for MergeByDistance<'a, T> {
    type Item = (&'a Vec<f32>, &'a T, f32);

    fn next(&mut self) -> Option<Self::Item> {
        if self.left_next.is_none() {
            self.left_next = self.left_iter.next();
        }
        if self.right_next.is_none() {
            self.right_next = self.right_iter.next();
        }

        match (self.left_next, self.right_next) {
            (Some((_, _, ld)), Some((_, _, rd))) => {
                if ld <= rd {
                    self.left_next.take()
                } else {
                    self.right_next.take()
                }
            }
            (Some(_), None) => self.left_next.take(),
            (None, Some(_)) => self.right_next.take(),
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

    pub fn in_interval<'a>(
        &'a self,
        lower: &'a [f32],
        upper: &'a [f32],
        middle: Option<Vec<f32>>,
    ) -> Box<dyn Iterator<Item = (&'a Vec<f32>, &'a T, f32)> + 'a> {
        let mid = middle.unwrap_or(
            lower
                .iter()
                .zip(upper)
                .map(|(a, b)| (a + b) / 2.0)
                .collect(),
        );

        if let Some(ref items) = self.items {
            let c = items.iter().filter_map(move |(point, item)| {
                if point
                    .iter()
                    .zip(lower.iter().zip(upper.iter()))
                    .all(|(p, (l, u))| p >= l && p <= u)
                {
                    Some((point, item, l2_distance_squared(point, &mid)))
                } else {
                    None
                }
            });

            Box::new(c)
        } else {
            let mut left_iter: Box<dyn Iterator<Item = (&'a Vec<f32>, &'a T, f32)>> =
                Box::new(iter::empty());
            let mut right_iter: Box<dyn Iterator<Item = (&'a Vec<f32>, &'a T, f32)>> =
                Box::new(iter::empty());
            if lower[self.dimension] < self.value {
                if let Some(ref left) = self.left {
                    left_iter = left.in_interval(lower, upper, Some(mid.clone()));
                }
            }
            if upper[self.dimension] >= self.value {
                if let Some(ref right) = self.right {
                    right_iter = right.in_interval(lower, upper, Some(mid.clone()));
                }
            }
            Box::new(MergeByDistance {
                left_iter,
                right_iter,
                left_next: None,
                right_next: None,
            })
        }
    }
}

#[cfg(test)]
#[path = "./btree_test.rs"]
mod btree_test;
