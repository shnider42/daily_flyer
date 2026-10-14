from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_improved_layout as base_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
THEME_CONFIG.update(
    {
        "page_title": "Irish Today — Visual Lab",
        "header_subtitle": (
            "A sandbox version of Irish Today for testing mood, motion, borders, "
            "backgrounds, gradients, and card feel without changing the live theme."
        ),
        "hero_summary_pill": (
            "Visual sandbox • paper • glass • broadcast • museum • sticker • "
            "watercolor • newsroom • neon • terminal • sample"
        ),
    }
)

BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


VISUAL_LAB_HEAD = r"""
<script>
(function () {
    var allowed = {
        paper: true,
        glass: true,
        broadcast: true,
        museum: true,
        sticker: true,
        watercolor: true,
        newsroom: true,
        neon: true,
        terminal: true,
        sample: true
    };
    var params = new URLSearchParams(window.location.search || "");
    var style = (params.get("style") || "paper").toLowerCase();
    if (!allowed[style]) style = "paper";
    document.documentElement.setAttribute("data-visual-lab-style", style);
})();
</script>
"""


VISUAL_LAB_CSS = r"""
/* Irish Today visual lab: style presets are selected with ?style=paper|glass|broadcast|museum|sticker|watercolor|newsroom|neon|terminal|sample. */
:root {
    --visual-lab-panel: rgba(3, 14, 10, 0.72);
    --visual-lab-panel-border: rgba(255,255,255,0.18);
}

.it-visual-lab-controls {
    position: fixed;
    z-index: 10000;
    left: 50%;
    bottom: 0.85rem;
    transform: translateX(-50%);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.38rem;
    width: min(94vw, 68rem);
    padding: 0.48rem;
    border-radius: 999px;
    border: 1px solid var(--visual-lab-panel-border);
    background: var(--visual-lab-panel);
    box-shadow: 0 18px 54px rgba(0,0,0,0.35);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
}

.it-visual-lab-controls button {
    appearance: none;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 999px;
    padding: 0.48rem 0.68rem;
    background: rgba(255,255,255,0.07);
    color: #f4fff8;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    cursor: pointer;
}

.it-visual-lab-controls button[aria-pressed="true"] {
    background: rgba(255,255,255,0.92);
    color: #092016;
    border-color: rgba(255,255,255,0.95);
}

footer { padding-bottom: 5.25rem !important; }

html[data-visual-lab-style="paper"] body,
body[data-visual-lab-style="paper"] {
    --ink: #172018;
    --ink-soft: #314336;
    --muted: #6f715e;
    --border: rgba(57, 43, 26, 0.20);
    --border-strong: rgba(57, 43, 26, 0.36);
    --card: rgba(255, 249, 232, 0.86);
    --card-strong: rgba(255, 247, 220, 0.94);
    --shadow-md: 0 12px 26px rgba(63, 43, 20, 0.16);
    --shadow-lg: 0 24px 70px rgba(63, 43, 20, 0.18);
    background:
        radial-gradient(circle at 9% 8%, rgba(255,180,83,0.32), transparent 18rem),
        radial-gradient(circle at 92% 18%, rgba(39,142,86,0.20), transparent 18rem),
        repeating-linear-gradient(0deg, rgba(75,55,26,0.035) 0 1px, transparent 1px 5px),
        linear-gradient(180deg, #fbf0d5 0%, #f4dfb8 48%, #e9cfa2 100%) !important;
}

html[data-visual-lab-style="paper"] .site-bg,
body[data-visual-lab-style="paper"] .site-bg { opacity: 0.08 !important; filter: sepia(0.55) saturate(0.55) brightness(1.2) !important; }

html[data-visual-lab-style="paper"] header.hero,
body[data-visual-lab-style="paper"] header.hero {
    border-radius: 18px !important;
    border-color: rgba(78,55,24,0.28) !important;
    background:
        linear-gradient(90deg, rgba(37,121,72,0.17), rgba(255,255,255,0.36) 48%, rgba(255,146,62,0.18)),
        repeating-linear-gradient(-4deg, rgba(78,55,24,0.042) 0 1px, transparent 1px 8px),
        rgba(255, 247, 225, 0.92) !important;
    box-shadow: 0 20px 60px rgba(78,55,24,0.18) !important;
}

html[data-visual-lab-style="paper"] .card,
body[data-visual-lab-style="paper"] .card {
    border-radius: 18px !important;
    background:
        linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.10)),
        repeating-linear-gradient(0deg, rgba(78,55,24,0.035) 0 1px, transparent 1px 7px),
        var(--card) !important;
    color: var(--ink) !important;
    box-shadow: var(--shadow-md) !important;
}

html[data-visual-lab-style="paper"] .body,
html[data-visual-lab-style="paper"] .subtitle,
html[data-visual-lab-style="paper"] .footer-inner,
body[data-visual-lab-style="paper"] .body,
body[data-visual-lab-style="paper"] .subtitle,
body[data-visual-lab-style="paper"] .footer-inner { color: var(--ink-soft) !important; }

html[data-visual-lab-style="glass"] body,
body[data-visual-lab-style="glass"] {
    --card: rgba(255,255,255,0.095);
    --card-strong: rgba(255,255,255,0.13);
    --border: rgba(255,255,255,0.20);
    --border-strong: rgba(255,255,255,0.38);
    background:
        radial-gradient(circle at 20% 12%, rgba(85,214,157,0.26), transparent 22rem),
        radial-gradient(circle at 84% 22%, rgba(125,183,217,0.28), transparent 22rem),
        radial-gradient(circle at 52% 96%, rgba(255,159,67,0.16), transparent 24rem),
        linear-gradient(180deg, #071c28 0%, #061018 100%) !important;
}

html[data-visual-lab-style="glass"] .card,
body[data-visual-lab-style="glass"] .card {
    border-radius: 34px !important;
    background:
        linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.045)),
        rgba(6, 20, 28, 0.48) !important;
    border-color: rgba(255,255,255,0.22) !important;
    box-shadow: 0 28px 80px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.20) !important;
    backdrop-filter: blur(22px) saturate(1.18) !important;
    -webkit-backdrop-filter: blur(22px) saturate(1.18) !important;
}

html[data-visual-lab-style="glass"] .card::after,
body[data-visual-lab-style="glass"] .card::after {
    height: 1px !important;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent) !important;
}

html[data-visual-lab-style="broadcast"] body,
body[data-visual-lab-style="broadcast"] {
    --irish-green: #35e985;
    --gold: #ffe05c;
    --teal: #49e2d0;
    background:
        linear-gradient(115deg, rgba(255,255,255,0.035) 0 8%, transparent 8% 16%, rgba(255,255,255,0.025) 16% 24%, transparent 24% 100%),
        radial-gradient(circle at 22% 10%, rgba(53,233,133,0.32), transparent 19rem),
        radial-gradient(circle at 82% 18%, rgba(255,224,92,0.20), transparent 18rem),
        linear-gradient(180deg, #032116 0%, #041512 62%, #030b0a 100%) !important;
}

html[data-visual-lab-style="broadcast"] header.hero,
body[data-visual-lab-style="broadcast"] header.hero {
    border-radius: 30px 30px 12px 12px !important;
    border-color: rgba(255,224,92,0.36) !important;
    background:
        linear-gradient(90deg, rgba(53,233,133,0.30), transparent 32%, rgba(255,224,92,0.16)),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 44px),
        rgba(3, 36, 22, 0.95) !important;
}

html[data-visual-lab-style="broadcast"] .card,
body[data-visual-lab-style="broadcast"] .card {
    border-radius: 20px !important;
    border-color: rgba(53,233,133,0.28) !important;
    background:
        linear-gradient(135deg, rgba(53,233,133,0.16), rgba(255,224,92,0.06)),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.028) 0 2px, transparent 2px 28px),
        rgba(5, 33, 22, 0.88) !important;
}

html[data-visual-lab-style="broadcast"] .card:hover,
body[data-visual-lab-style="broadcast"] .card:hover {
    box-shadow: 0 0 0 1px rgba(255,224,92,0.32), 0 26px 68px rgba(0,0,0,0.36) !important;
}

html[data-visual-lab-style="museum"] body,
body[data-visual-lab-style="museum"] {
    --ink: #f7efe0;
    --ink-soft: #cfc2ad;
    --muted: #a99170;
    --card: rgba(18, 16, 15, 0.86);
    --card-strong: rgba(28, 23, 20, 0.92);
    --border: rgba(214, 184, 128, 0.18);
    --border-strong: rgba(214, 184, 128, 0.36);
    background:
        radial-gradient(circle at 50% -10%, rgba(214,184,128,0.18), transparent 26rem),
        linear-gradient(180deg, #100f0e 0%, #090807 100%) !important;
}

html[data-visual-lab-style="museum"] .site-bg,
body[data-visual-lab-style="museum"] .site-bg { filter: grayscale(0.55) brightness(0.30) contrast(1.15) !important; }

html[data-visual-lab-style="museum"] .hero h1,
html[data-visual-lab-style="museum"] h2,
body[data-visual-lab-style="museum"] .hero h1,
body[data-visual-lab-style="museum"] h2 {
    font-family: Georgia, "Times New Roman", serif !important;
    letter-spacing: -0.015em;
}

html[data-visual-lab-style="museum"] .card,
body[data-visual-lab-style="museum"] .card {
    border-radius: 4px !important;
    background:
        linear-gradient(180deg, rgba(214,184,128,0.08), rgba(255,255,255,0.015)),
        var(--card) !important;
    border-color: var(--border) !important;
    box-shadow: 0 26px 70px rgba(0,0,0,0.38) !important;
}

html[data-visual-lab-style="sticker"] body,
body[data-visual-lab-style="sticker"] {
    background:
        radial-gradient(circle at 12% 18%, rgba(255,159,67,0.28), transparent 16rem),
        radial-gradient(circle at 86% 14%, rgba(41,179,106,0.28), transparent 16rem),
        radial-gradient(circle at 70% 92%, rgba(125,183,217,0.18), transparent 20rem),
        linear-gradient(180deg, #082a25 0%, #06131e 100%) !important;
}

html[data-visual-lab-style="sticker"] .card,
body[data-visual-lab-style="sticker"] .card {
    border-radius: 30px 18px 34px 20px !important;
    border: 3px solid rgba(255,255,255,0.76) !important;
    box-shadow: 0 18px 0 rgba(0,0,0,0.18), 0 28px 64px rgba(0,0,0,0.32) !important;
}

@media (min-width: 981px) {
    html[data-visual-lab-style="sticker"] main > .card:nth-of-type(odd),
    body[data-visual-lab-style="sticker"] main > .card:nth-of-type(odd) { transform: rotate(-0.6deg) !important; }
    html[data-visual-lab-style="sticker"] main > .card:nth-of-type(even),
    body[data-visual-lab-style="sticker"] main > .card:nth-of-type(even) { transform: rotate(0.55deg) !important; }
    html[data-visual-lab-style="sticker"] main > .card:hover,
    body[data-visual-lab-style="sticker"] main > .card:hover { transform: rotate(0deg) translateY(-2px) !important; }
}

html[data-visual-lab-style="watercolor"] body,
body[data-visual-lab-style="watercolor"] {
    --ink: #163238;
    --ink-soft: #37565d;
    --muted: #5d7f80;
    --card: rgba(255,255,252,0.72);
    --card-strong: rgba(255,255,252,0.82);
    --border: rgba(72, 132, 127, 0.22);
    --border-strong: rgba(72, 132, 127, 0.40);
    background:
        radial-gradient(ellipse at 18% 12%, rgba(92, 191, 161, 0.34), transparent 22rem),
        radial-gradient(ellipse at 86% 18%, rgba(105, 170, 215, 0.28), transparent 24rem),
        radial-gradient(ellipse at 58% 88%, rgba(255, 180, 106, 0.20), transparent 24rem),
        linear-gradient(180deg, #eef9f1 0%, #e6f5f6 48%, #f9ecd8 100%) !important;
}

html[data-visual-lab-style="watercolor"] .site-bg,
body[data-visual-lab-style="watercolor"] .site-bg { opacity: 0.12 !important; filter: saturate(0.62) brightness(1.25) blur(1px) !important; }

html[data-visual-lab-style="watercolor"] header.hero,
body[data-visual-lab-style="watercolor"] header.hero,
html[data-visual-lab-style="watercolor"] .card,
body[data-visual-lab-style="watercolor"] .card {
    border-radius: 38px 28px 44px 30px !important;
    border-color: rgba(72,132,127,0.22) !important;
    background:
        radial-gradient(ellipse at 20% 5%, rgba(255,255,255,0.70), transparent 14rem),
        radial-gradient(ellipse at 82% 12%, rgba(88, 185, 156, 0.18), transparent 12rem),
        rgba(255,255,252,0.70) !important;
    color: var(--ink) !important;
    box-shadow: 0 18px 48px rgba(54, 97, 92, 0.14) !important;
    backdrop-filter: blur(10px) saturate(0.95) !important;
    -webkit-backdrop-filter: blur(10px) saturate(0.95) !important;
}

html[data-visual-lab-style="watercolor"] .body,
html[data-visual-lab-style="watercolor"] .subtitle,
body[data-visual-lab-style="watercolor"] .body,
body[data-visual-lab-style="watercolor"] .subtitle { color: var(--ink-soft) !important; }

html[data-visual-lab-style="watercolor"] .card::after,
body[data-visual-lab-style="watercolor"] .card::after {
    height: 5px !important;
    background: linear-gradient(90deg, rgba(69,171,125,0.55), rgba(109,178,219,0.42), rgba(255,172,98,0.38)) !important;
}

html[data-visual-lab-style="newsroom"] body,
body[data-visual-lab-style="newsroom"] {
    --ink: #111111;
    --ink-soft: #343434;
    --muted: #626262;
    --card: rgba(255,255,255,0.96);
    --card-strong: #ffffff;
    --border: rgba(0,0,0,0.24);
    --border-strong: rgba(0,0,0,0.48);
    background:
        repeating-linear-gradient(0deg, rgba(0,0,0,0.025) 0 1px, transparent 1px 10px),
        linear-gradient(180deg, #f6f3ea 0%, #ebe7dc 100%) !important;
}

html[data-visual-lab-style="newsroom"] .site-bg,
body[data-visual-lab-style="newsroom"] .site-bg { opacity: 0.06 !important; filter: grayscale(1) contrast(1.25) brightness(1.15) !important; }

html[data-visual-lab-style="newsroom"] header.hero,
body[data-visual-lab-style="newsroom"] header.hero {
    border-radius: 0 !important;
    border: 2px solid #111 !important;
    background: #fffdf7 !important;
    color: #111 !important;
    box-shadow: 10px 10px 0 rgba(17,17,17,0.13) !important;
}

html[data-visual-lab-style="newsroom"] .hero h1,
html[data-visual-lab-style="newsroom"] h2,
body[data-visual-lab-style="newsroom"] .hero h1,
body[data-visual-lab-style="newsroom"] h2 {
    font-family: Georgia, "Times New Roman", serif !important;
    text-transform: none;
}

html[data-visual-lab-style="newsroom"] .hero-kicker,
html[data-visual-lab-style="newsroom"] .hero-pill,
body[data-visual-lab-style="newsroom"] .hero-kicker,
body[data-visual-lab-style="newsroom"] .hero-pill {
    background: #111 !important;
    color: #fff !important;
    border-radius: 0 !important;
}

html[data-visual-lab-style="newsroom"] .card,
body[data-visual-lab-style="newsroom"] .card {
    border-radius: 0 !important;
    border: 2px solid #111 !important;
    background: #fffdf7 !important;
    color: #111 !important;
    box-shadow: 8px 8px 0 rgba(17,17,17,0.12) !important;
}

html[data-visual-lab-style="newsroom"] .card::after,
body[data-visual-lab-style="newsroom"] .card::after { background: #d94c2a !important; height: 6px !important; }
html[data-visual-lab-style="newsroom"] .eyebrow,
body[data-visual-lab-style="newsroom"] .eyebrow { background: #d94c2a !important; color: #fff !important; border-radius: 0 !important; }
html[data-visual-lab-style="newsroom"] .body,
body[data-visual-lab-style="newsroom"] .body { color: #343434 !important; }

html[data-visual-lab-style="neon"] body,
body[data-visual-lab-style="neon"] {
    --ink: #f7fbff;
    --ink-soft: #cfe7ff;
    --muted: #8ecfff;
    --card: rgba(11, 11, 34, 0.86);
    --card-strong: rgba(17, 13, 46, 0.94);
    --border: rgba(85, 232, 255, 0.24);
    --border-strong: rgba(255, 120, 233, 0.50);
    --irish-green: #38ffb2;
    --teal: #53e8ff;
    --gold: #ffdf6e;
    background:
        radial-gradient(circle at 18% 16%, rgba(83,232,255,0.27), transparent 18rem),
        radial-gradient(circle at 86% 24%, rgba(255,120,233,0.22), transparent 18rem),
        radial-gradient(circle at 48% 94%, rgba(56,255,178,0.16), transparent 22rem),
        linear-gradient(180deg, #060617 0%, #09051d 100%) !important;
}

html[data-visual-lab-style="neon"] .card,
body[data-visual-lab-style="neon"] .card {
    border-radius: 24px !important;
    background:
        linear-gradient(180deg, rgba(83,232,255,0.08), rgba(255,120,233,0.05)),
        rgba(9, 9, 31, 0.86) !important;
    border-color: rgba(83,232,255,0.24) !important;
    box-shadow: 0 0 0 1px rgba(83,232,255,0.10), 0 0 42px rgba(83,232,255,0.11), 0 30px 80px rgba(0,0,0,0.36) !important;
}

html[data-visual-lab-style="neon"] .card:hover,
body[data-visual-lab-style="neon"] .card:hover {
    border-color: rgba(255,120,233,0.50) !important;
    box-shadow: 0 0 0 1px rgba(255,120,233,0.20), 0 0 56px rgba(255,120,233,0.20), 0 30px 80px rgba(0,0,0,0.38) !important;
}

html[data-visual-lab-style="neon"] .eyebrow,
body[data-visual-lab-style="neon"] .eyebrow { color: #a8f5ff !important; background: rgba(83,232,255,0.10) !important; }
html[data-visual-lab-style="neon"] a,
body[data-visual-lab-style="neon"] a { color: #7bffd1 !important; }

/* Extreme but usable: every card becomes a command-console module. */
html[data-visual-lab-style="terminal"] body,
body[data-visual-lab-style="terminal"] {
    --ink: #d8ffe7;
    --ink-soft: #a6d8b4;
    --muted: #6dcc88;
    --card: rgba(1, 8, 5, 0.94);
    --card-strong: rgba(0, 14, 8, 0.98);
    --border: rgba(78, 255, 139, 0.24);
    --border-strong: rgba(78, 255, 139, 0.58);
    background:
        repeating-linear-gradient(0deg, rgba(78,255,139,0.045) 0 1px, transparent 1px 4px),
        radial-gradient(circle at 50% 0%, rgba(78,255,139,0.16), transparent 24rem),
        linear-gradient(180deg, #020604 0%, #000 100%) !important;
}

html[data-visual-lab-style="terminal"] .hero h1,
html[data-visual-lab-style="terminal"] h2,
html[data-visual-lab-style="terminal"] .body,
html[data-visual-lab-style="terminal"] .eyebrow,
body[data-visual-lab-style="terminal"] .hero h1,
body[data-visual-lab-style="terminal"] h2,
body[data-visual-lab-style="terminal"] .body,
body[data-visual-lab-style="terminal"] .eyebrow {
    font-family: "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace !important;
}

html[data-visual-lab-style="terminal"] header.hero,
body[data-visual-lab-style="terminal"] header.hero,
html[data-visual-lab-style="terminal"] .card,
body[data-visual-lab-style="terminal"] .card {
    border-radius: 0 !important;
    border: 1px solid rgba(78,255,139,0.30) !important;
    background:
        linear-gradient(180deg, rgba(78,255,139,0.06), rgba(78,255,139,0.015)),
        rgba(1, 8, 5, 0.94) !important;
    color: #d8ffe7 !important;
    box-shadow: 0 0 0 1px rgba(78,255,139,0.08), 0 22px 70px rgba(0,0,0,0.50) !important;
}

html[data-visual-lab-style="terminal"] .card {
    padding-top: 2.45rem !important;
}

html[data-visual-lab-style="terminal"] .card::before,
body[data-visual-lab-style="terminal"] .card::before {
    content: "./irish_today --card" !important;
    position: absolute !important;
    inset: 0 0 auto 0 !important;
    z-index: 3 !important;
    display: block !important;
    height: 1.65rem !important;
    padding: 0.34rem 0.74rem !important;
    background: rgba(78,255,139,0.10) !important;
    border-bottom: 1px solid rgba(78,255,139,0.22) !important;
    color: rgba(216,255,231,0.70) !important;
    font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace !important;
    font-size: 0.68rem !important;
    letter-spacing: 0.04em !important;
    pointer-events: none !important;
}

html[data-visual-lab-style="terminal"] .card::after,
body[data-visual-lab-style="terminal"] .card::after { height: 1px !important; background: rgba(78,255,139,0.50) !important; top: 1.65rem !important; }
html[data-visual-lab-style="terminal"] .eyebrow,
body[data-visual-lab-style="terminal"] .eyebrow { color: #6dff98 !important; background: transparent !important; padding-left: 0 !important; }
html[data-visual-lab-style="terminal"] .icon-badge,
body[data-visual-lab-style="terminal"] .icon-badge { border-radius: 0 !important; background: rgba(78,255,139,0.07) !important; }
html[data-visual-lab-style="terminal"] a,
body[data-visual-lab-style="terminal"] a { color: #9effbb !important; text-decoration: underline; }

html[data-visual-lab-style="sample"] body,
body[data-visual-lab-style="sample"] {
    --ink: #edf7f3;
    --ink-soft: #c9d7d0;
    --muted: #96b2a6;
    background:
        radial-gradient(circle at 18% 14%, rgba(255,255,255,0.10), transparent 20rem),
        radial-gradient(circle at 82% 24%, rgba(41,179,106,0.18), transparent 19rem),
        linear-gradient(180deg, #101820 0%, #071014 100%) !important;
}

html[data-visual-lab-style="sample"] header.hero,
body[data-visual-lab-style="sample"] header.hero {
    background:
        linear-gradient(90deg, rgba(41,179,106,0.22), rgba(255,255,255,0.04), rgba(255,159,67,0.16)),
        rgba(8, 18, 21, 0.86) !important;
    border-color: rgba(255,255,255,0.18) !important;
}

html[data-visual-lab-style="sample"] .hero-summary-label::after,
body[data-visual-lab-style="sample"] .hero-summary-label::after { content: ""; }

/* Sample-mode card styles. These are compact echoes of the full presets above. */
html[data-visual-lab-style="sample"] .card.it-card-style-paper,
body[data-visual-lab-style="sample"] .card.it-card-style-paper {
    border-radius: 18px !important;
    background: repeating-linear-gradient(0deg, rgba(78,55,24,0.04) 0 1px, transparent 1px 7px), rgba(255,247,225,0.92) !important;
    color: #172018 !important;
    border-color: rgba(78,55,24,0.28) !important;
    box-shadow: 0 16px 34px rgba(78,55,24,0.18) !important;
}
html[data-visual-lab-style="sample"] .card.it-card-style-paper .body,
body[data-visual-lab-style="sample"] .card.it-card-style-paper .body { color: #314336 !important; }

html[data-visual-lab-style="sample"] .card.it-card-style-glass,
body[data-visual-lab-style="sample"] .card.it-card-style-glass {
    border-radius: 34px !important;
    background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05)), rgba(6,20,28,0.52) !important;
    border-color: rgba(255,255,255,0.24) !important;
    backdrop-filter: blur(22px) saturate(1.16) !important;
    -webkit-backdrop-filter: blur(22px) saturate(1.16) !important;
}

html[data-visual-lab-style="sample"] .card.it-card-style-broadcast,
body[data-visual-lab-style="sample"] .card.it-card-style-broadcast {
    border-radius: 20px !important;
    background: repeating-linear-gradient(90deg, rgba(255,255,255,0.032) 0 2px, transparent 2px 28px), rgba(5,33,22,0.90) !important;
    border-color: rgba(53,233,133,0.30) !important;
}

html[data-visual-lab-style="sample"] .card.it-card-style-museum,
body[data-visual-lab-style="sample"] .card.it-card-style-museum {
    border-radius: 4px !important;
    background: linear-gradient(180deg, rgba(214,184,128,0.08), rgba(255,255,255,0.015)), rgba(18,16,15,0.90) !important;
    border-color: rgba(214,184,128,0.24) !important;
    color: #f7efe0 !important;
}

html[data-visual-lab-style="sample"] .card.it-card-style-sticker,
body[data-visual-lab-style="sample"] .card.it-card-style-sticker {
    border-radius: 30px 18px 34px 20px !important;
    border: 3px solid rgba(255,255,255,0.76) !important;
    box-shadow: 0 14px 0 rgba(0,0,0,0.18), 0 24px 56px rgba(0,0,0,0.32) !important;
}

html[data-visual-lab-style="sample"] .card.it-card-style-watercolor,
body[data-visual-lab-style="sample"] .card.it-card-style-watercolor {
    border-radius: 38px 28px 44px 30px !important;
    background: radial-gradient(ellipse at 82% 12%, rgba(88,185,156,0.20), transparent 12rem), rgba(255,255,252,0.78) !important;
    color: #163238 !important;
    border-color: rgba(72,132,127,0.24) !important;
}
html[data-visual-lab-style="sample"] .card.it-card-style-watercolor .body,
body[data-visual-lab-style="sample"] .card.it-card-style-watercolor .body { color: #37565d !important; }

html[data-visual-lab-style="sample"] .card.it-card-style-newsroom,
body[data-visual-lab-style="sample"] .card.it-card-style-newsroom {
    border-radius: 0 !important;
    border: 2px solid #111 !important;
    background: #fffdf7 !important;
    color: #111 !important;
    box-shadow: 8px 8px 0 rgba(17,17,17,0.14) !important;
}
html[data-visual-lab-style="sample"] .card.it-card-style-newsroom .body,
body[data-visual-lab-style="sample"] .card.it-card-style-newsroom .body { color: #343434 !important; }

html[data-visual-lab-style="sample"] .card.it-card-style-neon,
body[data-visual-lab-style="sample"] .card.it-card-style-neon {
    border-radius: 24px !important;
    background: linear-gradient(180deg, rgba(83,232,255,0.08), rgba(255,120,233,0.05)), rgba(9,9,31,0.88) !important;
    border-color: rgba(83,232,255,0.28) !important;
    box-shadow: 0 0 42px rgba(83,232,255,0.13), 0 28px 70px rgba(0,0,0,0.34) !important;
}

html[data-visual-lab-style="sample"] .card.it-card-style-terminal,
body[data-visual-lab-style="sample"] .card.it-card-style-terminal {
    border-radius: 0 !important;
    border: 1px solid rgba(78,255,139,0.30) !important;
    background: linear-gradient(180deg, rgba(78,255,139,0.06), rgba(78,255,139,0.015)), rgba(1,8,5,0.94) !important;
    color: #d8ffe7 !important;
    font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace !important;
}
html[data-visual-lab-style="sample"] .card.it-card-style-terminal h2,
html[data-visual-lab-style="sample"] .card.it-card-style-terminal .body,
body[data-visual-lab-style="sample"] .card.it-card-style-terminal h2,
body[data-visual-lab-style="sample"] .card.it-card-style-terminal .body { font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace !important; }

@media (max-width: 720px) {
    .it-visual-lab-controls {
        border-radius: 24px;
        bottom: 0.55rem;
    }
    .it-visual-lab-controls button {
        padding: 0.46rem 0.55rem;
        font-size: 0.72rem;
    }
}
"""


