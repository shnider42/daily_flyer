from __future__ import annotations

import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from daily_flyer.content_weighting import load_keyword_weight_profile, score_content_item
from daily_flyer.curated_fact_store import CuratedFact
from daily_flyer.theme_validation import ThemeValidationError, validate_theme_module
from web import app


VALID_GENERIC_CONFIG = {
    "page_title": "Example Theme",
    "header_title": "Example Theme ✨",
    "header_subtitle": "Example subtitle",
    "footer_text": "Built on Daily Flyer.",
    "hero_kicker": "Daily Flyer • Theme",
    "hero_summary_pill": "Curated cards and timely sources",
    "enable_word_card": True,
    "enable_phrase_card": True,
    "enable_history_card": True,
    "enable_did_you_know_card": True,
    "enable_sport_card": False,
    "enable_connection_card": False,
    "enable_county_card": False,
    "use_provider_sport": False,
    "use_provider_connection": False,
    "use_provider_county": False,
    "min_optional_cards": 1,
    "max_optional_cards": 2,
}


class ThemeValidationTests(unittest.TestCase):
    def test_generic_theme_with_required_content_passes(self) -> None:
        theme = SimpleNamespace(
            THEME_CONFIG=dict(VALID_GENERIC_CONFIG),
            WORDS=[{"native_text": "Word", "english": "Definition"}],
            PHRASES=[{"native_text": "Phrase", "english": "Meaning"}],
            HISTORY_THIS_DAY={"01-01": {"body": "Body", "source_url": "https://example.com"}},
            DID_YOU_KNOW=["Fact"],
            SPORTS_SPOTLIGHT=[],
            BACKGROUNDS=[],
            BACKGROUND_CADENCE="daily",
            ENABLE_DYNAMIC_WORD=False,
        )

        validate_theme_module(theme, "example_theme")

    def test_generic_theme_missing_phrase_pool_fails(self) -> None:
        theme = SimpleNamespace(
            THEME_CONFIG=dict(VALID_GENERIC_CONFIG),
            WORDS=[{"native_text": "Word", "english": "Definition"}],
            PHRASES=[],
            HISTORY_THIS_DAY={"01-01": {"body": "Body", "source_url": "https://example.com"}},
            DID_YOU_KNOW=["Fact"],
            SPORTS_SPOTLIGHT=[],
            BACKGROUNDS=[],
            BACKGROUND_CADENCE="daily",
            ENABLE_DYNAMIC_WORD=False,
        )

        with self.assertRaises(ThemeValidationError):
            validate_theme_module(theme, "bad_theme")

    def test_custom_theme_can_skip_generic_content_pools(self) -> None:
        theme = SimpleNamespace(
            THEME_CONFIG={
                "page_title": "Custom Theme",
                "header_title": "Custom Theme",
                "header_subtitle": "Custom subtitle",
                "footer_text": "Footer",
            },
            build_theme_page=lambda date_str=None, seed=None: None,
            BACKGROUNDS=[],
            BACKGROUND_CADENCE="daily",
        )

        validate_theme_module(theme, "custom_theme")

    def test_invalid_background_cadence_fails(self) -> None:
        theme = SimpleNamespace(
            THEME_CONFIG=dict(VALID_GENERIC_CONFIG),
            WORDS=[{"native_text": "Word", "english": "Definition"}],
            PHRASES=[{"native_text": "Phrase", "english": "Meaning"}],
            HISTORY_THIS_DAY={"01-01": {"body": "Body", "source_url": "https://example.com"}},
            DID_YOU_KNOW=["Fact"],
            SPORTS_SPOTLIGHT=[],
            BACKGROUNDS=[],
            BACKGROUND_CADENCE="monthly",
            ENABLE_DYNAMIC_WORD=False,
        )

        with self.assertRaises(ThemeValidationError):
            validate_theme_module(theme, "bad_background_theme")


