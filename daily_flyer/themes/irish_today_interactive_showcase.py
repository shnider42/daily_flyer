from __future__ import annotations

import random
from typing import Any

from daily_flyer.models import CardItem, PageContext
from daily_flyer.orchestrator import _build_language_card_body, _get_curated_history_card
from daily_flyer.themes import irish_today as base_theme
from daily_flyer.themes.interactive_showcase import (
    interactive_showcase_css,
    interactive_showcase_js,
    render_interactive_host,
)
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "Irish Today Showcase — Interactive cards",
    "header_title": "Irish Today Showcase ☘️",
    "header_title_image": base_theme.THEME_CONFIG.get("header_title_image", ""),
    "header_subtitle": "Trivia, language drills, clue ladders, memory, and playful micro-interactions inside Daily Flyer",
    "footer_text": "Experimental Daily Flyer branch — Irish Today interactive showcase.",
    "hero_kicker": "Daily Flyer • Interactive Showcase",
    "hero_summary_pill": "Trivia, Gaeilge, Fly Swatter, county clues, history order, memory, and phrase building",
}

BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])

TRIVIA_QUESTIONS = [
    {
        "prompt": "Which Irish sport is often described as one of the fastest field games in the world?",
        "options": ["Gaelic football", "Hurling", "Rugby union", "Rowing"],
        "answerIndex": 1,
        "explanation": "Hurling is famous for combining speed, skill, and hand-eye coordination at an intense pace.",
    },
    {
        "prompt": "Which Irish festival is closely linked to the deeper roots of Halloween?",
        "options": ["Bealtaine", "Lughnasadh", "Samhain", "Bloomsday"],
        "answerIndex": 2,
        "explanation": "Samhain marks the seasonal turn into winter and is often cited as a major precursor to Halloween traditions.",
    },
    {
        "prompt": "What is the name of the large stadium strongly associated with Gaelic games in Dublin?",
        "options": ["Aviva Stadium", "Semple Stadium", "Croke Park", "Páirc Uí Chaoimh"],
        "answerIndex": 2,
        "explanation": "Croke Park is one of the symbolic hearts of Gaelic games and hosts the All-Ireland finals.",
    },
    {
        "prompt": "Which prehistoric Irish monument is famous for its winter solstice illumination?",
        "options": ["Trim Castle", "Newgrange", "Glendalough", "The Rock of Cashel"],
        "answerIndex": 1,
        "explanation": "Newgrange is especially well known for the sunlight alignment that reaches into the passage at the winter solstice.",
    },
]

COUNTY_CLUE_QUESTIONS = [
    {
        "prompt": "Which county fits these clues?",
        "clues": [
            "This county is strongly associated with hurling success.",
            "Its county colors are black and amber.",
            "Its best-known city shares the county name.",
        ],
        "options": ["Kilkenny", "Clare", "Galway", "Tipperary"],
        "answerIndex": 0,
        "explanation": "Kilkenny is famous for black-and-amber hurling identity and a city with the same name.",
    },
    {
        "prompt": "Which county fits these clues?",
        "clues": [
            "This county includes the Cliffs of Moher.",
            "It is strongly associated with traditional music and the Burren.",
            "Its county town is Ennis.",
        ],
        "options": ["Mayo", "Clare", "Sligo", "Donegal"],
        "answerIndex": 1,
        "explanation": "Clare is the county of the Cliffs of Moher, the Burren, and Ennis.",
    },
    {
        "prompt": "Which county fits these clues?",
        "clues": [
            "This county includes Newgrange and other Boyne Valley monuments.",
            "It has strong associations with Tara and Trim.",
            "It is in the province of Leinster.",
        ],
        "options": ["Meath", "Louth", "Kildare", "Wexford"],
        "answerIndex": 0,
        "explanation": "Meath contains Newgrange, Tara, and Trim and is central to Boyne Valley history.",
    },
]

