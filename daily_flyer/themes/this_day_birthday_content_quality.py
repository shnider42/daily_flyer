from __future__ import annotations

from datetime import date

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
from daily_flyer.themes import this_day_birthday_history_enhanced as enhanced
from daily_flyer.utils import resolve_date


THEME_NAME = enhanced.THEME_NAME
WEIGHT_PROFILE_NAME = enhanced.WEIGHT_PROFILE_NAME
CURATED_CARD_ORDER = enhanced.CURATED_CARD_ORDER
THEME_CONFIG = dict(enhanced.THEME_CONFIG)
THEME_CONFIG["hero_summary_pill"] = "Exact-date facts first, family reminders, and Patti Mode"

# This theme has one known reader. Optimize for a small number of useful, relevant
# facts rather than filling every available card slot with loosely related material.
CARD_LIMITS = {
    "this_day_history": 3,
    "famous_person_birthday": 3,
    "fun_fact": 2,
    "classic_rock": 2,
    "irish_history": 2,
    "boston_sports": 2,
}

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


def _all_fact_sources() -> list[CuratedFact]:
    return approved_facts() + approved_birthday_theme_facts()


def _is_exact_calendar_date(fact: CuratedFact, target: date) -> bool:
    """Return True only for a literal month/day match.

    CuratedFact.matches_date() also treats week-of/within-days facts as matches.
    That is useful for broad discovery, but it is too loose for a card labeled
    "On This Date" or for copy that Mom will read as today's fact.
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
    # Verified facts should win every tie/near-tie. The corpus is still being
    # hardened, so unverified facts are not hidden wholesale yet; doing that now
    # would erase nearly the entire birthday fact bank. Exact-date gating is the
    # first trust improvement, while verified coverage can grow incrementally.
    verified_rank = 0 if fact.verified else 1
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

    # Unlike the older selector, do not fall back to facts that fail the primary
    # family-friendly threshold just to keep a card populated.
    pool = [fact for fact in pool if is_primary_friendly(fact, profile)]
    pool = _dedupe_facts(pool)
    pool.sort(key=lambda fact: _quality_sort_key(fact, profile))
    return pool if limit is None else pool[:limit]


def _select_patti_copy_facts(
    all_facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
    limit: int = 4,
) -> list[CuratedFact]:
    """Choose only genuinely same-day facts for the copy-paste family note."""
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
            limit=CARD_LIMITS.get(card_type, 2),
        )
        # Empty category cards add no value for this single-reader theme. The
        # birthday tools remain available; the fact section simply gets shorter.
        if not facts:
            continue
        cards.append(enhanced._build_fact_card(card_type, facts, target, profile))  # noqa: SLF001
    return cards


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    # Start from the stable weighted implementation so the calendar, birthday
    # reminders, phone helper, upcoming list, and client-side behavior stay intact.
    context = enhanced.weighted.build_theme_page(date_str=date_str, seed=seed)
    target = resolve_date(date_str)
    profile = load_keyword_weight_profile(WEIGHT_PROFILE_NAME)
    birthdays = load_birthdays()
    birthday_hits = birthdays_for_date(birthdays, target.month, target.day)
    all_facts = _all_fact_sources()

    exact_facts = _select_exact_facts(all_facts, target, profile)
    patti_facts = _select_patti_copy_facts(all_facts, target, profile, limit=4)
    fact_cards = _build_quality_fact_cards(all_facts, target, profile)

    enhanced._normalize_base_cards(context)  # noqa: SLF001
    # Passing only exact-date facts into these renderers prevents their legacy
    # nearby-date fallback from leaking into Patti Mode or the birthday spotlight.
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

    context.metadata["hero_summary_pill"] = "Exact-date facts · family reminders · Patti Mode"
    return context
