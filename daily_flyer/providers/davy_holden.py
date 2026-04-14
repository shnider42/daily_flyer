from __future__ import annotations

import random
from typing import Optional


DAVY_WEBSITE_URL = "https://davyholdenhistory.com"


_CHANNEL_URLS = {
    "Website": DAVY_WEBSITE_URL,
    "Instagram": None,
    "YouTube": None,
}


_CURATED_CONTENT = [
    {
        "title": "Featured from Davy Holden History",
        "snippet": "Use this slot for Davy's strongest history piece of the moment, whether it begins on his site or is promoted elsewhere.",
        "source_name": "Website",
        "media_type": "article",
        "source_url": DAVY_WEBSITE_URL,
        "thumbnail_url": None,
    },
    {
        "title": "Short-form history clip",
        "snippet": "Designed for an Instagram-first or reels-style post that can highlight a fast, memorable Irish-history angle.",
        "source_name": "Instagram",
        "media_type": "short_video",
        "source_url": None,
        "thumbnail_url": None,
    },
    {
        "title": "Long-form history video",
        "snippet": "Designed for a YouTube feature, documentary segment, or deeper explainer that deserves a longer watch.",
        "source_name": "YouTube",
        "media_type": "video",
        "source_url": None,
        "thumbnail_url": None,
    },
    {
        "title": "Client spotlight slot",
        "snippet": "This is a flexible card slot for a talk, event, article, collaboration, or any piece Davy wants Irish Today to amplify.",
        "source_name": "Website",
        "media_type": "spotlight",
        "source_url": DAVY_WEBSITE_URL,
        "thumbnail_url": None,
    },
]


def _normalize_item(item: dict) -> dict[str, Optional[str]]:
    source_name = str(item.get("source_name", "")).strip() or "Website"
    source_url = item.get("source_url") or _CHANNEL_URLS.get(source_name)
    return {
        "title": str(item.get("title", "")).strip() or "From Davy Holden",
        "snippet": str(item.get("snippet", "")).strip(),
        "source_name": source_name,
        "media_type": str(item.get("media_type", "")).strip() or "article",
        "source_url": source_url,
        "thumbnail_url": item.get("thumbnail_url"),
        "published_at": item.get("published_at"),
    }


def fetch_davy_feature(rng: random.Random | None = None) -> dict[str, Optional[str]]:
    picker = rng or random.Random()
    return _normalize_item(picker.choice(_CURATED_CONTENT))


def fetch_davy_collection(limit: int = 3, rng: random.Random | None = None) -> list[dict[str, Optional[str]]]:
    if limit <= 0:
        return []

    picker = rng or random.Random()
    pool = list(_CURATED_CONTENT)
    picker.shuffle(pool)
    return [_normalize_item(item) for item in pool[:limit]]
