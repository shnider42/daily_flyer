from unittest.mock import patch

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.vinyl_data import explore_albums, get_album, get_release, search_albums, search_releases
from web import app


RELEASE_ID = "12345678-1234-1234-1234-123456789abc"
ARTIST_ID = "23456789-1234-1234-1234-123456789abc"
GUEST_ID = "34567890-1234-1234-1234-123456789abc"
GROUP_ID = "45678901-1234-1234-1234-123456789abc"
WRITER_ID = "56789012-1234-1234-1234-123456789abc"
RELEASE = {
    "id": RELEASE_ID, "title": "First LP", "artist-credit": [{"name": "The Band", "artist": {"id": ARTIST_ID, "name": "The Band"}}],
    "date": "1978", "country": "US", "media": [{"format": "12\" Vinyl", "tracks": [{
        "title": "A Song", "recording": {"artist-credit": [{"name": "The Band", "artist": {"id": ARTIST_ID, "name": "The Band"}}],
            "relations": [{"type": "vocal", "attributes": ["guest"], "artist": {"id": GUEST_ID, "name": "Guest Singer"}},
                          {"type": "performance", "work": {"relations": [{"type": "writer", "artist": {"id": WRITER_ID, "name": "Songwriter"}}]}}]}
    }]}],
    "label-info": [{"label": {"name": "Example Records"}, "catalog-number": "EX-22"}],
    "relations": [{"type": "producer", "attributes": [], "artist": {"id": GUEST_ID, "name": "Guest Singer"}}],
}


def test_release_credit_evidence_and_edition():
    with patch("daily_flyer.vinyl_data._get", return_value=RELEASE) as fetch:
        record = get_release(RELEASE_ID)
    assert fetch.call_args.args[1][0][1] == "recordings+labels+artist-rels+recording-level-rels+work-rels+work-level-rels"
    assert record["catalog"] == "EX-22"
    assert record["formats"] == ['12" Vinyl']
    assert {("Guest Singer", "A Song"), ("Guest Singer", "")} <= {(c["name"], c["track"]) for c in record["credits"]}
    assert any(c["id"] == ARTIST_ID and c["role"] == "Artist" for c in record["credits"])
    assert any(c["id"] == WRITER_ID and c["track"] == "A Song" for c in record["credits"])
    assert all(c["source"].endswith(RELEASE_ID) for c in record["credits"])
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
    assert client.get("/api/vinyl/albums").status_code == 400
    assert client.post("/api/vinyl/explore",json={"album_ids":[]}).status_code == 400
    with patch("web.search_albums", return_value=[{"id": GROUP_ID, "title": "First LP"}]):
        assert client.get("/api/vinyl/albums?title=First+LP").json["albums"][0]["id"] == GROUP_ID
    with patch("web.explore_albums", return_value={"albums": [RELEASE], "connections": [], "other_albums": []}) as explore:
        assert client.post("/api/vinyl/explore", json={"album_ids": [GROUP_ID]}).status_code == 200
    explore.assert_called_once_with([GROUP_ID])
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


def test_title_only_album_match_and_representative_vinyl_selection():
    group = {"id": GROUP_ID, "title": "First LP", "primary-type": "Album", "first-release-date": "1978-05",
             "artist-credit": [{"name": "The Band", "artist": {"id": ARTIST_ID}}]}
    with patch("daily_flyer.vinyl_data._get",return_value={"release-groups":[group,{**group,"primary-type":"Single"}]}) as fetch:
        matches = search_albums("First LP")
    assert len(matches) == 1 and matches[0]["year"] == "1978" and matches[0]["artist"] == "The Band"
    assert 'releasegroup:"First LP"' in fetch.call_args.args[1][0][1]
    cd = {**RELEASE,"id":"67890123-1234-1234-1234-123456789abc", "date":"1978", "media":[{"format":"CD"}]}
    later = {**RELEASE,"id":RELEASE_ID,"date":"1982"}
    with patch("daily_flyer.vinyl_data._get",side_effect=[group,{"releases":[cd,later]}]), patch("daily_flyer.vinyl_data.get_release",return_value={"id":RELEASE_ID,"title":"First LP","artist":"The Band","date":"1982","formats":['12" Vinyl'],"source":"https://musicbrainz.org/release/"+RELEASE_ID,"credits":[{"id":GUEST_ID,"role":"vocal","track":"A Song","name":"Guest Singer","source":"https://musicbrainz.org/release/"+RELEASE_ID}]}) as full:
        chosen = get_album(GROUP_ID)
    full.assert_called_once_with(RELEASE_ID)
    assert chosen["first_year"] == "1978" and chosen["album_id"] == GROUP_ID


