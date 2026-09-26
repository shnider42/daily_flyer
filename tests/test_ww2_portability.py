"""Cross-device seats, isolated matches, and immutable solo checkpoints."""
import concurrent.futures
import hashlib
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics.engine import initial


class PortabilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'battles.sqlite3')
        self.app = create_app(self.path)
        self.client = self.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()

    def create(self, mode='computer', scenario='village'):
        response = self.client.post('/api/match', json=dict(opponent=mode, scenario=scenario))
        self.assertEqual(response.status_code, 201)
        return response.get_json()

    def headers(self, seat):
        return {'Authorization': 'Bearer '+seat['token']}

    def url(self, seat):
        return '/api/match/'+seat['code']

    def state(self, seat):
        response = self.client.get(self.url(seat), headers=self.headers(seat))
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def post(self, seat, suffix, body):
        return self.client.post(self.url(seat)+suffix, headers=self.headers(seat), json=body)

    def transfer(self, seat):
        return self.post(seat, '/transfer', {}).get_json()['transfer_code']

    def save(self, seat):
        return self.post(seat, '/save', {'revision': self.state(seat)['revision']}).get_json()['save_code']

    def restore(self, code):
        response = self.client.post('/api/restore', json={'code': code})
        self.assertEqual(response.status_code, 201)
        return response.get_json()

    def same_battle(self, a, b):
        a, b = dict(a), dict(b)
        a.pop('code'); b.pop('code')
        self.assertEqual(a, b)

    def test_matches_and_credentials_are_isolated(self):
        a, b, shared = self.create(), self.create(scenario='riverfront'), self.create('human')
        before = self.state(a)
        self.assertEqual(self.client.get(self.url(b), headers=self.headers(a)).status_code, 403)
        self.assertEqual(self.post(b, '', {'kind':'end', 'revision':0}).status_code, 200)
        self.assertEqual(self.state(a), before)
        self.assertFalse(self.state(shared)['ready'])
        self.assertEqual(self.post(b, '/rematch', {'operation':'propose', 'revision':self.state(b)['revision'], 'scenario':'orchard', 'swap':True}).status_code, 200)
        self.assertEqual(self.state(a), before)
        self.assertEqual(self.state(b)['side'], 'de')
        self.assertEqual(self.post(b, '/reset', {}).status_code, 200)
        self.assertEqual(self.state(a), before)

    def test_concurrent_independent_creation(self):
        def create(_):
            response = self.app.test_client().post('/api/match', json={'opponent':'computer'})
            return response.status_code, response.get_json()['code']
        with concurrent.futures.ThreadPoolExecutor(4) as pool:
            results = list(pool.map(create, range(8)))
        self.assertTrue(all(status == 201 for status, _ in results))
        self.assertEqual(len({code for _, code in results}), 8)

    def test_transfer_preserves_live_seat_and_tracks_army_swap(self):
        seat = self.create()
        before = self.state(seat)
        code = self.transfer(seat)
        response = self.client.post('/api/transfer', json={'code':code.lower().replace('-', ' ')})
        self.assertEqual(response.status_code, 200)
        second = response.get_json()
        self.assertEqual(self.state(second), before)
        self.assertEqual(self.client.post('/api/transfer', json={'code':code}).status_code, 400)
        self.post(second, '', {'kind':'move', 'unit':'us0', 'pos':[1,7], 'revision':0})
        self.assertEqual(self.state(second), self.state(seat))
        result = self.post(second, '/rematch', {'operation':'propose', 'revision':1, 'scenario':'village', 'swap':True})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.state(second)['side'], 'de')
        self.assertEqual(self.state(second), self.state(seat))
        # A transferred device can transfer again.
        third = self.client.post('/api/transfer', json={'code':self.transfer(second)}).get_json()
        self.assertEqual(self.state(third), self.state(seat))

    def test_guest_transfer_and_same_revision_conflict(self):
        seat = self.create('human')
        guest = self.client.post(self.url(seat)+'/join', json={}).get_json()
        code = self.transfer(guest)
        copied = self.client.post('/api/transfer', json={'code':code}).get_json()
        self.assertEqual(self.state(copied)['side'], 'de')
        self.post(seat, '', {'kind':'end', 'revision':1})
        self.assertEqual(self.post(copied, '', {'kind':'end', 'revision':2}).status_code, 200)
        self.assertEqual(self.post(guest, '', {'kind':'end', 'revision':2}).status_code, 409)

    def test_expiry_reset_and_unauthorized_codes(self):
        seat = self.create()
        self.assertEqual(self.client.post(self.url(seat)+'/transfer', json={}).status_code, 403)
        self.assertEqual(self.client.post(self.url(seat)+'/save', json={'revision':0}).status_code, 403)
        code = self.transfer(seat)
        with patch('ww2_web.time.time', return_value=10**12):
            self.assertEqual(self.client.post('/api/transfer', json={'code':code}).status_code, 400)
        second = self.client.post('/api/transfer', json={'code':self.transfer(seat)}).get_json()
        pending = self.transfer(seat)
        self.post(seat, '/reset', {})
        self.assertEqual(self.client.get(self.url(second), headers=self.headers(second)).status_code, 404)
        self.assertEqual(self.client.post('/api/transfer', json={'code':pending}).status_code, 400)
        for value in [None, [], {}, 'bad', 'SAVE-'+'A'*32]:
            self.assertEqual(self.client.post('/api/restore', json={'code':value}).status_code, 400)

    def test_immutable_checkpoint_exact_restore_restart_and_reuse(self):
        seat = self.create(scenario='riverfront')
        self.post(seat, '', {'kind':'end', 'revision':0})
        before = self.state(seat)
        self.assertTrue(before['computer_playback']['frames'])
        self.assertTrue(before['action_history'])
        code = self.save(seat)
        self.assertEqual(self.state(seat), before)
        self.post(seat, '', {'kind':'end', 'revision':before['revision']})
        self.app = create_app(self.path)
        self.client = self.app.test_client()
        with patch('ww2_web.play_turn', side_effect=AssertionError('Restore must not run AI')):
            a, b = self.restore(code), self.restore(code)
        self.assertNotEqual(a['code'], b['code'])
        self.same_battle(self.state(a), before)
        self.same_battle(self.state(b), before)
        self.post(a, '', {'kind':'end', 'revision':before['revision']})
        self.same_battle(self.state(b), before)
        self.post(seat, '/reset', {})
        self.same_battle(self.state(self.restore(code)), before)

    def test_german_checkpoint_finished_battle_and_pending_effects(self):
        seat = self.create()
        self.post(seat, '/rematch', {'operation':'propose','revision':0,'scenario':'village','swap':True})
        self.assertEqual(self.state(seat)['side'], 'de')
        # Persist effects and resource usage to exercise exact snapshot coverage.
        with sqlite3.connect(self.path) as db:
            raw = json.loads(db.execute('SELECT state FROM match WHERE code=?',(seat['code'],)).fetchone()[0])
            raw.update(smoke=[dict(pos=[1,1],ttl=2)], command_used=['de:A'],
                       barrages=[dict(pos=[2,2],area=[[2,2]],ttl=1,side='us')], winner='de')
            db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(raw),seat['code']))
        before = self.state(seat)
        self.same_battle(self.state(self.restore(self.save(seat))), before)

    def test_stale_checkpoint_and_multiplayer_rejection(self):
        seat = self.create()
        self.assertEqual(self.post(seat, '/save', {'revision':True}).status_code, 409)
        self.assertEqual(self.post(seat, '/save', {'revision':2}).status_code, 409)
        shared = self.create('human')
        self.assertEqual(self.post(shared, '/save', {'revision':0}).status_code, 400)

    def test_transfer_redeemed_only_once_under_concurrency(self):
        code = self.transfer(self.create())
        def redeem(_):
            return self.app.test_client().post('/api/transfer', json={'code':code}).status_code
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(redeem, range(2))), [200,400])

    def test_legacy_database_migration_keeps_exact_match_and_keys(self):
        path = os.path.join(self.tmp.name, 'legacy.sqlite3')
        token, code, state = 'original-phone-token', 'ABCDEF1234', initial()
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE match (slot INTEGER PRIMARY KEY CHECK(slot=1), code TEXT, host TEXT, guest TEXT, state TEXT)')
            db.execute('INSERT INTO match VALUES (1,?,?,?,?)', (code, hashlib.sha256(token.encode()).hexdigest(), None, json.dumps(state)))
        for _ in range(2):
            client = create_app(path).test_client()
            response = client.get('/api/match/'+code, headers={'Authorization':'Bearer '+token})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json()['units'], state['units'])
            self.assertEqual(client.post('/api/match', json={'opponent':'computer'}).status_code, 201)


if __name__ == '__main__':
    unittest.main()
