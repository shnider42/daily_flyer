from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_visual_lab_card_motion as base_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


GLASS_STABILITY_CSS = r"""
/* Glass stability patch: fullscreen desktop was combining masonry spans, blur filters,
   card entry transforms, and hover opacity/filter transitions. Keep the glass mood, but
   remove the layout/repaint pieces that can make cards flicker or jump at wide widths. */
@media (min-width: 981px) {
    html[data-visual-lab-style="glass"] main,
    body[data-visual-lab-style="glass"] main {
        grid-auto-flow: row !important;
        grid-auto-rows: auto !important;
        align-items: stretch !important;
    }

    html[data-visual-lab-style="glass"] main > .card,
    body[data-visual-lab-style="glass"] main > .card {
        grid-row-end: auto !important;
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
        filter: none !important;
        clip-path: none !important;
        will-change: auto !important;
        contain: paint !important;
        border-radius: 34px !important;
        background:
            linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.045)),
            rgba(6, 20, 28, 0.68) !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease !important;
    }

    html[data-visual-lab-style="glass"] main.it-masonry-ready > .card,
    body[data-visual-lab-style="glass"] main.it-masonry-ready > .card,
    html[data-visual-lab-style="glass"] main.it-masonry-ready > .card:hover,
    body[data-visual-lab-style="glass"] main.it-masonry-ready > .card:hover,
    html[data-visual-lab-style="glass"] main.it-masonry-ready > .card:focus-within,
    body[data-visual-lab-style="glass"] main.it-masonry-ready > .card:focus-within {
        opacity: 1 !important;
        filter: none !important;
        transform: none !important;
    }

    html[data-visual-lab-style="glass"] main > .card:hover,
    body[data-visual-lab-style="glass"] main > .card:hover,
    html[data-visual-lab-style="glass"] main > .card:focus-within,
    body[data-visual-lab-style="glass"] main > .card:focus-within {
        transform: none !important;
        border-color: rgba(255,255,255,0.34) !important;
        box-shadow: 0 26px 76px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18) !important;
        background:
            linear-gradient(180deg, rgba(255,255,255,0.17), rgba(255,255,255,0.055)),
            rgba(6, 20, 28, 0.72) !important;
    }

    html[data-visual-lab-style="glass"] .card--visual_layer:hover .card-image,
    body[data-visual-lab-style="glass"] .card--visual_layer:hover .card-image,
    html[data-visual-lab-style="glass"] .card--visual_layer:focus-within .card-image,
    body[data-visual-lab-style="glass"] .card--visual_layer:focus-within .card-image {
        transform: none !important;
    }
}
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)

    previous_css = context.metadata.get("extra_css", "") or ""
    context.metadata.update(
        {
            "theme_name": "irish_today_visual_lab_stability",
            "extra_css": previous_css + GLASS_STABILITY_CSS,
        }
    )
    return context
