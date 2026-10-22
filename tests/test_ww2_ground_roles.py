import copy
import json
import tempfile
import unittest

from ww2_web import create_app
from ww2_tactics import ground_roles, order_history
from ww2_tactics.engine import initial, apply, options, watchers, preview_threats
from ww2_tactics.visibility import public_state, view, update_intel, unit_visible_ids
from ww2_tactics.operations import sight_range
from ww2_tactics.scenarios import catalog, get_scenario
from ww2_tactics.computer import choose_order, play_turn, objective_costs


class GroundRoleTests(unittest.TestCase):
    def battle(self,name='village_2',side='us'):
        s=initial('current:'+name,'dsl');s.update(ready=True,turn=side)
        return s

    def unit(self,s,kind,side='us',group=None):
        return next(u for u in s['units'] if u['kind']==kind and u['side']==side and (group is None or u['platoon']==group))

    def byid(self,s,u):return next(v for v in s['units'] if v['id']==u['id'])

    def order(self,s,u,kind,die=6,**kw):
        return apply(s,s['turn'],dict(kind=kind,unit=u['id'],**kw),roll=lambda:die)

    def arena(self,gap=4):
        s=self.battle(side='de')
        s['battlefield']['map']=[['field']*9 for _ in range(11)]
        for u in s['units']:u.update(hp=0,ap=0)
        mg=self.unit(s,'mg','de');mg.update(hp=3,ap=3,pos=[1,5])
        target=self.unit(s,'squad');target.update(hp=3,ap=2,pos=[1+gap,5])
        scout=self.unit(s,'scout','de');scout.update(hp=2,ap=0,pos=[1+gap,6])
        update_intel(s)
        return s,mg,target,scout

    def test_new_compact_maps_and_rosters_are_current_only(self):
        for name,size,total in [('village_2',(9,11),16),('stonebridge_2',(11,13),18)]:
            s=self.battle(name);b=s['battlefield']
            self.assertEqual((b['width'],b['height']),size)
            self.assertEqual(len(s['units']),total)
            self.assertEqual(len({u['id'] for u in s['units']}),total)
            self.assertEqual(s['ground_roles_version'],1)
            self.assertTrue(all(u['display_name'] and u['role_orders'] for u in s['units']))
            self.assertEqual(s['support'],{'us':0,'de':0})
            costs=objective_costs(s)
            self.assertTrue(all(tuple(u['pos']) in costs for u in s['units']))
            self.assertIn('officer_recovery',s['rule_manifest']['systems'])
            with self.assertRaises(ValueError):get_scenario(name)
            with self.assertRaises(ValueError):initial('current:'+name,'classic')
        self.assertEqual(len(catalog('current')),35)
        self.assertEqual(len(catalog()),24)

    def test_role_loadouts_and_server_rejects_unavailable_orders(self):
        cases={'squad':['smoke','rally','observe','inspire'],
               'scout':['grenade','overwatch','assault'],
               'engineer':['rally','overwatch','repair_tank','demolition','breach','bridge_gap'],
               'mortar':['fire','overwatch','rally','smoke','mortar_fire'],
               'leader':['overwatch','assault','grenade','barrage'],
               'commander':['artillery','field_recon','radio_update','barrage']}
        for kind,denied in cases.items():
            s=self.battle();u=self.unit(s,kind);u['ap']=5
            for order in denied:
                with self.assertRaisesRegex(ValueError,'role does not have'):
                    self.order(s,u,order,pos=[4,4],target=self.unit(s,'squad','de')['id'])
        s=self.battle();rifle=self.unit(s,'squad');scout=self.unit(s,'scout');eng=self.unit(s,'engineer')
        self.assertEqual((rifle['grenades'],rifle['smoke']),(1,0))
        self.assertEqual((scout['grenades'],scout['smoke']),(0,2))
        self.assertEqual((eng['grenades'],eng['smoke']),(2,2))
        self.assertNotIn('spot_fire',self.unit(s,'scout','de')['role_orders'])
        self.assertIn('bridge_gap',self.unit(self.battle('stonebridge_2'),'engineer')['role_orders'])

    def test_mg_range_boundaries_and_suppression_never_damages(self):
        for gap in (1,2,6,7):
            for die in (2,3):
                s,mg,t,_=self.arena(gap);before=copy.deepcopy(s);legal=options(s,mg)
                self.assertEqual(t['id'] in legal['suppress'],2<=gap<=6)
                self.assertEqual(legal['targets'],[]);self.assertFalse(legal['overwatch'])
                if gap in (1,7):
                    with self.assertRaises(ValueError):self.order(s,mg,'suppress',target=t['id'],die=die)
                else:
                    out=self.order(s,mg,'suppress',target=t['id'],die=die)
                    self.assertEqual(self.byid(out,t)['hp'],3)
                    self.assertEqual(self.byid(out,t)['pinned'],die>=3)
                    self.assertEqual(self.byid(out,mg)['ap'],1)
                    self.assertEqual(out['last_combat']['threshold'],3)
                self.assertEqual(s,before)

    def test_mg_needs_own_platoon_spotting_clear_lane_and_ready_target(self):
        s,mg,t,scout=self.arena(6)
        self.assertEqual(sight_range(s,mg),4)
        self.assertIn(t['id'],options(s,mg)['suppress'])
        scout['platoon']='B'
        self.assertNotIn(t['id'],unit_visible_ids(s,mg));self.assertFalse(options(s,mg)['suppress'])
        scout['platoon']='A';s['smoke']=[dict(pos=[4,5],ttl=2)]
        self.assertFalse(options(s,mg)['suppress']);s['smoke']=[]
        for changes in (dict(pinned=True),dict(armor=2),dict(hp=0)):
            saved=copy.deepcopy(t);t.update(changes)
            self.assertFalse(options(s,mg)['suppress']);t.clear();t.update(saved)
        mg['ap']=1;self.assertFalse(options(s,mg)['suppress'])

    def test_mg_cannot_fire_or_react_even_with_a_forged_stance(self):
        s,mg,t,_=self.arena(2)
        for kind in ('fire','overwatch','grenade','assault','rally'):
            with self.assertRaisesRegex(ValueError,'role does not have'):self.order(s,mg,kind,target=t['id'])
        mg['overwatch']=True
        self.assertEqual(watchers(s,t,t['pos']),[])
        self.unit(s,'scout','de')['hp']=0
        seen={u['id'] for u in s['units']}
        self.assertFalse(preview_threats(s,t,[2,5],seen))
        self.assertTrue(preview_threats(s,t,[3,5],seen))

    def test_browning_retains_direct_fire_overwatch_and_shorter_suppression(self):
        s,mg,t,scout=self.arena(4)
        mg['side']='us';t['side']='de';scout['side']='us';s['turn']='us'
        us=self.unit(self.battle(),'mg')
        for key in ('role_orders','suppress_min','suppress_range','suppression','range'):mg[key]=us[key]
        legal=options(s,mg)
        self.assertTrue(legal['targets']);self.assertTrue(legal['overwatch']);self.assertIn(t['id'],legal['suppress'])
        t['pos']=[6,5];self.assertFalse(options(s,mg)['suppress']);self.assertTrue(options(s,mg)['targets'])

    def test_recovery_waits_for_a_whole_own_turn_and_preserves_save_state(self):
        s=self.battle(side='de');u=self.unit(s,'squad');u['pinned']=True
        s=apply(s,'de',dict(kind='end'));u=self.byid(s,u)
        self.assertTrue(u['role_pinned_start']);self.assertTrue(u['pinned'])
        self.assertFalse(options(s,u)['rally']);self.assertFalse(options(s,u)['moves'])
        s=json.loads(json.dumps(s));s=apply(s,'us',dict(kind='end'))
        self.assertFalse(self.byid(s,u)['pinned'])
        s=self.battle();u=self.unit(s,'squad');u['pinned']=True
        s=apply(s,'us',dict(kind='end'));self.assertTrue(self.byid(s,u)['pinned'])
        s=apply(s,'de',dict(kind='end'));s=apply(s,'us',dict(kind='end'))
        self.assertFalse(self.byid(s,u)['pinned'])

    def test_recovery_does_not_erase_incoming_end_turn_pin(self):
        s=self.battle();u=self.unit(s,'squad');u.update(pinned=True,role_pinned_start=True,pos=[0,9])
        s['barrages']=[dict(side='de',pos=u['pos'],area=[u['pos']],ttl=1)]
        out=apply(s,'us',dict(kind='end'),roll=lambda:6)
        self.assertTrue(self.byid(out,u)['pinned'])

    def test_officer_rally_preserves_ap_and_resets_recovery_cycle(self):
        s=self.battle();captain=self.unit(s,'leader');u=self.unit(s,'squad')
        captain.update(pos=[4,7],ap=3);u.update(pos=[5,7],pinned=True,role_pinned_start=True,ap=2)
        self.assertIn(u['id'],options(s,captain)['inspire'])
        out=self.order(s,captain,'inspire')
        self.assertEqual((self.byid(out,u)['pinned'],self.byid(out,u)['ap']),(False,2))
        self.assertEqual(self.byid(out,captain)['ap'],2)
        u=self.byid(out,u);self.assertFalse(u['role_pinned_start'])
        u['pinned']=True;out=apply(out,'us',dict(kind='end'))
        self.assertTrue(self.byid(out,u)['pinned'])

    def test_captain_is_platoon_local_major_crosses_platoons_with_radius_two(self):
        s=self.battle('stonebridge_2');c=self.unit(s,'leader',group='A');m=self.unit(s,'commander');u=self.unit(s,'squad',group='B')
        c['pos']=[4,9];m['pos']=[4,9];u.update(pos=[5,9],pinned=True)
        self.assertNotIn(u['id'],options(s,c)['inspire']);self.assertIn(u['id'],options(s,m)['inspire'])
        u['pos']=[6,9];self.assertIn(u['id'],options(s,m)['inspire'])
        u['pos']=[7,9];self.assertNotIn(u['id'],options(s,m)['inspire'])

    def test_officers_and_scouts_self_rally_but_do_not_auto_recover(self):
        for kind in ('leader','commander','scout'):
            s=self.battle();u=self.unit(s,kind);u.update(pinned=True,role_pinned_start=True)
            self.assertTrue(options(s,u)['rally'])
            out=self.order(s,u,'rally');self.assertFalse(self.byid(out,u)['pinned'])
            self.assertEqual(self.byid(out,u)['ap'],u['ap']-1)
            out=apply(s,'us',dict(kind='end'));self.assertTrue(self.byid(out,u)['pinned'])

    def test_recovery_marker_private_for_enemy_views_and_no_fog(self):
        s=self.battle();s['fog_of_war']=False
        for u in s['units']:u['role_pinned_start']=True
        for fn in (view,public_state):
            for side in ('us','de'):
                p=fn(s,side);self.assertEqual(p['ground_roles_version'],1)
                for u in p['units']:self.assertEqual('role_pinned_start' in u,u['side']==side)

    def test_ai_uses_suppression_and_officer_recovery(self):
        s,mg,t,_=self.arena(2)
        order=choose_order(s,objective_costs(s),{})
        self.assertEqual(order['kind'],'suppress');self.assertEqual(order['unit'],mg['id'])
        s,mg,t,_=self.arena(4);captain=self.unit(s,'leader','de');captain.update(hp=2,ap=3,pos=[2,5])
        mg['pinned']=True
        order=choose_order(s,objective_costs(s),{});self.assertEqual(order['kind'],'inspire')
        captain['pos']=[4,5]
        self.assertEqual(ground_roles.goal(s,captain,[4,4]),mg['pos'])

    def test_each_map_and_army_computer_turn_produces_legal_orders(self):
        for name in ('village_2','stonebridge_2'):
            for side in ('us','de'):
                s=self.battle(name,side);s['ai_side']=side
                out=play_turn(s,roll=lambda:3,max_orders=6)
                self.assertGreater(out['revision'],s['revision'])
                self.assertTrue(all(u['ap']>=0 for u in out['units']))

    def test_undo_redo_preserves_role_orders_and_recovery_marker(self):
        s=self.battle();s['fog_of_war']=False;u=self.unit(s,'scout');u['pinned']=True
        update_intel(s)
        out=order_history.perform(s,'us',dict(kind='rally',unit=u['id']))
        undone=order_history.perform(out,'us',dict(kind='undo'))
        self.assertTrue(self.byid(undone,u)['pinned'])
        redone=order_history.perform(json.loads(json.dumps(undone)),'us',dict(kind='redo'))
        self.assertEqual(self.byid(redone,u),self.byid(out,u))

    def test_existing_current_and_legacy_maps_keep_their_capabilities(self):
        for name in ('village','current:village','stonebridge','current:stonebridge','current:foy','current:peleliu','current:midway_2'):
            s=initial(name,'dsl');s['ready']=True;self.assertNotIn('ground_roles_version',s)
            self.assertTrue(all('role_orders' not in u for u in s['units']))
            if name=='current:midway_2':continue
            u=self.unit(s,'squad');u['pinned']=True
            self.assertTrue(options(s,u)['rally'])

    def test_save_api_restores_role_map_and_saved_capabilities(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=create_app(tmp+'/game.sqlite').test_client()
            for name in ('village_2','stonebridge_2'):
                seat=c.post('/api/match',json=dict(scenario='current:'+name,ruleset='dsl',opponent='computer')).json
                url='/api/match/'+seat['code'];h={'Authorization':'Bearer '+seat['token']}
                before=c.get(url,headers=h).json
                saved=c.post(url+'/save',headers=h,json={'revision':before['revision']}).json
                restored=c.post('/api/restore',json={'code':saved['save_code']}).json
                after=c.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).json
                for key in ('units','scenario','ground_roles_version','rule_manifest','legal'):
                    self.assertEqual(after[key],before[key],(name,key))


if __name__=='__main__':unittest.main()
