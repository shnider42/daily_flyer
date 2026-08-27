from __future__ import annotations

import unittest

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.themes import e46_owner_companion


EXPECTED_CARD_TYPES = [
    "e46_status",
    "e46_vehicle",
    "e46_triage",
    "e46_cooling",
    "e46_water_pump",
    "e46_vcg",
    "e46_baseline",
    "e46_sources",
]


class E46OwnerCompanionThemeTests(unittest.TestCase):
    def test_theme_builds_owner_companion_page(self) -> None:
        context = build_daily_page(
            theme_name="e46_owner_companion",
            date_str="2026-08-27",
            seed=42,
        )

        self.assertEqual([card.card_type for card in context.cards], EXPECTED_CARD_TYPES)
        self.assertEqual(context.metadata["theme_name"], "e46_owner_companion")
        self.assertIn("2004 BMW 330Ci", context.page_title)
        self.assertIn("M54B30", context.metadata["hero_kicker"])

    def test_theme_is_vehicle_state_driven_not_randomized(self) -> None:
        first = e46_owner_companion.build_theme_page("2026-08-27", seed=1)
        second = e46_owner_companion.build_theme_page("2026-08-27", seed=999)

        self.assertEqual(
            [(card.card_type, card.title, card.body) for card in first.cards],
            [(card.card_type, card.title, card.body) for card in second.cards],
        )

    def test_seeded_common_issue_families_are_present(self) -> None:
        titles = {issue["title"] for issue in e46_owner_companion.ISSUES}

        self.assertIn("Cooling System: Treat It as a System", titles)
        self.assertIn("Water Pump", titles)
        self.assertIn("Valve Cover Gasket", titles)

    def test_rendered_html_contains_triage_and_daily_driver_workflow(self) -> None:
        context = e46_owner_companion.build_theme_page("2026-08-27")
        html = build_html(context)

        self.assertIn("E46 OWNER COMPANION", html)
        self.assertIn("Get This Car Running First", html)
        self.assertIn("What Is the Car Doing?", html)
        self.assertIn("Cooling System: Treat It as a System", html)
        self.assertIn("Build a Known Reliability Baseline", html)
        self.assertIn("e46-symptom", html)
        self.assertIn("e46-path", html)
        self.assertIn("aria-pressed", html)
        self.assertIn("@media(max-width:720px)", html)

    def test_triage_starts_from_symptoms_not_assumed_failure(self) -> None:
        labels = {path["label"] for path in e46_owner_companion.TRIAGE_PATHS}

        self.assertIn("Overheating / temperature rising", labels)
        self.assertIn("Coolant leak / low coolant", labels)
        self.assertIn("Oil leak / burning-oil smell", labels)
        self.assertIn("Cranks / will not start", labels)


if __name__ == "__main__":
    unittest.main()
