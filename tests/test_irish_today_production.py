from __future__ import annotations

import unittest

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.themes import irish_today_improved
from web import app


class IrishTodayProductionTests(unittest.TestCase):
    DATE = "2026-04-24"
    SEED = 7

    def _build_context(self):
        return build_daily_page(
            theme_name="irish_today_production",
            date_str=self.DATE,
            seed=self.SEED,
        )

    def test_daily_edition_has_eight_cards_and_one_of_each_anchor(self) -> None:
        context = self._build_context()
        card_types = [card.card_type for card in context.cards]

        self.assertEqual(len(card_types), irish_today_improved.CARD_COUNT)
        for required_type in irish_today_improved.REQUIRED_CARD_TYPES:
            self.assertEqual(
                card_types.count(required_type),
                1,
                msg=f"Expected exactly one {required_type!r} anchor card: {card_types}",
            )

    def test_fixed_date_and_seed_produce_stable_ordering(self) -> None:
        first = self._build_context()
        second = self._build_context()

        first_signature = [
            (card.card_type, card.title, card.image_url)
            for card in first.cards
        ]
        second_signature = [
            (card.card_type, card.title, card.image_url)
            for card in second.cards
        ]

        self.assertEqual(first_signature, second_signature)

    def test_title_image_and_clarity_css_are_present(self) -> None:
        context = self._build_context()
        html = build_html(context)

        self.assertEqual(context.metadata.get("irish_today_release"), "clarity-v1")
        self.assertTrue(
            str(context.metadata.get("header_title_image", "")).endswith("irish_today_title.png")
        )
        self.assertIn('class="hero-title-image"', html)
        self.assertIn("irish_today_title.png", html)
        self.assertIn("Irish Today production clarity layer", html)
        self.assertIn("Card family: editorial / reference content", html)
        self.assertIn("Card family: photographic features", html)
        self.assertIn("Card family: interactive / game cards", html)
        self.assertIn("@media (prefers-reduced-motion: reduce)", html)

    def test_clarity_override_follows_the_old_hover_fade(self) -> None:
        html = build_html(self._build_context())

        old_fade = html.find("opacity: 0.78")
        clarity_layer = html.find("Irish Today production clarity layer")
        full_strength_override = html.find(
            "main.it-masonry-ready > .card {",
            clarity_layer,
        )

        self.assertGreaterEqual(old_fade, 0)
        self.assertGreater(clarity_layer, old_fade)
        self.assertGreater(full_strength_override, clarity_layer)
        self.assertIn("opacity: 1 !important", html[full_strength_override:])
        self.assertIn("filter: none !important", html[full_strength_override:])

    def test_public_route_uses_production_without_visual_lab_controls(self) -> None:
        client = app.test_client()
        response = client.get(
            f"/?theme=irish_today&date={self.DATE}&seed={self.SEED}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Irish Today production clarity layer", response.data)
        self.assertIn(b"irish_today_title.png", response.data)
        self.assertNotIn(b"it-visual-lab-controls", response.data)
        self.assertNotIn(b"Per-card visual controls", response.data)


if __name__ == "__main__":
    unittest.main()
