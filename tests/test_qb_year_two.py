from __future__ import annotations

import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from daily_flyer.qb_explorer.data import build_dataset, load_dataset, metrics, summarize_season
from scripts.build_qb_data import read_csv
from web import app
from daily_flyer.themes.qb_year_two import build_info


def row(year=2000, team="BUF", gs=12, **kwargs):
    return dict(id="TestAb00", name="Test QB", year=year, team=team, qb=True,
                g=16, gs=gs, cmp=200, att=350, yards=2500, td=15, **{"int": 10},
                sacks=20, sack_yards=100, **kwargs)


def dataset(rows):
    return build_dataset({"rows": rows, "meta": {"through": 2024}, "hall_of_fame": {}, "teams": {}})


class CohortTests(unittest.TestCase):
    def test_twelve_is_single_team_not_combined_and_totals_not_doubled(self):
        combined = summarize_season([row(team="2TM", gs=12), row(team="BUF", gs=6), row(team="NYJ", gs=6)])
        self.assertFalse(combined["qualifies"])
        self.assertEqual(combined["yards"], 2500)
        self.assertEqual(combined["att"], 350)
        self.assertTrue(summarize_season([row(team="2TM", gs=15), row(team="BUF", gs=12), row(team="NYJ", gs=3)])["qualifies"])

    def test_year_two_is_next_calendar_year_and_retains_low_starts(self):
        p = dataset([row(2000, gs=12), row(2001, gs=2), row(2003, gs=14)])["players"][0]
        self.assertEqual([s["starter_year"] for s in p["seasons"]], [1, 2, 4])
        self.assertEqual(p["seasons"][1]["gs"], 2)

    def test_pre_1970_career_does_not_reset_and_switching_teams_does_not_reset(self):
        p = dataset([row(1967), row(1970, team="NYJ"), row(1971, team="NYJ")])["players"][0]
        self.assertEqual(p["first"], 1967)
        self.assertEqual([s["starter_year"] for s in p["seasons"]], [4,5])

    def test_twelve_before_1970_alone_does_not_enter_cohort(self):
        self.assertEqual(dataset([row(1967),row(1970,gs=4)])["players"], [])

    def test_unknown_earlier_split_flags_anchor_uncertainty(self):
        p = dataset([row(2000,team="2TM"),row(2001)])["players"][0]
        self.assertTrue(p["anchor_uncertain"])

    def test_zero_attempts_produce_missing_rate_not_zero(self):
        r=row();r.update(att=0,cmp=0,yards=0,td=0,sacks=0,sack_yards=0);r["int"]=0
        m=metrics(r)
        self.assertIsNone(m["rating"])
        self.assertIsNone(m["anya"])
        self.assertIsNone(m["int_pct"])

    def test_source_parser_preserves_both_yardage_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"pfr.csv"
            path.write_text('Rk,Player,Yds,Sk,Yds\n1,Test QB,2500,20,100\n')
            parsed=read_csv(path)[0]
            self.assertEqual(parsed["Yds"],"2500")
            self.assertEqual(parsed["Yds.1"],"100")


class SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=load_dataset()
        cls.players={p["id"]:p for p in cls.data["players"]}

    def test_known_anchors_and_position_disambiguation(self):
        for pid,year in {"BradTo00":2001,"MariDa00":1984,"YounSt00":1986,"AlleJo02":2019,"MayeDr00":2024}.items():
            self.assertEqual(self.players[pid]["first"],year)
        self.assertNotIn("HardBr00",self.players)  # TE whose profile also mentions QB
        self.assertNotIn("MatteTo00",self.players)
        self.assertFalse(any(p["name"] in {"Bruce Hardy","Freddie Solomon","Tom Matte","Marlin Briscoe"} for p in self.data["players"]))

    def test_hall_of_fame_is_induction_not_prediction(self):
        self.assertEqual(self.players["MannPe00"]["hof"],2021)
        self.assertEqual(self.players["BreeDr00"]["hof"],2026)
        self.assertIsNone(self.players["BradTo00"]["hof"])

    def test_current_snapshot_is_complete_seasons_only(self):
        self.assertEqual(self.data["meta"]["through"],2024)
        self.assertFalse(any(s["year"]>2024 for p in self.data["players"] for s in p["seasons"]))
        mahomes=self.players["MahoPa00"]
        self.assertEqual(mahomes["seasons"][-1]["g"],16)
        # Joe Burrow led the full 2024 table: confirms the duplicate Yds fix.
        burrow=self.players["BurrJo01"]["seasons"][-1]
        self.assertEqual(burrow["yards"],4918)
        self.assertEqual(burrow["sack_yards"],278)

    def test_theme_and_hyphen_alias_render_without_external_fetches(self):
        client=app.test_client()
        for name in ["qb_year_two","qb-year-two"]:
            response=client.get('/?theme='+name)
            self.assertEqual(response.status_code,200)
            self.assertIn(b'qb-data',response.data)
            self.assertIn(b'Years by quarterback',response.data)
            self.assertNotIn(b'<script src=',response.data)

    def test_version_uses_deployed_commit_without_inventing_one(self):
        with patch.dict('os.environ', {'RENDER_GIT_COMMIT': 'a' * 40}):
            self.assertEqual(build_info()['commit'], 'a' * 40)
            response = app.test_client().get('/?theme=qb_year_two')
            self.assertIn(b'"version":"3.3.1"', response.data)
            self.assertIn(b'"commit":"' + b'a' * 40 + b'"', response.data)
        with patch.dict('os.environ', {'RENDER_GIT_COMMIT': ''}):
            self.assertIsNone(build_info()['commit'])
        with patch.dict('os.environ', {'RENDER_GIT_COMMIT': '<invalid>'}):
            self.assertIsNone(build_info()['commit'])


if __name__ == '__main__':
    unittest.main()
