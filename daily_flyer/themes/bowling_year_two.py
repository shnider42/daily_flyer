import json
from pathlib import Path
from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.year_two_sports import sport_switch, SPORT_CSS, BOWLING_ICON
from daily_flyer.themes.qb_year_two import build_info
from daily_flyer.bowling_explorer.data import load_dataset, load_usbc_dataset, METRICS, USBC_METRICS
from daily_flyer.bowling_explorer.presets import DEFAULTS, CHOICES, factory_presets, legacy_factory_presets, page_presets

ASSETS = Path(__file__).resolve().parents[1] / "bowling_explorer"
THEME_CONFIG = dict(page_title="Soph(more) Slump(?) | Bowling · PBA & USBC",
                    header_title="Soph(more) Slump(?)", header_subtitle="What came after a bowler's second substantial season?",
                    footer_text="Sources: PBA.com profiles and USBC / bowl.com results. Independent study; not affiliated with or endorsed by the PBA or USBC. Built on Daily Flyer.")
BACKGROUNDS = []
BACKGROUND_CADENCE = "daily"


def build_theme_page(date_str=None, seed=None):
    config = dict(**load_dataset(), metrics=METRICS, usbc=dict(**load_usbc_dataset(), metrics=USBC_METRICS), defaults=DEFAULTS, choices=CHOICES,
                  presets=page_presets(), factory=factory_presets(), legacy_factory=legacy_factory_presets(), build=build_info())
    encoded = json.dumps(config, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    page = (ASSETS/"page.html").read_text().replace("<!-- SPORT_SWITCH -->", sport_switch("bowling")).replace("<!-- BOWLING_ICON -->", BOWLING_ICON)
    return PageContext(**THEME_CONFIG, today_str=resolve_date(date_str).isoformat(),
        cards=[CardItem(card_type="bowling_explorer", eyebrow="", title="", body=page)],
        metadata=dict(theme_name="bowling_year_two", extra_css=(ASSETS/"style.css").read_text()+SPORT_CSS+(ASSETS.parent/"year_two_view.css").read_text(),
                      extra_head_html='<script type="application/json" id="bw-data">'+encoded+'</script>',
                      extra_js="\n".join([
                          (ASSETS.parent/"preset_backup.js").read_text(), (ASSETS.parent/"year_two_view.js").read_text(),
                          (ASSETS.parent/"qb_explorer"/"research_math.js").read_text(),
                          (ASSETS/"math.js").read_text(), (ASSETS/"app.js").read_text(), (ASSETS/"admin.js").read_text()])))
