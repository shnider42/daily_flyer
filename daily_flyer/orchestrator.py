from __future__ import annotations

import random

from daily_flyer.models import CardItem, PageContext
from daily_flyer.providers.rte import fetch_sport_spotlight, fetch_top_story
from daily_flyer.providers.wikipedia import fetch_irish_on_this_day, fetch_summary_trivia
from daily_flyer.providers.wiktionary import fetch_gaeilge_word_hint
from daily_flyer.providers.militaryarchives import fetch_military_archives_highlight
from daily_flyer.theme_loader import load_theme
from daily_flyer.utils import resolve_date


def build_daily_page(theme_name: str, date_str: str | None = None, seed: int | None = None) -> PageContext:
    theme = load_theme(theme_name)
    today = resolve_date(date_str)
    rng = random.Random(seed)
    mmdd = today.strftime("%m-%d")

    theme_config = theme.THEME_CONFIG
    cards: list[CardItem] = []

    # Word
    dynamic_word = fetch_gaeilge_word_hint()
    if dynamic_word:
        word_title = dynamic_word["native_text"]
        word_body_parts = [dynamic_word["english"]]
        if dynamic_word.get("pronunciation"):
            word_body_parts.insert(0, f'Pronunciation: {dynamic_word["pronunciation"]}')
        word_source = dynamic_word.get("source_url")
    else:
        fallback_word = rng.choice(theme.WORDS)
        word_title = fallback_word["native_text"]
        word_body_parts = [fallback_word["english"]]
        if fallback_word.get("pronunciation"):
            word_body_parts.insert(0, f'Pronunciation: {fallback_word["pronunciation"]}')
        word_source = None

    cards.append(
        CardItem(
            card_type="word",
            eyebrow="Word of the Day",
            title=word_title,
            body="<br>".join(word_body_parts),
            source_url=word_source,
        )
    )

    # Phrase
    fallback_phrase = rng.choice(theme.PHRASES)
    phrase_body_parts = [fallback_phrase["english"]]
    if fallback_phrase.get("pronunciation"):
        phrase_body_parts.insert(0, f'Pronunciation: {fallback_phrase["pronunciation"]}')

    cards.append(
        CardItem(
            card_type="phrase",
            eyebrow="Phrase of the Day",
            title=fallback_phrase["native_text"],
            body="<br>".join(phrase_body_parts),
            source_url=None,
        )
    )

    # History
    dynamic_history = fetch_irish_on_this_day(today)
    if dynamic_history:
        history_body = dynamic_history[0]
        history_source = dynamic_history[1]
    else:
        history_body = theme.HISTORY_BY_DATE.get(mmdd, rng.choice(theme.HISTORY_GENERAL))
        history_source = None

    cards.append(
        CardItem(
            card_type="history",
            eyebrow="History",
            title="This Day in Irish History",
            body=history_body,
            source_url=history_source,
        )
    )

    # Military History
    dynamic_military = fetch_military_archives_highlight()
    if dynamic_military:
        cards.append(
            CardItem(
                card_type="military",
                eyebrow="Military Archives",
                title="Military Archives Spotlight",
                body=dynamic_military[0],
                source_url=dynamic_military[1],
            )
        )

    # Sport
    dynamic_sport = fetch_sport_spotlight()
    if dynamic_sport:
        sport_body = dynamic_sport[0]
        sport_source = dynamic_sport[1]
    else:
        sport_body = rng.choice(theme.SPORTS_SPOTLIGHT)
        sport_source = None

    cards.append(
        CardItem(
            card_type="sport",
            eyebrow="Sports Spotlight",
            title="Today’s Pick",
            body=sport_body,
            source_url=sport_source,
        )
    )

    # Trivia
    dynamic_trivia = fetch_summary_trivia("Ireland", "Irish language", "Irish people")
    if dynamic_trivia:
        trivia_body = dynamic_trivia[0]
        trivia_source = dynamic_trivia[1]
    else:
        trivia_body = rng.choice(theme.TRIVIA)
        trivia_source = None

    cards.append(
        CardItem(
            card_type="trivia",
            eyebrow="Did You Know?",
            title="Trivia",
            body=trivia_body,
            source_url=trivia_source,
        )
    )

    # Top story
    dynamic_story = fetch_top_story()
    if dynamic_story:
        story_title = dynamic_story["headline"]
        story_body = dynamic_story["snippet"]
        story_source = dynamic_story.get("source_url")
    else:
        story_title = "No story available."
        story_body = "Try again later."
        story_source = None

    cards.append(
        CardItem(
            card_type="news",
            eyebrow="Top Story",
            title=story_title,
            body=story_body,
            source_url=story_source,
        )
    )

    return PageContext(
        page_title=theme_config["page_title"],
        header_title=theme_config["header_title"],
        header_subtitle=theme_config["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=theme_config["footer_text"],
        metadata={
            "theme_name": theme_name,
            "date_key": mmdd,
        },
    )