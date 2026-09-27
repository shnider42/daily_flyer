import copy
import os
import tempfile
import unittest
from ww2_tactics.engine import initial,apply,options,line_clear
from ww2_tactics.visibility import visible_ids,public_state,update_intel
from ww2_tactics.computer import play_turn
from ww2_web import create_app


class NavalTests(unittest.TestCase):
    def battle(self):
        s=initial('midway','dsl');s['ready']=True
        return s
    def ship(self,s,side,kind):
        return next(u for u in s['units'] if u['side']==side and u['kind']==kind)
    def open_sea(self):
        s=self.battle();s['battlefield']['map']=[['water']*26 for _ in range(30)]
        return s

    def test_fleets_and_island_movement(self):
        s=self.battle();self.assertEqual(len(s['units']),36)
        self.assertEqual((s['battlefield']['width'],s['battlefield']['height']),(26,30))
        self.assertEqual(s['factions']['de'],'Japanese')
        self.assertTrue(all(u['faction']=='jp' for u in s['units'] if u['side']=='de'))
        self.assertEqual(len({tuple(u['pos']) for u in s['units']}),36)
        self.assertTrue(all(s['battlefield']['map'][u['pos'][1]][u['pos'][0]]=='water' for u in s['units']))
        self.assertGreater(sum(t!='water' for row in s['battlefield']['map'] for t in row),100)
        u=self.ship(s,'us','destroyer');u['pos']=[10,14]
        legal=options(s,u);self.assertNotIn([9,14],[m['pos'] for m in legal['moves']])
        self.assertTrue(legal['moves']);self.assertFalse(legal['dig']);self.assertFalse(legal['rally'])
        self.assertFalse(line_clear([8,13],[11,13],state=s))

    def test_amphibious_landing_fire_and_outpost(self):
        s=self.battle();u=self.ship(s,'us','amphibious');enemy=self.ship(s,'de','amphibious')
        u['pos']=[10,14]
        out=apply(s,'us',dict(kind='move',unit=u['id'],pos=[9,14]))
        landed=next(v for v in out['units'] if v['id']==u['id'])
        self.assertEqual(landed['ap'],2)
        self.assertIn([10,14],[m['pos'] for m in options(out,landed)['moves']])
        u['pos']=[6,13];u['ap']=3;enemy['pos']=[6,14]
        shot=next(t for t in options(s,u)['targets'] if t['id']==enemy['id'])
        self.assertEqual(shot['threshold'],5)
        out=apply(s,'us',dict(kind='fire',unit=u['id'],target=enemy['id']),roll=lambda:6)
        self.assertEqual(next(v for v in out['units'] if v['id']==enemy['id'])['hp'],3)
        enemy['pos']=[25,29]
        out=apply(s,'us',dict(kind='move',unit=u['id'],pos=[6,14]))
        self.assertEqual(next(v for v in out['units'] if v['id']==u['id'])['ap'],1)
        out=apply(out,'us',dict(kind='end'));self.assertEqual(out['sea_score']['us'],1)
        destroyer=self.ship(s,'us','destroyer');destroyer['pos']=[6,15]
        self.assertNotIn(enemy['id'],[t['id'] for t in options(s,destroyer)['torpedoes']])

    def test_guns_damage_armor_without_pins(self):
        s=self.open_sea();u=self.ship(s,'us','battleship');t=self.ship(s,'de','battleship')
        u['pos']=[10,14];t['pos']=[12,14]
        result=apply(s,'us',dict(kind='fire',unit=u['id'],target=t['id']),roll=lambda:6)
        target=next(x for x in result['units'] if x['id']==t['id'])
        self.assertEqual(target['hp'],6);self.assertFalse(target['pinned'])
        self.assertEqual(result['last_combat']['kind'],'Naval guns')

    def test_asymmetric_torpedoes_and_consumption(self):
        s=self.open_sea();u=self.ship(s,'de','destroyer');t=self.ship(s,'us','battleship');s['turn']='de'
        u['pos']=[10,14];t['pos']=[15,14]
        self.assertIn(t['id'],[q['id'] for q in options(s,u)['torpedoes']])
        out=apply(s,'de',dict(kind='torpedo',unit=u['id'],target=t['id']),roll=lambda:6)
        self.assertEqual(next(x for x in out['units'] if x['id']==t['id'])['hp'],4)
        shooter=next(x for x in out['units'] if x['id']==u['id']);self.assertEqual(shooter['torpedoes'],2)
        shooter['ap']=4;self.assertFalse(options(out,shooter)['torpedoes'])
        us=self.ship(s,'us','destroyer');self.assertEqual((us['base_ap'],us['torpedo_range']),(4,3))

    def test_carrier_recon_airstrike_aa_and_fog(self):
        s=self.open_sea();cv=self.ship(s,'us','carrier');enemy=self.ship(s,'de','carrier');escort=self.ship(s,'de','cruiser')
        cv['pos']=[3,25];enemy['pos']=[3,13];escort['pos']=[4,13]
        # Remove other friendly observers while retaining carrier victory conditions.
        for u in s['units']:
            if u['side']=='us' and u['id']!=cv['id']:u['pos']=[25,29]
        self.assertNotIn(enemy['id'],visible_ids(s,'us'))
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='airstrike',unit=cv['id'],target=enemy['id']))
        out=apply(s,'us',dict(kind='recon',unit=cv['id'],pos=[3,13]))
        self.assertIn(enemy['id'],visible_ids(out,'us'))
        own=next(u for u in out['units'] if u['id']==cv['id']);self.assertFalse(options(out,own)['recon'])
        shot=next(q for q in options(out,own)['airstrikes'] if q['id']==enemy['id']);self.assertEqual(shot['threshold'],4)
        out=apply(out,'us',dict(kind='airstrike',unit=cv['id'],target=enemy['id']),roll=lambda:6)
        self.assertEqual(next(u for u in out['units'] if u['id']==enemy['id'])['hp'],4)
        self.assertEqual(public_state(out,'de')['recon'],[])
        out=apply(apply(out,'us',dict(kind='end')),'de',dict(kind='end'))
        self.assertFalse(out['recon']);self.assertNotIn(enemy['id'],visible_ids(out,'us'))
        self.assertTrue(any(c['id']==enemy['id'] for c in public_state(out,'us')['contacts']))

    def test_repair_caps_smoke_and_turn_refresh(self):
        s=self.open_sea();u=self.ship(s,'us','destroyer');u.update(hp=2,ap=4)
        out=apply(s,'us',dict(kind='repair',unit=u['id']))
        ship=next(x for x in out['units'] if x['id']==u['id']);self.assertEqual(ship['hp'],3);self.assertEqual(ship['repairs'],1)
        out=apply(out,'us',dict(kind='smoke',unit=u['id'],pos=u['pos']))
        self.assertTrue(out['smoke']);self.assertFalse(line_clear(u['pos'],[u['pos'][0],u['pos'][1]-1],out['smoke'],out))
        out=apply(apply(out,'us',dict(kind='end')),'de',dict(kind='end'))
        ship=next(x for x in out['units'] if x['id']==u['id']);self.assertEqual(ship['ap'],5);self.assertFalse(ship['repair_used'])

    def test_control_contesting_and_carrier_victory(self):
        s=self.open_sea();u=self.ship(s,'us','destroyer');u['pos']=s['battlefield']['objective'][:]
        s=apply(s,'us',dict(kind='end'));self.assertEqual(s['sea_score']['us'],1)
        enemy=self.ship(s,'de','destroyer');enemy['pos']=[14,15]
        s=apply(s,'de',dict(kind='end'));s=apply(s,'us',dict(kind='end'))
        self.assertEqual(s['sea_score']['us'],1);self.assertEqual(s['sea_score']['de'],0)
        s=self.open_sea();s['sea_score']['us']=5;self.ship(s,'us','destroyer')['pos']=s['battlefield']['objective'][:]
        self.assertEqual(apply(s,'us',dict(kind='end'))['winner'],'us')
        s=self.open_sea()
        for u in s['units']:
            if u['side']=='de' and u['kind']=='carrier':u['hp']=0
        self.assertEqual(apply(s,'us',dict(kind='end'))['winner'],'us')

    def test_ai_and_redacted_replay(self):
        s=self.battle();s['ai_side']='de';s=play_turn(apply(s,'us',dict(kind='end')))
        self.assertEqual(s['turn'],'us');p=public_state(s,'us')
        self.assertTrue(p['computer_playback']['frames']);self.assertTrue(all(r['side']=='us' for r in p['recon']))
        self.assertTrue(all(u['ap']>=0 for u in s['units']))
        for f in p['computer_playback']['frames']:
            self.assertIn('sea_score',f['after']);self.assertTrue(all(r['side']=='us' for r in f['after']['recon']))

    def test_save_restore_and_japanese_seat(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=create_app(os.path.join(tmp,'g.db')).test_client()
            seat=c.post('/api/match',json={'scenario':'midway','ruleset':'dsl','opponent':'computer'}).get_json()
            url='/api/match/'+seat['code'];auth={'Authorization':'Bearer '+seat['token']}
            state=c.get(url,headers=auth).get_json();self.assertEqual(len(state['units']),18)
            code=c.post(url+'/save',json={'revision':0},headers=auth).get_json()['save_code']
            restored=c.post('/api/restore',json={'code':code}).get_json()
            loaded=c.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).get_json()
            state.pop('code');loaded.pop('code');self.assertEqual(state,loaded)
            swapped=c.post(url+'/rematch',json={'operation':'propose','scenario':'midway','ruleset':'dsl','swap':True,'revision':0},headers=auth).get_json()
            self.assertEqual(swapped['side'],'de');self.assertEqual(swapped['factions']['de'],'Japanese')

    def test_five_concurrent_players_have_isolated_matches(self):
        from concurrent.futures import ThreadPoolExecutor
        with tempfile.TemporaryDirectory() as tmp:
            app=create_app(os.path.join(tmp,'g.db'))
            def create_player(_):
                with app.test_client() as client:
                    result=client.post('/api/match',json={'scenario':'midway','ruleset':'dsl','opponent':'computer'})
                    self.assertEqual(result.status_code,201)
                    return result.get_json()
            with ThreadPoolExecutor(max_workers=5) as pool:seats=list(pool.map(create_player,range(5)))
            self.assertEqual(len({s['code'] for s in seats}),5)
            self.assertEqual(len({s['token'] for s in seats}),5)
            with app.test_client() as client:
                for i,seat in enumerate(seats):
                    url='/api/match/'+seat['code'];auth={'Authorization':'Bearer '+seat['token']}
                    state=client.get(url,headers=auth).get_json();self.assertEqual(state['revision'],0)
                    wrong={'Authorization':'Bearer '+seats[(i+1)%5]['token']}
                    self.assertEqual(client.get(url,headers=wrong).status_code,403)
                    self.assertEqual(client.post(url,headers=wrong,json={'kind':'end','revision':0}).status_code,403)
                    move=state['legal']['us0']['moves'][0]
                    moved=client.post(url,headers=auth,json={'kind':'move','unit':'us0','pos':move['pos'],'revision':0})
                    self.assertEqual(moved.status_code,200)
                    self.assertEqual(moved.get_json()['revision'],1)

if __name__=='__main__':unittest.main()
