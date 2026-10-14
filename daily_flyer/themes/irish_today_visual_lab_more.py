from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_visual_lab as base_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
THEME_CONFIG.update(
    {
        "page_title": "Irish Today — Visual Lab",
        "hero_summary_pill": (
            "Visual sandbox • favorites: glass, sticker, terminal • "
            "animation trials • strict sample"
        ),
    }
)

BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


VISUAL_LAB_MORE_HEAD = r"""
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
        sample: true,
        strict_sample: true,
        drift: true,
        hinge: true,
        spotlight: true,
        cascade: true,
        flipbook: true
    };
    var params = new URLSearchParams(window.location.search || "");
    var style = (params.get("style") || "paper").toLowerCase();
    if (!allowed[style]) style = "paper";
    document.documentElement.setAttribute("data-visual-lab-style", style);
})();
</script>
"""


VISUAL_LAB_MORE_CSS = r"""
/* Expanded visual lab: fewer glossy gradients, more material/interaction experiments. */
:root {
    --visual-lab-panel: rgba(3, 14, 10, 0.82);
    --visual-lab-panel-border: rgba(255,255,255,0.20);
}

.it-visual-lab-controls {
    width: min(96vw, 82rem) !important;
    gap: 0.32rem !important;
}

.it-visual-lab-controls [data-visual-day-action="previous"] {
    border-color: rgba(143,230,203,0.42) !important;
    background: rgba(143,230,203,0.14) !important;
}

html[data-visual-lab-style="strict_sample"] body,
body[data-visual-lab-style="strict_sample"] {
    --ink: #edf7f3;
    --ink-soft: #c9d7d0;
    --muted: #96b2a6;
    background:
        repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 14px),
        #0b1114 !important;
}

html[data-visual-lab-style="strict_sample"] header.hero,
body[data-visual-lab-style="strict_sample"] header.hero {
    background: rgba(8, 18, 21, 0.92) !important;
    border-color: rgba(255,255,255,0.20) !important;
}

/* Strict-sample card echoes. These intentionally avoid the full-page glossy gradient look. */
html[data-visual-lab-style="strict_sample"] .card.it-card-style-paper,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-paper {
    border-radius: 18px !important;
    background: repeating-linear-gradient(0deg, rgba(78,55,24,0.04) 0 1px, transparent 1px 7px), rgba(255,247,225,0.92) !important;
    color: #172018 !important;
    border-color: rgba(78,55,24,0.28) !important;
    box-shadow: 0 16px 34px rgba(78,55,24,0.18) !important;
}
html[data-visual-lab-style="strict_sample"] .card.it-card-style-paper .body,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-paper .body { color: #314336 !important; }

html[data-visual-lab-style="strict_sample"] .card.it-card-style-glass,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-glass {
    border-radius: 34px !important;
    background: rgba(6,20,28,0.54) !important;
    border-color: rgba(255,255,255,0.24) !important;
    backdrop-filter: blur(22px) saturate(1.16) !important;
    -webkit-backdrop-filter: blur(22px) saturate(1.16) !important;
}

html[data-visual-lab-style="strict_sample"] .card.it-card-style-broadcast,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-broadcast {
    border-radius: 20px !important;
    background: repeating-linear-gradient(90deg, rgba(255,255,255,0.032) 0 2px, transparent 2px 28px), rgba(5,33,22,0.90) !important;
    border-color: rgba(53,233,133,0.30) !important;
}

html[data-visual-lab-style="strict_sample"] .card.it-card-style-museum,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-museum {
    border-radius: 4px !important;
    background: rgba(18,16,15,0.92) !important;
    border-color: rgba(214,184,128,0.24) !important;
    color: #f7efe0 !important;
}

html[data-visual-lab-style="strict_sample"] .card.it-card-style-sticker,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-sticker {
    border-radius: 30px 18px 34px 20px !important;
    border: 3px solid rgba(255,255,255,0.76) !important;
    box-shadow: 0 14px 0 rgba(0,0,0,0.18), 0 24px 56px rgba(0,0,0,0.32) !important;
}

html[data-visual-lab-style="strict_sample"] .card.it-card-style-watercolor,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-watercolor {
    border-radius: 38px 28px 44px 30px !important;
    background: rgba(255,255,252,0.78) !important;
    color: #163238 !important;
    border-color: rgba(72,132,127,0.24) !important;
}
html[data-visual-lab-style="strict_sample"] .card.it-card-style-watercolor .body,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-watercolor .body { color: #37565d !important; }

html[data-visual-lab-style="strict_sample"] .card.it-card-style-newsroom,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-newsroom {
    border-radius: 0 !important;
    border: 2px solid #111 !important;
    background: #fffdf7 !important;
    color: #111 !important;
    box-shadow: 8px 8px 0 rgba(17,17,17,0.14) !important;
}
html[data-visual-lab-style="strict_sample"] .card.it-card-style-newsroom .body,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-newsroom .body { color: #343434 !important; }

html[data-visual-lab-style="strict_sample"] .card.it-card-style-neon,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-neon {
    border-radius: 24px !important;
    background: rgba(9,9,31,0.90) !important;
    border-color: rgba(83,232,255,0.28) !important;
    box-shadow: 0 0 42px rgba(83,232,255,0.13), 0 28px 70px rgba(0,0,0,0.34) !important;
}

html[data-visual-lab-style="strict_sample"] .card.it-card-style-terminal,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-terminal {
    border-radius: 0 !important;
    border: 1px solid rgba(78,255,139,0.30) !important;
    background: rgba(1,8,5,0.94) !important;
    color: #d8ffe7 !important;
    font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace !important;
}
html[data-visual-lab-style="strict_sample"] .card.it-card-style-terminal h2,
html[data-visual-lab-style="strict_sample"] .card.it-card-style-terminal .body,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-terminal h2,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-terminal .body { font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace !important; }

/* Animation trial 1: Drift. Slow motion, simple material surface. */
@keyframes it-lab-drift-card {
    0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
    50% { transform: translate3d(0, -10px, 0) rotate(-0.25deg); }
}
html[data-visual-lab-style="drift"] body,
body[data-visual-lab-style="drift"] { background: #07100d !important; }
html[data-visual-lab-style="drift"] .card,
body[data-visual-lab-style="drift"] .card,
html[data-visual-lab-style="strict_sample"] .card.it-card-style-drift,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-drift,
html[data-visual-lab-style="sample"] .card.it-card-style-drift,
body[data-visual-lab-style="sample"] .card.it-card-style-drift {
    border-radius: 28px !important;
    background: rgba(10, 25, 19, 0.90) !important;
    border-color: rgba(181, 228, 196, 0.22) !important;
    box-shadow: 0 22px 50px rgba(0,0,0,0.28) !important;
}
html[data-visual-lab-style="drift"] main > .card,
body[data-visual-lab-style="drift"] main > .card { animation: it-lab-drift-card 5.6s ease-in-out infinite !important; }
html[data-visual-lab-style="drift"] main > .card:nth-of-type(2n),
body[data-visual-lab-style="drift"] main > .card:nth-of-type(2n) { animation-delay: -1.7s !important; }
html[data-visual-lab-style="drift"] main > .card:nth-of-type(3n),
body[data-visual-lab-style="drift"] main > .card:nth-of-type(3n) { animation-delay: -3.1s !important; }

/* Animation trial 2: Hinge. 3D card movement from a fixed top edge. */
@keyframes it-lab-hinge-in {
    from { opacity: 0; transform: perspective(900px) rotateX(-16deg) translateY(-18px); transform-origin: top center; }
    to { opacity: 1; transform: perspective(900px) rotateX(0deg) translateY(0); transform-origin: top center; }
}
html[data-visual-lab-style="hinge"] body,
body[data-visual-lab-style="hinge"] { background: #11100d !important; }
html[data-visual-lab-style="hinge"] .card,
body[data-visual-lab-style="hinge"] .card,
html[data-visual-lab-style="strict_sample"] .card.it-card-style-hinge,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-hinge,
html[data-visual-lab-style="sample"] .card.it-card-style-hinge,
body[data-visual-lab-style="sample"] .card.it-card-style-hinge {
    border-radius: 6px !important;
    background: #191714 !important;
    border: 1px solid rgba(232, 196, 91, 0.28) !important;
    box-shadow: 0 20px 50px rgba(0,0,0,0.34) !important;
    transform-origin: top center !important;
}
html[data-visual-lab-style="hinge"] main > .card,
body[data-visual-lab-style="hinge"] main > .card { animation: it-lab-hinge-in 680ms cubic-bezier(0.16, 1, 0.3, 1) both !important; }
html[data-visual-lab-style="hinge"] main > .card:hover,
body[data-visual-lab-style="hinge"] main > .card:hover { transform: perspective(900px) rotateX(4deg) translateY(-4px) !important; }

/* Animation trial 3: Spotlight. Mouse-tracked highlight and slight physical tilt. */
html[data-visual-lab-style="spotlight"] body,
body[data-visual-lab-style="spotlight"] { background: #07080a !important; }
html[data-visual-lab-style="spotlight"] .card,
body[data-visual-lab-style="spotlight"] .card,
html[data-visual-lab-style="strict_sample"] .card.it-card-style-spotlight,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-spotlight,
html[data-visual-lab-style="sample"] .card.it-card-style-spotlight,
body[data-visual-lab-style="sample"] .card.it-card-style-spotlight {
    --it-lab-mx: 50%;
    --it-lab-my: 50%;
    border-radius: 22px !important;
    background: #101317 !important;
    border-color: rgba(255,255,255,0.16) !important;
    box-shadow: 0 22px 58px rgba(0,0,0,0.36) !important;
}
html[data-visual-lab-style="spotlight"] .card::before,
body[data-visual-lab-style="spotlight"] .card::before {
    background: radial-gradient(circle at var(--it-lab-mx) var(--it-lab-my), rgba(255,255,255,0.22), transparent 9rem) !important;
    opacity: 1 !important;
}
html[data-visual-lab-style="spotlight"] .card:hover,
body[data-visual-lab-style="spotlight"] .card:hover { transform: translateY(-3px) rotateX(var(--it-lab-tilt-y, 0deg)) rotateY(var(--it-lab-tilt-x, 0deg)) !important; }

/* Animation trial 4: Cascade. Hard-edged cards arrive like shuffled panels. */
@keyframes it-lab-cascade-in {
    from { opacity: 0; transform: translate3d(-28px, 22px, 0) rotate(-1.2deg); }
    to { opacity: 1; transform: translate3d(0, 0, 0) rotate(0); }
}
html[data-visual-lab-style="cascade"] body,
body[data-visual-lab-style="cascade"] { background: #e7e3d7 !important; color: #111 !important; }
html[data-visual-lab-style="cascade"] .card,
body[data-visual-lab-style="cascade"] .card,
html[data-visual-lab-style="strict_sample"] .card.it-card-style-cascade,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-cascade,
html[data-visual-lab-style="sample"] .card.it-card-style-cascade,
body[data-visual-lab-style="sample"] .card.it-card-style-cascade {
    border-radius: 0 !important;
    background: #fffdf7 !important;
    color: #111 !important;
    border: 2px solid #111 !important;
    box-shadow: 10px 10px 0 rgba(0,0,0,0.18) !important;
}
html[data-visual-lab-style="cascade"] .body,
body[data-visual-lab-style="cascade"] .body { color: #333 !important; }
html[data-visual-lab-style="cascade"] main > .card,
body[data-visual-lab-style="cascade"] main > .card { animation: it-lab-cascade-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both !important; }
html[data-visual-lab-style="cascade"] main > .card:nth-of-type(2n),
body[data-visual-lab-style="cascade"] main > .card:nth-of-type(2n) { animation-delay: 90ms !important; }
html[data-visual-lab-style="cascade"] main > .card:nth-of-type(3n),
body[data-visual-lab-style="cascade"] main > .card:nth-of-type(3n) { animation-delay: 180ms !important; }
html[data-visual-lab-style="cascade"] main > .card:hover,
body[data-visual-lab-style="cascade"] main > .card:hover { transform: translate(-3px, -3px) !important; box-shadow: 14px 14px 0 rgba(0,0,0,0.20) !important; }

/* Animation trial 5: Flipbook. Content card behaves like a physical page/card face. */
@keyframes it-lab-flipbook-breathe {
    0%, 100% { transform: perspective(1200px) rotateY(0deg); }
    50% { transform: perspective(1200px) rotateY(-1.4deg); }
}
html[data-visual-lab-style="flipbook"] body,
body[data-visual-lab-style="flipbook"] { background: #15120e !important; }
html[data-visual-lab-style="flipbook"] .card,
body[data-visual-lab-style="flipbook"] .card,
html[data-visual-lab-style="strict_sample"] .card.it-card-style-flipbook,
body[data-visual-lab-style="strict_sample"] .card.it-card-style-flipbook,
html[data-visual-lab-style="sample"] .card.it-card-style-flipbook,
body[data-visual-lab-style="sample"] .card.it-card-style-flipbook {
    border-radius: 10px 26px 26px 10px !important;
    background: #241f19 !important;
    border-color: rgba(255,255,255,0.14) !important;
    border-left: 10px solid rgba(255,255,255,0.18) !important;
    box-shadow: 22px 22px 50px rgba(0,0,0,0.28), inset 8px 0 18px rgba(0,0,0,0.22) !important;
    transform-origin: left center !important;
}
html[data-visual-lab-style="flipbook"] main > .card,
body[data-visual-lab-style="flipbook"] main > .card { animation: it-lab-flipbook-breathe 4.8s ease-in-out infinite !important; }
html[data-visual-lab-style="flipbook"] main > .card:hover,
body[data-visual-lab-style="flipbook"] main > .card:hover { transform: perspective(1200px) rotateY(-6deg) translateX(4px) !important; }

@media (prefers-reduced-motion: reduce) {
    html[data-visual-lab-style="drift"] main > .card,
    body[data-visual-lab-style="drift"] main > .card,
    html[data-visual-lab-style="hinge"] main > .card,
    body[data-visual-lab-style="hinge"] main > .card,
    html[data-visual-lab-style="cascade"] main > .card,
    body[data-visual-lab-style="cascade"] main > .card,
    html[data-visual-lab-style="flipbook"] main > .card,
    body[data-visual-lab-style="flipbook"] main > .card {
        animation: none !important;
    }
}

@media (max-width: 720px) {
    .it-visual-lab-controls { border-radius: 24px !important; }
    .it-visual-lab-controls button { padding: 0.44rem 0.52rem !important; font-size: 0.71rem !important; }
}
"""


