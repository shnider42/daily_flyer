from __future__ import annotations

from pathlib import Path

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_improved as base_theme
from daily_flyer.utils import resolve_date


THEME_CONFIG = base_theme.THEME_CONFIG
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])
HERO_BACKGROUND_DIR = Path(__file__).resolve().parent / "df-it-backgrounds"
HERO_BACKGROUND_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _hero_background_paths() -> list[Path]:
    if not HERO_BACKGROUND_DIR.exists():
        return []
    return sorted(
        path
        for path in HERO_BACKGROUND_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in HERO_BACKGROUND_EXTENSIONS
    )


def _hero_background_url(date_str: str | None) -> str | None:
    today = resolve_date(date_str)
    backgrounds = _hero_background_paths()
    if not backgrounds:
        return None
    chosen = backgrounds[today.toordinal() % len(backgrounds)]
    return f"/daily_flyer/themes/df-it-backgrounds/{chosen.name}"


def _hero_background_css(date_str: str | None) -> str:
    image_url = _hero_background_url(date_str)
    if not image_url:
        return ""
    return f"""
header.hero {{
    --it-hero-parallax-y: 0%;
    isolation: isolate;
    position: relative;
    overflow: hidden;
    background:
        linear-gradient(135deg, rgba(7, 58, 39, 0.92), rgba(8, 38, 58, 0.88)) !important;
    background-color: rgba(7, 33, 22, 0.96) !important;
}}

header.hero::after {{
    content: "";
    position: absolute;
    inset: -24% -4%;
    z-index: 0;
    pointer-events: none;
    background-image: url('{image_url}');
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    transform: translate3d(0, var(--it-hero-parallax-y), 0) scale(1.18);
    transform-origin: center center;
    will-change: transform;
    filter: saturate(0.96) brightness(0.86);
}}

header.hero::before {{
    z-index: 1 !important;
    background:
        linear-gradient(90deg, rgba(2,10,8,0.82) 0%, rgba(2,10,8,0.60) 34%, rgba(2,10,8,0.34) 66%, rgba(2,10,8,0.58) 100%),
        linear-gradient(180deg, rgba(0,0,0,0.22), rgba(0,0,0,0.62)),
        radial-gradient(circle at 18% 18%, rgba(31,171,98,0.34), transparent 18rem),
        radial-gradient(circle at 88% 26%, rgba(255,159,67,0.22), transparent 16rem) !important;
    opacity: 1 !important;
}}

header.hero > * {{
    position: relative;
    z-index: 2;
}}

header.hero .hero-kicker,
header.hero .hero-pill {{
    background: rgba(0,0,0,0.26) !important;
    border-color: rgba(255,255,255,0.17) !important;
    box-shadow: 0 12px 26px rgba(0,0,0,0.16);
}}

header.hero .subtitle,
header.hero .hero-pill,
header.hero .hero-kicker {{
    text-shadow: 0 2px 16px rgba(0,0,0,0.44);
}}
"""


