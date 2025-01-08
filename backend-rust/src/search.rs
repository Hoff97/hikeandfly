use core::f32;
use std::{
    cmp::{max, min},
    collections::HashSet,
    iter::zip,
};

use ndarray::{linspace, s};

use crate::{
    height_data::{get_height_at_point, get_height_data_around_point, HeightGrid},
    pqueue::{MapLike, PriorityQueue},
};

pub type GridIxType = u16;
pub type GridIxT = (GridIxType, GridIxType);
//pub type GridIx = (GridIxType, GridIxType);
#[derive(Clone, Copy)]
pub struct GridIx {
    pub pos: GridIxT,
    pub ix: usize,
}

impl PartialEq for GridIx {
    fn eq(&self, other: &Self) -> bool {
        self.ix == other.ix
    }
}

impl Eq for GridIx {}

impl GridIx {
    fn new(pos: GridIxT, ix: usize) -> GridIx {
        GridIx { pos, ix }
    }
    fn from_grid(pos: GridIxT, grid_shape: GridIxT) -> GridIx {
        GridIx {
            pos,
            ix: (pos.0 as usize * grid_shape.1 as usize + pos.1 as usize) as usize,
        }
    }
}

#[derive(Clone)]
pub struct Node {
    pub height: f32,
    pub ix: GridIx,
    pub reference: Option<GridIx>,
    pub distance: f32,
    pub reachable: bool,
    pub explored: bool,
}

impl Default for Node {
    fn default() -> Self {
        Self::new()
    }
}

impl Node {
    pub fn new() -> Node {
        Node {
            height: 0.0,
            ix: GridIx::new((0, 0), 0),
            reference: None,
            distance: 0.0,
            reachable: false,
            explored: false,
        }
    }
}

pub struct GridMap {
    values: Vec<Node>,
    grid_shape: (u16, u16),
}

pub struct GridMapIter<'a> {
    gridmap: &'a GridMap,
    ix: usize,
}

impl<'a> Iterator for GridMapIter<'a> {
    type Item = &'a Node;

    fn next(&mut self) -> Option<Self::Item> {
        while self.ix < self.gridmap.values.len() && !self.gridmap.values[self.ix].explored {
            self.ix += 1;
        }
        if self.ix >= self.gridmap.values.len() {
            return None;
        }
        let result = Some(&self.gridmap.values[self.ix]);
        self.ix += 1;
        result
    }
}

fn to_ix(grid_shape: (u16, u16), index: usize) -> GridIx {
    GridIx::new(
        (
            (index / grid_shape.1 as usize) as u16,
            (index % grid_shape.1 as usize) as u16,
        ),
        index,
    )
}

impl GridMap {
    fn new(grid_shape: (u16, u16)) -> GridMap {
        let size = grid_shape.0 as usize * grid_shape.1 as usize;
        let mut values = vec![Node::new(); size];
        for (index, node) in values.iter_mut().enumerate() {
            node.ix = to_ix(grid_shape, index);
        }
        GridMap { values, grid_shape }
    }

    unsafe fn get_unchecked(&self, index: &GridIx) -> &Node {
        self.values.get_unchecked(index.ix)
    }

    unsafe fn get_unchecked_mut(&mut self, index: &GridIx) -> &mut Node {
        self.values.get_unchecked_mut(index.ix)
    }

    fn insert(&mut self, index: GridIx, value: Node) {
        *unsafe { self.values.get_unchecked_mut(index.ix) } = value;
    }

    fn subset(self, lat: GridIxT, lon: GridIxT) -> GridMap {
        let mut result = GridMap::new((lat.1 - lat.0 + 1, lon.1 - lon.0 + 1));
        for mut n in self.values.into_iter() {
            if n.explored
                & (n.ix.pos.0 >= lat.0)
                & (n.ix.pos.0 <= lat.1)
                & (n.ix.pos.1 >= lon.0)
                & (n.ix.pos.1 <= lon.1)
            {
                let new_lat = n.ix.pos.0 - lat.0;
                let new_lon = n.ix.pos.1 - lon.0;
                reindex_node(&mut n, lat, lon, result.grid_shape);
                result.insert(GridIx::from_grid((new_lat, new_lon), result.grid_shape), n);
            }
        }
        result
    }