class ContentWeightingTests(unittest.TestCase):
    def test_birthday_profile_penalizes_negative_copy_keywords(self) -> None:
        profile = load_keyword_weight_profile("birthday_family_friendly")
        negative = CuratedFact(
            fact_id="negative_music_fact",
            card_type="classic_rock",
            title="Jim Morrison Dies",
            body="Jim Morrison died in Paris in 1971.",
            source_name="Example",
            source_url="https://example.com",
            status="approved",
            tags=["music"],
            month=7,
            day=3,
        )
        positive = CuratedFact(
            fact_id="positive_music_fact",
            card_type="classic_rock",
            title="Dolly Parton Birthday",
            body="Dolly Parton was born and built a warm music career around humor and generosity.",
            source_name="Example",
            source_url="https://example.com",
            status="approved",
            tags=["birthday", "music", "born"],
            month=1,
            day=19,
        )

        self.assertLess(score_content_item(negative, profile), profile.copy_floor)
        self.assertGreater(score_content_item(positive, profile), score_content_item(negative, profile))


class WebRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()

    def test_invalid_theme_returns_400(self) -> None:
        response = self.client.get("/?theme=does_not_exist")
        self.assertEqual(response.status_code, 400)
        self.assertIn(b"Unknown theme", response.data)

    def test_invalid_date_returns_400(self) -> None:
        response = self.client.get("/?theme=irish_today&date=not-a-date")
        self.assertEqual(response.status_code, 400)

    def test_irish_today_renders(self) -> None:
        response = self.client.get("/?theme=irish_today&date=2026-04-24&seed=7")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Irish Today", response.data)

    def test_irish_today_visual_lab_renders_style_switcher(self) -> None:
        response = self.client.get("/?theme=irish_today_visual_lab&date=2026-04-24&seed=7&style=custom_cards&c1=glass.rounded_glass.drift")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Irish Today", response.data)
        self.assertIn(b"Visual Lab", response.data)
        self.assertIn(b"data-visual-lab-style", response.data)
        self.assertIn(b"it-visual-lab-controls", response.data)
        self.assertIn(b"strict_sample", response.data)
        self.assertIn(b"custom_cards", response.data)
        self.assertIn(b"data-visual-day-action", response.data)
        self.assertIn(b"Previous day", response.data)
        self.assertIn(b"it-card-style-terminal", response.data)
        self.assertIn(b"it-card-style-flipbook", response.data)
        self.assertIn(b"data-visual-card-style", response.data)
        self.assertIn(b"it-lab-drift-card", response.data)
        self.assertIn(b"it-lab-hinge-in", response.data)
        self.assertIn(b"it-lab-cascade-in", response.data)
        self.assertIn(b"it-visual-lab-group", response.data)
        self.assertIn(b"Transparent", response.data)
        self.assertIn(b"Dark", response.data)
        self.assertIn(b"Light", response.data)
        self.assertIn(b"Samples", response.data)
        self.assertIn(b"Other / Motion", response.data)
        self.assertIn(b"Custom cards", response.data)
        self.assertIn(b"Per-card visual controls", response.data)
        self.assertIn(b"main &gt; .card.it-card-style-drift", response.data)
        self.assertIn(b"main &gt; .card.it-card-style-hinge", response.data)
        self.assertIn(b"main &gt; .card.it-card-style-spotlight", response.data)
        self.assertIn(b"cardUsesSpotlight", response.data)
        self.assertIn(b"Visual lab stability patch", response.data)
        self.assertIn(b"html[data-visual-lab-style] main", response.data)
        self.assertIn(b"grid-auto-rows: auto", response.data)
        self.assertIn(b"backdrop-filter: none", response.data)
        self.assertIn(b"Modular card style layer", response.data)
        self.assertIn(b"df-card-surface-", response.data)
        self.assertIn(b"df-card-frame-", response.data)
        self.assertIn(b"df-card-motion-", response.data)
        self.assertIn(b"data-df-card-style-ready", response.data)
        self.assertIn(b"strictSampleSurfaceFrameKeys", response.data)
        self.assertIn(b"strictSampleMotionKeys", response.data)
        self.assertIn(b"strictSampleAssignmentForCard", response.data)
        self.assertIn(b"dfCardSurfaceFrameSource", response.data)
        self.assertIn(b"df-card-motion-drift", response.data)
        self.assertIn(b"df-card-motion-flipbook", response.data)
        self.assertIn(b"df-card-motion-spotlight", response.data)
        self.assertIn(b"it-card-debug-panel", response.data)
        self.assertIn(b"c1=glass.rounded_glass.drift", response.data)
        self.assertIn(b"Apply URL + reload", response.data)
        self.assertIn(b"customAssignmentForCard", response.data)

    def test_topic_signal_daily_renders_passages_companion(self) -> None:
        response = self.client.get("/?theme=topic_signal_daily&date=2026-05-13&seed=0")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Passages Daily", response.data)
        self.assertIn(b"Step Into Today with Skills and Confidence", response.data)
        self.assertIn(b"Finding a First Direction", response.data)
        self.assertIn(b"Today\xe2\x80\x99s Focus", response.data)
        self.assertIn(b"Try This Today", response.data)
        self.assertIn(b"Mini Confidence Quest", response.data)
        self.assertIn(b"Phrase Shuffle", response.data)
        self.assertIn(b"Conversation Starter", response.data)
        self.assertIn(b"Parent / Mentor Note", response.data)

    def test_topic_signal_daily_accepts_hyphenated_theme_alias(self) -> None:
        response = self.client.get("/?theme=topic-signal-daily&date=2026-05-13&seed=0")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Passages Daily", response.data)
        self.assertIn(b"Finding a First Direction", response.data)
        self.assertIn(b"Mini Confidence Quest", response.data)
        
    def test_nissan_z_theme_renders(self) -> None:
        response = self.client.get("/?theme=nissan_z&date=2026-08-17&seed=7")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Nissan Z Daily", response.data)
        self.assertIn(b"Modern Z Reveal", response.data)
        self.assertIn(b"Generation Spotlight", response.data)
        self.assertIn(b"Z of the Day", response.data)
        self.assertIn(b"Z in Video Games", response.data)
        self.assertIn(b"card-image", response.data)
        self.assertIn(b"data:image/jpeg;base64", response.data)
        self.assertIn(b"User-provided Nissan Z studio background", response.data)
        self.assertIn(b"background-image: linear-gradient", response.data)
        self.assertIn(b"@media (max-width: 720px)", response.data)
        self.assertIn(b"z-day-nav", response.data)
        self.assertIn(b"Previous day", response.data)
        self.assertIn(b"Next day", response.data)
        self.assertIn(b"Daily controls", response.data)
        self.assertLess(response.data.index(b"Z of the Day"), response.data.index(b"Generation Spotlight"))
        
    def test_commander_readiness_theme_renders(self) -> None:
        response = self.client.get("/?theme=commander_readiness&date=2026-05-15&seed=7")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Commander Opening Plan", response.data)
        self.assertIn(b"99-Card Composition", response.data)
        self.assertIn(b"Turn 5", response.data)
        self.assertIn(b"How Often It Comes Together", response.data)
        self.assertIn(b"Reroll sample hands", response.data)
        self.assertIn(b"Recommendation Experiments", response.data)
        self.assertIn(b"Best Category-Level Changes", response.data)
        self.assertIn(b"category-level experiments", response.data)
        self.assertIn(b"Add cheap aura carriers", response.data)

    def test_birthday_theme_renders_with_realistic_data(self) -> None:
        birthdays = [
            {
                "name": "Chris Holtsnider",
                "month": 7,
                "day": 10,
                "year": 1986,
                "relation": "son",
                "note": "moe",
                "phone": "774-573-9352",
            },
            {
                "name": "Stephen Holtsnider",
                "month": 8,
                "day": 12,
                "year": 1988,
                "relation": "son",
                "note": "larry",
                "phone": "774-573-9351",
            },
        ]

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(birthdays, handle)
            temp_path = handle.name

        try:
            with patch.dict(os.environ, {"BIRTHDAYS_FILE": temp_path}):
                response = self.client.get("/?theme=this_day_birthday&date=2026-07-10&seed=7")
            self.assertEqual(response.status_code, 200)
            self.assertIn(b"Chris Holtsnider", response.data)
            self.assertIn(b"Patti Mode", response.data)
            self.assertIn(b"Turns 40th", response.data)
            self.assertIn(b"facts as seasoning", response.data)
            self.assertIn(b"birthday stays central", response.data)
            self.assertIn(b"More birthday-theme facts", response.data)
            self.assertIn(b"keyword-weighted facts", response.data)
        finally:
            os.remove(temp_path)

    def test_birthday_theme_handles_missing_file(self) -> None:
        with patch.dict(os.environ, {"BIRTHDAYS_FILE": "does-not-exist.json"}):
            response = self.client.get("/?theme=this_day_birthday&date=2026-07-10")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Birthday", response.data)


if __name__ == "__main__":
    unittest.main()
