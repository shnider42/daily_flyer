from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_improved as base_theme


THEME_CONFIG = base_theme.THEME_CONFIG
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


DESKTOP_LAYOUT_CSS = r"""
/* Irish Today improved layout pass.
   Goal: dynamic tile wall, little wasted space, breathable gaps, and hero-width alignment. */
:root {
    --bg-shift: 0px !important;
    --it-site-width: 94%;
    --it-card-min: 18.5rem;
    --it-edge-gutter: clamp(1rem, 1.25vw, 1.35rem);
}

html,
body {
    background-attachment: fixed !important;
}

.site-bg {
    position: fixed !important;
    inset: 0 !important;
    transform: none !important;
    background-position: center center !important;
    background-size: cover !important;
    will-change: auto !important;
}

@media (min-width: 981px) {
    .hero-wrap,
    main,
    footer {
        width: var(--it-site-width) !important;
        max-width: none !important;
        margin-left: auto !important;
        margin-right: auto !important;
    }

    /* The hero card is inside .hero-wrap's gutter. Give the card wall the same
       visual inset so cards never extend wider than the hero/banner card. */
    main {
        padding: 16px var(--it-edge-gutter) 26px !important;
        display: grid !important;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--it-card-min)), 1fr)) !important;
        grid-auto-flow: dense !important;
        grid-auto-rows: 0.5rem !important;
        column-gap: clamp(1rem, 2.4%, 2rem) !important;
        row-gap: clamp(1rem, 2.2vw, 1.65rem) !important;
        align-items: start !important;
    }

    main.it-masonry-ready .card {
        transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease,
            opacity 140ms ease !important;
    }

    .card {
        grid-column: auto !important;
        width: 100% !important;
        min-width: 0 !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 !important;
        padding: 1.16rem 1.22rem 1.08rem !important;
        align-self: start !important;
    }

    /* The visual layer has no text, so it must own its height explicitly.
       This appears after the generic .card reset so 1440p/fullscreen does not
       collapse it into a thin panoramic strip. */
    main > .card--visual_layer {
        min-height: clamp(22rem, 34vw, 34rem) !important;
        aspect-ratio: 16 / 9;
    }

    .card:hover { transform: translateY(-2px) !important; }

    .card-head { margin-bottom: 0.68rem !important; }
    .body { margin-top: 0.24rem !important; line-height: 1.60 !important; }
    .source { margin-top: 0.82rem !important; padding-top: 0.70rem !important; }
    .card-image-wrap { margin-bottom: 0.74rem !important; }
    .card-image { aspect-ratio: 16 / 9 !important; }

    .df-lab-shell { gap: 0.74rem !important; padding: 0.88rem !important; }
    .df-lab-question { line-height: 1.42 !important; }
    .df-lab-options, .df-lab-grid, .df-lab-wordbank { gap: 0.56rem !important; }
    .df-lab-option, .df-lab-chip, .df-lab-ghost, .df-lab-primary, .df-lab-clue-btn, .df-lab-stack-btn {
        padding-top: 0.62rem !important;
        padding-bottom: 0.62rem !important;
    }

    /* Give dense, visual, or game content more room when the browser can afford it. */
    @media (min-width: 1240px) {
        main > .card--trivia,
        main > .card--history_sort,
        main > .card--county_clues,
        main > .card--memory_match,
        main > .card--news,
        main > .card--visual_layer,
        main > .card--hurling_game {
            grid-column: span 2 !important;
        }
    }

    @media (min-width: 1480px) {
        :root { --it-card-min: 19.25rem; }
    }

    /* Runtime shape set: first three of the eight get the special shapes. */
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
        padding: 1.36rem 1.46rem 1.24rem !important;
    }

    main > .card:nth-of-type(3) {
        border-radius: 0 !important;
        clip-path: polygon(2.2% 0, 100% 0, 100% calc(100% - 2.2%), calc(100% - 2.2%) 100%, 0 100%, 0 2.2%);
        padding: 1.24rem 1.34rem 1.14rem !important;
    }
}

@media (max-width: 980px) {
    main { display: grid !important; }
    .card { clip-path: none !important; grid-row-end: auto !important; }

    .site-bg {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        min-height: 100svh !important;
        transform: none !important;
        background-attachment: scroll !important;
        background-position: center center !important;
    }
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


MASONRY_LAYOUT_JS = r"""
(function () {
    const MIN_DESKTOP_WIDTH = 981;
    const LAYOUT_SELECTOR = "main";
    const CARD_SELECTOR = ".card";
    let resizeObserver = null;
    let scheduled = false;

    function isDesktop() {
        return window.matchMedia("(min-width: " + MIN_DESKTOP_WIDTH + "px)").matches;
    }

    function scheduleLayout() {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(function () {
            scheduled = false;
            applyMasonryLayout();
        });
    }

    function resetCard(card) {
        card.style.gridRowEnd = "";
    }

    function applyMasonryLayout() {
        const grid = document.querySelector(LAYOUT_SELECTOR);
        if (!grid) return;

        const cards = Array.from(grid.querySelectorAll(CARD_SELECTOR));
        if (!cards.length) return;

        if (!isDesktop()) {
            grid.classList.remove("it-masonry-ready");
            cards.forEach(resetCard);
            return;
        }

        const computed = window.getComputedStyle(grid);
        const rowHeight = parseFloat(computed.getPropertyValue("grid-auto-rows")) || 8;
        const rowGap = parseFloat(computed.getPropertyValue("row-gap")) || 18;

        cards.forEach(resetCard);

        cards.forEach(function (card) {
            const height = card.getBoundingClientRect().height;
            const span = Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)));
            card.style.gridRowEnd = "span " + span;
        });

        grid.classList.add("it-masonry-ready");
    }

    function watchCardSizeChanges() {
        const grid = document.querySelector(LAYOUT_SELECTOR);
        if (!grid || !("ResizeObserver" in window)) return;

        if (resizeObserver) resizeObserver.disconnect();
        resizeObserver = new ResizeObserver(scheduleLayout);
        grid.querySelectorAll(CARD_SELECTOR).forEach(function (card) {
            resizeObserver.observe(card);
        });
    }

    function bootMasonry() {
        scheduleLayout();
        watchCardSizeChanges();
        window.addEventListener("resize", scheduleLayout, { passive: true });
        window.addEventListener("load", scheduleLayout, { once: true });
        document.querySelectorAll("img").forEach(function (image) {
            if (!image.complete) {
                image.addEventListener("load", scheduleLayout, { once: true });
                image.addEventListener("error", scheduleLayout, { once: true });
            }
        });
        document.addEventListener("click", function (event) {
            if (event.target && event.target.closest(".df-lab-widget, .card")) {
                window.setTimeout(scheduleLayout, 40);
                window.setTimeout(scheduleLayout, 240);
                window.setTimeout(scheduleLayout, 760);
            }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootMasonry);
    else bootMasonry();
})();
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


FREEZE_BACKGROUND_JS = r"""
(function () {
    function freezeBackground() {
        document.documentElement.style.setProperty('--bg-shift', '0px', 'important');
        const siteBg = document.querySelector('.site-bg');
        if (siteBg) {
            siteBg.style.setProperty('transform', 'none', 'important');
            siteBg.style.setProperty('will-change', 'auto', 'important');
        }
    }

    freezeBackground();
    window.addEventListener('scroll', freezeBackground, { passive: true });
    window.addEventListener('resize', freezeBackground, { passive: true });
    window.addEventListener('load', freezeBackground, { once: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', freezeBackground, { passive: true });
        window.visualViewport.addEventListener('scroll', freezeBackground, { passive: true });
    }
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)
    previous_css = context.metadata.get("extra_css", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""
    context.metadata["extra_css"] = previous_css + DESKTOP_LAYOUT_CSS
    context.metadata["extra_js"] = previous_js + MASONRY_LAYOUT_JS + MEMORY_VISIBLE_JS + FREEZE_BACKGROUND_JS
    context.metadata["theme_name"] = "irish_today"
    return context
