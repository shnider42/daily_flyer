import concurrent.futures
import copy
import os
import tempfile
import unittest

from ww2_tactics.engine import initial, apply, options, distance, line_clear, fire_threshold
from ww2_web import create_app


class RulesTests(unittest.TestCase):
    def setUp(self):
        self.state = initial()
        self.state['ready'] = True

    def test_waiting_and_turn(self):
        with self.assertRaises(ValueError):
            apply(initial(), 'us', {'kind': 'end'})
        with self.assertRaises(ValueError):
            apply(self.state, 'de', {'kind': 'end'})

    def test_adjacent_hexes_and_distance_symmetry(self):
        self.assertEqual(distance([3, 4], [3, 5]), 1)
        self.assertEqual(distance([3, 4], [4, 5]), 2)
        for a in ([0, 0], [3, 4], [6, 8]):
            for b in ([0, 1], [4, 5], [6, 7]):
                self.assertEqual(distance(a, b), distance(b, a))

    def test_move_and_no_mutation(self):
        original = copy.deepcopy(self.state)
        result = apply(self.state, 'us', {'kind':'move','unit':'us0','pos':[1,7]})
        self.assertEqual(result['units'][0]['ap'], 1)
        self.assertEqual(self.state, original)
        with self.assertRaises(ValueError):
            apply(self.state, 'us', {'kind':'move','unit':'us0','pos':[6,0]})

    def test_occupied_and_enemy_control(self):
        for action in [{'kind':'move','unit':'us0','pos':[2,8]}, {'kind':'move','unit':'de0','pos':[1,1]}]:
            with self.assertRaises(ValueError):
                apply(self.state, 'us', action)

    def test_cover_move_cost(self):
        self.state['units'][0]['pos'] = [1,2]
        result = apply(self.state, 'us', {'kind':'move','unit':'us0','pos':[1,3]})
        self.assertEqual(result['units'][0]['ap'], 0)

    def test_line_of_sight(self):
        self.assertTrue(line_clear([0,4],[6,4]))
        self.assertFalse(line_clear([2,6],[2,2]))
        self.assertTrue(line_clear([2,6],[2,5]))

    def setup_shot(self):
        self.state['units'][0]['pos'] = [3,5]
        self.state['units'][5]['pos'] = [3,4]

    def test_hit_pin_rally_and_miss(self):
        self.setup_shot()
        shot = {'kind':'fire','unit':'us0','target':'de0'}
        missed = apply(self.state,'us',shot,roll=lambda:1)
        self.assertEqual(missed['units'][5]['hp'],3)
        hit = apply(self.state,'us',shot,roll=lambda:6)
        self.assertEqual(hit['units'][5]['hp'],2)
        self.assertTrue(hit['units'][5]['pinned'])
        hit = apply(hit,'us',{'kind':'end'})
        self.assertEqual(options(hit,hit['units'][5])['moves'], [])
        rallied = apply(hit,'de',{'kind':'rally','unit':'de0'})
        self.assertFalse(rallied['units'][5]['pinned'])
        self.assertEqual(rallied['units'][5]['ap'],1)

    def test_threshold_and_ranges(self):
        self.setup_shot()
        self.assertEqual(fire_threshold(self.state,self.state['units'][0],self.state['units'][5]),5)
        self.state['units'][1]['pos']=[3,6]
        self.assertEqual(fire_threshold(self.state,self.state['units'][0],self.state['units'][5]),4)
        self.state['units'][5]['pos']=[3,0]
        self.assertEqual(options(self.state,self.state['units'][0])['targets'],[])

    def test_objective_and_hold_interruption(self):
        self.state['units'][0]['pos']=[3,4]
        state=apply(self.state,'us',{'kind':'end'})
        self.assertEqual(state['hold'],1)
        state=apply(state,'de',{'kind':'end'})
        won=apply(state,'us',{'kind':'end'})
        self.assertEqual(won['winner'],'us')
        moved=apply(state,'us',{'kind':'move','unit':'us0','pos':[3,5]})
        self.assertEqual(moved['hold'],0)
        with self.assertRaises(ValueError):
            apply(won,'de',{'kind':'end'})

    def test_german_time_win(self):
        state=self.state
        for _ in range(8):
            state=apply(state,'us',{'kind':'end'})
            state=apply(state,'de',{'kind':'end'})
        self.assertEqual(state['winner'],'de')

    def test_elimination(self):
        self.setup_shot()
        for u in self.state['units'][5:]: u['hp']=0
        self.state['units'][5]['hp']=1
        result=apply(self.state,'us',{'kind':'fire','unit':'us0','target':'de0'},roll=lambda:6)
        self.assertEqual(result['winner'],'us')


