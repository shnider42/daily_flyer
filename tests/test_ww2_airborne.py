"""Airlift uncertainty must never become a hidden-state reconnaissance API."""
import copy
import json
import unittest
from collections import deque
from unittest.mock import patch

from ww2_tactics import airborne, buildings, fieldworks, rulesets, signals, weapons
from ww2_tactics.engine import initial, apply, options, distance, terrain
from ww2_tactics.visibility import active, public_state, update_intel, visible_ids
from ww2_tactics.order_history import perform, status
from ww2_tactics.computer import choose_order, objective_costs
from ww2_tactics.theaters import soldier


class AirborneTests(unittest.TestCase):
    def field(self):
        s=initial('iron_lantern','dsl')
        s.update(ready=True,units=[],buildings={},building_intel={},intel={},platoon_intel={},radio_reports={'us':{},'de':{}},fieldworks={},fieldworks_intel={})
        s['battlefield']['map']=[['field']*30 for _ in range(34)]
        self.add(s,'commander',[2,30],group='HQ',airlift_commander=True)
        for x in (3,4,5):self.add(s,'paratrooper',[x,33],group='R',reserve=True,airlift_reserve=True,base_ap=3)
        self.add(s,'squad',[28,1],'de')
        return s

    def add(self,s,kind,pos,side='us',group='A',**extra):
        u=soldier(side,kind,pos,group,len(s['units'])+1,side,**extra)
        s['units'].append(u);weapons.initialize(s);signals.initialize(s)
        return u

    def drop(self,s,pos=(15,15),dice=(6,6)):
        rolls=iter(dice)
        return apply(s,'us',dict(kind='airborne_drop',unit=s['units'][0]['id'],pos=list(pos)),roll=lambda:next(rolls))

    def act(self,s,u,kind,**extra):return apply(s,u['side'],dict(kind=kind,unit=u['id'],**extra),roll=lambda:6)

    def test_map_roles_unique_spawns_and_connected_routes(self):
        s=initial('iron_lantern','dsl');self.assertEqual(len(s['units']),46)
        self.assertEqual(len({u['id'] for u in s['units']}),46)
        self.assertEqual(len({tuple(u['pos']) for u in s['units']}),46)
        self.assertEqual(len(airborne.reserves(s,'us')),3)
        self.assertEqual(s['airborne_version'],1)
        for u in s['units']:
            if u['kind'] in {'flak','at_gun'}:continue
            seen={tuple(u['pos'])};queue=deque(seen)
            while queue:
                for n in fieldworks.neighbors(s,queue.popleft()):
                    if tuple(n) not in seen and fieldworks.movement(u,terrain(*n,s))[0] and buildings.enterable(s,n):
                        seen.add(tuple(n));queue.append(tuple(n))
            for p in s['battlefield']['linked_objectives']:self.assertIn(tuple(p['pos']),seen,u['id'])
        with self.assertRaises(ValueError):initial('iron_lantern','classic')
        for name in ('tidal_gate','apennine','market_garden'):
            old=initial(name,'dsl');old['ready']=True
            self.assertNotIn('airborne_version',old)
            self.assertTrue(all(not options(old,u)['airborne_drop'] for u in old['units']))

    def test_natural_one_loses_without_sight_or_hidden_metadata(self):
        s=self.field();enemy=s['units'][-1];enemy['pos']=[15,15];update_intel(s)
        before=copy.deepcopy(s.get('intel',{}))
        s=self.drop(s,dice=(1,));r=s['airlift_reports']['us'];u=s['units'][1]
        self.assertEqual(u['hp'],0);self.assertTrue(u['reserve']);self.assertEqual(u['pos'],[3,33])
        self.assertEqual(s['units'][0]['ap'],0);self.assertFalse(r['landed'])
        self.assertNotIn(enemy['id'],visible_ids(s,'us'));self.assertEqual(s.get('intel',{}),before)
        for fog in (True,False):
            s['fog_of_war']=fog;own=public_state(s,'us');other=public_state(s,'de')
            self.assertEqual(own['airlift_report']['roll'],1);self.assertIsNone(other['airlift_report'])
            for p in (own,other):
                self.assertNotIn('airlift_reports',p);self.assertNotIn('airlift_rounds',p)
            alert=other['signal_alerts'][-1]
            self.assertEqual(alert['kind'],'airlift');self.assertNotIn('pos',alert)
            self.assertNotIn('aim',alert);self.assertNotIn('roll',alert)

    def test_scatter_table_all_directions_and_exact_six(self):
        for die,gap in ((2,3),(3,2),(4,1),(5,1),(6,0)):
            for direction in range(1,7):
                s=self.drop(self.field(),dice=(die,direction,6) if gap else (die,6))
                u=s['units'][1];self.assertTrue(active(u))
                self.assertEqual(distance([15,15],u['pos']),gap)
                self.assertEqual(u['pos'],airborne.step([15,15],direction,gap))
                self.assertEqual(u['ap'],1)

    def test_occupied_and_obstructed_landings_divert_without_stacking(self):
        for obstacle in ('occupied','mountain','tower','bunker','collapsed'):
            s=self.field()
            if obstacle=='occupied':s['units'][-1]['pos']=[15,15]
            elif obstacle=='collapsed':
                s['battlefield']['map'][15][15]='building';s['buildings']['15,15']='destroyed'
            else:s['battlefield']['map'][15][15]=obstacle
            s=self.drop(s);u=s['units'][1]
            self.assertEqual(distance([15,15],u['pos']),1,obstacle)
            self.assertTrue(s['airlift_reports']['us']['diverted'])
            self.assertEqual(len([v for v in s['units'] if active(v)]),len({tuple(v['pos']) for v in s['units'] if active(v)}))
        s=self.field();s['battlefield']['map'][15][15]='tower'
        for p in fieldworks.neighbors(s,[15,15]):s['battlefield']['map'][p[1]][p[0]]='tower'
        self.assertEqual(self.drop(s)['units'][1]['hp'],0)
        self.assertEqual(self.drop(self.field(),pos=(29,15),dice=(2,1,6))['units'][1]['hp'],0)

    def test_rough_landing_and_only_final_hex_establishes_sight(self):
        s=self.field();s['battlefield']['map'][15][15]='woods';s=self.drop(s)
        self.assertEqual(s['units'][1]['hp'],2);self.assertTrue(s['airlift_reports']['us']['rough'])
        s=self.field();s['units'][-1]['pos']=[9,15];update_intel(s)
        s=self.drop(s,dice=(2,1,6))
        self.assertNotIn(s['units'][-1]['id'],visible_ids(s,'us'))
        self.assertNotIn(s['units'][-1]['id'],s.get('intel',{}).get('us',{}))

    def test_aa_range_pinning_and_nonstacking(self):
        for gap,pinned,hp,carrier,dead in ((4,False,3,None,True),(5,False,3,None,False),(4,True,3,None,False),(4,False,0,None,False),(4,False,3,'boat',False)):
            s=self.field();self.add(s,'flak',airborne.step([15,15],1,gap),'de',aa_radius=4,pinned=pinned,hp=hp,carrier_id=carrier)
            s=self.drop(s,dice=(6,1));self.assertEqual(s['units'][1]['hp']==0,dead,(gap,pinned,hp,carrier))
        s=self.field()
        for x in (16,17,18):self.add(s,'flak',[x,15],'de',aa_radius=4)
        s=self.drop(s,dice=(6,3));self.assertTrue(active(s['units'][1]))
        self.assertEqual(sum(u.get('aa_round')==1 for u in s['units']),1)
        # The already-used closest gun does not try again within this round.
        s=self.field();gun=self.add(s,'flak',[16,15],'de',aa_radius=4,aa_round=1)
        s=self.drop(s,dice=(6,1));self.assertTrue(active(s['units'][1]))
        self.assertNotIn('aa_round',next(u for u in public_state(s,'us')['units'] if u['id']==gun['id']))

    def test_hidden_flak_cannot_change_legal_orders_or_disclose_its_hex(self):
        a=self.field();b=copy.deepcopy(a)
        self.add(a,'flak',[16,15],'de',aa_radius=4);self.add(b,'flak',[26,4],'de',aa_radius=4,aa_round=1)
        self.assertEqual(options(a,a['units'][0]),options(b,b['units'][0]))
        aa=self.drop(a,dice=(6,1));payload=public_state(aa,'us')
        self.assertFalse(payload['airlift_report']['landed']);self.assertNotIn(a['units'][-1]['id'],[u['id'] for u in payload['units']])
        self.assertNotIn('gun',payload['airlift_report']);self.assertNotIn('interception',payload['airlift_report'])
        self.assertNotIn('aa_round',json.dumps(payload));self.assertNotIn('16,15',json.dumps(payload['airlift_report']))
        a['units'][4]['pos']=[15,15]
        lost=self.drop(a,dice=(6,1))
        self.assertFalse(lost['airlift_reports']['us']['landed']);self.assertNotIn('diverted',lost['airlift_reports']['us'])

    def test_beacon_cost_radius_consumption_and_counterplay(self):
        for gap,expected in ((2,2),(3,3)):
            s=self.field();p=self.add(s,'pathfinder',airborne.step([15,15],4,gap),beacon_charges=1,base_ap=3)
            s=self.act(s,p,'mark_lz');p=s['units'][-1]
            self.assertEqual(p['ap'],1);self.assertEqual(p['beacon_charges'],0);self.assertFalse(options(s,p)['mark_lz'])
            s=self.drop(s,dice=(2,1,6));self.assertEqual(distance(s['units'][1]['pos'],[15,15]),expected)
        s=self.field();p=self.add(s,'pathfinder',[15,16],beacon_charges=1,base_ap=3)
        s=self.act(s,p,'mark_lz');p=s['units'][-1];p['pinned']=True
        self.assertFalse(airborne.beacon_near(s,'us',[15,15]))
        s=self.act(s,p,'rally');self.assertTrue(airborne.beacon_near(s,'us',[15,15]))
        s['units'][-1]['ap']=3;s=self.act(s,s['units'][-1],'move',pos=[16,16]);self.assertNotIn('beacon_active',s['units'][-1])
        s=self.field();p=self.add(s,'pathfinder',[15,16],beacon_active=True)
        self.assertEqual(self.drop(s,dice=(1,))['units'][1]['hp'],0)
        self.add(s,'flak',[16,15],'de',aa_radius=4)
        self.assertEqual(self.drop(s,dice=(6,1))['units'][1]['hp'],0)

    def test_water_escape_damage_timing_and_arrival_cap(self):
        s=self.field();s['battlefield']['map'][15][15]='water';s=self.drop(s);u=s['units'][1]
        self.assertTrue(u['afloat']);self.assertEqual(rulesets.turn_limit(u),1)
        self.assertTrue(options(s,u)['moves']);self.assertFalse(options(s,u)['targets']);self.assertFalse(options(s,u)['dig'])
        dry=self.act(s,u,'move',pos=[16,15]);self.assertNotIn('afloat',dry['units'][1]);self.assertEqual(dry['units'][1]['ap'],0)
        dry=apply(dry,'us',{'kind':'end'});self.assertEqual(dry['units'][1]['hp'],3)
        wet=apply(s,'us',{'kind':'end'});self.assertEqual(wet['units'][1]['hp'],1);self.assertEqual(wet['units'][1]['banked_ap'],0)
        wet=apply(wet,'de',{'kind':'end'});self.assertEqual(wet['units'][1]['hp'],1);self.assertEqual(wet['units'][1]['ap'],3)
        self.assertNotIn('landing_limited',wet['units'][1])
        wet=apply(wet,'us',{'kind':'end'});self.assertEqual(wet['units'][1]['hp'],0)

    def test_arrival_cannot_receive_command_or_bank_ap(self):
        s=self.field();s['units'][0]['pos']=[15,17]
        s['battlefield']['map'][15][15]=s['battlefield']['map'][15][16]='road'
        s=self.drop(s);commander,u=s['units'][:2];commander['ap']=3
        self.assertNotIn(u['id'],options(s,commander)['command'])
        s=self.act(s,u,'move',pos=[16,15]);u=s['units'][1]
        self.assertEqual(u['ap'],0)
        # Normal land arrivals retain the ordinary road-step rule, but cannot
        # receive or bank another AP. Reset both turns and regain the usual 3.
        s=apply(s,'us',{'kind':'end'});self.assertEqual(s['units'][1]['banked_ap'],0)
        s=apply(s,'de',{'kind':'end'});self.assertEqual(s['units'][1]['ap'],3)

    def test_adjacent_transport_can_rescue_afloat_troops(self):
        s=self.field();s['battlefield']['map'][15][15]='water';truck=self.add(s,'halftrack',[16,15])
        s=self.drop(s);truck=s['units'][-1];troop=s['units'][1]
        self.assertIn(troop['id'],options(s,truck)['load'])
        s=self.act(s,truck,'load',target=troop['id']);self.assertEqual(s['units'][1]['ap'],0)
        s=apply(s,'us',{'kind':'end'});self.assertEqual(s['units'][1]['hp'],3)
        s=apply(s,'de',{'kind':'end'});truck=s['units'][-1]
        s=self.act(s,truck,'unload',pos=[17,15]);self.assertNotIn('afloat',s['units'][1])

    def test_boarding_permanently_ends_pathfinder_beacon(self):
        s=self.field();p=self.add(s,'pathfinder',[15,15],beacon_active=True);truck=self.add(s,'halftrack',[16,15])
        s=self.act(s,truck,'load',target=p['id']);self.assertNotIn('beacon_active',s['units'][-2])
        s=self.act(s,s['units'][-1],'unload',pos=[17,15]);self.assertFalse(airborne.beacon_near(s,'us',[17,15]))

    def test_ground_overwatch_only_reacts_to_successful_final_landing(self):
        s=self.field();gun=self.add(s,'mg',[17,15],'de',overwatch=True)
        lost=self.drop(s,dice=(1,));self.assertTrue(lost['units'][-1]['overwatch'])
        landed=self.drop(s,dice=(6,6,6));self.assertFalse(landed['units'][-1]['overwatch'])
        self.assertLess(landed['units'][1]['hp'],3);self.assertTrue(landed['units'][1]['pinned'])

    def test_limit_invalid_input_faction_and_history(self):
        s=self.field();original=copy.deepcopy(s)
        for pos in ([30,0],[-1,0],[True,1],[1.5,2],[],None):
            with self.assertRaises(ValueError):apply(s,'us',dict(kind='airborne_drop',unit=s['units'][0]['id'],pos=pos))
            self.assertEqual(s,original)
        for faction,allowed in (('gb',True),('de',False),('it',False)):
            s['units'][0]['faction']=faction;self.assertEqual(options(s,s['units'][0])['airborne_drop'],allowed)
        s['units'][0]['faction']='us'
        for u in s['units'][1:4]:self.assertFalse(options(s,u)['drops'])
        with patch('ww2_tactics.order_history.secrets.randbelow',return_value=0):
            s=perform(s,'us',dict(kind='airborne_drop',unit=s['units'][0]['id'],pos=[15,15]))
        self.assertFalse(status(s,'us')['can_undo'])
        s['units'][0]['ap']=5;self.assertFalse(options(s,s['units'][0])['airborne_drop'])
        with self.assertRaises(ValueError):perform(s,'us',{'kind':'undo'})
        s=apply(s,'us',{'kind':'end'});s=apply(s,'de',{'kind':'end'})
        self.assertTrue(options(s,s['units'][0])['airborne_drop'])

    def test_tiger_move_cost_firepower_and_firefly_tradeoff(self):
        s=initial('iron_lantern','dsl');s.update(ready=True,turn='de')
        tiger=next(u for u in s['units'] if u.get('variant')=='tiger');firefly=next(u for u in s['units'] if u.get('variant')=='firefly')
        self.assertEqual((tiger['hp'],tiger['armor']),(6,3))
        self.assertEqual(weapons.damage(tiger,firefly),3);self.assertEqual(weapons.damage(firefly,tiger),3)
        self.assertEqual(fieldworks.movement(tiger,'road'),(True,3))
        self.assertEqual(fieldworks.movement(tiger,'field'),(True,3))
        self.assertFalse(fieldworks.movement(tiger,'woods')[0])
        moves=options(s,tiger)['moves'];self.assertTrue(moves);self.assertTrue(all(m['cost']==3 for m in moves))
        s=self.act(s,tiger,'move',pos=[15,10]);tiger=next(u for u in s['units'] if u.get('variant')=='tiger')
        self.assertEqual(tiger['ap'],0);self.assertFalse(options(s,tiger)['moves']);self.assertFalse(tiger['road_pending'])
        firefly['ammo']='he';self.assertEqual(weapons.profile(firefly)['infantry_damage'],1);self.assertEqual(weapons.profile(firefly)['splash'],0)

    def test_computer_aim_ignores_hidden_guns_and_swims_ashore(self):
        s=self.field();costs=objective_costs(s);visited={u['id']:{} for u in s['units']}
        a=choose_order(s,costs,visited)
        self.assertEqual(a['kind'],'airborne_drop')
        self.add(s,'flak',[15,8],'de',aa_radius=4);b=choose_order(s,costs,visited)
        self.assertEqual(a,b)
        s=self.field();s['battlefield']['map'][15][15]='water';s=self.drop(s)
        action=choose_order(s,objective_costs(s),{u['id']:{} for u in s['units']})
        self.assertEqual(action['kind'],'move');self.assertEqual(action['unit'],s['units'][1]['id'])
        self.assertNotEqual(terrain(*action['pos'],s),'water')

    def test_computer_replay_redacts_aim_roll_and_failed_reserve(self):
        from ww2_tactics.computer import play_turn
        s=self.field();s.update(ai_side='us');s['units'][0]['pos']=[27,2]
        action=dict(kind='airborne_drop',unit=s['units'][0]['id'],pos=[15,15])
        with patch('ww2_tactics.computer.choose_order',side_effect=[action,dict(kind='end')]), patch('ww2_tactics.engine.secrets.randbelow',return_value=0):
            result=play_turn(s)
        frame=next(f for f in result['computer_playback']['frames'] if f['action']['kind']=='airborne_drop')
        self.assertNotIn('pos',frame['action']);self.assertIsNone(frame['after']['airlift_report'])
        self.assertNotIn(s['units'][1]['id'],[u['id'] for u in frame['after']['units']])
        self.assertEqual(frame['after']['signal_alerts'][-1]['kind'],'airlift')

    def test_multiplayer_api_reserve_privacy_and_checkpoint_restore(self):
        import os, sqlite3, tempfile
        from ww2_web import create_app
        with tempfile.TemporaryDirectory() as tmp:
            path=os.path.join(tmp,'game.sqlite');client=create_app(path).test_client()
            host=client.post('/api/match',json=dict(scenario='iron_lantern',ruleset='dsl')).get_json()
            url='/api/match/'+host['code'];guest=client.post(url+'/join',json={}).get_json()
            auth={'Authorization':'Bearer '+host['token']};gauth={'Authorization':'Bearer '+guest['token']}
            before=client.get(url,headers=auth).get_json();commander=next(u for u in before['units'] if u.get('airlift_commander'))
            other=client.get(url,headers=gauth).get_json()
            self.assertFalse(any(u.get('airlift_reserve') for u in other['units']))
            with patch('ww2_tactics.order_history.secrets.randbelow',return_value=5):
                response=client.post(url,headers=auth,json=dict(kind='airborne_drop',unit=commander['id'],pos=[10,28],revision=before['revision']))
            self.assertEqual(response.status_code,200);after=response.get_json()
            self.assertEqual(after['airlift_report']['roll'],6)
            other=client.get(url,headers=gauth).get_json();self.assertIsNone(other['airlift_report'])
            self.assertNotIn('airlift_reports',other);self.assertNotIn('aa_round',json.dumps(after))
            # Save/restore must retain exact finite reserves and committed report.
            solo=client.post('/api/match',json=dict(scenario='iron_lantern',ruleset='dsl',opponent='computer')).get_json()
            with sqlite3.connect(path) as db:
                value=json.loads(db.execute('SELECT state FROM match WHERE code=?',(host['code'],)).fetchone()[0])
                value['ai_side']='de'
                db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(value),solo['code']))
            surl='/api/match/'+solo['code'];sauth={'Authorization':'Bearer '+solo['token']}
            current=client.get(surl,headers=sauth).get_json()
            saved=client.post(surl+'/save',headers=sauth,json={'revision':current['revision']}).get_json()
            restored=client.post('/api/restore',json={'code':saved['save_code']}).get_json()
            restored_state=client.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).get_json()
            for key in ('units','legal','airborne_version','airlift_report','airlift_round','platoon_views'):
                self.assertEqual(current[key],restored_state[key],key)


if __name__=='__main__':unittest.main()
