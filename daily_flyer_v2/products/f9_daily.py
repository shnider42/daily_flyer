from __future__ import annotations

import random

from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience, FlyerItem


F9_TOURNEY_REPO_URL = "https://github.com/shnider42/f9-tourney"
F9_JIPORADY_REPO_URL = "https://github.com/shnider42/jiporady/blob/master/promptardy/app_rocket.py"
F9_LOGO_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/f9_logo.png"
F9_STADIUM_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/stadium.jpg"

# Set this after the tournament signup app is deployed. The renderer will use
# /roster.json from this base URL when present.
F9_TOURNEY_URL = ""

RL_ESPORTS_NEWS_URL = "https://esports.rocketleague.com/news"


GARAGE_ITEMS = [
    ("Cristiano wheels", "Readable, clean, and impossible to blame for a missed open net."),
    ("Titanium White Zomba", "The classic flex. Use only if the post-game apology is also premium."),
    ("Standard boost", "Low visual noise. High teammate appreciation."),
    ("Big Splash", "For goals that deserved cinema, or at least a laugh in Discord."),
    ("Dueling Dragons", "Overqualified goal explosion for suspicious ranked goals."),
    ("Octane Huntress", "A tidy decal for pretending the awkward 50 was intentional."),
]

ARENA_NOTES = [
    ("DFH Stadium", "Baseline Rocket League. If the bounce is weird, it was probably you."),
    ("Mannfield", "Comfort map. Honest walls, dishonest boost steals."),
    ("Champions Field", "Everything feels official, including the own-goal review."),
    ("Neo Tokyo", "Neon recovery lab. Mistakes look faster here."),
    ("Forbidden Temple", "Good sightlines, great place to remember back post exists."),
    ("Wasteland", "The map name announces the vibe before kickoff."),
]

WARMUPS = [
    ("Half-flip checkpoint", "Ten clean half-flips from dead stop. Speed only counts after clean landings."),
    ("Small-pad route", "Cross the field using only small pads. Running dry means tomorrow has a drill."),
    ("First-touch callout", "Before every defensive touch, say the target: wall, corner, teammate, or space."),
    ("Back-post honesty", "Track accidental front-post rotations for three games. No trial, just evidence."),
    ("Low-50 reps", "Slow dribble into pressure and kill the ball instead of winning it loudly."),
    ("Recovery chain", "After each aerial, land wheels-first on wall or ground before another touch."),
]

HOUSE_RULES = [
    "Every 'I got it' needs the follow-up: clear, pass, fake, shot, or time.",
    "Third man gets veto power over one chaotic idea per game.",
    "Demos are valid, but the victim gets a compliment if the recovery is clean.",
    "Kickoff plan must be called before the countdown hits one.",
    "Clip one conceded goal where everyone thought someone else had it.",
    "No blaming boost unless the replay confirms the crime.",
]

WATCH_PROMPTS = [
    "Open the latest RL Esports headline and turn it into one Discord question.",
    "Pick a pro team and ask which habit would actually survive in F9 ranked 2s.",
    "During the next watch party, assign one person to track panic clears.",
    "Watch one series for second-man spacing instead of only highlight mechanics.",
    "Choose one RLCS play and translate it into a ranked-friendly version.",
]

FUN_FACTS = [
    "Small boost pads give 12 boost. Eight pads plus discipline is almost a full tank.",
    "A fake challenge is emotional damage delivered through car body language.",
    "Back-post rotation is boring until the free save appears.",
    "Boost starving works best when it is a plan, not a personality trait.",
    "A low 50 can be more useful than a booming clear if your teammate is ready.",
    "The cleanest touch is often the one that makes the next touch easier.",
]

