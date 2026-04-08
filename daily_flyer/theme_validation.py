from __future__ import annotations

from collections.abc import Sequence
from typing import Any


class ThemeValidationError(ValueError):
    """Raised when a theme does not satisfy the Daily Flyer theme contract."""


class ThemeNotFoundError(ValueError):
    """Raised when a requested theme module cannot be imported."""


_REQUIRED_STRING_KEYS = (
    "page_title",
    "header_title",
    "header_subtitle",
    "footer_text",
)

_OPTIONAL_STRING_KEYS = (
    "hero_kicker",
    "hero_summary_pill",
    "word_eyebrow",
    "phrase_eyebrow",
    "history_eyebrow",
    "history_today_title",
    "history_week_title",
    "did_you_know_eyebrow",
    "did_you_know_title",
    "sport_eyebrow",
    "sport_title",
    "connection_eyebrow",
    "connection_title",
    "connection_card_type",
    "county_eyebrow",
    "default_word_title",
    "default_word_body",
    "default_sport_body",
    "header_title_image",
    "extra_css",
    "extra_js",
    "extra_head_html",
)

_BOOLEAN_KEYS = (
    "enable_word_card",
    "enable_phrase_card",
    "enable_history_card",
    "enable_did_you_know_card",
    "enable_sport_card",
    "enable_connection_card",
    "enable_county_card",
    "use_provider_sport",
    "use_provider_connection",
    "use_provider_county",
)

_INTEGER_KEYS = (
    "min_optional_cards",
    "max_optional_cards",
)

_ALLOWED_BACKGROUND_CADENCE = {"daily", "weekly"}


def validate_theme_module(theme: Any, theme_name: str | None = None) -> None:
    label = theme_name or getattr(theme, "__name__", "theme")
    config = getattr(theme, "THEME_CONFIG", None)

    if not isinstance(config, dict):
        raise ThemeValidationError(f"Theme '{label}' must define THEME_CONFIG as a dict.")

    _validate_config_dict(config, label)

    custom_builder = getattr(theme, "build_theme_page", None)
    is_custom = callable(custom_builder)

    if not is_custom:
        _validate_generic_theme_contract(theme, label, config)

    _validate_backgrounds(theme, label)


def _validate_config_dict(config: dict[str, Any], label: str) -> None:
    for key in _REQUIRED_STRING_KEYS:
        value = config.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ThemeValidationError(
                f"Theme '{label}' must define THEME_CONFIG['{key}'] as a non-empty string."
            )

    for key in _OPTIONAL_STRING_KEYS:
        if key in config and config[key] is not None and not isinstance(config[key], str):
            raise ThemeValidationError(
                f"Theme '{label}' has THEME_CONFIG['{key}'] with an invalid type; expected str."
            )

    for key in _BOOLEAN_KEYS:
        if key in config and not isinstance(config[key], bool):
            raise ThemeValidationError(
                f"Theme '{label}' has THEME_CONFIG['{key}'] with an invalid type; expected bool."
            )

    for key in _INTEGER_KEYS:
        if key in config and not isinstance(config[key], int):
            raise ThemeValidationError(
                f"Theme '{label}' has THEME_CONFIG['{key}'] with an invalid type; expected int."
            )

    min_optional = config.get("min_optional_cards", 0)
    max_optional = config.get("max_optional_cards", 0)
    if min_optional < 0 or max_optional < 0:
        raise ThemeValidationError(
            f"Theme '{label}' cannot use negative optional card counts."
        )
    if min_optional > max_optional:
        raise ThemeValidationError(
            f"Theme '{label}' has min_optional_cards greater than max_optional_cards."
        )


