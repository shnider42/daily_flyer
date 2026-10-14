"""Finite daylight carrier flights, authoritative deck orders and persistence."""
import copy
import tempfile
import unittest

from ww2_web import create_app
from ww2_tactics import cooperative, domains, fubar, midway2, naval
from ww2_tactics.engine import initial, apply, options, distance, terrain
from ww2_tactics.computer import choose_order, play_turn
from ww2_tactics.visibility import active, public_state, update_intel, visible_ids
from ww2_tactics.scenarios import catalog, get_scenario

MAP = 'current:midway_2'


class Midway2RulesTests(unittest.TestCase):
    def battle(self, side='us'):
        state = initial(MAP, 'dsl'); state.update(ready=True, turn=side)
        return state

    def cv(self, state, side='us', group='A', index=0):
        return [u for u in state['units'] if u['kind'] == 'carrier' and u['side'] == side and u['platoon'] == group][index]

    def plane(self, state, cv=None, kind='bomber'):
        cv = cv or self.cv(state)
        return next(u for u in state['units'] if u.get('home_carrier') == cv['id'] and u['kind'] == kind)

    def byid(self, state, uid):
        return next(u for u in state['units'] if u['id'] == uid)

    def launch(self, state, cv=None, plane=None):
        cv = cv or self.cv(state, state['turn']); plane = plane or self.plane(state, cv)
        entry = next(e for e in options(state, cv)['launch'] if e['id'] == plane['id'])
        return apply(state, state['turn'], dict(kind='launch', unit=cv['id'], target=plane['id'], pos=entry['destinations'][0]['pos']), roll=lambda:1)

    def next_turn(self, state):
        side = state['turn']; out = apply(state, side, dict(kind='end'))
        return apply(out, out['turn'], dict(kind='end'))

    def test_current_only_daylight_fixed_rosters_and_manifest(self):
        a, b = self.battle(), self.battle()
        self.assertEqual(a['units'], b['units'])
        self.assertEqual((a['battlefield']['width'], a['battlefield']['height']), (30, 26))
        self.assertIn(MAP, {s['id'] for s in catalog('current')})
        self.assertNotIn('midway_2', {s['id'] for s in catalog()})
        with self.assertRaises(ValueError): get_scenario('midway_2')
        with self.assertRaises(ValueError): initial(MAP, 'classic')
        self.assertFalse(a.get('night_ops_version')); self.assertFalse(a.get('nightveil_version'))
        self.assertFalse(a.get('signals_version')); self.assertTrue(a['fog_of_war'])
        self.assertIn('carrier_decks', a['rule_manifest']['systems'])
        for side, count, size, stores, hull in [('us', 3, 4, 8, 8), ('de', 4, 3, 6, 6)]:
            cvs = [u for u in a['units'] if u['side'] == side and u['kind'] == 'carrier']
            self.assertEqual(len(cvs), count)
            flights = [u for u in a['units'] if u['side'] == side and domains.is_air(u)]
            self.assertEqual(len(flights), 12)
            self.assertEqual(sum(cv['air_stores'] for cv in cvs), 24)
            for cv in cvs:
                self.assertEqual((len(midway2.aboard(a, cv)), cv['air_capacity'], cv['air_stores'], cv['hp']), (size, size, stores, hull))
                for p in midway2.aboard(a, cv):
                    self.assertFalse(active(p)); self.assertFalse(options(a, p)['moves'])
                    self.assertFalse(options(a, p)['targets']); self.assertFalse(options(a, p)['rearm'])
            for u in a['units']:
                if u['side'] == side and active(u):
                    self.assertTrue(naval.navigable(terrain(*u['pos'], a)))
                    self.assertFalse(domains.blocked(a, u, u['pos']))

    def test_actual_launch_costs_and_no_abstract_sorties(self):
        for side in ('us', 'de'):
            with self.subTest(side=side):
                s = self.battle(side); cv = self.cv(s, side); p = self.plane(s, cv)
                self.assertFalse(options(s, cv)['recon']); self.assertFalse(options(s, cv)['airstrikes'])
                out = self.launch(s, cv, p); launched = self.byid(out, p['id']); ship = self.byid(out, cv['id'])
                self.assertTrue(active(launched)); self.assertNotIn('carrier_id', launched)
                self.assertEqual((launched['ap'], ship['ap'], ship['deck_used']), (p['ap']-1, cv['ap']-1, 1))
                self.assertEqual(len(out['units']), len(s['units']))
                self.assertFalse(options(out, launched)['rearm'])
                self.assertFalse(active(p))  # Engine does not mutate its input.
                with self.assertRaises(ValueError):
                    apply(out, side, dict(kind='launch', unit=ship['id'], target=launched['id'], pos=ship['pos']))

    def test_launch_land_service_turnaround_is_finite(self):
        for side, repair in [('us', 2), ('de', 1)]:
            s = self.battle(side); cv = self.cv(s, side); p = self.plane(s, cv)
            s = self.launch(s, cv, p); p = self.byid(s, p['id']); p.update(hp=1, bombs=0)
            s = self.next_turn(s)  # Give the carrier fresh recovery/service cycles.
            p = self.byid(s, p['id']); cv = self.byid(s, cv['id'])
            s = apply(s, side, dict(kind='recover', unit=p['id'], target=cv['id']), roll=lambda:1)
            p = self.byid(s, p['id']); cv = self.byid(s, cv['id'])
            self.assertEqual((p['ap'], p['bombs'], p['carrier_id']), (0, 0, cv['id']))
            self.assertFalse(active(p)); self.assertTrue(p['deck_cooldown'])
            self.assertIn(p['id'], options(s, cv)['deck_service'])
            s = apply(s, side, dict(kind='deck_service', unit=cv['id'], target=p['id']))
            p = self.byid(s, p['id']); cv = self.byid(s, cv['id'])
            self.assertEqual((p['hp'], p['bombs'], cv['deck_used'], cv['air_stores']), (1+repair, 1, 2, cv['max_air_stores']-1))
            self.assertFalse(options(s, cv)['launch']); self.assertFalse(options(s, cv)['deck_service'])
            with self.assertRaises(ValueError): apply(s, side, dict(kind='launch', unit=cv['id'], target=p['id'], pos=cv['pos']))
            s = self.next_turn(s); cv = self.byid(s, cv['id']); p = self.byid(s, p['id'])
            self.assertEqual(cv['deck_used'], 0); self.assertFalse(p['deck_cooldown'])
            self.assertIn(p['id'], [e['id'] for e in options(s, cv)['launch']])
            s = self.launch(s, cv, p); self.assertEqual(len(s['units']), 43)

    def test_deck_capacity_damage_control_and_only_own_turn_reset(self):
        s = self.battle(); cv = self.cv(s); cv['hp'] = 4
        self.assertEqual(midway2.deck_limit(cv), 1)
        s = self.launch(s, cv); cv = self.byid(s, cv['id'])
        self.assertFalse(options(s, cv)['launch'])
        s = apply(s, 'us', dict(kind='repair', unit=cv['id'])); cv = self.byid(s, cv['id'])
        self.assertEqual((cv['hp'], cv['deck_used'], midway2.deck_limit(cv)), (6, 1, 2))
        # Repair consumes the remaining 2 carrier AP, not the used deck cycle.
        self.assertFalse(options(s, cv)['launch'])
        s = apply(s, 'us', dict(kind='end')); self.assertEqual(self.byid(s, cv['id'])['deck_used'], 1)
        s = apply(s, 'de', dict(kind='end')); self.assertEqual(self.byid(s, cv['id'])['deck_used'], 0)

    def test_two_launches_use_shared_deck_limit_without_spawning(self):
        s = self.battle(); cv = self.cv(s); planes = midway2.aboard(s, cv)
        s = self.launch(s, cv, planes[0]); cv = self.byid(s, cv['id'])
        s = self.launch(s, cv, self.byid(s, planes[1]['id'])); cv = self.byid(s, cv['id'])
        self.assertEqual(cv['deck_used'], 2)
        self.assertEqual(len(midway2.aboard(s, cv)), 2)
        self.assertFalse(options(s, cv)['launch'])
        with self.assertRaises(ValueError): apply(s, 'us', dict(kind='launch', unit=cv['id'], target=planes[2]['id'], pos=cv['pos']))

    def test_carrier_moves_with_all_hangar_aircraft(self):
        s = self.battle(); cv = self.cv(s); pos = options(s, cv)['moves'][0]['pos']
        out = apply(s, 'us', dict(kind='move', unit=cv['id'], pos=pos))
        self.assertTrue(all(p['pos'] == pos and not active(p) for p in midway2.aboard(out, self.byid(out, cv['id']))))

    def test_service_requires_aboard_finite_stores_and_own_aircraft(self):
        s = self.battle(); cv = self.cv(s); p = self.plane(s, cv); p.update(hp=1, bombs=0)
        cv['air_stores'] = 0; self.assertFalse(options(s, cv)['deck_service'])
        with self.assertRaises(ValueError): apply(s, 'us', dict(kind='deck_service', unit=cv['id'], target=p['id']))
        cv['air_stores'] = 1
        other = self.plane(s, self.cv(s, group='B')); other.update(hp=1, bombs=0)
        with self.assertRaises(ValueError): apply(s, 'us', dict(kind='deck_service', unit=cv['id'], target=other['id']))
        out = apply(s, 'us', dict(kind='deck_service', unit=cv['id'], target=p['id']))
        self.assertEqual(self.byid(out, cv['id'])['air_stores'], 0)
        self.assertFalse(options(out, self.byid(out, cv['id']))['deck_service'])
        with self.assertRaises(ValueError): apply(out, 'us', dict(kind='move', unit=p['id'], pos=[5, 21]))
        self.assertFalse(options(out, self.byid(out, p['id']))['moves'])

    def test_carrier_sinking_destroys_only_aboard_flights(self):
        s = self.battle(); cv = self.cv(s); p = self.plane(s, cv)
        s = self.launch(s, cv, p); cv = self.byid(s, cv['id']); cv.update(hp=1, pos=[15, 10])
        enemy = next(u for u in s['units'] if u['side'] == 'de' and u['kind'] == 'destroyer')
        enemy.update(pos=[15, 9], ap=4); s.update(turn='de', fog_of_war=False)
        out = apply(s, 'de', dict(kind='torpedo', unit=enemy['id'], target=cv['id']), roll=lambda:6)
        self.assertEqual(self.byid(out, cv['id'])['hp'], 0)
        self.assertTrue(active(self.byid(out, p['id'])))
        self.assertTrue(all(u['hp'] == 0 for u in out['units'] if u.get('carrier_id') == cv['id']))
        self.assertIsNone(out['winner'])
        for u in out['units']:
            if u['kind'] == 'carrier' and u['side'] == 'us': u['hp'] = 0
        out = apply(out, 'de', dict(kind='end')); self.assertEqual(out['winner'], 'de')
        self.assertEqual(len(out['units']), 43)

    def test_diversion_needs_free_berth_same_group_and_deck_cycle(self):
        s = self.battle(); cv = self.cv(s); p = self.plane(s, cv)
        s = self.launch(s, cv, p); cv = self.byid(s, cv['id']); p = self.byid(s, p['id'])
        other = self.cv(s, index=1); other['pos'] = p['pos'].copy()
        self.assertNotIn(other['id'], options(s, p)['recover'])  # Full hangar.
        midway2.aboard(s, other)[0]['hp'] = 0
        self.assertIn(other['id'], options(s, p)['recover'])
        other['deck_used'] = 2; self.assertNotIn(other['id'], options(s, p)['recover'])
        other['deck_used'] = 0
        wrong = self.cv(s, group='B'); wrong['pos'] = p['pos'].copy(); midway2.aboard(s, wrong)[0]['hp'] = 0
        self.assertNotIn(wrong['id'], options(s, p)['recover'])
        out = apply(s, 'us', dict(kind='recover', unit=p['id'], target=other['id']), roll=lambda:1)
        self.assertEqual(self.byid(out, p['id'])['carrier_id'], other['id'])
        self.assertEqual(self.byid(out, p['id'])['home_carrier'], cv['id'])

    def test_hangars_and_enemy_deck_state_are_private(self):
        s = self.battle(); own = self.cv(s); enemy = self.cv(s, 'de'); enemy.update(pos=[5, 20], deck_used=1)
        update_intel(s); view = public_state(s, 'us')
        self.assertTrue(all(p['id'] in {u['id'] for u in view['units']} for p in midway2.aboard(s, own)))
        self.assertTrue(all(p['id'] not in {u['id'] for u in view['units']} for p in midway2.aboard(s, enemy)))
        seen = self.byid(view, enemy['id'])
        for key in ('air_stores', 'deck_used', 'service_used', 'deck_cooldown'): self.assertNotIn(key, seen)
        self.assertEqual(enemy['deck_used'], 1)

    def test_hidden_air_occupancy_not_used_by_launch_preview(self):
        s = self.battle(); cv = self.cv(s); p = self.plane(s, cv)
        baseline = copy.deepcopy(options(s, cv)['launch'])
        entry = next(e for e in baseline if e['id'] == p['id'])
        pos = entry['destinations'][0]['pos']; enemy = self.plane(s, self.cv(s, 'de'), 'fighter')
        # Hangar occupants never block. An unseen active contact is checked on execution.
        enemy['pos'] = pos.copy()
        self.assertEqual(options(s, cv)['launch'], baseline)
        enemy.pop('carrier_id'); enemy['sight'] = 0
        for u in s['units']:
            if u['side'] == 'us': u['sight'] = 0
        # Launch cells are adjacent, hence normally visible. Isolate preview sight
        # without changing execution's full occupancy check.
        from unittest.mock import patch
        with patch('ww2_tactics.visibility.unit_visible_ids', return_value={cv['id']}):
            hidden = options(s, cv)['launch']
        self.assertEqual(hidden, baseline)
        with patch('ww2_tactics.visibility.unit_visible_ids', return_value={cv['id']}):
            with self.assertRaises(ValueError): apply(s, 'us', dict(kind='launch', unit=cv['id'], target=p['id'], pos=pos))
        self.assertIn('carrier_id', p); self.assertEqual(cv['deck_used'], 0)

    def test_takeoff_and_recovery_are_interceptable(self):
        s = self.battle(); cv = self.cv(s); p = self.plane(s, cv); entry = options(s, cv)['launch'][0]
        p = self.byid(s, entry['id']); pos = entry['destinations'][0]['pos']
        escort = next(u for u in s['units'] if u['side'] == 'de' and u['kind'] == 'cruiser')
        escort.update(pos=[pos[0], pos[1]-1], overwatch=True)
        out = apply(s, 'us', dict(kind='launch', unit=cv['id'], target=p['id'], pos=pos), roll=lambda:6)
        p = self.byid(out, p['id']); self.assertEqual(p['hp'], 2)
        self.assertEqual(out['last_combat']['kind'], 'AA interception')
        escort = self.byid(out, escort['id']); escort['overwatch'] = True
        p['hp'] = 1
        out = apply(out, 'us', dict(kind='recover', unit=p['id'], target=cv['id']), roll=lambda:6)
        self.assertEqual(self.byid(out, p['id'])['hp'], 0)
        self.assertNotIn('carrier_id', self.byid(out, p['id']))
        self.assertEqual(self.byid(out, cv['id'])['deck_used'], 2)

    def test_role_asymmetry_and_one_finite_attack_load(self):
        for side, variant, threshold, damage in [('us', 'dive_bomber', 3, 3), ('us', 'torpedo_bomber', 5, 3),
                                                  ('de', 'dive_bomber', 4, 3), ('de', 'torpedo_bomber', 4, 4)]:
            s = self.battle(side); p = next(u for u in s['units'] if u['side'] == side and u.get('variant') == variant)
            p.pop('carrier_id'); p.update(pos=[15, 10], ap=4)
            enemy = self.cv(s, 'de' if side == 'us' else 'us'); enemy['pos'] = [15, 11]
            shot = next(t for t in options(s, p)['targets'] if t['id'] == enemy['id'])
            self.assertEqual((shot['threshold'], shot['damage']), (threshold, damage))
            out = apply(s, side, dict(kind='fire', unit=p['id'], target=enemy['id']), roll=lambda:6)
            p = self.byid(out, p['id']); p['ap'] = 4
            self.assertEqual(p['bombs'], 0); self.assertFalse(options(out, p)['targets'])
            self.assertEqual(self.byid(out, enemy['id'])['hp'], enemy['hp']-damage)

    def test_ship_scoring_aircraft_cannot_capture_and_final_round(self):
        s = self.battle(); ship = next(u for u in s['units'] if u['kind'] == 'destroyer' and u['side'] == 'us')
        ship['pos'] = [5, 12]; s['joint_score']['us'] = 11
        enemy = self.plane(s, self.cv(s, 'de'), 'fighter'); enemy.pop('carrier_id'); enemy['pos'] = ship['pos'].copy()
        self.assertEqual(fubar.controls(s)[0]['owner'], 'us')
        self.assertEqual(apply(s, 'us', dict(kind='end'))['winner'], 'us')
        s = self.battle('de'); s['round'] = 24; s['joint_score'] = {'us': 4, 'de': 3}
        self.assertEqual(apply(s, 'de', dict(kind='end'))['winner'], 'us')
        s['joint_score'] = {'us': 4, 'de': 4}; self.assertEqual(apply(s, 'de', dict(kind='end'))['winner'], 'de')

    def test_computer_launches_lands_services_and_preserves_finite_roster(self):
        for side in ('us', 'de'):
            s = self.battle(side); s['ai_side'] = side
            order = choose_order(s, {}, {})
            self.assertEqual(order['kind'], 'launch')
            out = play_turn(s, roll=lambda:1, max_orders=3)
            self.assertEqual(len(out['units']), 43); self.assertGreater(out['revision'], 0)
            self.assertTrue(any(active(u) for u in out['units'] if domains.is_air(u) and u['side'] == side))
            self.assertTrue(all(u['ap'] >= 0 for u in out['units']))
            s = self.battle(side); cv = self.cv(s, side); p = self.plane(s, cv)
            p.pop('carrier_id'); p.update(pos=cv['pos'].copy(), bombs=0, ap=3)
            self.assertEqual(choose_order(s, {}, {})['kind'], 'recover')
            s = apply(s, side, dict(kind='recover', unit=p['id'], target=cv['id']), roll=lambda:1)
            self.assertEqual(choose_order(s, {}, {})['kind'], 'deck_service')


