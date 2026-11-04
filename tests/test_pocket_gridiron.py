import json
import unittest
from unittest.mock import patch
from web import app

class PocketGridironTest(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_theme_and_assets(self):
        response = self.client.get('/?theme=pocket-gridiron', follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'POCKET', response.data)
        for asset in ('offensive-systems.js', 'defensive-systems.js', 'conditioning.js', 'injuries.js', 'decades.js', 'commercials.js', 'coach-interview.js', 'coach-poses.png', 'weather.js', 'weather-presentation.js', 'rushing.js', 'challenges.js', 'full-team.js', 'history.js', 'historic-rosters.js', 'stadium-life.js', 'engine.js', 'uniforms.js', 'placekicks.js', 'rules.js', 'blocking.js', 'penalties.js', 'app.js', 'controls.js', 'ratings.js', 'teams.js', 'contact.js', 'presentation.js', 'audio.js', 'device-audio.js', 'music.js', 'replay.js', 'passing.js', 'plays.js', 'match.js', 'halftime.js', 'broadcast.js', 'broadcast-screen.js', 'booth-lines.js', 'booth-stage.js', 'booth-poses.webp', 'impact.js', 'halftime-booth.png', 'music/notre-dame-victory.mp3', 'music/lambeau-bounce.mp3', 'music/lambeau-long-drop-63.mp3', 'music/lambeau-long-drop-112.mp3', 'music/manifest.json', 'music/fourth-and-thunder.mp3'):
            with self.client.get('/gridiron/' + asset) as asset_response:
                self.assertEqual(asset_response.status_code, 200)
        self.assertEqual(self.client.get('/gridiron/missing.txt').status_code, 404)
        roster = self.client.get('/gridiron/rosters.json').get_json()
        self.assertEqual(len({p['team'] for p in roster['players']}), 32)
        self.assertGreater(len(roster['players']), 1200)

    def test_roster_proxy_and_failure(self):
        with patch('daily_flyer.themes.pocket_gridiron.fetch_roster', return_value=('season,team,position,\n', '2026-11-01T22:00:00Z')):
            response = self.client.get('/gridiron/api/roster')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['X-Roster-Fetched-At'], '2026-11-01T22:00:00Z')
        with patch('daily_flyer.themes.pocket_gridiron.fetch_roster', side_effect=RuntimeError('unavailable')):
            self.assertEqual(self.client.get('/gridiron/api/roster').status_code, 503)

if __name__ == '__main__':
    unittest.main()
