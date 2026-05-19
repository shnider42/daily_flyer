from __future__ import annotations

import random
from typing import Optional


DAVY_WEBSITE_URL = "https://davyholdenhistory.com"
DAVY_INSTAGRAM_URL = "https://www.instagram.com/davy_holden/"
DAVY_YOUTUBE_URL = "https://www.youtube.com/@davyholden"


_CHANNEL_URLS = {
    "Website": DAVY_WEBSITE_URL,
    "Instagram": DAVY_INSTAGRAM_URL,
    "YouTube": DAVY_YOUTUBE_URL,
}


_CURATED_CONTENT = [
    {
        "title": "Featured from Davy Holden History",
        "snippet": (
            "A website-first spotlight slot for Davy’s strongest Irish-history piece, "
            "whether that is a featured article, a themed collection, or a client-facing landing page."
        ),
        "source_name": "Website",
        "media_type": "article",
        "source_url": DAVY_WEBSITE_URL,
        "thumbnail_url": None,
    },
    {
        "title": "Instagram history reel",
        "snippet": (
            "A short-form Irish-history card designed to push visitors toward Davy’s Instagram presence "
            "for faster, more visual storytelling and shareable clips."
        ),
        "source_name": "Instagram",
        "media_type": "short_video",
        "source_url": DAVY_INSTAGRAM_URL,
        "thumbnail_url": None,
    },
    {
        "title": "YouTube history feature",
        "snippet": (
            "A long-form explainer slot for deeper Irish-history storytelling, ideal for a featured video, "
            "a lecture-style upload, or a richer client spotlight."
        ),
        "source_name": "YouTube",
        "media_type": "video",
        "source_url": DAVY_YOUTUBE_URL,
        "thumbnail_url": None,
    },
    {
        "title": "Client spotlight slot",
        "snippet": (
            "A flexible promotion slot for an event, collaboration, guided history feature, "
            "talk, article, or anything Davy wants Irish Today to amplify."
        ),
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