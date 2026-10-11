"""Scale regressions: bounded presentation, durable jobs and accepted orders."""
import concurrent.futures
import copy
import json
import os
import random
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import pipeline, jobs
from ww2_tactics.computer import play_turn, objective_costs, choose_order
from ww2_tactics.engine import initial, apply


class CodecTests(unittest.TestCase):
    def test_planner_keeps_free_road_leg_after_last_paid_action(self):
        from ww2_tactics.engine import options
        state=initial('village','dsl');state.update(ready=True,ai_side='us')
        state['battlefield']['map']=[['field']*7 for _ in range(9)]
        for x in range(1,6):state['battlefield']['map'][3][x]='road'
        for unit in state['units']:
            if unit['side']=='us':unit['ap']=0
        state['units'][0].update(pos=[1,3],ap=1)
        state=apply(state,'us',dict(kind='move',unit='us0',pos=[2,3]))
        self.assertEqual(state['units'][0]['ap'],0)
        action=choose_order(state,objective_costs(state),{'us0':{(1,3),(2,3)}})
        self.assertEqual(action,dict(kind='move',unit='us0',pos=[3,3]))
        self.assertEqual(next(m['cost'] for m in options(state,state['units'][0])['moves'] if m['pos']==action['pos']),0)
        after=apply(state,'us',action)
        self.assertEqual(after['units'][0]['ap'],0)
        self.assertTrue(after['units'][0]['road_used'])

    def test_changes_roundtrip_with_masks_rosters_additions_and_deletions(self):
        rng = random.Random(41)
        for _ in range(100):
            old = dict(units=[dict(id='u'+str(i), ap=rng.randrange(4), pos=[i, 0]) for i in range(6)],
                       visible_hexes=[[i, 0] for i in range(5)], visible_air_hexes=[[i, 1] for i in range(8)],
                       legal={'u1': {'moves': [[1, 2], [2, 2]], 'dig': True}}, gone=1)
            new = copy.deepcopy(old)
            new.pop('gone'); new['created'] = {'x': 1}
            new['units'][2]['ap'] = 0; new['units'].pop(1); new['units'].append(dict(id='new', ap=3, pos=[2, 2]))
            new['visible_hexes'] = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]
            new['visible_air_hexes'].pop(); new['legal']['u1']['moves'][0] = [3, 3]
            original = copy.deepcopy(old)
            self.assertEqual(pipeline.patch(old, pipeline.changes(old, new)), new)
            self.assertEqual(old, original)

    def test_unchanged_huge_map_is_not_in_delta(self):
        old = dict(map=[['woods']*64 for _ in range(56)], units=[dict(id='a', ap=3, pos=[1, 1])])
        new = copy.deepcopy(old); new['units'][0].update(ap=2, pos=[2, 1])
        delta = pipeline.dumps(pipeline.changes(old, new))
        self.assertLess(len(delta), 120)
        self.assertNotIn('woods', delta)

    def test_replays_are_paged_exact_and_much_smaller_than_snapshots(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(os.path.join(tmp, 'game.sqlite'))
            with sqlite3.connect(os.path.join(tmp, 'game.sqlite')) as db:
                db.row_factory = sqlite3.Row
                frames = []
                snap = dict(units=[dict(id='u', pos=[0, 0], ap=100)],
                            visible_hexes=[[x, y] for y in range(56) for x in range(64)],
                            round=1, turn='us', winner=None)
                for i in range(40):
                    before = copy.deepcopy(snap); snap['units'][0]['ap'] -= 1
                    frames.append(dict(before=before, after=copy.deepcopy(snap), action=dict(kind='dig',unit='u'),
                                       effects=[], combat=[{'dice': [i % 6 + 1]}]))
                movie = pipeline.store_movie(db, 'local', 'us', dict(id=1, frames=frames))
                encoded = sum(r[0] for r in db.execute('SELECT length(checkpoint)+length(event) FROM ww2_replay_events WHERE checkpoint IS NOT NULL'))
                encoded += sum(r[0] for r in db.execute('SELECT length(event) FROM ww2_replay_events WHERE checkpoint IS NULL'))
                self.assertLess(encoded, len(pipeline.dumps(frames)) / 50)
                decoded = []
                for start in range(0, 40, pipeline.PAGE):
                    page = pipeline.read_page(db, 'local', movie, start)
                    self.assertLessEqual(len(page['events']), pipeline.PAGE)
                    snap = page['checkpoint']
                    for e in page['events']:
                        before = pipeline.patch(snap, e['before_patch']); after = pipeline.patch(before, e['after_patch'])
                        decoded.append({k:v for k,v in e.items() if k not in ('before_patch','after_patch')} |
                                       dict(before=before,after=after))
                        snap = after
                self.assertEqual(decoded, frames)
                self.assertTrue(pipeline.original_movie(db, 'local', movie)['update_required'])

    def test_path_plans_reused_but_rebuilt_when_known_terrain_changes(self):
        state = initial('village', 'dsl'); state.update(ready=True, ai_side='us')
        planning = {}
        with patch('ww2_tactics.computer.objective_costs', wraps=objective_costs) as costs:
            first = play_turn(state, max_orders=1, roll=lambda: 4, planning=planning)
            count = costs.call_count
            play_turn(first, max_orders=1, roll=lambda: 4, planning=planning)
            self.assertEqual(costs.call_count, count)
            terrain_changed = copy.deepcopy(first)
            terrain_changed['fieldworks']['1,7'] = 'road'
            terrain_changed['fieldworks_intel']['us']['1,7'] = 'road'
            play_turn(terrain_changed, max_orders=1, roll=lambda: 4, planning=planning)
            self.assertGreater(costs.call_count, count)
            count = costs.call_count
            # A different turn invalidates the same process-local plan.
            changed = dict(first, turn='de', ai_side='de')
            play_turn(changed, max_orders=1, roll=lambda: 4, planning=planning)
            self.assertGreater(costs.call_count, count)

    def test_bounded_solo_matches_uninterrupted_rule_outcomes(self):
        state = initial('village', 'dsl'); state.update(ready=True, ai_side='us')
        full = play_turn(state, roll=lambda: 4)
        bounded, planning = state, {}
        for _ in range(60):
            bounded = play_turn(bounded, roll=lambda: 4, max_orders=2, planning=planning)
            if bounded['turn'] != state['turn'] or bounded['winner']: break
        for key in ('units','turn','round','winner','hold','revision','combat_history','intel'):
            if key in full: self.assertEqual(bounded[key], full[key], key)

    def test_reusing_same_revision_before_view_keeps_all_replay_frames_exact(self):
        from ww2_tactics.visibility import view
        state = initial('current:village','dsl'); state.update(ready=True,ai_side='us')
        full = play_turn(state,observers=('us','de'),roll=lambda:4)
        bounded, planning, prior = state, {}, None
        frames = {'us':[], 'de':[]}
        for _ in range(60):
            bounded = play_turn(bounded, observers=('us','de'), max_orders=2, planning=planning,previous_views=prior,roll=lambda:4)
            for side in frames:
                frames[side].extend(bounded['_coop_replays'][side]['frames'])
            prior = {side:view(bounded,side) for side in frames}
            if bounded['turn'] != state['turn'] or bounded['winner']:break
        for side in frames:self.assertEqual(frames[side],full['_coop_replays'][side]['frames'])


class PipelineAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'game.sqlite')
        self.app = create_app(self.path, background_ai=True, start_worker=False)
        self.app.testing = True
        self.client = self.app.test_client()
        self.host = self.client.post('/api/match', json={'opponent':'computer','ruleset':'dsl'}).json
        self.code, self.url = self.host['code'], '/api/match/' + self.host['code']
        self.auth = {'Authorization':'Bearer '+self.host['token'],'X-WW2-Protocol':'2'}
        self.queue = self.app.extensions['ww2_computer_queue']

    def tearDown(self):
        self.queue.stop()
        self.tmp.cleanup()

    def db(self):
        db = sqlite3.connect(self.path); db.row_factory = sqlite3.Row
        return db

    def raw(self):
        with self.db() as db: return json.loads(db.execute('SELECT state FROM match WHERE code=?',(self.code,)).fetchone()[0])

    def get(self, source=None):
        headers = dict(self.auth)
        if source: headers['X-WW2-State'] = source['_transport']['hash']
        response = self.client.get(self.url, headers=headers)
        self.assertEqual(response.status_code, 200, response.json)
        data = response.json
        if data.get('delta'):
            result = pipeline.patch({k:v for k,v in source.items() if k != '_transport'}, data['changes'])
            result['_transport'] = data['_transport']; return result
        return data

    def act(self, body, source=None):
        if source is None: source = self.get()
        headers = dict(self.auth, **{'X-WW2-State':source['_transport']['hash']})
        return self.client.post(self.url, headers=headers, json={'revision':source['revision'],**body})

    def finish(self):
        response = self.act(dict(kind='end', command_id='finish-orders-unique'))
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(self.raw()['turn'], 'de')
        return response

    def drain(self):
        for _ in range(80):
            if not self.queue.work_once(): break
        self.assertFalse(jobs.needed(self.raw()))

    def test_move_is_a_small_delta_and_unchanged_poll_does_not_decode_state(self):
        state = self.get()
        response = self.act(dict(kind='move',unit='us0',pos=[1,7]), state)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['delta'])
        self.assertLess(len(response.data), 2500)
        reconstructed = pipeline.patch({k:v for k,v in state.items() if k != '_transport'}, response.json['changes'])
        full = self.get(); full.pop('_transport')
        self.assertEqual(reconstructed, full)
        with patch('ww2_web.json.loads', side_effect=AssertionError('An unchanged poll must not decode a match')):
            unchanged = self.client.get(self.url+'?since=1', headers=self.auth)
        self.assertEqual(unchanged.status_code, 200)
        self.assertTrue(unchanged.json['unchanged'])

    def test_unknown_or_other_owner_hash_gets_a_fresh_snapshot(self):
        state = self.get()
        h = dict(self.auth, **{'X-WW2-State':'not-a-view'})
        self.assertNotIn('delta', self.client.get(self.url, headers=h).json)
        with self.db() as db:
            db.execute('UPDATE ww2_public_views SET owner=? WHERE code=?', ('other-owner', self.code))
        h['X-WW2-State'] = state['_transport']['hash']
        self.assertNotIn('delta', self.client.get(self.url, headers=h).json)
        self.assertEqual(self.client.get(self.url, headers={'X-WW2-State':state['_transport']['hash']}).status_code,403)

    def test_lost_ack_retry_does_not_apply_or_roll_twice(self):
        state = self.get(); body = dict(kind='dig',unit='us0',command_id='same-accepted-order',revision=state['revision'])
        first = self.client.post(self.url, headers=self.auth, json=body)
        self.assertEqual(first.status_code,200); before = self.raw()
        with patch('ww2_web.perform', side_effect=AssertionError('Duplicate command must not execute')):
            second = self.client.post(self.url, headers=self.auth, json=body)
        self.assertEqual(second.status_code,200)
        self.assertEqual(self.raw(), before)
        changed = self.client.post(self.url, headers=self.auth, json=dict(body,kind='move',pos=[1,7]))
        self.assertEqual(changed.status_code,400)

    def test_racing_move_commands_have_one_commit(self):
        def move(i):
            return self.app.test_client().post(self.url, headers=self.auth,
                json=dict(kind='move',unit='us0',pos=[1,7],revision=0,command_id='racing-command-'+str(i))).status_code
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(move,range(2))),[200,409])
        self.assertEqual(self.raw()['revision'],1)

    def test_public_projection_runs_after_gameplay_writer_commit(self):
        import ww2_web
        original = ww2_web.public_state
        def projection(state, side):
            other = self.db(); other.execute('BEGIN IMMEDIATE'); other.rollback(); other.close()
            return original(state,side)
        with patch('ww2_web.public_state',side_effect=projection):
            self.assertEqual(self.act(dict(kind='dig',unit='us0')).status_code,200)

    def test_response_failure_keeps_accepted_command_and_retry_reconciles(self):
        state = self.get(); body = dict(kind='dig',unit='us0',revision=0,command_id='lost-response-order')
        self.app.testing = False
        with patch('ww2_web.public_state', side_effect=RuntimeError('Injected lost ACK')), self.assertLogs(self.app.logger):
            response = self.client.post(self.url,headers=self.auth,json=body)
        self.assertEqual(response.status_code,500); self.assertEqual(self.raw()['revision'],1)
        self.assertEqual(self.client.post(self.url,headers=self.auth,json=body).status_code,200)
        self.assertEqual(self.raw()['revision'],1)

    def test_ai_advances_without_any_client_requests(self):
        self.finish(); self.drain()
        self.assertEqual(self.raw()['turn'],'us'); self.assertEqual(self.raw()['round'],2)
        view = self.get()
        self.assertFalse(view['computer_work']['pending'])
        self.assertNotIn('_ai_progress',view)
        self.assertEqual(view['computer_playback']['format'],2)
        self.assertNotIn('frames',view['computer_playback'])
        self.assertNotIn('frames', self.raw()['computer_playback'])

    def test_real_background_thread_finishes_without_browser_polling(self):
        self.finish()
        self.queue.start()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and jobs.needed(self.raw()):
            time.sleep(.01)
        self.queue.stop()
        self.assertEqual(self.raw()['turn'], 'us')
        self.assertEqual(self.raw()['round'], 2)

    def test_cooperative_queue_waits_for_teammate_then_runs_both_ai_groups(self):
        host = self.client.post('/api/match', json=dict(opponent='cooperative',ruleset='dsl')).json
        self.code, self.url = host['code'], '/api/match/'+host['code']
        self.auth = {'Authorization':'Bearer '+host['token'],'X-WW2-Protocol':'2'}
        view = self.get()
        group = next(g for g in view['coop']['groups'] if g['side']=='us' and not g['owner'] and not g['command'])
        ally = self.client.post(self.url+'/join',json=dict(side='us',group=group['id'],player_name='Teammate')).json
        ally_auth = {'Authorization':'Bearer '+ally['token'],'X-WW2-Protocol':'2'}
        view = self.get()
        response = self.client.post(self.url+'/cooperative', headers=self.auth, json=dict(operation='start',revision=view['revision']))
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.json['coop']['auto_advance'])
        self.assertEqual(self.act(dict(kind='end')).status_code,200)
        self.assertFalse(self.queue.work_once())
        view = self.client.get(self.url,headers=ally_auth).json
        self.assertEqual(self.client.post(self.url,headers=ally_auth,json=dict(kind='end',revision=view['revision'])).status_code,200)
        self.drain()
        self.assertEqual(self.raw()['round'],2)
        self.assertEqual(self.raw()['turn'],'us')
        self.assertFalse(self.get()['computer_work']['pending'])
        movie = self.get()['computer_playback']
        self.assertEqual(movie['format'],2)
        with self.db() as db:
            other = db.execute("SELECT stream FROM ww2_replays WHERE code=? AND side='de'",(self.code,)).fetchone()[0]
        self.assertEqual(self.client.get(self.url+'/replay/'+other,headers=self.auth).status_code,404)
        for legal in self.get()['legal'].values():
            self.assertIsInstance(legal['moves'],list)

    def test_unauthorized_old_match_probe_cannot_trigger_migration(self):
        old = initial('village','dsl'); old['ready'] = True
        with self.db() as db: db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(old),self.code))
        with patch('ww2_tactics.pipeline.migrate', side_effect=AssertionError('Unauthorized migration')):
            self.assertEqual(self.client.get(self.url).status_code,403)
        self.assertNotIn('pipeline_version',self.raw())

    def test_missing_team_membership_cannot_fall_back_to_solo_authority(self):
        host=self.client.post('/api/match',json=dict(opponent='cooperative',ruleset='dsl')).json
        auth={'Authorization':'Bearer '+host['token'],'X-WW2-Protocol':'2'}
        with self.db() as db:db.execute('DELETE FROM cooperative_players WHERE code=?',(host['code'],))
        url='/api/match/'+host['code']
        self.assertEqual(self.client.get(url,headers=auth).status_code,403)
        self.assertEqual(self.client.post(url,headers=auth,json=dict(kind='dig',unit='us0',revision=0)).status_code,403)

    def test_spectator_advance_queues_only_one_bounded_step(self):
        host=self.client.post('/api/match',json=dict(opponent='cooperative',ruleset='dsl')).json
        self.code,self.url=host['code'],'/api/match/'+host['code']
        self.auth={'Authorization':'Bearer '+host['token'],'X-WW2-Protocol':'2'}
        response=self.client.post(self.url+'/cooperative',headers=self.auth,json=dict(operation='start',revision=0))
        self.assertEqual(response.status_code,200)
        owned=set(response.json['coop']['controlled']);state=self.raw()
        for unit in state['units']:
            if unit['id'] in owned:unit.update(hp=0,ap=0)
        state['revision']+=1
        with self.db() as db:db.execute('UPDATE match SET state=? WHERE code=?',(pipeline.dumps(state),self.code))
        self.assertFalse(jobs.needed(state))
        response=self.client.post(self.url+'/cooperative',headers=self.auth,json=dict(operation='advance',revision=state['revision']))
        self.assertEqual(response.status_code,200)
        self.assertNotIn('_spectator_ai_batch',response.json)
        self.assertTrue(response.json['computer_work']['pending'])
        self.assertTrue(self.queue.work_once())
        self.assertFalse(self.queue.work_once())
        after=self.raw()
        self.assertGreater(after['revision'],state['revision']+1)
        self.assertLessEqual(after['revision'],state['revision']+3)
        self.assertNotIn('_spectator_ai_batch',after)
        self.assertIs(self.get()['computer_work']['pending'],False)

    def test_diagnostic_artifact_bundle_preserves_replay_and_takeback_records(self):
        self.assertEqual(self.act(dict(kind='dig',unit='us0')).status_code,200)
        with self.db() as db:
            bundle = pipeline.export_artifacts(db,self.code)
            pipeline.import_artifacts(db,'local-copy',bundle)
            original = db.execute('SELECT snapshot FROM ww2_journal WHERE code=?',(self.code,)).fetchone()[0]
            copied = db.execute('SELECT snapshot FROM ww2_journal WHERE code=?',('local-copy',)).fetchone()[0]
            self.assertEqual(original,copied)
        self.finish();self.drain()
        with self.db() as db:
            bundle = pipeline.export_artifacts(db,self.code)
            pipeline.import_artifacts(db,'replay-copy',bundle)
            movie = self.raw()['computer_playback']
            self.assertEqual(pipeline.read_page(db,self.code,movie),pipeline.read_page(db,'replay-copy',movie))
            with self.assertRaises(ValueError): pipeline.import_artifacts(db,'bad',dict(version=1,tables={'ww2_ai_jobs':[]}))

    def test_restart_resumes_committed_checkpoint(self):
        self.finish(); self.assertTrue(self.queue.work_once())
        before = self.raw(); self.assertGreater(before['revision'],1)
        restarted = jobs.Queue(self.queue.connect,self.app.logger)
        restarted.recover()
        for _ in range(80):
            if not restarted.work_once():break
        self.assertEqual(self.raw()['turn'],'us')
        self.assertGreater(self.raw()['revision'],before['revision'])
        self.assertGreater(self.raw()['computer_playback']['count'],before['computer_playback']['count'])

    def test_expired_lease_is_recovered(self):
        self.finish()
        with self.db() as db:
            db.execute("UPDATE ww2_ai_jobs SET status='running',lease='dead-process',expires=0 WHERE code=?",(self.code,))
        self.assertTrue(self.queue.work_once()); self.assertGreater(self.raw()['revision'],1)

    def test_failed_uncommitted_batch_retries_same_dice_seed(self):
        self.finish(); rolls=[]
        def fail_once(state,**kwargs):
            rolls.append([kwargs['roll']() for _ in range(5)])
            if len(rolls)==1: raise RuntimeError('Injected process interruption')
            return play_turn(state,**kwargs)
        with patch('ww2_tactics.jobs.play_turn',side_effect=fail_once):
            with self.assertLogs(self.app.logger):self.queue.work_once()
            self.assertEqual(self.raw()['revision'],1)
            with self.db() as db:db.execute('UPDATE ww2_ai_jobs SET expires=0 WHERE code=?',(self.code,))
            self.queue.work_once()
        self.assertEqual(rolls[0],rolls[1]);self.assertGreater(self.raw()['revision'],1)

    def test_resignation_during_compute_cannot_be_overwritten(self):
        self.finish(); before=self.raw()
        def computer(state,**kwargs):
            r=self.client.post(self.url,headers=self.auth,json=dict(kind='resign',revision=state['revision']))
            self.assertEqual(r.status_code,200)
            return play_turn(state,**kwargs)
        with patch('ww2_tactics.jobs.play_turn',side_effect=computer):self.queue.work_once()
        after=self.raw();self.assertEqual(after['winner'],'de');self.assertEqual(after['units'],before['units'])

    def test_undo_redo_and_save_copy_external_artifacts(self):
        self.assertEqual(self.act(dict(kind='move',unit='us0',pos=[1,7])).status_code,200)
        moved=self.raw()['units']
        self.assertEqual(self.act(dict(kind='undo')).status_code,200)
        self.assertEqual(self.act(dict(kind='redo')).status_code,200)
        self.assertEqual(self.raw()['units'],moved)
        self.assertTrue(self.raw()['_order_history']['past'][0]['snapshot']['_journal_ref'])
        self.finish();self.drain();view=self.get()
        saved=self.client.post(self.url+'/save',headers=self.auth,json={'revision':view['revision']})
        self.assertEqual(saved.status_code,200)
        restored=self.client.post('/api/restore',json={'code':saved.json['save_code']}).json
        auth={'Authorization':'Bearer '+restored['token'],'X-WW2-Protocol':'2'}
        result=self.client.get('/api/match/'+restored['code'],headers=auth).json
        stream=result['computer_playback']['stream']
        page=self.client.get('/api/match/'+restored['code']+'/replay/'+stream,headers=auth)
        self.assertEqual(page.status_code,200);self.assertTrue(page.json['events'])

    def test_replay_pages_are_authorized_and_read_only(self):
        self.finish();self.drain();movie=self.get()['computer_playback'];before=self.raw()
        path=self.url+'/replay/'+movie['stream']
        self.assertEqual(self.client.get(path).status_code,403)
        self.assertEqual(self.client.get(path,headers=self.auth).status_code,200)
        self.assertEqual(self.raw(),before)
        with self.db() as db:db.execute('UPDATE ww2_replays SET side=? WHERE code=?',('de',self.code))
        self.assertEqual(self.client.get(path,headers=self.auth).status_code,404)

    def test_before_view_reuse_requires_exact_revision_and_army(self):
        self.finish();self.queue.work_once()
        state=self.raw()
        with self.db() as db:
            prior=pipeline.replay_before_views(db,self.code,state)
            self.assertEqual(set(prior),{'us'})
            self.assertEqual(pipeline.replay_before_views(db,self.code,dict(state,revision=state['revision']+1)),{})
            db.execute("UPDATE ww2_replays SET side='de' WHERE code=?",(self.code,))
            self.assertEqual(pipeline.replay_before_views(db,self.code,state),{})

    def test_paused_job_can_be_explicitly_retried_without_replaying_orders(self):
        self.finish();before=self.raw()
        with self.db() as db:db.execute("UPDATE ww2_ai_jobs SET status='paused' WHERE code=?",(self.code,))
        poll=self.client.get(self.url+'?since=1',headers=self.auth)
        self.assertEqual(poll.json['computer_work']['status'],'paused')
        response=self.client.post(self.url+'/computer',headers=self.auth,json={})
        self.assertEqual(response.status_code,200);self.assertEqual(self.raw(),before)
        self.assertTrue(self.queue.work_once())

    def test_old_snapshot_migration_preserves_replay_dice_without_large_decode(self):
        old=initial('village','dsl');old.update(ready=True,ai_side='de')
        snap=dict(units=[],visible_hexes=[[x,y] for y in range(56) for x in range(64)],round=1,turn='de',hold=0,winner=None)
        frame=dict(action={'kind':'contact'},before=snap,after=snap,effects=[],combat=[{'dice':[6,1]}])
        old['computer_playback']=dict(id=5,frames=[frame]*100)
        with self.db() as db:db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(old),self.code))
        real_loads=json.loads; sizes=[]
        def bounded(value,*args,**kwargs):
            sizes.append(len(value));return real_loads(value,*args,**kwargs)
        with patch('ww2_tactics.pipeline.json.loads',side_effect=bounded):view=self.get()
        self.assertLess(max(sizes),500000)
        self.assertEqual(view['computer_playback']['count'],100)
        self.assertEqual(self.raw()['units'],old['units']);self.assertEqual(self.raw()['revision'],old['revision'])
        page=self.client.get(self.url+'/replay/'+view['computer_playback']['stream'],headers=self.auth).json
        self.assertEqual(page['events'][0]['combat'],[{'dice':[6,1]}])

    def test_public_view_and_receipt_storage_is_bounded(self):
        with self.db() as db:
            for revision in range(8):
                pipeline.transport(db,self.code,'one-owner',dict(revision=revision, units=[]))
            self.assertEqual(db.execute('SELECT count(*) FROM ww2_public_views WHERE owner=?',('one-owner',)).fetchone()[0],3)
            for i in range(270):
                body={'command_id':'command-'+str(i)}
                pipeline.remember_receipt(db,self.code,'one-owner',body,'digest',i)
            self.assertEqual(db.execute('SELECT count(*) FROM ww2_receipts WHERE owner=?',('one-owner',)).fetchone()[0],256)


if __name__ == '__main__': unittest.main()
