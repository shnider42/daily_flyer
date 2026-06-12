from __future__ import annotations

import random

from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience, FlyerItem

F9_TOURNEY_REPO_URL = "https://github.com/shnider42/f9-tourney"
F9_JIPORADY_REPO_URL = "https://github.com/shnider42/jiporady/blob/master/promptardy/app_rocket.py"
F9_LOGO_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/f9_logo.png"
F9_STADIUM_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/stadium.jpg"
F9_TOURNEY_URL = ""
RL_ESPORTS_NEWS_URL = "https://esports.rocketleague.com/news"

GARAGE_ITEMS = [
    ("Cristiano wheels", "Readable, clean, and impossible to blame for a missed open net."),
    ("Titanium White Zomba", "The classic flex. Use only if the post-game apology is also premium."),
    ("Standard boost", "Low visual noise. High teammate appreciation."),
    ("Big Splash", "For goals that deserved cinema, or at least a laugh in Discord."),
    ("Dueling Dragons", "Overqualified goal explosion for suspicious ranked goals."),
]

ARENAS = [
    ("DFH Stadium", "Baseline Rocket League. If the bounce is weird, it was probably you."),
    ("Mannfield", "Comfort map. Honest walls, dishonest boost steals."),
    ("Champions Field", "Everything feels official, including the own-goal review."),
    ("Neo Tokyo", "Neon recovery lab. Mistakes look faster here."),
]

WARMUPS = [
    ("Half-flip checkpoint", "Ten clean half-flips from dead stop. Speed only counts after clean landings."),
    ("Small-pad route", "Cross the field using only small pads. Running dry means tomorrow has a drill."),
    ("First-touch callout", "Before every defensive touch, say the target: wall, corner, teammate, or space."),
    ("Back-post honesty", "Track accidental front-post rotations for three games. No trial, just evidence."),
]

HOUSE_RULES = [
    "Every 'I got it' needs the follow-up: clear, pass, fake, shot, or time.",
    "Third man gets veto power over one chaotic idea per game.",
    "Demos are valid, but the victim gets a compliment if the recovery is clean.",
    "Kickoff plan must be called before the countdown hits one.",
]

WATCH_PROMPTS = [
    "Open the latest RL Esports headline and turn it into one Discord question.",
    "Pick a pro team and ask which habit would actually survive in F9 ranked 2s.",
    "During the next watch party, assign one person to track panic clears.",
    "Watch one series for second-man spacing instead of only highlight mechanics.",
]

PRO_GUESSES = [
    {"name": "jstn.", "role": "zero-second legend", "clues": ["North American icon.", "His most famous clip forced overtime with no time left.", "The caster call became Rocket League shorthand forever."]},
    {"name": "Turbopolsa", "role": "championship collector", "clues": ["European legend.", "Famously won a world title as a substitute.", "Often brought up in all-time-great debates because of the trophy count."]},
    {"name": "SquishyMuffinz", "role": "ceiling-shot icon", "clues": ["Canadian world champion.", "Helped make ceiling shots feel mainstream.", "Part of the Cloud9 roster fans still talk about."]},
    {"name": "Zen", "role": "mechanical phenom", "clues": ["French prodigy.", "Known for ridiculous control and confidence.", "His arrival felt like a before-and-after moment."]},
]

JIPORADY_PACKS = [
    {"name": "Mechanics & Game Sense", "tagline": "Recoveries, kickoffs, boost math, freestyle terms, and ranked brain.", "sample_question": "This recovery mechanic uses a backflip cancel plus air roll to reverse direction much faster than turning around normally.", "sample_answer": "What is a half-flip?"},
    {"name": "RLCS Lore & Deep Cuts", "tagline": "Arena archaeology, esport lore, named mechanics, hitboxes, and retired playlists.", "sample_question": "This caster delivered the immortal call after jstn's zero-second equalizer.", "sample_answer": "Who is Shogun?"},
]


def _pick(items, ordinal: int, offset: int = 0):
    return items[(ordinal + offset) % len(items)]


def _tournament_url() -> str:
    return F9_TOURNEY_URL.rstrip("/") if F9_TOURNEY_URL else F9_TOURNEY_REPO_URL


def build(context: FlyerContext) -> FlyerExperience:
    selected = context.selected_date
    ordinal = selected.toordinal()
    rng = random.Random(context.seed)

    garage_name, garage_body = _pick(GARAGE_ITEMS, ordinal, 2)
    arena_name, arena_body = _pick(ARENAS, ordinal, 7)
    warmup_name, warmup_body = _pick(WARMUPS, ordinal, 11)
    pro = _pick(PRO_GUESSES, ordinal, 17)
    jiporady = _pick(JIPORADY_PACKS, selected.isocalendar().week)

    lead = FlyerItem(
        kind="match_lobby",
        label="Tonight's lobby",
        title="Queue the flyer like a match.",
        body="A Rocket League community dashboard for F9: tournament signup, warmup plan, watch prompt, garage pick, Guess the Pro, and Jiporady.",
        data={
            "boost": 33 + (ordinal % 68),
            "kickoff_call": rng.choice(["LEFT GOES", "CHEAT UP", "FAKE?", "BACK LEFT", "NO DOUBLE COMMIT"]),
            "playlist": rng.choice(["2v2", "Private Match", "Replay Review", "RLCS Watch", "Freeplay Lab"]),
        },
    )

    sections = [
        FlyerItem("tournament", "F9 2v2 signup hub", "Signup fields stay simple: display name, Discord, RL Tracker link, and region.", "Queue desk", _tournament_url(), data={"repo_url": F9_TOURNEY_REPO_URL, "roster_url": f"{F9_TOURNEY_URL.rstrip('/')}/roster.json" if F9_TOURNEY_URL else "", "chips": ["2v2", "RL Tracker", "Discord", "Region"]}),
        FlyerItem("watch", "Bring one headline into Discord", _pick(WATCH_PROMPTS, ordinal, 3), "RLCS watch prompt", RL_ESPORTS_NEWS_URL, data={"chips": ["source-ready", "watch party"]}),
        FlyerItem("garage", garage_name, garage_body, "Garage pick", data={"chips": ["daily", "cosmetic"]}),
        FlyerItem("arena", arena_name, arena_body, "Arena read", data={"chips": ["map feel", "rotation"]}),
        FlyerItem("warmup", warmup_name, warmup_body, "Warmup drill", data={"chips": ["freeplay", "before ranked"]}),
        FlyerItem("house_rule", "Tonight's comms rule", _pick(HOUSE_RULES, ordinal, 23), "House rule", data={"chips": ["Discord", "ranked hygiene"]}),
    ]

    actions = [
        FlyerItem("guess_pro", "Guess the Pro", "Reveal clues one at a time. Confident wrong answers count as content.", "Mini game", data=pro),
        FlyerItem("jiporady", "Rocket League Jiporady", jiporady["tagline"], "Party board", F9_JIPORADY_REPO_URL, data={"active_pack": jiporady, "packs": JIPORADY_PACKS}),
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
            "tournament_url": _tournament_url(),
            "jiporady_repo_url": F9_JIPORADY_REPO_URL,
            "rl_esports_news_url": RL_ESPORTS_NEWS_URL,
            "lanes": [
                {"label": "Queue", "value": "Signup hub"},
                {"label": "Warmup", "value": warmup_name},
                {"label": "Watch", "value": "RLCS prompt"},
                {"label": "Games", "value": "Pro + Jiporady"},
            ],
        },
    )
