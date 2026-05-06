from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Protocol


DEFAULT_KEYWORD_WEIGHTS_FILE = Path("content_keyword_weights.json")
DEFAULT_PROFILE_NAME = "default"


class WeightedContent(Protocol):
    title: str
    body: str
    tags: list[str]


@dataclass(frozen=True)
class KeywordWeightProfile:
    name: str
    description: str = ""
    keyword_weights: dict[str, float] = field(default_factory=dict)
    title_multiplier: float = 1.4
    body_multiplier: float = 1.0
    tag_multiplier: float = 0.75
    primary_floor: float = -8.0
    copy_floor: float = -4.0


def _safe_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _compile_keyword_pattern(keyword: str) -> re.Pattern[str]:
    clean = keyword.strip().lower()
    escaped = re.escape(clean)
    if re.fullmatch(r"[a-z0-9_ -]+", clean):
        escaped = escaped.replace(r"\ ", r"\s+")
        return re.compile(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", re.IGNORECASE)
    return re.compile(escaped, re.IGNORECASE)


def load_keyword_profiles(path: str | Path = DEFAULT_KEYWORD_WEIGHTS_FILE) -> dict[str, KeywordWeightProfile]:
    weights_path = Path(path)
    if not weights_path.exists():
        return {
            DEFAULT_PROFILE_NAME: KeywordWeightProfile(
                name=DEFAULT_PROFILE_NAME,
                description="Built-in neutral profile used when no content_keyword_weights.json file exists.",
            )
        }

    data = json.loads(weights_path.read_text(encoding="utf-8"))
    raw_profiles = data.get("profiles", {}) if isinstance(data, dict) else {}
    profiles: dict[str, KeywordWeightProfile] = {}

    for name, raw in raw_profiles.items():
        if not isinstance(raw, dict):
            continue
        keyword_weights = raw.get("keyword_weights", {}) or {}
        if not isinstance(keyword_weights, dict):
            keyword_weights = {}
        profiles[str(name)] = KeywordWeightProfile(
            name=str(name),
            description=str(raw.get("description", "") or ""),
            keyword_weights={str(k).strip().lower(): _safe_float(v, 0.0) for k, v in keyword_weights.items() if str(k).strip()},
            title_multiplier=_safe_float(raw.get("title_multiplier"), 1.4),
            body_multiplier=_safe_float(raw.get("body_multiplier"), 1.0),
            tag_multiplier=_safe_float(raw.get("tag_multiplier"), 0.75),
            primary_floor=_safe_float(raw.get("primary_floor"), -8.0),
            copy_floor=_safe_float(raw.get("copy_floor"), -4.0),
        )

    if DEFAULT_PROFILE_NAME not in profiles:
        profiles[DEFAULT_PROFILE_NAME] = KeywordWeightProfile(name=DEFAULT_PROFILE_NAME)

    return profiles


def load_keyword_weight_profile(
    profile_name: str = DEFAULT_PROFILE_NAME,
    path: str | Path = DEFAULT_KEYWORD_WEIGHTS_FILE,
) -> KeywordWeightProfile:
    profiles = load_keyword_profiles(path)
    return profiles.get(profile_name) or profiles.get(DEFAULT_PROFILE_NAME) or KeywordWeightProfile(name=profile_name)


def score_text(text: str, profile: KeywordWeightProfile) -> float:
    haystack = str(text or "").lower()
    if not haystack or not profile.keyword_weights:
        return 0.0

    score = 0.0
    for keyword, weight in profile.keyword_weights.items():
        if not keyword or weight == 0:
            continue
        matches = _compile_keyword_pattern(keyword).findall(haystack)
        if matches:
            score += weight * len(matches)
    return score


def keyword_hits(text: str, profile: KeywordWeightProfile) -> dict[str, int]:
    haystack = str(text or "").lower()
    hits: dict[str, int] = {}
    if not haystack or not profile.keyword_weights:
        return hits

    for keyword in profile.keyword_weights:
        matches = _compile_keyword_pattern(keyword).findall(haystack)
        if matches:
            hits[keyword] = len(matches)
    return hits


def score_content_item(item: WeightedContent, profile: KeywordWeightProfile) -> float:
    title = str(getattr(item, "title", "") or "")
    body = str(getattr(item, "body", "") or "")
    tags: Iterable[str] = getattr(item, "tags", []) or []
    tag_text = " ".join(str(tag) for tag in tags)
    return (
        score_text(title, profile) * profile.title_multiplier
        + score_text(body, profile) * profile.body_multiplier
        + score_text(tag_text, profile) * profile.tag_multiplier
    )


def is_copy_friendly(item: WeightedContent, profile: KeywordWeightProfile) -> bool:
    return score_content_item(item, profile) >= profile.copy_floor


def is_primary_friendly(item: WeightedContent, profile: KeywordWeightProfile) -> bool:
    return score_content_item(item, profile) >= profile.primary_floor
