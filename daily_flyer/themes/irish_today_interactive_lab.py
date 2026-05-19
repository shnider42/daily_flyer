from __future__ import annotations

import random
from typing import Any

from daily_flyer.models import CardItem, PageContext
from daily_flyer.orchestrator import _build_language_card_body, _get_curated_history_card
from daily_flyer.themes import irish_today as base_theme
from daily_flyer.themes.interactive_lab import (
    interactive_lab_css,
    interactive_lab_js,
    render_interactive_host,
)
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "Irish Today Lab — Interactive cards",
    "header_title": "Irish Today Lab ☘️",
    "header_title_image": base_theme.THEME_CONFIG.get("header_title_image", ""),
    "header_subtitle": "Experimental trivia, language, and arcade-style cards inside Daily Flyer",
    "footer_text": "Experimental Daily Flyer branch — interactive card lab for Irish Today.",
    "hero_kicker": "Daily Flyer • Interactive Lab",
    "hero_summary_pill": "Prototype cards: quiz, Gaeilge, and microgame",
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
        "options": ["Aviva Stadium", "Semple Stadium", "Croke Park", "Pairc Ui Chaoimh"],
        "answerIndex": 2,
        "explanation": "Croke Park is one of the symbolic hearts of Gaelic games and hosts the All-Ireland finals.",
    },
    {
        "prompt": "Which prehistoric Irish monument is famous for its winter solstice illumination?",
        "options": ["Trim Castle", "Newgrange", "Glendalough", "The Rock of Cashel"],
        "answerIndex": 1,
        "explanation": "Newgrange is especially well known for the sunlight alignment that reaches into the passage at the winter solstice.",
    },
    {
        "prompt": "Which organization founded in 1884 became central to promoting hurling and Gaelic football?",
        "options": ["IRFU", "FAI", "GAA", "RTE"],
        "answerIndex": 2,
        "explanation": "The Gaelic Athletic Association, or GAA, became one of the most important institutions in Irish sporting and cultural life.",
    },
    {
        "prompt": "What does the Irish word 'craic' usually refer to?",
        "options": ["A type of bread", "Fun and good company", "A county badge", "A musical instrument"],
        "answerIndex": 1,
        "explanation": "Craic usually means enjoyable talk, fun, and lively company.",
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
        distractors_pool = [
            candidate["english"]
            for candidate in words
            if candidate["native_text"] != word["native_text"]
        ]
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
                card_id="irish-lab-trivia",
                config={"questions": TRIVIA_QUESTIONS},
                intro="Multiple choice, local score tracking, and a next-question loop. This is the fastest way to prove interactive cards belong on Daily Flyer.",
                footnote="Scores stay in this browser via localStorage.",
            ),
        ),
        CardItem(
            card_type="word",
            eyebrow="Interactive Lab",
            title="Gaeilge Match-Up",
            body=render_interactive_host(
                widget_type="language_quiz",
                card_id="irish-lab-language",
                config={"questions": language_questions},
                intro="A lightweight Irish-language quiz driven directly from the existing WORDS pool.",
                footnote="This one reuses the theme data you already have instead of needing a separate backend.",
            ),
        ),
        CardItem(
            card_type="sport",
            eyebrow="Interactive Lab",
            title="Sky Defender",
            body=render_interactive_host(
                widget_type="sky_defender",
                card_id="irish-lab-sky-defender",
                config={"roundSeconds": 45, "spawnEverySeconds": 0.8},
                intro="A tiny canvas microgame to prove the platform can host more than static content.",
                footnote="Experimental by design: simple shapes, simple rules, quick replay loop.",
            ),
        ),
        CardItem(
            card_type="did_you_know",
            eyebrow="Irish Fact",
            title="Still here for the static cards",
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
            "theme_name": "irish_today_interactive_lab",
            "date_key": today.strftime("%m-%d"),
            "background": _pick_background(today),
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker"),
            "hero_summary_pill": THEME_CONFIG.get("hero_summary_pill"),
            "extra_css": interactive_lab_css(),
            "extra_js": interactive_lab_js(),
            "extra_head_html": "",
        },
    )
