from __future__ import annotations

import unittest

from daily_flyer_v2 import build_flyer_html
from web import app


class F9EngineV2FromStagingTests(unittest.TestCase):
    def test_f9_daily_builds_arena_html(self) -> None:
        html = build_flyer_html(product="f9_daily", date_str="2026-06-12", seed=9)

        self.assertIn("F9 Daily", html)
        self.assertIn("fa-boost-meter", html)
        self.assertIn("data-fa-boost-value", html)
        self.assertIn("fa-lane-option", html)
        self.assertIn("fa-slant-tab", html)
        self.assertIn("fa-feature-grid", html)
        self.assertIn("fa-stage--queue", html)
        self.assertIn("fa-stage--broadcast", html)
        self.assertIn("Guess the Pro", html)
        self.assertIn("Rocket League Jiporady", html)
        self.assertIn("Signup hub", html)
        self.assertNotIn("fa-main-menu", html)
        self.assertNotIn("ROCKET PASS", html)
        self.assertNotIn("fa-scoreboard", html)
        self.assertNotIn("hero-pill", html)

    def test_v2_route_renders_f9_daily_alias(self) -> None:
        client = app.test_client()
        response = client.get("/v2?product=f9-daily&date=2026-06-12&seed=9")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"F9 Daily", response.data)
        self.assertIn(b"fa-boost-meter", response.data)
        self.assertIn(b"fa-slant-tab", response.data)
        self.assertNotIn(b"fa-main-menu", response.data)
        self.assertNotIn(b"ROCKET PASS", response.data)
        self.assertNotIn(b"fa-scoreboard", response.data)


if __name__ == "__main__":
    unittest.main()
