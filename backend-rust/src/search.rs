use std::{
    cmp::{max, min},
    collections::HashSet,
    iter::zip,
    usize,
};

use ndarray::{linspace, s};

use crate::{
    height_data::{get_height_at_point, get_height_data_around_point, HeightGrid},
    line::Line,
    pqueue::{MapLike, PriorityQueue},
};

pub type GridIxType = u16;
pub type GridIx = (GridIxType, GridIxType);

#[derive(Clone)]
pub struct Node {
    pub height: f32,
    pub ix: GridIx,
    pub reference: Option<GridIx>,
    pub distance: f32,
    pub reachable: bool,
    pub effective_glide_ratio: f32,
}

pub struct GridMap {
    pub values: Vec<Option<Node>>,
    grid_shape: (usize, usize),
}

pub struct GridMapIter<'a> {
    gridmap: &'a GridMap,
    ix: usize,
}

impl<'a> Iterator for GridMapIter<'a> {
    type Item = &'a Node;

    fn next(&mut self) -> Option<Self::Item> {
        while self.ix < self.gridmap.values.len() && self.gridmap.values[self.ix].is_none() {
            self.ix += 1;
        }
        if self.ix >= self.gridmap.values.len() {
            return None;
        }
        self.gridmap.values.get(self.ix).unwrap().as_ref()
    }
}

impl GridMap {
    fn new(grid_shape: (usize, usize)) -> GridMap {
        GridMap {
            values: vec![None; grid_shape.0 * grid_shape.1],
            grid_shape: grid_shape,
        }
    }

    fn get(&self, index: &GridIx) -> Option<&Node> {
        let v = &self.values[index.0 as usize * self.grid_shape.1 + index.1 as usize];
        if v.is_none() {
            return None;
        }
        v.as_ref()
    }

    fn contains_key(&self, index: &GridIx) -> bool {
        self.values[index.0 as usize * self.grid_shape.1 + index.1 as usize].is_some()
    }

    fn insert(&mut self, index: GridIx, value: Node) {
        self.values[index.0 as usize * self.grid_shape.1 + index.1 as usize] = Some(value)
    }

