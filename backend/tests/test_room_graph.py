"""Room graph: features on rooms, walk minutes on the edges."""

from __future__ import annotations

import pytest

from app.data.department import build_department_scenario, build_university_scenario
from app.intelligence.room_graph import build_room_graph
from app.main import load_seed_scenario

BUILDERS = {
    "seed": lambda: load_seed_scenario(),
    "department": lambda: build_department_scenario(load_seed_scenario()),
    "university": lambda: build_university_scenario(load_seed_scenario()),
}


@pytest.fixture(scope="module", params=list(BUILDERS), ids=list(BUILDERS))
def built(request):
    scenario = BUILDERS[request.param]()
    return scenario, build_room_graph(scenario)


@pytest.fixture(scope="module")
def graph(built):
    return built[1]


def test_every_room_is_a_node_with_its_features(graph):
    for node in graph.nodes:
        assert node.capacity > 0
        assert node.room_type in ("lecture", "lab", "seminar")
        assert node.building_id
    assert len({node.id for node in graph.nodes}) == len(graph.nodes)


def test_edges_are_symmetric_with_zero_diagonal(graph):
    table = graph.adjacency()
    for node in graph.nodes:
        assert table[node.id][node.id] == 0
    for node in graph.nodes:
        for other, minutes in table[node.id].items():
            assert table[other][node.id] == minutes
            assert minutes >= 0


def test_same_building_is_zero_and_cross_building_uses_the_walk_matrix(graph):
    scenario = BUILDERS["university"]()
    table = graph.adjacency()
    for node in graph.nodes:
        for other in graph.nodes:
            if node.id == other.id:
                continue
            expected = 0 if node.building_id == other.building_id else (
                scenario.distances[node.building_id][other.building_id]
            )
            assert table[node.id][other.id] == expected


def test_graph_covers_every_room_pair(graph):
    n = len(graph.nodes)
    assert len(graph.edges) == n * (n - 1)  # both directions, no self loops


def test_totals_match_the_scenario(built):
    scenario, graph = built
    assert graph.total_seats == sum(room.capacity for room in scenario.rooms)
    assert graph.buildings == sorted({room.building_id for room in scenario.rooms})
