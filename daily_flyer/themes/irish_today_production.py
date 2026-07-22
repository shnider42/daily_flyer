from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_improved_layout as base_theme


THEME_NAME = "irish_today_production"
THEME_CONFIG = dict(base_theme.THEME_CONFIG)
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


PRODUCTION_CLARITY_CSS = r"""
/* Irish Today production clarity layer.

   The visual lab remains available for experiments, but the public theme uses
   one readable card system: editorial content, photographic features, and
   interactive play. Cards are complete before hover; interaction adds emphasis
   instead of restoring opacity or saturation.
*/

@keyframes it-card-enter {
    from { opacity: 0; transform: translate3d(0, 18px, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
}

main > .card {
    --it-enter-x: 0%;
    --it-enter-y: 0%;
    clip-path: none !important;
    border-radius: 22px !important;
    opacity: 0;
    filter: none !important;
    transform: translate3d(0, 18px, 0);
    animation: it-card-enter 440ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

/* Card family: editorial / reference content. */
main > .card--word,
main > .card--did_you_know,
main > .card--news,
main > .card--history,
main > .card--sport,
main > .card--irish_connection,
main > .card--phrase {
    border-radius: 22px !important;
    border-color: rgba(255,255,255,0.13) !important;
}

/* Card family: photographic features. */
main > .card--county,
main > .card--visual_layer {
    border-radius: 28px !important;
    border-color: rgba(143,230,203,0.24) !important;
    overflow: hidden !important;
}

/* Card family: interactive / game cards. */
main > .card--trivia,
main > .card--history_sort,
main > .card--gaeilge_quiz,
main > .card--phrase_builder,
main > .card--county_clues,
main > .card--memory_match,
main > .card--hurling_game {
    border-radius: 26px !important;
    border-color: rgba(255,196,104,0.20) !important;
    background:
        linear-gradient(145deg, rgba(31,171,98,0.12), rgba(255,159,67,0.07)),
        rgba(7, 24, 26, 0.90) !important;
}

/* Keep the hero image rich but static. Card motion is the only ambient motion. */
header.hero::after {
    transform: scale(1.12) !important;
    will-change: auto !important;
}

@media (min-width: 981px) {
    main.it-masonry-ready > .card {
        opacity: 1 !important;
        filter: none !important;
        transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease !important;
    }

    @media (hover: hover) and (pointer: fine) {
        main.it-masonry-ready > .card:hover,
        main.it-masonry-ready > .card:focus-within {
            opacity: 1 !important;
            filter: none !important;
            transform: translateY(-3px) !important;
            border-color: var(--border-strong) !important;
            box-shadow: 0 22px 54px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.09) !important;
        }
    }

    .card--visual_layer:hover .card-image,
    .card--visual_layer:focus-within .card-image {
        transform: none !important;
    }
}

@media (prefers-reduced-motion: reduce) {
    main > .card,
    main.it-masonry-ready > .card,
    main.it-masonry-ready > .card:hover,
    main.it-masonry-ready > .card:focus-within {
        opacity: 1 !important;
        transform: none !important;
        animation: none !important;
        transition: none !important;
    }

    header.hero::after {
        transform: scale(1.12) !important;
        will-change: auto !important;
    }
}
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)
    previous_css = context.metadata.get("extra_css", "") or ""

    context.metadata.update(
        {
            "theme_name": THEME_NAME,
            "irish_today_release": "clarity-v1",
            "extra_css": previous_css + PRODUCTION_CLARITY_CSS,
        }
    )
    return context
