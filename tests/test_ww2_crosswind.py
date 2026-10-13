"""Mixed fleet/air platoons, finite service, interception and four-player turns."""
import copy
import tempfile
import unittest

from ww2_web import create_app
from ww2_tactics import cooperative, crosswind, domains, fubar, naval, weapons
from ww2_tactics.engine import initial, apply, options, terrain
from ww2_tactics.scenarios import catalog, get_scenario
from ww2_tactics.visibility import active, public_state
from ww2_tactics.computer import play_turn

MAP = 'current:crosswind_strait'


class CrosswindRulesTests(unittest.TestCase):
    def battle(self):
        state=initial(MAP,'dsl');state.update(ready=True,fog_of_war=False)
        return state

    def unit(self, state, side, kind, group='A'):
        return next(u for u in state['units'] if u['side']==side and u['kind']==kind and u['platoon']==group)

    def test_medium_current_only_and_exactly_two_mixed_platoons_per_team(self):
        state=self.battle();board=state['battlefield']
        self.assertEqual((board['width'],board['height']),(24,20))
        self.assertEqual(len(state['units']),28)
        self.assertIn(MAP,{b['id'] for b in catalog('current')})
        self.assertNotIn('crosswind_strait',{b['id'] for b in catalog()})
        with self.assertRaises(ValueError):get_scenario('crosswind_strait')
        with self.assertRaises(ValueError):initial(MAP,'classic')
        for side in ('us','de'):
            for group in ('A','B'):
                units=[u for u in state['units'] if u['side']==side and u['platoon']==group]
                self.assertEqual(len(units),7)
                self.assertEqual(sum(domains.is_air(u) for u in units),3)
                self.assertEqual(sum(u['kind'] in domains.SHIPS for u in units),4)
                self.assertEqual({u.get('variant') for u in units if u.get('variant')},
                    {'aa_escort','dive_bomber'} if side=='us' else {'torpedo_cruiser','torpedo_bomber'})
        for u in state['units']:
            self.assertFalse(domains.blocked(state,u,u['pos']))
            self.assertTrue(options(dict(state,turn=u['side']),u)['moves'])
            if u['kind'] in domains.SHIPS:self.assertTrue(naval.navigable(terrain(*u['pos'],state)))

    def test_separate_air_and_surface_spaces_and_island_routes(self):
        state=self.battle();plane=self.unit(state,'us','fighter');ship=self.unit(state,'us','destroyer')
        plane['pos']=ship['pos'].copy()
        self.assertFalse(domains.blocked(state,plane,plane['pos']))
        self.assertFalse(domains.blocked(state,ship,ship['pos']))
        other=self.unit(state,'us','destroyer','B');other['pos']=ship['pos'].copy()
        self.assertTrue(domains.blocked(state,ship,ship['pos']))
        costs=crosswind.ship_costs(state,[12,10])
        self.assertNotIn((8,10),costs);self.assertIn((5,4),costs)
        self.assertFalse(naval.passable(ship,'woods'))

    def test_diving_and_torpedo_bombers_have_different_finite_ship_attacks(self):
        for side,damage,capacity,reach in [('us',3,2,1),('de',4,1,2)]:
            with self.subTest(side=side):
                state=self.battle();state['turn']=side
                bomber=self.unit(state,side,'bomber');target=self.unit(state,'de' if side=='us' else 'us','carrier')
                bomber['pos']=[11,10];target['pos']=[12,10]
                self.assertEqual((bomber['bombs'],bomber['range']),(capacity,reach))
                shot=next(s for s in options(state,bomber)['targets'] if s['id']==target['id'])
                self.assertEqual(shot['damage'],damage)
                out=apply(state,side,dict(kind='fire',unit=bomber['id'],target=target['id']),roll=lambda:6)
                self.assertEqual(next(u for u in out['units'] if u['id']==target['id'])['hp'],6-damage)
                shooter=next(u for u in out['units'] if u['id']==bomber['id'])
                self.assertEqual(shooter['bombs'],capacity-1)
                shooter.update(bombs=0,ap=4)
                self.assertFalse(options(out,shooter)['targets'])
                fighter=self.unit(state,'us' if side=='de' else 'de','fighter')
                self.assertEqual(weapons.damage(bomber,fighter),0)

    def test_axis_torpedo_cruiser_salvos_and_no_air_target(self):
        state=self.battle();state['turn']='de';cruiser=self.unit(state,'de','cruiser');target=self.unit(state,'us','carrier')
        cruiser['pos']=[12,7];target['pos']=[12,10]
        legal=options(state,cruiser)
        self.assertTrue(any(t['id']==target['id'] for t in legal['torpedoes']))
        out=apply(state,'de',dict(kind='torpedo',unit=cruiser['id'],target=target['id']),roll=lambda:6)
        shooter=next(u for u in out['units'] if u['id']==cruiser['id']);shooter['ap']=4
        self.assertEqual(shooter['torpedoes'],2);self.assertFalse(options(out,shooter)['torpedoes'])
        plane=self.unit(state,'us','fighter');plane['pos']=target['pos'].copy()
        self.assertNotIn(plane['id'],[t['id'] for t in options(state,cruiser)['torpedoes']])

    def test_ship_aa_reacts_to_flight_and_never_to_surface_movement(self):
        state=self.battle();escort=self.unit(state,'us','cruiser');plane=self.unit(state,'de','bomber')
        escort.update(pos=[12,10],ap=4);plane.update(pos=[12,7],ap=3)
        state=apply(state,'us',dict(kind='overwatch',unit=escort['id']))
        self.assertEqual(next(u for u in state['units'] if u['id']==escort['id'])['ap'],2)
        state['turn']='de'
        out=apply(state,'de',dict(kind='move',unit=plane['id'],pos=[12,8]),roll=lambda:6)
        self.assertEqual(next(u for u in out['units'] if u['id']==plane['id'])['hp'],2)
        self.assertFalse(next(u for u in out['units'] if u['id']==escort['id'])['overwatch'])
        self.assertEqual(out['last_combat']['kind'],'AA interception')
        ship=self.unit(state,'de','destroyer');ship.update(pos=[11,10],ap=4)
        out=apply(state,'de',dict(kind='move',unit=ship['id'],pos=[11,11]),roll=lambda:6)
        self.assertEqual(next(u for u in out['units'] if u['id']==ship['id'])['hp'],ship['hp'])
        self.assertTrue(next(u for u in out['units'] if u['id']==escort['id'])['overwatch'])

    def test_carrier_service_uses_finite_owned_stores_and_saved_capacity(self):
        for side in ('us','de'):
            state=self.battle();state['turn']=side
            bomber=self.unit(state,side,'bomber');carrier=self.unit(state,side,'carrier')
            bomber.update(pos=carrier['pos'].copy(),hp=2,bombs=0,ap=4)
            self.assertTrue(options(state,bomber)['rearm'])
            out=apply(state,side,dict(kind='rearm',unit=bomber['id']))
            serviced=next(u for u in out['units'] if u['id']==bomber['id'])
            self.assertEqual((serviced['hp'],serviced['bombs'],serviced['ap']),(3,bomber['max_bombs'],2))
            self.assertEqual(next(u for u in out['units'] if u['id']==carrier['id'])['air_stores'],5)
            self.assertFalse(options(out,serviced)['rearm'])
            carrier['air_stores']=0;self.assertFalse(options(state,bomber)['rearm'])
            carrier.update(air_stores=6,hp=0);self.assertFalse(options(state,bomber)['rearm'])
            other=self.unit(state,side,'carrier','B');other['pos']=bomber['pos'].copy()
            self.assertFalse(options(state,bomber)['rearm'])
            self.assertFalse(options(state,other)['airstrikes'])

    def test_aircraft_do_not_capture_or_contest_sea_lanes_and_scoring_is_once(self):
        state=self.battle();point=state['battlefield']['joint_objectives'][0]['pos']
        ship=self.unit(state,'us','destroyer');ship['pos']=point.copy()
        plane=self.unit(state,'de','fighter');plane['pos']=point.copy()
        second=self.unit(state,'us','destroyer','B');second['pos']=[4,11]
        self.assertEqual(fubar.controls(state)[0]['owner'],'us')
        out=apply(state,'us',dict(kind='end'));self.assertEqual(out['joint_score']['us'],1)
        enemy=self.unit(state,'de','destroyer');enemy['pos']=[3,10]
        self.assertTrue(fubar.controls(state)[0]['contested'])
        self.assertEqual(apply(state,'us',dict(kind='end'))['joint_score']['us'],0)
        state['units']=[plane,self.unit(state,'us','fighter')]
        self.assertTrue(all(p['owner'] is None for p in fubar.controls(state)))

    def test_target_deadline_and_carrier_loss_are_operation_specific(self):
        state=self.battle();self.unit(state,'us','destroyer')['pos']=[4,10];state['joint_score']['us']=11
        self.assertEqual(apply(state,'us',dict(kind='end'))['winner'],'us')
        state=self.battle()
        for u in state['units']:
            if u['kind']=='carrier' and u['side']=='us':u['hp']=0
        self.assertIsNone(apply(state,'us',dict(kind='end'))['winner'])
        state.update(turn='de',round=18);state['joint_score']={'us':4,'de':3}
        self.assertEqual(apply(state,'de',dict(kind='end'))['winner'],'us')
        state['joint_score']={'us':4,'de':4}
        self.assertEqual(apply(state,'de',dict(kind='end'))['winner'],'de')

    def test_enemy_interception_readiness_is_private(self):
        state=self.battle();state['fog_of_war']=True
        escort=self.unit(state,'de','cruiser');escort.update(pos=[12,10],overwatch=True)
        self.unit(state,'us','fighter')['pos']=[12,9]
        projected=public_state(state,'us')
        seen=next(u for u in projected['units'] if u['id']==escort['id'])
        self.assertFalse(seen['overwatch']);self.assertTrue(escort['overwatch'])

    def test_bounded_computer_orders_for_both_mixed_armies(self):
        for side in ('us','de'):
            state=self.battle();state.update(turn=side,ai_side=side,fog_of_war=True)
            out=play_turn(state,roll=lambda:1,max_orders=2)
            self.assertGreater(out['revision'],0)
            self.assertTrue(all(u['ap']>=0 for u in out['units']))
            for u in out['units']:
                if active(u):self.assertFalse(domains.blocked(out,u,u['pos']))


