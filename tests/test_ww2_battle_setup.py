"""Both army seats, reproducible assignment records and authoritative results."""
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics.engine import initial, apply
from ww2_tactics.battle_setup import result_summary


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = self.temp.name + '/battle.sqlite'
        self.client = create_app(self.path).test_client()

    def tearDown(self):
        self.temp.cleanup()

    def create(self, **settings):
        response = self.client.post('/api/match', json={'ruleset': 'dsl', **settings})
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def headers(self, seat):
        return {'Authorization': 'Bearer ' + seat['token']}

    def get(self, seat):
        response = self.client.get('/api/match/' + seat['code'], headers=self.headers(seat))
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def post(self, seat, suffix, body):
        return self.client.post('/api/match/' + seat['code'] + suffix, headers=self.headers(seat), json=body)

    def test_selected_solo_both_armies_and_computer_opening_is_not_repeated(self):
        for side in ('us', 'de'):
            seat = self.create(opponent='computer', side=side)
            state = self.get(seat)
            self.assertEqual(state['side'], side)
            self.assertEqual(state['turn'], side)
            self.assertNotEqual(state['ai_side'], side)
            self.assertEqual(state, self.get(seat))
            self.assertEqual(self.post(seat, '/join', {}).status_code, 409)
            if side == 'de':
                self.assertGreater(state['revision'], 0)
                self.assertTrue(state['computer_playback']['frames'])

    def test_defender_preparation_waits_for_human_lock(self):
        seat = self.create(opponent='computer', side='de', scenario='shingle_cove')
        before = self.get(seat)
        self.assertEqual(before['deployment']['phase'], 'planning')
        self.assertTrue(before['deployment']['locked']['us'])
        self.assertFalse(before['deployment']['locked']['de'])
        self.assertTrue(all(u['side'] == 'de' for u in before['units']))
        after = self.post(seat, '', {'kind': 'deploy_lock', 'revision': before['revision']}).get_json()
        self.assertEqual(after['turn'], 'de')
        self.assertEqual(after['deployment']['phase'], 'battle')
        self.assertTrue(after['computer_playback']['frames'])

    def test_axis_creator_and_allied_guest_keep_ownership_across_join_swap_and_reset(self):
        seat = self.create(side='de')
        self.assertEqual(self.get(seat)['side'], 'de')
        game = self.client.get('/api/lobby').get_json()['games'][0]
        self.assertFalse(game['full'])
        self.assertEqual(game['open_side'], 'us')
        self.assertEqual(self.post(seat, '/join', {}).status_code, 409)
        self.assertEqual(self.client.get('/api/match/' + seat['code']).status_code, 403)
        response = self.client.post('/api/match/' + seat['code'] + '/join', json={})
        other = response.get_json()
        self.assertEqual(self.get(other)['side'], 'us')
        self.assertEqual(self.get(seat)['side'], 'de')
        self.assertEqual(self.client.post('/api/match/' + seat['code'] + '/join', json={}).status_code, 409)
        game = self.client.get('/api/lobby').get_json()['games'][0]
        self.assertTrue(game['full']); self.assertIsNone(game['open_side'])
        before = self.get(seat)
        proposed = self.post(seat, '/rematch', {'operation': 'propose', 'scenario': 'orchard', 'swap': True, 'revision': before['revision']}).get_json()
        accepted = self.post(other, '/rematch', {'operation': 'accept', 'revision': proposed['revision']}).get_json()
        self.assertEqual(accepted['side'], 'de')
        self.assertEqual(self.get(seat)['side'], 'us')
        self.assertEqual(self.get(seat)['created_side'], 'us')
        self.assertEqual(self.post(other, '/reset', {}).status_code, 403)
        replaced = self.post(seat, '/reset', {'side': 'de'}).get_json()
        self.assertEqual(self.get(replaced)['side'], 'de')
        self.assertFalse(self.get(replaced)['ready'])

    def test_random_and_coin_are_server_decided_and_persisted(self):
        for method in ('random', 'coin_flip'):
            for toss, side in ((0, 'us'), (1, 'de')):
                with patch('ww2_tactics.battle_setup.secrets.randbelow', return_value=toss):
                    seat = self.create(team_assignment=method, side='us')
                state = self.get(seat)
                self.assertEqual(state['side'], side)
                self.assertEqual(state['team_assignment']['creator_side'], side)
                if method == 'coin_flip':
                    self.assertEqual(state['team_assignment']['coin'], 'heads' if toss == 0 else 'tails')
                self.assertEqual(self.get(seat)['team_assignment'], state['team_assignment'])

    def test_invalid_assignments_do_not_create_games(self):
        for settings in ({'side': 'jp'}, {'side': []}, {'team_assignment': 'cheat'}, {'team_assignment': {}}):
            self.assertEqual(self.client.post('/api/match', json=settings).status_code, 400)
        self.assertEqual(self.client.get('/api/lobby').get_json()['games'], [])

    def test_axis_solo_save_restore_transfer_and_rematch(self):
        seat = self.create(opponent='computer', side='de')
        state = self.get(seat)
        saved = self.post(seat, '/save', {'revision': state['revision']}).get_json()
        restored = self.client.post('/api/restore', json={'code': saved['save_code']}).get_json()
        self.assertEqual(self.get(restored)['side'], 'de')
        self.assertEqual(self.get(restored)['revision'], state['revision'])
        response = self.post(seat, '/rematch', {'operation': 'propose', 'scenario': 'village', 'swap': True, 'revision': state['revision']})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(self.get(seat)['side'], 'us')

    def test_commander_resume_with_axis_creator(self):
        player = self.client.post('/api/commander/register', json={'name': 'AxisCreator', 'password': 'Memorable-test-password'}).get_json()
        headers = {'X-Commander-Token': player['token']}
        seat = self.client.post('/api/match', headers=headers, json={'side': 'de', 'name': 'Axis host test'}).get_json()
        game = self.client.get('/api/lobby?mine=1', headers=headers).get_json()['games'][0]
        self.assertEqual(game['your_side'], 'de')
        self.assertEqual(game['guest_name'], 'AxisCreator')
        resumed = self.client.post('/api/match/' + seat['code'] + '/join', headers=headers, json={}).get_json()
        self.assertEqual(self.get(resumed)['side'], 'de')
        self.assertFalse(self.get(resumed)['ready'])

    def test_resignation_returns_a_result_to_both_players(self):
        seat = self.create(side='de')
        other = self.client.post('/api/match/' + seat['code'] + '/join', json={}).get_json()
        state = self.get(seat)
        result = self.post(seat, '', {'kind': 'resign', 'revision': state['revision']}).get_json()
        self.assertEqual(result['battle_result']['winner'], 'us')
        self.assertEqual(result['battle_result'], self.get(other)['battle_result'])
        self.assertEqual(set(result['battle_result']), {'winner', 'reason', 'round'})


class ResultTests(unittest.TestCase):
    def test_result_covers_each_victory_system_and_no_result_while_active(self):
        state = initial('village', 'dsl'); state.update(ready=True, turn='de', round=8)
        self.assertIsNone(result_summary(state))
        final = apply(state, 'de', {'kind': 'end'})
        self.assertIn('round limit', result_summary(final)['reason'])
        for scenario, updates, phrase in [
            ('village', {'winner': 'us', 'hold': 2}, 'two consecutive'),
            ('kharkov', {'winner': 'us', 'front_score': {'us': 10, 'de': 2}}, 'Ten control'),
            ('fubar', {'winner': 'de', 'joint_score': {'us': 5, 'de': 10}}, 'Ten control'),
            ('dunkirk', {'winner': 'us', 'evacuated_count': 6}, 'six infantry'),
            ('britain', {'winner': 'de', 'raid_destroyed': ['a', 'b']}, 'Both RAF'),
            ('midway', {'winner': 'us', 'sea_score': {'us': 6, 'de': 2}}, 'six control'),
        ]:
            state = initial(scenario, 'dsl'); state.update(updates)
            self.assertIn(phrase, result_summary(state)['reason'])


if __name__ == '__main__':
    unittest.main()
