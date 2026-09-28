"""Authorization, audited recovery, isolated reproduction and failure evidence."""
import concurrent.futures
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app
from ww2_tactics.devtools import import_snapshot


class AdminTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'games.sqlite3'
        self.key = 'test-bootstrap-key-' + 'a'*40
        self.env = patch.dict(os.environ, WW2_ADMIN_BOOTSTRAP_KEY=self.key, RENDER='',
                              WW2_TEST_REPORT_PATH=str(self.path.parent/'ww2-test-report.json'))
        self.env.start()
        self.app = create_app(self.path)
        self.client = self.app.test_client()
        self.player = self.register('shnider42')
        self.headers = {'X-Commander-Token': self.player['token']}

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def register(self, name):
        r = self.client.post('/api/commander/register', json=dict(name=name, password='test-password-long'))
        self.assertEqual(r.status_code, 200)
        return r.get_json()

    def claim(self):
        r = self.client.post('/api/admin/claim', headers=self.headers, json=dict(key=self.key))
        self.assertEqual(r.status_code, 200, r.get_json())

    def game(self):
        r = self.client.post('/api/match', json=dict(scenario='village', ruleset='dsl', name='Admin test battle'), headers=self.headers)
        self.assertEqual(r.status_code, 201)
        return r.get_json()

    def state(self, seat):
        r = self.client.get('/api/match/'+seat['code'], headers={'Authorization':'Bearer '+seat['token']})
        self.assertEqual(r.status_code, 200)
        return r.get_json()

    def modify(self, game, action, revision=0, **extra):
        return self.client.post('/api/admin/matches/'+game['code'], headers=self.headers,
                                json=dict(action=action, revision=revision, **extra))

    def test_public_shell_and_nickname_cannot_grant_admin(self):
        with self.client.get('/admin') as response:
            self.assertEqual(response.status_code, 200)
        for route in ('overview', 'matches', 'audit'):
            self.assertEqual(self.client.get('/api/admin/'+route).status_code, 401)
            self.assertEqual(self.client.get('/api/admin/'+route, headers=self.headers).status_code, 403)
        for key in ('', 'wrong', None, 42, '\u2603'*32):
            self.assertEqual(self.client.post('/api/admin/claim', headers=self.headers, json=dict(key=key)).status_code, 403)
        stranger = self.register('SomeoneElse')
        h = {'X-Commander-Token': stranger['token']}
        self.assertEqual(self.client.post('/api/admin/claim', headers=h, json=dict(key=self.key)).status_code, 403)
        self.claim()
        self.assertEqual(self.client.post('/api/admin/claim', headers=h, json=dict(key=self.key)).status_code, 409)
        game = self.game()
        self.assertEqual(self.client.get('/api/admin/matches/'+game['code']+'/export', headers=h).status_code, 403)
        for action in ('rename', 'remove', 'restore', 'purge', 'cancel_rematch'):
            response = self.client.post('/api/admin/matches/'+game['code'], headers=h,
                                        json=dict(action=action, revision=0, confirm=game['code'], name='Hijacked'))
            self.assertEqual(response.status_code, 403)
        self.assertEqual(self.state(game)['revision'], 0)

    def test_disabled_setup_and_owner_binding_survive_restart_without_key(self):
        with patch.dict(os.environ, WW2_ADMIN_BOOTSTRAP_KEY='short'):
            self.assertFalse(self.client.get('/api/admin/access', headers=self.headers).get_json()['setup_enabled'])
            self.assertEqual(self.client.post('/api/admin/claim', headers=self.headers, json=dict(key='short')).status_code, 403)
        self.claim()
        with patch.dict(os.environ, WW2_ADMIN_BOOTSTRAP_KEY=''):
            fresh = create_app(self.path).test_client()
            self.assertEqual(fresh.get('/api/admin/overview', headers=self.headers).status_code, 200)
            with sqlite3.connect(self.path) as db:
                db.execute('UPDATE commander_sessions SET expires=0')
            self.assertEqual(fresh.get('/api/admin/overview', headers=self.headers).status_code, 401)

    def test_game_edit_remove_restore_and_purge_are_revision_checked_and_audited(self):
        self.claim()
        game = self.game()
        before = self.state(game)
        self.assertEqual(self.modify(game, 'rename', name='Renamed battle').status_code, 200)
        self.assertEqual(self.modify(game, 'remove', confirm=game['code']).status_code, 409)
        self.assertEqual(self.modify(game, 'remove', revision=1, confirm='WRONG').status_code, 400)
        self.assertEqual(self.modify(game, 'remove', revision=1, confirm=game['code']).status_code, 200)
        self.assertEqual(self.client.get('/api/lobby').get_json()['games'], [])
        self.assertEqual(self.client.get('/api/match/'+game['code'], headers={'Authorization':'Bearer '+game['token']}).status_code, 404)
        trash = self.client.get('/api/admin/matches?trash=1', headers=self.headers).get_json()['matches']
        self.assertEqual(trash[0]['name'], 'Renamed battle')
        self.assertEqual(self.modify(game, 'restore', revision=1, confirm=game['code']).status_code, 200)
        restored = self.state(game)
        self.assertEqual(restored['revision'], 2)
        self.assertEqual(restored['units'], before['units'])
        resumed = self.client.post('/api/match/'+game['code']+'/resume', headers=self.headers, json={})
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(self.modify(game, 'remove', revision=2, confirm=game['code']).status_code, 200)
        self.assertEqual(self.modify(game, 'purge', revision=2, confirm=game['code']).status_code, 200)
        self.assertEqual(self.modify(game, 'restore', revision=2, confirm=game['code']).status_code, 404)
        events = self.client.get('/api/admin/audit', headers=self.headers).get_json()['events']
        self.assertEqual([e['action'] for e in events], ['purge','remove','restore','remove','rename','claim'])
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM commander_seats').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM player_access').fetchone()[0], 0)

    def test_concurrent_admin_actions_do_not_double_modify(self):
        self.claim()
        game = self.game()
        def rename(n):
            return self.app.test_client().post('/api/admin/matches/'+game['code'], headers=self.headers,
                json=dict(action='rename', revision=0, name='Revision race '+str(n))).status_code
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(rename, [1,2])), [200,409])

    def test_overview_does_not_invent_test_results_or_expose_secrets(self):
        self.claim()
        game = self.game()
        overview = self.client.get('/api/admin/overview', headers=self.headers).get_json()
        self.assertIsNone(overview['tests'])
        self.assertEqual(overview['counts']['matches'], 1)
        self.assertEqual(overview['storage']['path'], str(self.path))
        report_path = self.path.parent/'ww2-test-report.json'
        report_path.write_text(json.dumps(dict(commit='old', dirty=False, success=True)))
        d = self.client.get('/api/admin/overview', headers=self.headers).get_json()
        self.assertFalse(d['tests']['matches_version'])
        for route in ('overview', 'matches', 'audit'):
            raw = self.client.get('/api/admin/'+route, headers=self.headers).get_data(as_text=True)
            for value in (self.player['token'], game['token'], self.key, 'password_hash', 'owner_hash'):
                self.assertNotIn(value, raw)

    def test_snapshot_and_local_import_preserve_board_but_replace_identity(self):
        self.claim()
        game = self.game()
        guest = self.client.post('/api/match/'+game['code']+'/join', json={}).get_json()
        response = self.client.get('/api/admin/matches/'+game['code']+'/export', headers=self.headers)
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        with sqlite3.connect(self.path) as db:
            row = db.execute('SELECT host,guest,state FROM match').fetchone()
            self.assertEqual(data['state'], json.loads(row[2]))
            self.assertNotIn(row[0], response.get_data(as_text=True))
            self.assertNotIn(row[1], response.get_data(as_text=True))
        self.assertNotIn(self.player['token'], response.get_data(as_text=True))
        exported = self.path.parent/'snapshot.json'
        exported.write_text(json.dumps(data))
        local_path = self.path.parent/'repro.sqlite3'
        local = import_snapshot(exported, local_path)
        self.assertNotEqual(local['code'], game['code'])
        self.assertEqual(set(local['tickets']), {'us','de'})
        with sqlite3.connect(local_path) as db:
            copied = db.execute('SELECT host,guest,state FROM match').fetchone()
            self.assertEqual(json.loads(copied[2]), data['state'])
            self.assertNotEqual(copied[:2], row[:2])
            self.assertEqual(db.execute('SELECT count(*) FROM commanders').fetchone()[0], 0)
        local_client = create_app(local_path).test_client()
        recovered = local_client.post('/api/transfer', json=dict(code=local['tickets']['us']))
        self.assertEqual(recovered.status_code, 200)
        self.assertEqual(self.state(game)['revision'], data['state']['revision'])
        with self.assertRaises(FileExistsError):
            import_snapshot(exported, local_path)
        with patch.dict(os.environ, RENDER='true'):
            with self.assertRaises(ValueError):
                import_snapshot(exported, self.path.parent/'not-created.sqlite3')
        with patch.dict(os.environ, WW2_DB_PATH=str(self.path.parent/'active.sqlite3')):
            with self.assertRaises(ValueError):
                import_snapshot(exported, self.path.parent/'active.sqlite3')

    def test_failures_have_correlated_redacted_persistent_diagnostics(self):
        self.claim()
        game = self.game()
        secret = 'PASSWORD-do-not-log-me'
        error = sqlite3.OperationalError(secret)
        error.sqlite_errorcode = sqlite3.SQLITE_BUSY
        error.sqlite_errorname = 'SQLITE_BUSY'
        with patch('ww2_web.perform', side_effect=error), self.assertLogs(self.app.logger, level='WARNING'):
            failed = self.client.post('/api/match/'+game['code']+'?password='+secret,
                headers={'Authorization':'Bearer '+game['token']}, json=dict(kind='end', revision=0, password=secret))
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(failed.get_json()['request_id'], failed.headers['X-Request-ID'])
        fresh = create_app(self.path).test_client()
        d = fresh.get('/api/admin/overview', headers=self.headers).get_json()['diagnostics']
        self.assertEqual(d['failures_recent'][0]['request_id'], failed.get_json()['request_id'])
        self.assertEqual(d['failures_recent'][0]['error']['sqlite_code'], 'SQLITE_BUSY')
        raw = (self.path.parent/'ww2-failures.jsonl').read_text()
        for value in (secret, game['token'], self.player['token']):
            self.assertNotIn(value, raw)

    def test_cancel_proposal_preserves_board_and_no_pending_proposal_is_not_a_write(self):
        self.claim()
        game = self.game()
        self.client.post('/api/match/'+game['code']+'/join', json={})
        h = {'Authorization':'Bearer '+game['token']}
        self.client.post('/api/match/'+game['code']+'/rematch', headers=h,
            json=dict(operation='propose', revision=1, scenario='orchard', ruleset='dsl', swap=False))
        before = self.state(game)
        self.assertEqual(self.modify(game, 'cancel_rematch', revision=2).status_code, 200)
        after = self.state(game)
        self.assertNotIn('rematch', after)
        self.assertEqual(after['units'], before['units'])
        self.assertEqual(self.modify(game, 'cancel_rematch', revision=3).status_code, 409)
        self.assertEqual(self.state(game)['revision'], 3)


if __name__ == '__main__':
    unittest.main()
