import copy
import json
import unittest
from collections import deque
from ww2_tactics.engine import initial, apply, options, terrain, line_clear, distance
from ww2_tactics.campaigns import unit
from ww2_tactics import buildings, fieldworks, linked_front, weapons
from ww2_tactics.visibility import active, public_state, update_intel, visible_ids, view
from ww2_tactics.order_history import perform, status
from ww2_tactics.computer import choose_order, objective_costs
from ww2_tactics.coordinates import column


class TidalGateTests(unittest.TestCase):
    def battle(self):
        s=initial('tidal_gate','dsl');s['ready']=True
        return s

    def field(self):
        s=initial('frontier','dsl');s.update(ready=True,fog_of_war=False)
        s['battlefield']['map']=[['field']*24 for _ in range(24)]
        s['units']=[unit('us','engineer',[5,5],'A',1),unit('us','tank',[4,5],'A',2),unit('de','squad',[22,22],'A',1)]
        s['buildings']={};s['building_intel']={'us':{},'de':{}}
        weapons.initialize(s)
        return s

    def order(self,s,kind,pos):return apply(s,'us',dict(kind=kind,unit=s['units'][0]['id'],pos=pos))

    def occupy(self,s,point,kind='squad'):
        for u in s['units']:
            if active(u) and u['pos']==point:u['hp']=0
        s['units'].append(unit('us',kind,point,'TEST',len(s['units'])))
        linked_front.refresh(s)

    def test_scale_roster_spawns_and_snapshot(self):
        s=self.battle();b=s['battlefield']
        self.assertEqual((b['width'],b['height'],len(s['units'])),(36,44,64))
        self.assertEqual(len({u['kind'] for u in s['units']}),14)
        self.assertEqual(len({u['id'] for u in s['units']}),64)
        self.assertEqual(len({tuple(u['pos']) for u in s['units'] if active(u)}),sum(active(u) for u in s['units']))
        for u in s['units']:
            self.assertTrue(0<=u['pos'][0]<36 and 0<=u['pos'][1]<44)
            if active(u):self.assertNotEqual(buildings.condition(s,u['pos']),'destroyed')
        self.assertEqual(sum(bool(u.get('carrier_id')) for u in s['units']),4)
        self.assertFalse(any(u['side']=='de' and u['kind']=='paratrooper' for u in s['units']))
        self.assertTrue({'beach','marsh','bocage','bunker','causeway'} <= {t for row in b['map'] for t in row})
        with self.assertRaises(ValueError):initial('tidal_gate','classic')
        s['battlefield']['map'][0][0]='water'
        self.assertNotEqual(initial('tidal_gate','dsl')['battlefield']['map'][0][0],'water')

    def test_armor_and_landing_routes_exist(self):
        s=self.battle();b=s['battlefield']
        for u in s['units']:
            if u['kind'] not in {'tank','halftrack','landing_craft'}:continue
            seen={tuple(u['pos'])};q=deque(seen)
            while q:
                p=q.popleft()
                for n in fieldworks.neighbors(s,p):
                    if tuple(n) not in seen and fieldworks.movement(u,terrain(*n,s))[0] and buildings.enterable(s,n):seen.add(tuple(n));q.append(tuple(n))
            if u['kind']=='landing_craft':self.assertTrue(any(y==35 for x,y in seen))
            else:self.assertIn(tuple(b['objective']),seen,u['id'])

    def test_town_alone_does_not_win_but_either_exit_connects(self):
        for exit_id in ('west','east'):
            s=self.battle();self.occupy(s,[18,10])
            for side in ('us','de','us'):s=apply(s,side,{'kind':'end'})
            self.assertIsNone(s['winner']);self.assertEqual(s['hold'],0)
            self.occupy(s,next(p['pos'] for p in s['battlefield']['linked_objectives'] if p['id']==exit_id))
            for side in ('de','us','de','us'):s=apply(s,side,{'kind':'end'})
            self.assertEqual(s['winner'],'us');self.assertEqual(s['victories']['us'],1)

    def test_vehicles_cannot_garrison_and_losing_link_resets(self):
        s=self.battle();self.occupy(s,[18,10]);self.occupy(s,[6,24],'tank')
        self.assertFalse(linked_front.connected(s))
        self.occupy(s,[6,24]);s=apply(s,'us',{'kind':'end'})
        self.assertEqual(s['hold'],1)
        next(u for u in s['units'] if active(u) and u['pos']==[6,24])['pos']=[5,24]
        linked_front.refresh(s);self.assertEqual(s['hold'],0)
        self.assertIsNone(s['objective_control']['west'])

    def test_pins_hold_but_reserves_and_passengers_do_not(self):
        s=self.battle();self.occupy(s,[18,10]);self.occupy(s,[6,24]);g=s['units'][-1]
        g['pinned']=True;linked_front.refresh(s);self.assertTrue(linked_front.connected(s))
        g['reserve']=True;linked_front.refresh(s);self.assertFalse(linked_front.connected(s))
        g['reserve']=False;g['carrier_id']='test';linked_front.refresh(s);self.assertFalse(linked_front.connected(s))

    def test_timed_reserves_wait_for_turn_and_entry(self):
        s=self.battle();us=next(u for u in s['units'] if u.get('arrival_round')==5)
        de=next(u for u in s['units'] if u.get('arrival_round')==6)
        self.assertFalse(options(s,us)['drops']);self.assertFalse(options(s,us)['moves'])
        s.update(round=4,turn='de');block=unit('us','squad',us['pos'],'TEST',1);s['units'].append(block)
        s=apply(s,'de',{'kind':'end'});self.assertTrue(next(u for u in s['units'] if u['id']==us['id'])['reserve'])
        next(u for u in s['units'] if u['id']==block['id'])['pos']=[15,34]
        s=apply(s,'us',{'kind':'end'});self.assertTrue(next(u for u in s['units'] if u['id']==de['id'])['reserve'])
        s=apply(s,'de',{'kind':'end'});arrived=next(u for u in s['units'] if u['id']==us['id'])
        self.assertFalse(arrived['reserve']);self.assertEqual(arrived['ap'],arrived['base_ap'])
        s=apply(s,'us',{'kind':'end'});self.assertFalse(next(u for u in s['units'] if u['id']==de['id'])['reserve'])

    def test_terrain_entry_cover_and_sight(self):
        s=self.field();p=[6,5]
        for tile,enter,cost,cover in [('beach',True,1,0),('marsh',True,2,0),('bocage',True,2,1),('bunker',True,2,2),('rubble',True,2,1),('causeway',True,1,0)]:
            s['battlefield']['map'][5][6]=tile
            self.assertEqual(fieldworks.movement(s['units'][0],tile),(enter,cost))
            self.assertEqual(buildings.cover(s,p),cover)
        for tile in ('marsh','bocage','bunker'):self.assertFalse(fieldworks.movement(s['units'][1],tile)[0])
        self.assertEqual(fieldworks.movement({'kind':'amphibious'},'marsh'),(True,1))
        s['battlefield']['map'][5][6]='bocage';self.assertFalse(line_clear([5,5],[7,5],state=s))

    def test_breach_pays_ap_opens_lane_and_is_reversible(self):
        s=self.field();s['battlefield']['map'][5][6]='bocage'
        out=perform(s,'us',dict(kind='breach',unit=s['units'][0]['id'],pos=[6,5]))
        self.assertEqual(terrain(6,5,out),'field');self.assertEqual(out['units'][0]['ap'],0)
        self.assertTrue(line_clear([5,5],[7,5],state=out));self.assertTrue(status(out,'us')['can_undo'])
        undone=perform(out,'us',{'kind':'undo'});self.assertEqual(terrain(6,5,undone),'bocage')
        redone=perform(undone,'us',{'kind':'redo'});self.assertEqual(terrain(6,5,redone),'field')

    def test_bridge_requires_banked_ap_kit_and_opposite_firm_banks(self):
        s=self.field();s['battlefield']['map'][5][6]='water';u=s['units'][0]
        self.assertEqual(options(s,u)['bridge_gap'],[])
        s=apply(apply(s,'us',{'kind':'end'}),'de',{'kind':'end'});u=s['units'][0]
        self.assertEqual(u['ap'],3);self.assertIn([6,5],options(s,u)['bridge_gap'])
        out=self.order(s,'bridge_gap',[6,5]);self.assertEqual(terrain(6,5,out),'bridge');self.assertEqual(out['units'][0]['bridge_kits'],0)
        out['units'][0]['ap']=3;out['battlefield']['map'][4][5]='water';self.assertFalse(options(out,out['units'][0])['bridge_gap'])
        for p in fieldworks.neighbors(s,[6,5]):s['battlefield']['map'][p[1]][p[0]]='water'
        s['battlefield']['map'][5][5]='field';self.assertFalse(fieldworks.bridgeable(s,[6,5]))

    def test_bunker_damage_collapse_and_clearing(self):
        s=self.field();s['battlefield']['map'][5][6]='bunker';s['buildings']['6,5']='intact'
        buildings.hit(s,[6,5]);self.assertEqual(buildings.cover(s,[6,5]),1)
        self.assertEqual(options(s,s['units'][0])['clear_wreck'],[])
        buildings.hit(s,[6,5]);self.assertFalse(buildings.enterable(s,[6,5]))
        out=self.order(s,'clear_wreck',[6,5]);self.assertEqual(terrain(6,5,out),'rubble');self.assertTrue(buildings.enterable(out,[6,5]))
        self.assertEqual(buildings.cover(out,[6,5]),1)
        self.assertEqual(fieldworks.movement(out['units'][1],'rubble'),(True,2))

    def test_invalid_and_legacy_engineering_rejected(self):
        s=self.field();s['battlefield']['map'][5][6]='bocage'
        for patch in ({'pinned':True},{'ap':1},{'reserve':True},{'carrier_id':'boat'}):
            v=copy.deepcopy(s);v['units'][0].update(patch)
            with self.assertRaises(ValueError):self.order(v,'breach',[6,5])
        s.pop('fieldworks_version')
        with self.assertRaises(ValueError):self.order(s,'breach',[6,5])
        for name in ('midway','britain'):self.assertNotIn('fieldworks_version',initial(name,'dsl'))

    def test_hidden_work_stays_out_of_public_state_and_replay(self):
        s=self.field();s['fog_of_war']=True;s['battlefield']['map'][5][6]='bocage';update_intel(s)
        # DE cannot see the distant engineer or its route.
        before=view(s,'de');out=self.order(s,'breach',[6,5]);public=public_state(out,'de')
        self.assertEqual(public['map'][5][6],'bocage');self.assertEqual(public['battlefield']['map'][5][6],'bocage')
        self.assertEqual(public['fieldworks'],{});self.assertNotIn('fieldworks_intel',public)
        self.assertEqual(view(out,'de')['fieldworks'],before['fieldworks'])
        self.assertEqual(public_state(out,'us')['map'][5][6],'field')
        out['units'][2]['pos']=[7,5];update_intel(out)
        self.assertEqual(public_state(out,'de')['map'][5][6],'field')
        self.assertTrue(fieldworks.revealed(self.order(s,'breach',[6,5]),out))

    def test_hidden_units_do_not_change_engineering_or_movement_preview(self):
        s=self.field();s['fog_of_war']=True;s['battlefield']['map'][5][6]='bocage';update_intel(s)
        before=options(s,s['units'][0]);s['units'][2]['pos']=[20,20]
        after=options(s,s['units'][0]);self.assertEqual(before,after)

    def test_public_flags_are_explicit_and_do_not_list_garrisons(self):
        s=self.battle();p=public_state(s,'us')
        self.assertEqual(p['objective_control'],{'west':'de','east':'de','town':'de'})
        self.assertNotIn('de-C-2',{u['id'] for u in p['units']})
        self.assertEqual(view(s,'us')['objective_control'],p['objective_control'])

    def test_shared_engineering_available_on_older_maps_and_save_roundtrip(self):
        for name in ('frontier','stalingrad','carentan','market_garden','omaha'):
            s=initial(name,'dsl');self.assertEqual(s['fieldworks_version'],1)
            self.assertTrue(all(u['bridge_kits']==1 for u in s['units'] if u['kind']=='engineer'))
        s=self.field();s['battlefield']['map'][5][6]='bocage';out=self.order(s,'breach',[6,5])
        restored=json.loads(json.dumps(out));self.assertEqual(terrain(6,5,restored),'field')
        self.assertEqual(column(25),'Z');self.assertEqual(column(26),'AA');self.assertEqual(column(35),'AJ')

    def test_computer_uses_engineering_and_public_front_assignments(self):
        s=self.field();s['battlefield']['objective']=[9,5];s['battlefield']['map'][5][6]='bocage'
        order=choose_order(s,objective_costs(s),{})
        self.assertEqual(order['kind'],'breach')
        t=self.battle()
        for group,goal in [('A',[6,24]),('B',[29,24]),('HQ',[18,10])]:
            self.assertEqual(linked_front.goal(t,{'platoon':group}),goal)


if __name__=='__main__':unittest.main()
