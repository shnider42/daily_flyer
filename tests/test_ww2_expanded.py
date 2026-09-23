import copy
import unittest

from ww2_tactics.engine import apply, initial, options, fire_threshold, line_clear


class ExpandedRulesTests(unittest.TestCase):
    def setUp(self):
        self.state = initial()
        self.state['ready'] = True
        self.us = self.state['units'][0]
        self.de = self.state['units'][5]
        self.us['pos'] = [3, 5]
        self.de['pos'] = [3, 4]

    def test_smoke_charge_cost_and_lifetime(self):
        state = apply(self.state, 'us', dict(kind='smoke', unit='us0', pos=[3, 4]))
        self.assertEqual(state['units'][0]['ap'], 1)
        self.assertEqual(state['units'][0]['smoke'], 0)
        self.assertEqual(state['smoke'][0]['ttl'], 2)
        self.assertFalse(line_clear([3, 5], [3, 4], state['smoke']))
        state = apply(state, 'us', dict(kind='end'))
        self.assertEqual(state['smoke'][0]['ttl'], 1)
        self.assertEqual(options(state, state['units'][5])['targets'], [])
        state = apply(state, 'de', dict(kind='end'))
        self.assertEqual(state['smoke'], [])

    def test_smoke_blocks_intervening_hex(self):
        self.assertTrue(line_clear([0, 4], [6, 4]))
        self.assertFalse(line_clear([0, 4], [6, 4], [dict(pos=[3, 4], ttl=2)]))

    def test_illegal_smoke_and_mg_no_grenades(self):
        for action in [dict(kind='smoke', unit='us0', pos=[0, 0]),
                       dict(kind='smoke', unit='us2', pos=[3, 8])]:
            with self.assertRaises(ValueError):
                apply(self.state, 'us', action)

    def test_dig_protection_and_move_loses_it(self):
        base = fire_threshold(self.state, self.de, self.us)
        state = apply(self.state, 'us', dict(kind='dig', unit='us0'))
        self.assertEqual(state['units'][0]['ap'], 0)
        self.assertEqual(fire_threshold(state, state['units'][5], state['units'][0]), base+1)
        state = apply(state, 'us', dict(kind='end'))
        state = apply(state, 'de', dict(kind='end'))
        self.assertFalse(options(state, state['units'][0])['dig'])
        state = apply(state, 'us', dict(kind='move', unit='us0', pos=[3, 6]))
        self.assertFalse(state['units'][0]['entrenched'])

    def test_assault_success_advances_and_ignores_smoke(self):
        self.de['hp'] = 2
        self.state['smoke'] = [dict(pos=[3, 4], ttl=2)]
        self.de['entrenched'] = True
        state = apply(self.state, 'us', dict(kind='assault', unit='us0', target='de0'), roll=lambda:4)
        self.assertEqual(state['units'][0]['pos'], [3, 4])
        self.assertEqual(state['units'][5]['hp'], 0)
        self.assertEqual(state['last_combat']['threshold'], 4)

    def test_assault_failure_and_pinned_advantage(self):
        action = dict(kind='assault', unit='us0', target='de0')
        lost = apply(self.state, 'us', action, roll=lambda:3)
        self.assertTrue(lost['units'][0]['pinned'])
        self.assertEqual(lost['units'][0]['hp'], 2)
        self.assertEqual(lost['units'][5]['hp'], 3)
        self.de['pinned'] = True
        won = apply(self.state, 'us', action, roll=lambda:3)
        self.assertEqual(won['units'][5]['hp'], 1)
        self.assertEqual(won['units'][0]['pos'], [3, 5])

    def test_pins_and_action_costs_gate_new_orders(self):
        for field, value in [('pinned', True), ('ap', 0)]:
            state = copy.deepcopy(self.state)
            state['units'][0][field] = value
            legal = options(state, state['units'][0])
            self.assertFalse(legal['dig'])
            self.assertEqual(legal['smoke'], [])
            self.assertEqual(legal['assaults'], [])
        self.assertEqual(options(self.state, self.state['units'][2])['assaults'], [])

    def test_original_saved_match_keeps_original_rules(self):
        self.state.pop('rules_version')
        for u in self.state['units']:
            u.pop('smoke')
            u.pop('entrenched')
        self.state.pop('smoke')
        legal = options(self.state, self.us)
        self.assertFalse(legal['dig'])
        self.assertEqual(legal['assaults'], [])
        self.assertEqual(legal['smoke'], [])
        for kind in ['dig', 'assault', 'smoke']:
            with self.assertRaises(ValueError):
                apply(self.state, 'us', dict(kind=kind, unit='us0', target='de0', pos=[3,4]))
        self.assertEqual(apply(self.state, 'us', dict(kind='fire',unit='us0',target='de0'),roll=lambda:6)['units'][5]['hp'], 2)

    def test_new_actions_preserve_input(self):
        original = copy.deepcopy(self.state)
        apply(self.state, 'us', dict(kind='smoke', unit='us0', pos=[3, 4]))
        self.assertEqual(self.state, original)


if __name__ == '__main__':
    unittest.main()
