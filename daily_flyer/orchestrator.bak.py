from __future__ import annotations

import random
from datetime import date

from daily_flyer.models import CardItem, PageContext
from daily_flyer.providers.county import fetch_county_of_the_week
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


def _normalize_history_entry(entry) -> tuple[str, str | None]:
    if isinstance(entry, dict):
        return entry.get("body", ""), entry.get("source_url")
    return str(entry), None


def _get_curated_history_card(theme, today, theme_config: dict) -> CardItem | None:
    mmdd = today.strftime("%m-%d")

    history_this_day = getattr(theme, "HISTORY_THIS_DAY", {})
    history_week_events = getattr(theme, "HISTORY_WEEK_EVENTS", [])
    history_eyebrow = theme_config.get("history_eyebrow", "History")
    history_today_title = theme_config.get("history_today_title", "This Day in History")
    history_week_title = theme_config.get("history_week_title", "This Week in History")

    if mmdd in history_this_day:
        body, source_url = _normalize_history_entry(history_this_day[mmdd])
        if body:
            return CardItem(
                card_type="history",
                eyebrow=history_eyebrow,
                title=history_today_title,
                body=body,
                source_url=source_url,
            )

    today_doy = today.timetuple().tm_yday
    candidates = []

    for event in history_week_events:
        event_doy = _day_of_year(event["month"], event["day"])
        distance = _circular_day_distance(today_doy, event_doy)

        if distance <= 5:
            candidates.append((distance, event["month"], event["day"], event))

    if not candidates:
        return None

    candidates.sort(key=lambda x: (x[0], x[1], x[2]))
    chosen = candidates[0][3]

    return CardItem(
        card_type="history",
        eyebrow=history_eyebrow,
        title=chosen.get("title", history_week_title),
        body=chosen["body"],
        source_url=chosen.get("source_url"),
    )


def build_daily_page(
    theme_name: str,
    date_str: str | None = None,
    seed: int | None = None,
) -> PageContext:
    theme = load_theme(theme_name)

    custom_builder = getattr(theme, "build_theme_page", None)
    if callable(custom_builder):
        return custom_builder(date_str=date_str, seed=seed)

    today = resolve_date(date_str)
    mmdd = today.strftime("%m-%d")

    day_seed = seed if seed is not None else today.toordinal()
    rng = random.Random(day_seed)

    theme_config = theme.THEME_CONFIG
    core_cards: list[CardItem] = []
    optional_cards: list[CardItem] = []

    enable_word = theme_config.get("enable_word_card", True)
    enable_phrase = theme_config.get("enable_phrase_card", True)
    enable_history = theme_config.get("enable_history_card", True)
    enable_did_you_know = theme_config.get("enable_did_you_know_card", True)
    enable_sport = theme_config.get("enable_sport_card", True)
    enable_connection = theme_config.get("enable_connection_card", True)
    enable_county = theme_config.get("enable_county_card", True)

    if enable_word:
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
                word_title = theme_config.get("default_word_title", "Welcome")
                word_body = theme_config.get("default_word_body", "Welcome")
        else:
            word_title = theme_config.get("default_word_title", "Welcome")
            word_body = theme_config.get("default_word_body", "Welcome")

        core_cards.append(
            CardItem(
                card_type="word",
                eyebrow=theme_config.get("word_eyebrow", "Word of the Day"),
                title=word_title,
                body=word_body,
                source_url=word_source,
            )
        )

    if enable_phrase:
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
                    eyebrow=theme_config.get("phrase_eyebrow", "Phrase of the Day"),
                    title=fallback_phrase["native_text"],
                    body=phrase_body,
                    source_url=None,
                )
            )

    if enable_history:
        history_card = _get_curated_history_card(theme, today, theme_config)
        if history_card:
            core_cards.append(history_card)

    if enable_did_you_know:
        did_you_know_facts = getattr(theme, "DID_YOU_KNOW", getattr(theme, "HISTORY_GENERAL", []))
        if did_you_know_facts:
            optional_cards.append(
                CardItem(
                    card_type="did_you_know",
                    eyebrow=theme_config.get("did_you_know_eyebrow", "Did You Know?"),
                    title=theme_config.get("did_you_know_title", "Fact of the Day"),
                    body=rng.choice(did_you_know_facts),
                    source_url=None,
                )
            )

    if enable_sport:
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
                sport_body = theme_config.get(
                    "default_sport_body",
                    "A sports spotlight can appear here when the theme provides one.",
                )
                sport_source = None

        optional_cards.append(
            CardItem(
                card_type="sport",
                eyebrow=theme_config.get("sport_eyebrow", "Sports Spotlight"),
                title=theme_config.get("sport_title", "Today's Pick"),
                body=sport_body,
                source_url=sport_source,
            )
        )

    if enable_connection:
        fact = fetch_irish_connection(rng)
        if fact:
            optional_cards.append(
                CardItem(
                    card_type="irish_connection",
                    eyebrow=theme_config.get("connection_eyebrow", "Theme Connection"),
                    title=fact["title"],
                    body=fact["body"],
                    source_url=fact["source_url"],
                )
            )

    if enable_county:
        county = fetch_county_of_the_week(today)
        if county:
            core_cards.append(
                CardItem(
                    card_type="county",
                    eyebrow=theme_config.get("county_eyebrow", "Featured Region"),
                    title=county["title"],
                    body=county["body"],
                    source_url=county["source_url"],
                    image_url=county.get("image_url"),
                )
            )

    rng.shuffle(optional_cards)

    if optional_cards:
        min_optional = theme_config.get("min_optional_cards", 3)
        max_optional_cap = theme_config.get("max_optional_cards", 5)
        max_optional = min(max_optional_cap, len(optional_cards))

        if max_optional >= min_optional:
            num_optional = rng.randint(min_optional, max_optional)
        else:
            num_optional = len(optional_cards)

        cards = core_cards + optional_cards[:num_optional]
    else:
        cards = core_cards.copy()

    rng.shuffle(cards)

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
            "hero_kicker": theme_config.get("hero_kicker", "Daily Flyer • Theme"),
            "hero_summary_pill": theme_config.get(
                "hero_summary_pill",
                "Curated cards and timely sources",
            ),
            "extra_css": theme_config.get("extra_css", ""),
            "extra_js": theme_config.get("extra_js", ""),
            "extra_head_html": theme_config.get("extra_head_html", ""),
        },
    )
