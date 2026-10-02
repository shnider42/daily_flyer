"""Replay transport/journal regressions; no changes to move or visibility rules."""
import copy
from contextlib import closing
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics.engine import initial, apply
from ww2_tactics.order_history import perform, KEY


def movie(identity=7):
    # Real replay shape, deliberately large enough to catch accidental copying.
    snap = dict(units=[], contacts=[], smoke=[], barrages=[], visible_hexes=[[x, y] for y in range(16) for x in range(16)],
                round=1, turn='de', hold=0, winner=None)
    return dict(id=identity, frames=[dict(action={'kind': 'contact'}, before=copy.deepcopy(snap),
                after=copy.deepcopy(snap), effects=[], combat=[]) for _ in range(12)])


class ReplayJournalTests(unittest.TestCase):
    def battle(self):
        s = initial('village', 'dsl')
        s.update(ready=True, computer_playback=movie())
        return s

    def assert_compact(self, state):
        for stack in ('past', 'future'):
            for item in state.get(KEY, {}).get(stack, []):
                self.assertNotIn('computer_playback', item['snapshot'])

    def test_engine_never_receives_the_old_movie(self):
        state = self.battle()
        before = copy.deepcopy(state)
        with patch('ww2_tactics.order_history.apply', wraps=apply) as engine:
            after = perform(state, 'us', dict(kind='dig', unit='us0'))
        self.assertNotIn('computer_playback', engine.call_args.args[0])
        self.assertEqual(state, before)
        self.assertEqual(after['computer_playback'], before['computer_playback'])
        self.assertIs(after['computer_playback'], state['computer_playback'])
        self.assert_compact(after)

    def test_undo_redo_reload_preserve_exact_movie_and_units(self):
        state = self.battle()
        after = perform(state, 'us', dict(kind='dig', unit='us0'))
        after = json.loads(json.dumps(after))  # actual database boundary
        undone = perform(after, 'us', dict(kind='undo'))
        self.assertEqual(undone['units'], state['units'])
        self.assertEqual(undone['computer_playback'], state['computer_playback'])
        redone = perform(json.loads(json.dumps(undone)), 'us', dict(kind='redo'))
        self.assertEqual(redone['units'], after['units'])
        self.assertEqual(redone['computer_playback'], state['computer_playback'])
        self.assertEqual(redone['revision'], 3)
        self.assert_compact(undone)
        self.assert_compact(redone)

    def test_legacy_full_snapshots_are_normalized_without_mutation(self):
        state = self.battle()
        after = perform(state, 'us', dict(kind='dig', unit='us0'))
        for item in after[KEY]['past']:
            item['snapshot']['computer_playback'] = copy.deepcopy(state['computer_playback'])
        original = copy.deepcopy(after)
        undone = perform(after, 'us', dict(kind='undo'))
        self.assertEqual(after, original)
        self.assertEqual(undone['computer_playback'], state['computer_playback'])
        self.assertEqual(undone['units'], state['units'])
        self.assert_compact(undone)
        redone = perform(undone, 'us', dict(kind='redo'))
        self.assertEqual(redone['computer_playback'], state['computer_playback'])
        self.assert_compact(redone)

    def test_new_computer_turn_replaces_old_movie(self):
        state = self.battle()
        new_movie = movie(99)
        def computer(s):
            self.assertNotIn('computer_playback', s)
            return dict(s, computer_playback=new_movie)
        with patch('ww2_tactics.order_history.play_turn', side_effect=computer):
            result = perform(state, 'us', dict(kind='end'))
        self.assertIs(result['computer_playback'], new_movie)
        self.assertFalse(result[KEY]['past'])

    def test_no_replay_does_not_invent_one_and_resign_keeps_existing(self):
        state = initial('village', 'dsl'); state['ready'] = True
        result = perform(state, 'us', dict(kind='dig', unit='us0'))
        self.assertNotIn('computer_playback', result)
        state['computer_playback'] = movie()
        self.assertEqual(perform(state, 'us', dict(kind='resign'))['computer_playback'], state['computer_playback'])

    def test_journal_growth_does_not_multiply_movie(self):
        state = self.battle()
        size = len(json.dumps(state['computer_playback']))
        for uid in ('us0', 'us1', 'us2', 'us3', 'us4'):
            state = perform(state, 'us', dict(kind='dig', unit=uid))
        self.assertEqual(len(state[KEY]['past']), 5)
        self.assertLess(len(json.dumps(state)), size + 50000)
        self.assert_compact(state)


class ReplayTransportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, 'game.sqlite')
        self.app = create_app(self.db); self.app.testing = True
        self.client = self.app.test_client()
        seat = self.client.post('/api/match', json=dict(opponent='computer', ruleset='dsl')).get_json()
        self.code = seat['code']; self.url = '/api/match/' + self.code
        self.auth = {'Authorization': 'Bearer ' + seat['token']}
        self.replay = movie()
        self.edit(lambda s: s.update(computer_playback=self.replay))
        self.key = f'{self.code}:us:1:7'

    def tearDown(self):
        self.tmp.cleanup()

    def edit(self, fn):
        with closing(sqlite3.connect(self.db)) as db:
            s = json.loads(db.execute('SELECT state FROM match WHERE code=?', (self.code,)).fetchone()[0])
            fn(s)
            db.execute('UPDATE match SET state=? WHERE code=?', (json.dumps(s), self.code))
            db.commit()

    def get(self, known=None):
        h = dict(self.auth)
        if known is not None: h['X-WW2-Replay'] = known
        return self.client.get(self.url, headers=h)

    def test_legacy_and_fresh_clients_receive_all_original_frames(self):
        data = self.get().get_json()
        self.assertEqual(data['computer_playback'], self.replay)
        self.assertEqual(self.get('bogus').get_json()['computer_playback'], self.replay)

    def test_known_replay_omits_only_movie_frames(self):
        full = self.get().get_json(); lean = self.get(self.key).get_json()
        self.assertEqual(lean['computer_playback'], dict(id=7, unchanged=True))
        lean['computer_playback'] = self.replay
        self.assertEqual(lean, full)
        self.assertLess(len(self.get(self.key).data), len(self.get().data) // 3)

    def test_replay_not_deepcopied_by_public_projection(self):
        import ww2_web
        real = ww2_web.public_state
        def inspect(s, side):
            self.assertNotIn('frames', s['computer_playback'])
            return real(s, side)
        with patch('ww2_web.public_state', side_effect=inspect):
            self.assertEqual(self.get().get_json()['computer_playback'], self.replay)

    def test_authentication_is_required_even_for_matching_key(self):
        result = self.client.get(self.url, headers={'X-WW2-Replay': self.key})
        self.assertEqual(result.status_code, 403)
        self.assertNotIn('computer_playback', result.get_json())

    def test_identity_includes_battle_side_match_and_replay(self):
        for key in (f'{self.code}:de:1:7', f'{self.code}:us:2:7', f'{self.code}:us:1:8', 'ANOTHER:us:1:7'):
            with self.subTest(key=key):
                self.assertEqual(self.get(key).get_json()['computer_playback'], self.replay)
        self.edit(lambda s: s.update(battle_number=2))
        self.assertEqual(self.get(self.key).get_json()['computer_playback'], self.replay)

    def test_next_movie_is_transmitted_in_full(self):
        newer = movie(8)
        self.edit(lambda s: s.update(computer_playback=newer))
        self.assertEqual(self.get(self.key).get_json()['computer_playback'], newer)

    def test_move_ack_undo_redo_and_full_reconnect_keep_replay(self):
        h = dict(self.auth, **{'X-WW2-Replay': self.key})
        for revision, action in enumerate((dict(kind='move', unit='us0', pos=[1,7]), dict(kind='undo'), dict(kind='redo'))):
            response = self.client.post(self.url, headers=h, json=dict(action, revision=revision))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json()['computer_playback'], dict(id=7, unchanged=True))
        full = self.get().get_json()
        self.assertEqual(full['computer_playback'], self.replay)
        self.assertEqual(full['revision'], 3)
        stale = self.client.post(self.url, headers=h, json=dict(kind='undo', revision=0))
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.get().get_json()['revision'], 3)

    def test_read_ack_does_not_modify_stored_movie_or_history(self):
        with closing(sqlite3.connect(self.db)) as db:
            before = db.execute('SELECT state FROM match WHERE code=?', (self.code,)).fetchone()[0]
        self.get(self.key)
        with closing(sqlite3.connect(self.db)) as db:
            after = db.execute('SELECT state FROM match WHERE code=?', (self.code,)).fetchone()[0]
        self.assertEqual(before, after)

    def test_save_restore_rehydrates_movie_without_old_browser(self):
        saved = self.client.post(self.url + '/save', headers=self.auth, json={'revision': 0})
        self.assertEqual(saved.status_code, 200)
        restored = self.client.post('/api/restore', json={'code': saved.get_json()['save_code']}).get_json()
        response = self.client.get('/api/match/' + restored['code'], headers={'Authorization': 'Bearer ' + restored['token']})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['computer_playback'], self.replay)


if __name__ == '__main__':
    unittest.main()
