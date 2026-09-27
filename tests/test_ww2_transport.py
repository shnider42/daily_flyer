import json
import os
import sqlite3
import tempfile
import unittest

from ww2_tactics.engine import initial, apply, options, fire_threshold
from ww2_tactics.visibility import active, sees_hex, visible_ids, public_state, update_intel
from ww2_tactics.computer import choose_order, objective_costs
from ww2_web import create_app


class TransportTests(unittest.TestCase):
    def battle(self, troop_kind='squad', enemy_kind='tank'):
        s=initial('frontier','dsl');s.update(ready=True,turn='de',intel={})
        s['battlefield']['map']=[['field']*24 for _ in range(24)]
        roles=[('de','halftrack',[5,5]),('de',troop_kind,[6,5]),('us',enemy_kind,[10,5])]
        s['units']=[next(u for u in s['units'] if u['side']==side and u['kind']==kind) for side,kind,_ in roles]
        for u,(_,_,pos) in zip(s['units'],roles):u.update(pos=pos,reserve=False)
        return s

    def load(self,s):
        return apply(s,'de',dict(kind='load',unit=s['units'][0]['id'],target=s['units'][1]['id']))

    def test_six_road_steps_and_eight_with_banked_ap(self):
        for ap in (3,4):
            s=self.battle();s['units'][2]['pos']=[22,22];s['units'][1]['pos']=[4,4]
            s['battlefield']['map'][5]=['road']*24;s['units'][0]['ap']=ap
            for i in range(ap*2):
                move=next(m for m in options(s,s['units'][0])['moves'] if m['pos']==[6+i,5])
                self.assertEqual(move['cost'],1 if i%2==0 else 0)
                s=apply(s,'de',dict(kind='move',unit=s['units'][0]['id'],pos=move['pos']))
            self.assertEqual(s['units'][0]['ap'],0);self.assertFalse(options(s,s['units'][0])['moves'])

    def test_bonus_cannot_be_used_offroad_or_after_another_action(self):
        s=self.battle();s['units'][1]['pos']=[4,4];s['battlefield']['map'][5]=['road']*24
        s=apply(s,'de',dict(kind='move',unit=s['units'][0]['id'],pos=[6,5]))
        self.assertTrue(s['units'][0]['road_pending'])
        self.assertTrue(all(m['cost']==1 for m in options(s,s['units'][0])['moves'] if m['pos'][1]!=5))
        s=apply(s,'de',dict(kind='overwatch',unit=s['units'][0]['id']))
        self.assertFalse(options(s,s['units'][0])['moves'])

    def test_load_follow_unload_and_no_second_boarding(self):
        s=self.load(self.battle());carrier,troop,_=s['units']
        self.assertEqual((carrier['ap'],troop['ap']),(3,1));self.assertFalse(active(troop))
        self.assertEqual(troop['carrier_id'],carrier['id']);self.assertFalse(options(s,carrier)['load'])
        self.assertFalse(any(options(s,troop).values()))
        s=apply(s,'de',dict(kind='move',unit=carrier['id'],pos=[6,5]))
        self.assertEqual(s['units'][1]['pos'],s['units'][0]['pos'])
        s['battlefield']['map'][5][7]='woods'
        self.assertIn([7,5],[m['pos'] for m in options(s,s['units'][0])['unload']])
        s=apply(s,'de',dict(kind='unload',unit=carrier['id'],pos=[7,5]))
        self.assertTrue(active(s['units'][1]));self.assertEqual(s['units'][1]['ap'],0)
        s['units'][1]['ap']=2
        self.assertFalse(options(s,s['units'][0])['load'])
        s=apply(apply(s,'de',dict(kind='end')),'us',dict(kind='end'))
        self.assertIn(troop['id'],options(s,s['units'][0])['load'])

    def test_loading_rejects_enemy_pinned_far_reserve_and_non_infantry(self):
        for changes in ({'side':'us'},{'pinned':True},{'pos':[9,9]},{'reserve':True},{'ap':0},{'kind':'tank'},{'kind':'at_gun'}):
            s=self.battle();s['units'][1].update(changes)
            with self.assertRaises(ValueError):self.load(s)
        for kind in ('squad','leader','commander','scout','engineer','mg','at_team'):
            self.assertTrue(self.load(self.battle(kind))['units'][1].get('carrier_id'))

    def test_passenger_no_vision_command_target_or_occupancy(self):
        s=self.load(self.battle('scout'));carrier,troop,enemy=s['units']
        enemy['pos']=[13,5];update_intel(s)
        self.assertFalse(sees_hex(s,'de',enemy['pos'])) # scout's 9-hex vision is disabled
        self.assertNotIn(troop['id'],visible_ids(s,'us'))
        self.assertIn(troop['id'],visible_ids(s,'de'))
        s['turn']='us';enemy['pos']=[8,5]
        self.assertNotIn(troop['id'],[t['id'] for t in options(s,enemy)['targets']])
        self.assertNotIn('carrier_id',json.dumps(public_state(s,'us')))
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='fire',unit=enemy['id'],target=troop['id']))

    def test_small_arms_protection_and_heavy_at_kill(self):
        for kind in ('squad','mg'):
            s=self.battle(enemy_kind=kind);s['turn']='us';ht,_,enemy=s['units'];enemy['pos']=[8,5]
            self.assertNotIn(ht['id'],[t['id'] for t in options(s,enemy)['targets']])
        for kind,remaining in (('tank',0),('at_gun',0),('at_team',1)):
            s=self.load(self.battle(enemy_kind=kind));s['turn']='us';ht,troop,enemy=s['units'];enemy['pos']=[8,5]
            out=apply(s,'us',dict(kind='fire',unit=enemy['id'],target=ht['id']),roll=lambda:6)
            self.assertEqual(out['units'][0]['hp'],remaining)
            if not remaining:
                survivor=out['units'][1];self.assertEqual(survivor['hp'],troop['hp']-1)
                self.assertTrue(survivor['pinned']);self.assertEqual(survivor['ap'],0)
                self.assertNotIn('carrier_id',survivor);self.assertEqual(survivor['pos'],ht['pos'])
            else:self.assertEqual(out['units'][1]['carrier_id'],ht['id'])

    def test_last_strength_passenger_dies_in_wreck(self):
        s=self.battle();s['units'][1]['hp']=1;s=self.load(s);s['turn']='us';s['units'][2]['pos']=[8,5]
        out=apply(s,'us',dict(kind='fire',unit=s['units'][2]['id'],target=s['units'][0]['id']),roll=lambda:6)
        self.assertEqual(out['units'][1]['hp'],0);self.assertEqual(out['winner'],'us')

    def test_unload_rejects_water_occupied_and_no_ap(self):
        s=self.load(self.battle());carrier,troop,enemy=s['units']
        s['battlefield']['map'][5][6]='water';enemy['pos']=[5,6]
        for pos in ([6,5],[5,6],[5,5],[10,10]):
            with self.assertRaises(ValueError):apply(s,'de',dict(kind='unload',unit=carrier['id'],pos=pos))
        troop['ap']=0;self.assertFalse(options(s,carrier)['unload'])

    def test_overwatch_on_unload_and_vehicle_destruction(self):
        s=self.load(self.battle(enemy_kind='mg'));s['units'][2].update(pos=[8,5],overwatch=True)
        out=apply(s,'de',dict(kind='unload',unit=s['units'][0]['id'],pos=[6,5]),roll=lambda:6)
        self.assertTrue(out['units'][1]['pinned']);self.assertEqual(out['units'][1]['hp'],2)
        s=self.load(self.battle());s['units'][2].update(pos=[8,5],overwatch=True)
        out=apply(s,'de',dict(kind='move',unit=s['units'][0]['id'],pos=[6,5]),roll=lambda:6)
        self.assertEqual(out['units'][0]['hp'],0);self.assertEqual(out['units'][1]['pos'],[6,5])
        self.assertNotIn('carrier_id',out['units'][1])

    def test_ai_loads_on_approach_and_unloads_near_enemy(self):
        s=self.battle();s['units'][2]['pos']=[22,22];s['battlefield']['objective']=[5,18]
        self.assertEqual(choose_order(s,objective_costs(s),{})['kind'],'load')
        s=self.load(s);s['units'][2]['pos']=[8,5]
        self.assertEqual(choose_order(s,objective_costs(s),{})['kind'],'unload')

    def test_save_roundtrip_preserves_passengers_road_bonus_and_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=os.path.join(tmp,'game.db');client=create_app(path).test_client()
            seat=client.post('/api/match',json=dict(scenario='frontier',ruleset='dsl',opponent='computer')).get_json()
            auth={'Authorization':'Bearer '+seat['token']};url='/api/match/'+seat['code']
            s=self.load(self.battle());s['ai_side']='us'
            s['battlefield']['map'][5]=['road']*24
            s=apply(s,'de',dict(kind='move',unit=s['units'][0]['id'],pos=[6,5]))
            with sqlite3.connect(path) as db:db.execute("UPDATE match SET state=?, guest=host, host='computer' WHERE code=?",(json.dumps(s),seat['code']))
            before=client.get(url,headers=auth).get_json()
            code=client.post(url+'/save',json={'revision':s['revision']},headers=auth).get_json()['save_code']
            loaded=client.post('/api/restore',json={'code':code}).get_json()
            after=client.get('/api/match/'+loaded['code'],headers={'Authorization':'Bearer '+loaded['token']}).get_json()
            before.pop('code');after.pop('code');self.assertEqual(before,after)
            self.assertTrue(any(u.get('carrier_id') for u in after['units']))


if __name__=='__main__':unittest.main()
