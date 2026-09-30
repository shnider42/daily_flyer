from __future__ import annotations

from pathlib import Path
import json
import os
import re

from daily_flyer.models import CardItem, PageContext
from daily_flyer.qb_explorer.data import load_dataset
from daily_flyer.qb_explorer.presets import factory_presets, page_presets
from daily_flyer.utils import resolve_date
from daily_flyer.year_two_sports import sport_switch, SPORT_CSS

ASSETS = Path(__file__).resolve().parents[1] / "qb_explorer"
THEME_CONFIG = {
    "page_title": "Soph(more) Slump(?) | Does a QB's Year Two Matter?",
    "header_title": "Soph(more) Slump(?)",
    "header_subtitle": "Compare a quarterback's first two starter seasons. Then test what year two tells us.",
    "footer_text": "Built on Daily Flyer. Statistics originate with Pro Football Reference; snapshot provenance is listed above.",
}
BACKGROUNDS = []
BACKGROUND_CADENCE = "daily"
APP_VERSION = "3.0.1"


def build_info():
    """Render supplies the deployed revision; never label a local tree as deployed."""
    commit = os.environ.get("RENDER_GIT_COMMIT", "").strip()
    return {"version": APP_VERSION,
            "commit": commit if re.fullmatch(r"[0-9a-fA-F]{40}", commit) else None}


def build_theme_page(date_str=None, seed=None):
    today = resolve_date(date_str)
    payload = load_dataset()
    payload["build"] = build_info()
    payload["preset_config"] = page_presets()
    payload["preset_factory"] = factory_presets()
    payload["super_bowls"] = json.loads((ASSETS.parent / "data" / "qb_super_bowls.json").read_text())
    dataset = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).replace("<", "\\u003c")
    return PageContext(
        page_title=THEME_CONFIG["page_title"], header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"], today_str=today.isoformat(),
        cards=[CardItem(card_type="qb_explorer", eyebrow="", title="", body=(ASSETS / "page.html").read_text().replace('<div id="qb-app">', '<div id="qb-app">'+sport_switch("football"), 1).replace("<!-- RESEARCH_PANEL -->", (ASSETS / "research.html").read_text()).replace("<!-- PRESET_EDITOR -->", (ASSETS / "preset_admin.html").read_text()))],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={"theme_name": "qb_year_two", "extra_css": (ASSETS / "style.css").read_text() + "\n" + (ASSETS / "football.css").read_text() + SPORT_CSS,
                  "extra_head_html": '<script type="application/json" id="qb-data">'+dataset+'</script>',
                  "extra_js": "\n".join((ASSETS / file).read_text() for file in ["chart_math.js", "app.js", "research_math.js", "research.js", "stories.js", "preset_admin.js"])},
    )
