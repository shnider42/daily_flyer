from __future__ import annotations

import unittest

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.themes import hell_let_loose


EXPECTED_CARD_TYPES = [
    "hll_orders",
    "hll_map",
    "hll_mechanic",
    "hll_role",
    "hll_weapon",
    "hll_loadout",
    "hll_radio",
    "hll_history",
    "hll_leadership",
]


class HellLetLooseThemeTests(unittest.TestCase):
    def test_theme_builds_complete_field_brief(self) -> None:
        context = build_daily_page(
            theme_name="hell_let_loose",
            date_str="2026-07-23",
            seed=7,
        )

        self.assertEqual(
            [card.card_type for card in context.cards],
            EXPECTED_CARD_TYPES,
        )
        self.assertEqual(context.metadata["theme_name"], "hell_let_loose")
        self.assertIn("header.hero::after", context.metadata["extra_css"])
        self.assertIn("Briefing controls", context.metadata["extra_js"])

    def test_weekly_cards_stay_stable_within_iso_week(self) -> None:
        monday = hell_let_loose.build_theme_page("2026-07-20", seed=1)
        thursday = hell_let_loose.build_theme_page("2026-07-23", seed=999)

        monday_by_type = {card.card_type: card for card in monday.cards}
        thursday_by_type = {card.card_type: card for card in thursday.cards}

        self.assertEqual(
            monday_by_type["hll_role"].title,
            thursday_by_type["hll_role"].title,
        )
        self.assertEqual(
            monday_by_type["hll_loadout"].title,
            thursday_by_type["hll_loadout"].title,
        )

    def test_seeded_daily_brief_is_deterministic(self) -> None:
        first = hell_let_loose.build_theme_page("2026-07-23", seed=42)
        second = hell_let_loose.build_theme_page("2026-07-23", seed=42)

        self.assertEqual(
            [(card.card_type, card.title, card.body) for card in first.cards],
            [(card.card_type, card.title, card.body) for card in second.cards],
        )

    def test_rendered_html_has_distinct_tactical_visual_system(self) -> None:
        context = hell_let_loose.build_theme_page("2026-07-23", seed=7)
        html = build_html(context)

        self.assertIn("HELL LET LOOSE // FIELD BRIEF", html)
        self.assertIn("COMMANDER'S INTENT // DAILY", html)
        self.assertIn("MAP OF THE DAY", html)
        self.assertIn("GAME MECHANIC OF THE DAY", html)
        self.assertIn("RADIO DISCIPLINE", html)
        self.assertIn("repeating-linear-gradient", html)
        self.assertIn("clip-path:polygon", html)
        self.assertIn("card--hll_orders", html)
        self.assertIn("hll-day-nav", html)
        self.assertIn("Current brief", html)
        self.assertIn("@media(max-width:720px)", html)

    def test_current_update_content_is_present_in_pools(self) -> None:
        map_titles = {item[0] for item in hell_let_loose.MAPS}
        weapon_titles = {item[0] for item in hell_let_loose.WEAPONS}

        self.assertIn("Juno Beach", map_titles)
        self.assertIn("Smolensk", map_titles)
        self.assertIn("Remagen", map_titles)
        self.assertIn("Lanchester SMG", weapon_titles)


if __name__ == "__main__":
    unittest.main()
