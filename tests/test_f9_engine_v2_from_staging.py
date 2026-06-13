from __future__ import annotations

from datetime import date
import unittest

from daily_flyer_v2 import build_flyer_html
from daily_flyer_v2.data.f9_items import (
    F9_ITEM_CATEGORY_ORDER,
    load_f9_item_library,
    select_f9_item_type_cards,
)
from web import app


class F9EngineV2FromStagingTests(unittest.TestCase):
    def test_f9_hub_builds_arena_html_without_signup_by_default(self) -> None:
        html = build_flyer_html(product="f9_hub", date_str="2026-06-12", seed=9)

        self.assertIn("F9 Hub", html)
        self.assertNotIn("F9 Daily", html)
        self.assertIn("/f9-logo-debug.png?v=transparent-3", html)
        self.assertNotIn("/static/f9_logo.svg", html)
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
        self.assertIn("daily", html)
        self.assertIn("fa-feature-grid", html)
        self.assertIn("has-bg", html)
        self.assertIn("--card-bg:url", html)
        self.assertIn("fa-card-image-wrap", html)
        self.assertIn("fa-card-image", html)
        self.assertIn("/static/f9/items/", html)
        self.assertGreaterEqual(html.count("of the day"), 4)
        self.assertNotIn("Garage pick", html)
        self.assertNotIn("/f9-item-image/", html)
        self.assertNotIn("Special:FilePath", html)
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

    def test_f9_logo_debug_route_serves_transparent_png(self) -> None:
        client = app.test_client()
        response = client.get("/f9-logo-debug.png")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate, max-age=0")
        self.assertIn("X-F9-Logo-Bytes", response.headers)
        # PNG IHDR color type byte: 6 = truecolor with alpha, 4 = grayscale with alpha.
        self.assertIn(response.data[25], {4, 6})

    def test_f9_items_load_from_categorized_manifest(self) -> None:
        items = load_f9_item_library()
        categories = {item["category"] for item in items}

        self.assertGreaterEqual(len(items), 400)
        self.assertTrue(set(F9_ITEM_CATEGORY_ORDER).issubset(categories))
        self.assertTrue(all(item["image_url"].startswith("/static/f9/items/") for item in items))
        self.assertTrue(any(item["name"] == "Octane" and item["category"] == "bodies" for item in items))
        self.assertTrue(any(item["name"] == "20XX" and item["category"] == "decals" for item in items))
        self.assertFalse(any("Special:FilePath" in item["image_url"] for item in items))

    def test_f9_item_type_cards_pick_four_daily_categories(self) -> None:
        cards = select_f9_item_type_cards(date(2026, 6, 12), seed=9, count=4)
        categories = {card["category"] for card in cards}

        self.assertEqual(len(cards), 4)
        self.assertEqual(len(categories), 4)
        self.assertTrue(all(card["label"].endswith("of the day") for card in cards))
        self.assertTrue(all(card["image_url"].startswith("/static/f9/items/") for card in cards))

    def test_f9_item_background_assets_are_served(self) -> None:
        client = app.test_client()
        for filename in ["bodies/01_armadillo.png", "decals/01_20xx.png", "boosts/01_standard.png"]:
            response = client.get(f"/static/f9/items/{filename}")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.data.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_f9_daily_alias_still_renders_hub(self) -> None:
        html = build_flyer_html(product="f9_daily", date_str="2026-06-12", seed=9)

        self.assertIn("F9 Hub", html)
        self.assertIn("F9 Command Board", html)
        self.assertIn("/f9-logo-debug.png?v=transparent-3", html)
        self.assertIn("/static/f9/items/", html)
        self.assertGreaterEqual(html.count("of the day"), 4)
        self.assertNotIn("Garage pick", html)
        self.assertNotIn("/f9-item-image/", html)
        self.assertNotIn("/static/f9_logo.svg", html)
        self.assertNotIn("F9 Daily", html)

    def test_v2_route_renders_f9_daily_alias(self) -> None:
        client = app.test_client()
        response = client.get("/v2?product=f9-daily&date=2026-06-12&seed=9")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"F9 Hub", response.data)
        self.assertIn(b"/f9-logo-debug.png?v=transparent-3", response.data)
        self.assertIn(b"/static/f9/items/", response.data)
        self.assertIn(b"of the day", response.data)
        self.assertNotIn(b"Garage pick", response.data)
        self.assertNotIn(b"/f9-item-image/", response.data)
        self.assertNotIn(b"/static/f9_logo.svg", response.data)
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
