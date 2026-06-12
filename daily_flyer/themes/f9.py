from __future__ import annotations

"""
F9 Daily theme.

A Rocket League/F9-community skin for Daily Flyer.  The theme intentionally
keeps live deployment URLs as top-level constants so the static flyer can be
wired to the existing F9 tournament app once its public Render URL is known.
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
    "header_subtitle": (
        '<div class="f9-hero-copy">'
        f'<img class="f9-hero-logo" src="{F9_LOGO_URL}" alt="F9 logo" loading="lazy">'
        "<p>A daily/weekly Rocket League dashboard for the F9 crew: tournament awareness, "
        "RLCS watch prompts, throwback trivia, car-meta bits, and quick party games.</p>"
        '<p class="f9-hero-rhythm"><strong>Queue up</strong> → <strong>Warm up</strong> → '
        "<strong>Sign up</strong> → <strong>Talk trash politely</strong></p>"
        "</div>"
    ),
    "footer_text": (
        "F9 Daily is a Rocket League community skin for Daily Flyer. "
        "Wire F9_TOURNEY_URL in daily_flyer/themes/f9.py after the signup app has a public URL."
    ),
    "hero_kicker": "Daily Flyer • F9 Rocket League",
    "hero_summary_pill": "RLCS • Tourneys • Jiporady • Guess the Pro",
}

BACKGROUND_CADENCE = "weekly"
BACKGROUNDS = [
    {
        "path": F9_STADIUM_URL,
        "label": "F9 stadium layer",
    }
]


RLCS_TEAMS = [
    {
        "name": "Team Falcons",
        "angle": "fast recoveries, suffocating midfield pressure, and a style that makes every loose ball feel claimed.",
        "prompt": "When F9 scrims tonight, track one moment where the second man should stay close instead of panic-rotating out.",
    },
    {
        "name": "Karmine Corp",
        "angle": "crowd energy, ruthless challenges, and possession that turns defense into instant offense.",
        "prompt": "Steal one habit: challenge with a purpose, not because the silence got awkward.",
    },
    {
        "name": "Gentle Mates",
        "angle": "structured pressure and the kind of team patience that makes forced clears feel inevitable.",
        "prompt": "Watch how long the third man can stay threatening without becoming the third commit.",
    },
    {
        "name": "G2 Stride",
        "angle": "North American speed, quick passes, and a willingness to turn recoveries into counterattacks.",
        "prompt": "For F9: call out one infield pass attempt before it happens, even if nobody listens.",
    },
    {
        "name": "Team BDS",
        "angle": "classic EU efficiency: controlled touches, hard clears with intent, and clean shooting windows.",
        "prompt": "Try one possession-first clear instead of the traditional F9 booming donation.",
    },
    {
        "name": "Gen.G Mobil1 Racing",
        "angle": "disciplined spacing and a style that rewards players who think one touch ahead.",
        "prompt": "During warmups, say out loud where your teammate will be after your first touch.",
    },
]

ITEMS_OF_THE_DAY = [
    ("Titanium White Zomba", "The old flex still works: bright enough to distract, expensive-looking enough to make whiffs funnier."),
    ("Cristiano wheels", "The clean ranked default: no nonsense, no excuses, just kickoff dust and bad decisions."),
    ("Alpha Boost", "The forbidden audio placebo. Equipping it will not fix your rotations, but it may fix your confidence."),
    ("Big Splash", "A goal explosion for when the shot was either brilliant or a complete accident. F9 accepts both."),
    ("Standard boost", "Simple, readable, and less likely to blind your teammate during a back-post panic save."),
    ("Octane Huntress decal", "A reminder that clean car design can make even a suspicious 50 look intentional."),
    ("Dueling Dragons", "Peak chaos energy. Save it for the goal that absolutely did not deserve cinematic treatment."),
]

ARENAS = [
    ("DFH Stadium", "The control map. If something goes wrong here, sadly, the walls cannot be blamed."),
    ("Mannfield", "Comfort food Rocket League. Great for honest rotations and dishonest demos."),
    ("Champions Field", "Everything feels slightly more official, including the own goals."),
    ("Utopia Coliseum", "Perfect for dramatic saves and at least one person saying they cannot see the boost pad."),
    ("Neo Tokyo", "The neon test: recoveries feel cooler, mistakes look louder."),
    ("Forbidden Temple", "A clean stage for reading bounces and pretending your 50 was calculated."),
    ("Wasteland", "A throwback name that still screams 'something cursed is about to happen.'"),
]

RANKS_BY_MONTH = [
    ("Bronze", "The sacred age of discovery: ball cam confusion, heroic whiffs, and unlimited belief."),
    ("Silver", "Enough control to plan something, not enough control for the plan to survive first contact."),
    ("Gold", "The birthplace of 'I centered it' when the ball is actually passing through three defenders."),
    ("Platinum", "Mechanics arrive before rotation discipline. This is where confidence gets expensive."),
    ("Diamond", "Everyone is fast enough to overcommit at full speed. Back post becomes a lifestyle."),
    ("Champion", "Tiny spacing mistakes become goals. Also, everyone has one reset clip saved forever."),
    ("Grand Champion", "The game becomes less about touching the ball and more about making the next touch inevitable."),
    ("Supersonic Legend", "Reads, speed, control, recovery, and the quiet horror of never being allowed a free ball."),
    ("Extra Modes Main", "Hoops, Dropshot, Rumble, and Snow Day: the beautiful lab where Rocket League gets weird."),
    ("Casual MMR Goblin", "No title, no pressure, somehow still the sweatiest lobby of the week."),
    ("Training Pack Warrior", "A rank measured entirely in reset attempts and YouTube optimism."),
    ("F9 House Rank", "Somewhere between peak comms and 'my bad' with zero details."),
]

HITBOXES = [
    ("Octane", "Tall, forgiving, and readable. The Fennec shares this class, which is why half the lobby insists it 'just feels better.'"),
    ("Dominus", "Long and flat, built for booming clears, flicks, and looking cool while missing a soft touch."),
    ("Plank", "The Batmobile-adjacent menace: low, wide, and committed to weird-looking 50s."),
    ("Hybrid", "A middle path for players who cannot decide whether they are mechanical or practical."),
    ("Breakout", "Longer and lower than Octane; fun for air dribbles, terrifying for ground-control excuses."),
    ("Merc", "The tall-box chaos pick. If the ball hits it, nobody is totally sure what happens next."),
]

THROWBACK_FACTS = [
    "Rocket League's predecessor was Supersonic Acrobatic Rocket-Powered Battle-Cars, a title so long it basically needed boost management.",
    "Solo Standard used to be a ranked 3v3 playlist where everyone queued alone; somehow, yes, the community survived.",
    "Rocket Labs gave the game experimental arenas like Pillars and Underpass before the competitive pool became more standardized.",
    "Neo Tokyo and Wasteland both had non-standard versions before being rebuilt into more normal competitive layouts.",
    "The Season 3 World Championship is remembered in part because Turbopolsa won as a substitute for Northern Gaming.",
    "The jstn zero-second equalizer became one of Rocket League esports' defining clips and gave the scene its most quoted caster call.",
]

PROS = [
    {
        "name": "jstn.",
        "role": "zero-second legend",
        "clues": [
            "North American icon.",
            "His most famous clip forced overtime when the clock showed zero.",
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
            "Associated with the Gale Force/Dignitas era of Rocket League greatness.",
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
            "His arrival at the top level was treated like a before-and-after moment.",
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
    "Small boost pads give 12 boost, which means eight little pads and some courage can become a full tank.",
    "The second jump/dodge timer is short enough that hesitation turns planned aerials into accidental front flips.",
    "A fake challenge is basically emotional damage with car body language.",
    "Back-post rotation is not glamorous, which is why it quietly wins so many games.",
    "A low 50 can be more useful than a booming clear if your teammate is ready for the next touch.",
    "Boost starving works best when it is a plan, not just a hobby.",
]

MECHANIC_DRILLS = [
    ("Half-flip checkpoint", "Queue freeplay and do ten half-flips from a dead stop. The goal is not speed first; it is landing pointed where you intended."),
    ("Back-post honesty test", "In your next three games, call out every time you rotate front post by accident. Shame is temporary; saves are forever."),
    ("Small-pad route", "Cross the field using only small pads. If you hit zero boost, you have found tomorrow's warmup."),
    ("First-touch discipline", "For one casual game, every defensive touch must have a named target: corner, wall, teammate, or space."),
    ("Wall recovery chain", "After every aerial attempt, recover onto the nearest wall and wave/wall dash only if the landing is actually clean."),
    ("Low-50 reps", "In a private match, slow dribble into a bot or friend and try to deaden the ball instead of winning it loudly."),
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

COMMUNITY_PROMPTS = [
    "Tonight's F9 comms rule: every 'I got it' must be followed by what you are doing with it.",
    "Tonight's rotation challenge: the third man gets veto power over one teammate's terrible idea.",
    "Tonight's demo rule: demos are valid, but you must compliment the victim's recovery afterward.",
    "Tonight's kickoff law: call left, right, cheat, or fake before the countdown hits one.",
    "Tonight's replay review: clip one goal against where everyone thought someone else had it.",
]

NEWS_PROMPTS = [
    "Check the official RL Esports news page, then bring one headline into Discord as a watch-party prompt.",
    "Pick one current RLCS roster and ask the F9 crew what part of their style would actually survive in ranked 2s.",
    "Use the next RLCS headline as a scouting report: team speed, boost control, demos, or composure?",
    "Before the next watch party, assign one person to track demos and one person to track panic clears.",
]


def _link(href: str, label: str, class_name: str = "f9-btn") -> str:
    return (
        f'<a class="{class_name}" href="{escape(href, quote=True)}" '
        f'target="_blank" rel="noopener noreferrer">{escape(label)}</a>'
    )


def _chips(*labels: str) -> str:
    return '<div class="f9-chip-row">' + "".join(
        f'<span class="f9-chip">{escape(label)}</span>' for label in labels if label
    ) + "</div>"


def _shell(body: str, *chips: str) -> str:
    chip_html = _chips(*chips) if chips else ""
    return f'<div class="f9-card-shell">{body}{chip_html}</div>'


def _pick_daily(items, today: date, offset: int = 0):
    return items[(today.toordinal() + offset) % len(items)]


def _pick_weekly(items, today: date, offset: int = 0):
    week = today.isocalendar().week
    return items[(week + offset) % len(items)]


def _pick_monthly(items, today: date, offset: int = 0):
    return items[((today.year * 12) + today.month + offset) % len(items)]


def _render_tourney_card() -> CardItem:
    signup_url = F9_TOURNEY_URL.rstrip("/") if F9_TOURNEY_URL else F9_TOURNEY_REPO_URL
    roster_url = f"{F9_TOURNEY_URL.rstrip('/')}/roster.json" if F9_TOURNEY_URL else ""

    roster_panel = (
        '<div class="f9-live-roster" data-f9-roster-url="">'
        '<strong>Roster feed:</strong> add the deployed F9_TOURNEY_URL constant to enable live roster status here.'
        "</div>"
    )
    if roster_url:
        roster_panel = (
            f'<div class="f9-live-roster" data-f9-roster-url="{escape(roster_url, quote=True)}">'
            "<strong>Roster feed:</strong> checking signup status…"
            "</div>"
        )

    body = f"""
        <div class="f9-tourney-card">
            <p class="f9-story-text">Make the tournament impossible to miss: one card for the current F9 signup flow, roster visibility, and last-call reminders.</p>
            {_chips("2v2 signups", "Discord handle", "RL Tracker", "Region")}
            <div class="f9-action-row">
                {_link(signup_url, "Open signup hub")}
                {_link(F9_TOURNEY_REPO_URL, "F9 tourney repo", "f9-btn f9-btn--ghost")}
            </div>
            {roster_panel}
        </div>
    """
    return CardItem(
        card_type="f9_tourney",
        eyebrow="Tournament Command Center",
        title="F9 2v2 Signups",
        body=body,
        source_url=F9_TOURNEY_REPO_URL,
    )


def _render_news_card(today: date) -> CardItem:
    prompt = _pick_daily(NEWS_PROMPTS, today)
    body = _shell(
        f"""
        <p class="f9-story-text">{escape(prompt)}</p>
        <div class="f9-action-row">
            {_link(OFFICIAL_RL_ESPORTS_NEWS_URL, "Open RL Esports news")}
        </div>
        """,
        "daily news hook",
        "watch-party starter",
        "source-ready",
    )
    return CardItem(
        card_type="rlcs_watch",
        eyebrow="RLCS Watch Desk",
        title="Today’s Rocket League News Prompt",
        body=body,
        source_url=OFFICIAL_RL_ESPORTS_NEWS_URL,
    )


def _render_team_card(today: date) -> CardItem:
    team = _pick_weekly(RLCS_TEAMS, today)
    body = _shell(
        f"""
        <p class="f9-story-text"><strong>{escape(team["name"])}</strong> gets this week's F9 scouting slot: {escape(team["angle"])}</p>
        <p class="f9-story-text f9-muted-copy">{escape(team["prompt"])}</p>
        """,
        "team of the week",
        "weekly rotation",
        "watch-party angle",
    )
    return CardItem(
        card_type="rlcs_team",
        eyebrow="RLCS Team of the Week",
        title=team["name"],
        body=body,
        source_url=OFFICIAL_RL_ESPORTS_NEWS_URL,
    )


def _render_item_card(today: date) -> CardItem:
    item_name, item_note = _pick_daily(ITEMS_OF_THE_DAY, today, offset=3)
    body = _shell(
        f'<p class="f9-story-text">{escape(item_note)}</p>',
        "item of the day",
        "fashion meta",
    )
    return CardItem(
        card_type="rl_item",
        eyebrow="Garage Pick",
        title=item_name,
        body=body,
    )


def _render_arena_card(today: date) -> CardItem:
    arena_name, arena_note = _pick_daily(ARENAS, today, offset=8)
    body = _shell(
        f'<p class="f9-story-text">{escape(arena_note)}</p>',
        "map of the day",
        "arena read",
    )
    return CardItem(
        card_type="arena",
        eyebrow="Map of the Day",
        title=arena_name,
        body=body,
    )


def _render_rank_card(today: date) -> CardItem:
    rank_name, rank_note = _pick_monthly(RANKS_BY_MONTH, today)
    body = _shell(
        f'<p class="f9-story-text">{escape(rank_note)}</p>',
        "rank of the month",
        "community roast",
    )
    return CardItem(
        card_type="rank_rotation",
        eyebrow="Rank of the Month",
        title=rank_name,
        body=body,
    )


def _render_hitbox_card(today: date) -> CardItem:
    hitbox_name, hitbox_note = _pick_monthly(HITBOXES, today, offset=2)
    body = _shell(
        f'<p class="f9-story-text">{escape(hitbox_note)}</p>',
        "car hitbox",
        "monthly lab",
    )
    return CardItem(
        card_type="hitbox_lab",
        eyebrow="Car Hitbox of the Month",
        title=hitbox_name,
        body=body,
    )


def _render_throwback_card(today: date) -> CardItem:
    fact = _pick_weekly(THROWBACK_FACTS, today)
    body = _shell(
        f'<p class="f9-story-text">{escape(fact)}</p>',
        "throwback fact",
        "weekly lore",
    )
    return CardItem(
        card_type="throwback",
        eyebrow="Throwback Fact of the Week",
        title="Rocket League Lore Drop",
        body=body,
    )


def _render_pro_week_card(today: date) -> CardItem:
    pro = _pick_weekly(PROS, today, offset=3)
    body = _shell(
        f"""
        <p class="f9-story-text"><strong>{escape(pro["name"])}</strong> is this week's F9 pro spotlight: {escape(pro["role"])}.</p>
        <p class="f9-story-text f9-muted-copy">Discussion prompt: what is one thing this player is known for that normal ranked players could realistically copy?</p>
        """,
        "pro of the week",
        "weekly rotation",
    )
    return CardItem(
        card_type="pro_week",
        eyebrow="Pro of the Week",
        title=pro["name"],
        body=body,
    )


def _render_fun_fact_card(today: date) -> CardItem:
    fact = _pick_daily(FUN_FACTS, today, offset=13)
    body = _shell(
        f'<p class="f9-story-text">{escape(fact)}</p>',
        "fun fact",
        "daily filler",
    )
    return CardItem(
        card_type="fun_fact",
        eyebrow="Rocket League Fun Fact",
        title="Tiny Boost, Big Opinions",
        body=body,
    )


def _render_mechanic_card(today: date) -> CardItem:
    drill_name, drill_note = _pick_daily(MECHANIC_DRILLS, today, offset=21)
    body = _shell(
        f'<p class="f9-story-text">{escape(drill_note)}</p>',
        "warmup drill",
        "queue before ranked",
    )
    return CardItem(
        card_type="mechanic_drill",
        eyebrow="Daily Warmup",
        title=drill_name,
        body=body,
    )


def _render_guess_the_pro_card(today: date) -> CardItem:
    pro = _pick_daily(PROS, today, offset=34)
    clue_json = escape(json.dumps(pro["clues"], ensure_ascii=False), quote=True)
    body = f"""
        <div class="f9-guess-pro" data-f9-pro="{escape(pro["name"], quote=True)}" data-f9-clues="{clue_json}">
            <p class="f9-story-text">Use the clues one at a time. No Googling until somebody has made a bad guess with confidence.</p>
            <div class="f9-pro-clue">Clue 1: {escape(pro["clues"][0])}</div>
            <div class="f9-action-row">
                <button class="f9-btn" type="button" data-action="next-pro-clue">Next clue</button>
                <button class="f9-btn f9-btn--ghost" type="button" data-action="reveal-pro">Reveal pro</button>
            </div>
            <div class="f9-pro-answer" hidden>{escape(pro["name"])} — {escape(pro["role"])}</div>
        </div>
    """
    return CardItem(
        card_type="pro_guess",
        eyebrow="Mini Game",
        title="Guess the Pro",
        body=body,
    )


def _render_jiporady_card(today: date) -> CardItem:
    selected = _pick_weekly(JIPORADY_PACKS, today, offset=7)
    packs_payload = escape(json.dumps(JIPORADY_PACKS, ensure_ascii=False), quote=True)
    body = f"""
        <div class="f9-jiporady" data-f9-jiporady="{packs_payload}">
            <p class="f9-story-text">Two Rocket League Jiporady packs are ready to feature on F9 Daily: one mechanics-heavy, one lore-heavy.</p>
            <div class="f9-pack-name">{escape(selected["name"])}</div>
            <div class="f9-pack-tagline">{escape(selected["tagline"])}</div>
            <div class="f9-jeopardy-clue">
                <span>Sample clue</span>
                <strong>{escape(selected["sample_question"])}</strong>
                <em hidden>{escape(selected["sample_answer"])}</em>
            </div>
            <div class="f9-action-row">
                <button class="f9-btn" type="button" data-action="next-jiporady-pack">Switch pack</button>
                <button class="f9-btn f9-btn--ghost" type="button" data-action="reveal-jiporady-answer">Reveal sample answer</button>
                {_link(F9_JIPORADY_REPO_URL, "Open Jiporady source", "f9-btn f9-btn--ghost")}
            </div>
        </div>
    """
    return CardItem(
        card_type="rl_jeopardy",
        eyebrow="Rocket League Jiporady",
        title="Two Board Packs",
        body=body,
        source_url=F9_JIPORADY_REPO_URL,
    )


def _render_community_prompt_card(today: date) -> CardItem:
    prompt = _pick_daily(COMMUNITY_PROMPTS, today, offset=55)
    body = _shell(
        f'<p class="f9-story-text">{escape(prompt)}</p>',
        "F9 culture",
        "daily prompt",
    )
    return CardItem(
        card_type="community_playbook",
        eyebrow="Community Playbook",
        title="Tonight’s House Rule",
        body=body,
    )


def _extra_head_html() -> str:
    return """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet">
    """


def _extra_css() -> str:
    return r"""
    :root {
        --f9-bg: #081018;
        --f9-bg-deep: #050910;
        --f9-panel: rgba(255, 255, 255, 0.045);
        --f9-panel-strong: rgba(255, 255, 255, 0.07);
        --f9-line: rgba(255, 255, 255, 0.10);
        --f9-text: #f7f4ee;
        --f9-muted: #c9d3df;
        --f9-muted-2: #96a4b5;
        --f9-orange: #e15b3e;
        --f9-orange-hot: #ff8a3d;
        --f9-cyan: #59e0ff;
        --f9-teal: #2d8f8b;
        --f9-green: #7dff9b;
        --f9-gold: #e1b53e;
        --f9-radius: 24px;
        --f9-shadow: 0 24px 70px rgba(0, 0, 0, 0.38);
    }

    body {
        font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        color: var(--f9-text) !important;
        background:
            radial-gradient(circle at 10% 8%, rgba(45, 143, 139, 0.20), transparent 26rem),
            radial-gradient(circle at 86% 10%, rgba(225, 91, 62, 0.20), transparent 24rem),
            radial-gradient(circle at 72% 34%, rgba(89, 224, 255, 0.08), transparent 18rem),
            linear-gradient(180deg, var(--f9-bg) 0%, #0b111a 42%, var(--f9-bg-deep) 100%) !important;
        letter-spacing: -0.01em;
    }

    .site-bg {
        filter: saturate(1.08) brightness(0.50) contrast(1.08) !important;
        opacity: 0.78;
        mix-blend-mode: screen;
    }

    body::before {
        background: radial-gradient(circle, rgba(255, 138, 61, 0.20), transparent 70%) !important;
        opacity: 0.78 !important;
    }

    body::after {
        background: radial-gradient(circle, rgba(89, 224, 255, 0.16), transparent 70%) !important;
        opacity: 0.86 !important;
    }

    .hero-wrap {
        padding-top: 24px !important;
    }

    header.hero {
        min-height: 430px;
        padding: clamp(2.2rem, 5vw, 4.8rem) clamp(1.35rem, 5vw, 4.4rem) !important;
        border-radius: 34px !important;
        border: 1px solid rgba(255, 255, 255, 0.09) !important;
        background:
            linear-gradient(115deg, rgba(255, 138, 61, 0.16), transparent 28%),
            radial-gradient(circle at 84% 24%, rgba(89, 224, 255, 0.16), transparent 19rem),
            radial-gradient(circle at 74% 68%, rgba(125, 255, 155, 0.07), transparent 16rem),
            linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.018)),
            linear-gradient(155deg, rgba(9, 15, 24, 0.94), rgba(15, 24, 36, 0.90)) !important;
        box-shadow: var(--f9-shadow) !important;
    }

    header.hero::before {
        background:
            linear-gradient(110deg, transparent 22%, rgba(255,255,255,0.06) 46%, transparent 68%),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 2px, transparent 2px 7px),
            radial-gradient(circle at 12% 18%, rgba(255,138,61,0.18), transparent 18%) !important;
        opacity: 0.92 !important;
    }

    header.hero::after {
        content: "";
        position: absolute;
        right: clamp(1.2rem, 6vw, 5rem);
        bottom: 12%;
        width: min(32vw, 340px);
        aspect-ratio: 1;
        border-radius: 999px;
        border: 1px solid rgba(89, 224, 255, 0.20);
        box-shadow:
            0 0 0 24px rgba(89,224,255,0.035),
            0 0 0 58px rgba(255,138,61,0.025),
            0 0 80px rgba(89,224,255,0.14);
        background:
            radial-gradient(circle, rgba(255,255,255,0.08), transparent 56%),
            radial-gradient(circle at 58% 42%, rgba(255,138,61,0.20), transparent 22%);
        transform: rotate(-12deg);
        opacity: 0.94;
    }

    .hero-kicker,
    .hero h1,
    .hero .subtitle,
    .hero-meta {
        position: relative;
        z-index: 2;
    }

    .hero-kicker,
    .eyebrow {
        font-family: Rajdhani, Inter, sans-serif;
        letter-spacing: 0.16em !important;
    }

    .hero-kicker {
        color: var(--f9-green) !important;
        background: rgba(255,255,255,0.055) !important;
        border-color: rgba(125,255,155,0.16) !important;
        font-weight: 700 !important;
    }

    .hero h1 {
        max-width: 8ch !important;
        color: var(--f9-text) !important;
        font-family: Rajdhani, Inter, sans-serif !important;
        font-size: clamp(3.7rem, 9vw, 7.4rem) !important;
        line-height: 0.84 !important;
        letter-spacing: -0.055em !important;
        font-weight: 700 !important;
        text-shadow:
            0 0 26px rgba(255, 138, 61, 0.22),
            0 0 54px rgba(89, 224, 255, 0.10) !important;
    }

    .hero h1::after {
        content: "";
        display: block;
        width: min(190px, 56%);
        height: 7px;
        margin-top: 0.42rem;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--f9-orange-hot), var(--f9-cyan), var(--f9-green));
        box-shadow: 0 0 24px rgba(255, 138, 61, 0.32);
    }

    .hero .subtitle {
        max-width: 660px !important;
        color: var(--f9-muted) !important;
        font-size: clamp(1.02rem, 1.35vw, 1.15rem) !important;
        line-height: 1.74 !important;
    }

    .f9-hero-copy {
        display: grid;
        gap: 1rem;
    }

    .f9-hero-logo {
        width: min(132px, 36vw);
        height: auto;
        filter: drop-shadow(0 12px 30px rgba(0,0,0,0.62));
    }

    .f9-hero-copy p {
        margin: 0;
    }

    .f9-hero-rhythm {
        width: fit-content;
        padding: 0.54rem 0.82rem;
        border: 1px solid rgba(255,255,255,0.11);
        border-radius: 999px;
        background: rgba(255,255,255,0.055);
        color: var(--f9-text);
    }

    .f9-hero-rhythm strong {
        color: var(--f9-green);
    }

    .hero-pill {
        color: var(--f9-text) !important;
        background: rgba(255,255,255,0.055) !important;
        border-color: rgba(255,255,255,0.10) !important;
        box-shadow: 0 12px 30px rgba(0,0,0,0.20);
    }

    main {
        padding-top: 26px !important;
        gap: 20px !important;
    }

    .card {
        min-height: 238px;
        border-radius: var(--f9-radius) !important;
        border-color: rgba(255,255,255,0.09) !important;
        background:
            radial-gradient(circle at top right, rgba(89,224,255,0.08), transparent 32%),
            linear-gradient(180deg, rgba(255,255,255,0.058), rgba(255,255,255,0.025)),
            rgba(9, 14, 22, 0.78) !important;
        box-shadow:
            0 18px 48px rgba(0,0,0,0.26),
            inset 0 1px 0 rgba(255,255,255,0.04) !important;
    }

    .card:hover {
        transform: translateY(-3px) !important;
        border-color: rgba(255, 138, 61, 0.34) !important;
        box-shadow: 0 22px 54px rgba(0,0,0,0.33) !important;
    }

    .card::after {
        height: 6px !important;
        background: var(--f9-card-accent, linear-gradient(90deg, var(--f9-orange-hot), var(--f9-cyan), var(--f9-green))) !important;
    }

    .card-head {
        padding-bottom: 0.72rem;
        border-bottom: 1px solid rgba(255,255,255,0.075);
    }

    .eyebrow {
        color: var(--f9-green) !important;
        font-size: 0.76rem !important;
        font-weight: 700 !important;
    }

    .icon-badge {
        background: rgba(255,255,255,0.055) !important;
        border-color: rgba(255,255,255,0.10) !important;
        color: var(--f9-cyan);
    }

    h2 {
        font-family: Rajdhani, Inter, sans-serif !important;
        font-size: clamp(1.36rem, 2.3vw, 1.9rem) !important;
        letter-spacing: -0.025em !important;
        color: var(--f9-text);
    }

    .body {
        color: var(--f9-muted) !important;
    }

    .body strong {
        color: var(--f9-text) !important;
    }

    a {
        color: #ffaf9e !important;
    }

    .card--f9_tourney { --f9-card-accent: linear-gradient(90deg, var(--f9-orange-hot), var(--f9-orange)); grid-column: span 7; }
    .card--rlcs_watch { --f9-card-accent: linear-gradient(90deg, var(--f9-cyan), var(--f9-green)); grid-column: span 5; }
    .card--pro_guess { --f9-card-accent: linear-gradient(90deg, var(--f9-gold), var(--f9-orange-hot)); grid-column: span 5; }
    .card--rl_jeopardy { --f9-card-accent: linear-gradient(90deg, #6d5cff, var(--f9-cyan)); grid-column: span 7; }
    .card--rlcs_team,
    .card--hitbox_lab,
    .card--rank_rotation,
    .card--pro_week { grid-column: span 6; }
    .card--rl_item,
    .card--arena,
    .card--throwback,
    .card--fun_fact,
    .card--mechanic_drill,
    .card--community_playbook { grid-column: span 4; }

    .f9-card-shell,
    .f9-tourney-card,
    .f9-guess-pro,
    .f9-jiporady {
        display: grid;
        gap: 0.9rem;
    }

    .f9-story-text {
        margin: 0;
        color: var(--f9-muted);
        line-height: 1.72;
    }

    .f9-muted-copy {
        color: var(--f9-muted-2);
    }

    .f9-chip-row,
    .f9-action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
    }

    .f9-chip {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 0.74rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.09);
        color: var(--f9-text);
        font-size: 0.77rem;
        font-weight: 750;
        letter-spacing: 0.03em;
    }

    .f9-btn {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 0.95rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 138, 61, 0.30);
        background: linear-gradient(135deg, var(--f9-orange-hot), var(--f9-orange));
        color: #100f0e !important;
        font: inherit;
        font-weight: 850;
        letter-spacing: 0.02em;
        cursor: pointer;
        text-decoration: none;
        transition: transform 0.16s ease, filter 0.16s ease, border-color 0.16s ease;
    }

    .f9-btn:hover {
        transform: translateY(-1px);
        filter: brightness(1.08);
        text-decoration: none !important;
    }

    .f9-btn--ghost {
        color: var(--f9-text) !important;
        background: rgba(255,255,255,0.045);
        border-color: rgba(255,255,255,0.11);
    }

    .f9-live-roster,
    .f9-pro-clue,
    .f9-pro-answer,
    .f9-jeopardy-clue,
    .f9-pack-name,
    .f9-pack-tagline {
        padding: 0.85rem 0.95rem;
        border-radius: 18px;
        background: rgba(255,255,255,0.055);
        border: 1px solid rgba(255,255,255,0.09);
    }

    .f9-live-roster {
        color: var(--f9-muted);
    }

    .f9-live-roster strong,
    .f9-pack-name {
        color: var(--f9-text);
    }

    .f9-pro-clue,
    .f9-pro-answer {
        color: var(--f9-text);
        font-weight: 700;
    }

    .f9-pack-name {
        font-family: Rajdhani, Inter, sans-serif;
        font-size: 1.28rem;
        font-weight: 700;
    }

    .f9-pack-tagline {
        color: var(--f9-muted);
    }

    .f9-jeopardy-clue {
        display: grid;
        gap: 0.45rem;
        color: var(--f9-muted);
    }

    .f9-jeopardy-clue span {
        color: var(--f9-green);
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 0.72rem;
        font-weight: 800;
    }

    .f9-jeopardy-clue strong,
    .f9-jeopardy-clue em {
        color: var(--f9-text);
        font-style: normal;
    }

    footer .footer-inner {
        color: var(--f9-muted-2) !important;
        background: rgba(255,255,255,0.035) !important;
        border-color: rgba(255,255,255,0.08) !important;
    }

    @media (max-width: 980px) {
        .card--f9_tourney,
        .card--rlcs_watch,
        .card--pro_guess,
        .card--rl_jeopardy,
        .card--rlcs_team,
        .card--hitbox_lab,
        .card--rank_rotation,
        .card--pro_week,
        .card--rl_item,
        .card--arena,
        .card--throwback,
        .card--fun_fact,
        .card--mechanic_drill,
        .card--community_playbook {
            grid-column: span 6;
        }
    }

    @media (max-width: 720px) {
        header.hero {
            min-height: unset;
        }

        header.hero::after {
            opacity: 0.22;
            right: -90px;
            width: 260px;
        }

        .hero h1 {
            max-width: none !important;
        }

        .f9-hero-logo {
            width: 108px;
        }

        .card--f9_tourney,
        .card--rlcs_watch,
        .card--pro_guess,
        .card--rl_jeopardy,
        .card--rlcs_team,
        .card--hitbox_lab,
        .card--rank_rotation,
        .card--pro_week,
        .card--rl_item,
        .card--arena,
        .card--throwback,
        .card--fun_fact,
        .card--mechanic_drill,
        .card--community_playbook {
            grid-column: auto;
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
                    root.innerHTML = `<strong>Roster feed:</strong> ${entries.length} registered • signups ${status}`;
                })
                .catch(() => {
                    root.innerHTML = "<strong>Roster feed:</strong> signup app found, but roster status could not be loaded.";
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
            const clueEl = root.querySelector(".f9-pro-clue");
            const answerEl = root.querySelector(".f9-pro-answer");
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
            const clueEl = root.querySelector(".f9-jeopardy-clue strong");
            const answerEl = root.querySelector(".f9-jeopardy-clue em");
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

    cards: list[CardItem] = [
        _render_tourney_card(),
        _render_news_card(today),
        _render_team_card(today),
        _render_guess_the_pro_card(today),
        _render_jiporady_card(today),
        _render_item_card(today),
        _render_arena_card(today),
        _render_rank_card(today),
        _render_hitbox_card(today),
        _render_pro_week_card(today),
        _render_throwback_card(today),
        _render_fun_fact_card(today),
        _render_mechanic_card(today),
        _render_community_prompt_card(today),
    ]

    pinned = cards[:5]
    rotating = cards[5:]
    rng.shuffle(rotating)
    cards = pinned + rotating

    background = BACKGROUNDS[today.isocalendar().week % len(BACKGROUNDS)] if BACKGROUNDS else None

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
            "background": background,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker"),
            "hero_summary_pill": THEME_CONFIG.get("hero_summary_pill"),
            "extra_css": _extra_css(),
            "extra_js": _extra_js(),
            "extra_head_html": _extra_head_html(),
        },
    )
