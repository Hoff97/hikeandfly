use std::cmp::{max, min};

type Num = i16;

fn line_iterator(x0: Num, y0: Num, x1: Num, y1: Num, dx: Num, dy: Num, swap: bool) -> LineIter {
    let yi_plus = y0 <= y1;

    let d = (2 * dy) - dx;
    let y = y0;

    LineIter {
        d,
        dx,
        dy,
        y,
        x: x0,
        x0,
        x1,
        swap,
        yi_plus,
    }
}

pub struct LineIter {
    d: Num,
    dx: Num,
    dy: Num,
    y: Num,
    x: Num,
    x0: Num,
    x1: Num,
    swap: bool,
    yi_plus: bool,
}

impl Iterator for LineIter {
    type Item = (Num, Num);

    fn next(&mut self) -> Option<Self::Item> {
        if self.x > self.x1 || self.x < self.x0 {
            return None;
        }
        let r = (self.x, self.y);
        if self.d > 0 {
            if self.yi_plus {
                self.y += 1;
            } else {
                self.y -= 1;
            }
            self.d -= 2 * self.dx;
        } else {
            self.d += 2 * self.dy;
        }
        self.x = if self.x1 > self.x0 {
            self.x + 1
        } else {
            self.x - 1
        };
        Some(if self.swap { swap(r) } else { r })
    }
}

fn swap(a: (Num, Num)) -> (Num, Num) {
    (a.1, a.0)
}

pub struct Line {
    x: (Num, Num),
    y: (Num, Num),
    dx: Num,
    dy: Num,
}

impl Line {
    pub fn new(x: (Num, Num), y: (Num, Num)) -> Line {
        Line {
            x,
            y,
            dx: max(x.1, x.0) - min(x.1, x.0),
            dy: max(y.1, y.0) - min(y.1, y.0),
        }
    }

    pub fn num_pixels(&self) -> usize {
        (max(self.dx, self.dy) + 1) as usize
    }

    pub fn iter(&self) -> LineIter {
        if self.dy < self.dx {
            if self.x.0 > self.x.1 {
                line_iterator(
                    self.x.1, self.y.1, self.x.0, self.y.0, self.dx, self.dy, false,
                )
            } else {
                line_iterator(
                    self.x.0, self.y.0, self.x.1, self.y.1, self.dx, self.dy, false,
                )
            }
        } else if self.y.0 > self.y.1 {
            line_iterator(
                self.y.1, self.x.1, self.y.0, self.x.0, self.dy, self.dx, true,
            )
        } else {
            line_iterator(
                self.y.0, self.x.0, self.y.1, self.x.1, self.dy, self.dx, true,
            )
        }
    }

    pub fn iterator_reversed(&self) -> bool {
        (self.dy < self.dx && self.x.0 > self.x.1) || (self.dy >= self.dx && self.y.0 > self.y.1)
    }
}

impl IntoIterator for Line {
    type Item = (Num, Num);

    type IntoIter = LineIter;

    fn into_iter(self) -> Self::IntoIter {
        if self.dy < self.dx {
            if self.x.0 > self.x.1 {
                line_iterator(
                    self.x.1, self.y.1, self.x.0, self.y.0, self.dx, self.dy, false,
                )
            } else {
                line_iterator(
                    self.x.0, self.y.0, self.x.1, self.y.1, self.dx, self.dy, false,
                )
            }
        } else if self.y.0 > self.y.1 {
            line_iterator(
                self.y.1, self.x.1, self.y.0, self.x.0, self.dy, self.dx, true,
            )
        } else {
            line_iterator(
                self.y.0, self.x.0, self.y.1, self.x.1, self.dy, self.dx, true,
            )
        }
    }
}

#[cfg(test)]
#[path = "./line_test.rs"]
mod line_test;
