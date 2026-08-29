from __future__ import annotations

from daily_flyer.themes import garage_journey_v12 as base

THEME_NAME = "garage_journey_v13"
THEME_CONFIG = base.THEME_CONFIG
VEHICLES = base.VEHICLES

# v13 keeps v12's behavior and markup intact, but stops embedding the entire
# accumulated Garage Journey CSS/JS payload inside every HTML response.
# The web layer serves these as versioned, long-cacheable assets instead.
ASSET_CSS_PATH = "/garage-journey-assets-v13.css"
ASSET_JS_PATH = "/garage-journey-assets-v13.js"

_COMPILED_JS: str | None = None


def asset_css() -> str:
    # v12.EXTRA_CSS already contains the complete inherited Garage stylesheet.
    return base.EXTRA_CSS


def asset_js() -> str:
    global _COMPILED_JS
    if _COMPILED_JS is None:
        # The effective JavaScript is assembled through the historical theme
        # layers at build time. Compile it once per worker, then reuse it.
        context = base.build_theme_page()
        _COMPILED_JS = context.metadata.get("extra_js", "") or ""
    return _COMPILED_JS


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    global _COMPILED_JS

    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata["theme_name"] = THEME_NAME

    # Capture the fully assembled JS from v12 before removing it from HTML.
    _COMPILED_JS = context.metadata.get("extra_js", "") or ""

    existing_head = context.metadata.get("extra_head_html", "") or ""
    context.metadata["extra_css"] = ""
    context.metadata["extra_js"] = ""
    context.metadata["extra_head_html"] = (
        existing_head
        + f'<link rel="stylesheet" href="{ASSET_CSS_PATH}">'
        + f'<script defer src="{ASSET_JS_PATH}"></script>'
    )
    return context
