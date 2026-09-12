from __future__ import annotations

from daily_flyer.themes import garage_journey_v14 as base

THEME_NAME = "garage_journey_v15"
THEME_CONFIG = base.THEME_CONFIG
VEHICLES = base.VEHICLES

EXTRA_CSS = base.EXTRA_CSS + r'''
/* Real photos replace the original CSS car sketch completely. */
.gj-vehicle-visual:has(.gj-vehicle-photo)::before,
.gj-vehicle-visual:has(.gj-vehicle-photo)::after,
.gj-vehicle-visual:has(.gj-vehicle-photo) .gj-wheel{display:none!important}
'''


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata["theme_name"] = THEME_NAME
    context.metadata["extra_css"] = EXTRA_CSS
    return context