    pub fn iter(&self) -> GridMapIter {
        GridMapIter {
            gridmap: self,
            ix: 0,
        }
    }

    pub fn into_it(self) -> impl Iterator<Item = Node> {
        self.values.into_iter().filter(|x| x.explored)
    }
}

//pub type Explored = HashMap<GridIx, Node>;
pub type Explored = GridMap;

pub type FakeHashMapPos = u16;

pub struct FakeHashMapForGrid {
    positions: Vec<FakeHashMapPos>,
    grid_shape: (u16, u16),
}

impl FakeHashMapForGrid {
    pub fn new(grid_shape: (u16, u16)) -> FakeHashMapForGrid {
        FakeHashMapForGrid {
            grid_shape,
            positions: vec![FakeHashMapPos::MAX; grid_shape.0 as usize * grid_shape.1 as usize],
        }
    }
}

impl MapLike<GridIx, usize> for FakeHashMapForGrid {
    fn insert(&mut self, key: GridIx, value: usize) {
        *unsafe { self.positions.get_unchecked_mut(key.ix) } = value as FakeHashMapPos;
        //self.positions[ix] = value as u16;
    }

    fn get(&self, key: &GridIx) -> Option<usize> {
        let v = *unsafe { self.positions.get_unchecked(key.ix) };
        if v == FakeHashMapPos::MAX {
            return None;
        }
        Some(v as usize)
    }

    fn remove_entry(&mut self, key: &GridIx) {
        *unsafe { self.positions.get_unchecked_mut(key.ix) } = FakeHashMapPos::MAX;
    }

    fn contains_key(&self, key: &GridIx) -> bool {
        let value = *unsafe { self.positions.get_unchecked(key.ix) };
        let max_value = FakeHashMapPos::MAX;
        value != max_value
    }

    fn set(&mut self, key: GridIx, value: usize) {
        *unsafe { self.positions.get_unchecked_mut(key.ix) } = value as FakeHashMapPos;
    }

    unsafe fn get_unsafe(&self, key: &GridIx) -> usize {
        *unsafe { self.positions.get_unchecked(key.ix) } as usize
    }
}

pub type PQueue = PriorityQueue<f32, GridIx, FakeHashMapForGrid>;

pub struct SearchState {
    pub explored: Explored,
    pub queue: PQueue,
}

pub fn put_node(state: &mut SearchState, node: Node) {
    if state.queue.contains_key(&node.ix) {
        // Safety: We already checked above that the queue contains the key
        let item = unsafe {
            state
                .queue
                .update_priority_if_less_unsafe(node.ix, node.distance)
        };
        if let Some(i) = item {
            i.item = node.distance; // TODO: Needed?
            state.explored.insert(node.ix, node);
        }
    } else {
        state.queue.push(node.ix, node.distance);
        state.explored.insert(node.ix, node);
    }
}

pub fn put_or_update(state: &mut SearchState, ix: GridIx, distance: f32) -> Option<&mut Node> {
    if state.queue.contains_key(&ix) {
        // Safety: We already checked above that the queue contains the key
        let item = unsafe { state.queue.update_priority_if_less_unsafe(ix, distance) };
        if item.is_some() {
            return Some(unsafe { state.explored.get_unchecked_mut(&ix) });
        }
    } else {
        state.queue.push(ix, distance);
        return Some(unsafe { state.explored.get_unchecked_mut(&ix) });
    }
    None
}

pub struct EffectiveGlide {
    #[allow(dead_code)]
    speed: f32,
    glide_ratio: f32,
}

