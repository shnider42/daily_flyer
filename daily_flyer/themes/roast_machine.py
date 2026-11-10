"""A standalone, browser-local roast generator for DailyFlyer.

This theme is intentionally excluded from the DFE directory. Its public Render
deployment serves the assets directly; this adapter also supports the normal
DFE ``?theme=roast_machine`` and CLI render paths without shared-engine changes.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


ASSETS = Path(__file__).with_name("roast_machine_assets")
THEME_CONFIG = {
    "page_title": "Roast Machine",
    "header_title": "Roast Machine",
    "header_subtitle": "A name. A few questionable habits. A freshly printed roast.",
    "footer_text": "A DailyFlyer original. Names and details stay in this tab.",
}

# The shared renderer is intentionally unchanged. Remove its card chrome only
# in this theme, then apply the same stylesheet used by the standalone site.
_WRAPPER_CSS = """
body { margin: 0; background: #211e1e; min-height: 100vh; }
body::before, body::after, .site-bg { display: none; }
.page-shell > .hero-wrap, .page-shell > footer { display: none; }
.page-shell > main { display: block; width: 100%; max-width: none; padding: 0; margin: 0; }
.card.card--roast_machine { display: block; padding: 0; margin: 0; border: 0;
  border-radius: 0; min-height: 0; overflow: visible; background: none;
  box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none;
  transition: none; transform: none; }
.card.card--roast_machine:hover { transform: none; box-shadow: none; }
.card.card--roast_machine::before, .card.card--roast_machine::after,
.card--roast_machine > .card-head { display: none; }
.card--roast_machine > .body { margin: 0; color: inherit; font-size: inherit; line-height: normal; }
.rm-app main { display: block; max-width: none; margin: 0; padding: 0; }
.rm-app footer { max-width: none; }
"""


def _read(name: str) -> str:
    return (ASSETS / name).read_text(encoding="utf-8")


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    """Embed the static application using DFE's supported theme metadata hooks."""
    document = _read("index.html")
    body = re.search(r"<body\b[^>]*>(.*?)</body\s*>", document, re.I | re.S)
    if body is None:
        raise ValueError("Roast Machine HTML is missing its body.")
    markup = re.sub(r"<script\b[^>]*>.*?</script\s*>", "", body.group(1), flags=re.I | re.S)
    icon = base64.b64encode((ASSETS / "favicon.svg").read_bytes()).decode("ascii")
    # DFE's renderer embeds the application and its own tiny parallax helper
    # inline. The independent static build uses the stricter external-only CSP
    # in index.html. Neither delivery path permits network calls from the app.
    head = (
        '<meta name="description" content="Pick the habits. Set the heat. Print a personalized roast.">'
        '<meta name="robots" content="noindex, nofollow">'
        '<meta name="referrer" content="no-referrer">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
        "script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; "
        "connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'\">"
        f'<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,{icon}">'
    )
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=resolve_date(date_str).isoformat(),
        cards=[CardItem(card_type="roast_machine", eyebrow="Roast Machine", title="Roast Machine", body=markup)],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "extra_css": _WRAPPER_CSS + "\n" + _read("styles.css"),
            "extra_js": _read("engine.js") + "\n;\n" + _read("app.js"),
            "extra_head_html": head,
        },
    )
