"""Isolated Empires records in the existing database, with existing commanders."""
import hashlib
import json
import secrets
import time

from flask import jsonify, request
from werkzeug.exceptions import BadRequest, Conflict, Forbidden, NotFound

from . import engine


def install(app, connect, commander):
    with connect() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS empires_games (
                code TEXT PRIMARY KEY, host TEXT NOT NULL, guest TEXT,
                host_commander INTEGER, guest_commander INTEGER,
                state TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL);
            CREATE INDEX IF NOT EXISTS empires_host_player ON empires_games(host_commander);
            CREATE INDEX IF NOT EXISTS empires_guest_player ON empires_games(guest_commander);
            CREATE TABLE IF NOT EXISTS empires_commands (
                code TEXT NOT NULL, owner TEXT NOT NULL, command_id TEXT NOT NULL,
                payload TEXT NOT NULL, PRIMARY KEY(code,owner,command_id));
        ''')

    def token_hash():
        token = request.headers.get('Authorization', '').removeprefix('Bearer ')
        return hashlib.sha256(token.encode()).hexdigest() if token else None

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise BadRequest('Send an order object.')
        for k in ('kind', 'unit', 'city', 'tech', 'project', 'target', 'action', 'faction', 'mode', 'difficulty', 'command_id'):
            if k in value and (not isinstance(value[k], str) or len(value[k]) > 100):
                raise BadRequest('Invalid order field.')
        return value

    def row_for(db, code):
        row = db.execute('SELECT * FROM empires_games WHERE code=?', (code.upper(),)).fetchone()
        if row is None:
            raise NotFound('No Empires campaign has that code.')
        return row

    def seat(db, row):
        player = commander(db)
        hashed = token_hash()
        is_host = hashed and secrets.compare_digest(hashed,row['host']) or player and player['id'] == row['host_commander']
        is_guest = hashed and row['guest'] and secrets.compare_digest(hashed,row['guest']) or player and player['id'] == row['guest_commander']
        s = json.loads(row['state'])
        return s['human'] if is_host else engine.other(s['human']) if is_guest else None

    def response(row, s, side):
        result = engine.public(s, side)
        result.update(code=row['code'], ready=s['mode'] == 'solo' or bool(row['guest']))
        return result

    @app.get('/api/empires/games')
    def empires_list():
        with connect() as db:
            player = commander(db)
            if not player:
                return jsonify(games=[])
            rows = db.execute('SELECT * FROM empires_games WHERE host_commander=? OR guest_commander=? ORDER BY updated DESC LIMIT 50', (player['id'],player['id'])).fetchall()
            results = []
            for row in rows:
                s = json.loads(row['state'])
                results.append(dict(code=row['code'],round=s['round'],mode=s['mode'],winner=s['winner'],side=seat(db,row)))
            return jsonify(games=results)

    @app.post('/api/empires/games')
    def empires_create():
        b = body()
        try:
            s = engine.initial(b.get('faction','river'), b.get('mode','solo'), b.get('difficulty','standard'))
        except ValueError as e:
            raise BadRequest(str(e)) from e
        code = secrets.token_hex(5).upper()
        token = secrets.token_urlsafe(32)
        owner = hashlib.sha256(token.encode()).hexdigest()
        with connect() as db:
            player = commander(db)
            now = time.time()
            db.execute('INSERT INTO empires_games VALUES (?,?,?,?,?,?,?,?)', (code,owner,None,player['id'] if player else None,None,json.dumps(s),now,now))
            row = row_for(db,code)
            return jsonify(seat=dict(code=code,token=token,side=s['human'],commander=player['name'] if player else None), game=response(row,s,s['human'])), 201

    @app.post('/api/empires/games/<code>/join')
    def empires_join(code):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = row_for(db,code)
            s = json.loads(row['state'])
            side = seat(db,row)
            if side:
                return jsonify(game=response(row,s,side),seat=dict(code=row['code'],side=side))
            if s['mode'] != 'human' or row['guest'] or s['winner']:
                raise Conflict('This campaign has no open human seat.')
            player = commander(db)
            token = secrets.token_urlsafe(32)
            side = engine.other(s['human'])
            db.execute('UPDATE empires_games SET guest=?, guest_commander=?, updated=? WHERE code=?', (hashlib.sha256(token.encode()).hexdigest(),player['id'] if player else None,time.time(),row['code']))
            row = row_for(db,code)
            return jsonify(seat=dict(code=row['code'],token=token,side=side,commander=player['name'] if player else None),game=response(row,s,side))

    @app.route('/api/empires/games/<code>', methods=['GET','POST'])
    def empires_game(code):
        b = body() if request.method == 'POST' else None
        with connect() as db:
            if b is not None:
                db.execute('BEGIN IMMEDIATE')
            row = row_for(db,code)
            side = seat(db,row)
            if not side:
                raise Forbidden('Resume this campaign from its saved browser or linked commander account.')
            s = json.loads(row['state'])
            if b is None:
                return jsonify(response(row,s,side))
            command_id = b.get('command_id')
            if not isinstance(command_id,str) or not 8 <= len(command_id) <= 100:
                raise BadRequest('An order needs a unique command ID.')
            payload = json.dumps(b, sort_keys=True, separators=(',',':'))
            prior = db.execute('SELECT payload FROM empires_commands WHERE code=? AND owner=? AND command_id=?', (row['code'],side,command_id)).fetchone()
            if prior:
                if prior['payload'] != payload:
                    raise Conflict('That command ID was already used for a different order.')
                return jsonify(response(row,s,side))
            if type(b.get('revision')) is not int or b['revision'] != s['revision']:
                raise Conflict('The campaign changed. Refresh before giving another order.')
            if s['mode'] == 'human' and not row['guest']:
                raise Conflict('Your invited opponent needs to join first.')
            try:
                engine.apply(s,side,b)
                if s['mode'] == 'solo' and s['turn'] != s['human'] and not s['winner']:
                    engine.computer_turn(s)
            except ValueError as e:
                raise BadRequest(str(e)) from e
            db.execute('UPDATE empires_games SET state=?,updated=? WHERE code=?', (json.dumps(s),time.time(),row['code']))
            db.execute('INSERT INTO empires_commands VALUES (?,?,?,?)',(row['code'],side,command_id,payload))
            return jsonify(response(row,s,side))

    @app.post('/api/empires/games/<code>/link')
    def empires_link(code):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = row_for(db,code)
            side = seat(db,row)
            if not side:
                raise Forbidden('Open this campaign from the browser that owns it.')
            player = commander(db, required=True)
            s = json.loads(row['state'])
            field = 'host_commander' if side == s['human'] else 'guest_commander'
            if row[field] and row[field] != player['id']:
                raise Conflict('This campaign is already linked to another commander.')
            db.execute(f'UPDATE empires_games SET {field}=? WHERE code=?',(player['id'],row['code']))
            return jsonify(ok=True)
