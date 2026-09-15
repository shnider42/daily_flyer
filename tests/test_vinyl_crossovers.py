from unittest.mock import patch

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.vinyl_data import get_release
from daily_flyer.vinyl_data import search_releases
from web import app


RELEASE_ID = "12345678-1234-1234-1234-123456789abc"
ARTIST_ID = "23456789-1234-1234-1234-123456789abc"
GUEST_ID = "34567890-1234-1234-1234-123456789abc"
RELEASE = {
    "id": RELEASE_ID, "title": "First LP", "artist-credit": [{"name": "The Band", "artist": {"id": ARTIST_ID, "name": "The Band"}}],
    "date": "1978", "country": "US", "media": [{"format": "12\" Vinyl", "tracks": [{
        "title": "A Song", "recording": {"artist-credit": [{"name": "The Band", "artist": {"id": ARTIST_ID, "name": "The Band"}}],
            "relations": [{"type": "vocal", "attributes": ["guest"], "artist": {"id": GUEST_ID, "name": "Guest Singer"}}]}
    }]}],
    "label-info": [{"label": {"name": "Example Records"}, "catalog-number": "EX-22"}],
    "relations": [{"type": "producer", "attributes": [], "artist": {"id": GUEST_ID, "name": "Guest Singer"}}],
}


def test_release_credit_evidence_and_edition():
    with patch("daily_flyer.vinyl_data._get", return_value=RELEASE) as fetch:
        record = get_release(RELEASE_ID)
    assert fetch.call_args.args[1][0][1] == "recordings+labels+artist-rels+recording-level-rels"
    assert record["catalog"] == "EX-22"
    assert record["formats"] == ['12" Vinyl']
    assert {("Guest Singer", "A Song"), ("Guest Singer", "")} <= {(c["name"], c["track"]) for c in record["credits"]}
    assert any(c["id"] == ARTIST_ID and c["role"] == "Artist" for c in record["credits"])
    assert record["source"].endswith(RELEASE_ID)


def test_theme_and_web_routes():
    page = build_daily_page("vinyl_crossovers", date_str="2026-09-15")
    assert len(page.cards) == 1
    assert "vinyl_crossovers.js" in page.metadata["extra_head_html"]
    client = app.test_client()
    response = client.get("/?theme=vinyl_crossovers&date=2026-09-15")
    assert response.status_code == 200
    assert b"Find editions" in response.data
    assert client.get("/daily_flyer/themes/vinyl_crossovers.js").status_code == 200
    assert client.get("/api/vinyl/search?artist=A").status_code == 400
    assert client.get("/api/vinyl/release/not-a-uuid").status_code == 400
    with patch("web.search_releases", return_value=[{"id": RELEASE_ID}]) as search:
        response = client.get("/api/vinyl/search?artist=The+Band&title=First+LP&catalog=EX-22")
    assert response.json["releases"][0]["id"] == RELEASE_ID
    search.assert_called_once_with("The Band", "First LP", "EX-22")


def test_search_queries_exact_vinyl_catalog_and_handles_unknown_formats():
    with patch("daily_flyer.vinyl_data._get", side_effect=[{"releases": []}, {"releases": [RELEASE]}]) as fetch:
        results = search_releases("The Band", "First LP")
    assert results[0]["catalog"] == "EX-22"
    assert "format:vinyl" in fetch.call_args_list[0].args[1][0][1]
    assert "format:vinyl" not in fetch.call_args_list[1].args[1][0][1]
    with patch("daily_flyer.vinyl_data._get", return_value={"releases": [RELEASE]}) as fetch:
        search_releases("The Band", "First LP", "EX-22")
    assert 'catno:"EX-22"' in fetch.call_args.args[1][0][1]
