import copy
import unittest

from ww2_tactics.engine import initial, options, apply
from ww2_tactics.computer import play_turn


class PlatoonCommandTests(unittest.TestCase):
    def setup_state(self):
        s = initial('riverfront')
        s['ready'] = True
        s['units'][0]['ap'] = 1
        return s

    def test_restores_one_action_without_roll_and_preserves_input(self):
        s = self.setup_state(); before = copy.deepcopy(s)
        r = apply(s, 'us', dict(kind='command', unit='us1', target='us0'), roll=lambda: self.fail('No die roll'))
        self.assertEqual(s, before)
        self.assertEqual(r['units'][0]['ap'], 2)
        self.assertEqual(r['units'][1]['ap'], 0)
        self.assertEqual(r['command_used'], ['us:A'])
        self.assertIn('A1', r['last_combat']['target_label'])
        self.assertNotIn('roll', r['last_combat'])

    def test_rejects_invalid_recipients_and_leaders(self):
        for changes in [dict(platoon='B'), dict(side='de'), dict(kind='leader'), dict(hp=0),
                        dict(ap=2), dict(pinned=True), dict(pos=[10,10])]:
            with self.subTest(changes=changes):
                s = self.setup_state(); s['units'][0].update(changes)
                with self.assertRaises(ValueError):
                    apply(s, 'us', dict(kind='command', unit='us1', target='us0'))
        for changes in [dict(pinned=True), dict(ap=1), dict(hp=0), dict(kind='squad')]:
            s = self.setup_state(); s['units'][1].update(changes)
            with self.assertRaises(ValueError):
                apply(s, 'us', dict(kind='command', unit='us1', target='us0'))

    def test_once_per_platoon_and_refresh_on_own_turn(self):
        s = apply(self.setup_state(), 'us', dict(kind='command', unit='us1', target='us0'))
        s['units'][1]['ap'] = 2; s['units'][0]['ap'] = 1
        self.assertEqual(options(s, s['units'][1])['command'], [])
        s['units'][5]['ap'] = 1
        self.assertIn('us5', options(s, s['units'][6])['command'])
        s = apply(s, 'us', dict(kind='end'))
        self.assertIn('us:A', s['command_used'])
        s = apply(s, 'de', dict(kind='end'))
        s['units'][0]['ap'] = 1
        self.assertIn('us0', options(s, s['units'][1])['command'])

    def test_rally_is_platoon_scoped_only_on_large_map(self):
        s = self.setup_state()
        s['units'][0]['pinned'] = True
        s['units'][2].update(pinned=True, platoon='B')
        r = apply(s, 'us', dict(kind='inspire', unit='us1'))
        self.assertFalse(r['units'][0]['pinned'])
        self.assertTrue(r['units'][2]['pinned'])
        self.assertEqual(r['units'][0]['ap'], 1)
        small = initial(); small['ready'] = True
        small['units'][0]['pinned'] = small['units'][2]['pinned'] = True
        self.assertEqual(set(options(small, small['units'][1])['inspire']), {'us0','us2'})
        self.assertEqual(options(small, small['units'][1])['command'], [])

    def test_computer_uses_command_and_records_actual_ap_changes(self):
        s = self.setup_state(); s['ai_side'] = 'us'
        r = play_turn(s, roll=lambda: 4)
        frames = [f for f in r['computer_playback']['frames'] if f['action']['kind']=='command']
        self.assertTrue(frames)
        for frame in frames:
            target = frame['action']['target']
            old = next(u for u in frame['before']['units'] if u['id']==target)
            new = next(u for u in frame['after']['units'] if u['id']==target)
            self.assertEqual(new['ap'], old['ap']+1)
        self.assertEqual(r['turn'], 'de')
        self.assertLessEqual(len(r['computer_playback']['frames']), 32)


if __name__ == '__main__':
    unittest.main()
