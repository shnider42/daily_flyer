import copy
import json
import os
import tempfile
import unittest
from ww2_tactics.engine import initial, apply, options
from ww2_tactics.computer import play_turn
from ww2_tactics.rulesets import turn_limit
from ww2_web import create_app


class DSLRulesTests(unittest.TestCase):
    def battle(self, scenario='village'):
        state=initial(scenario,'dsl');state['ready']=True
        return state

    def test_profiles_and_legacy(self):
        classic=initial();dsl=self.battle()
        self.assertEqual(classic['units'][1]['ap'],2)
        self.assertEqual(dsl['units'][1]['ap'],3)
        self.assertEqual(dsl['ruleset_version'],1)
        with self.assertRaises(ValueError):initial(ruleset='asl')
        old=initial();old.pop('ruleset');old.pop('ruleset_version');old['ready']=True
        old=apply(apply(old,'us',dict(kind='end')),'de',dict(kind='end'))
        self.assertEqual(old['units'][1]['ap'],2)
        self.assertNotIn('ap_received',old['units'][0])

    def test_banking_first_turn_and_no_accumulation(self):
        s=self.battle()
        s=apply(s,'us',dict(kind='end'))
        self.assertEqual(s['units'][0]['banked_ap'],1)
        self.assertEqual(s['units'][1]['banked_ap'],2)
        self.assertEqual(s['units'][5]['ap'],2) # Germans have not yet banked a turn.
        self.assertEqual(s['units'][6]['ap'],3)
        for _ in range(3):
            s=apply(s,'de',dict(kind='end'))
            self.assertEqual(s['units'][0]['ap'],3)
            self.assertEqual(s['units'][1]['ap'],5)
            self.assertEqual(s['units'][0]['ap_received'],3)
            self.assertEqual(s['units'][1]['carried_ap'],2)
            s=apply(s,'us',dict(kind='end'))

    def test_spent_and_dead_units_do_not_bank(self):
        s=self.battle();s['units'][0]['ap']=0;s['units'][1]['hp']=0
        s=apply(s,'us',dict(kind='end'))
        self.assertEqual(s['units'][0]['banked_ap'],0)
        self.assertEqual(s['units'][1]['banked_ap'],0)

    def road_battle(self):
        s=self.battle()
        s['battlefield']['map']=[['field']*7 for _ in range(9)]
        for x in range(1,6):s['battlefield']['map'][3][x]='road'
        s['units'][0]['pos']=[1,3]
        return s

    def test_road_bonus_once_and_zero_ap_completion(self):
        s=self.road_battle();s['units'][0]['ap']=1
        s=apply(s,'us',dict(kind='move',unit='us0',pos=[2,3]))
        self.assertEqual(s['units'][0]['ap'],0)
        choices=options(s,s['units'][0])['moves']
        self.assertTrue(choices);self.assertTrue(all(m['cost']==0 and m['road_bonus'] for m in choices))
        s=apply(s,'us',dict(kind='move',unit='us0',pos=[3,3]))
        self.assertTrue(s['units'][0]['road_used'])
        self.assertEqual(options(s,s['units'][0])['moves'],[])
        self.assertEqual(s['units'][0]['ap'],0)

    def test_roads_not_double_speed_and_reset_next_turn(self):
        s=self.road_battle()
        for pos in ([2,3],[3,3],[4,3]):s=apply(s,'us',dict(kind='move',unit='us0',pos=pos))
        self.assertEqual(s['units'][0]['ap'],0)
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='move',unit='us0',pos=[5,3]))
        s=apply(apply(s,'us',dict(kind='end')),'de',dict(kind='end'))
        self.assertFalse(s['units'][0]['road_used'])

    def test_road_blocked_exit_bridge_and_other_action(self):
        s=self.road_battle();s['battlefield']['map'][3][2]='bridge'
        s=apply(s,'us',dict(kind='move',unit='us0',pos=[2,3]))
        s['units'][3]['pos']=[3,3]
        self.assertNotIn([3,3],[m['pos'] for m in options(s,s['units'][0])['moves']])
        s=apply(s,'us',dict(kind='smoke',unit='us0',pos=[2,3]))
        self.assertFalse(s['units'][0]['road_pending'])
        self.assertEqual(s['units'][0]['ap'],0)
        s=self.road_battle();s=apply(s,'us',dict(kind='move',unit='us0',pos=[2,3]))
        s=apply(s,'us',dict(kind='move',unit='us0',pos=[2,4]))
        self.assertEqual(s['units'][0]['ap'],0);self.assertFalse(s['units'][0]['road_pending'])

    def test_overwatch_stops_road_bonus_at_first_or_second_hex(self):
        for fire_at_second in [False,True]:
            s=self.road_battle()
            if fire_at_second:s=apply(s,'us',dict(kind='move',unit='us0',pos=[2,3]))
            s['units'][5].update(pos=[3,2],overwatch=True)
            s=apply(s,'us',dict(kind='move',unit='us0',pos=[3,3] if fire_at_second else [2,3]),roll=lambda:6)
            self.assertTrue(s['units'][0]['pinned'])
            self.assertFalse(s['units'][0]['road_pending'])
            self.assertFalse(options(s,s['units'][0])['moves'])

    def test_group_order_and_total_received_cap_after_spending(self):
        s=self.battle();before=copy.deepcopy(s)
        self.assertEqual(set(options(s,s['units'][1])['command']),{'us0','us2'})
        s=apply(s,'us',dict(kind='command',unit='us1'))
        self.assertEqual(s['units'][1]['ap'],1)
        self.assertEqual(s['units'][0]['ap'],3);self.assertEqual(s['units'][2]['ap'],3)
        self.assertEqual(s['last_combat']['recipients'],['us0','us2'])
        self.assertEqual(before['units'][0]['ap'],2)
        s['units'][1]['ap']=5;s['units'][0]['ap']=0
        self.assertEqual(options(s,s['units'][1])['command'],[])
        # Even a fresh order next turn cannot refill a unit that started with 3.
        s=apply(apply(s,'us',dict(kind='end')),'de',dict(kind='end'))
        s['units'][2]['ap']=0
        self.assertNotIn('us2',options(s,s['units'][1])['command'])

    def test_order_after_spending_does_not_enable_second_shot(self):
        s=self.battle();s['units'][0]['ap']=0
        s=apply(s,'us',dict(kind='command',unit='us1'))
        self.assertEqual(s['units'][0]['ap'],1)
        self.assertEqual(s['units'][0]['ap_received'],3)
        self.assertFalse(options(s,s['units'][0])['targets'])

    def test_order_rejects_target_and_excludes_pins_leaders_other_platoons(self):
        s=self.battle('riverfront');lt=s['units'][1]
        s['units'][0]['pinned']=True
        s['units'][5]['pos']=[lt['pos'][0],lt['pos'][1]-1]
        choices=options(s,lt)['command']
        self.assertNotIn('us0',choices);self.assertNotIn('us5',choices);self.assertNotIn('us1',choices)
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='command',unit='us1',target=choices[0]))
        lt['pinned']=True
        self.assertFalse(options(s,lt)['command'])

    def test_effects_record_actual_locations_and_do_not_add_rolls(self):
        s=self.battle();s['units'][0]['pos']=[3,5];s['units'][5]['pos']=[3,4]
        rolls=[]
        def roll():rolls.append(1);return 1
        s=apply(s,'us',dict(kind='grenade',unit='us0',target='de0'),roll=roll)
        self.assertEqual(rolls,[1]);self.assertEqual(s['units'][5]['hp'],3)
        self.assertEqual(s['effects'][-1]['positions'],[[3,4]])
        s['barrages']=[dict(side='de',pos=[3,5],area=[[3,5],[3,4]],ttl=1)]
        s=apply(s,'us',dict(kind='end'),roll=roll)
        self.assertEqual(rolls,[1]);self.assertEqual(s['effects'][-1]['positions'],[[3,5],[3,4]])

    def test_computer_budget_caps_and_playback(self):
        for scenario in ['village','riverfront']:
            s=self.battle(scenario);s['ai_side']='de'
            for _ in range(3):
                if s['winner']:break
                s=play_turn(apply(s,'us',dict(kind='end')))
                self.assertTrue(s['winner'] or s['turn']=='us')
                self.assertTrue(s['computer_playback']['frames'])
                for u in s['units']:
                    self.assertLessEqual(u['ap_received'],turn_limit(u));self.assertGreaterEqual(u['ap'],0)


class DSLAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=os.path.join(self.tmp.name,'game.db')
        self.client=create_app(self.path).test_client()
    def tearDown(self):self.tmp.cleanup()
    def create(self, **args):
        response=self.client.post('/api/match',json=args);self.assertEqual(response.status_code,201)
        seat=response.get_json();return '/api/match/'+seat['code'],{'Authorization':'Bearer '+seat['token']}
    def test_invalid_and_unimplemented_profiles(self):
        for value in ['asl','bad',[],None]:
            self.assertEqual(self.client.post('/api/match',json={'ruleset':value}).status_code,400)
        self.assertEqual(len(self.client.get('/api/rulesets').get_json()['rulesets']),3)
    def test_mixed_rulesets_save_restore_and_solo_rematch(self):
        legacy,la=self.create(opponent='computer')
        url,auth=self.create(opponent='computer',ruleset='dsl')
        state=self.client.post(url,json={'kind':'end','revision':0},headers=auth).get_json()
        self.assertEqual(state['ruleset'],'dsl');self.assertEqual(state['units'][1]['ap'],5)
        code=self.client.post(url+'/save',json={'revision':state['revision']},headers=auth).get_json()['save_code']
        self.client=create_app(self.path).test_client()
        restored=self.client.post('/api/restore',json={'code':code}).get_json()
        loaded=self.client.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).get_json()
        state.pop('code');loaded.pop('code');self.assertEqual(state,loaded)
        self.assertEqual(self.client.get(legacy,headers=la).get_json()['units'][1]['ap'],2)
        next_state=self.client.post(url+'/rematch',json={'operation':'propose','scenario':'riverfront','swap':True,'revision':state['revision'],'ruleset':'dsl'},headers=auth).get_json()
        self.assertEqual(next_state['ruleset'],'dsl');self.assertEqual(next_state['side'],'de')
    def test_multiplayer_ruleset_switch_requires_acceptance(self):
        url,auth=self.create(ruleset='classic')
        guest=self.client.post(url+'/join',json={}).get_json();ga={'Authorization':'Bearer '+guest['token']}
        proposal=self.client.post(url+'/rematch',json={'operation':'propose','scenario':'village','swap':False,'revision':1,'ruleset':'dsl'},headers=auth).get_json()
        self.assertEqual(proposal['ruleset'],'classic');self.assertEqual(proposal['rematch']['ruleset'],'dsl')
        accepted=self.client.post(url+'/rematch',json={'operation':'accept','revision':proposal['revision']},headers=ga).get_json()
        self.assertEqual(accepted['ruleset'],'dsl');self.assertEqual(accepted['units'][1]['ap'],3)

if __name__=='__main__':unittest.main()
