from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_visual_lab_menu as base_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


CARD_MOTION_CSS = r"""
/* Card-specific motion layer for sample / strict_sample. */
html[data-visual-lab-style="sample"] main > .card.it-card-style-drift,
body[data-visual-lab-style="sample"] main > .card.it-card-style-drift,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift {
    animation: it-lab-drift-card 5.6s ease-in-out infinite !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-drift:nth-of-type(2n),
body[data-visual-lab-style="sample"] main > .card.it-card-style-drift:nth-of-type(2n),
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift:nth-of-type(2n),
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift:nth-of-type(2n) {
    animation-delay: -1.7s !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-drift:nth-of-type(3n),
body[data-visual-lab-style="sample"] main > .card.it-card-style-drift:nth-of-type(3n),
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift:nth-of-type(3n),
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift:nth-of-type(3n) {
    animation-delay: -3.1s !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-hinge,
body[data-visual-lab-style="sample"] main > .card.it-card-style-hinge,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-hinge,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-hinge {
    animation: it-lab-hinge-in 680ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
    transform-origin: top center !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-hinge:hover,
body[data-visual-lab-style="sample"] main > .card.it-card-style-hinge:hover,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-hinge:hover,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-hinge:hover {
    transform: perspective(900px) rotateX(4deg) translateY(-4px) !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-spotlight::before,
body[data-visual-lab-style="sample"] main > .card.it-card-style-spotlight::before,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-spotlight::before,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-spotlight::before {
    background: radial-gradient(circle at var(--it-lab-mx, 50%) var(--it-lab-my, 50%), rgba(255,255,255,0.22), transparent 9rem) !important;
    opacity: 1 !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-spotlight:hover,
body[data-visual-lab-style="sample"] main > .card.it-card-style-spotlight:hover,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-spotlight:hover,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-spotlight:hover {
    transform: translateY(-3px) rotateX(var(--it-lab-tilt-y, 0deg)) rotateY(var(--it-lab-tilt-x, 0deg)) !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-cascade,
body[data-visual-lab-style="sample"] main > .card.it-card-style-cascade,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade {
    animation: it-lab-cascade-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-cascade:nth-of-type(2n),
body[data-visual-lab-style="sample"] main > .card.it-card-style-cascade:nth-of-type(2n),
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade:nth-of-type(2n),
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade:nth-of-type(2n) {
    animation-delay: 90ms !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-cascade:nth-of-type(3n),
body[data-visual-lab-style="sample"] main > .card.it-card-style-cascade:nth-of-type(3n),
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade:nth-of-type(3n),
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade:nth-of-type(3n) {
    animation-delay: 180ms !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-cascade:hover,
body[data-visual-lab-style="sample"] main > .card.it-card-style-cascade:hover,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade:hover,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade:hover {
    transform: translate(-3px, -3px) !important;
    box-shadow: 14px 14px 0 rgba(0,0,0,0.20) !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-flipbook,
body[data-visual-lab-style="sample"] main > .card.it-card-style-flipbook,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-flipbook,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-flipbook {
    animation: it-lab-flipbook-breathe 4.8s ease-in-out infinite !important;
    transform-origin: left center !important;
}

html[data-visual-lab-style="sample"] main > .card.it-card-style-flipbook:hover,
body[data-visual-lab-style="sample"] main > .card.it-card-style-flipbook:hover,
html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-flipbook:hover,
body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-flipbook:hover {
    transform: perspective(1200px) rotateY(-6deg) translateX(4px) !important;
}

@media (prefers-reduced-motion: reduce) {
    html[data-visual-lab-style="sample"] main > .card.it-card-style-drift,
    body[data-visual-lab-style="sample"] main > .card.it-card-style-drift,
    html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift,
    body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-drift,
    html[data-visual-lab-style="sample"] main > .card.it-card-style-hinge,
    body[data-visual-lab-style="sample"] main > .card.it-card-style-hinge,
    html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-hinge,
    body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-hinge,
    html[data-visual-lab-style="sample"] main > .card.it-card-style-cascade,
    body[data-visual-lab-style="sample"] main > .card.it-card-style-cascade,
    html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade,
    body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-cascade,
    html[data-visual-lab-style="sample"] main > .card.it-card-style-flipbook,
    body[data-visual-lab-style="sample"] main > .card.it-card-style-flipbook,
    html[data-visual-lab-style="strict_sample"] main > .card.it-card-style-flipbook,
    body[data-visual-lab-style="strict_sample"] main > .card.it-card-style-flipbook {
        animation: none !important;
    }
}
"""


CARD_MOTION_JS = r"""
(function () {
    function styleMode() {
        return (document.documentElement.getAttribute('data-visual-lab-style') || '').toLowerCase();
    }

    function cardUsesSpotlight(card) {
        const mode = styleMode();
        return mode === 'spotlight' ||
            ((mode === 'sample' || mode === 'strict_sample') && card.classList.contains('it-card-style-spotlight'));
    }

    document.addEventListener('pointermove', function (event) {
        const card = event.target && event.target.closest ? event.target.closest('.card') : null;
        if (!card || !cardUsesSpotlight(card)) return;
        const rect = card.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
        const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
        card.style.setProperty('--it-lab-mx', x.toFixed(2) + '%');
        card.style.setProperty('--it-lab-my', y.toFixed(2) + '%');
        card.style.setProperty('--it-lab-tilt-x', ((x - 50) / 20).toFixed(2) + 'deg');
        card.style.setProperty('--it-lab-tilt-y', ((50 - y) / 24).toFixed(2) + 'deg');
    }, { passive: true });
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)

    previous_css = context.metadata.get("extra_css", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""

    context.metadata.update(
        {
            "theme_name": "irish_today_visual_lab_card_motion",
            "extra_css": previous_css + CARD_MOTION_CSS,
            "extra_js": previous_js + CARD_MOTION_JS,
        }
    )
    return context
