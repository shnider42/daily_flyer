"""The optional comparison preview must reuse data and leave presets alone."""
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from daily_flyer.qb_explorer.data import load_dataset
from daily_flyer.year_two_sports import sport_switch
from web import app


class PreviewTests(unittest.TestCase):
    def test_preview_and_alias_reuse_the_exact_existing_dataset(self):
        for theme in ("qb_year_two_preview", "qb-year-two-preview"):
            response = app.test_client().get("/?theme=" + theme)
            self.assertEqual(response.status_code, 200)
            html = response.get_data(as_text=True)
            payload = json.loads(re.search(r'<script type="application/json" id="qp-data">(.*?)</script>', html, re.S)[1])
            payload.pop("build")
            self.assertEqual(payload, load_dataset())
            self.assertIn('id="qp-picker"', html)
            self.assertIn('id="qp-table-wrap"', html)
            self.assertNotIn('id="yt-levels"', html)
            self.assertNotIn("qb-year-two-v1", html)
            self.assertNotIn("api/qb-presets", html)

    def test_viewing_preview_never_creates_a_preset_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"YEAR_TWO_DATA_DIR": tmp, "QB_PRESET_DB": tmp + "/qb.sqlite3"}):
                self.assertEqual(app.test_client().get("/?theme=qb_year_two_preview").status_code, 200)
                self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_three_sport_navigation_and_legacy_detail_controls_remain(self):
        self.assertEqual(sport_switch("football").count('<a href="?theme='), 3)
        self.assertIn('id="yt-levels"', sport_switch("football"))
        self.assertNotIn('id="yt-levels"', sport_switch("football", detail_controls=False))
        html = app.test_client().get("/?theme=qb_year_two").get_data(as_text=True)
        self.assertIn('href="?theme=qb_year_two_preview"', html)
        self.assertIn('id="yt-levels"', html)


if __name__ == "__main__":
    unittest.main()
