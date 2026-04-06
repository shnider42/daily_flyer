from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DEFAULT_BIRTHDAYS_FILE = "birthdays.json"


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def normalize_phone(raw: str) -> str:
    raw = (raw or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())

    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]

    if len(digits) == 10:
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    return raw


def load_birthdays(path: str | Path = DEFAULT_BIRTHDAYS_FILE) -> list[dict[str, Any]]:
    birthday_path = Path(path)
    if not birthday_path.exists():
        return []

    data = json.loads(birthday_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("birthdays.json must contain a JSON array.")

    cleaned: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        entry = dict(item)
        if entry.get("phone"):
            entry["phone"] = normalize_phone(str(entry["phone"]))
        cleaned.append(entry)

    return cleaned


def birthdays_for_date(
    birthdays: list[dict[str, Any]],
    month: int,
    day: int,
) -> list[dict[str, Any]]:
    hits = [
        b for b in birthdays
        if _safe_int(b.get("month")) == month and _safe_int(b.get("day")) == day
    ]

    def sort_key(x: dict[str, Any]) -> str:
        name = str(x.get("name", "")).strip()
        parts = name.split()
        last = parts[-1] if parts else ""
        return f"{last}|{name}".lower()

    return sorted(hits, key=sort_key)


def build_birthday_index(birthdays: list[dict[str, Any]]) -> dict[str, list[str]]:
    idx: dict[str, list[str]] = {}

    for b in birthdays:
        m = _safe_int(b.get("month"))
        d = _safe_int(b.get("day"))
        if not (1 <= m <= 12 and 1 <= d <= 31):
            continue

        name = str(b.get("name", "")).strip()
        if not name:
            continue

        key = f"{m:02d}-{d:02d}"
        idx.setdefault(key, []).append(name)

    for key in idx:
        idx[key] = sorted(idx[key], key=str.lower)

    return idx


def people_to_phone_list(birthdays: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []

    for b in birthdays:
        phone = normalize_phone(str(b.get("phone", "")).strip())
        if not phone:
            continue

        label = str(b.get("name", "")).strip()
        if not label:
            continue

        out.append({"phone": phone, "label": label})

    seen: set[str] = set()
    deduped: list[dict[str, str]] = []

    for item in out:
        digits = "".join(ch for ch in item["phone"] if ch.isdigit())
        if digits and digits not in seen:
            seen.add(digits)
            deduped.append(item)

    return deduped


def phones_to_to_field_text(phones: list[dict[str, str]]) -> str:
    return ", ".join(
        p["phone"].strip()
        for p in phones
        if p.get("phone", "").strip()
    )


def filter_phones_excluding_birthday_people(
    phones: list[dict[str, str]],
    birthday_hits: list[dict[str, Any]],
) -> list[dict[str, str]]:
    exclude_digits = {
        "".join(ch for ch in str(h.get("phone", "")) if ch.isdigit())
        for h in birthday_hits
        if str(h.get("phone", "")).strip()
    }

    if not exclude_digits:
        return phones

    kept: list[dict[str, str]] = []
    for item in phones:
        digits = "".join(ch for ch in str(item.get("phone", "")) if ch.isdigit())
        if digits and digits in exclude_digits:
            continue
        kept.append(item)

    return kept