PRO_GUESSES = [
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


def _pick(items, ordinal: int, offset: int = 0):
    return items[(ordinal + offset) % len(items)]


def _build_tournament_url() -> str:
    return F9_TOURNEY_URL.rstrip("/") if F9_TOURNEY_URL else F9_TOURNEY_REPO_URL


def build(context: FlyerContext) -> FlyerExperience:
    selected = context.selected_date
    ordinal = selected.toordinal()
    rng = random.Random(context.seed)

    garage_name, garage_body = _pick(GARAGE_ITEMS, ordinal, 2)
    arena_name, arena_body = _pick(ARENA_NOTES, ordinal, 7)
    warmup_name, warmup_body = _pick(WARMUPS, ordinal, 11)
    pro = _pick(PRO_GUESSES, ordinal, 17)
    jiporady = _pick(JIPORADY_PACKS, selected.isocalendar().week)
    boost = 33 + (ordinal % 68)

    lead = FlyerItem(
        kind="match_lobby",
        label="Tonight's lobby",
        title="Queue the flyer like a match.",
        body=(
            "A Rocket League community dashboard for F9: tournament signup, warmup plan, "
            "watch prompt, garage pick, Guess the Pro, and Jiporady."
        ),
        data={
            "boost": boost,
            "kickoff_call": rng.choice(["LEFT GOES", "CHEAT UP", "FAKE?", "BACK LEFT", "NO DOUBLE COMMIT"]),
            "playlist": rng.choice(["2v2", "Private Match", "Replay Review", "RLCS Watch", "Freeplay Lab"]),
        },
    )

    sections = [
        FlyerItem(
            kind="tournament",
            label="Queue desk",
            title="F9 2v2 signup hub",
            body="Signup fields stay simple: display name, Discord, RL Tracker link, and region.",
            url=_build_tournament_url(),
            data={
                "repo_url": F9_TOURNEY_REPO_URL,
                "roster_url": f"{F9_TOURNEY_URL.rstrip('/')}/roster.json" if F9_TOURNEY_URL else "",
                "chips": ["2v2", "RL Tracker", "Discord", "Region"],
            },
        ),
        FlyerItem(
            kind="watch",
            label="RLCS watch prompt",
            title="Bring one headline into Discord",
            body=_pick(WATCH_PROMPTS, ordinal, 3),
            url=RL_ESPORTS_NEWS_URL,
            data={"chips": ["source-ready", "watch party"]},
        ),
        FlyerItem(
            kind="garage",
            label="Garage pick",
            title=garage_name,
            body=garage_body,
            data={"chips": ["daily", "cosmetic"]},
        ),
        FlyerItem(
            kind="arena",
            label="Arena read",
            title=arena_name,
            body=arena_body,
            data={"chips": ["map feel", "rotation"]},
        ),
        FlyerItem(
            kind="warmup",
            label="Warmup drill",
            title=warmup_name,
            body=warmup_body,
            data={"chips": ["freeplay", "before ranked"]},
        ),
        FlyerItem(
            kind="house_rule",
            label="House rule",
            title="Tonight's comms rule",
            body=_pick(HOUSE_RULES, ordinal, 23),
            data={"chips": ["Discord", "ranked hygiene"]},
        ),
        FlyerItem(
            kind="fun_fact",
            label="Tiny boost, big opinion",
            title="Quick Rocket League fact",
            body=_pick(FUN_FACTS, ordinal, 31),
            data={"chips": ["quick read", "daily"]},
        ),
    ]

    actions = [
        FlyerItem(
            kind="guess_pro",
            label="Mini game",
            title="Guess the Pro",
            body="Reveal clues one at a time. Confident wrong answers count as content.",
            data=pro,
        ),
        FlyerItem(
            kind="jiporady",
            label="Party board",
            title="Rocket League Jiporady",
            body=jiporady["tagline"],
            url=F9_JIPORADY_REPO_URL,
            data={
                "active_pack": jiporady,
                "packs": JIPORADY_PACKS,
            },
        ),
    ]

    return FlyerExperience(
        product="f9_daily",
        layout="f9_arena",
        title="F9 Daily",
        subtitle="Rocket League community dashboard, not a repainted newspaper.",
        date_label=selected.strftime("%A • %B %d, %Y"),
        lead=lead,
        sections=sections,
        actions=actions,
        footer="F9 Daily • Flyer Engine v2 product + dedicated arena renderer",
        data={
            "logo_url": F9_LOGO_URL,
            "stadium_url": F9_STADIUM_URL,
            "tournament_url": _build_tournament_url(),
            "tournament_repo_url": F9_TOURNEY_REPO_URL,
            "jiporady_repo_url": F9_JIPORADY_REPO_URL,
            "rl_esports_news_url": RL_ESPORTS_NEWS_URL,
            "roster_url": f"{F9_TOURNEY_URL.rstrip('/')}/roster.json" if F9_TOURNEY_URL else "",
            "lanes": [
                {"label": "Queue", "value": "Signup hub"},
                {"label": "Warmup", "value": warmup_name},
                {"label": "Watch", "value": "RLCS prompt"},
                {"label": "Games", "value": "Pro + Jiporady"},
            ],
        },
    )
