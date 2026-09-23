"""Dedicated Render entry point, sharing Daily Flyer's Flask/Gunicorn stack."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
from contextlib import contextmanager

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from ww2_tactics.engine import initial, apply, options, terrain, WIDTH, HEIGHT
from ww2_tactics.scenarios import battlefield, catalog, get_scenario
from ww2_tactics.computer import play_turn


def create_app(db_path=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 4096
    path = Path(db_path or os.environ.get("WW2_DB_PATH", "instance/ww2.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    @contextmanager
    def connect():
        db = sqlite3.connect(path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    with connect() as db:
        db.execute("CREATE TABLE IF NOT EXISTS match (slot INTEGER PRIMARY KEY CHECK(slot=1), code TEXT, host TEXT, guest TEXT, state TEXT)")

    def digest(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def identify(row):
        hashed = digest(request.headers.get("Authorization", "").removeprefix("Bearer "))
        if secrets.compare_digest(hashed, row["host"]):
            return "us"
        if row["guest"] and secrets.compare_digest(hashed, row["guest"]):
            return "de"
        return None

    def public(row, side):
        state = json.loads(row["state"])
        board = battlefield(state)
        state.update(code=row["code"], side=side,
                     map=board['map'], scenario={k: v for k, v in board.items() if k != 'map'})
        state["legal"] = {u["id"]: options(state, u) for u in state["units"] if u["side"] == side}
        return state

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.get("/")
    def home():
        return send_from_directory("ww2_tactics/static", "index.html")

    @app.get("/assets/<path:name>")
    def assets(name):
        return send_from_directory("ww2_tactics/static", name)

    @app.get("/healthz")
    def health():
        with connect() as db:
            db.execute("SELECT 1 FROM match LIMIT 1")
        return jsonify(ok=True)

    @app.get('/api/scenarios')
    def scenarios():
        return jsonify(scenarios=catalog())

    def scenario_input():
        body = request.get_json(silent=True)
        if body is None:
            body = {}
        if not isinstance(body, dict):
            raise ValueError('Expected a match settings object.')
        return get_scenario(body.get('scenario', 'village'))['id']

    def new_battle(scenario):
        body = request.get_json(silent=True) or {}
        mode = body.get('opponent', 'human')
        if mode not in ('human', 'computer'):
            raise ValueError('Choose a human or computer opponent.')
        state = initial(scenario)
        if mode == 'computer':
            state.update(ai_side='de', ready=True)
            state['log'].append('Solo battle: you command the Americans; the computer commands the Germans.')
        return state

    @app.post("/api/match")
    def create():
        try:
            scenario = scenario_input()
            state = new_battle(scenario)
        except ValueError as error:
            return jsonify(error=str(error)), 400
        token = secrets.token_urlsafe(32)
        code = secrets.token_hex(5).upper()
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("SELECT * FROM match WHERE slot=1").fetchone()
            if existing:
                return jsonify(error="A match already exists. Rejoin on your original browser, or ask its American player to start a new match."), 409
            db.execute("INSERT INTO match VALUES (1,?,?,?,?)", (code, digest(token), None, json.dumps(state)))
        return jsonify(code=code, token=token), 201

    @app.post("/api/match/<code>/join")
    def join(code):
        token = secrets.token_urlsafe(32)
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM match WHERE code=?", (code.upper(),)).fetchone()
            if row is None:
                return jsonify(error="Match not found. Check the invitation code."), 404
            if json.loads(row['state']).get('ai_side'):
                return jsonify(error='This is a solo battle. The computer seat cannot be joined.'), 409
            if row["guest"]:
                return jsonify(error="Both seats are taken. Use your original browser to reconnect."), 409
            if identify(row) == "us":
                return jsonify(error="You already command the Americans. Open the invitation on the other phone."), 409
            state = json.loads(row["state"])
            state["ready"] = True
            state["revision"] += 1
            state["log"].append("German player joined. The battle begins.")
            db.execute("UPDATE match SET guest=?, state=? WHERE slot=1", (digest(token), json.dumps(state)))
        return jsonify(code=code.upper(), token=token), 200

    @app.route("/api/match/<code>", methods=["GET", "POST"])
    def match(code):
        with connect() as db:
            if request.method == "POST":
                db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM match WHERE code=?", (code.upper(),)).fetchone()
            if row is None:
                return jsonify(error="This match no longer exists."), 404
            side = identify(row)
            if not side:
                return jsonify(error="Player key required. Rejoin using your original browser."), 403
            if request.method == "POST":
                body = request.get_json(silent=True)
                if not isinstance(body, dict):
                    return jsonify(error="Expected an action object."), 400
                state = json.loads(row["state"])
                if type(body.get("revision")) is not int or body["revision"] != state["revision"]:
                    return jsonify(error="The match changed. Refreshing the battlefield; try again."), 409
                try:
                    state = apply(state, side, body)
                    state = play_turn(state)
                except ValueError as error:
                    return jsonify(error=str(error)), 400
                db.execute("UPDATE match SET state=? WHERE slot=1", (json.dumps(state),))
                row = db.execute("SELECT * FROM match WHERE slot=1").fetchone()
            return jsonify(public(row, side))

    @app.post("/api/match/<code>/reset")
    def reset(code):
        try:
            scenario = scenario_input()
            state = new_battle(scenario)
        except ValueError as error:
            return jsonify(error=str(error)), 400
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM match WHERE code=?", (code.upper(),)).fetchone()
            if row is None or not identify(row) or (identify(row) != 'us' and not state.get('ai_side') and not json.loads(row['state']).get('ai_side')):
                return jsonify(error="Only the American host can start a new match."), 403
            # New code revokes both old seats; no accidental reuse of an old invitation.
            new_code, token = secrets.token_hex(5).upper(), secrets.token_urlsafe(32)
            db.execute("UPDATE match SET code=?,host=?,guest=NULL,state=? WHERE slot=1", (new_code, digest(token), json.dumps(state)))
        return jsonify(code=new_code, token=token)

    @app.post('/api/match/<code>/rematch')
    def rematch(code):
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify(error='Expected rematch settings.'), 400
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            side = identify(row) if row else None
            if not side:
                return jsonify(error='Player key required.'), 403
            state = json.loads(row['state'])
            if not state['ready']:
                return jsonify(error='Both commanders must join first.'), 400
            if type(body.get('revision')) is not int or body['revision'] != state['revision']:
                return jsonify(error='The match changed. Review the latest proposal and try again.'), 409
            operation = body.get('operation')
            if operation == 'propose':
                if state.get('rematch'):
                    return jsonify(error='Accept, decline, or cancel the pending proposal first.'), 409
                try:
                    scenario = get_scenario(body.get('scenario'))
                except ValueError as error:
                    return jsonify(error=str(error)), 400
                if type(body.get('swap')) is not bool:
                    return jsonify(error='Choose whether to swap armies.'), 400
                state['rematch'] = dict(by=side, scenario=scenario['id'], name=scenario['name'], swap=body['swap'])
                if state.get('ai_side'):
                    next_state = initial(scenario['id'])
                    next_state.update(ready=True, revision=state['revision'],
                                      ai_side=('us' if state['ai_side'] == 'de' else 'de') if body['swap'] else state['ai_side'],
                                      battle_number=state.get('battle_number', 1)+1,
                                      victories=state.get('victories', {'us': 0, 'de': 0}))
                    if body['swap']:
                        # Store an unguessable placeholder hash for the computer seat.
                        db.execute('UPDATE match SET host=?,guest=? WHERE slot=1',
                                   (row['guest'] or digest(secrets.token_urlsafe(32)), row['host']))
                        side = 'de' if side == 'us' else 'us'
                    state = play_turn(next_state)
            elif operation == 'decline':
                if not state.get('rematch'):
                    return jsonify(error='There is no pending proposal.'), 400
                state.pop('rematch')
            elif operation == 'accept':
                proposal = state.get('rematch')
                if not proposal or proposal['by'] == side:
                    return jsonify(error='Only the other commander can accept the proposal.'), 400
                next_state = initial(proposal['scenario'])
                next_state.update(ready=True, revision=state['revision'],
                                  battle_number=state.get('battle_number', 1)+1,
                                  victories=state.get('victories', {'us': int(state['winner'] == 'us'), 'de': int(state['winner'] == 'de')}))
                if proposal['swap']:
                    db.execute('UPDATE match SET host=?, guest=? WHERE slot=1', (row['guest'], row['host']))
                    side = 'de' if side == 'us' else 'us'
                state = next_state
            else:
                return jsonify(error='Invalid rematch operation.'), 400
            state['revision'] += 1
            db.execute('UPDATE match SET state=? WHERE slot=1', (json.dumps(state),))
            updated = db.execute('SELECT * FROM match WHERE slot=1').fetchone()
            return jsonify(public(updated, side))

    return app


app = create_app()
