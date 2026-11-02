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
        for asset in ('engine.js', 'rules.js', 'app.js', 'controls.js'):
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
