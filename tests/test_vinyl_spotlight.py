"""Keep the curated music map navigable and its evidence attached."""
import json
from pathlib import Path
from urllib.parse import urlparse

from web import app


SPOTLIGHT = Path(__file__).parents[1] / "daily_flyer/themes/vinyl_spotlight.json"


def test_spotlight_relationships_and_sources_are_complete():
    data = json.loads(SPOTLIGHT.read_text())
    nodes = {node["id"]: node for node in data["nodes"]}
    edges = {edge["id"]: edge for edge in data["edges"]}
    sources = {source["id"]: source for source in data["sources"]}
    assert len(nodes) == len(data["nodes"])
    assert len(edges) == len(data["edges"])
    assert len(sources) == len(data["sources"])
    assert data["focus"] in nodes
    assert nodes[data["focus"]]["label"] == "Peter Asher"
    for source in sources.values():
        parsed = urlparse(source["url"])
        assert parsed.scheme == "https" and parsed.netloc
    for item in [*nodes.values(), *edges.values()]:
        assert item["sourceIds"]
        assert set(item["sourceIds"]) <= sources.keys()
    for edge in edges.values():
        assert edge["source"] in nodes and edge["target"] in nodes
        assert edge["role"] in {"production", "performance", "songwriting", "career"}
        assert edge["label"] and edge["description"]


def test_spotlight_guided_trails_never_point_at_missing_or_unshown_connections():
    data = json.loads(SPOTLIGHT.read_text())
    nodes = {node["id"] for node in data["nodes"]}
    edges = {edge["id"]: edge for edge in data["edges"]}
    assert data["trails"]
    for trail in data["trails"]:
        assert trail["steps"]
        for step in trail["steps"]:
            assert step["nodeIds"] and step["edgeIds"]
            assert set(step["nodeIds"]) <= nodes
            assert set(step["edgeIds"]) <= edges.keys()
            for edge_id in step["edgeIds"]:
                edge = edges[edge_id]
                assert {edge["source"], edge["target"]} <= set(step["nodeIds"])


def test_spotlight_data_and_explorer_are_served():
    client = app.test_client()
    response = client.get("/daily_flyer/themes/vinyl_spotlight.json")
    assert response.status_code == 200
    assert response.json["focus"] == "peter-asher"
    assert client.get("/daily_flyer/themes/vinyl_explorer.js").status_code == 200
