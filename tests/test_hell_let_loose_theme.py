from __future__ import annotations

import unittest

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html


class HellLetLooseThemeTests(unittest.TestCase):
    def test_theme_builds_eight_ordered_cards(self) -> None:
        context = build_daily_page("hell_let_loose", date_str="2026-07-23", seed=7)

        self.assertEqual(context.header_title, "HELL LET LOOSE // FIELD BRIEF")
        self.assertEqual(len(context.cards), 8)
        self.assertEqual(
            [card.card_type for card in context.cards],
            [
                "hll_orders",
                "hll_map",
                "hll_mechanic",
                "hll_role",
                "hll_weapon",
                "hll_loadout",
                "hll_history",
                "hll_community",
            ],
        )
        self.assertIn("July 2021", context.cards[6].title)

    def test_weekly_cards_remain_stable_within_week(self) -> None:
        first = build_daily_page("hell_let_loose", date_str="2026-07-20", seed=1)
        second = build_daily_page("hell_let_loose", date_str="2026-07-24", seed=99)

        self.assertEqual(first.cards[3].title, second.cards[3].title)
        self.assertEqual(first.cards[5].title, second.cards[5].title)

    def test_render_uses_distinct_field_order_visuals(self) -> None:
        context = build_daily_page("hell_let_loose", date_str="2026-07-23", seed=7)
        html = build_html(context)

        self.assertIn("OPERATIONS ORDER", html)
        self.assertIn("MAP BRIEFING", html)
        self.assertIn("SQUAD LOADOUT OF THE WEEK", html)
        self.assertIn("repeating-linear-gradient", html)
        self.assertIn("card--hll_orders", html)
        self.assertIn("clip-path:polygon", html)
        self.assertIn("theme-color", html)


if __name__ == "__main__":
    unittest.main()
