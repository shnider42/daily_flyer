from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "Arcade Classics — Five cabinet legends",
    "header_title": "🕹️ Arcade Classics",
    "header_subtitle": "Missile Command, Frogger, Asteroids, Galaga, and Pitfall! as a pure wall of retro game cards.",
    "footer_text": "Built on Daily Flyer.",
    "hero_kicker": "Daily Flyer • Arcade Edition",
    "hero_summary_pill": "Five cabinet-era classics, one neon board",
}

ARCADE_EXTRA_CSS = """
:root {
    --bg: #090311;
    --bg-deep: #030108;
    --bg-soft: #13051f;
    --card: rgba(20, 10, 34, 0.84);
    --card-strong: rgba(28, 12, 46, 0.92);
    --border: rgba(143, 255, 250, 0.18);
    --border-strong: rgba(255, 98, 214, 0.36);
    --ink: #f8f3ff;
    --ink-soft: #d8c8ff;
    --muted: #9defff;
    --irish-green: #56f7d7;
    --gold: #ffe867;
    --teal: #67e8ff;
    --blue: #8f83ff;
}
body {
    background:
        radial-gradient(circle at 20% 10%, rgba(255, 79, 216, 0.14), transparent 24%),
        radial-gradient(circle at 80% 0%, rgba(79, 246, 255, 0.16), transparent 22%),
        radial-gradient(circle at 50% 100%, rgba(255, 238, 88, 0.10), transparent 28%),
        linear-gradient(180deg, #18051e 0%, #0b0312 45%, #040107 100%);
}
body::before {
    width: 520px;
    height: 520px;
    top: -150px;
    left: -100px;
    background: radial-gradient(circle, rgba(255, 79, 216, 0.22), transparent 70%);
}
body::after {
    width: 420px;
    height: 420px;
    right: -100px;
    top: 120px;
    background: radial-gradient(circle, rgba(79, 246, 255, 0.16), transparent 70%);
}
.page-shell::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image:
        linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0));
}
header.hero {
    border: 1px solid rgba(103, 232, 255, 0.22);
    background:
        linear-gradient(135deg, rgba(255, 79, 216, 0.14), rgba(79, 246, 255, 0.06) 42%, rgba(255, 238, 88, 0.10)),
        linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
    box-shadow:
        0 28px 80px rgba(0,0,0,0.42),
        0 0 0 1px rgba(255,255,255,0.05) inset,
        0 0 36px rgba(79, 246, 255, 0.08);
}
.hero-kicker,
.hero-pill {
    border-color: rgba(255,255,255,0.12);
    background: rgba(11, 4, 21, 0.45);
    box-shadow: 0 0 18px rgba(79, 246, 255, 0.08);
}
.hero h1,
.hero .subtitle,
.hero-pill,
.hero-kicker {
    text-shadow: 0 0 14px rgba(255, 79, 216, 0.10);
}
.card--arcade_game {
    min-height: 280px;
    border-color: rgba(103, 232, 255, 0.18);
    background:
        linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
        linear-gradient(180deg, rgba(16, 6, 29, 0.92), rgba(11, 4, 21, 0.92));
    box-shadow:
        0 18px 42px rgba(0,0,0,0.30),
        0 0 0 1px rgba(255,255,255,0.04) inset;
    transform-style: preserve-3d;
}
.card--arcade_game::before {
    background:
        linear-gradient(180deg, rgba(255,255,255,0.05), transparent 22%),
        repeating-linear-gradient(
            180deg,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 1px,
            transparent 2px,
            transparent 5px
        );
}
.card--arcade_game::after {
    height: 5px;
    background: linear-gradient(90deg, #ff4fd8, #4ff6ff, #ffee58);
}
.card--arcade_game .icon-badge {
    font-size: 0;
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.12);
    box-shadow: 0 0 20px rgba(255, 79, 216, 0.10);
}
.card--arcade_game .icon-badge::before {
    content: "🕹️";
    font-size: 1.15rem;
}
.card--arcade_game h2 {
    text-shadow: 0 0 14px rgba(79, 246, 255, 0.18);
}
.card--arcade_game .body {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    line-height: 1.72;
}
.card--arcade_game .source {
    border-top-color: rgba(255,255,255,0.10);
}
.card--arcade_game .source a {
    color: #fff38a;
}
.card--arcade_game.is-boosted {
    box-shadow:
        0 22px 52px rgba(0,0,0,0.34),
        0 0 28px rgba(255, 79, 216, 0.16),
        0 0 0 1px rgba(255,255,255,0.06) inset;
}
.arcade-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 0 0 0.9rem;
}
.arcade-chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.28rem 0.62rem;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.05);
    color: #fff4b0;
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}
.arcade-note {
    color: #9defff;
    font-weight: 700;
    letter-spacing: 0.04em;
}
@media (max-width: 980px) {
    .card--arcade_game {
        grid-column: span 6;
    }
}
@media (max-width: 720px) {
    .card--arcade_game {
        grid-column: auto;
        min-height: unset;
    }
}
"""

