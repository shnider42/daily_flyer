import os
from pathlib import Path

from flask import Flask, Response, abort, jsonify, redirect, request, send_from_directory

from daily_flyer.loudsource_feature import (
    clear_votes,
    devices_payload,
    ensure_monitor_started,
    get_authorize_url,
    handle_callback,
    init_storage,
    normalize_session_slug,
    play_first,
    search_tracks,
    status_payload,
    vote_delta,
)
from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.theme_validation import ThemeNotFoundError, ThemeValidationError

app = Flask(__name__)
REPO_ROOT = Path(__file__).resolve().parent

DEFAULT_THEME = os.environ.get("DEFAULT_THEME", "irish_today")

# LoudSource feature-service startup.
init_storage()
ensure_monitor_started()


def _clean_theme_name(raw: str | None) -> str:
    theme_name = (raw or DEFAULT_THEME).strip()
    if not theme_name:
        return DEFAULT_THEME

    if not theme_name.replace("_", "").isalnum():
        abort(400, description="Invalid theme name.")

    return theme_name


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
    theme_name = _clean_theme_name(request.args.get("theme"))
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


@app.route("/api/loudsource/<session_slug>/status")
def loudsource_status(session_slug: str):
    try:
        payload = status_payload(session_slug)
    except ValueError as exc:
        abort(400, description=str(exc))
    return jsonify(payload)


@app.route("/api/loudsource/<session_slug>/devices")
def loudsource_devices(session_slug: str):
    try:
        payload = devices_payload(session_slug)
    except ValueError as exc:
        abort(400, description=str(exc))
    return jsonify(payload)


@app.route("/api/loudsource/<session_slug>/search")
def loudsource_search(session_slug: str):
    try:
        normalize_session_slug(session_slug)
    except ValueError as exc:
        abort(400, description=str(exc))

    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"results": {}})

    try:
        results = search_tracks(query)
    except Exception as exc:
        abort(500, description=str(exc))
    return jsonify({"results": results})


@app.route("/api/loudsource/<session_slug>/vote", methods=["POST"])
def loudsource_vote(session_slug: str):
    payload = request.get_json(silent=True) or request.form
    track_id = (payload.get("track_id") or "").strip()
    if not track_id:
        abort(400, description="Missing track_id")
    vote_delta(session_slug, track_id, +1)
    return jsonify({"ok": True})


@app.route("/api/loudsource/<session_slug>/downvote", methods=["POST"])
def loudsource_downvote(session_slug: str):
    payload = request.get_json(silent=True) or request.form
    track_id = (payload.get("track_id") or "").strip()
    if not track_id:
        abort(400, description="Missing track_id")
    vote_delta(session_slug, track_id, -1)
    return jsonify({"ok": True})


@app.route("/api/loudsource/<session_slug>/clear", methods=["POST"])
def loudsource_clear(session_slug: str):
    clear_votes(session_slug)
    return jsonify({"ok": True})


@app.route("/api/loudsource/<session_slug>/play-first", methods=["POST"])
def loudsource_play_first(session_slug: str):
    ok, message = play_first(session_slug)
    status_code = 200 if ok else 400
    return jsonify({"ok": ok, "message": message}), status_code


@app.route("/api/loudsource/<session_slug>/login")
def loudsource_login(session_slug: str):
    next_url = (request.args.get("next") or "").strip() or f"/?theme=loudsource&room={session_slug}"
    return redirect(get_authorize_url(session_slug, next_url))


@app.route("/api/loudsource/callback")
def loudsource_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    if not code:
        abort(400, description="Missing code")
    try:
        session_slug, next_url = handle_callback(code, state)
    except ValueError as exc:
        abort(400, description=str(exc))
    return redirect(next_url or f"/?theme=loudsource&room={session_slug}")


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)
