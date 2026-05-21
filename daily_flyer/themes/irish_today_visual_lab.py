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
        "hero_summary_pill": "Visual sandbox • paper • glass • broadcast • museum • sticker",
    }
)

BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


VISUAL_LAB_HEAD = r"""
<script>
(function () {
    var allowed = { paper: true, glass: true, broadcast: true, museum: true, sticker: true };
    var params = new URLSearchParams(window.location.search || "");
    var style = (params.get("style") || "paper").toLowerCase();
    if (!allowed[style]) style = "paper";
    document.documentElement.setAttribute("data-visual-lab-style", style);
})();
</script>
"""


VISUAL_LAB_CSS = r"""
/* Irish Today visual lab: style presets are selected with ?style=paper|glass|broadcast|museum|sticker. */
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
    width: min(92vw, 46rem);
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
        { key: "sticker", label: "Sticker" }
    ];
    var allowed = styles.reduce(function (map, style) {
        map[style.key] = true;
        return map;
    }, {});

    function currentStyle() {
        var params = new URLSearchParams(window.location.search || "");
        var style = (params.get("style") || document.documentElement.getAttribute("data-visual-lab-style") || "paper").toLowerCase();
        return allowed[style] ? style : "paper";
    }

    function applyStyle(style) {
        if (!allowed[style]) style = "paper";
        document.documentElement.setAttribute("data-visual-lab-style", style);
        if (document.body) document.body.setAttribute("data-visual-lab-style", style);
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
