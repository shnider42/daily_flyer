"""Original vector arcade theme using DFE's custom-page extension."""
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from daily_flyer.models import CardItem, PageContext

THEME_CONFIG = {
    "page_title": "Battlezone 1980 — Daily Flyer Arcade",
    "header_title": "Battlezone 1980",
    "header_subtitle": "A vector tank arcade experience.",
    "footer_text": "Built on Daily Flyer Engine.",
}
ASSETS = Path(__file__).with_name("battlezone_assets")


def build_theme_page(date_str=None, seed=None):
    today = date.fromisoformat(date_str) if date_str else datetime.now(ZoneInfo("America/New_York")).date()
    mission_seed = int(seed if seed is not None else today.strftime("%Y%m%d")) % (2**32)
    screen = (ASSETS / "screen.html").read_text(encoding="utf-8")
    screen = screen.replace("__SEED__", str(mission_seed)).replace("__DATE__", today.isoformat())
    screen = screen.replace("__DATE_POLICY__", "fixed" if date_str is not None or seed is not None else "live")
    return PageContext(
        **THEME_CONFIG, today_str=today.isoformat(),
        cards=[CardItem(card_type="battlezone", eyebrow="Arcade", title="Vector combat", body=screen)],
        metadata={"theme_name": "battlezone_1980", "mission_seed": mission_seed,
                  "extra_css": (ASSETS / "style.css").read_text(encoding="utf-8"),
                  "extra_js": "\n".join((ASSETS / name).read_text(encoding="utf-8")
                                         for name in ("core.js", "view.js", "controller.js"))},
    )
