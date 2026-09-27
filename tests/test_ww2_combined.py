import copy
import json
import os
import tempfile
import unittest

from ww2_tactics.engine import initial, apply, options, fire_threshold
from ww2_tactics.visibility import visible_ids, update_intel, public_state, view
from ww2_tactics.computer import choose_order, objective_costs, play_turn
from ww2_tactics.rulesets import turn_limit
from ww2_web import create_app


class CombinedRulesTests(unittest.TestCase):
    def battle(self):
        s=initial('frontier','dsl');s['ready']=True
        return s

    def field(self,*roles):
        s=self.battle();s['battlefield']['map']=[['field']*24 for _ in range(24)]
        selected=[]
        for side,kind,pos in roles:
            u=next(u for u in s['units'] if u['side']==side and u['kind']==kind and u not in selected)
            u.update(pos=pos,reserve=False);selected.append(u)
        s['units']=selected;s['intel']={};update_intel(s)
        return s

    def test_roster_and_legacy(self):
        s=self.battle()
        self.assertEqual(len(s['units']),40)
        self.assertEqual(s['battlefield']['width'],24)
        self.assertEqual(len({tuple(u['pos']) for u in s['units']}),40)
        for side in ('us','de'):
            self.assertEqual(sum(u.get('reserve',False) for u in s['units'] if u['side']==side),2)
        us=next(u for u in s['units'] if u['kind']=='tank' and u['side']=='us')
        de=next(u for u in s['units'] if u['kind']=='tank' and u['side']=='de')
        self.assertEqual((us['ap'],us['range'],us['hp']),(3,6,4))
        self.assertEqual((de['ap'],de['range'],de['hp']),(2,8,5))
        self.assertNotIn('fog_of_war',initial('village','dsl'))
        with self.assertRaises(ValueError): initial('frontier','classic')

    def test_faction_accuracy_and_suppression(self):
        s=self.field(('us','squad',[5,5]),('de','squad',[7,5]))
        us,de=s['units']
        self.assertLess(fire_threshold(s,us,de),fire_threshold(s,de,us))
        s['turn']='de'
        out=apply(s,'de',dict(kind='fire',unit=de['id'],target=us['id']),roll=lambda:3)
        self.assertEqual(out['units'][0]['hp'],us['hp']);self.assertTrue(out['units'][0]['pinned'])
        self.assertIn('suppressed',out['last_combat']['result'])

    def test_mg_suppression_roll_and_range(self):
        s=self.field(('us','squad',[5,5]),('de','mg',[10,5]));s['turn']='de'
        us,de=s['units'];self.assertIn(us['id'],options(s,de)['suppress'])
        miss=apply(s,'de',dict(kind='suppress',unit=de['id'],target=us['id']),roll=lambda:2)
        hit=apply(s,'de',dict(kind='suppress',unit=de['id'],target=us['id']),roll=lambda:3)
        self.assertFalse(miss['units'][0]['pinned']);self.assertTrue(hit['units'][0]['pinned'])
        self.assertEqual(hit['units'][0]['hp'],us['hp'])

    def test_armor_and_anti_tank(self):
        s=self.field(('us','squad',[5,5]),('us','at_team',[6,5]),('de','tank',[7,5]))
        rifle,at,tank=s['units']
        self.assertFalse(options(s,rifle)['targets']);self.assertFalse(options(s,rifle)['grenades'])
        with self.assertRaises(ValueError): apply(s,'us',dict(kind='fire',unit=rifle['id'],target=tank['id']))
        out=apply(s,'us',dict(kind='fire',unit=at['id'],target=tank['id']),roll=lambda:6)
        self.assertEqual(out['units'][2]['hp'],tank['hp']-2)

    def test_vehicle_terrain_and_fixed_guns(self):
        s=self.field(('us','tank',[5,5]),('us','amphibious',[10,5]),('us','at_gun',[15,5]),('de','squad',[20,20]))
        s['battlefield']['map'][5][6]='woods';s['battlefield']['map'][4][5]='water';s['battlefield']['map'][5][11]='water'
        self.assertNotIn([6,5],[m['pos'] for m in options(s,s['units'][0])['moves']])
        self.assertNotIn([5,4],[m['pos'] for m in options(s,s['units'][0])['moves']])
        self.assertIn([11,5],[m['pos'] for m in options(s,s['units'][1])['moves']])
        self.assertEqual(options(s,s['units'][2])['moves'],[])

    def test_commander_radius_cap_and_once_per_turn(self):
        s=self.field(('us','commander',[5,5]),('us','scout',[7,5]),('us','tank',[5,7]),('us','leader',[6,5]),('de','squad',[20,20]))
        co,scout,tank,lt,_=s['units'];scout['platoon']='B'
        self.assertEqual(set(options(s,co)['command']),{scout['id'],tank['id']})
        out=apply(s,'us',dict(kind='command',unit=co['id']))
        self.assertEqual(out['units'][0]['ap'],1);self.assertEqual(out['units'][1]['ap'],4)
        out['units'][0]['ap']=3;self.assertFalse(options(out,out['units'][0])['command'])
        out['command_used']=[];out['units'][1]['ap']=0
        self.assertNotIn(scout['id'],options(out,out['units'][0])['command'])
        scout['pinned']=True;self.assertIn(scout['id'],options(s,co)['inspire'])

    def test_woods_concealment_scout_and_last_known(self):
        s=self.field(('us','squad',[5,5]),('de','squad',[8,5]));us,de=s['units']
        self.assertIn(de['id'],visible_ids(s,'us'))
        s['battlefield']['map'][5][8]='woods'
        self.assertNotIn(de['id'],visible_ids(s,'us'))
        update_intel(s);p=public_state(s,'us')
        self.assertEqual(p['contacts'][0]['pos'],[8,5]);self.assertNotIn('hp',p['contacts'][0])
        de['pos']=[12,5];update_intel(s)
        self.assertEqual(public_state(s,'us')['contacts'][0]['pos'],[8,5])
        us['kind']='scout';update_intel(s)
        self.assertFalse(public_state(s,'us')['contacts'])
        de['pos']=[8,5];self.assertIn(de['id'],visible_ids(s,'us'))

    def test_hidden_units_not_targetable_or_in_api(self):
        s=self.field(('us','tank',[5,5]),('de','squad',[8,5]))
        s['battlefield']['map'][5][8]='woods';s['intel']={}
        us,de=s['units'];self.assertFalse(options(s,us)['targets'])
        with self.assertRaises(ValueError): apply(s,'us',dict(kind='fire',unit=us['id'],target=de['id']))
        p=public_state(s,'us');self.assertEqual(len(p['units']),1)
        self.assertNotIn('intel',p);self.assertNotIn('reports',p)
        self.assertFalse(p['contacts'])

    def test_airborne_reserve_and_spotted_landing(self):
        s=self.battle();para=next(u for u in s['units'] if u['side']=='us' and u['reserve'])
        legal=options(s,para);self.assertTrue(legal['drops']);self.assertFalse(legal['moves'])
        self.assertNotIn([0,2],legal['drops'])
        with self.assertRaises(ValueError): apply(s,'us',dict(kind='drop',unit=para['id'],pos=[0,2]))
        out=apply(s,'us',dict(kind='drop',unit=para['id'],pos=legal['drops'][0]),roll=lambda:1)
        landed=next(u for u in out['units'] if u['id']==para['id'])
        self.assertFalse(landed['reserve']);self.assertEqual(landed['ap'],1)
        self.assertFalse(options(out,landed)['drops'])

    def test_ai_does_not_react_to_unseen_enemy_position(self):
        s=self.field(('de','squad',[5,5]),('us','squad',[20,20]));s['turn']='de'
        costs=objective_costs(s);order=choose_order(s,costs,{})
        s['units'][1]['pos']=[22,22]
        self.assertEqual(choose_order(s,costs,{}),order)

    def test_ai_replay_is_already_filtered(self):
        s=self.battle();s['ai_side']='de';s=play_turn(apply(s,'us',dict(kind='end')))
        p=public_state(s,'us');self.assertEqual(p['turn'],'us')
        self.assertTrue(p['computer_playback']['frames'])
        for frame in p['computer_playback']['frames']:
            ids={u['id'] for u in frame['before']['units']+frame['after']['units']}
            for key in ('unit','target'):
                if key in frame['action']:self.assertIn(frame['action'][key],ids)
            self.assertFalse(any(u.get('reserve') and u['side']=='de' for u in frame['after']['units']))
        for u in s['units']:self.assertLessEqual(u['ap_received'],turn_limit(u))


