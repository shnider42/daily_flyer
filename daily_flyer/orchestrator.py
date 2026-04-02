from __future__ import annotations

import random

from daily_flyer.models import CardItem, PageContext
from daily_flyer.providers.county import fetch_county_of_the_day
from daily_flyer.providers.facts import fetch_irish_connection
from daily_flyer.providers.rte import fetch_sport_spotlight
from daily_flyer.providers.wiktionary import fetch_gaeilge_word_hint
from daily_flyer.providers.wikipedia import fetch_irish_on_this_day
from daily_flyer.theme_loader import load_theme
from daily_flyer.utils import resolve_date


def build_daily_page(
    theme_name: str,
    date_str: str | None = None,
    seed: int | None = None,
) -> PageContext:
    theme = load_theme(theme_name)
    today = resolve_date(date_str)
    rng = random.Random(seed)
    mmdd = today.strftime("%m-%d")

    theme_config = theme.THEME_CONFIG
    core_cards: list[CardItem] = []
    optional_cards: list[CardItem] = []

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

    core_cards.append(
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

    optional_cards.append(
        CardItem(
            card_type="phrase",
            eyebrow="Phrase of the Day",
            title=fallback_phrase["native_text"],
            body="<br>".join(phrase_body_parts),
            source_url=None,
        )
    )

    # History (true date-based content only)
    dynamic_history = fetch_irish_on_this_day(today)
    history_body = None
    history_source = None

    if dynamic_history:
        history_body = dynamic_history[0]
        history_source = dynamic_history[1]
    else:
        history_body = theme.HISTORY_BY_DATE.get(mmdd)

    if history_body:
        core_cards.append(
            CardItem(
                card_type="history",
                eyebrow="History",
                title="This Day in Irish History",
                body=history_body,
                source_url=history_source,
            )
        )

    # Did You Know? (evergreen fact pool)
    did_you_know_facts = getattr(theme, "DID_YOU_KNOW", getattr(theme, "HISTORY_GENERAL", []))
    if did_you_know_facts:
        core_cards.append(
            CardItem(
                card_type="did_you_know",
                eyebrow="Did You Know?",
                title="Irish Fact",
                body=rng.choice(did_you_know_facts),
                source_url=None,
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

    optional_cards.append(
        CardItem(
            card_type="sport",
            eyebrow="Sports Spotlight",
            title="Today’s Pick",
            body=sport_body,
            source_url=sport_source,
        )
    )

    # Irish Connection
    fact = fetch_irish_connection(rng)
    optional_cards.append(
        CardItem(
            card_type="irish_connection",
            eyebrow="Irish Connection",
            title=fact["title"],
            body=fact["body"],
            source_url=fact["source_url"],
        )
    )

    # County
    county = fetch_county_of_the_day(today)
    optional_cards.append(
        CardItem(
            card_type="county",
            eyebrow="County of the Day",
            title=county["title"],
            body=county["body"],
            source_url=county["source_url"],
        )
    )

    # Combine core + optional cards safely
    rng.shuffle(optional_cards)

    if optional_cards:
        num_optional = rng.randint(3, min(5, len(optional_cards)))
        cards = core_cards + optional_cards[:num_optional]
    else:
        cards = core_cards.copy()

    rng.shuffle(cards)

    # Background of site
    background = None
    theme_backgrounds = getattr(theme, "BACKGROUNDS", [])

    if theme_backgrounds:
        cadence = getattr(theme, "BACKGROUND_CADENCE", "daily")

        if cadence == "weekly":
            index = today.isocalendar().week % len(theme_backgrounds)
        else:
            index = today.toordinal() % len(theme_backgrounds)

        background = theme_backgrounds[index]

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
            "background": background,
            "header_title_image": theme_config.get("header_title_image"),
        },
    )
