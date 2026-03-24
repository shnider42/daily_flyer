from __future__ import annotations

from typing import Optional

from daily_flyer import config
from daily_flyer.providers.base import html_soup
from daily_flyer.utils import safe_get


def fetch_gaeilge_word_hint() -> Optional[dict]:
    try:
        response = safe_get(config.GA_WIKTIONARY_MAIN_URL)
        soup = html_soup(response.text)

        candidate_root = soup.select_one("#mp-upper, #mw-content-text") or soup
        term_el = candidate_root.find(["b", "strong", "a", "h2", "h3"])

        if not term_el:
            return None

        term = term_el.get_text(strip=True)
        if not term or len(term) < 2 or len(term) > 40:
            return None

        return {
            "native_text": term,
            "english": "Irish entry (from Wiktionary)",
            "pronunciation": "",
            "source_url": config.GA_WIKTIONARY_MAIN_URL,
        }
    except Exception:
        return None