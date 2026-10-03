"""Preparation is private, bounded, resumable, and commits dice exactly once."""
import copy
import json
import tempfile
import unittest
from collections import deque
from unittest.mock import patch

from ww2_tactics import deployment, fieldworks, buildings
from ww2_tactics.engine import initial, apply, options, terrain, distance
from ww2_tactics.visibility import public_state, update_intel
from ww2_tactics.computer import play_turn
from ww2_tactics.order_history import perform, status
from ww2_web import create_app


class DeploymentTests(unittest.TestCase):
    def battle(self, name='shingle_cove'):
        s=initial(name,'dsl');s['ready']=True
        return s

    def test_catalog_defaults_and_routes(self):
        for name, size, count in [('shingle_cove',(10,12),16),('breakwater',(22,22),30)]:
            s=self.battle(name);b=s['battlefield']
            self.assertEqual((b['width'],b['height']),size);self.assertEqual(len(s['units']),count)
            self.assertEqual(len({u['id'] for u in s['units']}),count)
            standing=[u for u in s['units'] if not u.get('carrier_id')]
            self.assertEqual(len(standing),len({tuple(u['pos']) for u in standing}))
            for u in standing:
                self.assertIn(u['pos'],deployment.zone(s,u['side']))
                if u['kind']=='at_gun':continue
                seen={tuple(u['pos'])};q=deque(seen)
                while q:
                    for p in fieldworks.neighbors(s,q.popleft()):
                        if tuple(p) not in seen and fieldworks.movement(u,terrain(*p,s))[0]:
                            seen.add(tuple(p));q.append(tuple(p))
                if u['kind']=='landing_craft':
                    self.assertTrue(any(p[1]==b['deployment_rules']['shore'] for p in seen))
                else:self.assertIn(tuple(b['objective']),seen)
            self.assertEqual(s['round'],1)
            self.assertTrue(all(not options(s,u)['moves'] and not options(s,u)['targets'] for u in s['units']))
            with self.assertRaises(ValueError):initial(name,'classic')

    def test_no_existing_map_or_save_opts_in(self):
        for name in ('village','omaha','tidal_gate','fubar','kharkov','relay_crossing','dunkirk'):
            self.assertNotIn('deployment_version',initial(name,'dsl'))

    def test_move_boat_and_passenger_is_free_and_owned(self):
        s=self.battle();before=copy.deepcopy(s);boat=s['units'][0];passenger=s['units'][1]
        s=apply(s,'us',dict(kind='deploy_unit',unit=boat['id'],pos=[2,11]))
        self.assertEqual(s['units'][0]['pos'],[2,11]);self.assertEqual(s['units'][1]['pos'],[2,11])
        self.assertEqual([u['ap'] for u in s['units']],[u['ap'] for u in before['units']])
        self.assertEqual(before['units'][0]['pos'],[1,9])
        for side,uid,pos in [('de',boat['id'],[1,1]),('us',passenger['id'],[3,11]),('us',boat['id'],[3,3]),('us',boat['id'],[3,9])]:
            with self.assertRaises(ValueError):apply(s,side,dict(kind='deploy_unit',unit=uid,pos=pos))

    def test_fixed_gun_can_place_but_not_move_after_start(self):
        s=self.battle();gun=next(u for u in s['units'] if u['kind']=='at_gun')
        s=apply(s,'de',dict(kind='deploy_unit',unit=gun['id'],pos=[0,1]))
        s=apply(s,'us',dict(kind='deploy_lock'));s=apply(s,'de',dict(kind='deploy_lock'))
        s['turn']='de';gun=next(u for u in s['units'] if u['kind']=='at_gun')
        self.assertFalse(options(s,gun)['moves']);self.assertTrue(gun['overwatch'])

    def test_budgets_spacing_terrain_toggle_and_validation(self):
        s=self.battle()
        for p in ([0,3],[3,3]):s=apply(s,'de',dict(kind='deploy_bunker',pos=p))
        for order in [dict(kind='deploy_bunker',pos=[6,3]),dict(kind='deploy_fire',pos=[2,8]),dict(kind='deploy_unit',unit=s['units'][0]['id'],pos=[True,9]),dict(kind='deploy_fire',pos=[2.0,3])]:
            with self.assertRaises(ValueError):apply(s,'de' if order['kind']=='deploy_bunker' else 'us',order)
        s=apply(s,'de',dict(kind='deploy_bunker',pos=[0,3]))
        self.assertEqual(s['deployment']['bunkers'],[[3,3]])
        with self.assertRaises(ValueError):apply(s,'de',dict(kind='deploy_bunker',pos=[4,3]))
        with self.assertRaises(ValueError):apply(s,'de',dict(kind='deploy_bunker',pos=[2,2]))
        s=apply(s,'us',dict(kind='deploy_fire',pos=[0,3]))
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='deploy_fire',pos=[1,3]))
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='deploy_bunker',pos=[1,1]))
        with self.assertRaises(ValueError):apply(s,'de',dict(kind='deploy_fire',pos=[1,1]))

    def test_reset_only_own_plan_and_units(self):
        s=self.battle();s=apply(s,'de',dict(kind='deploy_bunker',pos=[0,3]))
        s=apply(s,'us',dict(kind='deploy_unit',unit=s['units'][0]['id'],pos=[0,11]))
        s=apply(s,'us',dict(kind='deploy_fire',pos=[1,3]));s=apply(s,'us',dict(kind='deploy_reset'))
        self.assertEqual(s['units'][0]['pos'],[1,9]);self.assertEqual(s['deployment']['fire'],[])
        self.assertEqual(s['deployment']['bunkers'],[[0,3]])

    def test_planning_projection_invariant_to_enemy_decisions(self):
        s=self.battle();a=public_state(s,'us')
        s=apply(s,'de',dict(kind='deploy_bunker',pos=[0,3]));enemy=next(u for u in s['units'] if u['side']=='de')
        s=apply(s,'de',dict(kind='deploy_unit',unit=enemy['id'],pos=[0,1]));update_intel(s)
        b=public_state(s,'us');a.pop('revision');b.pop('revision');self.assertEqual(a,b)
        self.assertTrue(all(u['side']=='us' for u in b['units']));self.assertEqual(b['deployment']['bunkers'],[])
        self.assertNotIn('bunker',json.dumps(b['map']));self.assertEqual(b['visible_hexes'],[])
        before=public_state(s,'de');s=apply(s,'us',dict(kind='deploy_fire',pos=[1,1]));after=public_state(s,'de')
        before.pop('revision');after.pop('revision');self.assertEqual(before,after)
        self.assertEqual(public_state(s,'de')['map'][3][0],'bunker')
        self.assertEqual(s['battlefield']['map'][3][0],'field')

    def test_both_lock_once_without_ap_or_round_advance(self):
        s=self.battle();aps=[u['ap'] for u in s['units']]
        s=apply(s,'us',dict(kind='deploy_lock'))
        self.assertTrue(deployment.active(s));self.assertFalse(status(s,'us')['can_undo'])
        for kind in ('deploy_reset','deploy_lock','move','end','undo','observe'):
            with self.assertRaises(ValueError):perform(s,'us',dict(kind=kind))
        s=apply(s,'de',dict(kind='deploy_lock'))
        self.assertFalse(deployment.active(s));self.assertEqual((s['round'],s['turn']),(1,'us'))
        self.assertEqual([u['ap'] for u in s['units']],aps)
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='deploy_lock'))

    def test_dice_suppression_bunker_absorption_and_fog_safe_report(self):
        s=self.battle();troops=[u for u in s['units'] if u['side']=='de']
        troops[0]['pos']=[0,3];troops[1]['pos']=[1,3];troops[2]['pos']=[1,4]
        troops[2]['hp']=1
        s=apply(s,'de',dict(kind='deploy_bunker',pos=[0,3]));s=apply(s,'us',dict(kind='deploy_fire',pos=[0,3]))
        original={u['id']:u['hp'] for u in s['units']}
        s=apply(s,'de',dict(kind='deploy_lock'));s=apply(s,'us',dict(kind='deploy_lock'),roll=lambda:6)
        troops=[u for u in s['units'] if u['side']=='de']
        self.assertTrue(troops[0]['pinned']);self.assertFalse(troops[0]['overwatch'])
        self.assertEqual(troops[0]['hp'],original[troops[0]['id']]);self.assertEqual(troops[1]['hp'],original[troops[1]['id']]-1)
        self.assertEqual(troops[2]['hp'],1);self.assertEqual(buildings.condition(s,[0,3]),'intact')
        self.assertEqual(s['prebattle_impacts'],[dict(aim=[0,3],impact=[0,3],roll=6)])
        view=public_state(s,'us');self.assertNotIn('bunkers',view['deployment']);self.assertNotIn('fire',view['deployment'])
        self.assertEqual(view['combat_history'],[])
        self.assertNotIn(troops[0]['id'],{u['id'] for u in view['units']})

    def test_scatter_and_no_reroll(self):
        s=self.battle();s=apply(s,'us',dict(kind='deploy_fire',pos=[0,0]));s=apply(s,'de',dict(kind='deploy_lock'))
        dice=iter([1,6]);s=apply(s,'us',dict(kind='deploy_lock'),roll=lambda:next(dice))
        self.assertEqual(distance([0,0],s['prebattle_impacts'][0]['impact']),1)
        with self.assertRaises(ValueError):perform(s,'us',dict(kind='undo'))
        snap=copy.deepcopy(s['prebattle_impacts']);s=perform(s,'us',dict(kind='end'))
        self.assertEqual(s['prebattle_impacts'],snap)

    def test_computer_plan_does_not_read_enemy_positions_or_fire(self):
        s=self.battle('breakwater');s['ai_side']='de';t=copy.deepcopy(s)
        for u in t['units']:
            if u['side']=='us':u['pos']=[21,21]
        t['deployment']['fire']=[[0,0],[4,4]]
        a=deployment.prepare_computer(s);b=deployment.prepare_computer(t)
        self.assertEqual(a['deployment']['bunkers'],b['deployment']['bunkers'])
        self.assertEqual([u for u in a['units'] if u['side']=='de'],[u for u in b['units'] if u['side']=='de'])

    def test_computer_both_sides_on_both_maps_finish_setup_and_opening_turn(self):
        for name in deployment.IDS:
            for ai in ('us','de'):
                with self.subTest(name=name,ai=ai):
                    s=self.battle(name);s['ai_side']=ai;s=play_turn(s,roll=lambda:6)
                    self.assertTrue(deployment.active(s));self.assertTrue(s['deployment']['locked'][ai])
                    human='de' if ai=='us' else 'us'
                    s=apply(s,human,dict(kind='deploy_lock'),roll=lambda:6)
                    if ai=='de':s=apply(s,'us',dict(kind='end'))
                    s=play_turn(s,roll=lambda:6)
                    self.assertEqual(s['turn'],human);self.assertTrue(all(u['ap']>=0 for u in s['units']))
                    standing=[tuple(u['pos']) for u in s['units'] if u['hp']>0 and not u.get('carrier_id')]
                    self.assertEqual(len(standing),len(set(standing)))


class DeploymentApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.app=create_app(self.tmp.name+'/test.sqlite');self.client=self.app.test_client()
    def tearDown(self):self.tmp.cleanup()
    def create(self,mode='human'):
        payload=self.client.post('/api/match',json=dict(scenario='shingle_cove',ruleset='dsl',opponent=mode)).get_json()
        return payload['code'],{'Authorization':'Bearer '+payload['token']}
    def get(self,code,auth):return self.client.get('/api/match/'+code,headers=auth).get_json()
    def send(self,code,auth,**order):
        return self.client.post('/api/match/'+code,headers=auth,json=dict(revision=self.get(code,auth)['revision'],**order))
    def test_independent_two_player_setup_and_stale_revision(self):
        code,us=self.create();s=self.get(code,us);self.assertFalse(s['ready'])
        self.assertEqual(self.send(code,us,kind='deploy_fire',pos=[0,0]).status_code,200)
        self.assertEqual(self.client.post('/api/match/'+code,headers=us,json=dict(revision=s['revision'],kind='deploy_lock')).status_code,409)
        self.send(code,us,kind='deploy_lock')
        guest=self.client.post('/api/match/'+code+'/join',json={}).get_json();de={'Authorization':'Bearer '+guest['token']}
        s=self.get(code,de);self.assertTrue(s['ready']);self.assertEqual(s['deployment']['fire'],[])
        self.assertEqual(self.send(code,de,kind='deploy_bunker',pos=[0,3]).status_code,200)
        self.assertEqual(self.send(code,de,kind='deploy_lock').status_code,200)
        s=self.get(code,us);self.assertEqual(s['deployment']['phase'],'battle');self.assertEqual(s['round'],1)
        self.assertEqual(self.send(code,us,kind='deploy_fire',pos=[0,0]).status_code,400)
        self.assertEqual(self.client.get('/api/match/'+code).status_code,403)
    def test_save_restore_private_plan_and_ai_army_swap(self):
        code,us=self.create('computer');self.send(code,us,kind='deploy_fire',pos=[0,0]);s=self.get(code,us)
        saved=self.client.post('/api/match/'+code+'/save',headers=us,json={'revision':s['revision']}).get_json()
        restored=self.client.post('/api/restore',json={'code':saved['save_code']})
        self.assertEqual(restored.status_code,201,restored.get_json())
        info=restored.get_json();auth={'Authorization':'Bearer '+info['token']}
        view=self.get(info['code'],auth);self.assertEqual(view['deployment'],s['deployment'])
        self.send(code,us,kind='deploy_lock');s=self.get(code,us)
        response=self.client.post('/api/match/'+code+'/rematch',headers=us,json=dict(revision=s['revision'],operation='propose',scenario='breakwater',ruleset='dsl',swap=True))
        self.assertEqual(response.status_code,200);view=response.get_json()
        self.assertEqual(view['side'],'de');self.assertTrue(view['deployment']['locked']['us']);self.assertFalse(view['deployment']['locked']['de'])