class CrosswindCooperativeTests(unittest.TestCase):
    def test_four_players_own_mixed_platoons_and_finish_waits_for_each_teammate(self):
        with tempfile.TemporaryDirectory() as tmp:
            client=create_app(tmp+'/games.sqlite').test_client()
            host=client.post('/api/match',json=dict(scenario=MAP,ruleset='dsl',opponent='cooperative',side='us')).json
            url='/api/match/'+host['code']
            def headers(seat):return {'Authorization':'Bearer '+seat['token']}
            def get(seat):return client.get(url,headers=headers(seat)).json
            def act(seat,**body):
                return client.post(url,headers=headers(seat),json=dict(revision=get(seat)['revision'],**body))
            seats=[host]
            for side,group in [('us','B'),('de','A'),('de','B')]:
                response=client.post(url+'/join',json=dict(side=side,group=side+':'+group,player_name=side+group))
                self.assertEqual(response.status_code,200,response.json);seats.append(response.json)
            snapshot=get(host)
            self.assertEqual(snapshot['coop']['control_size'],'platoons')
            self.assertEqual(len(snapshot['coop']['groups']),4)
            for seat in seats:
                view=get(seat);own=set(view['coop']['controlled'])
                self.assertEqual(len(own),7)
                units=[u for u in view['units'] if u['id'] in own]
                self.assertEqual(sum(domains.is_air(u) for u in units),3)
                self.assertEqual(sum(u['kind'] in domains.SHIPS for u in units),4)
            started=client.post(url+'/cooperative',headers=headers(host),json=dict(operation='start',revision=get(host)['revision']))
            self.assertEqual(started.status_code,200,started.json)
            other=get(seats[1])['coop']['controlled'][0]
            self.assertEqual(act(host,kind='overwatch',unit=other).status_code,400)
            self.assertEqual(act(host,kind='end').json['turn'],'us')
            self.assertTrue(get(host)['coop']['done']);self.assertFalse(get(seats[1])['coop']['done'])
            self.assertEqual(act(seats[1],kind='end').json['turn'],'de')
            self.assertEqual(act(seats[2],kind='end').json['turn'],'de')
            result=act(seats[3],kind='end').json
            self.assertEqual((result['turn'],result['round']),('us',2))
            self.assertFalse(get(host)['coop']['done'])

    def test_solo_save_retains_new_profiles_and_finite_stores(self):
        with tempfile.TemporaryDirectory() as tmp:
            client=create_app(tmp+'/games.sqlite').test_client()
            seat=client.post('/api/match',json=dict(scenario=MAP,ruleset='dsl',opponent='computer')).json
            url='/api/match/'+seat['code'];headers={'Authorization':'Bearer '+seat['token']}
            before=client.get(url,headers=headers).json
            saved=client.post(url+'/save',headers=headers,json={'revision':before['revision']}).json
            restored=client.post('/api/restore',json={'code':saved['save_code']}).json
            after=client.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).json
            self.assertEqual(before['scenario'],after['scenario'])
            self.assertEqual(before['units'],after['units'])
            self.assertEqual(before['joint_score'],after['joint_score'])


if __name__=='__main__':unittest.main()
