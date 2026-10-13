"""Night visibility, actual transport approaches, dice hazards and mandatory ground victory."""
import copy
import tempfile
import unittest

from ww2_web import create_app
from ww2_tactics import airborne, cooperative, domains, nightfall, weapons
from ww2_tactics.engine import initial,apply,options
from ww2_tactics.scenarios import catalog,get_scenario
from ww2_tactics.visibility import active,visible_ids,public_state,update_intel,sees_hex,sight_calculations
from ww2_tactics.computer import play_turn

MAP='current:nightfall_beacon'


class NightfallRulesTests(unittest.TestCase):
    def battle(self):
        s=initial(MAP,'dsl');s['ready']=True
        return s
    def unit(self,s,side,kind,group='A'):
        return next(u for u in s['units'] if u['side']==side and u['kind']==kind and u['platoon']==group)
    def drop(self,s,aim=None,dice=(6,6),group='A'):
        aim=aim or [15,13];p=self.unit(s,'us','transport_aircraft',group);p.update(pos=aim.copy(),ap=4)
        stream=iter(dice)
        return apply(s,'us',dict(kind='airborne_drop',unit=p['id'],pos=aim),roll=lambda:next(stream))
    def isolated(self):
        s=self.battle()
        for u in s['units']:u['pos']=[29,0] if u['side']=='de' else [0,25]
        s['battlefield']['map']=[['field']*30 for _ in range(26)]
        return s

    def test_current_only_roster_has_two_night_fighters_and_four_spotlights(self):
        s=self.battle();b=s['battlefield']
        self.assertEqual((b['width'],b['height']),(30,26));self.assertEqual(len(s['units']),38)
        self.assertIn(MAP,{b['id'] for b in catalog('current')})
        with self.assertRaises(ValueError):get_scenario('nightfall_beacon')
        with self.assertRaises(ValueError):initial(MAP,'classic')
        self.assertEqual(sum(u['kind']=='spotlight' for u in s['units']),4)
        self.assertEqual(sum(u.get('variant')=='bf110' for u in s['units']),2)
        self.assertEqual(sum(u['kind']=='transport_aircraft' for u in s['units']),2)
        self.assertEqual(sum(u.get('drop_transport') is not None for u in s['units']),4)
        for u in s['units']:
            if active(u):self.assertFalse(domains.blocked(s,u,u['pos']),u['id'])
        self.assertEqual({u.get('variant') for u in s['units'] if u['kind']=='bomber'}, {'lancaster','halifax','mosquito_pathfinder'})

    def test_night_sight_is_short_and_radar_does_not_reveal_distant_ground(self):
        s=self.isolated();fighter=self.unit(s,'us','fighter');fighter['pos']=[12,20]
        plane=self.unit(s,'de','fighter');plane['pos']=[12,15]
        self.assertNotIn(plane['id'],visible_ids(s,'us'))
        plane['pos']=[12,16];self.assertIn(plane['id'],visible_ids(s,'us'))
        radar=self.unit(s,'de','radar');radar['pos']=[12,10]
        fighter['pos']=[12,15];self.assertIn(fighter['id'],visible_ids(s,'de'))
        plane['pos']=[29,0]
        troop=self.unit(s,'us','paratrooper');troop.update(pos=[12,15],reserve=False)
        self.assertNotIn(troop['id'],visible_ids(s,'de'))

    def test_spotlight_reveals_air_corridor_and_emitter_without_unlit_ground(self):
        s=self.isolated();s['turn']='de'
        lamp=self.unit(s,'de','spotlight');lamp['pos']=[12,10]
        plane=self.unit(s,'us','fighter');plane['pos']=[12,16]
        troop=self.unit(s,'us','paratrooper');troop.update(pos=[12,16],reserve=False)
        self.assertNotIn(plane['id'],visible_ids(s,'de'));self.assertNotIn(lamp['id'],visible_ids(s,'us'))
        out=apply(s,'de',dict(kind='spotlight',unit=lamp['id'],pos=[12,18]))
        self.assertIn(plane['id'],visible_ids(out,'de'));self.assertNotIn(troop['id'],visible_ids(out,'de'))
        self.assertIn(lamp['id'],visible_ids(out,'us'))
        self.assertEqual(self.unit(out,'de','spotlight')['ap'],1)
        self.assertTrue(public_state(out,'us')['night_lights'])
        dead=copy.deepcopy(out);self.unit(dead,'de','spotlight')['hp']=0
        self.assertNotIn(plane['id'],visible_ids(dead,'de'))
        with self.assertRaises(ValueError):apply(s,'de',dict(kind='spotlight',unit=lamp['id'],pos=[12,24]))

    def test_flare_shares_exact_patch_and_expires_after_opposing_turn(self):
        s=self.isolated();path=next(u for u in s['units'] if u.get('max_flares'));path.update(pos=[12,18],ap=4)
        troop=self.unit(s,'de','squad');troop['pos']=[12,15]
        out=apply(s,'us',dict(kind='flare',unit=path['id'],pos=[12,15]))
        self.assertIn(troop['id'],visible_ids(out,'us'))
        self.assertTrue(sees_hex(out,'de',[12,15]));self.assertFalse(sees_hex(out,'us',[12,12]))
        self.assertEqual(next(u for u in out['units'] if u['id']==path['id'])['flares'],1)
        out=apply(out,'us',dict(kind='end'));self.assertEqual(len(out['night_flares']),1)
        out=apply(out,'de',dict(kind='end'));self.assertFalse(out['night_flares'])

    def test_lighting_removes_darkness_penalty_in_preview_and_resolution(self):
        s=self.isolated();s['turn']='de';gun=self.unit(s,'de','aa_gun');gun['pos']=[12,10]
        plane=self.unit(s,'us','bomber');plane['pos']=[12,12]
        shot=next(t for t in options(s,gun)['targets'] if t['id']==plane['id']);self.assertEqual(shot['threshold'],6)
        out=apply(s,'de',dict(kind='fire',unit=gun['id'],target=plane['id']),roll=lambda:5)
        self.assertEqual(next(u for u in out['units'] if u['id']==plane['id'])['hp'],plane['hp'])
        s['night_flares']=[dict(side='us',pos=plane['pos'].copy(),ttl=2)]
        shot=next(t for t in options(s,gun)['targets'] if t['id']==plane['id']);self.assertEqual(shot['threshold'],4)
        out=apply(s,'de',dict(kind='fire',unit=gun['id'],target=plane['id']),roll=lambda:5)
        self.assertEqual(next(u for u in out['units'] if u['id']==plane['id'])['hp'],plane['hp']-2)
        self.assertEqual(out['last_combat']['threshold'],4)

    def test_transport_must_approach_and_reserves_cannot_use_legacy_mapwide_drop(self):
        s=self.battle();p=self.unit(s,'us','transport_aircraft');before=copy.deepcopy(s)
        with self.assertRaises(ValueError):apply(s,'us',dict(kind='airborne_drop',unit=p['id'],pos=[15,13]),roll=lambda:self.fail('Invalid aim must not roll'))
        self.assertEqual(s,before)
        troop=nightfall.drop_reserves(s,p)[0];troop['ap']=3
        self.assertFalse(options(s,troop)['drops'])
        self.assertTrue(domains.is_air(p));self.assertEqual(weapons.protection(p),'aircraft')
        self.assertFalse(options(s,p)['targets'])

    def test_six_lands_precisely_with_one_ap_and_own_transport_cargo(self):
        s=self.battle();p=self.unit(s,'us','transport_aircraft');expected=nightfall.drop_reserves(s,p)[0]['id']
        out=self.drop(s);report=out['airlift_reports']['us'];self.assertEqual((report['roll'],report['pos']),(6,[15,13]))
        troop=next(u for u in out['units'] if u['id']==expected)
        self.assertEqual((troop['ap'],troop['reserve']),(1,False));self.assertEqual(troop['platoon'],'A')
        self.assertFalse(options(out,self.unit(out,'us','transport_aircraft'))['airborne_drop'])
        self.assertEqual(len(nightfall.drop_reserves(out,self.unit(out,'us','transport_aircraft','B'))),2)
        out=apply(out,'us',dict(kind='end'));troop=next(u for u in out['units'] if u['id']==expected);self.assertEqual(troop['banked_ap'],0)
        out=apply(out,'de',dict(kind='end'));self.assertEqual(next(u for u in out['units'] if u['id']==expected)['ap'],3)

    def test_natural_one_does_not_reveal_enemies_at_the_intended_landing(self):
        s=self.isolated();p=self.unit(s,'us','transport_aircraft');p['pos']=[15,13]
        enemy=self.unit(s,'de','squad');enemy['pos']=[15,11]
        before=visible_ids(s,'us');out=self.drop(s,dice=(1,));report=out['airlift_reports']['us']
        self.assertFalse(report['landed']);self.assertNotIn('pos',report)
        self.assertNotIn(enemy['id'],visible_ids(out,'us'));self.assertEqual(visible_ids(out,'us')-before,set())

    def test_scatter_table_and_friendly_flare_guidance_keep_natural_one_risk(self):
        for die,scatter in [(2,3),(3,2),(4,1),(5,1),(6,0)]:
            s=self.isolated();out=self.drop(s,dice=(die,1,6) if scatter else (die,6))
            self.assertEqual(out['airlift_reports']['us']['scatter'],scatter)
        s=self.isolated();s['night_flares']=[dict(side='us',pos=[15,13],ttl=2)]
        out=self.drop(s,dice=(5,6));self.assertEqual(out['airlift_reports']['us']['pos'],[15,13]);self.assertTrue(out['airlift_reports']['us']['guided'])
        self.assertFalse(self.drop(s,dice=(1,))['airlift_reports']['us']['landed'])

    def test_flak_approach_risk_changes_with_light_and_never_reveals_gun(self):
        s=self.isolated();gun=self.unit(s,'de','aa_gun');gun['pos']=[15,9]
        out=self.drop(s,dice=(6,1));self.assertTrue(out['airlift_reports']['us']['landed'])
        s['night_flares']=[dict(side='us',pos=[15,13],ttl=2)]
        out=self.drop(s,dice=(6,1));report=out['airlift_reports']['us'];self.assertFalse(report['landed'])
        self.assertNotIn(gun['id'],str(report));self.assertNotIn('pos',report)
        self.assertEqual(self.unit(out,'de','aa_gun')['aa_round'],1)
        out=self.drop(out,dice=(6,1),group='B');self.assertTrue(out['airlift_reports']['us']['landed'])

    def test_water_loss_and_destroyed_transport_remove_only_undropped_cargo(self):
        s=self.isolated();s['battlefield']['map'][13][15]='water'
        out=self.drop(s);uid=out['airlift_reports']['us']['unit'];troop=next(u for u in out['units'] if u['id']==uid)
        self.assertTrue(troop['afloat']);out=apply(out,'us',dict(kind='end'))
        self.assertEqual(next(u for u in out['units'] if u['id']==uid)['hp'],2)
        p=self.unit(out,'us','transport_aircraft');p['hp']=0;nightfall.after_order(out)
        self.assertEqual(next(u for u in out['units'] if u['id']==uid)['hp'],2)
        self.assertFalse(nightfall.drop_reserves(out,p));self.assertEqual(len(nightfall.drop_reserves(out,self.unit(out,'us','transport_aircraft','B'))),2)

    def test_bombing_alone_cannot_win_and_airborne_hold_can_be_broken(self):
        s=self.battle()
        for u in s['units']:
            if u.get('mission_radar'):u['hp']=0
        self.assertIsNone(apply(s,'us',dict(kind='end'))['winner'])
        s=self.drop(s)
        s=apply(s,'us',dict(kind='end'));self.assertEqual(s['night_hold'],1);self.assertIsNone(s['winner'])
        s=apply(s,'de',dict(kind='end'));s=apply(s,'us',dict(kind='end'));self.assertEqual(s['winner'],'us')
        s=self.battle()
        for u in s['units']:
            if u.get('mission_radar'):u['hp']=0
        s=self.drop(s);s=apply(s,'us',dict(kind='end'))
        garrison=self.unit(s,'de','squad');garrison['pos']=[15,14];nightfall.after_order(s)
        self.assertEqual(s['night_hold'],0);self.assertFalse(nightfall.status(s)['station_held'])

    def test_no_viable_airborne_force_and_final_round_are_defender_victories(self):
        s=self.battle()
        for u in s['units']:
            if u['kind']=='transport_aircraft':u['hp']=0
        out=apply(s,'us',dict(kind='end'));self.assertEqual(out['winner'],'de')
        self.assertTrue(all(u['hp']==0 for u in out['units'] if u.get('drop_transport')))
        s=self.battle();s.update(round=24,turn='de');self.assertEqual(apply(s,'de',dict(kind='end'))['winner'],'de')

    def test_finite_field_service_restores_the_correct_bomber_and_flare_capacity(self):
        s=self.battle();p=next(u for u in s['units'] if u.get('max_flares'));field=self.unit(s,'us','airfield')
        p.update(pos=field['pos'].copy(),bombs=0,flares=0,hp=2,ap=4)
        out=apply(s,'us',dict(kind='rearm',unit=p['id']));p=next(u for u in out['units'] if u['id']==p['id'])
        self.assertEqual((p['bombs'],p['flares'],p['hp'],p['ap']),(2,2,3,2));self.assertEqual(self.unit(out,'us','airfield')['air_stores'],5)
        s=self.battle();p=next(u for u in s['units'] if u.get('max_flares'));other=self.unit(s,'us','airfield','B');p.update(pos=other['pos'].copy(),bombs=0)
        self.assertFalse(options(s,p)['rearm'])

    def test_transport_and_reserved_troops_share_owner_at_both_command_sizes(self):
        for size in ('platoons','units'):
            s=self.battle();cooperative.initialize(s,dict(control_size=size),'host','Host')
            for u in s['units']:
                if u.get('drop_transport'):
                    self.assertEqual(cooperative.group_for(s,u['id'])['id'],cooperative.group_for(s,u['drop_transport'])['id'])
            if size=='platoons':self.assertEqual(len(s['coop']['groups']),4)

    def test_bounded_night_ai_works_for_both_armies(self):
        for side in ('us','de'):
            s=self.battle();s.update(turn=side,ai_side=side)
            out=play_turn(s,roll=lambda:6,max_orders=2)
            self.assertGreater(out['revision'],0);self.assertTrue(all(u['ap']>=0 for u in out['units']))


