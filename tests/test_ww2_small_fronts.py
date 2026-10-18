import copy
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import small_fronts, order_history, debrief
from ww2_tactics.engine import initial, apply, options
from ww2_tactics.visibility import public_state, view, update_intel
from ww2_tactics.scenarios import get_scenario, catalog
from ww2_tactics.computer import choose_order, play_turn, objective_costs


class SmallFrontTests(unittest.TestCase):
    def battle(self,name='foy',side='us'):
        s=initial('current:'+name,'dsl');s.update(ready=True,turn=side);return s

    def unit(self,s,side='us',kind='squad'):
        return next(u for u in s['units'] if u['side']==side and u['kind']==kind)

    def uid(self,s,u):return next(v for v in s['units'] if v['id']==u['id'])

    def wounded(self,s):
        u=self.unit(s);u.update(pos=[3,9],hp=1,ap=3);return u

    def order(self,s,u,kind,**kw):return apply(s,s['turn'],dict(kind=kind,unit=u['id'],**kw),roll=lambda:6)

    def test_maps_are_compact_current_only_named_and_versioned(self):
        for name,size,counts in [('foy',(10,12),(9,8)),('peleliu',(12,12),(10,9))]:
            s=self.battle(name);b=s['battlefield']
            self.assertEqual((b['width'],b['height']),size)
            self.assertEqual(tuple(sum(u['side']==side for u in s['units']) for side in ('us','de')),counts)
            self.assertTrue(all(u['display_name'] for u in s['units']))
            self.assertEqual(len({u['id'] for u in s['units']}),sum(counts))
            self.assertEqual(s['support'],{'us':0,'de':0})
            self.assertNotIn('weather_version',s)
            self.assertEqual(b['rounds'],12)
            self.assertTrue(all(0<=u['pos'][0]<b['width'] and 0<=u['pos'][1]<b['height'] for u in s['units']))
            costs=objective_costs(s)
            self.assertTrue(all(tuple(u['pos']) in costs for u in s['units']))
            with self.assertRaises(ValueError):get_scenario(name)
        self.assertTrue(all(u['faction']=='jp' for u in self.battle('peleliu')['units'] if u['side']=='de'))
        self.assertEqual(len(catalog('current')),34)

    def test_aid_cost_capacity_cooldown_and_immutable_input(self):
        s=self.battle();u=self.wounded(s);before=copy.deepcopy(s)
        out=self.order(s,u,'field_aid');v=self.uid(out,u)
        self.assertEqual(s,before);self.assertEqual((v['hp'],v['ap'],v['aid_round']),(2,1,1))
        self.assertEqual(out['_aid_stores']['us'],3)
        v['ap']=3
        self.assertFalse(options(out,v)['field_aid'])
        out['round']=2
        final=self.order(out,v,'field_aid');v=self.uid(final,v)
        self.assertEqual(v['hp'],3);v['ap']=3
        self.assertFalse(options(final,v)['field_aid'])

    def test_aid_gates_full_pinned_dead_distance_ap_round_and_stock(self):
        for changes in [dict(hp=3),dict(hp=0),dict(pinned=True),dict(ap=1),dict(pos=[5,5]),dict(aid_round=1),dict(reserve=True)]:
            s=self.battle();u=self.wounded(s);u.update(changes)
            self.assertFalse(options(s,u)['field_aid'],changes)
            with self.assertRaises(ValueError):self.order(s,u,'field_aid')
        s=self.battle();u=self.wounded(s);s['_aid_stores']['us']=0
        self.assertFalse(options(s,u)['field_aid'])
        s['_aid_stores']['us']=1;s['turn']='de'
        self.assertFalse(options(s,u)['field_aid'])

    def test_aid_does_not_rearm_and_enemy_occupation_blocks(self):
        s=self.battle();u=self.wounded(s);u['grenades']=0;u['smoke']=0
        enemy=self.unit(s,'de');enemy['pos']=[3,9]
        self.assertFalse(options(s,u)['field_aid']);enemy['hp']=0
        out=self.order(s,u,'field_aid')
        self.assertEqual((self.uid(out,u)['grenades'],self.uid(out,u)['smoke']),(0,0))

    def test_aid_destroyed_building_prevents_treatment(self):
        s=self.battle(side='de');u=self.unit(s,'de');u.update(pos=[7,2],hp=1)
        self.assertTrue(options(s,u)['field_aid'])
        s['buildings']['7,2']='destroyed'
        self.assertFalse(options(s,u)['field_aid'])

    def test_aid_private_stocks_in_views_no_fog_and_debrief(self):
        s=self.battle();u=self.wounded(s);s=self.order(s,u,'field_aid')
        for fog in (True,False):
            s['fog_of_war']=fog
            for side,stock in [('us',3),('de',3)]:
                for p in (public_state(s,side),view(s,side)):
                    self.assertNotIn('_aid_stores',p);self.assertEqual(p['medical_supplies'],stock)
                    self.assertTrue(all('aid_round' not in v for v in p['units'] if v['side']!=side))
        ended=order_history.resign(s,'us')
        own=public_state(ended,'us')['debrief']['statistics'];enemy=public_state(ended,'de')['debrief']['statistics']
        self.assertEqual(own['field_aid'],1);self.assertEqual(own['strength_restored'],1)
        self.assertEqual(own['resources']['medical_supplies'],1);self.assertNotIn('medical_supplies',enemy['resources'])

    def test_aid_undo_redo_and_json_roundtrip(self):
        s=self.battle();u=self.wounded(s);s['fog_of_war']=False
        update_intel(s)
        out=order_history.perform(s,'us',dict(kind='field_aid',unit=u['id']))
        restored=order_history.perform(json.loads(json.dumps(out)),'us',dict(kind='undo'))
        self.assertEqual(restored['_aid_stores']['us'],4);self.assertEqual(self.uid(restored,u)['hp'],1)
        redone=order_history.perform(restored,'us',dict(kind='redo'))
        self.assertEqual(redone['_aid_stores']['us'],3);self.assertEqual(redone[debrief.KEY]['armies']['us']['field_aid'],1)

    def test_cave_moves_exhaust_actions_and_clear_stances(self):
        s=self.battle('peleliu','de');u=self.unit(s,'de');u.update(ap=3,entrenched=True,overwatch=True,camouflaged=True,observing=True)
        destination=options(s,u)['cave_move'][0]
        out=self.order(s,u,'cave_move',pos=destination);v=self.uid(out,u)
        self.assertEqual(v['pos'],destination);self.assertEqual(v['ap'],0)
        for key in ('entrenched','overwatch','camouflaged','observing','road_pending'):self.assertFalse(v[key])

    def test_cave_gates_and_destination_validation(self):
        for changes in [dict(pinned=True),dict(ap=1),dict(pos=[10,10]),dict(reserve=True),dict(hp=0)]:
            s=self.battle('peleliu','de');u=self.unit(s,'de');u.update(changes)
            self.assertEqual(options(s,u)['cave_move'],[])
        s=self.battle('peleliu');u=self.unit(s);u['pos']=[7,3]
        self.assertEqual(options(s,u)['cave_move'],[])
        s=self.battle('peleliu','de');u=self.unit(s,'de')
        for pos in ([0,0],[7,3],None,[-1,0]):
            with self.assertRaises(ValueError):self.order(s,u,'cave_move',pos=pos)

    def test_cave_capacity_respects_two_friendly_units(self):
        s=self.battle('peleliu','de');u=self.unit(s,'de');dest=[7,8]
        self.assertIn(dest,options(s,u)['cave_move'])
        mate=next(v for v in s['units'] if v['side']=='de' and v['kind']=='leader');mate['pos']=dest
        self.assertNotIn(dest,options(s,u)['cave_move'])

    def test_hidden_exit_enemy_does_not_change_preview_but_blocks_execution(self):
        s=self.battle('peleliu','de');u=self.unit(s,'de');dest=[7,8]
        known={v['id'] for v in s['units'] if v['side']=='de'}
        with patch('ww2_tactics.visibility.unit_visible_ids',return_value=known):
            before=small_fronts.options(s,u)['cave_move']
            enemy=self.unit(s);enemy['pos']=dest
            self.assertEqual(small_fronts.options(s,u)['cave_move'],before)
            old=copy.deepcopy(s)
            with self.assertRaisesRegex(ValueError,'blocked by contact'):self.order(s,u,'cave_move',pos=dest)
            self.assertEqual(s,old)

    def test_cave_exit_invokes_normal_reaction_fire(self):
        s=self.battle('peleliu','de');u=self.unit(s,'de');dest=[7,8]
        with patch('ww2_tactics.engine.react',return_value=['Reaction checked']) as react:
            out=self.order(s,u,'cave_move',pos=dest)
        react.assert_called_once();self.assertEqual(react.call_args.args[1]['pos'],dest)
        self.assertIn('Reaction checked',out['log'])

    def test_cave_arrival_really_takes_overwatch_damage(self):
        s=self.battle('peleliu','de');u=self.unit(s,'de');dest=[7,8]
        s['battlefield']['map']=[['field']*12 for _ in range(12)]
        enemy=self.unit(s);enemy.update(pos=[6,8],overwatch=True,ap=0,pinned=False)
        update_intel(s)
        out=self.order(s,u,'cave_move',pos=dest)
        self.assertLess(self.uid(out,u)['hp'],u['hp'])
        self.assertFalse(self.uid(out,enemy)['overwatch'])
        self.assertEqual(out['last_combat']['target'],u['id'])

    def test_familiar_hold_and_deadline_win_conditions(self):
        for name in ('foy','peleliu'):
            s=self.battle(name);u=self.unit(s);u['pos']=s['battlefield']['objective'][:]
            s=apply(s,'us',dict(kind='end'));self.assertEqual(s['hold'],1)
            s=apply(s,'de',dict(kind='end'));s=apply(s,'us',dict(kind='end'))
            self.assertEqual(s['winner'],'us')
            s=self.battle(name,'de');s['round']=12
            s=apply(s,'de',dict(kind='end'));self.assertEqual(s['winner'],'de')

    def clear_cave(self,s):
        dest=[7,3]
        for u in s['units']:
            if u['pos']==dest:u['pos']=[10,2]
        u=self.unit(s,kind='engineer');u.update(pos=[6,3],ap=3)
        return u,dest

    def test_seal_cost_public_status_no_damage_and_persistence(self):
        s=self.battle('peleliu');u,dest=self.clear_cave(s)
        old_hp={v['id']:v['hp'] for v in s['units']}
        out=self.order(s,u,'seal_cave',pos=dest);v=self.uid(out,u)
        self.assertEqual((v['ap'],v['demolition_charges']),(1,0))
        self.assertEqual(out['sealed_caves'],['north'])
        self.assertEqual({v['id']:v['hp'] for v in out['units']},old_hp)
        for side in ('us','de'):self.assertEqual(public_state(out,side)['sealed_caves'],['north'])
        restored=json.loads(json.dumps(out));restored['turn']='de';enemy=self.unit(restored,'de');enemy.update(pos=[7,8],ap=3)
        self.assertNotIn(dest,options(restored,enemy)['cave_move'])

    def test_seal_rejects_enemy_occupied_no_charge_wrong_unit_and_closed(self):
        for change in ('occupied','empty','squad','closed','pinned'):
            s=self.battle('peleliu');u,dest=self.clear_cave(s)
            if change=='occupied':self.unit(s,'de')['pos']=dest
            if change=='empty':u['demolition_charges']=0
            if change=='squad':u['kind']='squad'
            if change=='closed':s['sealed_caves']=['north']
            if change=='pinned':u['pinned']=True
            self.assertNotIn(dest,options(s,u)['seal_cave'])
            with self.assertRaises(ValueError):self.order(s,u,'seal_cave',pos=dest)

    def test_other_maps_do_not_gain_orders(self):
        for name in ('current:village','village','current:midway_2','current:britain_2'):
            s=initial(name,'dsl');s['ready']=True;u=s['units'][0]
            self.assertFalse(small_fronts.enabled(s));self.assertFalse(small_fronts.options(s,u)['field_aid'])
            for kind in small_fronts.ORDERS:
                with self.assertRaises(ValueError):self.order(s,u,kind,pos=[7,3])

    def test_ai_prioritizes_treatment_sealing_and_cave_advance(self):
        s=self.battle();u=self.wounded(s)
        for v in s['units']:
            if v is not u and v['side']=='us':v['ap']=0
        self.assertEqual(choose_order(s,objective_costs(s),{})['kind'],'field_aid')
        s=self.battle('peleliu');u,dest=self.clear_cave(s)
        for v in s['units']:
            if v is not u and v['side']=='us':v['ap']=0
        self.assertEqual(choose_order(s,objective_costs(s),{})['kind'],'seal_cave')
        s=self.battle('peleliu','de');u=next(v for v in s['units'] if v['side']=='de' and v['pos']==[7,8])
        choices=small_fronts.choices(s,u,options(s,u),s['battlefield']['objective'],{})
        self.assertTrue(any(a['kind']=='cave_move' for _,a in choices))
        self.assertFalse(small_fronts.choices(s,u,options(s,u),s['battlefield']['objective'],{u['id']:{(7,3),(9,5)}}))

    def test_ai_replay_private_and_retains_medical_stock_at_each_frame(self):
        s=self.battle();u=self.wounded(s);s['ai_side']='us'
        for v in s['units']:
            if v is not u and v['side']=='us':v['ap']=0
        out=play_turn(s,roll=lambda:1,observers=['us','de'])
        frames=out['_coop_replays']['us']['frames']
        self.assertNotIn('_aid_stores',json.dumps(out['_coop_replays']))
        self.assertNotIn('_battle_record',json.dumps(out['_coop_replays']))
        self.assertTrue(frames)
        self.assertEqual(frames[0]['before']['medical_supplies'],4)
        self.assertEqual(frames[0]['after']['medical_supplies'],3)

    def test_api_persists_orders_rejects_stale_revision_and_hides_private_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=tmp+'/game.sqlite';c=create_app(db).test_client()
            a=c.post('/api/match',json=dict(scenario='current:foy',ruleset='dsl')).json
            url='/api/match/'+a['code'];c.post(url+'/join');headers={'Authorization':'Bearer '+a['token']}
            with sqlite3.connect(db) as conn:
                s=json.loads(conn.execute('SELECT state FROM match WHERE code=?',(a['code'],)).fetchone()[0]);u=self.wounded(s)
                conn.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),a['code']))
            order=dict(kind='field_aid',unit=u['id'],revision=s['revision'])
            out=c.post(url,headers=headers,json=order);self.assertEqual(out.status_code,200,out.json)
            self.assertEqual(out.json['medical_supplies'],3)
            self.assertEqual(c.post(url,headers=headers,json=order).status_code,409)
            fresh=create_app(db).test_client().get(url,headers=headers).json
            self.assertEqual(fresh['medical_supplies'],3);self.assertNotIn('_aid_stores',json.dumps(fresh))
            ended=c.post(url,headers=headers,json=dict(kind='resign',revision=fresh['revision'])).json
            self.assertEqual(ended['debrief']['statistics']['field_aid'],1)

    def test_shared_army_orders_respect_ownership_and_one_remaining_supply(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=tmp+'/game.sqlite';c=create_app(db).test_client()
            a=c.post('/api/match',json=dict(scenario='current:foy',ruleset='dsl',opponent='cooperative',control_size='platoons',side='us')).json
            url='/api/match/'+a['code'];ha={'Authorization':'Bearer '+a['token']}
            s=c.get(url,headers=ha).json
            group=next(g for g in s['coop']['groups'] if g['side']=='us' and not g['owner'] and not g['command'])
            b=c.post(url+'/join',json=dict(side='us',group=group['id'],player_name='Teammate')).json
            hb={'Authorization':'Bearer '+b['token']};s=c.get(url,headers=ha).json
            r=c.post(url+'/cooperative',headers=ha,json=dict(operation='start',revision=s['revision']))
            self.assertEqual(r.status_code,200,r.json)
            one=c.get(url,headers=ha).json['coop']['controlled'][0]
            two=c.get(url,headers=hb).json['coop']['controlled'][0]
            with sqlite3.connect(db) as conn:
                s=json.loads(conn.execute('SELECT state FROM match WHERE code=?',(a['code'],)).fetchone()[0])
                for u in s['units']:
                    if u['id'] in (one,two):u.update(hp=1,pos=[3,9],ap=3)
                s['_aid_stores']['us']=1;s['revision']+=1;update_intel(s)
                conn.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),a['code']))
            wrong=c.post(url,headers=ha,json=dict(kind='field_aid',unit=two,revision=s['revision']))
            self.assertEqual(wrong.status_code,400)
            right=c.post(url,headers=ha,json=dict(kind='field_aid',unit=one,revision=s['revision']))
            self.assertEqual(right.status_code,200,right.json)
            self.assertEqual(right.json['medical_supplies'],0)
            stale=c.post(url,headers=hb,json=dict(kind='field_aid',unit=two,revision=s['revision']))
            self.assertEqual(stale.status_code,409)
            spent=c.post(url,headers=hb,json=dict(kind='field_aid',unit=two,revision=right.json['revision']))
            self.assertEqual(spent.status_code,400)


if __name__=='__main__':unittest.main()
