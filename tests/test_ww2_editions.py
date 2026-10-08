"""Current backports, mission/force preservation, and the frozen Legacy boundary."""
import copy
import hashlib
import json
import random
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import airborne, computer, cooperative, deployment, domains, editions, fire_control, linked_front
from ww2_tactics.engine import initial, apply, options, fire_threshold
from ww2_tactics.scenarios import SCENARIOS, catalog, get_scenario
from ww2_tactics.visibility import active, update_intel
from ww2_tactics.computer import play_turn


def legacy_fingerprints():
    """Stable rule states, including shared command, without production saves."""
    results = {}
    for key, board in SCENARIOS.items():
        for rules in (['classic', 'dsl'] if not board.get('dsl_only') else ['dsl']):
            with patch('ww2_tactics.buildings.secrets.SystemRandom', return_value=random.Random(413)):
                state = initial(key, rules)
            phases = {'new': copy.deepcopy(state)}
            state['ready'] = True
            if deployment.active(state):
                for side in ('us','de'):
                    state = apply(state,side,dict(kind='deploy_lock'),roll=lambda:4)
            for side in ('us','de'):
                if not state['winner']:
                    state = apply(state,side,dict(kind='end'),roll=lambda:4)
            phases['round'] = state
            if rules == 'dsl':
                shared = copy.deepcopy(phases['new'])
                cooperative.initialize(shared,dict(control_size='platoons'),'host','Host')
                shared = cooperative.setup_action(shared,'host',dict(operation='start'))
                phases['coop'] = shared
            results[key+':'+rules] = {phase:hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                                      for phase,value in phases.items()}
    return results


