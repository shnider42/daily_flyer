"""Add a static Cars/Guitars switch; preserve the complete v17 car experience."""
from __future__ import annotations

from daily_flyer.themes import garage_journey_v17 as base
from daily_flyer.themes.journey_mode import MODE_CSS, mode_bar

THEME_NAME = 'garage_journey_v18'
THEME_CONFIG = dict(base.THEME_CONFIG)
VEHICLES = base.VEHICLES
EXTRA_CSS = base.EXTRA_CSS + MODE_CSS


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    if not context.cards or 'gj-shell' not in context.cards[0].body:
        raise ValueError('Garage v18 expected the v17 Garage shell in the first card')
    # Prepend rather than rewrite the existing shell; all v17 event handlers,
    # car catalog values, selectors and local-storage keys remain unchanged.
    context.cards[0].body = mode_bar('cars') + context.cards[0].body
    context.metadata['theme_name'] = THEME_NAME
    context.metadata['extra_css'] = context.metadata.get('extra_css', '') + MODE_CSS
    return context
