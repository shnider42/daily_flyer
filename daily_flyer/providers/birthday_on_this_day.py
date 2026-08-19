from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from functools import lru_cache
from typing import Any

from daily_flyer import config
from daily_flyer.curated_fact_store import CuratedFact
from daily_flyer.utils import safe_get


# The birthday theme is intentionally light and whimsical. The general Wikipedia
# day feed contains plenty of tragedy/war material, so skip obvious poor fits here
# before the normal birthday-family weighting gets a second chance to filter it.
BLOCKED_DYNAMIC_TERMS = {
    "assassinat",
    "bombing",
    "crash",
    "death",
    "dies",
    "died",
    "disaster",
    "earthquake",
    "execution",
    "explosion",
    "funeral",
    "killed",
    "massacre",
    "murder",
    "shooting",
    "suicide",
    "terror",
    "war",
}

GROUP_CARD_TYPES = {
    "events": "this_day_history",
    "births": "famous_person_birthday",
    "holidays": "fun_fact",
}


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def _is_birthday_friendly(text: str) -> bool:
    lowered = text.lower()
    # Word-start matching keeps "war" out without accidentally rejecting
    # "award", and keeps "dies" from matching words such as "studies".
    return not any(
        re.search(rf"\b{re.escape(term)}", lowered)
        for term in BLOCKED_DYNAMIC_TERMS
    )


def _first_page(item: dict[str, Any]) -> dict[str, Any]:
    pages = item.get("pages") or []
    if not isinstance(pages, list):
        return {}
    for page in pages:
        if isinstance(page, dict):
            return page
    return {}


def _page_title(page: dict[str, Any]) -> str:
    titles = page.get("titles") or {}
    if isinstance(titles, dict):
        normalized = _clean_text(titles.get("normalized"))
        if normalized:
            return normalized
    return _clean_text(page.get("normalizedtitle") or page.get("displaytitle") or page.get("title"))


def _page_url(page: dict[str, Any], target: date) -> str:
    content_urls = page.get("content_urls") or {}
    if isinstance(content_urls, dict):
        desktop = content_urls.get("desktop") or {}
        if isinstance(desktop, dict):
            page_url = _clean_text(desktop.get("page"))
            if page_url:
                return page_url
    return f"https://en.wikipedia.org/wiki/{target.strftime('%B')}_{target.day}"


def _headline(group: str, item: dict[str, Any], text: str, page: dict[str, Any]) -> str:
    page_title = _page_title(page)
    year = item.get("year")

    if group == "births" and page_title:
        return f"{page_title}'s Birthday"
    if group == "holidays" and page_title:
        return page_title
    if page_title:
        return f"{year}: {page_title}" if year else page_title

    shortened = text if len(text) <= 88 else f"{text[:85].rstrip()}…"
    return f"{year}: {shortened}" if year else shortened


def _fact_from_item(
    group: str,
    item: dict[str, Any],
    index: int,
    target: date,
) -> CuratedFact | None:
    text = _clean_text(item.get("text"))
    if not text or not _is_birthday_friendly(text):
        return None

    page = _first_page(item)
    title = _headline(group, item, text, page)
    year = item.get("year")
    body = f"{year} — {text}" if year and not text.startswith(str(year)) else text
    fact_id = f"wikipedia_{group}_{target.month:02d}{target.day:02d}_{year or 'na'}_{index:03d}"

    return CuratedFact(
        fact_id=fact_id,
        card_type=GROUP_CARD_TYPES[group],
        title=title,
        body=body,
        source_name="Wikipedia On This Day",
        source_url=_page_url(page, target),
        verified=False,
        status="approved",
        tone="fun" if group in {"births", "holidays"} else "educational",
        tags=["wikipedia", "source_backed", "exact_date", group],
        month=target.month,
        day=target.day,
        notes="Live exact-date item from Wikipedia's On This Day feed.",
    )


def facts_from_payload(payload: dict[str, Any], target: date) -> list[CuratedFact]:
    facts: list[CuratedFact] = []
    for group in ("events", "births", "holidays"):
        items = payload.get(group) or []
        if not isinstance(items, list):
            continue
        for index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            fact = _fact_from_item(group, item, index, target)
            if fact is not None:
                facts.append(fact)
    return facts


def _fetch_group(kind: str, month: int, day: int) -> list[dict[str, Any]]:
    url = config.WIKIPEDIA_ONTHISDAY_TYPE_URL.format(
        kind=kind,
        month=month,
        day=day,
    )
    try:
        response = safe_get(
            url,
            timeout=3,
            headers={"Accept": "application/json"},
        )
        payload = response.json()
        if not isinstance(payload, dict):
            return []
        items = payload.get(kind) or []
        return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []
    except Exception:
        return []


@lru_cache(maxsize=366)
def _fetch_for_month_day(month: int, day: int) -> tuple[CuratedFact, ...]:
    # The documented `all` feed is large and can be slow. Three smaller feeds in
    # parallel are faster and also better match the birthday vibe: Wikipedia's
    # hand-selected anniversaries, famous births, and fixed holidays.
    with ThreadPoolExecutor(max_workers=3) as executor:
        selected_future = executor.submit(_fetch_group, "selected", month, day)
        births_future = executor.submit(_fetch_group, "births", month, day)
        holidays_future = executor.submit(_fetch_group, "holidays", month, day)

        payload = {
            "events": selected_future.result(),
            "births": births_future.result(),
            "holidays": holidays_future.result(),
        }

    target = date(2000, month, day)
    return tuple(facts_from_payload(payload, target))


def fetch_birthday_on_this_day(target: date) -> list[CuratedFact]:
    # This is enrichment, not a hard dependency. Individual group failures return
    # an empty list, and the curated birthday banks continue rendering normally.
    return list(_fetch_for_month_day(target.month, target.day))
