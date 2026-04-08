from __future__ import annotations

import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

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

    def test_birthday_theme_renders_with_realistic_data(self) -> None:
        birthdays = [
            {
                "name": "Chris Holtsnider",
                "month": 7,
                "day": 10,
                "relation": "son",
                "note": "moe",
                "phone": "774-573-9352",
            },
            {
                "name": "Stephen Holtsnider",
                "month": 8,
                "day": 12,
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
                response = self.client.get("/?theme=this_day_birthday&date=2026-07-10")
            self.assertEqual(response.status_code, 200)
            self.assertIn(b"Chris Holtsnider", response.data)
        finally:
            os.remove(temp_path)

    def test_birthday_theme_handles_missing_file(self) -> None:
        with patch.dict(os.environ, {"BIRTHDAYS_FILE": "does-not-exist.json"}):
            response = self.client.get("/?theme=this_day_birthday&date=2026-07-10")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Birthday", response.data)


if __name__ == "__main__":
    unittest.main()
