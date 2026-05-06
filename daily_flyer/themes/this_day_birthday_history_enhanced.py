from __future__ import annotations

from datetime import date

from daily_flyer.birthday_theme_extra_facts import approved_birthday_theme_facts
from daily_flyer.birthdays import birthdays_for_date, load_birthdays
from daily_flyer.content_weighting import KeywordWeightProfile, is_primary_friendly, load_keyword_weight_profile, score_content_item
from daily_flyer.curated_fact_store import CuratedFact, approved_facts
from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes import this_day_birthday_weighted as weighted
from daily_flyer.utils import resolve_date


THEME_NAME = weighted.THEME_NAME
WEIGHT_PROFILE_NAME = weighted.WEIGHT_PROFILE_NAME
CURATED_CARD_ORDER = ("this_day_history",) + weighted.CURATED_CARD_ORDER
THEME_CONFIG = dict(weighted.THEME_CONFIG)
THEME_CONFIG["hero_summary_pill"] = "Exact-date history, birthday-safe facts plus Patti Mode"


def _insert_after_first_card_type(cards: list[CardItem], after_card_type: str, new_card: CardItem) -> list[CardItem]:
    out: list[CardItem] = []
    inserted = False
    for card in cards:
        out.append(card)
        if not inserted and card.card_type == after_card_type:
            out.append(new_card)
            inserted = True
    if not inserted:
        out.append(new_card)
    return out


def _sort_weighted_exact_first(
    facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
) -> list[CuratedFact]:
    def sort_key(fact: CuratedFact) -> tuple[int, int, float, str]:
        if fact.matches_date(target):
            bucket = 0
        elif fact.month is not None and fact.distance_from(target) <= 7:
            bucket = 1
        elif fact.month is not None and fact.distance_from(target) <= 21:
            bucket = 2
        elif fact.month == target.month:
            bucket = 3
        elif fact.month is not None:
            bucket = 4
        else:
            bucket = 5
        return (
            bucket,
            fact.distance_from(target),
            -score_content_item(fact, profile),
            fact.fact_id.lower(),
        )

    return sorted(facts, key=sort_key)


def _select_exact_first_facts(
    all_facts: list[CuratedFact],
    card_type: str,
    target: date,
    profile: KeywordWeightProfile,
    limit: int = 5,
) -> list[CuratedFact]:
    pool = [fact for fact in all_facts if fact.card_type == card_type]
    if not pool:
        return []

    friendly = [fact for fact in pool if is_primary_friendly(fact, profile)] or pool
    exact = _sort_weighted_exact_first([fact for fact in friendly if fact.matches_date(target)], target, profile)
    if len(exact) >= limit:
        return exact[:limit]

    # Nearby/week/month facts are intentionally only used as filler. This keeps
    # the birthday theme focused on "on this day" rather than loose trivia.
    fallback = _sort_weighted_exact_first([fact for fact in friendly if fact not in exact], target, profile)
    return (exact + fallback)[:limit]


def _birthday_focus_status_card(target: date, exact_count: int, fallback_count: int) -> CardItem:
    birthdays = birthdays_for_date(load_birthdays(), target.month, target.day)
    birthday_names = [str(item.get("name", "")).strip() for item in birthdays if str(item.get("name", "")).strip()]
    if birthday_names:
        birthday_text = weighted._join_names_human(birthday_names)  # noqa: SLF001 - tiny formatting helper
        headline = f"Focused on {birthday_text}'s birthday date"
    else:
        headline = "No birthday on file for this selected date"

    if exact_count:
        body = (
            f"<p><strong>{headline}.</strong></p>"
            f"<p>This page found <strong>{exact_count}</strong> exact-date history fact{'s' if exact_count != 1 else ''}. "
            "Nearby or month-level facts are only used after exact-date options.</p>"
        )
    else:
        body = (
            f"<p><strong>{headline}.</strong></p>"
            "<p>No exact-date history facts are available yet for this date, so the page is using nearby/month fallback material. "
            "This is now a clear signal that this birthday date needs more data.</p>"
        )
    body += f"<p class='birthday-hint'>Fallback facts shown: {fallback_count}. Goal: build exact-date facts first for each cousin birthday.</p>"
    return CardItem("birthday_focus_status", "Coverage", "Birthday Date Focus", body, None)


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = weighted.build_theme_page(date_str=date_str, seed=seed)
    target = resolve_date(date_str)
    profile = load_keyword_weight_profile(WEIGHT_PROFILE_NAME)
    available_facts = approved_facts() + approved_birthday_theme_facts()
    history_facts = _select_exact_first_facts(
        available_facts,
        "this_day_history",
        target,
        profile,
        limit=5,
    )
    exact_count = sum(1 for fact in history_facts if fact.matches_date(target))
    fallback_count = max(0, len(history_facts) - exact_count)

    title, body_html, source_url = weighted._render_fact_card_body(  # noqa: SLF001 - internal theme extension point
        history_facts,
        target,
        profile,
        "This Day in History",
        "No birthday-safe history fact matched this date yet.",
    )

    history_card = CardItem(
        "this_day_history",
        "This Day in History",
        title,
        body_html,
        source_url,
    )
    context.cards = _insert_after_first_card_type(context.cards, "mom_daily", _birthday_focus_status_card(target, exact_count, fallback_count))
    context.cards = _insert_after_first_card_type(context.cards, "birthday_focus_status", history_card)

    if exact_count:
        focus_note = f" Exact-date history coverage: {exact_count} fact{'s' if exact_count != 1 else ''}."
    else:
        focus_note = " Exact-date history coverage missing; using fallback facts."
    context.header_subtitle = f"{context.header_subtitle}{focus_note}"
    context.footer_text = f"{context.footer_text} Exact-first history supplement enabled."
    context.metadata["hero_summary_pill"] = str(context.metadata.get("hero_summary_pill", "")).replace(
        "weighted facts",
        "exact-first weighted facts",
    )
    return context