ARCADE_EXTRA_JS = """
(function () {
    const cards = Array.from(document.querySelectorAll('.card--arcade_game'));
    cards.forEach((card) => {
        card.setAttribute('tabindex', '0');

        const reset = () => {
            card.style.transform = '';
            card.classList.remove('is-boosted');
        };

        card.addEventListener('mousemove', (event) => {
            const rect = card.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width;
            const py = (event.clientY - rect.top) / rect.height;
            const rotateY = (px - 0.5) * 8;
            const rotateX = (0.5 - py) * 6;
            card.style.transform = `translateY(-6px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            card.classList.add('is-boosted');
        });

        card.addEventListener('mouseleave', reset);
        card.addEventListener('blur', reset);
        card.addEventListener('click', () => {
            card.classList.toggle('is-boosted');
        });
    });
})();
"""

ARCADE_GAMES = [
    {
        "title": "Missile Command",
        "eyebrow": "Arcade Hall • 1980",
        "chips": ["Atari", "Defense", "Trackball"],
        "body": (
            "Missile Command turns pure panic into design. You defend six cities from incoming barrages, "
            "and the pressure ramps up until every shot feels like a triage decision."
        ),
        "hook": (
            "Its Cold War mood is a big part of the legend, but the real magic is mechanical: "
            "the trackball makes aiming feel immediate, frantic, and physical."
        ),
        "play_pattern": "Lead your targets, protect the cities, and waste as few interceptors as possible.",
        "source_url": "https://en.wikipedia.org/wiki/Missile_Command",
    },
    {
        "title": "Frogger",
        "eyebrow": "Arcade Hall • 1981",
        "chips": ["Konami", "Action", "Lane Timing"],
        "body": (
            "Frogger is the perfect example of a simple idea with endless tension. "
            "Crossing traffic is only half the problem because the river section forces you to read motion instead of just avoid it."
        ),
        "hook": (
            "Almost everyone understands the goal immediately, which is why the cabinet became such an enduring crowd-pleaser. "
            "The danger is readable, but never fully comfortable."
        ),
        "play_pattern": "Commit to the gap, trust the rhythm, and never hesitate on a floating log.",
        "source_url": "https://en.wikipedia.org/wiki/Frogger",
    },
    {
        "title": "Asteroids",
        "eyebrow": "Arcade Hall • 1979",
        "chips": ["Atari", "Shooter", "Vector Display"],
        "body": (
            "Asteroids feels clean, spare, and brutally elegant. "
            "The ship drifts with inertia, so survival depends as much on movement discipline as on shooting."
        ),
        "hook": (
            "Its vector graphics gave the cabinet a sharp futuristic look, and the thrust physics made the game feel more skillful than a standard point-and-fire shooter."
        ),
        "play_pattern": "Tap thrust, rotate with purpose, and break big rocks before the screen collapses around you.",
        "source_url": "https://en.wikipedia.org/wiki/Asteroids_(video_game)",
    },
    {
        "title": "Galaga",
        "eyebrow": "Arcade Hall • 1981",
        "chips": ["Namco", "Shooter", "Risk / Reward"],
        "body": (
            "Galaga takes the fixed shooter formula and gives it style. "
            "Enemy formations dive, weave, and pressure the player in a way that makes every wave feel theatrical."
        ),
        "hook": (
            "The captured-fighter mechanic is the signature twist: you can deliberately lose a ship and then rescue it to come back stronger with doubled firepower."
        ),
        "play_pattern": "Read the dive patterns, bait the tractor beam when it helps you, and cash in on the dual-fighter comeback.",
        "source_url": "https://en.wikipedia.org/wiki/Galaga",
    },
    {
        "title": "Pitfall!",
        "eyebrow": "Arcade Spirit • 1982",
        "chips": ["Activision", "Platforming", "Adventure"],
        "body": (
            "Pitfall! brought a sense of journey to the early era. "
            "Instead of surviving one repeating screen, you swing, jump, and run through a much larger world full of timing traps."
        ),
        "hook": (
            "The game is famous for cramming a surprising amount of adventure into the hardware of its time. "
            "It helped prove that action games could also feel exploratory."
        ),
        "play_pattern": "Keep moving, respect the crocodiles, and treat every vine swing like a decision instead of a reflex.",
        "source_url": "https://en.wikipedia.org/wiki/Pitfall!",
    },
]


def _build_arcade_body(entry: dict[str, object]) -> str:
    chips = "".join(
        f'<span class="arcade-chip">{chip}</span>'
        for chip in entry["chips"]
    )
    return (
        f'<div class="arcade-strip">{chips}</div>'
        f'<strong>Why it matters:</strong> {entry["body"]}<br><br>'
        f'<strong>Cabinet hook:</strong> {entry["hook"]}<br><br>'
        f'<span class="arcade-note">Play pattern:</span> {entry["play_pattern"]}'
    )


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)

    cards = [
        CardItem(
            card_type="arcade_game",
            eyebrow=entry["eyebrow"],
            title=entry["title"],
            body=_build_arcade_body(entry),
            source_url=entry["source_url"],
        )
        for entry in ARCADE_GAMES
    ]

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "arcade_classics",
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": ARCADE_EXTRA_CSS,
            "extra_js": ARCADE_EXTRA_JS,
        },
    )
