from __future__ import annotations

import random

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

THEME_CONFIG = {
    "page_title": "Irish Today — Interactive culture, language, history, and craic",
    "header_title": "☘️ Irish Today ☘️",
    "header_subtitle": (
        "A more alive Irish Today: colorful card personalities, quick quizzes, "
        "Gaeilge practice, county clues, and history that feels worth poking at."
    ),
    "footer_text": "Built by Holtsnider Tech. Driven by Davy Holden History.",
    "hero_kicker": "Daily Flyer • Irish Edition",
    "hero_summary_pill": "Language • History • County pride • Playful practice",
}


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
                intro="Multiple choice, streak tracking, and quick replay. This replaces the simpler Plus trivia card.",
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
                footnote="A little interaction for the history-card part of the page.",
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
                footnote="Small replayable game, no fly swatter required.",
            ),
        ),
    ]


def _compose_cards(base_cards: list[CardItem], interactive_cards: list[CardItem]) -> list[CardItem]:
    # Remove the simpler Irish Today Plus trivia card and replace it with the richer showcase version.
    base = [card for card in base_cards if card.card_type != "trivia"]

    history_cards = [card for card in base if card.card_type == "history"]
    rest = [card for card in base if card.card_type != "history"]

    composed: list[CardItem] = []
    if history_cards:
        composed.append(history_cards[0])
    composed.extend(interactive_cards[:2])

    # Keep the Plus visual/client/content cards, but interleave richer interactive learning cards.
    inserted_language = False
    for card in rest:
        composed.append(card)
        if card.card_type == "word" and not inserted_language:
            composed.extend(interactive_cards[2:4])
            inserted_language = True
        elif card.card_type == "county":
            composed.append(interactive_cards[4])

    if not inserted_language:
        composed.extend(interactive_cards[2:4])

    if not any(card.card_type == "county_clues" for card in composed):
        composed.append(interactive_cards[4])

    composed.append(interactive_cards[5])
    return composed


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
        min-height: 360px;
        border-radius: 38px 38px 26px 38px !important;
        background:
            radial-gradient(circle at 82% 28%, rgba(255,159,67,0.20), transparent 13rem),
            radial-gradient(circle at 18% 15%, rgba(31,171,98,0.22), transparent 14rem),
            linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03)),
            linear-gradient(155deg, rgba(7,58,39,0.94), rgba(8,38,58,0.95)) !important;
    }

    .hero h1 {
        max-width: 12ch;
    }

    .hero-title-image {
        filter: drop-shadow(0 18px 30px rgba(0,0,0,0.24));
    }

    main {
        gap: 20px !important;
    }

    .card {
        isolation: isolate;
        min-height: 245px;
        border-width: 1px;
        border-color: rgba(255,255,255,0.14) !important;
        box-shadow:
            0 22px 54px rgba(0,0,0,0.25),
            inset 0 1px 0 rgba(255,255,255,0.07) !important;
    }

    .card::before {
        z-index: -1;
    }

    .eyebrow {
        border-radius: 999px;
        padding: 0.28rem 0.52rem;
        background: rgba(255,255,255,0.08);
        width: fit-content;
    }

    .df-lab-shell {
        background: rgba(255,255,255,0.07) !important;
        border-color: rgba(255,255,255,0.14) !important;
    }

    .df-lab-option,
    .df-lab-ghost,
    .df-lab-primary,
    .df-lab-chip,
    .df-lab-stack-btn,
    .df-lab-tile,
    .df-lab-clue-btn {
        border-color: rgba(255,255,255,0.15) !important;
    }

    .card--history {
        grid-column: span 7;
        border-radius: 34px 18px 34px 18px !important;
        background:
            linear-gradient(120deg, rgba(232,196,91,0.18), transparent 52%),
            radial-gradient(circle at 0% 0%, rgba(255,255,255,0.14), transparent 12rem),
            rgba(49, 38, 22, 0.92) !important;
    }

    .card--history::after {
        background: linear-gradient(90deg, var(--it-gold), #fff2a6, var(--it-orange)) !important;
    }

    .card--history_sort {
        grid-column: span 5;
        border-radius: 18px 34px 34px 18px !important;
        background:
            radial-gradient(circle at top right, rgba(232,196,91,0.22), transparent 12rem),
            rgba(38, 31, 22, 0.92) !important;
    }

    .card--trivia {
        grid-column: span 5;
        border-radius: 18px 34px 18px 34px !important;
        background:
            repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 10px, transparent 10px 20px),
            linear-gradient(180deg, rgba(60,183,177,0.22), rgba(255,255,255,0.03)),
            rgba(8, 42, 47, 0.92) !important;
    }

    .card--word {
        border-radius: 28px 28px 14px 28px !important;
        background:
            radial-gradient(circle at 12% 12%, rgba(63,127,177,0.28), transparent 13rem),
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
            rgba(10, 29, 52, 0.92) !important;
    }

    .card--gaeilge_quiz {
        grid-column: span 6;
        border-radius: 22px 34px 14px 28px !important;
        background:
            radial-gradient(circle at 12% 12%, rgba(63,127,177,0.32), transparent 13rem),
            rgba(9, 28, 52, 0.92) !important;
    }

    .card--phrase_builder {
        grid-column: span 6;
        border-radius: 28px 14px 28px 28px !important;
        background:
            radial-gradient(circle at 88% 8%, rgba(109,91,208,0.26), transparent 12rem),
            rgba(28, 22, 55, 0.92) !important;
    }

    .card--memory_match {
        grid-column: span 5;
        border-radius: 18px 30px 30px 18px !important;
        background:
            radial-gradient(circle at 50% 0%, rgba(31,171,98,0.24), transparent 12rem),
            rgba(10, 44, 33, 0.92) !important;
    }

    .card--county,
    .card--county_clues {
        grid-column: span 7;
        border-radius: 34px 34px 18px 18px !important;
        background:
            linear-gradient(90deg, rgba(31,171,98,0.18), transparent 45%),
            radial-gradient(circle at 88% 18%, rgba(232,196,91,0.18), transparent 12rem),
            rgba(13, 46, 32, 0.92) !important;
    }

    .card--county .card-image-wrap,
    .card--did_you_know .card-image-wrap {
        border-radius: 24px 24px 12px 24px;
        transform: rotate(-0.7deg);
        box-shadow: 0 14px 28px rgba(0,0,0,0.18);
    }

    .card--news {
        border-radius: 24px 36px 24px 24px !important;
        background:
            radial-gradient(circle at 14% 10%, rgba(255,159,67,0.24), transparent 12rem),
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
            rgba(46, 28, 18, 0.92) !important;
    }

    .card--did_you_know {
        border-radius: 36px 20px 36px 20px !important;
        background:
            radial-gradient(circle at 80% 0%, rgba(60,183,177,0.20), transparent 14rem),
            rgba(7, 37, 42, 0.92) !important;
    }

    .card--sport {
        border-radius: 18px 18px 34px 34px !important;
        background:
            linear-gradient(180deg, rgba(31,171,98,0.20), rgba(255,255,255,0.03)),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 18px),
            rgba(9, 45, 25, 0.92) !important;
    }

    .card--irish_connection {
        border-radius: 12px 30px 30px 30px !important;
        background:
            radial-gradient(circle at 90% 12%, rgba(63,127,177,0.25), transparent 13rem),
            rgba(11, 31, 51, 0.92) !important;
    }

    .card--history_sort .icon-badge,
    .card--gaeilge_quiz .icon-badge,
    .card--phrase_builder .icon-badge,
    .card--memory_match .icon-badge,
    .card--county_clues .icon-badge {
        font-size: 0;
    }

    .card--history_sort .icon-badge::before { content: "📜"; font-size: 1.15rem; }
    .card--gaeilge_quiz .icon-badge::before { content: "🗣️"; font-size: 1.15rem; }
    .card--phrase_builder .icon-badge::before { content: "💬"; font-size: 1.15rem; }
    .card--memory_match .icon-badge::before { content: "🧩"; font-size: 1.15rem; }
    .card--county_clues .icon-badge::before { content: "🗺️"; font-size: 1.15rem; }

    @media (max-width: 980px) {
        .card--history,
        .card--history_sort,
        .card--trivia,
        .card--word,
        .card--gaeilge_quiz,
        .card--phrase_builder,
        .card--memory_match,
        .card--county,
        .card--county_clues,
        .card--news,
        .card--did_you_know,
        .card--sport,
        .card--irish_connection {
            grid-column: span 6;
        }
    }

    @media (max-width: 720px) {
        .card--history,
        .card--history_sort,
        .card--trivia,
        .card--word,
        .card--gaeilge_quiz,
        .card--phrase_builder,
        .card--memory_match,
        .card--county,
        .card--county_clues,
        .card--news,
        .card--did_you_know,
        .card--sport,
        .card--irish_connection {
            grid-column: auto;
        }
    }
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
    context.cards = _compose_cards(context.cards, interactive_cards)

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
