from __future__ import annotations

from html import escape
from pathlib import Path

from daily_flyer.models import CardItem, PageContext


def build_html(context: PageContext) -> str:
    css = """
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;700&display=swap');

    :root {
        --black: #0A0A0A;
        --black-soft: #121217;
        --black-panel: rgba(15, 15, 19, 0.78);
        --black-panel-strong: rgba(18, 18, 24, 0.92);
        --electric-purple: #8B5CF6;
        --electric-purple-soft: rgba(139, 92, 246, 0.20);
        --electric-purple-glow: rgba(139, 92, 246, 0.42);
        --hot-pink: #EC4899;
        --hot-pink-soft: rgba(236, 72, 153, 0.20);
        --hot-pink-glow: rgba(236, 72, 153, 0.42);
        --white: #ffffff;
        --slate-100: #f4f4f5;
        --slate-200: #e4e4e7;
        --slate-300: #c9c9d3;
        --slate-400: #a1a1b2;
        --slate-500: #73738b;
        --glass: rgba(255, 255, 255, 0.055);
        --glass-strong: rgba(255, 255, 255, 0.09);
        --glass-border: rgba(255, 255, 255, 0.11);
        --glass-border-strong: rgba(255, 255, 255, 0.18);
        --shadow-xl: 0 36px 100px rgba(0, 0, 0, 0.52);
        --shadow-lg: 0 22px 54px rgba(0, 0, 0, 0.42);
        --shadow-md: 0 14px 30px rgba(0, 0, 0, 0.30);
        --radius-2xl: 32px;
        --radius-xl: 24px;
        --radius-lg: 18px;
        --radius-md: 14px;
        --max-width: 1240px;
        --bg-shift: 0px;
        --card-accent: var(--electric-purple);
        --hero-gradient:
            linear-gradient(135deg, rgba(255,255,255,0.11), rgba(255,255,255,0.03)),
            linear-gradient(135deg, rgba(139,92,246,0.18), rgba(139,92,246,0.06) 34%, rgba(236,72,153,0.07) 68%, rgba(236,72,153,0.18) 100%);
    }

    * { box-sizing: border-box; }

    html { scroll-behavior: smooth; }

    body {
        margin: 0;
        color: var(--white);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background:
            radial-gradient(circle at 14% 12%, rgba(139,92,246,0.18), transparent 24%),
            radial-gradient(circle at 84% 10%, rgba(236,72,153,0.16), transparent 22%),
            radial-gradient(circle at 50% 120%, rgba(139,92,246,0.10), transparent 28%),
            linear-gradient(180deg, #111116 0%, #0A0A0A 42%, #050507 100%);
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
            linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px);
        background-size: 36px 36px;
        mask-image: radial-gradient(circle at center, rgba(0,0,0,0.95), transparent 80%);
        opacity: 0.22;
    }

    body::after {
        background:
            radial-gradient(circle at 12% 20%, rgba(139,92,246,0.18), transparent 24%),
            radial-gradient(circle at 88% 16%, rgba(236,72,153,0.16), transparent 22%),
            radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03), transparent 18%);
        filter: blur(28px);
        opacity: 0.92;
    }

    ::selection {
        background: rgba(236, 72, 153, 0.28);
        color: white;
    }

    * {
        scrollbar-width: thin;
        scrollbar-color: rgba(236,72,153,0.60) rgba(255,255,255,0.08);
    }

    *::-webkit-scrollbar { width: 11px; }
    *::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
    *::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(139,92,246,0.75), rgba(236,72,153,0.82));
        border-radius: 999px;
        border: 2px solid rgba(10,10,10,0.8);
    }

    a {
        color: #f5d0fe;
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
        filter: saturate(0.98) brightness(0.42);
        opacity: 0.70;
    }

    .site-bg::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
            linear-gradient(180deg, rgba(5,5,7,0.38), rgba(5,5,7,0.82)),
            radial-gradient(circle at top, rgba(139,92,246,0.13), transparent 30%),
            radial-gradient(circle at bottom right, rgba(236,72,153,0.12), transparent 25%);
    }

    .page-shell {
        position: relative;
        z-index: 1;
        padding-bottom: 22px;
    }

    .hero-wrap {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: 26px 18px 10px;
    }

    header.hero {
        position: relative;
        overflow: hidden;
        padding: 30px;
        border-radius: var(--radius-2xl);
        border: 1px solid var(--glass-border);
        background: var(--hero-gradient);
        box-shadow: var(--shadow-xl);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        isolation: isolate;
    }

    header.hero::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
            radial-gradient(circle at top left, rgba(139,92,246,0.24), transparent 25%),
            radial-gradient(circle at top right, rgba(236,72,153,0.22), transparent 24%),
            linear-gradient(120deg, transparent 15%, rgba(255,255,255,0.05) 50%, transparent 85%);
        pointer-events: none;
        z-index: -1;
    }

    header.hero::after {
        content: "";
        position: absolute;
        inset: auto 24px 0;
        height: 1px;
        background: linear-gradient(90deg, rgba(139,92,246,0), rgba(139,92,246,0.9), rgba(236,72,153,0.9), rgba(236,72,153,0));
        opacity: 0.85;
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
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.10);
        color: var(--slate-200);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.07);
    }

    .hero-kicker::before {
        content: "";
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--electric-purple), var(--hot-pink));
        box-shadow: 0 0 18px var(--electric-purple-glow);
    }

    .hero-status {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.52rem 0.92rem;
        border-radius: 999px;
        background: rgba(10,10,10,0.36);
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
        grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.72fr);
        gap: 22px;
        align-items: end;
        margin-top: 20px;
    }

    .hero-title-image {
        display: block;
        max-width: min(620px, 100%);
        width: 100%;
        height: auto;
        filter: drop-shadow(0 14px 28px rgba(0,0,0,0.30));
    }

    .hero-title-text {
        margin: 0;
        font-family: "Space Grotesk", Inter, system-ui, sans-serif;
        font-size: clamp(2.7rem, 6vw, 5.6rem);
        line-height: 0.92;
        letter-spacing: -0.05em;
        font-weight: 700;
        text-wrap: balance;
        text-shadow: 0 12px 34px rgba(0,0,0,0.28);
    }

    .hero-title-text .title-main,
    .hero-title-text .accent {
        display: inline-block;
    }

    .hero-title-text .title-main {
        color: var(--white);
    }

    .hero-title-text .accent {
        background: linear-gradient(135deg, #ede9fe 0%, #c4b5fd 36%, #f9a8d4 72%, #ffffff 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: none;
        filter: drop-shadow(0 0 18px rgba(236,72,153,0.18));
    }

    .hero-title-text .title-main::after {
        content: "";
        display: block;
        width: 72%;
        height: 0.22rem;
        margin-top: 0.22rem;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(139,92,246,0.92), rgba(236,72,153,0.92));
        box-shadow: 0 0 20px rgba(139,92,246,0.22);
    }

    .subtitle {
        margin-top: 1rem;
        max-width: 58ch;
        color: var(--slate-200);
        font-size: 1.03rem;
        line-height: 1.75;
        text-wrap: pretty;
    }

    .hero-meta {
        display: grid;
        gap: 0.85rem;
        align-content: end;
    }

    .hero-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        min-height: 46px;
        padding: 0.78rem 1rem;
        border-radius: 18px;
        color: white;
        background: rgba(255,255,255,0.055);
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

    .hero-pill--date { border-color: rgba(139,92,246,0.28); }
    .hero-pill--summary { border-color: rgba(236,72,153,0.24); }

    main {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: 18px 18px 26px;
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 18px;
    }

    .card {
        --card-accent: var(--electric-purple);
        position: relative;
        grid-column: span 4;
        min-height: 220px;
        padding: 1.15rem;
        border-radius: var(--radius-xl);
        border: 1px solid var(--glass-border);
        background:
            linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.022)),
            var(--black-panel);
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
            radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--card-accent) 20%, transparent), transparent 40%),
            linear-gradient(180deg, rgba(255,255,255,0.04), transparent 28%);
        opacity: 0.95;
        pointer-events: none;
        z-index: -1;
    }

    .card::after {
        content: "";
        position: absolute;
        inset: 0 0 auto;
        height: 4px;
        background: linear-gradient(90deg, var(--card-accent), color-mix(in srgb, var(--card-accent) 30%, white), var(--hot-pink));
        opacity: 0.98;
    }

    .card:hover,
    .card:focus-within {
        transform: translateY(-6px);
        border-color: var(--glass-border-strong);
        box-shadow: 0 24px 58px rgba(0, 0, 0, 0.46);
        background:
            linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.024)),
            var(--black-panel-strong);
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
    .card--boston_sports {
        --card-accent: var(--electric-purple);
    }

    .card--history,
    .card--military,
    .card--trivia,
    .card--fun_fact,
    .card--birthday_spotlight {
        --card-accent: var(--hot-pink);
    }

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
    .card--mom_daily {
        --card-accent: #c084fc;
    }

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
        filter: saturate(1.02);
    }

    .card:hover .card-image {
        transform: scale(1.03);
        filter: saturate(1.08);
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
        background: rgba(255,255,255,0.05);
        color: white;
        font-size: 0.92rem;
        font-weight: 700;
        transition: transform 180ms ease, background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }

    .source-link:hover {
        transform: translateY(-1px);
        background: rgba(255,255,255,0.09);
        border-color: rgba(255,255,255,0.20);
        box-shadow: 0 0 0 4px rgba(236,72,153,0.08);
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

        .hero-meta {
            grid-template-columns: repeat(2, minmax(0, 1fr));
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
        .hero-title-text { font-size: clamp(2.25rem, 12vw, 3.5rem); }
        .subtitle { font-size: 0.98rem; line-height: 1.62; }
        .hero-meta { grid-template-columns: 1fr; }
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
        header_title_html = _render_title_markup(header_title_text)

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
<meta name="theme-color" content="#0A0A0A" />
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


def _render_title_markup(text: str) -> str:
    parts = text.rsplit(" ", 1)
    if len(parts) == 1:
        return f'<h1 class="hero-title-text"><span class="accent">{text}</span></h1>'
    first, last = parts
    return (
        '<h1 class="hero-title-text">'
        f'<span class="title-main">{first}</span> '
        f'<span class="accent">{last}</span>'
        '</h1>'
    )


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