class EditionRulesTests(unittest.TestCase):
    def test_legacy_rule_fingerprints_are_unchanged(self):
        fixture = Path(__file__).parent/'fixtures'/'ww2-legacy-v1.json'
        self.assertEqual(legacy_fingerprints(),json.loads(fixture.read_text()))

    def test_catalogs_are_separate_and_source_maps_remain_unchanged(self):
        original = copy.deepcopy(SCENARIOS)
        legacy, current = catalog(), catalog('current')
        self.assertEqual(len(legacy),24);self.assertEqual(len(current),25)
        self.assertEqual([b['source_id'] for b in current[:24]],list(SCENARIOS))
        for old,new in zip(legacy,current):
            self.assertEqual(new['id'],'current:'+old['id'])
            for key in ('map','width','height','rounds','objective','control_points','linked_objectives','joint_objectives','doctrine','factions','deployment_rules'):
                self.assertEqual(old.get(key),new.get(key),(old['id'],key))
            new['map'][0][0]='water'
        self.assertEqual(original,SCENARIOS)
        for key in ('current:no-such-map','current:current:village',[],None):
            with self.assertRaises(ValueError):get_scenario(key)
        with self.assertRaises(ValueError):initial('current:village','classic')

    def test_current_roles_share_systems_and_keep_all_authored_stats(self):
        ignored = {'demolition_charges','max_shells','max_repair_kits'}
        for key in SCENARIOS:
            old,new=initial(key,'dsl'),initial('current:'+key,'dsl')
            self.assertTrue(editions.current(new));self.assertTrue(domains.ground_stacking(new))
            self.assertEqual(new['rule_manifest'],new['battlefield']['current_rules'])
            self.assertEqual(len(old['units']),len(new['units']),key)
            for before,after in zip(old['units'],new['units']):
                for attr,value in before.items():self.assertEqual(after[attr],value,(key,before['id'],attr))
                self.assertLessEqual(set(after)-set(before),ignored|({'platoon','number'} if key in {'village','orchard','stonebridge'} else set()))
            ground = key not in {'midway','britain'}
            for flag in ('signals_version','fire_control_version','logistics_version'):
                self.assertEqual(bool(new.get(flag)),ground,(key,flag))
            self.assertTrue(new['fog_of_war'])

    def test_small_maps_remain_small_infantry_operations(self):
        for key in ('village','orchard','stonebridge'):
            s=initial('current:'+key,'dsl')
            self.assertEqual({u['kind'] for u in s['units']},{'squad','mg','leader'})
            self.assertEqual({u['platoon'] for u in s['units']},{'A'})
            cooperative.initialize(s,dict(control_size='platoons'),'host','Host')
            self.assertEqual(len(s['coop']['groups']),2)

    def test_kharkov_recon_improves_same_platoon_gun_without_altering_legacy(self):
        s=initial('current:kharkov','dsl');s.update(ready=True,fog_of_war=False)
        s['battlefield']['map']=[['field']*24 for _ in range(20)]
        scout=next(u for u in s['units'] if u['side']=='us' and u['kind']=='scout' and u['platoon']=='A')
        tank=next(u for u in s['units'] if u['side']=='us' and u['kind']=='tank' and u['platoon']=='A')
        enemy=next(u for u in s['units'] if u['side']=='de' and u['kind']=='tank' and not u.get('reserve'))
        scout['pos']=[3,4];tank['pos']=[3,5];enemy['pos']=[9,5]
        for u in s['units']:
            if u['kind'] in {'commander','leader'}:u['pos']=[23,19]
        before=fire_threshold(s,tank,enemy)
        s=apply(s,'us',dict(kind='observe',unit=scout['id']))
        self.assertEqual(fire_threshold(s,next(u for u in s['units'] if u['id']==tank['id']),enemy),before)
        s=apply(s,'us',dict(kind='spot_fire',unit=scout['id'],pos=enemy['pos']))
        gun=next(u for u in s['units'] if u['id']==tank['id'])
        self.assertEqual(fire_threshold(s,gun,enemy),before-1)
        gun['platoon']='B';self.assertEqual(fire_threshold(s,gun,enemy),before)
        self.assertFalse(fire_control.enabled(initial('kharkov','dsl')))

    def test_mortar_on_an_older_theater_uses_finite_indirect_aim(self):
        s=initial('current:apennine','dsl');s.update(ready=True,fog_of_war=False)
        mortar=next(u for u in s['units'] if u['side']=='us' and u['kind']=='mortar')
        mortar['pos']=[5,5];s['battlefield']['map'][5][6]='woods'
        shot=next(c for c in options(s,mortar)['area_fire_details'] if c['pos']==[7,5])
        self.assertTrue(shot['indirect']);self.assertEqual(shot['threshold'],5)
        shells=mortar['shells']
        out=apply(s,'us',dict(kind='area_fire',unit=mortar['id'],pos=[7,5]))
        used=next(u for u in out['units'] if u['id']==mortar['id'])
        self.assertEqual(used['shells'],shells-1);self.assertEqual(used['ap'],mortar['ap']-2)
        self.assertFalse(options(out,used)['area_fire'])
        self.assertEqual(out['barrages'][-1]['weapon'],'observed_mortar')

    def test_two_ground_and_one_air_have_independent_capacity(self):
        s=initial('current:fubar','dsl')
        infantry=[u for u in s['units'] if u['side']=='us' and u['kind']=='squad'][0]
        scout=next(u for u in s['units'] if u['side']=='us' and u['kind']=='scout')
        plane=next(u for u in s['units'] if u['side']=='us' and u['kind']=='fighter')
        for u in (scout,plane):u['pos']=[10,10]
        self.assertFalse(domains.blocked(s,infantry,[10,10]))
        infantry['pos']=[10,10]
        third=next(u for u in s['units'] if u['side']=='us' and u['kind']=='leader')
        self.assertTrue(domains.blocked(s,third,[10,10]))
        self.assertFalse(domains.blocked(s,plane,[10,10]))
        second_plane=next(u for u in s['units'] if u['side']=='us' and u['kind']=='bomber')
        self.assertTrue(domains.blocked(s,second_plane,[10,10]))
        tank=next(u for u in s['units'] if u['side']=='us' and u['kind']=='tank')
        scout['pos']=[11,11];infantry['pos']=[11,11]
        self.assertTrue(domains.blocked(s,tank,[11,11]))
        scout['pos']=[12,12];self.assertFalse(domains.blocked(s,tank,[11,11]))

    def test_britain_can_finish_above_ground_but_legacy_cannot(self):
        for edition,allowed in (('',False),('current:',True)):
            s=initial(edition+'britain','dsl');s['ready']=True
            plane=next(u for u in s['units'] if u['side']=='us' and u['kind']=='fighter')
            plane['pos']=[5,5]
            destination=[6,5]
            self.assertEqual(destination in [m['pos'] for m in options(s,plane)['moves']],allowed)
            if allowed:
                out=apply(s,'us',dict(kind='move',unit=plane['id'],pos=destination),roll=lambda:1)
                self.assertEqual(sum(active(u) and u['pos']==destination for u in out['units']),2)

    def test_midway_infantry_share_ashore_but_vessels_stay_separate(self):
        s=initial('current:midway','dsl');s['ready']=True
        troops=[u for u in s['units'] if u['side']=='us' and u['kind']=='amphibious']
        troops[0]['pos']=[5,14];troops[1]['pos']=[6,14]
        s['battlefield']['map'][14][5]=s['battlefield']['map'][14][6]='field'
        self.assertIn([6,14],[m['pos'] for m in options(s,troops[0])['moves']])
        out=apply(s,'us',dict(kind='move',unit=troops[0]['id'],pos=[6,14]))
        self.assertEqual(sum(active(u) and u['pos']==[6,14] for u in out['units']),2)
        troops[1]['pos']=[8,8];s['battlefield']['map'][8][8]='water'
        self.assertTrue(domains.blocked(s,troops[0],[8,8]))
        ships=[u for u in s['units'] if u['side']=='us' and u['kind']=='destroyer']
        self.assertTrue(domains.blocked(s,ships[0],ships[1]['pos']))

    def test_prebattle_capacity_is_shared_and_reset_uses_original_roster(self):
        s=initial('current:breakwater','dsl');s['ready']=True
        troops=[u for u in s['units'] if u['side']=='de' and u['kind'] in {'squad','leader','mg'}]
        pos=troops[1]['pos']
        self.assertIn(pos,deployment.fields(s,'de')['placements'][troops[0]['id']])
        s=apply(s,'de',dict(kind='deploy_unit',unit=troops[0]['id'],pos=pos))
        with self.assertRaises(ValueError):apply(s,'de',dict(kind='deploy_unit',unit=troops[2]['id'],pos=pos))
        s=apply(s,'de',dict(kind='deploy_reset'))
        original=initial('breakwater','dsl')
        self.assertEqual({u['id']:u['pos'] for u in s['units']},{u['id']:u['pos'] for u in original['units']})

    def test_reserves_wait_only_when_their_ground_capacity_is_full(self):
        s=initial('current:kharkov','dsl');s.update(round=4,turn='us')
        reserve=next(u for u in s['units'] if u['side']=='us' and u.get('arrival_round'))
        troops=[u for u in s['units'] if u['side']=='us' and u['kind']=='squad']
        for u in troops:u['pos']=reserve['pos'].copy()
        linked_front.arrive(s,lambda *_:[],lambda:1);self.assertTrue(reserve['reserve'])
        troops[1]['pos']=[23,19]
        linked_front.arrive(s,lambda *_:[],lambda:1);self.assertFalse(reserve['reserve'])
        self.assertEqual(sum(active(u) and u['pos']==reserve['pos'] for u in s['units']),2)

    def test_airlift_can_use_second_friendly_ground_slot(self):
        s=initial('current:iron_lantern','dsl');s['ready']=True
        troop=next(u for u in s['units'] if u['side']=='us' and u.get('airlift_reserve'))
        friend=next(u for u in s['units'] if u['side']=='us' and u['kind']=='squad' and active(u))
        friend['pos']=[7,7];s['battlefield']['map'][7][7]='field'
        self.assertTrue(airborne.landing_space(s,[7,7],troop))
        commander=next(u for u in s['units'] if u['side']=='us' and u['kind']=='commander')
        out=apply(s,'us',dict(kind='airborne_drop',unit=commander['id'],pos=[7,7]),roll=lambda:6)
        arrived=next(u for u in out['units'] if u['id']==troop['id'])
        self.assertEqual(arrived['pos'],[7,7]);self.assertFalse(arrived['reserve'])
        extra=next(u for u in out['units'] if u['side']=='us' and u.get('airlift_reserve'))
        self.assertFalse(airborne.landing_space(out,[7,7],extra))

    def test_every_current_map_supports_both_coop_command_sizes(self):
        for key in SCENARIOS:
            for size in ('units','platoons'):
                s=initial('current:'+key,'dsl');before=copy.deepcopy(s['units'])
                cooperative.initialize(s,dict(control_size=size,side='us'),'host','Host')
                assigned=[uid for g in s['coop']['groups'].values() for uid in g['units']]
                self.assertEqual(sorted(assigned),sorted(u['id'] for u in before),key)
                self.assertEqual(s['units'],before)
                for u in before:
                    if u['side']=='us' and u['kind']=='commander':self.assertIn(u['id'],cooperative.controlled(s,'host'))

    def test_current_halftrack_unloads_into_its_own_free_ground_slot(self):
        s=initial('current:desert_signal','dsl');s['ready']=True
        carrier=next(u for u in s['units'] if u['side']=='us' and u['kind']=='halftrack')
        troop=next(u for u in s['units'] if u['side']=='us' and u['kind']=='squad')
        carrier['pos']=[8,8];troop['pos']=[8,8];troop['carrier_id']=carrier['id']
        s['battlefield']['map'][8][8]='field'
        self.assertIn([8,8],[m['pos'] for m in options(s,carrier)['unload']])
        out=apply(s,'us',dict(kind='unload',unit=carrier['id'],pos=[8,8]))
        self.assertEqual(sum(active(u) and u['pos']==[8,8] for u in out['units']),2)
        self.assertEqual(next(u for u in out['units'] if u['id']==troop['id'])['ap'],troop['ap']-1)

    def test_current_ai_recovers_from_an_unseen_occupied_landing_without_dice(self):
        s=initial('current:market_garden','dsl');s.update(ready=True,ai_side='us')
        troop=next(u for u in s['units'] if u['side']=='us' and u.get('reserve') and u['platoon']=='B')
        observer=next(u for u in s['units'] if u['side']=='us' and u['kind']=='leader' and u['platoon']=='B')
        hidden=next(u for u in s['units'] if u['side']=='de' and u['kind']=='mg')
        for u in s['units']:
            if u not in (troop,observer,hidden):u['hp']=0
        s['battlefield']['map']=[['field']*22 for _ in range(28)]
        observer['pos']=[3,5];hidden.update(pos=[6,5],camouflaged=True)
        update_intel(s)
        self.assertIn([6,5],options(s,troop)['drops'])
        start=troop['pos'].copy()
        orders=[dict(kind='drop',unit=troop['id'],pos=[6,5]),dict(kind='end')]
        with patch.object(computer,'choose_order',side_effect=orders) as chooser:
            out=play_turn(s,roll=lambda:self.fail('A rejected landing must not roll dice.'))
        self.assertEqual(chooser.call_count,2)
        self.assertIn((6,5),chooser.call_args_list[-1].args[2][troop['id']])
        survivor=next(u for u in out['units'] if u['id']==troop['id'])
        self.assertEqual(survivor['pos'],start);self.assertTrue(survivor['reserve'])
        self.assertEqual([h['action']['kind'] for h in out['action_history']],['end'])

    def test_current_ai_orders_are_legal_and_preserve_capacity(self):
        for key in SCENARIOS:
            s=initial('current:'+key,'dsl');s.update(ready=True,ai_side='us')
            cooperative.initialize(s,dict(control_size='units'),'host','Host')
            s['coop']['phase']='battle';s['ready']=True
            if deployment.active(s):
                s=apply(s,'de',dict(kind='deploy_lock'),roll=lambda:4)
            out=play_turn(s,roll=lambda:4,max_orders=4)
            self.assertTrue(editions.current(out),key)
            for u in out['units']:
                if active(u):self.assertFalse(domains.blocked(out,u,u['pos']),(key,u['id']))


class EditionAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.client=create_app(self.tmp.name+'/games.db').test_client()
    def tearDown(self):self.tmp.cleanup()
    def create(self,key,**extra):
        r=self.client.post('/api/match',json=dict(scenario=key,ruleset='dsl',**extra))
        self.assertEqual(r.status_code,201,r.json);return r.json
    def get(self,seat):
        return self.client.get('/api/match/'+seat['code'],headers={'Authorization':'Bearer '+seat['token']}).json
    def post(self,seat,path='',**body):
        r=self.client.post('/api/match/'+seat['code']+path,headers={'Authorization':'Bearer '+seat['token']},
                           json=dict(revision=self.get(seat)['revision'],**body))
        self.assertEqual(r.status_code,200,r.json);return r.json

    def test_catalog_old_clients_and_new_current_ids_both_work(self):
        data=self.client.get('/api/scenarios').json
        self.assertEqual(len(data['scenarios']),24);self.assertEqual(len(data['current_scenarios']),25)
        old=self.get(self.create('kharkov'));new=self.get(self.create('current:kharkov'))
        self.assertNotIn('edition',old);self.assertNotIn('fire_control_version',old)
        self.assertEqual(new['edition'],'current');self.assertEqual(new['scenario']['source_id'],'kharkov')
        self.assertEqual(new['fire_control_version'],1);self.assertEqual(new['ground_stack_version'],1)

    def test_rematch_switches_edition_only_for_the_next_battle(self):
        host=self.create('current:village');guest=self.client.post('/api/match/'+host['code']+'/join',json={}).json
        proposal=self.post(host,'/rematch',operation='propose',scenario='village',ruleset='dsl',swap=False)
        self.assertEqual(proposal['edition'],'current')
        accepted=self.post(guest,'/rematch',operation='accept')
        self.assertNotIn('edition',accepted);self.assertNotIn('ground_stack_version',accepted)
        self.post(host,'/rematch',operation='propose',scenario='current:orchard',ruleset='dsl',swap=False)
        accepted=self.post(guest,'/rematch',operation='accept')
        self.assertEqual(accepted['edition'],'current');self.assertEqual(accepted['scenario']['id'],'current:orchard')

    def test_solo_save_restores_the_exact_edition_and_rules(self):
        for key in ('current:vire_crossroads','vire_crossroads'):
            seat=self.create(key,opponent='computer')
            before=self.get(seat);saved=self.post(seat,'/save')['save_code']
            restored=self.client.post('/api/restore',json=dict(code=saved))
            self.assertEqual(restored.status_code,201,restored.json)
            after=self.get(restored.json)
            before.pop('code');after.pop('code')
            self.assertEqual(after,before)

    def test_current_coop_sharing_does_not_transfer_control(self):
        host=self.create('current:kharkov',opponent='cooperative',control_size='platoons')
        before=self.get(host);group=next(g for g in before['coop']['groups'] if g['side']=='us' and not g['owner'] and not g['command'])
        guest=self.client.post('/api/match/'+host['code']+'/join',json=dict(side='us',group=group['id'],player_name='Friend')).json
        started=self.post(host,'/cooperative',operation='start')
        self.assertEqual(self.get(guest)['side'],'us');self.assertEqual(started['edition'],'current')
        guest_command=self.get(guest)['coop']['controlled']
        own=guest_command[0]
        r=self.client.post('/api/match/'+host['code'],headers={'Authorization':'Bearer '+host['token']},json=dict(kind='dig',unit=own,revision=started['revision']))
        self.assertEqual(r.status_code,400)
        with sqlite3.connect(self.tmp.name+'/games.db') as db:
            s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(host['code'],)).fetchone()[0])
            mover=next(u for u in s['units'] if u['side']=='us' and u['kind']=='scout' and u['platoon']=='A')
            teammate=next(u for u in s['units'] if u['id']==own)
            mover['pos']=[4,4];teammate['pos']=[5,4]
            s['battlefield']['map'][4][4]=s['battlefield']['map'][4][5]='field'
            s['revision']+=1;update_intel(s)
            db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),host['code']))
        shared=self.post(host,kind='move',unit=mover['id'],pos=[5,4])
        self.assertEqual(shared['coop']['controllers'],started['coop']['controllers'])
        self.assertEqual(sum(active(u) and u['pos']==[5,4] for u in shared['units']),2)
        self.assertEqual(self.get(guest)['coop']['controlled'],guest_command)
        recruitment=self.client.get('/api/match/'+host['code']+'/cooperative').json
        self.assertEqual(recruitment['edition'],'current')
