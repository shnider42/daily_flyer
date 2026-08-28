from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import garage_journey_v2 as base


THEME_NAME = "garage_journey_v3"
THEME_CONFIG = base.THEME_CONFIG
VEHICLES = base.VEHICLES
EXTRA_CSS = base.EXTRA_CSS
EXTRA_JS = base.EXTRA_JS


def _garage_body() -> str:
    body = base._garage_body()
    body = body.replace(
        '<strong>2004 BMW 330Ci</strong><p>E46 coupe • M54B30 3.0L inline-six.</p>',
        '<strong>Vehicle identity</strong><p>Make, model, year, body configuration and powertrain for this specific Garage vehicle.</p>',
    )
    body = body.replace(
        'The BMW becomes the first individual car inside the Garage Journey proof of concept.',
        'This vehicle exists as an individual car inside Garage Journey, separate from its reusable make/model/year knowledge definition.',
    )
    return body


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=[CardItem(card_type="garage_journey", eyebrow="", title="", body=_garage_body())],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": EXTRA_CSS,
            "extra_js": EXTRA_JS,
            "extra_head_html": '<meta name="theme-color" content="#0d0e0e">',
        },
    )
