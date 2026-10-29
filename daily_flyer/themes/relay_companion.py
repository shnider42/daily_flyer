"""An independent relay preparation prototype using the Daily Flyer theme contract."""
from pathlib import Path
from datetime import date

from daily_flyer.models import CardItem, PageContext

ASSETS = Path(__file__).with_name("relay_companion_assets")
THEME_CONFIG = {
    "page_title": "Relay Fieldguide · Reach the Beach companion",
    "header_title": "Relay Fieldguide",
    "header_subtitle": "A little preparation. A big adventure.",
    "footer_text": "An independent Daily Flyer prototype.",
}


def build_theme_page(date_str=None, seed=None):
    return PageContext(
        **THEME_CONFIG,
        today_str=(date.fromisoformat(date_str) if date_str else date.today()).isoformat(),
        cards=[CardItem("relay", "Fieldguide", "Your relay companion", (ASSETS / "app.html").read_text())],
        metadata={
            "theme_name": "relay_companion",
            "extra_css": (ASSETS / "app.css").read_text(),
            "extra_js": (ASSETS / "app.js").read_text(),
            "extra_head_html": '<meta name="description" content="An independent Reach the Beach preparation prototype: learn the relay, catch up on confirmed changes, and organize your team."><meta name="theme-color" content="#122b2a"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'14\' fill=\'%23122b2a\'/%3E%3Cpath d=\'M10 45L28 17L39 33L46 24L57 45\' fill=\'none\' stroke=\'%23e9ad7a\' stroke-width=\'4\'/%3E%3C/svg%3E">',
        },
    )
