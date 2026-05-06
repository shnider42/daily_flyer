from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from daily_flyer.curated_fact_store import CuratedFact, CuratedFactValidationError


DEFAULT_BIRTHDAY_THEME_FACTS_FILE = Path("birthday_theme_facts.json")
DEFAULT_BIRTHDAY_HISTORY_FACTS_FILE = Path("birthday_history_facts.json")
DEFAULT_BIRTHDAY_SUPPLEMENTAL_FACT_FILES = (
    DEFAULT_BIRTHDAY_THEME_FACTS_FILE,
    DEFAULT_BIRTHDAY_HISTORY_FACTS_FILE,
)


def _safe_int_or_none(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _fact_from_dict(item: dict[str, Any], index: int, source_path: Path) -> CuratedFact:
    fact_id = str(item.get("fact_id", "")).strip()
    card_type = str(item.get("card_type", "")).strip()
    title = str(item.get("title", "")).strip()
    body = str(item.get("body", "")).strip()
    source_name = str(item.get("source_name", "Birthday theme supplemental facts")).strip()
    source_url = str(item.get("source_url", "https://github.com/shnider42/daily_flyer")).strip()

    if not fact_id:
        raise CuratedFactValidationError(f"Birthday theme fact #{index} in {source_path} is missing fact_id.")
    if not card_type:
        raise CuratedFactValidationError(f"Birthday theme fact {fact_id!r} in {source_path} is missing card_type.")
    if not title or not body:
        raise CuratedFactValidationError(f"Birthday theme fact {fact_id!r} in {source_path} must have title and body.")

    return CuratedFact(
        fact_id=fact_id,
        card_type=card_type,
        title=title,
        body=body,
        source_name=source_name,
        source_url=source_url,
        verified=bool(item.get("verified", False)),
        status=str(item.get("status", "approved") or "approved"),
        tone=str(item.get("tone", "warm") or "warm"),
        tags=[str(tag).strip() for tag in (item.get("tags", []) or []) if str(tag).strip()],
        month=_safe_int_or_none(item.get("month")),
        day=_safe_int_or_none(item.get("day")),
        week_mode=str(item.get("week_mode", "") or "") or None,
        week_of_month=_safe_int_or_none(item.get("week_of_month")),
        week_of_day=_safe_int_or_none(item.get("week_of_day")),
        within_days=_safe_int_or_none(item.get("within_days")),
        notes=str(item.get("notes", "") or ""),
    )


def load_birthday_theme_facts(path: str | Path = DEFAULT_BIRTHDAY_THEME_FACTS_FILE) -> list[CuratedFact]:
    fact_path = Path(path)
    if not fact_path.exists():
        return []

    data = json.loads(fact_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise CuratedFactValidationError(f"{fact_path} must contain a JSON array.")

    return [_fact_from_dict(item, index + 1, fact_path) for index, item in enumerate(data) if isinstance(item, dict)]


def load_birthday_supplemental_fact_files(
    paths: Iterable[str | Path] = DEFAULT_BIRTHDAY_SUPPLEMENTAL_FACT_FILES,
) -> list[CuratedFact]:
    facts: list[CuratedFact] = []
    for path in paths:
        facts.extend(load_birthday_theme_facts(path))
    return facts


def approved_birthday_theme_facts(
    paths: Iterable[str | Path] = DEFAULT_BIRTHDAY_SUPPLEMENTAL_FACT_FILES,
) -> list[CuratedFact]:
    return [fact for fact in load_birthday_supplemental_fact_files(paths) if fact.status in {"approved", "published"}]
