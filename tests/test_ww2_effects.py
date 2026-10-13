"""Resolved visual events retain dice results and redact hidden firing origins."""
import copy
import unittest

from ww2_tactics import effects
from ww2_tactics.engine import apply, initial, options
from ww2_tactics.visibility import sees_hex


class AirEffectsTests(unittest.TestCase):
    def night_battle(self):
        state = initial('current:nightfall_beacon', 'dsl')
        state.update(ready=True, fog_of_war=False)
        for unit in state['units']:
            unit['overwatch'] = False
        return state

    def test_bombing_records_actual_hit_or_miss_without_extra_rolls(self):
        for die in (1, 6):
            state = self.night_battle()
            bomber = next(u for u in state['units'] if u.get('variant') == 'lancaster')
            radar = next(u for u in state['units'] if u.get('mission_radar'))
            bomber.update(pos=[8, 13], ap=4)
            rolls = []
            def roll():
                rolls.append(die)
                return die
            result = apply(state, 'us', {'kind': 'fire', 'unit': bomber['id'], 'target': radar['id']}, roll=roll)
            event = result['effects'][-1]
            self.assertEqual(rolls, [die])
            self.assertEqual(event['kind'], 'bombing')
            self.assertEqual(event['positions'], [radar['pos']])
            self.assertEqual(event['origin'], bomber['pos'])
            self.assertEqual((event['layer'], event['origin_layer']), ('ground', 'air'))
            self.assertEqual(event['hit'], die >= result['last_combat']['threshold'])

    def test_aa_direct_and_reaction_use_anti_air_event(self):
        from ww2_tactics.air import resolve_shot
        for reaction in (False, True):
            state = self.night_battle()
            gun = next(u for u in state['units'] if u['kind'] == 'aa_gun')
            plane = next(u for u in state['units'] if u['kind'] == 'bomber')
            resolve_shot(state, gun, plane, lambda: 6, reaction=reaction)
            event = state['effects'][-1]
            self.assertEqual(event['kind'], 'anti_air')
            self.assertEqual(event['layer'], 'air')
            self.assertEqual(event['origin_layer'], 'ground')
            self.assertTrue(event['hit'])
            self.assertEqual(state['last_combat']['kind'], 'AA interception' if reaction else 'Anti-aircraft fire')

    def test_ground_flak_direct_fire_uses_aa_event(self):
        state = initial('fubar', 'dsl')
        state.update(ready=True, turn='de', fog_of_war=False)
        gun = next(u for u in state['units'] if u['kind'] == 'flak')
        plane = next(u for u in state['units'] if u['side'] == 'us' and u['kind'] == 'fighter')
        gun.update(pos=[20, 20], ap=2, pinned=False)
        plane['pos'] = [20, 19]
        self.assertIn(plane['id'], [t['id'] for t in options(state, gun)['targets']])
        result = apply(state, 'de', {'kind': 'fire', 'unit': gun['id'], 'target': plane['id']}, roll=lambda: 6)
        self.assertEqual(result['effects'][-1]['kind'], 'anti_air')
        self.assertEqual(result['effects'][-1]['battery'], 'light')
        self.assertEqual(result['last_combat']['kind'], 'Anti-aircraft fire')

    def test_air_effect_is_visible_without_revealing_hidden_ground_source(self):
        state = self.night_battle()
        state['fog_of_war'] = True
        radar = next(u for u in state['units'] if u['kind'] == 'radar')
        radar.update(side='us', pos=[12, 10])
        state['units'] = [radar]
        self.assertTrue(sees_hex(state, 'us', [12, 15], 'air'))
        self.assertFalse(sees_hex(state, 'us', [12, 15]))
        event = effects.record_effect(state, 'anti_air', [[12, 15]], layer='air',
                                      origin=[29, 0], origin_layer='ground', hit=False)
        before = copy.deepcopy(event)
        safe = effects.visible_effects(state, 'us', [event])
        self.assertEqual(len(safe), 1)
        self.assertNotIn('origin', safe[0])
        self.assertNotIn('origin_layer', safe[0])
        self.assertEqual(event, before)
        event['layer'] = 'ground'
        self.assertEqual(effects.visible_effects(state, 'us', [event]), [])

    def test_replay_uses_recorded_sight_and_hides_later_revealed_source(self):
        state = self.night_battle()
        state['fog_of_war'] = True
        event = effects.record_effect(state, 'anti_air', [[12, 15]], layer='air',
                                      origin=[12, 10], origin_layer='ground', hit=True)
        frames = ({'visible_hexes': [], 'visible_air_hexes': [[12, 15]]},
                  {'visible_hexes': [], 'visible_air_hexes': [[12, 15]]})
        safe = effects.visible_effects(state, 'us', [event], frames)
        self.assertEqual(safe[0]['positions'], [[12, 15]])
        self.assertNotIn('origin', safe[0])
        visible = copy.deepcopy(frames[0])
        visible['units'] = [{'id': 'seen-aa', 'pos': [12, 10]}]
        self.assertEqual(effects.visible_effects(state, 'us', [event], (visible, frames[1]))[0]['origin'], [12, 10])

    def test_visible_ground_hex_does_not_disclose_concealed_firing_unit(self):
        state = self.night_battle()
        state['fog_of_war'] = True
        scout = next(u for u in state['units'] if u['side'] == 'us' and u['kind'] == 'fighter')
        gun = next(u for u in state['units'] if u['kind'] == 'aa_gun')
        scout.update(pos=[12, 12], night_ground_sight=2)
        gun.update(pos=[12, 10], night_flash=False)
        state['units'] = [scout, gun]
        state['battlefield']['map'][10][12] = 'woods'
        self.assertTrue(sees_hex(state, 'us', gun['pos']))
        self.assertFalse(sees_hex(state, 'us', gun['pos'], True))
        event = effects.record_shot_effect(state, gun, scout, False)
        safe = effects.visible_effects(state, 'us', [event])[0]
        self.assertNotIn('origin', safe)
        self.assertNotIn('origin_unit', safe)
        gun['night_flash'] = True
        safe = effects.visible_effects(state, 'us', [event])[0]
        self.assertEqual(safe['origin'], gun['pos'])
        self.assertNotIn('origin_unit', safe)


if __name__ == '__main__':
    unittest.main()
