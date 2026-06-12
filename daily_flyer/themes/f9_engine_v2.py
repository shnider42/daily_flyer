from __future__ import annotations

"""
F9 Daily theme.

This version intentionally breaks out of the normal Daily Flyer visual shell.
Instead of using the stock hero + card grid, it renders one full-width "arena"
card that contains its own scoreboard, HUD panels, playlist rail, games, and
tournament callout.
"""

import json
import random
from datetime import date
from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "f9"

F9_TOURNEY_REPO_URL = "https://github.com/shnider42/f9-tourney"
F9_JIPORADY_REPO_URL = "https://github.com/shnider42/jiporady/blob/master/promptardy/app_rocket.py"
F9_LOGO_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/f9_logo.png"
F9_STADIUM_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/stadium.jpg"

# Fill this in when the signup app is deployed, for example:
# F9_TOURNEY_URL = "https://f9-tourney.onrender.com"
F9_TOURNEY_URL = ""

OFFICIAL_RL_ESPORTS_NEWS_URL = "https://esports.rocketleague.com/news"

THEME_CONFIG = {
    "page_title": "F9 Daily — Rocket League Community Flyer",
    "header_title": "F9 Daily",
    "header_subtitle": "Rocket League community dashboard for F9.",
    "footer_text": "F9 Daily • Rocket League community dashboard",
    "hero_kicker": "F9 Daily",
    "hero_summary_pill": "Rocket League HUD",
}

BACKGROUND_CADENCE = "weekly"
BACKGROUNDS = []


RLCS_TEAMS = [
    {
        "name": "Team Falcons",
        "region": "MENA",
        "style": "speed, clean support touches, and suffocating midfield pressure",
        "f9_prompt": "Try tracking the second-man decision tonight: stay close, rotate out, or cheat midfield?",
    },
    {
        "name": "Karmine Corp",
        "region": "EU",
        "style": "crowd energy, hard challenges, and instant counterattack pressure",
        "f9_prompt": "Steal the useful part: challenge with a purpose instead of lunging because silence got awkward.",
    },
    {
        "name": "Gentle Mates",
        "region": "EU",
        "style": "structured pressure, patience, and team spacing",
        "f9_prompt": "Watch how long the third man can stay useful without becoming the third commit.",
    },
    {
        "name": "G2 Stride",
        "region": "NA",
        "style": "quick passing lanes, recoveries, and fast counterattacks",
        "f9_prompt": "Call one infield pass before you hit it. Even if nobody listens, you trained the comm.",
    },
    {
        "name": "Team BDS",
        "region": "EU",
        "style": "efficient touches, pressure clears, and clean shooting windows",
        "f9_prompt": "Try one possession-first clear instead of the traditional ranked boom donation.",
    },
    {
        "name": "Gen.G Mobil1 Racing",
        "region": "NA",
        "style": "spacing, discipline, and thinking one touch ahead",
        "f9_prompt": "Say where your first touch is going before you take it. Then find out how honest you were.",
    },
]

ITEMS = [
    ("Titanium White Zomba", "The classic flex. If you whiff, at least the wheels were expensive in spirit."),
    ("Cristiano wheels", "Clean, readable, and allergic to excuses."),
    ("Alpha Boost", "The forbidden placebo. It will not fix rotations, but it may fix confidence."),
    ("Big Splash", "For goals that were either brilliant or absolute nonsense."),
    ("Standard boost", "Simple enough to stop blinding your teammate on back-post defense."),
    ("Octane Huntress", "A clean car can make a suspicious 50 look intentional."),
    ("Dueling Dragons", "Save it for the goal that absolutely did not deserve cinema."),
]

ARENAS = [
    ("DFH Stadium", "The control map. If something goes wrong here, the walls are innocent."),
    ("Mannfield", "Comfort-food Rocket League: honest rotations, dishonest demos."),
    ("Champions Field", "Everything feels official, including the own goals."),
    ("Utopia Coliseum", "A dramatic stage for saves and boost-pad complaints."),
    ("Neo Tokyo", "The neon test: recoveries feel cooler, mistakes look louder."),
    ("Forbidden Temple", "Clean sightlines for calculated 50s and fake confidence."),
    ("Wasteland", "A name that still announces cursed bounces before they happen."),
]

HITBOXES = [
    ("Octane", "Tall, forgiving, readable, and shared by the Fennec. The democratic default."),
    ("Dominus", "Long and flat: built for power clears, flicks, and stylish missed soft touches."),
    ("Plank", "Low, wide, Batmobile-adjacent menace. The 50s look illegal."),
    ("Hybrid", "The middle path for players who cannot decide if they are mechanical or practical."),
    ("Breakout", "Long and low. Great for air-dribble dreams, less great for ground-control excuses."),
    ("Merc", "Tall-box chaos. If the ball hits it, everyone needs a second to process the result."),
]

RANKS = [
    ("Bronze", "Discovery era: ball cam confusion, heroic whiffs, unlimited belief."),
    ("Silver", "Enough control to plan something; not enough control for the plan to survive."),
    ("Gold", "The birthplace of 'I centered it' while the ball travels through three defenders."),
    ("Platinum", "Mechanics arrive before rotation discipline. Confidence gets expensive."),
    ("Diamond", "Fast enough to overcommit at full speed. Back post becomes a lifestyle."),
    ("Champion", "Tiny spacing mistakes become goals; everyone has one saved reset clip."),
    ("Grand Champion", "The game becomes less about touching the ball and more about making the next touch inevitable."),
    ("Supersonic Legend", "Reads, speed, control, recovery, and no free balls."),
    ("F9 House Rank", "Somewhere between peak comms and 'my bad' with no details."),
]

