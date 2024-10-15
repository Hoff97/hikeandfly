use std::simd::{LaneCount, Simd, SupportedLaneCount};

pub struct LinspaceSIMD<const U: usize>
where
    LaneCount<U>: SupportedLaneCount,
{
    start: f32,
    end: f32,
    n: usize,
    step: f32,
    i: usize,
}

pub struct LinspaceSIMDIterator<const U: usize>
where
    LaneCount<U>: SupportedLaneCount,
{
    n: usize,
    step: f32,
    i: usize,
    state: Simd<f32, U>,
}

pub struct LinspaceSIMDReminder {
    pub start: f32,
    pub n: usize,
    pub step: f32,
    pub i: usize,
}

pub fn linspace_simd<const U: usize>(start: f32, end: f32, n: usize) -> LinspaceSIMD<U>
where
    LaneCount<U>: SupportedLaneCount,
{
    LinspaceSIMD {
        start,
        end,
        n,
        step: (end - start) / (n - 1) as f32,
        i: 0,
    }
}

impl<const U: usize> LinspaceSIMD<U>
where
    LaneCount<U>: SupportedLaneCount,
{
    pub fn iter(&self) -> LinspaceSIMDIterator<U> {
        let mut start_state = [self.start; U];
        for i in 1..U {
            start_state[i] = start_state[i - 1] + self.step;
        }

        LinspaceSIMDIterator {
            n: self.n,
            step: self.step * U as f32,
            i: self.i,
            state: Simd::<f32, U>::from_array(start_state),
        }
    }

    pub fn reminder(&self) -> LinspaceSIMDReminder {
        let n = self.n % U;
        LinspaceSIMDReminder {
            start: self.end - (n - 1) as f32 * self.step,
            n: n,
            step: self.step,
            i: 0,
        }
    }
}

impl<const U: usize> Iterator for LinspaceSIMDIterator<U>
where
    LaneCount<U>: SupportedLaneCount,
{
    type Item = Simd<f32, U>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.i < self.n - U {
            let result = self.state;
            self.state += Simd::<f32, U>::splat(self.step);
            self.i += U;
            Some(result)
        } else {
            None
        }
    }
}

impl Iterator for LinspaceSIMDReminder {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        if self.i < self.n {
            let result = self.start;
            self.start += self.step;
            self.i += 1;
            Some(result)
        } else {
            None
        }
    }
}

#[cfg(test)]
#[path = "./simd_linspace_test.rs"]
mod simd_linspace_test;
