import copy
import json
import os
import tempfile
import time
import unittest
import uuid

from empires import engine as e
from hex_geometry import distance, neighbors
from ww2_tactics.engine import distance as dsl_distance
from ww2_web import create_app


class EmpiresRules(unittest.TestCase):
    def setUp(self):
        self.s = e.initial(seed=42)

    def unit(self, kind, side='river'):
        return next(u for u in self.s['units'] if u['kind'] == kind and u['side'] == side)

    def order(self, **body):
        return e.apply(self.s, self.s['turn'], body)

    def flat(self):
        for row in self.s['map']:
            for t in row:
                t.update(terrain='grass',road=False,resource=None,improvement=None)
        e.update_intel(self.s)

    def test_shared_geometry_and_parity(self):
        self.assertIs(distance,dsl_distance)
        for p in ([2,4],[2,5],[0,0],[15,11]):
            adjacent=list(neighbors(p,16,12))
            self.assertEqual(len(adjacent),len(set(adjacent)))
            self.assertTrue(all(distance(p,n)==1 for n in adjacent))

    def test_both_starts_have_choices_and_hidden_rivals(self):
        for side in e.SIDES:
            s=e.initial(faction=side,seed=23)
            public=e.public(s,side)
            self.assertEqual(s['turn'],side)
            self.assertEqual(len(public['units']),4)
            self.assertEqual(len(public['cities']),1)
            self.assertTrue(any(t is None for row in public['map'] for t in row))
            self.assertNotIn('rng_seed',public)
            self.assertNotIn('players',public)
            for u in public['units']:
                self.assertTrue(public['legal'][u['id']]['moves'])

    def test_terrain_cost_stacking_and_rejected_move(self):
        self.flat();u=self.unit('spearman');p=[3,4]
        e.tile(self.s,p)['terrain']='woods'
        self.order(kind='move',unit=u['id'],pos=p)
        self.assertEqual(u['ap'],0)
        with self.assertRaises(ValueError):self.order(kind='move',unit=u['id'],pos=[4,4])
        self.assertEqual(u['pos'],p)
        u['ap']=4;e.new_unit(self.s,'river','builder',[4,4]);e.new_unit(self.s,'river','scout',[4,4])
        self.assertFalse(any(m['pos']==[4,4] for m in e.legal(self.s,u)['moves']))

    def test_road_bonus_and_banking_do_not_accumulate(self):
        self.flat();u=self.unit('spearman');u['pos']=[2,7]
        for x in range(2,6):e.tile(self.s,[x,7])['road']=True
        e.update_intel(self.s)
        self.order(kind='move',unit=u['id'],pos=[3,7]);self.assertEqual(u['ap'],1)
        self.order(kind='move',unit=u['id'],pos=[4,7]);self.assertEqual(u['ap'],1)
        self.order(kind='move',unit=u['id'],pos=[5,7]);self.assertEqual(u['ap'],0)
        for _ in range(3):
            self.order(kind='end');self.order(kind='end')
            self.assertLessEqual(u['ap'],3)

    def test_found_city_builder_charges_and_growth(self):
        self.flat();u=self.unit('settler');u['pos']=[3,9];e.update_intel(self.s)
        self.order(kind='found',unit=u['id'])
        self.assertNotIn(u,self.s['units']);self.assertEqual(len(self.s['cities']),3)
        b=self.unit('builder');self.order(kind='farm',unit=b['id'])
        self.assertEqual(b['charges'],2)
        self.assertEqual(e.tile(self.s,b['pos'])['improvement'],'farm')
        city=self.s['cities'][0];before=city['population']
        for _ in range(10):self.order(kind='end');self.order(kind='end')
        self.assertGreater(city['population'],before)
        self.assertIn('granary',city['buildings'])

    def test_projects_research_and_knowledge_carryover(self):
        c=self.s['cities'][0];p=self.s['players']['river'];p['gold']=100;p['knowledge']=20
        self.order(kind='produce',city=c['id'],project='workshop');self.order(kind='rush',city=c['id'])
        self.assertIn('workshop',c['buildings']);self.assertEqual(p['gold'],34)
        with self.assertRaises(ValueError):self.order(kind='produce',city=c['id'],project='library')
        self.order(kind='research',tech='writing');self.order(kind='end')
        self.assertIn('writing',p['techs']);self.assertGreater(p['knowledge'],0)
        self.order(kind='end');self.order(kind='produce',city=c['id'],project='library')
        self.assertEqual(c['project'],'library')

    def test_war_cover_rally_and_city_victory(self):
        self.flat();u=self.unit('spearman');enemy=self.unit('spearman','highland');u['pos']=[5,5];enemy['pos']=[6,5];e.update_intel(self.s)
        self.assertFalse(e.legal(self.s,u)['attacks'])
        self.order(kind='diplomacy',action='war')
        a=e.legal(self.s,u)['attacks'][0];self.assertEqual(a['threshold'],4)
        enemy['fortified']=True;e.tile(self.s,enemy['pos'])['terrain']='hill'
        self.assertEqual(e.legal(self.s,u)['attacks'][0]['threshold'],6)
        enemy['shaken']=True;self.s['turn']='highland'
        self.order(kind='rally',unit=enemy['id']);self.assertFalse(enemy['shaken']);self.assertEqual(enemy['ap'],1)
        self.s['turn']='river';capital=next(c for c in self.s['cities'] if c['side']=='highland')
        self.s['units']=[u];u['pos']=[12,5];capital['hp']=1
        for _ in range(50):
            u['ap']=2;e.update_intel(self.s);self.order(kind='attack',unit=u['id'],target=capital['id'])
            if self.s['winner']:break
        self.assertEqual(self.s['winner'],'river')

    def test_visibility_remembers_old_city_and_no_hidden_orders(self):
        self.flat();scout=self.unit('scout');scout['pos']=[11,5];e.update_intel(self.s)
        rival=next(c for c in self.s['cities'] if c['side']=='highland')
        public=e.public(self.s,'river');self.assertTrue(next(c for c in public['cities'] if c['id']==rival['id'])['visible'])
        scout['pos']=[2,5];e.update_intel(self.s);rival['population']=6;rival['hp']=2
        e.log(self.s,'Secret enemy research',['highland']);e.update_intel(self.s)
        public=e.public(self.s,'river');memory=next(c for c in public['cities'] if c['id']==rival['id'])
        self.assertFalse(memory['visible']);self.assertEqual(memory['population'],1);self.assertEqual(memory['hp'],8)
        self.assertNotIn('Secret enemy research',str(public))
        self.assertTrue(all(u['side']=='river' for u in public['units']))

    def test_trade_is_mutual_and_ends_at_war(self):
        self.s['diplomacy']['met']=True
        before=e.economy(self.s,'river')['gold']
        self.order(kind='diplomacy',action='trade');self.order(kind='end')
        self.order(kind='diplomacy',action='accept')
        self.assertEqual(e.economy(self.s,'river')['gold'],before+3)
        self.order(kind='diplomacy',action='war')
        self.assertFalse(self.s['diplomacy']['trade'])

    def test_complete_campaigns_both_factions_and_ai_develops(self):
        start=time.monotonic()
        for faction in e.SIDES:
            s=e.initial(faction=faction,seed=7)
            for _ in range(40):
                e.apply(s,faction,dict(kind='end'));e.computer_turn(s)
                if s['winner']:break
            self.assertIsNotNone(s['winner']);self.assertEqual(s['round'],40)
            self.assertTrue(any(c['side']==e.other(faction) and not c['capital'] for c in s['cities']))
            self.assertGreater(len(s['players'][e.other(faction)]['techs']),1)
            self.assertTrue(all(0<=u['ap']<=e.UNITS[u['kind']]['ap']+1 for u in s['units']))
        self.assertLess(time.monotonic()-start,10,'Compact AI turns should stay bounded.')


