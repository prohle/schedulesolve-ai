"""Rooms as a weighted graph: features on the nodes, walk minutes on the edges.

The solver reasons about rooms through constraints (capacity, type, equipment,
walk gaps). This module exposes the same data in the shape a graph algorithm
wants:

* **node** — one room, carrying `capacity`, `room_type`, `equipment` and the
  building it sits in;
* **edge** — the walk minutes between two rooms: `0` inside a building (a
  corridor is not a campus crossing), the building-to-building walk time
  otherwise, taken from `scenario.distances`.

It is deliberately not part of the solve: the solver already enforces C24
(capacity), C25 (type), C34 (equipment) and C32 (walk gap). The graph is for
clustering, warm-start hints and the occupancy views — places where "which
rooms are near each other and how big are they" is the question.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.scenario import Scenario


@dataclass(frozen=True)
class RoomNode:
    id: str
    name: str
    building_id: str
    capacity: int
    room_type: str
    equipment: tuple[str, ...]


@dataclass(frozen=True)
class RoomEdge:
    source: str
    target: str
    minutes: int


@dataclass(frozen=True)
class RoomGraph:
    nodes: list[RoomNode]
    edges: list[RoomEdge]

    def node(self, room_id: str) -> RoomNode:
        return next(node for node in self.nodes if node.id == room_id)

    def neighbours(self, room_id: str) -> list[RoomEdge]:
        return [edge for edge in self.edges if edge.source == room_id]

    def adjacency(self) -> dict[str, dict[str, int]]:
        table: dict[str, dict[str, int]] = {
            node.id: {node.id: 0} for node in self.nodes
        }
        for edge in self.edges:
            table[edge.source][edge.target] = edge.minutes
        return table

    @property
    def total_seats(self) -> int:
        return sum(node.capacity for node in self.nodes)

    @property
    def buildings(self) -> list[str]:
        return sorted({node.building_id for node in self.nodes})


def build_room_graph(scenario: Scenario) -> RoomGraph:
    """Every room as a node, every pair as an edge weighted by walk minutes."""
    nodes = [
        RoomNode(
            id=room.id,
            name=room.name,
            building_id=room.building_id,
            capacity=room.capacity,
            room_type=room.room_type,
            equipment=tuple(room.equipment),
        )
        for room in scenario.rooms
    ]

    edges: list[RoomEdge] = []
    for i, left in enumerate(nodes):
        for right in nodes[i + 1:]:
            if left.building_id == right.building_id:
                minutes = 0  # same building: a corridor, not a campus crossing
            else:
                minutes = scenario.distances.get(left.building_id, {}).get(
                    right.building_id, scenario.walk_limit_min
                )
            edges.append(RoomEdge(source=left.id, target=right.id, minutes=minutes))
            edges.append(RoomEdge(source=right.id, target=left.id, minutes=minutes))

    return RoomGraph(nodes=nodes, edges=edges)
