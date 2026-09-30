import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from web import app
from daily_flyer.bowling_explorer.data import load_dataset, load_usbc_dataset
from daily_flyer.bowling_explorer.presets import factory_presets, legacy_factory_presets, validate_presets
from daily_flyer.preset_storage import preset_db
from scripts.build_bowling_data import parse_profile
from scripts.build_usbc_data import parse_daily, parse_profile as parse_usbc_profile


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

    def test_usbc_snapshot_provenance_and_verified_averages(self):
        data=load_usbc_dataset()
        self.assertEqual(data['meta']['players'],832)
        self.assertEqual(data['meta']['season_count'],1521)
        self.assertEqual(len(data['profiles']),26)
        self.assertEqual(len({p['id'] for p in data['players']}),832)
        complete=0
        for p in data['players']:
            self.assertEqual(p['dataset'],'usbc')
            self.assertEqual(len(p['seasons']),len({r['year'] for r in p['seasons']}))
            for r in p['seasons']:
                self.assertIn(r['year'],range(2022,2027))
                self.assertTrue(r['source'].startswith(('https://scores.bowl.com/','https://images.bowl.com/')))
                self.assertLessEqual(r['finish'],r['field_size'])
                self.assertNotIn('events',r)  # A tournament entry is not a PBA event-count season.
                if r['average'] is not None:
                    complete+=1
                    self.assertEqual(r['games'],30)
                    self.assertAlmostEqual(r['average'],r['pinfall']/30,places=5)
                else:self.assertIsNone(r['games'])
        self.assertEqual(complete,data['meta']['complete_averages'])
        winners={(r['year'],p['division']):p['name'] for p in data['players'] for r in p['seasons'] if r['finish']==1}
        self.assertEqual(winners[2026,'men'],'Bryce Oliver')
        self.assertEqual(winners[2026,'women'],'Elizabeth Teuber')
        self.assertEqual(winners[2025,'men'],'Ryan Barnes')
        self.assertEqual(winners[2025,'women'],'Crystal Elliott')

    def test_usbc_daily_extraction_handles_wrapping_and_withdrawals(self):
        rows=[dict(name='Nick Pate'),dict(name='Dawn Convay'),dict(name='Mike Anderson')]
        text=''' 1 Nick Pate P Inver Grove Heights,200MN 210 220 230 240 250 1350 225.00
 2 Dawn Convay (WD) AM Las Vegas, NV 1 1 1.00 -199
 3 Mike Anderson AM Olathe, KS 203 171 150 180 225 0 929'''
        result=parse_daily(text,rows)
        self.assertEqual(result['nickpate'],[200,210,220,230,240,250])
        self.assertIsNone(result['dawnconvay'])
        self.assertIsNone(result['mikeanderson'])
        result=parse_daily(text.replace('1350','1351'),rows)
        self.assertIsNone(result['nickpate'])
        bio=parse_usbc_profile('<table><td>Bowler Name<br><strong>Resides:</strong> Town<br><strong>Throws:</strong> Two-handed (left)</td></table><p>Years on Team USA (2): 2025-2026</p><p>- 2026 tournament result</p>','https://bowl.com/team-usa/test')
        self.assertEqual(bio['team_usa_years'],'2025-2026')
        self.assertEqual(bio['hand'],'L')

    def test_usbc_presets_remember_source_and_reject_mixed_statistics(self):
        presets=factory_presets()
        presets[0]['settings'].update(dataset='usbc',threshold='30',division='women',ids=['usbc-women-juliabond'])
        result=self.client.put('/api/bowling-presets',json={'presets':presets,'revision':self.client.get('/api/bowling-presets').json['revision']})
        self.assertEqual(result.status_code,200)
        self.assertEqual(self.client.get('/api/bowling-presets').json['presets'][0]['settings']['dataset'],'usbc')
        for change in [dict(metric='cash_rate'),dict(threshold='10'),dict(ids=['ej-tackett'])]:
            broken=json.loads(json.dumps(presets));broken[0]['settings'].update(change)
            self.assertEqual(self.client.post('/api/bowling-presets/validate',json={'presets':broken}).status_code,400)
        old=factory_presets()
        for p in old:
            p['settings'].pop('dataset');p['settings'].pop('division')
        self.assertEqual(validate_presets(old),factory_presets())
        # Every slot can retain a large USBC comparison and still round-trip.
        for p in presets:
            p['settings'].update(dataset='usbc',threshold='30',metric='average',outcome='average',ids=[b['id'] for b in load_usbc_dataset()['players']])
        self.assertEqual(self.client.post('/api/bowling-presets/validate',json={'presets':presets}).status_code,200)


if __name__=='__main__':unittest.main()
