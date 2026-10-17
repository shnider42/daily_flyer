"""An editorial novel preview using DFE's custom theme contract."""
from __future__ import annotations

import json
import math
import base64
from functools import lru_cache
from html import escape
from pathlib import Path

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date

ASSETS = Path(__file__).with_name("when_ants_stare_assets")
THEME_CONFIG = {
    "page_title": "When Ants Stare — What Stares Back",
    "header_title": "When Ants Stare",
    "header_subtitle": "What Stares Back · A novel in progress",
    "footer_text": "When Ants Stare · A novel in progress",
}


@lru_cache(maxsize=1)
def _font_css() -> str:
    """Bundle licensed fonts so exports and live themes need no font service."""
    faces = []
    for source, family in (("instrument-serif", "WAS Display"), ("source-serif-4", "WAS Text")):
        for style in ("normal", "italic"):
            data = base64.b64encode((ASSETS / "fonts" / f"{source}-{style}.woff2").read_bytes()).decode("ascii")
            faces.append(f'@font-face{{font-family:"{family}";font-style:{style};font-weight:400;font-display:swap;src:url(data:font/woff2;base64,{data}) format("woff2");}}')
    return "\n".join(faces)


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    chapter = json.loads((ASSETS / "chapter.json").read_text(encoding="utf-8"))
    paragraphs = chapter["paragraphs"]
    words = sum(len(p.split()) for p in paragraphs)
    replacements = {
        "__WAS_PARAGRAPHS__": "\n".join(
            f'<p id="passage-{i + 1}" data-passage="{i + 1}">{escape(p)}</p>'
            for i, p in enumerate(paragraphs)
        ),
        "__WAS_MINUTES__": str(max(1, math.ceil(words / 220))),
        "__WAS_NOTE__": escape(chapter["editorial_note"]),
        "__WAS_QUOTES__": json.dumps(chapter["keepsakes"], ensure_ascii=False).replace("<", "\\u003c"),
    }
    markup = (ASSETS / "page.html").read_text(encoding="utf-8")
    for key, value in replacements.items():
        markup = markup.replace(key, value)
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.isoformat(),
        cards=[CardItem(card_type="when_ants_stare", eyebrow="Novel preview",
                        title="Opening excerpt", body=markup)],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "when_ants_stare",
            "date_key": today.isoformat(),
            "extra_css": _font_css() + (ASSETS / "style.css").read_text(encoding="utf-8"),
            "extra_js": (ASSETS / "script.js").read_text(encoding="utf-8"),
            "extra_head_html": (
                '<meta name="description" content="For a moment, the sun looked back. Read the opening of When Ants Stare: What Stares Back, a novel in progress.">'
                '<meta name="robots" content="noindex,nofollow">'
                '<meta name="color-scheme" content="dark light">'
                '<meta name="theme-color" content="#171813">'
                '<script>' + (ASSETS / "appearance.js").read_text(encoding="utf-8") + '</script>'
            ),
        },
    )
