"""Cross-system contracts for the Current-only massive campaign."""
import copy
import json
import unittest
from ww2_tactics.engine import initial,apply,options,terrain
from ww2_tactics import (the_war,domains,airborne,deployment,fubar,cooperative,
                         debrief,weather,battle_setup,ground_roles)
from ww2_tactics.scenarios import TILES,catalog,get_scenario
from ww2_tactics.visibility import active,public_state,unit_sees_hex,sight_calculations,view


class WarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.template=initial('current:the_war_1','dsl')

    def battle(self):
        s=copy.deepcopy(self.template);s['ready']=True;s['deployment']['phase']='battle'
        s['_weather_plan']=['clear']*48
        return s

    def unit(self,s,kind,side='us',group=None):
        return next(u for u in s['units'] if u['kind']==kind and u['side']==side and (group is None or u['platoon']==group))

    def order(self,s,u,kind,**kw):return apply(s,u['side'],dict(kind=kind,unit=u['id'],**kw),roll=lambda:6)

    def test_catalog_snapshot_full_terrain_and_unit_coverage(self):
        b=self.template['battlefield']
        self.assertEqual((b['width'],b['height']),(80,48))
        self.assertEqual(len(self.template['units']),146)
        self.assertEqual(len({u['kind'] for u in self.template['units']}),34)
        self.assertEqual({t for r in b['map'] for t in r},set(TILES.values())|{'rubble'})
        self.assertEqual(len(b['joint_objectives']),8)
        with self.assertRaises(ValueError):get_scenario('the_war_1')
        with self.assertRaises(ValueError):initial('current:the_war_1','classic')
        for u in self.template['units']:
            if not active(u):continue
            self.assertFalse(domains.blocked(self.template,u,u['pos']),u['id'])
            self.assertIn(u['faction'],{'us','gb'} if u['side']=='us' else {'de','jp'})
            if u['kind'] in domains.SHIPS|{'landing_craft'}:self.assertEqual(terrain(*u['pos'],self.template),'water')

    def test_private_deployment_restricts_domains_groups_and_reserves(self):
        s=copy.deepcopy(self.template);s['ready']=True
        cv=self.unit(s,'carrier');tank=self.unit(s,'tank');field=self.unit(s,'airfield')
        for u in (cv,tank,field):
            legal=deployment.zone(s,'us',u)
            self.assertTrue(legal)
            if u is cv:self.assertTrue(all(terrain(*p,s)=='water' for p in legal))
            else:self.assertTrue(all(terrain(*p,s)!='water' for p in legal))
        with self.assertRaises(ValueError):self.order(s,cv,'deploy_unit',pos=[45,31])
        moved=self.order(s,field,'deploy_unit',pos=[68,33])
        self.assertTrue(all(u['pos']==[68,33] for u in moved['units'] if u.get('carrier_id')==field['id']))
        reserve=next(u for u in s['units'] if u['side']=='us' and u.get('arrival_round'))
        with self.assertRaises(ValueError):self.order(s,reserve,'deploy_unit',pos=[32,32])
        pub=public_state(s,'us');self.assertTrue(all(u['side']=='us' for u in pub['units']))
        self.assertNotIn('_weather_plan',pub);self.assertNotIn('_aid_stores',pub)
        s=apply(s,'us',dict(kind='deploy_lock'));s=apply(s,'de',dict(kind='deploy_lock'))
        self.assertFalse(deployment.active(s));self.assertEqual(s['round'],1)
        self.assertFalse(any(u['kind']=='mg' and u['side']=='de' and u['overwatch'] for u in s['units']))

    def test_carrier_flights_launch_recover_service_and_fuel(self):
        s=self.battle();cv=self.unit(s,'carrier');c=options(s,cv)['launch'][0]
        s=self.order(s,cv,'launch',target=c['id'],pos=c['destinations'][0]['pos'])
        plane=next(u for u in s['units'] if u['id']==c['id']);self.assertEqual(plane['fuel'],plane['max_fuel']-1)
        self.assertNotIn('carrier_id',plane)
        s=self.order(s,plane,'recover',target=cv['id'])
        cv=self.unit(s,'carrier');self.assertEqual(cv['deck_used'],2)
        self.assertFalse(options(s,cv)['launch'])
        s=apply(s,'us',dict(kind='end'));s=apply(s,'de',dict(kind='end'))
        cv=self.unit(s,'carrier');self.assertIn(plane['id'],options(s,cv)['deck_service'])
        stores=cv['air_stores'];s=self.order(s,cv,'deck_service',target=plane['id'])
        p=next(u for u in s['units'] if u['id']==plane['id'])
        self.assertEqual(p['fuel'],p['max_fuel']);self.assertTrue(p['deck_cooldown'])
        self.assertEqual(self.unit(s,'carrier')['air_stores'],stores-1)

    def test_weather_limits_both_launch_systems(self):
        s=self.battle();s['_weather_plan'][0]='rain'
        for kind,key in (('carrier','launch'),('airfield','scramble')):
            u=self.unit(s,kind);c=options(s,u)[key][0]
            s=self.order(s,u,key,target=c['id'],pos=c['destinations'][0]['pos'])
            u=next(v for v in s['units'] if v['id']==u['id'])
            self.assertEqual(u['weather_launches'],1);self.assertFalse(options(s,u)[key])

    def test_airfield_round_trip_restores_flares_and_consumes_store(self):
        s=self.battle();f=self.unit(s,'airfield',group='G')
        p=next(u for u in s['units'] if u.get('max_flares'));c=next(c for c in options(s,f)['scramble'] if c['id']==p['id'])
        s=self.order(s,f,'scramble',target=p['id'],pos=c['destinations'][0]['pos'])
        p=next(u for u in s['units'] if u['id']==p['id']);p['flares']=0
        self.assertFalse(options(s,p)['recover'])
        s=self.order(s,p,'land',target=f['id']);f=next(u for u in s['units'] if u['id']==f['id'])
        s=self.order(s,f,'field_service',target=p['id'])
        p=next(u for u in s['units'] if u['id']==p['id']);f=next(u for u in s['units'] if u['id']==f['id'])
        self.assertEqual(p['flares'],p['max_flares']);self.assertEqual(p['fuel'],p['max_fuel'])
        self.assertEqual(f['air_stores'],7);self.assertEqual(f['runway_used'],3)
        self.assertFalse(options(s,f)['scramble'])

    def test_transport_and_commander_have_separate_day_and_night_reserves(self):
        for r in (1,5):
            s=self.battle();s['round']=r
            self.assertEqual(len(airborne.reserves(s,'us')),2)
            transport=self.unit(s,'transport_aircraft');transport.pop('carrier_id');transport.update(pos=[73,23],ap=4)
            before=len(airborne.reserves(s,'us'))
            self.assertTrue(options(s,transport)['airborne_drop'])
            s=self.order(s,transport,'airborne_drop',pos=[73,23])
            self.assertEqual(len(airborne.reserves(s,'us')),before)
            dropped=next(u for u in s['units'] if u.get('drop_transport')==transport['id'] and not u['reserve'])
            self.assertEqual(dropped['ap'],1)
            major=self.unit(s,'commander');self.assertTrue(options(s,major)['airborne_drop'])
            s=self.order(s,major,'airborne_drop',pos=[70,22])
            self.assertEqual(len(airborne.reserves(s,'us')),1)

    def test_grounded_transport_survives_orders_and_dies_with_field(self):
        s=self.battle();p=self.unit(s,'transport_aircraft');f=next(u for u in s['units'] if u['id']==p['carrier_id'])
        s=apply(s,'us',dict(kind='end'));self.assertTrue(all(u['hp']>0 for u in s['units'] if u.get('drop_transport')==p['id']))
        f=next(u for u in s['units'] if u['id']==f['id']);f['hp']=0
        the_war.after_order(s,dict(kind='end'))
        self.assertTrue(all(u['hp']==0 for u in s['units'] if u['id']==p['id'] or u.get('drop_transport')==p['id']))
        self.assertEqual(s['war_raids']['de'],3)
        the_war.after_order(s,dict(kind='end'));self.assertEqual(s['war_raids']['de'],3)

    def test_fuel_exhaustion_debrief_and_no_other_mission_instant_wins(self):
        s=self.battle();p=self.unit(s,'fighter',group='G');p.pop('carrier_id');p['fuel']=1
        s=apply(s,'us',dict(kind='end'))
        self.assertEqual(next(u for u in s['units'] if u['id']==p['id'])['hp'],0)
        self.assertEqual(s['_battle_record']['armies']['us']['losses']['fuel'],1)
        self.assertIsNone(s['winner'])
        for u in s['units']:
            if u['kind'] in {'carrier','bomber'} and u['side']=='de':u['hp']=0
        s=apply(s,'de',dict(kind='end'));self.assertIsNone(s['winner'])

    def test_scoring_links_armor_capture_deadline_and_result(self):
        s=self.battle();flags=s['battlefield']['joint_objectives']
        occupants=[self.unit(s,'destroyer'),next(u for u in s['units'] if u['side']=='us' and u['kind']=='destroyer' and u['id']!=self.unit(s,'destroyer')['id'])]
        occupants += [u for u in s['units'] if u['side']=='us' and u['kind'] in {'squad','leader','engineer'} and active(u)][:6]
        self.assertEqual(len(occupants),8)
        for u,p in zip(occupants,flags):u['pos']=p['pos'][:]
        s=apply(s,'us',dict(kind='end'));self.assertEqual(s['joint_score']['us'],10)
        s['turn']='us';s['joint_score']['us']=60
        s=apply(s,'us',dict(kind='end'));self.assertEqual(s['winner'],'us')
        self.assertIn('70 campaign',battle_setup.result_summary(s)['reason'])
        self.assertEqual(debrief.objective(s)['label'],'Campaign points')
        s=self.battle();tank=self.unit(s,'tank');tank['pos']=[32,23]
        self.assertEqual(next(p for p in fubar.controls(s) if p['id']=='desert')['owner'],'us')
        s.update(turn='de',round=48);s['joint_score']={'us':4,'de':4}
        s=apply(s,'de',dict(kind='end'));self.assertEqual(s['winner'],'de')

    def test_medical_caves_and_suppression_roles_coexist(self):
        s=self.battle();rifle=self.unit(s,'squad',group='B');rifle.update(pos=[43,30],hp=2)
        self.assertTrue(options(s,rifle)['field_aid']);s=self.order(s,rifle,'field_aid')
        self.assertEqual(s['_aid_stores']['us'],7)
        s['turn']='de';rifle=self.unit(s,'squad','de');rifle.update(pos=[58,20],ap=3);rifle.pop('carrier_id',None)
        self.assertIn([58,27],options(s,rifle)['cave_move']);s=self.order(s,rifle,'cave_move',pos=[58,27])
        self.assertEqual(next(u for u in s['units'] if u['id']==rifle['id'])['ap'],0)
        mg=self.unit(s,'mg','de');self.assertFalse(ground_roles.allowed(s,mg,'fire'))
        self.assertFalse(options(s,mg)['overwatch']);self.assertEqual((mg['suppress_min'],mg['suppress_range'],mg['sight']),(2,6,4))
        s['turn']='us';engineer=self.unit(s,'engineer');engineer.update(pos=[62,23],ap=3)
        self.assertIn([63,23],options(s,engineer)['seal_cave']);s=self.order(s,engineer,'seal_cave',pos=[63,23])
        self.assertIn('crest',s['sealed_caves'])

    def test_both_armies_can_rescue_only_finite_marked_teams(self):
        for side in ('us','de'):
            s=self.battle();s['turn']=side;boat=self.unit(s,'landing_craft',side)
            boat['pos']=s['battlefield']['war_evacuation_exits'][side][0][:]
            self.assertTrue(options(s,boat)['evacuate']);s=self.order(s,boat,'evacuate')
            self.assertEqual(s['joint_score'][side],2);self.assertEqual(s['war_rescues'][side],1)
            boat=next(u for u in s['units'] if u['id']==boat['id']);self.assertFalse(options(s,boat)['evacuate'])
            self.assertEqual(sum(u.get('evacuated',False) for u in s['units']),1)

    def test_night_is_scheduled_saved_and_visibility_changes(self):
        s=self.battle();p=self.unit(s,'fighter');p.pop('carrier_id');p['pos']=[7,25]
        self.assertTrue(unit_sees_hex(s,p,[7,30],'air'))
        light=self.unit(s,'spotlight');self.assertFalse(options(s,light)['spotlight'])
        s['round']=5;self.assertTrue(the_war.dark(s));self.assertFalse(unit_sees_hex(s,p,[7,30],'air'))
        self.assertTrue(options(s,light)['spotlight'])
        self.assertEqual(the_war.dark(json.loads(json.dumps(s))),True)
        s.update(turn='de',round=6);s=apply(s,'de',dict(kind='end'))
        self.assertEqual(s['round'],7);self.assertFalse(the_war.dark(s))

    def test_public_and_replay_hide_enemy_resources_and_future_weather(self):
        s=self.battle();s['fog_of_war']=False
        pub=public_state(s,'us')
        self.assertNotIn('_weather_plan',pub);self.assertNotIn('_aid_stores',pub);self.assertNotIn('_war_scored_fields',pub)
        for u in pub['units']:
            if u['side']=='de':self.assertNotIn('fuel',u);self.assertNotIn('runway_used',u)
        self.assertEqual(len(pub['weather']['forecast']),2)
        self.assertEqual(pub['medical_supplies'],8)
        self.assertEqual(pub['war_status']['next_night'],5)

    def test_daytime_air_combat_does_not_leave_night_flash(self):
        from ww2_tactics import air
        for r,dark in ((4,False),(5,True)):
            s=self.battle();s['round']=r
            attacker=self.unit(s,'fighter');target=self.unit(s,'fighter','de')
            air.resolve_shot(s,attacker,target,lambda:1)
            self.assertEqual(bool(attacker.get('night_flash')),dark)

    def test_glider_reserves_and_captain_support_remain_available(self):
        s=self.battle()
        for side in ('us','de'):
            s['turn']=side
            glider=next(u for u in s['units'] if u['side']==side and u['kind']=='paratrooper' and u.get('reserve') and not u.get('airlift_reserve') and not u.get('arrival_round'))
            legal=options(s,glider)
            self.assertTrue(legal['drops'])
            landed=self.order(s,glider,'drop',pos=legal['drops'][0])
            self.assertFalse(next(u for u in landed['units'] if u['id']==glider['id'])['reserve'])
            captain=self.unit(s,'leader',side,group='B')
            self.assertTrue(ground_roles.allowed(s,captain,'barrage'))
            self.assertEqual(s['support'][side],2)

    def test_coop_seven_groups_and_cargo_authority(self):
        s=self.battle();cooperative.initialize(s,dict(control_size='platoons',side='us'),'host','Host')
        for side in ('us','de'):
            groups=[g for g in s['coop']['groups'].values() if g['side']==side and not g['command']]
            self.assertEqual(len(groups),7)
        for u in s['units']:
            base=u.get('carrier_id') or u.get('drop_transport')
            if base:self.assertEqual(cooperative.group_for(s,u['id'])['id'],cooperative.group_for(s,base)['id'])

    def test_night_index_matches_scan_with_distant_public_lighting(self):
        s=self.battle();s['round']=5
        light=self.unit(s,'spotlight','de');light.update(pos=[6,23],beam=[6,30])
        s['night_flares']=[dict(side='us',pos=[50,23],ttl=2)]
        plain=copy.deepcopy(s);plain['battlefield'].pop('sight_index_version')
        for pos in ([6,30],[50,23],[12,25],[73,23]):
            from ww2_tactics.visibility import sees_hex
            with sight_calculations(s):actual=sees_hex(s,'us',pos,'air')
            with sight_calculations(plain):expected=sees_hex(plain,'us',pos,'air')
            self.assertEqual(actual,expected)


if __name__=='__main__':unittest.main()
