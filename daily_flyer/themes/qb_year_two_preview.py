"""Opt-in comparison prototype. Reuses frozen data, not existing UI state."""
import json
from pathlib import Path

from daily_flyer.models import CardItem, PageContext
from daily_flyer.qb_explorer.data import load_dataset
from daily_flyer.themes.qb_year_two import build_info
from daily_flyer.utils import resolve_date
from daily_flyer.year_two_sports import sport_switch, SPORT_CSS

ASSETS = Path(__file__).resolve().parents[1] / "qb_preview"
THEME_CONFIG = dict(page_title="Football comparison preview | Soph(more) Slump(?)",
                    header_title="Soph(more) Slump(?)", header_subtitle="Did year two bring a slump?",
                    footer_text="Independent statistical study · Daily Flyer · Design preview")
BACKGROUNDS = []
BACKGROUND_CADENCE = "daily"


def build_theme_page(date_str=None, seed=None):
    payload = dict(load_dataset(), build=build_info())
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    page = (ASSETS / "page.html").read_text().replace("<!-- SPORTS -->", sport_switch("football", detail_controls=False))
    return PageContext(**THEME_CONFIG, today_str=resolve_date(date_str).isoformat(),
        cards=[CardItem(card_type="qb_preview", eyebrow="", title="", body=page)],
        metadata=dict(theme_name="qb_year_two_preview", extra_css=SPORT_CSS+(ASSETS / "style.css").read_text(),
                      extra_head_html='<script type="application/json" id="qp-data">'+encoded+'</script>',
                      extra_js="\n".join((ASSETS / f).read_text() for f in ("math.js", "app.js"))))
