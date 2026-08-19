from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from html import escape
from pathlib import Path

from daily_flyer.birthday_theme_extra_facts import approved_birthday_theme_facts
from daily_flyer.birthdays import birthdays_for_date, load_birthdays
from daily_flyer.content_weighting import (
    KeywordWeightProfile,
    is_copy_friendly,
    is_primary_friendly,
    load_keyword_weight_profile,
    score_content_item,
)
from daily_flyer.curated_fact_store import CuratedFact, approved_facts
from daily_flyer.models import CardItem, PageContext
from daily_flyer.providers.birthday_on_this_day import fetch_birthday_on_this_day
from daily_flyer.themes import this_day_birthday_history_enhanced as enhanced
from daily_flyer.utils import resolve_date


THEME_NAME = enhanced.THEME_NAME
WEIGHT_PROFILE_NAME = enhanced.WEIGHT_PROFILE_NAME
CURATED_CARD_ORDER = enhanced.CURATED_CARD_ORDER
THEME_CONFIG = dict(enhanced.THEME_CONFIG)
THEME_CONFIG["hero_summary_pill"] = "Birthdays first, lots of exact-date facts, then this-week extras"
VERIFIED_FACT_IDS_FILE = Path("birthday_verified_fact_ids.json")

# Exact-date breadth is a feature for this theme. Wikipedia supplies a large live
# pool; the curated banks keep the voice personal and whimsical. These limits keep
# a rich birthday edition readable without going back to unrelated filler.
CARD_LIMITS = {
    "this_day_history": 7,
    "famous_person_birthday": 7,
    "fun_fact": 5,
    "classic_rock": 4,
    "irish_history": 4,
    "boston_sports": 4,
}
RELATED_FACT_LIMIT = 10

# These boosts sit on top of the existing birthday_family_friendly keyword profile.
# They intentionally encode the editorial shape of Patti Mode without changing the
# shared weighting system used by other themes.
PATTI_CATEGORY_BOOSTS = {
    "classic_rock": 2.0,
    "boston_sports": 1.8,
    "irish_history": 1.6,
    "famous_person_birthday": 1.4,
    "this_day_history": 1.2,
    "fun_fact": 1.0,
}


def _all_fact_sources(target: date | None = None) -> list[CuratedFact]:
    facts = approved_facts() + approved_birthday_theme_facts()
    if target is not None:
        # Live Wikipedia breadth is exact-date only. It is enrichment and fails
        # open, so the curated birthday page still works if Wikipedia is down.
        facts.extend(fetch_birthday_on_this_day(target))
    return facts


