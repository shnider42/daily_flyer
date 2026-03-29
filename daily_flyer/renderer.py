from __future__ import annotations

from html import escape
from pathlib import Path

from daily_flyer.models import CardItem, PageContext


def build_html(context: PageContext) -> str:
    css = """
    :root {
        --bg: #07131c;
        --bg-deep: #041018;
        --bg-soft: #0b1f2b;
        --card: rgba(8, 22, 31, 0.78);
        --card-strong: rgba(12, 28, 40, 0.90);
        --border: rgba(255,255,255,0.10);
        --border-strong: rgba(255,255,255,0.18);

        --ink: #ecf6f3;
        --ink-soft: #bfd6cf;
        --muted: #8fb7c4;

        --irish-green: #29b36a;
        --gold: #d7b96b;
        --teal: #49c5b6;
        --blue: #7db7d9;

        --shadow-lg: 0 24px 70px rgba(0,0,0,0.35);
        --shadow-md: 0 12px 32px rgba(0,0,0,0.22);

        --radius-xl: 26px;
        --radius-lg: 20px;
        --radius-md: 16px;

        --max-width: 1180px;
        --bg-shift: 0px;
    }

    * { box-sizing: border-box; }

    html {
        scroll-behavior: smooth;
    }

    body {
        margin: 0;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: var(--ink);
        background:
            radial-gradient(circle at top left, rgba(41,179,106,0.18), transparent 32%),
            radial-gradient(circle at top right, rgba(73,197,182,0.14), transparent 28%),
            radial-gradient(circle at bottom center, rgba(125,183,217,0.10), transparent 30%),
            linear-gradient(180deg, var(--bg-soft) 0%, var(--bg) 38%, var(--bg-deep) 100%);
        min-height: 100vh;
        position: relative;
        overflow-x: hidden;
    }

    .site-bg {
        position: fixed;
        inset: 0;
        z-index: 0;
        background-size: cover;
        background-position: center center;
        background-repeat: no-repeat;
        transform: translateY(var(--bg-shift)) scale(1.04);
        transform-origin: center center;
        will-change: transform;
        filter: saturate(0.90) brightness(0.76);
    }

    body::before,
    body::after {
        content: "";
        position: fixed;
        inset: auto;
        pointer-events: none;
        z-index: 0;
        filter: blur(10px);
        opacity: 0.55;
    }

    body::before {
        width: 420px;
        height: 420px;
        top: -80px;
        left: -120px;
        background: radial-gradient(circle, rgba(41,179,106,0.20), transparent 70%);
    }

    body::after {
        width: 360px;
        height: 360px;
        right: -100px;
        top: 180px;
        background: radial-gradient(circle, rgba(215,185,107,0.14), transparent 70%);
    }

    .page-shell {
        position: relative;
        z-index: 1;
    }

    .hero-wrap {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: 28px 18px 10px;
    }

    header.hero {
        position: relative;
        overflow: hidden;
        padding: 42px 26px 34px;
        border-radius: 30px;
        border: 1px solid var(--border);
        background:
            linear-gradient(
                90deg,
                rgba(22, 163, 74, 0.10) 0%,
                rgba(22, 163, 74, 0.06) 18%,
                rgba(255, 255, 255, 0.03) 38%,
                rgba(255, 255, 255, 0.05) 50%,
                rgba(255, 153, 51, 0.04) 68%,
                rgba(255, 153, 51, 0.08) 100%
            ),
            linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)),
            linear-gradient(160deg, rgba(41,179,106,0.10), rgba(73,197,182,0.04) 45%, rgba(125,183,217,0.08));
        box-shadow: var(--shadow-lg);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
    }

    header.hero::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
            linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent),
            radial-gradient(circle at 12% 22%, rgba(22,163,74,0.10), transparent 20%),
            radial-gradient(circle at 88% 28%, rgba(255,153,51,0.08), transparent 22%);
        opacity: 0.9;
    }

    .hero-kicker {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.8rem;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.05);
        color: var(--ink-soft);
        font-size: 0.8rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .hero h1 {
        margin: 1rem 0 0;
        font-size: clamp(2.4rem, 6vw, 4.8rem);
        line-height: 0.96;
        letter-spacing: -0.03em;
        font-weight: 800;
        max-width: 10ch;
        text-shadow: 0 2px 18px rgba(0,0,0,0.18);
    }

    .hero .subtitle {
        margin-top: 0.95rem;
        max-width: 56ch;
        font-size: 1.06rem;
        line-height: 1.6;
        color: var(--ink-soft);
    }

    .hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 1.35rem;
    }

    .hero-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.7rem 0.95rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--ink);
        font-size: 0.92rem;
    }

    main {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: 16px 18px 26px;
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 18px;
    }

    .card {
        position: relative;
        grid-column: span 4;
        min-height: 220px;
        padding: 1.15rem 1.15rem 1.05rem;
        border-radius: var(--radius-xl);
        border: 1px solid var(--border);
        background:
            linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02)),
            var(--card);
        box-shadow: var(--shadow-md);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        overflow: hidden;
    }

    .card:hover {
        transform: translateY(-4px);
        border-color: var(--border-strong);
        box-shadow: 0 20px 45px rgba(0,0,0,0.26);
    }

    .card::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
            linear-gradient(180deg, rgba(255,255,255,0.04), transparent 24%),
            radial-gradient(circle at top right, rgba(255,255,255,0.06), transparent 28%);
    }

    .card::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 4px;
        background: linear-gradient(90deg, var(--irish-green), var(--teal), var(--gold));
        opacity: 0.95;
    }

    .card--word {
        grid-column: span 6;
        background:
            linear-gradient(180deg, rgba(41,179,106,0.12), rgba(255,255,255,0.02)),
            var(--card-strong);
    }

    .card--history {
        grid-column: span 6;
        background:
            linear-gradient(180deg, rgba(215,185,107,0.10), rgba(255,255,255,0.02)),
            var(--card-strong);
    }

    .card--county,
    .card--irish_connection {
        background:
            linear-gradient(180deg, rgba(73,197,182,0.10), rgba(255,255,255,0.02)),
            var(--card);
    }

    .card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.85rem;
    }

    .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        color: var(--muted);
        font-size: 0.77rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
    }

    .icon-badge {
        flex: 0 0 auto;
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        background: rgba(255,255,255,0.065);
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 1.1rem;
    }

    h2 {
        margin: 0;
        font-size: clamp(1.16rem, 2vw, 1.5rem);
        line-height: 1.15;
        letter-spacing: -0.02em;
    }

    .body {
        margin-top: 0.35rem;
        color: var(--ink-soft);
        line-height: 1.68;
        font-size: 0.985rem;
    }

    .body strong,
    .body b {
        color: var(--ink);
    }

    .source {
        margin-top: 1rem;
        padding-top: 0.8rem;
        border-top: 1px solid rgba(255,255,255,0.08);
        font-size: 0.88rem;
    }

    a {
        color: #8fe6cb;
        text-decoration: none;
        font-weight: 600;
    }

    a:hover {
        text-decoration: underline;
    }

    footer {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: 10px 18px 38px;
    }

    .footer-inner {
        text-align: center;
        padding: 1.15rem 1rem;
        border-radius: 18px;
        color: #9fb2bb;
        border: 1px solid rgba(255,255,255,0.07);
        background: rgba(255,255,255,0.03);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
    }

    @media (max-width: 980px) {
        .card,
        .card--word,
        .card--history {
            grid-column: span 6;
        }
    }

    @media (max-width: 720px) {
        header.hero {
            padding: 34px 20px 28px;
            border-radius: 24px;
        }

        .hero h1 {
            max-width: none;
        }

        main {
            grid-template-columns: 1fr;
        }

        .card,
        .card--word,
        .card--history {
            grid-column: auto;
            min-height: unset;
        }
    }
    """

    background = context.metadata.get("background") or {}
    background_path = escape(background.get("path", ""))
    background_html = ""

    if background_path:
        background_html = f"""
            <div
                class="site-bg"
                aria-hidden="true"
                style="background-image:
                    linear-gradient(rgba(4, 12, 18, 0.58), rgba(4, 12, 18, 0.80)),
                    url('{background_path}');">
            </div>
        """

    cards_html = "\n".join(_render_card(card) for card in context.cards)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{context.page_title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>{css}</style>
</head>
<body>
    {background_html}
    <div class="page-shell">
        <div class="hero-wrap">
            <header class="hero">
                <div class="hero-kicker">Daily Flyer • Irish Edition</div>
                <h1>{context.header_title}</h1>
                <div class="subtitle">{context.header_subtitle}</div>
                <div class="hero-meta">
                    <div class="hero-pill">📅 {context.today_str}</div>
                    <div class="hero-pill">☘️ Daily culture, language, and history</div>
                </div>
            </header>
        </div>

        <main>
            {cards_html}
        </main>

        <footer>
            <div class="footer-inner">
                {context.footer_text}
            </div>
        </footer>
    </div>

    <script>
    (function () {{
        const root = document.documentElement;

        function updateParallax() {{
            const y = Math.min(window.scrollY * 0.10, 36);
            root.style.setProperty("--bg-shift", `${{y}}px`);
        }}

        updateParallax();
        window.addEventListener("scroll", updateParallax, {{ passive: true }});
    }})();
    </script>
</body>
</html>
"""


def _render_card(card: CardItem) -> str:
    icon = _icon_for_card(card.card_type)

    return f"""
        <section class="card card--{card.card_type}">
            <div class="card-head">
                <div>
                    <div class="eyebrow">{card.eyebrow}</div>
                    <h2>{card.title}</h2>
                </div>
                <div class="icon-badge" aria-hidden="true">{icon}</div>
            </div>
            <div class="body">{card.body}</div>
            {_source_html(card.source_url)}
        </section>
    """


def _icon_for_card(card_type: str) -> str:
    icons = {
        "word": "🗣️",
        "phrase": "💬",
        "history": "📜",
        "sport": "🏆",
        "irish_connection": "☘️",
        "county": "🗺️",
        "news": "📰",
        "military": "⚔️",
        "trivia": "✨",
    }
    return icons.get(card_type, "✦")


def _source_html(source_url: str | None) -> str:
    if not source_url:
        return ""
    return f'<div class="source"><a href="{source_url}" target="_blank" rel="noopener noreferrer">Read more</a></div>'


def render_html_to_file(context: PageContext, outfile: str) -> None:
    html = build_html(context)
    Path(outfile).write_text(html, encoding="utf-8")