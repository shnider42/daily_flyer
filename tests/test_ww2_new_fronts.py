"""Version-gated scenarios, finite supplies, fog-safe explanations and evacuation."""
import copy
from collections import deque
from contextlib import closing
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_tactics import logistics, new_fronts, signals, weapons, fieldworks, buildings, operations
from ww2_tactics.engine import initial, apply, options, terrain, distance
from ww2_tactics.visibility import public_state, update_intel, visible_ids
from ww2_tactics.order_history import perform, status, KEY
from ww2_tactics.computer import play_turn, choose_order, objective_costs
from ww2_tactics.scenarios import catalog
from ww2_web import create_app


def own(s, kind, side='us'):
    return next(u for u in s['units'] if u['side']==side and u['kind']==kind)


def step(s,u,kind,**kw):
    return apply(s,u['side'],dict(kind=kind,unit=u['id'],**kw),roll=lambda:6)


class NewFrontsTests(unittest.TestCase):
    def field(self):
        s=initial('relay_crossing','dsl');s['ready']=True
        s['battlefield']['map']=[['field']*9 for _ in range(11)]
        s.update(units=[],buildings={},building_intel={},intel={},platoon_intel={},radio_reports={'us':{},'de':{}},fieldworks={},fieldworks_intel={})
        return s

    def add(self,s,kind,pos,side='us',group='A',**extra):
        u=new_fronts.support(side,kind,pos,group,len(s['units'])+1,side,**extra)
        s['units'].append(u);weapons.initialize(s);signals.initialize(s);logistics.initialize(s)
        return u

    def test_catalog_counts_versioning_and_small_map(self):
        for name,wh,count in [('kharkov',(24,20),38),('relay_crossing',(9,11),22),('dunkirk',(18,20),31)]:
            s=initial(name,'dsl');b=s['battlefield']
            self.assertEqual((b['width'],b['height']),wh)
            self.assertEqual(len(s['units']),count)
            self.assertEqual(count,len({u['id'] for u in s['units']}))
            self.assertEqual(count,len({tuple(u['pos']) for u in s['units']}))
            self.assertEqual(s['signals_version'],1);self.assertEqual(s['logistics_version'],1)
            self.assertTrue(b['playtest']);self.assertIn('not a historical reconstruction',b['historical_note'])
            for u in s['units']:
                self.assertTrue(0<=u['pos'][0]<wh[0] and 0<=u['pos'][1]<wh[1])
            with self.assertRaises(ValueError):initial(name,'classic')
        self.assertNotIn('logistics_version',initial('fubar','dsl'))
        self.assertNotIn('front_version',initial('village','dsl'))
        self.assertLess(9*11,2*7*9)
        boards={b['id']:b for b in catalog()}
        self.assertIn('armor',boards['kharkov']['browse']['tags'])
        self.assertIn('evacuation',boards['dunkirk']['browse']['tags'])

    def test_ground_routes_and_boat_exit_reachability(self):
        for name in new_fronts.IDS:
            s=initial(name,'dsl');b=s['battlefield']
            goals=[p['pos'] for p in b.get('control_points',[])] or b.get('embarkation_points') or [b['objective']]
            for u in s['units']:
                if u['kind']=='at_gun':continue
                start=tuple(u['pos']);seen={start};todo=deque([start])
                while todo:
                    for pos in fieldworks.neighbors(s,todo.popleft()):
                        key=tuple(pos)
                        passable=terrain(*pos,s)=='water' if u['kind']=='landing_craft' else fieldworks.movement(u,terrain(*pos,s))[0] and buildings.enterable(s,pos)
                        if key not in seen and passable:seen.add(key);todo.append(key)
                wanted=b['evacuation_exits'] if u['kind']=='landing_craft' else goals
                self.assertTrue(any(tuple(p) in seen for p in wanted),(name,u['id']))
                if name=='kharkov' and u['kind']=='tank':self.assertTrue(all(tuple(p) in seen for p in goals),u['id'])

    def test_observer_metadata_exact_bonus_and_no_weapon_change(self):
        s=self.field();scout=self.add(s,'radioman',[1,5]);enemy=self.add(s,'squad',[8,5],'de')
        base=options(s,scout)['observation'];self.assertFalse(base['active'])
        s=step(s,scout,'observe');scout=own(s,'radioman')
        self.assertEqual(options(s,scout)['observation']['sight'],base['sight']+2)
        self.assertEqual(scout['range'],base['weapon_range']);self.assertTrue(scout['observing'])
        self.assertFalse(options(s,scout)['observe'])
        s=step(s,scout,'move',pos=[2,5]);self.assertFalse(own(s,'radioman').get('observing'))

    def test_warning_is_known_risk_not_secret_watch(self):
        s=self.field();scout=self.add(s,'scout',[2,5]);enemy=self.add(s,'mg',[6,5],'de')
        before=options(s,scout)['moves'];self.assertTrue(any(m['threats'] for m in before))
        enemy.update(overwatch=True,pinned=True);self.assertEqual(before,options(s,scout)['moves'])
        enemy.update(pos=[8,0],overwatch=False,pinned=False)
        before=options(s,scout)['moves'];enemy['overwatch']=True
        self.assertEqual(before,options(s,scout)['moves'])

    def supply_field(self):
        s=self.field();supplier=self.add(s,'supply',[2,7]);mortar=self.add(s,'mortar',[3,7],shells=3);self.add(s,'squad',[8,0],'de')
        mortar.update(shells=0,ap=0);return s,supplier,mortar

    def test_supply_finite_cost_capacity_and_no_bonus_ap(self):
        s,u,m=self.supply_field();before=copy.deepcopy(s)
        s=step(s,u,'resupply',target=m['id']);u=own(s,'supply');m=own(s,'mortar')
        self.assertEqual(before['units'][0]['supply_packs'],3)
        self.assertEqual((u['supply_packs'],u['ap'],m['shells'],m['ap']),(2,0,2,0))
        self.assertFalse(options(s,m)['mortar_fire'])
        u['ap']=4
        self.assertFalse(options(s,u)['resupply'])
        s['round']+=1
        s=step(s,u,'resupply',target=m['id']);self.assertEqual(own(s,'mortar')['shells'],3)
        self.assertFalse(options(s,own(s,'supply'))['resupply'])

    def test_supply_eligibility_enemy_distance_pin_no_packs(self):
        s,u,m=self.supply_field()
        for key,value in [('side','de'),('pos',[6,7]),('carrier_id','boat'),('hp',0),('resupplied_round',1)]:
            original=copy.deepcopy(m);m[key]=value
            self.assertFalse(options(s,u)['resupply'],key);m.clear();m.update(original)
        for key,value in [('pinned',True),('supply_packs',0),('ap',1),('carrier_id','boat')]:
            original=copy.deepcopy(u);u[key]=value
            with self.assertRaises(ValueError):step(s,u,'resupply',target=m['id'])
            u.clear();u.update(original)

    def test_supply_restores_kit_not_health_or_bridge_or_cooldown(self):
        s,u,m=self.supply_field();m['shells']=3
        e=self.add(s,'engineer',[2,8]);e.update(repair_kits=0,hp=1,bridge_kits=0,ap=0)
        s=step(s,u,'resupply',target=e['id']);e=own(s,'engineer')
        self.assertEqual((e['repair_kits'],e['hp'],e['bridge_kits'],e['ap']),(1,1,0,0))

    def test_supply_undo_redo_exact_and_legacy_unavailable(self):
        s,u,m=self.supply_field();s['fog_of_war']=False;update_intel(s)
        after=perform(s,'us',dict(kind='resupply',unit=u['id'],target=m['id']))
        self.assertTrue(status(after,'us')['can_undo'])
        undo=perform(after,'us',dict(kind='undo'));redo=perform(undo,'us',dict(kind='redo'))
        self.assertEqual(undo['units'],s['units']);self.assertEqual(redo['units'],after['units'])
        s.pop('logistics_version');self.assertNotIn('resupply',options(s,u))
        with self.assertRaises(ValueError):step(s,u,'resupply',target=m['id'])

    def test_supply_does_not_unlock_second_mortar_shot(self):
        s,u,m=self.supply_field();m.update(ap=4,shells=1)
        s=step(s,m,'mortar_fire',pos=[5,7]);m=own(s,'mortar');u=own(s,'supply')
        s=step(s,u,'resupply',target=m['id']);m=own(s,'mortar')
        self.assertEqual(m['shells'],2);self.assertFalse(options(s,m)['mortar_fire'])

    def test_kharkov_points_tanks_and_reserves(self):
        s=initial('kharkov','dsl');s['ready']=True
        tank=own(s,'tank');tank['pos']=[11,10]
        s=apply(s,'us',dict(kind='end'),roll=lambda:6)
        self.assertEqual(s['front_score']['us'],2);self.assertIsNone(s['winner'])
        s['turn']='us';s['front_score']['us']=8
        s=apply(s,'us',dict(kind='end'),roll=lambda:6);self.assertEqual(s['winner'],'us')
        s=initial('kharkov','dsl');s.update(ready=True,turn='de',round=3)
        s=apply(s,'de',dict(kind='end'),roll=lambda:6)
        r=next(u for u in s['units'] if u['side']=='us' and u.get('arrival_round'))
        self.assertEqual(s['round'],4);self.assertFalse(r['reserve'])

    def test_kharkov_supply_cannot_capture_and_deadline(self):
        s=initial('kharkov','dsl');s['ready']=True;own(s,'supply')['pos']=[11,10]
        self.assertIsNone(next(p for p in new_fronts.controls(s) if p['id']=='rail')['owner'])
        s.update(round=18,turn='de',front_score={'us':4,'de':3})
        s=apply(s,'de',dict(kind='end'),roll=lambda:6);self.assertEqual(s['winner'],'us')

    def loaded_boat(self):
        s=initial('dunkirk','dsl');s.update(ready=True,fog_of_war=False)
        boat=own(s,'landing_craft');troop=next(u for u in s['units'] if u.get('evacuee'))
        troop.update(pos=[3,4],ap=2);boat.update(pos=[3,3],ap=4)
        s=step(s,boat,'load',target=troop['id']);boat=own(s,'landing_craft')
        return s,boat,troop['id']

    def test_dunkirk_real_load_flightless_move_evacuate(self):
        s,b,uid=self.loaded_boat()
        self.assertEqual(b['ap'],4)
        for pos in ([3,2],[3,1],[3,0]):
            s=step(s,b,'move',pos=pos);b=own(s,'landing_craft')
        self.assertTrue(options(s,b)['evacuate'])
        before=copy.deepcopy(s)
        s=perform(s,'us',dict(kind='evacuate',unit=b['id']))
        self.assertEqual(s['evacuated_count'],1);self.assertEqual(own(s,'landing_craft')['ap'],0)
        self.assertNotIn(uid,[u['id'] for u in s['units']]);self.assertEqual(len(s['units']),len(before['units'])-1)
        self.assertFalse(status(s,'us')['can_undo']);self.assertIsNone(s['winner'])
        self.assertEqual(before['evacuated_count'],0)

    def test_dunkirk_invalid_evacuation_and_private_manifest(self):
        s,b,uid=self.loaded_boat()
        with self.assertRaises(ValueError):step(s,b,'evacuate')
        b['pos']=[3,0]
        s=step(s,b,'evacuate');s['fog_of_war']=True
        self.assertEqual(public_state(s,'de')['evacuated_manifest'],[])
        self.assertEqual(public_state(s,'de')['evacuated_count'],1)
        self.assertEqual(public_state(s,'us')['evacuated_manifest'][0]['id'],uid)
        self.assertFalse(options(s,own(s,'landing_craft'))['evacuate'])

    def test_dunkirk_loss_and_win_boundaries(self):
        s,b,uid=self.loaded_boat();s['evacuated_count']=5;b['pos']=[3,0]
        s=step(s,b,'evacuate');self.assertEqual(s['winner'],'us');self.assertEqual(s['victories']['us'],1)
        for case in ['losses','boats','deadline']:
            s=initial('dunkirk','dsl');s['ready']=True
            if case=='losses':
                for u in [u for u in s['units'] if u.get('evacuee')][:3]:u['hp']=0
            elif case=='boats':
                for u in s['units']:
                    if u['kind']=='landing_craft':u['hp']=0
            else:s.update(round=14,turn='de')
            s=apply(s,s['turn'],dict(kind='end'),roll=lambda:6)
            self.assertEqual(s['winner'],'de',case)

    def test_evacuation_ai_routes_around_the_mole(self):
        s,b,uid=self.loaded_boat();b['pos']=[15,2]
        for _ in range(4):
            if options(s,b)['evacuate']:break
            choices=new_fronts.boat_choices(s,b,options(s,b));self.assertTrue(choices)
            action=max(choices,key=lambda p:p[0])[1]
            self.assertEqual(action['kind'],'move')
            s=apply(s,'us',action,roll=lambda:6);b=own(s,'landing_craft')
        self.assertTrue(options(s,b)['evacuate'])

    def test_evacuation_ai_uses_known_passenger_exit_and_load(self):
        s,b,uid=self.loaded_boat()
        choice=max(new_fronts.boat_choices(s,b,options(s,b)),key=lambda p:p[0])[1]
        self.assertEqual(choice['kind'],'move');self.assertLess(choice['pos'][1],b['pos'][1])
        b['pos']=[3,0]
        self.assertEqual(max(new_fronts.boat_choices(s,b,options(s,b)),key=lambda p:p[0])[1]['kind'],'evacuate')


