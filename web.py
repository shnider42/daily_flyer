import os
import secrets
from urllib.parse import urlsplit, parse_qs
from pathlib import Path

from flask import Flask, Response, abort, jsonify, redirect, request, send_from_directory, session
from werkzeug.exceptions import HTTPException

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
from daily_flyer import loudsource_feature as ls
from daily_flyer import party_api as party
from daily_flyer.storage_check import check_storage

app = Flask(__name__)
app.json.sort_keys = False  # Preserve Spotify relevance and the numbered pack order.
REPO_ROOT = Path(__file__).resolve().parent

DEFAULT_THEME = os.environ.get("DEFAULT_THEME", "irish_today")

# LoudSource feature-service startup.
check_storage(ls.DB_PATH)
init_storage()
party.init_party()
app.register_blueprint(party.bp)
app.config['MAX_CONTENT_LENGTH'] = 8192
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax')
if os.environ.get('FLASK_SECRET_KEY'):
    app.secret_key = os.environ['FLASK_SECRET_KEY']
else:
    secret_file = ls.DB_PATH.parent / '.loudsource-session-key'
    if not secret_file.exists():
        try:
            fd = os.open(str(secret_file), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as f:
                f.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    app.secret_key = secret_file.read_text()


@app.before_request
def start_worker_monitor():
    # Gunicorn can preload this module in its master. Starting a thread there
    # can leave SQLite/Python locks held across fork and stall worker requests.
    ensure_monitor_started()


@app.errorhandler(HTTPException)
def api_error(exc):
    if request.path.startswith('/api/'):
        return jsonify(error=exc.description), exc.code
    return exc


@app.errorhandler(ValueError)
def value_error(exc):
    return jsonify(error=str(exc)), 400


@app.before_request
def same_origin_writes():
    if request.method == 'POST' and request.path.startswith('/api/'):
        origin = request.headers.get('Origin')
        if origin and urlsplit(origin).netloc != request.host:
            abort(403, description='Please use the party page to make changes.')


@app.after_request
def response_headers(response):
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    return response


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
    if theme_name == 'loudsource' or not request.args.get('theme'):
        return send_from_directory(REPO_ROOT / 'daily_flyer' / 'party', 'index.html')
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
    party.person(session_slug)
    try:
        payload = status_payload(session_slug)
    except ValueError as exc:
        abort(400, description=str(exc))
    return jsonify(payload)


@app.route("/api/loudsource/<session_slug>/devices")
def loudsource_devices(session_slug: str):
    party.require_host(session_slug)
    try:
        payload = devices_payload(session_slug)
    except ValueError as exc:
        abort(400, description=str(exc))
    return jsonify(payload)


@app.route("/api/loudsource/<session_slug>/search")
def loudsource_search(session_slug: str):
    p = party.person(session_slug)
    party.rate(('search', p['id']), 20)
    try:
        normalize_session_slug(session_slug)
    except ValueError as exc:
        abort(400, description=str(exc))

    query = (request.args.get("q") or "").strip()[:150]
    if not query:
        return jsonify({"results": {}})

    try:
        results = search_tracks(query)
    except Exception:
        abort(503, description='Spotify search is unavailable right now. Try again shortly; the host can check the Spotify connection.')
    return jsonify({"results": results})


@app.route("/api/loudsource/<session_slug>/vote", methods=["POST"])
def loudsource_vote(session_slug: str):
    p = party.person(session_slug)
    payload = request.get_json(silent=True) or request.form
    track_id = (payload.get("track_id") or "").strip()
    if not track_id:
        abort(400, description="Missing track_id")
    party.music_vote(session_slug, p, track_id, True)
    return jsonify({"ok": True})


@app.route("/api/loudsource/<session_slug>/downvote", methods=["POST"])
def loudsource_downvote(session_slug: str):
    p = party.person(session_slug)
    payload = request.get_json(silent=True) or request.form
    track_id = (payload.get("track_id") or "").strip()
    if not track_id:
        abort(400, description="Missing track_id")
    party.music_vote(session_slug, p, track_id, False)
    return jsonify({"ok": True})


@app.route("/api/loudsource/<session_slug>/clear", methods=["POST"])
def loudsource_clear(session_slug: str):
    party.require_host(session_slug)
    clear_votes(session_slug)
    return jsonify({"ok": True})


@app.route("/api/loudsource/<session_slug>/play-first", methods=["POST"])
def loudsource_play_first(session_slug: str):
    party.require_host(session_slug)
    ok, message = play_first(session_slug)
    status_code = 200 if ok else 400
    return jsonify({"ok": ok, "message": message}), status_code


@app.route("/api/loudsource/<session_slug>/login")
def loudsource_login(session_slug: str):
    room = normalize_session_slug(session_slug)
    return redirect(f'/?room={room}&host=1')


@app.post('/api/loudsource/<session_slug>/connect')
def loudsource_connect(session_slug):
    party.require_host(session_slug)
    try:
        url = get_authorize_url(session_slug, f'/?room={session_slug}')
    except RuntimeError:
        abort(503, description='Spotify app settings are missing on this server.')
    session['ls_oauth_state'] = parse_qs(urlsplit(url).query)['state'][0]
    return jsonify(url=url)


@app.route("/api/loudsource/callback")
def loudsource_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    expected = session.pop('ls_oauth_state', None)
    if not expected or not state or not secrets.compare_digest(state, expected):
        abort(400, description='This Spotify sign-in expired. Return to Loudsource and connect again from the host desk.')
    if not code:
        abort(400, description="Missing code")
    try:
        session_slug, next_url = handle_callback(code, state)
    except ValueError as exc:
        abort(400, description=str(exc))
    if not next_url or not next_url.startswith('/') or next_url.startswith('//'):
        next_url = f'/?room={session_slug}'
    return redirect(next_url)


@app.get('/health')
def health():
    return jsonify(ok=True, app='loudsource-party', version='1.0.0')


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    if Path(filename).suffix in {".py", ".pyc", ".db"}:
        abort(404)
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)
