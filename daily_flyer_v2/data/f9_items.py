from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

F9_ITEMS_PATH = Path(__file__).with_name("f9_items.json")


@lru_cache(maxsize=1)
def load_f9_items() -> list[dict[str, Any]]:
    """Load the small curated F9 item catalog.

    This intentionally stays JSON-backed and local-image-first. A larger future
    version could swap this loader for a richer metadata source, but the page
    should not scrape or hotlink a live item database.
    """
    try:
        raw_items = json.loads(F9_ITEMS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []

    items: list[dict[str, Any]] = []
    for raw in raw_items if isinstance(raw_items, list) else []:
        if not isinstance(raw, dict):
            continue
        item_id = str(raw.get("id") or raw.get("name") or "").strip()
        name = str(raw.get("name") or item_id).strip()
        if not item_id or not name:
            continue
        caption = str(raw.get("caption") or raw.get("body") or "").strip()
        items.append(
            {
                "id": item_id,
                "name": name,
                "category": str(raw.get("category") or "").strip(),
                "rarity": str(raw.get("rarity") or "").strip(),
                "image_url": str(raw.get("image_url") or "").strip(),
                "source_url": str(raw.get("source_url") or "").strip(),
                "source_name": str(raw.get("source_name") or "Source").strip(),
                "caption": caption,
                "body": caption,
                "rights_note": str(raw.get("rights_note") or "").strip(),
            }
        )
    return items
