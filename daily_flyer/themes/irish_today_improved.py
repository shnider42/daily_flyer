from __future__ import annotations

import random
import re
from html import unescape
from pathlib import Path
from typing import Callable

from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes.interactive_showcase import (
    interactive_showcase_css,
    interactive_showcase_js,
    render_interactive_host,
)
from daily_flyer.themes.irish_today_interactive_showcase import (
    COUNTY_CLUE_QUESTIONS,
    HISTORY_SORT_ROUNDS,
    PHRASE_BUILDER_QUESTIONS,
    TRIVIA_QUESTIONS,
    _build_language_questions,
    _build_memory_pairs,
)
from daily_flyer.themes.irish_today_plus import build_theme_page as build_plus_page
from daily_flyer.utils import resolve_date


THEME_NAME = "irish_today"
CARD_COUNT = 6
VISUAL_LAYER_PHOTO_DIR = Path(__file__).resolve().parent / "df-it-photos"
VISUAL_LAYER_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Irish Today Improved daily anchors. These are content-first, not game-first.
REQUIRED_CARD_TYPES = (
    "word",
    "county",
    "did_you_know",
    "news",
)

# Optional rotation pool after the four anchors are present.
OPTIONAL_CARD_TYPES = (
    "visual_layer",
    "trivia",
    "history_sort",
    "gaeilge_quiz",
    "phrase_builder",
    "county_clues",
    "memory_match",
    "history",
    "sport",
    "irish_connection",
    "phrase",
    "did_you_know",
)


THEME_CONFIG = {
    "page_title": "Irish Today — Interactive culture, language, history, and craic",
    "header_title": "☘️ Irish Today ☘️",
    "header_subtitle": (
        "A tighter Irish Today: six lively cards per day built around language, "
        "county identity, Irish curiosity, Davy Holden History, and rotating play."
    ),
    "footer_text": "Built by Holtsnider Tech. Driven by Davy Holden History.",
    "hero_kicker": "Daily Flyer • Irish Edition",
    "hero_summary_pill": "Six-card daily edition • Word • County • Fact • Davy feature • Rotation",
}


def _plain_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", unescape(str(value or "")))).strip()


def _is_generic_history_card(card: CardItem) -> bool:
    text = _plain_text(card.body).lower()
    generic_markers = (
        "irish history is full of strong daily hooks",
        "uprisings, literature, sport, and language revival",
    )
    return any(marker in text for marker in generic_markers) or len(text) < 120


def _is_davy_feature_card(card: CardItem) -> bool:
    return card.card_type == "news" and "davy" in (card.eyebrow or "").lower()


def _is_visual_layer_base_card(card: CardItem) -> bool:
    label = f"{card.eyebrow} {card.title}".lower()
    return card.card_type == "did_you_know" and "visual" in label


def _is_fact_did_you_know_card(card: CardItem) -> bool:
    if card.card_type != "did_you_know":
        return False
    if _is_visual_layer_base_card(card):
        return False
    label = f"{card.eyebrow} {card.title}".lower()
    return "irish fact" in label or "did you know" in label


def _find_card(cards: list[CardItem], predicate: Callable[[CardItem], bool]) -> CardItem | None:
    for card in cards:
        if predicate(card):
            return card
    return None


def _visual_layer_photo_paths() -> list[Path]:
    if not VISUAL_LAYER_PHOTO_DIR.exists():
        return []
    return sorted(
        path
        for path in VISUAL_LAYER_PHOTO_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in VISUAL_LAYER_PHOTO_EXTENSIONS
    )


def _visual_layer_photo_url(today) -> str | None:
    photos = _visual_layer_photo_paths()
    if not photos:
        return None
    chosen = photos[today.toordinal() % len(photos)]
    return f"/daily_flyer/themes/df-it-photos/{chosen.name}"


def _build_visual_layer_card(today) -> CardItem | None:
    image_url = _visual_layer_photo_url(today)
    if not image_url:
        return None

    return CardItem(
        card_type="visual_layer",
        eyebrow="Visual Layer",
        title="Irish Viewfinder",
        body=(
            '<div class="it-photo-caption">'
            '<span>Daily photo layer</span>'
            '<strong>Rotates from df-it-photos</strong>'
            '</div>'
        ),
        image_url=image_url,
        source_url=None,
    )


