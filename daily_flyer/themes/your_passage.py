"""New Passage: a coaching homepage and daily practice, using the DFE contract.

No accounts, submissions, external content fetches, or changes to other themes.
The original Passages exercise library stays the source of daily content.
"""
from __future__ import annotations

import base64
import json
from html import escape
from pathlib import Path

from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes.topic_signal_daily import DAILY_PASSAGES
from daily_flyer.utils import resolve_date

ASSETS = Path(__file__).with_name("your_passage_assets")
THEME_CONFIG = {
    "page_title": "New Passage — Find your next step",
    "header_title": "New Passage",
    "header_subtitle": "Coaching, confidence, and a clearer next step for young adults.",
    "footer_text": "New Passage · Built with Daily Flyer Engine",
}

# Editorial practice aids, intentionally separate from the reused DFE library.
# These are examples to discuss with Tim, not personalized assessments.
PRACTICE_GUIDES = [
    {
        "starting_point": "I don’t know what’s next.",
        "short_title": "Find a first direction",
        "benefit": "Leave with one small way to explore what interests you.",
        "heading": "A starting point isn’t a life sentence.",
        "margin_note": "Curiosity is enough to begin. You can change direction.",
        "scenario": "Someone asks, “So, what are you going to do after school?” You’re still figuring it out.",
        "responses": [
            {"label": "Give them the career answer they expect.", "feedback": "That may end the conversation, but it gives them little chance to help with what you actually need. You’re allowed to say you’re exploring."},
            {"label": "Name one thing I’m curious about, and ask a question.", "feedback": "That gives the conversation somewhere useful to go. Try: “I’m curious about design. Do you know anyone I could ask about their work?”"},
        ],
    },
    {
        "starting_point": "I’m starting my first job.",
        "short_title": "Feel more ready for work",
        "benefit": "Leave with a useful question you can ask in your first week.",
        "heading": "You’re new. You’re allowed to ask.",
        "margin_note": "Being ready includes knowing when to ask for help.",
        "scenario": "You’re on your first shift. You’ve been shown a task, but one part still isn’t clear.",
        "responses": [
            {"label": "Try to work it out quietly before asking.", "feedback": "A little independent thinking can help. If a mistake could affect someone’s safety or work, pause and clarify first. You don’t have to prove you know everything."},
            {"label": "Say what I understand, then ask about the unclear part.", "feedback": "That gives the other person a clear place to help. Try: “I’ve got the first part. Can you show me how you want this last step done?”"},
        ],
    },
    {
        "starting_point": "I’m choosing between paths.",
        "short_title": "Make the options clearer",
        "benefit": "Leave with a fairer way to compare your next-step options.",
        "heading": "A good fit is worth investigating.",
        "margin_note": "Compare the day-to-day reality, as well as the destination.",
        "scenario": "You’re comparing two paths. One sounds impressive; the other feels like a better fit, but you know less about it.",
        "responses": [
            {"label": "Choose the familiar option so I can stop worrying.", "feedback": "Familiarity is useful information, but it isn’t the whole picture. Before committing, name the uncertainty you still need to investigate."},
            {"label": "Ask the same practical questions about both options.", "feedback": "Try comparing cost, support, what a typical week looks like, and the next opportunity each path opens. A visit or conversation can make the comparison more concrete."},
        ],
    },
    {
        "starting_point": "I find it hard to talk about myself.",
        "short_title": "Find the words for your strengths",
        "benefit": "Leave with an honest way to introduce yourself.",
        "heading": "You already have something to say.",
        "margin_note": "Real examples speak louder than impressive adjectives.",
        "scenario": "Someone at an event asks what you do. You don’t have a job title that seems worth mentioning yet.",
        "responses": [
            {"label": "Keep it short: “I’m just a student.”", "feedback": "You don’t need a polished pitch. But “just” can hide the things you’re learning. Add one interest or a project to give the other person something to ask about."},
            {"label": "Share what I’m learning and what I’d like to try.", "feedback": "Try: “I’m studying ___. I liked working on ___. I’m looking for a chance to learn more about ___.” Keep it true to your own experience."},
        ],
    },
]


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    # The parent-specific exercise belongs in the parent lane, not student rotation.
    library = DAILY_PASSAGES[:4]
    selected = (seed if seed is not None else today.toordinal()) % len(library)
    exercises = [
        {"id": f"passage-{i + 1}", "title": item["passage"], "skill": item["skill"],
         "read": item["why"], "steps": item["steps"], "reflection": item["reflection"],
         "conversation": item["prompt"], "parent_note": item["parent_note"],
         **PRACTICE_GUIDES[i]}
        for i, item in enumerate(library)
    ]
    payload = json.dumps({"exercises": exercises, "selected": selected,
                          "date": today.isoformat()}, ensure_ascii=False).replace("<", "\\u003c")
    passage = exercises[selected]
    replacements = {
        "__YP_DATA__": payload,
        "__YP_DATE__": escape(today.strftime("%B %d, %Y")),
        "__YP_TITLE__": escape(passage["title"]),
        "__YP_READ__": escape(passage["read"]),
        "__YP_SKILL__": escape(passage["skill"]),
        "__YP_HEADING__": escape(passage["heading"]),
        "__YP_MARGIN__": escape(passage["margin_note"]),
        "__YP_PORTRAIT__": "data:image/webp;base64," + base64.b64encode((ASSETS / "tim-holtsnider.webp").read_bytes()).decode("ascii"),
        "__YP_REFLECTION__": escape(passage["reflection"]),
        "__YP_STEPS__": "".join(f"<li>{escape(step)}</li>" for step in passage["steps"]),
        "__YP_YEAR__": str(today.year),
    }
    markup = (ASSETS / "page.html").read_text(encoding="utf-8")
    for key, value in replacements.items():
        markup = markup.replace(key, value)
    return PageContext(
        page_title=THEME_CONFIG["page_title"], header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"], today_str=today.isoformat(),
        cards=[CardItem(card_type="your_passage", eyebrow="New Passage", title="Your next step", body=markup)],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={"theme_name": "your_passage", "date_key": today.isoformat(),
                  "extra_css": (ASSETS / "style.css").read_text(encoding="utf-8"),
                  "extra_js": (ASSETS / "script.js").read_text(encoding="utf-8"),
                  "extra_head_html": (
                      '<meta name="description" content="Coaching and mentorship for high school and college students with Tim Holtsnider. Explore one-to-one coaching, group learning, and school partnerships.">'
                      '<meta name="theme-color" id="yp-theme-color" content="#f4f6f4">'
                      '<meta name="color-scheme" content="light dark">'
                      '<script id="yp-appearance-init">'
                      + (ASSETS / "appearance.js").read_text(encoding="utf-8")
                      + '</script>')},
    )
