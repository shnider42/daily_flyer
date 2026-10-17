import copy
import json
import random
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import weather, debrief, order_history, cooperative
from ww2_tactics.engine import initial, apply, options, distance
from ww2_tactics.visibility import public_state, visible_ids, view, update_intel
from ww2_tactics.computer import choose_order, play_turn


class WeatherDebriefTests(unittest.TestCase):
    def battle(self, map='current:britain_2', side='us', condition='clear'):
        s=initial(map,'dsl');s.update(ready=True,turn=side)
        if weather.enabled(s):s['_weather_plan']=[condition]*s['battlefield']['rounds']
        return s

    def unit(self,s,kind,side='us'):
        return next(u for u in s['units'] if u['side']==side and u['kind']==kind)

    def uid(self,s,uid):
        return next(u for u in s['units'] if u['id']==uid)

    def launch(self,s,base=None):
        base=base or self.unit(s,'airfield' if s.get('britain_ops_version') else 'carrier',s['turn'])
        kind='scramble' if base['kind']=='airfield' else 'launch'
        entry=options(s,base)[kind][0]
        order=dict(kind=kind,unit=base['id'],target=entry['id'],pos=entry['destinations'][0]['pos'])
        return apply(s,s['turn'],order,roll=lambda:1),order

    def test_forecasts_are_bounded_reproducible_and_independent_of_combat_dice(self):
        variants=set()
        for seed in range(20):
            s=self.battle();weather.initialize(s,seed)
            plan=s['_weather_plan'];variants.add(tuple(plan))
            self.assertEqual(plan[:2],['clear','clear'])
            self.assertNotIn(['rain']*3,[plan[i:i+3] for i in range(len(plan)-2)])
            for i in range(1,len(plan)-1):
                if plan[i-1]=='rain' and plan[i]!='rain':self.assertEqual(plan[i],'clear')
            t=self.battle();weather.initialize(t,seed);self.assertEqual(plan,t['_weather_plan'])
        self.assertGreater(len(variants),15)
        s=self.battle();s['_weather_plan'][2:4]=['rain','haze'];before=copy.deepcopy(s)
        for _ in range(4):s=apply(s,s['turn'],{'kind':'end'},roll=lambda: self.fail('Weather consumed combat dice'))
        self.assertEqual(weather.public(s)['current']['condition'],'rain')
        self.assertEqual(s['_weather_plan'],before['_weather_plan'])

    def test_forecast_is_identical_for_both_armies_and_private_future_never_leaks(self):
        s=self.battle();s['_weather_plan'][2:]=['rain']*16
        a=public_state(s,'us');b=public_state(s,'de')
        self.assertEqual(a['weather'],b['weather']);self.assertEqual(len(a['weather']['forecast']),2)
        for v in (a,b,view(s,'us')):
            self.assertNotIn('_weather_plan',json.dumps(v));self.assertNotIn('_battle_record',json.dumps(v))
        s['fog_of_war']=False
        self.assertNotIn('_weather_plan',json.dumps(public_state(s,'us')))
        s['_order_history']={'past':[{'snapshot':copy.deepcopy(s)}]}
        self.assertNotIn('_weather_plan',json.dumps(public_state(s,'us')))

    def test_new_maps_only_and_existing_saves_keep_their_original_weather(self):
        for name in ['current:britain_2','current:midway_2']:
            self.assertTrue(weather.enabled(initial(name,'dsl')))
        for name in ['britain','current:britain','current:crosswind_strait','current:village']:
            s=initial(name,'dsl');self.assertFalse(weather.enabled(s),name)
        s=self.battle();s.pop('weather_version');s.pop('_weather_plan');s['round']=4
        s=apply(s,'us',{'kind':'end'});self.assertNotIn('weather',public_state(s,'us'))

    def test_rain_shortens_legal_flight_and_rejects_out_of_range_order(self):
        for name in ['current:britain_2','current:midway_2']:
            s=self.battle(name,condition='rain');p=self.unit(s,'fighter');p.pop('carrier_id');p['pos']=[12,10];p['ap']=4
            legal=options(s,p);self.assertEqual(max(distance(p['pos'],m['pos']) for m in legal['moves']),p['flight']-1)
            v=public_state(s,'us');shown=self.uid(v,p['id'])
            self.assertEqual((shown['flight'],shown['normal_flight']),(p['flight']-1,p['flight']))
            clear=copy.deepcopy(s);clear['_weather_plan']=['clear']*len(s['_weather_plan'])
            far=next(m for m in options(clear,self.uid(clear,p['id']))['moves'] if distance(p['pos'],m['pos'])==p['flight'])
            with self.assertRaises(ValueError):apply(s,'us',dict(kind='move',unit=p['id'],pos=far['pos']))

    def test_haze_reduces_visual_sight_but_preserves_radar(self):
        s=self.battle(condition='haze');p=self.unit(s,'fighter');p.pop('carrier_id');p['pos']=[12,10]
        enemy=self.unit(s,'fighter','de');enemy.pop('carrier_id');enemy['pos']=[17,10]
        for u in s['units']:
            if u['side']=='us' and u['id']!=p['id']:u['hp']=0
        self.assertNotIn(enemy['id'],visible_ids(s,'us'))
        s['_weather_plan']=['clear']*18;self.assertIn(enemy['id'],visible_ids(s,'us'))
        s['_weather_plan']=['haze']*18;radar=self.unit(s,'radar');radar.update(hp=3,pos=[12,10])
        self.assertIn(enemy['id'],visible_ids(s,'us'))

    def test_rain_bomb_preview_matches_roll_and_fighter_guns_unchanged(self):
        s=self.battle(side='de',condition='rain');p=self.unit(s,'bomber','de');p.pop('carrier_id')
        target=self.unit(s,'airfield');p['pos']=target['pos'].copy()
        shot=next(x for x in options(s,p)['targets'] if x['id']==target['id'])
        self.assertEqual(shot['threshold'],4);self.assertEqual(shot['modifiers']['rain'],1)
        out=apply(s,'de',dict(kind='fire',unit=p['id'],target=target['id']),roll=lambda:3)
        self.assertEqual(self.uid(out,target['id'])['hp'],target['hp'])
        self.assertEqual(self.uid(out,p['id'])['bombs'],p['bombs']-1)
        self.assertEqual(weather.modifiers(s,self.unit(s,'fighter','de')), {})

    def test_rain_launch_limit_is_per_base_and_resets_on_own_turn(self):
        for name in ['current:britain_2','current:midway_2']:
            s=self.battle(name,condition='rain');base=self.unit(s,'airfield' if s.get('britain_ops_version') else 'carrier')
            s,order=self.launch(s,base);base=self.uid(s,base['id'])
            self.assertEqual(base['weather_launches'],1);self.assertFalse(options(s,base)[order['kind']])
            other=next(u for u in s['units'] if u['kind']==base['kind'] and u['side']=='us' and u['id']!=base['id'])
            self.assertTrue(options(s,other)[order['kind']])
            plane=self.uid(s,order['target']);kind='land' if base['kind']=='airfield' else 'recover'
            self.assertIn(base['id'],options(s,plane)[kind])
            s=apply(s,'us',dict(kind=kind,unit=plane['id'],target=base['id']),roll=lambda:1)
            self.assertEqual(self.uid(s,plane['id'])['carrier_id'],base['id'])
            s=apply(s,'us',{'kind':'end'});self.assertEqual(self.uid(s,base['id'])['weather_launches'],1)
            s=apply(s,'de',{'kind':'end'});self.assertEqual(self.uid(s,base['id'])['weather_launches'],0)

    def test_undo_redo_restores_resources_statistics_and_weather_without_duplication(self):
        s=self.battle(condition='rain');f=self.unit(s,'airfield');p=self.unit(s,'fighter');p.update(hp=1,fuel=4)
        order=dict(kind='field_service',unit=f['id'],target=p['id']);before=copy.deepcopy(s)
        out=order_history.perform(s,'us',order)
        stats=out[debrief.KEY]['armies']['us'];self.assertEqual((stats['services'],stats['resources']['air_stores'],stats['strength_restored']),(1,1,2))
        undone=order_history.perform(out,'us',{'kind':'undo'})
        self.assertEqual(undone[debrief.KEY],before[debrief.KEY]);self.assertEqual(undone['_weather_plan'],before['_weather_plan'])
        redone=order_history.perform(undone,'us',{'kind':'redo'})
        self.assertEqual(redone[debrief.KEY],out[debrief.KEY]);self.assertEqual(redone['_weather_plan'],out['_weather_plan'])
        self.assertEqual(s,before)

    def test_loss_causes_distinguish_fuel_combat_and_grounded_aircraft(self):
        s=self.battle();p=self.unit(s,'fighter');p.pop('carrier_id');p['fuel']=0
        out=apply(s,'us',{'kind':'end'});self.assertEqual(out[debrief.KEY]['armies']['us']['losses']['fuel'],1)
        s=self.battle(side='de');p=self.unit(s,'bomber','de');p.pop('carrier_id');f=self.unit(s,'airfield');f['hp']=2;p['pos']=f['pos'].copy()
        out=apply(s,'de',dict(kind='fire',unit=p['id'],target=f['id']),roll=lambda:6)
        stats=out[debrief.KEY]['armies']['us'];self.assertEqual(stats['losses']['combat'],1);self.assertEqual(stats['losses']['aboard'],3)
        self.assertEqual(stats['aircraft_lost'],3)
        attacks=out[debrief.KEY]['armies']['de'];self.assertEqual((attacks['attack_rolls'],attacks['successful_rolls'],attacks['resources']['bombs']),(1,1,1))

    def test_debrief_is_only_after_battle_and_never_discloses_enemy_record(self):
        s=self.battle();s[debrief.KEY]['armies']['de']['events']=[{'text':'PRIVATE ENEMY EVENT'}]
        self.assertNotIn('debrief',public_state(s,'us'))
        out=order_history.perform(s,'de',{'kind':'resign'})
        report=public_state(out,'us')['debrief'];self.assertTrue(report['complete']);self.assertEqual(report['side'],'us')
        self.assertNotIn('PRIVATE ENEMY EVENT',json.dumps(public_state(out,'us')))
        self.assertNotIn('_battle_record',json.dumps(public_state(out,'de')))

    def test_delayed_mortar_losses_and_rolls_are_accounted_to_the_correct_army(self):
        s=self.battle('current:kharkov');troop=self.unit(s,'squad');mortar=self.unit(s,'mortar','de')
        troop.update(hp=1,pos=[0,0]);s['battlefield']['map'][0][0]='field'
        s['barrages']=[dict(side='de',attacker=mortar['id'],weapon='observed_mortar',threshold=5,ttl=1,pos=[0,0],area=[[0,0]])]
        out=apply(s,'us',dict(kind='end'),roll=lambda:6)
        self.assertEqual(out[debrief.KEY]['armies']['us']['losses']['combat'],1)
        self.assertEqual(out[debrief.KEY]['armies']['de']['successful_rolls'],1)

    def test_old_finished_and_in_progress_battles_are_explicitly_partial(self):
        s=self.battle();s.pop(debrief.KEY);s['winner']='us'
        self.assertFalse(public_state(s,'us')['debrief']['available'])
        s['winner']=None;s['round']=6
        out=apply(s,'us',{'kind':'end'});out=order_history.perform(out,'de',{'kind':'resign'})
        report=public_state(out,'us')['debrief'];self.assertFalse(report['complete']);self.assertEqual(report['start_round'],6)

    def test_coop_fields_and_weather_share_army_rules(self):
        s=self.battle(condition='rain');cooperative.initialize(s,dict(side='us',control_size='platoons'),'host','Tester')
        s=cooperative.setup_action(s,'host',{'operation':'start'},defer_computer=True)
        s,order=self.launch(s);self.assertFalse(options(s,self.uid(s,order['unit']))['scramble'])
        self.assertEqual(public_state(s,'us')['weather'],public_state(s,'de')['weather'])

    def test_preparation_starts_accounting_after_the_active_force_is_final(self):
        s=self.battle('current:shingle_cove')
        s=apply(s,'de',dict(kind='deploy_bunker',pos=[0,3]))
        self.assertEqual(s[debrief.KEY]['armies']['de']['orders'],0)
        s=apply(s,'us',dict(kind='deploy_lock'))
        s=apply(s,'de',dict(kind='deploy_lock'))
        self.assertFalse(s[debrief.KEY]['pending'])
        stats=s[debrief.KEY]['armies']['de']
        self.assertEqual(stats['starting_strength'],sum(u['hp'] for u in s['units'] if u['side']=='de'))
        self.assertEqual(stats['orders'],0)
        out=order_history.perform(s,'us',dict(kind='resign'))
        self.assertTrue(public_state(out,'us')['debrief']['preparation_excluded'])

    def test_evacuated_units_are_not_recorded_as_losses(self):
        s=self.battle('current:dunkirk');boat=self.unit(s,'landing_craft')
        troop=next(u for u in s['units'] if u.get('evacuee'))
        boat['pos']=s['battlefield']['evacuation_exits'][0].copy()
        troop.update(carrier_id=boat['id'],pos=boat['pos'].copy())
        s=apply(s,'us',dict(kind='evacuate',unit=boat['id']))
        self.assertEqual(s['evacuated_count'],1)
        self.assertEqual(sum(s[debrief.KEY]['armies']['us']['losses'].values()),0)
        s=order_history.perform(s,'us',dict(kind='resign'))
        self.assertEqual(public_state(s,'us')['debrief']['evacuated'],1)

    def test_computer_replay_retains_weather_at_that_time_not_live_weather(self):
        s=self.battle(side='de');s['ai_side']='de';s['_weather_plan'][1]='rain'
        out=play_turn(s,roll=lambda:4)
        frames=out['computer_playback']['frames'];self.assertTrue(frames)
        self.assertEqual(frames[0]['before']['weather']['current']['condition'],'clear')
        self.assertEqual(frames[-1]['after']['weather']['current']['condition'],'rain')
        self.assertNotIn('_weather_plan',json.dumps(frames));self.assertNotIn('_battle_record',json.dumps(frames))

    def test_ai_uses_only_announced_forecast_not_unpublished_future(self):
        s=self.battle();s,_=self.launch(s);p=self.unit(s,'fighter');p.update(pos=[9,11],fuel=6)
        before=choose_order(s,{},{});s['_weather_plan'][3:]=['rain']*15
        self.assertEqual(before,choose_order(s,{},{}))

    def test_api_persistence_stale_orders_and_debrief_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=tmp+'/game.sqlite';c=create_app(db).test_client()
            a=c.post('/api/match',json=dict(scenario='current:britain_2',ruleset='dsl')).json
            c.post('/api/match/'+a['code']+'/join');url='/api/match/'+a['code'];h={'Authorization':'Bearer '+a['token']}
            s=c.get(url,headers=h).json;f=self.unit(s,'airfield');e=s['legal'][f['id']]['scramble'][0]
            order=dict(kind='scramble',unit=f['id'],target=e['id'],pos=e['destinations'][0]['pos'],revision=s['revision'])
            out=c.post(url,headers=h,json=order);self.assertEqual(out.status_code,200)
            self.assertEqual(c.post(url,headers=h,json=order).status_code,409)
            ended=c.post(url,headers=h,json=dict(kind='resign',revision=out.json['revision']));self.assertEqual(ended.status_code,200)
            self.assertEqual(ended.json['debrief']['statistics']['launches'],1)
            reloaded=create_app(db).test_client().get(url,headers=h).json
            self.assertEqual(ended.json['debrief'],reloaded['debrief']);self.assertEqual(ended.json['weather'],reloaded['weather'])
            self.assertNotIn('_weather_plan',json.dumps(reloaded));self.assertNotIn('_battle_record',json.dumps(reloaded))


if __name__=='__main__':unittest.main()
