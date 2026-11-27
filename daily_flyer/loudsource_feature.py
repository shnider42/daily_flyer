from __future__ import annotations

import os
import fcntl
import re
import sqlite3
import threading
import time
from contextlib import contextmanager
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
POLL_SECONDS = max(2.5, float(os.getenv("LOUDSOURCE_POLL_SECONDS", "3")))
# A paused Spotify player is an instruction to stay paused. Legacy AUTO_RESUME
# environment variables intentionally no longer enable forced playback.
CONTROL_TIMEOUT_SECONDS = 12 * 60 * 60
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
_TOKEN_LOCK = threading.RLock()
_TOKEN_RETRY_AFTER: dict[str, float] = {}
_PLAY_LOCK = threading.Lock()
_CONNECTION_ERRORS: dict[str, str] = {}
_SEARCH_CACHE: dict[str, tuple[float, dict]] = {}
_SEARCH_LOCK = threading.Lock()
_CONTROL_LOCK = threading.RLock()
_CONTROL_LOCAL = threading.local()


class SpotifySessionInactive(RuntimeError):
    """No current host permission exists for a Spotify request."""

    def __init__(self, message: str | None = None):
        super().__init__(message or "Start a Spotify session from the host desk before using Spotify controls or song search.")


@contextmanager
def _control_lock():
    """Serialize outgoing requests and consent changes, including across workers.

    The file lock uses the same persistent disk as the room database. Holding it
    across an outgoing request means End cannot acknowledge while that request
    is still being dispatched. Reentrant calls reuse the outer lock descriptor.
    """
    with _CONTROL_LOCK:
        if getattr(_CONTROL_LOCAL, "depth", 0):
            _CONTROL_LOCAL.depth += 1
            try:
                yield
            finally:
                _CONTROL_LOCAL.depth -= 1
            return
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        lock_path = DB_PATH.with_name(DB_PATH.name + ".spotify-control.lock")
        fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            _CONTROL_LOCAL.depth = 1
            try:
                yield
            finally:
                _CONTROL_LOCAL.depth = 0
                fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [loudsource] {msg}", flush=True)


sp_search = None
if SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET:
    sp_search = spotipy.Spotify(
        requests_timeout=8, retries=0, status_retries=0,
        auth_manager=SpotifyClientCredentials(
            client_id=SPOTIPY_CLIENT_ID,
            client_secret=SPOTIPY_CLIENT_SECRET,
        )
    )


@contextmanager
def _connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,
        isolation_level=None,
        check_same_thread=False,
    )
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        with conn:
            yield conn
    finally:
        conn.close()


def init_storage() -> None:
    with _control_lock():
        _init_storage_locked()


def _init_storage_locked() -> None:
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
            CREATE TABLE IF NOT EXISTS loudsource_ballots (
                session_slug TEXT NOT NULL,
                person_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                PRIMARY KEY (session_slug, person_id, track_id)
            );
            CREATE TABLE IF NOT EXISTS loudsource_requests (
                session_slug TEXT NOT NULL,
                track_id TEXT NOT NULL,
                person_id TEXT NOT NULL,
                PRIMARY KEY (session_slug, track_id)
            );
            CREATE TABLE IF NOT EXISTS loudsource_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_slug TEXT NOT NULL,
                track_id TEXT NOT NULL,
                played_at INTEGER NOT NULL
            );
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(loudsource_sessions)")}
        migrating = "control_expires_at" not in columns
        for name, definition in {
            "control_expires_at": "REAL NOT NULL DEFAULT 0",
            "last_host_activity_at": "REAL",
            "control_generation": "INTEGER NOT NULL DEFAULT 0",
            "control_end_reason": "TEXT",
        }.items():
            if name not in columns:
                conn.execute(f"ALTER TABLE loudsource_sessions ADD COLUMN {name} {definition}")
        if migrating:
            count = conn.execute("SELECT COUNT(*) FROM loudsource_sessions").fetchone()[0]
            conn.execute("UPDATE loudsource_sessions SET auto_enabled=0, last_paused_ts=NULL, queued_next_for_uri=NULL")
            log(f"Spotify control migration: {count} saved rooms inactive; explicit host permission required")


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


