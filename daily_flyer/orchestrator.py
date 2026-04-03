from __future__ import annotations

import random
from datetime import date

from daily_flyer.models import CardItem, PageContext
from daily_flyer.providers.county import fetch_county_of_the_day
from daily_flyer.providers.facts import fetch_irish_connection
from daily_flyer.providers.rte import fetch_sport_spotlight
from daily_flyer.providers.wiktionary import fetch_gaeilge_word_hint
from daily_flyer.theme_loader import load_theme
from daily_flyer.utils import resolve_date


def _build_language_card_body(english: str, pronunciation: str | None = None) -> str:
    parts: list[str] = []
    if pronunciation:
        parts.append(f"Pronunciation: {pronunciation}")
    parts.append(english)
    return "<br>".join(parts)


def _day_of_year(month: int, day: int) -> int:
    return date(2001, month, day).timetuple().tm_yday


def _circular_day_distance(a: int, b: int) -> int:
    raw = abs(a - b)
    return min(raw, 365 - raw)


def _get_curated_history_card(theme, today) -> CardItem | None:
    mmdd = today.strftime("%m-%d")

    history_this_day = getattr(theme, "HISTORY_THIS_DAY", {})
    history_week_events = getattr(theme, "HISTORY_WEEK_EVENTS", [])

    if mmdd in history_this_day:
        return CardItem(
            card_type="history",
            eyebrow="History",
            title="This Day in Irish History",
            body=history_this_day[mmdd],
            source_url=None,
        )

    today_doy = today.timetuple().tm_yday
    candidates = []

    for event in history_week_events:
        event_doy = _day_of_year(event["month"], event["day"])
        distance = _circular_day_distance(today_doy, event_doy)

        if distance <= 3:
            candidates.append((distance, event["month"], event["day"], event))

    if not candidates:
        return None

    candidates.sort(key=lambda x: (x[0], x[1], x[2]))
    chosen = candidates[0][3]

    return CardItem(
        card_type="history",
        eyebrow="History",
        title=chosen.get("title", "This Week in Irish History"),
        body=chosen["body"],
        source_url=chosen.get("source_url"),
    )


def build_daily_page(
    theme_name: str,
    date_str: str | None = None,
    seed: int | None = None,
) -> PageContext:
    theme = load_theme(theme_name)
    today = resolve_date(date_str)
    mmdd = today.strftime("%m-%d")

    # Stable per-day randomness unless an explicit seed is supplied.
    day_seed = seed if seed is not None else today.toordinal()
    rng = random.Random(day_seed)

    theme_config = theme.THEME_CONFIG
    core_cards: list[CardItem] = []
    optional_cards: list[CardItem] = []

    # Word of the Day
    word_source = None
    word_pool = getattr(theme, "WORDS", [])
    use_dynamic_word = getattr(theme, "ENABLE_DYNAMIC_WORD", False)

    if word_pool:
        word_index = today.toordinal() % len(word_pool)
        chosen_word = word_pool[word_index]
        word_title = chosen_word["native_text"]
        word_body = _build_language_card_body(
            english=chosen_word["english"],
            pronunciation=chosen_word.get("pronunciation"),
        )
    elif use_dynamic_word:
        dynamic_word = fetch_gaeilge_word_hint()
        if dynamic_word:
            word_title = dynamic_word["native_text"]
            word_body = _build_language_card_body(
                english=dynamic_word["english"],
                pronunciation=dynamic_word.get("pronunciation"),
            )
            word_source = dynamic_word.get("source_url")
        else:
            word_title = "Fáilte"
            word_body = "Welcome"
    else:
        word_title = "Fáilte"
        word_body = "Welcome"

    core_cards.append(
        CardItem(
            card_type="word",
            eyebrow="Word of the Day",
            title=word_title,
            body=word_body,
            source_url=word_source,
        )
    )

    # Phrase of the Day
    phrase_pool = getattr(theme, "PHRASES", [])
    if phrase_pool:
        fallback_phrase = rng.choice(phrase_pool)
        phrase_body = _build_language_card_body(
            english=fallback_phrase["english"],
            pronunciation=fallback_phrase.get("pronunciation"),
        )

        optional_cards.append(
            CardItem(
                card_type="phrase",
                eyebrow="Phrase of the Day",
                title=fallback_phrase["native_text"],
                body=phrase_body,
                source_url=None,
            )
        )

    # Curated History only
    history_card = _get_curated_history_card(theme, today)
    if history_card:
        core_cards.append(history_card)

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

    # Sports Spotlight
    dynamic_sport = fetch_sport_spotlight()
    if dynamic_sport:
        sport_body = dynamic_sport[0]
        sport_source = dynamic_sport[1]
    else:
        sport_pool = getattr(theme, "SPORTS_SPOTLIGHT", [])
        if sport_pool:
            sport_body = rng.choice(sport_pool)
            sport_source = None
        else:
            sport_body = "Irish sport has deep local roots and strong county identity."
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
    if fact:
        optional_cards.append(
            CardItem(
                card_type="irish_connection",
                eyebrow="Irish Connection",
                title=fact["title"],
                body=fact["body"],
                source_url=fact["source_url"],
            )
        )

    # County of the Day
    county = fetch_county_of_the_day(today)
    if county:
        optional_cards.append(
            CardItem(
                card_type="county",
                eyebrow="County of the Day",
                title=county["title"],
                body=county["body"],
                source_url=county["source_url"],
                image_url=county.get("image_url"),
            )
        )

    # Combine core + optional cards safely
    rng.shuffle(optional_cards)

    if optional_cards:
        min_optional = 3
        max_optional = min(5, len(optional_cards))

        if max_optional >= min_optional:
            num_optional = rng.randint(min_optional, max_optional)
        else:
            num_optional = len(optional_cards)

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