THROWBACKS = [
    "Rocket League's predecessor was Supersonic Acrobatic Rocket-Powered Battle-Cars, a title that basically needed boost management.",
    "Solo Standard used to be a ranked 3v3 playlist where every player queued alone. Somehow the community survived.",
    "Rocket Labs gave the game experimental arenas like Pillars and Underpass before competitive maps settled down.",
    "Neo Tokyo and Wasteland both had non-standard versions before being rebuilt into more normal competitive layouts.",
    "The Season 3 World Championship is remembered in part because Turbopolsa won as a substitute for Northern Gaming.",
    "The jstn zero-second equalizer became one of Rocket League esports' defining clips.",
]

PROS = [
    {
        "name": "jstn.",
        "role": "zero-second legend",
        "clues": [
            "North American icon.",
            "His most famous clip forced overtime with no time left.",
            "The caster call became Rocket League shorthand forever.",
        ],
    },
    {
        "name": "Turbopolsa",
        "role": "championship collector",
        "clues": [
            "European legend.",
            "Famously won a world title as a substitute.",
            "Often brought up in all-time-great debates because of the trophy count.",
        ],
    },
    {
        "name": "Kaydop",
        "role": "finals machine",
        "clues": [
            "French legend.",
            "A central name in old EU dominance.",
            "Associated with the Gale Force/Dignitas era.",
        ],
    },
    {
        "name": "GarrettG",
        "role": "NA mainstay",
        "clues": [
            "North American veteran.",
            "Known for longevity at the top.",
            "A long-running face of NRG Rocket League.",
        ],
    },
    {
        "name": "SquishyMuffinz",
        "role": "ceiling-shot icon",
        "clues": [
            "Canadian world champion.",
            "Helped make ceiling shots feel mainstream.",
            "Part of the Cloud9 roster fans still talk about.",
        ],
    },
    {
        "name": "Zen",
        "role": "mechanical phenom",
        "clues": [
            "French prodigy.",
            "Known for ridiculous control and confidence.",
            "His arrival felt like a before-and-after moment.",
        ],
    },
    {
        "name": "Joyo",
        "role": "mechanics with personality",
        "clues": [
            "English pro.",
            "Known for creativity, flair, and mechanics.",
            "Broke out as part of the Team Queso/Moist era.",
        ],
    },
]

FUN_FACTS = [
    "Small boost pads give 12 boost, which means eight little pads and courage can become a full tank.",
    "The second jump/dodge timer is short enough that hesitation turns planned aerials into accidental front flips.",
    "A fake challenge is emotional damage delivered with car body language.",
    "Back-post rotation is not glamorous, which is why it quietly wins games.",
    "A low 50 can be more useful than a booming clear if your teammate is ready.",
    "Boost starving works best when it is a plan, not just a hobby.",
]

DRILLS = [
    ("Half-flip checkpoint", "Do ten half-flips from dead stop. Target clean landings before speed."),
    ("Back-post honesty test", "Call out every accidental front-post rotation for three games. Shame is temporary."),
    ("Small-pad route", "Cross the field using only small pads. If you hit zero, you found tomorrow's warmup."),
    ("First-touch discipline", "Every defensive touch gets a named target: corner, wall, teammate, or space."),
    ("Wall recovery chain", "After every aerial, recover onto the nearest wall before thinking about another touch."),
    ("Low-50 reps", "Slow dribble into pressure and try to deaden the ball instead of winning it loudly."),
]

NEWS_PROMPTS = [
    "Open the official RL Esports news page and bring one headline into Discord as a watch-party prompt.",
    "Pick one RLCS roster and ask what part of their style would survive in ranked 2s.",
    "Treat the next RLCS headline as a scouting report: speed, boost control, demos, or composure?",
    "Before the next watch party, assign one person to track demos and one person to track panic clears.",
]

COMMUNITY_RULES = [
    "Every 'I got it' must be followed by what you are doing with it.",
    "The third man gets veto power over one teammate's terrible idea.",
    "Demos are valid, but you must compliment the victim's recovery afterward.",
    "Kickoff calls must be made before the countdown hits one.",
    "Clip one goal against where everyone thought someone else had it.",
]

JIPORADY_PACKS = [
    {
        "name": "Mechanics & Game Sense",
        "tagline": "Recoveries, kickoffs, boost math, freestyle terms, and ranked brain.",
        "sample_question": "This recovery mechanic uses a backflip cancel plus air roll to reverse direction much faster than turning around normally.",
        "sample_answer": "What is a half-flip?",
    },
    {
        "name": "RLCS Lore & Deep Cuts",
        "tagline": "Arena archaeology, esport lore, named mechanics, hitboxes, and retired playlists.",
        "sample_question": "This caster delivered the immortal call after jstn's zero-second equalizer.",
        "sample_answer": "Who is Shogun?",
    },
]


def _daily(items, today: date, offset: int = 0):
    return items[(today.toordinal() + offset) % len(items)]


def _weekly(items, today: date, offset: int = 0):
    return items[(today.isocalendar().week + offset) % len(items)]


def _monthly(items, today: date, offset: int = 0):
    return items[((today.year * 12) + today.month + offset) % len(items)]


