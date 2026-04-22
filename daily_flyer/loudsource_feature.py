from __future__ import annotations

import os
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

import requests
import spotipy
from itsdangerous import BadSignature, URLSafeSerializer
from spotipy.oauth2 import SpotifyClientCredentials, SpotifyOAuth


DB_PATH = Path(os.getenv("LOUDSOURCE_DATABASE_PATH", os.getenv("DATABASE_PATH", "/var/data/daily_flyer_loudsource.db")))
SCOPES = (
    "user-modify-playback-state "
    "user-read-playback-state "
    "user-read-currently-playing"
)
QUEUE_AHEAD_SECONDS = int(os.getenv("LOUDSOURCE_QUEUE_AHEAD_SECONDS", "10"))
POLL_SECONDS = float(os.getenv("LOUDSOURCE_POLL_SECONDS", "1"))
AUTO_RESUME = os.getenv("LOUDSOURCE_AUTO_RESUME", "true").lower() == "true"
PAUSE_GRACE_SECONDS = int(os.getenv("LOUDSOURCE_PAUSE_GRACE_SECONDS", "6"))
START_COOLDOWN_SECONDS = float(os.getenv("LOUDSOURCE_START_COOLDOWN_SECONDS", "2"))
DEBUG_VERBOSE = os.getenv("LOUDSOURCE_DEBUG_VERBOSE", "false").lower() == "true"

SPOTIPY_CLIENT_ID = os.getenv("SPOTIPY_CLIENT_ID", "").strip()
SPOTIPY_CLIENT_SECRET = os.getenv("SPOTIPY_CLIENT_SECRET", "").strip()
SPOTIPY_REDIRECT_URI = os.getenv("SPOTIPY_REDIRECT_URI", "").strip()
FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-change-me")

_STATE_COLUMNS = {
    "current_uri",
    "current_duration_sec",
    "current_progress_sec",
    "current_is_playing",
    "active_device_name",
    "queued_next_for_uri",
    "auto_enabled",
    "cooldown_until",
    "last_paused_ts",
}

_SIGNER = URLSafeSerializer(FLASK_SECRET_KEY, salt="daily-flyer-loudsource")
_BG_STARTED = False
_BG_LOCK = threading.Lock()


def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [loudsource] {msg}", flush=True)


sp_search = None
if SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET:
    sp_search = spotipy.Spotify(
        auth_manager=SpotifyClientCredentials(
            client_id=SPOTIPY_CLIENT_ID,
            client_secret=SPOTIPY_CLIENT_SECRET,
        )
    )


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,
        isolation_level=None,
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn


def init_storage() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS loudsource_sessions (
                session_slug TEXT PRIMARY KEY,
                spotify_access_token TEXT,
                spotify_refresh_token TEXT,
                token_expires_at INTEGER,
                token_scope TEXT,
                token_type TEXT,
                current_uri TEXT,
                current_duration_sec INTEGER,
                current_progress_sec INTEGER,
                current_is_playing INTEGER,
                active_device_name TEXT,
                queued_next_for_uri TEXT,
                auto_enabled INTEGER NOT NULL DEFAULT 0,
                cooldown_until REAL NOT NULL DEFAULT 0,
                last_paused_ts REAL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS loudsource_tracks (
                track_id TEXT PRIMARY KEY,
                name TEXT,
                artist TEXT,
                image TEXT,
                preview_url TEXT,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS loudsource_votes (
                session_slug TEXT NOT NULL,
                track_id TEXT NOT NULL,
                vote_count INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (session_slug, track_id)
            );
            """
        )


def normalize_session_slug(raw: str | None) -> str:
    slug = (raw or "main").strip().lower()
    if not slug:
        slug = "main"
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", slug):
        raise ValueError("Invalid session slug")
    return slug


def ensure_session(session_slug: str) -> str:
    session_slug = normalize_session_slug(session_slug)
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO loudsource_sessions (session_slug, auto_enabled, cooldown_until, updated_at)
            VALUES (?, 0, 0, ?)
            """,
            (session_slug, int(time.time())),
        )
    return session_slug


def _session_defaults() -> dict[str, Any]:
    return {
        "current_uri": None,
        "current_duration_sec": None,
        "current_progress_sec": None,
        "current_is_playing": None,
        "active_device_name": None,
        "queued_next_for_uri": None,
        "auto_enabled": False,
        "cooldown_until": 0.0,
        "last_paused_ts": None,
    }


def get_state(session_slug: str) -> dict[str, Any]:
    session_slug = ensure_session(session_slug)
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM loudsource_sessions WHERE session_slug = ?",
            (session_slug,),
        ).fetchone()
    defaults = _session_defaults()
    if not row:
        return defaults
    defaults.update(
        {
            "current_uri": row["current_uri"],
            "current_duration_sec": row["current_duration_sec"],
            "current_progress_sec": row["current_progress_sec"],
            "current_is_playing": None if row["current_is_playing"] is None else bool(row["current_is_playing"]),
            "active_device_name": row["active_device_name"],
            "queued_next_for_uri": row["queued_next_for_uri"],
            "auto_enabled": bool(row["auto_enabled"]),
            "cooldown_until": float(row["cooldown_until"] or 0),
            "last_paused_ts": row["last_paused_ts"],
        }
    )
    return defaults


