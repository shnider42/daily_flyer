
from __future__ import annotations

from html import escape
from pathlib import Path

from daily_flyer.models import CardItem, PageContext


def build_html(context: PageContext) -> str:
    css = """
    :root {
        --charcoal: #1F2937;
        --charcoal-deep: #111827;
        --charcoal-soft: #374151;
        --charcoal-ink: #0b1220;
        --signal-green: #22C55E;
        --signal-green-soft: rgba(34, 197, 94, 0.18);
        --bright-orange: #F97316;
        --bright-orange-soft: rgba(249, 115, 22, 0.18);
        --cream: #f8fafc;
        --slate-100: #f1f5f9;
        --slate-200: #e2e8f0;
        --slate-300: #cbd5e1;
        --slate-400: #94a3b8;
        --slate-500: #64748b;
        --glass: rgba(255, 255, 255, 0.06);
        --glass-strong: rgba(255, 255, 255, 0.09);
        --glass-border: rgba(255, 255, 255, 0.10);
        --glass-border-strong: rgba(255, 255, 255, 0.18);
        --shadow-xl: 0 30px 80px rgba(2, 6, 23, 0.42);
        --shadow-lg: 0 18px 44px rgba(2, 6, 23, 0.34);
        --shadow-md: 0 12px 28px rgba(2, 6, 23, 0.26);
        --radius-2xl: 32px;
        --radius-xl: 24px;
        --radius-lg: 18px;
        --radius-md: 14px;
        --max-width: 1240px;
        --bg-shift: 0px;
        --card-accent: var(--signal-green);
        --hero-gradient:
            linear-gradient(135deg, rgba(255,255,255,0.11), rgba(255,255,255,0.04)),
            linear-gradient(120deg, rgba(34,197,94,0.14), rgba(34,197,94,0.04) 28%, rgba(249,115,22,0.05) 70%, rgba(249,115,22,0.14) 100%);
    }

    * { box-sizing: border-box; }

    html { scroll-behavior: smooth; }

    body {
        margin: 0;
        color: var(--cream);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background:
            radial-gradient(circle at 14% 14%, rgba(34,197,94,0.14), transparent 26%),
            radial-gradient(circle at 86% 10%, rgba(249,115,22,0.13), transparent 24%),
            radial-gradient(circle at 50% 100%, rgba(56,189,248,0.07), transparent 28%),
            linear-gradient(180deg, #182332 0%, #111827 40%, #0b1220 100%);
        min-height: 100vh;
        overflow-x: hidden;
        position: relative;
    }

    body::before,
    body::after {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
    }

    body::before {
        background:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
        background-size: 34px 34px;
        mask-image: radial-gradient(circle at center, rgba(0,0,0,0.9), transparent 78%);
        opacity: 0.24;
    }

    body::after {
        background:
            radial-gradient(circle at 12% 22%, rgba(34,197,94,0.12), transparent 24%),
            radial-gradient(circle at 88% 16%, rgba(249,115,22,0.12), transparent 22%);
        filter: blur(24px);
        opacity: 0.85;
    }

    ::selection {
        background: rgba(249, 115, 22, 0.24);
        color: white;
    }

    * {
        scrollbar-width: thin;
        scrollbar-color: rgba(249,115,22,0.5) rgba(255,255,255,0.08);
    }

    *::-webkit-scrollbar { width: 11px; }
    *::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
    *::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(34,197,94,0.65), rgba(249,115,22,0.75));
        border-radius: 999px;
        border: 2px solid rgba(17,24,39,0.75);
    }

    a {
        color: #a7f3d0;
        text-decoration: none;
        transition: color 180ms ease, opacity 180ms ease;
    }

    a:hover { color: #ffffff; }

    .site-bg {
        position: fixed;
        inset: 0;
        z-index: 0;
        background-size: cover;
        background-position: center center;
        background-repeat: no-repeat;
        transform: translateY(var(--bg-shift)) scale(1.045);
        transform-origin: center center;
        will-change: transform;
        filter: saturate(0.92) brightness(0.56);
        opacity: 0.75;
    }

    .site-bg::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
            linear-gradient(180deg, rgba(11,18,32,0.30), rgba(11,18,32,0.72)),
            radial-gradient(circle at top, rgba(34,197,94,0.10), transparent 30%),
            radial-gradient(circle at bottom right, rgba(249,115,22,0.08), transparent 25%);
    }

    .page-shell {
        position: relative;
        z-index: 1;
        padding-bottom: 20px;
    }

    .hero-wrap {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: 26px 18px 8px;
    }

    header.hero {
        position: relative;
        overflow: hidden;
        padding: 30px;
        border-radius: var(--radius-2xl);
        border: 1px solid var(--glass-border);
        background: var(--hero-gradient);
        box-shadow: var(--shadow-xl);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        isolation: isolate;
    }

    header.hero::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
            radial-gradient(circle at top left, rgba(34,197,94,0.18), transparent 24%),
            radial-gradient(circle at top right, rgba(249,115,22,0.18), transparent 24%),
            linear-gradient(120deg, transparent 15%, rgba(255,255,255,0.06) 50%, transparent 85%);
        pointer-events: none;
        z-index: -1;
    }

    header.hero::after {
        content: "";
        position: absolute;
        inset: auto 24px 0;
        height: 1px;
        background: linear-gradient(90deg, rgba(34,197,94,0), rgba(34,197,94,0.8), rgba(249,115,22,0.8), rgba(249,115,22,0));
        opacity: 0.75;
    }

    .hero-topline {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .hero-kicker {
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.52rem 0.92rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
        color: var(--slate-200);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }

    .hero-kicker::before {
        content: "";
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--signal-green), var(--bright-orange));
        box-shadow: 0 0 18px rgba(34,197,94,0.42);
    }

    .hero-status {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.52rem 0.92rem;
        border-radius: 999px;
        background: rgba(17,24,39,0.38);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--slate-200);
        font-size: 0.84rem;
    }

    .hero-status strong {
        color: white;
        font-weight: 700;
    }

    .hero-body {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
        gap: 22px;
        align-items: end;
        margin-top: 20px;
    }

    .hero-title-image {
        display: block;
        max-width: min(620px, 100%);
        width: 100%;
        height: auto;
        filter: drop-shadow(0 14px 28px rgba(0,0,0,0.28));
    }

    .hero-title-text {
        margin: 0;
        font-size: clamp(2.55rem, 6vw, 5.35rem);
        line-height: 0.93;
        letter-spacing: -0.045em;
        font-weight: 900;
        text-wrap: balance;
        text-shadow: 0 10px 36px rgba(0,0,0,0.22);
    }

    .hero-title-text .accent {
        background: linear-gradient(135deg, #ffffff 0%, #d1fae5 42%, #fed7aa 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }

    .subtitle {
        margin-top: 1rem;
        max-width: 58ch;
        color: var(--slate-200);
        font-size: 1.05rem;
        line-height: 1.75;
        text-wrap: pretty;
    }

    .hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.85rem;
        justify-content: flex-start;
    }

    .hero-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        min-height: 44px;
        padding: 0.72rem 0.98rem;
        border-radius: 16px;
        color: white;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .hero-pill strong {
        display: block;
        font-size: 0.75rem;
        color: var(--slate-300);
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .hero-pill span {
        display: block;
        font-size: 0.97rem;
        color: white;
    }

    .hero-pill--date { border-color: rgba(34,197,94,0.24); }
    .hero-pill--summary { border-color: rgba(249,115,22,0.22); }

    main {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: 18px 18px 24px;
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 18px;
    }

    .card {
        --card-accent: var(--signal-green);
        position: relative;
        grid-column: span 4;
        min-height: 220px;
        padding: 1.15rem;
        border-radius: var(--radius-xl);
        border: 1px solid var(--glass-border);
        background:
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025)),
            rgba(17, 24, 39, 0.72);
        box-shadow: var(--shadow-lg);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        overflow: hidden;
        isolation: isolate;
        transition:
            transform 220ms ease,
            border-color 220ms ease,
            box-shadow 220ms ease,
            background 220ms ease,
            opacity 360ms ease,
            translate 360ms ease;
        opacity: 0;
        translate: 0 18px;
    }

    .card.is-visible {
        opacity: 1;
        translate: 0 0;
    }

    .card::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
            radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--card-accent) 18%, transparent), transparent 40%),
            linear-gradient(180deg, rgba(255,255,255,0.045), transparent 28%);
        opacity: 0.95;
        pointer-events: none;
        z-index: -1;
    }

    .card::after {
        content: "";
        position: absolute;
        inset: 0 0 auto;
        height: 4px;
        background: linear-gradient(90deg, var(--card-accent), color-mix(in srgb, var(--card-accent) 30%, white), var(--bright-orange));
        opacity: 0.95;
    }

    .card:hover,
    .card:focus-within {
        transform: translateY(-6px);
        border-color: var(--glass-border-strong);
        box-shadow: 0 24px 56px rgba(2, 6, 23, 0.42);
    }

    .card--word,
    .card--history,
    .card--did_you_know,
    .card--classic_rock,
    .card--mom_daily {
        grid-column: span 6;
    }

    .card--word,
    .card--phrase,
    .card--sport,
    .card--classic_rock,
    .card--boston_sports { --card-accent: var(--signal-green); }

    .card--history,
    .card--military,
    .card--trivia,
    .card--fun_fact,
    .card--birthday_spotlight { --card-accent: var(--bright-orange); }

    .card--did_you_know,
    .card--county,
    .card--irish_connection,
    .card--news,
    .card--birthday,
    .card--birthday_calendar,
    .card--birthday_message_starter,
    .card--birthday_phone_helper,
    .card--birthday_upcoming,
    .card--famous_person_birthday,
    .card--mom_daily { --card-accent: #38bdf8; }

    .card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.9rem;
    }

    .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.48rem;
        color: var(--slate-300);
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
    }

    .eyebrow::before {
        content: "";
        width: 0.58rem;
        height: 0.58rem;
        border-radius: 999px;
        background: var(--card-accent);
        box-shadow: 0 0 14px color-mix(in srgb, var(--card-accent) 55%, transparent);
    }

    .icon-badge {
        flex: 0 0 auto;
        width: 46px;
        height: 46px;
        display: grid;
        place-items: center;
        border-radius: 16px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.09);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        font-size: 1.15rem;
    }

    h2 {
        margin: 0.28rem 0 0;
        font-size: clamp(1.16rem, 2vw, 1.56rem);
        line-height: 1.16;
        letter-spacing: -0.025em;
        text-wrap: balance;
    }

    .card-image-wrap {
        margin: 0.12rem 0 0.95rem;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.05);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    }

    .card-image {
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        transition: transform 320ms ease, filter 320ms ease;
        filter: saturate(0.98);
    }

    .card:hover .card-image {
        transform: scale(1.03);
        filter: saturate(1.05);
    }

    .body {
        color: var(--slate-200);
        font-size: 0.99rem;
        line-height: 1.72;
        text-wrap: pretty;
    }

    .body strong,
    .body b {
        color: white;
    }

    .source {
        margin-top: 1rem;
        padding-top: 0.85rem;
        border-top: 1px solid rgba(255,255,255,0.08);
    }

    .source-link {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        min-height: 40px;
        padding: 0.62rem 0.88rem;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        color: white;
        font-size: 0.92rem;
        font-weight: 700;
        transition: transform 180ms ease, background 180ms ease, border-color 180ms ease;
    }

    .source-link:hover {
        transform: translateY(-1px);
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.20);
        text-decoration: none;
    }

    .source-link::after {
        content: "↗";
        font-size: 0.95rem;
        opacity: 0.85;
    }

    footer {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: 10px 18px 40px;
    }

    .footer-inner {
        padding: 1.15rem 1rem;
        text-align: center;
        color: var(--slate-300);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 18px;
        background: rgba(255,255,255,0.04);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: var(--shadow-md);
    }

    .footer-inner strong {
        color: white;
    }

    @media (max-width: 1080px) {
        .hero-body {
            grid-template-columns: 1fr;
            align-items: start;
        }

        .card,
        .card--word,
        .card--history,
        .card--did_you_know,
        .card--classic_rock,
        .card--mom_daily {
            grid-column: span 6;
        }
    }

    @media (max-width: 720px) {
        .hero-wrap { padding-top: 18px; }
        header.hero { padding: 22px 18px; border-radius: 24px; }
        .hero-topline { align-items: flex-start; }
        .hero-status { width: 100%; justify-content: flex-start; }
        .hero-title-text { font-size: clamp(2.25rem, 12vw, 3.4rem); }
        .subtitle { font-size: 0.98rem; line-height: 1.62; }
        main { grid-template-columns: 1fr; gap: 16px; }
        .card,
        .card--word,
        .card--history,
        .card--did_you_know,
        .card--classic_rock,
        .card--mom_daily {
            grid-column: auto;
            min-height: unset;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
        .site-bg,
        .card,
        .card-image,
        .source-link,
        * {
            animation: none !important;
            transition: none !important;
        }
    }
    """

    hero_kicker = escape(context.metadata.get("hero_kicker", "Daily Flyer • Theme") or "Daily Flyer • Theme")
    hero_summary_pill = escape(context.metadata.get("hero_summary_pill", "Curated cards and timely sources") or "Curated cards and timely sources")
    extra_css = context.metadata.get("extra_css", "") or ""
    extra_js = context.metadata.get("extra_js", "") or ""
    extra_head_html = context.metadata.get("extra_head_html", "") or ""
    header_title_image = escape(context.metadata.get("header_title_image", "") or "")
    header_title_text = escape(context.header_title)
    page_title = escape(context.page_title)

    if header_title_image:
        header_title_html = f'<img class="hero-title-image" src="{header_title_image}" alt="{header_title_text}">'
    else:
        highlighted_title = _with_last_word_accent(header_title_text)
        header_title_html = f'<h1 class="hero-title-text">{highlighted_title}</h1>'

    background = context.metadata.get("background") or {}
    background_path = escape(background.get("path", ""))
    background_html = ""
    if background_path:
        background_html = f"""
            <div class="site-bg" aria-hidden="true" style="background-image: url('{background_path}');"></div>
        """

    cards_html = "\n".join(_render_card(card) for card in context.cards)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{page_title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#1F2937" />
<style>{css}
{extra_css}
</style>
{extra_head_html}
</head>
<body>
    {background_html}
    <div class="page-shell">
        <div class="hero-wrap">
            <header class="hero">
                <div class="hero-topline">
                    <div class="hero-kicker">{hero_kicker}</div>
                    <div class="hero-status"><strong>Vote-powered</strong> experience</div>
                </div>

                <div class="hero-body">
                    <div>
                        {header_title_html}
                        <div class="subtitle">{context.header_subtitle}</div>
                    </div>

                    <div class="hero-meta">
                        <div class="hero-pill hero-pill--date">
                            <div>
                                <strong>Today</strong>
                                <span>📅 {context.today_str}</span>
                            </div>
                        </div>
                        <div class="hero-pill hero-pill--summary">
                            <div>
                                <strong>Focus</strong>
                                <span>✨ {hero_summary_pill}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
        </div>

        <main>
            {cards_html}
        </main>

        <footer>
            <div class="footer-inner">{context.footer_text}</div>
        </footer>
    </div>

    <script>
    (function () {{
        const root = document.documentElement;
        const cards = document.querySelectorAll(".card");
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        function updateParallax() {{
            if (reduceMotion) return;
            const y = Math.min(window.scrollY * 0.08, 34);
            root.style.setProperty("--bg-shift", `${{y}}px`);
        }}

        updateParallax();
        window.addEventListener("scroll", updateParallax, {{ passive: true }});

        const revealObserver = new IntersectionObserver((entries) => {{
            for (const entry of entries) {{
                if (entry.isIntersecting) {{
                    entry.target.classList.add("is-visible");
                    revealObserver.unobserve(entry.target);
                }}
            }}
        }}, {{
            threshold: 0.12,
            rootMargin: "0px 0px -32px 0px"
        }});

        cards.forEach((card, index) => {{
            card.style.transitionDelay = reduceMotion ? "0ms" : `${{Math.min(index * 40, 220)}}ms`;
            revealObserver.observe(card);

            card.addEventListener("pointermove", (event) => {{
                const rect = card.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                card.style.setProperty("--mx", `${{x}}px`);
                card.style.setProperty("--my", `${{y}}px`);
            }});

            card.addEventListener("pointerleave", () => {{
                card.style.setProperty("--mx", "50%");
                card.style.setProperty("--my", "50%");
            }});
        }});
    }})();
    </script>
    <script>{extra_js}</script>
</body>
</html>
"""


def _render_card(card: CardItem) -> str:
    icon = _icon_for_card(card.card_type)
    image_html = ""

    if card.image_url:
        image_src = escape(card.image_url)
        image_alt = escape(card.title)
        image_html = f"""
            <div class="card-image-wrap">
                <img class="card-image" src="{image_src}" alt="{image_alt}" loading="lazy">
            </div>
        """

    return f"""
        <section class="card card--{escape(card.card_type)}">
            <div class="card-head">
                <div>
                    <div class="eyebrow">{escape(card.eyebrow)}</div>
                    <h2>{escape(card.title)}</h2>
                </div>
                <div class="icon-badge" aria-hidden="true">{icon}</div>
            </div>
            {image_html}
            <div class="body">{card.body}</div>
            {_source_html(card.source_url)}
        </section>
    """


def _with_last_word_accent(text: str) -> str:
    parts = text.rsplit(" ", 1)
    if len(parts) == 1:
        return f'<span class="accent">{text}</span>'
    first, last = parts
    return f'{first} <span class="accent">{last}</span>'


def _icon_for_card(card_type: str) -> str:
    icons = {
        "word": "🗣️",
        "phrase": "💬",
        "history": "📜",
        "did_you_know": "💡",
        "sport": "🏆",
        "irish_connection": "☘️",
        "county": "🗺️",
        "news": "📰",
        "military": "⚔️",
        "trivia": "✨",
        "birthday": "🎂",
        "birthday_calendar": "📅",
        "birthday_spotlight": "🎂",
        "birthday_phone_helper": "📱",
        "birthday_message_starter": "💬",
        "birthday_upcoming": "🗓️",
        "classic_rock": "🎸",
        "irish_history": "☘️",
        "boston_sports": "🏟️",
        "famous_person_birthday": "🌟",
        "fun_fact": "✨",
        "mom_daily": "💌",
    }
    return icons.get(card_type, "✦")


def _source_html(source_url: str | None) -> str:
    if not source_url:
        return ""
    safe_url = escape(source_url)
    return f'<div class="source"><a class="source-link" href="{safe_url}" target="_blank" rel="noopener noreferrer">Read more</a></div>'


def render_html_to_file(context: PageContext, outfile: str) -> None:
    html = build_html(context)
    Path(outfile).write_text(html, encoding="utf-8")