def _attrs_json(value) -> str:
    return escape(json.dumps(value, ensure_ascii=False), quote=True)


def _link(href: str, label: str, class_name: str = "f9-button") -> str:
    return (
        f'<a class="{class_name}" href="{escape(href, quote=True)}" '
        f'target="_blank" rel="noopener noreferrer">{escape(label)}</a>'
    )


def _chips(*labels: str) -> str:
    return "".join(f'<span class="f9-chip">{escape(label)}</span>' for label in labels)


def _hud_tile(label: str, value: str, sub: str = "") -> str:
    sub_html = f'<span class="f9-hud-sub">{escape(sub)}</span>' if sub else ""
    return (
        '<div class="f9-hud-tile">'
        f'<span class="f9-hud-label">{escape(label)}</span>'
        f'<strong>{escape(value)}</strong>'
        f'{sub_html}'
        '</div>'
    )


def _mini_card(kind: str, kicker: str, title: str, body: str, chips: list[str] | None = None) -> str:
    chip_html = f'<div class="f9-chip-row">{_chips(*(chips or []))}</div>' if chips else ""
    return (
        f'<article class="f9-mini-card f9-mini-card--{escape(kind, quote=True)}">'
        f'<div class="f9-mini-kicker">{escape(kicker)}</div>'
        f'<h3>{escape(title)}</h3>'
        f'<p>{escape(body)}</p>'
        f'{chip_html}'
        '</article>'
    )


def _tourney_url() -> str:
    return F9_TOURNEY_URL.rstrip("/") if F9_TOURNEY_URL else F9_TOURNEY_REPO_URL


def _roster_url() -> str:
    return f"{F9_TOURNEY_URL.rstrip('/')}/roster.json" if F9_TOURNEY_URL else ""


def _render_tourney_panel() -> str:
    roster_url = _roster_url()
    roster_status = "Wire F9_TOURNEY_URL to show live roster status."
    roster_attr = ""
    if roster_url:
        roster_status = "Checking live roster…"
        roster_attr = f' data-f9-roster-url="{escape(roster_url, quote=True)}"'

    return f"""
    <section class="f9-tourney-panel">
        <div class="f9-panel-topline">
            <span>TOURNEY QUEUE</span>
            <span class="f9-live-dot">LIVE SLOT</span>
        </div>
        <h2>F9 2v2 Signup Hub</h2>
        <p>Display name, Discord, RL Tracker link, and region are the core fields. Keep the CTA visible so nobody says they missed signups.</p>
        <div class="f9-chip-row">{_chips("2v2", "RL Tracker", "Discord", "Region", "Roster feed")}</div>
        <div class="f9-action-row">
            {_link(_tourney_url(), "Open signup hub")}
            {_link(F9_TOURNEY_REPO_URL, "Open tourney repo", "f9-button f9-button--ghost")}
        </div>
        <div class="f9-roster-readout"{roster_attr}>
            <span>ROSTER</span>
            <strong>{escape(roster_status)}</strong>
        </div>
    </section>
    """


def _render_guess_the_pro(today: date) -> str:
    pro = _daily(PROS, today, offset=14)
    return f"""
    <section class="f9-game-panel f9-game-panel--guess" data-f9-pro="{escape(pro["name"], quote=True)}" data-f9-clues="{_attrs_json(pro["clues"])}">
        <div class="f9-panel-topline">
            <span>MINI GAME</span>
            <span>GUESS THE PRO</span>
        </div>
        <h2>Guess the Pro</h2>
        <p>Reveal clues one at a time. Bad confident guesses are encouraged.</p>
        <div class="f9-clue-box">Clue 1: {escape(pro["clues"][0])}</div>
        <div class="f9-action-row">
            <button class="f9-button" type="button" data-action="next-pro-clue">Next clue</button>
            <button class="f9-button f9-button--ghost" type="button" data-action="reveal-pro">Reveal</button>
        </div>
        <div class="f9-answer-box" hidden>{escape(pro["name"])} — {escape(pro["role"])}</div>
    </section>
    """


def _render_jiporady(today: date) -> str:
    pack = _weekly(JIPORADY_PACKS, today, offset=5)
    return f"""
    <section class="f9-game-panel f9-game-panel--jiporady" data-f9-jiporady="{_attrs_json(JIPORADY_PACKS)}">
        <div class="f9-panel-topline">
            <span>PARTY BOARD</span>
            <span>JIPORADY</span>
        </div>
        <h2>Rocket League Jiporady</h2>
        <p>Two board packs from the Rocket League Jiporady source: mechanics/game-sense and RLCS lore/deep cuts.</p>
        <div class="f9-pack-name">{escape(pack["name"])}</div>
        <div class="f9-pack-tagline">{escape(pack["tagline"])}</div>
        <div class="f9-clue-box">
            <span>Sample clue</span>
            <strong>{escape(pack["sample_question"])}</strong>
            <em hidden>{escape(pack["sample_answer"])}</em>
        </div>
        <div class="f9-action-row">
            <button class="f9-button" type="button" data-action="next-jiporady-pack">Switch pack</button>
            <button class="f9-button f9-button--ghost" type="button" data-action="reveal-jiporady-answer">Reveal answer</button>
            {_link(F9_JIPORADY_REPO_URL, "Open source", "f9-button f9-button--ghost")}
        </div>
    </section>
    """