DESKTOP_LAYOUT_CSS = r"""
:root {
    --bg-shift: 0px !important;
    --it-site-width: 94%;
    --it-card-min: 18.5rem;
    --it-edge-gutter: clamp(1rem, 1.25vw, 1.35rem);
}

html,
body { background-attachment: fixed !important; }
.site-bg {
    position: fixed !important;
    inset: 0 !important;
    transform: none !important;
    background-position: center center !important;
    background-size: cover !important;
    will-change: auto !important;
}

@keyframes it-card-enter {
    from { opacity: 0; transform: translate3d(var(--it-enter-x, 0%), var(--it-enter-y, 4%), 0); }
    to { opacity: 1; transform: translate3d(0%, 0%, 0); }
}

main > .card {
    --it-enter-x: 0%;
    --it-enter-y: 4%;
    opacity: 0;
    transform: translate3d(var(--it-enter-x), var(--it-enter-y), 0);
    animation: it-card-enter 560ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    animation-delay: 0ms;
}
main > .card:nth-of-type(2n) { --it-enter-x: 3.5%; --it-enter-y: 0%; animation-delay: 70ms; }
main > .card:nth-of-type(3n) { --it-enter-x: -3.5%; --it-enter-y: 0%; animation-delay: 140ms; }
main > .card:nth-of-type(4n) { --it-enter-x: 0%; --it-enter-y: 3%; animation-delay: 210ms; }
main > .card:nth-of-type(5n) { animation-delay: 280ms; }
main > .card:nth-of-type(6n) { animation-delay: 350ms; }
main > .card:nth-of-type(7n) { animation-delay: 420ms; }
main > .card:nth-of-type(8n) { animation-delay: 490ms; }

@media (prefers-reduced-motion: reduce) {
    main > .card { opacity: 1 !important; transform: none !important; animation: none !important; transition: none !important; }
    header.hero::after { transform: none !important; will-change: auto !important; }
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
        transition: border-color 180ms ease, box-shadow 180ms ease, filter 180ms ease, opacity 180ms ease !important;
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

    main > .card--visual_layer {
        min-height: clamp(22rem, 34vw, 34rem) !important;
        aspect-ratio: 16 / 9;
    }

    @media (hover: hover) and (pointer: fine) {
        main.it-masonry-ready > .card { opacity: 0.78; filter: saturate(0.58) brightness(0.88) contrast(0.96); }
        main.it-masonry-ready > .card:hover,
        main.it-masonry-ready > .card:focus-within { opacity: 1; filter: saturate(1.08) brightness(1.035) contrast(1); }
    }

    .card:hover,
    main > .card:hover,
    main > .card:focus-within {
        transform: none !important;
        border-color: var(--border-strong) !important;
        box-shadow: 0 22px 54px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.09) !important;
    }

    .card--visual_layer:hover .card-image,
    .card--visual_layer:focus-within .card-image { transform: scale(1.018) !important; }

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

    @media (min-width: 1240px) {
        main > .card--trivia,
        main > .card--history_sort,
        main > .card--county_clues,
        main > .card--memory_match,
        main > .card--news,
        main > .card--visual_layer,
        main > .card--hurling_game,
        main > .card--county { grid-column: span 2 !important; }
    }

    @media (min-width: 1480px) { :root { --it-card-min: 19.25rem; } }

    main > .card:nth-of-type(1) { border-radius: 0 !important; }
    main > .card:nth-of-type(2) {
        border-radius: 26px !important;
        clip-path: polygon(3% 0%, 48% 0%, 51% 2.5%, 54% 0%, 97% 0%, 100% 3%, 100% 47%, 97.5% 50%, 100% 53%, 100% 97%, 97% 100%, 54% 100%, 51% 97.5%, 48% 100%, 3% 100%, 0% 97%, 0% 53%, 2.5% 50%, 0% 47%, 0% 3%);
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

/* County of the Week: full-photo card with readable text and whole-card link behavior. */
.card--county {
    position: relative;
    overflow: hidden;
    min-height: clamp(21rem, 28vw, 32rem) !important;
    display: grid;
    align-content: end;
    cursor: pointer;
    background: #071712 !important;
}
.card--county .card-image-wrap {
    position: absolute;
    inset: 0;
    z-index: 0;
    margin: 0 !important;
    border: 0 !important;
    border-radius: inherit;
    background: transparent !important;
}
.card--county .card-image {
    width: 100%;
    height: 100%;
    aspect-ratio: auto !important;
    object-fit: cover;
    object-position: center center;
    filter: saturate(1.05) brightness(0.86);
}
.card--county::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1 !important;
    pointer-events: none;
    background:
        linear-gradient(90deg, rgba(2,10,8,0.84) 0%, rgba(2,10,8,0.58) 42%, rgba(2,10,8,0.26) 100%),
        linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.72)),
        radial-gradient(circle at 12% 20%, rgba(31,171,98,0.24), transparent 18rem) !important;
}
.card--county .card-head,
.card--county .body,
.card--county .source { position: relative; z-index: 2; }
.card--county .body .it-story-shell {
    max-width: 72ch;
    padding: 0.85rem 0.95rem;
    border-radius: 22px;
    background: rgba(0,0,0,0.32);
    border: 1px solid rgba(255,255,255,0.15);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}
.card--county .body,
.card--county .it-story-text,
.card--county h2 { color: #fff !important; text-shadow: 0 2px 16px rgba(0,0,0,0.58); }
.card--county .eyebrow,
.card--county .it-chip { color: rgba(255,255,255,0.86) !important; }
.card--county .source { border-top: 0 !important; margin-top: 0.82rem !important; padding-top: 0 !important; }
.card--county .source a {
    display: inline-flex;
    width: fit-content;
    padding: 0.56rem 0.78rem;
    border-radius: 999px;
    color: #062016 !important;
    background: linear-gradient(180deg, rgba(143,230,203,0.98), rgba(118,211,183,0.95));
    box-shadow: 0 14px 32px rgba(0,0,0,0.24);
}
.card--county .source a::after { content: " ↗"; }

/* Gaeilge cards keep their interiors, but get gentler outer edges. */
.card--word,
.card--gaeilge_quiz {
    border-radius: 46px 34px 52px 34px !important;
}
.card--word .df-lab-shell,
.card--gaeilge_quiz .df-lab-shell,
.card--word .it-language-shell,
.card--gaeilge_quiz .it-language-shell {
    border-radius: 28px !important;
}

/* Davy Holden card: make the internal link cards feel intentional. */
.card--news .it-davy-shell { gap: 0.85rem !important; }
.card--news .it-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: 0.72rem !important;
}
.card--news .it-list-link {
    position: relative;
    display: grid !important;
    align-items: start !important;
    gap: 0.32rem !important;
    min-height: 5.4rem;
    padding: 0.82rem 0.9rem 0.86rem !important;
    border-radius: 20px;
    overflow: hidden;
    background:
        linear-gradient(135deg, rgba(255,159,67,0.18), rgba(31,171,98,0.10)),
        rgba(255,255,255,0.075) !important;
    border: 1px solid rgba(255,255,255,0.13);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 26px rgba(0,0,0,0.13);
    text-decoration: none !important;
}
.card--news .it-list-link::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 0.32rem;
    background: linear-gradient(180deg, var(--it-orange), var(--it-green));
    opacity: 0.9;
}
.card--news .it-list-link:hover {
    border-color: rgba(255,255,255,0.25);
    background:
        linear-gradient(135deg, rgba(255,159,67,0.24), rgba(31,171,98,0.14)),
        rgba(255,255,255,0.10) !important;
}
.card--news .it-list-link span:first-child {
    font-size: 0.74rem;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.72);
}
.card--news .it-list-link span:last-child {
    color: #fff;
    white-space: normal !important;
    line-height: 1.34;
}

/* Hurling start gate. */
.it-hurling-game.is-waiting .it-hurling-aim { left: 50% !important; opacity: 0.52; }
.it-hurling-game.is-waiting .it-hurling-strike { pointer-events: none; opacity: 0.48; }
.it-hurling-start {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 8;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(255,255,255,0.24);
    border-radius: 999px;
    padding: 0.76rem 1.05rem;
    background: rgba(3, 16, 11, 0.72);
    color: #fff;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 14px 38px rgba(0,0,0,0.34);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}
.it-hurling-game.is-started .it-hurling-start { display: none !important; }
.it-hurling-game.is-waiting .it-hurling-pitch::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 7;
    pointer-events: none;
    background: radial-gradient(circle at 50% 45%, rgba(0,0,0,0.10), rgba(0,0,0,0.24));
}

/* Visible-pair memory mode. */
.card--memory_match .df-lab-tile,
.card--memory_match .df-lab-tile.is-hidden,
.card--memory_match .df-lab-tile.is-open,
.card--memory_match .df-lab-tile.is-matched,
.card--memory_match .df-lab-tile.is-selected {
    color: var(--ink) !important;
    background: rgba(255,255,255,0.065) !important;
    border-color: rgba(255,255,255,0.16) !important;
}
.card--memory_match .df-lab-tile.is-selected {
    background: rgba(125,183,217,0.18) !important;
    border-color: rgba(125,183,217,0.55) !important;
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

    function resetCard(card) { card.style.gridRowEnd = ""; }

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
        grid.querySelectorAll(CARD_SELECTOR).forEach(function (card) { resizeObserver.observe(card); });
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
    function parseConfig(widget) {
        try { return JSON.parse(widget.getAttribute('data-lab-config') || '{}'); }
        catch (err) { return {}; }
    }

    function seedFromText(text) {
        let seed = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            seed ^= text.charCodeAt(i);
            seed = Math.imul(seed, 16777619);
        }
        return seed >>> 0;
    }

    function shuffleStable(items, seedText) {
        let seed = seedFromText(seedText);
        const deck = items.slice();
        function next() {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        }
        for (let i = deck.length - 1; i > 0; i -= 1) {
            const j = Math.floor(next() * (i + 1));
            const tmp = deck[i];
            deck[i] = deck[j];
            deck[j] = tmp;
        }
        return deck;
    }

    function mountVisibleMemory(widget) {
        if (widget.dataset.visibleMemoryMounted === 'true') return;
        const mount = widget.querySelector('.df-lab-mount');
        const config = parseConfig(widget);
        const pairs = Array.isArray(config.pairs) ? config.pairs : [];
        if (!mount || !pairs.length) return;

        widget.dataset.visibleMemoryMounted = 'true';
        const cardId = widget.dataset.labCardId || 'visible-memory-match';
        let deck = shuffleStable(pairs.flatMap(function (pair, pairIndex) {
            return [
                { key: pairIndex, text: pair.left || '' },
                { key: pairIndex, text: pair.right || '' }
            ];
        }), cardId);
        let selected = [];
        let matched = new Set();
        let moves = 0;
        let result = 'All words are visible. Pick an Irish word and its English meaning.';
        let lock = false;

        function render() {
            mount.innerHTML = `
                <div class="df-lab-shell">
                    <div class="df-lab-statrow">
                        <div class="df-lab-pill">Moves: ${moves}</div>
                        <div class="df-lab-pill">Visible pair mode</div>
                    </div>
                    <div class="df-lab-grid df-lab-grid--two"></div>
                    <div class="df-lab-result" aria-live="polite"></div>
                    <div class="df-lab-actions">
                        <button class="df-lab-ghost" type="button" data-action="reset">New board</button>
                    </div>
                </div>
            `;
            const grid = mount.querySelector('.df-lab-grid');
            const resultEl = mount.querySelector('.df-lab-result');
            resultEl.textContent = result;
            deck.forEach(function (item, index) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'df-lab-tile';
                if (matched.has(index)) button.classList.add('is-matched');
                else if (selected.includes(index)) button.classList.add('is-selected');
                button.textContent = item.text;
                button.addEventListener('click', function () {
                    if (lock || matched.has(index) || selected.includes(index)) return;
                    selected.push(index);
                    if (selected.length < 2) {
                        result = 'Now choose its match.';
                        render();
                        return;
                    }
                    moves += 1;
                    const first = selected[0];
                    const second = selected[1];
                    if (deck[first].key === deck[second].key) {
                        matched.add(first);
                        matched.add(second);
                        selected = [];
                        result = matched.size === deck.length ? 'Matched them all.' : 'Nice match.';
                        render();
                    } else {
                        result = 'Not a match. Try another pair.';
                        lock = true;
                        render();
                        window.setTimeout(function () {
                            selected = [];
                            lock = false;
                            render();
                        }, 520);
                    }
                });
                grid.appendChild(button);
            });
            mount.querySelector('[data-action="reset"]').addEventListener('click', function () {
                deck = shuffleStable(deck, cardId + ':' + String(Date.now()));
                selected = [];
                matched = new Set();
                moves = 0;
                result = 'All words are visible. Pick an Irish word and its English meaning.';
                render();
            });
        }

        render();
    }

    function boot() {
        document.querySelectorAll('.card--memory_match [data-lab-widget="memory_match"]').forEach(mountVisibleMemory);
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


HERO_PARALLAX_JS = r"""
(function () {
    const hero = document.querySelector('header.hero');
    if (!hero) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scheduled = false;
    function calculateShift() {
        if (reduceMotion) return 0;
        const rect = hero.getBoundingClientRect();
        const progress = Math.max(-1, Math.min(1, (0 - rect.top) / Math.max(rect.height, 1)));
        return progress * -22;
    }
    function updateHeroParallax() {
        scheduled = false;
        hero.style.setProperty('--it-hero-parallax-y', calculateShift().toFixed(2) + '%');
    }
    function scheduleHeroParallax() {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(updateHeroParallax);
    }
    updateHeroParallax();
    window.addEventListener('scroll', scheduleHeroParallax, { passive: true });
    window.addEventListener('resize', scheduleHeroParallax, { passive: true });
    window.addEventListener('load', scheduleHeroParallax, { once: true });
})();
"""


HURLING_START_GUARD_JS = r"""
(function () {
    function prepareGame(root) {
        const pitch = root.querySelector('[data-hurling-pitch]');
        const strike = root.querySelector('[data-hurling-strike]');
        const reset = root.querySelector('[data-hurling-reset]');
        const result = root.querySelector('[data-hurling-result]');
        if (!pitch || !strike || root.dataset.startGuardReady === 'true') return;
        root.dataset.startGuardReady = 'true';
        root.classList.add('is-waiting');
        strike.disabled = true;
        if (result) result.textContent = 'Press Start when you are ready. The aim marker will begin moving after that.';
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'it-hurling-start';
        start.textContent = 'Start game';
        pitch.appendChild(start);
        function startGame() {
            root.classList.remove('is-waiting');
            root.classList.add('is-started');
            strike.disabled = false;
            if (result) result.textContent = 'Aim is live. Tap / click to strike through the posts.';
        }
        function waitForStart() {
            root.classList.remove('is-started');
            root.classList.add('is-waiting');
            strike.disabled = true;
            if (result) result.textContent = 'Press Start when you are ready. The aim marker will begin moving after that.';
        }
        start.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            startGame();
        });
        if (reset) reset.addEventListener('click', function () { window.setTimeout(waitForStart, 0); });
    }
    function boot() { document.querySelectorAll('[data-it-hurling-game]').forEach(prepareGame); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
"""


COUNTY_CARD_LINK_JS = r"""
(function () {
    function bootCountyLinks() {
        document.querySelectorAll('.card--county').forEach(function (card) {
            const link = card.querySelector('.source a[href]');
            if (!link || card.dataset.countyLinkReady === 'true') return;
            card.dataset.countyLinkReady = 'true';
            card.setAttribute('role', 'link');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', 'Open County of the Week link');
            function openLink() { window.open(link.href, '_blank', 'noopener,noreferrer'); }
            card.addEventListener('click', function (event) {
                if (event.target.closest('a, button, input, textarea, select')) return;
                openLink();
            });
            card.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') openLink();
            });
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootCountyLinks);
    else bootCountyLinks();
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)
    previous_css = context.metadata.get("extra_css", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""
    context.metadata["extra_css"] = previous_css + _hero_background_css(date_str) + DESKTOP_LAYOUT_CSS
    context.metadata["extra_js"] = (
        MASONRY_LAYOUT_JS
        + (previous_js or "")
        + MEMORY_VISIBLE_JS
        + FREEZE_BACKGROUND_JS
        + HERO_PARALLAX_JS
        + HURLING_START_GUARD_JS
        + COUNTY_CARD_LINK_JS
    )
    context.metadata["theme_name"] = "irish_today"
    return context
