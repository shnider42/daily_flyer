"""Durable, single-consumer AI queue for the existing SQLite deployment.

Computation happens outside a write transaction. A lease and revision compare
make the state, recorded outcomes and progress one atomic checkpoint. Killing
the process loses only uncommitted work, not already accepted orders or dice.
"""
import atexit
import hashlib
import json
import random
import secrets
import threading
import time

from . import cooperative, deployment, pipeline
from .computer import play_turn


def install(db):
    db.execute('''CREATE TABLE IF NOT EXISTS ww2_ai_jobs (
        code TEXT PRIMARY KEY, generation TEXT, seed TEXT, status TEXT,
        lease TEXT, expires REAL, attempts INTEGER, batches INTEGER, updated REAL)''')


def needed(state):
    if state.get('winner') or not state.get('ready') or deployment.active(state):
        return False
    if state.get('coop'):
        return bool(state['coop']['phase'] == 'battle' and (cooperative.humans_alive(state) or state.get('_spectator_ai_batch'))
                    and not cooperative.pending(state, state['turn']))
    return bool(state.get('ai_side') == state['turn'])


class Queue:
    def __init__(self, connect, logger):
        self.connect, self.logger = connect, logger
        self.stopping = threading.Event()
        self.wakeup = threading.Event()
        self.thread = None
        self.plan = {}
        self.plan_key = None

    def request(self, db, code, state, *, reset=False, resume=False):
        row = db.execute('SELECT * FROM ww2_ai_jobs WHERE code=?', (code,)).fetchone()
        if not needed(state):
            db.execute("UPDATE ww2_ai_jobs SET status='done',lease=NULL,expires=0 WHERE code=?", (code,))
            return
        if not row or row['status'] == 'done':
            db.execute('INSERT OR REPLACE INTO ww2_ai_jobs VALUES (?,?,?,?,?,?,?,?,?)',
                       (code, secrets.token_hex(16), secrets.token_hex(32), 'pending', None, 0, 0, int(resume), time.time()))
        elif reset and row['status'] == 'paused':
            db.execute("UPDATE ww2_ai_jobs SET status='pending',attempts=0,expires=0 WHERE code=?", (code,))
        self.wakeup.set()

    def recover(self):
        # Read only tiny metadata here, not every saved game's replay/history.
        with self.connect() as db:
            codes = [r[0] for r in db.execute("""SELECT code FROM match WHERE
                json_extract(state,'$.winner') IS NULL AND json_extract(state,'$.ready')=1 AND
                (json_extract(state,'$.coop.resolving')=1 OR json_extract(state,'$._spectator_ai_batch')=1 OR
                 json_extract(state,'$.ai_side')=json_extract(state,'$.turn'))""")]
        for code in codes:
            if self.stopping.is_set():
                break
            with self.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                pipeline.migrate(db, code)
                row = db.execute('SELECT state FROM match WHERE code=?', (code,)).fetchone()
                if row:
                    self.request(db, code, json.loads(row[0]), resume=True)

    def work_once(self):
        if self.stopping.is_set():
            return False
        now, lease = time.time(), secrets.token_hex(16)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            job = db.execute("""SELECT * FROM ww2_ai_jobs WHERE
                (status='pending' AND expires<=?) OR (status='running' AND expires<?)
                ORDER BY updated LIMIT 1""", (now, now)).fetchone()
            if not job:
                return False
            row = db.execute('SELECT state FROM match WHERE code=?', (job['code'],)).fetchone()
            if not row:
                db.execute('DELETE FROM ww2_ai_jobs WHERE code=?', (job['code'],))
                return True
            state = json.loads(row[0])
            if not needed(state):
                db.execute("UPDATE ww2_ai_jobs SET status='done',lease=NULL,expires=0 WHERE code=?", (job['code'],))
                return True
            previous_views = pipeline.replay_before_views(db, job['code'], state)
            db.execute("UPDATE ww2_ai_jobs SET status='running',lease=?,expires=? WHERE code=?", (lease, now + 45, job['code']))
        # Never retain multiple armies' path plans or live game snapshots.
        key = (job['code'], job['generation'], state['turn'], state['round'])
        if key != self.plan_key:
            self.plan, self.plan_key = {}, key
        revision = state['revision']
        rng = random.Random(hashlib.sha256((job['seed'] + ':' + str(revision)).encode()).digest())
        roll = lambda: rng.randint(1, 6)
        try:
            if state.get('coop'):
                result = cooperative.advance(state, max_orders=2, roll=roll, planning=self.plan, previous_views=previous_views)
                result.pop('_spectator_ai_batch', None)
            else:
                result = play_turn(state, max_orders=2, roll=roll, planning=self.plan, previous_views=previous_views)
                if job['batches']:
                    result['computer_orders'] = state.get('computer_orders', []) + result.get('computer_orders', [])
            result['background_ai'] = True
            with self.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                current = db.execute('SELECT generation,lease FROM ww2_ai_jobs WHERE code=?', (job['code'],)).fetchone()
                actual = db.execute("SELECT json_extract(state,'$.revision') FROM match WHERE code=?", (job['code'],)).fetchone()
                if not current or current['generation'] != job['generation'] or current['lease'] != lease:
                    return True
                if not actual or actual[0] != revision:
                    db.execute("UPDATE ww2_ai_jobs SET status='pending',lease=NULL,expires=0,updated=? WHERE code=?", (time.time(), job['code']))
                    return True
                pipeline.persist(db, job['code'], result, previous=state, append_movies=job['batches'] > 0)
                db.execute("UPDATE ww2_ai_jobs SET status=?,lease=NULL,expires=0,attempts=0,batches=batches+1,updated=? WHERE code=?",
                           ('pending' if needed(result) else 'done', time.time(), job['code']))
            return True
        except Exception:
            self.logger.exception('Computer job failed; its last committed checkpoint remains intact.')
            with self.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                attempts = job['attempts'] + 1
                db.execute("UPDATE ww2_ai_jobs SET status=?,lease=NULL,expires=?,attempts=?,updated=? WHERE code=? AND lease=?",
                           ('paused' if attempts >= 3 else 'pending', time.time() + 2 ** attempts, attempts, time.time(), job['code'], lease))
            return True

    def loop(self):
        recovered, retry_at = False, 0
        while not self.stopping.is_set():
            try:
                if not recovered and time.time() >= retry_at:
                    try:
                        self.recover()
                        recovered = True
                    except Exception:
                        retry_at = time.time() + 10
                        self.logger.exception('Computer queue recovery will retry.')
                if self.work_once():
                    # Yield between bounded batches so HTTP threads can answer.
                    self.stopping.wait(.04)
                    continue
            except Exception:
                self.logger.exception('Computer queue is temporarily unavailable.')
            self.wakeup.wait(.5)
            self.wakeup.clear()

    def start(self):
        if not self.thread:
            self.thread = threading.Thread(target=self.loop, name='dsl-computer', daemon=True)
            self.thread.start()
            atexit.register(self.stop)

    def stop(self):
        self.stopping.set()
        self.wakeup.set()
        if self.thread and self.thread is not threading.current_thread():
            self.thread.join(timeout=6)


def status(db, code, state):
    row = db.execute('SELECT status FROM ww2_ai_jobs WHERE code=?', (code,)).fetchone()
    pending = needed(state)
    return dict(pending=pending, status=public_status(row[0] if row else 'pending') if pending else 'done')


def public_status(value):
    # The browser need not repaint or invalidate its baseline on every lease.
    return 'working' if value in ('pending', 'running') else value