class APITests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=os.path.join(self.tmp.name,'match.sqlite3')
        self.app=create_app(self.path)
        self.client=self.app.test_client()
        self.host=self.client.post('/api/match',json={}).get_json()
        self.url='/api/match/'+self.host['code']
        self.auth={'Authorization':'Bearer '+self.host['token']}

    def tearDown(self): self.tmp.cleanup()

    def join(self):
        return self.client.post(self.url+'/join',json={}).get_json()

    def test_pages_and_private_state(self):
        with self.client.get('/') as response:
            self.assertEqual(response.status_code,200)
        with self.client.get('/assets/game.js') as response:
            self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.get('/healthz').status_code,200)
        self.assertEqual(self.client.get(self.url).status_code,403)
        state=self.client.get(self.url,headers=self.auth).get_json()
        self.assertNotIn('token',state)
        self.assertNotIn('host',state)
        self.assertEqual(state['side'],'us')

    def test_single_slot_seat_and_join(self):
        self.assertEqual(self.client.post('/api/match',json={}).status_code,409)
        self.assertEqual(self.client.post(self.url+'/join',json={},headers=self.auth).status_code,409)
        guest=self.join()
        self.assertEqual(self.client.post(self.url+'/join',json={}).status_code,409)
        state=self.client.get(self.url,headers={'Authorization':'Bearer '+guest['token']}).get_json()
        self.assertEqual(state['side'],'de')
        self.assertTrue(state['ready'])

    def test_stale_and_duplicate_actions(self):
        self.join()
        body={'kind':'end','revision':1}
        self.assertEqual(self.client.post(self.url,json=body,headers=self.auth).status_code,200)
        self.assertEqual(self.client.post(self.url,json=body,headers=self.auth).status_code,409)
        self.assertEqual(self.client.post(self.url,json={'kind':'end','revision':2},headers=self.auth).status_code,400)

    def test_persistence_and_reset(self):
        guest=self.join()
        second=create_app(self.path).test_client()
        self.assertTrue(second.get(self.url,headers=self.auth).get_json()['ready'])
        self.assertEqual(second.post(self.url+'/reset',json={},headers={'Authorization':'Bearer '+guest['token']}).status_code,403)
        new=second.post(self.url+'/reset',json={},headers=self.auth).get_json()
        self.assertNotEqual(new['code'],self.host['code'])
        self.assertEqual(second.get(self.url,headers=self.auth).status_code,404)

    def test_concurrent_join_and_move(self):
        def join(_):
            return self.app.test_client().post(self.url+'/join',json={}).status_code
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(join,range(2))),[200,409])
        def move(_):
            return self.app.test_client().post(self.url,json={'kind':'move','unit':'us0','pos':[1,7],'revision':1},headers=self.auth).status_code
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(move,range(2))),[200,409])

    def test_invalid_payloads(self):
        self.join()
        self.assertEqual(self.client.post(self.url,json=[],headers=self.auth).status_code,400)
        self.assertEqual(self.client.post(self.url,json={'kind':'end','revision':True},headers=self.auth).status_code,409)
        self.assertEqual(self.client.post(self.url,json={'revision':1,'kind':'fire','unit':{}},headers=self.auth).status_code,400)


if __name__=='__main__': unittest.main()