def update_state(session_slug: str, **fields: Any) -> None:
    session_slug = ensure_session(session_slug)
    safe: dict[str, Any] = {}
    for key, value in fields.items():
        if key not in _STATE_COLUMNS:
            continue
        if key in {"current_is_playing", "auto_enabled"} and value is not None:
            safe[key] = 1 if bool(value) else 0
        else:
            safe[key] = value
    if not safe:
        return
    safe["updated_at"] = int(time.time())
    parts = [f"{key} = ?" for key in safe.keys()]
    values = list(safe.values()) + [session_slug]
    with _connect() as conn:
        conn.execute(
            f"UPDATE loudsource_sessions SET {', '.join(parts)} WHERE session_slug = ?",
            values,
        )


def mark_queued_for_snapshot(session_slug: str, snapshot_uri: str, cooldown_until: float) -> bool:
    session_slug = ensure_session(session_slug)
    with _connect() as conn:
        cur = conn.execute(
            """
            UPDATE loudsource_sessions
            SET queued_next_for_uri = ?, cooldown_until = ?, updated_at = ?
            WHERE session_slug = ? AND current_uri = ?
            """,
            (snapshot_uri, cooldown_until, int(time.time()), session_slug, snapshot_uri),
        )
    return cur.rowcount > 0


def save_token(session_slug: str, token_info: dict[str, Any]) -> None:
    session_slug = ensure_session(session_slug)
    with _connect() as conn:
        conn.execute(
            """
            UPDATE loudsource_sessions
            SET spotify_access_token = ?,
                spotify_refresh_token = ?,
                token_expires_at = ?,
                token_scope = ?,
                token_type = ?,
                updated_at = ?
            WHERE session_slug = ?
            """,
            (
                token_info["access_token"],
                token_info.get("refresh_token"),
                int(token_info["expires_at"]),
                token_info.get("scope"),
                token_info.get("token_type"),
                int(time.time()),
                session_slug,
            ),
        )


