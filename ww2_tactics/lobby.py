"""Named multiplayer directory and portable commander identities.

Seat ownership is attached to the existing owner hash, so MOVE aliases and army
swaps continue to work. The directory never returns battlefield or seat secrets.
"""
import re
import json
import secrets
import sqlite3
import time

from flask import jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.exceptions import BadRequest, Conflict, Forbidden, TooManyRequests, Unauthorized


def install_lobby(app, connect, digest, identify, membership=None):
    with connect() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS commanders (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS commander_sessions (
                key_hash TEXT PRIMARY KEY, commander_id INTEGER NOT NULL, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS commander_seats (
                owner_hash TEXT PRIMARY KEY, commander_id INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS commander_seats_player ON commander_seats(commander_id);
            CREATE TABLE IF NOT EXISTS lobby_names (
                code TEXT PRIMARY KEY, name TEXT NOT NULL, updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS login_attempts (
                key_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, started REAL NOT NULL);
            CREATE TRIGGER IF NOT EXISTS lobby_match_insert AFTER INSERT ON match BEGIN
                INSERT OR IGNORE INTO lobby_names VALUES (
                    NEW.code, coalesce(json_extract(NEW.state,'$.battlefield.name'),'Battle') || ' · ' || substr(NEW.code,-4),
                    unixepoch());
            END;
            CREATE TRIGGER IF NOT EXISTS lobby_match_update AFTER UPDATE ON match BEGIN
                UPDATE lobby_names SET code=NEW.code, updated=unixepoch() WHERE code=OLD.code;
            END;
            CREATE TRIGGER IF NOT EXISTS lobby_match_delete AFTER DELETE ON match BEGIN
                DELETE FROM lobby_names WHERE code=OLD.code;
            END;
            INSERT OR IGNORE INTO lobby_names
                SELECT code, coalesce(json_extract(state,'$.battlefield.name'),'Battle') || ' · ' || substr(code,-4),
                    unixepoch() FROM match;
        ''')

    def commander(db, required=False):
        token = request.headers.get('X-Commander-Token', '')
        row = db.execute('''SELECT c.id,c.name FROM commander_sessions s JOIN commanders c
                            ON c.id=s.commander_id WHERE s.key_hash=? AND s.expires>?''',
                         (digest(token), time.time())).fetchone() if token else None
        if required and not row:
            raise Unauthorized('Sign in with your commander name and password to continue.')
        return row

    def bind(db, owner, player):
        if not player:
            return
        existing = db.execute('SELECT commander_id FROM commander_seats WHERE owner_hash=?', (owner,)).fetchone()
        if existing and existing['commander_id'] != player['id']:
            raise Conflict('This seat is already linked to another commander. Sign in as that commander.')
        db.execute('INSERT OR IGNORE INTO commander_seats VALUES (?,?)', (owner, player['id']))

    def battle_name(value):
        if not isinstance(value, str):
            raise BadRequest('Give the game a name.')
        value = ' '.join(value.split())
        if not 3 <= len(value) <= 64 or any(ord(c) < 32 for c in value):
            raise BadRequest('Use a game name between 3 and 64 characters.')
        return value

    def title(db, code):
        row = db.execute('SELECT name FROM lobby_names WHERE code=?', (code,)).fetchone()
        return row['name'] if row else 'Multiplayer battle'

    def owns(db, row, player):
        if not player:
            return None
        from .cooperative import linked_member
        seat = linked_member(db, row, player)
        if seat:
            return json.loads(row['state'])['coop']['players'][seat['player_id']]['side']
        owners = {r['owner_hash'] for r in db.execute('SELECT owner_hash FROM commander_seats WHERE commander_id=?', (player['id'],))}
        return 'us' if row['host'] in owners else 'de' if row['guest'] in owners else None

    @app.post('/api/commander/<operation>')
    def authenticate(operation):
        if operation not in ('register', 'login', 'logout'):
            raise BadRequest('Unknown sign-in action.')
        if operation == 'logout':
            with connect() as db:
                db.execute('DELETE FROM commander_sessions WHERE key_hash=?', (digest(request.headers.get('X-Commander-Token', '')),))
            return jsonify(ok=True)
        body = request.get_json(silent=True)
        name, password = (body.get('name'), body.get('password')) if isinstance(body, dict) else (None, None)
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 _.-]{2,27}', name.strip()):
            raise BadRequest('Use a commander name with 3–28 letters, numbers, spaces, dots, dashes or underscores.')
        name = ' '.join(name.split())
        if len(name) < 3 or not isinstance(password, str) or not 8 <= len(password) <= 128:
            raise BadRequest('Use a password between 8 and 128 characters.')
        # Shared across workers; both account and source limits bound password work.
        keys = [digest('name:'+name.lower()), digest('ip:'+(request.remote_addr or 'unknown'))]
        now = time.time()
        limited = False
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM login_attempts WHERE started<?', (now-900,))
            for key, limit in zip(keys, (15, 120)):
                db.execute('INSERT OR IGNORE INTO login_attempts VALUES (?,0,?)', (key, now))
                count = db.execute('SELECT count FROM login_attempts WHERE key_hash=?', (key,)).fetchone()['count']
                if count >= limit:
                    limited = True
                db.execute('UPDATE login_attempts SET count=count+1 WHERE key_hash=?', (key,))
        if limited:
            raise TooManyRequests('Too many sign-in attempts. Try again in 15 minutes.')
        with connect() as db:
            player = db.execute('SELECT * FROM commanders WHERE name_key=?', (name.lower(),)).fetchone()
        if operation == 'register':
            if player:
                raise Conflict('That commander name is taken. Sign in, or choose another name.')
            password_hash = generate_password_hash(password)
            try:
                with connect() as db:
                    cursor = db.execute('INSERT INTO commanders(name,name_key,password_hash) VALUES (?,?,?)', (name, name.lower(), password_hash))
                    player = dict(id=cursor.lastrowid, name=name)
            except sqlite3.IntegrityError:
                raise Conflict('That commander name is taken. Sign in, or choose another name.') from None
        elif not player or not check_password_hash(player['password_hash'], password):
            raise Unauthorized('Commander name or password did not match.')
        token = secrets.token_urlsafe(32)
        with connect() as db:
            db.execute('DELETE FROM commander_sessions WHERE expires<?', (now,))
            db.execute('INSERT INTO commander_sessions VALUES (?,?,?)', (digest(token), player['id'], now+90*86400))
            db.execute('DELETE FROM login_attempts WHERE key_hash=?', (keys[0],))
        return jsonify(token=token, name=player['name'])

    @app.get('/api/commander')
    def who():
        with connect() as db:
            player = commander(db, required=True)
        return jsonify(name=player['name'])

    @app.get('/api/lobby')
    def directory():
        query = request.args.get('q', '').strip().lower()[:80]
        try:
            offset = min(1000000, max(0, int(request.args.get('offset', 0))))
        except ValueError:
            raise BadRequest('Invalid page.') from None
        with connect() as db:
            player = commander(db, required=bool(request.headers.get('X-Commander-Token')))
            player_id = player['id'] if player else -1
            # Only summary fields cross this boundary. Fog, legal moves, logs, and
            # credentials never enter the lobby response.
            rows = db.execute('''SELECT m.code,n.name,n.updated,
                    json_extract(m.state,'$.coop') AS coop_data, cp.player_id AS coop_player,
                    json_extract(m.state,'$.battlefield.name') AS scenario,
                    json_extract(m.state,'$.ruleset') AS ruleset,
                    json_extract(m.state,'$.round') AS round,
                    json_extract(m.state,'$.turn') AS turn,
                    json_extract(m.state,'$.winner') AS winner,
                    json_extract(m.state,'$.ready') AS ready,
                    json_extract(m.state,'$.deployment.phase') AS phase,
                    coalesce(json_extract(m.state,'$.factions.de'),'Germans') AS opponent,
                    coalesce(json_extract(m.state,'$.factions.us'),'Americans') AS allies,
                    h.name AS host_name,g.name AS guest_name,
                    (m.host IS NOT NULL AND m.guest IS NOT NULL) AS full,
                    CASE WHEN m.host IS NULL THEN 'us' WHEN m.guest IS NULL THEN 'de' END AS open_side,
                    CASE WHEN hs.commander_id=? THEN 'us' WHEN gs.commander_id=? THEN 'de' END AS your_side
                FROM match m JOIN lobby_names n ON n.code=m.code
                LEFT JOIN commander_seats hs ON hs.owner_hash=m.host
                LEFT JOIN commanders h ON h.id=hs.commander_id
                LEFT JOIN commander_seats gs ON gs.owner_hash=m.guest
                LEFT JOIN commanders g ON g.id=gs.commander_id
                LEFT JOIN (SELECT p.code,p.player_id FROM cooperative_players p JOIN commander_seats cs
                    ON cs.owner_hash=p.owner_hash WHERE cs.commander_id=?) cp ON cp.code=m.code
                WHERE json_extract(m.state,'$.ai_side') IS NULL
                  AND (? OR json_extract(m.state,'$.winner') IS NULL)
                  AND (?=0 OR hs.commander_id=? OR gs.commander_id=? OR cp.player_id IS NOT NULL)
                  AND instr(lower(n.name || ' ' || coalesce(h.name,'') || ' ' || coalesce(g.name,'') || ' ' || m.code),?)>0
                ORDER BY (hs.commander_id=? OR gs.commander_id=? OR cp.player_id IS NOT NULL) DESC,n.updated DESC,m.slot DESC
                LIMIT 51 OFFSET ?''',
                (player_id, player_id, player_id, request.args.get('finished') == '1', request.args.get('mine') == '1',
                 player_id, player_id, query, player_id, player_id, offset)).fetchall()
        games = []
        for row in rows[:50]:
            game = dict(row); raw = game.pop('coop_data'); pid = game.pop('coop_player')
            if raw:
                c = json.loads(raw)
                available = sum(not g['command'] and g['owner'] is None for g in c['groups'].values())
                game.update(cooperative=True, full=c['phase'] != 'lobby' or not available,
                    open_side=None, your_side=c['players'][pid]['side'] if pid else None,
                    players=len(c['players']), open_groups=available, phase=c['phase'] if c['phase']=='lobby' else game['phase'])
            games.append(game)
        return jsonify(games=games, has_more=len(rows)>50)

    @app.post('/api/match/<code>/resume')
    def resume(code):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            player = commander(db, required=True)
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            side = owns(db, row, player) if row else None
            if not side:
                raise Forbidden('This game is not linked to your commander. Use its saved browser or a MOVE code, then link that seat.')
            token = secrets.token_urlsafe(32)
            from .cooperative import linked_member
            seat = linked_member(db, row, player)
            db.execute('INSERT INTO player_access VALUES (?,?)', (digest(token), seat['owner_hash'] if seat else row['host' if side == 'us' else 'guest']))
        return jsonify(code=row['code'], token=token)

    @app.post('/api/match/<code>/link')
    def link(code):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            player = commander(db, required=True)
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            side = identify(db, row) if row else None
            if not side:
                raise Forbidden('Open this game using its saved browser or a MOVE code before linking it.')
            existing = owns(db, row, player)
            seat = membership(db, row) if membership else None
            from .cooperative import linked_member
            other = linked_member(db, row, player)
            if seat and other and seat['player_id'] != other['player_id']:
                raise Conflict('Your commander already owns another group in this battle.')
            if existing and existing != side:
                raise Conflict('Your commander already owns the other side of this game.')
            bind(db, seat['owner_hash'] if seat else row['host' if side == 'us' else 'guest'], player)
        return jsonify(ok=True)

    @app.post('/api/match/<code>/name')
    def rename(code):
        body = request.get_json(silent=True)
        name = battle_name(body.get('name') if isinstance(body, dict) else None)
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM match WHERE code=?', (code.upper(),)).fetchone()
            if not row or not identify(db, row):
                raise Forbidden('Only a player in this game can rename it.')
            state = json.loads(row['state'])
            if state.get('coop') and membership(db, row)['player_id'] != state['coop']['host']:
                raise Forbidden('Only the cooperative host can rename this game.')
            db.execute('UPDATE lobby_names SET name=?,updated=? WHERE code=?', (name, time.time(), row['code']))
            db.execute("UPDATE match SET state=json_set(state,'$.revision',json_extract(state,'$.revision')+1) WHERE code=?", (row['code'],))
        return jsonify(name=name)

    return commander, bind, battle_name, title, owns
