"""Dedicated Render entry point, sharing Daily Flyer's Flask/Gunicorn stack."""
import hashlib
import faulthandler
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
import re
from contextlib import contextmanager

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException, InternalServerError
from ww2_tactics.engine import initial, apply, options, terrain, WIDTH, HEIGHT
from ww2_tactics.scenarios import battlefield, catalog, get_scenario
from ww2_tactics.computer import play_turn
from ww2_tactics.rulesets import profile, PROFILES
from ww2_tactics.visibility import public_state
from ww2_tactics.order_history import perform, status as history_status, KEY as HISTORY_KEY
from ww2_tactics.lobby import install_lobby
from ww2_tactics.admin import install_admin
from ww2_tactics.battle_setup import assignment, seats, carry_creator, result_summary
from ww2_tactics import cooperative, pipeline, jobs


def create_app(db_path=None, *, background_ai=None, start_worker=True):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 4096
    # Explicit-path test/CLI apps resolve synchronously unless requested;
    # the deployed entry point owns a durable queue independent of browsers.
    app.config['WW2_BACKGROUND_AI'] = (db_path is None and os.environ.get('WW2_BACKGROUND_AI', '1') == '1'
                                       if background_ai is None else background_ai)
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
        cooperative.install(db)
    with connect() as db:
        pipeline.install(db)
        jobs.install(db)
    queue = jobs.Queue(connect, app.logger)
    app.extensions['ww2_computer_queue'] = queue

    def digest(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def owner_key(db):
        hashed = digest(request.headers.get("Authorization", "").removeprefix("Bearer "))
        alias = db.execute('SELECT owner_hash FROM player_access WHERE key_hash=?', (hashed,)).fetchone()
        if alias:
            hashed = alias['owner_hash']
        return hashed

    def membership(db, row):
        return cooperative.member(db, row, owner_key(db)) if row else None

    def identify(db, row):
        hashed = owner_key(db)
        member = cooperative.member(db, row, hashed)
        if member:
            return db.execute('SELECT json_extract(state,?) FROM match WHERE code=?',
                              ('$.coop.players."' + member['player_id'] + '".side', row['code'])).fetchone()[0]
        side = ('us' if row['host'] and secrets.compare_digest(hashed, row['host']) else
                'de' if row['guest'] and secrets.compare_digest(hashed, row['guest']) else None)
        # A missing shared-battle membership must never fall back to whole-army
        # solo authority, or expose the other army's private cooperative state.
        if side and db.execute("SELECT json_type(state,'$.coop') FROM match WHERE code=?", (row['code'],)).fetchone()[0] == 'object':
            return None
        return side

    commander, bind_commander, battle_name, match_title, commander_side = install_lobby(app, connect, digest, identify, membership)
    install_admin(app, connect, commander, battle_name, path)
    from empires.web import install as install_empires
    install_empires(app, connect, commander)

    @app.before_request
    def normalize_live_match():
        code = (request.view_args or {}).get('code')
        if not code or not request.path.startswith('/api/match/'):
            return
        with connect() as db:
            # Unauthorized probes must not trigger an expensive one-time upgrade.
            row = db.execute('SELECT code,host,guest FROM match WHERE code=?', (code.upper(),)).fetchone()
            if not row or not identify(db, row):
                return
            version = db.execute("SELECT json_extract(state,'$.pipeline_version') FROM match WHERE code=?", (row['code'],)).fetchone()[0]
            if version != 2:
                db.execute('BEGIN IMMEDIATE')
                pipeline.migrate(db, code.upper())
                if app.config['WW2_BACKGROUND_AI']:
                    state = json.loads(db.execute('SELECT state FROM match WHERE code=?', (code.upper(),)).fetchone()[0])
                    queue.request(db, code.upper(), state, resume=bool(state.get('coop', {}).get('resolving')))

    def public(db, row, side):
        state = json.loads(row["state"])
        state.pop('_ai_progress', None)
        if app.config['WW2_BACKGROUND_AI']:
            state['background_ai'] = True
            state['computer_work'] = jobs.status(db, row['code'], state)
        state.pop('_spectator_ai_batch', None)
        member = membership(db, row) if state.get('coop') else None
        pid = member['player_id'] if member else None
        state['order_history'] = (dict(can_undo=False, can_redo=False, redo_required=False,
            undo_label='', redo_label='', reason='Shared battle orders are committed immediately.')
            if pid else history_status(state, side))
        state.pop(HISTORY_KEY, None)
        # Replay frames are already fog-filtered when the computer creates them.
        # Keep their immutable payload outside the deep-copied live projection.
        replay = state.pop('_coop_replays', {}).get(side) if pid else state.get('computer_playback')
        if pid and replay:
            state['computer_playback'] = replay
        if isinstance(replay, dict):
            state['computer_playback'] = {'id': replay.get('id')} if replay else {}
        board = battlefield(state)
        state.update(code=row["code"], side=side,
                     map=board['map'], scenario={k: v for k, v in board.items() if k != 'map'})
        state['battle_result'] = result_summary(state)
        if not state.get('ai_side'):
            # Presentation metadata is read after the gameplay commit.
            state['match_name'] = match_title(db, row['code'])
        from ww2_tactics.visibility import sight_calculations
        with sight_calculations(state):
            own = cooperative.controlled(state, pid) if pid else None
            state["legal"] = {u["id"]: (cooperative.blank_legal() if pid and
                (u['id'] not in own or pid in state['coop']['done'] or state['coop']['phase'] != 'battle')
                else cooperative.filter_legal(state, pid, u, options(state, u)) if pid else options(state, u))
                for u in state["units"] if u["side"] == side}
            if state['order_history']['redo_required']:
                state['legal'] = {uid: {key: [] if isinstance(value, list) else False
                                       for key, value in legal.items()} for uid, legal in state['legal'].items()}
            if pid:
                safe_coop = cooperative.public(state, pid)
                state.pop('coop')
            result = public_state(state,side)
            if pid:
                result['coop'] = safe_coop
            if isinstance(replay, dict):
                replay_key = f"{row['code']}:{side}:{state.get('battle_number') or 1}:{replay.get('id')}"
                # Opt-in acknowledgement, never a cache shared between players.
                # Older clients receive only bounded compatibility payloads.
                known = request.headers.get('X-WW2-Replay')
                result['computer_playback'] = (replay if request.headers.get('X-WW2-Protocol') == '2' else
                    {'id': replay.get('id'), 'unchanged': True} if known == replay_key else
                    pipeline.original_movie(db, row['code'], replay))
            return result

    def public_response(row, side):
        # The accepted state is already committed. Build presentation data
        # without holding the gameplay write lock; a lost ACK is retry-safe.
        with connect() as db:
            result = public(db, row, side)
            if request.headers.get('X-WW2-Protocol') == '2':
                result = pipeline.transport(db, row['code'], owner_key(db), result, request.headers.get('X-WW2-State'))
        return jsonify(result)

    def save_state(db, code, state, previous=None, *, reset_job=False):
        state['pipeline_version'] = 2
        if app.config['WW2_BACKGROUND_AI']:
            state['background_ai'] = True
        pipeline.persist(db, code, state, previous=previous)
        if app.config['WW2_BACKGROUND_AI']:
            queue.request(db, code, state, reset=reset_job,
                          resume=bool((previous or {}).get('coop', {}).get('resolving')))

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        if request.path.startswith(('/assets/unit-images/','/assets/operations/')) and response.status_code == 200:
            response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.errorhandler(sqlite3.OperationalError)
    def database_error(error):
        app.extensions['ww2_diagnostics'].record(error)
        # The connection context has rolled back/closed before this handler runs.
        # Do not replay an order automatically: it may involve dice or a turn end.
        code = getattr(error, 'sqlite_errorcode', 0)
        if (code & 0xff) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
            app.logger.warning('Database busy on %s %s', request.method, request.path, exc_info=True)
            return jsonify(error='The game database is temporarily busy. Refresh the game before trying again.'), 503, {'Retry-After': '1'}
        app.logger.exception('Database failure on %s %s', request.method, request.path)
        return http_error(InternalServerError())

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
        if app.config.pop('WW2_STARTUP_TRACE', False):
            faulthandler.cancel_dump_traceback_later()
            app.logger.warning('DSL startup complete: HTTP and database health check passed.')
        return jsonify(ok=True)

    @app.get('/api/scenarios')
    def scenarios():
        from ww2_tactics.editions import EDITIONS
        return jsonify(scenarios=catalog(), current_scenarios=catalog('current'), editions=EDITIONS)

    @app.get('/api/rulesets')
    def rulesets():
        return jsonify(rulesets=list(PROFILES.values()))

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
        if mode not in ('human', 'computer', 'cooperative'):
            raise ValueError('Choose a human, computer, or cooperative battle.')
        allocation = assignment(body)
        state = initial(scenario, body.get('ruleset', 'classic'))
        state['team_assignment'] = allocation
        if 'side' in body or 'team_assignment' in body:
            state['created_side'] = allocation['creator_side']
        if mode == 'computer':
            side = allocation['creator_side']
            state.update(ai_side='de' if side == 'us' else 'us', ready=True)
            if not app.config['WW2_BACKGROUND_AI']:
                state=play_turn(state)
            labels = state.get('factions', {'us': 'Americans', 'de': 'Germans'})
            opponent=labels[state['ai_side']]
            own=labels[side]
            state['log'].append(f'Solo battle: you command the {own}; the computer commands the {opponent}.')
        state['pipeline_version'] = 2
        if app.config['WW2_BACKGROUND_AI']: state['background_ai'] = True
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
        body = request.get_json(silent=True) or {}
        name = battle_name(body['name']) if 'name' in body else None
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            player = commander(db, required=bool(name or request.headers.get('X-Commander-Token')))
            if body.get('opponent') == 'cooperative':
                pid = secrets.token_hex(8)
                try:
                    state = cooperative.initialize(state, body, pid, player['name'] if player else body.get('player_name', 'Host'))
                except ValueError as error:
                    return jsonify(error=str(error)), 400
            host, guest = seats(state, digest(token), digest(secrets.token_urlsafe(32)))
            db.execute("INSERT INTO match (code,host,guest,state) VALUES (?,?,?,?)", (code, host, guest, json.dumps(state)))
            save_state(db, code, state)
            if state.get('coop'):
                db.execute('INSERT INTO cooperative_players VALUES (?,?,?)', (code, pid, digest(token)))
            if not state.get('ai_side'):
                bind_commander(db, digest(token), player)
                if name:
                    db.execute('UPDATE lobby_names SET name=? WHERE code=?', (name, code))
        return jsonify(code=code, token=token), 201

    @app.post("/api/match/<code>/join")
    def join(code):
        token = secrets.token_urlsafe(32)
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM match WHERE code=?", (code.upper(),)).fetchone()
            if row is None:
                return jsonify(error="Match not found. Check the invitation code."), 404
            state = json.loads(row['state'])
            if state.get('coop'):
                player = commander(db, required=bool(request.headers.get('X-Commander-Token')))
                existing = membership(db, row) or cooperative.linked_member(db, row, player)
                if existing:
                    db.execute('INSERT INTO player_access VALUES (?,?)', (digest(token), existing['owner_hash']))
                    return jsonify(code=row['code'], token=token)
                if state['coop']['phase'] != 'lobby':
                    return jsonify(error='This battle has started. Command assignments are locked; existing players can resume.'), 409
                body = request.get_json(silent=True) or {}
                if not isinstance(body, dict):
                    return jsonify(error='Choose an army and command group.'), 400
                pid = secrets.token_hex(8)
                try:
                    name = cooperative.player_name(player['name'] if player else body.get('player_name', 'Player'))
                    state['coop']['players'][pid] = dict(id=pid, name=name, side=body.get('side'), group=None)
                    cooperative.claim(state, pid, body.get('side'), body.get('group'))
                except ValueError as error:
                    return jsonify(error=str(error)), 400
                state['revision'] += 1
                db.execute('INSERT INTO cooperative_players VALUES (?,?,?)', (row['code'], pid, digest(token)))
                bind_commander(db, digest(token), player)
                save_state(db, row['code'], state)
                return jsonify(code=row['code'], token=token)
            if json.loads(row['state']).get('ai_side'):
                return jsonify(error='This is a solo battle. The computer seat cannot be joined.'), 409
            player = commander(db, required=bool(request.headers.get('X-Commander-Token')))
            existing = commander_side(db, row, player)
            if existing:
                db.execute('INSERT INTO player_access VALUES (?,?)', (digest(token), row['host' if existing == 'us' else 'guest']))
                return jsonify(code=row['code'], token=token)
            if row["host"] and row["guest"]:
                return jsonify(error="Both seats are taken. Sign in as your commander to resume. Older seats need their saved browser or a MOVE code once, then can be linked to a commander."), 409
            if identify(db, row):
                return jsonify(error="You already own a seat in this game. Open the invitation on the other device."), 409
            state = json.loads(row["state"])
            state["ready"] = True
            state["revision"] += 1
            state["log"].append("Opponent joined. Both commanders are connected.")
            column = 'host' if not row['host'] else 'guest'
            db.execute(f"UPDATE match SET {column}=? WHERE code=?", (digest(token), row["code"]))
            save_state(db, row['code'], state)
            bind_commander(db, digest(token), player)
        return jsonify(code=code.upper(), token=token), 200

    @app.route("/api/match/<code>", methods=["GET", "POST"])
    def match(code):
        with connect() as db:
            row = db.execute("SELECT * FROM match WHERE code=?", (code.upper(),)).fetchone()
            if row is None:
                return jsonify(error="This match no longer exists."), 404
            side = identify(db, row)
            if not side:
                return jsonify(error="Player key required. Rejoin using your original browser."), 403
            since = request.args.get('since', type=int)
            if request.method == "GET" and since is not None and since == db.execute(
                    "SELECT json_extract(state,'$.revision') FROM match WHERE code=?", (row['code'],)).fetchone()[0]:
                # Authenticate first; unchanged polls need no legal-order or fog
                # calculation, and do not contend with orders for worker time.
                result = dict(code=row['code'], unchanged=True)
                if app.config['WW2_BACKGROUND_AI']:
                    job = db.execute('SELECT status FROM ww2_ai_jobs WHERE code=?', (row['code'],)).fetchone()
                    if job:
                        result['computer_work'] = dict(pending=job[0] != 'done', status=jobs.public_status(job[0]))
                return jsonify(result)
            if request.method == "POST":
                body = request.get_json(silent=True)
                if not isinstance(body, dict):
                    return jsonify(error="Expected an action object."), 400
                owner = owner_key(db)
                try:
                    duplicate, receipt_digest = pipeline.receipt(db, row['code'], owner, body)
                except ValueError as error:
                    return jsonify(error=str(error)), 400
                state = json.loads(row["state"])
                if not duplicate and (type(body.get("revision")) is not int or body["revision"] != state["revision"]):
                    return jsonify(error="The match changed. Refreshing the battlefield; try again."), 409
                member = membership(db, row) if state.get('coop') else None
                pipeline.hydrate_takeback(db, row['code'], state, body.get('kind'))
        if request.method == 'POST' and not duplicate:
            previous = state
            try:
                state = (cooperative.order(state, member['player_id'], body, defer_computer=app.config['WW2_BACKGROUND_AI'])
                         if member else perform(state, side, body, defer_computer=app.config['WW2_BACKGROUND_AI']))
            except ValueError as error:
                return jsonify(error=str(error)), 400
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                latest = db.execute('SELECT * FROM match WHERE code=?', (row['code'],)).fetchone()
                # Two retries/racing clients may have computed simultaneously.
                accepted, _ = pipeline.receipt(db, row['code'], owner, body)
                if accepted:
                    row = latest
                elif not latest or json.loads(latest['state'])['revision'] != body['revision']:
                    return jsonify(error='The match changed. Refreshing the battlefield; try again.'), 409
                else:
                    save_state(db, row['code'], state, previous)
                    pipeline.remember_receipt(db, row['code'], owner, body, receipt_digest, state['revision'])
                    row = db.execute('SELECT * FROM match WHERE code=?', (row['code'],)).fetchone()
        return public_response(row, side)

    @app.get('/api/match/<code>/replay/<stream>')
    def replay_page(code, stream):
        with connect() as db:
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            side = identify(db, row) if row else None
            if not side:
                return jsonify(error='Player key required.'), 403
            movie = db.execute('SELECT side,count,identity FROM ww2_replays WHERE code=? AND stream=?', (row['code'], stream)).fetchone()
            if not movie or movie['side'] != side:
                return jsonify(error='Replay unavailable for this army.'), 404
            start = request.args.get('start', default=0, type=int)
            if start < 0:
                return jsonify(error='Invalid replay position.'), 400
            result = pipeline.read_page(db, row['code'], dict(stream=stream,count=movie['count']), start)
        return jsonify(result)

    @app.post('/api/match/<code>/computer')
    def retry_computer(code):
        with connect() as db:
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            side = identify(db, row) if row else None
            if not side:
                return jsonify(error='Player key required.'), 403
            state = json.loads(row['state'])
            if not jobs.needed(state):
                return jsonify(error='No computer orders are pending.'), 400
            db.execute('BEGIN IMMEDIATE')
            queue.request(db, row['code'], state, reset=True)
        return public_response(row, side)

    @app.route('/api/match/<code>/cooperative', methods=['GET', 'POST'])
    def cooperative_lobby(code):
        with connect() as db:
            if request.method == 'POST':
                db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            if not row or not json.loads(row['state']).get('coop'):
                return jsonify(error='Cooperative battle not found.'), 404
            state = json.loads(row['state']); member = membership(db, row)
            if request.method == 'GET':
                # Public recruitment board contains initial group counts only.
                c = state['coop']
                return jsonify(code=row['code'], name=match_title(db, row['code']), phase=c['phase'],
                    scenario=state['battlefield']['name'], edition=state.get('edition','legacy'), control_size=c['control_size'],
                    factions=state.get('factions', {'us':'Americans', 'de':'Germans'}),
                    players=list(c['players'].values()), host=c['host'],
                    your_player=(member or cooperative.linked_member(db, row, commander(db)) or {}).get('player_id'),
                    groups=[{k:v for k,v in g.items() if k != 'units'} | {'count':len(g['units'])} for g in c['groups'].values()])
            if not member:
                return jsonify(error='Player key required.'), 403
            body = request.get_json(silent=True)
            if not isinstance(body, dict):
                return jsonify(error='Expected cooperative settings.'), 400
            owner = owner_key(db)
            try:
                duplicate, receipt_digest = pipeline.receipt(db, row['code'], owner, body)
            except ValueError as error:
                return jsonify(error=str(error)), 400
            if not duplicate and (type(body.get('revision')) is not int or body['revision'] != state['revision']):
                return jsonify(error='The lobby or battle changed. Refresh and try again.'), 409
            if not duplicate:
                try:
                    state = cooperative.setup_action(state, member['player_id'], body, defer_computer=app.config['WW2_BACKGROUND_AI'])
                except ValueError as error:
                    return jsonify(error=str(error)), 400
                save_state(db, row['code'], state, reset_job=body.get('operation') == 'advance')
                pipeline.remember_receipt(db, row['code'], owner, body, receipt_digest, state['revision'])
            row = db.execute('SELECT * FROM match WHERE code=?', (row['code'],)).fetchone()
            side = state['coop']['players'][member['player_id']]['side']
        return public_response(row, side)

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
            if row and (json.loads(row['state']).get('coop') or (request.get_json(silent=True) or {}).get('opponent') == 'cooperative'):
                return jsonify(error='Create a separate cooperative lobby from Home. Existing shared battles are preserved.'), 400
            side = identify(db, row) if row else None
            if not side or (side != json.loads(row['state']).get('created_side', 'us') and not state.get('ai_side') and not json.loads(row['state']).get('ai_side')):
                return jsonify(error="Only the creator can replace this multiplayer invitation."), 403
            # New code revokes both old seats; no accidental reuse of an old invitation.
            new_code, token = secrets.token_hex(5).upper(), secrets.token_urlsafe(32)
            old_owner = row['host' if side == 'us' else 'guest']
            linked = db.execute('SELECT commander_id FROM commander_seats WHERE owner_hash=?', (old_owner,)).fetchone()
            host, guest = seats(state, digest(token), digest(secrets.token_urlsafe(32)))
            db.execute("UPDATE match SET code=?,host=?,guest=?,state=? WHERE code=?", (new_code, host, guest, json.dumps(state), row["code"]))
            save_state(db, new_code, state)
            pipeline.purge_artifacts(db, row['code'])
            if linked:
                db.execute('INSERT INTO commander_seats VALUES (?,?)', (digest(token), linked['commander_id']))
        return jsonify(code=new_code, token=token)

    @app.post('/api/match/<code>/rematch')
    def rematch(code):
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify(error='Expected rematch settings.'), 400
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            side = identify(db, row) if row else None
            if not side:
                return jsonify(error='Player key required.'), 403
            state = json.loads(row['state'])
            if state.get('coop'):
                return jsonify(error='Create a new cooperative lobby from Home for the next operation.'), 400
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
                    rules = profile(body.get('ruleset', state.get('ruleset', 'classic')))
                    if scenario.get('dsl_only') and rules['id']!='dsl':
                        raise ValueError(f"{scenario['name']} requires the DSL ruleset.")
                except ValueError as error:
                    return jsonify(error=str(error)), 400
                if type(body.get('swap')) is not bool:
                    return jsonify(error='Choose whether to swap armies.'), 400
                state['rematch'] = dict(by=side, scenario=scenario['id'], name=scenario['name'], swap=body['swap'], ruleset=rules['id'])
                if state.get('ai_side'):
                    next_state = initial(scenario['id'], rules['id'])
                    carry_creator(state, next_state, body['swap'])
                    next_state.update(ready=True, revision=state['revision'],
                                      ai_side=('us' if state['ai_side'] == 'de' else 'de') if body['swap'] else state['ai_side'],
                                      battle_number=state.get('battle_number', 1)+1,
                                      victories=state.get('victories', {'us': 0, 'de': 0}))
                    if body['swap']:
                        # Store an unguessable placeholder hash for the computer seat.
                        db.execute('UPDATE match SET host=?,guest=? WHERE code=?',
                                   (row['guest'] or digest(secrets.token_urlsafe(32)), row['host'], row['code']))
                        side = 'de' if side == 'us' else 'us'
                    state = next_state if app.config['WW2_BACKGROUND_AI'] else play_turn(next_state)
            elif operation == 'decline':
                if not state.get('rematch'):
                    return jsonify(error='There is no pending proposal.'), 400
                state.pop('rematch')
            elif operation == 'accept':
                proposal = state.get('rematch')
                if not proposal or proposal['by'] == side:
                    return jsonify(error='Only the other commander can accept the proposal.'), 400
                next_state = initial(proposal['scenario'], proposal.get('ruleset', state.get('ruleset', 'classic')))
                carry_creator(state, next_state, proposal['swap'])
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
            save_state(db, row['code'], state)
            updated = db.execute('SELECT * FROM match WHERE code=?', (row['code'],)).fetchone()
        return public_response(updated, side)

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
            side = identify(db, row) if row else None
            if not side:
                return jsonify(error='Player key required.'), 403
            value = secret_code('MOVE')
            member = membership(db, row)
            owner = member['owner_hash'] if member else row['host' if side == 'us' else 'guest']
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
            if not ticket or ticket['expires'] < time.time() or not row or (ticket['owner_hash'] not in (row['host'], row['guest']) and not cooperative.member(db, row, ticket['owner_hash'])):
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
            side = identify(db, row) if row else None
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
            pipeline.copy_artifacts(db, row['code'], 'save:' + code_hash(value))
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
            pipeline.copy_artifacts(db, 'save:' + key, code)
            if app.config['WW2_BACKGROUND_AI']:
                pipeline.migrate(db, code)
                compact = db.execute('SELECT state FROM match WHERE code=?', (code,)).fetchone()[0]
                queue.request(db, code, json.loads(compact), resume=True)
        return jsonify(code=code, token=token), 201

    if app.config['WW2_BACKGROUND_AI'] and start_worker:
        queue.start()
    return app


# Gunicorn can preload this module in its parent process. Starting a thread here
# would fork an active SQLite client and inherit locks without its owning thread.
# gunicorn.conf.py starts the durable queue only after the web worker is ready.
app = create_app(start_worker=False)