def _render_scouting_report(today: date) -> str:
    team = _weekly(RLCS_TEAMS, today)
    return f"""
    <section class="f9-scout-panel">
        <div class="f9-panel-topline">
            <span>RLCS WATCH DESK</span>
            <span>{escape(team["region"])}</span>
        </div>
        <h2>{escape(team["name"])}</h2>
        <p><strong>Style read:</strong> {escape(team["style"])}.</p>
        <p><strong>F9 prompt:</strong> {escape(team["f9_prompt"])}</p>
        <div class="f9-action-row">
            {_link(OFFICIAL_RL_ESPORTS_NEWS_URL, "Open RL Esports news")}
        </div>
    </section>
    """


def _render_stage_body(today: date, rng: random.Random) -> str:
    item, item_body = _daily(ITEMS, today, offset=2)
    arena, arena_body = _daily(ARENAS, today, offset=7)
    rank, rank_body = _monthly(RANKS, today)
    hitbox, hitbox_body = _monthly(HITBOXES, today, offset=3)
    throwback = _weekly(THROWBACKS, today)
    fact = _daily(FUN_FACTS, today, offset=11)
    drill, drill_body = _daily(DRILLS, today, offset=19)
    rule = _daily(COMMUNITY_RULES, today, offset=23)
    news_prompt = _daily(NEWS_PROMPTS, today, offset=31)

    boost = 33 + (today.toordinal() % 68)
    kickoff = rng.choice(["LEFT GOES", "CHEAT UP", "FAKE?", "BACK LEFT", "DEMO ROUTE", "NO DOUBLE COMMIT"])
    playlist = rng.choice(["2v2", "Private Match", "Replay Review", "RLCS Watch", "Freeplay Lab"])

    return f"""
    <div class="f9-arena-page">
        <div class="f9-bg-stadium" aria-hidden="true"></div>
        <div class="f9-bg-grid" aria-hidden="true"></div>
        <div class="f9-ball-orbit f9-ball-orbit--one" aria-hidden="true"></div>
        <div class="f9-ball-orbit f9-ball-orbit--two" aria-hidden="true"></div>

        <header class="f9-scoreboard">
            <div class="f9-score-team f9-score-team--orange">
                <span>ORANGE</span>
                <strong>F9</strong>
            </div>
            <div class="f9-score-core">
                <img src="{escape(F9_LOGO_URL, quote=True)}" alt="F9 logo" loading="lazy">
                <div class="f9-clock">5:00</div>
                <div class="f9-date">{escape(today.strftime("%A • %B %d, %Y"))}</div>
            </div>
            <div class="f9-score-team f9-score-team--blue">
                <span>BLUE</span>
                <strong>DAILY</strong>
            </div>
        </header>

        <section class="f9-hero-zone">
            <div class="f9-hero-copy">
                <div class="f9-kicker">F9 ROCKET LEAGUE COMMUNITY</div>
                <h1>Queue the flyer like a match lobby.</h1>
                <p>Not a newspaper grid. This is a Rocket League HUD: signups, RLCS prompts, garage picks, pro guessing, Jiporady, and tonight's house rule in one arena-style dashboard.</p>
                <div class="f9-action-row">
                    {_link(_tourney_url(), "Signup hub")}
                    {_link(OFFICIAL_RL_ESPORTS_NEWS_URL, "RLCS news", "f9-button f9-button--ghost")}
                    {_link(F9_JIPORADY_REPO_URL, "Jiporady source", "f9-button f9-button--ghost")}
                </div>
            </div>

            <aside class="f9-boost-console">
                <div class="f9-boost-ring" style="--boost:{boost}%">
                    <span>{boost}</span>
                    <small>BOOST</small>
                </div>
                <div class="f9-console-stack">
                    {_hud_tile("Kickoff call", kickoff)}
                    {_hud_tile("Playlist", playlist)}
                    {_hud_tile("House rule", "Active", rule)}
                </div>
            </aside>
        </section>

        <section class="f9-primary-grid">
            {_render_tourney_panel()}
            {_render_scouting_report(today)}
        </section>

        <section class="f9-hud-strip">
            {_hud_tile("Item", item, item_body)}
            {_hud_tile("Arena", arena, arena_body)}
            {_hud_tile("Rank", rank, rank_body)}
            {_hud_tile("Hitbox", hitbox, hitbox_body)}
        </section>

        <section class="f9-content-wall">
            {_mini_card("news", "Daily news hook", "RLCS Watch Prompt", news_prompt, ["source-ready", "watch party"])}
            {_mini_card("drill", "Warmup drill", drill, drill_body, ["freeplay", "before ranked"])}
            {_mini_card("throwback", "Throwback fact", "Rocket League Lore Drop", throwback, ["weekly", "deep cut"])}
            {_mini_card("fact", "Fun fact", "Tiny Boost, Big Opinions", fact, ["daily", "quick read"])}
        </section>

        <section class="f9-games-grid">
            {_render_guess_the_pro(today)}
            {_render_jiporady(today)}
        </section>
    </div>
    """


def _extra_head_html() -> str:
    return """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
    """


