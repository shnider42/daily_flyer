import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from web import app
from daily_flyer.bowling_explorer.data import load_dataset
from daily_flyer.bowling_explorer.presets import factory_presets, legacy_factory_presets, validate_presets
from daily_flyer.preset_storage import preset_db
from scripts.build_bowling_data import parse_profile


class BowlingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict('os.environ', {'YEAR_TWO_DATA_DIR':self.temp.name, 'BOWLING_PRESET_DB':str(Path(self.temp.name)/'bw.sqlite3')})
        self.env.start()
        self.client = app.test_client()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_source_parser_preserves_missing_zero_and_derived_denominators(self):
        html = '''<h1 class="name">Bowler</h1><table><caption>Career Stats</caption><tr><th>Year</th><th>Events</th><th>Cashes</th><th>Match Play</th><th>CRA</th><th>Titles</th><th>AVG</th><th>Earnings</th></tr>
        <tr><td>2025</td><td>10</td><td>3</td><td>0</td><td>0</td><td>0</td><td>210.500</td><td>$1,500.00</td></tr>
        <tr><td>2024</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>-</td><td>$0.00</td></tr></table>'''
        p = parse_profile(html, 'https://www.pba.com/players/bowler')
        a,b = p['seasons']
        self.assertIsNone(a['average']); self.assertIsNone(a['cash_rate']); self.assertEqual(a['titles'],0)
        self.assertEqual(b['cash_rate'],30); self.assertEqual(b['earnings_per_event'],150)
        with self.assertRaises(ValueError):
            parse_profile(html.replace('<td>10</td>','<td>2</td>'),p['source'])

    def test_snapshot_provenance_scope_and_integrity(self):
        data = load_dataset()
        self.assertEqual(data['meta']['players'],79)
        self.assertEqual(data['meta']['season_count'],813)
        for p in data['players']:
            self.assertTrue(p['source'].startswith('https://www.pba.com/players/'))
            self.assertEqual(len(p['seasons']),len({s['year'] for s in p['seasons']}))
            self.assertTrue(all(s['year']<=2025 for s in p['seasons']))
            for s in p['seasons']:
                if s['average'] is not None:self.assertGreater(s['average'],0)
        self.assertEqual(len(validate_presets(factory_presets())),5)

    def test_theme_and_three_sport_links_do_not_write_storage(self):
        for theme in ('bowling_year_two','bowling-year-two','baseball_year_two','qb_year_two'):
            r=self.client.get('/?theme='+theme)
            self.assertEqual(r.status_code,200)
            for sport in ('bowling','baseball','qb'):
                self.assertIn(('?theme='+sport+'_year_two').encode(),r.data)
        self.assertFalse(preset_db('bowling').exists())

    def test_shared_saves_conflict_validation_and_sport_isolation(self):
        before=self.client.get('/api/bowling-presets').json
        bb=self.client.get('/api/baseball-presets').json
        edited=json.loads(json.dumps(before['presets']));edited[0]['label']='My bowling story'
        payload={'presets':edited,'revision':before['revision']}
        self.assertEqual(self.client.post('/api/bowling-presets/validate',json=payload).status_code,200)
        self.assertFalse(preset_db('bowling').exists())
        result=self.client.put('/api/bowling-presets',json=payload)
        self.assertEqual(result.status_code,200)
        self.assertEqual(self.client.get('/api/bowling-presets').json['presets'][0]['label'],'My bowling story')
        self.assertEqual(self.client.put('/api/bowling-presets',json=payload).status_code,409)
        self.assertEqual(self.client.get('/api/baseball-presets').json['revision'],bb['revision'])
        edited[0]['settings']['ids']=['not-a-player']
        self.assertEqual(self.client.post('/api/bowling-presets/validate',json={'presets':edited}).status_code,400)

    def test_corrupt_storage_is_not_overwritten(self):
        path=preset_db('bowling');path.write_bytes(b'not a database')
        self.assertEqual(self.client.get('/api/bowling-presets').status_code,503)
        self.assertEqual(self.client.put('/api/bowling-presets',json={'presets':factory_presets(),'revision':'x'}).status_code,503)
        self.assertEqual(path.read_bytes(),b'not a database')

    def test_preset_migration_upgrades_only_untouched_slots(self):
        old=legacy_factory_presets()
        self.assertEqual(validate_presets(old),factory_presets())
        old[0]['label']='My custom story'
        old[0]['settings']['height']='tall'
        result=validate_presets(old)
        self.assertEqual(result[0]['label'],'My custom story')
        self.assertEqual(result[0]['settings']['height'],'tall')
        self.assertEqual(result[0]['settings']['layout'],'separate')
        self.assertEqual(result[0]['settings']['timeline'],'career')
        self.assertEqual(result[1]['settings']['layout'],'overlay')
        self.assertEqual(result[1]['settings']['timeline'],'calendar')
        current=factory_presets();current[0]['settings']['timeline']='not-real'
        with self.assertRaises(ValueError):validate_presets(current)


if __name__=='__main__':unittest.main()
