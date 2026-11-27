"""Spotify consent boundaries; all provider calls are mocked, never live."""
import os
import tempfile

os.environ['LOUDSOURCE_DISABLE_MONITOR'] = '1'
os.environ.setdefault('LOUDSOURCE_DATABASE_PATH', os.path.join(tempfile.mkdtemp(), 'startup.db'))

import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import Mock, patch

from web import app
from daily_flyer import loudsource_feature as ls, party_api as party


class SpotifyControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(ls, 'DB_PATH', Path(self.temp.name) / 'party.db')
        self.db_patch.start()
        self.clock = 1000.0
        self.time_patch = patch.object(ls.time, 'time', side_effect=lambda: self.clock)
        self.time_patch.start()
        ls.init_storage()
        party.init_party()
        party._limits.clear()
        ls._CONNECTION_ERRORS.clear()
        ls._SEARCH_CACHE.clear()
        app.config.update(TESTING=True)
        self.client = app.test_client()
        self.host = self.join('Host', True)
        self.guest = self.join('Guest')
        self.track = 'a' * 22
        self.next_track = 'b' * 22
        for tid in (self.track, self.next_track):
            ls.upsert_track(tid, {'name': 'Test track', 'artist': 'Test artist'})
        self.saved_token = {'access_token': 'test-only', 'refresh_token': 'test-refresh', 'expires_at': 9999999999}

    def tearDown(self):
        self.time_patch.stop()
        self.db_patch.stop()
        self.temp.cleanup()

    def join(self, name, host=False):
        response = self.client.post('/api/party/main/join', json={'name': name, 'host': host})
        self.assertEqual(response.status_code, 200)
        return response.json['token']

    def action(self, action, token=None, **extra):
        return self.client.post('/api/party/main/host', json={'action': action, **extra},
                                headers={'X-Party-Token': token or self.host})

    def state(self, token=None):
        return self.client.get('/api/party/main/state', headers={'X-Party-Token': token or self.host}).json

    def allow(self):
        ls.save_token('main', self.saved_token)
        response = self.action('session-start')
        self.assertEqual(response.status_code, 200, response.json)
        return ls.control_session_payload('main')['expires_at']

    def fake_spotify(self, playing=True, progress=100000):
        client = Mock()
        client.current_playback.return_value = {
            'item': {'uri': 'spotify:track:' + self.track, 'duration_ms': 180000},
            'progress_ms': progress, 'is_playing': playing,
            'device': {'id': 'test-device', 'name': 'Test speaker'},
        }
        return client

    def test_legacy_saved_tokens_and_auto_state_migrate_without_permission(self):
        ls.save_token('main', {**self.saved_token, 'expires_at': 1})
        ls.update_state('main', auto_enabled=True)
        with ls._connect() as db:
            for column in ('control_expires_at', 'last_host_activity_at', 'control_generation', 'control_end_reason'):
                db.execute(f'ALTER TABLE loudsource_sessions DROP COLUMN {column}')
        ls.init_storage()
        self.assertFalse(ls.get_state('main')['auto_enabled'])
        self.assertFalse(ls.control_session_payload('main')['active'])
        with patch.object(ls, '_oauth') as oauth, patch.object(ls, '_user_sp') as player, patch.object(ls.requests, 'post') as queue:
            ls._monitor_once()
            self.assertIsNone(ls.get_token('main'))
            oauth.assert_not_called()
            player.assert_not_called()
            queue.assert_not_called()
        self.assertTrue(self.state()['music']['authed'])

    def test_start_and_end_are_host_only_and_start_is_network_free(self):
        for action in ('session-start', 'session-end'):
            self.assertEqual(self.action(action, self.guest).status_code, 403)
        self.assertEqual(self.action('session-start').status_code, 400)
        with patch.object(ls, '_oauth') as oauth, patch.object(ls.spotipy, 'Spotify') as spotify:
            expiry = self.allow()
            self.assertEqual(expiry, self.clock + 43200)
            oauth.assert_not_called()
            spotify.assert_not_called()
        self.assertFalse(ls.get_state('main')['auto_enabled'])

    def test_all_inactive_spotify_controls_and_search_fail_before_provider_access(self):
        ls.save_token('main', self.saved_token)
        with patch.object(ls, '_user_sp') as player, patch.object(ls, 'sp_search') as search:
            for action in ('pause', 'resume', 'device', 'auto'):
                self.assertEqual(self.action(action, enabled=True, device_id='test').status_code, 409)
            for path in ('devices', 'search?q=test'):
                response = self.client.get('/api/loudsource/main/' + path, headers={'X-Party-Token': self.host})
                self.assertEqual(response.status_code, 409)
            response = self.client.post('/api/loudsource/main/play-first', json={}, headers={'X-Party-Token': self.host})
            self.assertEqual(response.status_code, 409)
            ls._monitor_once()
            player.assert_not_called()
            search.search.assert_not_called()
            search.track.assert_not_called()

    def test_expiry_at_exact_twelve_hours_stops_reads_refresh_and_queue(self):
        expiry = self.allow()
        ls.update_state('main', auto_enabled=True)
        ls.save_token('main', {**self.saved_token, 'expires_at': 1})
        self.clock = expiry
        with patch.object(ls, '_oauth') as oauth, patch.object(ls, '_user_sp') as player, patch.object(ls.requests, 'post') as queue:
            ls._monitor_once()
            self.assertIsNone(ls.get_token('main'))
            oauth.assert_not_called()
            player.assert_not_called()
            queue.assert_not_called()
        session = self.state()['music']['control_session']
        self.assertFalse(session['active'])
        self.assertEqual(session['ended_reason'], 'expired')
        self.assertFalse(ls.get_state('main')['auto_enabled'])
        with patch.object(ls.spotipy, 'Spotify') as client:
            self.assertIsNone(ls._user_sp('main'))
            client.assert_not_called()

    def test_passive_host_guest_and_background_activity_never_renew(self):
        expiry = self.allow()
        self.clock += 100
        fake = self.fake_spotify()
        with patch.object(ls.spotipy, 'Spotify', return_value=fake):
            ls._monitor_once()
        for _ in range(3):
            self.state(self.host)
            self.state(self.guest)
        self.action('title', title='Still the same party')
        self.action('prompt')
        self.assertEqual(ls.control_session_payload('main')['expires_at'], expiry)
        self.assertEqual(ls.control_session_payload('main')['last_host_activity_at'], 1000)
        self.assertEqual(self.action('auto', enabled=True).status_code, 200)
        self.assertEqual(ls.control_session_payload('main')['expires_at'], self.clock + 43200)

    def test_guest_search_does_not_renew_and_disables_after_end(self):
        expiry = self.allow()
        self.clock += 100
        search = Mock()
        search.search.return_value = {'tracks': {'items': []}}
        with patch.object(ls, 'sp_search', search):
            response = self.client.get('/api/loudsource/main/search?q=hello', headers={'X-Party-Token': self.guest})
            self.assertEqual(response.status_code, 200)
            search.search.assert_called_once()
            self.assertEqual(ls.control_session_payload('main')['expires_at'], expiry)
            self.action('session-end')
            response = self.client.get('/api/loudsource/main/search?q=hello', headers={'X-Party-Token': self.guest})
            self.assertEqual(response.status_code, 409)
            search.search.assert_called_once()

    def test_external_pause_never_triggers_resume_even_with_legacy_setting(self):
        self.allow()
        ls.update_state('main', auto_enabled=True, last_paused_ts=1)
        fake = self.fake_spotify(playing=False)
        with patch.dict(os.environ, {'LOUDSOURCE_AUTO_RESUME': 'true'}), patch.object(ls.spotipy, 'Spotify', return_value=fake), patch.object(ls.requests, 'post') as queue:
            for pause_age in (1, 10, 100):
                self.clock = 1000 + pause_age
                ls._monitor_once()
            self.assertEqual(fake.current_playback.call_count, 3)
            fake.start_playback.assert_not_called()
            queue.assert_not_called()

    def test_active_auto_queue_still_works_once_without_renewal(self):
        expiry = self.allow()
        ls.vote_delta('main', self.next_track, 1)
        ls.update_state('main', auto_enabled=True, current_uri='spotify:track:' + self.track)
        fake = self.fake_spotify(progress=175000)
        with patch.object(ls.spotipy, 'Spotify', return_value=fake), patch.object(ls.requests, 'post', return_value=Mock(status_code=204)) as queue:
            ls._monitor_once()
            self.clock += 3
            ls._monitor_once()
            queue.assert_called_once()
            self.assertEqual(queue.call_args.kwargs['params'], {'uri': 'spotify:track:' + self.next_track})
            fake.start_playback.assert_not_called()
        self.assertEqual(ls.control_session_payload('main')['expires_at'], expiry)

    def test_end_preserves_credentials_and_does_not_pause_or_resume_spotify(self):
        self.allow()
        ls.update_state('main', auto_enabled=True)
        with patch.object(ls, '_user_sp') as player, patch.object(ls, '_oauth') as oauth:
            self.assertEqual(self.action('session-end').status_code, 200)
            ls._monitor_once()
            self.assertIsNone(ls.get_token('main'))
            player.assert_not_called()
            oauth.assert_not_called()
        music = self.state()['music']
        self.assertTrue(music['authed'])
        self.assertFalse(music['auto_enabled'])
        self.assertEqual(music['control_session']['ended_reason'], 'host-ended')

    def test_old_client_and_old_queue_iteration_cannot_cross_end_and_restart(self):
        self.allow()
        raw = self.fake_spotify()
        with patch.object(ls.spotipy, 'Spotify', return_value=raw):
            client = ls._user_sp('main')
        generation = ls.list_active_sessions()[0][1]
        ls.end_control_session('main')
        ls.start_control_session('main')
        with self.assertRaises(ls.SpotifySessionInactive):
            client.current_playback()
        with patch.object(ls.requests, 'post') as queue:
            with self.assertRaises(ls.SpotifySessionInactive):
                ls._queue_next_for_snapshot('main', {}, generation)
            queue.assert_not_called()
        raw.current_playback.assert_not_called()

    def test_expiry_during_token_refresh_is_rechecked_before_queue_write(self):
        expiry = self.allow()
        ls.update_state('main', auto_enabled=True, current_uri='spotify:track:' + self.track)
        ls.vote_delta('main', self.next_track, 1)
        ls.save_token('main', {**self.saved_token, 'expires_at': 1})
        def refreshed(_):
            self.clock = expiry
            return self.saved_token.copy()
        oauth = Mock()
        oauth.refresh_access_token.side_effect = refreshed
        with patch.object(ls, '_oauth', return_value=oauth), patch.object(ls.requests, 'post') as queue:
            with self.assertRaises(ls.SpotifySessionInactive):
                ls._queue_next_for_snapshot('main', {'uri': 'spotify:track:' + self.track})
            oauth.refresh_access_token.assert_called_once()
            queue.assert_not_called()

    def test_end_acknowledgement_waits_for_inflight_request_and_blocks_later_calls(self):
        self.allow()
        entered, release, ending, ended = (threading.Event() for _ in range(4))
        raw = Mock()
        def request():
            entered.set()
            self.assertTrue(release.wait(3))
            return None
        raw.current_playback.side_effect = request
        with patch.object(ls.spotipy, 'Spotify', return_value=raw):
            client = ls._user_sp('main')
        def end():
            ending.set()
            ls.end_control_session('main')
            ended.set()
        with ThreadPoolExecutor(max_workers=2) as pool:
            call = pool.submit(client.current_playback)
            self.assertTrue(entered.wait(3))
            stop = pool.submit(end)
            self.assertTrue(ending.wait(3))
            self.assertFalse(ended.wait(.05))
            release.set()
            call.result(timeout=3)
            stop.result(timeout=3)
        with self.assertRaises(ls.SpotifySessionInactive):
            client.current_playback()
        raw.current_playback.assert_called_once()

    def test_oauth_reconnect_saves_connection_but_does_not_start_session(self):
        self.allow()
        oauth = Mock()
        oauth.get_access_token.return_value = self.saved_token.copy()
        state = ls._build_signed_state('main', '/?room=main')
        with patch.object(ls, '_oauth', return_value=oauth):
            ls.handle_callback('test-code', state)
            oauth.get_access_token.assert_called_once_with(code='test-code', check_cache=False)
            ls._monitor_once()
            oauth.refresh_access_token.assert_not_called()
        control = ls.control_session_payload('main')
        self.assertFalse(control['active'])
        self.assertEqual(control['ended_reason'], 'reconnected')
        self.assertTrue(self.state()['music']['authed'])

    def test_reconnect_requirement_survives_process_memory_reset(self):
        self.allow()
        ls.save_token('main', {**self.saved_token, 'expires_at': 1})
        oauth = Mock()
        oauth.refresh_access_token.side_effect = RuntimeError('test-only-invalid-grant')
        with patch.object(ls, '_oauth', return_value=oauth):
            self.assertIsNone(ls.get_token('main'))
            ls._CONNECTION_ERRORS.clear()
            music = self.state()['music']
            self.assertIn('reconnected', music['connection_error'])
            self.assertEqual(self.action('session-start').status_code, 400)
            ls._monitor_once()
            oauth.refresh_access_token.assert_called_once()

    def test_failed_oauth_exchange_preserves_reconnect_requirement_after_restart(self):
        self.allow()
        ls.end_control_session('main', 'connection-error')
        oauth = Mock()
        oauth.get_access_token.side_effect = RuntimeError('test-only-exchange-failure')
        state = ls._build_signed_state('main', '/?room=main')
        with patch.object(ls, '_oauth', return_value=oauth):
            with self.assertRaises(ValueError):
                ls.handle_callback('test-code', state)
            ls._CONNECTION_ERRORS.clear()
            music = self.state()['music']
            self.assertFalse(music['control_session']['active'])
            self.assertEqual(music['control_session']['ended_reason'], 'connection-error')
            self.assertIn('reconnected', music['connection_error'])
            self.assertEqual(self.action('session-start').status_code, 400)
            ls._monitor_once()
            oauth.refresh_access_token.assert_not_called()

    def test_spotify_401_ends_session_without_fallback_or_future_polling(self):
        self.allow()
        raw = Mock()
        unauthorized = ls.spotipy.SpotifyException(401, -1, 'test unauthorized')
        raw.current_playback.side_effect = unauthorized
        raw.currently_playing.side_effect = unauthorized
        raw.devices.side_effect = unauthorized
        with patch.object(ls.spotipy, 'Spotify', return_value=raw):
            ls._monitor_once()
            ls._monitor_once()
        raw.current_playback.assert_called_once()
        raw.currently_playing.assert_not_called()
        raw.devices.assert_not_called()
        control = ls.control_session_payload('main')
        self.assertFalse(control['active'])
        self.assertEqual(control['ended_reason'], 'connection-error')
        self.assertIn('reconnected', self.state()['music']['connection_error'])

    def test_queue_401_ends_session_and_stops_followup_provider_calls(self):
        self.allow()
        ls.vote_delta('main', self.next_track, 1)
        ls.update_state('main', auto_enabled=True, current_uri='spotify:track:' + self.track)
        raw = self.fake_spotify(progress=175000)
        with patch.object(ls.spotipy, 'Spotify', return_value=raw), patch.object(ls.requests, 'post', return_value=Mock(status_code=401)) as queue:
            ls._monitor_once()
            ls._monitor_once()
            raw.current_playback.assert_called_once()
            queue.assert_called_once()
        control = ls.control_session_payload('main')
        self.assertFalse(control['active'])
        self.assertEqual(control['ended_reason'], 'connection-error')
        self.assertFalse(ls.get_state('main')['auto_enabled'])

    def test_transient_spotify_errors_do_not_revoke_permission(self):
        self.allow()
        raw = Mock()
        with patch.object(ls.spotipy, 'Spotify', return_value=raw):
            client = ls._user_sp('main')
        for status in (429, 500, 503):
            raw.current_playback.side_effect = ls.spotipy.SpotifyException(status, -1, 'test transient failure')
            with self.assertRaises(ls.spotipy.SpotifyException):
                client.current_playback()
            self.assertTrue(ls.control_session_payload('main')['active'])


if __name__ == '__main__':
    unittest.main()
