"""Presentation storage and transport, deliberately outside the rules engine.

Only already-redacted public views are diffed. No visibility result is cached
across orders, and a transport hash never authenticates a player. Replay and
takeback payloads are immutable compressed artifacts, not live match state.
"""
import copy
import base64
import hashlib
import json
import secrets
import zlib

PAGE = 12
MAX_LEGACY_REPLAY = 1_500_000


def dumps(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=True)


def pack(value):
    return zlib.compress(dumps(value).encode(), 3)


def unpack(value):
    return json.loads(zlib.decompress(value))


def changes(before, after, path=()):
    """Small JSON operations; hex masks are sets, unit rosters are ID keyed."""
    if before == after:
        return []
    if isinstance(before, dict) and isinstance(after, dict):
        result = [['del', list(path + (key,))] for key in before.keys() - after.keys()]
        for key, value in after.items():
            result.extend(changes(before[key], value, path + (key,)) if key in before
                          else [['set', list(path + (key,)), value]])
        return result
    if isinstance(before, list) and isinstance(after, list):
        if path and path[-1] in ('visible_hexes', 'visible_air_hexes'):
            old, new = {tuple(p) for p in before}, {tuple(p) for p in after}
            return [['hexes', list(path), sorted(new - old), sorted(old - new)]]
        if path and path[-1] in ('units', 'contacts') and all(isinstance(u, dict) and 'id' in u for u in before + after):
            old = {u['id']: u for u in before}
            new = {u['id']: u for u in after}
            return [['units', list(path), [u for u in after if old.get(u['id']) != u],
                     list(old.keys() - new.keys()), [u['id'] for u in after]]]
        if len(before) == len(after):
            return [op for i, value in enumerate(after) for op in changes(before[i], value, path + (i,))]
    return [['set', list(path), after]]


def patch(value, operations):
    result = copy.deepcopy(value)
    for op in operations:
        kind, path, *data = op
        if not path:
            result = copy.deepcopy(data[0])
            continue
        target = result
        for key in path[:-1]:
            target = target[key]
        key = path[-1]
        if kind == 'del':
            target.pop(key, None)
        elif kind == 'hexes':
            positions = {tuple(p) for p in target[key]}
            positions.difference_update(map(tuple, data[1]))
            positions.update(map(tuple, data[0]))
            target[key] = [list(p) for p in sorted(positions, key=lambda p: (p[1], p[0]))]
        elif kind == 'units':
            roster = {u['id']: u for u in target[key] if u['id'] not in data[1]}
            roster.update((u['id'], copy.deepcopy(u)) for u in data[0])
            target[key] = [roster[uid] for uid in data[2]]
        else:
            target[key] = copy.deepcopy(data[0])
    return result


def install(db):
    db.executescript('''
        CREATE TABLE IF NOT EXISTS ww2_replays (
            code TEXT, stream TEXT, side TEXT, identity INTEGER, count INTEGER,
            expanded_bytes INTEGER, tail BLOB, PRIMARY KEY(code,stream));
        CREATE TABLE IF NOT EXISTS ww2_replay_events (
            code TEXT, stream TEXT, sequence INTEGER, checkpoint BLOB, event BLOB,
            PRIMARY KEY(code,stream,sequence));
        CREATE TABLE IF NOT EXISTS ww2_journal (
            code TEXT, entry TEXT, snapshot BLOB, PRIMARY KEY(code,entry));
        CREATE TABLE IF NOT EXISTS ww2_public_views (
            code TEXT, owner TEXT, hash TEXT, revision INTEGER, view BLOB,
            PRIMARY KEY(code,owner,hash));
        CREATE TABLE IF NOT EXISTS ww2_receipts (
            code TEXT, owner TEXT, command TEXT, digest TEXT, revision INTEGER,
            PRIMARY KEY(code,owner,command));
    ''')


