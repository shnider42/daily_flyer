from __future__ import annotations

import unittest

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.themes import irish_today_improved
from web import app


class IrishTodayProductionTests(unittest.TestCase):
    DATE = "2026-04-24"
    SEED = 7
    REPRESENTATIVE_EDITIONS = (
        ("2026-01-01", 1),
        ("2026-03-17", 17),
        ("2026-04-24", 7),
        ("2026-08-04", 42),
    )

    def _build_context(self, date_str: str | None = None, seed: int | None = None):
        return build_daily_page(
            theme_name="irish_today_production",
            date_str=date_str or self.DATE,
            seed=self.SEED if seed is None else seed,
        )

    def test_daily_editions_have_eight_cards_and_one_of_each_anchor(self) -> None:
        for date_str, seed in self.REPRESENTATIVE_EDITIONS:
            with self.subTest(date=date_str, seed=seed):
                context = self._build_context(date_str=date_str, seed=seed)
                card_types = [card.card_type for card in context.cards]

                self.assertEqual(len(card_types), irish_today_improved.CARD_COUNT)
                for required_type in irish_today_improved.REQUIRED_CARD_TYPES:
                    self.assertEqual(
                        card_types.count(required_type),
                        1,
                        msg=f"Expected exactly one {required_type!r} anchor card: {card_types}",
                    )

    def test_fixed_dates_and_seeds_produce_stable_ordering(self) -> None:
        for date_str, seed in self.REPRESENTATIVE_EDITIONS:
            with self.subTest(date=date_str, seed=seed):
                first = self._build_context(date_str=date_str, seed=seed)
                second = self._build_context(date_str=date_str, seed=seed)

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

    def test_clarity_reset_overrides_legacy_position_shapes(self) -> None:
        html = build_html(self._build_context())

        legacy_second_card_shape = html.find("main > .card:nth-of-type(2) {")
        clarity_layer = html.find("Irish Today production clarity layer")
        equal_specificity_reset = html.find(
            "main > .card:nth-of-type(n) {",
            clarity_layer,
        )

        self.assertGreaterEqual(legacy_second_card_shape, 0)
        self.assertGreater(equal_specificity_reset, legacy_second_card_shape)
        reset_block = html[equal_specificity_reset : equal_specificity_reset + 500]
        self.assertIn("clip-path: none !important", reset_block)
        self.assertIn("border-radius: 22px !important", reset_block)
        self.assertIn("main > .card.card--county", html[clarity_layer:])
        self.assertIn("main > .card.card--hurling_game", html[clarity_layer:])

    def test_public_aliases_use_production_without_visual_lab_controls(self) -> None:
        client = app.test_client()
        aliases = (
            "irish_today",
            "irish_today_improved",
            "irish_today_improved_layout",
            "irish-today",
            "irish-today-improved",
            "irish-today-improved-layout",
        )

        for alias in aliases:
            with self.subTest(alias=alias):
                response = client.get(
                    f"/?theme={alias}&date={self.DATE}&seed={self.SEED}"
                )

                self.assertEqual(response.status_code, 200)
                self.assertIn(b"Irish Today production clarity layer", response.data)
                self.assertIn(b"irish_today_title.png", response.data)
                self.assertNotIn(b"it-visual-lab-controls", response.data)
                self.assertNotIn(b"Per-card visual controls", response.data)


if __name__ == "__main__":
    unittest.main()
