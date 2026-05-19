from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_improved as base_theme


THEME_CONFIG = base_theme.THEME_CONFIG
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


DESKTOP_LAYOUT_CSS = r"""
/* Irish Today improved layout pass.
   Goal: six cards, enough breathing room, and deliberate card-shape personality. */
@media (min-width: 981px) {
    :root { --max-width: min(1480px, calc(100vw - 64px)); }

    /* Keep the hero/banner width as-is, and make the card wall share that same outer width. */
    .hero-wrap,
    main,
    footer {
        width: min(1480px, calc(100vw - 64px)) !important;
        max-width: min(1480px, calc(100vw - 64px)) !important;
        margin-left: auto !important;
        margin-right: auto !important;
    }

    .hero-wrap,
    main {
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    /* Explicit grid gap guarantees left/right cards never touch. */
    main {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        column-gap: 42px !important;
        row-gap: 32px !important;
        align-items: start !important;
    }

    .card {
        width: 100% !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 !important;
        padding: 1.24rem 1.34rem 1.16rem !important;
        align-self: start !important;
    }

    .card:hover { transform: translateY(-2px) !important; }

    .card-head { margin-bottom: 0.72rem !important; }
    .body { margin-top: 0.24rem !important; line-height: 1.62 !important; }
    .source { margin-top: 0.84rem !important; padding-top: 0.72rem !important; }
    .card-image-wrap { margin-bottom: 0.76rem !important; }
    .card-image { aspect-ratio: 16 / 9 !important; }

    .df-lab-shell { gap: 0.78rem !important; padding: 0.92rem !important; }
    .df-lab-question { line-height: 1.45 !important; }
    .df-lab-options, .df-lab-grid, .df-lab-wordbank { gap: 0.58rem !important; }
    .df-lab-option, .df-lab-chip, .df-lab-ghost, .df-lab-primary, .df-lab-clue-btn, .df-lab-stack-btn {
        padding-top: 0.64rem !important;
        padding-bottom: 0.64rem !important;
    }

    /* Runtime shape set: first three of the six get the special shapes. */
    main > .card:nth-of-type(1) {
        border-radius: 0 !important;
    }

    /* Softer notched/star treatment. Keep this subtle so the outline never bites into text. */
    main > .card:nth-of-type(2) {
        border-radius: 26px !important;
        clip-path: polygon(
            3% 0%, 48% 0%, 51% 2.5%, 54% 0%, 97% 0%,
            100% 3%, 100% 47%, 97.5% 50%, 100% 53%, 100% 97%,
            97% 100%, 54% 100%, 51% 97.5%, 48% 100%, 3% 100%,
            0% 97%, 0% 53%, 2.5% 50%, 0% 47%, 0% 3%
        );
        padding: 1.44rem 1.56rem 1.32rem !important;
    }

    main > .card:nth-of-type(3) {
        border-radius: 0 !important;
        clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
        padding: 1.30rem 1.42rem 1.20rem !important;
    }
}

@media (min-width: 1720px) {
    main {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        column-gap: 42px !important;
    }
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
