"""Whole-operation recovery, transitions, authority and bounded private history.

Mission combat rules have their own tests. Terminal fixtures here represent
authoritative finished battles so these checks can exercise every campaign path
without depending on a lucky sequence of tactical dice.
"""
import concurrent.futures
import copy
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics import linked_operations, pipeline
from ww2_tactics.engine import apply
from ww2_tactics.visibility import public_state, update_intel


class LinkedOperationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp.name, 'operations.sqlite3')
        self.app = create_app(self.path, start_worker=False)
        self.client = self.app.test_client()

    def tearDown(self):
        self.app.extensions['ww2_computer_queue'].stop()
        self.temp.cleanup()

    def headers(self, seat=None, commander=None):
        return {**({'Authorization': 'Bearer ' + seat['token']} if seat else {}),
                **({'X-Commander-Token': commander['token']} if commander else {})}

    def create(self, commander=None, client=None):
        response = (client or self.client).post('/api/operations/greybridge', json={},
                                                headers=self.headers(commander=commander))
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def url(self, seat, suffix=''):
        return '/api/match/' + seat['code'] + suffix

    def state(self, seat, client=None):
        response = (client or self.client).get(self.url(seat), headers=self.headers(seat))
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def raw(self, seat):
        with sqlite3.connect(self.path) as db:
            return json.loads(db.execute('SELECT state FROM match WHERE code=?', (seat['code'],)).fetchone()[0])

    def change(self, seat, change):
        with sqlite3.connect(self.path) as db:
            state = json.loads(db.execute('SELECT state FROM match WHERE code=?', (seat['code'],)).fetchone()[0])
            change(state)
            db.execute('UPDATE match SET state=? WHERE code=?', (json.dumps(state), seat['code']))

    def finish(self, seat, winner='us', relay=None):
        def change(state):
            state.update(winner=winner, revision=state['revision'] + 1)
            state['greybridge'].update(objective_completed=winner == 'us',
                                      outcome_reason='Authored mission objective achieved.' if winner == 'us' else 'Mission deadline passed.')
            if relay is not None:
                state['greybridge']['relay_disabled'] = relay
        self.change(seat, change)

    def transition(self, seat, action='continue', revision=None, client=None):
        if revision is None:
            revision = self.raw(seat)['revision']
        return (client or self.client).post(self.url(seat, '/operation'),
                json={'action': action, 'revision': revision}, headers=self.headers(seat))

    def advance(self, seat, action='continue'):
        response = self.transition(seat, action)
        self.assertEqual(response.status_code, 200, response.get_json())
        return dict(code=response.get_json()['code'], token=seat['token'])

    def save(self, seat):
        response = self.client.post(self.url(seat, '/save'), headers=self.headers(seat),
                                    json={'revision': self.raw(seat)['revision']})
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()['save_code']

    def restore(self, code, commander=None):
        response = self.client.post('/api/restore', json={'code': code},
                                    headers=self.headers(commander=commander))
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def player(self, name):
        response = self.client.post('/api/commander/register', json={'name': name, 'password': 'operation-password'})
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def test_start_is_solo_current_allied_and_operation_maps_are_not_standalone(self):
        seat = self.create()
        state = self.state(seat)
        self.assertEqual((state['side'], state['ai_side'], state['ruleset'], state['edition']), ('us', 'de', 'dsl', 'current'))
        self.assertEqual(state['operation']['stage'], 1)
        self.assertFalse(state['operation']['can_continue'])
        self.assertFalse(state['operation']['can_retry'])
        self.assertIn('two infantry', state['operation']['objective'])
        catalog = json.dumps(self.client.get('/api/scenarios').get_json())
        for scenario in linked_operations.SCENARIOS.values():
            self.assertNotIn(scenario, catalog)
            response = self.client.post('/api/match', json={'scenario': scenario, 'opponent': 'computer', 'ruleset': 'dsl'})
            self.assertEqual(response.status_code, 400)
        for body in ([], {'side': 'de'}, {'opponent': 'human'}, {'ruleset': 'classic'}):
            self.assertEqual(self.client.post('/api/operations/greybridge', json=body).status_code, 400)

    def test_progress_requires_owner_finished_result_and_matching_revision(self):
        seat, other = self.create(), self.create()
        self.assertEqual(self.client.get(self.url(seat, '/operation')).status_code, 403)
        self.assertEqual(self.client.get(self.url(seat, '/operation'), headers=self.headers(other)).status_code, 403)
        self.assertEqual(self.transition(seat).status_code, 400)
        self.finish(seat)
        self.assertEqual(self.transition(seat, revision=0).status_code, 409)
        self.assertEqual(self.transition(seat, revision=True).status_code, 409)
        response = self.client.get(self.url(seat, '/operation'), headers=self.headers(seat))
        self.assertEqual(response.get_json(), self.state(seat)['operation'])

    def test_failed_raid_keeps_sabotage_and_crossing_receives_baseline_force(self):
        raid = self.create()
        # A tactical loss must not erase the separately completed relay action.
        self.finish(raid, 'de', relay=True)
        self.change(raid, lambda s: [u.update(hp=0, ap=0, grenades=0) for u in s['units'] if u['side'] == 'us'])
        crossing = self.advance(raid)
        state, raw = self.state(crossing), self.raw(crossing)
        self.assertEqual(state['operation']['stage'], 2)
        self.assertTrue(state['operation']['inherited']['relay_disabled'])
        self.assertEqual(state['greybridge']['reserve_round'], 6)
        self.assertTrue(all(u['arrival_round'] == 6 for u in raw['units'] if u.get('greybridge_reserve')))
        self.assertEqual(raw['units'], raw['_operation']['initial']['units'])
        self.assertTrue(all(u['hp'] > 0 for u in raw['units'] if u['side'] == 'us'))
        history = state['operation']['history']
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['result'], 'defeat')
        self.assertIn('round 6', history[0]['what_changes'])

    def test_hold_path_completes_and_final_retry_keeps_only_prior_accepted_missions(self):
        raid = self.create()
        self.finish(raid, relay=False)
        crossing = self.advance(raid)
        self.assertEqual(self.state(crossing)['greybridge']['reserve_round'], 4)
        self.finish(crossing)
        hold = self.advance(crossing)
        self.assertEqual(self.raw(hold)['_operation']['stage'], 'hold')
        self.finish(hold)
        result = self.state(hold)['operation']
        self.assertTrue(result['completed'])
        self.assertEqual(result['outcome'], 'operation_success')
        self.assertFalse(result['can_continue'])
        self.assertTrue(result['can_retry'])
        self.assertEqual(self.transition(hold).status_code, 400)
        replay = self.advance(hold, 'retry')
        new = self.state(replay)['operation']
        self.assertFalse(new['completed'])
        self.assertEqual(new['stage'], 3)
        self.assertEqual(len(new['history']), 2)

    def test_withdrawal_success_does_not_award_the_operation_objective(self):
        raid = self.create()
        self.finish(raid, relay=True)
        crossing = self.advance(raid)
        self.finish(crossing, 'de')
        retreat = self.advance(crossing)
        self.assertEqual(self.raw(retreat)['_operation']['stage'], 'withdrawal')
        self.assertTrue(self.state(retreat)['operation']['inherited']['relay_disabled'])
        self.finish(retreat)
        result = self.state(retreat)['operation']
        self.assertTrue(result['completed'])
        self.assertEqual(result['outcome'], 'objective_failed')
        self.assertIn('Withdrawal complete', result['outcome_label'])
        failed_retreat = self.advance(retreat, 'retry')
        self.finish(failed_retreat, 'de')
        self.assertEqual(self.state(failed_retreat)['operation']['outcome'], 'objective_failed')

    def test_retry_restores_same_start_without_stacking_results_or_new_catalog_calls(self):
        raid = self.create()
        initial = self.raw(raid)['_operation']['initial']
        self.finish(raid, 'de', relay=True)
        self.change(raid, lambda s: s['units'][0].update(pos=[8, 11], hp=1, ap=0))
        with patch('ww2_web.initial', side_effect=AssertionError('Existing operation starts are frozen')):
            retry = self.advance(raid, 'retry')
            again = self.raw(retry)
            self.assertEqual(again['units'], initial['units'])
            self.assertFalse(again['greybridge']['relay_disabled'])
            self.assertEqual(again['_operation']['history'], [])
            self.finish(retry, 'de', relay=False)
            crossing = self.advance(retry)
        self.assertEqual(self.state(crossing)['greybridge']['reserve_round'], 4)
        self.assertEqual(len(self.state(crossing)['operation']['history']), 1)
        raw = self.raw(crossing)
        for variants in raw['_operation']['templates'].values():
            for template in variants.values():
                self.assertNotIn('_operation', template)
        self.assertNotIn('_operation', raw['_operation']['initial'])

    def test_duplicate_and_racing_continue_return_one_successor(self):
        raid = self.create()
        self.finish(raid)
        revision = self.raw(raid)['revision']
        def run(_):
            response = self.transition(raid, revision=revision, client=self.app.test_client())
            return response.status_code, response.get_json()
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            answers = list(pool.map(run, range(2)))
        self.assertEqual([status for status, _ in answers], [200, 200])
        self.assertEqual(answers[0][1]['code'], answers[1][1]['code'])
        self.assertEqual(self.transition(raid, revision=revision).get_json(), answers[0][1])
        self.assertEqual(self.transition(raid, 'retry', revision).status_code, 409)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM match').fetchone()[0], 2)
        self.assertEqual(self.raw(raid)['revision'], revision + 1)

    def test_racing_retry_and_continue_choose_one_path_and_lock_source(self):
        raid = self.create()
        self.finish(raid)
        revision = self.raw(raid)['revision']
        def run(action):
            return self.transition(raid, action, revision, self.app.test_client()).status_code
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(run, ('continue', 'retry'))), [200, 409])
        before = self.raw(raid)
        for kind in ('undo', 'redo', 'end', 'resign'):
            response = self.client.post(self.url(raid), json={'kind': kind, 'revision': before['revision']}, headers=self.headers(raid))
            self.assertEqual(response.status_code, 409)
        for suffix in ('/reset', '/rematch'):
            response = self.client.post(self.url(raid, suffix), json={}, headers=self.headers(raid))
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.raw(raid), before)

    def test_normal_rematch_cannot_enter_operation_only_scenario(self):
        seat = self.client.post('/api/match', json={'opponent': 'computer', 'ruleset': 'dsl'}).get_json()
        response = self.client.post(self.url(seat, '/rematch'), headers=self.headers(seat),
            json={'operation': 'propose', 'revision': 0, 'scenario': 'current:greybridge_raid', 'swap': False})
        self.assertEqual(response.status_code, 400)

    def test_private_future_templates_and_hidden_enemy_never_enter_progress_or_reviews(self):
        raid = self.create()
        def secrets_in_state(state):
            state['_operation']['templates']['hold']['normal']['private_test'] = 'FUTURE-SECRET'
            state['_operation']['initial']['private_test'] = 'INITIAL-SECRET'
            next(u for u in state['units'] if u['side'] == 'de')['display_name'] = 'HIDDEN-ENEMY'
        self.change(raid, secrets_in_state)
        self.finish(raid)
        for payload in (self.state(raid), public_state(self.raw(raid), 'us'),
                        self.client.get(self.url(raid, '/operation'), headers=self.headers(raid)).get_json()):
            text = json.dumps(payload)
            for secret in ('_operation', 'FUTURE-SECRET', 'INITIAL-SECRET', 'HIDDEN-ENEMY'):
                self.assertNotIn(secret, text)
        crossing = self.advance(raid)
        response = self.client.get(self.url(crossing, '/operation/history/0'), headers=self.headers(crossing))
        self.assertEqual(response.status_code, 200)
        review = response.get_json()
        self.assertTrue(review['state']['readonly'])
        self.assertEqual(review['state']['legal'], {})
        self.assertEqual(review['record']['index'], 0)
        for secret in ('_operation', 'FUTURE-SECRET', 'INITIAL-SECRET', 'HIDDEN-ENEMY'):
            self.assertNotIn(secret, json.dumps(review))
        self.assertEqual(self.client.get(self.url(crossing, '/operation/history/0')).status_code, 403)
        self.assertEqual(self.client.get(self.url(crossing, '/operation/history/5'), headers=self.headers(crossing)).status_code, 404)

    def test_own_loss_record_retains_real_casualty_and_counts_extraction_separately(self):
        raid = self.create()
        self.assertIsNone(self.state(raid)['operation']['force_record'])
        source = self.raw(raid)
        source['battlefield']['map'] = [['field']*10 for _ in range(12)]
        victim = next(u for u in source['units'] if u['side'] == 'us' and u['kind'] == 'mg')
        attacker = next(u for u in source['units'] if u['side'] == 'de' and u['kind'] == 'squad')
        victim.update(pos=[4, 5], hp=1, entrenched=False)
        attacker.update(pos=[4, 4], ap=3, pinned=False)
        source['turn'] = 'de'
        update_intel(source)
        # Exercise the real combat/debrief path, not a fabricated loss counter.
        after = apply(source, 'de', {'kind': 'fire', 'unit': attacker['id'], 'target': victim['id']}, roll=lambda: 6)
        self.assertEqual(next(u for u in after['units'] if u['id'] == victim['id'])['hp'], 0)
        after = apply(after, 'de', {'kind': 'end'}, roll=lambda: 6)
        after['_battle_record']['armies']['de']['losses']['combat'] = 987654321
        with sqlite3.connect(self.path) as db:
            db.execute('UPDATE match SET state=? WHERE code=?', (json.dumps(after), raid['code']))
        for _ in range(2):
            before = self.raw(raid)
            uid = next(u['id'] for u in before['units'] if u['side'] == 'us' and u['hp'] > 0 and u['kind'] == 'squad')
            def at_exit(state):
                next(u for u in state['units'] if u['id'] == uid).update(pos=state['battlefield']['greybridge_exits'][0][:], ap=3, pinned=False)
                update_intel(state)
            self.change(raid, at_exit)
            response = self.client.post(self.url(raid), headers=self.headers(raid),
                json={'kind': 'extract', 'unit': uid, 'revision': self.raw(raid)['revision']})
            self.assertEqual(response.status_code, 200, response.get_json())
        expected = dict(units_lost=1, units_remaining=3, units_extracted=2, complete=True)
        result = self.state(raid)['operation']
        self.assertEqual(result['force_record'], expected)
        crossing = self.advance(raid)
        self.assertEqual(self.state(crossing)['operation']['history'][0]['force_record'], expected)
        restored = self.restore(self.save(crossing))
        review = self.client.get(self.url(restored, '/operation/history/0'), headers=self.headers(restored)).get_json()
        self.assertEqual(review['record']['force_record'], expected)
        for payload in (result, review):
            self.assertNotIn('987654321', json.dumps(payload))
            self.assertNotIn('_battle_record', json.dumps(payload))
            self.assertNotIn('_operation', json.dumps(payload))

    def test_save_restore_forks_entire_operation_and_never_reenters_original_successor(self):
        raid = self.create()
        self.finish(raid, relay=True)
        crossing = self.advance(raid)
        source_after_transition = self.save(raid)
        source_before = copy.deepcopy(self.raw(crossing))
        with patch('ww2_web.play_turn', side_effect=AssertionError('Restore cannot resolve orders')):
            fork = self.restore(source_after_transition)
        fork_raw = self.raw(fork)
        self.assertNotEqual(fork_raw['_operation']['run_id'], self.raw(raid)['_operation']['run_id'])
        self.assertNotIn('transition', fork_raw['_operation'])
        self.assertTrue(self.state(fork)['operation']['can_continue'])
        independent_crossing = self.advance(fork)
        self.assertNotEqual(independent_crossing['code'], crossing['code'])
        self.assertEqual(self.raw(crossing), source_before)
        self.assertEqual(self.client.get(self.url(crossing), headers=self.headers(fork)).status_code, 403)
        self.assertEqual(self.state(independent_crossing)['greybridge']['reserve_round'], 6)
        self.assertEqual(len(self.state(independent_crossing)['operation']['history']), 1)

    def test_restored_later_mission_keeps_reviews_templates_and_forks_each_load(self):
        raid = self.create()
        self.finish(raid)
        crossing = self.advance(raid)
        self.finish(crossing, 'de')
        retreat = self.advance(crossing)
        checkpoint = self.save(retreat)
        a, b = self.restore(checkpoint), self.restore(checkpoint)
        self.assertNotEqual(self.raw(a)['_operation']['run_id'], self.raw(b)['_operation']['run_id'])
        self.assertEqual(self.raw(a)['units'], self.raw(retreat)['units'])
        self.assertEqual(len(self.state(a)['operation']['history']), 2)
        for index in (0, 1):
            review = self.client.get(self.url(a, '/operation/history/'+str(index)), headers=self.headers(a))
            self.assertEqual(review.status_code, 200)
            self.assertTrue(review.get_json()['state']['readonly'])
        self.finish(a)
        self.assertFalse(self.state(b)['operation']['completed'])
        self.assertFalse(self.state(retreat)['operation']['completed'])

    def test_move_alias_retains_authority_over_later_missions(self):
        raid = self.create()
        code = self.client.post(self.url(raid, '/transfer'), headers=self.headers(raid), json={}).get_json()['transfer_code']
        alias = self.client.post('/api/transfer', json={'code': code}).get_json()
        self.finish(raid)
        crossing = self.advance(alias)
        self.assertEqual(self.state(crossing)['operation']['stage'], 2)
        original = dict(code=crossing['code'], token=raid['token'])
        self.assertEqual(self.state(original), self.state(crossing))

    def test_commander_recovery_lists_only_private_latest_runs_and_binds_restored_fork(self):
        commander, stranger = self.player('GreybridgeOwner'), self.player('OtherCommander')
        raid = self.create(commander)
        self.finish(raid)
        crossing = self.advance(raid)
        fresh = create_app(self.path, start_worker=False).test_client()
        login = fresh.post('/api/commander/login', json={'name': 'GreybridgeOwner', 'password': 'operation-password'}).get_json()
        listing = fresh.get('/api/operations/greybridge', headers=self.headers(commander=login))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual([item['code'] for item in listing.get_json()['operations']], [crossing['code']])
        resumed = fresh.post(self.url(crossing, '/resume'), json={}, headers=self.headers(commander=login))
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(self.state(resumed.get_json())['operation']['stage'], 2)
        fork = self.restore(self.save(crossing), commander)
        listing = self.client.get('/api/operations/greybridge', headers=self.headers(commander=commander)).get_json()['operations']
        self.assertEqual({item['code'] for item in listing}, {crossing['code'], fork['code']})
        self.assertEqual(self.client.get('/api/operations/greybridge', headers=self.headers(commander=stranger)).get_json()['operations'], [])
        self.assertEqual(self.client.get('/api/operations/greybridge').status_code, 401)
        self.assertEqual(self.client.get('/api/lobby?finished=1').get_json()['games'], [])

    def test_turn_takebacks_do_not_duplicate_private_operation_context(self):
        seat = self.create()
        state = self.state(seat)
        uid = next(uid for uid, legal in state['legal'].items() if legal.get('dig'))
        response = self.client.post(self.url(seat), headers=self.headers(seat),
                                    json={'kind': 'dig', 'unit': uid, 'revision': state['revision']})
        self.assertEqual(response.status_code, 200, response.get_json())
        with sqlite3.connect(self.path) as db:
            journals = db.execute('SELECT snapshot FROM ww2_journal WHERE code=?', (seat['code'],)).fetchall()
        self.assertTrue(journals)
        self.assertTrue(all('_operation' not in pipeline.unpack(row[0]) for row in journals))
        before_run = self.raw(seat)['_operation']['run_id']
        undone = self.client.post(self.url(seat), headers=self.headers(seat),
                                  json={'kind': 'undo', 'revision': self.raw(seat)['revision']})
        self.assertEqual(undone.status_code, 200, undone.get_json())
        self.assertEqual(self.raw(seat)['_operation']['run_id'], before_run)

    def test_background_orders_and_pending_save_keep_operation_context_private(self):
        self.app = create_app(self.path, background_ai=True, start_worker=False)
        self.client = self.app.test_client()
        seat = self.create()
        before = self.raw(seat)['_operation']['run_id']
        response = self.client.post(self.url(seat), headers=self.headers(seat), json={'kind': 'end', 'revision': 0})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertTrue(response.get_json()['computer_work']['pending'])
        checkpoint = self.save(seat)
        with patch('ww2_web.play_turn', side_effect=AssertionError('Restore cannot resolve a computer turn')):
            fork = self.restore(checkpoint)
        self.assertEqual(self.raw(fork)['units'], self.raw(seat)['units'])
        queue = self.app.extensions['ww2_computer_queue']
        self.assertTrue(queue.work_once())
        self.assertEqual(self.raw(seat)['_operation']['run_id'], before)
        payload = self.state(seat)
        self.assertNotIn('_operation', json.dumps(payload))
        movie = payload.get('computer_playback')
        if movie and movie.get('stream'):
            replay = self.client.get(self.url(seat, '/replay/'+movie['stream']), headers=self.headers(seat)).get_json()
            self.assertNotIn('_operation', json.dumps(replay))


if __name__ == '__main__':
    unittest.main()