class NightfallAPITests(unittest.TestCase):
    def test_fog_filtered_catalog_coop_and_snapshot_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            client=create_app(tmp+'/games.sqlite').test_client()
            result=client.post('/api/match',json=dict(scenario=MAP,ruleset='dsl',opponent='computer'))
            self.assertEqual(result.status_code,201,result.json);seat=result.json;headers={'Authorization':'Bearer '+seat['token']};url='/api/match/'+seat['code']
            before=client.get(url,headers=headers).json
            self.assertFalse(any(u['side']=='de' for u in before['units']));self.assertEqual(before['night_status']['radars_destroyed'],0)
            saved=client.post(url+'/save',headers=headers,json=dict(revision=before['revision'])).json
            restored=client.post('/api/restore',json=dict(code=saved['save_code'])).json
            after=client.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).json
            self.assertEqual(before['scenario'],after['scenario']);self.assertEqual(before['units'],after['units']);self.assertEqual(before['night_status'],after['night_status'])
            seat=client.post('/api/match',json=dict(scenario=MAP,ruleset='dsl',opponent='cooperative')).json
            view=client.get('/api/match/'+seat['code'],headers={'Authorization':'Bearer '+seat['token']}).json
            self.assertEqual(view['coop']['control_size'],'platoons');self.assertEqual(len(view['coop']['controlled']),9)


if __name__=='__main__':unittest.main()
