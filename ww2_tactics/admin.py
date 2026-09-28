"""Owner-bound operations console. All game writes use one SQLite transaction."""
from collections import deque
import json
import os
from pathlib import Path
import platform
import re
import secrets
import shutil
import subprocess
import threading
import time
import traceback

from flask import current_app, g, got_request_exception, jsonify, request, send_from_directory
from werkzeug.exceptions import BadRequest, Conflict, Forbidden, NotFound


ROOT = Path(__file__).resolve().parent.parent


def build_version():
    def git(*args):
        try:
            return subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.DEVNULL,
                                           timeout=2, text=True).strip()
        except (OSError, subprocess.SubprocessError):
            return ''
    rendered = bool(os.environ.get('RENDER'))
    return dict(commit=os.environ.get('RENDER_GIT_COMMIT') or git('rev-parse', 'HEAD'),
                branch=os.environ.get('RENDER_GIT_BRANCH') or git('branch', '--show-current'),
                dirty=None if rendered else bool(git('status', '--porcelain')))


class Diagnostics:
    """Bounded failure journal, independent of the game DB even during locks.

    Never retain exception messages, source lines, request bodies, headers or
    query strings. They can contain credentials. Full server logs stay in Render.
    The deployed one-worker/threaded model serializes rotation with this lock.
    """
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.Lock()
        self.recent = deque(maxlen=200)
        self.started = time.time()
        self.requests = self.failures = self.slow = 0
        self.writable = True

    def record(self, error):
        g.dsl_failure = dict(type=type(error).__name__, sqlite_code=getattr(error, 'sqlite_errorname', None),
                             frames=[dict(file=Path(f.filename).name, function=f.name, line=f.lineno)
                                     for f in traceback.extract_tb(error.__traceback__)[-12:]])

    def finish(self, response):
        elapsed = round((time.monotonic() - g.dsl_started) * 1000)
        response.headers['X-Request-ID'] = g.dsl_request_id
        if response.status_code >= 500 and response.is_json:
            data = response.get_json()
            if isinstance(data, dict):
                data['request_id'] = g.dsl_request_id
                response.set_data(json.dumps(data))
        with self.lock:
            self.requests += 1
            self.slow += int(elapsed >= 1000)
            if response.status_code < 500:
                return response
            self.failures += 1
            values = request.view_args or {}
            code = values.get('code', '')
            event = dict(at=time.time(), request_id=g.dsl_request_id, status=response.status_code,
                         method=request.method, route=request.url_rule.rule if request.url_rule else '(unmatched)',
                         match=code.upper() if re.fullmatch('[a-fA-F0-9]{10}', code) else None,
                         duration_ms=elapsed, error=getattr(g, 'dsl_failure', None))
            current_app.logger.error('DSL failure id=%s status=%s route=%s match=%s duration_ms=%s',
                                     event['request_id'], event['status'], event['route'], event['match'], elapsed)
            self.recent.append(event)
            try:
                if self.path.exists() and self.path.stat().st_size > 1024 * 1024:
                    self.path.replace(self.path.with_suffix('.previous.jsonl'))
                with self.path.open('a', encoding='utf-8') as stream:
                    stream.write(json.dumps(event) + '\n')
                self.writable = True
            except OSError:
                self.writable = False
        return response

    def snapshot(self):
        with self.lock:
            events = []
            for path in (self.path.with_suffix('.previous.jsonl'), self.path):
                try:
                    with path.open(encoding='utf-8') as stream:
                        for line in stream:
                            try:
                                events.append(json.loads(line))
                            except ValueError:
                                pass
                except OSError:
                    pass
            unique = {item['request_id']: item for item in events + list(self.recent)}
            return dict(since=self.started, requests=self.requests, failures=self.failures, slow=self.slow,
                        journal_writable=self.writable,
                        failures_recent=sorted(unique.values(), key=lambda item: item['at'], reverse=True)[:100])


