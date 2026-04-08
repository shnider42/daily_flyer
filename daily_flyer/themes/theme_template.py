from __future__ import annotations

"""
Drop-in starter theme for Daily Flyer.

How to use:
1. Copy this file to daily_flyer/themes/<your_theme_name>.py
2. Rename the module file to your theme name
3. Update THEME_CONFIG and the content pools below
4. Run:
   python app.py --theme <your_theme_name> --outfile <your_theme_name>.html

Two supported approaches:
- Generic theme:
  Provide THEME_CONFIG plus WORDS / PHRASES / HISTORY_THIS_DAY / DID_YOU_KNOW / SPORTS_SPOTLIGHT.
  The core orchestrator will assemble the page for you.
- Custom theme:
  Keep THEME_CONFIG, but also define build_theme_page(...).
  When present, the core orchestrator will hand off page building to your theme.
"""

THEME_CONFIG = {
    "page_title": "Theme Name — Tagline here",
    "header_title": "Theme Name ✨",
    "header_subtitle": "One-sentence description of what this theme does",
    "footer_text": "Built on Daily Flyer.",
    "hero_kicker": "Daily Flyer • Theme",
    "hero_summary_pill": "Curated cards and timely sources",

    "word_eyebrow": "Word of the Day",
    "phrase_eyebrow": "Phrase of the Day",
    "history_eyebrow": "History",
    "history_today_title": "This Day in History",
    "history_week_title": "This Week in History",
    "did_you_know_eyebrow": "Did You Know?",
    "did_you_know_title": "Fact of the Day",
    "sport_eyebrow": "Spotlight",
    "sport_title": "Today's Pick",
    "connection_eyebrow": "Theme Connection",
    "connection_title": "Connection",
    "connection_card_type": "irish_connection",
    "county_eyebrow": "Featured Region",

    "enable_word_card": True,
    "enable_phrase_card": True,
    "enable_history_card": True,
    "enable_did_you_know_card": True,
    "enable_sport_card": True,
    "enable_connection_card": False,
    "enable_county_card": False,

    "use_provider_sport": False,
    "use_provider_connection": False,
    "use_provider_county": False,

    "min_optional_cards": 2,
    "max_optional_cards": 4,
}

ENABLE_DYNAMIC_WORD = False

WORDS = [
    {
        "native_text": "Example",
        "pronunciation": "ig-ZAM-pul",
        "english": "Replace this with a theme-specific word",
    },
]

PHRASES = [
    {
        "native_text": "Example phrase",
        "pronunciation": "optional",
        "english": "Replace this with a phrase for your theme",
    },
]

HISTORY_THIS_DAY = {
    "01-01": {
        "body": "Put a theme-specific date entry here.",
        "source_url": "https://example.com",
    },
}

HISTORY_WEEK_EVENTS = [
    {
        "month": 1,
        "day": 1,
        "title": "This Week in History",
        "body": "Put a theme-specific near-date event here.",
        "source_url": "https://example.com",
    },
]

DID_YOU_KNOW = [
    "Put evergreen theme facts here.",
]

SPORTS_SPOTLIGHT = [
    "If your theme has no sports angle, disable the sport card in THEME_CONFIG.",
]

CONNECTION_FACTS = [
    {
        "title": "Connection",
        "body": "Optional fallback connection card content if you do not want the provider-driven connection card.",
        "source_url": "https://example.com",
    },
]

BACKGROUND_CADENCE = "daily"

BACKGROUNDS = [
    {
        "path": "daily_flyer/themes/example_background.jpg",
        "label": "Example Background",
    },
]

# Optional:
# def build_theme_page(date_str: str | None = None, seed: int | None = None):
#     ...