def _interactive_cards(rng: random.Random) -> list[CardItem]:
    language_questions = _build_language_questions(rng)
    memory_pairs = _build_memory_pairs(rng)

    return [
        CardItem(
            card_type="trivia",
            eyebrow="Interactive Quiz",
            title="Irish Trivia Challenge",
            body=render_interactive_host(
                widget_type="trivia",
                card_id="irish-today-trivia",
                config={"questions": TRIVIA_QUESTIONS},
                intro="Multiple choice, streak tracking, and quick replay.",
                footnote="Scores stay in this browser only.",
            ),
        ),
        CardItem(
            card_type="history_sort",
            eyebrow="Timeline Game",
            title="History Order Challenge",
            body=render_interactive_host(
                widget_type="history_sort",
                card_id="irish-today-history-sort",
                config={"rounds": HISTORY_SORT_ROUNDS},
                intro="Move the milestones until the years run from earliest to latest.",
                footnote="This is the safe history card when the date-specific history pool is thin.",
            ),
        ),
        CardItem(
            card_type="gaeilge_quiz",
            eyebrow="Gaeilge Practice",
            title="Word Match-Up",
            body=render_interactive_host(
                widget_type="language_quiz",
                card_id="irish-today-language",
                config={"questions": language_questions},
                intro="Guess the meaning of rotating Irish words from the existing Irish Today word pool.",
                footnote="Same vocabulary, more doing.",
            ),
        ),
        CardItem(
            card_type="phrase_builder",
            eyebrow="Phrase Game",
            title="Build the Phrase",
            body=render_interactive_host(
                widget_type="phrase_builder",
                card_id="irish-today-phrase-builder",
                config={"questions": PHRASE_BUILDER_QUESTIONS},
                intro="Tap the words into order to build a useful Irish phrase.",
                footnote="A better version of a static phrase card.",
            ),
        ),
        CardItem(
            card_type="county_clues",
            eyebrow="County Game",
            title="County Clue Ladder",
            body=render_interactive_host(
                widget_type="county_clues",
                card_id="irish-today-county-clues",
                config={"questions": COUNTY_CLUE_QUESTIONS},
                intro="Reveal clues one by one and guess the county before it becomes obvious.",
                footnote="Place, hints, identity, and learning — this belongs in Irish Today.",
            ),
        ),
        CardItem(
            card_type="memory_match",
            eyebrow="Mini Game",
            title="Gaeilge Memory Grid",
            body=render_interactive_host(
                widget_type="memory_match",
                card_id="irish-today-memory-grid",
                config={"pairs": memory_pairs},
                intro="Match Irish words to their English meanings.",
                footnote="Visible-pair mode: no blind guessing.",
            ),
        ),
    ]


def _eligible_optional_base_cards(base_cards: list[CardItem]) -> list[CardItem]:
    optional: list[CardItem] = []
    for card in base_cards:
        # The Plus trivia card is replaced by the richer interactive trivia card.
        if card.card_type == "trivia":
            continue
        # History only rotates in when it has a real dated/nearby fact.
        if card.card_type == "history" and _is_generic_history_card(card):
            continue
        # The Plus visual card is replaced by the df-it-photos visual layer card.
        if _is_visual_layer_base_card(card):
            continue
        # The Davy feature and fact Did You Know are required, not optional duplicates.
        if _is_davy_feature_card(card) or _is_fact_did_you_know_card(card):
            continue
        if card.card_type in OPTIONAL_CARD_TYPES:
            optional.append(card)
    return optional


def _compose_cards(
    base_cards: list[CardItem],
    interactive_cards: list[CardItem],
    rng: random.Random,
    today,
) -> list[CardItem]:
    word_card = _find_card(base_cards, lambda card: card.card_type == "word")
    county_card = _find_card(base_cards, lambda card: card.card_type == "county")
    fact_card = _find_card(base_cards, _is_fact_did_you_know_card)
    davy_card = _find_card(base_cards, _is_davy_feature_card)
    visual_layer_card = _build_visual_layer_card(today)

    final_cards: list[CardItem] = [
        card for card in (word_card, county_card, fact_card, davy_card) if card is not None
    ]

    optional_pool = [visual_layer_card, *interactive_cards, *_eligible_optional_base_cards(base_cards)]
    optional_pool = [card for card in optional_pool if card is not None]

    seen = {id(card) for card in final_cards}
    unique_optional = [card for card in optional_pool if id(card) not in seen]
    rng.shuffle(unique_optional)

    for card in unique_optional:
        if len(final_cards) >= CARD_COUNT:
            break
        final_cards.append(card)

    return final_cards[:CARD_COUNT]


