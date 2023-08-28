from typing import Generic, TypeVar, NamedTuple

T = TypeVar("T")
U = TypeVar("U")


class HeapNode(NamedTuple, Generic[T, U]):
    priority: float
    item: T
    key: U


class PriorityQueue(Generic[T, U]):
    heap: list[HeapNode[T, U]]
    positions: dict[U, int]

    def __init__(self):
        self.heap = []
        self.positions = {}

    def __len__(self):
        return len(self.heap)

    def put(self, item: T, key: U, priority: float):
        self.heap.append(HeapNode(priority, item, key))
        self.positions[key] = len(self.heap) - 1

        _siftup(self.heap, len(self.heap) - 1, self.positions)

    def update(self, key: U, item: T, priority: float):
        position = self.positions[key]
        old_node = self.heap[position]

        self.heap[position] = HeapNode(priority, item, key)

        if old_node.priority > priority:
            _siftup(self.heap, position, self.positions)
        else:
            _siftdown(self.heap, position, self.positions)

    def update_if_less(self, item: T, key: U, priority: float):
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

    def contains(self, key: U):
        return key in self.positions

    def get(self, key: U):
        return self.heap[self.positions[key]]

    def all(self):
        x = []
        while len(self) > 0:
            x.append(self.pop())

        return x


def _siftup(heap: list[HeapNode[T, U]], pos: int, positions: dict[U, int]):
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


def _siftdown(heap: list[HeapNode[T, U]], pos: int, positions: dict[U, int]):
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
