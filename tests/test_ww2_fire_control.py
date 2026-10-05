"""Live observation, indirect fire, private orders and saved-rule boundaries."""
import copy
import json
import unittest

from ww2_tactics import buildings, cooperative, fire_control, operations, signals, weapons
from ww2_tactics.engine import initial, apply, options, fire_threshold, distance, line_clear
from ww2_tactics.new_fronts import support
from ww2_tactics.observed_fronts import IDS
from ww2_tactics.scenarios import SCENARIOS
from ww2_tactics.visibility import public_state, update_intel, unit_sees_hex
from ww2_tactics.computer import play_turn
from ww2_tactics.support import resolve_barrages


class FireDirectionTests(unittest.TestCase):
    def field(self):
        s = initial('belfry_valley', 'dsl')
        s.update(ready=True, fog_of_war=False, buildings={}, building_intel={'us':{},'de':{}})
        s['battlefield']['map'] = [['field']*18 for _ in range(22)]
        s['units'] = [support(side,kind,pos,group,n,side) for side,kind,pos,group,n in [
            ('us','scout',[4,5],'A',1), ('us','tank',[2,5],'A',2),
            ('us','mortar',[2,7],'A',3), ('us','leader',[2,6],'A',4),
            ('us','tank',[2,4],'B',1), ('de','tank',[8,5],'A',1),
            ('de','squad',[8,7],'A',2)]]
        s['units'][1]['range'] = 6
        weapons.initialize(s)
        return s

    def aimed(self, state=None, pos=None):
        s = state or self.field()
        s = apply(s, 'us', dict(kind='observe', unit='us-A-1'))
        return apply(s, 'us', dict(kind='spot_fire', unit='us-A-1', pos=pos or [8,5]))

    def test_only_new_maps_enable_rules_and_have_valid_three_platoons(self):
        for name in SCENARIOS:
            s = initial(name, 'dsl')
            self.assertEqual(fire_control.enabled(s), name in IDS)
        for name, size, count in [('vire_crossroads',(16,17),50),('belfry_valley',(18,22),44)]:
            s = initial(name, 'dsl'); b=s['battlefield']
            self.assertEqual((b['width'],b['height']),size)
            self.assertEqual(len(s['units']),count)
            self.assertEqual(len({tuple(u['pos']) for u in s['units']}),count)
            for side in ('us','de'):
                self.assertEqual({u['platoon'] for u in s['units'] if u['side']==side and u['kind']!='commander'}, {'A','B','C'})
                self.assertTrue(any(u['kind']=='sniper' and u['side']==side for u in s['units']))
            self.assertTrue(all(0<=u['pos'][0]<b['width'] and 0<=u['pos'][1]<b['height'] for u in s['units']))
            cooperative.initialize(s,dict(control_size='platoons'), 'host','Host')
            self.assertEqual(sum(not g['command'] for g in s['coop']['groups'].values()),6)
            self.assertTrue(any(u['kind']=='commander' and u['id'] in cooperative.controlled(s,'host') for u in s['units']))

    def test_observe_alone_does_not_change_odds_and_mark_costs_one_more_ap(self):
        s=self.field();tank=s['units'][1];target=s['units'][5]
        self.assertEqual(fire_threshold(s,tank,target),5)
        self.assertFalse(options(s,s['units'][0])['spot_fire'])
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='spot_fire',unit='us-A-1',pos=[8,5]))
        s=apply(s,'us',dict(kind='observe',unit='us-A-1'))
        self.assertEqual(fire_threshold(s,s['units'][1],s['units'][5]),5)
        s=apply(s,'us',dict(kind='spot_fire',unit='us-A-1',pos=[8,5]))
        self.assertEqual(s['units'][0]['ap'],1)
        self.assertFalse(options(s,s['units'][0])['spot_fire'])
        self.assertEqual(fire_threshold(s,s['units'][1],s['units'][5]),4)
        shot=next(t for t in options(s,s['units'][1])['targets'] if t['id']=='de-A-1')
        self.assertEqual(shot['modifiers']['recon_support'],-1)
        out=apply(s,'us',dict(kind='fire',unit='us-A-2',target='de-A-1'),roll=lambda:4)
        self.assertEqual(out['units'][5]['hp'],s['units'][5]['hp']-2)

    def test_support_is_same_platoon_one_hex_and_never_stacks(self):
        s=self.aimed();tank=s['units'][1];enemy=s['units'][5]
        self.assertEqual(fire_control.modifiers(s,s['units'][4],enemy['pos']),{})
        second=copy.deepcopy(s['units'][0]);second['id']='us-A-9';second['pos']=[4,6];s['units'].append(second)
        self.assertEqual(fire_control.modifiers(s,tank,enemy['pos'])['recon_support'],-1)
        enemy['pos']=[9,5];s['units'][0]['fire_mark']['pos']=[9,5]
        shot=next(t for t in options(s,tank)['targets'] if t['id']==enemy['id'])
        self.assertEqual(shot['threshold'],5)
        self.assertEqual(shot['modifiers']['extended_range'],1)
        enemy['pos']=[10,5];s['units'][0]['fire_mark']['pos']=[10,5]
        self.assertNotIn(enemy['id'],[t['id'] for t in options(s,tank)['targets']])
        s['units'][0]['fire_mark']['pos']=[8,5]
        self.assertIsNone(fire_control.spotter(s,tank,enemy['pos']))

    def test_pin_loss_transport_movement_smoke_and_turn_end_remove_live_support(self):
        for change in ({'pinned':True},{'hp':0},{'carrier_id':'boat'},{'reserve':True},{'observing':False}):
            s=self.aimed();s['units'][0].update(change)
            self.assertIsNone(fire_control.spotter(s,s['units'][1],[8,5]),change)
        s=self.aimed();s['smoke']=[dict(pos=[4,5],ttl=2)]
        self.assertIsNone(fire_control.spotter(s,s['units'][1],[8,5]))
        self.assertFalse(next(u for u in public_state(s,'us')['units'] if u['id']=='us-A-1')['fire_mark']['active'])
        s=self.aimed();move=options(s,s['units'][0])['moves'][0]['pos']
        s=apply(s,'us',dict(kind='move',unit='us-A-1',pos=move))
        self.assertNotIn('fire_mark',s['units'][0])
        s=apply(self.aimed(),'us',dict(kind='end'))
        self.assertFalse(any(u.get('fire_mark') for u in s['units']))

    def test_tank_still_needs_clear_line_and_penetrating_ammunition(self):
        s=self.aimed();s['battlefield']['map'][5][3]='building'
        self.assertIsNotNone(fire_control.spotter(s,s['units'][1],[8,5]))
        self.assertNotIn('de-A-1',[t['id'] for t in options(s,s['units'][1])['targets']])
        s=self.aimed();s['units'][1]['ammo']='he'
        self.assertEqual(fire_threshold(s,s['units'][1],s['units'][5]),7)
        self.assertNotIn('de-A-1',[t['id'] for t in options(s,s['units'][1])['targets']])

    def test_mortar_aim_is_indirect_finite_delayed_and_uses_same_order_budget(self):
        s=self.field();s['battlefield']['map'][7][3]='building'
        self.assertFalse(line_clear([2,7],[8,7],[],s))
        s=self.aimed(s,[8,7]);legal=options(s,s['units'][2])
        shot=next(t for t in legal['area_fire_details'] if t['pos']==[8,7])
        self.assertTrue(shot['indirect']);self.assertEqual(shot['threshold'],4)
        out=apply(s,'us',dict(kind='area_fire',unit='us-A-3',pos=[8,7]))
        self.assertEqual(out['units'][2]['shells'],2);self.assertEqual(out['units'][2]['ap'],0)
        self.assertEqual(out['barrages'][0]['threshold'],4)
        self.assertEqual(out['units'][6]['hp'],3)
        out['units'][2]['ap']=5
        self.assertFalse(options(out,out['units'][2])['area_fire'])
        self.assertFalse(options(out,out['units'][2])['mortar_fire'])
        with self.assertRaises(ValueError):apply(out,'us',dict(kind='mortar_fire',unit='us-A-3',pos=[8,7]))
        out=apply(out,'us',dict(kind='end'),roll=lambda:4)
        self.assertEqual(out['units'][6]['hp'],3)
        out=apply(out,'de',dict(kind='end'),roll=lambda:4)
        self.assertEqual(out['units'][6]['hp'],2)
        self.assertTrue(out['units'][6]['pinned'])

    def test_mortar_miss_and_friendly_fire_and_armor_immunity(self):
        s=self.field();s['units'][5]['pos']=[9,7];s['units'][3]['pos']=[8,8]
        out=apply(s,'us',dict(kind='area_fire',unit='us-A-3',pos=[8,7]))
        self.assertEqual(out['barrages'][0]['threshold'],5)
        out['barrages'][0]['ttl']=1
        miss=copy.deepcopy(out);resolve_barrages(miss,{},roll=lambda:4)
        self.assertEqual([u['hp'] for u in miss['units']],[u['hp'] for u in s['units']])
        hit=copy.deepcopy(out);resolve_barrages(hit,{},roll=lambda:5)
        self.assertEqual(hit['units'][6]['hp'],2)
        self.assertEqual(hit['units'][3]['hp'],1)
        self.assertEqual(hit['units'][5]['hp'],s['units'][5]['hp'])
        self.assertEqual(miss['units'][2]['shells'],2)

    def test_private_mark_and_legal_hexes_do_not_disclose_hidden_targets(self):
        s=self.aimed();s['fog_of_war']=True;update_intel(s)
        view=public_state(s,'de')
        for u in view['units']:
            if u['side']=='us':self.assertNotIn('fire_mark',u);self.assertNotIn('spot_round',u)
        base=self.field();base['fog_of_war']=True
        base=apply(base,'us',dict(kind='observe',unit='us-A-1'))
        other=copy.deepcopy(base);other['units'][6]['pos']=[17,21]
        self.assertEqual(options(base,base['units'][0])['spot_fire'],options(other,other['units'][0])['spot_fire'])

    def test_church_matches_tower_sight_movement_cover_and_collapse(self):
        from ww2_tactics.fieldworks import movement
        from ww2_tactics.campaigns import unit
        s=self.field();scout=s['units'][0];pos=scout['pos'];s['battlefield']['map'][pos[1]][pos[0]]='church'
        s['buildings'][buildings.key(pos)]='intact'
        self.assertEqual(operations.sight_range(s,scout),12)
        self.assertEqual(buildings.cover(s,pos),1)
        self.assertEqual(movement(scout,'church'),(True,2))
        self.assertFalse(movement(s['units'][1],'church')[0])
        sniper=unit('us','sniper',pos,'A',9)
        self.assertEqual(operations.snipe_range(s,sniper),8)
        s['battlefield']['map'][5][6]='woods'
        self.assertTrue(unit_sees_hex(s,scout,[10,5]))
        s['battlefield']['map'][5][7]='building'
        self.assertFalse(unit_sees_hex(s,scout,[10,5]))
        buildings.hit(s,pos);self.assertEqual(buildings.cover(s,pos),0)
        buildings.hit(s,pos);self.assertEqual(scout['hp'],0)

    def test_coop_shared_fire_support_keeps_individual_ownership_and_readiness(self):
        s=self.field();cooperative.initialize(s,dict(control_size='units'),'host','Host')
        c=s['coop'];c['players']['friend']=dict(id='friend',name='Friend',side='us',group=None)
        group=cooperative.group_for(s,'us-A-2')['id'];cooperative.claim(s,'friend','us',group)
        s=cooperative.setup_action(s,'host',dict(operation='start'))
        s=cooperative.order(s,'host',dict(kind='observe',unit='us-A-1'))
        s=cooperative.order(s,'host',dict(kind='spot_fire',unit='us-A-1',pos=[8,5]))
        s=cooperative.order(s,'host',dict(kind='end'))
        self.assertEqual(s['turn'],'us');self.assertIn('host',s['coop']['done'])
        self.assertEqual(fire_threshold(s,s['units'][1],s['units'][5]),4)
        with self.assertRaises(ValueError):cooperative.order(s,'host',dict(kind='fire',unit='us-A-2',target='de-A-1'))
        with self.assertRaises(ValueError):cooperative.order(s,'friend',dict(kind='spot_fire',unit='us-A-1',pos=[8,7]))

    def test_old_saved_battle_is_never_upgraded_by_an_order(self):
        s=initial('kharkov','dsl');s['ready']=True
        saved=json.loads(json.dumps(s));scout=next(u for u in saved['units'] if u['side']=='us' and u['kind']=='scout')
        out=apply(saved,'us',dict(kind='observe',unit=scout['id']))
        self.assertNotIn('fire_control_version',out)
        self.assertNotIn('spot_fire',options(out,next(u for u in out['units'] if u['id']==scout['id'])))
        mortar=next(u for u in out['units'] if u['side']=='us' and u['kind']=='mortar')
        self.assertFalse(options(out,mortar)['area_fire'])
        self.assertEqual(saved,s)

    def test_computer_uses_observe_then_spot_without_human_orders_or_private_replay(self):
        s=self.field();s['fog_of_war']=True;s['ai_side']='us';update_intel(s)
        out=play_turn(s,roll=lambda:4,observers=('us','de'))
        self.assertTrue(any(f['action']['kind']=='spot_fire' for f in out['_coop_replays']['us']['frames']))
        for f in out['_coop_replays']['de']['frames']:
            if f['action']['kind']=='spot_fire':self.assertNotIn('pos',f['action'])
            for snapshot in (f['before'],f['after']):
                self.assertTrue(all('fire_mark' not in u for u in snapshot['units'] if u['side']=='us'))
