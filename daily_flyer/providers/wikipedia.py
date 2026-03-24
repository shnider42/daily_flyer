from __future__ import annotations

import datetime as dt
from typing import Optional

from daily_flyer import config
from daily_flyer.providers.base import first_sentence
from daily_flyer.utils import safe_get


IRISH_KEYWORDS = [
    "Ireland",
    "Irish",
    "Dublin",
    "Belfast",
    "Cork",
    "Limerick",
    "Galway",
    "Ulster",
    "Leinster",
    "Munster",
    "Connacht",
    "Gaelic",
    "Hurling",
    "Sinn Féin",
    "IRA",
    "GAA",
    "Éire",
    "Northern Ireland",
]


def fetch_irish_on_this_day(today: dt.date) -> Optional[tuple[str, str]]:
    url = config.WIKIPEDIA_ONTHISDAY_URL.format(month=today.month, day=today.day)

    try:
        response = safe_get(url, headers={"Accept": "application/json"})
        data = response.json()

        for group_name in ("events", "births", "deaths"):
            for item in data.get(group_name, []):
                text = item.get("text", "")
                year = item.get("year")
                if any(keyword in text for keyword in IRISH_KEYWORDS):
                    return f"{year} — {text}", "https://en.wikipedia.org/wiki/Portal:Ireland"
    except Exception:
        return None

    return None


def fetch_summary_trivia(*titles: str) -> Optional[tuple[str, str]]:
    for title in titles:
        url = config.WIKIPEDIA_SUMMARY_URL.format(title=title.replace(" ", "%20"))

        try:
            response = safe_get(url, headers={"Accept": "application/json"})
            data = response.json()
            extract = (data.get("extract") or "").strip()
            if extract:
                return first_sentence(extract), f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"
        except Exception:
            continue

    return None