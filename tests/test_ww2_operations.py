"""Shared capabilities, not scenario exceptions: support, observation and area fire."""
import copy
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_tactics import operations, buildings, campaigns, weapons
from ww2_tactics.engine import initial, apply, options, distance, terrain, line_clear
from ww2_tactics.scenarios import SCENARIOS
from ww2_tactics.visibility import active, visible_ids, public_state, update_intel, unit_sees_hex
from ww2_tactics.order_history import perform, status
from ww2_tactics.computer import choose_order, objective_costs


class OperationsTests(unittest.TestCase):
    def field(self, *roles):
        s=initial('frontier','dsl')
        s.update(ready=True,fog_of_war=False,intel={},buildings={},building_intel={'us':{},'de':{}})
        s['battlefield']['map']=[['field']*24 for _ in range(24)]
        s['units']=[campaigns.unit(side,kind,pos,'A',i) for i,(side,kind,pos) in enumerate(roles)]
        weapons.initialize(s)
        return s

    def structure(self,s,pos,condition='intact',kind='building'):
        s['battlefield']['map'][pos[1]][pos[0]]=kind
        s['buildings'][buildings.key(pos)]=condition
        for side in ('us','de'):s['building_intel'][side][buildings.key(pos)]=condition

    def test_all_new_dsl_maps_opt_in_but_old_saves_do_not(self):
        for name in SCENARIOS:
            with self.subTest(map=name):
                s=initial(name,'dsl');self.assertTrue(operations.enabled(s))
                for u in s['units']:
                    if u['kind']=='engineer':self.assertEqual(u['repair_kits'],3)
        self.assertFalse(operations.enabled(initial()))
        s=self.field(('us','tank',[3,5]),('us','commander',[4,5]),('de','squad',[7,5]))
        s.pop('tactics_version');saved=json.loads(json.dumps(s))
        self.assertFalse(options(saved,saved['units'][0])['area_fire'])
        co=saved['units'][1];co['cooldowns']={'artillery':99}
        self.assertTrue(options(saved,co)['artillery'])
        self.assertNotIn('tactics_version',apply(saved,'us',dict(kind='dig',unit=co['id'])))

    def test_commander_independent_cooldowns_and_charge_limits(self):
        for side in ('us','de'):
            with self.subTest(side=side):
                s=self.field((side,'commander',[5,5]),('de' if side=='us' else 'us','squad',[20,20]))
                s['turn']=side;co=s['units'][0];co['ap']=5
                s=apply(s,side,dict(kind='artillery',unit=co['id'],pos=[9,5]))
                co=s['units'][0];self.assertEqual(co['cooldowns']['artillery'],3)
                self.assertFalse(options(s,co)['artillery']);self.assertTrue(options(s,co)['field_recon'])
                s=apply(s,side,dict(kind='field_recon',unit=co['id'],pos=[10,5]))
                for _ in range(2):s=apply(s,s['turn'],dict(kind='end'),roll=lambda:1)
                self.assertEqual(s['round'],2);self.assertFalse(options(s,s['units'][0])['artillery'])
                for _ in range(2):s=apply(s,s['turn'],dict(kind='end'),roll=lambda:1)
                self.assertEqual(s['round'],3);self.assertTrue(options(s,s['units'][0])['artillery'])
                s=apply(s,side,dict(kind='artillery',unit=co['id'],pos=[9,5]))
                s['round']=10;s['units'][0]['ap']=5
                self.assertFalse(options(s,s['units'][0])['artillery'])

    def test_repair_strength_tracks_kit_and_once_per_tank(self):
        s=self.field(('us','engineer',[5,5]),('us','tank',[6,5]),('us','engineer',[6,6]),('de','squad',[20,20]))
        engineer,tank,second,_=s['units'];tank.update(hp=2,immobilized=True,ap=0)
        out=apply(s,'us',dict(kind='repair_tank',unit=engineer['id'],target=tank['id']))
        self.assertEqual(out['units'][0]['repair_kits'],2);self.assertEqual(out['units'][0]['ap'],0)
        self.assertEqual((out['units'][1]['hp'],out['units'][1]['ap']),(3,0));self.assertFalse(out['units'][1]['immobilized'])
        self.assertFalse(options(out,out['units'][2])['repair_tank'])
        out['round']+=1;self.assertIn(tank['id'],options(out,out['units'][2])['repair_tank'])
        tank.update(hp=tank['max_hp'],immobilized=True)
        out=apply(s,'us',dict(kind='repair_tank',unit=engineer['id'],target=tank['id']))
        self.assertEqual(out['units'][1]['hp'],tank['max_hp'])
        for changes in ({'hp':0},{'hp':4,'immobilized':False},{'side':'de','hp':2},{'pos':[12,12],'hp':2}):
            bad=copy.deepcopy(s);bad['units'][1].update(changes)
            self.assertNotIn(tank['id'],options(bad,bad['units'][0])['repair_tank'])
        for changes in ({'ap':1},{'repair_kits':0},{'pinned':True},{'reserve':True},{'carrier_id':'carrier'}):
            bad=copy.deepcopy(s);bad['units'][0].update(changes)
            self.assertFalse(options(bad,bad['units'][0])['repair_tank'])

    def test_repair_undo_redo_restores_supplies_and_tracks(self):
        s=self.field(('us','engineer',[5,5]),('us','tank',[6,5]),('de','squad',[20,20]))
        s['units'][1].update(hp=2,immobilized=True)
        out=perform(s,'us',dict(kind='repair_tank',unit=s['units'][0]['id'],target=s['units'][1]['id']))
        undone=perform(out,'us',dict(kind='undo'))
        self.assertEqual(undone['units'],s['units'])
        self.assertEqual(perform(undone,'us',dict(kind='redo'))['units'],out['units'])

    def test_area_fire_empty_hex_geometry_and_capabilities(self):
        s=self.field(('us','tank',[4,5]),('us','squad',[4,6]),('de','squad',[20,20]))
        tank=s['units'][0];legal=options(s,tank)
        self.assertIn([10,5],legal['area_fire']);self.assertIn([11,5],legal['area_fire']);self.assertNotIn([12,5],legal['area_fire'])
        self.assertEqual(next(a['threshold'] for a in legal['area_fire_details'] if a['pos']==[11,5]),6)
        self.assertFalse(options(s,s['units'][1])['area_fire'])
        self.structure(s,[8,5]);self.assertIn([8,5],options(s,tank)['area_fire'])
        self.assertNotIn([9,5],options(s,tank)['area_fire'])
        s['smoke']=[dict(pos=[7,5],ttl=2)];self.assertNotIn([8,5],options(s,tank)['area_fire'])
        future=dict(tank,kind='future_howitzer',weapon='at_shell',ammo=None)
        self.assertTrue(operations.aim_hexes(s,future))

    def test_area_fire_damage_collapse_miss_and_loaded_ammo(self):
        s=self.field(('us','tank',[4,5]),('de','squad',[7,5]),('us','squad',[7,6]),('de','tank',[8,5]))
        tank,enemy,friend,armor=s['units'];tank['ammo']='he';self.structure(s,enemy['pos'],'damaged')
        order=dict(kind='area_fire',unit=tank['id'],pos=enemy['pos'])
        miss=apply(s,'us',order,roll=lambda:4);self.assertEqual(miss['buildings'],s['buildings'])
        hit=apply(s,'us',order,roll=lambda:6)
        self.assertEqual(hit['buildings']['7,5'],'destroyed');self.assertEqual(hit['units'][1]['hp'],0)
        self.assertEqual(hit['units'][2]['hp'],friend['hp']-1);self.assertEqual(hit['units'][3]['hp'],armor['hp'])
        s['units'][0]['ammo']='ap';hit=apply(s,'us',order,roll=lambda:6)
        self.assertEqual(hit['units'][2]['hp'],friend['hp'])

    def test_area_fire_respects_unit_cover_threshold(self):
        s=self.field(('de','tank',[4,5]),('us','squad',[7,5]),('us','leader',[7,6]))
        s['turn']='de';tank,target,_=s['units'];tank['ammo']='he';target['entrenched']=True
        self.structure(s,target['pos'],'intact')
        # Base 4 + cover 1 + dug in 1 = 6; roll 5 lands/damages masonry but cannot hit unit.
        out=apply(s,'de',dict(kind='area_fire',unit=tank['id'],pos=target['pos']),roll=lambda:5)
        self.assertEqual(out['units'][1]['hp'],target['hp'])
        self.assertEqual(out['buildings']['7,5'],'damaged')

    def test_area_fire_hidden_occupancy_does_not_change_previews_or_reports(self):
        s=self.field(('us','tank',[4,5]),('de','squad',[11,5]))
        s['fog_of_war']=True;update_intel(s)
        self.assertNotIn(s['units'][1]['id'],visible_ids(s,'us'))
        empty=copy.deepcopy(s);empty['units'][1]['pos']=[20,20]
        self.assertEqual(options(s,s['units'][0]),options(empty,empty['units'][0]))
        order=dict(kind='area_fire',unit=s['units'][0]['id'],pos=[11,5])
        a=apply(s,'us',order,roll=lambda:6);b=apply(empty,'us',order,roll=lambda:6)
        self.assertEqual(public_state(a,'us'),public_state(b,'us'))
        self.assertLess(a['units'][1]['hp'],s['units'][1]['hp'])

    def test_area_fire_locked_dice_and_json_save(self):
        s=self.field(('us','tank',[4,5]),('de','squad',[20,20]))
        self.structure(s,[7,5],'damaged')
        with patch('ww2_tactics.order_history.secrets.randbelow',return_value=5) as dice:
            out=perform(s,'us',dict(kind='area_fire',unit=s['units'][0]['id'],pos=[7,5]))
            undone=perform(out,'us',dict(kind='undo'));self.assertTrue(status(undone,'us')['redo_required'])
            with self.assertRaises(ValueError):perform(undone,'us',dict(kind='area_fire',unit=s['units'][0]['id'],pos=[8,5]))
            redone=perform(json.loads(json.dumps(undone)),'us',dict(kind='redo'))
            self.assertEqual(redone['units'],out['units']);self.assertEqual(redone['buildings'],out['buildings'])
            self.assertEqual(dice.call_count,1)

    def test_bombers_and_ships_share_area_fire_not_aircraft_guns(self):
        for name,kind in [('britain','bomber'),('midway','battleship')]:
            s=initial(name,'dsl');s['ready']=True;u=next(u for u in s['units'] if u['kind']==kind)
            s['turn']=u['side'];legal=options(s,u);self.assertTrue(legal['area_fire'])
            if kind=='bomber':
                self.assertTrue(all(distance(u['pos'],p)<=1 for p in legal['area_fire']))
                out=apply(s,u['side'],dict(kind='area_fire',unit=u['id'],pos=legal['area_fire'][0]),roll=lambda:1)
                self.assertEqual(next(t['bombs'] for t in out['units'] if t['id']==u['id']),u['bombs']-1)
                u['bombs']=0;self.assertFalse(options(s,u)['area_fire'])

    def test_tower_sight_both_ways_and_distinct_firing_range(self):
        s=self.field(('us','scout',[4,5]),('de','squad',[15,5]))
        scout,enemy=s['units'];s['fog_of_war']=True;self.structure(s,scout['pos'],kind='tower')
        self.assertIn(enemy['id'],visible_ids(s,'us'));self.assertIn(scout['id'],visible_ids(s,'de'))
        guide=options(s,scout)['range_guide']
        self.assertEqual(guide['sight_range'],12);self.assertEqual(guide['fire_range'],scout['range']);self.assertEqual(guide['snipe_range'],0)
        self.assertIn(enemy['pos'],guide['sight']);self.assertNotIn(enemy['pos'],guide['fire'])
        self.assertNotIn(enemy['id'],[t['id'] for t in options(s,scout)['targets']])
        enemy['pos']=[17,5];self.assertNotIn(enemy['id'],visible_ids(s,'us'));self.assertNotIn(scout['id'],visible_ids(s,'de'))

    def test_tower_looks_over_one_low_obstacle_not_smoke_or_guns(self):
        s=self.field(('us','sniper',[4,5]),('de','squad',[10,5]))
        u,t=s['units'];self.structure(s,u['pos'],kind='tower');self.structure(s,[6,5])
        self.assertTrue(unit_sees_hex(s,u,t['pos']));self.assertFalse(line_clear(u['pos'],t['pos'],[],s))
        self.assertFalse(options(s,u)['snipe'])
        self.structure(s,[8,5]);self.assertFalse(unit_sees_hex(s,u,t['pos']))
        s['battlefield']['map'][5][8]='field';s['smoke']=[dict(pos=[8,5],ttl=2)]
        self.assertFalse(unit_sees_hex(s,u,t['pos']))

    def test_tower_concealment_entry_and_collapse(self):
        entry=self.field(('us','scout',[4,5]),('us','tank',[5,6]),('de','squad',[20,20]))
        self.structure(entry,[5,5],kind='tower')
        self.assertEqual(next(m['cost'] for m in options(entry,entry['units'][0])['moves'] if m['pos']==[5,5]),2)
        self.assertNotIn([5,5],[m['pos'] for m in options(entry,entry['units'][1])['moves']])
        s=self.field(('us','sniper',[4,5]),('de','squad',[10,5]),('us','tank',[5,5]))
        u,t,tank=s['units'];self.structure(s,u['pos'],'damaged','tower');self.structure(s,t['pos'])
        s['fog_of_war']=True;self.assertIn(t['id'],visible_ids(s,'us'))
        t['pos']=[11,5];self.structure(s,t['pos']);s['battlefield']['map'][5][10]='field'
        self.assertNotIn(t['id'],visible_ids(s,'us'))
        self.assertNotIn(u['pos'],[m['pos'] for m in options(s,tank)['moves']])
        buildings.hit(s,u['pos']);self.assertEqual(u['hp'],0)
        self.assertFalse(buildings.enterable(s,u['pos']))

    def test_sniper_cost_accuracy_armor_immunity_and_exposure_expiry(self):
        s=self.field(('us','sniper',[4,5]),('de','squad',[9,5]),('de','tank',[8,6]))
        u,t,armor=s['units'];s['fog_of_war']=True;self.structure(s,u['pos']);update_intel(s)
        self.assertNotIn(u['id'],visible_ids(s,'de'))
        shot=options(s,u)['snipe'];self.assertEqual([t['id'] for t in shot],[t['id']]);self.assertEqual(shot[0]['threshold'],3)
        out=apply(s,'us',dict(kind='snipe',unit=u['id'],target=t['id']),roll=lambda:3)
        self.assertEqual(out['units'][0]['ap'],0);self.assertEqual(out['units'][1]['hp'],t['hp']-1)
        self.assertTrue(out['units'][1]['pinned']);self.assertIn(u['id'],visible_ids(out,'de'))
        out=apply(out,'us',dict(kind='end'));self.assertEqual(out['units'][0]['exposed_turns'],1)
        out=apply(out,'de',dict(kind='end'));self.assertEqual(out['units'][0]['exposed_turns'],0)
        self.assertNotIn(u['id'],visible_ids(out,'de'))
        miss=apply(s,'us',dict(kind='snipe',unit=u['id'],target=t['id']),roll=lambda:2)
        self.assertFalse(miss['units'][1]['pinned']);self.assertEqual(miss['units'][0]['exposed_turns'],2)

    def test_german_sniper_banks_and_tower_extends_only_aimed_range(self):
        s=self.field(('de','sniper',[4,5]),('us','squad',[12,5]))
        s['turn']='de';u,t=s['units'];self.structure(s,u['pos'],kind='tower')
        self.assertFalse(options(s,u)['snipe']);self.assertEqual(operations.snipe_range(s,u),9)
        out=apply(s,'de',dict(kind='end'));out=apply(out,'us',dict(kind='end'))
        u=out['units'][0];self.assertEqual(u['ap'],3);self.assertTrue(options(out,u)['snipe'])
        self.assertFalse(options(out,u)['targets']);self.assertEqual(u['range'],4)

    def test_new_maps_routes_rosters_and_asymmetric_stats(self):
        for name,count in [('carentan',28),('market_garden',40)]:
            with self.subTest(map=name):
                s=initial(name,'dsl');s['ready']=True;b=s['battlefield']
                self.assertEqual(len(s['units']),count);self.assertEqual(len({u['id'] for u in s['units']}),count)
                self.assertEqual(len({tuple(u['pos']) for u in s['units'] if active(u)}),sum(active(u) for u in s['units']))
                self.assertTrue(any('tower' in row for row in b['map']))
                costs=objective_costs(s)
                for u in s['units']:
                    x,y=u['pos'];self.assertTrue(0<=x<b['width'] and 0<=y<b['height'])
                    self.assertNotEqual(terrain(x,y,s),'water');self.assertIn(tuple(u['pos']),costs)
                self.assertTrue(any(u['kind']=='paratrooper' and u['reserve'] for u in s['units']))
                self.assertFalse(any(u['kind']=='paratrooper' and u['side']=='de' for u in s['units']))
                self.assertTrue(any(u['kind']=='sniper' for u in s['units'] if u['side']=='de'))
                with self.assertRaises(ValueError):initial(name,'classic')
        s=initial('market_garden','dsl')
        british=[u for u in s['units'] if u.get('faction')=='uk' and u['kind']=='tank']
        self.assertEqual({(u['base_ap'],u['range']) for u in british},{(3,6),(2,8)})
        for u in s['units']:
            if u.get('faction')=='uk':self.assertEqual(u['accuracy_bonus'],0);self.assertEqual(u['suppression'],4)

    def test_ai_uses_repairs_and_sniper_actions(self):
        s=self.field(('us','engineer',[5,5]),('us','tank',[6,5]),('de','squad',[20,20]))
        s['units'][1].update(hp=2,immobilized=True,ap=0)
        self.assertEqual(choose_order(s,objective_costs(s),{})['kind'],'repair_tank')
        s=self.field(('us','sniper',[4,5]),('de','squad',[9,5]))
        self.assertEqual(choose_order(s,objective_costs(s),{})['kind'],'snipe')
        s=self.field(('de','sniper',[4,5]),('us','squad',[10,5]));s['turn']='de'
        self.assertEqual(choose_order(s,objective_costs(s),{})['kind'],'end')
        s['units'][0]['ap']=3
        self.assertEqual(choose_order(s,objective_costs(s),{})['kind'],'snipe')

    def test_snipers_can_ride_transports_but_not_spot_or_shoot_aboard(self):
        s=self.field(('de','halftrack',[5,5]),('de','sniper',[6,5]),('us','squad',[9,5]))
        s['turn']='de';carrier,sniper,_=s['units']
        self.assertIn(sniper['id'],options(s,carrier)['load'])
        out=apply(s,'de',dict(kind='load',unit=carrier['id'],target=sniper['id']))
        troop=out['units'][1];self.assertEqual(troop['carrier_id'],carrier['id'])
        troop['ap']=3
        self.assertFalse(options(out,troop)['snipe']);self.assertIsNone(options(out,troop)['range_guide'])
        self.assertTrue(options(out,out['units'][0])['unload'])

    def test_api_save_restore_and_multiplayer_preserve_new_rules(self):
        from ww2_web import create_app
        with tempfile.TemporaryDirectory() as tmp:
            path=os.path.join(tmp,'games.sqlite');client=create_app(path).test_client()
            for name in ('carentan','market_garden'):
                with self.subTest(map=name):
                    seat=client.post('/api/match',json=dict(opponent='computer',scenario=name,ruleset='dsl')).get_json()
                    auth={'Authorization':'Bearer '+seat['token']};url='/api/match/'+seat['code']
                    with sqlite3.connect(path) as db:
                        s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(seat['code'],)).fetchone()[0])
                        co=next(u for u in s['units'] if u['side']=='us' and u['kind']=='commander');co['cooldowns']={'artillery':3}
                        engineer=next(u for u in s['units'] if u['side']=='us' and u['kind']=='engineer');engineer['repair_kits']=1
                        sniper=next(u for u in s['units'] if u['side']=='us' and u['kind']=='sniper');sniper['exposed_turns']=1
                        db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),seat['code']))
                    before=client.get(url,headers=auth).get_json()
                    self.assertEqual(before['tactics_version'],1);self.assertFalse(before['legal'][co['id']]['artillery'])
                    saved=client.post(url+'/save',headers=auth,json={'revision':0}).get_json()
                    seat2=client.post('/api/restore',json={'code':saved['save_code']}).get_json()
                    after=client.get('/api/match/'+seat2['code'],headers={'Authorization':'Bearer '+seat2['token']}).get_json()
                    for key in ('units','legal','buildings','map','tactics_version'):
                        self.assertEqual(after[key],before[key],key)
            host=client.post('/api/match',json=dict(scenario='market_garden',ruleset='dsl')).get_json()
            url='/api/match/'+host['code'];guest=client.post(url+'/join',json={}).get_json()
            for seat in (host,guest):
                view=client.get(url,headers={'Authorization':'Bearer '+seat['token']}).get_json()
                self.assertEqual(view['tactics_version'],1)
                self.assertNotIn('intel',view);self.assertNotIn('building_intel',view)
                self.assertTrue(all(u['id'] not in view['legal'] for u in view['units'] if u['side']!=view['side']))
if __name__=='__main__':unittest.main()
