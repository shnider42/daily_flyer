import copy
import unittest

from ww2_tactics.engine import apply, initial, options


class RoleAbilityTests(unittest.TestCase):
    def setUp(self):
        self.s = initial()
        self.s['ready'] = True
        self.s['units'][0]['pos'] = [3, 5]
        self.s['units'][5]['pos'] = [3, 4]

    def act(self, kind, unit='us0', target='de0', roll=6, **extra):
        return apply(self.s, 'us', dict(kind=kind, unit=unit, target=target, **extra), roll=lambda: roll)

    def test_grenade_damage_cover_and_no_advance(self):
        self.s['units'][5]['entrenched'] = True
        miss = self.act('grenade', roll=4)
        self.assertEqual(miss['units'][5]['hp'], 3)
        hit = self.act('grenade', roll=5)
        self.assertEqual(hit['units'][5]['hp'], 1)
        self.assertTrue(hit['units'][5]['pinned'])
        self.assertEqual(hit['units'][0]['pos'], [3, 5])
        self.assertEqual(hit['units'][0]['ap'], 0)
        self.assertEqual(hit['units'][0]['grenades'], 0)
        self.assertEqual(hit['units'][0]['smoke'], 1)
        self.assertEqual(hit['last_combat']['threshold'], 5)

    def test_grenade_open_ground_and_elimination(self):
        self.s['units'][5].update(pos=[3, 6], hp=2, overwatch=True)
        hit = self.act('grenade', roll=4)
        self.assertEqual(hit['units'][5]['hp'], 0)
        self.assertFalse(hit['units'][5]['overwatch'])
        self.assertEqual(hit['last_combat']['threshold'], 4)

    def test_grenade_spent_on_miss(self):
        s = self.act('grenade', roll=1)
        s['units'][0]['ap'] = 2
        with self.assertRaises(ValueError):
            apply(s, 'us', dict(kind='grenade', unit='us0', target='de0'))

    def test_smoke_range_and_wrong_role_block_attacks(self):
        for change in ['smoke', 'range', 'role', 'pinned', 'actions']:
            with self.subTest(change=change):
                s = copy.deepcopy(self.s)
                if change == 'smoke': s['smoke'] = [dict(pos=[3, 4], ttl=2)]
                if change == 'range': s['units'][5]['pos'] = [3, 1]
                if change == 'role': s['units'][0]['kind'] = 'leader'
                if change == 'pinned': s['units'][0]['pinned'] = True
                if change == 'actions': s['units'][0]['ap'] = 1
                with self.assertRaises(ValueError):
                    apply(s, 'us', dict(kind='grenade', unit='us0', target='de0'))

    def test_suppression_cancels_overwatch_without_damage(self):
        self.s['units'][2]['pos'] = [3, 5]
        self.s['units'][0]['pos'] = [1, 8]
        self.s['units'][5].update(overwatch=True, entrenched=True)
        s = self.act('suppress', unit='us2')
        self.assertTrue(s['units'][5]['pinned'])
        self.assertFalse(s['units'][5]['overwatch'])
        self.assertTrue(s['units'][5]['entrenched'])
        self.assertEqual(s['units'][5]['hp'], 3)
        self.assertEqual(s['units'][2]['ap'], 0)
        self.assertNotIn('roll', s['last_combat'])

    def test_suppression_range_and_already_pinned(self):
        self.assertFalse(options(self.s, self.s['units'][2])['suppress'])
        self.s['units'][2]['pos'] = [3, 5]
        self.s['units'][5]['pinned'] = True
        with self.assertRaises(ValueError): self.act('suppress', unit='us2')
        with self.assertRaises(ValueError): self.act('suppress', unit='us0')

    def test_leader_rallies_adjacent_allies_and_preserves_actions(self):
        self.s['units'][1]['pos'] = [3, 6]
        self.s['units'][0].update(pinned=True, ap=2)
        self.s['units'][2].update(pos=[4, 6], pinned=True, ap=1)
        self.s['units'][3]['pinned'] = True  # Distant ally stays pinned.
        self.s['units'][5]['pinned'] = True  # Enemy stays pinned.
        s = self.act('inspire', unit='us1')
        self.assertFalse(s['units'][0]['pinned'])
        self.assertFalse(s['units'][2]['pinned'])
        self.assertTrue(s['units'][3]['pinned'])
        self.assertTrue(s['units'][5]['pinned'])
        self.assertEqual([s['units'][i]['ap'] for i in [0, 1, 2]], [2, 1, 1])
        with self.assertRaises(ValueError): apply(s, 'us', dict(kind='inspire', unit='us1'))

    def test_pinned_leader_cannot_inspire_or_call_support(self):
        self.s['units'][1].update(pos=[3, 6], pinned=True)
        self.s['units'][0]['pinned'] = True
        for kind in ['inspire', 'barrage']:
            with self.assertRaises(ValueError): self.act(kind, unit='us1', pos=[3, 4])

    def test_barrage_delay_area_friendly_fire_and_caller_death(self):
        self.s['units'][1]['pos'] = [3, 3]
        for i in [0, 5]: self.s['units'][i].update(entrenched=True, overwatch=True)
        s = self.act('barrage', unit='us1', pos=[3, 4])
        self.assertEqual(s['support'], {'us': 0, 'de': 1})
        self.assertEqual(s['units'][1]['ap'], 0)
        self.assertEqual(len(s['barrages'][0]['area']), 7)
        s = apply(s, 'us', dict(kind='end'))
        self.assertEqual(s['barrages'][0]['ttl'], 1)
        self.assertFalse(s['units'][5]['pinned'])
        s['units'][1]['hp'] = 0  # Calling unit need not survive.
        s = apply(s, 'de', dict(kind='end'))
        for i in [0, 5]:
            self.assertTrue(s['units'][i]['pinned'])
            self.assertFalse(s['units'][i]['entrenched'])
            self.assertFalse(s['units'][i]['overwatch'])
            self.assertEqual(s['units'][i]['hp'], 3)
        self.assertEqual(s['barrages'], [])

    def test_barrage_escape_through_real_move(self):
        self.s['units'][1]['pos'] = [3, 6]
        s = self.act('barrage', unit='us1', pos=[3, 5])
        s = apply(s, 'us', dict(kind='end'))
        s = apply(s, 'de', dict(kind='move', unit='de0', pos=[3, 3]))
        s = apply(s, 'de', dict(kind='end'))
        self.assertFalse(s['units'][5]['pinned'])
        self.assertTrue(s['units'][0]['pinned'])

    def test_barrage_one_charge_and_illegal_coordinates(self):
        for pos in [[-1, 0], [100, 100], 'C4', None]:
            with self.assertRaises(ValueError): self.act('barrage', unit='us1', pos=pos)
        s = self.act('barrage', unit='us1', pos=[2, 8])
        s['units'][1]['ap'] = 2
        with self.assertRaises(ValueError): apply(s, 'us', dict(kind='barrage', unit='us1', pos=[2, 8]))

    def test_old_rules_disable_every_role_ability(self):
        self.s['rules_version'] = 3
        for u in self.s['units']:
            legal = options(self.s, u)
            for key in ['grenades', 'suppress', 'inspire', 'barrage']:
                self.assertEqual(legal[key], [])
        for kind in ['grenade', 'suppress', 'inspire', 'barrage']:
            with self.assertRaises(ValueError): self.act(kind, pos=[3, 4])

    def test_new_match_resets_resources_and_actions_preserve_input(self):
        before = copy.deepcopy(self.s)
        self.act('grenade')
        self.act('barrage', unit='us1', pos=[2, 8])
        self.assertEqual(self.s, before)
        fresh = initial('stonebridge')
        self.assertEqual(fresh['support'], {'us': 1, 'de': 1})
        self.assertEqual(fresh['barrages'], [])
        self.assertEqual(sum(u['grenades'] for u in fresh['units']), 6)


if __name__ == '__main__':
    unittest.main()