def get_token(session_slug: str) -> dict[str, Any] | None:
    session_slug = ensure_session(session_slug)
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT spotify_access_token, spotify_refresh_token, token_expires_at, token_scope, token_type
            FROM loudsource_sessions
            WHERE session_slug = ?
            """,
            (session_slug,),
        ).fetchone()
    if not row or not row["spotify_access_token"]:
        return None
    token_info = {
        "access_token": row["spotify_access_token"],
        "refresh_token": row["spotify_refresh_token"],
        "expires_at": int(row["token_expires_at"] or 0),
        "scope": row["token_scope"],
        "token_type": row["token_type"],
    }
    if token_info["expires_at"] - int(time.time()) >= 60:
        return token_info
    if not token_info.get("refresh_token"):
        return None
    try:
        refreshed = _oauth().refresh_access_token(token_info["refresh_token"])
        if not refreshed.get("refresh_token"):
            refreshed["refresh_token"] = token_info["refresh_token"]
        save_token(session_slug, refreshed)
        return refreshed
    except Exception as exc:
        log(f"Token refresh failed for {session_slug}: {exc}")
        return None


def _oauth(state: str | None = None) -> SpotifyOAuth:
    if not (SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET and SPOTIPY_REDIRECT_URI):
        raise RuntimeError("Missing Spotify environment variables")
    return SpotifyOAuth(
        client_id=SPOTIPY_CLIENT_ID,
        client_secret=SPOTIPY_CLIENT_SECRET,
        redirect_uri=SPOTIPY_REDIRECT_URI,
        scope=SCOPES,
        cache_handler=None,
        show_dialog=False,
        open_browser=False,
        state=state,
    )


def _build_signed_state(session_slug: str, next_url: str | None) -> str:
    return _SIGNER.dumps({
        "session_slug": normalize_session_slug(session_slug),
        "next_url": (next_url or "").strip() or None,
    })


def _parse_signed_state(raw_state: str | None) -> tuple[str, str | None]:
    if not raw_state:
        raise ValueError("Missing OAuth state")
    try:
        payload = _SIGNER.loads(raw_state)
    except BadSignature as exc:
        raise ValueError("Bad OAuth state") from exc
    return normalize_session_slug(payload.get("session_slug")), payload.get("next_url")


def get_authorize_url(session_slug: str, next_url: str | None = None) -> str:
    state = _build_signed_state(session_slug, next_url)
    return _oauth(state=state).get_authorize_url(state=state)


def handle_callback(code: str, state: str | None) -> tuple[str, str | None]:
    session_slug, next_url = _parse_signed_state(state)
    token_info = _oauth().get_access_token(code=code, check_cache=False)
    if not token_info.get("refresh_token"):
        existing = get_token(session_slug)
        if existing and existing.get("refresh_token"):
            token_info["refresh_token"] = existing["refresh_token"]
    save_token(session_slug, token_info)
    return session_slug, next_url


def _user_sp(session_slug: str):
    token_info = get_token(session_slug)
    if not token_info:
        return None
    return spotipy.Spotify(auth=token_info["access_token"])


def _list_devices(sp_user) -> list[dict[str, Any]]:
    try:
        return sp_user.devices().get("devices", [])
    except Exception:
        return []


def _active_device(session_slug: str, sp_user) -> dict[str, Any] | None:
    devices = _list_devices(sp_user)
    active = next((d for d in devices if d.get("is_active")), None)
    update_state(session_slug, active_device_name=active.get("name") if active else None)
    return active


def _device_debug_payload(sp_user) -> list[dict[str, Any]]:
    return [
        {
            "id": d.get("id"),
            "name": d.get("name"),
            "type": d.get("type"),
            "is_active": bool(d.get("is_active")),
            "is_private_session": bool(d.get("is_private_session")),
            "is_restricted": bool(d.get("is_restricted")),
            "volume_percent": d.get("volume_percent"),
        }
        for d in _list_devices(sp_user)
    ]


def _track_dict_from_sp_item(track: dict[str, Any]) -> dict[str, Any]:
    images = track.get("album", {}).get("images", [])
    image = images[1]["url"] if len(images) > 1 else (images[0]["url"] if images else None)
    return {
        "name": track["name"],
        "artist": track["artists"][0]["name"],
        "image": image,
        "preview_url": track.get("preview_url"),
    }


def upsert_track(track_id: str, meta: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO loudsource_tracks (track_id, name, artist, image, preview_url, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(track_id) DO UPDATE SET
                name = excluded.name,
                artist = excluded.artist,
                image = excluded.image,
                preview_url = excluded.preview_url,
                updated_at = excluded.updated_at
            """,
            (
                track_id,
                meta.get("name"),
                meta.get("artist"),
                meta.get("image"),
                meta.get("preview_url"),
                int(time.time()),
            ),
        )


