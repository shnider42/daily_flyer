"""Afterglow: a live-music companion using the existing DFE theme contract."""
from datetime import date
from pathlib import Path
import json

from daily_flyer.models import CardItem, PageContext

THEME_NAME = "afterglow"
THEME_CONFIG = {
    "page_title": "Afterglow — Your life in live music",
    "header_title": "Afterglow",
    "header_subtitle": "Find your next night. Keep the feeling.",
    "footer_text": "An independent Daily Flyer Engine experience.",
}
ASSETS = Path(__file__).with_name("afterglow_assets")


def build_theme_page(date_str=None, seed=None):
    today = date.fromisoformat(date_str) if date_str else date.today()
    data = json.loads((ASSETS / "catalog.json").read_text(encoding="utf-8"))
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    body = (ASSETS / "shell.html").read_text(encoding="utf-8").replace("__CATALOG__", payload)
    return PageContext(
        **THEME_CONFIG, today_str=today.isoformat(),
        cards=[CardItem(card_type="afterglow", eyebrow="Live music", title="Afterglow", body=body)],
        metadata={"theme_name": THEME_NAME,
                  "extra_css": (ASSETS / "style.css").read_text(encoding="utf-8"),
                  "extra_js": (ASSETS / "app.js").read_text(encoding="utf-8")},
    )
