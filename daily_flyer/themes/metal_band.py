"""First Riff: a self-contained metal-band starter workspace for Daily Flyer."""
from pathlib import Path

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "First Riff — Build your band",
    "header_title": "First Riff",
    "header_subtitle": "From the first rehearsal to the first show.",
    "footer_text": "First Riff · Built on Daily Flyer.",
}

_ASSETS = Path(__file__).with_name("metal_band_assets")


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    # Inline this theme's own assets through the existing DFE contract. This also
    # keeps CLI-generated pages portable, without changing the shared renderer.
    return PageContext(
        **THEME_CONFIG,
        today_str=today.isoformat(),
        cards=[CardItem(
            card_type="metal_band",
            eyebrow="Band workspace",
            title="First Riff",
            body=(_ASSETS / "workspace.html").read_text(encoding="utf-8"),
        )],
        metadata={
            "theme_name": "metal_band",
            "extra_css": (_ASSETS / "workspace.css").read_text(encoding="utf-8"),
            "extra_js": (_ASSETS / "workspace.js").read_text(encoding="utf-8"),
        },
    )
