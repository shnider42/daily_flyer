from __future__ import annotations

import csv
import random
import re
from collections import defaultdict
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
F9_ITEM_ROOT = REPO_ROOT / "static" / "f9" / "items"
F9_ITEM_MANIFEST_PATH = F9_ITEM_ROOT / "manifest.csv"

F9_ITEM_CATEGORY_ORDER = [
    "bodies",
    "toppers",
    "decals",
    "boosts",
    "paint_finishes",
    "wheels",
    "antennas",
    "goal_explosions",
    "trails",
    "player_anthems",
    "player_banners",
    "avatar_borders",
    "engine_audio",
    "titles",
]

F9_ITEM_CATEGORY_LABELS = {
    "bodies": "Body",
    "toppers": "Topper",
    "decals": "Decal",
    "boosts": "Boost",
    "paint_finishes": "Paint Finish",
    "wheels": "Wheel",
    "antennas": "Antenna",
    "goal_explosions": "Goal Explosion",
    "trails": "Trail",
    "player_anthems": "Player Anthem",
    "player_banners": "Player Banner",
    "avatar_borders": "Avatar Border",
    "engine_audio": "Engine Audio",
    "titles": "Title",
}


def _active_folder(value: str) -> bool:
    return bool(value) and not value.strip().lower().startswith("x-")


def _safe_int(value: object) -> int:
    try:
        return int(str(value or "0").strip() or 0)
    except ValueError:
        return 0


def _item_id(category: str, filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"^\d+_", "", stem)
    return f"{category}:{stem}"


def _display_name(name: str, variant: str) -> str:
    if variant and variant.lower() != "default" and variant.lower() not in name.lower():
        return f"{name} — {variant}"
    return name


@lru_cache(maxsize=1)
def load_f9_item_library() -> list[dict[str, Any]]:
    """Load the categorized local F9 item image library.

    The source of truth is static/f9/items/manifest.csv. Rows whose real image
    folder begins with ``x-`` are intentionally ignored because those folders are
    staging/empty buckets, not displayable item categories.
    """
    if not F9_ITEM_MANIFEST_PATH.exists():
        return []

    items: list[dict[str, Any]] = []
    with F9_ITEM_MANIFEST_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            raw_category = str(row.get("category") or "").strip()
            filename = str(row.get("filename") or "").strip().replace("\\", "/")
            name = str(row.get("item_name") or "").strip()
            if not raw_category or not filename or not name:
                continue

            parts = [part for part in Path(filename).parts if part not in {"", "."}]
            folder_category = parts[0] if parts else raw_category
            if not _active_folder(raw_category) or not _active_folder(folder_category):
                continue

            asset_path = F9_ITEM_ROOT / filename
            if not asset_path.exists():
                continue

            category = folder_category
            variant = str(row.get("variant_name") or "").strip()
            label = F9_ITEM_CATEGORY_LABELS.get(category, category.replace("_", " ").title())
            rank = _safe_int(row.get("rank"))
            display_name = _display_name(name, variant)
            source = str(row.get("source_type") or row.get("source") or "local library").strip()
            notes = str(row.get("notes") or "").strip()
            items.append(
                {
                    "id": _item_id(category, filename),
                    "name": name,
                    "display_name": display_name,
                    "variant": variant,
                    "category": category,
                    "category_label": label,
                    "rank": rank,
                    "image_url": f"/static/f9/items/{filename}",
                    "filename": filename,
                    "width": str(row.get("width") or "").strip(),
                    "height": str(row.get("height") or "").strip(),
                    "source_type": source,
                    "confidence": str(row.get("confidence") or "").strip(),
                    "notes": notes,
                }
            )

    return items


@lru_cache(maxsize=1)
def load_f9_items_by_category() -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in load_f9_item_library():
        grouped[item["category"]].append(item)
    for category_items in grouped.values():
        category_items.sort(key=lambda item: (item.get("rank") or 0, item.get("display_name") or item.get("name") or ""))
    return dict(grouped)


def _active_categories(grouped: dict[str, list[dict[str, Any]]]) -> list[str]:
    ordered = [category for category in F9_ITEM_CATEGORY_ORDER if grouped.get(category) and _active_folder(category)]
    extras = sorted(category for category in grouped if category not in ordered and _active_folder(category))
    return ordered + extras


def select_f9_item_type_cards(selected_date: date, seed: int, count: int = 4) -> list[dict[str, Any]]:
    """Pick four item-type-of-the-day cards for the selected date.

    First select non-empty, non-``x-`` categories deterministically for the day,
    then select one item inside each chosen category.
    """
    grouped = load_f9_items_by_category()
    categories = _active_categories(grouped)
    if not categories:
        return []

    day_key = selected_date.toordinal()
    category_rng = random.Random(f"f9-item-categories:{day_key}:{seed}")
    chosen_categories = category_rng.sample(categories, k=min(count, len(categories)))

    cards: list[dict[str, Any]] = []
    for category in chosen_categories:
        category_items = grouped[category]
        category_index = F9_ITEM_CATEGORY_ORDER.index(category) if category in F9_ITEM_CATEGORY_ORDER else categories.index(category)
        item = category_items[(day_key + seed + category_index * 17) % len(category_items)]
        label = item["category_label"]
        source_type = item.get("source_type") or "local library"
        confidence = item.get("confidence") or ""
        cards.append(
            {
                "kind": f"item_{category}",
                "label": f"{label} of the day",
                "title": item.get("display_name") or item["name"],
                "body": f"Daily {label.lower()} pick from the local F9 item library.",
                "image_url": item["image_url"],
                "chips": ["daily", label, f"#{item.get('rank') or '?'}"],
                "category": category,
                "category_label": label,
                "source_type": source_type,
                "confidence": confidence,
                "notes": item.get("notes") or "",
            }
        )
    return cards


# Backward-compatible name for earlier tests/imports.
def load_f9_items() -> list[dict[str, Any]]:
    return load_f9_item_library()
