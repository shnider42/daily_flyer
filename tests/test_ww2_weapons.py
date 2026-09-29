import copy
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_tactics import weapons
from ww2_tactics.engine import initial, apply, options, react
from ww2_tactics.scenarios import SCENARIOS
from ww2_tactics.support import resolve_barrages
from ww2_tactics.visibility import visible_ids, public_state, update_intel
from ww2_tactics.order_history import perform, status
from ww2_tactics.computer import choose_order, objective_costs
from ww2_web import create_app


class WeaponRulesTests(unittest.TestCase):
    def field(self, *roles):
        s = initial('frontier', 'dsl')
        s.update(ready=True, fog_of_war=False, intel={})
        s['battlefield']['map'] = [['field']*24 for _ in range(24)]
        roster = s['units']; s['units'] = []
        for i, (side, kind, pos) in enumerate(roles):
            u = copy.deepcopy(next(u for u in roster if u['side']==side and u['kind']==kind))
            u.update(id=f'{side}-{i}', pos=pos, reserve=False)
            s['units'].append(u)
        return s

    def sea(self):
        s=initial('midway','dsl');s.update(ready=True,intel={})
        s['battlefield']['map']=[['water']*26 for _ in range(30)]
        ship=next(u for u in s['units'] if u['side']=='us' and u['kind']=='battleship')
        enemy=next(u for u in s['units'] if u['side']=='de' and u['kind']=='amphibious')
        carriers=[u for u in s['units'] if u['kind']=='carrier']
        for i,u in enumerate(carriers):u['pos']=[24,i if u['side']=='de' else 28+i%2]
        ship['pos']=[2,15];enemy['pos']=[13,15]
        s['units']=[ship,enemy]+carriers
        return s,ship,enemy

    def test_every_new_dsl_map_uses_versioned_profiles_and_legacy_is_unchanged(self):
        for name in SCENARIOS:
            with self.subTest(map=name):
                s=initial(name,'dsl')
                self.assertEqual(s['combat_version'],1)
                self.assertTrue(all(u['weapon'] in weapons.PROFILES and u['protection'] for u in s['units']))
        self.assertNotIn('combat_version',initial())
        s=self.field(('us','tank',[5,5]),('de','tank',[7,5]))
        s.pop('combat_version')
        out=apply(s,'us',dict(kind='fire',unit='us-0',target='de-1'),roll=lambda:6)
        self.assertTrue(out['units'][1]['pinned'])
        self.assertNotIn('immobilized',out['units'][1])

    def test_fire_matrix_and_future_units_use_traits(self):
        s=self.field(('us','squad',[5,5]),('us','mg',[6,5]),('de','tank',[7,5]),('de','halftrack',[8,5]))
        for shooter in s['units'][:2]:
            self.assertFalse(options(s,shooter)['targets'])
            self.assertFalse(options(s,shooter)['suppress'])
            self.assertFalse(options(s,shooter)['grenades'])
        tank=s['units'][2];ship=dict(tank,kind='future_ship',protection='ship',armor=1,tracked=False)
        future=dict(s['units'][0],kind='future_at_vehicle',weapon='rocket')
        self.assertEqual(weapons.damage(future,tank),2)
        self.assertEqual(weapons.damage(future,ship),1)
        self.assertEqual(weapons.damage(dict(tank,ammo='he'),tank),0)
        self.assertEqual(weapons.damage(dict(tank,ammo='he'),ship),0)
        for weapon in ('mortar','fragmentation','small_arms','machine_gun'):
            self.assertEqual(weapons.damage(future,tank,weapon),0)
            self.assertEqual(weapons.damage(future,ship,weapon),0)

    def test_high_penetrating_hit_disables_tracks_but_not_gun(self):
        s=self.field(('us','tank',[5,5]),('de','tank',[7,5]))
        s['units'][1].update(overwatch=True)
        out=apply(s,'us',dict(kind='fire',unit='us-0',target='de-1'),roll=lambda:6)
        tank=out['units'][1]
        self.assertEqual(tank['hp'],3);self.assertFalse(tank['pinned'])
        self.assertTrue(tank['immobilized']);self.assertTrue(tank['overwatch'])
        out['turn']='de';legal=options(out,tank)
        self.assertEqual(legal['moves'],[]);self.assertFalse(legal['rally'])
        self.assertTrue(legal['targets']);self.assertTrue(legal['repair_tracks'])
        tank['ap']=3
        repaired=apply(out,'de',dict(kind='repair_tracks',unit=tank['id']))
        self.assertFalse(repaired['units'][1]['immobilized']);self.assertEqual(repaired['units'][1]['hp'],3)
        self.assertEqual(repaired['units'][1]['ap'],1)
        self.assertTrue(options(repaired,repaired['units'][1])['moves'])
        self.assertNotIn('immobilized',s['units'][1])

    def test_low_hit_miss_and_nonpenetrating_hit_never_disable_tracks(self):
        s=self.field(('us','tank',[5,5]),('de','tank',[7,5]))
        u,t=s['units']
        weapons.resolve(s,u,t,4,4)
        self.assertFalse(t.get('immobilized'));self.assertFalse(t['pinned'])
        weapons.resolve(s,u,t,6,7)
        self.assertFalse(t.get('immobilized'))
        weapons.resolve(s,dict(u,ammo='he'),t,6,4)
        self.assertFalse(t.get('immobilized'));self.assertEqual(t['hp'],3)

    def test_overwatch_uses_penetration_and_mobility_rules(self):
        s=self.field(('us','tank',[5,5]),('de','at_gun',[7,5]),('de','mg',[8,5]))
        mover,gun,mg=s['units'];gun['overwatch']=mg['overwatch']=True
        react(s,mover,lambda:6)
        self.assertTrue(mover['immobilized']);self.assertFalse(mover['pinned'])
        self.assertEqual(mover['hp'],2);self.assertTrue(mg['overwatch'])

    def test_ammunition_cost_splash_friendly_fire_and_protection(self):
        s=self.field(('us','tank',[3,5]),('de','squad',[6,5]),('us','squad',[6,6]),('de','tank',[7,5]))
        out=apply(s,'us',dict(kind='load_ammo',unit='us-0',ammo='he'))
        self.assertEqual(out['units'][0]['ap'],2)
        self.assertEqual(out['action_history'][-1]['action']['ammo'],'he')
        self.assertNotIn('de-3',[t['id'] for t in options(out,out['units'][0])['targets']])
        out=apply(out,'us',dict(kind='fire',unit='us-0',target='de-1'),roll=lambda:6)
        self.assertEqual([u['hp'] for u in out['units']],[4,1,3,5])
        self.assertTrue(out['units'][1]['pinned']);self.assertTrue(out['units'][2]['pinned'])
        self.assertFalse(out['units'][3]['pinned'])
        with self.assertRaises(ValueError):apply(out,'us',dict(kind='load_ammo',unit='us-0',ammo='ap'))
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='load_ammo',unit='us-0',ammo='nonsense'))

    def test_mortar_hits_infantry_only_including_friendlies(self):
        s=self.field(('us','squad',[5,5]),('de','squad',[6,5]),('de','tank',[5,6]),('de','halftrack',[6,6]))
        for u in s['units']:u['entrenched']=True;u['overwatch']=True
        s['barrages']=[dict(side='us',pos=[5,5],area=[u['pos'] for u in s['units']],ttl=1)]
        resolve_barrages(s,{'us':'US','de':'DE'})
        self.assertEqual([u['hp'] for u in s['units']],[3,2,5,3])
        for u in s['units'][:2]:self.assertTrue(u['pinned']);self.assertFalse(u['entrenched'])
        for u in s['units'][2:]:self.assertFalse(u['pinned']);self.assertTrue(u['overwatch']);self.assertTrue(u['entrenched'])

    def test_naval_shore_accuracy_critical_and_adjacent_only_splash(self):
        s,ship,enemy=self.sea();s['fog_of_war']=False;ship['pos']=[10,15]
        neighbor=copy.deepcopy(enemy);neighbor.update(id='neighbor',pos=[13,16]);s['units'].append(neighbor)
        shot=next(t for t in options(s,ship)['targets'] if t['id']==enemy['id'])
        self.assertEqual(shot['threshold'],6)
        miss=apply(s,'us',dict(kind='fire',unit=ship['id'],target=enemy['id']),roll=lambda:5)
        self.assertEqual(miss['units'][1]['hp'],4)
        out=apply(s,'us',dict(kind='fire',unit=ship['id'],target=enemy['id']),roll=lambda:6)
        self.assertEqual(out['units'][1]['hp'],0)
        self.assertEqual(out['units'][-1]['hp'],3);self.assertTrue(out['units'][-1]['pinned'])
        out['turn']='de'
        self.assertTrue(options(out,out['units'][-1])['rally'])
        rallied=apply(out,'de',dict(kind='rally',unit='neighbor'))
        self.assertFalse(rallied['units'][-1]['pinned'])

    def test_blind_bombardment_legal_orders_and_reports_do_not_leak_hidden_hits(self):
        s,ship,enemy=self.sea();update_intel(s)
        self.assertNotIn(enemy['id'],visible_ids(s,'us'))
        empty=copy.deepcopy(s);empty['units'][1]['pos']=[20,2]
        self.assertEqual(options(s,ship),options(empty,empty['units'][0]))
        order=dict(kind='bombard',unit=ship['id'],pos=enemy['pos'])
        hit=apply(s,'us',order,roll=lambda:6);miss=apply(empty,'us',order,roll=lambda:6)
        self.assertEqual(hit['units'][1]['hp'],0)
        self.assertEqual(public_state(hit,'us'),public_state(miss,'us'))
        self.assertNotIn(enemy['id'],json.dumps(public_state(hit,'us')))
        defender=public_state(hit,'de')['last_combat']
        self.assertTrue(any(i['id']==enemy['id'] for i in defender['impacts']))
        self.assertNotIn('attacker',defender)
        with self.assertRaises(ValueError):apply(s,'us',dict(order,pos=[25,29]))

    def test_bombardment_redo_keeps_roll_and_all_impacts(self):
        s,ship,enemy=self.sea();s['fog_of_war']=False
        with patch('ww2_tactics.order_history.secrets.randbelow',return_value=5) as dice:
            hit=perform(s,'us',dict(kind='bombard',unit=ship['id'],pos=enemy['pos']))
            undone=perform(hit,'us',dict(kind='undo'))
            with self.assertRaisesRegex(ValueError,'Redo resolved dice'):
                perform(undone,'us',dict(kind='bombard',unit=ship['id'],pos=[12,15]))
            redone=perform(undone,'us',dict(kind='redo'))
            self.assertEqual(redone['units'],hit['units']);self.assertEqual(redone['last_combat'],hit['last_combat'])
            self.assertEqual(dice.call_count,1)

    def test_commander_range_caps_and_artillery_after_caller_loss(self):
        s=self.field(('us','commander',[3,5]),('us','squad',[7,5]),('de','tank',[14,5]))
        co,friend,tank=s['units'];friend.update(ap=1,ap_received=2)
        self.assertIn(friend['id'],options(s,co)['command'])
        self.assertIn(tank['pos'],options(s,co)['artillery'])
        out=apply(s,'us',dict(kind='artillery',unit=co['id'],pos=tank['pos']))
        self.assertEqual(out['units'][0]['artillery_charges'],1)
        self.assertEqual(out['units'][0]['ap'],1)
        out['units'][0]['hp']=0
        out=apply(out,'us',dict(kind='end'),roll=lambda:5)
        self.assertEqual(out['units'][2]['hp'],5)
        out=apply(out,'de',dict(kind='end'),roll=lambda:5)
        self.assertEqual(out['units'][2]['hp'],3);self.assertTrue(out['units'][2]['immobilized'])
        self.assertFalse(out['units'][2]['pinned'])
        self.assertEqual(out['last_combat']['roll'],5)

    def test_commander_recon_reveals_concealed_troops_expires_and_commits_undo(self):
        s=self.field(('us','commander',[2,5]),('de','squad',[13,5]))
        s['fog_of_war']=True;s['battlefield']['map'][5][13]='woods';update_intel(s)
        self.assertNotIn('de-1',visible_ids(s,'us'))
        out=perform(s,'us',dict(kind='field_recon',unit='us-0',pos=[13,5]))
        self.assertIn('de-1',visible_ids(out,'us'))
        self.assertEqual(out['units'][0]['field_recon_charges'],1)
        self.assertFalse(status(out,'us')['can_undo'])
        self.assertEqual(public_state(out,'de')['recon'],[])
        out=apply(apply(out,'us',dict(kind='end')),'de',dict(kind='end'))
        self.assertNotIn('de-1',visible_ids(out,'us'))
        self.assertEqual(public_state(out,'us')['contacts'][0]['pos'],[13,5])

    def test_ai_uses_ammunition_and_has_no_hidden_target_information(self):
        s=self.field(('us','tank',[3,5]),('de','tank',[6,5]));s['units'][0]['ammo']='he'
        order=choose_order(s,objective_costs(s),{})
        self.assertEqual(order,dict(kind='load_ammo',unit='us-0',ammo='ap'))
        sea,ship,enemy=self.sea();alternate=copy.deepcopy(sea);alternate['units'][1]['pos']=[25,1]
        self.assertEqual(choose_order(sea,objective_costs(sea),{}),choose_order(alternate,objective_costs(alternate),{}))

    def test_aircraft_bombing_pins_gun_crews_but_not_installations(self):
        s=initial('britain','dsl');s.update(ready=True,turn='de',fog_of_war=False)
        bomber=next(u for u in s['units'] if u['kind']=='bomber')
        gun=next(u for u in s['units'] if u['kind']=='aa_gun');bomber['pos']=[gun['pos'][0],gun['pos'][1]+1]
        out=apply(s,'de',dict(kind='fire',unit=bomber['id'],target=gun['id']),roll=lambda:6)
        damaged=next(u for u in out['units'] if u['id']==gun['id'])
        self.assertTrue(damaged['pinned']);self.assertFalse(damaged['overwatch'])
        out['turn']='us';legal=options(out,damaged)
        self.assertTrue(legal['rally']);self.assertFalse(legal['targets']);self.assertFalse(legal['overwatch'])
        out=apply(out,'us',dict(kind='rally',unit=gun['id']))
        self.assertFalse(next(u for u in out['units'] if u['id']==gun['id'])['pinned'])
        field=next(u for u in s['units'] if u['kind']=='airfield')
        weapons.resolve(s,bomber,field,6,3)
        self.assertFalse(field['pinned'])

    def test_artillery_replay_reports_own_damage_without_revealing_hidden_caller(self):
        from ww2_tactics.computer import play_turn
        s=self.field(('us','commander',[3,5]),('de','tank',[15,5]),('de','squad',[15,6]))
        s.update(fog_of_war=True,ai_side='us');update_intel(s)
        s['units'][0]['ap']=0
        s['barrages']=[dict(side='us',attacker='us-0',pos=[15,5],area=[[15,5],[15,6]],ttl=1,weapon='artillery')]
        out=play_turn(s,roll=lambda:6)
        replay=out.get('computer_playback',{})
        self.assertNotIn('us-0',json.dumps(replay))
        frame=replay['frames'][-1]
        self.assertEqual([u['hp'] for u in frame['after']['units']],[3,2])
        self.assertEqual(len(frame['combat'][0]['impacts']),2)
        self.assertNotIn('attacker',frame['combat'][0])

    def test_api_save_restore_preserves_ammo_tracks_charges_and_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=os.path.join(tmp,'games.sqlite');client=create_app(path).test_client()
            seat=client.post('/api/match',json=dict(opponent='computer',scenario='frontier',ruleset='dsl')).get_json()
            auth={'Authorization':'Bearer '+seat['token']};url='/api/match/'+seat['code']
            with sqlite3.connect(path) as db:
                s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(seat['code'],)).fetchone()[0])
                tank=next(u for u in s['units'] if u['kind']=='tank' and u['side']=='us');tank.update(ammo='he',immobilized=True)
                co=next(u for u in s['units'] if u['kind']=='commander' and u['side']=='us');co['artillery_charges']=1
                db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),seat['code']))
            before=client.get(url,headers=auth).get_json()
            saved=client.post(url+'/save',headers=auth,json={'revision':0}).get_json()
            seat2=client.post('/api/restore',json={'code':saved['save_code']}).get_json()
            after=client.get('/api/match/'+seat2['code'],headers={'Authorization':'Bearer '+seat2['token']}).get_json()
            self.assertEqual(after['units'],before['units']);self.assertEqual(after['combat_version'],1)
            self.assertEqual(after['legal'][tank['id']]['moves'],[])
            self.assertTrue(after['legal'][tank['id']]['repair_tracks'])
