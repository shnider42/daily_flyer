"""Finite air operations, network defense, privacy and saved-match isolation."""
import copy
import json
import random
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import air, britain2, cooperative
from ww2_tactics.engine import initial, options, apply
from ww2_tactics.computer import choose_order, play_turn
from ww2_tactics.visibility import active, visible_ids, public_state
from ww2_tactics.scenarios import catalog, get_scenario

MAP = 'current:britain_2'


class Britain2RulesTests(unittest.TestCase):
    def battle(self, side='us'):
        s = initial(MAP, 'dsl'); s.update(ready=True, turn=side)
        return s

    def field(self, s, side='us', group='A'):
        return next(u for u in s['units'] if u['side'] == side and u['platoon'] == group and u['kind'] == 'airfield')

    def plane(self, s, side='us', role=None):
        return next(u for u in s['units'] if u['side'] == side and u['kind'] in {'fighter', 'bomber'} and (not role or u['britain_role'] == role))

    def byid(self, s, uid):
        return next(u for u in s['units'] if u['id'] == uid)

    def launch(self, s, p=None):
        p = p or self.plane(s, s['turn']); f = self.byid(s, p['carrier_id'])
        choice = next(c for c in options(s, f)['scramble'] if c['id'] == p['id'])
        pos = next((d['pos'] for d in choice['destinations'] if d['pos'] != f['pos']), choice['destinations'][0]['pos'])
        return apply(s, s['turn'], dict(kind='scramble', unit=f['id'], target=p['id'], pos=pos), roll=lambda:1)

    def next_turn(self, s):
        out = apply(s, s['turn'], {'kind': 'end'})
        return apply(out, out['turn'], {'kind': 'end'})

    def test_separate_current_daytime_map_named_asymmetric_finite_forces(self):
        s = self.battle()
        self.assertIn(MAP, {b['id'] for b in catalog('current')})
        self.assertNotIn('britain_2', {b['id'] for b in catalog()})
        with self.assertRaises(ValueError): get_scenario('britain_2')
        with self.assertRaises(ValueError): initial(MAP, 'classic')
        self.assertEqual(s['units'], self.battle()['units'])
        self.assertEqual((s['battlefield']['width'], s['battlefield']['height']), (24, 20))
        self.assertFalse(s.get('night_ops_version'))
        self.assertEqual([sum(u['kind'] in {'fighter', 'bomber'} and u['side'] == side for u in s['units']) for side in ('us','de')], [6,10])
        self.assertEqual(sum(u['kind'] == 'bomber' for u in s['units']), 4)
        self.assertTrue(all(u.get('display_name') for u in s['units']))
        self.assertEqual(len({u['display_name'] for u in s['units']}), len(s['units']))
        self.assertIn('sortie_fuel', s['rule_manifest']['systems'])
        for name in ('britain', 'current:britain', 'current:midway_2'):
            self.assertFalse(initial(name, 'dsl').get('britain_ops_version'))

    def test_launch_is_finite_costed_and_grounded_flights_cannot_act(self):
        for side in ('us','de'):
            s = self.battle(side); p = self.plane(s, side); f = self.field(s, side)
            self.assertFalse(active(p)); self.assertFalse(options(s, p)['moves'])
            with self.assertRaises(ValueError): apply(s, side, dict(kind='move', unit=p['id'], pos=[10,10]))
            out = self.launch(s, p); airborne = self.byid(out, p['id'])
            self.assertTrue(active(airborne)); self.assertEqual(airborne['fuel'], p['max_fuel']-1)
            self.assertEqual(airborne['ap'], p['ap']-1)
            self.assertEqual(self.byid(out, f['id'])['runway_used'], 1)
            self.assertEqual(self.byid(out, f['id'])['ap'], f['ap']-1)
            self.assertEqual(len(out['units']), 26); self.assertFalse(options(out, airborne)['rearm'])
            self.assertIn('carrier_id', p, 'Input state stays immutable')

    def test_land_service_cooldown_refuel_and_no_replacements(self):
        for side, repair in [('us', 2), ('de', 1)]:
            s = self.battle(side); p = self.plane(s, side); uid=p['id']; fid=p['home_field']
            s=self.launch(s,p); p=self.byid(s,uid); p.update(hp=1,fuel=2)
            s=apply(s,side,dict(kind='land',unit=uid,target=fid),roll=lambda:1)
            p=self.byid(s,uid); self.assertEqual((p['ap'],p['fuel'],p['hp']), (0,2,1))
            self.assertTrue(p['sortie_cooldown'])
            s=apply(s,side,dict(kind='field_service',unit=fid,target=uid))
            p=self.byid(s,uid); f=self.byid(s,fid)
            self.assertEqual((p['hp'],p['fuel'],f['runway_used'],f['air_stores']), (1+repair,p['max_fuel'],3,f['max_air_stores']-1))
            self.assertFalse(options(s,f)['scramble'])
            s=self.next_turn(s); f=self.byid(s,fid)
            self.assertEqual(f['runway_used'],0)
            self.assertIn(uid,[c['id'] for c in options(s,f)['scramble']])
            s=self.launch(s,self.byid(s,uid)); self.assertEqual(len(s['units']),26)

    def test_bomber_reloads_only_at_field_with_finite_stores(self):
        s=self.battle('de'); p=self.plane(s,'de','he111'); f=self.byid(s,p['home_field'])
        p.update(hp=3,bombs=0,fuel=2); f['air_stores']=0
        self.assertFalse(options(s,f)['field_service'])
        with self.assertRaises(ValueError): apply(s,'de',dict(kind='field_service',unit=f['id'],target=p['id']))
        f['air_stores']=1
        out=apply(s,'de',dict(kind='field_service',unit=f['id'],target=p['id']))
        self.assertEqual((self.byid(out,p['id'])['bombs'], self.byid(out,p['id'])['hp']), (2,4))
        self.assertEqual(self.byid(out,f['id'])['air_stores'],0)
        with self.assertRaises(ValueError): apply(out,'de',dict(kind='field_service',unit=f['id'],target=p['id']))

    def test_damaged_runway_repair_restores_tempo_without_resetting_usage(self):
        s=self.battle(); f=self.field(s); f['hp']=4
        self.assertEqual(britain2.runway_limit(f),1)
        s=apply(s,'us',dict(kind='station_repair',unit=f['id'])); f=self.byid(s,f['id'])
        self.assertEqual((f['hp'],f['ap'],f['runway_used'],britain2.runway_limit(f)),(6,1,1,3))
        self.assertTrue(options(s,f)['scramble'])
        s=self.launch(s); self.assertEqual(self.field(s)['runway_used'],2)
        self.assertFalse(options(s,self.field(s))['scramble'])

    def test_fuel_per_leg_per_own_turn_and_landing_at_zero(self):
        s=self.launch(self.battle()); p=self.plane(s); uid=p['id']; p['fuel']=3
        move=options(s,p)['moves'][0]
        s=apply(s,'us',dict(kind='move',unit=uid,pos=move['pos']),roll=lambda:1)
        self.assertEqual(self.byid(s,uid)['fuel'],2)
        s=apply(s,'us',{'kind':'end'}); self.assertEqual(self.byid(s,uid)['fuel'],1)
        s=apply(s,'de',{'kind':'end'}); self.assertEqual(self.byid(s,uid)['fuel'],1)
        s=apply(s,'us',{'kind':'end'}); self.assertEqual(self.byid(s,uid)['hp'],0)
        self.assertTrue(any('fuel exhausted' in l for l in s['reports']['us']['log']))
        s=self.launch(self.battle()); p=self.plane(s); p['fuel']=0
        self.assertFalse(options(s,p)['moves']); self.assertTrue(options(s,p)['land'])
        s=apply(s,'us',dict(kind='land',unit=p['id'],target=p['home_field']),roll=lambda:1)
        s=self.next_turn(s); self.assertGreater(self.byid(s,p['id'])['hp'],0)
        self.assertNotIn(p['id'],[c['id'] for c in options(s,self.field(s))['scramble']])

    def test_radar_guidance_needs_both_network_parts_and_matches_actual_roll(self):
        s=self.battle(); p=self.plane(s,role='hurricane'); p.pop('carrier_id'); p.update(pos=[5,7],ap=4)
        enemy=self.plane(s,'de','he111'); enemy.pop('carrier_id'); enemy['pos']=[6,7]
        shot=next(t for t in options(s,p)['targets'] if t['id']==enemy['id'])
        self.assertEqual(shot['threshold'],2); self.assertEqual(shot['modifiers']['radar_guidance'],-1)
        out=apply(s,'us',dict(kind='fire',unit=p['id'],target=enemy['id']),roll=lambda:2)
        self.assertEqual(self.byid(out,enemy['id'])['hp'],enemy['hp']-1)
        for u in s['units']:
            if u['kind']=='radar': u['hp']=0
        self.assertEqual(next(t for t in options(s,p)['targets'] if t['id']==enemy['id'])['threshold'],3)
        s=self.battle(); p=self.plane(s); enemy=self.plane(s,'de');p.pop('carrier_id');enemy.pop('carrier_id')
        p['pos']=[5,7];enemy['pos']=[6,7]
        for u in s['units']:
            if u['kind']=='airfield' and u['side']=='us':u['hp']=0
        self.assertFalse(britain2.guided(s,p,enemy))

    def test_threat_preview_and_enemy_projection_do_not_reveal_readiness(self):
        s=self.launch(self.battle()); p=self.plane(s); enemy=self.plane(s,'de');enemy.pop('carrier_id')
        enemy.update(pos=[p['pos'][0]+2,p['pos'][1]],overwatch=False)
        a=copy.deepcopy(options(s,p)['moves']);enemy['overwatch']=True
        self.assertEqual(a,options(s,p)['moves'])
        v=public_state(s,'us'); e=self.byid(v,enemy['id'])
        self.assertFalse(e['overwatch'])
        for key in ('fuel','home_field','service_used','sortie_cooldown'): self.assertNotIn(key,e)
        self.assertNotIn('raid_damage',v)
        self.assertNotIn(self.plane(s,'de','he111')['id'],{u['id'] for u in v['units']})

    def test_close_escort_applies_to_fighter_preview_and_reaction_but_not_aa(self):
        s=self.battle();p=self.plane(s,role='hurricane');p.pop('carrier_id');p['pos']=[5,7]
        bomber=self.plane(s,'de','he111');bomber.pop('carrier_id');bomber['pos']=[6,7]
        escort=self.plane(s,'de');escort.pop('carrier_id');escort['pos']=[7,7]
        preview=next(t for t in options(s,p)['targets'] if t['id']==bomber['id'])
        self.assertEqual(preview['threshold'],3)
        self.assertEqual(preview['modifiers']['close_escort'],1)
        out=apply(s,'us',dict(kind='fire',unit=p['id'],target=bomber['id']),roll=lambda:2)
        self.assertEqual(self.byid(out,bomber['id'])['hp'],bomber['hp'])
        air.resolve_shot(s,p,bomber,lambda:3,True)
        self.assertEqual(s['last_combat']['threshold'],4)
        self.assertEqual(bomber['hp'],bomber['max_hp'])
        aa=next(u for u in s['units'] if u['side']=='us' and u['kind']=='aa_gun')
        self.assertNotIn('close_escort',britain2.modifiers(s,aa,bomber))
        escort['carrier_id']=escort['home_field']
        self.assertNotIn('close_escort',britain2.modifiers(s,p,bomber))

    def test_computer_turn_records_redacted_replay_with_public_raid_progress(self):
        s=self.battle('de');s['ai_side']='de'
        out=play_turn(s,roll=lambda:4)
        self.assertEqual(out['turn'],'us')
        self.assertGreater(out['revision'],s['revision'])
        replay=out['computer_playback']
        self.assertTrue(replay)
        self.assertNotIn('raid_damage',json.dumps(replay))
        self.assertIn('raid_score',json.dumps(replay))

    def test_launch_interception_and_hidden_occupancy_are_authoritative(self):
        s=self.battle(); p=self.plane(s); f=self.field(s)
        choice=options(s,f)['scramble'][0]; pos=choice['destinations'][0]['pos']
        enemy=self.plane(s,'de');enemy.pop('carrier_id');enemy.update(pos=[pos[0]+1,pos[1]],overwatch=True)
        out=apply(s,'us',dict(kind='scramble',unit=f['id'],target=p['id'],pos=pos),roll=lambda:6)
        self.assertEqual(self.byid(out,p['id'])['hp'],p['hp']-2);self.assertFalse(self.byid(out,enemy['id'])['overwatch'])
        enemy['pos']=pos.copy()
        with patch('ww2_tactics.visibility.visible_ids',return_value={u['id'] for u in s['units'] if u['side']=='us'}):
            self.assertTrue(any(d['pos']==pos for c in options(s,f)['scramble'] for d in c['destinations']))
            with self.assertRaises(ValueError):apply(s,'us',dict(kind='scramble',unit=f['id'],target=p['id'],pos=pos))

    def test_destroyed_field_loses_only_grounded_flights_and_diversion_is_possible(self):
        s=self.launch(self.battle()); p=self.plane(s); f=self.field(s); f['hp']=0
        britain2.after_order(s)
        self.assertTrue(active(p)); self.assertTrue(all(u['hp']==0 for u in s['units'] if u.get('carrier_id')==f['id']))
        other=self.field(s,group='B');p['pos']=other['pos'].copy();p['ap']=2
        self.assertIn(other['id'],options(s,p)['land'])
        s=apply(s,'us',dict(kind='land',unit=p['id'],target=other['id']),roll=lambda:1)
        self.assertEqual(self.byid(s,p['id'])['home_field'],f['id'])

    def test_raid_damage_cannot_be_farmed_by_repairs(self):
        s=self.battle(); f=self.field(s); f['hp']=5; britain2.after_order(s)
        self.assertEqual(s['raid_score'],3)
        s=apply(s,'us',dict(kind='station_repair',unit=f['id']));f=self.field(s)
        self.assertEqual((f['hp'],s['raid_score']),(7,3))
        f['hp']=5;britain2.after_order(s);self.assertEqual(s['raid_score'],3)
        f['hp']=3;britain2.after_order(s);self.assertEqual(s['raid_score'],5)

    def test_bomb_loads_profiles_and_victory_deadline(self):
        s=self.battle('de');p=self.plane(s,'de','ju88');p.pop('carrier_id');f=self.field(s)
        p.update(pos=f['pos'].copy(),ap=3);s['fog_of_war']=False
        out=apply(s,'de',dict(kind='fire',unit=p['id'],target=f['id']),roll=lambda:6)
        self.assertEqual((self.field(out)['hp'],out['raid_score'],self.byid(out,p['id'])['bombs']),(5,3,0))
        self.assertFalse(options(out,self.byid(out,p['id']))['targets'])
        s=self.battle('de');s['round']=18
        self.assertEqual(apply(s,'de',{'kind':'end'})['winner'],'us')
        s=self.battle();
        for u in s['units']:
            if u['kind']=='bomber':u['hp']=0
        self.assertEqual(apply(s,'us',{'kind':'end'})['winner'],'us')
        s=self.battle('de')
        for u in s['units']:
            if u['side']=='us' and u['kind']=='airfield':u['hp']=1
        out=apply(s,'de',{'kind':'end'});self.assertEqual(out['raid_score'],14);self.assertEqual(out['winner'],'de')
        self.assertEqual(out['victories']['de'],1)
        for damage, winner in [(8,'us'),(9,'de')]:
            s=self.battle('de');s['round']=18
            fields=[u for u in s['units'] if u['side']=='us' and u['kind']=='airfield']
            fields[0]['hp']=3;fields[1]['hp']=8-(damage-5)
            out=apply(s,'de',{'kind':'end'})
            self.assertEqual((out['raid_score'],out['winner']),(damage,winner))

    def test_coop_airfields_and_flights_share_control(self):
        for size in ('units','platoons'):
            s=self.battle();cooperative.initialize(s,dict(side='us',control_size=size),'host','Tester')
            for p in s['units']:
                if p.get('home_field'):
                    self.assertEqual(cooperative.group_for(s,p['id']),cooperative.group_for(s,p['home_field']))
            p=self.plane(s);self.assertFalse(britain2.same_command(s,p,self.field(s,group='B')))

    def test_computer_uses_legal_orders_and_preserves_finite_force(self):
        rng=random.Random(44);s=self.battle();visited={};kinds=set()
        for _ in range(100):
            action=choose_order(s,{},visited);kinds.add(action['kind'])
            s=apply(s,s['turn'],action,roll=lambda:rng.randint(1,6))
            if action['kind']=='end':visited={}
            elif action['kind']=='move':visited.setdefault(action['unit'],set()).add(tuple(action['pos']))
            self.assertEqual(len(s['units']),26)
            self.assertTrue(all(u.get('fuel',0)>=0 and u['ap']>=0 for u in s['units']))
            if s['winner']:break
        self.assertIn('scramble',kinds);self.assertIn('move',kinds);self.assertIn('fire',kinds)

    def test_ai_returns_low_fuel_flight_and_does_not_use_hidden_enemies(self):
        s=self.launch(self.battle());p=self.plane(s);p['fuel']=2
        self.assertEqual(choose_order(s,{}, {})['kind'],'land')
        s=self.battle();a=choose_order(s,{}, {})
        for u in s['units']:
            if u['side']=='de':u['pos']=[23,19];u['fuel']=1;u['overwatch']=True
        self.assertEqual(a,choose_order(s,{}, {}))

    def test_api_save_restore_and_stale_revision(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=tmp+'/battle.sqlite';c=create_app(db).test_client()
            host=c.post('/api/match',json=dict(scenario=MAP,ruleset='dsl')).json
            self.assertIn('token',host);c.post('/api/match/'+host['code']+'/join')
            headers={'Authorization':'Bearer '+host['token']};url='/api/match/'+host['code']
            s=c.get(url,headers=headers).json;f=self.field(s);entry=s['legal'][f['id']]['scramble'][0]
            order=dict(kind='scramble',unit=f['id'],target=entry['id'],pos=entry['destinations'][0]['pos'],revision=s['revision'])
            response=c.post(url,headers=headers,json=order);self.assertEqual(response.status_code,200,response.json)
            after=response.json;self.assertEqual(c.post(url,headers=headers,json=order).status_code,409)
            restored=create_app(db).test_client().get(url,headers=headers).json
            for key in ('units','raid_score','raid_sites_lost','britain_ops_version','legal'):
                self.assertEqual(after[key],restored[key])
            self.assertNotIn('raid_damage',restored)


if __name__ == '__main__':
    unittest.main()
