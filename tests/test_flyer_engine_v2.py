from __future__ import annotations

import unittest

from daily_flyer_v2 import build_flyer_html
from web import app


class FlyerEngineV2Tests(unittest.TestCase):
    def test_irish_today_v2_builds_publication_html(self) -> None:
        html = build_flyer_html(product="irish_today", date_str="2026-04-24", seed=7)

        self.assertIn("Flyer Engine v2 proof", html)
        self.assertIn("Irish Today", html)
        self.assertIn("One word, one story", html)
        self.assertIn("v2-lead", html)
        self.assertIn("v2-note", html)
        self.assertIn("Easter Rising", html)
        self.assertNotIn("class=\"card", html)
        self.assertNotIn("hero-pill", html)

    def test_v2_route_renders_irish_today(self) -> None:
        client = app.test_client()
        response = client.get("/v2?product=irish_today&date=2026-04-24&seed=7")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Flyer Engine v2 proof", response.data)
        self.assertIn(b"Irish Today", response.data)
        self.assertIn(b"v2-masthead", response.data)

    def test_v2_route_rejects_unknown_product(self) -> None:
        client = app.test_client()
        response = client.get("/v2?product=unknown")

        self.assertEqual(response.status_code, 400)
        self.assertIn(b"Unknown Flyer Engine v2 product", response.data)


if __name__ == "__main__":
    unittest.main()
