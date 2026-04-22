"""Patch the existing web.py roughly like this."""

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

# ... keep your existing imports and app setup ...

init_storage()
ensure_monitor_started()


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
