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
MUSIC_ROLES = {"instrument", "vocal", "performer", "producer", "mix", "remixer", "composer", "lyricist", "arranger", "conductor", "engineer", "mastering", "guest", "additional"}
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
    def phrase(value: str) -> str:
        return value.replace("\\", " ").replace('"', " ").strip()

    query = f'release:"{phrase(title)}" AND artist:"{phrase(artist)}" AND format:vinyl'
    if catalog.strip():
        query += f' AND catno:"{phrase(catalog)}"'
    result = _get("release/", (("query", query), ("fmt", "json"), ("limit", "18")))
    if not result.get("releases") and not catalog.strip():
        # Some records have an unspecified format in the catalog. Show those
        # editions too, clearly labelled, instead of implying they do not exist.
        result = _get("release/", (("query", f'release:"{phrase(title)}" AND artist:"{phrase(artist)}"'), ("fmt", "json"), ("limit", "18")))
    releases = [_edition(release) for release in result.get("releases", [])]
    # Vinyl editions first, while allowing uncatalogued formats to be selected too.
    return sorted(releases, key=lambda r: (not any("vinyl" in f.lower() or f in {"12\"", "10\"", "7\""} for f in r["formats"]), -int(r["date"][:4]) if r["date"][:4].isdigit() else 0))


def get_release(release_id: str) -> dict:
    if not RELEASE_ID.fullmatch(release_id):
        raise ValueError("Invalid MusicBrainz release ID.")
    release = _get(f"release/{release_id.lower()}", (("inc", "recordings+artist-rels+recording-level-rels"), ("fmt", "json")))
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
        credits[key] = {"id": artist_id, "name": name, "role": role, "track": track}

    def relationships(entity: dict, track: str):
        for relation in entity.get("relations", []) or []:
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