def _extra_css() -> str:
    return r"""
    :root {
        --f9-black: #05070c;
        --f9-night: #081018;
        --f9-panel: rgba(9, 14, 24, 0.72);
        --f9-panel-2: rgba(17, 24, 38, 0.86);
        --f9-line: rgba(255, 255, 255, 0.12);
        --f9-line-hot: rgba(255, 138, 61, 0.42);
        --f9-text: #fff8ee;
        --f9-muted: #c6d0dc;
        --f9-faint: #8391a3;
        --f9-orange: #e15b3e;
        --f9-orange-hot: #ff8a3d;
        --f9-blue: #59e0ff;
        --f9-blue-deep: #2678ff;
        --f9-green: #7dff9b;
        --f9-gold: #e1b53e;
        --f9-radius: 26px;
        --f9-shadow: 0 30px 90px rgba(0, 0, 0, 0.46);
    }

    html,
    body {
        background: var(--f9-black) !important;
        color: var(--f9-text) !important;
    }

    body {
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        overflow-x: hidden;
    }

    body::before,
    body::after,
    .site-bg,
    .hero-wrap,
    footer {
        display: none !important;
    }

    .page-shell {
        z-index: 1 !important;
    }

    main {
        width: 100% !important;
        max-width: none !important;
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
    }

    .card--f9_stage {
        display: block !important;
        min-height: 100vh !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        overflow: visible !important;
        transform: none !important;
    }

    .card--f9_stage::before,
    .card--f9_stage::after,
    .card--f9_stage > .card-head,
    .card--f9_stage > .source {
        display: none !important;
    }

    .card--f9_stage > .body {
        margin: 0 !important;
        color: var(--f9-text) !important;
        line-height: 1.5 !important;
        font-size: 1rem !important;
    }

    .f9-arena-page {
        position: relative;
        isolation: isolate;
        min-height: 100vh;
        padding: clamp(14px, 2vw, 26px);
        overflow: hidden;
        background:
            radial-gradient(circle at 14% 18%, rgba(255, 138, 61, 0.22), transparent 28rem),
            radial-gradient(circle at 82% 12%, rgba(89, 224, 255, 0.18), transparent 26rem),
            radial-gradient(circle at 72% 80%, rgba(125, 255, 155, 0.10), transparent 24rem),
            linear-gradient(180deg, #081018 0%, #05070c 74%);
    }

    .f9-bg-stadium {
        position: fixed;
        inset: -5%;
        z-index: -4;
        background:
            linear-gradient(180deg, rgba(5, 7, 12, 0.56), rgba(5, 7, 12, 0.92)),
            url("https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/stadium.jpg") center / cover no-repeat;
        filter: saturate(1.18) contrast(1.05) brightness(0.48);
        transform: scale(1.04);
        opacity: 0.70;
    }

    .f9-bg-grid {
        position: fixed;
        inset: 0;
        z-index: -3;
        background:
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
        background-size: 46px 46px;
        mask-image: linear-gradient(180deg, transparent, #000 12%, #000 78%, transparent);
        transform: perspective(900px) rotateX(62deg) translateY(24%);
        transform-origin: center bottom;
        opacity: 0.42;
    }

    .f9-ball-orbit {
        position: fixed;
        z-index: -2;
        width: 280px;
        aspect-ratio: 1;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.10);
        box-shadow:
            0 0 0 24px rgba(255,255,255,0.018),
            0 0 70px rgba(89,224,255,0.16);
        opacity: 0.64;
        pointer-events: none;
    }

    .f9-ball-orbit::before,
    .f9-ball-orbit::after {
        content: "";
        position: absolute;
        border-radius: 999px;
    }

    .f9-ball-orbit::before {
        inset: 24%;
        border: 1px solid rgba(255,255,255,0.14);
    }

    .f9-ball-orbit::after {
        width: 13px;
        height: 13px;
        top: 14%;
        right: 21%;
        background: var(--f9-orange-hot);
        box-shadow: 0 0 26px rgba(255,138,61,0.74);
    }

    .f9-ball-orbit--one {
        top: 140px;
        right: -82px;
        animation: f9-spin 18s linear infinite;
    }

    .f9-ball-orbit--two {
        bottom: 80px;
        left: -120px;
        width: 360px;
        animation: f9-spin 26s linear infinite reverse;
        opacity: 0.36;
    }

    @keyframes f9-spin {
        to { transform: rotate(360deg); }
    }

    .f9-scoreboard {
        position: sticky;
        top: 14px;
        z-index: 20;
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: stretch;
        max-width: 1220px;
        margin: 0 auto clamp(18px, 3vw, 34px);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 24px;
        overflow: hidden;
        background:
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025)),
            rgba(5, 7, 12, 0.74);
        box-shadow: 0 18px 50px rgba(0,0,0,0.34);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
    }

    .f9-score-team,
    .f9-score-core {
        min-height: 82px;
        display: grid;
        place-items: center;
        padding: 0.8rem 1.1rem;
        text-align: center;
    }

    .f9-score-team {
        gap: 0.12rem;
        font-family: Rajdhani, Inter, sans-serif;
        text-transform: uppercase;
    }

    .f9-score-team span,
    .f9-date,
    .f9-kicker,
    .f9-panel-topline,
    .f9-mini-kicker,
    .f9-hud-label {
        font-family: Rajdhani, Inter, sans-serif;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-weight: 700;
    }

    .f9-score-team span {
        color: var(--f9-faint);
        font-size: 0.78rem;
    }

    .f9-score-team strong {
        font-size: clamp(2rem, 4vw, 3.4rem);
        line-height: 0.9;
        letter-spacing: -0.04em;
    }

    .f9-score-team--orange {
        background: linear-gradient(90deg, rgba(225,91,62,0.28), transparent);
    }

    .f9-score-team--blue {
        background: linear-gradient(270deg, rgba(38,120,255,0.26), transparent);
    }

    .f9-score-core {
        min-width: min(34vw, 330px);
        border-inline: 1px solid rgba(255,255,255,0.10);
        background:
            radial-gradient(circle at center, rgba(125,255,155,0.09), transparent 60%),
            rgba(255,255,255,0.035);
    }

    .f9-score-core img {
        width: 64px;
        height: auto;
        filter: drop-shadow(0 12px 24px rgba(0,0,0,0.62));
    }

    .f9-clock {
        margin-top: 0.14rem;
        font-family: Rajdhani, Inter, sans-serif;
        font-weight: 700;
        font-size: clamp(2.2rem, 5vw, 4.2rem);
        line-height: 0.86;
        color: var(--f9-green);
        text-shadow: 0 0 28px rgba(125,255,155,0.34);
    }

    .f9-date {
        margin-top: 0.44rem;
        color: var(--f9-muted);
        font-size: 0.72rem;
    }

    .f9-hero-zone,
    .f9-primary-grid,
    .f9-games-grid,
    .f9-content-wall,
    .f9-hud-strip {
        width: min(100%, 1220px);
        margin-inline: auto;
    }

    .f9-hero-zone {
        display: grid;
        grid-template-columns: minmax(0, 1.12fr) minmax(310px, 0.88fr);
        gap: clamp(18px, 4vw, 54px);
        align-items: end;
        min-height: min(640px, calc(100vh - 150px));
        padding: clamp(22px, 5vw, 68px) 0 clamp(28px, 6vw, 76px);
    }

    .f9-hero-copy {
        position: relative;
        padding: clamp(24px, 4vw, 42px);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 34px;
        background:
            linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)),
            linear-gradient(145deg, rgba(225,91,62,0.16), rgba(38,120,255,0.08));
        box-shadow: var(--f9-shadow);
        overflow: hidden;
    }

    .f9-hero-copy::before {
        content: "";
        position: absolute;
        inset: -40%;
        background: linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.10) 48%, transparent 56%);
        transform: translateX(-35%) rotate(8deg);
        animation: f9-sweep 7s ease-in-out infinite;
        pointer-events: none;
    }

    @keyframes f9-sweep {
        0%, 42% { transform: translateX(-55%) rotate(8deg); opacity: 0; }
        56% { opacity: 0.72; }
        100% { transform: translateX(48%) rotate(8deg); opacity: 0; }
    }

    .f9-hero-copy > * {
        position: relative;
        z-index: 1;
    }

    .f9-kicker {
        color: var(--f9-green);
        font-size: 0.82rem;
    }

    .f9-hero-copy h1 {
        max-width: 11ch;
        margin: 0.72rem 0 0;
        font-family: Rajdhani, Inter, sans-serif;
        font-weight: 700;
        font-size: clamp(3.6rem, 8vw, 8rem);
        line-height: 0.82;
        letter-spacing: -0.065em;
        color: var(--f9-text);
        text-shadow:
            0 0 34px rgba(255, 138, 61, 0.22),
            0 0 74px rgba(89, 224, 255, 0.12);
    }

    .f9-hero-copy p {
        max-width: 62ch;
        margin: 1.25rem 0 0;
        color: var(--f9-muted);
        font-size: clamp(1rem, 1.2vw, 1.12rem);
        line-height: 1.74;
    }

    .f9-action-row,
    .f9-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        align-items: center;
    }

    .f9-action-row {
        margin-top: 1.25rem;
    }

    .f9-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 1rem;
        border-radius: 999px;
        border: 1px solid rgba(255,138,61,0.36);
        background: linear-gradient(135deg, var(--f9-orange-hot), var(--f9-orange));
        color: #120e0b !important;
        font: inherit;
        font-weight: 850;
        letter-spacing: 0.02em;
        cursor: pointer;
        text-decoration: none !important;
        transition: transform 0.16s ease, filter 0.16s ease, border-color 0.16s ease;
    }

    .f9-button:hover {
        transform: translateY(-1px);
        filter: brightness(1.08);
    }

    .f9-button--ghost {
        color: var(--f9-text) !important;
        background: rgba(255,255,255,0.055);
        border-color: rgba(255,255,255,0.13);
    }

    .f9-boost-console {
        display: grid;
        gap: 18px;
        justify-items: center;
    }

    .f9-boost-ring {
        --boost: 66%;
        width: min(310px, 70vw);
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background:
            radial-gradient(circle at center, rgba(5,7,12,0.96) 0 52%, transparent 53%),
            conic-gradient(var(--f9-orange-hot) 0 var(--boost), rgba(255,255,255,0.10) var(--boost) 100%);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow:
            0 0 70px rgba(255,138,61,0.18),
            inset 0 0 54px rgba(255,255,255,0.04);
        font-family: Rajdhani, Inter, sans-serif;
    }

    .f9-boost-ring span {
        display: block;
        font-size: clamp(4rem, 11vw, 8rem);
        line-height: 0.8;
        font-weight: 700;
        color: var(--f9-text);
    }

    .f9-boost-ring small {
        display: block;
        margin-top: 0.35rem;
        color: var(--f9-orange-hot);
        font-size: 1.1rem;
        font-weight: 700;
        letter-spacing: 0.18em;
    }

    .f9-console-stack {
        width: 100%;
        display: grid;
        gap: 12px;
    }

    .f9-primary-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
        gap: 20px;
        margin-bottom: 20px;
    }

    .f9-tourney-panel,
    .f9-scout-panel,
    .f9-game-panel,
    .f9-mini-card,
    .f9-hud-tile {
        border: 1px solid rgba(255,255,255,0.11);
        background:
            linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.024)),
            var(--f9-panel);
        box-shadow: 0 16px 44px rgba(0,0,0,0.24);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
    }

    .f9-tourney-panel,
    .f9-scout-panel,
    .f9-game-panel {
        position: relative;
        overflow: hidden;
        padding: clamp(22px, 3vw, 34px);
        border-radius: var(--f9-radius);
    }

    .f9-tourney-panel {
        background:
            radial-gradient(circle at top right, rgba(255,138,61,0.16), transparent 28%),
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.026)),
            rgba(11, 16, 26, 0.78);
    }

    .f9-scout-panel {
        background:
            radial-gradient(circle at top left, rgba(89,224,255,0.15), transparent 28%),
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.026)),
            rgba(11, 16, 26, 0.78);
    }

    .f9-panel-topline {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        color: var(--f9-green);
        font-size: 0.78rem;
    }

    .f9-live-dot {
        color: var(--f9-orange-hot);
    }

    .f9-tourney-panel h2,
    .f9-scout-panel h2,
    .f9-game-panel h2 {
        margin: 0.7rem 0 0;
        font-family: Rajdhani, Inter, sans-serif;
        font-size: clamp(2rem, 4vw, 3.4rem);
        line-height: 0.95;
        letter-spacing: -0.04em;
    }

    .f9-tourney-panel p,
    .f9-scout-panel p,
    .f9-game-panel p,
    .f9-mini-card p {
        color: var(--f9-muted);
        line-height: 1.7;
    }

    .f9-chip-row {
        margin-top: 1rem;
    }

    .f9-chip {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 0.74rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
        color: var(--f9-text);
        font-size: 0.76rem;
        font-weight: 760;
    }

    .f9-roster-readout,
    .f9-clue-box,
    .f9-answer-box,
    .f9-pack-name,
    .f9-pack-tagline {
        margin-top: 1rem;
        padding: 0.9rem 1rem;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.055);
    }

    .f9-roster-readout {
        display: grid;
        gap: 0.25rem;
        color: var(--f9-muted);
    }

    .f9-roster-readout span {
        color: var(--f9-green);
        font-family: Rajdhani, Inter, sans-serif;
        letter-spacing: 0.16em;
        font-weight: 700;
        font-size: 0.76rem;
    }

    .f9-hud-strip {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 20px;
    }

    .f9-hud-tile {
        min-height: 144px;
        display: grid;
        align-content: start;
        gap: 0.45rem;
        padding: 1rem;
        border-radius: 20px;
    }

    .f9-hud-label {
        color: var(--f9-green);
        font-size: 0.72rem;
    }

    .f9-hud-tile strong {
        color: var(--f9-text);
        font-family: Rajdhani, Inter, sans-serif;
        font-size: 1.55rem;
        line-height: 1;
    }

    .f9-hud-sub {
        color: var(--f9-muted);
        line-height: 1.55;
        font-size: 0.9rem;
    }

    .f9-content-wall {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 20px;
    }

    .f9-mini-card {
        position: relative;
        min-height: 250px;
        padding: 1.15rem;
        border-radius: 22px;
        overflow: hidden;
        transform: skewY(-1.4deg);
    }

    .f9-mini-card > * {
        transform: skewY(1.4deg);
    }

    .f9-mini-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at top right, rgba(255,255,255,0.12), transparent 32%);
        pointer-events: none;
    }

    .f9-mini-card--news { border-color: rgba(89,224,255,0.24); }
    .f9-mini-card--drill { border-color: rgba(125,255,155,0.24); }
    .f9-mini-card--throwback { border-color: rgba(225,181,62,0.26); }
    .f9-mini-card--fact { border-color: rgba(255,138,61,0.26); }

    .f9-mini-kicker {
        position: relative;
        color: var(--f9-green);
        font-size: 0.74rem;
    }

    .f9-mini-card h3 {
        position: relative;
        margin: 0.7rem 0 0;
        font-family: Rajdhani, Inter, sans-serif;
        font-size: 1.65rem;
        line-height: 0.98;
        letter-spacing: -0.035em;
    }

    .f9-mini-card p {
        position: relative;
        margin: 0.85rem 0 0;
        font-size: 0.96rem;
    }

    .f9-games-grid {
        display: grid;
        grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
        gap: 20px;
        padding-bottom: 26px;
    }

    .f9-game-panel--guess {
        background:
            radial-gradient(circle at top right, rgba(225,181,62,0.18), transparent 30%),
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.026)),
            rgba(11, 16, 26, 0.82);
    }

    .f9-game-panel--jiporady {
        background:
            radial-gradient(circle at top left, rgba(109,92,255,0.20), transparent 30%),
            radial-gradient(circle at bottom right, rgba(89,224,255,0.12), transparent 30%),
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.026)),
            rgba(11, 16, 26, 0.82);
    }

    .f9-clue-box {
        display: grid;
        gap: 0.48rem;
        color: var(--f9-text);
        font-weight: 760;
    }

    .f9-clue-box span {
        color: var(--f9-green);
        font-family: Rajdhani, Inter, sans-serif;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-size: 0.74rem;
    }

    .f9-clue-box em {
        color: var(--f9-text);
        font-style: normal;
    }

    .f9-pack-name {
        color: var(--f9-text);
        font-family: Rajdhani, Inter, sans-serif;
        font-size: 1.35rem;
        font-weight: 700;
    }

    .f9-pack-tagline,
    .f9-answer-box {
        color: var(--f9-muted);
    }

    @media (max-width: 980px) {
        .f9-scoreboard,
        .f9-hero-zone,
        .f9-primary-grid,
        .f9-games-grid {
            grid-template-columns: 1fr;
        }

        .f9-scoreboard {
            position: relative;
            top: 0;
        }

        .f9-score-team {
            display: none;
        }

        .f9-score-core {
            min-width: 100%;
            border-inline: 0;
        }

        .f9-hud-strip,
        .f9-content-wall {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .f9-hero-zone {
            min-height: unset;
        }
    }

    @media (max-width: 640px) {
        .f9-arena-page {
            padding: 10px;
        }

        .f9-hero-copy {
            border-radius: 24px;
        }

        .f9-hero-copy h1 {
            font-size: clamp(3.1rem, 20vw, 5rem);
        }

        .f9-hud-strip,
        .f9-content-wall {
            grid-template-columns: 1fr;
        }

        .f9-mini-card,
        .f9-mini-card > * {
            transform: none;
        }

        .f9-tourney-panel,
        .f9-scout-panel,
        .f9-game-panel {
            border-radius: 22px;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .f9-ball-orbit,
        .f9-hero-copy::before {
            animation: none !important;
        }
    }
    """