class Midway2ApiTests(unittest.TestCase):
    def test_save_restore_retains_real_aircraft_deck_usage_and_stores(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = create_app(tmp+'/games.sqlite', background_ai=False).test_client()
            seat = client.post('/api/match', json=dict(scenario=MAP, ruleset='dsl', opponent='computer')).json
            url = '/api/match/'+seat['code']; headers = {'Authorization': 'Bearer '+seat['token']}
            state = client.get(url, headers=headers).json
            cv = next(u for u in state['units'] if u['side'] == 'us' and u['kind'] == 'carrier')
            launch = state['legal'][cv['id']]['launch'][0]
            response = client.post(url, headers=headers, json=dict(revision=state['revision'], kind='launch', unit=cv['id'], target=launch['id'], pos=launch['destinations'][0]['pos']))
            self.assertEqual(response.status_code, 200, response.json)
            before = client.get(url, headers=headers).json
            saved = client.post(url+'/save', headers=headers, json={'revision': before['revision']}).json
            restored = client.post('/api/restore', json={'code': saved['save_code']}).json
            after = client.get('/api/match/'+restored['code'], headers={'Authorization': 'Bearer '+restored['token']}).json
            for key in ('scenario', 'units', 'joint_score', 'midway_ops_version'): self.assertEqual(before[key], after[key])

    def test_cooperative_unit_control_keeps_carrier_and_air_group_together(self):
        s = initial(MAP, 'dsl')
        cooperative.initialize(s, dict(control_size='units', side='us'), 'host', 'Host')
        for cv in [u for u in s['units'] if u['kind'] == 'carrier']:
            group = cooperative.group_for(s, cv['id'])
            for p in midway2.aboard(s, cv): self.assertEqual(cooperative.group_for(s, p['id']), group)
        cvs = [u for u in s['units'] if u['side'] == 'us' and u['kind'] == 'carrier' and u['platoon'] == 'A']
        self.assertFalse(midway2.same_command(s, midway2.aboard(s, cvs[0])[0], cvs[1]))

    def test_four_player_platoon_ownership_and_deck_order_authorization(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = create_app(tmp+'/games.sqlite', background_ai=False).test_client()
            host = client.post('/api/match', json=dict(scenario=MAP, ruleset='dsl', opponent='cooperative')).json
            url = '/api/match/'+host['code']; headers = {'Authorization': 'Bearer '+host['token']}
            seats = [host]
            for side, group in [('us', 'B'), ('de', 'A'), ('de', 'B')]:
                response = client.post(url+'/join', json=dict(side=side, group=side+':'+group, player_name=side+group))
                self.assertEqual(response.status_code, 200, response.json); seats.append(response.json)
            before = client.get(url, headers=headers).json
            started = client.post(url+'/cooperative', headers=headers, json=dict(operation='start', revision=before['revision']))
            self.assertEqual(started.status_code, 200, started.json)
            s = client.get(url, headers=headers).json
            cv = next(u for u in s['units'] if u['side'] == 'us' and u['kind'] == 'carrier' and u['platoon'] == 'A')
            other = next(u for u in s['units'] if u['side'] == 'us' and u['kind'] == 'carrier' and u['platoon'] == 'B')
            p = next(u for u in s['units'] if u.get('carrier_id') == other['id'])
            denied = client.post(url, headers=headers, json=dict(revision=s['revision'], kind='launch', unit=cv['id'], target=p['id'], pos=cv['pos']))
            self.assertEqual(denied.status_code, 400)
            launch = s['legal'][cv['id']]['launch'][0]
            accepted = client.post(url, headers=headers, json=dict(revision=s['revision'], kind='launch', unit=cv['id'], target=launch['id'], pos=launch['destinations'][0]['pos']))
            self.assertEqual(accepted.status_code, 200, accepted.json)
            state = client.get(url, headers=headers).json
            self.assertEqual(state['coop']['controllers'][launch['id']], state['coop']['controllers'][cv['id']])


if __name__ == '__main__': unittest.main()
