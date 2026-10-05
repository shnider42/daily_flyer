"""Capacity, targeting, co-op authority and old-save boundaries for shared hexes."""
import copy
import json
import unittest
from unittest.mock import patch

from ww2_tactics import buildings, cooperative, domains, new_fronts, order_history, transport, weapons
from ww2_tactics.engine import initial, apply, options
from ww2_tactics.new_fronts import support
from ww2_tactics.scenarios import SCENARIOS
from ww2_tactics.support import resolve_barrages
from ww2_tactics.visibility import active, public_state, update_intel


class GroundStackTests(unittest.TestCase):
    def field(self, *roles):
        s=initial('belfry_valley','dsl')
        s.update(ready=True,fog_of_war=False,buildings={},building_intel={'us':{},'de':{}},
                 fieldworks={},units=[],reports={},intel={},platoon_intel={'us':{},'de':{}})
        s['battlefield']['map']=[['field']*18 for _ in range(22)]
        for i,(side,kind,pos) in enumerate(roles):
            s['units'].append(support(side,kind,list(pos),'A',i+1,side))
        if not any(u['side']=='de' for u in s['units']):
            s['units'].append(support('de','squad',[17,21],'B',1,'de'))
        weapons.initialize(s)
        return s

    def move(self,s,index,pos):
        return apply(s,'us',dict(kind='move',unit=s['units'][index]['id'],pos=pos),roll=lambda:1)

    def test_only_new_belfry_stacks_vire_has_two_complete_platoons(self):
        for name in SCENARIOS:
            self.assertEqual(domains.ground_stacking(initial(name,'dsl')),name=='belfry_valley')
        s=initial('vire_crossroads','dsl')
        for side in ('us','de'):
            own=[u for u in s['units'] if u['side']==side]
            self.assertEqual(len(own),17)
            self.assertEqual({u['platoon'] for u in own if u['kind']!='commander'},{'A','B'})
            self.assertEqual(sum(u['kind']=='scout' for u in own),2)
            for kind in ('mortar','sniper','supply','engineer','commander','tank'):
                self.assertTrue(any(u['kind']==kind for u in own),kind)
        self.assertEqual(len(initial('belfry_valley','dsl')['units']),44)

    def test_friendly_pair_pays_independent_terrain_cost_and_can_separate(self):
        s=self.field(('us','scout',[2,2]),('us','squad',[3,2]),('us','leader',[3,3]))
        s['battlefield']['map'][2][3]='woods';first,second,third=s['units'][:3]
        move=next(m for m in options(s,first)['moves'] if m['pos']==second['pos'])
        self.assertEqual(move['cost'],2)
        out=self.move(s,0,[3,2]);self.assertEqual(out['units'][0]['ap'],first['ap']-2)
        self.assertEqual(out['units'][1],second)
        self.assertNotIn([3,2],[m['pos'] for m in options(out,third)['moves']])
        with self.assertRaises(ValueError):self.move(out,2,[3,2])
        out=self.move(out,0,[2,2]);self.assertNotEqual(out['units'][0]['pos'],out['units'][1]['pos'])

    def test_vehicle_plus_infantry_but_not_two_large_units_or_enemy(self):
        for kind in ('tank','at_gun','halftrack'):
            s=self.field(('us','tank',[2,2]),('us',kind,[3,2]),('us','squad',[2,3]))
            self.assertTrue(domains.blocked(s,s['units'][0],[3,2]))
            self.assertFalse(domains.blocked(s,s['units'][2],[3,2]))
        s=self.field(('us','squad',[2,2]),('de','squad',[3,2]))
        self.assertTrue(domains.blocked(s,s['units'][0],[3,2]))
        with self.assertRaises(ValueError):self.move(s,0,[3,2])

    def test_dead_reserve_and_passenger_units_do_not_consume_slots(self):
        for changes in ({'hp':0},{'reserve':True},{'carrier_id':'transport'}):
            s=self.field(('us','scout',[2,2]),('us','squad',[3,2]),('us','squad',[3,2]))
            s['units'][2].update(changes)
            self.assertFalse(domains.blocked(s,s['units'][0],[3,2]),changes)

    def test_hidden_occupancy_does_not_change_preview_but_execution_checks_it(self):
        s=self.field(('us','scout',[2,2]),('us','squad',[3,2]),('de','squad',[3,2]))
        seen={u['id'] for u in s['units'] if u['side']=='us'}
        with patch('ww2_tactics.engine.unit_visible_ids',return_value=seen):
            before=options(s,s['units'][0])['moves']
            changed=copy.deepcopy(s);changed['units'][2]['pos']=[17,21]
            self.assertEqual(before,options(changed,changed['units'][0])['moves'])
            with self.assertRaisesRegex(ValueError,'contact'):self.move(s,0,[3,2])
        self.assertEqual(s['units'][0]['pos'],[2,2])

    def test_direct_fire_and_snipe_choose_one_enemy_in_the_stack(self):
        for kind in ('fire','snipe'):
            s=self.field(('us','sniper',[2,2]),('de','squad',[4,2]),('de','scout',[4,2]))
            unit,other,target=s['units'];unit['ap']=3
            legal=options(s,unit);self.assertEqual({t['id'] for t in legal['targets' if kind=='fire' else 'snipe']},{other['id'],target['id']})
            out=apply(s,'us',dict(kind=kind,unit=unit['id'],target=target['id']),roll=lambda:6)
            self.assertEqual(out['units'][1]['hp'],other['hp'])
            self.assertLess(out['units'][2]['hp'],target['hp'])

    def test_hex_fire_checks_both_occupants_independent_of_list_order(self):
        s=self.field(('us','tank',[2,2]),('de','tank',[4,2]),('de','squad',[4,2]))
        s['units'][0]['ammo']='he';enemy=s['units'][2];s['units'][1]['hp']=6
        out=apply(s,'us',dict(kind='area_fire',unit=s['units'][0]['id'],pos=[4,2]),roll=lambda:6)
        self.assertEqual(out['units'][1]['hp'],6)
        self.assertEqual(out['units'][2]['hp'],enemy['hp']-2)
        reversed_state=copy.deepcopy(s);reversed_state['units'][1:]=reversed(reversed_state['units'][1:])
        other=apply(reversed_state,'us',dict(kind='area_fire',unit=s['units'][0]['id'],pos=[4,2]),roll=lambda:6)
        self.assertEqual({u['id']:u['hp'] for u in out['units']},{u['id']:u['hp'] for u in other['units']})

    def test_hex_fire_retains_each_units_cover_and_dig_in_threshold(self):
        s=self.field(('us','tank',[2,2]),('de','squad',[4,2]),('de','squad',[4,2]))
        s['units'][0]['ammo']='he';s['units'][2]['entrenched']=True
        s['battlefield']['map'][2][4]='woods'
        out=apply(s,'us',dict(kind='area_fire',unit=s['units'][0]['id'],pos=[4,2]),roll=lambda:5)
        self.assertLess(out['units'][1]['hp'],s['units'][1]['hp'])
        self.assertEqual(out['units'][2]['hp'],s['units'][2]['hp'])

    def test_structure_is_hit_once_then_collapse_kills_both(self):
        s=self.field(('us','tank',[2,2]),('de','squad',[4,2]),('de','scout',[4,2]))
        s['battlefield']['map'][2][4]='church';s['buildings']['4,2']='intact'
        out=apply(s,'us',dict(kind='area_fire',unit=s['units'][0]['id'],pos=[4,2]),roll=lambda:6)
        self.assertEqual(out['buildings']['4,2'],'damaged')
        self.assertTrue(all(u['hp']>0 for u in out['units'][1:]))
        buildings.hit(out,[4,2]);self.assertTrue(all(u['hp']==0 for u in out['units'][1:]))

    def test_mortar_hits_both_and_artillery_applies_primary_damage_to_both(self):
        s=self.field(('us','commander',[2,2]),('de','squad',[4,2]),('us','squad',[4,3]),('us','scout',[4,3]))
        s['barrages']=[dict(side='us',pos=[4,2],area=[[4,2],[4,3]],ttl=1,attacker=s['units'][0]['id'],weapon='observed_mortar',threshold=4)]
        before=[u['hp'] for u in s['units']];resolve_barrages(s,s['factions'],lambda:4)
        self.assertEqual([u['hp'] for u in s['units'][1:]],[hp-1 for hp in before[1:]])
        s=self.field(('us','commander',[2,2]),('de','tank',[4,2]),('de','squad',[4,2]))
        before=[u['hp'] for u in s['units']]
        weapons.resolve_artillery(s,dict(attacker=s['units'][0]['id'],pos=[4,2]),lambda:4)
        self.assertEqual([u['hp'] for u in s['units'][1:]],[hp-2 for hp in before[1:]])

    def test_assault_cannot_advance_until_last_defender_is_cleared(self):
        s=self.field(('us','squad',[2,2]),('de','squad',[3,2]),('de','scout',[3,2]))
        for u in s['units'][1:]:u['hp']=2
        out=apply(s,'us',dict(kind='assault',unit=s['units'][0]['id'],target=s['units'][1]['id']),roll=lambda:6)
        self.assertEqual(out['units'][0]['pos'],[2,2]);self.assertIn('prevents advance',out['last_combat']['result'])
        out['units'][0]['ap']=2
        out=apply(out,'us',dict(kind='assault',unit=s['units'][0]['id'],target=s['units'][2]['id']),roll=lambda:6)
        self.assertEqual(out['units'][0]['pos'],[3,2])

    def test_shared_support_transport_and_bailout_keep_capacity(self):
        s=self.field(('us','supply',[2,2]),('us','mortar',[2,2]),('us','engineer',[4,2]),('us','tank',[4,2]))
        s['units'][1]['shells']=0;s['units'][3]['hp']-=1
        self.assertTrue(options(s,s['units'][0])['resupply']);self.assertTrue(options(s,s['units'][2])['repair_tank'])
        s=self.field(('us','halftrack',[2,2]),('us','squad',[2,2]),('us','scout',[3,2]),('us','squad',[3,2]))
        carrier,troop=s['units'][:2]
        out=apply(s,'us',dict(kind='load',unit=carrier['id'],target=troop['id']))
        self.assertNotIn([3,2],[m['pos'] for m in options(out,out['units'][0])['unload']])
        out['units'][3]['pos']=[5,5]
        out=apply(out,'us',dict(kind='unload',unit=carrier['id'],pos=[3,2]))
        self.assertEqual(sum(active(u) and u['pos']==[3,2] for u in out['units']),2)
        s['units'][1]['carrier_id']=carrier['id'];s['units'][2]['pos']=[2,2];carrier['hp']=0
        transport.bail_out(s,carrier)
        self.assertEqual(sum(active(u) and u['pos']==[2,2] for u in s['units']),2)

    def test_coop_owner_is_unchanged_after_joining_teammates_hex(self):
        s=self.field(('us','scout',[2,2]),('us','squad',[3,2]))
        cooperative.initialize(s,dict(control_size='units'),'host','Host')
        s['coop']['players']['friend']=dict(id='friend',name='Friend',side='us',group=None)
        cooperative.claim(s,'friend','us',cooperative.group_for(s,s['units'][1]['id'])['id'])
        s=cooperative.setup_action(s,'host',dict(operation='start'))
        out=cooperative.order(s,'host',dict(kind='move',unit=s['units'][0]['id'],pos=[3,2]))
        self.assertEqual(out['coop'],s['coop'])
        with self.assertRaises(ValueError):cooperative.order(out,'host',dict(kind='move',unit=s['units'][1]['id'],pos=[4,2]))
        out=cooperative.order(out,'friend',dict(kind='move',unit=s['units'][1]['id'],pos=[4,2]))
        self.assertEqual(out['units'][0]['pos'],[3,2])

    def test_objective_scores_once_and_solo_undo_restores_both_units(self):
        s=self.field(('us','scout',[2,2]),('us','squad',[3,2]))
        s['fog_of_war']=True
        update_intel(s)
        out=order_history.perform(s,'us',dict(kind='move',unit=s['units'][0]['id'],pos=[3,2]))
        out=json.loads(json.dumps(out))
        undo=order_history.perform(out,'us',dict(kind='undo'))
        self.assertEqual(undo['units'],s['units'])
        redo=order_history.perform(undo,'us',dict(kind='redo'))
        self.assertEqual(redo['units'],out['units'])
        pos=redo['battlefield']['control_points'][1]['pos']
        for u in redo['units'][:2]:u['pos']=list(pos)
        ended=apply(redo,'us',dict(kind='end'),roll=lambda:1)
        self.assertEqual(ended['front_score']['us'],2)

    def test_old_belfry_save_stays_single_occupancy(self):
        s=self.field(('us','scout',[2,2]),('us','squad',[3,2]))
        s.pop('ground_stack_version');s['battlefield'].pop('ground_stacking')
        saved=json.loads(json.dumps(s));self.assertNotIn([3,2],[m['pos'] for m in options(saved,saved['units'][0])['moves']])
        out=self.move(saved,0,[1,2]);self.assertNotIn('ground_stack_version',out)
        self.assertEqual(saved,s)


if __name__=='__main__':unittest.main()
