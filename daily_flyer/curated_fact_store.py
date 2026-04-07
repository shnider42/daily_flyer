from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from daily_flyer.content_source_registry import CARD_TYPES


DEFAULT_CURATED_FACTS_FILE = Path("curated_facts.json")
ALLOWED_CARD_TYPES = set(CARD_TYPES)
ALLOWED_FACT_STATUSES = {"candidate", "approved", "published"}
ALLOWED_FACT_TONES = {"educational", "fun", "warm", "mom_daily", "mixed"}
ALLOWED_WEEK_MODES = {"week_of", "within_days"}


class CuratedFactValidationError(ValueError):
    pass


@dataclass(frozen=True)
class CuratedFact:
    fact_id: str
    card_type: str
    title: str
    body: str
    source_name: str
    source_url: str
    verified: bool = False
    status: str = "candidate"
    tone: str = "educational"
    tags: list[str] = field(default_factory=list)
    month: int | None = None
    day: int | None = None
    week_mode: str | None = None
    week_of_month: int | None = None
    week_of_day: int | None = None
    within_days: int | None = None
    notes: str = ""

    def cadence_label(self) -> str:
        if self.month and self.day and not self.week_mode:
            return "day_of"
        if self.week_mode == "week_of":
            return "week_of"
        if self.week_mode == "within_days":
            return "within_days"
        return "unknown"

    def matches_date(self, target: date) -> bool:
        if self.month is None:
            return False

        if self.day is not None and not self.week_mode:
            return self.month == target.month and self.day == target.day

        if self.week_mode == "week_of" and self.week_of_day is not None:
            if self.month != target.month:
                return False
            start = date(target.year, self.month, self.week_of_day) - timedelta(days=3)
            end = date(target.year, self.month, self.week_of_day) + timedelta(days=3)
            return start <= target <= end

        if self.week_mode == "within_days" and self.day is not None and self.within_days is not None:
            try:
                anchor = date(target.year, self.month, self.day)
            except ValueError:
                return False
            return abs((target - anchor).days) <= self.within_days

        return False

    def distance_from(self, target: date) -> int:
        if self.month is None:
            return 9999
        if self.day is not None:
            try:
                anchor = date(target.year, self.month, self.day)
            except ValueError:
                return 9999
            return abs((target - anchor).days)
        if self.week_mode == "week_of" and self.week_of_day is not None:
            try:
                anchor = date(target.year, self.month, self.week_of_day)
            except ValueError:
                return 9999
            return abs((target - anchor).days)
        return 9999


def _safe_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise CuratedFactValidationError(f"Expected integer-like value, got {value!r}") from exc



def _validate_fact_dict(item: dict[str, Any], index: int) -> CuratedFact:
    fact_id = str(item.get("fact_id", "")).strip()
    if not fact_id:
        raise CuratedFactValidationError(f"Fact #{index} is missing fact_id.")

    card_type = str(item.get("card_type", "")).strip()
    if card_type not in ALLOWED_CARD_TYPES:
        raise CuratedFactValidationError(
            f"Fact {fact_id!r} has unsupported card_type {card_type!r}."
        )

    title = str(item.get("title", "")).strip()
    body = str(item.get("body", "")).strip()
    source_name = str(item.get("source_name", "")).strip()
    source_url = str(item.get("source_url", "")).strip()
    if not title or not body:
        raise CuratedFactValidationError(f"Fact {fact_id!r} must have title and body.")
    if not source_name or not source_url:
        raise CuratedFactValidationError(
            f"Fact {fact_id!r} must have source_name and source_url."
        )

    verified = bool(item.get("verified", False))
    status = str(item.get("status", "candidate")).strip() or "candidate"
    tone = str(item.get("tone", "educational")).strip() or "educational"
    if status not in ALLOWED_FACT_STATUSES:
        raise CuratedFactValidationError(
            f"Fact {fact_id!r} has unsupported status {status!r}."
        )
    if tone not in ALLOWED_FACT_TONES:
        raise CuratedFactValidationError(
            f"Fact {fact_id!r} has unsupported tone {tone!r}."
        )

    month = _safe_int(item.get("month"))
    day = _safe_int(item.get("day"))
    if month is not None and not (1 <= month <= 12):
        raise CuratedFactValidationError(f"Fact {fact_id!r} has invalid month {month!r}.")
    if day is not None and not (1 <= day <= 31):
        raise CuratedFactValidationError(f"Fact {fact_id!r} has invalid day {day!r}.")

    week_mode = item.get("week_mode")
    if week_mode is not None:
        week_mode = str(week_mode).strip()
        if week_mode not in ALLOWED_WEEK_MODES:
            raise CuratedFactValidationError(
                f"Fact {fact_id!r} has unsupported week_mode {week_mode!r}."
            )

    week_of_month = _safe_int(item.get("week_of_month"))
    week_of_day = _safe_int(item.get("week_of_day"))
    within_days = _safe_int(item.get("within_days"))

    tags = item.get("tags", []) or []
    if not isinstance(tags, list):
        raise CuratedFactValidationError(f"Fact {fact_id!r} tags must be a list.")
    clean_tags = [str(tag).strip() for tag in tags if str(tag).strip()]

    notes = str(item.get("notes", "")).strip()

    return CuratedFact(
        fact_id=fact_id,
        card_type=card_type,
        title=title,
        body=body,
        source_name=source_name,
        source_url=source_url,
        verified=verified,
        status=status,
        tone=tone,
        tags=clean_tags,
        month=month,
        day=day,
        week_mode=week_mode,
        week_of_month=week_of_month,
        week_of_day=week_of_day,
        within_days=within_days,
        notes=notes,
    )