class EmpiresAPI(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=os.path.join(self.tmp.name,'test.sqlite')
        self.app=create_app(self.path,start_worker=False);self.app.testing=True;self.client=self.app.test_client()
        self.created=self.client.post('/api/empires/games',json={}).json
        self.seat=self.created['seat'];self.route='/api/empires/games/'+self.seat['code']
        self.headers={'Authorization':'Bearer '+self.seat['token']}

    def tearDown(self):self.tmp.cleanup()

    def command(self,**body):
        state=self.client.get(self.route,headers=self.headers).json
        return self.client.post(self.route,headers=self.headers,json=dict(revision=state['revision'],command_id=str(uuid.uuid4()),**body))

    def test_persistent_reload_and_duplicate_order(self):
        payload=dict(kind='end',revision=0,command_id='test-retry-0001')
        first=self.client.post(self.route,headers=self.headers,json=payload)
        self.assertEqual(first.status_code,200)
        again=self.client.post(self.route,headers=self.headers,json=payload)
        self.assertEqual(first.json,again.json)
        second=create_app(self.path,start_worker=False).test_client().get(self.route,headers=self.headers)
        self.assertEqual(first.json,second.json)
        self.assertEqual(self.client.post(self.route,headers=self.headers,json={**payload,'kind':'resign'}).status_code,409)
        self.assertEqual(self.client.post(self.route,headers=self.headers,json={**payload,'command_id':'stale-command-002'}).status_code,409)

    def test_auth_and_games_cannot_cross(self):
        self.assertEqual(self.client.get(self.route).status_code,403)
        other=self.client.post('/api/empires/games',json={}).json
        self.assertEqual(self.client.get(self.route,headers={'Authorization':'Bearer '+other['seat']['token']}).status_code,403)
        dsl=self.client.post('/api/match',json={'scenario':'village','ruleset':'dsl'}).json
        self.assertEqual(self.client.get(self.route,headers={'Authorization':'Bearer '+dsl['token']}).status_code,403)
        self.assertEqual(self.client.get('/api/match/'+dsl['code'],headers=self.headers).status_code,403)

    def test_human_invite_turns_and_full_seats(self):
        made=self.client.post('/api/empires/games',json={'mode':'human','faction':'highland'}).json
        route='/api/empires/games/'+made['seat']['code'];h={'Authorization':'Bearer '+made['seat']['token']}
        body=dict(kind='end',revision=0,command_id='human-command-01')
        self.assertEqual(self.client.post(route,headers=h,json=body).status_code,409)
        guest=self.client.post(route+'/join',json={}).json;gh={'Authorization':'Bearer '+guest['seat']['token']}
        self.assertEqual(guest['seat']['side'],'river')
        self.assertEqual(self.client.post(route+'/join',json={}).status_code,409)
        self.assertEqual(self.client.post(route,headers=gh,json=body).status_code,400)
        r=self.client.post(route,headers=h,json=body);self.assertEqual(r.status_code,200);self.assertEqual(r.json['turn'],'river')
        r=self.client.post(route,headers=gh,json={**body,'revision':1});self.assertEqual(r.status_code,200);self.assertEqual(r.json['round'],2)

    def test_commander_link_and_new_browser_resume(self):
        player=self.client.post('/api/commander/register',json={'name':'Empire Tester','password':'a-long-test-password'}).json
        account={'X-Commander-Token':player['token']}
        r=self.client.post(self.route+'/link',headers={**self.headers,**account},json={});self.assertEqual(r.status_code,200)
        self.assertEqual(self.client.get('/api/empires/games',headers=account).json['games'][0]['code'],self.seat['code'])
        self.assertEqual(self.client.get(self.route,headers=account).status_code,200)
        self.assertEqual(self.client.post(self.route+'/join',headers=account,json={}).status_code,200)

    def test_bad_input_is_rejected_without_mutation(self):
        for payload in ({'kind':[]},{'kind':'research','tech':{}},[],{'kind':'move','revision':True,'command_id':'invalid-revision'}):
            r=self.client.post(self.route,headers=self.headers,json=payload)
            self.assertIn(r.status_code,(400,409))
        self.assertEqual(self.client.get(self.route,headers=self.headers).json['revision'],0)


if __name__=='__main__':unittest.main()
