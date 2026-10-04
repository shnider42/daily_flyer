import copy
import json
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import cooperative, computer_policy, deployment
from ww2_tactics.engine import initial
from ww2_tactics.scenarios import SCENARIOS
from ww2_tactics.computer import play_turn


class CooperativeAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = self.tmp.name + '/games.db'
        self.client = create_app(self.path).test_client()

    def tearDown(self):
        self.tmp.cleanup()

    def create(self, **settings):
        response = self.client.post('/api/match', json=dict(opponent='cooperative', ruleset='dsl', scenario='village', **settings))
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def headers(self, seat):
        return {'Authorization': 'Bearer ' + seat['token']}

    def get(self, seat):
        r = self.client.get('/api/match/' + seat['code'], headers=self.headers(seat))
        self.assertEqual(r.status_code, 200, r.json)
        return r.json

    def setup(self, seat, operation, status=200, **body):
        r = self.client.post('/api/match/' + seat['code'] + '/cooperative', headers=self.headers(seat),
            json=dict(operation=operation, revision=self.get(seat)['revision'], **body))
        self.assertEqual(r.status_code, status, r.json)
        return r.json

    def act(self, seat, kind, status=200, **body):
        r = self.client.post('/api/match/' + seat['code'], headers=self.headers(seat),
            json=dict(kind=kind, revision=self.get(seat)['revision'], **body))
        self.assertEqual(r.status_code, status, r.json)
        return r.json

    def join(self, host, side='us', **extra):
        s = self.get(host)
        group = next(g for g in s['coop']['groups'] if g['side'] == side and not g['owner'] and not g['command'])
        r = self.client.post('/api/match/' + host['code'] + '/join', json=dict(side=side, group=group['id'], player_name='Friend', **extra))
        self.assertEqual(r.status_code, 200, r.json)
        return r.json

    def raw(self, seat):
        with sqlite3.connect(self.path) as db:
            return json.loads(db.execute('SELECT state FROM match WHERE code=?', (seat['code'],)).fetchone()[0])

    def write(self, seat, state):
        with sqlite3.connect(self.path) as db:
            db.execute('UPDATE match SET state=? WHERE code=?', (json.dumps(state), seat['code']))

    def test_host_start_claim_collision_and_late_join(self):
        host = self.create(); ally = self.join(host); enemy = self.join(host, 'de')
        self.assertFalse(self.get(host)['ready'])
        self.setup(ally, 'start', status=400)
        self.act(host, 'move', status=400, unit='us0', pos=[1, 7])
        occupied = self.get(host)['coop']['players'][0]['group']
        self.setup(ally, 'claim', status=400, side='us', group=occupied)
        started = self.setup(host, 'start')
        self.assertTrue(started['ready'])
        self.setup(host, 'start', status=400)
        self.setup(ally, 'claim', status=400, side='de', group=occupied)
        self.assertEqual(self.client.post('/api/match/'+host['code']+'/join', json={}).status_code, 409)
        for seat in (host, ally, enemy):
            r = self.client.post('/api/match/'+seat['code']+'/join', headers=self.headers(seat), json={})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(self.get(r.json)['coop']['me'], self.get(seat)['coop']['me'])

    def test_players_cannot_order_teammates_or_computers(self):
        host = self.create(); ally = self.join(host); self.setup(host, 'start')
        s = self.get(host); own = s['coop']['controlled'][0]
        other = self.get(ally)['coop']['controlled'][0]
        ai = next(uid for uid, owner in s['coop']['controllers'].items() if owner is None)
        for uid in (other, ai, 'de0'):
            self.act(host, 'dig', status=400, unit=uid)
            if uid in s['legal']:
                self.assertFalse(s['legal'][uid]['moves'])
        self.act(host, 'dig', unit=own)
        self.act(host, 'undo', status=400)
        self.act(ally, 'resign', status=400)
        self.assertFalse(self.get(ally)['coop']['captain'])
        self.assertTrue(self.get(host)['coop']['captain'])

    def test_finish_waits_for_teammates_then_both_computer_armies(self):
        host = self.create(); ally = self.join(host); self.setup(host, 'start')
        s = self.act(host, 'end')
        self.assertEqual((s['turn'], s['round']), ('us', 1))
        self.assertTrue(s['coop']['done'])
        self.assertNotIn('computer_playback', s)
        self.act(host, 'dig', status=400, unit=s['coop']['controlled'][0])
        human_ids = set(self.get(ally)['coop']['controlled'] + s['coop']['controlled'])
        before = {u['id']: u['pos'] for u in s['units'] if u['id'] in human_ids}
        s = self.act(ally, 'end')
        self.assertEqual((s['turn'], s['round']), ('us', 2))
        self.assertFalse(s['coop']['done'])
        self.assertTrue(s['computer_playback']['frames'])
        self.assertFalse(any(f['action'].get('unit') in human_ids for f in s['computer_playback']['frames']))
        self.assertEqual(before, {u['id']: u['pos'] for u in s['units'] if u['id'] in human_ids})
        self.assertEqual(self.get(ally), s)

    def test_humans_on_both_sides_get_their_turn(self):
        host = self.create(); enemy = self.join(host, 'de'); self.setup(host, 'start')
        self.act(enemy, 'dig', status=400, unit=self.get(enemy)['coop']['controlled'][0])
        s = self.act(host, 'end'); self.assertEqual((s['turn'], s['round']), ('de', 1))
        self.assertFalse(self.get(enemy)['coop']['done'])
        s = self.act(enemy, 'end'); self.assertEqual((s['turn'], s['round']), ('us', 2))

    def test_host_commander_and_rosters_preserved_on_every_map(self):
        for key in SCENARIOS:
            for size in ('units', 'platoons'):
                state = initial(key, 'dsl'); old = copy.deepcopy(state['units'])
                cooperative.initialize(state, {'control_size': size, 'side': 'de'}, 'host', 'Host')
                self.assertEqual(old, state['units'], key)
                groups = state['coop']['groups']
                assigned = [uid for g in groups.values() for uid in g['units']]
                self.assertEqual(sorted(assigned), sorted(u['id'] for u in old), key)
                self.assertEqual(len(assigned), len(set(assigned)), key)
                own = cooperative.controlled(state, 'host')
                self.assertTrue(all(u['id'] in own for u in old if u['side']=='de' and u['kind']=='commander'), key)
                for u in old:
                    if u.get('carrier_id'):
                        self.assertIs(cooperative.group_for(state, u['id']), cooperative.group_for(state, u['carrier_id']), key)
                    if u.get('airlift_reserve'):
                        self.assertTrue(cooperative.group_for(state, u['id'])['command'], key)

    def test_host_switches_army_and_keeps_new_commander(self):
        r = self.client.post('/api/match', json={'opponent':'cooperative','ruleset':'dsl','scenario':'relay_crossing','control_size':'platoons'})
        host=r.json;before=self.get(host)
        group=next(g for g in before['coop']['groups'] if g['side']=='de' and not g['command'])
        s=self.setup(host,'claim',side='de',group=group['id'])
        self.assertEqual(s['side'],'de')
        self.assertTrue(all(u['side']=='de' for u in s['units'] if u['id'] in s['coop']['controlled']))
        self.assertTrue(any(u['kind']=='commander' for u in s['units'] if u['id'] in s['coop']['controlled']))

    def test_difficulties_are_host_only_and_fixed_at_start(self):
        host = self.create(); ally = self.join(host)
        self.setup(ally, 'difficulty', status=400, difficulty='easy')
        self.setup(host, 'difficulty', status=400, difficulty='impossible')
        s=self.setup(host,'difficulty',difficulty='easy')
        self.assertTrue(all(g['difficulty']=='easy' for g in s['coop']['groups'] if not g['owner']))
        g=next(g for g in s['coop']['groups'] if not g['owner'])
        s=self.setup(host,'difficulty',group=g['id'],difficulty='standard')
        self.assertEqual(next(v for v in s['coop']['groups'] if v['id']==g['id'])['difficulty'],'standard')
        self.setup(host,'start');self.setup(host,'difficulty',status=400,difficulty='easy')

    def test_stale_orders_and_start_do_not_replay_or_skip_turns(self):
        host=self.create();revision=self.get(host)['revision'];self.setup(host,'start')
        for route,body in [('',{'kind':'end'}),('/cooperative',{'operation':'start'})]:
            r=self.client.post('/api/match/'+host['code']+route,headers=self.headers(host),json=dict(revision=revision,**body))
            self.assertEqual(r.status_code,409)
        before=self.raw(host)
        for _ in range(3):self.get(host)
        self.assertEqual(before,self.raw(host))

    def test_transfer_and_commander_recovery_use_individual_owner(self):
        host=self.create();ally=self.join(host)
        account=self.client.post('/api/commander/register',json={'name':'CoopFriend','password':'local-test-pass-123'}).json
        headers=dict(self.headers(ally),**{'X-Commander-Token':account['token']})
        url='/api/match/'+host['code']
        self.assertEqual(self.client.post(url+'/link',headers=headers,json={}).status_code,200)
        lobby=self.client.get('/api/lobby?mine=1',headers={'X-Commander-Token':account['token']}).json
        self.assertEqual(lobby['games'][0]['your_side'],'us')
        restored=self.client.post(url+'/resume',headers={'X-Commander-Token':account['token']}).json
        self.assertEqual(self.get(restored)['coop']['me'],self.get(ally)['coop']['me'])
        ticket=self.client.post(url+'/transfer',headers=self.headers(ally)).json['transfer_code']
        transferred=self.client.post('/api/transfer',json={'code':ticket}).json
        self.assertEqual(self.get(transferred)['coop']['me'],self.get(ally)['coop']['me'])
        self.assertNotEqual(self.get(transferred)['coop']['me'],self.get(host)['coop']['me'])
        self.assertEqual(self.client.post('/api/transfer',json={'code':ticket}).status_code,400)

    def test_handoff_recovers_waiting_army_without_changing_host_control(self):
        host=self.create();ally=self.join(host);self.setup(host,'start');self.act(host,'end')
        pid=self.get(ally)['coop']['me'];s=self.setup(host,'handoff',player=pid)
        self.assertEqual((s['turn'],s['round']),('us',2))
        self.assertFalse(self.get(ally)['coop']['controlled'])
        self.assertTrue(s['coop']['controlled'])
        self.setup(ally,'handoff',status=400,player=s['coop']['me'])
        self.act(ally,'end',status=400)

    def test_prebattle_is_private_and_locks_only_after_all_teammates(self):
        host=self.client.post('/api/match',json={'opponent':'cooperative','ruleset':'dsl','scenario':'shingle_cove','side':'de'}).json
        ally=self.join(host,'de');s=self.get(host)
        self.act(host,'deploy_lock',status=400)
        s=self.setup(host,'start')
        self.assertTrue(s['deployment']['locked']['us'])
        self.assertTrue(all(u['side']=='de' for u in s['units']))
        self.act(ally,'deploy_bunker',status=400,pos=s['deployment']['bunker_zone'][0])
        self.act(host,'deploy_bunker',pos=s['deployment']['bunker_zone'][0])
        self.act(ally,'deploy_unit',status=400,unit=s['coop']['controlled'][0],pos=s['deployment']['zone'][0])
        self.act(host,'deploy_reset',status=400)
        s=self.act(host,'deploy_lock');self.assertEqual(s['deployment']['phase'],'planning')
        s=self.act(ally,'deploy_lock');self.assertEqual(s['deployment']['phase'],'battle')
        self.assertEqual(s['turn'],'de')
        self.assertFalse(s['coop']['done'])

    def test_two_view_replay_does_not_expose_enemy_contacts_or_private_state(self):
        host=self.client.post('/api/match',json={'opponent':'cooperative','ruleset':'dsl','scenario':'relay_crossing'}).json
        enemy=self.join(host,'de');self.setup(host,'start');s=self.act(host,'end')
        for seat in (host,enemy):
            result=self.get(seat)
            self.assertNotIn('_coop_replays',result)
            self.assertNotIn('ai_side',result)
            for g in result['coop']['groups']:self.assertNotIn('units',g)
            for frame in result['computer_playback']['frames']:
                seen={u['id'] for snap in ('before','after') for u in frame[snap]['units']}
                for key in ('unit','target'):
                    if key in frame['action']:self.assertIn(frame['action'][key],seen)
                for snap in ('before','after'):
                    self.assertNotIn('coop',frame[snap]);self.assertNotIn('owner_hash',frame[snap])
            for private in ('owner_hash','_coop_replays','player_access'):
                self.assertNotIn(private,json.dumps(result))
        before=self.raw(host)
        self.assertEqual(self.client.get('/api/match/'+host['code']).status_code,403)
        self.assertEqual(before,self.raw(host))

    def test_shared_games_cannot_be_reset_saved_or_rematched_as_two_seat_games(self):
        host=self.create();self.setup(host,'start');url='/api/match/'+host['code']
        for suffix,body in [('/reset',{}),('/save',{}),('/rematch',{'operation':'propose'})]:
            self.assertEqual(self.client.post(url+suffix,headers=self.headers(host),json=body).status_code,400)
        self.assertTrue(self.get(host)['coop'])

    def test_standard_policy_unchanged_easy_is_reproducible_without_combat_rolls(self):
        s=initial('village','dsl')
        choices=[(8,dict(unit='us2',kind='fire',target='de1')),(7,dict(unit='us2',kind='move',pos=[2,7])),(9,dict(unit='us2',kind='suppress',target='de2'))]
        self.assertEqual(computer_policy.choose(s,choices,1.5),choices[2][1])
        cooperative.initialize(s,{},'host','Host')
        self.assertEqual(computer_policy.choose(s,choices,1.5),choices[2][1])
        cooperative.group_for(s,'us2')['difficulty']='easy'
        outcomes=set()
        with patch('secrets.randbelow',side_effect=AssertionError('Difficulty must not consume combat dice')):
            for revision in range(30):
                s['revision']=revision
                action=computer_policy.choose(s,choices,1.5)
                self.assertEqual(action,computer_policy.choose(s,choices,1.5))
                outcomes.add(action['kind'])
        self.assertGreater(len(outcomes),1)

    def test_air_naval_and_ground_computers_respect_human_units(self):
        for scenario in ('village','midway','britain'):
            s=initial(scenario,'dsl');cooperative.initialize(s,{},'host','Host')
            s.update(ready=True,ai_side='us');s['coop']['phase']='battle'
            own=cooperative.controlled(s,'host');before={u['id']:u['pos'] for u in s['units'] if u['id'] in own}
            result=play_turn(s,roll=lambda:4,observers=('us','de'))
            self.assertEqual(before,{u['id']:u['pos'] for u in result['units'] if u['id'] in own},scenario)
            self.assertFalse(any(f['action'].get('unit') in own for f in result['_coop_replays']['us']['frames']),scenario)

    def test_transport_requires_the_troop_owners_explicit_permission(self):
        host=self.client.post('/api/match',json={'opponent':'cooperative','ruleset':'dsl','scenario':'dunkirk'}).json
        s=self.get(host)
        boat=next(u for u in s['units'] if u['side']=='us' and u['kind']=='landing_craft')
        boat_group=next(g for g in self.raw(host)['coop']['groups'].values() if boat['id'] in g['units'])
        ally=self.client.post('/api/match/'+host['code']+'/join',json={'side':'us','group':boat_group['id'],'player_name':'Boat crew'}).json
        self.setup(host,'start')
        raw=self.raw(host);troop=next(u for u in raw['units'] if u['id'] in cooperative.controlled(raw,raw['coop']['host']) and u.get('evacuee'))
        troop['pos']=[3,4];troop['ap']=3;troop['pinned']=False;boat=next(u for u in raw['units'] if u['id']==boat['id']);boat['pos']=[3,3]
        self.write(host,raw)
        self.act(ally,'load',status=400,unit=boat['id'],target=troop['id'])
        self.assertNotIn(troop['id'],self.get(ally)['legal'][boat['id']]['load'])
        self.setup(host,'transport',allow=True)
        self.assertIn(troop['id'],self.get(ally)['legal'][boat['id']]['load'])
        self.act(ally,'load',unit=boat['id'],target=troop['id'])
        self.setup(host,'transport',status=400,allow=False)
        s=self.get(ally);destination=s['legal'][boat['id']]['unload'][0]['pos']
        self.act(ally,'unload',unit=boat['id'],pos=destination)
        self.setup(host,'transport',allow=False)
        self.assertIn(troop['id'],self.get(host)['coop']['controlled'])

    def test_concurrent_claims_cannot_share_or_steal_a_group(self):
        host=self.create();s=self.get(host);group=next(g for g in s['coop']['groups'] if g['side']=='us' and not g['owner'])
        app=create_app(self.path);barrier=Barrier(2)
        def enter(name):
            with app.test_client() as c:
                barrier.wait()
                return c.post('/api/match/'+host['code']+'/join',json={'side':'us','group':group['id'],'player_name':name}).status_code
        with ThreadPoolExecutor(max_workers=2) as workers:
            results=list(workers.map(enter,['First player','Second player']))
        self.assertEqual(sorted(results),[200,400])
        self.assertEqual(len(self.get(host)['coop']['players']),2)

    def test_dead_human_commands_cannot_stall_the_computer_battle(self):
        host=self.create();self.setup(host,'start');raw=self.raw(host)
        own=cooperative.controlled(raw,raw['coop']['host'])
        for u in raw['units']:
            if u['id'] in own:u['hp']=0
        self.write(host,raw)
        self.assertTrue(self.get(host)['coop']['needs_advance'])
        s=self.setup(host,'advance')
        self.assertTrue(s['round']>1 or s['winner'])
        self.assertLessEqual(s['round'],2)

    def test_computer_batches_preserve_orders_visited_hexes_and_turn_end(self):
        state=initial('village','dsl');cooperative.initialize(state,{},'host','Host')
        state.update(ready=True,ai_side='us');state['coop']['phase']='battle'
        full=play_turn(state,roll=lambda:4,observers=('us','de'))
        chunked=copy.deepcopy(state);frames=[];batches=0
        while chunked['turn']=='us' and not chunked['winner']:
            before=chunked['revision']
            chunked=play_turn(chunked,roll=lambda:4,observers=('us','de'),max_orders=2)
            self.assertLessEqual(chunked['revision']-before,3)
            frames.extend(chunked['_coop_replays']['us']['frames']);batches+=1
            self.assertLess(batches,30)
        self.assertGreater(batches,1)
        self.assertEqual(chunked['units'],full['units'])
        self.assertEqual(chunked['action_history'],full['action_history'])
        self.assertEqual(frames,full['_coop_replays']['us']['frames'])
        self.assertNotIn('ai_progress',chunked['coop'])


if __name__ == '__main__':
    unittest.main()