VISUAL_LAB_JS = r"""
(function () {
    var styles = [
        { key: "paper", label: "Paper" },
        { key: "glass", label: "Glass" },
        { key: "broadcast", label: "Broadcast" },
        { key: "museum", label: "Museum" },
        { key: "sticker", label: "Sticker" },
        { key: "watercolor", label: "Watercolor" },
        { key: "newsroom", label: "Newsroom" },
        { key: "neon", label: "Neon" },
        { key: "terminal", label: "Terminal" },
        { key: "sample", label: "Sample" }
    ];
    var cardStyles = ["paper", "glass", "broadcast", "museum", "sticker", "watercolor", "newsroom", "neon", "terminal"];
    var allowed = styles.reduce(function (map, style) {
        map[style.key] = true;
        return map;
    }, {});

    function currentStyle() {
        var params = new URLSearchParams(window.location.search || "");
        var style = (params.get("style") || document.documentElement.getAttribute("data-visual-lab-style") || "paper").toLowerCase();
        return allowed[style] ? style : "paper";
    }

    function hashString(value) {
        var hash = 2166136261;
        for (var i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function sampleSeed() {
        var params = new URLSearchParams(window.location.search || "");
        var date = params.get("date") || "";
        var seed = params.get("seed") || "";
        var heroDate = document.querySelector(".hero-pill") ? document.querySelector(".hero-pill").textContent : "";
        return [date, seed, heroDate].join("|");
    }

    function clearCardSampleStyles() {
        document.querySelectorAll("main > .card").forEach(function (card) {
            cardStyles.forEach(function (key) { card.classList.remove("it-card-style-" + key); });
            card.removeAttribute("data-visual-card-style");
        });
    }

    function applySampleCardStyles() {
        var seed = sampleSeed();
        document.querySelectorAll("main > .card").forEach(function (card, index) {
            cardStyles.forEach(function (key) { card.classList.remove("it-card-style-" + key); });
            var text = (card.textContent || "").replace(/\s+/g, " ").slice(0, 180);
            var styleIndex = hashString(seed + "|" + index + "|" + text) % cardStyles.length;
            var key = cardStyles[styleIndex];
            card.classList.add("it-card-style-" + key);
            card.setAttribute("data-visual-card-style", key);
        });
    }

    function applyStyle(style) {
        if (!allowed[style]) style = "paper";
        document.documentElement.setAttribute("data-visual-lab-style", style);
        if (document.body) document.body.setAttribute("data-visual-lab-style", style);
        if (style === "sample") applySampleCardStyles();
        else clearCardSampleStyles();
        document.querySelectorAll(".it-visual-lab-controls button[data-style]").forEach(function (button) {
            button.setAttribute("aria-pressed", button.dataset.style === style ? "true" : "false");
        });
    }

    function updateUrl(style) {
        var url = new URL(window.location.href);
        url.searchParams.set("style", style);
        window.history.replaceState({}, "", url.toString());
    }

    function mountControls() {
        if (document.querySelector(".it-visual-lab-controls")) return;
        var controls = document.createElement("nav");
        controls.className = "it-visual-lab-controls";
        controls.setAttribute("aria-label", "Irish Today visual lab styles");
        styles.forEach(function (style) {
            var button = document.createElement("button");
            button.type = "button";
            button.dataset.style = style.key;
            button.textContent = style.label;
            button.addEventListener("click", function () {
                applyStyle(style.key);
                updateUrl(style.key);
            });
            controls.appendChild(button);
        });
        document.body.appendChild(controls);
        applyStyle(currentStyle());
    }

    function boot() {
        applyStyle(currentStyle());
        mountControls();
        window.setTimeout(function () {
            if (currentStyle() === "sample") applySampleCardStyles();
        }, 80);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)

    previous_css = context.metadata.get("extra_css", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""
    previous_head = context.metadata.get("extra_head_html", "") or ""

    context.page_title = THEME_CONFIG["page_title"]
    context.header_subtitle = THEME_CONFIG["header_subtitle"]
    context.metadata.update(
        {
            "theme_name": "irish_today_visual_lab",
            "hero_kicker": "Daily Flyer • Visual Lab",
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_head_html": previous_head + VISUAL_LAB_HEAD,
            "extra_css": previous_css + VISUAL_LAB_CSS,
            "extra_js": previous_js + VISUAL_LAB_JS,
        }
    )
    return context
