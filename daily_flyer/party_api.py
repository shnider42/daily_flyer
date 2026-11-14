"""Loudsource's drop-in party layer. SQLite transactions serialize contested actions."""
from __future__ import annotations
import hashlib
import io
import secrets
import time
from collections import defaultdict, deque
from functools import wraps
from threading import Lock
from urllib.parse import urlsplit
from flask import Blueprint, Response, abort, g, jsonify, request
import qrcode
import qrcode.image.svg
from . import loudsource_feature as ls
from .party_content import TOPICS, PACKS, POLLS, PROMPTS

bp = Blueprint('party', __name__)
_limits = defaultdict(deque)
_limit_lock = Lock()


def init_party():
    with ls._connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS party_rooms (slug TEXT PRIMARY KEY, host_id TEXT, title TEXT NOT NULL DEFAULT 'The house party', prompt INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS party_people (id TEXT PRIMARY KEY, room TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, joined INTEGER NOT NULL, seen INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS party_people_room ON party_people(room);
        CREATE TABLE IF NOT EXISTS party_answers (room TEXT NOT NULL, person TEXT NOT NULL, question TEXT NOT NULL, choice INTEGER NOT NULL, correct INTEGER NOT NULL, PRIMARY KEY(room,person,question));
        CREATE TABLE IF NOT EXISTS party_polls (room TEXT NOT NULL, person TEXT NOT NULL, poll INTEGER NOT NULL, choice INTEGER NOT NULL, PRIMARY KEY(room,person,poll));
        ''')


def clean(value, limit):
    if not isinstance(value, str):
        raise ValueError('Please enter text.')
    return ' '.join(value.split())[:limit]


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, description='Please send a valid request.')
    return data


def rate(key, limit=30, period=60):
    now = time.monotonic()
    with _limit_lock:
        # Bounded per-process limiter; gunicorn is deliberately one worker.
        if len(_limits) > 5000:
            for k in list(_limits):
                if not _limits[k] or _limits[k][-1] < now - 300:
                    del _limits[k]
        q = _limits[key]
        while q and q[0] < now - period:
            q.popleft()
        if len(q) >= limit:
            abort(429, description='A few too many taps. Give it a moment and try again.')
        q.append(now)


def person(room, host=False):
    room = ls.normalize_session_slug(room)
    token = request.headers.get('X-Party-Token', '')
    if not token:
        abort(401, description='Join this room first.')
    hashed = hashlib.sha256(token.encode()).hexdigest()
    with ls._connect() as db:
        p = db.execute('SELECT p.*, r.host_id FROM party_people p JOIN party_rooms r ON p.room=r.slug WHERE p.room=? AND p.token_hash=?', (room, hashed)).fetchone()
        if not p:
            abort(401, description='Your seat is no longer available. Join again.')
        if host and p['id'] != p['host_id']:
            abort(403, description='Only the host can do that.')
        if p['seen'] < time.time() - 60:
            db.execute('UPDATE party_people SET seen=? WHERE id=?', (int(time.time()), p['id']))
    return dict(p)


def require_host(room):
    return person(room, True)


@bp.before_request
def guard():
    if request.view_args and 'room' in request.view_args:
        request.view_args['room'] = ls.normalize_session_slug(request.view_args['room'])
    if request.method == 'POST':
        origin = request.headers.get('Origin')
        if origin and urlsplit(origin).netloc != request.host:
            abort(403, description='Please use the party page to make changes.')


@bp.post('/api/party/<room>/join')
def join(room):
    room = ls.normalize_session_slug(room)
    rate(('join', request.remote_addr), 80)
    data = body()
    name = clean(data.get('name', ''), 24)
    if not name:
        abort(400, description='Give us a name to put on the board.')
    host = data.get('host') is True
    old_token = request.headers.get('X-Party-Token', '')
    token = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(token.encode()).hexdigest()
    pid = secrets.token_hex(12)
    now = int(time.time())
    ls.ensure_session(room)
    with ls._connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('INSERT OR IGNORE INTO party_rooms(slug) VALUES (?)', (room,))
        existing = db.execute('SELECT * FROM party_people WHERE room=? AND token_hash=?', (room, hashlib.sha256(old_token.encode()).hexdigest())).fetchone() if old_token else None
        if existing:
            pid, token = existing['id'], old_token
        host_id = db.execute('SELECT host_id FROM party_rooms WHERE slug=?', (room,)).fetchone()[0]
        if host and host_id and host_id != pid:
            abort(403, description='This room already has a host. Use the original host browser, or choose another room code.')
        if not existing:
            if db.execute('SELECT COUNT(*) FROM party_people WHERE room=?', (room,)).fetchone()[0] >= 100:
                abort(409, description='This room has reached 100 guests. Start another room.')
            db.execute('INSERT INTO party_people VALUES(?,?,?,?,?,?)', (pid, room, hashed, name, now, now))
        else:
            db.execute('UPDATE party_people SET name=?, seen=? WHERE id=?', (name, now, pid))
        if host:
            db.execute('UPDATE party_rooms SET host_id=? WHERE slug=?', (pid, room))
        db.commit()
    return jsonify(token=token, room=room, name=name, host=host or host_id == pid)


def music_vote(room, p, track, active):
    if not ls._is_valid_track_id(track):
        abort(400, description='Choose a song from the search results.')
    if not ls.get_track(track):
        abort(400, description='Search for that song before adding it.')
    with ls._connect() as db:
        db.execute('BEGIN IMMEDIATE')
        current = db.execute('SELECT current_uri FROM loudsource_sessions WHERE session_slug=?', (room,)).fetchone()
        if active and current and current[0] == 'spotify:track:' + track:
            abort(409, description='That song is already playing.')
        exists = db.execute('SELECT 1 FROM loudsource_ballots WHERE session_slug=? AND person_id=? AND track_id=?', (room, p['id'], track)).fetchone()
        if active and not exists:
            queued = db.execute('SELECT 1 FROM loudsource_votes WHERE session_slug=? AND track_id=? AND vote_count>0', (room,track)).fetchone()
            if not queued:
                count = db.execute('SELECT COUNT(*) FROM loudsource_requests WHERE session_slug=? AND person_id=?', (room,p['id'])).fetchone()[0]
                if count >= 3:
                    abort(409, description='You have three songs waiting. You can still vote for any song already on the list. A request slot opens when one of yours plays or is removed.')
                db.execute('INSERT INTO loudsource_requests VALUES(?,?,?)', (room,track,p['id']))
            db.execute('INSERT INTO loudsource_ballots VALUES(?,?,?)', (room, p['id'], track))
            db.execute('INSERT INTO loudsource_votes VALUES(?,?,1,?) ON CONFLICT(session_slug,track_id) DO UPDATE SET vote_count=vote_count+1', (room, track, int(time.time())))
        elif not active and exists:
            db.execute('DELETE FROM loudsource_ballots WHERE session_slug=? AND person_id=? AND track_id=?', (room, p['id'], track))
            db.execute('UPDATE loudsource_votes SET vote_count=MAX(0,vote_count-1) WHERE session_slug=? AND track_id=?', (room, track))
            remaining = db.execute('SELECT vote_count FROM loudsource_votes WHERE session_slug=? AND track_id=?', (room,track)).fetchone()
            if remaining and remaining[0] == 0:
                db.execute('DELETE FROM loudsource_votes WHERE session_slug=? AND track_id=?', (room,track))
                db.execute('DELETE FROM loudsource_requests WHERE session_slug=? AND track_id=?', (room,track))
        db.commit()


@bp.post('/api/party/<room>/vote')
def vote(room):
    p = person(room)
    rate(('vote', p['id']), 50)
    data = body()
    if not isinstance(data.get('active'), bool):
        abort(400, description='Choose or unchoose a song.')
    music_vote(room, p, data.get('track_id'), data['active'])
    return jsonify(ok=True)


@bp.get('/api/party/<room>/state')
def state(room):
    p = person(room)
    with ls._connect() as db:
        info = dict(db.execute('SELECT * FROM party_rooms WHERE slug=?', (room,)).fetchone())
        mine = [r[0] for r in db.execute('SELECT track_id FROM loudsource_ballots WHERE session_slug=? AND person_id=?', (room, p['id']))]
        requests = [r[0] for r in db.execute('SELECT track_id FROM loudsource_requests WHERE session_slug=? AND person_id=?', (room,p['id']))]
        people = [dict(r) for r in db.execute('SELECT p.id,p.name,COUNT(a.question) attempted,COALESCE(SUM(a.correct),0) correct FROM party_people p LEFT JOIN party_answers a ON a.person=p.id AND a.room=p.room WHERE p.room=? GROUP BY p.id ORDER BY correct DESC, attempted ASC, p.joined ASC', (room,))]
        answers = [dict(r) for r in db.execute('SELECT question,choice,correct FROM party_answers WHERE room=? AND person=?', (room, p['id']))]
        poll_rows = [dict(r) for r in db.execute('SELECT poll,choice,COUNT(*) votes FROM party_polls WHERE room=? GROUP BY poll,choice', (room,))]
        my_polls = {str(r[0]):r[1] for r in db.execute('SELECT poll,choice FROM party_polls WHERE room=? AND person=?', (room, p['id']))}
        history = [dict(r) for r in db.execute('SELECT h.track_id,t.name,t.artist,t.image FROM loudsource_history h JOIN loudsource_tracks t ON h.track_id=t.track_id WHERE h.session_slug=? ORDER BY h.id DESC LIMIT 8', (room,))]
    polls = []
    for i, (q, options) in enumerate(POLLS):
        counts = [next((r['votes'] for r in poll_rows if r['poll']==i and r['choice']==j), 0) for j in range(len(options))]
        polls.append(dict(id=i, question=q, options=options, counts=counts, mine=my_polls.get(str(i))))
    return jsonify(room=room,title=info['title'],prompt=PROMPTS[info['prompt'] % len(PROMPTS)],me={'id':p['id'],'name':p['name'],'host':p['id']==info['host_id']},host_claimed=bool(info['host_id']),people=people,answers=answers,polls=polls,mine=mine,requests=requests,history=history,music=ls.status_payload(room),topics=TOPICS)


@bp.get('/api/party/<room>/trivia/<topic>')
def trivia(room, topic):
    p = person(room)
    if topic not in PACKS:
        abort(404, description='That pack is not here.')
    with ls._connect() as db:
        answered = {r[0]:dict(r) for r in db.execute('SELECT question,choice,correct FROM party_answers WHERE room=? AND person=?', (room, p['id']))}
    questions = []
    for i,(q, options, right, why) in enumerate(PACKS[topic]):
        key = f'{topic}-{i}'
        out = dict(id=key,question=q,options=options)
        if key in answered:
            out.update(answered[key], answer=right, explanation=why)
        questions.append(out)
    return jsonify(questions=questions, topic=TOPICS[topic])


@bp.post('/api/party/<room>/answer')
def answer(room):
    p = person(room)
    data = body()
    key = data.get('question', '')
    try:
        topic, index = key.rsplit('-', 1)
        index = int(index)
        if index < 0:
            raise ValueError()
        q, options, right, why = PACKS[topic][index]
    except (AttributeError, TypeError, ValueError, KeyError, IndexError):
        abort(400, description='Choose a question from a pack.')
    choice = data.get('choice')
    if type(choice) is not int or choice not in range(4):
        abort(400, description='Choose one of the four answers.')
    with ls._connect() as db:
        db.execute('INSERT OR IGNORE INTO party_answers VALUES(?,?,?,?,?)', (room, p['id'], key, choice, int(choice==right)))
        saved = dict(db.execute('SELECT choice,correct FROM party_answers WHERE room=? AND person=? AND question=?', (room,p['id'],key)).fetchone())
    return jsonify(**saved,answer=right,explanation=why)


@bp.post('/api/party/<room>/poll')
def poll(room):
    p = person(room)
    data = body()
    i, choice = data.get('poll'), data.get('choice')
    if type(i) is not int or i not in range(len(POLLS)) or type(choice) is not int or choice not in range(4):
        abort(400, description='Choose one of the poll options.')
    with ls._connect() as db:
        db.execute('INSERT INTO party_polls VALUES(?,?,?,?) ON CONFLICT(room,person,poll) DO UPDATE SET choice=excluded.choice', (room,p['id'],i,choice))
    return jsonify(ok=True)


@bp.post('/api/party/<room>/host')
def host_action(room):
    p = require_host(room)
    data = body()
    action = data.get('action')
    if action == 'prompt':
        with ls._connect() as db:
            db.execute('UPDATE party_rooms SET prompt=prompt+1 WHERE slug=?', (room,))
    elif action == 'title':
        title = clean(data.get('title',''), 48)
        if not title:
            abort(400, description='Enter a name for this party.')
        with ls._connect() as db:
            db.execute('UPDATE party_rooms SET title=? WHERE slug=?', (title, room))
    elif action == 'remove':
        track = data.get('track_id','')
        if not ls._is_valid_track_id(track):
            abort(400, description='Invalid track.')
        ls.remove_vote(room, track)
    elif action == 'auto':
        if type(data.get('enabled')) is not bool:
            abort(400, description='Choose on or off.')
        ls.update_state(room, auto_enabled=data['enabled'])
    elif action in ('pause','resume','device'):
        sp = ls._user_sp(room)
        if not sp:
            abort(400, description='Connect the host Spotify account first.')
        try:
            if action == 'pause':
                ls.update_state(room, auto_enabled=False)
                sp.pause_playback()
            elif action == 'resume':
                sp.start_playback()
            else:
                device = data.get('device_id')
                if not isinstance(device,str) or device not in [d['id'] for d in ls._list_devices(sp) if not d.get('is_restricted')]:
                    abort(400, description='Choose an available Spotify device.')
                sp.transfer_playback(device, force_play=False)
        except Exception as exc:
            if hasattr(exc, 'code'):
                raise
            abort(400, description='Spotify could not do that. Open Spotify on the speaker device and try again.')
    elif action == 'transfer':
        target = data.get('person_id')
        with ls._connect() as db:
            if not db.execute('SELECT 1 FROM party_people WHERE room=? AND id=?', (room,target)).fetchone():
                abort(400, description='Choose someone in this room.')
            db.execute('UPDATE party_rooms SET host_id=? WHERE slug=?', (target,room))
    else:
        abort(400, description='Unknown host action.')
    return jsonify(ok=True)


@bp.get('/api/party/<room>/qr.svg')
def qr(room):
    room = ls.normalize_session_slug(room)
    # Built locally: no guest data or room link is sent to a QR service.
    uri = request.url_root.rstrip('/') + '/?room=' + room
    img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage, border=3)
    output = io.BytesIO()
    img.save(output)
    return Response(output.getvalue(), mimetype='image/svg+xml')
