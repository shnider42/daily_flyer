from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import porsche_718_cayman_gt4_2023 as base

THEME_NAME = "porsche_718_cayman_gt4_2023_v2"
THEME_CONFIG = base.THEME_CONFIG
EXTRA_CSS = base.EXTRA_CSS + r"""
.card--porsche_workspace{display:none}
.card--porsche_workspace.is-open{display:block}
"""
EXTRA_JS = base.EXTRA_JS


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=[
            CardItem(card_type="porsche_systems", eyebrow="WORKSHOP INDEX", title="Find It. Then Drill In.", body=base._body()),
            CardItem(card_type="porsche_workspace", eyebrow="WORKSPACE", title="System / Component", body=base._workspace()),
            CardItem(card_type="porsche_library", eyebrow="SOURCE LIBRARY", title="Original References", body=base._sources()),
        ],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": EXTRA_CSS,
            "extra_js": EXTRA_JS,
            "extra_head_html": '<meta name="theme-color" content="#111111">',
        },
    )
