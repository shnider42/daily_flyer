"""Current-only full-roster operation, command authority and domain integration."""
import copy
import tempfile
import unittest

from ww2_web import create_app
from ww2_tactics import airborne, cooperative, domains, fubar, naval, fieldworks
from ww2_tactics.engine import initial, apply, options, terrain
from ww2_tactics.scenarios import SCENARIOS, TILES, catalog, get_scenario
from ww2_tactics.visibility import active, sight_calculations, view
from ww2_tactics import signals
from ww2_tactics.computer import play_turn

MAP = 'current:worlds_collide'


class WorldsCollideRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = initial(MAP, 'dsl')

    def battle(self):
        state = copy.deepcopy(self.template)
        state.update(ready=True, fog_of_war=False)
        return state

    def test_current_only_and_larger_than_every_previous_map(self):
        self.assertNotIn('worlds_collide', {b['id'] for b in catalog()})
        self.assertIn(MAP, {b['id'] for b in catalog('current')})
        with self.assertRaises(ValueError): get_scenario('worlds_collide')
        with self.assertRaises(ValueError): initial(MAP, 'classic')
        board = self.template['battlefield']
        self.assertEqual((board['width'], board['height']), (64, 56))
        self.assertGreater(board['width']*board['height'], max(b['width']*b['height'] for b in SCENARIOS.values())*2)
        for flag in ('signals_version','fire_control_version','logistics_version','airborne_version',
                     'joint_ops_version','ground_stack_version','layered_occupancy_version'):
            self.assertEqual(self.template[flag], 1)

    def test_every_authored_unit_class_and_terrain_is_present(self):
        previous = {u['kind'] for key in SCENARIOS for u in initial(key, 'dsl')['units']}
        self.assertEqual({u['kind'] for u in self.template['units']}, previous)
        self.assertEqual(len(previous), 32)
        terrain_types = {t for row in self.template['battlefield']['map'] for t in row}
        self.assertEqual(terrain_types, set(TILES.values()) | {'rubble'})
        tanks = {u.get('display_name') for u in self.template['units'] if u['kind']=='tank'}
        self.assertTrue({'Tiger I','Sherman Firefly','Matilda rearguard','Crusader tank',
                         'Captured T-34/76','Captured KV-1 heavy tank','Captured M13/40',
                         'Captured L3 tankette','Sherman','Panzer III','Panzer IV'} <= tanks)

    def test_all_units_have_legal_starts_and_existing_domain_orders(self):
        state = self.battle()
        self.assertEqual(len({u['id'] for u in state['units']}), len(state['units']))
        for unit in state['units']:
            x,y = unit['pos']
            self.assertTrue(0 <= x < 64 and 0 <= y < 56)
            self.assertIn(unit['faction'], {'us','gb'} if unit['side']=='us' else {'de','jp'})
            if not active(unit): continue
            self.assertFalse(domains.blocked(state,unit,unit['pos']), unit['id'])
            if unit['kind'] in domains.SHIPS | {'landing_craft'}:
                self.assertEqual(terrain(x,y,state), 'water', unit['id'])
            state['turn'] = unit['side']
            legal = options(state,unit)
            if unit['base_ap'] and unit['kind'] not in {'aa_gun','at_gun','flak'}:
                self.assertTrue(legal['moves'],unit['id'])

    def test_five_selectable_platoons_and_host_owned_command_reserves(self):
        state = self.battle()
        cooperative.initialize(state,dict(control_size='platoons',side='us'),'host','Host')
        for side in ('us','de'):
            selectable = [g for g in state['coop']['groups'].values() if g['side']==side and not g['command']]
            self.assertEqual({g['id'] for g in selectable}, {side+':'+p for p in 'ABCDE'})
        command = state['coop']['groups']['us:command']
        self.assertEqual(command['owner'],'host')
        self.assertEqual(len(airborne.reserves(state,'us')),4)
        self.assertTrue(all(u['id'] in command['units'] for u in airborne.reserves(state,'us')))
        self.assertFalse(airborne.reserves(state,'de'))
        for passenger in [u for u in state['units'] if u.get('carrier_id')]:
            self.assertEqual(cooperative.group_for(state,passenger['id'])['id'],
                             cooperative.group_for(state,passenger['carrier_id'])['id'])

    def test_new_operation_defaults_to_five_platoons_and_unit_control_still_works(self):
        state = self.battle()
        cooperative.initialize(state,{},'host','Host')
        self.assertEqual(state['coop']['control_size'],'platoons')
        self.assertEqual(len([g for g in state['coop']['groups'].values() if g['side']=='us' and not g['command']]),5)
        state=self.battle();cooperative.initialize(state,dict(control_size='units'),'host','Host')
        self.assertEqual(state['coop']['control_size'],'units')

    def test_score_target_is_forty_and_all_six_zones_can_score(self):
        state = self.battle()
        ships = [u for u in state['units'] if u['side']=='us' and u['kind']=='destroyer'][:2]
        troops = [u for u in state['units'] if u['side']=='us' and u['kind'] in {'squad','engineer'} and active(u)][:4]
        enemy = next(u for u in state['units'] if u['side']=='de' and u['kind']=='squad')
        enemy['pos']=[63,0]
        state['units'] = ships + troops + [enemy]
        for unit, point in zip(ships+troops,state['battlefield']['joint_objectives']): unit['pos'] = point['pos'].copy()
        self.assertEqual([p['owner'] for p in fubar.controls(state)], ['us']*6)
        state['joint_score']['us'] = 9
        out = apply(state,'us',dict(kind='end'),roll=lambda:1)
        self.assertEqual(out['joint_score']['us'],15); self.assertIsNone(out['winner'])
        state['joint_score']['us'] = 34
        self.assertEqual(apply(state,'us',dict(kind='end'),roll=lambda:1)['winner'],'us')

    def test_aircraft_do_not_capture_and_round_limit_uses_the_saved_map(self):
        state = self.battle()
        plane = next(u for u in state['units'] if u['kind']=='fighter' and u['side']=='us')
        enemy = next(u for u in state['units'] if u['kind']=='squad' and u['side']=='de')
        enemy['pos']=[63,0]
        state['units'] = [plane, enemy]
        state['units'][0]['pos'] = state['battlefield']['joint_objectives'][-1]['pos'].copy()
        self.assertTrue(all(p['owner'] is None for p in fubar.controls(state)))
        state.update(turn='de',round=64);state['joint_score']={'us':8,'de':7}
        self.assertEqual(apply(state,'de',dict(kind='end'),roll=lambda:1)['winner'],'us')
        state['joint_score']={'us':8,'de':8}
        self.assertEqual(apply(state,'de',dict(kind='end'),roll=lambda:1)['winner'],'de')

    def test_coalition_profiles_keep_naval_and_heavy_armor_asymmetry(self):
        state = self.battle()
        destroyers = {side:next(u for u in state['units'] if u['kind']=='destroyer' and u['side']==side) for side in ('us','de')}
        self.assertLess(destroyers['us']['torpedo_range'],destroyers['de']['torpedo_range'])
        self.assertGreater(destroyers['us']['base_ap'],destroyers['de']['base_ap'])
        tiger = next(u for u in state['units'] if u.get('variant')=='tiger')
        firefly = next(u for u in state['units'] if u.get('variant')=='firefly')
        self.assertGreater(tiger['armor'],firefly['armor'])
        self.assertEqual(fieldworks.movement(tiger,'field')[1],3)
        self.assertFalse(naval.passable(destroyers['de'],'bridge'))

    def test_bounded_computer_batches_work_for_both_coalitions(self):
        for side in ('us','de'):
            state = copy.deepcopy(self.template)
            cooperative.initialize(state,dict(control_size='platoons'),'host','Host')
            state['coop']['phase']='battle'
            for group in state['coop']['groups'].values(): group['owner']=None
            state.update(ready=True,turn=side,ai_side=side)
            out = play_turn(state,roll=lambda:1,max_orders=2)
            self.assertGreater(out['revision'],0)
            self.assertEqual(out['battlefield']['id'],MAP)
            for unit in out['units']:
                if active(unit): self.assertFalse(domains.blocked(out,unit,unit['pos']))

    def test_map_sight_index_matches_the_original_scan_for_every_hex_and_order(self):
        state = copy.deepcopy(self.template)
        state['ready'] = True
        scout = next(u for u in state['units'] if u['side']=='us' and u['kind']=='scout')
        scout.update(pos=[34,24],observing=True)
        enemy = next(u for u in state['units'] if u['side']=='de' and u['kind']=='sniper')
        enemy.update(pos=[36,25],camouflaged=True)
        state['smoke']=[dict(pos=[36,24],ttl=2)]
        state['recon']=[dict(side='us',pos=[8,27],radius=3,ttl=2)]
        unindexed = copy.deepcopy(state)
        unindexed['battlefield'].pop('sight_index_version')
        for side in ('us','de'):
            state['turn']=unindexed['turn']=side
            outputs=[]
            for candidate in (state,unindexed):
                with sight_calculations(candidate):
                    outputs.append((view(candidate,side),signals.public_views(candidate,side),
                        {u['id']:options(candidate,u) for u in candidate['units'] if u['side']==side}))
            self.assertEqual(outputs[0],outputs[1],side)

    def test_score_result_names_the_correct_target(self):
        from ww2_tactics.battle_setup import result_summary
        state = self.battle();state.update(winner='us');state['joint_score']['us']=40
        self.assertEqual(result_summary(state)['reason'],'40 control points secured the battle.')

    def test_flight_sight_refreshes_at_each_cell_and_never_survives_an_order(self):
        state = copy.deepcopy(self.template)
        state['ready'] = True
        unindexed = copy.deepcopy(state)
        unindexed['battlefield'].pop('sight_index_version')
        fighter = next(u for u in state['units'] if u['side']=='us' and u['kind']=='fighter')
        for destination in ([41,33],[41,30],[41,27]):
            action = dict(kind='move',unit=fighter['id'],pos=destination)
            state = apply(state,'us',action,roll=lambda:1)
            unindexed = apply(unindexed,'us',action,roll=lambda:1)
            comparable = copy.deepcopy(state)
            comparable['battlefield'].pop('sight_index_version')
            self.assertEqual(comparable,unindexed)
        state = apply(state,'us',dict(kind='end'),roll=lambda:1)
        unindexed = apply(unindexed,'us',dict(kind='end'),roll=lambda:1)
        state['battlefield'].pop('sight_index_version')
        self.assertEqual(state,unindexed)


