"""BREACH: an original browser FPS on DailyFlyer's custom theme contract."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

from daily_flyer.models import PageContext


THEME_CONFIG = {
    "page_title": "BREACH — DailyFlyer Arcade",
    "header_title": "BREACH",
    "header_subtitle": "Restore the power. Find a way out.",
    "footer_text": "An original game built on DailyFlyer.",
}

ASSET_DIRECTORY = Path(__file__).with_name("breach_assets")
VERSION = "0.8.3"


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = date.fromisoformat(date_str) if date_str else date.today()
    mission_seed = 1707 if seed is None else int(seed)
    if abs(mission_seed) > 2**31 - 1:
        raise ValueError("Mission seed must fit in a signed 32-bit integer.")
    config = {
        "version": VERSION,
        "mission": "blacksite-07",
        "seed": mission_seed,
        "date": today.isoformat(),
        "engine": "DailyFlyer",
        "coopServer": os.environ.get("BREACH_COOP_SERVER", ""),
    }
    document = (ASSET_DIRECTORY / "index.html").read_text(encoding="utf-8")
    document = document.replace("__BREACH_CONFIG__", json.dumps(config).replace("<", "\\u003c"))
    document = document.replace("__BREACH_BASE__", "/daily_flyer/themes/breach_assets/")
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.isoformat(),
        cards=[],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={"standalone_html": document, "theme": "breach", "version": VERSION},
    )