pub fn get_effective_glide_ratio(
    effective_wind_angle: f32,
    wind_speed: f32,
    trim_speed: f32,
    glide_ratio: f32,
) -> EffectiveGlide {
    let side_wind = effective_wind_angle.sin() * wind_speed;
    let back_wind = effective_wind_angle.cos() * wind_speed;

    let rs = trim_speed * trim_speed - side_wind * side_wind;
    if rs <= 0.0 {
        return EffectiveGlide {
            speed: 0.0,
            glide_ratio: f32::INFINITY,
        };
    }

    let rest_speed = rs.sqrt();

    let effective_speed = rest_speed + back_wind;
    if effective_speed <= 0.0 {
        return EffectiveGlide {
            speed: 0.0,
            glide_ratio: f32::INFINITY,
        };
    }

    let effective_glide_ratio = glide_ratio / (effective_speed / trim_speed);

    EffectiveGlide {
        speed: effective_speed,
        glide_ratio: effective_glide_ratio,
    }
}

pub struct SearchQuery {
    pub glide_ratio: f32,
    pub trim_speed: f32,
    pub wind_direction: f32,
    pub wind_speed: f32,
    pub start_height: Option<f32>,
    pub additional_height: f32,
    pub safety_margin: f32,
    pub start_distance: f32,
}

pub struct SearchConfig {
    pub grid: HeightGrid,
    pub query: SearchQuery,
}

impl SearchConfig {
    pub fn get_safety_margin_at_distance(&self, distance: f32) -> f32 {
        if distance < self.query.start_distance {
            return 0.0;
        }
        self.query.safety_margin
    }
}

pub fn get_neighbor_indices(ix: &GridIx, height_grid: &HeightGrid) -> Vec<GridIx> {
    let mut result = Vec::with_capacity(4);

    if ix.pos.0 > 0 {
        result.push(GridIx::from_grid(
            (ix.pos.0 - 1, ix.pos.1),
            height_grid.shape,
        ));
    }
    if ix.pos.1 > 0 {
        result.push(GridIx::from_grid(
            (ix.pos.0, ix.pos.1 - 1),
            height_grid.shape,
        ));
    }
    if ix.pos.0 < (height_grid.heights.shape()[0] - 1) as GridIxType {
        result.push(GridIx::from_grid(
            (ix.pos.0 + 1, ix.pos.1),
            height_grid.shape,
        ));
    }
    if ix.pos.1 < (height_grid.heights.shape()[1] - 1) as GridIxType {
        result.push(GridIx::from_grid(
            (ix.pos.0, ix.pos.1 + 1),
            height_grid.shape,
        ));
    }

    result
}

pub fn l2_distance(a: &GridIxT, b: &GridIxT) -> f32 {
    let ax = a.0 as f32;
    let ay = a.1 as f32;
    let bx = b.0 as f32;
    let by = b.1 as f32;

    ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt()
}

pub fn l2_diff(a: &GridIxT, b: &GridIxT) -> (i32, i32) {
    (a.0 as i32 - b.0 as i32, a.1 as i32 - b.1 as i32)
}

const PI_2: f32 = f32::consts::PI / 2.0;

fn get_effective_glide_ratio_from_to(
    query: &SearchQuery,
    start: &GridIxT,
    end: &GridIxT,
) -> EffectiveGlide {
    if query.wind_speed == 0.0 {
        return EffectiveGlide {
            speed: query.trim_speed,
            glide_ratio: query.glide_ratio,
        };
    }

    let diff = l2_diff(end, start);
    let angle = (diff.0 as f32).atan2(diff.1 as f32);

    let effective_wind_angle = (-query.wind_direction + PI_2) - angle;

    get_effective_glide_ratio(
        effective_wind_angle,
        query.wind_speed,
        query.trim_speed,
        query.glide_ratio,
    )
}

pub fn is_straight(a: &GridIxT, b: &GridIxT) -> bool {
    // TODO: Bitwise or?
    a.0 == b.0 || a.1 == b.1
}

