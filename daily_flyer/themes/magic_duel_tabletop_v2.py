from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import magic_duel_colors as base_theme
from daily_flyer.themes import magic_duel_tabletop as visual_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
THEME_CONFIG.update(
    {
        "page_title": "Magic Duel — Tabletop v2",
        "header_title": "Magic Duel",
        "header_subtitle": (
            "The tactile tabletop version with real color pressure: five mana colors, "
            "colored costs, multicolor cards, and color-aware auto-tapping."
        ),
        "footer_text": (
            "Daily Flyer • Magic Duel tabletop v2 • Original placeholder cards and frame treatment; "
            "not affiliated with or endorsed by Wizards of the Coast."
        ),
        "hero_kicker": "Daily Flyer • Tabletop Rules v2",
        "hero_summary_pill": "W U B R G • colored mana • multicolor costs • physical tabletop",
    }
)

BACKGROUND_CADENCE = "daily"
BACKGROUNDS: list[dict] = []


TABLETOP_COLOR_CSS = r"""
/* Apply actual rules-engine color information to the existing tabletop material system. */
.md-card.md-color-W, .md-card.md-produces-W { --card-accent: #d8cfaa; --card-accent-soft: #827757; }
.md-card.md-color-U, .md-card.md-produces-U { --card-accent: #5d91b5; --card-accent-soft: #29465d; }
.md-card.md-color-B, .md-card.md-produces-B { --card-accent: #62596a; --card-accent-soft: #29242d; }
.md-card.md-color-R, .md-card.md-produces-R { --card-accent: #b4543d; --card-accent-soft: #5b291f; }
.md-card.md-color-G, .md-card.md-produces-G { --card-accent: #62865b; --card-accent-soft: #30452e; }
.md-card.md-color-multi { --card-accent: #b79a58; --card-accent-soft: #51452d; }

.md-card-name { padding-right: 70px !important; }
.md-cost-pips {
    top: 10px !important;
    right: 9px !important;
    gap: 2px !important;
    max-width: 68px !important;
}
.md-cost-pips .md-mana-pip {
    width: 20px;
    height: 20px;
    border: 1px solid #4b3d29;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.24), 0 1px 3px rgba(0,0,0,0.52);
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.55rem;
}
.md-card-type {
    margin: -2px 0 0 !important;
    padding: 2px 5px 3px;
    border-left: 1px solid rgba(65,47,25,0.30);
    border-right: 1px solid rgba(65,47,25,0.30);
    color: #574b36 !important;
    background: rgba(211,198,161,0.90);
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.48rem !important;
    letter-spacing: 0.055em;
}
.md-mana-breakdown {
    justify-content: flex-end;
    gap: 0.2rem 0.34rem;
    vertical-align: middle;
}
.md-mana-breakdown > span:last-child {
    margin-left: 0.16rem;
    color: #8f866f;
}
.md-mana-breakdown .md-mana-pip {
    box-shadow: inset 0 1px rgba(255,255,255,0.34), 0 0 5px rgba(0,0,0,0.35);
}
.md-color-legend {
    margin-top: 0.36rem !important;
    color: #9e927b !important;
    font-family: "Crimson Pro", Georgia, serif;
}
.md-color-legend span {
    padding-right: 0.35rem;
    border-right: 1px solid rgba(190,154,91,0.12);
}
.md-color-legend span:last-child { border-right: 0; }
.md-card.is-color-blocked {
    opacity: 0.48 !important;
    filter: saturate(0.54) brightness(0.80) !important;
}
.md-card.is-color-blocked::after {
    content: "mana locked" !important;
    top: 40px !important;
    bottom: auto !important;
    left: 7px !important;
    right: auto !important;
    z-index: 11;
    border-radius: 3px !important;
    background: rgba(43,24,20,0.90) !important;
    border-color: rgba(212,167,98,0.28) !important;
    color: #e2c794 !important;
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.43rem !important;
}
.md-arcane-wells { gap: 0.38rem !important; }
.md-arcane-well {
    width: 18px !important;
    height: 18px !important;
    display: grid;
    place-items: center;
    font: 800 0.48rem/1 "Cinzel", Georgia, serif;
    color: #17130f !important;
    text-shadow: 0 1px rgba(255,255,255,0.24);
}
.md-arcane-well:nth-child(3) { color: #f3edf5 !important; text-shadow: 0 1px #000; }
"""


TABLETOP_COLOR_JS = r"""
(function () {
    const root = document.getElementById("magic-duel-root");
    if (!root) return;
    const letters = ["W", "U", "B", "R", "G"];
    const names = ["White", "Blue", "Black", "Red", "Green"];
    let decorateQueued = false;

    function relabelWells() {
        const wells = root.querySelectorAll(".md-arcane-well");
        if (wells.length !== 5) return;
        wells.forEach((well, index) => {
            if (well.textContent !== letters[index]) {
                well.textContent = letters[index];
            }
            if (well.title !== `${names[index]} mana`) {
                well.title = `${names[index]} mana`;
            }
        });
        const group = root.querySelector(".md-arcane-wells");
        if (group) {
            group.title = "The five mana colors are active rules in this version.";
            group.setAttribute("aria-label", "Five active mana colors: white, blue, black, red, green");
        }
    }

    function disableNonCreatureCombatClicks() {
        root.querySelectorAll('[data-zone="player-battlefield"] .md-card').forEach(card => {
            const typeLine = card.querySelector('.md-card-type')?.textContent || "";
            if (!typeLine.startsWith("Creature") && card.dataset.clickable !== "false") {
                card.dataset.clickable = "false";
            }
        });
    }

    function decorateColorRules() {
        decorateQueued = false;
        relabelWells();
        disableNonCreatureCombatClicks();
    }

    function queueDecorate() {
        if (decorateQueued) return;
        decorateQueued = true;
        requestAnimationFrame(decorateColorRules);
    }

    const observer = new MutationObserver(queueDecorate);
    observer.observe(root, { childList: true, subtree: true });
    queueDecorate();
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)
    context.page_title = THEME_CONFIG["page_title"]
    context.header_title = THEME_CONFIG["header_title"]
    context.header_subtitle = THEME_CONFIG["header_subtitle"]
    context.footer_text = THEME_CONFIG["footer_text"]
    context.metadata["theme_name"] = "magic_duel_tabletop_v2"
    context.metadata["hero_kicker"] = THEME_CONFIG["hero_kicker"]
    context.metadata["hero_summary_pill"] = THEME_CONFIG["hero_summary_pill"]
    context.metadata["extra_head_html"] = visual_theme.TABLETOP_HEAD + (context.metadata.get("extra_head_html", "") or "")
    context.metadata["extra_css"] = (
        (context.metadata.get("extra_css", "") or "")
        + "\n" + visual_theme.TABLETOP_CSS
        + "\n" + TABLETOP_COLOR_CSS
    )
    context.metadata["extra_js"] = (
        (context.metadata.get("extra_js", "") or "")
        + "\n" + visual_theme.TABLETOP_JS
        + "\n" + TABLETOP_COLOR_JS
    )
    return context
