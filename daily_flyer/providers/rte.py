from __future__ import annotations

from typing import Optional

from daily_flyer import config
from daily_flyer.providers.base import html_soup
from daily_flyer.utils import safe_get


def fetch_top_story() -> Optional[dict]:
    try:
        response = safe_get(config.RTE_NEWS_URL)
        soup = html_soup(response.text)

        article = soup.select_one("article") or soup.find("div", class_="top-story")
        if not article:
            return None

        headline_el = article.find(["h1", "h2", "h3", "a"])
        snippet_el = article.find("p")

        headline = headline_el.get_text(strip=True) if headline_el else ""
        snippet = snippet_el.get_text(strip=True) if snippet_el else ""

        if headline:
            return {
                "headline": headline,
                "snippet": snippet,
                "source_url": config.RTE_NEWS_URL,
            }
    except Exception:
        return None

    return None


def fetch_sport_spotlight() -> Optional[tuple[str, str]]:
    try:
        response = safe_get(config.RTE_SPORT_URL)
        soup = html_soup(response.text)

        article = soup.select_one("article")
        if not article:
            return None

        headline_el = article.find(["h1", "h2", "h3", "a"])
        if not headline_el:
            return None

        headline = headline_el.get_text(strip=True)
        if headline:
            return headline, config.RTE_SPORT_URL
    except Exception:
        return None

    return None