pub fn is_in_line(point: &GridIxT, start: &GridIxT, end: &GridIxT) -> bool {
    if (point.0 == start.0) & (point.0 == end.0) {
        return (point.1 >= min(start.1, end.1)) & (point.1 <= max(start.1, end.1));
    } else if (point.1 == start.1) & (point.1 == end.1) {
        return (point.0 >= min(start.0, end.0)) & (point.0 <= max(start.0, end.0));
    }
    false
}

fn get_straight_line_ref<'a>(ix: &GridIx, neighbor: &'a Node, explored: &'a Explored) -> &'a Node {
    let mut n = neighbor;
    while let Some(reference) = &n.reference {
        if is_straight(&reference.pos, &ix.pos) {
            // Safety: References are always explored before their children,
            // so must be in explored.
            n = unsafe { explored.get_unchecked(reference) };
        } else {
            break;
        }
    }
    n
}

pub fn update_one_neighbor(
    neighbor_ix: GridIx,
    ix: &GridIx,
    config: &SearchConfig,
    state: &mut SearchState,
    do_intersection_check_opt: Option<bool>,
) {
    let do_intersection_check = do_intersection_check_opt.unwrap_or(false);

    let neighbor = unsafe { state.explored.get_unchecked(&neighbor_ix) };

    if !neighbor.reachable {
        return;
    }

    let mut reference = neighbor;
    if neighbor.reference.is_some()
        & ((config.query.wind_speed >= config.query.trim_speed) | do_intersection_check)
    {
        // We already checked neighbor.reference.is_some()
        // References are always explored before their children
        reference = unsafe {
            state
                .explored
                .get_unchecked(&neighbor.reference.unwrap_unchecked())
        };

        if state.queue.contains_key(ix) {
            let a = unsafe { state.explored.get_unchecked(ix) };
            if a.reference.is_some()
                && unsafe { a.reference.unwrap_unchecked() }.ix == reference.ix.ix
            {
                return;
            }
        }

        if is_line_intersecting(reference, ix, config) {
            reference = neighbor;
        }
    }

    let effective_glide =
        get_effective_glide_ratio_from_to(&config.query, &ix.pos, &reference.ix.pos);
    let distance = l2_distance(&ix.pos, &reference.ix.pos) * config.grid.cell_size;

    if f32::is_infinite(effective_glide.glide_ratio) {
        return;
    }

    let total_distance = distance + reference.distance;
    let straight_line_ref = Some(get_straight_line_ref(ix, reference, &state.explored).ix);
    let ref_height = reference.height;

    if let Some(r) = put_or_update(state, *ix, total_distance) {
        let height = ref_height - distance * effective_glide.glide_ratio;
        // Safety: ix is guaranteed to be in the grid
        let grid_height = *unsafe {
            config
                .grid
                .heights
                .uget([ix.pos.0 as usize, ix.pos.1 as usize])
        } as f32;
        let safety_margin = config.get_safety_margin_at_distance(total_distance);

        let reachable = grid_height + safety_margin < height;

        r.height = height;
        r.reference = straight_line_ref;
        r.distance = total_distance;
        r.reachable = reachable;
    }
}

pub fn update_two_with_different_references(
    neighbor_1: GridIx,
    neighbor_2: GridIx,
    ix: &GridIx,
    config: &SearchConfig,
    state: &mut SearchState,
) {
    update_one_neighbor(neighbor_1, ix, config, state, Some(true));
    update_one_neighbor(neighbor_2, ix, config, state, Some(true));
}

