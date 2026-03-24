from __future__ import annotations

from importlib import import_module


def load_theme(theme_name: str):
    module_path = f"daily_flyer.themes.{theme_name}"
    return import_module(module_path)