@lru_cache(maxsize=1)
def _verified_fact_ids() -> frozenset[str]:
    """Load the small human-reviewed verification ledger.

    The original fact banks predate strict verification metadata, so their
    `verified` flags are mostly false even when an entry has since been checked.
    Keeping a separate ledger lets us harden facts incrementally without making
    risky bulk edits to the legacy JSON files.
    """
    if not VERIFIED_FACT_IDS_FILE.exists():
        return frozenset()
    try:
        raw = json.loads(VERIFIED_FACT_IDS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return frozenset()
    if not isinstance(raw, dict):
        return frozenset()
    return frozenset(str(fact_id).strip() for fact_id in raw if str(fact_id).strip())


def _is_fact_verified(fact: CuratedFact) -> bool:
    return bool(fact.verified or fact.fact_id in _verified_fact_ids())


def _is_exact_calendar_date(fact: CuratedFact, target: date) -> bool:
    """Return True only for a literal month/day match.

    CuratedFact.matches_date() also treats week-of/within-days facts as matches.
    Those now have a legitimate home in the bottom-of-page week/nearby section,
    but they should never masquerade as something that happened today.
    """
    return (
        fact.month == target.month
        and fact.day == target.day
        and not fact.week_mode
    )


def _dedupe_facts(facts: list[CuratedFact]) -> list[CuratedFact]:
    seen_ids: set[str] = set()
    seen_titles: set[str] = set()
    out: list[CuratedFact] = []
    for fact in facts:
        title_key = " ".join(str(fact.title or "").lower().split())
        if fact.fact_id in seen_ids or (title_key and title_key in seen_titles):
            continue
        seen_ids.add(fact.fact_id)
        if title_key:
            seen_titles.add(title_key)
        out.append(fact)
    return out


def _quality_sort_key(
    fact: CuratedFact,
    profile: KeywordWeightProfile,
) -> tuple[int, float, str]:
    # Human-verified facts still win the first tie-break. Live source-backed facts
    # and legacy curated facts then compete on Patti relevance/whimsy.
    verified_rank = 0 if _is_fact_verified(fact) else 1
    editorial_score = (
        score_content_item(fact, profile)
        + PATTI_CATEGORY_BOOSTS.get(fact.card_type, 0.0)
    )
    return (verified_rank, -editorial_score, fact.fact_id.lower())


def _select_exact_facts(
    all_facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
    *,
    card_type: str | None = None,
    limit: int | None = None,
    copy_friendly: bool = False,
) -> list[CuratedFact]:
    pool = [fact for fact in all_facts if _is_exact_calendar_date(fact, target)]
    if card_type is not None:
        pool = [fact for fact in pool if fact.card_type == card_type]
    if copy_friendly:
        pool = [fact for fact in pool if is_copy_friendly(fact, profile)]

    pool = [fact for fact in pool if is_primary_friendly(fact, profile)]
    pool = _dedupe_facts(pool)
    pool.sort(key=lambda fact: _quality_sort_key(fact, profile))
    return pool if limit is None else pool[:limit]


def _select_patti_copy_facts(
    all_facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
    limit: int = 5,
) -> list[CuratedFact]:
    """Keep the sendable Patti copy anchored to genuinely same-day material."""
    return _select_exact_facts(
        all_facts,
        target,
        profile,
        limit=limit,
        copy_friendly=True,
    )


def _build_quality_fact_cards(
    all_facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
) -> list[CardItem]:
    cards: list[CardItem] = []
    for card_type in enhanced.FACT_CARD_ORDER:
        facts = _select_exact_facts(
            all_facts,
            target,
            profile,
            card_type=card_type,
            limit=CARD_LIMITS.get(card_type, 4),
        )
        if not facts:
            continue
        cards.append(enhanced._build_fact_card(card_type, facts, target, profile))  # noqa: SLF001
    return cards


def _safe_anchor(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        if month == 2 and day == 29:
            return date(year, 2, 28)
        return None


def _annual_delta_days(fact: CuratedFact, target: date) -> int | None:
    if fact.month is None or fact.day is None:
        return None
    candidates = [
        _safe_anchor(target.year - 1, fact.month, fact.day),
        _safe_anchor(target.year, fact.month, fact.day),
        _safe_anchor(target.year + 1, fact.month, fact.day),
    ]
    deltas = [(candidate - target).days for candidate in candidates if candidate is not None]
    return min(deltas, key=abs) if deltas else None


def _related_tier(fact: CuratedFact, target: date) -> int | None:
    if _is_exact_calendar_date(fact, target):
        return None
    # week_mode is intentional editorial metadata: it means the fact belongs in a
    # fuzzy current-week context instead of pretending its anchor date is exact.
    if fact.week_mode and fact.matches_date(target):
        return 0
    delta = _annual_delta_days(fact, target)
    if delta is not None and abs(delta) <= 3:
        return 1
    return None


def _related_label(fact: CuratedFact, target: date) -> str:
    if fact.week_mode and fact.matches_date(target):
        return "This week"
    delta = _annual_delta_days(fact, target)
    if delta is None:
        return "Around this date"
    if delta == -1:
        return "Yesterday"
    if delta == 1:
        return "Tomorrow"
    if delta < 0:
        return f"{abs(delta)} days ago"
    if delta > 0:
        return f"In {delta} days"
    return "Around this date"


def _select_related_facts(
    all_facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
    limit: int = RELATED_FACT_LIMIT,
) -> list[CuratedFact]:
    pool = [
        fact for fact in all_facts
        if _related_tier(fact, target) is not None and is_primary_friendly(fact, profile)
    ]
    pool = _dedupe_facts(pool)

    def sort_key(fact: CuratedFact) -> tuple[int, int, int, float, str]:
        tier = _related_tier(fact, target) or 0
        delta = _annual_delta_days(fact, target)
        distance = abs(delta) if delta is not None else 99
        verified_rank, negative_score, fact_id = _quality_sort_key(fact, profile)
        return (tier, distance, verified_rank, negative_score, fact_id)

    pool.sort(key=sort_key)
    return pool[:limit]


def _build_related_card(
    facts: list[CuratedFact],
    target: date,
) -> CardItem | None:
    if not facts:
        return None

    parts = [
        "<div class='fact-stack fact-stack--grouped'>",
        "<p class='birthday-hint'>These are bonus calendar notes, deliberately kept below the exact-date material. They are either happening this week or anchored within three days of the selected birthday.</p>",
        "<ul class='birthday-related-list'>",
    ]
    for fact in facts:
        label = _related_label(fact, target)
        body = enhanced.weighted._trim_fact_text(fact.body, 190)  # noqa: SLF001
        parts.append(
            "<li class='birthday-related-item'>"
            f"<span class='fact-relevance fact-relevance--inline'>{escape(label)}</span> "
            f"<strong>{escape(fact.title)}</strong>"
            f"<p>{escape(body)}</p>"
            f"{enhanced._source_link(fact)}"  # noqa: SLF001
            "</li>"
        )
    parts.append("</ul></div>")
    return CardItem(
        "birthday_this_week",
        "Bonus Calendar Stuff",
        "This Week & Around This Date",
        "".join(parts),
        facts[0].source_url,
    )


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    # Start from the stable weighted implementation so the calendar, birthday
    # reminders, phone helper, upcoming list, and client-side behavior stay intact.
    context = enhanced.weighted.build_theme_page(date_str=date_str, seed=seed)
    target = resolve_date(date_str)
    profile = load_keyword_weight_profile(WEIGHT_PROFILE_NAME)
    birthdays = load_birthdays()
    birthday_hits = birthdays_for_date(birthdays, target.month, target.day)
    all_facts = _all_fact_sources(target)

    exact_facts = _select_exact_facts(all_facts, target, profile, limit=20)
    patti_facts = _select_patti_copy_facts(all_facts, target, profile, limit=5)
    fact_cards = _build_quality_fact_cards(all_facts, target, profile)
    related_facts = _select_related_facts(all_facts, target, profile)
    related_card = _build_related_card(related_facts, target)

    enhanced._normalize_base_cards(context)  # noqa: SLF001
    enhanced._replace_mom_daily_card(  # noqa: SLF001
        context,
        target,
        birthday_hits,
        patti_facts,
        profile,
    )
    enhanced._replace_birthday_spotlight_card(  # noqa: SLF001
        context,
        target,
        birthday_hits,
        exact_facts,
    )
    enhanced._reorder_cards(context, fact_cards)  # noqa: SLF001

    # The family/birthday tools and exact-day cards stay ahead of fuzzy material.
    # This card is intentionally appended last so "this week" never outranks today.
    if related_card is not None:
        context.cards.append(related_card)

    context.metadata["hero_summary_pill"] = "Birthdays first · exact-day facts · this-week extras"
    return context
