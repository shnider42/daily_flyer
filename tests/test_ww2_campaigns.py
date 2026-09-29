import copy
import os
import tempfile
import unittest
from unittest.mock import patch

from ww2_tactics import air, transport
from ww2_tactics.engine import initial, apply, options, distance, terrain, fire_threshold
from ww2_tactics.computer import choose_order, objective_costs, play_turn
from ww2_tactics.visibility import active, visible_ids, update_intel, public_state
from ww2_tactics.order_history import perform, status
from ww2_web import create_app


class CampaignTests(unittest.TestCase):
    def battle(self, name='britain'):
        s=initial(name,'dsl');s['ready']=True
        return s

    def air_field(self, *roles):
        s=self.battle();chosen=[]
        for side,kind,pos in roles:
            u=copy.deepcopy(next(u for u in s['units'] if u['side']==side and u['kind']==kind))
            u.update(id=f'{side}-{kind}-{len(chosen)}',pos=pos,overwatch=False)
            chosen.append(u)
        # Preserve victory targets, far from the test engagement.
        if not any(u['kind']=='bomber' for u in chosen):
            u=copy.deepcopy(next(u for u in s['units'] if u['kind']=='bomber'));u.update(pos=[21,17]);chosen.append(u)
        if not any(u['kind']=='airfield' and u['side']=='us' for u in chosen):
            u=copy.deepcopy(next(u for u in s['units'] if u['kind']=='airfield'));u.update(pos=[0,0]);chosen.append(u)
        s['units']=chosen;s['intel']={};update_intel(s)
        return s

    def test_new_rosters_bounds_and_separate_rules(self):
        for name,count in [('stalingrad',26),('omaha',26),('britain',17)]:
            with self.subTest(name=name):
                s=self.battle(name);b=s['battlefield']
                self.assertEqual(len(s['units']),count)
                self.assertTrue(s['fog_of_war'])
                self.assertEqual(len({u['id'] for u in s['units']}),count)
                self.assertEqual(len({tuple(u['pos']) for u in s['units'] if active(u)}),sum(active(u) for u in s['units']))
                for u in s['units']:
                    self.assertTrue(0<=u['pos'][0]<b['width'] and 0<=u['pos'][1]<b['height'])
                with self.assertRaises(ValueError):initial(name,'classic')
        self.assertNotIn('air_version',initial('midway','dsl'))
        self.assertNotIn('dsl_expansion',initial('village','dsl'))
        self.assertNotIn('campaign',initial('frontier','dsl')['battlefield'])

    def test_soviets_do_not_inherit_american_accuracy(self):
        s=self.battle('stalingrad');s['battlefield']['map']=[['field']*18 for _ in range(20)]
        us=next(u for u in s['units'] if u['side']=='us' and u['kind']=='squad')
        de=next(u for u in s['units'] if u['side']=='de' and u['kind']=='squad')
        us['pos']=[5,5];de['pos']=[7,5]
        self.assertEqual(fire_threshold(s,us,de),fire_threshold(s,de,us))
        self.assertEqual(s['factions']['us'],'Soviets')
        self.assertTrue(all(u['grenades']==3 for u in s['units'] if u['side']=='us' and u['kind']=='engineer'))

    def test_omaha_craft_passengers_land_and_sink(self):
        s=self.battle('omaha');craft=s['units'][0];troop=s['units'][1]
        self.assertFalse(active(troop));self.assertFalse(options(s,troop)['targets'])
        self.assertFalse(options(s,craft)['overwatch']);self.assertFalse(options(s,craft)['targets'])
        for move in options(s,craft)['moves']:self.assertEqual(terrain(*move['pos'],s),'water')
        craft['pos']=[6,13];transport.follow(s,craft)
        self.assertTrue(options(s,craft)['unload'])
        landing=options(s,craft)['unload'][0]['pos']
        for u in s['units']:u['overwatch']=False
        out=apply(s,'us',dict(kind='unload',unit=craft['id'],pos=landing),roll=lambda:1)
        self.assertNotIn('carrier_id',out['units'][1]);self.assertEqual(out['units'][1]['ap'],troop['ap']-1)
        self.assertEqual(out['units'][0]['ap'],craft['ap'])
        craft['hp']=0;transport.bail_out(s,craft)
        self.assertTrue(troop['hp']>0 and troop['pinned']);self.assertEqual(troop['ap'],0)
        self.assertNotEqual(terrain(*troop['pos'],s),'water')
        far=self.battle('omaha');far['units'][0]['hp']=0;transport.bail_out(far,far['units'][0])
        self.assertEqual(far['units'][1]['hp'],0)

    def test_flight_paths_adjacent_and_exact_destination(self):
        for start in ([0,0],[5,5],[7,6]):
            for end in ([1,1],[8,3],[3,9]):
                path=air.flight_path(start,end)
                self.assertEqual(len(path),distance(start,end));self.assertEqual(path[-1],end)
                for a,b in zip([start]+path,path):self.assertEqual(distance(a,b),1)

    def test_air_ignores_terrain_but_not_aircraft_occupancy(self):
        s=self.air_field(('us','fighter',[7,7]),('de','fighter',[9,7]))
        fighter=s['units'][0];s['battlefield']['map'][7][8]='building'
        legal=options(s,fighter)
        self.assertIn([8,7],[m['pos'] for m in legal['moves']])
        self.assertNotIn([10,7],[m['pos'] for m in legal['moves']])
        self.assertTrue(all(m['cost']==1 and len(m['path'])<=3 for m in legal['moves']))
        self.assertFalse(legal['dig']);self.assertFalse(legal['grenades']);self.assertFalse(legal['smoke'])

    def test_aa_checks_intervening_hex_not_only_destination(self):
        s=self.air_field(('de','fighter',[6,8]),('us','aa_gun',[7,7]))
        s['turn']='de';plane,aa=s['units'][:2];aa.update(range=1,overwatch=True)
        # Range-one circle meets the middle of this three-hex flight only.
        endpoint=[9,8];self.assertGreater(distance(aa['pos'],endpoint),aa['range'])
        move=next(m for m in options(s,plane)['moves'] if m['pos']==endpoint)
        self.assertEqual(move['threats'],1)
        with patch('ww2_tactics.order_history.secrets.randbelow',return_value=5) as rng:
            s['fog_of_war']=False
            out=perform(s,'de',dict(kind='move',unit=plane['id'],pos=endpoint))
            self.assertEqual(out['units'][0]['hp'],1);self.assertFalse(out['units'][1]['overwatch'])
            self.assertEqual(out['units'][0]['pos'],endpoint);self.assertEqual(rng.call_count,1)
            undo=perform(out,'de',dict(kind='undo'));redo=perform(undo,'de',dict(kind='redo'))
            self.assertEqual(redo['units'],out['units']);self.assertEqual(rng.call_count,1)
        plane['hp']=2
        killed=apply(s,'de',dict(kind='move',unit=plane['id'],pos=endpoint),roll=lambda:6)
        self.assertEqual(killed['units'][0]['hp'],0);self.assertNotEqual(killed['units'][0]['pos'],endpoint)

    def test_weapon_roles_and_bomb_loads(self):
        s=self.air_field(('de','bomber',[7,7]),('us','airfield',[8,7]),('us','fighter',[7,6]))
        s['turn']='de';bomber,station,fighter=s['units'][:3]
        legal=options(s,bomber)
        self.assertEqual([t['id'] for t in legal['targets']],[station['id']])
        out=apply(s,'de',dict(kind='fire',unit=bomber['id'],target=station['id']),roll=lambda:3)
        self.assertEqual(out['units'][1]['hp'],2);self.assertEqual(out['units'][0]['bombs'],1)
        bomber['bombs']=0;self.assertFalse(options(s,bomber)['targets'])
        s['turn']='us';self.assertNotIn(station['id'],[t['id'] for t in options(s,fighter)['targets']])

    def test_rearm_friendly_live_base_once_per_turn(self):
        s=self.air_field(('de','bomber',[7,7]),('de','airfield',[8,7]))
        s['turn']='de';bomber,base=s['units'][:2];bomber.update(hp=2,bombs=0,ap=4)
        self.assertTrue(options(s,bomber)['rearm'])
        out=apply(s,'de',dict(kind='rearm',unit=bomber['id']))
        self.assertEqual((out['units'][0]['hp'],out['units'][0]['bombs'],out['units'][0]['ap']),(3,2,2))
        self.assertFalse(options(out,out['units'][0])['rearm'])
        base['hp']=0;self.assertFalse(options(s,bomber)['rearm'])
        base.update(hp=4,side='us');self.assertFalse(options(s,bomber)['rearm'])

    def test_radar_air_only_and_fog_memory(self):
        s=self.air_field(('us','radar',[5,5]),('de','fighter',[12,5]),('de','airfield',[12,6]))
        radar,enemy,base=s['units'][:3]
        self.assertIn(enemy['id'],visible_ids(s,'us'));self.assertNotIn(base['id'],visible_ids(s,'us'))
        update_intel(s);radar['hp']=0;enemy['pos']=[15,5];update_intel(s)
        p=public_state(s,'us');contact=next(c for c in p['contacts'] if c['id']==enemy['id'])
        self.assertEqual(contact['pos'],[12,5]);self.assertNotIn('hp',contact)
        self.assertNotIn(enemy['id'],[u['id'] for u in p['units']]);self.assertNotIn('intel',p)

    def test_transient_flight_sight_commits_undo(self):
        s=self.air_field(('us','fighter',[5,5]),('de','airfield',[6,7]))
        # Artificial small sight radius exercises a contact seen only mid-leg.
        with patch('ww2_tactics.air.sees_hex',side_effect=lambda st,side,pos,ground=False: any(active(u) and u['side']==side and distance(u['pos'],pos)<=2 for u in st['units'])):
            s['intel']={};update_intel(s)
            # Find a flight revealing the ground contact along the path but not at either endpoint.
            enemy=s['units'][1];plane=s['units'][0];chosen=None
            for y in range(18):
                for x in range(22):
                    enemy['pos']=[x,y]
                    if distance(plane['pos'],enemy['pos'])<=2:continue
                    for m in options(s,plane)['moves']:
                        if distance(m['pos'],enemy['pos'])>2 and any(distance(p,enemy['pos'])<=2 for p in m['path']):chosen=m;break
                    if chosen:break
                if chosen:break
            self.assertIsNotNone(chosen);s['intel']={};update_intel(s)
            out=perform(s,'us',dict(kind='move',unit=plane['id'],pos=chosen['pos']))
            self.assertFalse(status(out,'us')['can_undo'])

    def test_victory_and_banking(self):
        s=self.battle();fighter=s['units'][0];fighter['ap']=3
        ended=apply(s,'us',dict(kind='end'));again=apply(ended,'de',dict(kind='end'))
        self.assertEqual(again['units'][0]['ap'],5);self.assertEqual(again['round'],2)
        s['round']=18;s['turn']='de';out=apply(s,'de',dict(kind='end'))
        self.assertEqual(out['winner'],'us');self.assertEqual(out['victories']['us'],1)
        with self.assertRaises(ValueError):apply(out,'us',dict(kind='end'))
        s=self.battle()
        for u in s['units']:
            if u['side']=='us' and u['kind']=='airfield':u['hp']=0
        out=apply(s,'us',dict(kind='end'));self.assertEqual(out['winner'],'de');self.assertEqual(len(out['raid_destroyed']),2)
        s=self.battle()
        for u in s['units']:
            if u['kind']=='bomber':u['hp']=0
        self.assertEqual(apply(s,'us',dict(kind='end'))['winner'],'us')

    def test_ai_hidden_information_and_each_scenario(self):
        s=self.air_field(('de','fighter',[10,14]),('us','fighter',[1,1]));s['turn']='de'
        order=choose_order(s,{},{});s['units'][1]['pos']=[20,0]
        self.assertEqual(choose_order(s,{},{}),order)
        for name in ('stalingrad','omaha','britain'):
            s=self.battle(name);s['ai_side']='de'
            out=play_turn(apply(s,'us',dict(kind='end')),roll=lambda:3)
            self.assertTrue(out['winner'] or out['turn']=='us');self.assertTrue(out['computer_playback']['frames'])
            self.assertNotIn('intel',public_state(out,'us'))
        s=self.battle('omaha');s['ai_side']='us'
        out=play_turn(s,roll=lambda:1)
        self.assertTrue(any(u['kind']=='landing_craft' and u['pos'][1]<16 for u in out['units']))

    def test_ai_smoke_never_selects_already_smoked_hex(self):
        s=self.battle('omaha');craft=s['units'][0]
        s['smoke']=[dict(pos=list(craft['pos']),ttl=2)]
        legal=options(s,craft)
        self.assertTrue(legal['smoke']);self.assertNotIn(craft['pos'],legal['smoke'])
        # A complete computer landing turn must never emit an invalid smoke order.
        s['ai_side']='us';out=play_turn(s,roll=lambda:1)
        self.assertEqual(out['turn'],'de')

    def test_api_save_restore_all_three(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=create_app(os.path.join(tmp,'test.db')).test_client()
            for name in ('stalingrad','omaha','britain'):
                seat=c.post('/api/match',json=dict(scenario=name,ruleset='dsl',opponent='computer')).get_json()
                url='/api/match/'+seat['code'];auth={'Authorization':'Bearer '+seat['token']}
                state=c.get(url,headers=auth).get_json()
                saved=c.post(url+'/save',json={'revision':state['revision']},headers=auth).get_json()
                restored=c.post('/api/restore',json={'code':saved['save_code']}).get_json()
                other=c.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).get_json()
                state.pop('code');other.pop('code');self.assertEqual(state,other)


if __name__=='__main__':unittest.main()