def test_two_album_overlap_uses_person_id_and_both_credit_sources():
    a={"id":RELEASE_ID,"artist":"The Band","title":"First LP","source":"https://first.example/release","credits":[{"id":GUEST_ID,"name":"Guest Singer","role":"vocal","track":"A Song","source":"https://first.example/credit"}]}
    b={**a,"id":"78901234-1234-1234-1234-123456789abc","title":"Second LP","credits":[{"id":GUEST_ID,"name":"Guest Singer","role":"producer","track":"","source":"https://second.example/credit"}]}
    with patch("daily_flyer.vinyl_data.get_album",side_effect=[a,b]):
        result=explore_albums([GROUP_ID,"89012345-1234-1234-1234-123456789abc"])
    assert len(result["connections"]) == 1
    assert result["connections"][0]["first"]["source"] == "https://first.example/credit"
    assert result["connections"][0]["second"]["source"] == "https://second.example/credit"
    assert result["connections"][0]["second"]["role"] == "producer"


def test_sparse_edition_adds_a_second_credit_source_without_changing_selected_pressing():
    first={"id":RELEASE_ID,"source":"https://musicbrainz.org/release/"+RELEASE_ID,"title":"First LP","artist":"The Band","credits":[{"id":GUEST_ID,"name":"Guest Singer","role":"vocal","track":"A Song","source":"https://musicbrainz.org/release/"+RELEASE_ID}]}
    second_id="90123456-1234-1234-1234-123456789abc"
    second={**first,"id":second_id,"source":"https://musicbrainz.org/release/"+second_id,"credits":[{"id":WRITER_ID,"name":"Songwriter","role":"writer","track":"A Song","source":"https://musicbrainz.org/release/"+second_id}]}
    group={"first-release-date":"1978"}
    browse={"releases":[{"id":RELEASE_ID,"date":"1978","media":[{"format":"12\" Vinyl"}]},{"id":second_id,"date":"1979","media":[{"format":"12\" Vinyl"}]}]}
    with patch("daily_flyer.vinyl_data._get",side_effect=[group,browse]),patch("daily_flyer.vinyl_data.get_release",side_effect=[first,second]):
        album=get_album(GROUP_ID)
    assert album["id"] == RELEASE_ID
    assert len(album["credits"]) == 2
    assert album["credits"][-1]["source"].endswith(second_id)
    assert len(album["credit_sources"]) == 2


def test_single_album_follows_named_guest_to_seventies_and_eighties_records():
    album={"id":RELEASE_ID,"title":"First LP","artist":"The Band","source":"https://musicbrainz.org/release/"+RELEASE_ID,
           "credits":[{"id":GUEST_ID,"name":"Guest Singer","role":"vocal","track":"A Song","source":"https://musicbrainz.org/release/"+RELEASE_ID}]}
    release={"id":"a0123456-1234-1234-1234-123456789abc","title":"Other 70s LP","date":"1975","artist-credit":[{"name":"Another Band"}]}
    group={"id":"b0123456-1234-1234-1234-123456789abc","title":"The 80s Album","first-release-date":"1984","artist-credit":[{"name":"Guest Singer"}]}
    too_late={**group,"id":"c0123456-1234-1234-1234-123456789abc","title":"The 90s Album","first-release-date":"1994"}
    with patch("daily_flyer.vinyl_data.get_album",return_value=album),patch("daily_flyer.vinyl_data._get",side_effect=[{"relations":[{"type":"producer","release":release}]},{"release-groups":[group,too_late]}]):
        result=explore_albums([GROUP_ID])
    assert [link["other_title"] for link in result["other_albums"]] == ["Other 70s LP","The 80s Album"]
    assert result["other_albums"][0]["on_this"]["track"] == "A Song"
    assert result["other_albums"][1]["other_role"] == "album artist"