HISTORY_SORT_ROUNDS = [
    {
        "prompt": "Arrange these from earliest to latest.",
        "items": [
            {"label": "Norman arrival in Ireland", "year": 1169},
            {"label": "The Great Famine begins", "year": 1845},
            {"label": "Republic of Ireland Act takes effect", "year": 1949},
        ],
    },
    {
        "prompt": "Arrange these from earliest to latest.",
        "items": [
            {"label": "Founding of the GAA", "year": 1884},
            {"label": "Easter Rising", "year": 1916},
            {"label": "Ireland joins the EEC", "year": 1973},
        ],
    },
    {
        "prompt": "Arrange these from earliest to latest.",
        "items": [
            {"label": "Douglas Hyde becomes President", "year": 1938},
            {"label": "Irish Free State comes into existence", "year": 1922},
            {"label": "Bunreacht na hÉireann takes effect", "year": 1937},
        ],
    },
]

PHRASE_BUILDER_QUESTIONS = [
    {
        "prompt": "Build the Irish phrase for 'Good morning.'",
        "answerParts": ["Maidin", "mhaith"],
        "meta": "Pronunciation: ma-jin wah",
        "explanation": "Maidin mhaith means 'Good morning.'",
    },
    {
        "prompt": "Build the Irish phrase for 'Thank you.'",
        "answerParts": ["Go", "raibh", "maith", "agat"],
        "meta": "Pronunciation: guh rev mah ah-gut",
        "explanation": "Go raibh maith agat means 'Thank you.'",
    },
    {
        "prompt": "Build the Irish phrase for 'How are you?'",
        "answerParts": ["Cad", "é", "mar", "atá", "tú?"],
        "meta": "Pronunciation: cod ay mar a-taw too?",
        "explanation": "Cad é mar atá tú? means 'How are you?'",
    },
]


def _pick_background(today) -> dict[str, Any] | None:
    backgrounds = getattr(base_theme, "BACKGROUNDS", [])
    if not backgrounds:
        return None
    cadence = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
    if cadence == "weekly":
        index = today.isocalendar().week % len(backgrounds)
    else:
        index = today.toordinal() % len(backgrounds)
    return backgrounds[index]


def _build_language_questions(rng: random.Random, count: int = 5) -> list[dict[str, Any]]:
    words = list(getattr(base_theme, "WORDS", []))
    if len(words) < 4:
        return []
    chosen_words = rng.sample(words, k=min(count, len(words)))
    questions: list[dict[str, Any]] = []
    for word in chosen_words:
        distractors_pool = [candidate["english"] for candidate in words if candidate["native_text"] != word["native_text"]]
        distractors = rng.sample(distractors_pool, k=3)
        options = distractors + [word["english"]]
        rng.shuffle(options)
        questions.append(
            {
                "prompt": f"What does '{word['native_text']}' mean?",
                "options": options,
                "answerIndex": options.index(word["english"]),
                "meta": f"Pronunciation: {word.get('pronunciation', 'n/a')}",
                "explanation": f"{word['native_text']} means '{word['english']}'.",
            }
        )
    return questions


def _build_memory_pairs(rng: random.Random, count: int = 4) -> list[dict[str, str]]:
    words = list(getattr(base_theme, "WORDS", []))
    if len(words) < count:
        return []
    chosen = rng.sample(words, k=count)
    return [{"left": item["native_text"], "right": item["english"]} for item in chosen]