def _extra_css() -> str:
    return (
        interactive_showcase_css()
        + r"""
    :root {
        --it-cream: #fff8e7;
        --it-green: #1fab62;
        --it-green-deep: #0f5a3c;
        --it-orange: #ff9f43;
        --it-gold: #e8c45b;
        --it-sea: #3cb7b1;
        --it-blue: #3f7fb1;
        --it-purple: #6d5bd0;
    }

    .hero h1,
    h2,
    .df-lab-question,
    .it-trivia-question,
    .it-language-primary {
        font-family: "Fraunces", Georgia, serif;
    }

    body {
        background:
            radial-gradient(circle at 8% 10%, rgba(31,171,98,0.20), transparent 18rem),
            radial-gradient(circle at 94% 12%, rgba(255,159,67,0.17), transparent 17rem),
            radial-gradient(circle at 60% 95%, rgba(60,183,177,0.14), transparent 22rem),
            linear-gradient(180deg, #08301f 0%, #071a22 44%, #041018 100%) !important;
    }

    header.hero {
        border-radius: 38px 38px 26px 38px !important;
        background:
            radial-gradient(circle at 82% 28%, rgba(255,159,67,0.20), transparent 13rem),
            radial-gradient(circle at 18% 15%, rgba(31,171,98,0.22), transparent 14rem),
            linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03)),
            linear-gradient(155deg, rgba(7,58,39,0.94), rgba(8,38,58,0.95)) !important;
    }

    .hero-title-image { filter: drop-shadow(0 18px 30px rgba(0,0,0,0.24)); }

    .card {
        isolation: isolate;
        border-width: 1px;
        border-color: rgba(255,255,255,0.14) !important;
        box-shadow: 0 22px 54px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07) !important;
    }
    .card::before { z-index: -1; }
    .eyebrow {
        border-radius: 999px;
        padding: 0.28rem 0.52rem;
        background: rgba(255,255,255,0.08);
        width: fit-content;
    }
    .df-lab-shell { background: rgba(255,255,255,0.07) !important; border-color: rgba(255,255,255,0.14) !important; }

    .card--visual_layer {
        min-height: 22rem !important;
        background: #08131a !important;
        overflow: hidden;
        display: grid;
        align-content: end;
    }
    .card--visual_layer::before {
        z-index: 0;
        background:
            linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.66) 100%),
            radial-gradient(circle at 16% 12%, rgba(255,255,255,0.16), transparent 12rem) !important;
    }
    .card--visual_layer::after {
        height: 0 !important;
        opacity: 0 !important;
    }
    .card--visual_layer .card-image-wrap {
        position: absolute;
        inset: 0;
        margin: 0 !important;
        border: 0 !important;
        border-radius: inherit;
        z-index: -1;
        background: transparent !important;
    }
    .card--visual_layer .card-image {
        width: 100%;
        height: 100%;
        aspect-ratio: auto !important;
        object-fit: cover;
        object-position: center center;
    }
    .card--visual_layer .card-head,
    .card--visual_layer .body {
        position: relative;
        z-index: 1;
        text-shadow: 0 2px 16px rgba(0,0,0,0.56);
    }
    .card--visual_layer .body {
        color: rgba(255,255,255,0.90) !important;
    }
    .card--visual_layer .icon-badge {
        background: rgba(0,0,0,0.28) !important;
        border-color: rgba(255,255,255,0.22) !important;
    }
    .it-photo-caption {
        display: inline-grid;
        gap: 0.18rem;
        padding: 0.68rem 0.78rem;
        border-radius: 16px;
        background: rgba(0,0,0,0.28);
        border: 1px solid rgba(255,255,255,0.18);
        width: fit-content;
        max-width: 100%;
    }
    .it-photo-caption span {
        color: rgba(255,255,255,0.72);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }
    .it-photo-caption strong {
        color: #fff;
        font-size: 0.94rem;
    }

    .card--history_sort {
        background: radial-gradient(circle at top right, rgba(232,196,91,0.22), transparent 12rem), rgba(38, 31, 22, 0.92) !important;
    }
    .card--trivia {
        background: repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 10px, transparent 10px 20px), linear-gradient(180deg, rgba(60,183,177,0.22), rgba(255,255,255,0.03)), rgba(8, 42, 47, 0.92) !important;
    }
    .card--word, .card--gaeilge_quiz {
        background: radial-gradient(circle at 12% 12%, rgba(63,127,177,0.30), transparent 13rem), rgba(9, 28, 52, 0.92) !important;
    }
    .card--phrase, .card--phrase_builder {
        background: radial-gradient(circle at 88% 8%, rgba(109,91,208,0.26), transparent 12rem), rgba(28, 22, 55, 0.92) !important;
    }
    .card--memory_match {
        background: radial-gradient(circle at 50% 0%, rgba(31,171,98,0.24), transparent 12rem), rgba(10, 44, 33, 0.92) !important;
    }
    .card--county, .card--county_clues {
        background: linear-gradient(90deg, rgba(31,171,98,0.18), transparent 45%), radial-gradient(circle at 88% 18%, rgba(232,196,91,0.18), transparent 12rem), rgba(13, 46, 32, 0.92) !important;
    }
    .card--news {
        background: radial-gradient(circle at 14% 10%, rgba(255,159,67,0.24), transparent 12rem), rgba(46, 28, 18, 0.92) !important;
    }
    .card--news .it-davy-shell { gap: 0.75rem; }
    .card--news .it-list { gap: 0.5rem; }
    .card--news .it-list-link {
        align-items: flex-start;
        flex-direction: column;
        gap: 0.25rem;
    }
    .card--news .it-list-link span:last-child { white-space: normal; }
    .card--did_you_know { background: radial-gradient(circle at 80% 0%, rgba(60,183,177,0.20), transparent 14rem), rgba(7, 37, 42, 0.92) !important; }
    .card--sport { background: linear-gradient(180deg, rgba(31,171,98,0.20), rgba(255,255,255,0.03)), rgba(9, 45, 25, 0.92) !important; }
    .card--irish_connection { background: radial-gradient(circle at 90% 12%, rgba(63,127,177,0.25), transparent 13rem), rgba(11, 31, 51, 0.92) !important; }

    .card--history_sort .icon-badge,
    .card--gaeilge_quiz .icon-badge,
    .card--phrase_builder .icon-badge,
    .card--memory_match .icon-badge,
    .card--county_clues .icon-badge,
    .card--visual_layer .icon-badge { font-size: 0; }
    .card--history_sort .icon-badge::before { content: "📜"; font-size: 1.15rem; }
    .card--gaeilge_quiz .icon-badge::before { content: "🗣️"; font-size: 1.15rem; }
    .card--phrase_builder .icon-badge::before { content: "💬"; font-size: 1.15rem; }
    .card--memory_match .icon-badge::before { content: "🧩"; font-size: 1.15rem; }
    .card--county_clues .icon-badge::before { content: "🗺️"; font-size: 1.15rem; }
    .card--visual_layer .icon-badge::before { content: "📷"; font-size: 1.15rem; }
    """
    )


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng = random.Random(seed if seed is not None else today.toordinal())

    context = build_plus_page(date_str=date_str, seed=seed)
    interactive_cards = _interactive_cards(rng)

    context.page_title = THEME_CONFIG["page_title"]
    context.header_title = THEME_CONFIG["header_title"]
    context.header_subtitle = THEME_CONFIG["header_subtitle"]
    context.footer_text = THEME_CONFIG["footer_text"]
    context.cards = _compose_cards(context.cards, interactive_cards, rng, today)

    previous_css = context.metadata.get("extra_css", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""

    context.metadata.update(
        {
            "theme_name": THEME_NAME,
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": previous_css + _extra_css(),
            "extra_js": previous_js + interactive_showcase_js(),
        }
    )
    return context