class WorldsCollideAPITests(unittest.TestCase):
    def test_coop_catalog_and_save_restore_use_current_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = create_app(tmp+'/games.sqlite').test_client()
            data = client.get('/api/scenarios').json
            self.assertEqual(len(data['scenarios']),24); self.assertEqual(len(data['current_scenarios']),25)
            result = client.post('/api/match',json=dict(scenario=MAP,ruleset='dsl',opponent='cooperative',control_size='platoons',side='us'))
            self.assertEqual(result.status_code,201,result.json)
            seat = result.json; headers={'Authorization':'Bearer '+seat['token']}; route='/api/match/'+seat['code']
            state = client.get(route,headers=headers).json
            self.assertEqual(state['scenario']['id'],MAP)
            self.assertEqual(len([g for g in state['coop']['groups'] if g['side']=='us' and not g['command']]),5)
            self.assertNotIn('platoon_intel',state);self.assertNotIn('intel',state)
            self.assertEqual(state['scenario']['joint_score_target'],40)
            self.assertEqual(state['scenario']['factions'],{'us':'Americans & British','de':'Germans & Japanese'})
            # Solo checkpoint restoration must not recreate or reinterpret the roster.
            solo = client.post('/api/match',json=dict(scenario=MAP,ruleset='dsl',opponent='computer',side='us')).json
            headers={'Authorization':'Bearer '+solo['token']};route='/api/match/'+solo['code']
            before=client.get(route,headers=headers).json
            saved=client.post(route+'/save',headers=headers,json=dict(revision=before['revision']))
            self.assertEqual(saved.status_code,200,saved.json)
            restored=client.post('/api/restore',json=dict(code=saved.json['save_code']))
            self.assertEqual(restored.status_code,201,restored.json)
            token=restored.json
            after=client.get('/api/match/'+token['code'],headers={'Authorization':'Bearer '+token['token']}).json
            for key in ('units','legal','scenario','joint_score','joint_control','edition','edition_version','rule_manifest'):
                self.assertEqual(before[key],after[key],key)


if __name__ == '__main__': unittest.main()