def _end_control_locked(session_slug: str, reason: str) -> None:
    with _connect() as conn:
        conn.execute(
            """UPDATE loudsource_sessions SET control_expires_at=0,
                control_generation=control_generation+1, control_end_reason=?,
                auto_enabled=0, last_paused_ts=NULL, queued_next_for_uri=NULL,
                current_uri=NULL, current_duration_sec=NULL, current_progress_sec=NULL,
                current_is_playing=NULL, active_device_name=NULL WHERE session_slug=?""",
            (reason, session_slug),
        )
    log(f"Spotify session ended for {session_slug}: {reason}")


def _control_state_locked(session_slug: str) -> dict[str, Any]:
    session_slug = ensure_session(session_slug)
    with _connect() as conn:
        row = dict(conn.execute(
            """SELECT control_expires_at, last_host_activity_at, control_generation,
                control_end_reason FROM loudsource_sessions WHERE session_slug=?""",
            (session_slug,),
        ).fetchone())
    expires = float(row["control_expires_at"] or 0)
    if expires and expires <= time.time():
        _end_control_locked(session_slug, "expired")
        row.update(control_expires_at=0, control_generation=row["control_generation"] + 1,
                   control_end_reason="expired")
    return row


def control_session_payload(session_slug: str) -> dict[str, Any]:
    with _control_lock():
        state = _control_state_locked(session_slug)
    return {
        "active": state["control_expires_at"] > 0,
        "expires_at": state["control_expires_at"] or None,
        "last_host_activity_at": state["last_host_activity_at"],
        "ended_reason": state["control_end_reason"],
        "timeout_seconds": CONTROL_TIMEOUT_SECONDS,
    }


def start_control_session(session_slug: str) -> None:
    """Only the authenticated host's explicit Start action calls this."""
    with _control_lock():
        state = _control_state_locked(session_slug)
        if not _has_stored_token(session_slug) or state["control_end_reason"] == "connection-error":
            raise ValueError("Connect Spotify from the host desk before starting a session.")
        now = time.time()
        with _connect() as conn:
            conn.execute(
                """UPDATE loudsource_sessions SET control_expires_at=?, last_host_activity_at=?,
                    control_generation=control_generation+1, control_end_reason=NULL,
                    auto_enabled=0, last_paused_ts=NULL, queued_next_for_uri=NULL
                    WHERE session_slug=?""",
                (now + CONTROL_TIMEOUT_SECONDS, now, session_slug),
            )
        log(f"Spotify session started for {session_slug}; expires_at={int(now + CONTROL_TIMEOUT_SECONDS)}")


def end_control_session(session_slug: str, reason: str = "host-ended") -> None:
    """Stop requests without sending Spotify a pause or deleting saved tokens."""
    with _control_lock():
        ensure_session(session_slug)
        _end_control_locked(session_slug, reason)


@contextmanager
def spotify_operation(session_slug: str, generation: int | None = None, *, host_action: bool = False):
    """Check consent at each network boundary; cached clients carry a generation.

    Background work and passive status reads never renew permission. Only
    explicitly selected host Spotify controls use host_action=True.
    """
    with _control_lock():
        state = _control_state_locked(session_slug)
        if not state["control_expires_at"] or (generation is not None and generation != state["control_generation"]):
            raise SpotifySessionInactive()
        if host_action:
            now = time.time()
            with _connect() as conn:
                conn.execute(
                    "UPDATE loudsource_sessions SET control_expires_at=?, last_host_activity_at=? WHERE session_slug=?",
                    (now + CONTROL_TIMEOUT_SECONDS, now, session_slug),
                )
        yield state["control_generation"]


