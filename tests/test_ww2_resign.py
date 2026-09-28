import copy
import os
import tempfile
import unittest

from ww2_web import create_app
from ww2_tactics.engine import initial
from ww2_tactics.order_history import perform, KEY


class ResignTests(unittest.TestCase):
    def test_resign_from_either_turn_clears_pending_rolls_and_awards_exactly_once(self):
        for scenario in ('village', 'midway'):
            for side in ('us','de'):
                with self.subTest(scenario=scenario, side=side):
                    state = initial(scenario, 'dsl')
                    state['ready'] = True
                    state['rematch'] = dict(by='us')
                    state[KEY] = dict(side=side, past=[], future=[dict(rolled=True)])
                    before = copy.deepcopy(state)
                    end = perform(state, side, dict(kind='resign'))
                    winner = 'de' if side == 'us' else 'us'
                    self.assertEqual(end['winner'], winner)
                    self.assertEqual(end['resigned_by'], side)
                    self.assertEqual(end['revision'], before['revision']+1)
                    self.assertEqual(end['victories'][winner], 1)
                    self.assertEqual(end['units'], before['units'])
                    self.assertNotIn('rematch', end)
                    self.assertEqual(state, before)
                    for team in ('us','de'):
                        self.assertIn('resigned', end['reports'][team]['log'][-1])
                    for kind in ('undo','redo','resign','end'):
                        with self.assertRaises(ValueError):
                            perform(end, side, dict(kind=kind))

    def test_api_requires_seat_and_revision_and_supports_rematch_after_resigning(self):
        with tempfile.TemporaryDirectory() as folder:
            client = create_app(os.path.join(folder,'test.sqlite3')).test_client()
            host = client.post('/api/match', json=dict(ruleset='dsl')).get_json()
            route = '/api/match/'+host['code']
            h = {'Authorization':'Bearer '+host['token']}
            self.assertEqual(client.post(route, headers=h, json=dict(kind='resign', revision=0)).status_code, 400)
            guest = client.post(route+'/join', json={}).get_json()
            g = {'Authorization':'Bearer '+guest['token']}
            self.assertEqual(client.post(route, json=dict(kind='resign', revision=1)).status_code, 403)
            self.assertEqual(client.post(route, headers=g, json=dict(kind='resign', revision=0)).status_code, 409)
            end = client.post(route, headers=g, json=dict(kind='resign', revision=1))
            self.assertEqual(end.status_code, 200)
            self.assertEqual(end.get_json()['winner'], 'us')
            self.assertIn('resigned', end.get_json()['log'][-1])
            self.assertFalse(end.get_json()['order_history']['can_undo'])
            self.assertEqual(client.post(route, headers=g, json=dict(kind='resign', revision=1)).status_code, 409)
            self.assertEqual(client.post(route, headers=g, json=dict(kind='resign', revision=2)).status_code, 400)
            proposal = client.post(route+'/rematch', headers=h,
                json=dict(operation='propose', revision=2, scenario='orchard', ruleset='dsl', swap=False))
            self.assertEqual(proposal.status_code, 200)
            next_game = client.post(route+'/rematch', headers=g, json=dict(operation='accept', revision=3)).get_json()
            self.assertIsNone(next_game['winner'])
            self.assertNotIn('resigned_by', next_game)
            self.assertEqual(next_game['victories']['us'], 1)


if __name__ == '__main__':
    unittest.main()
