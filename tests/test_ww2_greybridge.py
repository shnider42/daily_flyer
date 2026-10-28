import copy
import json
import unittest

from ww2_tactics import greybridge, debrief, order_history
from ww2_tactics.battle_setup import result_summary
from ww2_tactics.computer import choose_order, objective_costs, play_turn
from ww2_tactics.engine import initial, apply, options
from ww2_tactics.scenarios import catalog, get_scenario
from ww2_tactics.visibility import public_state, view, unit_sees_hex, update_intel


class GreybridgeTests(unittest.TestCase):
    def battle(self, stage='raid'):
        state = initial('current:greybridge_'+stage, 'dsl')
        state['ready'] = True
        return state

    def unit(self, state, number=1, side='us'):
        return next(u for u in state['units'] if u['id'] == side+'-greybridge-'+str(number))

    def order(self, state, unit, kind, **extra):
        return apply(state, state['turn'], dict(kind=kind, unit=unit['id'], **extra), roll=lambda: 6)

    def at_relay(self, state):
        unit = self.unit(state)
        unit.update(pos=state['battlefield']['greybridge_relay'][:], ap=3)
        return unit

    def at_exit(self, state, number=1):
        unit = self.unit(state, number)
        unit.update(pos=state['battlefield']['greybridge_exits'][0][:], ap=3)
        return unit

    def occupy(self, state):
        objective = state['battlefield']['objective']
        for u in state['units']:
            if u['pos'] == objective:
                u['pos'] = [11, 0] if u['side'] == 'de' else [10, 12]
        unit = self.unit(state)
        unit.update(pos=objective[:], ap=3)
        return unit

    def test_saved_current_only_compact_templates_and_unchanged_catalog(self):
        for stage in greybridge.STAGES:
            s = self.battle(stage)
            b = s['battlefield']
            self.assertEqual((b['width'], b['height']), (10, 12) if stage == 'raid' else (12, 14))
            self.assertTrue(b['operation_only'])
            self.assertEqual(s['edition'], 'current')
            self.assertTrue(s['fog_of_war'])
            self.assertEqual(s['support'], {'us': 0, 'de': 0})
            self.assertEqual(len(s['units']), 12 if stage == 'raid' else 16)
            self.assertEqual(len({u['id'] for u in s['units']}), len(s['units']))
            self.assertTrue(all(u.get('display_name') for u in s['units']))
            costs = objective_costs(s)
            self.assertTrue(all(tuple(u['pos']) in costs for u in s['units']))
            with self.assertRaises(ValueError):
                get_scenario('greybridge_'+stage)
            with self.assertRaises(ValueError):
                initial('current:greybridge_'+stage, 'classic')
        self.assertEqual(len(catalog('current')), 35)
        self.assertFalse(any(b.get('operation_only') for b in catalog('current')))
        self.assertFalse(any(b.get('operation_only') for b in catalog('legacy')))
        self.assertNotIn('greybridge', initial('village', 'dsl'))

    def test_relay_cost_once_no_dice_or_input_mutation(self):
        s = self.battle(); u = self.at_relay(s); before = copy.deepcopy(s)
        self.assertTrue(options(s, u)['sabotage_relay'])
        out = self.order(s, u, 'sabotage_relay')
        self.assertEqual(s, before)
        self.assertEqual(self.unit(out)['ap'], 1)
        self.assertTrue(out['greybridge']['relay_disabled'])
        self.assertFalse(options(out, self.unit(out))['sabotage_relay'])
        self.assertIsNone(out['winner'])
        with self.assertRaises(ValueError):
            self.order(out, self.unit(out), 'sabotage_relay')

    def test_relay_gates_turn_distance_status_ap_and_kind(self):
        for changes in (dict(ap=1), dict(pinned=True), dict(hp=0), dict(reserve=True),
                        dict(carrier_id='transport'), dict(pos=[0, 11]), dict(kind='tank')):
            s = self.battle(); u = self.at_relay(s); u.update(changes)
            self.assertFalse(options(s, u)['sabotage_relay'], changes)
            with self.assertRaises(ValueError):
                self.order(s, u, 'sabotage_relay')
        s = self.battle(); u = self.at_relay(s); s['turn'] = 'de'
        self.assertFalse(options(s, u)['sabotage_relay'])
        enemy = self.unit(s, side='de'); enemy.update(pos=[4, 3], ap=3)
        self.assertFalse(options(s, enemy)['sabotage_relay'])

    def test_relay_survives_local_defeat_and_json_restore(self):
        s = self.battle(); s = self.order(s, self.at_relay(s), 'sabotage_relay')
        for u in s['units']:
            if u['side'] == 'us': u['hp'] = 0
        out = apply(s, 'us', {'kind': 'end'})
        restored = json.loads(json.dumps(out))
        self.assertEqual(restored['winner'], 'de')
        self.assertTrue(restored['greybridge']['relay_disabled'])
        self.assertFalse(restored['greybridge']['objective_completed'])
        self.assertIn('Too few', result_summary(restored)['reason'])

    def test_extraction_uses_exact_exit_and_costs_one(self):
        s = self.battle(); u = self.at_exit(s); before = copy.deepcopy(s)
        out = self.order(s, u, 'extract')
        self.assertEqual(s, before)
        self.assertNotIn(u['id'], [v['id'] for v in out['units']])
        self.assertEqual(out['greybridge']['extracted'], 1)
        self.assertEqual(out['evacuated_count'], 1)
        self.assertEqual(out['evacuated_manifest'][0]['id'], u['id'])
        self.assertIn('extracted safely', public_state(out, 'us')['log'][-1])
        self.assertIsNone(out['winner'])
        out = self.order(out, self.at_exit(out, 2), 'extract')
        self.assertEqual(out['winner'], 'us')
        self.assertTrue(out['greybridge']['objective_completed'])
        self.assertEqual(debrief.summary(out, 'us')['evacuated'], 2)
        self.assertEqual(sum(debrief.summary(out, 'us')['statistics']['losses'].values()), 0)

    def test_extraction_legality_and_noninfantry(self):
        for changes in (dict(ap=0), dict(pinned=True), dict(reserve=True), dict(hp=0),
                        dict(carrier_id='transport'), dict(pos=[8, 10]), dict(kind='tank')):
            s = self.battle(); u = self.at_exit(s); u.update(changes)
            self.assertFalse(options(s, u)['extract'], changes)
            with self.assertRaises(ValueError):
                self.order(s, u, 'extract')
        for stage in ('crossing', 'hold'):
            s = self.battle(stage)
            self.assertFalse(options(s, self.unit(s))['extract'])
            self.assertFalse(options(s, self.unit(s))['sabotage_relay'])

    def test_no_generic_elimination_or_objective_shortcut(self):
        s = self.battle()
        for u in s['units']:
            if u['side'] == 'de': u['hp'] = 0
        self.at_relay(s)
        for _ in range(2):
            s = apply(s, 'us', {'kind': 'end'})
            self.assertIsNone(s['winner'])
            s = apply(s, 'de', {'kind': 'end'})
        self.assertEqual(s['greybridge']['extracted'], 0)
        for stage in ('crossing', 'hold'):
            s = self.battle(stage)
            for u in s['units']:
                if u['side'] == 'de': u['hp'] = 0
            if stage == 'hold': self.unit(s)['pos'] = [4, 10]
            s = apply(s, 'us', {'kind': 'end'})
            self.assertIsNone(s['winner'])

    def test_crossing_two_ends_and_hold_four(self):
        for stage, required in (('crossing', 2), ('hold', 4)):
            s = self.battle(stage); self.occupy(s)
            for n in range(required):
                s = apply(s, 'us', {'kind': 'end'})
                self.assertEqual(s['greybridge']['hold'], n+1)
                if n == required-1:
                    self.assertEqual(s['winner'], 'us')
                else:
                    self.assertIsNone(s['winner'])
                    s = apply(s, 'de', {'kind': 'end'})

    def test_crossing_hold_breaks_immediately_and_cannot_use_vehicle(self):
        s = self.battle('crossing'); self.occupy(s)
        s = apply(s, 'us', {'kind': 'end'}); s = apply(s, 'de', {'kind': 'end'})
        s = self.order(s, self.unit(s), 'move', pos=[6, 6])
        self.assertEqual(s['greybridge']['hold'], 0)
        self.assertEqual(s['hold'], 0)
        self.unit(s).update(pos=s['battlefield']['objective'][:], kind='tank')
        s = apply(s, 'us', {'kind': 'end'})
        self.assertEqual(s['hold'], 0)

    def test_deadlines_at_full_round_and_last_allied_turn_allowed(self):
        for stage in greybridge.STAGES:
            s = self.battle(stage); s['round'] = s['battlefield']['rounds']
            if stage == 'hold': self.unit(s)['pos'] = [4, 10]
            s = apply(s, 'us', {'kind': 'end'})
            self.assertIsNone(s['winner'])
            s = apply(s, 'de', {'kind': 'end'})
            self.assertEqual(s['winner'], 'de')
            self.assertEqual(s['round'], s['battlefield']['rounds'])
        s = self.battle('crossing'); self.occupy(s)
        s.update(round=12, hold=1); s['greybridge']['hold'] = 1
        s = apply(s, 'us', {'kind': 'end'})
        self.assertEqual(s['winner'], 'us')

    def test_withdrawal_success_is_explicitly_not_crossing_victory(self):
        s = self.battle('withdrawal')
        for number in (1, 2, 3, 4):
            s = self.order(s, self.at_exit(s, number), 'extract')
        self.assertEqual(s['winner'], 'us')
        self.assertEqual(s['greybridge']['extracted'], 4)
        self.assertIn('crossing remains lost', result_summary(s)['reason'])

    def test_insufficient_remaining_teams_ends_extraction(self):
        s = self.battle('withdrawal')
        for u in s['units']:
            if u['side'] == 'us' and u['number'] > 3: u['hp'] = 0
        s = apply(s, 'us', {'kind': 'end'})
        self.assertEqual(s['winner'], 'de')
        self.assertIn('Too few', s['greybridge']['outcome_reason'])

    def test_saved_relay_changes_only_fresh_crossing_reserve(self):
        normal = self.battle('crossing')
        delayed = greybridge.configure(self.battle('crossing'), {'relay_disabled': True})
        self.assertEqual(normal['greybridge']['reserve_round'], 4)
        self.assertEqual(delayed['greybridge']['reserve_round'], 6)
        normal_active = [u for u in normal['units'] if not u.get('greybridge_reserve')]
        delayed_active = [u for u in delayed['units'] if not u.get('greybridge_reserve')]
        self.assertEqual(normal_active, delayed_active)
        self.assertEqual([u['arrival_round'] for u in delayed['units'] if u.get('greybridge_reserve')], [6, 6])
        fresh = self.battle('crossing')
        self.assertEqual(fresh['greybridge']['reserve_round'], 4)
        delayed = apply(delayed, 'us', {'kind': 'end'})
        with self.assertRaises(ValueError): greybridge.configure(delayed, {'relay_disabled': False})

    def test_reserves_arrive_at_real_round_and_blocked_entry_waits(self):
        for relay, arrival in ((False, 4), (True, 6)):
            s = greybridge.configure(self.battle('crossing'), {'relay_disabled': relay})
            for round_number in range(1, arrival+1):
                s = apply(s, 'us', {'kind': 'end'})
                reserves = [u for u in s['units'] if u.get('greybridge_reserve')]
                self.assertEqual([bool(u['reserve']) for u in reserves], [round_number < arrival]*2)
                self.assertEqual(s['greybridge']['reserve_arrived'], round_number >= arrival)
                if round_number != arrival: s = apply(s, 'de', {'kind': 'end'})
        s = self.battle('crossing'); s['round'] = 4
        self.unit(s).update(pos=[3, 0], ap=0)
        s = apply(s, 'us', {'kind': 'end'})
        self.assertTrue(self.unit(s, 7, 'de')['reserve'])
        self.assertFalse(self.unit(s, 8, 'de')['reserve'])
        s = apply(s, 'de', {'kind': 'end'}); self.unit(s)['pos'] = [4, 0]
        s = apply(s, 'us', {'kind': 'end'})
        self.assertFalse(self.unit(s, 7, 'de')['reserve'])

    def test_night_sight_and_private_operation_redaction(self):
        s = self.battle(); s['battlefield']['map'] = [['field']*10 for _ in range(12)]
        u = self.unit(s); u['pos'] = [0, 0]
        scout = self.unit(s, 4); scout['pos'] = [0, 0]
        self.assertTrue(unit_sees_hex(s, u, [3, 0]))
        self.assertFalse(unit_sees_hex(s, u, [4, 0]))
        self.assertTrue(unit_sees_hex(s, scout, [4, 0]))
        self.assertFalse(unit_sees_hex(s, scout, [5, 0]))
        s['_operation'] = {'future_templates': {'secret': 'never public'}}
        s = self.order(s, self.at_exit(s), 'extract')
        for fog in (True, False):
            s['fog_of_war'] = fog
            for side in ('us', 'de'):
                self.assertNotIn('_operation', public_state(s, side))
                self.assertNotIn('_operation', view(s, side))
                self.assertEqual(public_state(s, side)['greybridge']['extracted'], 1)
            self.assertNotIn('evacuated_manifest', public_state(s, 'de'))

    def test_mission_orders_commit_undo_and_save_exact_outcome(self):
        s = self.battle(); u = self.at_relay(s)
        s = order_history.perform(s, 'us', {'kind': 'sabotage_relay', 'unit': u['id']}, defer_computer=True)
        self.assertFalse(order_history.status(s, 'us')['can_undo'])
        restored = json.loads(json.dumps(s))
        self.assertTrue(restored['greybridge']['relay_disabled'])
        u = self.at_exit(restored)
        restored = order_history.perform(restored, 'us', {'kind': 'extract', 'unit': u['id']}, defer_computer=True)
        self.assertFalse(order_history.status(restored, 'us')['can_undo'])

    def test_german_ai_uses_public_goals_and_completes_a_turn(self):
        for stage in ('raid', 'crossing', 'hold', 'withdrawal'):
            s = self.battle(stage); s.update(turn='de', ai_side='de')
            update_intel(s)
            unit = self.unit(s, 4, 'de')
            fallback = s['battlefield']['objective']
            goal = greybridge.goal(s, unit, fallback)
            moved = copy.deepcopy(s)
            for u in moved['units']:
                if u['side'] == 'us': u['pos'] = [0, 11]
            self.assertEqual(goal, greybridge.goal(moved, self.unit(moved, 4, 'de'), fallback))
            action = choose_order(s, objective_costs(s), {})
            self.assertNotIn(action['kind'], greybridge.ORDERS)
            out = play_turn(s, roll=lambda: 3, max_orders=60)
            self.assertTrue(out['turn'] == 'us' or out['winner'])
            self.assertEqual(view(out, 'us')['greybridge'], out['greybridge'])


if __name__ == '__main__':
    unittest.main()