class _ControlledSpotify:
    """No client retained by an old loop iteration can outlive its permission."""

    def __init__(self, session_slug: str, generation: int, client):
        self._session_slug = session_slug
        self._generation = generation
        self._client = client

    def __getattr__(self, name):
        method = getattr(self._client, name)
        if not callable(method):
            raise AttributeError(name)

        def call(*args, **kwargs):
            with spotify_operation(self._session_slug, self._generation):
                try:
                    result = method(*args, **kwargs)
                except spotipy.SpotifyException as exc:
                    if exc.http_status == 401:
                        _end_control_locked(self._session_slug, "connection-error")
                        message = "Spotify needs to be reconnected from the host desk."
                        _CONNECTION_ERRORS[self._session_slug] = message
                        # Do not fall through to another playback endpoint using
                        # credentials Spotify has just rejected.
                        raise SpotifySessionInactive(message) from exc
                    raise
                if name in {"start_playback", "pause_playback", "transfer_playback"}:
                    log(f"Host Spotify control for {self._session_slug}: {name}")
                return result
        return call


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
    _TOKEN_RETRY_AFTER.pop(session_slug, None)
    _CONNECTION_ERRORS.pop(session_slug, None)


def get_token(session_slug: str) -> dict[str, Any] | None:
    try:
        with spotify_operation(session_slug):
            with _TOKEN_LOCK:
                return _get_token_locked(session_slug)
    except SpotifySessionInactive:
        return None


def _get_token_locked(session_slug: str) -> dict[str, Any] | None:
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
        _end_control_locked(session_slug, "connection-error")
        _CONNECTION_ERRORS[session_slug] = "Spotify needs to be reconnected from the host desk."
        return None
    try:
        refreshed = _oauth().refresh_access_token(token_info["refresh_token"])
        if not refreshed.get("refresh_token"):
            refreshed["refresh_token"] = token_info["refresh_token"]
        save_token(session_slug, refreshed)
        return refreshed
    except Exception as exc:
        log(f"Token refresh failed for {session_slug} ({type(exc).__name__})")
        _end_control_locked(session_slug, "connection-error")
        _CONNECTION_ERRORS[session_slug] = "Spotify needs to be reconnected from the host desk."
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
        requests_timeout=8,
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
    # This exchange is explicitly requested by Connect Spotify. Connecting and
    # retaining credentials does not authorize ongoing requests or playback.
    with _control_lock():
        ensure_session(session_slug)
        _end_control_locked(session_slug, "reconnecting")
        try:
            token_info = _oauth().get_access_token(code=code, check_cache=False)
            if not token_info.get("refresh_token"):
                with _connect() as conn:
                    existing = conn.execute("SELECT spotify_refresh_token FROM loudsource_sessions WHERE session_slug=?", (session_slug,)).fetchone()
                if existing and existing[0]:
                    token_info["refresh_token"] = existing[0]
            save_token(session_slug, token_info)
        except Exception as exc:
            _end_control_locked(session_slug, "connection-error")
            message = "Spotify could not connect. Reconnect from the host desk before starting a session."
            _CONNECTION_ERRORS[session_slug] = message
            raise ValueError(message) from exc
        _end_control_locked(session_slug, "reconnected")
    return session_slug, next_url


def _user_sp(session_slug: str):
    try:
        with spotify_operation(session_slug) as generation:
            token_info = get_token(session_slug)
            if not token_info:
                return None
            client = spotipy.Spotify(auth=token_info["access_token"], requests_timeout=8, retries=0, status_retries=0)
            return _ControlledSpotify(session_slug, generation, client)
    except SpotifySessionInactive:
        return None


def _list_devices(sp_user) -> list[dict[str, Any]]:
    try:
        return sp_user.devices().get("devices", [])
    except SpotifySessionInactive:
        raise
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
        # Background metadata lookup must use the same guarded room client.
        sp = sp_user
        if sp is None:
            return
        info = sp.track(track_id)
        upsert_track(track_id, _track_dict_from_sp_item(info))
    except SpotifySessionInactive:
        raise
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
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM loudsource_votes WHERE session_slug = ?", (session_slug,))
        conn.execute("DELETE FROM loudsource_ballots WHERE session_slug = ?", (session_slug,))
        conn.execute("DELETE FROM loudsource_requests WHERE session_slug = ?", (session_slug,))
        conn.commit()


def remove_vote(session_slug: str, track_id: str) -> None:
    session_slug = ensure_session(session_slug)
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "DELETE FROM loudsource_votes WHERE session_slug = ? AND track_id = ?",
            (session_slug, track_id),
        )
        conn.execute("DELETE FROM loudsource_ballots WHERE session_slug = ? AND track_id = ?", (session_slug, track_id))
        conn.execute("DELETE FROM loudsource_requests WHERE session_slug = ? AND track_id = ?", (session_slug, track_id))
        conn.commit()


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


