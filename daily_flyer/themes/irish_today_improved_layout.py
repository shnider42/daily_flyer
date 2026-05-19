from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_improved as base_theme


THEME_CONFIG = base_theme.THEME_CONFIG
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


DESKTOP_LAYOUT_CSS = r"""
/* Irish Today improved layout pass.
   Goal: six cards, less dead space, and deliberate card-shape personality. */
@media (min-width: 981px) {
    :root { --max-width: min(1540px, calc(100vw - 48px)); }

    .hero-wrap,
    main,
    footer {
        width: min(1540px, calc(100vw - 48px)) !important;
        max-width: min(1540px, calc(100vw - 48px)) !important;
    }

    .hero-wrap,
    main {
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    /* CSS columns give a truer masonry/Pinterest pack than row-spanning grid. */
    main {
        display: block !important;
        column-count: 3;
        column-gap: 18px;
        gap: 0 !important;
    }

    .card {
        display: inline-block !important;
        width: 100% !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 0 18px !important;
        break-inside: avoid;
        page-break-inside: avoid;
        padding: 1rem 1rem 0.95rem !important;
        vertical-align: top;
    }

    .card:hover { transform: translateY(-2px) !important; }

    .card-head { margin-bottom: 0.58rem !important; }
    .body { margin-top: 0.18rem !important; line-height: 1.54 !important; }
    .source { margin-top: 0.72rem !important; padding-top: 0.62rem !important; }
    .card-image-wrap { margin-bottom: 0.68rem !important; }
    .card-image { aspect-ratio: 16 / 8.5 !important; }

    .df-lab-shell { gap: 0.62rem !important; padding: 0.78rem !important; }
    .df-lab-question { line-height: 1.35 !important; }
    .df-lab-options, .df-lab-grid, .df-lab-wordbank { gap: 0.48rem !important; }
    .df-lab-option, .df-lab-chip, .df-lab-ghost, .df-lab-primary, .df-lab-clue-btn, .df-lab-stack-btn {
        padding-top: 0.54rem !important;
        padding-bottom: 0.54rem !important;
    }

    /* Runtime shape set: first three of the six get the special shapes. */
    main > .card:nth-of-type(1) {
        border-radius: 0 !important;
    }

    main > .card:nth-of-type(2) {
        border-radius: 30px !important;
        clip-path: polygon(
            6% 0%, 50% 0%, 54% 5%, 58% 0%, 94% 0%,
            100% 6%, 100% 45%, 95% 50%, 100% 55%, 100% 94%,
            94% 100%, 58% 100%, 54% 95%, 50% 100%, 6% 100%,
            0% 94%, 0% 55%, 5% 50%, 0% 45%, 0% 6%
        );
    }

    main > .card:nth-of-type(3) {
        border-radius: 0 !important;
        clip-path: polygon(24px 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%, 0 24px);
    }
}

@media (min-width: 1320px) {
    main { column-count: 4; }
}

@media (min-width: 1720px) {
    main { column-count: 5; }
}

@media (max-width: 980px) {
    main { display: grid !important; }
    .card { clip-path: none !important; }
}

/* Visible-pair memory mode for Irish Today: no blind matching boxes. */
.card--memory_match .df-lab-tile,
.card--memory_match .df-lab-tile.is-hidden,
.card--memory_match .df-lab-tile.is-open,
.card--memory_match .df-lab-tile.is-matched {
    color: var(--ink) !important;
    background: rgba(255,255,255,0.065) !important;
    border-color: rgba(255,255,255,0.16) !important;
}

.card--memory_match .df-lab-tile.is-matched {
    background: rgba(41,179,106,0.20) !important;
    border-color: rgba(41,179,106,0.60) !important;
}
"""


MEMORY_VISIBLE_JS = r"""
(function () {
    function revealMemoryTiles() {
        document.querySelectorAll('.card--memory_match .df-lab-tile').forEach(function (tile) {
            if (tile.textContent === '•' && tile.dataset.memoryText) {
                tile.textContent = tile.dataset.memoryText;
            }
        });
    }

    function patchMemoryCards() {
        document.querySelectorAll('.card--memory_match .df-lab-tile').forEach(function (tile) {
            if (!tile.dataset.memoryText && tile.textContent && tile.textContent !== '•') {
                tile.dataset.memoryText = tile.textContent;
            }
            tile.classList.remove('is-hidden');
        });
        revealMemoryTiles();
    }

    function boot() {
        patchMemoryCards();
        document.addEventListener('click', function (event) {
            if (event.target && event.target.closest('.card--memory_match')) {
                window.setTimeout(patchMemoryCards, 20);
                window.setTimeout(patchMemoryCards, 760);
            }
        });
        if ('MutationObserver' in window) {
            const observer = new MutationObserver(patchMemoryCards);
            document.querySelectorAll('.card--memory_match').forEach(function (card) {
                observer.observe(card, { childList: true, subtree: true, characterData: true });
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)
    previous_css = context.metadata.get("extra_css", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""
    context.metadata["extra_css"] = previous_css + DESKTOP_LAYOUT_CSS
    context.metadata["extra_js"] = previous_js + MEMORY_VISIBLE_JS
    context.metadata["theme_name"] = "irish_today"
    return context
