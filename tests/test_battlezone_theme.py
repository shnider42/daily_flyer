import unittest
from daily_flyer.renderer import build_html
from daily_flyer.themes.battlezone_1980 import build_theme_page
from daily_flyer.theme_loader import load_theme


class BattlezoneThemeTests(unittest.TestCase):
    def test_dfe_theme_validation(self):
        self.assertIs(load_theme("battlezone_1980").build_theme_page, build_theme_page)

    def test_fixed_replay_is_deterministic(self):
        first = build_html(build_theme_page("2026-10-29", -1))
        self.assertEqual(first, build_html(build_theme_page("2026-10-29", -1)))
        self.assertIn('data-seed="4294967295"', first)
        self.assertIn('data-date-policy="fixed"', first)

    def test_live_page_contains_complete_game(self):
        html = build_html(build_theme_page())
        for marker in ('data-date-policy="live"', 'id="bz-precision"', 'id="bz-results"', 'function spawnSaucer', 'function refreshDaily'):
            self.assertIn(marker, html)
        self.assertNotIn('__SEED__', html)
        self.assertNotIn('__DATE__', html)

    def test_invalid_date_rejected(self):
        with self.assertRaises(ValueError):
            build_theme_page("not-a-date")


if __name__ == "__main__":
    unittest.main()