def list_active_sessions() -> list[tuple[str, int]]:
    with _control_lock():
        with _connect() as conn:
            expired = conn.execute(
                "SELECT session_slug FROM loudsource_sessions WHERE control_expires_at>0 AND control_expires_at<=?",
                (time.time(),),
            ).fetchall()
        for row in expired:
            _end_control_locked(row["session_slug"], "expired")
        with _connect() as conn:
            rows = conn.execute(
                """SELECT session_slug, control_generation FROM loudsource_sessions
                    WHERE control_expires_at>? AND spotify_access_token IS NOT NULL""",
                (time.time(),),
            ).fetchall()
    return [(row["session_slug"], row["control_generation"]) for row in rows]


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
    except SpotifySessionInactive:
        raise
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
    except SpotifySessionInactive:
        raise
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
            with _connect() as conn:
                conn.execute("INSERT INTO loudsource_history (session_slug, track_id, played_at) VALUES (?, ?, ?)", (session_slug, popped_tid, int(now)))
                conn.execute("DELETE FROM loudsource_history WHERE session_slug = ? AND id NOT IN (SELECT id FROM loudsource_history WHERE session_slug = ? ORDER BY id DESC LIMIT 30)", (session_slug, session_slug))
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


def _queue_next_for_snapshot(session_slug: str, snapshot: dict[str, Any], generation: int | None = None) -> tuple[bool, str]:
    with spotify_operation(session_slug, generation) as current_generation:
        if not get_state(session_slug)["auto_enabled"]:
            return False, "auto_queue_disabled"
        return _queue_next_locked(session_slug, snapshot, current_generation)


def _queue_next_locked(session_slug: str, snapshot: dict[str, Any], generation: int) -> tuple[bool, str]:
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
        # Refreshing a token can take time; recheck immediately before the write.
        with spotify_operation(session_slug, generation):
            response = requests.post(
                "https://api.spotify.com/v1/me/player/queue",
                headers=headers,
                params={"uri": next_uri},
                timeout=8,
                allow_redirects=False,
            )
        if response.status_code == 401:
            _end_control_locked(session_slug, "connection-error")
            message = "Spotify needs to be reconnected from the host desk."
            _CONNECTION_ERRORS[session_slug] = message
            raise SpotifySessionInactive(message)
        if response.status_code in (200, 204):
            mark_queued_for_snapshot(session_slug, snapshot["uri"], time.time() + 1.0)
            log(f"Spotify auto queue for {session_slug}: added voted track")
            return True, next_uri
        return False, f"status={response.status_code} body={response.text}"
    except SpotifySessionInactive:
        raise
    except Exception as exc:
        return False, str(exc)


def _monitor_once() -> None:
    for session_slug, generation in list_active_sessions():
        try:
            with spotify_operation(session_slug, generation):
                sp_user = _user_sp(session_slug)
                if not sp_user:
                    _CONNECTION_ERRORS[session_slug] = "Spotify needs to be reconnected from the host desk."
                    continue
                _CONNECTION_ERRORS.pop(session_slug, None)
                snapshot = _playback_snapshot(session_slug, sp_user)
                if not snapshot:
                    _active_device(session_slug, sp_user)
                    continue
                _update_now_playing_from_snapshot(session_slug, sp_user, snapshot)
                state = get_state(session_slug)
                # A manual pause is always respected, including when a legacy
                # LOUDSOURCE_AUTO_RESUME=true setting remains on the service.
                if state["auto_enabled"] and time.time() >= (state["cooldown_until"] or 0) and _should_attempt_queue(snapshot):
                    _queue_next_for_snapshot(session_slug, snapshot, generation)
        except SpotifySessionInactive:
            continue
        except Exception as exc:
            log(f"Monitor error for {session_slug} ({type(exc).__name__})")


def _background_loop() -> None:
    count = len(list_active_sessions())
    log(f"Spotify monitor started: {count} active control sessions; inactive sessions make no Spotify requests")
    while True:
        try:
            _monitor_once()
        except Exception as exc:
            log(f"Background loop error ({type(exc).__name__})")
        time.sleep(POLL_SECONDS)


