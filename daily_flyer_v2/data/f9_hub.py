from __future__ import annotations

F9_LOGO_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/f9_logo.png"
F9_STADIUM_URL = "https://raw.githubusercontent.com/shnider42/f9-tourney/main/static/stadium.jpg"
RL_ESPORTS_NEWS_URL = "https://esports.rocketleague.com/news"
ROCKET_LEAGUE_WIKI_FILE = "https://rocketleague.fandom.com/wiki/Special:FilePath/"

GARAGE_ITEMS = [
    {
        "name": "Cristiano wheels",
        "body": "Readable, clean, and impossible to blame for a missed open net.",
        "image_url": ROCKET_LEAGUE_WIKI_FILE + "Cristiano_wheels_icon.png",
    },
    {
        "name": "Titanium White Zomba",
        "body": "The classic flex. Use only if the post-game apology is also premium.",
        "image_url": ROCKET_LEAGUE_WIKI_FILE + "Zomba_wheels_icon.png",
    },
    {
        "name": "Standard boost",
        "body": "Low visual noise. High teammate appreciation.",
        "image_url": ROCKET_LEAGUE_WIKI_FILE + "Standard_rocket_boost_icon.png",
    },
    {
        "name": "Big Splash",
        "body": "For goals that deserved cinema, or at least a laugh in Discord.",
        "image_url": ROCKET_LEAGUE_WIKI_FILE + "Big_Splash_goal_explosion_icon.png",
    },
    {
        "name": "Dueling Dragons",
        "body": "Overqualified goal explosion for suspicious ranked goals.",
        "image_url": ROCKET_LEAGUE_WIKI_FILE + "Dueling_Dragons_goal_explosion_icon.png",
    },
]

WARMUPS = [
    ("Half-flip checkpoint", "Ten clean half-flips from dead stop. Speed only counts after clean landings."),
    ("Small-pad route", "Cross the field using only small pads. Running dry means tomorrow has a drill."),
    ("First-touch callout", "Before every defensive touch, say the target: wall, corner, teammate, or space."),
    ("Back-post honesty", "Track accidental front-post rotations for three games. No trial, just evidence."),
]

COMMAND_BOARD_PROMPTS = [
    {"title": "Rotation read: second man spacing", "body": "Watch one replay or live game for second-man distance. The question: close enough to pressure, far enough to react?", "mode": "positioning", "cta_url": ""},
    {"title": "Replay review: panic clear audit", "body": "Clip one conceded goal where the clear went straight back to pressure. Identify the safer touch before queueing again.", "mode": "replay review", "cta_url": ""},
    {"title": "RLCS watch prompt", "body": "Open the latest RL Esports headline and turn it into one Discord question for the next watch party.", "mode": "watch party", "cta_url": RL_ESPORTS_NEWS_URL},
    {"title": "Party queue objective", "body": "For the first three games, call the intended touch before contact: beat, pass, clear, fake, soft touch, or 50.", "mode": "queue objective", "cta_url": ""},
]

ROCKET_LEAGUE_HISTORY = [
    {
        "month_day": "06-10",
        "title": "This Week in Rocket League History",
        "body": "June 10, 2018: Team Dignitas won the RLCS Season 5 world championship after jstn.'s zero-second equalizer forced overtime and Turbopolsa scored the winner.",
        "cadence": "weekly",
        "source_note": "Seeded curated history entry; verify against source before publishing broadly.",
        "source_url": "https://en.wikipedia.org/wiki/Turbopolsa",
    },
    {
        "month_day": "06-15",
        "title": "This Week in Rocket League History",
        "body": "June 2016: the first RLCS season reached its finals era, with iBUYPOWER Cosmic becoming the first RLCS champion.",
        "cadence": "weekly",
        "source_note": "Seeded curated history entry; verify exact event date before publishing broadly.",
        "source_url": "https://en.wikipedia.org/wiki/Rocket_League_Championship_Series",
    },
    {
        "month_day": "07-07",
        "title": "This Week in Rocket League History",
        "body": "July 7, 2015: Rocket League launched on PlayStation 4 and Windows, beginning the car-soccer timeline that eventually became RLCS culture.",
        "cadence": "weekly",
        "source_note": "Seeded curated history entry.",
        "source_url": "https://en.wikipedia.org/wiki/Rocket_League",
    },
    {
        "month_day": "09-23",
        "title": "This Week in Rocket League History",
        "body": "September 23, 2020: Rocket League moved to free-to-play, changing the size and shape of the player base overnight.",
        "cadence": "weekly",
        "source_note": "Seeded curated history entry.",
        "source_url": "https://en.wikipedia.org/wiki/Rocket_League",
    },
]

WORKSHOP_MAPS = [
    {"title": "Workshop Map of the Week", "body": "Manual placeholder: choose one training map and write the specific skill it is meant to sharpen before ranked.", "cadence": "weekly", "source_note": "Curated manually; Steam Workshop/API research can come later."},
    {"title": "Workshop Map of the Week", "body": "Manual placeholder: rotate between rings, dribble, recovery, shooting, and awkward-save training maps.", "cadence": "weekly", "source_note": "Curated manually; Steam Workshop/API research can come later."},
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
