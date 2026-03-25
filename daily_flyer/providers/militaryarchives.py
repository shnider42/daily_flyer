from __future__ import annotations

from typing import Optional

from daily_flyer import config
from daily_flyer.providers.base import html_soup
from daily_flyer.utils import safe_get


MILITARY_ARCHIVES_URL = "https://www.militaryarchives.ie/collections/online-collections"


def fetch_military_archives_highlight() -> Optional[tuple[str, str]]:
    """
    Attempt to pull a featured/highlight item from MilitaryArchives.ie.
    This is heuristic-based since the site does not have a public API.

    Returns:
        (headline, source_url) or None
    """
    try:
        response = safe_get(MILITARY_ARCHIVES_URL)
        soup = html_soup(response.text)

        # Heuristic: look for first content block / link
        # This may need tweaking depending on site changes
        candidate = soup.select_one("a")  # fallback: first link

        if not candidate:
            return None

        text = candidate.get_text(strip=True)
        href = candidate.get("href")

        if not text or len(text) < 10:
            return None

        # Normalize relative URLs
        if href and href.startswith("/"):
            href = f"https://www.militaryarchives.ie{href}"

        return text, href or MILITARY_ARCHIVES_URL

    except Exception:
        return None