from pathlib import Path
import json
from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.year_two_sports import sport_switch, SPORT_CSS, BASEBALL_ICON
from daily_flyer.themes.qb_year_two import build_info
from daily_flyer.baseball_explorer.data import load_dataset
from daily_flyer.baseball_explorer.presets import DEFAULTS, factory_presets, page_presets

ASSETS = Path(__file__).resolve().parents[1] / "baseball_explorer"
SHARED = ASSETS.parent / "qb_explorer"
THEME_CONFIG = dict(page_title="Soph(more) Slump(?) | Baseball's Year-Two Question", header_title="Soph(more) Slump(?)",
                    header_subtitle="What does a baseball player's second substantial season tell us about their future?",
                    footer_text="Lahman Baseball Database © 1996–2025 SABR, via Sean Lahman. Derived data: CC BY-SA 3.0. Built on Daily Flyer.")
BACKGROUNDS = []
BACKGROUND_CADENCE = "daily"


def build_theme_page(date_str=None, seed=None):
    data = load_dataset()
    config = dict(meta=data["meta"], metrics=data["metrics"], teams=data["teams"], defaults=DEFAULTS,
                  presets=page_presets(), factory=factory_presets(), build=build_info())
    encoded = json.dumps(config, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return PageContext(**THEME_CONFIG, today_str=resolve_date(date_str).isoformat(),
        cards=[CardItem(card_type="baseball_explorer", eyebrow="", title="", body=(ASSETS/"page.html").read_text().replace("<!-- SPORT_SWITCH -->", sport_switch("baseball")).replace("<!-- BASEBALL_ICON -->", BASEBALL_ICON))],
        metadata=dict(theme_name="baseball_year_two", extra_css=(ASSETS/"style.css").read_text()+SPORT_CSS+(ASSETS.parent/"year_two_view.css").read_text(),
                      extra_head_html='<script type="application/json" id="bb-data">'+encoded+'</script>',
                      extra_js="\n".join([
                          (ASSETS.parent/"year_two_view.js").read_text(), (SHARED/"chart_math.js").read_text(), (SHARED/"research_math.js").read_text(),
                          (ASSETS/"research.js").read_text(), (ASSETS/"app.js").read_text(), (ASSETS/"admin.js").read_text()])))