pub fn update_two_neighbors(
    neighbor_1_ix: GridIx,
    neighbor_2_ix: GridIx,
    ix: &GridIx,
    config: &SearchConfig,
    state: &mut SearchState,
) {
    let neighbor_1 = unsafe { state.explored.get_unchecked(&neighbor_1_ix) };
    let neighbor_2 = unsafe { state.explored.get_unchecked(&neighbor_2_ix) };

    if neighbor_1.reachable & neighbor_2.reachable {
        let ref_path_intersection = ref_paths_intersection(
            &neighbor_1.ix,
            &neighbor_1.reference,
            &neighbor_2.ix,
            &neighbor_2.reference,
        );
        if let Some(rpi) = ref_path_intersection {
            if state.queue.contains_key(ix)
                && &unsafe { state.explored.get_unchecked(ix) }.reference == ref_path_intersection
            {
                return;
            }

            let distance = l2_distance(&ix.pos, &rpi.pos) * config.grid.cell_size;

            let effective_glide =
                get_effective_glide_ratio_from_to(&config.query, &ix.pos, &rpi.pos);

            if f32::is_infinite(effective_glide.glide_ratio) {
                return;
            }

            // RPI is a (transitive) parent of both neighbors, so must have
            // been explored already.
            let rpi_node = unsafe { state.explored.get_unchecked(rpi) };
            let total_distance = distance + rpi_node.distance;
            let ref_p_deref = *ref_path_intersection;
            let rpi_node_height = rpi_node.height;

            if let Some(r) = put_or_update(state, *ix, total_distance) {
                let grid_height = *unsafe {
                    config
                        .grid
                        .heights
                        .uget([ix.pos.0 as usize, ix.pos.1 as usize])
                } as f32;
                let height = rpi_node_height - distance * effective_glide.glide_ratio;
                let reachable =
                    grid_height + config.get_safety_margin_at_distance(total_distance) < height;
                r.height = height;
                r.reference = ref_p_deref;
                r.distance = total_distance;
                r.reachable = reachable;
            }
        } else {
            update_two_with_different_references(neighbor_1_ix, neighbor_2_ix, ix, config, state);
        }
    } else if neighbor_1.reachable {
        update_one_neighbor(neighbor_1_ix, ix, config, state, None);
    } else if neighbor_2.reachable {
        update_one_neighbor(neighbor_2_ix, ix, config, state, None);
    }
}

pub fn update_three_neighbors(
    explored_neighbors: &[GridIx],
    ix: &GridIx,
    config: &SearchConfig,
    state: &mut SearchState,
) {
    // Safety: We only call with explored neighbors.
    let mut reachable: Vec<_> = explored_neighbors
        .iter()
        .map(|x| unsafe { state.explored.get_unchecked(x) })
        .filter(|x| x.reachable)
        .collect();

    if reachable.len() == 1 {
        update_one_neighbor(reachable[0].ix, ix, config, state, None);
    } else if reachable.len() == 2 {
        update_two_neighbors(reachable[0].ix, reachable[1].ix, ix, config, state);
    } else if reachable.len() == 3 {
        let reference_set =
            HashSet::<Option<_>>::from_iter(reachable.iter().map(|x| x.reference.map(|y| y.ix)));
        if reference_set.len() == 3 {
            // Sort apparently increases performance
            reachable.sort_by(|x, y| x.distance.partial_cmp(&y.distance).unwrap());

            let r1 = reachable[0].ix;
            let r2 = reachable[1].ix;
            let r3 = reachable[2].ix;

            update_one_neighbor(r1, ix, config, state, None);
            update_one_neighbor(r2, ix, config, state, None);
            update_one_neighbor(r3, ix, config, state, None);
        } else if reference_set.len() == 2 {
            if reachable[0].reference == reachable[1].reference {
                let r1 = reachable[0].ix;
                let r2 = reachable[1].ix;
                let r3 = reachable[2].ix;
                update_two_neighbors(r1, r2, ix, config, state);
                update_one_neighbor(r3, ix, config, state, None);
            } else if reachable[0].reference == reachable[2].reference {
                let r1 = reachable[0].ix;
                let r2 = reachable[1].ix;
                let r3 = reachable[2].ix;
                update_two_neighbors(r1, r3, ix, config, state);
                update_one_neighbor(r2, ix, config, state, None);
            } else {
                let r1 = reachable[0].ix;
                let r2 = reachable[1].ix;
                let r3 = reachable[2].ix;
                update_two_neighbors(r2, r3, ix, config, state);
                update_one_neighbor(r1, ix, config, state, None);
            }
        }
    }
}