def get_track(track_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT track_id, name, artist, image, preview_url FROM loudsource_tracks WHERE track_id = ?",
            (track_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "track_id": row["track_id"],
        "name": row["name"],
        "artist": row["artist"],
        "image": row["image"],
        "preview_url": row["preview_url"],
    }


def get_tracks(track_ids: list[str]) -> dict[str, dict[str, Any]]:
    track_ids = [track_id for track_id in track_ids if track_id]
    if not track_ids:
        return {}
    placeholders = ",".join(["?"] * len(track_ids))
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT track_id, name, artist, image, preview_url FROM loudsource_tracks WHERE track_id IN ({placeholders})",
            track_ids,
        ).fetchall()
    return {
        row["track_id"]: {
            "name": row["name"],
            "artist": row["artist"],
            "image": row["image"],
            "preview_url": row["preview_url"],
        }
        for row in rows
    }


def _ensure_track_cached_by_tid(track_id: str, sp_user=None) -> None:
    if get_track(track_id):
        return
    try:
        sp = sp_user or sp_search
        if sp is None:
            return
        info = sp.track(track_id)
        upsert_track(track_id, _track_dict_from_sp_item(info))
    except Exception as exc:
        log(f"Failed to cache track {track_id}: {exc}")


def vote_delta(session_slug: str, track_id: str, delta: int) -> None:
    session_slug = ensure_session(session_slug)
    now = int(time.time())
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO loudsource_votes (session_slug, track_id, vote_count, updated_at)
            VALUES (?, ?, 0, ?)
            """,
            (session_slug, track_id, now),
        )
        conn.execute(
            """
            UPDATE loudsource_votes
            SET vote_count = MAX(0, vote_count + ?), updated_at = ?
            WHERE session_slug = ? AND track_id = ?
            """,
            (int(delta), now, session_slug, track_id),
        )


def clear_votes(session_slug: str) -> None:
    session_slug = ensure_session(session_slug)
    with _connect() as conn:
        conn.execute("DELETE FROM loudsource_votes WHERE session_slug = ?", (session_slug,))


def remove_vote(session_slug: str, track_id: str) -> None:
    session_slug = ensure_session(session_slug)
    with _connect() as conn:
        conn.execute(
            "DELETE FROM loudsource_votes WHERE session_slug = ? AND track_id = ?",
            (session_slug, track_id),
        )


def get_ordered_votes(session_slug: str, exclude_tid: str | None = None) -> list[tuple[str, int]]:
    session_slug = ensure_session(session_slug)
    query = (
        "SELECT track_id, vote_count FROM loudsource_votes WHERE session_slug = ? AND vote_count > 0"
    )
    params: list[Any] = [session_slug]
    if exclude_tid:
        query += " AND track_id != ?"
        params.append(exclude_tid)
    query += " ORDER BY vote_count DESC, updated_at ASC, track_id ASC"
    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()
    return [(row["track_id"], int(row["vote_count"])) for row in rows]


def list_auto_enabled_sessions() -> list[str]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT session_slug FROM loudsource_sessions WHERE auto_enabled = 1"
        ).fetchall()
    return [row["session_slug"] for row in rows]


def _ordered_ids(session_slug: str, exclude_tid: str | None = None) -> list[str]:
    return [track_id for track_id, _ in get_ordered_votes(session_slug, exclude_tid=exclude_tid)]


def _candidate_next_tid(session_slug: str, current_uri: str | None) -> str | None:
    exclude_tid = current_uri.split(":")[-1] if current_uri and current_uri.startswith("spotify:track:") else None
    ids = _ordered_ids(session_slug, exclude_tid=exclude_tid)
    return ids[0] if ids else None


def _is_valid_track_id(track_id: str) -> bool:
    return isinstance(track_id, str) and re.fullmatch(r"[A-Za-z0-9]{22}", track_id) is not None


def _snapshot_from_current_playback(session_slug: str, sp_user) -> dict[str, Any] | None:
    try:
        playback = sp_user.current_playback()
    except Exception as exc:
        log(f"current_playback() failed for {session_slug}: {exc}")
        return None
    if not playback or not playback.get("item"):
        return None
    device = playback.get("device") or {}
    device_name = device.get("name")
    if device_name is not None:
        update_state(session_slug, active_device_name=device_name)
    item = playback["item"]
    progress_ms = playback.get("progress_ms") or 0
    duration_ms = item.get("duration_ms") or 0
    uri = item.get("uri")
    is_playing = bool(playback.get("is_playing"))
    return {
        "uri": uri,
        "track_id": uri.split(":")[-1] if uri and uri.startswith("spotify:track:") else None,
        "progress_ms": int(progress_ms),
        "duration_ms": int(duration_ms),
        "remaining_ms": max(0, int(duration_ms) - int(progress_ms)),
        "progress_sec": int(progress_ms) // 1000,
        "duration_sec": int(duration_ms) // 1000,
        "remaining_sec": max(0, int(duration_ms - progress_ms)) // 1000,
        "is_playing": is_playing,
        "source": "current_playback",
    }


def _snapshot_from_currently_playing(session_slug: str, sp_user) -> dict[str, Any] | None:
    try:
        current = sp_user.currently_playing()
    except Exception as exc:
        log(f"currently_playing() failed for {session_slug}: {exc}")
        return None
    if not current or not current.get("item"):
        return None
    item = current["item"]
    progress_ms = current.get("progress_ms") or 0
    duration_ms = item.get("duration_ms") or 0
    uri = item.get("uri")
    is_playing = bool(current.get("is_playing", True))
    return {
        "uri": uri,
        "track_id": uri.split(":")[-1] if uri and uri.startswith("spotify:track:") else None,
        "progress_ms": int(progress_ms),
        "duration_ms": int(duration_ms),
        "remaining_ms": max(0, int(duration_ms) - int(progress_ms)),
        "progress_sec": int(progress_ms) // 1000,
        "duration_sec": int(duration_ms) // 1000,
        "remaining_sec": max(0, int(duration_ms - progress_ms)) // 1000,
        "is_playing": is_playing,
        "source": "currently_playing",
    }


def _playback_snapshot(session_slug: str, sp_user) -> dict[str, Any] | None:
    snapshot = _snapshot_from_current_playback(session_slug, sp_user)
    if snapshot:
        return snapshot
    return _snapshot_from_currently_playing(session_slug, sp_user)


def _update_now_playing_from_snapshot(session_slug: str, sp_user, snapshot: dict[str, Any]) -> bool:
    if not snapshot:
        return False
    uri = snapshot["uri"]
    duration_sec = snapshot["duration_sec"]
    progress_sec = snapshot["progress_sec"]
    is_playing = snapshot["is_playing"]
    now = time.time()
    state = get_state(session_slug)
    previous_uri = state["current_uri"]
    changed = uri != previous_uri
    popped_tid = None
    if changed:
        update_state(
            session_slug,
            current_uri=uri,
            current_duration_sec=duration_sec if uri else None,
            current_progress_sec=progress_sec if uri else None,
            current_is_playing=is_playing,
            queued_next_for_uri=None,
            cooldown_until=now + START_COOLDOWN_SECONDS,
        )
        if uri and uri.startswith("spotify:track:"):
            popped_tid = uri.split(":")[-1]
            remove_vote(session_slug, popped_tid)
    else:
        update_state(
            session_slug,
            current_duration_sec=duration_sec if uri else None,
            current_progress_sec=progress_sec if uri else None,
            current_is_playing=is_playing,
        )
    if uri and uri.startswith("spotify:track:"):
        _ensure_track_cached_by_tid(uri.split(":")[-1], sp_user=sp_user)
    if changed and DEBUG_VERBOSE:
        log(f"Now playing for {session_slug}: {uri} ({progress_sec}/{duration_sec}s via {snapshot['source']})")
        if popped_tid:
            log(f"Removed current track from votes for {session_slug}: {popped_tid}")
    return changed


def _should_attempt_queue(snapshot: dict[str, Any] | None) -> bool:
    if not snapshot:
        return False
    if not snapshot["uri"] or snapshot["duration_ms"] <= 0:
        return False
    if not snapshot["is_playing"]:
        return False
    return snapshot["remaining_ms"] <= (QUEUE_AHEAD_SECONDS * 1000)


def _queue_next_for_snapshot(session_slug: str, snapshot: dict[str, Any]) -> tuple[bool, str]:
    next_tid = _candidate_next_tid(session_slug, snapshot["uri"])
    if not next_tid:
        return False, "no_next_candidate"
    if not _is_valid_track_id(next_tid):
        return False, "bad_track_id"
    next_uri = f"spotify:track:{next_tid}"
    state = get_state(session_slug)
    current_uri = state["current_uri"]
    already_queued_for = state["queued_next_for_uri"]
    if current_uri != snapshot["uri"]:
        return False, "current_changed"
    if already_queued_for == snapshot["uri"]:
        return False, "already_queued"
    token_info = get_token(session_slug)
    if not token_info:
        return False, "missing_token"
    headers = {"Authorization": f"Bearer {token_info['access_token']}"}
    try:
        response = requests.post(
            "https://api.spotify.com/v1/me/player/queue",
            headers=headers,
            params={"uri": next_uri},
            timeout=15,
            allow_redirects=False,
        )
        if response.status_code in (200, 204):
            mark_queued_for_snapshot(session_slug, snapshot["uri"], time.time() + 1.0)
            return True, next_uri
        return False, f"status={response.status_code} body={response.text}"
    except Exception as exc:
        return False, str(exc)


def _background_loop() -> None:
    log("Background monitor started")
    while True:
        try:
            for session_slug in list_auto_enabled_sessions():
                try:
                    sp_user = _user_sp(session_slug)
                    if not sp_user:
                        continue
                    snapshot = _playback_snapshot(session_slug, sp_user)
                    if snapshot:
                        _update_now_playing_from_snapshot(session_slug, sp_user, snapshot)
                    else:
                        _active_device(session_slug, sp_user)
                        continue
                    state = get_state(session_slug)
                    now = time.time()
                    in_cooldown = now < (state["cooldown_until"] or 0)
                    last_paused_ts = state["last_paused_ts"]
                    if not snapshot["is_playing"]:
                        if last_paused_ts is None:
                            update_state(session_slug, last_paused_ts=now)
                            last_paused_ts = now
                    else:
                        if last_paused_ts is not None:
                            update_state(session_slug, last_paused_ts=None)
                            last_paused_ts = None
                    if in_cooldown:
                        continue
                    if AUTO_RESUME and not snapshot["is_playing"] and last_paused_ts and (now - last_paused_ts) >= PAUSE_GRACE_SECONDS:
                        try:
                            sp_user.start_playback()
                            update_state(session_slug, cooldown_until=time.time() + 1.0)
                        except Exception:
                            pass
                        continue
                    if _should_attempt_queue(snapshot):
                        _queue_next_for_snapshot(session_slug, snapshot)
                except Exception as exc:
                    log(f"Monitor error for {session_slug}: {exc}")
        except Exception as exc:
            log(f"Background loop error: {exc}")
        time.sleep(POLL_SECONDS)


def ensure_monitor_started() -> None:
    global _BG_STARTED
    with _BG_LOCK:
        if _BG_STARTED:
            return
        threading.Thread(target=_background_loop, daemon=True).start()
        _BG_STARTED = True


def search_tracks(query: str) -> dict[str, dict[str, Any]]:
    query = (query or "").strip()
    if not query:
        return {}
    if sp_search is None:
        raise RuntimeError("Spotify client credentials are not configured")
    results: dict[str, dict[str, Any]] = {}
    items = sp_search.search(q=query, type="track", limit=10)["tracks"]["items"]
    for item in items:
        track_id = item["id"]
        meta = _track_dict_from_sp_item(item)
        upsert_track(track_id, meta)
        results[track_id] = meta
    return results


def play_first(session_slug: str) -> tuple[bool, str]:
    session_slug = ensure_session(session_slug)
    ordered_ids = _ordered_ids(session_slug)
    if not ordered_ids:
        return False, "No voted track is available yet."
    sp_user = _user_sp(session_slug)
    if not sp_user:
        return False, "This room is not connected to Spotify yet."
    active = _active_device(session_slug, sp_user)
    if not active:
        return False, "No active Spotify device found. Start playback on Spotify first."
    top_id = ordered_ids[0]
    top_uri = f"spotify:track:{top_id}"
    try:
        sp_user.start_playback(uris=[top_uri])
    except Exception as exc:
        return False, f"Failed to start playback: {exc}"
    remove_vote(session_slug, top_id)
    time.sleep(0.7)
    snapshot = _playback_snapshot(session_slug, sp_user)
    if snapshot:
        _update_now_playing_from_snapshot(session_slug, sp_user, snapshot)
    update_state(
        session_slug,
        cooldown_until=time.time() + START_COOLDOWN_SECONDS,
        queued_next_for_uri=None,
        auto_enabled=True,
    )
    return True, f"Started playback in room '{session_slug}'."


def status_payload(session_slug: str) -> dict[str, Any]:
    session_slug = ensure_session(session_slug)
    sp_user = _user_sp(session_slug)
    if sp_user:
        try:
            _active_device(session_slug, sp_user)
        except Exception:
            pass
    state = get_state(session_slug)
    uri = state["current_uri"]
    duration_sec = state["current_duration_sec"]
    progress_sec = state["current_progress_sec"]
    is_playing = state["current_is_playing"]
    now_playing = None
    if uri and uri.startswith("spotify:track:"):
        track_id = uri.split(":")[-1]
        _ensure_track_cached_by_tid(track_id, sp_user=sp_user)
        meta = get_track(track_id)
        if meta:
            extra_bits: list[str] = []
            if duration_sec is not None:
                extra_bits.append(f"{duration_sec}s total")
            if progress_sec is not None and duration_sec is not None:
                extra_bits.append(f"{max(0, duration_sec - progress_sec)}s left")
            if is_playing is False:
                extra_bits.append("paused")
            now_playing = {
                "track_id": track_id,
                "name": meta["name"],
                "artist": meta["artist"],
                "image": meta["image"],
                "extra": " • ".join(extra_bits) if extra_bits else None,
            }
    exclude_tid = uri.split(":")[-1] if uri and uri.startswith("spotify:track:") else None
    ids = _ordered_ids(session_slug, exclude_tid=exclude_tid)
    for track_id in ids:
        _ensure_track_cached_by_tid(track_id, sp_user=sp_user)
    tracks_snapshot = get_tracks(ids)
    vote_map = dict(get_ordered_votes(session_slug, exclude_tid=exclude_tid))
    queue_payload = [
        {
            "track_id": track_id,
            "votes": int(vote_map.get(track_id, 0)),
            "track": {
                "name": tracks_snapshot.get(track_id, {}).get("name"),
                "artist": tracks_snapshot.get(track_id, {}).get("artist"),
                "image": tracks_snapshot.get(track_id, {}).get("image"),
            },
        }
        for track_id in ids
    ]
    return {
        "session_slug": session_slug,
        "authed": bool(get_token(session_slug)),
        "ahead_seconds": QUEUE_AHEAD_SECONDS,
        "poll_seconds": POLL_SECONDS,
        "auto_enabled": state["auto_enabled"],
        "now_playing": now_playing,
        "queue": queue_payload,
        "active_device_name": state["active_device_name"],
        "queued_next_for_uri": state["queued_next_for_uri"],
        "next_candidate_tid": _candidate_next_tid(session_slug, uri),
        "ts": int(time.time()),
    }


def devices_payload(session_slug: str) -> dict[str, Any]:
    session_slug = ensure_session(session_slug)
    sp_user = _user_sp(session_slug)
    if not sp_user:
        return {"authed": False, "devices": []}
    _active_device(session_slug, sp_user)
    return {
        "authed": True,
        "active_device_name": get_state(session_slug)["active_device_name"],
        "devices": _device_debug_payload(sp_user),
        "ts": int(time.time()),
    }
