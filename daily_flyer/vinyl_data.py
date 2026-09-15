"""Small MusicBrainz adapter for the vinyl companion theme.

The release ID, rather than an album title, identifies a particular edition.
Only credited relationships are turned into people; missing credits stay missing.
"""
from __future__ import annotations

import re
import threading
import time
from functools import lru_cache

import requests


API = "https://musicbrainz.org/ws/2"
USER_AGENT = "DailyFlyerVinyl/0.1 (https://github.com/shnider42/daily_flyer)"
RELEASE_ID = re.compile(r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
MUSIC_ROLES = {"instrument", "vocal", "performer", "producer", "mix", "remixer", "composer", "lyricist", "writer", "arranger", "conductor", "engineer", "mastering", "guest", "additional"}
_request_lock = threading.Lock()
_last_request = 0.0


class MusicBrainzUnavailable(Exception):
    pass


@lru_cache(maxsize=512)
def _get(path: str, query: tuple[tuple[str, str], ...]) -> dict:
    global _last_request
    with _request_lock:
        pause = 1.1 - (time.monotonic() - _last_request)
        if pause > 0:
            time.sleep(pause)
        _last_request = time.monotonic()
        try:
            response = requests.get(
                f"{API}/{path}", params=dict(query),
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, timeout=12,
            )
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            raise MusicBrainzUnavailable("MusicBrainz is unavailable right now. Try again shortly.") from exc


def _artist_name(credit: list) -> str:
    return "".join(part if isinstance(part, str) else part.get("name", "") for part in credit).strip()


def _phrase(value: str) -> str:
    return value.replace("\\", " ").replace('"', " ").strip()


def search_albums(title: str) -> list[dict]:
    """Find distinct albums/EPs, not hundreds of editions of one record."""
    result = _get("release-group/", (("query", f'releasegroup:"{_phrase(title)}"'), ("fmt", "json"), ("limit", "50")))
    groups = []
    for group in result.get("release-groups") or []:
        if group.get("primary-type") not in {"Album", "EP"} or not RELEASE_ID.fullmatch(group.get("id", "")):
            continue
        groups.append({
            "id": group["id"], "title": group.get("title", ""),
            "artist": _artist_name(group.get("artist-credit") or []),
            "year": (group.get("first-release-date") or "")[:4],
            "type": group.get("primary-type"),
            "source": f'https://musicbrainz.org/release-group/{group["id"]}',
        })
    def match_score(group: dict) -> tuple:
        year = group["year"]
        classic = year.isdigit() and 1960 <= int(year) <= 1989
        return (group["title"].casefold() != title.casefold(), not classic)

    return sorted(groups, key=match_score)[:8]


def _edition(release: dict) -> dict:
    labels = release.get("label-info") or []
    media = release.get("media") or []
    label = next((entry.get("label", {}).get("name") for entry in labels if entry.get("label")), None)
    catalog = next((entry.get("catalog-number") for entry in labels if entry.get("catalog-number")), None)
    return {
        "id": release.get("id"), "title": release.get("title", ""),
        "artist": _artist_name(release.get("artist-credit") or []),
        "date": release.get("date") or "", "country": release.get("country") or "",
        "formats": [medium.get("format") or "Unknown format" for medium in media],
        "label": label or "", "catalog": catalog or "",
        "barcode": release.get("barcode") or "",
        "source": f"https://musicbrainz.org/release/{release.get('id')}",
    }


def search_releases(artist: str, title: str, catalog: str = "") -> list[dict]:
    # Escape Lucene phrase syntax instead of letting typed album names alter the query.
    query = f'release:"{_phrase(title)}" AND artist:"{_phrase(artist)}" AND format:vinyl'
    if catalog.strip():
        query += f' AND catno:"{_phrase(catalog)}"'
    result = _get("release/", (("query", query), ("fmt", "json"), ("limit", "18")))
    if not result.get("releases") and not catalog.strip():
        # Some records have an unspecified format in the catalog. Show those
        # editions too, clearly labelled, instead of implying they do not exist.
        result = _get("release/", (("query", f'release:"{_phrase(title)}" AND artist:"{_phrase(artist)}"'), ("fmt", "json"), ("limit", "18")))
    releases = [_edition(release) for release in result.get("releases", [])]
    # Vinyl editions first, while allowing uncatalogued formats to be selected too.
    return sorted(releases, key=lambda r: (not any("vinyl" in f.lower() or f in {"12\"", "10\"", "7\""} for f in r["formats"]), -int(r["date"][:4]) if r["date"][:4].isdigit() else 0))


def get_release(release_id: str) -> dict:
    if not RELEASE_ID.fullmatch(release_id):
        raise ValueError("Invalid MusicBrainz release ID.")
    release = _get(f"release/{release_id.lower()}", (("inc", "recordings+labels+artist-rels+recording-level-rels+work-rels+work-level-rels"), ("fmt", "json")))
    edition = _edition(release)
    credits: dict[tuple[str, str, str], dict] = {}

    def artist_credit(parts: list, track: str):
        for part in parts:
            if isinstance(part, dict) and part.get("artist"):
                artist = part["artist"]
                put(artist.get("id"), part.get("name") or artist.get("name"), "Artist", track)

    def put(artist_id: str | None, name: str | None, role: str, track: str):
        if not artist_id or not name:
            return
        key = (artist_id, role, track)
        credits[key] = {"id": artist_id, "name": name, "role": role, "track": track, "source": edition["source"]}

    def relationships(entity: dict, track: str):
        for relation in entity.get("relations", []) or []:
            work = relation.get("work")
            if work:
                relationships(work, track)
            artist = relation.get("artist")
            role = relation.get("type", "")
            if not artist or not any(piece in role.lower() for piece in MUSIC_ROLES):
                continue
            attributes = relation.get("attributes") or []
            label = role.title()
            if attributes:
                label += " · " + ", ".join(str(a) for a in attributes[:2])
            put(artist.get("id"), relation.get("target-credit") or artist.get("name"), label, track)

    artist_credit(release.get("artist-credit") or [], "")
    relationships(release, "")
    tracks = []
    for medium in release.get("media") or []:
        for track in medium.get("tracks") or []:
            name = track.get("title") or track.get("recording", {}).get("title") or "Unknown track"
            tracks.append(name)
            recording = track.get("recording") or {}
            artist_credit(track.get("artist-credit") or recording.get("artist-credit") or [], name)
            relationships(recording, name)
    return {**edition, "credits": list(credits.values()), "tracks": tracks}


def _is_vinyl(release: dict) -> bool:
    return any("vinyl" in str(medium.get("format", "")).lower() or medium.get("format") in {'7"', '10"', '12"'} for medium in release.get("media") or [])


def get_album(group_id: str) -> dict:
    """Choose a representative edition near the album's first release year."""
    if not RELEASE_ID.fullmatch(group_id):
        raise ValueError("Invalid album ID.")
    group = _get(f"release-group/{group_id.lower()}", (("fmt", "json"),))
    releases = _get("release/", (("release-group", group_id.lower()), ("status", "official"),
                                   ("limit", "100"), ("inc", "artist-credits+labels+media"), ("fmt", "json"))).get("releases") or []
    if not releases:
        raise ValueError("No cataloged edition was found for this album.")
    first_year = (group.get("first-release-date") or "")[:4]

    def score(release: dict) -> tuple:
        date = str(release.get("date") or "")[:4]
        year_distance = abs(int(date) - int(first_year)) if date.isdigit() and first_year.isdigit() else 999
        return (not _is_vinyl(release), year_distance, not bool(release.get("label-info")), date or "9999", release.get("id", ""))

    ranked = sorted(releases, key=score)
    chosen = ranked[0]
    record = get_release(chosen["id"])
    record["credit_sources"] = [record["source"]]
    # Some editions have almost no named relationships. A second cataloged
    # edition of the same album may carry fuller sleeve/recording credits.
    if len([c for c in record["credits"] if c["role"] != "Artist"]) < 8:
        alternate = next((r for r in ranked[1:] if r.get("id") != chosen["id"] and _is_vinyl(r)), None)
        if alternate:
            try:
                second = get_release(alternate["id"])
                known = {(c["id"], c["role"], c["track"]) for c in record["credits"]}
                record["credits"].extend(c for c in second["credits"] if (c["id"], c["role"], c["track"]) not in known)
                record["credit_sources"].append(second["source"])
            except MusicBrainzUnavailable:
                pass
    record["album_id"] = group_id.lower()
    record["first_year"] = first_year
    record["album_source"] = f"https://musicbrainz.org/release-group/{group_id.lower()}"
    return record


def _appearance(credit: dict, album: dict) -> dict:
    return {"album": album["title"], "album_artist": album["artist"], "role": credit["role"],
            "track": credit.get("track", ""), "source": credit.get("source") or album["source"]}


def _other_album_links(album: dict, max_people: int = 2) -> list[dict]:
    people: dict[str, list[dict]] = {}
    for credit in album["credits"]:
        if credit["role"] == "Artist" or not credit.get("id"):
            continue
        people.setdefault(credit["id"], []).append(credit)
    ranked = sorted(people.values(), key=lambda entries: (not any("vocal" in c["role"].lower() or "instrument" in c["role"].lower() for c in entries), -len(entries)))
    links = []
    for credits in ranked[:max_people]:
        person = credits[0]
        try:
            artist = _get(f'artist/{person["id"]}', (("inc", "release-rels"), ("fmt", "json")))
        except MusicBrainzUnavailable:
            artist = {}  # Try a smaller artist discography query below.
        seen = set()
        for relation in artist.get("relations") or []:
            release = relation.get("release") or {}
            release_id = release.get("id")
            if not RELEASE_ID.fullmatch(release_id or "") or release_id == album["id"] or release.get("title", "").casefold() == album["title"].casefold():
                continue
            role = relation.get("type", "")
            if not any(piece in role.lower() for piece in MUSIC_ROLES):
                continue
            name = release.get("title", "")
            if not name or name.casefold() in seen:
                continue
            year = str(release.get("date") or "")[:4]
            if year.isdigit() and not (1960 <= int(year) <= 1989):
                continue
            seen.add(name.casefold())
            links.append({"person": person["name"], "on_this": _appearance(person, album),
                          "other_title": name, "other_artist": _artist_name(release.get("artist-credit") or []),
                          "other_role": role, "other_year": year,
                          "other_source": f"https://musicbrainz.org/release/{release_id}"})
            if len(seen) >= 3:
                break
        if len(seen) < 2:
            try:
                discography = _get("release-group/", (("artist", person["id"]), ("type", "album|ep"), ("limit", "25"), ("fmt", "json")))
            except MusicBrainzUnavailable:
                discography = {}
            for group in discography.get("release-groups") or []:
                name = group.get("title", "")
                year = str(group.get("first-release-date") or "")[:4]
                group_id = group.get("id")
                if not name or name.casefold() in seen or name.casefold() == album["title"].casefold() or not year.isdigit() or not 1960 <= int(year) <= 1989 or not RELEASE_ID.fullmatch(group_id or ""):
                    continue
                seen.add(name.casefold())
                links.append({"person": person["name"], "on_this": _appearance(person, album),
                              "other_title": name, "other_artist": _artist_name(group.get("artist-credit") or []),
                              "other_role": "album artist", "other_year": year,
                              "other_source": f"https://musicbrainz.org/release-group/{group_id}"})
                if len(seen) >= 3:
                    break
    return links


def explore_albums(group_ids: list[str]) -> dict:
    if not 1 <= len(group_ids) <= 2 or len(set(group_ids)) != len(group_ids) or any(not RELEASE_ID.fullmatch(group_id or "") for group_id in group_ids):
        raise ValueError("Choose one or two distinct albums.")
    albums = [get_album(group_id) for group_id in group_ids]
    people: dict[str, list[dict]] = {}
    for album in albums:
        for credit in album["credits"]:
            if credit.get("id"):
                people.setdefault(credit["id"], []).append({"credit": credit, "album": album})
    connections = []
    if len(albums) == 2:
        for artist_id, items in people.items():
            first = next((entry for entry in items if entry["album"]["id"] == albums[0]["id"] and entry["credit"]["role"] != "Artist"), None)
            second = next((entry for entry in items if entry["album"]["id"] == albums[1]["id"] and entry["credit"]["role"] != "Artist"), None)
            # Artist-on-one, guest-on-the-other is also an interesting link.
            first = first or next((entry for entry in items if entry["album"]["id"] == albums[0]["id"]), None)
            second = second or next((entry for entry in items if entry["album"]["id"] == albums[1]["id"]), None)
            if not first or not second or (first["credit"]["role"] == second["credit"]["role"] == "Artist"):
                continue
            connections.append({"id": artist_id, "person": first["credit"]["name"],
                                "first": _appearance(first["credit"], first["album"]),
                                "second": _appearance(second["credit"], second["album"]),
                                "credits_on_first": len([x for x in items if x["album"]["id"] == albums[0]["id"]]),
                                "credits_on_second": len([x for x in items if x["album"]["id"] == albums[1]["id"]])})
        connections.sort(key=lambda c: (c["first"]["role"] == "Artist" or c["second"]["role"] == "Artist", -(c["credits_on_first"] + c["credits_on_second"]), c["person"]))
    return {"albums": albums, "connections": connections[:30],
            "other_albums": _other_album_links(albums[0]) if len(albums) == 1 else []}
