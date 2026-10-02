"""Optimizations must preserve sight and never carry cached answers across orders."""
import copy
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from ww2_tactics.campaigns import unit
from ww2_tactics.engine import initial, options, line_clear
from ww2_tactics.visibility import sight_calculations, sees_hex, visible_ids, public_state, visible_terrain


class SightPerformanceTests(unittest.TestCase):
    def field(self):
        s = initial('frontier', 'dsl')
        s.update(ready=True, buildings={}, building_intel={'us': {}, 'de': {}}, intel={})
        s['battlefield']['map'] = [['field'] * 24 for _ in range(24)]
        s['map'] = s['battlefield']['map']
        s['units'] = [unit('us', 'scout', [2, 5], 'A', 1), unit('de', 'squad', [8, 5], 'A', 1)]
        return s

    def test_both_sides_orders_and_public_views_equal_uncached_reads(self):
        for scenario in ('tidal_gate', 'frontier', 'midway', 'britain', 'fubar', 'market_garden'):
            s = initial(scenario, 'dsl'); s['ready'] = True
            for side in ('us', 'de'):
                with self.subTest(scenario=scenario, side=side):
                    def read():
                        return ([options(s, u) for u in s['units'] if u['side'] == side], public_state(s, side))
                    with patch('ww2_tactics.visibility.sight_cache', return_value=None):
                        expected = read()
                    before = json.dumps(s, sort_keys=True)
                    with sight_calculations(s):
                        self.assertEqual(read(), expected)
                    self.assertEqual(json.dumps(s, sort_keys=True), before)

    def test_terrain_footprints_equal_full_scan_after_sight_changes(self):
        from ww2_tactics import signals
        s = initial('fubar', 'dsl'); s['ready'] = True
        scout = next(u for u in s['units'] if u['kind'] == 'scout' and u['side'] == 'us')
        # Distant towers, smoke, recon, passive units and observation all use
        # the original sight predicate; cached terrain must not add contacts.
        def compare():
            for side in ('us', 'de'):
                groups = [None] + sorted({signals.group(u) for u in s['units'] if u['side'] == side})
                with patch('ww2_tactics.visibility.sight_cache', return_value=None):
                    expected = {(g, air): visible_terrain(s, side, g, air) for g in groups for air in (False, True)}
                with sight_calculations(s):
                    for (g, air), cells in expected.items():
                        self.assertEqual(visible_terrain(s, side, g, air), cells, (side, g, air))
        compare()
        s.setdefault('fieldworks', {})['15,15'] = 'tower'
        s['smoke'] = [dict(pos=[16,24])]
        scout['observing'] = True
        s['recon'] = [dict(side='us', pos=[10,10], radius=3)]
        compare()
        scout['carrier_id'] = 'transport'
        s['fieldworks']['15,15'] = 'rubble'
        s['recon'] = []
        compare()
        del scout['carrier_id']; scout['hp'] = 0
        s['fog_of_war'] = False
        compare()

    def test_same_revision_edits_are_seen_in_next_scope(self):
        s = self.field()
        def spotted():
            with sight_calculations(s):
                seen = visible_ids(s, 'us')
                self.assertEqual(seen, visible_ids(s, 'us'))
                return s['units'][1]['id'] in seen
        self.assertTrue(spotted())
        s['smoke'] = [dict(pos=[5, 5])]; self.assertFalse(spotted())
        s['smoke'] = []; self.assertTrue(spotted())
        s['fieldworks']['5,5'] = 'bocage'; self.assertFalse(spotted())
        s['fieldworks']['5,5'] = 'field'; self.assertTrue(spotted())
        s['units'][0]['carrier_id'] = 'transport'; self.assertFalse(spotted())
        del s['units'][0]['carrier_id']; self.assertTrue(spotted())
        s['units'][0]['hp'] = 0; self.assertFalse(spotted())
        s['recon'] = [dict(side='us', pos=[8, 5], radius=2)]; self.assertTrue(spotted())

    def test_threads_and_nested_states_cannot_share_fog_answers(self):
        clear = self.field(); blocked = copy.deepcopy(clear)
        blocked['smoke'] = [dict(pos=[5, 5])]
        barrier = Barrier(2)
        def read(s):
            with sight_calculations(s):
                result = sees_hex(s, 'us', [8, 5]); barrier.wait(timeout=5)
                self.assertEqual(sees_hex(s, 'us', [8, 5]), result)
                return result
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(read, (clear, blocked))), [True, False])
        with sight_calculations(clear):
            self.assertTrue(sees_hex(clear, 'us', [8, 5]))
            with sight_calculations(blocked):
                self.assertFalse(sees_hex(blocked, 'us', [8, 5]))
            self.assertTrue(sees_hex(clear, 'us', [8, 5]))

    def test_cached_line_geometry_still_checks_live_blockers_and_height(self):
        s = self.field(); a, b = [2, 5], [8, 5]
        self.assertTrue(line_clear(a, b, state=s))
        s['fieldworks']['5,5'] = 'bocage'
        self.assertFalse(line_clear(a, b, state=s))
        self.assertTrue(line_clear(a, b, state=s, high_ground=True))
        s['fieldworks']['5,5'] = 'bunker'
        self.assertFalse(line_clear(a, b, state=s, high_ground=True))
        s['fieldworks']['5,5'] = 'field'
        self.assertTrue(line_clear(a, b, state=s))
        self.assertFalse(line_clear(a, b, smoke=[dict(pos=[5, 5])], state=s))
