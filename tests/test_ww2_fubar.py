"""Joint air / sea / land rules, private sight, and cross-device continuity."""
import copy
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from ww2_tactics import air, airborne, domains, fieldworks, fubar, signals, transport, weapons
from ww2_tactics.engine import initial, apply, options, terrain, distance
from ww2_tactics.visibility import active, visible_ids, unit_visible_ids, update_intel, public_state, view
from ww2_tactics.order_history import perform, status
from ww2_tactics.computer import choose_order, objective_costs, play_turn
from ww2_tactics.scenarios import SCENARIOS
from ww2_web import create_app


class FubarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template=initial('fubar','dsl')

    def battle(self):
        s=copy.deepcopy(self.template);s['ready']=True
        return s

    def field(self, *roles, fog=False):
        s=self.battle();pool=s['units'];s['units']=[]
        s.update(fog_of_war=fog,intel={},platoon_intel={'us':{},'de':{}},buildings={},fieldworks={},reports={})
        s['battlefield'].update(width=18,height=18,objective=[12,8],map=[['water' if x<5 else 'field' for x in range(18)] for _ in range(18)],
            joint_objectives=[dict(id='sea',name='Sea',pos=[2,8],domain='sea',radius=1),
                              dict(id='coast',name='Coast',pos=[6,8],domain='land',radius=0),
                              dict(id='town',name='Town',pos=[12,8],domain='land',radius=0)])
        for side,kind,pos in roles:
            u=copy.deepcopy(next(u for u in pool if u['side']==side and u['kind']==kind))
            u.update(id=f'{side}-{kind}-{len(s["units"])}',pos=list(pos),platoon='A',overwatch=False,
                     reserve=False,pinned=False,entrenched=False)
            u.pop('carrier_id',None);s['units'].append(u)
        update_intel(s)
        return s

    def act(self,s,u,kind,**kw):
        return apply(s,u['side'],dict(kind=kind,unit=u['id'],**kw),roll=lambda:6)

    def test_every_existing_kind_and_valid_deployment(self):
        s=self.battle();kinds={u['kind'] for u in s['units']}
        expected={u['kind'] for key in SCENARIOS if key!='fubar' for u in initial(key,'dsl')['units']}
        self.assertEqual(kinds,expected);self.assertEqual(len(kinds),31)
        self.assertEqual(len({u['id'] for u in s['units']}),66)
        self.assertEqual(len({(tuple(u['pos']),domains.is_air(u)) for u in s['units'] if active(u)}),sum(active(u) for u in s['units']))
        for u in s['units']:
            x,y=u['pos'];self.assertTrue(0<=x<36 and 0<=y<32)
            if not active(u) or u['kind'] in domains.AIR_UNITS|{'at_gun','flak'}:continue
            if u['kind'] in domains.SHIPS:self.assertEqual(terrain(x,y,s),'water')
            else:self.assertTrue(fieldworks.movement(u,terrain(x,y,s))[0],u['id'])
        self.assertFalse(any(u['side']=='de' and u['kind']=='paratrooper' for u in s['units']))
        self.assertEqual(sum(bool(u.get('airlift_reserve')) for u in s['units']),2)
        self.assertEqual({u.get('variant') for u in s['units'] if u.get('variant')},{'tiger','firefly'})
        self.assertNotIn('air_version',s);self.assertNotIn('naval_version',s)
        with self.assertRaises(ValueError):initial('fubar','classic')

    def test_air_and_surface_can_move_into_each_others_hex(self):
        for surface in ('squad','tank','destroyer','landing_craft'):
            water=surface in domains.SHIPS|{'landing_craft'};x=2 if water else 8
            s=self.field(('us','fighter',[x,7]),('us',surface,[x+1,7]),('de','squad',[17,17]))
            plane,troop=s['units'][:2]
            self.assertIn(troop['pos'],[m['pos'] for m in options(s,plane)['moves']])
            out=self.act(s,plane,'move',pos=troop['pos'])
            self.assertEqual(out['units'][0]['pos'],out['units'][1]['pos'])
            self.assertIn(plane['pos'],[m['pos'] for m in options(s,troop)['moves']])
            out=self.act(s,troop,'move',pos=plane['pos'])
            self.assertEqual(out['units'][0]['pos'],out['units'][1]['pos'])

    def test_same_layer_stacking_and_hidden_previews(self):
        s=self.field(('us','fighter',[6,7]),('de','fighter',[8,7]),fog=True)
        plane,enemy=s['units'];self.assertNotIn([8,7],[m['pos'] for m in options(s,plane)['moves']])
        # Patch observation, not occupancy: a hidden air blocker cannot alter previews.
        with patch('ww2_tactics.visibility.unit_visible_ids',return_value={plane['id']}):
            move=next(m for m in options(s,plane)['moves'] if m['pos']==[9,7])
            out=self.act(s,plane,'move',pos=move['pos'])
        self.assertEqual(out['units'][0]['pos'],[7,7]);self.assertEqual(out['units'][0]['ap'],plane['ap']-1)
        s=self.field(('us','destroyer',[2,6]),('de','destroyer',[3,6]),fog=True);ship,enemy=s['units']
        with patch('ww2_tactics.visibility.unit_visible_ids',return_value={ship['id']}):
            self.assertIn(enemy['pos'],[m['pos'] for m in options(s,ship)['moves']])
            with self.assertRaisesRegex(ValueError,'blocked by a contact'):self.act(s,ship,'move',pos=enemy['pos'])

    def test_roles_target_only_their_domain_and_fogged_targets_stay_hidden(self):
        s=self.field(('us','fighter',[8,7]),('us','bomber',[8,8]),('us','aa_gun',[7,7]),('us','squad',[7,8]),
                     ('de','fighter',[9,7]),('de','tank',[9,8]),('de','squad',[9,9]))
        for u in s['units'][:4]:
            targets={t['id'] for t in options(s,u)['targets']}
            if u['kind'] in {'fighter','aa_gun'}:self.assertEqual(targets,{s['units'][4]['id']})
            else:self.assertNotIn(s['units'][4]['id'],targets)
        bomber=s['units'][1];before=s['units'][5]['hp']
        out=self.act(s,bomber,'fire',target=s['units'][5]['id'])
        self.assertLess(out['units'][5]['hp'],before);self.assertEqual(out['units'][1]['bombs'],1)
        self.assertFalse(out['units'][4]['pinned'])
        for kind in ('radar','airfield'):
            s=self.field(('us',kind,[8,8]),('de','fighter',[9,8]));legal=options(s,s['units'][0])
            self.assertFalse(legal['moves']);self.assertFalse(legal['targets']);self.assertFalse(legal['dig'])

    def test_aa_and_flak_intercept_along_flight_and_redo_keeps_roll(self):
        for kind,loss in [('aa_gun',2),('flak',1)]:
            s=self.field(('us','fighter',[6,8]),('de',kind,[7,7]));plane,gun=s['units']
            s.pop('signals_version') # Isolate rolled replay; radio sightings deliberately commit movement.
            gun.update(range=1,aa_radius=1,overwatch=True)
            self.assertGreater(distance([9,8],gun['pos']),1)
            with patch('ww2_tactics.order_history.secrets.randbelow',return_value=5) as rng:
                out=perform(s,'us',dict(kind='move',unit=plane['id'],pos=[9,8]))
                self.assertEqual(out['units'][0]['hp'],plane['hp']-loss)
                self.assertFalse(out['units'][1]['overwatch'])
                undo=perform(out,'us',dict(kind='undo'));redo=perform(undo,'us',dict(kind='redo'))
                self.assertEqual(redo['units'],out['units']);self.assertEqual(rng.call_count,1)

    def test_watch_status_does_not_leak_in_flight_preview(self):
        s=self.field(('us','fighter',[7,8]),('de','aa_gun',[8,7]),fog=True)
        before=options(s,s['units'][0]);s['units'][1]['overwatch']=True
        self.assertEqual(options(s,s['units'][0]),before)

    def test_radar_sees_air_not_surface_and_contact_clears_in_correct_layer(self):
        s=self.field(('us','radar',[6,5]),('de','fighter',[13,5]),('de','squad',[13,5]),fog=True)
        radar,plane,troop=s['units'];ids=visible_ids(s,'us')
        self.assertIn(plane['id'],ids);self.assertNotIn(troop['id'],ids)
        p=public_state(s,'us');self.assertIn([13,5],p['visible_air_hexes']);self.assertNotIn([13,5],p['visible_hexes'])
        self.assertNotIn(troop['id'],{u['id'] for u in p['units']})
        self.assertIn(plane['id'],p['platoon_views']['A']['enemy_ids'])
        plane['pos']=[17,17];update_intel(s)
        self.assertNotIn(plane['id'],s['intel']['us']) # Old air cell is still radar-covered.
        plane['pos']=[13,5];update_intel(s);radar['hp']=0;plane['pos']=[17,17];update_intel(s)
        contact=next(c for c in public_state(s,'us')['contacts'] if c['id']==plane['id'])
        self.assertEqual(contact['pos'],[13,5]);self.assertNotIn('hp',contact)

    def test_aircraft_ground_concealment_and_smoke(self):
        s=self.field(('us','fighter',[8,8]),('de','squad',[11,8]),fog=True)
        troop=s['units'][1];self.assertIn(troop['id'],visible_ids(s,'us'))
        s['battlefield']['map'][8][11]='woods';self.assertNotIn(troop['id'],visible_ids(s,'us'))
        troop['pos']=[10,8];s['battlefield']['map'][8][10]='woods';self.assertIn(troop['id'],visible_ids(s,'us'))
        s['smoke']=[dict(pos=[10,8],ttl=2)];self.assertNotIn(troop['id'],visible_ids(s,'us'))
        troop['kind']='fighter';self.assertIn(troop['id'],visible_ids(s,'us'))

    def test_surface_bombardment_does_not_select_plane_as_primary(self):
        s=self.field(('us','battleship',[3,8]),('de','fighter',[8,8]),('de','squad',[8,8]))
        ship,plane,troop=s['units'];out=self.act(s,ship,'bombard',pos=[8,8])
        self.assertEqual(out['units'][1]['hp'],plane['hp']);self.assertEqual(out['units'][2]['hp'],0)
        strike=dict(attacker=ship['id'],side='us',pos=[8,8],weapon='artillery',area=[[8,8]])
        weapons.resolve_artillery(s,strike,lambda:6)
        self.assertEqual(plane['hp'],3);self.assertLess(troop['hp'],3)

    def test_bomber_can_aim_at_surface_below_it(self):
        s=self.field(('us','bomber',[8,8]),('de','squad',[8,8]));bomber,troop=s['units']
        self.assertIn([8,8],options(s,bomber)['area_fire'])
        out=self.act(s,bomber,'area_fire',pos=[8,8]);self.assertEqual(out['units'][0]['hp'],bomber['hp'])
        self.assertLess(out['units'][1]['hp'],troop['hp']);self.assertEqual(out['units'][0]['bombs'],1)

    def test_transport_unloads_and_bails_out_under_plane(self):
        s=self.field(('us','landing_craft',[4,8]),('us','engineer',[4,8]),('us','fighter',[5,8]),('de','squad',[17,17]))
        craft,troop,plane=s['units'][:3];troop['carrier_id']=craft['id']
        self.assertIn([5,8],[m['pos'] for m in options(s,craft)['unload']])
        out=self.act(s,craft,'unload',pos=[5,8]);self.assertEqual(out['units'][1]['pos'],plane['pos'])
        self.assertNotIn('carrier_id',out['units'][1])
        craft['hp']=0;transport.bail_out(s,craft);self.assertGreater(troop['hp'],0)
        self.assertNotIn('carrier_id',troop)

    def test_airlift_has_surface_occupancy_only(self):
        s=self.field(('us','fighter',[8,8]),('de','squad',[17,17]))
        self.assertTrue(airborne.landing_space(s,[8,8]))
        s['units'][1]['pos']=[8,8];self.assertFalse(airborne.landing_space(s,[8,8]))

    def test_mixed_turn_resets_all_specialist_flags_and_ap(self):
        s=self.battle()
        for u in s['units']:
            u.update(air_used=True,recon_used=True,torpedo_used=True,repair_used=True,rearm_used=True,overwatch=True)
        s=apply(s,'us',{'kind':'end'});self.assertEqual(s['turn'],'de')
        for u in s['units']:
            if u['side']=='de':
                self.assertEqual(u['ap'],u['base_ap'])
                self.assertFalse(any(u[k] for k in ('air_used','recon_used','torpedo_used','repair_used','rearm_used','overwatch')))
        s=apply(s,'de',{'kind':'end'});self.assertEqual(s['round'],2)
        for u in s['units']:
            if u['side']=='us':self.assertEqual(u['ap'],u['base_ap']+(2 if u['kind'] in {'commander','leader'} else 1 if u['base_ap'] else 0))

    def test_command_does_not_give_station_or_aircraft_actions(self):
        s=self.field(('us','commander',[8,8]),('us','fighter',[9,8]),('us','airfield',[8,9]),('us','squad',[9,9]),('de','squad',[17,17]))
        legal=options(s,s['units'][0]);self.assertEqual(legal['command'],[s['units'][3]['id']])

    def test_scores_use_surface_capture_roles_and_contesting(self):
        s=self.field(('us','destroyer',[2,8]),('us','squad',[6,8]),('us','fighter',[12,8]),('de','squad',[17,17]))
        self.assertEqual([p['owner'] for p in fubar.controls(s)],['us','us',None])
        out=apply(s,'us',{'kind':'end'});self.assertEqual(out['joint_score'],{'us':2,'de':0})
        s['joint_score']['us']=8;self.assertEqual(apply(s,'us',{'kind':'end'})['winner'],'us')
        enemy=copy.deepcopy(s['units'][0]);enemy.update(id='enemy-ship',side='de',pos=[3,8]);s['units'].append(enemy)
        self.assertTrue(fubar.controls(s)[0]['contested'])
        s['joint_score']['us']=0;self.assertEqual(apply(s,'us',{'kind':'end'})['joint_score']['us'],1)
        for kind in ('tank','fighter','at_gun','aa_gun','flak','airfield','radar','amphibious'):
            side='de' if kind=='flak' else 'us'
            s=self.field((side,kind,[12,8]),('de','squad',[17,17]))
            self.assertIsNone(fubar.controls(s)[2]['owner'],kind)

    def test_no_britain_or_midway_instant_victory_and_round_limit(self):
        s=self.field(('us','squad',[8,8]),('de','squad',[15,15]))
        self.assertIsNone(apply(s,'us',{'kind':'end'})['winner'])
        s.update(turn='de',round=36);s['joint_score']={'us':3,'de':2}
        out=apply(s,'de',{'kind':'end'});self.assertEqual(out['winner'],'us');self.assertEqual(out['victories']['us'],1)
        s['joint_score']={'us':3,'de':3};self.assertEqual(apply(s,'de',{'kind':'end'})['winner'],'de')

    def test_surface_ships_do_not_launch_torpedoes_over_land_or_hit_air(self):
        s=self.field(('us','destroyer',[1,8]),('de','destroyer',[3,8]),('de','fighter',[2,8]))
        ship=s['units'][0];self.assertTrue(options(s,ship)['torpedoes'])
        s['battlefield']['map'][8][2]='field';self.assertFalse(options(s,ship)['torpedoes'])
        self.assertNotIn(s['units'][2]['id'],[t['id'] for t in options(s,ship)['targets']])

    def test_service_and_carrier_actions_use_existing_supply_rules(self):
        s=self.field(('us','bomber',[8,8]),('us','airfield',[9,8]),('de','squad',[17,17]))
        bomber=s['units'][0];bomber.update(bombs=0,hp=2)
        out=self.act(s,bomber,'rearm');self.assertEqual((out['units'][0]['hp'],out['units'][0]['bombs']),(3,2))
        s=self.field(('us','carrier',[2,8]),('de','fighter',[3,8]),('de','destroyer',[3,8]))
        legal=options(s,s['units'][0]);self.assertEqual([t['id'] for t in legal['airstrikes']],[s['units'][2]['id']])
        out=self.act(s,s['units'][0],'recon',pos=[3,8]);self.assertTrue(out['units'][0]['recon_used'])

    def test_computer_uses_legal_orders_in_all_domains(self):
        for kind in ('fighter','bomber','destroyer','carrier','engineer','tank','mortar','commander'):
            pos=[2,5] if kind in domains.SHIPS else [8,5]
            s=self.field(('de',kind,pos),('us','squad',[17,17]));s.update(turn='de',ai_side='de')
            action=choose_order(s,objective_costs(s),{})
            out=apply(s,'de',action,roll=lambda:1);self.assertGreater(out['revision'],0)
        s=self.battle();s.update(turn='de',ai_side='de')
        out=play_turn(s,roll=lambda:1)
        self.assertEqual(out['turn'],'us');self.assertTrue(out['computer_playback']['frames'])
        for frame in out['computer_playback']['frames']:
            for key in ('before','after'):
                self.assertIn('visible_air_hexes',frame[key]);self.assertIn('joint_score',frame[key])

    def test_api_save_restore_preserves_layers_and_private_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            client=create_app(os.path.join(tmp,'fubar.sqlite')).test_client()
            response=client.post('/api/match',json=dict(opponent='computer',scenario='fubar',ruleset='dsl'))
            self.assertEqual(response.status_code,201)
            seat=response.get_json();headers={'Authorization':'Bearer '+seat['token']};url='/api/match/'+seat['code']
            before=client.get(url,headers=headers).get_json();self.assertEqual(before['joint_ops_version'],1)
            self.assertNotIn('platoon_intel',before);self.assertNotIn('intel',before)
            self.assertIn('visible_air_hexes',before);self.assertTrue(before['legal'])
            saved=client.post(url+'/save',headers=headers,json={'revision':before['revision']}).get_json()['save_code']
            restored=client.post('/api/restore',json={'code':saved});self.assertEqual(restored.status_code,201)
            second=restored.get_json();out=client.get('/api/match/'+second['code'],headers={'Authorization':'Bearer '+second['token']}).get_json()
            for key in ('units','legal','joint_score','joint_control','joint_ops_version','scenario','platoon_views','visible_air_hexes'):
                self.assertEqual(before[key],out[key],key)


if __name__=='__main__':unittest.main()
