import os
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_from_directory

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.theme_validation import ThemeNotFoundError, ThemeValidationError
from daily_flyer.vinyl_data import MusicBrainzUnavailable, explore_albums, get_release, search_albums, search_releases

app = Flask(__name__)
REPO_ROOT = Path(__file__).resolve().parent

DEFAULT_THEME = os.environ.get("DEFAULT_THEME", "irish_today")
THEME_ROUTE_ALIASES = {
    "irish_today": "irish_today_improved_layout",
    "irish_today_improved": "irish_today_improved_layout",
    "irish_today_visual_lab": "irish_today_visual_lab_debug_safe",
}


def _normalize_theme_name(raw: str | None) -> str:
    """Return a Python module-safe Daily Flyer theme name.

    Render env vars and URLs are easy places to type theme names with hyphens
    (`topic-signal-daily`), while Daily Flyer theme modules use underscores
    (`topic_signal_daily`). Accept both spellings at the web boundary.
    """
    theme_name = (raw or DEFAULT_THEME).strip().replace("-", "_")
    if not theme_name:
        theme_name = DEFAULT_THEME.strip().replace("-", "_")

    if not theme_name.replace("_", "").isalnum():
        abort(400, description="Invalid theme name.")

    return THEME_ROUTE_ALIASES.get(theme_name, theme_name)


# Backward-compatible name for existing tests/imports.
_clean_theme_name = _normalize_theme_name


def _parse_seed(raw: str | None) -> int | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        abort(400, description="Invalid seed value.")


@app.route("/")
def home():
    theme_name = _normalize_theme_name(request.args.get("theme"))
    date_str = (request.args.get("date") or "").strip() or None
    seed = _parse_seed(request.args.get("seed"))

    try:
        context = build_daily_page(
            theme_name=theme_name,
            date_str=date_str,
            seed=seed,
        )
    except ThemeNotFoundError as exc:
        abort(400, description=str(exc))
    except ThemeValidationError as exc:
        abort(400, description=str(exc))
    except ValueError as exc:
        abort(400, description=str(exc) or "Invalid request.")

    html = build_html(context)
    return Response(html, mimetype="text/html")


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)


@app.get("/api/vinyl/search")
def vinyl_search():
    artist = (request.args.get("artist") or "").strip()
    title = (request.args.get("title") or "").strip()
    catalog = (request.args.get("catalog") or "").strip()
    if not artist or not title or len(artist) > 120 or len(title) > 120 or len(catalog) > 80:
        abort(400, description="Enter an artist and album title (120 characters maximum each).")
    try:
        return jsonify({"releases": search_releases(artist, title, catalog)})
    except MusicBrainzUnavailable as exc:
        return jsonify({"error": str(exc)}), 503


@app.get("/api/vinyl/release/<release_id>")
def vinyl_release(release_id: str):
    try:
        return jsonify(get_release(release_id))
    except ValueError as exc:
        abort(400, description=str(exc))
    except MusicBrainzUnavailable as exc:
        return jsonify({"error": str(exc)}), 503


@app.get("/api/vinyl/albums")
def vinyl_albums():
    title = (request.args.get("title") or "").strip()
    if not title or len(title) > 120:
        abort(400, description="Enter an album name (120 characters maximum).")
    try:
        return jsonify({"albums": search_albums(title)})
    except MusicBrainzUnavailable as exc:
        return jsonify({"error": str(exc)}), 503


@app.post("/api/vinyl/explore")
def vinyl_explore():
    payload = request.get_json(silent=True) or {}
    group_ids = payload.get("album_ids")
    if not isinstance(group_ids, list):
        abort(400, description="Choose one or two albums.")
    try:
        return jsonify(explore_albums(group_ids))
    except ValueError as exc:
        abort(400, description=str(exc))
    except MusicBrainzUnavailable as exc:
        return jsonify({"error": str(exc)}), 503