def store_movie(db, code, side, movie, previous=None, append=False):
    if 'frames' not in movie:
        return movie
    prior = previous if append and previous and previous.get('format') == 2 else None
    stream = prior['stream'] if prior else secrets.token_hex(16)
    row = db.execute('SELECT * FROM ww2_replays WHERE code=? AND stream=?', (code, stream)).fetchone() if prior else None
    count = row['count'] if row else 0
    expanded = row['expanded_bytes'] if row else 0
    tail = unpack(row['tail']) if row and row['tail'] else None
    for frame in movie['frames']:
        before, after = frame['before'], frame['after']
        event = {k: v for k, v in frame.items() if k not in ('before', 'after')}
        event['before_patch'] = changes(tail, before) if tail is not None else []
        event['after_patch'] = changes(before, after)
        checkpoint = pack(before) if count % PAGE == 0 else None
        db.execute('INSERT INTO ww2_replay_events VALUES (?,?,?,?,?)',
                   (code, stream, count, checkpoint, pack(event)))
        count += 1
        expanded += len(dumps(frame))
        tail = after
    db.execute('INSERT OR REPLACE INTO ww2_replays VALUES (?,?,?,?,?,?,?)',
               (code, stream, side, movie['id'], count, expanded, pack(tail) if tail is not None else None))
    return dict(id=movie['id'], format=2, stream=stream, count=count)