pub fn update_four_neighbors(
    explored_neighbors: &[GridIx],
    ix: &GridIx,
    config: &SearchConfig,
    state: &mut SearchState,
) {
    // Safety: We only call with explored neighbors.
    let mut reachable: Vec<_> = explored_neighbors
        .iter()
        .map(|x| unsafe { state.explored.get_unchecked(x) })
        .filter(|x| x.reachable)
        .collect();

    if reachable.is_empty() {
        if let Some(r) = put_or_update(state, *ix, 0.0) {
            r.height = 0.0;
            r.reference = None;
            r.distance = 0.0;
            r.reachable = false;
        }
    } else if reachable.len() < 4 {
        update_three_neighbors(explored_neighbors, ix, config, state);
    } else if reachable.len() == 4 {
        let reference_set =
            HashSet::<Option<_>>::from_iter(reachable.iter().map(|x| x.reference.map(|y| y.ix)));
        if reference_set.len() == 4 {
            reachable.sort_by(|x, y| x.distance.partial_cmp(&y.distance).unwrap());
            update_one_neighbor(reachable[0].ix, ix, config, state, None);
        }
    }
}

pub fn update_node(ix: &GridIx, config: &SearchConfig, state: &mut SearchState) {
    let neighbors = get_neighbor_indices(ix, &config.grid);
    let explored_neighbors: Vec<GridIx> = neighbors
        .into_iter()
        .filter(|x| unsafe { state.explored.get_unchecked(x) }.explored)
        .collect();

    if explored_neighbors.len() == 1 {
        update_one_neighbor(explored_neighbors[0], ix, config, state, None);
    } else if explored_neighbors.len() == 2 {
        update_two_neighbors(
            explored_neighbors[0],
            explored_neighbors[1],
            ix,
            config,
            state,
        )
    } else if explored_neighbors.len() == 3 {
        update_three_neighbors(&explored_neighbors, ix, config, state)
    } else if explored_neighbors.len() == 4 {
        update_four_neighbors(&explored_neighbors, ix, config, state)
    }
}

pub fn search(start: GridIxT, height: f32, config: &SearchConfig) -> SearchState {
    let mut state = SearchState {
        explored: Explored::new(config.grid.shape),
        queue: PQueue::new_with_map(FakeHashMapForGrid::new(config.grid.shape)),
    };
    put_node(
        &mut state,
        Node {
            height,
            ix: GridIx::from_grid(start, config.grid.shape),
            reference: None,
            distance: 0.0,
            reachable: true,
            explored: false,
        },
    );

    while let Some(first) = state.queue.pop() {
        unsafe { state.explored.get_unchecked_mut(&first.key) }.explored = true;

        let neighbors = get_neighbor_indices(&first.key, &config.grid);
        for neighbor in neighbors {
            if !unsafe { state.explored.get_unchecked(&neighbor) }.explored {
                update_node(&neighbor, config, &mut state);
            }
        }
    }
    state
}

pub fn ref_paths_intersection<'a>(
    ix_1: &'a GridIx,
    ref_1: &'a Option<GridIx>,
    ix_2: &'a GridIx,
    ref_2: &'a Option<GridIx>,
) -> &'a Option<GridIx> {
    if ref_1 == ref_2 {
        return ref_1;
    }

    match (ref_1, ref_2) {
        (_, None) => return &None,
        (None, _) => return &None,
        (Some(a), Some(b)) => {
            if is_straight(&ix_1.pos, &a.pos) & is_in_line(&b.pos, &ix_1.pos, &a.pos) {
                return ref_2;
            }
            if is_straight(&ix_2.pos, &b.pos) & is_in_line(&a.pos, &ix_2.pos, &b.pos) {
                return ref_1;
            }
        }
    }
    &None
}