def load_curated_facts(path: str | Path = DEFAULT_CURATED_FACTS_FILE) -> list[CuratedFact]:
    fact_path = Path(path)
    if not fact_path.exists():
        return []

    data = json.loads(fact_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise CuratedFactValidationError("curated_facts.json must contain a JSON array.")

    return [_validate_fact_dict(item, index + 1) for index, item in enumerate(data)]



def approved_facts(path: str | Path = DEFAULT_CURATED_FACTS_FILE) -> list[CuratedFact]:
    return [fact for fact in load_curated_facts(path) if fact.status in {"approved", "published"}]



def facts_for_card_type(card_type: str, path: str | Path = DEFAULT_CURATED_FACTS_FILE) -> list[CuratedFact]:
    return [fact for fact in load_curated_facts(path) if fact.card_type == card_type]



def approved_facts_for_card_type(card_type: str, path: str | Path = DEFAULT_CURATED_FACTS_FILE) -> list[CuratedFact]:
    return [fact for fact in approved_facts(path) if fact.card_type == card_type]



def facts_for_date(target: date, path: str | Path = DEFAULT_CURATED_FACTS_FILE) -> list[CuratedFact]:
    return [fact for fact in approved_facts(path) if fact.matches_date(target)]



def facts_for_card_type_and_date(
    card_type: str,
    target: date,
    path: str | Path = DEFAULT_CURATED_FACTS_FILE,
) -> list[CuratedFact]:
    return [
        fact
        for fact in approved_facts_for_card_type(card_type, path)
        if fact.matches_date(target)
    ]



def select_fact_for_card_type(
    card_type: str,
    target: date,
    path: str | Path = DEFAULT_CURATED_FACTS_FILE,
    seed: int | None = None,
) -> CuratedFact | None:
    matches = facts_for_card_type_and_date(card_type, target, path)
    if not matches:
        return None

    matches = sorted(
        matches,
        key=lambda fact: (
            fact.distance_from(target),
            0 if fact.cadence_label() == "day_of" else 1,
            fact.fact_id.lower(),
        ),
    )

    best_distance = matches[0].distance_from(target)
    tightest = [fact for fact in matches if fact.distance_from(target) == best_distance]

    rng_seed = seed if seed is not None else target.toordinal()
    rng = random.Random(f"{card_type}|{target.isoformat()}|{rng_seed}")
    return rng.choice(tightest)



def card_coverage_summary(path: str | Path = DEFAULT_CURATED_FACTS_FILE) -> dict[str, int]:
    summary = {card_type: 0 for card_type in CARD_TYPES}
    for fact in approved_facts(path):
        summary[fact.card_type] = summary.get(fact.card_type, 0) + 1
    return summary



def save_curated_facts(facts: list[CuratedFact], path: str | Path = DEFAULT_CURATED_FACTS_FILE) -> None:
    fact_path = Path(path)
    payload = [asdict(fact) for fact in facts]
    fact_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
