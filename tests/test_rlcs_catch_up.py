"""Publication checks for the reviewed edition and its DFE integration."""
import copy
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from daily_flyer_v2.engine import build_flyer_experience, build_flyer_html
from daily_flyer_v2.products.rlcs_catch_up import DATA_PATH
from daily_flyer_v2.renderers.rlcs_catch_up import render_rlcs_catch_up
from web import app

ROOT = Path(__file__).resolve().parents[1]
HOSTS = {"www.rocketleague.com", "blast.tv", "nrg.gg", "vitality.gg"}


def test_every_story_has_reviewed_evidence_and_dated_context():
    data = json.loads(DATA_PATH.read_text())
    sources = {s["id"]: s for s in data["sources"]}
    assert len(sources) == len(data["sources"])
    assert len({s["id"] for s in data["stories"]}) == len(data["stories"])
    assert len({s["priority"] for s in data["stories"]}) == len(data["stories"])
    assert data["coverage_from"] == min(s["date"] for s in data["stories"])
    assert data["coverage_through"] == max(s["date"] for s in data["stories"])
    assert date.fromisoformat(data["reviewed_at"]) <= date.today()
    for source in sources.values():
        url = urlparse(source["url"])
        assert url.scheme == "https" and url.hostname in HOSTS and not url.username
        assert date.fromisoformat(source["checked_at"]) <= date.fromisoformat(data["reviewed_at"])
        if source["published_at"]:
            assert source["published_at"] <= source["checked_at"]
    for story in data["stories"]:
        assert story["source_ids"] and set(story["source_ids"]) <= sources.keys()
        assert date.fromisoformat(story["date"]) <= date.fromisoformat(data["reviewed_at"])
        for field in ("date_kind", "before", "after", "context", "meaning", "safe_title", "safe_summary"):
            assert story[field].strip()
        if "results" in story["topics"]:
            assert story["spoiler"]
            assert story["safe_title"] != story["title"]


def test_selected_date_cannot_manufacture_a_new_review_date():
    first = build_flyer_experience("rlcs_catch_up", "2020-01-01")
    second = build_flyer_experience("rlcs_catch_up", "2030-01-01")
    assert first.data == second.data
    assert first.date_label == first.data["reviewed_at"] == second.date_label


def test_flask_route_and_static_export_are_identical_and_self_contained():
    page = build_flyer_html("rlcs_catch_up")
    response = app.test_client().get("/v2?product=rlcs-catch-up")
    assert response.status_code == 200
    assert response.get_data(as_text=True) == page
    assert (ROOT / "rlcs_catchup/index.html").read_text() == page
    soup = BeautifulSoup(page, "html.parser")
    assert not soup.select("script[src], link[rel=stylesheet], img[src]")
    assert len(soup.select("#fallback article")) == 3
    assert len(json.loads(soup.select_one("#rlcs-data").string)["stories"]) >= 16
    assert "@@" not in page


def test_no_script_fallback_never_leaks_a_result_source():
    experience = copy.deepcopy(build_flyer_experience("rlcs_catch_up"))
    result = next(s for s in experience.data["stories"] if s["spoiler"])
    result["priority"] = -1
    result["safe_title"] = "SAFE BUT RESULT SOURCE"
    soup = BeautifulSoup(render_rlcs_catch_up(experience), "html.parser")
    fallback = soup.select_one("#fallback")
    assert "SAFE BUT RESULT SOURCE" not in fallback.get_text()
    spoilers = {s["url"] for s in experience.data["sources"] if s["spoiler"]}
    assert not spoilers.intersection(a["href"] for a in fallback.select("a"))


def test_embedded_data_cannot_close_script_or_inject_another_template_slot():
    experience = copy.deepcopy(build_flyer_experience("rlcs_catch_up"))
    attack = '</script><script>alert(1)</script>@@CSS@@'
    experience.data["stories"][0]["title"] = attack
    soup = BeautifulSoup(render_rlcs_catch_up(experience), "html.parser")
    assert len(soup.select("script")) == 2
    assert json.loads(soup.select_one("#rlcs-data").string)["stories"][0]["title"] == attack
