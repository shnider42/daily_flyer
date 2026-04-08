from __future__ import annotations

from importlib import import_module

from daily_flyer.theme_validation import ThemeNotFoundError, validate_theme_module


def load_theme(theme_name: str):
    module_path = f"daily_flyer.themes.{theme_name}"

    try:
        theme = import_module(module_path)
    except ModuleNotFoundError as exc:
        if exc.name == module_path:
            raise ThemeNotFoundError(f"Unknown theme: {theme_name}") from exc
        raise

    validate_theme_module(theme, theme_name)
    return theme
