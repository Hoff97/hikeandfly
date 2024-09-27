import collections
from typing import Generic, TypeVar, NamedTuple

V = TypeVar("V")
K = TypeVar("K")


class HeapNode(NamedTuple, Generic[V, K]):
    priority: float
    item: V
    key: K


class PriorityQueue(Generic[V, K]):
    heap: list[HeapNode[V, K]]
    positions: dict[K, int]

    def __init__(self):
        self.heap = []
        self.positions = {}

    def __len__(self):
        return len(self.heap)

    def put(self, item: V, key: K, priority: float):
        self.heap.append(HeapNode(priority, item, key))
        self.positions[key] = len(self.heap) - 1

        _siftup(self.heap, len(self.heap) - 1, self.positions)

    def update(self, key: K, item: V, priority: float):
        position = self.positions[key]
        old_node = self.heap[position]

        self.heap[position] = HeapNode(priority, item, key)

        if old_node.priority > priority:
            _siftup(self.heap, position, self.positions)
        else:
            _siftdown(self.heap, position, self.positions)

    def update_if_less(self, item: V, key: K, priority: float):
        if self.contains(key):
            old_item = self.get(key)
            if old_item.priority > priority:
                self.update(key, item, priority)
        else:
            self.put(item, key, priority)

    def pop(self) -> HeapNode:
        head = self.heap[0]
        del self.positions[head.key]

        if len(self.heap) == 1:
            del self.heap[-1]
            return head

        self.heap[0] = self.heap[len(self.heap) - 1]
        self.positions[self.heap[0].key] = 0

        del self.heap[-1]

        _siftdown(self.heap, 0, self.positions)

        return head

    def contains(self, key: K):
        return key in self.positions

    def get(self, key: K) -> HeapNode:
        return self.heap[self.positions[key]]

    def all(self):
        x = []
        while len(self) > 0:
            x.append(self.pop())

        return x


def _siftup(heap: list[HeapNode[V, K]], pos: int, positions: dict[K, int]):
    newitem = heap[pos]
    key = newitem.key
    # Follow the path to the root, moving parents down until finding a place
    # newitem fits.
    while pos > 0:
        parentpos = (pos - 1) >> 1
        parent = heap[parentpos]
        parent_key = parent.key
        if newitem.priority < parent.priority:
            heap[pos] = parent
            positions[parent_key] = pos
            pos = parentpos
            continue
        break
    heap[pos] = newitem
    positions[key] = pos


def _siftdown(heap: list[HeapNode[V, K]], pos: int, positions: dict[K, int]):
    endpos = len(heap)
    newitem = heap[pos]
    # Bubble up the smaller child until hitting a leaf.
    childpos = 2 * pos + 1  # leftmost child position

    while childpos < endpos:
        # Set childpos to index of smaller child.
        rightpos = childpos + 1
        if rightpos < endpos and not heap[childpos].priority < heap[rightpos].priority:
            childpos = rightpos
        # Move the smaller child up.
        child = heap[childpos]

        if child.priority >= newitem.priority:
            break

        heap[pos] = heap[childpos]
        positions[child.key] = pos
        pos = childpos
        childpos = 2 * pos + 1

    heap[pos] = newitem
    positions[newitem.key] = pos


class FakePriorityQueue(Generic[V, K]):
    keys: collections.deque[K]
    items: dict[K, (float, V)]

    def __init__(self):
        self.keys = collections.deque()
        self.items = {}

    def __len__(self):
        return len(self.items)

    def put(self, item: V, key: K, priority: float):
        self.keys.append(key)
        self.items[key] = (priority, item)

    def update(self, key: K, item: V, priority: float):
        self.items[key] = (priority, item)

    def update_if_less(self, item: V, key: K, priority: float):
        if self.contains(key):
            old_item = self.get(key)
            if old_item.priority > priority:
                self.update(key, item, priority)
        else:
            self.put(item, key, priority)

    def pop(self) -> HeapNode:
        key = self.keys.popleft()
        priority, item = self.items[key]

        del self.items[key]

        return HeapNode(priority, item, key)

    def contains(self, key: K):
        return key in self.items

    def get(self, key: K) -> HeapNode:
        priority, item = self.items[key]
        return HeapNode(priority, item, key)

    def all(self):
        x = []
        while len(self) > 0:
            x.append(self.pop())

        return x
