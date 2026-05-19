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
CARD_COUNT = 8
VISUAL_LAYER_PHOTO_DIR = Path(__file__).resolve().parent / "df-it-photos"
VISUAL_LAYER_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Irish Today Improved daily anchors. These are content-first, not game-first.
REQUIRED_CARD_TYPES = (
    "word",
    "county",
    "did_you_know",
    "news",
    "visual_layer",
    "hurling_game",
)

# Optional rotation pool after the six anchors are present.
OPTIONAL_CARD_TYPES = (
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
        "A tighter Irish Today: eight lively cards per day built around language, "
        "county identity, Irish curiosity, Davy Holden History, a visual layer, hurling, and rotating play."
    ),
    "footer_text": "Built by Holtsnider Tech. Driven by Davy Holden History.",
    "hero_kicker": "Daily Flyer • Irish Edition",
    "hero_summary_pill": "Eight-card daily edition • Word • County • Fact • Davy feature • Hurling game",
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
        eyebrow="",
        title="",
        body="",
        image_url=image_url,
        source_url=None,
    )


def _build_hurling_game_card(today) -> CardItem:
    storage_key = f"irish-today-hurling-{today.isoformat()}"
    body = f"""
        <div class="it-hurling-game" data-it-hurling-game data-storage-key="{storage_key}">
            <div class="it-hurling-scorebar" aria-live="polite">
                <span><strong data-hurling-score>0</strong> pts</span>
                <span><strong data-hurling-shots>5</strong> sliotars left</span>
                <span>Best: <strong data-hurling-best>0</strong></span>
            </div>
            <div class="it-hurling-pitch" data-hurling-pitch aria-label="Hurling posts timing game">
                <div class="it-hurling-sky" aria-hidden="true"></div>
                <div class="it-hurling-posts" aria-hidden="true">
                    <span class="it-hurling-post it-hurling-post--left"></span>
                    <span class="it-hurling-post it-hurling-post--right"></span>
                    <span class="it-hurling-crossbar"></span>
                    <span class="it-hurling-net"></span>
                </div>
                <div class="it-hurling-aim" data-hurling-aim aria-hidden="true"></div>
                <div class="it-hurling-sliotar" data-hurling-ball aria-hidden="true"></div>
                <button class="it-hurling-strike" type="button" data-hurling-strike>
                    Tap / click to strike
                </button>
            </div>
            <div class="it-hurling-result" data-hurling-result>
                Time the moving marker: over the bar is 1 point, a perfect centre strike is a goal worth 3.
            </div>
            <button class="it-hurling-reset" type="button" data-hurling-reset>Reset five shots</button>
        </div>
    """
    return CardItem(
        card_type="hurling_game",
        eyebrow="Hurling Mini Game",
        title="Split the Posts",
        body=body,
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
    hurling_game_card = _build_hurling_game_card(today)

    final_cards: list[CardItem] = [
        card
        for card in (
            word_card,
            county_card,
            fact_card,
            davy_card,
            visual_layer_card,
            hurling_game_card,
        )
        if card is not None
    ]

    optional_pool = [*interactive_cards, *_eligible_optional_base_cards(base_cards)]
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
        min-height: 24rem !important;
        background: #08131a !important;
        overflow: hidden;
        cursor: zoom-in;
        display: block;
    }
    .card--visual_layer::before {
        z-index: 0;
        background:
            linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.10) 100%),
            radial-gradient(circle at 16% 12%, rgba(255,255,255,0.12), transparent 12rem) !important;
    }
    .card--visual_layer::after { height: 0 !important; opacity: 0 !important; }
    .card--visual_layer .card-head,
    .card--visual_layer .body,
    .card--visual_layer .source,
    .card--visual_layer .icon-badge,
    .card--visual_layer .eyebrow,
    .card--visual_layer h2 {
        display: none !important;
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
        transition: transform 260ms ease, filter 260ms ease;
    }
    .card--visual_layer:hover .card-image {
        transform: scale(1.025);
        filter: saturate(1.05) brightness(1.02);
    }
    .it-photo-lightbox {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: min(6vw, 3rem);
        background: rgba(2, 8, 12, 0.86);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    }
    .it-photo-lightbox[hidden] { display: none !important; }
    .it-photo-lightbox img {
        max-width: min(96vw, 1400px);
        max-height: 88vh;
        object-fit: contain;
        border-radius: 22px;
        box-shadow: 0 30px 90px rgba(0,0,0,0.55);
        border: 1px solid rgba(255,255,255,0.18);
    }
    .it-photo-lightbox button {
        position: absolute;
        top: 1rem;
        right: 1rem;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(0,0,0,0.38);
        color: #fff;
        font-size: 1.35rem;
        cursor: pointer;
    }

    .card--hurling_game {
        background:
            radial-gradient(circle at 12% 10%, rgba(232,196,91,0.20), transparent 12rem),
            linear-gradient(180deg, rgba(31,171,98,0.20), rgba(255,255,255,0.03)),
            rgba(7, 48, 28, 0.94) !important;
    }
    .it-hurling-game {
        display: grid;
        gap: 0.78rem;
    }
    .it-hurling-scorebar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: space-between;
        align-items: center;
        color: var(--ink);
        font-size: 0.9rem;
    }
    .it-hurling-scorebar span {
        padding: 0.38rem 0.55rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.10);
    }
    .it-hurling-pitch {
        position: relative;
        min-height: 13.5rem;
        border-radius: 22px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.14);
        background:
            linear-gradient(180deg, rgba(124,204,255,0.22) 0 38%, transparent 38%),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 18px),
            linear-gradient(180deg, #18753d 0%, #0f5b32 100%);
        touch-action: manipulation;
    }
    .it-hurling-pitch::after {
        content: "";
        position: absolute;
        inset: auto 0 0;
        height: 34%;
        background: repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 22px);
        opacity: 0.45;
    }
    .it-hurling-posts {
        position: absolute;
        left: 50%;
        top: 14%;
        width: min(58%, 17rem);
        height: 72%;
        transform: translateX(-50%);
        z-index: 2;
    }
    .it-hurling-post {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 0.38rem;
        border-radius: 999px;
        background: #fff8e7;
        box-shadow: 0 0 16px rgba(255,255,255,0.22);
    }
    .it-hurling-post--left { left: 10%; }
    .it-hurling-post--right { right: 10%; }
    .it-hurling-crossbar {
        position: absolute;
        left: 10%;
        right: 10%;
        top: 48%;
        height: 0.34rem;
        border-radius: 999px;
        background: #fff8e7;
    }
    .it-hurling-net {
        position: absolute;
        left: 18%;
        right: 18%;
        top: 50%;
        bottom: 0;
        border: 1px solid rgba(255,255,255,0.34);
        border-top: 0;
        background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 18px),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 18px);
        opacity: 0.7;
    }
    .it-hurling-aim {
        position: absolute;
        left: 50%;
        top: 10%;
        bottom: 15%;
        width: 0.28rem;
        border-radius: 999px;
        background: #ffdf70;
        box-shadow: 0 0 18px rgba(255,223,112,0.58);
        transform: translateX(-50%);
        z-index: 4;
        pointer-events: none;
    }
    .it-hurling-sliotar {
        position: absolute;
        left: 50%;
        bottom: 9%;
        width: 1.15rem;
        height: 1.15rem;
        border-radius: 999px;
        background: radial-gradient(circle at 35% 35%, #fff, #e8dec0 68%, #9f916e);
        transform: translate(-50%, 0);
        z-index: 5;
        pointer-events: none;
        transition: left 260ms ease, bottom 260ms ease, opacity 260ms ease;
    }
    .it-hurling-sliotar.is-shot {
        bottom: 62%;
        opacity: 0.88;
    }
    .it-hurling-strike {
        position: absolute;
        inset: auto 1rem 1rem;
        z-index: 6;
        border: 1px solid rgba(255,255,255,0.20);
        border-radius: 16px;
        padding: 0.72rem 0.9rem;
        background: rgba(3, 16, 11, 0.54);
        color: #fff;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
    }
    .it-hurling-strike:disabled {
        opacity: 0.58;
        cursor: not-allowed;
    }
    .it-hurling-result {
        min-height: 2.4rem;
        color: var(--ink);
        line-height: 1.48;
        padding: 0.62rem 0.72rem;
        border-radius: 16px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.10);
    }
    .it-hurling-result.is-goal { background: rgba(255,159,67,0.18); border-color: rgba(255,159,67,0.38); }
    .it-hurling-result.is-point { background: rgba(41,179,106,0.18); border-color: rgba(41,179,106,0.38); }
    .it-hurling-result.is-wide { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.14); }
    .it-hurling-reset {
        justify-self: start;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.08);
        color: var(--ink);
        border-radius: 14px;
        padding: 0.58rem 0.75rem;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
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
    .card--hurling_game .icon-badge { font-size: 0; }
    .card--history_sort .icon-badge::before { content: "📜"; font-size: 1.15rem; }
    .card--gaeilge_quiz .icon-badge::before { content: "🗣️"; font-size: 1.15rem; }
    .card--phrase_builder .icon-badge::before { content: "💬"; font-size: 1.15rem; }
    .card--memory_match .icon-badge::before { content: "🧩"; font-size: 1.15rem; }
    .card--county_clues .icon-badge::before { content: "🗺️"; font-size: 1.15rem; }
    .card--hurling_game .icon-badge::before { content: "🏑"; font-size: 1.15rem; }
    """
    )


def _visual_layer_js() -> str:
    return r"""
    (function () {
        function closeLightbox(lightbox) {
            if (!lightbox) return;
            lightbox.hidden = true;
            lightbox.remove();
            document.body.style.removeProperty('overflow');
        }

        function openLightbox(src, alt) {
            const existing = document.querySelector('.it-photo-lightbox');
            if (existing) closeLightbox(existing);

            const lightbox = document.createElement('div');
            lightbox.className = 'it-photo-lightbox';
            lightbox.setAttribute('role', 'dialog');
            lightbox.setAttribute('aria-modal', 'true');
            lightbox.innerHTML = '<button type="button" aria-label="Close photo">×</button><img alt="">';
            const image = lightbox.querySelector('img');
            const button = lightbox.querySelector('button');
            image.src = src;
            image.alt = alt || 'Irish Today visual layer photo';
            document.body.appendChild(lightbox);
            document.body.style.overflow = 'hidden';

            button.addEventListener('click', function () { closeLightbox(lightbox); });
            lightbox.addEventListener('click', function (event) {
                if (event.target === lightbox) closeLightbox(lightbox);
            });
            document.addEventListener('keydown', function onKeydown(event) {
                if (event.key === 'Escape') {
                    closeLightbox(lightbox);
                    document.removeEventListener('keydown', onKeydown);
                }
            });
        }

        function bootVisualLayer() {
            document.querySelectorAll('.card--visual_layer').forEach(function (card) {
                const image = card.querySelector('.card-image');
                if (!image) return;
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');
                card.setAttribute('aria-label', 'Open Irish Today photo');
                function activate() { openLightbox(image.currentSrc || image.src, image.alt); }
                card.addEventListener('click', activate);
                card.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        activate();
                    }
                });
            });
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootVisualLayer);
        else bootVisualLayer();
    })();
    """


def _hurling_game_js() -> str:
    return r"""
    (function () {
        function bootGame(root) {
            const aim = root.querySelector('[data-hurling-aim]');
            const ball = root.querySelector('[data-hurling-ball]');
            const strike = root.querySelector('[data-hurling-strike]');
            const reset = root.querySelector('[data-hurling-reset]');
            const scoreEl = root.querySelector('[data-hurling-score]');
            const shotsEl = root.querySelector('[data-hurling-shots]');
            const bestEl = root.querySelector('[data-hurling-best]');
            const resultEl = root.querySelector('[data-hurling-result]');
            const storageKey = root.getAttribute('data-storage-key') || 'irish-today-hurling-best';
            const maxShots = 5;
            let score = 0;
            let shotsLeft = maxShots;
            let aimPercent = 50;
            let locked = false;
            let best = 0;

            try { best = Number(window.localStorage.getItem(storageKey) || '0') || 0; }
            catch (err) { best = 0; }

            function setResult(text, className) {
                resultEl.textContent = text;
                resultEl.className = 'it-hurling-result' + (className ? ' ' + className : '');
            }

            function render() {
                scoreEl.textContent = String(score);
                shotsEl.textContent = String(shotsLeft);
                bestEl.textContent = String(best);
                strike.disabled = shotsLeft <= 0 || locked;
                if (shotsLeft <= 0) {
                    setResult('Full time. Final score: ' + score + '. Reset for five more sliotars.', score >= 6 ? 'is-goal' : '');
                }
            }

            function saveBest() {
                if (score <= best) return;
                best = score;
                try { window.localStorage.setItem(storageKey, String(best)); }
                catch (err) { /* ignore private mode */ }
            }

            function animateAim() {
                const period = 1800;
                const phase = (performance.now() % period) / period;
                const sweep = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
                aimPercent = 16 + sweep * 68;
                aim.style.left = aimPercent.toFixed(2) + '%';
                requestAnimationFrame(animateAim);
            }

            function resetBall() {
                ball.classList.remove('is-shot');
                ball.style.left = '50%';
            }

            function takeShot() {
                if (locked || shotsLeft <= 0) return;
                locked = true;
                shotsLeft -= 1;
                const distance = Math.abs(aimPercent - 50);
                let points = 0;
                let message = 'Wide. The sliotar tails away from the posts.';
                let className = 'is-wide';

                if (distance <= 4.5) {
                    points = 3;
                    message = 'Goal! Perfect centre strike into the net — 3 points.';
                    className = 'is-goal';
                } else if (distance <= 19) {
                    points = 1;
                    message = 'Over the bar. That is a point.';
                    className = 'is-point';
                }

                score += points;
                ball.style.left = aimPercent.toFixed(2) + '%';
                ball.classList.add('is-shot');
                setResult(message, className);
                saveBest();
                render();

                window.setTimeout(function () {
                    resetBall();
                    locked = false;
                    render();
                }, 520);
            }

            function resetGame() {
                score = 0;
                shotsLeft = maxShots;
                locked = false;
                resetBall();
                setResult('Time the moving marker: over the bar is 1 point, a perfect centre strike is a goal worth 3.', '');
                render();
            }

            strike.addEventListener('click', takeShot);
            reset.addEventListener('click', resetGame);
            root.addEventListener('keydown', function (event) {
                if ((event.key === 'Enter' || event.key === ' ') && document.activeElement === strike) {
                    event.preventDefault();
                    takeShot();
                }
            });
            render();
            requestAnimationFrame(animateAim);
        }

        function boot() {
            document.querySelectorAll('[data-it-hurling-game]').forEach(bootGame);
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
    })();
    """


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
            "extra_js": previous_js + interactive_showcase_js() + _visual_layer_js() + _hurling_game_js(),
        }
    )
    return context
