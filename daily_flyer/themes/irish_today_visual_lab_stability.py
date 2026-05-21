from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_visual_lab_card_motion as base_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


VISUAL_LAB_STABILITY_CSS = r"""
/* Visual lab stability patch.

   The base Irish Today desktop layout uses a masonry-like grid: tiny grid rows,
   dense auto-flow, JS row spans, entry transforms, clipped card shapes, and
   hover opacity/filter transitions. That looks good in the production theme, but
   the visual lab intentionally stacks extra style layers on top of it. In wide
   desktop/fullscreen layouts, those combined effects can cause cards to repaint,
   resize, or flicker. The lab should be stable first, experimental second.
*/
@media (min-width: 981px) {
    html[data-visual-lab-style] main,
    body[data-visual-lab-style] main {
        grid-auto-flow: row !important;
        grid-auto-rows: auto !important;
        align-items: stretch !important;
    }

    html[data-visual-lab-style] main > .card,
    body[data-visual-lab-style] main > .card {
        grid-row-end: auto !important;
        opacity: 1 !important;
        filter: none !important;
        clip-path: none !important;
        will-change: auto !important;
        contain: paint !important;
        transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease !important;
    }

    html[data-visual-lab-style] main.it-masonry-ready > .card,
    body[data-visual-lab-style] main.it-masonry-ready > .card,
    html[data-visual-lab-style] main.it-masonry-ready > .card:hover,
    body[data-visual-lab-style] main.it-masonry-ready > .card:hover,
    html[data-visual-lab-style] main.it-masonry-ready > .card:focus-within,
    body[data-visual-lab-style] main.it-masonry-ready > .card:focus-within {
        opacity: 1 !important;
        filter: none !important;
    }

    html[data-visual-lab-style] main > .card:hover,
    body[data-visual-lab-style] main > .card:hover,
    html[data-visual-lab-style] main > .card:focus-within,
    body[data-visual-lab-style] main > .card:focus-within {
        border-color: var(--border-strong) !important;
    }

    html[data-visual-lab-style] .card--visual_layer:hover .card-image,
    body[data-visual-lab-style] .card--visual_layer:hover .card-image,
    html[data-visual-lab-style] .card--visual_layer:focus-within .card-image,
    body[data-visual-lab-style] .card--visual_layer:focus-within .card-image {
        transform: none !important;
    }

    /* Static page styles should not inherit the base card-entry transform. */
    html[data-visual-lab-style="paper"] main > .card,
    body[data-visual-lab-style="paper"] main > .card,
    html[data-visual-lab-style="glass"] main > .card,
    body[data-visual-lab-style="glass"] main > .card,
    html[data-visual-lab-style="broadcast"] main > .card,
    body[data-visual-lab-style="broadcast"] main > .card,
    html[data-visual-lab-style="museum"] main > .card,
    body[data-visual-lab-style="museum"] main > .card,
    html[data-visual-lab-style="sticker"] main > .card,
    body[data-visual-lab-style="sticker"] main > .card,
    html[data-visual-lab-style="watercolor"] main > .card,
    body[data-visual-lab-style="watercolor"] main > .card,
    html[data-visual-lab-style="newsroom"] main > .card,
    body[data-visual-lab-style="newsroom"] main > .card,
    html[data-visual-lab-style="neon"] main > .card,
    body[data-visual-lab-style="neon"] main > .card,
    html[data-visual-lab-style="terminal"] main > .card,
    body[data-visual-lab-style="terminal"] main > .card,
    html[data-visual-lab-style="sample"] main > .card,
    body[data-visual-lab-style="sample"] main > .card,
    html[data-visual-lab-style="strict_sample"] main > .card,
    body[data-visual-lab-style="strict_sample"] main > .card {
        animation: none !important;
        transform: none !important;
    }

    /* Glass gets one extra guard: many blurred translucent cards are expensive in
       fullscreen, so keep the material feel without per-card backdrop blur. */
    html[data-visual-lab-style="glass"] main > .card,
    body[data-visual-lab-style="glass"] main > .card {
        background:
            linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.045)),
            rgba(6, 20, 28, 0.68) !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
    }

    html[data-visual-lab-style="glass"] main > .card:hover,
    body[data-visual-lab-style="glass"] main > .card:hover,
    html[data-visual-lab-style="glass"] main > .card:focus-within,
    body[data-visual-lab-style="glass"] main > .card:focus-within {
        border-color: rgba(255,255,255,0.34) !important;
        box-shadow: 0 26px 76px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18) !important;
        background:
            linear-gradient(180deg, rgba(255,255,255,0.17), rgba(255,255,255,0.055)),
            rgba(6, 20, 28, 0.72) !important;
    }

    /* Re-enable intentional full-page animation demo styles after the broad static reset. */
    html[data-visual-lab-style="drift"] main > .card,
    body[data-visual-lab-style="drift"] main > .card {
        animation: it-lab-drift-card 5.6s ease-in-out infinite !important;
    }
    html[data-visual-lab-style="drift"] main > .card:nth-of-type(2n),
    body[data-visual-lab-style="drift"] main > .card:nth-of-type(2n) { animation-delay: -1.7s !important; }
    html[data-visual-lab-style="drift"] main > .card:nth-of-type(3n),
    body[data-visual-lab-style="drift"] main > .card:nth-of-type(3n) { animation-delay: -3.1s !important; }

    html[data-visual-lab-style="hinge"] main > .card,
    body[data-visual-lab-style="hinge"] main > .card {
        animation: it-lab-hinge-in 680ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
        transform-origin: top center !important;
    }
    html[data-visual-lab-style="hinge"] main > .card:hover,
    body[data-visual-lab-style="hinge"] main > .card:hover {
        transform: perspective(900px) rotateX(4deg) translateY(-4px) !important;
    }

    html[data-visual-lab-style="spotlight"] main > .card:hover,
    body[data-visual-lab-style="spotlight"] main > .card:hover {
        transform: translateY(-3px) rotateX(var(--it-lab-tilt-y, 0deg)) rotateY(var(--it-lab-tilt-x, 0deg)) !important;
    }

    html[data-visual-lab-style="cascade"] main > .card,
    body[data-visual-lab-style="cascade"] main > .card {
        animation: it-lab-cascade-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
    }
    html[data-visual-lab-style="cascade"] main > .card:nth-of-type(2n),
    body[data-visual-lab-style="cascade"] main > .card:nth-of-type(2n) { animation-delay: 90ms !important; }
    html[data-visual-lab-style="cascade"] main > .card:nth-of-type(3n),
    body[data-visual-lab-style="cascade"] main > .card:nth-of-type(3n) { animation-delay: 180ms !important; }
    html[data-visual-lab-style="cascade"] main > .card:hover,
    body[data-visual-lab-style="cascade"] main > .card:hover {
        transform: translate(-3px, -3px) !important;
        box-shadow: 14px 14px 0 rgba(0,0,0,0.20) !important;
    }

    html[data-visual-lab-style="flipbook"] main > .card,
    body[data-visual-lab-style="flipbook"] main > .card {
        animation: it-lab-flipbook-breathe 4.8s ease-in-out infinite !important;
        transform-origin: left center !important;
    }
    html[data-visual-lab-style="flipbook"] main > .card:hover,
    body[data-visual-lab-style="flipbook"] main > .card:hover {
        transform: perspective(1200px) rotateY(-6deg) translateX(4px) !important;
    }

    /* Re-enable card-specific animation demo styles in sample modes. */
    html[data-visual-lab-style="sample"] main > .card.it-card-style-drift,
    body[data-visual-lab-style="sample"] main > .card.it-card-style-drift,
    html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift,
    body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift {
        animation: it-lab-drift-card 5.6s ease-in-out infinite !important;
    }

    html[data-visual-lab-style="sample"] main > .card.it-card-style-hinge,
    body[data-visual-lab-style="sample"] main > .card.it-card-style-hinge,
    html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-hinge,
    body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-hinge {
        animation: it-lab-hinge-in 680ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
        transform-origin: top center !important;
    }

    html[data-visual-lab-style="sample"] main > .card.it-card-style-cascade,
    body[data-visual-lab-style="sample"] main > .card.it-card-style-cascade,
    html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade,
    body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade {
        animation: it-lab-cascade-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
    }

    html[data-visual-lab-style="sample"] main > .card.it-card-style-flipbook,
    body[data-visual-lab-style="sample"] main > .card.it-card-style-flipbook,
    html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-flipbook,
    body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-flipbook {
        animation: it-lab-flipbook-breathe 4.8s ease-in-out infinite !important;
        transform-origin: left center !important;
    }
}
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)

    previous_css = context.metadata.get("extra_css", "") or ""
    context.metadata.update(
        {
            "theme_name": "irish_today_visual_lab_stability",
            "extra_css": previous_css + VISUAL_LAB_STABILITY_CSS,
        }
    )
    return context
