from __future__ import annotations

import random

from daily_flyer.models import ContentItem, LanguageItem, PageContext, StoryItem
from daily_flyer.providers.rte import fetch_sport_spotlight, fetch_top_story
from daily_flyer.providers.wikipedia import fetch_irish_on_this_day, fetch_summary_trivia
from daily_flyer.providers.wiktionary import fetch_gaeilge_word_hint
from daily_flyer.theme_loader import load_theme
from daily_flyer.utils import resolve_date


def build_daily_page(theme_name: str, date_str: str | None = None, seed: int | None = None) -> PageContext:
    theme = load_theme(theme_name)
    today = resolve_date(date_str)
    rng = random.Random(seed)
    mmdd = today.strftime("%m-%d")

    theme_config = theme.THEME_CONFIG

    # Word
    dynamic_word = fetch_gaeilge_word_hint()
    if dynamic_word:
        word = LanguageItem(
            native_text=dynamic_word["native_text"],
            english=dynamic_word["english"],
            pronunciation=dynamic_word.get("pronunciation", ""),
            source_url=dynamic_word.get("source_url"),
        )
    else:
        fallback_word = rng.choice(theme.WORDS)
        word = LanguageItem(
            native_text=fallback_word["native_text"],
            english=fallback_word["english"],
            pronunciation=fallback_word.get("pronunciation", ""),
        )

    # Phrase
    fallback_phrase = rng.choice(theme.PHRASES)
    phrase = LanguageItem(
        native_text=fallback_phrase["native_text"],
        english=fallback_phrase["english"],
        pronunciation=fallback_phrase.get("pronunciation", ""),
    )

    # History
    dynamic_history = fetch_irish_on_this_day(today)
    if dynamic_history:
        history = ContentItem(
            title="This Day in Irish History",
            body=dynamic_history[0],
            source_url=dynamic_history[1],
        )
    else:
        history_text = theme.HISTORY_BY_DATE.get(mmdd, rng.choice(theme.HISTORY_GENERAL))
        history = ContentItem(
            title="This Day in Irish History",
            body=history_text,
        )

    # Sport
    dynamic_sport = fetch_sport_spotlight()
    if dynamic_sport:
        sport = ContentItem(
            title="Sports Spotlight",
            body=dynamic_sport[0],
            source_url=dynamic_sport[1],
        )
    else:
        sport = ContentItem(
            title="Sports Spotlight",
            body=rng.choice(theme.SPORTS_SPOTLIGHT),
        )

    # Trivia
    dynamic_trivia = fetch_summary_trivia("Ireland", "Irish language", "Irish people")
    if dynamic_trivia:
        trivia = ContentItem(
            title="Did You Know?",
            body=dynamic_trivia[0],
            source_url=dynamic_trivia[1],
        )
    else:
        trivia = ContentItem(
            title="Did You Know?",
            body=rng.choice(theme.TRIVIA),
        )

    # Top story
    dynamic_story = fetch_top_story()
    if dynamic_story:
        top_story = StoryItem(
            headline=dynamic_story["headline"],
            snippet=dynamic_story["snippet"],
            source_url=dynamic_story.get("source_url"),
        )
    else:
        top_story = StoryItem(
            headline="No story available.",
            snippet="Try again later.",
        )

    return PageContext(
        page_title=theme_config["page_title"],
        header_title=theme_config["header_title"],
        header_subtitle=theme_config["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        word=word,
        phrase=phrase,
        history=history,
        sport=sport,
        trivia=trivia,
        top_story=top_story,
        footer_text=theme_config["footer_text"],
        metadata={
            "theme_name": theme_name,
            "date_key": mmdd,
        },
    )