from __future__ import annotations

import random
import re
from html import unescape

from daily_flyer.themes import irish_today as legacy_irish_today
from daily_flyer.utils import resolve_date
from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def _plain_text(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _pick_word(ctx: FlyerContext) -> dict:
    words = list(getattr(legacy_irish_today, "WORDS", []))
    if not words:
        return {"native_text": "Fáilte", "pronunciation": "fawl-cha", "english": "Welcome"}
    return words[ctx.selected_date.toordinal() % len(words)]


def _pick_fact(rng: random.Random) -> str:
    facts = list(getattr(legacy_irish_today, "DID_YOU_KNOW", []))
    if not facts:
        return "Ireland rewards slow attention: language, place, sport, and memory all overlap in ordinary daily life."
    return rng.choice(facts)


def _pick_history(ctx: FlyerContext) -> tuple[str, str, str | None]:
    mmdd = ctx.selected_date.strftime("%m-%d")
    history = getattr(legacy_irish_today, "HISTORY_THIS_DAY", {})
    if mmdd in history:
        entry = history[mmdd]
        if isinstance(entry, dict):
            return "This day", _plain_text(entry.get("body", "")), entry.get("source_url")
        return "This day", _plain_text(entry), None
    return "Irish note", "No exact calendar hook today, so keep the habit small: one word, one place, one story.", None


def build(ctx: FlyerContext) -> FlyerExperience:
    rng = random.Random(ctx.seed)
    word = _pick_word(ctx)
    history_label, history_body, history_url = _pick_history(ctx)
    fact = _pick_fact(rng)

    lead = FlyerItem(
        kind="lead_story",
        label=history_label,
        title="A small Irish note for today",
        body=history_body,
        url=history_url,
    )

    sections = [
        FlyerItem(
            kind="word_note",
            label="Word",
            title=str(word.get("native_text", "Fáilte")),
            body="Pronunciation: " + str(word.get("pronunciation", "")) + " — " + str(word.get("english", "Welcome")),
        ),
        FlyerItem(
            kind="fact_note",
            label="Worth knowing",
            title="One thing to remember",
            body=_plain_text(fact),
        ),
        FlyerItem(
            kind="place_note",
            label="Place",
            title="County thread",
            body="A future version can pull the county-of-the-week provider here without forcing it into a generic card grid.",
        ),
    ]

    actions = [
        FlyerItem(
            kind="try_this",
            label="Try this",
            title="Say the word once",
            body="Read the Irish word out loud, then glance back at the meaning later. That is enough for today.",
        )
    ]

    return FlyerExperience(
        product="irish_today",
        layout="publication",
        title="Irish Today",
        subtitle="One word, one story, and a small thing to try today.",
        date_label=ctx.display_date,
        lead=lead,
        sections=sections,
        actions=actions,
        footer="Built by Holtsnider Tech. Powered by the Flyer Engine v2 proof of concept.",
        data={"masthead_image": legacy_irish_today.THEME_CONFIG.get("header_title_image", "")},
    )