def read_page(db, code, movie, start=0):
    start = max(0, start // PAGE * PAGE)
    rows = db.execute('SELECT * FROM ww2_replay_events WHERE code=? AND stream=? AND sequence>=? AND sequence<? ORDER BY sequence',
                      (code, movie['stream'], start, start + PAGE)).fetchall()
    return dict(stream=movie['stream'], start=start, count=movie['count'],
                checkpoint=unpack(rows[0]['checkpoint']) if rows else None,
                events=[unpack(row['event']) for row in rows])


def replay_before_views(db, code, state):
    """Reuse an immutable after-view ONLY as the same revision's before-view.

    This does not reuse sight after a new order. It avoids calculating the
    identical pre-order picture again merely because a worker batch ended.
    """
    movies = (state.get('_coop_replays', {}) if state.get('coop') else
              {'us' if state.get('ai_side') == 'de' else 'de': state.get('computer_playback', {})})
    result = {}
    for side, movie in movies.items():
        if movie.get('format') != 2 or movie.get('id') != state['revision']:
            continue
        row = db.execute('SELECT tail FROM ww2_replays WHERE code=? AND stream=? AND side=? AND identity=?',
                         (code, movie['stream'], side, state['revision'])).fetchone()
        if row and row[0]: result[side] = unpack(row[0])
    return result


def original_movie(db, code, movie):
    """Compatibility for small old clients, never expand an unbounded movie."""
    if movie.get('format') != 2:
        return movie
    row = db.execute('SELECT expanded_bytes FROM ww2_replays WHERE code=? AND stream=?', (code, movie['stream'])).fetchone()
    if not row or row['expanded_bytes'] > MAX_LEGACY_REPLAY:
        return dict(movie, frames=[], update_required=True)
    frames = []
    for start in range(0, movie['count'], PAGE):
        page = read_page(db, code, movie, start)
        snapshot = page['checkpoint']
        for event in page['events']:
            before = patch(snapshot, event['before_patch'])
            after = patch(before, event['after_patch'])
            frames.append({k: v for k, v in event.items() if k not in ('before_patch', 'after_patch')} |
                          dict(before=before, after=after))
            snapshot = after
    return dict(id=movie['id'], frames=frames)


def persist(db, code, state, previous=None, append_movies=False):
    """Externalize new artifacts in the SAME commit as the accepted order."""
    for key in ('computer_playback', '_coop_replays'):
        if key not in state:
            continue
        if key == 'computer_playback':
            side = 'us' if state.get('ai_side') == 'de' else 'de'
            state[key] = store_movie(db, code, side, state[key], (previous or {}).get(key), append_movies)
        else:
            state[key] = {side: store_movie(db, code, side, movie,
                         (previous or {}).get(key, {}).get(side), append_movies)
                         for side, movie in state[key].items()}
    history = state.get('_order_history', {})
    keep = []
    for stack in ('past', 'future'):
        for item in history.get(stack, []):
            snap = item['snapshot']
            if set(snap) == {'_journal_ref'}:
                entry = snap['_journal_ref']
            else:
                entry = secrets.token_hex(16)
                db.execute('INSERT INTO ww2_journal VALUES (?,?,?)', (code, entry, pack(snap)))
                item['snapshot'] = {'_journal_ref': entry}
            keep.append(entry)
    # Save copies and administrator trash use their own namespace/retain their
    # artifacts; cleanup only unreachable entries of this still-active match.
    if keep:
        db.execute('DELETE FROM ww2_journal WHERE code=? AND entry NOT IN (' + ','.join('?' for _ in keep) + ')', (code, *keep))
    else:
        db.execute('DELETE FROM ww2_journal WHERE code=?', (code,))
    # A teammate can start the next turn while another watches a replay.
    # Keep three streams per army, not just the latest pointer; storage stays
    # bounded without invalidating the immediately preceding replay's pages.
    for side in ('us', 'de'):
        stale = 'SELECT stream FROM ww2_replays WHERE code=? AND side=? AND rowid NOT IN (SELECT rowid FROM ww2_replays WHERE code=? AND side=? ORDER BY identity DESC,rowid DESC LIMIT 3)'
        db.execute('DELETE FROM ww2_replay_events WHERE code=? AND stream IN (' + stale + ')', (code, code, side, code, side))
        db.execute('DELETE FROM ww2_replays WHERE stream IN (' + stale + ') AND code=?', (code, side, code, side, code))
    db.execute('UPDATE match SET state=? WHERE code=?', (dumps(state), code))


def hydrate_takeback(db, code, state, kind):
    stack = 'past' if kind == 'undo' else 'future'
    entries = state.get('_order_history', {}).get(stack, [])
    if kind not in ('undo', 'redo') or not entries:
        return
    item = entries[-1]
    reference = item['snapshot'].get('_journal_ref')
    if reference:
        row = db.execute('SELECT snapshot FROM ww2_journal WHERE code=? AND entry=?', (code, reference)).fetchone()
        if not row:
            raise ValueError('The takeback checkpoint is unavailable. Refresh the battlefield.')
        item['snapshot'] = unpack(row['snapshot'])


def migrate(db, code):
    """Stream old JSON movies one frame at a time, never decode the whole game.

    Called once per old live match. SQL removes bulky presentation/journal
    payloads before Python sees the state; existing outcomes are not rerun.
    """
    row = db.execute('SELECT json_extract(state,\'$.pipeline_version\') FROM match WHERE code=?', (code,)).fetchone()
    if not row or row[0] == 2:
        return
    removed = ['$.computer_playback.frames', '$._coop_replays.us.frames', '$._coop_replays.de.frames', '$._order_history']
    state_row = db.execute('SELECT json_remove(state,' + ','.join('?' for _ in removed) + ') FROM match WHERE code=?', (*removed, code)).fetchone()
    state = json.loads(state_row[0])
    for key, side, path in (('computer_playback', 'us' if state.get('ai_side') == 'de' else 'de', '$.computer_playback'),
                            ('_coop_replays', 'us', '$._coop_replays.us'), ('_coop_replays', 'de', '$._coop_replays.de')):
        movie = state.get(key) if key == 'computer_playback' else state.get(key, {}).get(side)
        if not isinstance(movie, dict) or movie.get('format') == 2:
            continue
        frames = (json.loads(r[0]) for r in db.execute('SELECT value FROM match,json_each(match.state,?) WHERE code=?', (path + '.frames', code)))
        movie = store_movie(db, code, side, dict(id=movie['id'], frames=frames))
        if key == 'computer_playback': state[key] = movie
        else: state[key][side] = movie
    raw = db.execute("SELECT json_remove(json_extract(state,'$._order_history'),'$.past','$.future') FROM match WHERE code=?", (code,)).fetchone()[0]
    if raw:
        history = json.loads(raw)
        for stack in ('past', 'future'):
            history[stack] = []
            for record in db.execute("SELECT json_remove(value,'$.snapshot.computer_playback') FROM match,json_each(match.state,?) WHERE code=?", ('$._order_history.' + stack, code)):
                item = json.loads(record[0])
                entry = secrets.token_hex(16)
                db.execute('INSERT INTO ww2_journal VALUES (?,?,?)', (code, entry, pack(item['snapshot'])))
                item['snapshot'] = {'_journal_ref': entry}
                history[stack].append(item)
        state['_order_history'] = history
    state['pipeline_version'] = 2
    persist(db, code, state)


def transport(db, code, owner, result, known=None):
    raw = dumps(result)
    identity = hashlib.sha256(raw.encode()).hexdigest()
    row = db.execute('SELECT view FROM ww2_public_views WHERE code=? AND owner=? AND hash=?', (code, owner, known)).fetchone() if known else None
    answer = result
    if row:
        operations = changes(unpack(row['view']), result)
        delta = dict(delta=True, base=known, code=code, revision=result['revision'], changes=operations)
        if len(dumps(delta)) < len(raw):
            answer = delta
    db.execute('INSERT OR IGNORE INTO ww2_public_views VALUES (?,?,?,?,?)',
               (code, owner, identity, result['revision'], zlib.compress(raw.encode(), 3)))
    db.execute('DELETE FROM ww2_public_views WHERE code=? AND owner=? AND hash NOT IN (SELECT hash FROM ww2_public_views WHERE code=? AND owner=? ORDER BY revision DESC,rowid DESC LIMIT 3)',
               (code, owner, code, owner))
    return answer | {'_transport': dict(version=2, hash=identity)}


def copy_artifacts(db, source, destination):
    for table, columns in (('ww2_replays', 'stream,side,identity,count,expanded_bytes,tail'),
                           ('ww2_replay_events', 'stream,sequence,checkpoint,event'),
                           ('ww2_journal', 'entry,snapshot')):
        db.execute(f'INSERT INTO {table} SELECT ?,{columns} FROM {table} WHERE code=?', (destination, source))


def purge_artifacts(db, code):
    # Exact match namespace only; independent SAVE copies are unaffected.
    for table in (*ARTIFACTS, 'ww2_public_views', 'ww2_receipts', 'ww2_ai_jobs'):
        db.execute(f'DELETE FROM {table} WHERE code=?', (code,))


# Only gameplay records: no seat hashes, public-view hashes, receipts or job seeds.
ARTIFACTS = {
    'ww2_replays': ('stream,side,identity,count,expanded_bytes,tail', {5}),
    'ww2_replay_events': ('stream,sequence,checkpoint,event', {2, 3}),
    'ww2_journal': ('entry,snapshot', {1}),
}


def export_artifacts(db, code):
    tables = {}
    for table, (columns, blobs) in ARTIFACTS.items():
        tables[table] = [[base64.b64encode(v).decode('ascii') if i in blobs and v is not None else v
                          for i, v in enumerate(row)]
                         for row in db.execute(f'SELECT {columns} FROM {table} WHERE code=?', (code,))]
    return dict(version=1, tables=tables)


def import_artifacts(db, code, bundle):
    if bundle is None:
        return
    if not isinstance(bundle, dict) or bundle.get('version') != 1 or not isinstance(bundle.get('tables'), dict):
        raise ValueError('Invalid gameplay artifact bundle.')
    if bundle['tables'].keys() - ARTIFACTS.keys():
        raise ValueError('Unexpected diagnostic artifact table.')
    for table, (columns, blobs) in ARTIFACTS.items():
        rows = bundle['tables'].get(table, [])
        if not isinstance(rows, list):
            raise ValueError('Invalid gameplay artifact rows.')
        for row in rows:
            if not isinstance(row, list) or len(row) != len(columns.split(',')):
                raise ValueError('Invalid gameplay artifact record.')
            try:
                record = [base64.b64decode(v, validate=True) if i in blobs and v is not None else v
                          for i, v in enumerate(row)]
            except (ValueError, TypeError) as error:
                raise ValueError('Invalid compressed gameplay artifact.') from error
            db.execute(f'INSERT INTO {table} (code,{columns}) VALUES (' + ','.join('?' for _ in range(len(row)+1)) + ')',
                       (code, *record))


def receipt(db, code, owner, body):
    command = body.get('command_id')
    if command is None:
        return None, None
    if not isinstance(command, str) or not 8 <= len(command) <= 96:
        raise ValueError('Invalid order identity.')
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    row = db.execute('SELECT digest,revision FROM ww2_receipts WHERE code=? AND owner=? AND command=?', (code, owner, command)).fetchone()
    if row and row['digest'] != digest:
        raise ValueError('An order identity cannot be reused for a different command.')
    return row, digest


def remember_receipt(db, code, owner, body, digest, revision):
    if digest:
        db.execute('INSERT INTO ww2_receipts VALUES (?,?,?,?,?)', (code, owner, body['command_id'], digest, revision))
        # Bounded receipts cover lost acknowledgements and reconnect retries.
        db.execute('DELETE FROM ww2_receipts WHERE code=? AND owner=? AND command NOT IN (SELECT command FROM ww2_receipts WHERE code=? AND owner=? ORDER BY rowid DESC LIMIT 256)', (code, owner, code, owner))