pub fn usize_f32(x: usize) -> f32 {
    f32::from(x as u16)
}

pub fn u16_f32(x: u16) -> f32 {
    f32::from(x)
}

pub fn f32_usize(x: f32) -> usize {
    usize::from(x.round() as u16)
}

pub fn is_line_intersecting(to: &Node, ix: &GridIx, config: &SearchConfig) -> bool {
    let effective_glide = get_effective_glide_ratio_from_to(&config.query, &ix.pos, &to.ix.pos);
    if f32::is_infinite(effective_glide.glide_ratio) {
        return true;
    }

    let length = l2_distance(&to.ix.pos, &ix.pos);

    let i_len = length.ceil() as usize;

    let x_indices = linspace(u16_f32(to.ix.pos.0), u16_f32(ix.pos.0), i_len);
    let y_indices = linspace(u16_f32(to.ix.pos.1), u16_f32(ix.pos.1), i_len);

    let distance = length * config.grid.cell_size;

    let real_heights = linspace(
        to.height,
        to.height - distance * effective_glide.glide_ratio,
        i_len,
    );

    if (config.query.safety_margin == 0.0) | (to.distance + distance <= config.query.start_distance)
    {
        for ((x_i, y_i), real_height) in zip(zip(x_indices, y_indices), real_heights) {
            let grid_height =
                *unsafe { config.grid.heights.uget([f32_usize(x_i), f32_usize(y_i)]) } as f32;
            if real_height < grid_height {
                return true;
            }
        }
    } else if (to.distance < config.query.start_distance)
        & (to.distance + distance > config.query.start_distance)
    {
        let mut cur_distance = to.distance;
        let distance_step = distance / (i_len - 1) as f32;

        for ((x_i, y_i), real_height) in zip(zip(x_indices, y_indices), real_heights) {
            let grid_height =
                *unsafe { config.grid.heights.uget([f32_usize(x_i), f32_usize(y_i)]) } as f32;
            let check_height = if cur_distance < config.query.start_distance {
                real_height
            } else {
                real_height - config.query.safety_margin
            };
            if check_height < grid_height {
                return true;
            }
            cur_distance += distance_step;
        }
    } else {
        for ((x_i, y_i), real_height) in zip(zip(x_indices, y_indices), real_heights) {
            let grid_height =
                *unsafe { config.grid.heights.uget([f32_usize(x_i), f32_usize(y_i)]) } as f32;
            if real_height - config.query.safety_margin < grid_height {
                return true;
            }
        }
    }
    false
}

fn reindex_node(
    node: &mut Node,
    lats: (GridIxType, GridIxType),
    lons: (GridIxType, GridIxType),
    grid_shape: (GridIxType, GridIxType),
) {
    node.ix = GridIx::from_grid((node.ix.pos.0 - lats.0, node.ix.pos.1 - lons.0), grid_shape);
    node.reference = node.reference.as_ref().map(|grid_ix| {
        GridIx::from_grid((grid_ix.pos.0 - lats.0, grid_ix.pos.1 - lons.0), grid_shape)
    });
}

