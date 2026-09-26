"""Dedicated Render entry point, sharing Daily Flyer's Flask/Gunicorn stack."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
import re
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
        # Atomic upgrade of the original singleton table, preserving seats and state.
        db.execute("BEGIN IMMEDIATE")
        schema = db.execute("SELECT sql FROM sqlite_master WHERE name='match'").fetchone()
        if schema and 'CHECK' in schema['sql'].upper():
            db.execute('ALTER TABLE match RENAME TO legacy_match')
        db.execute("CREATE TABLE IF NOT EXISTS match (slot INTEGER PRIMARY KEY, code TEXT UNIQUE, host TEXT, guest TEXT, state TEXT)")
        if schema and 'CHECK' in schema['sql'].upper():
            db.execute('INSERT INTO match SELECT * FROM legacy_match')
            db.execute('DROP TABLE legacy_match')
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS match_code ON match(code)')
        db.execute('CREATE TABLE IF NOT EXISTS player_access (key_hash TEXT PRIMARY KEY, owner_hash TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS transfers (key_hash TEXT PRIMARY KEY, code TEXT, owner_hash TEXT, expires REAL)')
        db.execute('CREATE TABLE IF NOT EXISTS saves (key_hash TEXT PRIMARY KEY, state TEXT, side TEXT, created REAL)')

    def digest(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def identify(row):
        hashed = digest(request.headers.get("Authorization", "").removeprefix("Bearer "))
        with connect() as db:
            alias = db.execute('SELECT owner_hash FROM player_access WHERE key_hash=?', (hashed,)).fetchone()
        if alias:
            hashed = alias['owner_hash']
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
            db.execute("INSERT INTO match (code,host,guest,state) VALUES (?,?,?,?)", (code, digest(token), None, json.dumps(state)))
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
            db.execute("UPDATE match SET guest=?, state=? WHERE code=?", (digest(token), json.dumps(state), row["code"]))
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
                db.execute("UPDATE match SET state=? WHERE code=?", (json.dumps(state), row["code"]))
                row = db.execute("SELECT * FROM match WHERE code=?", (row["code"],)).fetchone()
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
            db.execute("UPDATE match SET code=?,host=?,guest=NULL,state=? WHERE code=?", (new_code, digest(token), json.dumps(state), row["code"]))
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
                        db.execute('UPDATE match SET host=?,guest=? WHERE code=?',
                                   (row['guest'] or digest(secrets.token_urlsafe(32)), row['host'], row['code']))
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
                    db.execute('UPDATE match SET host=?, guest=? WHERE code=?', (row['guest'], row['host'], row['code']))
                    side = 'de' if side == 'us' else 'us'
                state = next_state
            else:
                return jsonify(error='Invalid rematch operation.'), 400
            state['revision'] += 1
            db.execute('UPDATE match SET state=? WHERE code=?', (json.dumps(state), row['code']))
            updated = db.execute('SELECT * FROM match WHERE code=?', (row['code'],)).fetchone()
            return jsonify(public(updated, side))

    def secret_code(prefix):
        raw = secrets.token_hex(16).upper()
        return prefix + '-' + '-'.join(raw[i:i+4] for i in range(0, len(raw), 4))

    def read_code(prefix):
        body = request.get_json(silent=True)
        value = body.get('code') if isinstance(body, dict) else None
        if not isinstance(value, str):
            return None
        value = re.sub(r'[\s-]', '', value).upper()
        if not re.fullmatch(prefix + r'[0-9A-F]{32}', value):
            return None
        return digest(value)

    def code_hash(value):
        return digest(value.replace('-', ''))

    @app.post('/api/match/<code>/transfer')
    def transfer(code):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            side = identify(row) if row else None
            if not side:
                return jsonify(error='Player key required.'), 403
            value = secret_code('MOVE')
            owner = row['host' if side == 'us' else 'guest']
            db.execute('DELETE FROM transfers WHERE expires < ?', (time.time(),))
            db.execute('INSERT INTO transfers VALUES (?,?,?,?)',
                       (code_hash(value), row['code'], owner, time.time()+900))
        return jsonify(transfer_code=value, expires_in=900)

    @app.post('/api/transfer')
    def redeem_transfer():
        key = read_code('MOVE')
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            ticket = db.execute('SELECT * FROM transfers WHERE key_hash=?', (key,)).fetchone()
            row = db.execute('SELECT * FROM match WHERE code=?', (ticket['code'],)).fetchone() if ticket else None
            if not ticket or ticket['expires'] < time.time() or not row or ticket['owner_hash'] not in (row['host'], row['guest']):
                return jsonify(error='Transfer code is invalid, expired, or already used. Generate another on your original device.'), 400
            token = secrets.token_urlsafe(32)
            db.execute('INSERT INTO player_access VALUES (?,?)', (digest(token), ticket['owner_hash']))
            db.execute('DELETE FROM transfers WHERE key_hash=?', (key,))
        return jsonify(code=row['code'], token=token)

    @app.post('/api/match/<code>/save')
    def save(code):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            side = identify(row) if row else None
            if not side:
                return jsonify(error='Player key required.'), 403
            state = json.loads(row['state'])
            if not state.get('ai_side'):
                return jsonify(error='Save codes are for solo battles. Use a transfer code to continue this multiplayer match.'), 400
            body = request.get_json(silent=True)
            if not isinstance(body, dict) or type(body.get('revision')) is not int or body['revision'] != state['revision']:
                return jsonify(error='The battle changed. Reconnect, then generate your save code again.'), 409
            value = secret_code('SAVE')
            db.execute('INSERT INTO saves VALUES (?,?,?,?)', (code_hash(value), row['state'], side, time.time()))
        return jsonify(save_code=value, round=state['round'], revision=state['revision'])

    @app.post('/api/restore')
    def restore():
        key = read_code('SAVE')
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            saved = db.execute('SELECT * FROM saves WHERE key_hash=?', (key,)).fetchone()
            if not saved:
                return jsonify(error='Save code not found. Check the code and use the same site where you saved it.'), 400
            code, token = secrets.token_hex(5).upper(), secrets.token_urlsafe(32)
            player, computer = digest(token), digest(secrets.token_urlsafe(32))
            host, guest = (player, computer) if saved['side'] == 'us' else (computer, player)
            # Copy the exact checkpoint. Never resolve a turn or reroll during restore.
            db.execute('INSERT INTO match (code,host,guest,state) VALUES (?,?,?,?)',
                       (code, host, guest, saved['state']))
        return jsonify(code=code, token=token), 201

    return app


app = create_app()
