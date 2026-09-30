import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from web import app
from daily_flyer.baseball_explorer.data import batting_metrics, pitching_metrics, load_dataset, total
from daily_flyer.baseball_explorer.presets import factory_presets, validate_presets
from scripts.build_baseball_data import aggregate, BAT, PITCH


class BaseballDataTests(unittest.TestCase):
    def test_rates_are_recomputed_after_trade_stints(self):
        rows=[{**{v:'0' for v in BAT.values()},'AB':'100','H':'40','HR':'10','BB':'20'},
              {**{v:'0' for v in BAT.values()},'AB':'300','H':'60','HR':'5','BB':'10'}]
        r=batting_metrics(aggregate(rows,BAT))
        self.assertEqual(r['pa'],430)
        self.assertEqual(r['avg'],.25)
        self.assertAlmostEqual(r['ops'],130/430+145/400)
        self.assertNotEqual(r['avg'],(.4+.2)/2)

    def test_pitcher_outs_are_not_baseball_decimal_innings(self):
        r=pitching_metrics({'outs':16,'er':2,'h':4,'bb':1,'so':6,'hr':0,'bfp':20})
        self.assertAlmostEqual(r['ip'],5+1/3)
        self.assertAlmostEqual(r['era'],54/16)
        self.assertAlmostEqual(r['whip'],15/16)
        self.assertEqual(r['k_bb_pct'],25)
        self.assertIsNone(pitching_metrics({'outs':0,'er':0,'bb':0,'h':0})['era'])

    def test_missing_components_and_zero_denominators_stay_missing(self):
        r={key:0 for key in BAT};r.update(ab=100,h=20,sf=None)
        actual=batting_metrics(r)
        self.assertIsNone(actual['pa']);self.assertIsNone(actual['ops'])
        self.assertEqual(actual['avg'],.2);self.assertIsNone(actual['sb_pct'])
        self.assertIsNone(total([{'h':5},{'h':None}],'h'))

    def test_snapshot_integrity_and_two_way_clocks(self):
        data=load_dataset()
        for role,count in [('batting',2852),('pitching',3802)]:
            block=data[role];self.assertEqual(len(block['players']),count)
            self.assertEqual(len({p['id'] for p in block['players']}),count)
            for p in block['players']:
                seasons=[dict(zip(block['columns'],r)) for r in p['seasons']]
                self.assertGreaterEqual(p['first'],1954)
                self.assertEqual(seasons[0]['year'],p['first'])
                self.assertTrue(seasons[0]['qualifies'])
                self.assertEqual(len(seasons),len({s['year'] for s in seasons}))
                self.assertLessEqual(p['last'],2025)
                if p['hof']:self.assertLessEqual(p['hof'],2025)
        p=next(p for p in data['pitching']['players'] if p['id']=='ohtansh01')
        years=[s[0] for s in p['seasons']]
        self.assertEqual(p['first'],2018);self.assertNotIn(2019,years)
        p=next(p for p in data['batting']['players'] if p['id']=='ortizda01')
        seasons=[dict(zip(data['batting']['columns'],r)) for r in p['seasons']]
        self.assertEqual(p['first'],1998)
        self.assertEqual(seasons[1]['pa'],25)
        self.assertEqual(seasons[1]['ops'],.2)
        self.assertFalse(seasons[1]['qualifies'])

    def test_league_baselines_match_independent_2025_team_totals(self):
        # Independently cross-checked against Lahman's Teams.csv, not an average
        # of player rates. Zero-out pitchers' earned runs must still contribute.
        data=load_dataset()
        for role,pid,expected in [('batting','judgeaa01',.718960),('pitching','ohtansh01',4.158491)]:
            block=data[role];p=next(p for p in block['players'] if p['id']==pid)
            s=next(dict(zip(block['columns'],s)) for s in p['seasons'] if s[0]==2025)
            actual=s['ops']-s['relative_ops'] if role=='batting' else s['era']+s['relative_era']
            self.assertAlmostEqual(actual,expected,places=5)


class BaseballApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'presets.sqlite3'
        self.env=patch.dict('os.environ',{'BASEBALL_PRESET_DB':str(self.path),'QB_PRESET_DB':str(Path(self.temp.name)/'qb.sqlite3')})
        self.env.start();self.client=app.test_client()

    def tearDown(self):
        self.env.stop();self.temp.cleanup()

    def test_defaults_reads_do_not_write_and_sport_pages_are_separate(self):
        self.assertEqual(len(validate_presets(factory_presets())),5)
        self.assertEqual(self.client.get('/api/baseball-presets').status_code,200)
        self.assertFalse(self.path.exists())
        b=self.client.get('/?theme=baseball_year_two')
        q=self.client.get('/?theme=qb_year_two')
        self.assertEqual(b.status_code,200);self.assertEqual(q.status_code,200)
        self.assertIn(b'baseball_year_two',q.data)
        self.assertIn(b'id="bb-app"',b.data);self.assertNotIn(b'id="qb-app"',b.data)
        self.assertNotIn(b'id="bb-app"',q.data)
        self.assertIn(b'CC BY-SA 3.0',b.data)
        self.assertEqual(self.client.get('/api/baseball-data/invalid').status_code,404)

    def test_shared_save_conflict_and_football_isolation(self):
        initial=self.client.get('/api/baseball-presets').json
        qb_before=self.client.get('/api/qb-presets').json['presets']
        draft=deepcopy(initial['presets']);draft[0]['label']='Custom OPS view'
        saved=self.client.put('/api/baseball-presets',json={'presets':draft,'revision':initial['revision']})
        self.assertEqual(saved.status_code,200)
        self.assertEqual(app.test_client().get('/api/baseball-presets').json['presets'],draft)
        stale=self.client.put('/api/baseball-presets',json={'presets':initial['presets'],'revision':initial['revision']})
        self.assertEqual(stale.status_code,409)
        self.assertEqual(self.client.get('/api/q-presets').status_code,404)
        self.assertEqual(self.client.get('/api/qb-presets').json['presets'],qb_before)

    def test_bounded_validation_and_text_stays_inert(self):
        draft=factory_presets();draft[0]['label']='</script><script>alert(1)</script>'
        valid=self.client.post('/api/baseball-presets/validate',json={'presets':draft})
        self.assertEqual(valid.status_code,200)
        initial=self.client.get('/api/baseball-presets').json
        self.client.put('/api/baseball-presets',json={'presets':draft,'revision':initial['revision']})
        self.assertNotIn(b'</script><script>alert(1)',self.client.get('/?theme=baseball_year_two').data)
        for key,value in [('count',5000),('metric','relative_anya'),('ids',['BradTo00']),('qual2','yes')]:
            bad=factory_presets();bad[0]['settings'][key]=value
            self.assertEqual(self.client.post('/api/baseball-presets/validate',json={'presets':bad}).status_code,400,key)
        self.assertEqual(self.client.put('/api/baseball-presets',json={},headers={'Origin':'https://elsewhere.test'}).status_code,400)
        self.assertEqual(self.client.put('/api/baseball-presets',data='{}').status_code,400)
        self.assertEqual(self.client.put('/api/baseball-presets',data=' '*1048577,content_type='application/json').status_code,400)

    def test_full_roster_presets_and_older_backups_round_trip(self):
        draft=factory_presets()
        ids=[p['id'] for p in load_dataset()['batting']['players']]
        for p in draft:
            p['settings'].update(role='batting',metric='ops',ids=ids,selection='all',count=len(ids))
        # Full-roster edits exceed the old 64-KiB request limit.
        self.assertGreater(len(json.dumps(draft)),65536)
        initial=self.client.get('/api/baseball-presets').json
        result=self.client.put('/api/baseball-presets',json={'presets':draft,'revision':initial['revision']})
        self.assertEqual(result.status_code,200)
        self.assertEqual(len(result.json['presets'][0]['settings']['ids']),2852)
        self.assertEqual(self.client.get('/api/baseball-presets').json['presets'],draft)
        old=factory_presets()
        for p in old:del p['settings']['display']
        migrated=self.client.post('/api/baseball-presets/validate',json={'presets':old})
        self.assertEqual(migrated.status_code,200)
        self.assertTrue(all(p['settings']['display']=='all' for p in migrated.json['presets']))

    def test_corrupt_storage_is_not_overwritten(self):
        self.path.write_text('not a SQLite database')
        r=self.client.get('/api/baseball-presets')
        self.assertEqual(r.status_code,503)
        self.assertIsNone(r.json['revision'])
        self.assertEqual(self.client.put('/api/baseball-presets',json={'presets':factory_presets(),'revision':'x'}).status_code,503)
        self.assertEqual(self.path.read_text(),'not a SQLite database')


if __name__=='__main__':unittest.main()
