"""Your Passage: a coaching homepage and daily practice, using the DFE contract.

No accounts, submissions, external content fetches, or changes to other themes.
The original Passages exercise library stays the source of daily content.
"""
from __future__ import annotations

import json
from html import escape
from pathlib import Path

from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes.topic_signal_daily import DAILY_PASSAGES
from daily_flyer.utils import resolve_date

ASSETS = Path(__file__).with_name("your_passage_assets")
THEME_CONFIG = {
    "page_title": "Your Passage — Find your next step",
    "header_title": "Your Passage",
    "header_subtitle": "Coaching, confidence, and a clearer next step for young adults.",
    "footer_text": "Your Passage · Built with Daily Flyer Engine",
}


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    # The parent-specific exercise belongs in the parent lane, not student rotation.
    library = DAILY_PASSAGES[:4]
    selected = (seed if seed is not None else today.toordinal()) % len(library)
    exercises = [
        {"id": f"passage-{i + 1}", "title": item["passage"], "skill": item["skill"],
         "read": item["why"], "steps": item["steps"], "reflection": item["reflection"],
         "conversation": item["prompt"], "parent_note": item["parent_note"]}
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
        cards=[CardItem(card_type="your_passage", eyebrow="Your Passage", title="Your next step", body=markup)],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={"theme_name": "your_passage", "date_key": today.isoformat(),
                  "extra_css": (ASSETS / "style.css").read_text(encoding="utf-8"),
                  "extra_js": (ASSETS / "script.js").read_text(encoding="utf-8"),
                  "extra_head_html": '<meta name="description" content="Career coaching and practical daily exercises for high school and college students. Find your next step with Tim Holtsnider and Your Passage."><meta name="theme-color" content="#f4f2eb"><meta name="color-scheme" content="light">'},
    )