def install_admin(app, connect, commander, battle_name, db_path):
    path = Path(db_path).resolve()
    diagnostics = Diagnostics(path.parent / 'ww2-failures.jsonl')
    version = build_version()
    app.extensions['ww2_diagnostics'] = diagnostics
    with connect() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS admin_owner (
                singleton INTEGER PRIMARY KEY CHECK(singleton=1), commander_id INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS admin_audit (
                id INTEGER PRIMARY KEY, at REAL NOT NULL, commander_id INTEGER NOT NULL,
                action TEXT NOT NULL, code TEXT, detail TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS admin_trash (
                code TEXT PRIMARY KEY, name TEXT NOT NULL, host TEXT NOT NULL, guest TEXT,
                state TEXT NOT NULL, removed REAL NOT NULL);
        ''')

    @app.before_request
    def start_request():
        g.dsl_request_id = secrets.token_hex(8)
        g.dsl_started = time.monotonic()

    def on_exception(sender, exception, **extra):
        diagnostics.record(exception)
    got_request_exception.connect(on_exception, sender=app, weak=False)
    app.after_request(diagnostics.finish)

    def owner(db):
        return db.execute('SELECT commander_id FROM admin_owner WHERE singleton=1').fetchone()

    def require_admin(db):
        player = commander(db, required=True)
        bound = owner(db)
        if not bound or bound['commander_id'] != player['id']:
            raise Forbidden('This commander does not have administrator access.')
        return player

    def audit(db, player, action, code=None, detail=''):
        db.execute('INSERT INTO admin_audit(at,commander_id,action,code,detail) VALUES (?,?,?,?,?)',
                   (time.time(), player['id'], action, code, detail))

    def body_object():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise BadRequest('Expected an action object.')
        return body

    @app.get('/admin')
    def admin_page():
        # Public shell only. Every data and mutation endpoint checks owner ID.
        return send_from_directory('ww2_tactics/static', 'admin.html')

    @app.get('/api/admin/access')
    def admin_access():
        with connect() as db:
            player = commander(db, required=True)
            bound = owner(db)
        return jsonify(name=player['name'], admin=bool(bound and bound['commander_id'] == player['id']),
                       can_claim=bool(not bound and player['name'].lower() == 'shnider42'),
                       setup_enabled=len(os.environ.get('WW2_ADMIN_BOOTSTRAP_KEY', '')) >= 32)

    @app.post('/api/admin/claim')
    def admin_claim():
        body = body_object()
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            player = commander(db, required=True)
            if owner(db):
                raise Conflict('An administrator is already bound. The setup key cannot reassign access.')
            key = os.environ.get('WW2_ADMIN_BOOTSTRAP_KEY', '')
            supplied = body.get('key')
            if (player['name'].lower() != 'shnider42' or len(key) < 32 or not isinstance(supplied, str)
                    or not secrets.compare_digest(key.encode(), supplied.encode())):
                raise Forbidden('Administrator setup failed. Check the commander and setup key.')
            db.execute('INSERT INTO admin_owner VALUES (1,?)', (player['id'],))
            audit(db, player, 'claim')
        return jsonify(ok=True)

    @app.get('/api/admin/overview')
    def overview():
        with connect() as db:
            require_admin(db)
            counts = dict(db.execute('''SELECT count(*) AS matches,
                coalesce(sum(json_extract(state,'$.winner') IS NULL),0) AS unfinished,
                coalesce(sum(json_extract(state,'$.ai_side') IS NOT NULL),0) AS solo FROM match''').fetchone())
            for table in ('commanders', 'admin_trash', 'saves'):
                counts[table] = db.execute('SELECT count(*) FROM ' + table).fetchone()[0]
            reusable = db.execute('PRAGMA freelist_count').fetchone()[0] * db.execute('PRAGMA page_size').fetchone()[0]
            mode = db.execute('PRAGMA journal_mode').fetchone()[0]
        disk = shutil.disk_usage(path.parent)
        files = {}
        for item in (path, Path(str(path)+'-journal'), Path(str(path)+'-wal'), Path(str(path)+'-shm'),
                     diagnostics.path, diagnostics.path.with_suffix('.previous.jsonl')):
            try:
                files[item.name] = item.stat().st_size
            except FileNotFoundError:
                pass  # SQLite may remove its journal between requests.
        report_path = Path(os.environ.get('WW2_TEST_REPORT_PATH', path.parent / 'ww2-test-report.json'))
        report = None
        try:
            if report_path.stat().st_size <= 65536:
                report = json.loads(report_path.read_text())
                if not isinstance(report, dict):
                    report = None
        except (OSError, ValueError):
            pass
        if report:
            report['matches_version'] = bool(version['commit'] and report.get('commit') == version['commit']
                                             and not version['dirty'] and report.get('dirty') is False)
        return jsonify(counts=counts, storage=dict(path=str(path), files=files, reusable_bytes=reusable,
                       disk_total=disk.total, disk_free=disk.free, journal_mode=mode),
                       runtime=dict(environment='Render' if os.environ.get('RENDER') else 'Local / self-hosted',
                                    python=platform.python_version(), sqlite=__import__('sqlite3').sqlite_version,
                                    service=os.environ.get('RENDER_SERVICE_NAME'),
                                    service_id=os.environ.get('RENDER_SERVICE_ID'),
                                    instance=os.environ.get('RENDER_INSTANCE_ID')),
                       version=version, tests=report, diagnostics=diagnostics.snapshot())

    @app.get('/api/admin/matches')
    def matches():
        query = request.args.get('q', '').strip().lower()[:80]
        try:
            offset = max(0, min(1000000, int(request.args.get('offset', 0))))
        except ValueError:
            raise BadRequest('Invalid page.') from None
        trash = request.args.get('trash') == '1'
        with connect() as db:
            require_admin(db)
            source = ('admin_trash m' if trash else 'match m JOIN lobby_names n ON n.code=m.code')
            name, updated = ('m.name', 'm.removed') if trash else ('n.name', 'n.updated')
            rows = db.execute(f'''SELECT m.code,{name} AS name,{updated} AS updated,
                json_extract(m.state,'$.battlefield.name') AS scenario,
                json_extract(m.state,'$.round') AS round,json_extract(m.state,'$.turn') AS turn,
                json_extract(m.state,'$.winner') AS winner,json_extract(m.state,'$.ready') AS ready,
                json_extract(m.state,'$.ai_side') AS ai_side,json_extract(m.state,'$.revision') AS revision,
                length(CAST(m.state AS BLOB)) AS bytes,
                h.name AS host_name,g.name AS guest_name
                FROM {source}
                LEFT JOIN commander_seats hs ON hs.owner_hash=m.host
                LEFT JOIN commanders h ON h.id=hs.commander_id
                LEFT JOIN commander_seats gs ON gs.owner_hash=m.guest
                LEFT JOIN commanders g ON g.id=gs.commander_id
                WHERE instr(lower({name} || ' ' || m.code || ' ' || coalesce(h.name,'') || ' ' || coalesce(g.name,'')),?)>0
                ORDER BY {updated} DESC,m.code LIMIT 51 OFFSET ?''', (query, offset)).fetchall()
        return jsonify(matches=[dict(row) for row in rows[:50]], has_more=len(rows) > 50)

    @app.post('/api/admin/matches/<code>')
    def modify(code):
        body = body_object()
        code = code.upper()
        action = body.get('action')
        if action not in ('rename', 'cancel_rematch', 'remove', 'restore', 'purge'):
            raise BadRequest('Choose a supported match action.')
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            player = require_admin(db)
            trashed = action in ('restore', 'purge')
            table = 'admin_trash' if trashed else 'match'
            row = db.execute(f'SELECT * FROM {table} WHERE code=?', (code,)).fetchone()
            if not row:
                raise NotFound('Match not found. Refresh the list.')
            state = json.loads(row['state'])
            if type(body.get('revision')) is not int or body['revision'] != state['revision']:
                raise Conflict('This match changed. Refresh and review it before trying again.')
            if action in ('remove', 'restore', 'purge') and body.get('confirm') != code:
                raise BadRequest('Type the match code to confirm this action.')
            detail = ''
            if action == 'remove':
                name = db.execute('SELECT name FROM lobby_names WHERE code=?', (code,)).fetchone()['name']
                db.execute('INSERT INTO admin_trash VALUES (?,?,?,?,?,?)',
                           (code, name, row['host'], row['guest'], row['state'], time.time()))
                db.execute('DELETE FROM match WHERE code=?', (code,))
                db.execute('DELETE FROM transfers WHERE code=?', (code,))
            elif action == 'restore':
                if db.execute('SELECT 1 FROM match WHERE code=?', (code,)).fetchone():
                    raise Conflict('That code is already in use; nothing was changed.')
                state['revision'] += 1
                db.execute('INSERT INTO match(code,host,guest,state) VALUES (?,?,?,?)',
                           (code, row['host'], row['guest'], json.dumps(state)))
                db.execute('UPDATE lobby_names SET name=? WHERE code=?', (row['name'], code))
                db.execute('DELETE FROM admin_trash WHERE code=?', (code,))
            elif action == 'purge':
                db.execute('DELETE FROM admin_trash WHERE code=?', (code,))
                for owner_hash in (row['host'], row['guest']):
                    if not owner_hash:
                        continue
                    used = db.execute('''SELECT 1 FROM match WHERE host=? OR guest=? UNION ALL
                        SELECT 1 FROM admin_trash WHERE host=? OR guest=? LIMIT 1''', (owner_hash,)*4).fetchone()
                    if not used:
                        db.execute('DELETE FROM player_access WHERE owner_hash=?', (owner_hash,))
                        db.execute('DELETE FROM commander_seats WHERE owner_hash=?', (owner_hash,))
            else:
                if action == 'rename':
                    detail = battle_name(body.get('name'))
                    db.execute('UPDATE lobby_names SET name=? WHERE code=?', (detail, code))
                else:
                    if not state.pop('rematch', None):
                        raise Conflict('There is no pending rematch proposal.')
                state['revision'] += 1
                db.execute('UPDATE match SET state=? WHERE code=?', (json.dumps(state), code))
            audit(db, player, action, code, detail)
        return jsonify(ok=True)

    @app.get('/api/admin/matches/<code>/export')
    def export(code):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            player = require_admin(db)
            code = code.upper()
            row = db.execute('SELECT state FROM match WHERE code=?', (code,)).fetchone()
            if not row:
                row = db.execute('SELECT state FROM admin_trash WHERE code=?', (code,)).fetchone()
            if not row:
                raise NotFound('Match not found.')
            # State contains battlefield/history only. Never export seat hashes,
            # accounts, sessions, passwords, MOVE/SAVE secrets or database files.
            payload = dict(format='dsl-diagnostic-v1', exported_at=time.time(), version=version,
                           original_code=code, state=json.loads(row['state']))
            audit(db, player, 'export', code)
        response = jsonify(payload)
        response.headers['Content-Disposition'] = f'attachment; filename="dsl-{code}.json"'
        return response

    @app.get('/api/admin/audit')
    def audit_list():
        with connect() as db:
            require_admin(db)
            rows = db.execute('''SELECT a.at,a.action,a.code,a.detail,c.name AS commander
                FROM admin_audit a LEFT JOIN commanders c ON c.id=a.commander_id
                ORDER BY a.id DESC LIMIT 100''').fetchall()
        return jsonify(events=[dict(row) for row in rows])
