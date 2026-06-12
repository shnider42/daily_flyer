from __future__ import annotations

"""
Public F9 theme entry point.

The implementation lives in f9_engine_v2 so `--theme f9` keeps working while
the visual system can diverge heavily from the default Daily Flyer shell.
"""

from daily_flyer.themes.f9_engine_v2 import (  # noqa: F401
    BACKGROUND_CADENCE,
    BACKGROUNDS,
    THEME_CONFIG,
    build_theme_page,
)