class NewFrontAPITests(unittest.TestCase):
    def test_new_saves_restore_and_other_seat_cannot_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            dbpath=os.path.join(tmp,'game.sqlite');app=create_app(dbpath);app.testing=True;c=app.test_client()
            for name in new_fronts.IDS:
                seat=c.post('/api/match',json=dict(scenario=name,ruleset='dsl',opponent='computer')).get_json()
                auth={'Authorization':'Bearer '+seat['token']};url='/api/match/'+seat['code']
                r=c.get(url,headers=auth);self.assertEqual(r.status_code,200);s=r.get_json()
                self.assertEqual(s['scenario']['id'],name)
                bad=c.post(url,json=dict(kind='end',revision=s['revision']),headers={'Authorization':'Bearer wrong'})
                self.assertEqual(bad.status_code,403)
                saved=c.post(url+'/save',headers=auth,json=dict(revision=s['revision'])).get_json()
                seat2=c.post('/api/restore',json=dict(code=saved['save_code'])).get_json()
                restored=c.get('/api/match/'+seat2['code'],headers={'Authorization':'Bearer '+seat2['token']}).get_json()
                self.assertEqual(restored['units'],s['units']);self.assertEqual(restored.get('front_mode'),s.get('front_mode'))
                self.assertEqual(restored['logistics_version'],1)

    def test_rescue_save_replay_and_ack_survive_fresh_browser(self):
        with tempfile.TemporaryDirectory() as tmp:
            dbpath=os.path.join(tmp,'game.sqlite');app=create_app(dbpath);app.testing=True;c=app.test_client()
            seat=c.post('/api/match',json=dict(scenario='dunkirk',ruleset='dsl',opponent='computer')).get_json();auth={'Authorization':'Bearer '+seat['token']};url='/api/match/'+seat['code']
            with closing(sqlite3.connect(dbpath)) as db:
                s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(seat['code'],)).fetchone()[0]);s['evacuated_count']=1;s['evacuated_manifest']=[dict(id='evacuated-test',kind='squad',hp=2,personnel=9)]
                s['computer_playback']={'id':25,'frames':[{'action':{'kind':'contact'},'before':{},'after':{},'effects':[],'combat':[]}]}
                db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),seat['code']));db.commit()
            full=c.get(url,headers=auth).get_json();self.assertEqual(full['evacuated_count'],1)
            saved=c.post(url+'/save',headers=auth,json=dict(revision=full['revision'])).get_json();other=c.post('/api/restore',json=dict(code=saved['save_code'])).get_json()
            restored=c.get('/api/match/'+other['code'],headers={'Authorization':'Bearer '+other['token']}).get_json()
            self.assertEqual(full['computer_playback'],restored['computer_playback']);self.assertEqual(full['evacuated_manifest'],restored['evacuated_manifest'])


if __name__=='__main__':unittest.main()