def _extra_js() -> str:
    return """
    (function () {
        document.querySelectorAll("[data-f9-roster-url]").forEach((root) => {
            const rosterUrl = root.getAttribute("data-f9-roster-url");
            if (!rosterUrl) return;

            fetch(rosterUrl, { cache: "no-store" })
                .then((response) => response.ok ? response.json() : null)
                .then((payload) => {
                    if (!payload) return;
                    const entries = Array.isArray(payload.entries) ? payload.entries : [];
                    const status = payload.signups_open ? "open" : "closed";
                    root.innerHTML = `<span>ROSTER</span><strong>${entries.length} registered • signups ${status}</strong>`;
                })
                .catch(() => {
                    root.innerHTML = "<span>ROSTER</span><strong>Signup app found, but roster status could not be loaded.</strong>";
                });
        });

        document.querySelectorAll("[data-f9-pro]").forEach((root) => {
            let clues = [];
            try {
                clues = JSON.parse(root.getAttribute("data-f9-clues") || "[]");
            } catch (err) {
                clues = [];
            }
            if (!Array.isArray(clues) || !clues.length) return;

            let index = 0;
            const clueEl = root.querySelector(".f9-clue-box");
            const answerEl = root.querySelector(".f9-answer-box");
            const nextBtn = root.querySelector('[data-action="next-pro-clue"]');
            const revealBtn = root.querySelector('[data-action="reveal-pro"]');

            function renderClue() {
                if (clueEl) clueEl.textContent = `Clue ${index + 1}: ${clues[index] || ""}`;
            }

            if (nextBtn) {
                nextBtn.addEventListener("click", () => {
                    index = Math.min(index + 1, clues.length - 1);
                    renderClue();
                });
            }

            if (revealBtn) {
                revealBtn.addEventListener("click", () => {
                    if (answerEl) answerEl.hidden = false;
                });
            }
        });

        document.querySelectorAll("[data-f9-jiporady]").forEach((root) => {
            let packs = [];
            try {
                packs = JSON.parse(root.getAttribute("data-f9-jiporady") || "[]");
            } catch (err) {
                packs = [];
            }
            if (!Array.isArray(packs) || !packs.length) return;

            let index = 0;
            const nameEl = root.querySelector(".f9-pack-name");
            const taglineEl = root.querySelector(".f9-pack-tagline");
            const clueEl = root.querySelector(".f9-clue-box strong");
            const answerEl = root.querySelector(".f9-clue-box em");
            const nextBtn = root.querySelector('[data-action="next-jiporady-pack"]');
            const revealBtn = root.querySelector('[data-action="reveal-jiporady-answer"]');

            function renderPack() {
                const pack = packs[index % packs.length];
                if (nameEl) nameEl.textContent = pack.name || "";
                if (taglineEl) taglineEl.textContent = pack.tagline || "";
                if (clueEl) clueEl.textContent = pack.sample_question || "";
                if (answerEl) {
                    answerEl.textContent = pack.sample_answer || "";
                    answerEl.hidden = true;
                }
            }

            if (nextBtn) {
                nextBtn.addEventListener("click", () => {
                    index = (index + 1) % packs.length;
                    renderPack();
                });
            }

            if (revealBtn) {
                revealBtn.addEventListener("click", () => {
                    if (answerEl) answerEl.hidden = false;
                });
            }

            renderPack();
        });
    })();
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng = random.Random(seed if seed is not None else today.toordinal())

    cards = [
        CardItem(
            card_type="f9_stage",
            eyebrow="F9 Rocket League",
            title="Arena Dashboard",
            body=_render_stage_body(today, rng),
            source_url=None,
        )
    ]

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "background": None,
            "hero_kicker": THEME_CONFIG.get("hero_kicker"),
            "hero_summary_pill": THEME_CONFIG.get("hero_summary_pill"),
            "extra_css": _extra_css(),
            "extra_js": _extra_js(),
            "extra_head_html": _extra_head_html(),
        },
    )
