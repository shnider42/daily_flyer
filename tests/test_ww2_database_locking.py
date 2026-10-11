"""Gameplay commits must be short, independent of presentation delivery."""
import concurrent.futures
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics.engine import initial, options
from ww2_tactics.order_history import perform


class DatabaseLockingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp.name, 'games.sqlite3')
        self.app = create_app(self.path)
        self.client = self.app.test_client()
        self.host = self.client.post('/api/match', json={'scenario':'midway','ruleset':'dsl'}).get_json()
        self.url = '/api/match/'+self.host['code']
        self.guest = self.client.post(self.url+'/join', json={}).get_json()
        self.real_connect = sqlite3.connect

    def tearDown(self):
        self.temp.cleanup()

    def headers(self, seat):
        return {'Authorization':'Bearer '+seat['token']}

    def raw(self):
        with self.real_connect(self.path) as db:
            return json.loads(db.execute('SELECT state FROM match WHERE code=?', (self.host['code'],)).fetchone()[0])

    def seed_history(self):
        state = initial('midway', 'dsl')
        state['ready'] = True
        for _ in range(20):
            unit, legal = next((u, o) for u in state['units'] if u['side']=='us'
                               for o in [options(state, u)] if o['moves'])
            move = max(legal['moves'], key=lambda m:m['pos'][1])
            state = perform(state, 'us', {'kind':'move','unit':unit['id'],'pos':move['pos']})
        self.assertEqual(len(state['_order_history']['past']), 20)
        with self.real_connect(self.path) as db:
            db.execute('UPDATE match SET state=? WHERE code=?', (json.dumps(state), self.host['code']))
        return state

    def small_cache(self, *args, **kwargs):
        kwargs['timeout'] = .05
        db = self.real_connect(*args, **kwargs)
        db.execute('PRAGMA cache_size=8')
        db.execute('PRAGMA cache_spill=ON')
        return db

    def test_large_history_projection_releases_writer_and_preserves_undo(self):
        before = self.seed_history()
        blocked_readers = []

        def connect(*args, **kwargs):
            db = self.small_cache(*args, **kwargs)
            def trace(sql):
                if not sql.startswith('SELECT name FROM lobby_names'):
                    return
                # Projection runs after commit, so another player may write.
                other = self.real_connect(self.path, timeout=.01)
                try:
                    other.execute('BEGIN IMMEDIATE')
                    blocked_readers.append(False)
                except sqlite3.OperationalError as error:
                    blocked_readers.append(error.sqlite_errorcode == sqlite3.SQLITE_BUSY)
                finally:
                    other.close()
            db.set_trace_callback(trace)
            return db

        with patch('ww2_web.sqlite3.connect', side_effect=connect) as connections:
            response = self.client.post(self.url, headers=self.headers(self.host), json={'kind':'undo','revision':before['revision']})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertGreaterEqual(connections.call_count, 3)
        self.assertEqual(blocked_readers, [False])
        undone = response.get_json()
        self.assertTrue(undone['match_name'])
        self.assertNotIn('_order_history', undone)
        with patch('ww2_web.sqlite3.connect', side_effect=self.small_cache):
            redo = self.client.post(self.url, headers=self.headers(self.host), json={'kind':'redo','revision':undone['revision']})
        self.assertEqual(redo.status_code, 200, redo.get_json())
        self.assertEqual(self.raw()['units'], before['units'])
        self.assertEqual(self.raw()['revision'], before['revision']+2)
        # The second browser still reads its own seat and the committed revision.
        guest = self.client.get(self.url, headers=self.headers(self.guest)).get_json()
        self.assertEqual(guest['revision'], before['revision']+2)
        self.assertEqual(guest['side'], 'de')

    def test_full_multiplayer_rounds_pass_the_previously_failing_position(self):
        moves = 0
        largest = 0
        for turn in range(10):
            side = 'us' if turn%2==0 else 'de'
            seat = self.host if side=='us' else self.guest
            current = self.client.get(self.url, headers=self.headers(seat)).get_json()
            self.assertFalse(current['winner'])
            while True:
                choices = [(uid, sorted(o['moves'], key=lambda m:m['pos'][1], reverse=side=='us')[0]['pos'])
                           for uid,o in current['legal'].items() if o['moves']]
                if not choices:
                    break
                uid, pos = choices[0]
                result = self.client.post(self.url, headers=self.headers(seat), json={
                    'kind':'move','unit':uid,'pos':pos,'revision':current['revision']})
                self.assertEqual(result.status_code, 200, (turn, moves, result.get_json()))
                current = result.get_json()
                moves += 1
            largest = max(largest, len(json.dumps(self.raw())))
            result = self.client.post(self.url, headers=self.headers(seat), json={'kind':'end','revision':current['revision']})
            self.assertEqual(result.status_code, 200, result.get_json())
        self.assertGreater(moves, 500)
        self.assertLess(largest, 200000)
        self.assertEqual(self.raw()['round'], 6)

    def test_external_lock_returns_retryable_error_without_changing_or_replaying_order(self):
        before = self.raw()
        blocker = self.real_connect(self.path)
        blocker.execute('BEGIN IMMEDIATE')
        try:
            with patch('ww2_web.sqlite3.connect', side_effect=self.small_cache), self.assertLogs(self.app.logger, level='WARNING'):
                result = self.client.post(self.url, headers=self.headers(self.host), json={'kind':'end','revision':before['revision']})
            self.assertEqual(result.status_code, 503)
            self.assertEqual(result.headers['Retry-After'], '1')
            self.assertIn('temporarily busy', result.get_json()['error'])
            self.assertEqual(self.raw(), before)
        finally:
            blocker.rollback()
            blocker.close()
        result = self.client.post(self.url, headers=self.headers(self.host), json={'kind':'end','revision':before['revision']})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.get_json()['revision'], before['revision']+1)

    def test_racing_orders_preserve_revision_guard(self):
        before = self.raw()
        def end(_):
            return self.app.test_client().post(self.url, headers=self.headers(self.host),
                json={'kind':'end','revision':before['revision']}).status_code
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(end, range(2))), [200,409])
        self.assertEqual(self.raw()['revision'], before['revision']+1)

    def test_response_failure_keeps_commit_and_same_identity_reconciles(self):
        for sqlite_code, expected in ((sqlite3.SQLITE_BUSY, 503), (sqlite3.SQLITE_ERROR, 500)):
            with self.subTest(sqlite_code=sqlite_code):
                before = self.raw()
                seat = self.host if before['turn'] == 'us' else self.guest
                body = dict(kind='end', revision=before['revision'], command_id='lost-ack-'+str(sqlite_code))
                error = sqlite3.OperationalError('Injected database failure')
                error.sqlite_errorcode = sqlite_code
                with patch('ww2_web.public_state', side_effect=error), patch('ww2_web.perform', wraps=perform) as orders, self.assertLogs(self.app.logger):
                    result = self.client.post(self.url, headers=self.headers(seat), json=body)
                self.assertEqual(result.status_code, expected)
                self.assertEqual(orders.call_count, 1)
                accepted = self.raw()
                self.assertEqual(accepted['revision'], before['revision']+1)
                with patch('ww2_web.perform', wraps=perform) as orders:
                    retry = self.client.post(self.url, headers=self.headers(seat), json=body)
                self.assertEqual(retry.status_code, 200)
                self.assertEqual(orders.call_count, 0)
                self.assertEqual(self.raw(), accepted)


if __name__ == '__main__':
    unittest.main()
