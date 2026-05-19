from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_improved as base_theme


THEME_CONFIG = base_theme.THEME_CONFIG
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


DESKTOP_LAYOUT_CSS = r"""
/* Irish Today improved desktop layout pass.
   Goal: use the desktop viewport better and let short cards hug their content. */
@media (min-width: 981px) {
    :root {
        --max-width: min(1540px, calc(100vw - 48px));
    }

    .hero-wrap,
    main,
    footer {
        width: min(1540px, calc(100vw - 48px)) !important;
        max-width: min(1540px, calc(100vw - 48px)) !important;
    }

    .hero-wrap {
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    main {
        grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
        grid-auto-flow: dense !important;
        grid-auto-rows: auto !important;
        align-items: start !important;
        gap: 18px !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    .card {
        min-height: 0 !important;
        height: auto !important;
        align-self: start !important;
        padding: 1rem 1rem 0.95rem !important;
    }

    .card-head {
        margin-bottom: 0.58rem !important;
    }

    .body {
        margin-top: 0.18rem !important;
        line-height: 1.56 !important;
    }

    .source {
        margin-top: 0.72rem !important;
        padding-top: 0.62rem !important;
    }

    .card-image-wrap {
        margin-bottom: 0.68rem !important;
    }

    .card-image {
        aspect-ratio: 16 / 8.5 !important;
    }

    /* Compact/simple content cards: prevent one-sentence cards from becoming billboards. */
    .card--word,
    .card--phrase {
        grid-column: span 3 !important;
    }

    .card--did_you_know,
    .card--sport,
    .card--irish_connection,
    .card--county {
        grid-column: span 4 !important;
    }

    .card--news,
    .card--history {
        grid-column: span 5 !important;
    }

    /* Interactive cards need room, but should not force neighboring cards to stretch. */
    .card--trivia,
    .card--history_sort,
    .card--gaeilge_quiz,
    .card--phrase_builder,
    .card--county_clues,
    .card--memory_match {
        grid-column: span 4 !important;
        min-height: 0 !important;
    }

    .df-lab-shell {
        gap: 0.65rem !important;
        padding: 0.78rem !important;
    }

    .df-lab-question {
        line-height: 1.35 !important;
    }

    .df-lab-options,
    .df-lab-grid,
    .df-lab-wordbank {
        gap: 0.48rem !important;
    }

    .df-lab-option,
    .df-lab-chip,
    .df-lab-ghost,
    .df-lab-primary,
    .df-lab-clue-btn,
    .df-lab-stack-btn {
        padding-top: 0.54rem !important;
        padding-bottom: 0.54rem !important;
    }
}

@media (min-width: 1280px) {
    .card--history {
        grid-column: span 6 !important;
    }

    .card--news {
        grid-column: span 4 !important;
    }

    .card--word,
    .card--phrase {
        grid-column: span 3 !important;
    }
}
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)
    previous_css = context.metadata.get("extra_css", "") or ""
    context.metadata["extra_css"] = previous_css + DESKTOP_LAYOUT_CSS
    context.metadata["theme_name"] = "irish_today"
    return context
