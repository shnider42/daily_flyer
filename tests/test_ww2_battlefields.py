import copy
import json
import os
import sqlite3
import tempfile
import unittest
from collections import deque

from ww2_tactics.engine import apply, distance, initial, line_clear, options, terrain
from ww2_tactics.scenarios import SCENARIOS
from ww2_web import create_app


class BattlefieldsTests(unittest.TestCase):
    def test_village_snapshot_matches_previous_map(self):
        state = initial()
        for y in range(9):
            for x in range(7):
                self.assertEqual(terrain(x, y), terrain(x, y, state))

    def test_every_army_can_reach_each_objective(self):
        for key in SCENARIOS:
            state = initial(key)
            board = state['battlefield']
            for unit in state['units']:
                seen = {tuple(unit['pos'])}
                queue = deque(seen)
                while queue:
                    pos = queue.popleft()
                    for y in range(board['height']):
                        for x in range(board['width']):
                            dest = (x, y)
                            if dest not in seen and terrain(x, y, state) != 'water' and distance(pos, dest) == 1:
                                seen.add(dest)
                                queue.append(dest)
                self.assertIn(tuple(board['objective']), seen, (key, unit['id']))

    def test_river_is_impassable_and_bridge_is_walkable(self):
        state = initial('stonebridge')
        state['ready'] = True
        unit = state['units'][0]
        unit['pos'] = [1, 6]
        moves = options(state, unit)['moves']
        self.assertIn([1, 5], [m['pos'] for m in moves])
        self.assertNotIn([0, 5], [m['pos'] for m in moves])
        self.assertEqual(next(m['cost'] for m in moves if m['pos'] == [1, 5]), 1)
        self.assertTrue(line_clear([3, 4], [3, 6], state=state))

    def test_each_scenario_turn_limit_and_score(self):
        for key in SCENARIOS:
            state = initial(key)
            state['ready'] = True
            limit = state['battlefield']['rounds']
            for turn in range(limit):
                state = apply(state, 'us', {'kind': 'end'})
                state = apply(state, 'de', {'kind': 'end'})
                self.assertEqual(state['winner'], 'de' if turn == limit-1 else None)
            self.assertEqual(state['victories'], {'us': 0, 'de': 1})

    def test_scenario_objectives_use_their_actual_hex(self):
        for key in SCENARIOS:
            state = initial(key)
            state['ready'] = True
            state['units'][0]['pos'] = list(state['battlefield']['objective'])
            for side in ['us', 'de', 'us']:
                state = apply(state, side, {'kind': 'end'})
            self.assertEqual(state['winner'], 'us')

    def test_legacy_battle_stays_village_without_overwatch(self):
        state = initial()
        state.pop('battlefield')
        state['rules_version'] = 2
        state['ready'] = True
        self.assertFalse(options(state, state['units'][0])['overwatch'])
        with self.assertRaises(ValueError):
            apply(state, 'us', dict(kind='overwatch', unit='us0'))
        self.assertEqual(apply(state, 'us', dict(kind='end'))['round'], 1)

    def test_snapshot_is_not_shared_with_catalog(self):
        state = initial('orchard')
        state['battlefield']['map'][0][0] = 'water'
        self.assertEqual(initial('orchard')['battlefield']['map'][0][0], 'field')


class OverwatchTests(unittest.TestCase):
    def setUp(self):
        self.state = initial()
        self.state['ready'] = True
        self.state['units'][0]['pos'] = [0, 4]
        self.state['units'][5]['pos'] = [3, 4]
        self.state['units'][5]['overwatch'] = True

    def test_reaction_cost_pin_and_one_shot(self):
        move = dict(kind='move', unit='us0', pos=[1, 4])
        self.assertEqual(next(m for m in options(self.state, self.state['units'][0])['moves'] if m['pos']==[1,4])['threats'], 1)
        state = apply(self.state, 'us', move, roll=lambda:6)
        self.assertEqual(state['units'][0]['hp'], 2)
        self.assertTrue(state['units'][0]['pinned'])
        self.assertFalse(state['units'][5]['overwatch'])
        self.assertEqual(state['units'][0]['ap'], 1)
        self.assertEqual(state['last_combat']['kind'], 'Overwatch')
        self.assertEqual(state['last_combat']['threshold'], 5)
        self.assertEqual(len(state['log']), 3)

    def test_miss_consumes_watch_and_allows_second_move(self):
        state = apply(self.state, 'us', dict(kind='move', unit='us0', pos=[1,4]), roll=lambda:1)
        self.assertFalse(state['units'][0]['pinned'])
        state = apply(state, 'us', dict(kind='move', unit='us0', pos=[2,4]), roll=lambda:6)
        self.assertEqual(state['units'][0]['hp'], 3)

    def test_smoke_and_pins_prevent_reactions(self):
        for condition in ['smoke', 'pinned']:
            state = copy.deepcopy(self.state)
            if condition == 'smoke':
                state['smoke'] = [dict(pos=[1,4], ttl=2)]
            else:
                state['units'][5]['pinned'] = True
            result = apply(state, 'us', dict(kind='move', unit='us0', pos=[1,4]), roll=lambda:6)
            self.assertEqual(result['units'][0]['hp'], 3)

    def test_watch_cost_and_expiration(self):
        state = apply(self.state, 'us', dict(kind='overwatch', unit='us0'))
        self.assertEqual(state['units'][0]['ap'], 0)
        state = apply(state, 'us', dict(kind='end'))
        self.assertTrue(state['units'][0]['overwatch'])
        state = apply(state, 'de', dict(kind='end'))
        self.assertFalse(state['units'][0]['overwatch'])
        self.assertEqual(state['units'][0]['ap'], 2)

    def test_multiple_watchers_stop_when_target_dies(self):
        self.state['units'][0]['hp'] = 1
        self.state['units'][6].update(pos=[4,4], overwatch=True)
        state = apply(self.state, 'us', dict(kind='move', unit='us0', pos=[1,4]), roll=lambda:6)
        self.assertEqual(state['units'][0]['hp'], 0)
        self.assertTrue(state['units'][6]['overwatch'])

    def test_hit_cancels_enemy_overwatch(self):
        state = apply(self.state, 'us', dict(kind='fire',unit='us0',target='de0'),roll=lambda:6)
        self.assertFalse(state['units'][5]['overwatch'])

    def test_reaction_elimination_wins_and_clears_hold(self):
        for u in self.state['units']:
            if u['side'] == 'us': u['hp'] = 0
        self.state['units'][0].update(hp=1, pos=[3,4])
        self.state['hold'] = 1
        self.state['units'][5]['pos'] = [0,4]
        state = apply(self.state, 'us', dict(kind='move', unit='us0', pos=[2,4]), roll=lambda:6)
        self.assertEqual(state['winner'], 'de')
        self.assertEqual(state['hold'], 0)


class RematchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'db.sqlite3')
        self.app = create_app(self.path)
        self.client = self.app.test_client()
        self.host = self.client.post('/api/match', json={'scenario':'orchard'}).get_json()
        self.url = '/api/match/'+self.host['code']
        guest = self.client.post(self.url+'/join', json={}).get_json()
        self.us = {'Authorization':'Bearer '+self.host['token']}
        self.de = {'Authorization':'Bearer '+guest['token']}

    def tearDown(self):
        self.tmp.cleanup()

    def test_scenario_catalog_and_dimensions(self):
        self.assertEqual(len(self.client.get('/api/scenarios').get_json()['scenarios']), 4)
        state = self.client.get(self.url, headers=self.us).get_json()
        self.assertEqual(len(state['map'][0]), 9)
        self.assertEqual(state['scenario']['rounds'], 10)

    def test_propose_consent_swap_and_reconnect(self):
        proposal = self.client.post(self.url+'/rematch', headers=self.us, json=dict(operation='propose', scenario='stonebridge', swap=True, revision=1))
        self.assertEqual(proposal.status_code, 200)
        self.assertEqual(self.client.post(self.url+'/rematch', headers=self.us, json=dict(operation='accept', revision=2)).status_code, 400)
        accepted = self.client.post(self.url+'/rematch', headers=self.de, json=dict(operation='accept', revision=2))
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.get_json()['side'], 'us')
        self.assertEqual(accepted.get_json()['battle_number'], 2)
        self.assertEqual(accepted.get_json()['scenario']['id'], 'stonebridge')
        self.assertEqual(accepted.get_json()['revision'], 3)
        self.assertTrue(accepted.get_json()['ready'])
        reconnect = create_app(self.path).test_client().get(self.url, headers=self.us).get_json()
        self.assertEqual(reconnect['side'], 'de')
        self.assertEqual(reconnect['map'][5][0], 'water')

    def test_decline_preserves_board_and_seats(self):
        self.client.post(self.url+'/rematch',headers=self.de,json=dict(operation='propose',scenario='village',swap=False,revision=1))
        declined = self.client.post(self.url+'/rematch',headers=self.us,json=dict(operation='decline',revision=2)).get_json()
        self.assertNotIn('rematch', declined)
        self.assertEqual(declined['scenario']['id'], 'orchard')
        self.assertEqual(declined['side'], 'us')

    def test_unauthorized_stale_and_malformed_rematches(self):
        self.assertEqual(self.client.post(self.url+'/rematch',json={'operation':'accept'}).status_code,403)
        for fields, expected in [({'revision':0},409), ({'scenario':[]},400), ({'swap':'true'},400)]:
            body = dict(operation='propose',scenario='village',swap=True,revision=1)
            body.update(fields)
            self.assertEqual(self.client.post(self.url+'/rematch',json=body,headers=self.us).status_code,expected)

    def test_rematch_preserves_score_and_clears_battle_effects(self):
        with sqlite3.connect(self.path) as db:
            state = json.loads(db.execute('SELECT state FROM match').fetchone()[0])
            state.update(winner='de', victories={'us':1,'de':2}, smoke=[{'pos':[1,1],'ttl':2}])
            db.execute('UPDATE match SET state=?',(json.dumps(state),))
        self.client.post(self.url+'/rematch',headers=self.us,json=dict(operation='propose',scenario='village',swap=False,revision=1))
        state = self.client.post(self.url+'/rematch',headers=self.de,json=dict(operation='accept',revision=2)).get_json()
        self.assertEqual(state['victories'], {'us':1,'de':2})
        self.assertEqual(state['smoke'], [])
        self.assertIsNone(state['winner'])
        self.assertEqual(state['round'], 1)
        self.assertEqual(state['side'], 'de')


if __name__ == '__main__':
    unittest.main()
