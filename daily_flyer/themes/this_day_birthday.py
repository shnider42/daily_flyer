from __future__ import annotations

# Compatibility wrapper: keep the public theme name and URL stable while the
# birthday implementation lives in a more modular, keyword-weighted module.
from daily_flyer.themes.this_day_birthday_weighted import (  # noqa: F401
    CURATED_CARD_ORDER,
    THEME_CONFIG,
    THEME_NAME,
    WEIGHT_PROFILE_NAME,
    build_theme_page,
)
