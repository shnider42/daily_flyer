from __future__ import annotations

from pathlib import Path
import json

from daily_flyer.models import CardItem, PageContext
from daily_flyer.qb_explorer.data import load_dataset
from daily_flyer.utils import resolve_date

ASSETS = Path(__file__).resolve().parents[1] / "qb_explorer"
THEME_CONFIG = {
    "page_title": "Year Two | The Quarterback Study",
    "header_title": "Year Two",
    "header_subtitle": "What happens after a quarterback earns the job?",
    "footer_text": "Built on Daily Flyer. Statistics originate with Pro Football Reference; snapshot provenance is listed above.",
}
BACKGROUNDS = []
BACKGROUND_CADENCE = "daily"


def build_theme_page(date_str=None, seed=None):
    today = resolve_date(date_str)
    dataset = json.dumps(load_dataset(), separators=(",", ":"), ensure_ascii=False).replace("<", "\\u003c")
    return PageContext(
        page_title=THEME_CONFIG["page_title"], header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"], today_str=today.isoformat(),
        cards=[CardItem(card_type="qb_explorer", eyebrow="", title="", body=(ASSETS / "page.html").read_text())],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={"theme_name": "qb_year_two", "extra_css": (ASSETS / "style.css").read_text(),
                  "extra_head_html": '<script type="application/json" id="qb-data">'+dataset+'</script>',
                  "extra_js": (ASSETS / "app.js").read_text()},
    )