    fn subset(&self, lat: GridIx, lon: GridIx) -> GridMap {
        let mut result = GridMap::new(((lat.1 - lat.0 + 1) as usize, (lon.1 - lon.0 + 1) as usize));
        for node in &self.values {
            if node.is_some() {
                let n = node.as_ref().unwrap();
                if n.ix.0 >= lat.0 && n.ix.0 <= lat.1 && n.ix.1 >= lon.0 && n.ix.1 <= lon.1 {
                    let new_lat = n.ix.0 - lat.0;
                    let new_lon = n.ix.1 - lon.0;
                    result.insert((new_lat, new_lon), reindex_node(&n, lat, lon));
                }
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
}

//pub type Explored = HashMap<GridIx, Node>;
pub type Explored = GridMap;

pub type FakeHashMapPos = u16;

pub struct FakeHashMapForGrid {
    positions: Vec<FakeHashMapPos>,
    grid_shape: (usize, usize),
}

impl FakeHashMapForGrid {
    pub fn new(grid_shape: (usize, usize)) -> FakeHashMapForGrid {
        FakeHashMapForGrid {
            grid_shape: grid_shape,
            positions: vec![FakeHashMapPos::MAX; grid_shape.0 * grid_shape.1],
        }
    }
}

impl MapLike<GridIx, usize> for FakeHashMapForGrid {
    fn insert(&mut self, key: GridIx, value: usize) {
        self.positions[key.0 as usize * self.grid_shape.0 + key.1 as usize] = value as u16;
    }

    fn get(&self, key: &GridIx) -> Option<usize> {
        let v = self.positions[key.0 as usize * self.grid_shape.0 + key.1 as usize];
        if v == FakeHashMapPos::MAX {
            return None;
        }
        Some(v as usize)
    }

    fn remove_entry(&mut self, key: &GridIx) {
        self.positions[key.0 as usize * self.grid_shape.0 + key.1 as usize] = FakeHashMapPos::MAX;
    }

    fn contains_key(&self, key: &GridIx) -> bool {
        self.positions[key.0 as usize * self.grid_shape.0 + key.1 as usize] != FakeHashMapPos::MAX
    }

    fn set(&mut self, key: GridIx, value: usize) {
        self.positions[key.0 as usize * self.grid_shape.0 + key.1 as usize] = value as u16;
    }
}

pub type PQueue = PriorityQueue<f32, Node, GridIx, FakeHashMapForGrid>;

pub struct SearchState {
    pub explored: Explored,
    pub queue: PQueue,
}

pub fn put_node(queue: &mut PQueue, node: Node) {
    if queue.contains_key(&node.ix) {
        let item = queue.update_priority_if_less(node.ix, node.distance);
        if item.is_some() {
            item.unwrap().item = node;
        }
    } else {
        let prio = node.distance;
        queue.push(node.ix, node, prio);
    }
}

impl SearchState {
    pub fn put_node(&mut self, node: Node) {
        if self.queue.contains_key(&node.ix) {
            let item = self
                .queue
                .update_priority_if_less(node.ix, node.distance)
                .unwrap();
            item.item = node;
        } else {
            let prio = node.distance;
            self.queue.push(node.ix, node, prio);
        }
    }
}

struct EffectiveGlide {
    speed: f32,
    glide_ratio: f32,
}

fn get_effective_glide_ratio(
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

    return EffectiveGlide {
        speed: effective_speed,
        glide_ratio: effective_glide_ratio,
    };
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
        return self.query.safety_margin;
    }
}

pub fn get_neighbor_indices(ix: GridIx, height_grid: &HeightGrid) -> Vec<GridIx> {
    let mut result = Vec::with_capacity(4);

    if ix.0 > 0 {
        result.push((ix.0 - 1, ix.1));
    }
    if ix.1 > 0 {
        result.push((ix.0, ix.1 - 1));
    }
    if ix.0 < (height_grid.heights.shape()[0] - 1) as GridIxType {
        result.push((ix.0 + 1, ix.1));
    }
    if ix.1 < (height_grid.heights.shape()[1] - 1) as GridIxType {
        result.push((ix.0, ix.1 + 1));
    }

    return result;
}

pub fn l2_distance(a: GridIx, b: GridIx) -> f32 {
    let ax = a.0 as f32;
    let ay = a.1 as f32;
    let bx = b.0 as f32;
    let by = b.1 as f32;

    ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt()
}

pub fn l2_diff(a: GridIx, b: GridIx) -> (i32, i32) {
    (a.0 as i32 - b.0 as i32, a.1 as i32 - b.1 as i32)
}

const PI: f32 = 3.14159265359;
const PI_2: f32 = PI / 2.0;

fn get_effective_glide_ratio_from_to(
    query: &SearchQuery,
    start: GridIx,
    end: GridIx,
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

    return get_effective_glide_ratio(
        effective_wind_angle,
        query.wind_speed,
        query.trim_speed,
        query.glide_ratio,
    );
}

pub fn is_straight(a: (i32, i32)) -> bool {
    a.0 == 0 || a.1 == 0
}

pub fn is_in_line(point: GridIx, start: GridIx, end: GridIx) -> bool {
    if point.0 == start.0 && point.0 == end.0 {
        return point.1 >= min(start.1, end.1) && point.1 <= max(start.1, end.1);
    } else if point.1 == start.1 && point.1 == end.1 {
        return point.0 >= min(start.0, end.0) && point.0 <= max(start.0, end.0);
    }
    false
}

fn get_straight_line_ref<'a>(ix: GridIx, neighbor: &'a Node, explored: &'a Explored) -> &'a Node {
    let mut n = neighbor;
    while n.reference.is_some() {
        if is_straight(l2_diff(n.reference.unwrap(), ix)) {
            n = explored.get(&n.reference.unwrap()).unwrap()
        } else {
            break;
        }
    }
    return n;
}

pub fn update_one_neighbor(
    neighbor: &Node,
    ix: GridIx,
    config: &SearchConfig,
    explored: &Explored,
    queue: &mut PQueue,
    do_intersection_check_opt: Option<bool>,
) {
    let do_intersection_check = do_intersection_check_opt.unwrap_or(false);

    if !neighbor.reachable {
        return;
    }

    let mut reference = neighbor;
    if neighbor.reference.is_some()
        && (config.query.wind_speed >= config.query.trim_speed || do_intersection_check)
    {
        reference = explored.get(&neighbor.reference.unwrap()).unwrap();

        if queue.contains_key(&ix) {
            let a = &queue.get(&ix).unwrap().item;
            if a.reference.is_some() && a.reference.unwrap() == reference.ix {
                return;
            }
        }

        if is_line_intersecting(reference, ix, config) {
            reference = neighbor;
        }
    }

    let effective_glide = get_effective_glide_ratio_from_to(&config.query, ix, reference.ix);
    let distance = l2_distance(ix, reference.ix) * config.grid.cell_size;
    let height = reference.height - distance * effective_glide.glide_ratio;

    if f32::is_infinite(effective_glide.glide_ratio) {
        return;
    }

    let total_distance = distance + reference.distance;

    let reachable = config.grid.heights[[ix.0 as usize, ix.1 as usize]] as f32
        + config.get_safety_margin_at_distance(total_distance)
        < height;

    put_node(
        queue,
        Node {
            height: height,
            ix: ix,
            reference: Some(get_straight_line_ref(ix, reference, &explored).ix),
            distance: total_distance,
            reachable: reachable,
            effective_glide_ratio: effective_glide.glide_ratio,
        },
    )
}

pub fn update_two_with_different_references(
    neighbor_1: &Node,
    neighbor_2: &Node,
    ix: GridIx,
    config: &SearchConfig,
    explored: &Explored,
    queue: &mut PQueue,
) {
    update_one_neighbor(neighbor_1, ix, config, explored, queue, Some(true));
    update_one_neighbor(neighbor_2, ix, config, explored, queue, Some(true));
}

pub fn update_two_neighbors(
    neighbor_1: &Node,
    neighbor_2: &Node,
    ix: GridIx,
    config: &SearchConfig,
    explored: &Explored,
    queue: &mut PQueue,
) {
    if neighbor_1.reachable && neighbor_2.reachable {
        let ref_path_intersection = ref_paths_intersection(
            neighbor_1.ix,
            neighbor_1.reference,
            neighbor_2.ix,
            neighbor_2.reference,
        );
        if ref_path_intersection.is_some() {
            if queue.contains_key(&ix)
                && queue.get(&ix).unwrap().item.reference == ref_path_intersection
            {
                return;
            }

            let distance = l2_distance(ix, ref_path_intersection.unwrap()) * config.grid.cell_size;

            let effective_glide = get_effective_glide_ratio_from_to(
                &config.query,
                ix,
                ref_path_intersection.unwrap(),
            );

            if f32::is_infinite(effective_glide.glide_ratio) {
                return;
            }

            let height = explored
                .get(&ref_path_intersection.unwrap())
                .unwrap()
                .height
                - distance * effective_glide.glide_ratio;

            let total_distance = distance
                + explored
                    .get(&ref_path_intersection.unwrap())
                    .unwrap()
                    .distance;

            let reachable = config.grid.heights[[ix.0 as usize, ix.1 as usize]] as f32
                + config.get_safety_margin_at_distance(total_distance)
                < height;

            put_node(
                queue,
                Node {
                    height: height,
                    ix: ix,
                    reference: ref_path_intersection,
                    distance: total_distance,
                    reachable: reachable,
                    effective_glide_ratio: effective_glide.glide_ratio,
                },
            )
        } else {
            update_two_with_different_references(
                neighbor_1, neighbor_2, ix, config, explored, queue,
            );
        }
    } else if neighbor_1.reachable {
        update_one_neighbor(neighbor_1, ix, config, explored, queue, None);
    } else if neighbor_2.reachable {
        update_one_neighbor(neighbor_2, ix, config, explored, queue, None);
    }
}

pub fn update_three_neighbors(
    explored_neighbors: Vec<GridIx>,
    ix: GridIx,
    config: &SearchConfig,
    explored: &Explored,
    queue: &mut PQueue,
) {
    let mut reachable = Vec::from_iter(
        explored_neighbors
            .iter()
            .filter(|x| explored.get(x).unwrap().reachable)
            .map(|x| explored.get(x).unwrap()),
    );

    if reachable.len() == 0 {
        return;
    } else if reachable.len() == 1 {
        update_one_neighbor(&reachable[0], ix, config, explored, queue, None);
    } else if reachable.len() == 2 {
        update_two_neighbors(&reachable[0], &reachable[1], ix, config, explored, queue);
    } else if reachable.len() == 3 {
        let reference_set =
            HashSet::<Option<GridIx>>::from_iter(reachable.iter().map(|x| x.reference));
        if reference_set.len() == 3 {
            reachable.sort_by(|x, y| x.distance.partial_cmp(&y.distance).unwrap()); // TODO: Sort needed

            update_one_neighbor(&reachable[0], ix, config, explored, queue, None);
            update_one_neighbor(&reachable[1], ix, config, explored, queue, None);
            update_one_neighbor(&reachable[2], ix, config, explored, queue, None);
        } else if reference_set.len() == 2 {
            if reachable[0].reference == reachable[1].reference {
                update_two_neighbors(&reachable[0], &reachable[1], ix, config, explored, queue);
                update_one_neighbor(&reachable[2], ix, config, explored, queue, None);
            } else if reachable[0].reference == reachable[2].reference {
                update_two_neighbors(&reachable[0], &reachable[2], ix, config, explored, queue);
                update_one_neighbor(&reachable[1], ix, config, explored, queue, None);
            } else {
                update_two_neighbors(&reachable[1], &reachable[2], ix, config, explored, queue);
                update_one_neighbor(&reachable[0], ix, config, explored, queue, None);
            }
        }
    }
}

pub fn update_four_neighbors(
    explored_neighbors: Vec<GridIx>,
    ix: GridIx,
    config: &SearchConfig,
    explored: &Explored,
    queue: &mut PQueue,
) {
    let mut reachable = Vec::from_iter(
        explored_neighbors
            .iter()
            .filter(|x| explored.get(x).unwrap().reachable)
            .map(|x| explored.get(x).unwrap()),
    );
    if reachable.len() == 0 {
        put_node(
            queue,
            Node {
                height: 0.0,
                ix: ix,
                reference: None,
                distance: 0.0,
                reachable: false,
                effective_glide_ratio: 0.0,
            },
        );
    } else if reachable.len() < 4 {
        update_three_neighbors(explored_neighbors, ix, config, explored, queue);
    } else if reachable.len() == 4 {
        let reference_set =
            HashSet::<Option<GridIx>>::from_iter(reachable.iter().map(|x| x.reference));
        if reference_set.len() == 4 {
            reachable.sort_by(|x, y| x.distance.partial_cmp(&y.distance).unwrap());
            update_one_neighbor(reachable[0], ix, config, explored, queue, None);
        }
    }
}

pub fn update_node(ix: GridIx, config: &SearchConfig, state: &mut SearchState) {
    let neighbors = get_neighbor_indices(ix, &config.grid);
    let explored_neighbors: Vec<GridIx> = neighbors
        .into_iter()
        .filter(|x| state.explored.contains_key(x))
        .collect();

    if explored_neighbors.len() == 1 {
        let neighbor = &state.explored.get(&explored_neighbors[0]).unwrap();

        update_one_neighbor(
            neighbor,
            ix,
            config,
            &state.explored,
            &mut state.queue,
            None,
        );
    } else if explored_neighbors.len() == 2 {
        let neighbor_1 = &state.explored.get(&explored_neighbors[0]).unwrap();
        let neighbor_2 = &state.explored.get(&explored_neighbors[1]).unwrap();

        update_two_neighbors(
            neighbor_1,
            neighbor_2,
            ix,
            config,
            &state.explored,
            &mut state.queue,
        )
    } else if explored_neighbors.len() == 3 {
        update_three_neighbors(
            explored_neighbors,
            ix,
            config,
            &state.explored,
            &mut state.queue,
        )
    } else if explored_neighbors.len() == 4 {
        update_four_neighbors(
            explored_neighbors,
            ix,
            config,
            &state.explored,
            &mut state.queue,
        )
    }
}

pub fn search(start: GridIx, height: f32, config: &SearchConfig) -> SearchState {
    let grid_shape = config.grid.heights.shape();
    let mut state = SearchState {
        explored: Explored::new((grid_shape[0], grid_shape[1])),
        queue: PQueue::new_with_map(FakeHashMapForGrid::new((grid_shape[0], grid_shape[1]))),
    };
    state.put_node(Node {
        height: height,
        ix: start,
        reference: None,
        distance: 0.0,
        reachable: true,
        effective_glide_ratio: config.query.glide_ratio,
    });

    while state.queue.len() > 0 {
        let first = state.queue.pop().unwrap();
        state.explored.insert(first.key, first.item);

        let neighbors = get_neighbor_indices(first.key, &config.grid);
        for neighbor in neighbors {
            if !state.explored.contains_key(&neighbor) {
                update_node(neighbor, &config, &mut state);
            }
        }
    }
    return state;
}

pub fn ref_paths_intersection(
    ix_1: GridIx,
    ref_1: Option<GridIx>,
    ix_2: GridIx,
    ref_2: Option<GridIx>,
) -> Option<GridIx> {
    if ref_1 == ref_2 {
        return ref_1;
    }
    if ref_1.is_none() || ref_2.is_none() {
        return None;
    }

    if is_straight(l2_diff(ix_1, ref_1.unwrap())) {
        if is_in_line(ref_2.unwrap(), ix_1, ref_1.unwrap()) {
            return ref_2;
        }
    }
    if is_straight(l2_diff(ix_2, ref_2.unwrap())) {
        if is_in_line(ref_1.unwrap(), ix_2, ref_2.unwrap()) {
            return ref_1;
        }
    }

    return None;
}

pub fn usize_f32(x: usize) -> f32 {
    f32::from(x as u16)
}

pub fn u16_f32(x: u16) -> f32 {
    f32::from(x)
}

pub fn f32_usize(x: f32) -> usize {
    usize::from(x as u16)
}

pub fn is_line_intersecting_smart(to: &Node, ix: GridIx, config: &SearchConfig) -> bool {
    let effective_glide = get_effective_glide_ratio_from_to(&config.query, ix, to.ix);
    if f32::is_infinite(effective_glide.glide_ratio) {
        return true;
    }

    let length = l2_distance(to.ix, ix);

    let grid_indices = Line::new((to.ix.0 as i16, to.ix.1 as i16), (ix.0 as i16, ix.1 as i16));

    let distance = length * config.grid.cell_size;
    let height_loss = distance * effective_glide.glide_ratio;
    let final_height = to.height - height_loss;

    let mut real_height = if grid_indices.iterator_reversed() {
        final_height
    } else {
        to.height
    };
    let height_step = if grid_indices.iterator_reversed() {
        height_loss / (grid_indices.num_pixels() - 1) as f32
    } else {
        -height_loss / (grid_indices.num_pixels() - 1) as f32
    };

    if config.query.safety_margin == 0.0 || to.distance + distance <= config.query.start_distance {
        for (x_i, y_i) in grid_indices.iter() {
            if real_height < config.grid.heights[(x_i as usize, y_i as usize)] as f32 {
                return true;
            }
            real_height += height_step;
        }
    } else if to.distance < config.query.start_distance
        && to.distance + distance > config.query.start_distance
    {
        // TODO
    } else {
        // TODO
    }
    return false;
}

pub fn is_line_intersecting(to: &Node, ix: GridIx, config: &SearchConfig) -> bool {
    let effective_glide = get_effective_glide_ratio_from_to(&config.query, ix, to.ix);
    if f32::is_infinite(effective_glide.glide_ratio) {
        return true;
    }

    let length = l2_distance(to.ix, ix);

    let i_len = length.ceil() as usize;

    let x_indices = linspace(u16_f32(to.ix.0), u16_f32(ix.0), i_len);
    let y_indices = linspace(u16_f32(to.ix.1), u16_f32(ix.1), i_len);

    let distance = length * config.grid.cell_size;

    let real_heights = linspace(
        to.height,
        to.height - distance * effective_glide.glide_ratio,
        i_len,
    );

    if config.query.safety_margin == 0.0 || to.distance + distance <= config.query.start_distance {
        for ((x_i, y_i), real_height) in zip(zip(x_indices, y_indices), real_heights) {
            if real_height < config.grid.heights[[f32_usize(x_i), f32_usize(y_i)]] as f32 {
                return true;
            }
        }
    } else if to.distance < config.query.start_distance
        && to.distance + distance > config.query.start_distance
    {
        let mut cur_distance = to.distance;
        let distance_step = distance / (i_len - 1) as f32;

        for ((x_i, y_i), real_height) in zip(zip(x_indices, y_indices), real_heights) {
            let check_height = if cur_distance < config.query.start_distance {
                real_height
            } else {
                real_height - config.query.safety_margin
            };
            if check_height < config.grid.heights[[f32_usize(x_i), f32_usize(y_i)]] as f32 {
                return true;
            }
            cur_distance += distance_step;
        }
    } else {
        for ((x_i, y_i), real_height) in zip(zip(x_indices, y_indices), real_heights) {
            if real_height - config.query.safety_margin
                < config.grid.heights[[f32_usize(x_i), f32_usize(y_i)]] as f32
            {
                return true;
            }
        }
    }
    return false;
}

fn reindex_node(
    node: &Node,
    lats: (GridIxType, GridIxType),
    lons: (GridIxType, GridIxType),
) -> Node {
    // TODO: Update instead of copy?
    Node {
        ix: (node.ix.0 - lats.0, node.ix.1 - lons.0),
        reference: match node.reference {
            Some((x, y)) => Some((x - lats.0, y - lons.0)),
            None => None,
        },
        height: node.height,
        distance: node.distance,
        reachable: node.reachable,
        effective_glide_ratio: node.effective_glide_ratio,
    }
}

pub fn reindex(
    explored: Explored,
    grid: &HeightGrid,
    start_ix: GridIx,
) -> (Explored, HeightGrid, GridIx) {
    let mut lat_min = GridIxType::MAX;
    let mut lat_max = GridIxType::MIN;
    let mut lon_min = GridIxType::MAX;
    let mut lon_max = GridIxType::MIN;

    for node in explored.values.iter() {
        if node.is_some() {
            let n = node.as_ref().unwrap();
            if n.reachable {
                lat_min = min(lat_min, n.ix.0);
                lat_max = max(lat_max, n.ix.0);
                lon_min = min(lon_min, n.ix.1);
                lon_max = max(lon_max, n.ix.1);
            }
        }
    }

    let new_explored = explored.subset((lat_min, lat_max), (lon_min, lon_max));

    let old_shape = grid.heights.shape();

    let new_start_ix = (start_ix.0 - lat_min, start_ix.1 - lon_min);

    let new_grid = HeightGrid {
        heights: grid
            .heights
            .slice(s![
                (lat_min as usize)..(lat_max as usize + 1),
                (lon_min as usize)..(lon_max as usize + 1)
            ])
            .to_owned(),
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

    return (new_explored, new_grid, new_start_ix);
}

pub struct SearchSetup {
    pub ground_height: f32,
    pub start_height: f32,
    pub start_ix: GridIx,
    pub config: SearchConfig,
}

pub fn prepare_search(
    latitude: f32,
    longitude: f32,
    cell_size: f32,
    query: SearchQuery,
) -> SearchSetup {
    let height_at_point = get_height_at_point(latitude, longitude) as f32;
    let height = query
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

    let config = SearchConfig {
        grid: grid,
        query: query,
    };

    SearchSetup {
        ground_height: height_at_point,
        start_height: height,
        start_ix: start_ix,
        config: config,
    }
}

pub struct SearchResult {
    pub explored: Explored,
    pub height_grid: HeightGrid,
    pub ground_height: f32,
    pub start_ix: GridIx,
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
        explored: explored,
        height_grid: new_grid,
        ground_height: search_setup.ground_height,
        start_ix: new_start_ix,
    }
}

#[cfg(test)]
#[path = "./search_test.rs"]
mod search_test;