VISUAL_LAB_MORE_JS = r"""
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
        { key: "sample", label: "Sample" },
        { key: "strict_sample", label: "Strict sample" },
        { key: "drift", label: "Drift" },
        { key: "hinge", label: "Hinge" },
        { key: "spotlight", label: "Spotlight" },
        { key: "cascade", label: "Cascade" },
        { key: "flipbook", label: "Flipbook" }
    ];
    var sampleCardStyles = [
        "paper", "glass", "broadcast", "museum", "sticker", "watercolor", "newsroom", "neon", "terminal",
        "drift", "hinge", "spotlight", "cascade", "flipbook"
    ];
    var allowed = styles.reduce(function (map, style) {
        map[style.key] = true;
        return map;
    }, {});

    function hashString(value) {
        var hash = 2166136261;
        for (var i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function seededShuffle(items, seedText) {
        var seed = hashString(seedText || "visual-lab");
        var deck = items.slice();
        function next() {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        }
        for (var i = deck.length - 1; i > 0; i -= 1) {
            var j = Math.floor(next() * (i + 1));
            var tmp = deck[i];
            deck[i] = deck[j];
            deck[j] = tmp;
        }
        return deck;
    }

    function currentStyle() {
        var params = new URLSearchParams(window.location.search || "");
        var style = (params.get("style") || document.documentElement.getAttribute("data-visual-lab-style") || "paper").toLowerCase();
        return allowed[style] ? style : "paper";
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
            sampleCardStyles.forEach(function (key) { card.classList.remove("it-card-style-" + key); });
            card.removeAttribute("data-visual-card-style");
        });
    }

    function applySampleCardStyles(strict) {
        var seed = sampleSeed();
        var strictDeck = seededShuffle(sampleCardStyles, seed + "|strict-sample");
        document.querySelectorAll("main > .card").forEach(function (card, index) {
            sampleCardStyles.forEach(function (key) { card.classList.remove("it-card-style-" + key); });
            var key;
            if (strict) {
                key = strictDeck[index % strictDeck.length];
            } else {
                var text = (card.textContent || "").replace(/\s+/g, " ").slice(0, 180);
                key = sampleCardStyles[hashString(seed + "|" + index + "|" + text) % sampleCardStyles.length];
            }
            card.classList.add("it-card-style-" + key);
            card.setAttribute("data-visual-card-style", key);
        });
    }

    function applyStyle(style) {
        if (!allowed[style]) style = "paper";
        document.documentElement.setAttribute("data-visual-lab-style", style);
        if (document.body) document.body.setAttribute("data-visual-lab-style", style);
        if (style === "sample") applySampleCardStyles(false);
        else if (style === "strict_sample") applySampleCardStyles(true);
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

    function previousDateString() {
        var params = new URLSearchParams(window.location.search || "");
        var raw = params.get("date") || "";
        var date;
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            date = new Date(raw + "T12:00:00Z");
        } else {
            var heroDate = document.querySelector(".hero-pill") ? document.querySelector(".hero-pill").textContent.replace(/^\s*📅\s*/, "") : "";
            date = heroDate ? new Date(heroDate + " 12:00:00") : new Date();
        }
        date.setUTCDate(date.getUTCDate() - 1);
        return date.toISOString().slice(0, 10);
    }

    function goToPreviousDay() {
        var url = new URL(window.location.href);
        url.searchParams.set("date", previousDateString());
        window.location.href = url.toString();
    }

    function mountControls() {
        var controls = document.querySelector(".it-visual-lab-controls");
        if (!controls) {
            controls = document.createElement("nav");
            controls.className = "it-visual-lab-controls";
            controls.setAttribute("aria-label", "Irish Today visual lab styles");
            document.body.appendChild(controls);
        }

        styles.forEach(function (style) {
            if (controls.querySelector('button[data-style="' + style.key + '"]')) return;
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

        if (!controls.querySelector('[data-visual-day-action="previous"]')) {
            var previous = document.createElement("button");
            previous.type = "button";
            previous.dataset.visualDayAction = "previous";
            previous.textContent = "← Previous day";
            previous.addEventListener("click", goToPreviousDay);
            controls.insertBefore(previous, controls.firstChild);
        }

        applyStyle(currentStyle());
    }

    function mountSpotlightTracking() {
        document.addEventListener("pointermove", function (event) {
            if (currentStyle() !== "spotlight") return;
            var card = event.target && event.target.closest ? event.target.closest(".card") : null;
            if (!card) return;
            var rect = card.getBoundingClientRect();
            var x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
            var y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
            card.style.setProperty("--it-lab-mx", x.toFixed(2) + "%");
            card.style.setProperty("--it-lab-my", y.toFixed(2) + "%");
            card.style.setProperty("--it-lab-tilt-x", ((x - 50) / 20).toFixed(2) + "deg");
            card.style.setProperty("--it-lab-tilt-y", ((50 - y) / 24).toFixed(2) + "deg");
        }, { passive: true });
    }

    function boot() {
        applyStyle(currentStyle());
        mountControls();
        mountSpotlightTracking();
        window.setTimeout(function () {
            if (currentStyle() === "sample") applySampleCardStyles(false);
            if (currentStyle() === "strict_sample") applySampleCardStyles(true);
        }, 100);
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

    context.metadata.update(
        {
            "theme_name": "irish_today_visual_lab_more",
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_head_html": previous_head + VISUAL_LAB_MORE_HEAD,
            "extra_css": previous_css + VISUAL_LAB_MORE_CSS,
            "extra_js": previous_js + VISUAL_LAB_MORE_JS,
        }
    )
    return context