def build_theme_page(
    date_str: str | None = None,
    seed: int | None = None,
) -> PageContext:
    today = resolve_date(date_str)
    rng = random.Random(seed if seed is not None else today.toordinal())

    word = base_theme.WORDS[today.toordinal() % len(base_theme.WORDS)]
    phrase = rng.choice(base_theme.PHRASES)
    did_you_know = rng.choice(base_theme.DID_YOU_KNOW)
    sport_spotlight = rng.choice(base_theme.SPORTS_SPOTLIGHT)
    history_card = _get_curated_history_card(base_theme, today, base_theme.THEME_CONFIG)
    language_questions = _build_language_questions(rng)
    memory_pairs = _build_memory_pairs(rng)

    cards: list[CardItem] = [
        CardItem(
            card_type="word",
            eyebrow="Word of the Day",
            title=word["native_text"],
            body=_build_language_card_body(
                english=word["english"],
                pronunciation=word.get("pronunciation"),
            ),
        ),
        CardItem(
            card_type="phrase",
            eyebrow="Phrase of the Day",
            title=phrase["native_text"],
            body=_build_language_card_body(
                english=phrase["english"],
                pronunciation=phrase.get("pronunciation"),
            ),
        ),
        CardItem(
            card_type="trivia",
            eyebrow="Interactive Lab",
            title="Irish Trivia Challenge",
            body=render_interactive_host(
                widget_type="trivia",
                card_id="irish-showcase-trivia",
                config={"questions": TRIVIA_QUESTIONS},
                intro="Multiple choice, local streak tracking, and quick replay.",
                footnote="This is the cleanest baseline for Daily Flyer interactivity.",
            ),
        ),
        CardItem(
            card_type="word",
            eyebrow="Interactive Lab",
            title="Gaeilge Match-Up",
            body=render_interactive_host(
                widget_type="language_quiz",
                card_id="irish-showcase-language",
                config={"questions": language_questions},
                intro="A lightweight Irish-language quiz driven from the existing WORDS pool.",
                footnote="No backend required.",
            ),
        ),
        CardItem(
            card_type="sport",
            eyebrow="Interactive Lab",
            title="Fly Swatter",
            body=render_interactive_host(
                widget_type="fly_swatter",
                card_id="irish-showcase-fly-swatter",
                config={"roundSeconds": 30, "spawnEverySeconds": 0.65},
                intro="Formerly Sky Defender. Same spirit, better name for this branch.",
                footnote="Quick canvas microgame.",
            ),
        ),
        CardItem(
            card_type="county",
            eyebrow="Interactive Lab",
            title="County Clue Ladder",
            body=render_interactive_host(
                widget_type="county_clues",
                card_id="irish-showcase-county-clues",
                config={"questions": COUNTY_CLUE_QUESTIONS},
                intro="Reveal clues one by one and guess the county before the answer gets obvious.",
                footnote="This is a strong fit for Irish Today because it can tie directly into counties, landmarks, and history.",
            ),
        ),
        CardItem(
            card_type="history",
            eyebrow="Interactive Lab",
            title="History Order Challenge",
            body=render_interactive_host(
                widget_type="history_sort",
                card_id="irish-showcase-history-sort",
                config={"rounds": HISTORY_SORT_ROUNDS},
                intro="Reorder milestones from earliest to latest using simple up/down controls.",
                footnote="This keeps a history card interactive without turning it into a full game.",
            ),
        ),
        CardItem(
            card_type="word",
            eyebrow="Interactive Lab",
            title="Gaeilge Memory Grid",
            body=render_interactive_host(
                widget_type="memory_match",
                card_id="irish-showcase-memory-grid",
                config={"pairs": memory_pairs},
                intro="Match Irish words to their English meanings.",
                footnote="Good for repetition and quick replay value.",
            ),
        ),
        CardItem(
            card_type="phrase",
            eyebrow="Interactive Lab",
            title="Phrase Builder",
            body=render_interactive_host(
                widget_type="phrase_builder",
                card_id="irish-showcase-phrase-builder",
                config={"questions": PHRASE_BUILDER_QUESTIONS},
                intro="Tap words into order to build useful Irish phrases.",
                footnote="This is the best bridge between static phrase cards and actual learning interaction.",
            ),
        ),
        CardItem(
            card_type="did_you_know",
            eyebrow="Irish Fact",
            title="Static cards still belong here",
            body=did_you_know,
        ),
        CardItem(
            card_type="sport",
            eyebrow="Sports Spotlight",
            title="Today's Pick",
            body=sport_spotlight,
        ),
    ]

    if history_card is not None:
        cards.insert(1, history_card)

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "irish_today_interactive_showcase",
            "date_key": today.strftime("%m-%d"),
            "background": _pick_background(today),
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker"),
            "hero_summary_pill": THEME_CONFIG.get("hero_summary_pill"),
            "extra_css": interactive_showcase_css(),
            "extra_js": interactive_showcase_js(),
            "extra_head_html": "",
        },
    )