def ensure_monitor_started() -> None:
    global _BG_STARTED
    if os.getenv("LOUDSOURCE_DISABLE_MONITOR") == "1":
        return
    with _BG_LOCK:
        if _BG_STARTED:
            return
        threading.Thread(target=_background_loop, daemon=True).start()
        _BG_STARTED = True


def search_tracks(query: str, session_slug: str) -> dict[str, dict[str, Any]]:
    with spotify_operation(session_slug):
        return _search_tracks_locked(query)


def _search_tracks_locked(query: str) -> dict[str, dict[str, Any]]:
    query = (query or "").strip()[:150]
    if not query:
        return {}
    if sp_search is None:
        raise RuntimeError("Spotify client credentials are not configured")
    with _SEARCH_LOCK:
        cached = _SEARCH_CACHE.get(query.casefold())
        if cached and cached[0] > time.time() - 60:
            return cached[1]
        track_match = re.fullmatch(r"(?:spotify:track:|https://open\.spotify\.com/(?:intl-[a-z]+/)?track/)([A-Za-z0-9]{22})(?:\?[^\s]*)?", query)
        if track_match:
            items = [sp_search.track(track_match.group(1))]
        else:
            items = sp_search.search(q=query, type="track", limit=10)["tracks"]["items"]
        results: dict[str, dict[str, Any]] = {}
        for item in items:
            if not item or not _is_valid_track_id(item.get('id')):
                continue
            meta = _track_dict_from_sp_item(item)
            upsert_track(item["id"], meta)
            results[item["id"]] = meta
        if len(_SEARCH_CACHE) > 250:
            _SEARCH_CACHE.clear()
        _SEARCH_CACHE[query.casefold()] = (time.time(), results)
        return results


def play_first(session_slug: str) -> tuple[bool, str]:
    if not _PLAY_LOCK.acquire(blocking=False):
        return False, "Playback is already being changed. Give it a moment."
    try:
        with spotify_operation(session_slug, host_action=True):
            return _play_first_locked(session_slug)
    finally:
        _PLAY_LOCK.release()


def _play_first_locked(session_slug: str) -> tuple[bool, str]:
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
        return False, "Spotify could not start playback. Check that the host has Premium and an active Spotify device, then try reconnecting."
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
    control = control_session_payload(session_slug)
    state = get_state(session_slug)
    uri = state["current_uri"]
    duration_sec = state["current_duration_sec"]
    progress_sec = state["current_progress_sec"]
    is_playing = state["current_is_playing"]
    now_playing = None
    if control["active"] and uri and uri.startswith("spotify:track:"):
        track_id = uri.split(":")[-1]
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
                "duration_sec": duration_sec,
                "progress_sec": progress_sec,
                "is_playing": is_playing,
            }
    exclude_tid = uri.split(":")[-1] if uri and uri.startswith("spotify:track:") else None
    ids = _ordered_ids(session_slug, exclude_tid=exclude_tid)
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
        "authed": _has_stored_token(session_slug),
        "connection_error": _CONNECTION_ERRORS.get(session_slug) or (
            "Spotify needs to be reconnected from the host desk."
            if control["ended_reason"] == "connection-error" else None
        ),
        "ahead_seconds": QUEUE_AHEAD_SECONDS,
        "poll_seconds": POLL_SECONDS,
        "auto_enabled": state["auto_enabled"],
        "control_session": control,
        "now_playing": now_playing,
        "queue": queue_payload,
        "active_device_name": state["active_device_name"] if control["active"] else None,
        "queued_next_for_uri": state["queued_next_for_uri"],
        "next_candidate_tid": _candidate_next_tid(session_slug, uri),
        "ts": int(time.time()),
    }


def _has_stored_token(session_slug: str) -> bool:
    with _connect() as conn:
        row = conn.execute("SELECT spotify_access_token FROM loudsource_sessions WHERE session_slug = ?", (session_slug,)).fetchone()
    return bool(row and row[0])


def devices_payload(session_slug: str) -> dict[str, Any]:
    with spotify_operation(session_slug, host_action=True):
        return _devices_payload_locked(session_slug)


def _devices_payload_locked(session_slug: str) -> dict[str, Any]:
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