def _validate_generic_theme_contract(theme: Any, label: str, config: dict[str, Any]) -> None:
    enable_word = config.get("enable_word_card", True)
    enable_phrase = config.get("enable_phrase_card", True)
    enable_history = config.get("enable_history_card", True)
    enable_dyk = config.get("enable_did_you_know_card", True)
    enable_sport = config.get("enable_sport_card", True)
    enable_connection = config.get("enable_connection_card", True)
    enable_county = config.get("enable_county_card", True)

    if enable_word:
        has_words = _non_empty_sequence(getattr(theme, "WORDS", []))
        uses_dynamic_word = bool(getattr(theme, "ENABLE_DYNAMIC_WORD", False))
        has_word_defaults = bool(config.get("default_word_title")) and bool(config.get("default_word_body"))
        if not (has_words or uses_dynamic_word or has_word_defaults):
            raise ThemeValidationError(
                f"Generic theme '{label}' enables the word card but does not provide WORDS, ENABLE_DYNAMIC_WORD, or default_word_title/default_word_body."
            )

    if enable_phrase and not _non_empty_sequence(getattr(theme, "PHRASES", [])):
        raise ThemeValidationError(
            f"Generic theme '{label}' enables the phrase card but does not provide PHRASES."
        )

    if enable_history:
        has_history_this_day = _non_empty_mapping(getattr(theme, "HISTORY_THIS_DAY", {}))
        has_history_week = _non_empty_sequence(getattr(theme, "HISTORY_WEEK_EVENTS", []))
        if not (has_history_this_day or has_history_week):
            raise ThemeValidationError(
                f"Generic theme '{label}' enables the history card but does not provide HISTORY_THIS_DAY or HISTORY_WEEK_EVENTS."
            )

    if enable_dyk:
        has_dyk = _non_empty_sequence(getattr(theme, "DID_YOU_KNOW", [])) or _non_empty_sequence(
            getattr(theme, "HISTORY_GENERAL", [])
        )
        if not has_dyk:
            raise ThemeValidationError(
                f"Generic theme '{label}' enables the did-you-know card but does not provide DID_YOU_KNOW or HISTORY_GENERAL."
            )

    if enable_sport and not config.get("use_provider_sport", True):
        has_sport_pool = _non_empty_sequence(getattr(theme, "SPORTS_SPOTLIGHT", []))
        has_sport_default = bool(config.get("default_sport_body"))
        if not (has_sport_pool or has_sport_default):
            raise ThemeValidationError(
                f"Generic theme '{label}' disables provider sport content but does not provide SPORTS_SPOTLIGHT or default_sport_body."
            )

    if enable_connection and not config.get("use_provider_connection", True):
        if not _non_empty_sequence(getattr(theme, "CONNECTION_FACTS", [])):
            raise ThemeValidationError(
                f"Generic theme '{label}' disables provider connection content but does not provide CONNECTION_FACTS."
            )

    if enable_county and not config.get("use_provider_county", True):
        raise ThemeValidationError(
            f"Generic theme '{label}' enables the county card without provider support, but fallback county content is not supported yet."
        )


def _validate_backgrounds(theme: Any, label: str) -> None:
    cadence = getattr(theme, "BACKGROUND_CADENCE", "daily")
    if cadence not in _ALLOWED_BACKGROUND_CADENCE:
        raise ThemeValidationError(
            f"Theme '{label}' has invalid BACKGROUND_CADENCE '{cadence}'. Expected one of: daily, weekly."
        )

    backgrounds = getattr(theme, "BACKGROUNDS", [])
    if backgrounds in (None, []):
        return

    if not isinstance(backgrounds, Sequence) or isinstance(backgrounds, (str, bytes)):
        raise ThemeValidationError(
            f"Theme '{label}' must define BACKGROUNDS as a list of dicts."
        )

    for index, item in enumerate(backgrounds):
        if not isinstance(item, dict):
            raise ThemeValidationError(
                f"Theme '{label}' has a non-dict background entry at index {index}."
            )
        path = item.get("path")
        if not isinstance(path, str) or not path.strip():
            raise ThemeValidationError(
                f"Theme '{label}' background entry at index {index} must include a non-empty 'path'."
            )
        label_value = item.get("label")
        if label_value is not None and not isinstance(label_value, str):
            raise ThemeValidationError(
                f"Theme '{label}' background entry at index {index} has a non-string 'label'."
            )


def _non_empty_sequence(value: Any) -> bool:
    return isinstance(value, Sequence) and not isinstance(value, (str, bytes)) and len(value) > 0


def _non_empty_mapping(value: Any) -> bool:
    return isinstance(value, dict) and len(value) > 0
