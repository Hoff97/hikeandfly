import logging
from typing import NamedTuple, Optional
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


class SearchState(NamedTuple):
    explored: dict[GridIndex, Node]
    queue: PriorityQueue[Node, GridIndex]
    intersection_checks: np.ndarray


class SearchConfig(NamedTuple):
    grid: HeightGrid
    glide_ratio: float


def get_neighbor_indices(ix: GridIndex, height_grid: np.ndarray) -> list[GridIndex]:
    x, y = ix
    neighbors_indices = [
        (x + o_x, y + o_y) for o_x, o_y in [(1, 0), (-1, 0), (0, 1), (0, -1)]
    ]
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
):
    if not neighbor.reachable:
        return
    distance = (neighbor.distance + config.grid.cell_size)
    height = neighbor.height - config.glide_ratio * config.grid.cell_size

    reachable = config.grid.heights[ix[0], ix[1]] < height

    state.queue.update_if_less(
        Node(
            height,
            ix,
            get_straight_line_ref(ix, neighbor, state.explored).ix,
            distance,
            reachable,
        ),
        ix,
        -height,
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
    length = l2_distance(to.ix, ix)

    i_len = math.ceil(length)
    x, y = np.linspace(ix[0], to.ix[0], i_len), np.linspace(ix[1], to.ix[1], i_len)

    heights = config.grid.heights[x.astype(int), y.astype(int)]
    real_heights = np.linspace(
        to.height - length * config.grid.cell_size * config.glide_ratio,
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
    ref_1 = state.explored[neighbor_1.ref]
    r1_intersecting, n_checks = is_line_intersecting(
        state.explored[neighbor_1.ref], ix, config
    )
    state.intersection_checks[ix[0], ix[1]] += n_checks
    if r1_intersecting:
        ref_1 = neighbor_1

    ref_2 = state.explored[neighbor_2.ref]
    r2_intersecting, n_checks = is_line_intersecting(
        state.explored[neighbor_2.ref], ix, config
    )
    state.intersection_checks[ix[0], ix[1]] += n_checks
    if r2_intersecting:
        ref_2 = neighbor_2

    distance_1 = l2_distance(ix, ref_1.ix) * config.grid.cell_size
    height_1 = ref_1.height - distance_1 * config.glide_ratio

    distance_2 = l2_distance(ix, ref_2.ix) * config.grid.cell_size
    height_2 = ref_2.height - distance_2 * config.glide_ratio

    ref = ref_1
    height = height_1
    distance = distance_1
    if height_2 > height_1:
        ref = ref_2
        height = height_2
        distance = distance_2
    reachable = config.grid.heights[ix[0], ix[1]] < height

    state.queue.update_if_less(
        Node(
            height,
            ix,
            ref.ix,
            distance + ref.distance,
            reachable,
        ),
        ix,
        -height,
    )


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
            distance = l2_distance(ix, ref_path_intersection) * config.grid.cell_size
            height = (
                state.explored[ref_path_intersection].height
                - distance * config.glide_ratio
            )

            reachable = config.grid.heights[ix[0], ix[1]] < height

            state.queue.update_if_less(
                Node(
                    height,
                    ix,
                    ref_path_intersection,
                    distance + state.explored[ref_path_intersection].distance,
                    reachable,
                ),
                ix,
                -height,
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
            reachable.sort(key=lambda x: x.height)
            update_one_neighbor(reachable[0], ix, config, state)
        elif len(reference_set) == 2:
            ref_1 = [r for r in reachable if r.ref == reference_set[0]]
            ref_2 = [r for r in reachable if r.ref == reference_set[1]]

            two_shared = ref_1
            one_shared = ref_2[0]
            if len(ref_1) == 1:
                two_shared = ref_2
                one_shared = ref_1[0]
            if max(two_shared[0].height, two_shared[1].height) > one_shared.height:
                update_two_neighbors(two_shared[0], two_shared[1], ix, config, state)
            else:
                update_one_neighbor(one_shared, ix, config, state)
        elif len(reference_set) == 1:
            print("3 neighbors with one shared reference!")


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
        state.queue.update_if_less(
            Node(
                0,
                ix,
                None,
                0.0,
                False,
            ),
            ix,
            -0.0,
        )
    elif len(reachable) < 4:
        update_three_neighbors(explored_neighbors, ix, config, state)
    elif len(reachable) == 4:
        reference_set = list(set(n.ref for n in reachable))
        if len(reference_set) == 4:
            reachable.sort(key=lambda x: x.height)
            update_one_neighbor(reachable[0], ix, config, state)
        elif len(reference_set) == 3:
            print("4 with 1 shared reference")
        elif len(reference_set) == 2:
            print("4 with 2 shared references each")
        else:
            print("4 with all shared references each")


def update_node(
    ix: GridIndex,
    config: SearchConfig,
    state: SearchState,
):
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
    state.queue.put(Node(height, start, None, 0.0, True), start, -height)

    i = 0

    while len(state.queue) > 0:
        if i % 500 == 0:
            _logger.info("Explored %d, queue size %d",len(state.explored), len(state.queue))
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


def search_from_point(
    latitude: float,
    longitude: float,
    cell_size: float,
    glide_ratio: float,
    additional_height: float = 10.0,
):
    height = get_height_at_point(latitude, longitude) + additional_height

    # This is technically not true for areas where the ground height is < 0,
    # but who goes paragliding there.
    max_distance = height/glide_ratio

    grid = get_height_data_around_point(latitude, longitude, max_distance+1)

    if cell_size < grid.cell_size:
        _logger.warn("Requested grid cell size too small")

    grid = grid.downsample(grid.cell_size / cell_size)

    start_ix = (grid.heights.shape[0] // 2, grid.heights.shape[0] // 2)

    state = search(start_ix, height, SearchConfig(grid, glide_ratio))

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
