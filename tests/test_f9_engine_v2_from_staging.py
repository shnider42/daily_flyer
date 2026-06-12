from __future__ import annotations

import unittest

from daily_flyer_v2 import build_flyer_html
from web import app


class F9EngineV2FromStagingTests(unittest.TestCase):
    def test_f9_hub_builds_arena_html_without_signup_by_default(self) -> None:
        html = build_flyer_html(product="f9_hub", date_str="2026-06-12", seed=9)

        self.assertIn("F9 Hub", html)
        self.assertNotIn("F9 Daily", html)
        self.assertIn("/static/f9_logo.svg", html)
        self.assertNotIn("F9 Community Control", html)
        self.assertNotIn("F9 match control", html)
        self.assertIn("Rocket League daily hub", html)
        self.assertIn("Space Grotesk", html)
        self.assertIn("HT 2026", html)
        self.assertIn("fa-boost-meter", html)
        self.assertIn("data-fa-boost-value", html)
        self.assertIn("fa-lane-option", html)
        self.assertIn("grid-template-columns:repeat(4,minmax(0,1fr))", html)
        self.assertIn("width:min(1560px", html)
        self.assertIn("fa-slant-tab", html)
        self.assertIn("F9 Command Board", html)
        self.assertIn("Position board", html)
        self.assertIn("Featured cards", html)
        self.assertEqual(html.count("Featured cards"), 1)
        self.assertIn("This Week in Rocket League History", html)
        self.assertIn("June 10, 2018", html)
        self.assertIn("Team Dignitas", html)
        self.assertIn("sourced", html)
        self.assertIn("Workshop Map of the Week", html)
        self.assertIn("daily", html)
        self.assertIn("weekly", html)
        self.assertIn("fa-feature-grid", html)
        self.assertIn("has-bg", html)
        self.assertIn("--card-bg:url", html)
        self.assertIn("fa-card-image-wrap", html)
        self.assertIn("fa-card-image", html)
        self.assertIn("Special:FilePath", html)
        self.assertIn("RLCS Daily", html)
        self.assertIn("data-fa-rlcs-answer", html)
        self.assertIn("fa-choice-grid", html)
        self.assertIn("Copy result", html)
        self.assertIn("Rocket League Jiporady", html)
        self.assertIn("Kickoff Call", html)
        self.assertIn("Queue Focus", html)
        self.assertIn("data-fa-jiporady-board", html)
        self.assertIn("class=\"orange one\"", html)
        self.assertIn("class=\"orange two\"", html)
        self.assertIn("class=\"blue three\"", html)
        self.assertIn("class=\"blue four\"", html)
        self.assertLess(html.index("Featured cards"), html.index("F9 Command Board"))
        self.assertLess(html.index("RLCS Daily"), html.index("F9 Command Board"))
        self.assertNotIn("Guess the Pro", html)
        self.assertNotIn("fa-hero:after", html)
        self.assertNotIn("fa-stage--queue", html)
        self.assertNotIn("Open signup hub", html)
        self.assertNotIn("github.com/shnider42", html)
        self.assertNotIn("fa-main-menu", html)
        self.assertNotIn("ROCKET PASS", html)
        self.assertNotIn("fa-scoreboard", html)
        self.assertNotIn("hero-pill", html)

    def test_f9_logo_static_asset_is_vector_and_not_embedded_png(self) -> None:
        client = app.test_client()
        response = client.get("/static/f9_logo.svg")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"<svg", response.data)
        self.assertIn(b"f9-orange", response.data)
        self.assertIn(b"f9-cream", response.data)
        self.assertNotIn(b"data:image/png", response.data)

    def test_f9_daily_alias_still_renders_hub(self) -> None:
        html = build_flyer_html(product="f9_daily", date_str="2026-06-12", seed=9)

        self.assertIn("F9 Hub", html)
        self.assertIn("F9 Command Board", html)
        self.assertIn("/static/f9_logo.svg", html)
        self.assertNotIn("F9 Daily", html)

    def test_v2_route_renders_f9_daily_alias(self) -> None:
        client = app.test_client()
        response = client.get("/v2?product=f9-daily&date=2026-06-12&seed=9")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"F9 Hub", response.data)
        self.assertIn(b"/static/f9_logo.svg", response.data)
        self.assertNotIn(b"F9 Community Control", response.data)
        self.assertNotIn(b"F9 match control", response.data)
        self.assertNotIn(b"F9 Daily", response.data)
        self.assertIn(b"Featured cards", response.data)
        self.assertIn(b"F9 Command Board", response.data)
        self.assertIn(b"RLCS Daily", response.data)
        self.assertIn(b"Kickoff Call", response.data)
        self.assertIn(b"Queue Focus", response.data)
        self.assertIn(b"HT 2026", response.data)
        self.assertIn(b"has-bg", response.data)
        self.assertIn(b"fa-card-image", response.data)
        self.assertIn(b"fa-boost-meter", response.data)
        self.assertIn(b"fa-slant-tab", response.data)
        self.assertNotIn(b"Open signup hub", response.data)
        self.assertNotIn(b"github.com/shnider42", response.data)
        self.assertNotIn(b"fa-main-menu", response.data)
        self.assertNotIn(b"ROCKET PASS", response.data)
        self.assertNotIn(b"fa-scoreboard", response.data)


if __name__ == "__main__":
    unittest.main()