pub fn reindex(
    explored: Explored,
    grid: &HeightGrid,
    start_ix: GridIxT,
) -> (Explored, HeightGrid, GridIxT) {
    let mut lat_min = GridIxType::MAX;
    let mut lat_max = GridIxType::MIN;
    let mut lon_min = GridIxType::MAX;
    let mut lon_max = GridIxType::MIN;

    for n in explored.iter() {
        if n.reachable {
            lat_min = min(lat_min, n.ix.pos.0);
            lat_max = max(lat_max, n.ix.pos.0);
            lon_min = min(lon_min, n.ix.pos.1);
            lon_max = max(lon_max, n.ix.pos.1);
        }
    }

    let new_explored = explored.subset((lat_min, lat_max), (lon_min, lon_max));

    let old_shape = grid.heights.shape();

    let new_start_ix = (start_ix.0 - lat_min, start_ix.1 - lon_min);

    let heights = grid
        .heights
        .slice(s![
            (lat_min as usize)..(lat_max as usize + 1),
            (lon_min as usize)..(lon_max as usize + 1)
        ])
        .to_owned();

    let new_grid = HeightGrid {
        shape: (
            heights.shape()[0] as GridIxType,
            heights.shape()[1] as GridIxType,
        ),
        heights: heights,
        cell_size: grid.cell_size,
        min_cell_size: grid.min_cell_size,
        latitudes: (
            grid.latitudes.0
                + (grid.latitudes.1 - grid.latitudes.0) / (old_shape[0] as f32) * (lat_min as f32),
            grid.latitudes.0
                + (grid.latitudes.1 - grid.latitudes.0) / (old_shape[0] as f32) * (lat_max as f32),
        ),
        longitudes: (
            grid.longitudes.0
                + (grid.longitudes.1 - grid.longitudes.0) / (old_shape[1] as f32)
                    * (lon_min as f32),
            grid.longitudes.0
                + (grid.longitudes.1 - grid.longitudes.0) / (old_shape[1] as f32)
                    * (lon_max as f32),
        ),
    };

    (new_explored, new_grid, new_start_ix)
}

pub struct SearchSetup {
    pub ground_height: f32,
    pub start_height: f32,
    pub start_ix: GridIxT,
    pub config: SearchConfig,
}

pub fn prepare_search(
    latitude: f32,
    longitude: f32,
    cell_size: f32,
    query: SearchQuery,
) -> SearchSetup {
    let mut height_at_point = get_height_at_point(latitude, longitude) as f32;
    let mut height = query
        .start_height
        .unwrap_or(height_at_point + query.additional_height)
        .max(height_at_point);

    let max_glide_ratio =
        query.glide_ratio / ((query.wind_speed + query.trim_speed) / (query.trim_speed));

    let max_distance = height / max_glide_ratio;

    let mut grid = get_height_data_around_point(latitude, longitude, Some(max_distance + 1.0));

    let mut cell_s = cell_size;
    if cell_size < grid.cell_size {
        cell_s = grid.cell_size;
    }

    grid = grid.scale(grid.cell_size / cell_s);

    let start_ix = (
        (grid.heights.shape()[0] / 2) as GridIxType,
        (grid.heights.shape()[1] / 2) as GridIxType,
    );
    height_at_point = grid.heights[[start_ix.0 as usize, start_ix.1 as usize]] as f32;
    height = query
        .start_height
        .unwrap_or(height_at_point + query.additional_height)
        .max(height_at_point);

    let config = SearchConfig { grid, query };

    SearchSetup {
        ground_height: height_at_point,
        start_height: height,
        start_ix,
        config,
    }
}

pub struct SearchResult {
    pub explored: Explored,
    pub height_grid: HeightGrid,
    pub ground_height: f32,
    pub start_ix: GridIxT,
}

pub fn search_from_point(
    latitude: f32,
    longitude: f32,
    cell_size: f32,
    query: SearchQuery,
) -> SearchResult {
    let search_setup = prepare_search(latitude, longitude, cell_size, query);

    let state = search(
        search_setup.start_ix,
        search_setup.start_height,
        &search_setup.config,
    );

    let (explored, new_grid, new_start_ix) = reindex(
        state.explored,
        &search_setup.config.grid,
        search_setup.start_ix,
    );

    SearchResult {
        explored,
        height_grid: new_grid,
        ground_height: search_setup.ground_height,
        start_ix: new_start_ix,
    }
}

#[cfg(test)]
#[path = "./search_test.rs"]
mod search_test;
