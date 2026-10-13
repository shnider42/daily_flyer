"""Constrained deployment, private search information, and night-rule reuse."""
import random
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import cooperative, domains, nightfall, nightveil
from ww2_tactics.engine import initial, apply, options, distance
from ww2_tactics.scenarios import catalog, get_scenario
from ww2_tactics.visibility import active, public_state, visible_ids

MAP = 'current:nightfall_veil'


class NightveilTests(unittest.TestCase):
    def battle(self, seed=17):
        with patch('ww2_tactics.nightveil.secrets.SystemRandom', return_value=random.Random(seed)):
            state = initial(MAP, 'dsl')
        state['ready'] = True
        return state

    def test_current_only_map_has_fixed_forces_and_nine_possible_sites_per_sector(self):
        state = self.battle()
        self.assertIn(MAP, {b['id'] for b in catalog('current')})
        self.assertNotIn('nightfall_veil', {b['id'] for b in catalog('legacy')})
        with self.assertRaises(ValueError):
            get_scenario('nightfall_veil')
        with self.assertRaises(ValueError):
            initial(MAP, 'classic')
        self.assertEqual(len(state['units']), 38)
        self.assertEqual(state['battlefield']['night_targets'], [])
        self.assertEqual([len(s['sites']) for s in state['battlefield']['night_search_sectors']], [9, 9])
        beacon = initial('current:nightfall_beacon', 'dsl')
        self.assertEqual([(u['id'], u['hp'], u['base_ap'], u.get('bombs'), u.get('flares')) for u in state['units']],
                         [(u['id'], u['hp'], u['base_ap'], u.get('bombs'), u.get('flares')) for u in beacon['units']])
        self.assertEqual(state['battlefield']['rounds'], beacon['battlefield']['rounds'])

    def test_many_deployments_stay_legal_hidden_and_within_role_zones(self):
        radar_choices = {'A': set(), 'B': set()}
        for seed in range(40):
            state = self.battle(seed)
            self.assertEqual(sum(u['side'] == 'de' for u in public_state(state, 'us')['units']), 0)
            for unit in state['units']:
                if active(unit):
                    self.assertFalse(domains.blocked(state, unit, unit['pos']), (seed, unit['id']))
                if unit['side'] != 'de' or unit['kind'] == 'airfield':
                    continue
                self.assertIn(unit['pos'], nightveil.candidates(state, unit))
                if unit.get('mission_radar'):
                    radar_choices[unit['platoon']].add(tuple(unit['pos']))
                if unit['kind'] in {'squad', 'mg'}:
                    self.assertGreaterEqual(distance(unit['pos'], state['battlefield']['objective']), 4)
            for side in ('us', 'de'):
                for group in ('A', 'B'):
                    self.assertEqual(sum(u['side'] == side and u['platoon'] == group for u in state['units']), 9 if side == 'us' else 10)
        self.assertTrue(all(len(positions) == 9 for positions in radar_choices.values()), radar_choices)

    def test_new_battles_vary_and_allied_starts_do_not(self):
        first, second = self.battle(1), self.battle(2)
        self.assertNotEqual([u['pos'] for u in first['units'] if u['side'] == 'de'],
                            [u['pos'] for u in second['units'] if u['side'] == 'de'])
        self.assertEqual([u['pos'] for u in first['units'] if u['side'] == 'us'],
                         [u['pos'] for u in second['units'] if u['side'] == 'us'])
        self.assertEqual(first['battlefield'], second['battlefield'])
        # Old Beacon remains the authored, fixed deployment.
        first, second = initial('current:nightfall_beacon', 'dsl'), initial('current:nightfall_beacon', 'dsl')
        self.assertEqual(first['units'], second['units'])

    def test_scanning_flares_find_actual_radars_and_no_private_search_state_is_exposed(self):
        state = self.battle()
        radar = next(u for u in state['units'] if u.get('mission_radar') and u['platoon'] == 'A')
        self.assertNotIn(radar['id'], visible_ids(state, 'us'))
        state['night_flares'] = [dict(side='us', pos=radar['pos'].copy(), ttl=2)]
        nightveil.record_search(state)
        self.assertIn(radar['id'], visible_ids(state, 'us'))
        self.assertIn(radar['pos'], state['night_search_checked'])
        view = public_state(state, 'us')
        self.assertNotIn('night_search_checked', view)
        self.assertEqual(view['battlefield']['night_targets'], [])
        self.assertIn(radar['id'], {u['id'] for u in view['units']})
        self.assertNotIn('night_search_checked', public_state(dict(state, fog_of_war=False), 'us'))

    def test_allied_ai_search_goals_do_not_depend_on_hidden_radar_positions(self):
        first, second = self.battle(1), self.battle(2)
        observed_first = [u for u in first['units'] if u['side'] == 'us']
        observed_second = [u for u in second['units'] if u['side'] == 'us']
        self.assertEqual(nightveil.search_goals(first, observed_first), nightveil.search_goals(second, observed_second))
        self.assertEqual(nightveil.search_goals(first, observed_first),
                         [p for sector in first['battlefield']['night_search_sectors'] for p in sector['sites']])
        bomber = next(u for u in first['units'] if u['side'] == 'us' and u['kind'] == 'bomber')
        bomber_other = next(u for u in second['units'] if u['id'] == bomber['id'])
        self.assertEqual(nightfall.choices(first, bomber, options(first, bomber), observed_first, {}),
                         nightfall.choices(second, bomber_other, options(second, bomber_other), observed_second, {}))

    def test_drop_dice_and_transport_ownership_reuse_beacon_rules(self):
        for die in (1, 6):
            state = self.battle()
            cooperative.initialize(state, dict(control_size='units'), 'host', 'Host')
            state['ready'] = True  # Exercise the engine after inspecting ownership.
            plane = next(u for u in state['units'] if u['kind'] == 'transport_aircraft')
            cargo = nightfall.drop_reserves(state, plane)[0]
            self.assertEqual(cooperative.group_for(state, cargo['id'])['id'], cooperative.group_for(state, plane['id'])['id'])
            plane.update(pos=[15, 13], ap=4)
            out = apply(state, 'us', dict(kind='airborne_drop', unit=plane['id'], pos=[15, 13]), roll=lambda:die)
            report = out['airlift_reports']['us']
            self.assertEqual(report['roll'], die)
            troop = next(u for u in out['units'] if u['id'] == cargo['id'])
            self.assertEqual(troop['hp'] > 0, die == 6)
            if die == 6:
                self.assertEqual(troop['pos'], [15, 13])
                self.assertEqual(troop['ap'], 1)
            else:
                self.assertNotIn('pos', report)

    def test_catalog_and_save_restore_keep_layout_without_rerandomizing(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = create_app(tmp + '/test.sqlite', background_ai=False).test_client()
            catalog_data = client.get('/api/scenarios').json
            board = next(b for b in catalog_data['current_scenarios'] if b['id'] == MAP)
            self.assertEqual(board['night_targets'], [])
            seat = client.post('/api/match', json=dict(scenario=MAP, ruleset='dsl', opponent='computer', side='de')).json
            headers = {'Authorization':'Bearer ' + seat['token']}
            view = client.get('/api/match/' + seat['code'], headers=headers).json
            self.assertEqual(sum(u['side'] == 'de' for u in view['units']), 20)
            saved = client.post('/api/match/' + seat['code'] + '/save', headers=headers, json=dict(revision=view['revision'])).json
            restored = client.post('/api/restore', json=dict(code=saved['save_code'])).json
            after = client.get('/api/match/' + restored['code'], headers={'Authorization':'Bearer ' + restored['token']}).json
            self.assertEqual(view['scenario'], after['scenario'])
            self.assertEqual(view['units'], after['units'])
            self.assertNotIn('night_search_checked', after)


if __name__ == '__main__':
    unittest.main()
