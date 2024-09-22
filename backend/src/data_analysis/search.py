import logging
from typing import Final, NamedTuple, Optional
import numpy as np

from .height_data import (
    HeightGrid,
    get_height_at_point,
    get_height_data_around_point,
)
from .pqueue import PriorityQueue
import math

GridIndex = tuple[int, int]

_logger = logging.getLogger(__name__)


class Node(NamedTuple):
    height: float
    ix: GridIndex
    ref: Optional[GridIndex]
    distance: float
    reachable: bool
    effective_glide_ratio: float


class SearchState(NamedTuple):
    explored: dict[GridIndex, Node]
    queue: PriorityQueue[Node, GridIndex]
    intersection_checks: np.ndarray

    def put_node(self, node: Node):
        self.queue.update_if_less(node, node.ix, node.distance)


class EffectiveGlide(NamedTuple):
    speed: float
    glide_ratio: float


def get_effective_glide_ratio(
    effective_wind_angle: float,
    wind_speed: float,
    trim_speed: float,
    glide_ratio: float,
):
    side_wind = math.sin(effective_wind_angle) * wind_speed
    back_wind = math.cos(effective_wind_angle) * wind_speed

    rs = trim_speed * trim_speed - side_wind * side_wind
    if rs <= 0:
        return EffectiveGlide(0, math.inf)

    rest_speed = math.sqrt(rs)

    effective_speed = rest_speed + back_wind
    if effective_speed <= 0:
        return EffectiveGlide(0, math.inf)

    effective_glide_ratio = glide_ratio / (effective_speed / trim_speed)

    return EffectiveGlide(effective_speed, effective_glide_ratio)


class SearchQuery(NamedTuple):
    glide_ratio: float
    trim_speed: float
    wind_direction: float
    wind_speed: float
    additional_height: float


class SearchConfig(NamedTuple):
    grid: HeightGrid
    glide_ratio: float
    trim_speed: float
    wind_direction: float
    wind_speed: float


