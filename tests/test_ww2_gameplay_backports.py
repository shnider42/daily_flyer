"""New-match-only air support and Midway-derived carrier turnaround."""
import copy
import json
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import air, air_support, carrier_decks, cooperative, domains, fubar, midway2
from ww2_tactics.computer import play_turn
from ww2_tactics.engine import initial, apply, options, watchers
from ww2_tactics.visibility import active, public_state, update_intel


class GameplayBackportTests(unittest.TestCase):
    def battle(self, name='fubar', side='us'):
        s=initial('current:'+name,'dsl');s.update(ready=True,turn=side,fog_of_war=False)
        return s

    def unit(self,s,kind,side='us',group=None):
        return next(u for u in s['units'] if u['kind']==kind and u['side']==side
                    and (group is None or u['platoon']==group))

    def byid(self,s,uid):
        return next(u for u in s['units'] if u['id']==uid)

    def next_turn(self,s):
        s=apply(s,s['turn'],dict(kind='end'),roll=lambda:1)
        return apply(s,s['turn'],dict(kind='end'),roll=lambda:1)

    def test_capabilities_are_explicit_and_do_not_change_other_maps(self):
        from ww2_tactics.scenarios import catalog
        for board in catalog('current'):
            name=board['source_id']
            self.assertEqual(bool(board.get('air_support')),name in air_support.MAPS or name=='the_war_1',name)
            self.assertEqual(bool(board.get('carrier_decks_version')),name in {'crosswind_strait','the_war_1'},name)
        for name in ('britain','fubar','midway'):
            s=initial(name,'dsl')
            self.assertNotIn('air_support_version',s);self.assertNotIn('carrier_decks_version',s)
        # No backport flags or policy are added to Midway 2.0.
        s=self.battle('midway_2')
        self.assertNotIn('air_support_version',s);self.assertNotIn('carrier_decks_version',s)
        self.assertEqual(s['midway_ops_version'],1)

    def test_six_service_uses_per_field_and_authored_forces_remain(self):
        for name,fields,planes in [('britain',4,10),('fubar',2,6),('worlds_collide',4,10)]:
            s=self.battle(name)
            self.assertEqual(sum(u['kind']=='airfield' for u in s['units']),fields)
            self.assertEqual(sum(domains.is_air(u) for u in s['units']),planes)
            for field in [u for u in s['units'] if u['kind']=='airfield']:
                self.assertEqual((field['air_stores'],field['max_air_stores']),(6,6))
            for side in ('us','de'):
                for u in s['units']:
                    if u['side']==side and u['kind'] in domains.SHIPS:
                        self.assertEqual((u['ship_aa_range'],u['weapon_overrides']['flak']['damage']),(1,1))

    def test_service_cost_depletion_once_per_turn_and_no_regeneration(self):
        for name in air_support.MAPS:
            s=self.battle(name,'de');plane=self.unit(s,'bomber','de');field=self.unit(s,'airfield','de')
            plane.update(pos=field['pos'].copy(),hp=2,bombs=0,ap=4)
            field['air_stores']=1
            out=apply(s,'de',dict(kind='rearm',unit=plane['id']))
            p=self.byid(out,plane['id']);f=self.byid(out,field['id'])
            self.assertEqual((p['hp'],p['bombs'],p['ap'],f['air_stores']),(3,2,2,0))
            self.assertEqual(field['air_stores'],1)  # Pure apply.
            self.assertFalse(options(out,p)['rearm'])
            out=self.next_turn(out);p=self.byid(out,plane['id']);p.update(hp=2,bombs=0)
            self.assertEqual(self.byid(out,field['id'])['air_stores'],0)
            self.assertFalse(options(out,p)['rearm'])
            before=copy.deepcopy(out)
            with self.assertRaises(ValueError):apply(out,'de',dict(kind='rearm',unit=p['id']))
            self.assertEqual(out,before)
            air_support.initialize(out)
            self.assertEqual(self.byid(out,field['id'])['air_stores'],0)

    def test_service_requires_alive_owned_stocked_nearby_field(self):
        s=self.battle();p=self.unit(s,'bomber');field=self.unit(s,'airfield')
        p.update(pos=field['pos'].copy(),hp=2,bombs=0,ap=4)
        self.assertTrue(options(s,p)['rearm'])
        for changes in [dict(hp=0),dict(air_stores=0),dict(side='de'),dict(platoon='B'),dict(reserve=True),dict(carrier_id='loaded'),dict(pos=[0,0])]:
            saved=copy.deepcopy(field);field.update(changes)
            self.assertFalse(options(s,p)['rearm'],changes)
            field.clear();field.update(saved)
        field['platoon']='HQ';self.assertTrue(options(s,p)['rearm'])
        p.update(hp=p['max_hp'],bombs=p.get('max_bombs',2));self.assertFalse(options(s,p)['rearm'])

    def test_ai_service_destinations_exclude_empty_enemy_and_other_group_fields(self):
        s=self.battle('worlds_collide');p=self.unit(s,'bomber')
        fields=[u for u in s['units'] if u['kind']=='airfield' and u['side']=='us']
        fields[0]['air_stores']=0
        self.assertEqual([u['id'] for u in air_support.service_fields(s,p)],[fields[1]['id']])
        fields[1]['platoon']='B';self.assertEqual(air_support.service_fields(s,p),[])

    def test_light_ship_aa_direct_and_flight_interception_only(self):
        s=self.battle();ship=self.unit(s,'cruiser');p=self.unit(s,'bomber','de')
        s['battlefield']['map']=[['water']*36 for _ in range(32)]
        s['units']=[ship,p];ship.update(pos=[5,10],ap=4);p.update(pos=[5,9],ap=3)
        shot=next(t for t in options(s,ship)['targets'] if t['id']==p['id'])
        self.assertEqual((shot['weapon'],shot['damage']),('flak',1))
        direct=apply(s,'us',dict(kind='fire',unit=ship['id'],target=p['id']),roll=lambda:6)
        self.assertEqual(self.byid(direct,p['id'])['hp'],p['hp']-1)
        s=apply(s,'us',dict(kind='overwatch',unit=ship['id']));s['turn']='de'
        p=self.byid(s,p['id']);p['pos']=[5,8]
        out=apply(s,'de',dict(kind='move',unit=p['id'],pos=[5,10]),roll=lambda:6)
        self.assertEqual(self.byid(out,p['id'])['hp'],p['hp']-1)
        self.assertFalse(self.byid(out,ship['id'])['overwatch'])
        self.assertEqual(out['last_combat']['kind'],'AA interception')
        self.assertEqual(watchers(s,dict(p,kind='destroyer'),[5,9]),[])
        self.assertNotIn(ship['id'],[u['id'] for u in air.watchers(s,p,[5,7])])

    def test_ship_movement_and_fire_cancel_interception(self):
        s=self.battle();ship=self.unit(s,'destroyer');ship.update(ap=4,overwatch=True)
        pos=options(s,ship)['moves'][0]['pos']
        out=apply(s,'us',dict(kind='move',unit=ship['id'],pos=pos))
        self.assertFalse(self.byid(out,ship['id'])['overwatch'])

    def test_old_current_states_keep_unlimited_field_service_and_no_new_aa(self):
        with patch('ww2_tactics.air_support.configure'):
            s=self.battle()
        self.assertNotIn('air_support_version',s)
        plane=self.unit(s,'bomber');field=self.unit(s,'airfield');plane.update(pos=field['pos'].copy(),bombs=0)
        s=apply(s,'us',dict(kind='rearm',unit=plane['id']))
        self.assertNotIn('air_stores',self.byid(s,field['id']))
        ship=self.unit(s,'carrier');self.assertFalse(options(s,ship)['overwatch'])
        self.assertNotIn('air_support_version',json.loads(json.dumps(s)))

    def test_private_service_stock_and_interception_are_not_projected(self):
        s=self.battle();s['fog_of_war']=True
        p=self.unit(s,'fighter');enemy=self.unit(s,'airfield','de');enemy['pos']=p['pos'].copy()
        ship=self.unit(s,'carrier','de');ship.update(pos=p['pos'].copy(),overwatch=True)
        update_intel(s);view=public_state(s,'us')
        self.assertNotIn('air_stores',self.byid(view,enemy['id']))
        self.assertFalse(self.byid(view,ship['id'])['overwatch'])
        self.assertEqual(self.unit(view,'airfield')['air_stores'],6)

    def test_crosswind_keeps_airborne_opening_and_original_victory(self):
        s=self.battle('crosswind_strait')
        self.assertEqual(len(s['units']),28)
        self.assertTrue(all(active(u) for u in s['units']))
        for cv in [u for u in s['units'] if u['kind']=='carrier']:
            self.assertEqual((cv['air_capacity'],cv['max_air_stores'],cv['service_repair']),(3,6,1))
            self.assertEqual(sum(u.get('home_carrier')==cv['id'] for u in s['units']),3)
        for u in s['units']:
            if u['kind']=='carrier' and u['side']=='de':u['hp']=0
        self.assertIsNone(apply(s,'us',dict(kind='end'))['winner'])
        s['joint_score']['us']=11;self.unit(s,'destroyer')['pos']=[4,10]
        self.assertEqual(apply(s,'us',dict(kind='end'))['winner'],'us')

    def test_crosswind_recover_service_and_relaunch_share_deck_budget(self):
        for side in ('us','de'):
            s=self.battle('crosswind_strait',side);cv=self.unit(s,'carrier',side);p=self.unit(s,'bomber',side)
            p.update(pos=cv['pos'].copy(),hp=2,bombs=0)
            self.assertFalse(options(s,p)['rearm']);self.assertFalse(options(s,cv)['recon'])
            s=apply(s,side,dict(kind='recover',unit=p['id'],target=cv['id']),roll=lambda:1)
            p=self.byid(s,p['id']);cv=self.byid(s,cv['id'])
            self.assertEqual((p['carrier_id'],p['ap'],cv['deck_used']),(cv['id'],0,1))
            self.assertFalse(active(p));self.assertFalse(options(s,p)['targets'])
            s=apply(s,side,dict(kind='deck_service',unit=cv['id'],target=p['id']))
            p=self.byid(s,p['id']);cv=self.byid(s,cv['id'])
            self.assertEqual((p['hp'],p['bombs'],cv['deck_used'],cv['air_stores']),(3,p['max_bombs'],2,5))
            self.assertFalse(options(s,cv)['launch'])
            s=self.next_turn(s);cv=self.byid(s,cv['id']);p=self.byid(s,p['id'])
            choice=next(e for e in options(s,cv)['launch'] if e['id']==p['id'])
            out=apply(s,side,dict(kind='launch',unit=cv['id'],target=p['id'],pos=choice['destinations'][0]['pos']),roll=lambda:1)
            self.assertTrue(active(self.byid(out,p['id'])))
            self.assertEqual((self.byid(out,cv['id'])['ap'],self.byid(out,p['id'])['ap']),(cv['ap']-1,p['ap']-1))
            self.assertEqual(len(out['units']),28)

    def test_crosswind_damage_capacity_ownership_and_no_refresh_on_init(self):
        s=self.battle('crosswind_strait');cv=self.unit(s,'carrier');p=self.unit(s,'bomber')
        cv.update(hp=3,air_stores=0);p.update(pos=cv['pos'].copy(),hp=2,bombs=0)
        other=self.unit(s,'carrier',group='B');other['pos']=cv['pos'].copy()
        self.assertEqual(options(s,p)['recover'],[cv['id']])
        s=apply(s,'us',dict(kind='recover',unit=p['id'],target=cv['id']),roll=lambda:1)
        cv=self.byid(s,cv['id']);self.assertFalse(options(s,cv)['deck_service'])
        self.assertFalse(options(s,cv)['launch']);self.assertEqual(midway2.deck_limit(cv),1)
        carrier_decks.initialize(s);self.assertEqual(cv['air_stores'],0);self.assertEqual(cv['deck_used'],1)

    def test_crosswind_sinking_loses_aboard_not_airborne_and_no_auto_win(self):
        s=self.battle('crosswind_strait');cv=self.unit(s,'carrier');p=self.unit(s,'bomber')
        p['pos']=cv['pos'].copy();s=apply(s,'us',dict(kind='recover',unit=p['id'],target=cv['id']),roll=lambda:1)
        cv=self.byid(s,cv['id']);cv['hp']=0;carrier_decks.after_order(s)
        self.assertEqual(self.byid(s,p['id'])['hp'],0)
        self.assertTrue(active(self.unit(s,'fighter')));self.assertIsNone(s['winner'])

    def test_bounded_ai_orders_still_legal_on_each_affected_map(self):
        for name in (*sorted(air_support.MAPS),'crosswind_strait'):
            for side in ('us','de'):
                s=self.battle(name,side);s.update(ai_side=side,fog_of_war=True)
                out=play_turn(s,roll=lambda:1,max_orders=2)
                self.assertGreater(out['revision'],0,(name,side))
                self.assertTrue(all(u['ap']>=0 for u in out['units']))

    def test_crosswind_coop_cannot_service_teammates_aircraft(self):
        s=initial('current:crosswind_strait','dsl')
        cooperative.initialize(s,dict(control_size='platoons'),'host','Host')
        s=cooperative.setup_action(s,'host',dict(operation='start'))
        cv=self.unit(s,'carrier');p=self.unit(s,'bomber',group='B');p['pos']=cv['pos'].copy()
        self.assertNotIn(cv['id'],options(s,p)['recover'])

    def test_crosswind_unit_command_keeps_airborne_flights_with_their_carrier(self):
        s=initial('current:crosswind_strait','dsl')
        cooperative.initialize(s,dict(control_size='units'),'host','Host')
        s=cooperative.setup_action(s,'host',dict(operation='start'))
        for cv in [u for u in s['units'] if u['kind']=='carrier']:
            for p in [u for u in s['units'] if u.get('home_carrier')==cv['id']]:
                self.assertEqual(cooperative.group_for(s,p['id']),cooperative.group_for(s,cv['id']))
        cv=self.unit(s,'carrier');p=self.unit(s,'bomber');p['pos']=cv['pos'].copy()
        self.assertIn(cv['id'],options(s,p)['recover'])

    def test_save_restore_preserves_new_and_old_capabilities_exactly(self):
        for name in ('britain','fubar','worlds_collide','crosswind_strait'):
            for old in (False,True):
                with tempfile.TemporaryDirectory() as tmp:
                    client=create_app(tmp+'/games.sqlite').test_client()
                    if old:
                        with patch('ww2_tactics.air_support.configure'),patch('ww2_tactics.carrier_decks.configure'):
                            seat=client.post('/api/match',json=dict(scenario='current:'+name,ruleset='dsl',opponent='computer')).json
                    else:
                        seat=client.post('/api/match',json=dict(scenario='current:'+name,ruleset='dsl',opponent='computer')).json
                    url='/api/match/'+seat['code'];headers={'Authorization':'Bearer '+seat['token']}
                    before=client.get(url,headers=headers).json
                    saved=client.post(url+'/save',headers=headers,json={'revision':before['revision']}).json
                    restored=client.post('/api/restore',json={'code':saved['save_code']}).json
                    after=client.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).json
                    for key in ('scenario','units','air_support_version','carrier_decks_version','rule_manifest'):
                        self.assertEqual(before.get(key),after.get(key),(name,old,key))
                    self.assertEqual(bool(after.get('carrier_decks_version')),name=='crosswind_strait' and not old)
                    self.assertEqual(bool(after.get('air_support_version')),name!='crosswind_strait' and not old)


if __name__=='__main__':unittest.main()
