import copy
import tempfile
import unittest

from ww2_tactics.engine import initial, apply, options
from ww2_tactics.computer import choose_order, objective_costs, play_turn
from ww2_web import create_app


class ComputerRulesTests(unittest.TestCase):
    def test_both_armies_finish_each_scenario_without_illegal_actions(self):
        for name in ['village', 'orchard', 'stonebridge']:
            s = initial(name)
            s['ready'] = True
            for _ in range(24):
                s['ai_side'] = s['turn']
                before = copy.deepcopy(s)
                result = play_turn(s, roll=lambda: 4)
                self.assertEqual(s, before)
                self.assertGreater(result['revision'], s['revision'])
                self.assertTrue(result['winner'] or result['turn'] != s['turn'])
                self.assertLessEqual(result['revision']-s['revision'], 25)
                s = result
                if s['winner']: break
            self.assertIsNotNone(s['winner'], name)

    def test_no_computer_action_on_human_turn_or_completed_match(self):
        s = initial(); s.update(ai_side='de', ready=True)
        self.assertEqual(play_turn(s), s)
        s.update(turn='de', winner='us')
        self.assertEqual(play_turn(s), s)

    def test_routes_around_river_and_holds_objective(self):
        s = initial('stonebridge');s.update(ready=True, ai_side='us')
        costs = objective_costs(s)
        self.assertNotIn((3, 5), costs)
        self.assertIn((1, 5), costs)
        s['units'][0]['pos'] = list(s['battlefield']['objective'])
        s['hold'] = 1
        result = play_turn(s, roll=lambda: 1)
        self.assertEqual(result['winner'], 'us')
        self.assertEqual(result['units'][0]['pos'], s['units'][0]['pos'])

    def test_leader_prioritizes_group_rally(self):
        s = initial();s['ready'] = True
        s['units'][0]['pinned'] = True
        action = choose_order(s, objective_costs(s), {})
        self.assertEqual(action['kind'], 'inspire')
        result = apply(s, 'us', action)
        self.assertFalse(result['units'][0]['pinned'])


class ComputerAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(self.temp.name+'/match.sqlite3')
        self.client = self.app.test_client()
        self.session = self.client.post('/api/match', json={'opponent':'computer'}).get_json()
        self.url = '/api/match/'+self.session['code']
        self.headers = {'Authorization':'Bearer '+self.session['token']}

    def tearDown(self): self.temp.cleanup()

    def state(self): return self.client.get(self.url, headers=self.headers).get_json()

    def test_solo_ready_seat_closed_auth_and_automatic_turn(self):
        state = self.state()
        self.assertTrue(state['ready'])
        self.assertEqual(state['ai_side'], 'de')
        self.assertEqual(self.client.post(self.url+'/join').status_code, 409)
        self.assertEqual(self.client.post(self.url, json={'kind':'end','revision':0}).status_code, 403)
        response = self.client.post(self.url, headers=self.headers, json={'kind':'end','revision':0})
        self.assertEqual(response.status_code, 200)
        state = response.get_json()
        self.assertEqual(state['turn'], 'us')
        self.assertEqual(state['round'], 2)
        self.assertTrue(state['computer_orders'])
        self.assertEqual(self.client.post(self.url,headers=self.headers,json={'kind':'end','revision':0}).status_code,409)
        self.assertEqual(self.state(), state)  # GET does not advance the bot.

    def test_solo_rematches_swap_both_directions_and_reconnect(self):
        for expected in ['de','us']:
            before = self.state()
            result = self.client.post(self.url+'/rematch',headers=self.headers,json={
                'operation':'propose','scenario':'orchard','swap':True,'revision':before['revision']})
            self.assertEqual(result.status_code, 200)
            s = result.get_json()
            self.assertEqual(s['side'], expected)
            self.assertEqual(s['turn'], expected)
            self.assertNotEqual(s['ai_side'], expected)
            self.assertNotIn('rematch', s)
            self.assertEqual(self.state()['side'], expected)
            self.assertEqual(self.client.post(self.url+'/join').status_code, 409)

    def test_replace_and_return_to_multiplayer_invalidates_old_keys(self):
        new = self.client.post(self.url+'/reset',headers=self.headers,json={'opponent':'human'}).get_json()
        self.assertEqual(self.client.get(self.url,headers=self.headers).status_code,404)
        url='/api/match/'+new['code']
        headers={'Authorization':'Bearer '+new['token']}
        state=self.client.get(url,headers=headers).get_json()
        self.assertFalse(state['ready']);self.assertNotIn('ai_side',state)
        guest=self.client.post(url+'/join').get_json()
        solo=self.client.post(url+'/reset',headers={'Authorization':'Bearer '+guest['token']},
                              json={'opponent':'computer','scenario':'stonebridge'})
        self.assertEqual(solo.status_code,200)
        self.assertEqual(self.client.get(url,headers=headers).status_code,404)

    def test_bad_settings_cannot_replace_match(self):
        before=self.state()
        self.assertEqual(self.client.post(self.url+'/reset',headers=self.headers,
                                         json={'opponent':'unrecognized'}).status_code,400)
        self.assertEqual(self.state(),before)


if __name__ == '__main__': unittest.main()