def get_neighbor_indices(ix: GridIndex, height_grid: np.ndarray) -> list[GridIndex]:
    x, y = ix
    neighbors_indices = [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    neighbors_indices = [
        (a, b)
        for (a, b) in neighbors_indices
        if a >= 0 and a < height_grid.shape[0] and b >= 0 and b < height_grid.shape[1]
    ]
    return neighbors_indices


def l2_distance(a: GridIndex, b: GridIndex):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def l2_diff(a: GridIndex, b: GridIndex):
    return (a[0] - b[0], a[1] - b[1])


_PI_2: Final = math.pi / 2


def get_effective_glide_ratio_from_to(
    config: SearchConfig, start: GridIndex, end: GridIndex
):
    if config.wind_speed == 0:
        return EffectiveGlide(config.trim_speed, config.glide_ratio)

    diff = l2_diff(end, start)
    angle = math.atan2(diff[0], diff[1])

    effective_wind_angle = (-config.wind_direction + _PI_2) - angle

    return get_effective_glide_ratio(
        effective_wind_angle, config.wind_speed, config.trim_speed, config.glide_ratio
    )


def is_straight(a: tuple[int, int]):
    return a[0] == 0 or a[1] == 0


def is_in_line(point: GridIndex, start: GridIndex, end: GridIndex):
    if point[0] == start[0] and point[0] == end[0]:
        return point[1] >= min(start[1], end[1]) and point[1] <= max(start[1], end[1])
    elif point[1] == start[1] and point[1] == end[1]:
        return point[0] >= min(start[0], end[0]) and point[0] <= max(start[0], end[0])


def get_straight_line_ref(
    ix: GridIndex, neighbor: Node, explored: dict[GridIndex, Node]
):
    while (neighbor.ref) != None:
        if is_straight(l2_diff(neighbor.ref, ix)):
            neighbor = explored[neighbor.ref]
        else:
            break
    return neighbor


def update_one_neighbor(
    neighbor: Node,
    ix: GridIndex,
    config: SearchConfig,
    state: SearchState,
    do_intersection_check=False,
):
    if not neighbor.reachable:
        return

    ref = neighbor
    if neighbor.ref is not None and (
        config.wind_speed >= config.trim_speed or do_intersection_check
    ):
        # TODO: We might only need to call this when
        # wind speed >= trim speed
        ref = state.explored[neighbor.ref]

        if state.queue.contains(ix) and state.queue.get(ix).item.ref == ref.ix:
            return

        intersecting, n_checks = is_line_intersecting(ref, ix, config)
        state.intersection_checks[ix[0], ix[1]] += n_checks
        if intersecting:
            ref = neighbor

    effective_glide = get_effective_glide_ratio_from_to(config, ix, ref.ix)
    distance = l2_distance(ix, ref.ix) * config.grid.cell_size
    height = ref.height - distance * effective_glide.glide_ratio
    if math.isinf(effective_glide.glide_ratio):
        # Not reachable
        return

    reachable = config.grid.heights[ix[0], ix[1]] < height

    state.put_node(
        Node(
            height,
            ix,
            # TODO: get_straight_line_ref + is_line_intersecting dont play well together
            # this causes a bug in some weird edge cases
            get_straight_line_ref(ix, ref, state.explored).ix,
            distance + ref.distance,
            reachable,
            effective_glide.glide_ratio,
        ),
    )


def ref_paths_intersection(
    ix_1: GridIndex, ref_1: GridIndex, ix_2: GridIndex, ref_2: GridIndex
):
    if ref_1 == ref_2:
        return ref_1
    if ref_1 is None or ref_2 is None:
        return None

    if is_straight(l2_diff(ix_1, ref_1)):
        if is_in_line(ref_2, ix_1, ref_1):
            return ref_2
    if is_straight(l2_diff(ix_2, ref_2)):
        if is_in_line(ref_1, ix_2, ref_2):
            return ref_1

    return None


def is_line_intersecting(to: Node, ix: GridIndex, config: SearchConfig):
    effective_glide = get_effective_glide_ratio_from_to(config, ix, to.ix)
    if math.isinf(effective_glide.glide_ratio):
        return True, 0

    length = l2_distance(to.ix, ix)

    i_len = math.ceil(length)
    x, y = np.linspace(ix[0], to.ix[0], i_len), np.linspace(ix[1], to.ix[1], i_len)

    heights = config.grid.heights[x.astype(int), y.astype(int)]

    real_heights = np.linspace(
        to.height - length * config.grid.cell_size * effective_glide.glide_ratio,
        to.height,
        i_len,
    )

    return np.any(real_heights < heights), i_len


def update_two_with_different_references(
    neighbor_1: Node,
    neighbor_2: Node,
    ix: GridIndex,
    config: SearchConfig,
    state: SearchState,
):
    update_one_neighbor(neighbor_1, ix, config, state, do_intersection_check=True)
    update_one_neighbor(neighbor_2, ix, config, state, do_intersection_check=True)


def update_two_neighbors(
    neighbor_1: Node,
    neighbor_2: Node,
    ix: GridIndex,
    config: SearchConfig,
    state: SearchState,
):
    if neighbor_1.reachable and neighbor_2.reachable:
        ref_path_intersection = ref_paths_intersection(
            neighbor_1.ix, neighbor_1.ref, neighbor_2.ix, neighbor_2.ref
        )
        if ref_path_intersection is not None:
            if (
                state.queue.contains(ix)
                and state.queue.get(ix).item.ref == ref_path_intersection
            ):
                return

            distance = l2_distance(ix, ref_path_intersection) * config.grid.cell_size

            effective_glide = get_effective_glide_ratio_from_to(
                config, ix, ref_path_intersection
            )

            if math.isinf(effective_glide.glide_ratio):
                return

            height = (
                state.explored[ref_path_intersection].height
                - distance * effective_glide.glide_ratio
            )

            reachable = config.grid.heights[ix[0], ix[1]] < height

            state.put_node(
                Node(
                    height,
                    ix,
                    ref_path_intersection,
                    distance + state.explored[ref_path_intersection].distance,
                    reachable,
                    effective_glide.glide_ratio,
                ),
            )
        else:
            update_two_with_different_references(
                neighbor_1, neighbor_2, ix, config, state
            )
    else:
        if neighbor_1.reachable or neighbor_2.reachable:
            neighbor = neighbor_1
            if neighbor_2.reachable:
                neighbor = neighbor_2

            update_one_neighbor(neighbor, ix, config, state)
        else:
            return


def update_three_neighbors(
    explored_neighbors: list[GridIndex],
    ix: GridIndex,
    config: SearchConfig,
    state: SearchState,
):
    reachable = [
        state.explored[n] for n in explored_neighbors if state.explored[n].reachable
    ]
    if len(reachable) == 0:
        return
    elif len(reachable) == 1:
        update_one_neighbor(reachable[0], ix, config, state)
    elif len(reachable) == 2:
        update_two_neighbors(reachable[0], reachable[1], ix, config, state)
    elif len(reachable) == 3:
        reference_set = list(set(n.ref for n in reachable))
        if len(reference_set) == 3:
            reachable.sort(key=lambda x: x.distance)
            # TODO: Figure out if we need to make all three calls
            update_one_neighbor(reachable[0], ix, config, state)
            update_one_neighbor(reachable[1], ix, config, state)
            update_one_neighbor(reachable[2], ix, config, state)
        elif len(reference_set) == 2:
            ref_1 = [r for r in reachable if r.ref == reference_set[0]]
            ref_2 = [r for r in reachable if r.ref == reference_set[1]]

            two_shared = ref_1
            one_shared = ref_2[0]
            if len(ref_1) == 1:
                two_shared = ref_2
                one_shared = ref_1[0]
            # TODO: Figure out if we need to make both calls
            update_two_neighbors(two_shared[0], two_shared[1], ix, config, state)
            update_one_neighbor(one_shared, ix, config, state)
        elif len(reference_set) == 1:
            # print("3 neighbors with one shared reference!")
            pass


def update_four_neighbors(
    explored_neighbors: list[GridIndex],
    ix: GridIndex,
    config: SearchConfig,
    state: SearchState,
):
    reachable = [
        state.explored[n] for n in explored_neighbors if state.explored[n].reachable
    ]
    if len(reachable) == 0:
        state.put_node(
            Node(0, ix, None, 0.0, False, 0),
        )
    elif len(reachable) < 4:
        update_three_neighbors(explored_neighbors, ix, config, state)
    elif len(reachable) == 4:
        reference_set = list(set(n.ref for n in reachable))
        if len(reference_set) == 4:
            reachable.sort(key=lambda x: x.height)
            update_one_neighbor(reachable[0], ix, config, state)
        elif len(reference_set) == 3:
            # print("4 with 1 shared reference")
            pass
        elif len(reference_set) == 2:
            # print("4 with 2 shared references each")
            pass
        else:
            # print("4 with all shared references each")
            pass


def update_node(
    ix: GridIndex,
    config: SearchConfig,
    state: SearchState,
):
    # TODO: Check if we already have the node with a
    # given reference in the queue
    neighbors = get_neighbor_indices(ix, config.grid.heights)
    explored_neighbors = [
        neighbor for neighbor in neighbors if neighbor in state.explored
    ]

    if len(explored_neighbors) == 1:
        neighbor = state.explored[explored_neighbors[0]]

        update_one_neighbor(neighbor, ix, config, state)
    elif len(explored_neighbors) == 2:
        neighbor_1 = state.explored[explored_neighbors[0]]
        neighbor_2 = state.explored[explored_neighbors[1]]

        update_two_neighbors(neighbor_1, neighbor_2, ix, config, state)
    elif len(explored_neighbors) == 3:
        update_three_neighbors(explored_neighbors, ix, config, state)
    elif len(explored_neighbors) == 4:
        update_four_neighbors(explored_neighbors, ix, config, state)


def search(start: GridIndex, height: float, config: SearchConfig):
    state = SearchState(
        {}, PriorityQueue(), np.zeros_like(config.grid.heights, dtype=np.int64)
    )
    state.put_node(Node(height, start, None, 0.0, True, config.glide_ratio))

    i = 0

    while len(state.queue) > 0:
        if i % 500 == 0:
            _logger.info(
                "Explored %d, queue size %d", len(state.explored), len(state.queue)
            )
        first = state.queue.pop()
        state.explored[first.key] = first.item

        neighbors = get_neighbor_indices(first.key, config.grid.heights)
        neighbors = [
            neighbor for neighbor in neighbors if neighbor not in state.explored
        ]

        for neighbor in neighbors:
            update_node(neighbor, config, state)

        i = i + 1

    return state


def reindex(state: SearchState, grid: HeightGrid):
    node_ixs = np.array(
        [grid_ix for grid_ix, node in state.explored.items() if node.reachable]
    )

    mins = [int(x) for x in np.min(node_ixs, axis=0)]
    maxs = [int(x) for x in np.max(node_ixs, axis=0)]

    new_explored = {
        (grid_ix[0] - mins[0], grid_ix[1] - mins[1]): Node(
            node.height,
            [node.ix[0] - mins[0], node.ix[1] - mins[1]],
            [node.ref[0] - mins[0], node.ref[1] - mins[1]]
            if node.ref is not None
            else None,
            node.distance,
            node.reachable,
            node.effective_glide_ratio,
        )
        for grid_ix, node in state.explored.items()
        if node.reachable
    }
    new_state = SearchState(
        new_explored,
        state.queue,
        state.intersection_checks[mins[0] : maxs[0] + 1, mins[1] : maxs[1] + 1],
    )

    old_shape = grid.heights.shape

    new_grid = HeightGrid(
        grid.heights[mins[0] : maxs[0] + 1, mins[1] : maxs[1] + 1],
        grid.cell_size,
        (
            grid.latitudes[0]
            + (grid.latitudes[1] - grid.latitudes[0]) / old_shape[0] * mins[0],
            grid.latitudes[0]
            + (grid.latitudes[1] - grid.latitudes[0]) / old_shape[0] * maxs[0],
        ),
        (
            grid.longitudes[0]
            + (grid.longitudes[1] - grid.longitudes[0]) / old_shape[1] * mins[1],
            grid.longitudes[0]
            + (grid.longitudes[1] - grid.longitudes[0]) / old_shape[1] * maxs[1],
        ),
    )

    return new_state, new_grid


def search_from_point(
    latitude: float,
    longitude: float,
    cell_size: float,
    query: SearchQuery,
):
    height = get_height_at_point(latitude, longitude) + query.additional_height

    max_glide_ratio = query.glide_ratio / (
        (query.wind_speed + query.trim_speed) / (query.trim_speed)
    )

    # This is technically not true for areas where the ground height is < 0,
    # but who goes paragliding there.
    max_distance = height / max_glide_ratio

    # TODO: We could be smart here and consider the wind direction
    grid = get_height_data_around_point(latitude, longitude, max_distance + 1)

    if cell_size < grid.cell_size:
        _logger.warning("Requested grid cell size too small")
        cell_size = grid.cell_size

    grid = grid.downsample(grid.cell_size / cell_size)

    start_ix = (grid.heights.shape[0] // 2, grid.heights.shape[0] // 2)

    state = search(
        start_ix,
        height,
        SearchConfig(
            grid,
            query.glide_ratio,
            query.trim_speed,
            query.wind_direction,
            query.wind_speed,
        ),
    )

    state, grid = reindex(state, grid)

    return state, grid


def path(ix: GridIndex, explored: dict[GridIndex, Node]):
    node = explored[ix]
    result = [node]
    while node.ref is not None:
        result.append(explored[node.ref])
        node = explored[node.ref]
    return result


def path_length(ix: GridIndex, explored: dict[GridIndex, Node]):
    pth = path(ix, explored)

    items = zip(pth, pth[1:])
    lens = [l2_distance(a.ix, b.ix) for a, b in items]
    return sum(lens)
