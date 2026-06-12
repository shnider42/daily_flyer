from __future__ import annotations

import os
import random

from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience, FlyerItem

F9_LOGO_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/f9_logo.png"
F9_STADIUM_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/stadium.jpg"
F9_TOURNEY_URL = os.environ.get("F9_TOURNEY_URL", "").strip()
F9_SIGNUP_ENABLED = os.environ.get("F9_SIGNUP_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
F9_JIPORADY_URL = os.environ.get("F9_JIPORADY_URL", "").strip()
F9_DISCORD_URL = os.environ.get("F9_DISCORD_URL", "").strip()
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

RLCS_DAILY_PROS = [
    {"name": "jstn.", "role": "zero-second legend", "clues": ["North American icon.", "His most famous clip forced overtime with no time left.", "The caster call became Rocket League shorthand forever."]},
    {"name": "Turbopolsa", "role": "championship collector", "clues": ["European legend.", "Won a world title as a substitute.", "Often brought up in all-time-great debates because of the trophy count."]},
    {"name": "Kaydop", "role": "finals machine", "clues": ["French legend.", "A central name in old European dominance.", "Associated with the Gale Force and Dignitas dynasty era."]},
    {"name": "GarrettG", "role": "NA mainstay", "clues": ["North American veteran.", "Known for longevity at the top.", "A long-running face of NRG Rocket League."]},
    {"name": "SquishyMuffinz", "role": "ceiling-shot icon", "clues": ["Canadian world champion.", "Helped make ceiling shots feel mainstream.", "Part of the Cloud9 roster fans still talk about."]},
    {"name": "Zen", "role": "mechanical phenom", "clues": ["French prodigy.", "Known for ridiculous control and confidence.", "His arrival felt like a before-and-after moment."]},
    {"name": "Joyo", "role": "mechanics with personality", "clues": ["English pro.", "Known for creativity, flair, and mechanics.", "Broke out in the Team Queso and Moist era."]},
    {"name": "Vatira", "role": "pressure monster", "clues": ["French superstar.", "Known for elite defense and intensity.", "A central figure in the modern European era."]},
    {"name": "M0nkey M00n", "role": "efficiency king", "clues": ["French world-class player.", "Known for efficient touches and control.", "Strongly associated with Team BDS."]},
    {"name": "Firstkiller", "role": "NA mechanical threat", "clues": ["North American star.", "Known for speed and solo-play danger.", "His name sounds like a scoreboard warning."]},
    {"name": "ApparentlyJack", "role": "smart 1s-to-3s brain", "clues": ["English pro.", "Known for intelligent play and strong 1v1 roots.", "His handle reads like a sentence fragment."]},
    {"name": "Chicago", "role": "G2 veteran", "clues": ["North American veteran.", "Known for a long run with G2.", "His name is also a major US city."]},
    {"name": "Kronovi", "role": "original icon", "clues": ["One of Rocket League's earliest stars.", "Part of the original world champion roster.", "Often called one of the first faces of competitive Rocket League."]},
    {"name": "Fairy Peak!", "role": "1v1 legend", "clues": ["French legend.", "Famous for 1v1 dominance and Vitality history.", "His name ends with punctuation."]},
    {"name": "ViolentPanda", "role": "Dignitas dynasty captain", "clues": ["Dutch veteran.", "A key part of the Gale Force and Dignitas dynasty.", "His name combines aggression with an animal."]},
    {"name": "Daniel", "role": "NA prodigy", "clues": ["North American mechanical star.", "Entered the pro scene with huge expectations.", "Known for solo control and high ceiling plays."]},
]

JIPORADY_BOARD = [
    {"category": "RLCS Lore", "clues": [{"value": 100, "question": "RLCS stands for this.", "answer": "Rocket League Championship Series"}, {"value": 200, "question": "This original world champion team won RLCS Season 1.", "answer": "iBUYPOWER Cosmic"}, {"value": 300, "question": "This player substituted for Northern Gaming at the Season 3 World Championship and won the title.", "answer": "Turbopolsa"}]},
    {"category": "Mechanics", "clues": [{"value": 100, "question": "This recovery mechanic uses a backflip cancel plus air roll to reverse direction quickly.", "answer": "Half-flip"}, {"value": 200, "question": "This shot starts from the ceiling so the player can fall with a saved dodge.", "answer": "Ceiling shot"}, {"value": 300, "question": "This mechanic restores a dodge by landing all four wheels on the ball midair.", "answer": "Flip reset"}]},
    {"category": "Game Sense", "clues": [{"value": 100, "question": "In 3v3, this player is the safety valve and cannot usually afford the riskiest challenge.", "answer": "Third man"}, {"value": 200, "question": "This defensive technique means mirroring the attacker between ball and net instead of diving in.", "answer": "Shadow defense"}, {"value": 300, "question": "Repeatedly taking opponent corner and midfield pads to limit options is called this.", "answer": "Boost starving"}]},
    {"category": "Car Meta", "clues": [{"value": 100, "question": "The Fennec shares this hitbox class with the Octane.", "answer": "Octane hitbox"}, {"value": 200, "question": "The 2016 Batmobile is most closely associated with this long, flat hitbox class.", "answer": "Plank hitbox"}, {"value": 300, "question": "This hitbox class is shared by the Dominus and several muscle-car-style bodies.", "answer": "Dominus hitbox"}]},
]


def _pick(items, ordinal: int, offset: int = 0):
    return items[(ordinal + offset) % len(items)]


def _rlcs_daily_payload(ordinal: int, rng: random.Random) -> dict:
    answer = _pick(RLCS_DAILY_PROS, ordinal, 17)
    decoys = [pro["name"] for pro in RLCS_DAILY_PROS if pro["name"] != answer["name"]]
    options = rng.sample(decoys, k=3) + [answer["name"]]
    rng.shuffle(options)
    return {"answer": answer["name"], "role": answer["role"], "clues": answer["clues"], "options": options, "pool_size": len(RLCS_DAILY_PROS)}


def _tournament_url() -> str:
    return F9_TOURNEY_URL.rstrip("/") if F9_TOURNEY_URL else ""


def build(context: FlyerContext) -> FlyerExperience:
    selected = context.selected_date
    ordinal = selected.toordinal()
    rng = random.Random(context.seed)

    garage_name, garage_body = _pick(GARAGE_ITEMS, ordinal, 2)
    arena_name, arena_body = _pick(ARENAS, ordinal, 7)
    warmup_name, warmup_body = _pick(WARMUPS, ordinal, 11)
    jiporady = JIPORADY_BOARD[selected.isocalendar().week % len(JIPORADY_BOARD)]

    lead = FlyerItem(
        kind="match_lobby",
        label="F9 match control",
        title="Queue, warm up, watch, and play from one place.",
        body="A Rocket League community hub for F9: warmup plan, watch prompt, garage pick, RLCS Daily, and Jiporady.",
        data={"boost": 33 + (ordinal % 68), "kickoff_call": rng.choice(["LEFT GOES", "CHEAT UP", "FAKE?", "BACK LEFT", "NO DOUBLE COMMIT"]), "playlist": rng.choice(["2v2", "Private Match", "Replay Review", "RLCS Watch", "Freeplay Lab"])},
    )

    sections = []
    if F9_SIGNUP_ENABLED and _tournament_url():
        sections.append(FlyerItem("tournament", "F9 2v2 signup hub", "Signup fields stay simple: display name, Discord, RL Tracker link, and region.", "Queue desk", _tournament_url(), data={"roster_url": f"{_tournament_url()}/roster.json", "chips": ["2v2", "RL Tracker", "Discord", "Region"]}))

    sections.extend([
        FlyerItem("watch", "Bring one headline into Discord", _pick(WATCH_PROMPTS, ordinal, 3), "RLCS watch prompt", RL_ESPORTS_NEWS_URL, data={"chips": ["source-ready", "watch party"]}),
        FlyerItem("garage", garage_name, garage_body, "Garage pick", data={"chips": ["daily", "cosmetic"]}),
        FlyerItem("arena", arena_name, arena_body, "Arena read", data={"chips": ["weekly", "map feel", "rotation"]}),
        FlyerItem("warmup", warmup_name, warmup_body, "Warmup drill", data={"chips": ["daily", "freeplay", "before ranked"]}),
        FlyerItem("house_rule", "Tonight's comms rule", _pick(HOUSE_RULES, ordinal, 23), "House rule", data={"chips": ["daily", "Discord", "ranked hygiene"]}),
    ])

    actions = [
        FlyerItem("rlcs_daily", "RLCS Daily", "Guess today's pro from clues. One answer, four choices, and a deeper pro pool than the first prototype.", "Daily mini-game", data=_rlcs_daily_payload(ordinal, rng)),
        FlyerItem("jiporady", "Rocket League Jiporady", "Embedded Rocket League Jiporady board pulled into the Hub experience instead of sending people to a source repo.", "Party board", F9_JIPORADY_URL or None, data={"active_category": jiporady, "board": JIPORADY_BOARD}),
    ]

    lanes = [
        {"label": "Warmup", "value": warmup_name},
        {"label": "Watch", "value": "RLCS prompt"},
        {"label": "Garage", "value": garage_name},
        {"label": "Games", "value": "RLCS + Jiporady"},
    ]
    if F9_SIGNUP_ENABLED and _tournament_url():
        lanes.insert(0, {"label": "Queue", "value": "Signup hub"})

    return FlyerExperience(
        product="f9_daily",
        layout="f9_arena",
        title="F9 Hub",
        subtitle="Rocket League community control center for F9.",
        date_label=selected.strftime("%A • %B %d, %Y"),
        lead=lead,
        sections=sections,
        actions=actions,
        footer="F9 Hub • Flyer Engine v2 product + dedicated arena renderer",
        data={"logo_url": F9_LOGO_URL, "stadium_url": F9_STADIUM_URL, "signup_enabled": F9_SIGNUP_ENABLED and bool(_tournament_url()), "tournament_url": _tournament_url(), "jiporady_url": F9_JIPORADY_URL, "discord_url": F9_DISCORD_URL, "rl_esports_news_url": RL_ESPORTS_NEWS_URL, "lanes": lanes},
    )
