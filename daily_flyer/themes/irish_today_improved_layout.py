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
        grid-auto-rows: 8px !important;
        align-items: start !important;
        gap: 18px !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    main.it-masonry-ready .card {
        transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease,
            opacity 140ms ease !important;
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

        cards.forEach(function (card) {
            resetCard(card);
        });

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

        if (resizeObserver) {
            resizeObserver.disconnect();
        }

        resizeObserver = new ResizeObserver(scheduleLayout);
        grid.querySelectorAll(CARD_SELECTOR).forEach(function (card) {
            resizeObserver.observe(card);
        });
    }

    function boot() {
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
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)
    previous_css = context.metadata.get("extra_css", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""
    context.metadata["extra_css"] = previous_css + DESKTOP_LAYOUT_CSS
    context.metadata["extra_js"] = previous_js + MASONRY_LAYOUT_JS
    context.metadata["theme_name"] = "irish_today"
    return context
