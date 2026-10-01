import copy
import json
import os
import random
import sqlite3
import tempfile
import unittest
from collections import Counter
from unittest.mock import patch

from ww2_tactics import buildings, weapons, transport
from ww2_tactics.engine import initial, apply, options, fire_modifiers, line_clear
from ww2_tactics.visibility import update_intel, public_state, visible_ids
from ww2_tactics.support import resolve_barrages
from ww2_tactics.order_history import perform, status
from ww2_tactics.computer import objective_costs, choose_order
from ww2_tactics.scenarios import SCENARIOS
from ww2_web import create_app


class BuildingTests(unittest.TestCase):
    def field(self, *roles):
        s = initial('frontier', 'dsl')
        s.update(ready=True, fog_of_war=False, intel={}, buildings={}, building_intel={'us': {}, 'de': {}})
        s['battlefield']['map'] = [['field']*24 for _ in range(24)]
        roster = s['units']; s['units'] = []
        for i, (side, kind, pos) in enumerate(roles):
            u = copy.deepcopy(next((u for u in roster if u['side']==side and u['kind']==kind),
                                   next(u for u in roster if u['kind']==kind)))
            u.update(id=f'{side}-{i}', side=side, pos=pos, reserve=False)
            s['units'].append(u)
        return s

    def structure(self, s, pos, condition):
        s['battlefield']['map'][pos[1]][pos[0]] = 'building'
        s['buildings'][buildings.key(pos)] = condition
        for side in ('us', 'de'):
            s['building_intel'][side][buildings.key(pos)] = condition

    def test_randomized_once_shared_rules_and_preserved_roads(self):
        s = initial('stalingrad','dsl')
        values = Counter(s['buildings'].values()); count = sum(values.values())
        self.assertEqual(values['destroyed'],count//10)
        self.assertEqual(values['damaged'],3*count//10)
        self.assertEqual(s['battlefield'],SCENARIOS['stalingrad'])
        saved = json.loads(json.dumps(s))
        buildings.initialize(saved,random.Random(7))
        self.assertEqual(saved,s)
        self.assertTrue(all(buildings.condition(s,u['pos']) != 'destroyed' for u in s['units']))
        for name in SCENARIOS:
            value = initial(name,'dsl')
            self.assertTrue(buildings.enabled(value))
            if not value['battlefield'].get('building_conditions'):self.assertTrue(all(c=='intact' for c in value['buildings'].values()))
        self.assertNotIn('building_version',initial())

    def test_cover_entry_and_los_for_each_condition(self):
        s=self.field(('us','squad',[6,5]),('de','squad',[7,5]))
        for condition,cover in [('intact',1),('damaged',0),('destroyed',1)]:
            self.structure(s,[7,5],condition)
            self.assertEqual(fire_modifiers(s,*s['units'])['cover'],cover)
            self.assertFalse(line_clear([6,5],[8,5],state=s))
            empty=copy.deepcopy(s);empty['units'][1]['pos']=[15,5]
            moves=[m['pos'] for m in options(empty,empty['units'][0])['moves']]
            self.assertEqual([7,5] in moves,condition!='destroyed')
            if condition!='destroyed':
                move=next(m for m in options(empty,empty['units'][0])['moves'] if m['pos']==[7,5])
                self.assertEqual(move['cost'],2)
            else:
                with self.assertRaises(ValueError):apply(empty,'us',dict(kind='move',unit='us-0',pos=[7,5]))

    def test_direct_hits_damage_then_collapse_and_preview_is_clear(self):
        s=self.field(('us','tank',[5,5]),('de','squad',[7,5]),('de','squad',[8,5]))
        self.structure(s,[7,5],'intact');self.structure(s,[8,5],'damaged')
        order=dict(kind='fire',unit='us-0',target='de-1')
        missed=apply(s,'us',order,roll=lambda:1)
        self.assertEqual(missed['buildings'],s['buildings'])
        out=apply(s,'us',order,roll=lambda:6)
        self.assertEqual(out['buildings']['7,5'],'damaged')
        self.assertEqual(out['last_combat']['modifiers']['cover'],1)
        self.assertEqual(out['units'][1]['hp'],2)
        out['units'][0]['ap']=2
        shot=next(t for t in options(out,out['units'][0])['targets'] if t['id']=='de-1')
        self.assertIn('collapses',shot['effect_text']);self.assertEqual(shot['modifiers']['cover'],0)
        out=apply(out,'us',order,roll=lambda:6)
        self.assertEqual(out['buildings']['7,5'],'destroyed');self.assertEqual(out['units'][1]['hp'],0)
        self.assertEqual(out['last_combat']['terrain_changes'][0]['after'],'destroyed')
        self.assertEqual(out['buildings']['8,5'],'damaged')
        self.assertEqual(out['units'][2]['hp'],3)

    def test_small_arms_grenades_and_adjacent_fragments_do_not_break_structures(self):
        for kind,weapon in [('squad','small_arms'),('mg','machine_gun'),('squad','fragmentation'),('tank','he')]:
            s=self.field(('us',kind,[5,5]),('de','squad',[7,5]),('de','squad',[8,5]))
            self.structure(s,[7,5],'damaged');self.structure(s,[8,5],'damaged')
            weapons.resolve(s,*s['units'][:2],6,4,weapon)
            self.assertEqual(s['buildings']['7,5'],'destroyed' if weapon=='he' else 'damaged')
            self.assertEqual(s['buildings']['8,5'],'damaged')

    def test_collapse_kills_friendly_ground_units_and_passengers_but_not_aircraft(self):
        s=self.field(('us','tank',[5,5]),('de','squad',[7,5]),('us','halftrack',[7,5]),('us','squad',[7,5]))
        self.structure(s,[7,5],'damaged')
        s['units'][3]['carrier_id']='us-2'
        plane=dict(s['units'][1],id='plane',kind='bomber',protection='aircraft',hp=4)
        s['units'].append(plane)
        result,impacts=weapons.resolve(s,s['units'][0],s['units'][1],6,4)
        self.assertIn('collapse',result)
        self.assertEqual([u['hp'] for u in s['units'][1:]],[0,0,0,4])
        self.assertEqual({i['id'] for i in impacts},{'de-1','us-2','us-3'})

    def test_mortar_separate_structural_roll_and_automatic_infantry_damage(self):
        s=self.field(('us','squad',[5,5]),('de','squad',[6,5]),('de','tank',[6,6]))
        self.structure(s,[5,5],'damaged');self.structure(s,[6,5],'intact')
        s['barrages']=[dict(side='us',pos=[5,5],area=[[5,5],[6,5],[6,6]],ttl=1)]
        miss=copy.deepcopy(s);resolve_barrages(miss,{},lambda:4)
        self.assertEqual(miss['buildings'],s['buildings'])
        self.assertEqual([u['hp'] for u in miss['units']],[3,2,5])
        resolve_barrages(s,{},lambda:5)
        self.assertEqual([s['buildings']['5,5'],s['buildings']['6,5']],['destroyed','damaged'])
        self.assertEqual([u['hp'] for u in s['units']],[0,2,5])
        self.assertEqual(s['last_combat']['structure_roll'],5)
        self.assertEqual(len(s['last_combat']['terrain_changes']),2)

    def test_empty_building_artillery_and_bombardment_use_same_structure_rules(self):
        s=self.field(('us','commander',[2,5]),('de','squad',[20,5]))
        self.structure(s,[13,5],'damaged')
        strike=dict(side='us',attacker='us-0',pos=[13,5],weapon='artillery')
        weapons.resolve_artillery(s,strike,lambda:4)
        self.assertEqual(s['buildings']['13,5'],'destroyed')
        sea=initial('midway','dsl');sea.update(ready=True,fog_of_war=False)
        ship=next(u for u in sea['units'] if u['side']=='us' and u['kind']=='battleship')
        ship['pos']=[2,15];self.structure(sea,[13,15],'damaged')
        out=apply(sea,'us',dict(kind='bombard',unit=ship['id'],pos=[13,15]),roll=lambda:6)
        self.assertEqual(out['buildings']['13,15'],'destroyed')

    def test_blind_fire_does_not_reveal_condition_or_casualties(self):
        s=self.field(('us','commander',[2,5]),('de','squad',[13,5]),('de','squad',[22,20]))
        self.structure(s,[13,5],'intact');s['fog_of_war']=True;update_intel(s)
        alternative=copy.deepcopy(s);alternative['buildings']['13,5']='damaged'
        for value in (s,alternative):
            value['barrages']=[dict(side='us',attacker='us-0',pos=[13,5],area=[[13,5]],ttl=1,weapon='artillery')]
        a=apply(s,'us',dict(kind='end'),roll=lambda:6)
        b=apply(alternative,'us',dict(kind='end'),roll=lambda:6)
        self.assertEqual(a['buildings']['13,5'],'damaged');self.assertEqual(b['buildings']['13,5'],'destroyed')
        self.assertEqual(public_state(a,'us'),public_state(b,'us'))
        self.assertNotIn('building_intel',public_state(b,'us'))
        self.assertEqual(public_state(b,'de')['buildings']['13,5'],'destroyed')
        self.assertEqual(public_state(b,'de')['last_combat']['terrain_changes'][0]['after'],'destroyed')
        self.assertNotIn('observers',json.dumps(public_state(b,'de')['last_combat']))

    def test_scouting_structure_updates_memory_and_commits_undo(self):
        s=self.field(('us','scout',[4,5]),('de','squad',[22,20]))
        s['units'][0]['sight']=2
        self.structure(s,[7,5],'intact');s['buildings']['7,5']='destroyed'
        s['fog_of_war']=True;update_intel(s)
        self.assertEqual(public_state(s,'us')['buildings']['7,5'],'intact')
        out=perform(s,'us',dict(kind='move',unit='us-0',pos=[5,5]))
        self.assertEqual(public_state(out,'us')['buildings']['7,5'],'destroyed')
        self.assertFalse(status(out,'us')['can_undo'])

    def test_undo_redo_restores_terrain_units_and_same_die(self):
        s=self.field(('us','tank',[5,5]),('de','squad',[7,5]))
        self.structure(s,[7,5],'damaged')
        with patch('ww2_tactics.order_history.secrets.randbelow',return_value=5) as dice:
            out=perform(s,'us',dict(kind='fire',unit='us-0',target='de-1'))
            undo=perform(out,'us',dict(kind='undo'))
            self.assertEqual(undo['buildings'],s['buildings']);self.assertEqual(undo['units'],s['units'])
            with self.assertRaisesRegex(ValueError,'Redo resolved dice'):perform(undo,'us',dict(kind='end'))
            redo=perform(undo,'us',dict(kind='redo'))
            self.assertEqual(redo['buildings'],out['buildings']);self.assertEqual(redo['units'],out['units'])
            self.assertEqual(redo['last_combat'],out['last_combat']);self.assertEqual(dice.call_count,1)

    def test_transport_unload_and_bailout_exclude_ruins(self):
        s=self.field(('us','halftrack',[6,5]),('us','squad',[6,5]),('de','squad',[20,5]))
        carrier,troop=s['units'][:2];troop['carrier_id']=carrier['id']
        self.structure(s,[7,5],'destroyed')
        self.assertNotIn([7,5],[m['pos'] for m in transport.options(s,carrier)['unload']])
        # A boat with only ruined shore nearby cannot put survivors on that shore.
        carrier['kind']='landing_craft';s['battlefield']['map']=[['water']*24 for _ in range(24)]
        self.structure(s,[7,5],'destroyed');carrier['hp']=0
        transport.bail_out(s,carrier)
        self.assertEqual(troop['hp'],0)

    def test_ai_pathfinding_uses_known_ruins_not_hidden_changes(self):
        s=self.field(('us','squad',[5,5]),('de','squad',[20,5]))
        s['fog_of_war']=True;self.structure(s,[12,10],'intact');update_intel(s)
        alternate=copy.deepcopy(s);alternate['buildings']['12,10']='destroyed'
        a=objective_costs(s);b=objective_costs(alternate)
        self.assertEqual(a,b)
        self.assertEqual(choose_order(s,a,{}),choose_order(alternate,b,{}))
        alternate['building_intel']['us']['12,10']='destroyed'
        self.assertNotIn((12,10),objective_costs(alternate))

    def test_aircraft_can_fly_over_destroyed_ground_and_bombs_collapse_sites(self):
        s=initial('britain','dsl');s.update(ready=True,turn='de',fog_of_war=False)
        bomber=next(u for u in s['units'] if u['kind']=='bomber')
        target=next(u for u in s['units'] if u['kind']=='airfield')
        bomber['pos']=[target['pos'][0],target['pos'][1]+1]
        self.structure(s,target['pos'],'damaged')
        out=apply(s,'de',dict(kind='fire',unit=bomber['id'],target=target['id']),roll=lambda:6)
        self.assertEqual(next(u for u in out['units'] if u['id']==target['id'])['hp'],0)
        self.assertEqual(buildings.condition(out,target['pos']),'destroyed')
        bomber=next(u for u in out['units'] if u['id']==bomber['id']);bomber['ap']=2
        self.assertIn(target['pos'],[m['pos'] for m in options(out,bomber)['moves']])

    def test_legacy_matches_keep_existing_cover_and_no_structural_damage(self):
        s=self.field(('us','tank',[5,5]),('de','squad',[7,5]))
        self.structure(s,[7,5],'damaged');s.pop('building_version')
        self.assertEqual(fire_modifiers(s,*s['units'])['cover'],1)
        out=apply(s,'us',dict(kind='fire',unit='us-0',target='de-1'),roll=lambda:6)
        self.assertEqual(out['buildings'],s['buildings']);self.assertGreater(out['units'][1]['hp'],0)

    def test_api_save_restore_keeps_actual_condition_and_each_sides_memory(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=os.path.join(tmp,'games.sqlite');client=create_app(path).test_client()
            seat=client.post('/api/match',json=dict(opponent='computer',scenario='stalingrad',ruleset='dsl')).get_json()
            auth={'Authorization':'Bearer '+seat['token']};url='/api/match/'+seat['code']
            before=client.get(url,headers=auth).get_json()
            self.assertEqual(before['building_version'],1)
            saved=client.post(url+'/save',headers=auth,json={'revision':0}).get_json()
            seat2=client.post('/api/restore',json={'code':saved['save_code']}).get_json()
            after=client.get('/api/match/'+seat2['code'],headers={'Authorization':'Bearer '+seat2['token']}).get_json()
            self.assertEqual(after['buildings'],before['buildings'])
            with sqlite3.connect(path) as db:
                a=json.loads(db.execute('SELECT state FROM match WHERE code=?',(seat['code'],)).fetchone()[0])
                b=json.loads(db.execute('SELECT state FROM match WHERE code=?',(seat2['code'],)).fetchone()[0])
            self.assertEqual(a,b)