class CombinedAPITests(unittest.TestCase):
    def test_save_restore_and_server_redaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            client=create_app(os.path.join(tmp,'battle.db')).test_client()
            self.assertEqual(client.post('/api/match',json={'scenario':'frontier','ruleset':'classic'}).status_code,400)
            seat=client.post('/api/match',json={'scenario':'frontier','ruleset':'dsl','opponent':'computer'}).get_json()
            url='/api/match/'+seat['code'];auth={'Authorization':'Bearer '+seat['token']}
            state=client.get(url,headers=auth).get_json()
            self.assertEqual(sum(u['side']=='us' for u in state['units']),20)
            self.assertLess(len(state['units']),40);self.assertNotIn('intel',state)
            self.assertFalse(any(u['side']=='de' and u.get('reserve') for u in state['units']))
            self.assertEqual(len(state['legal']),20)
            save=client.post(url+'/save',json={'revision':state['revision']},headers=auth).get_json()
            restored=client.post('/api/restore',json={'code':save['save_code']}).get_json()
            loaded=client.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).get_json()
            state.pop('code');loaded.pop('code');self.assertEqual(state,loaded)
            rejected=client.post(url+'/rematch',json={'operation':'propose','scenario':'frontier','ruleset':'classic','swap':False,'revision':0},headers=auth)
            self.assertEqual(rejected.status_code,400)


if __name__=='__main__': unittest.main()
