"""A personal best man's notebook, deliberately absent from every public catalog.

The independent Render site publishes only this theme's static assets. This
adapter also supports DFE's normal theme and CLI paths without changing the
shared renderer or making any content-provider requests.
"""

from __future__ import annotations

import base64
import json
import re
from datetime import date
from pathlib import Path

from daily_flyer.models import CardItem, PageContext


ASSETS = Path(__file__).with_name("best_man_assets")
THEME_CONFIG = {
    "page_title": "For my brother",
    "header_title": "For my brother",
    "header_subtitle": "a best man’s notebook",
    "footer_text": "A place for the things you want to remember.",
}

_WRAPPER_CSS = """
body { margin: 0; min-height: 100vh; background: #f3eee3; }
body::before, body::after, .site-bg { display: none; }
.page-shell > .hero-wrap, .page-shell > footer { display: none; }
.page-shell > main {
  display: block; max-width: none; width: 100%; margin: 0; padding: 0;
}
.card.card--best_man {
  display: block; min-height: 0; padding: 0; margin: 0; border: 0;
  border-radius: 0; overflow: visible; background: none; box-shadow: none;
  backdrop-filter: none; -webkit-backdrop-filter: none;
  transition: none; transform: none;
}
.card.card--best_man:hover { transform: none; box-shadow: none; }
.card.card--best_man::before, .card.card--best_man::after,
.card--best_man > .card-head { display: none; }
.card--best_man > .body {
  margin: 0; color: inherit; font-size: inherit; line-height: normal;
}
:where(.bm-app) main { display: block; max-width: none; margin: 0; padding: 0; }
:where(.bm-app) footer { max-width: none; margin: 0; padding: 0; }
"""


def _read(name: str) -> str:
    return (ASSETS / name).read_text(encoding="utf-8")


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    """Embed the same notebook used by the independent static deployment."""
    document = _read("index.html")
    body = re.search(r"<body\b([^>]*)>(.*?)</body\s*>", document, re.I | re.S)
    if body is None:
        raise ValueError("The notebook HTML is missing its body.")
    markup = re.sub(r"<script\b[^>]*>.*?</script\s*>", "", body.group(2), flags=re.I | re.S)
    body_class = re.search(r"\bclass\s*=\s*([\"'])(.*?)\1", body.group(1), re.I | re.S)
    classes = body_class.group(2).split() if body_class else []
    # The shared renderer embeds scripts and styles inline. Permit only the
    # dedicated notebook API; browser code never receives an admin API key.
    head = (
        '<meta name="description" content="A personal notebook for a brother’s wedding: thoughts, plans, and a few good stories.">'
        '<meta name="robots" content="noindex, nofollow">'
        '<meta name="referrer" content="no-referrer">'
        '<meta name="theme-color" content="#f3eee3">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
        "script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; "
        "connect-src https://uwbhjgvpaetrhfvcpvsg.supabase.co; form-action 'none'; base-uri 'none'; object-src 'none'\">"
    )
    icon = ASSETS / "favicon.svg"
    if icon.is_file():
        encoded_icon = base64.b64encode(icon.read_bytes()).decode("ascii")
        head += f'<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,{encoded_icon}">'
    body_setup = ""
    if classes:
        body_setup = "document.body.classList.add(..." + json.dumps(classes) + ");\n"
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=(date.fromisoformat(date_str) if date_str else date.today()).isoformat(),
        cards=[CardItem(card_type="best_man", eyebrow="Notebook", title="For my brother", body=markup)],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "best_man",
            "extra_css": _WRAPPER_CSS + "\n" + _read("styles.css"),
            "extra_js": body_setup + _read("store.js") + "\n;\n" + _read("cloud.js") + "\n;\n" + _read("app.js"),
            "extra_head_html": head,
        },
    )
