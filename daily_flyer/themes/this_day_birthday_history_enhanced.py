from __future__ import annotations

import re
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
THEME_CONFIG["hero_summary_pill"] = "Birthday-safe facts, family reminders, and Patti Mode"


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

    # Nearby/week/month facts are only used as filler so birthday-specific dates
    # stay first whenever an exact match exists.
    fallback = _sort_weighted_exact_first([fact for fact in friendly if fact not in exact], target, profile)
    return (exact + fallback)[:limit]


def _birthday_focus_status_card(target: date, exact_count: int, fallback_count: int) -> CardItem:
    birthdays = birthdays_for_date(load_birthdays(), target.month, target.day)
    birthday_names = [str(item.get("name", "")).strip() for item in birthdays if str(item.get("name", "")).strip()]
    selected_date = target.strftime("%B %d")
    if birthday_names:
        birthday_text = weighted._join_names_human(birthday_names)  # noqa: SLF001 - tiny formatting helper
        headline = f"{selected_date} is built around {birthday_text}"
    else:
        headline = f"{selected_date} is in planning mode"

    if exact_count:
        body = (
            f"<p><strong>{headline}.</strong></p>"
            f"<p>The history card below is using <strong>{exact_count}</strong> exact-date fact"
            f"{'s' if exact_count != 1 else ''} for this day, so the birthday copy can feel more specific and less generic.</p>"
        )
    else:
        body = (
            f"<p><strong>{headline}.</strong></p>"
            "<p>No exact-date history facts are available for this day yet, so nearby facts are filling in until the date bank grows.</p>"
        )
    if fallback_count:
        body += "<p class='birthday-hint'>A few nearby facts may appear after the exact-date items.</p>"
    return CardItem("birthday_focus_status", "Date Lens", "Why This Day Matters", body, None)


def _polish_fact_labels(html: str) -> str:
    replacements = {
        "date match": "On this date",
        "nearby": "Near this date",
        "same month": "Same month",
        "fallback": "Related",
        "low copy fit": "Background",
    }
    polished = html
    for old, new in replacements.items():
        polished = polished.replace(old, new)
    return re.sub(r"\s*·\s*weight\s+[-0-9.]+", "", polished)


def _soften_weighted_context(context: PageContext) -> None:
    for card in context.cards:
        card.body = _polish_fact_labels(card.body)
        if card.card_type == "mom_daily":
            card.body = card.body.replace(
                "<p class=\"birthday-hint\">Copy-paste-ready draft in Patti mode. Negative keywords are weighted down so facts about death, tragedy, or disasters are less likely to appear in sendable birthday copy.</p>",
                "<p class=\"birthday-hint\">Copy-paste-ready family note in Patti mode.</p>",
            )
            card.body = card.body.replace("keyword-weighted facts", "family-friendly facts")

    context.footer_text = "Built on Daily Flyer. Birthday theme prototype."
    context.metadata["hero_summary_pill"] = "Birthday tools · Patti Mode · exact-date facts"
    context.metadata["extra_css"] = f"{context.metadata.get('extra_css', '')}\n{_compatibility_css()}"


def _compatibility_css() -> str:
    return r"""
    .card--birthday_focus_status, .card--this_day_history { grid-column: span 6; }
    .card--birthday_focus_status .birthday-hint,
    .card--this_day_history .birthday-hint,
    .card--mom_daily .birthday-hint { opacity: .88; }
    .card--this_day_history .fact-relevance,
    .card--classic_rock .fact-relevance,
    .card--irish_history .fact-relevance,
    .card--boston_sports .fact-relevance,
    .card--famous_person_birthday .fact-relevance,
    .card--fun_fact .fact-relevance {
        color: #fff2c8;
        background: rgba(255, 255, 255, .07);
        border-color: rgba(255, 255, 255, .12);
    }
    .card--birthday_focus_status {
        min-height: 0;
        background: linear-gradient(180deg, rgba(255, 219, 145, .10), rgba(255, 255, 255, .035)), rgba(18, 26, 43, .82);
    }
    .card--this_day_history {
        background: linear-gradient(180deg, rgba(125, 213, 255, .10), rgba(255, 255, 255, .035)), rgba(18, 26, 43, .82);
    }
    .birthday-textarea { box-sizing: border-box; }
    .birthday-message-preview { margin-top: .85rem; }
    @media (max-width: 980px) {
        .card--birthday_focus_status, .card--this_day_history { grid-column: span 6; }
    }
    @media (max-width: 720px) {
        .card--birthday_focus_status, .card--this_day_history { grid-column: auto; }
        .birthday-day { min-height: 48px; border-radius: 14px; }
        .birthday-date-badge { width: 56px; min-width: 56px; }
    }
    """


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
        _polish_fact_labels(body_html),
        source_url,
    )

    _soften_weighted_context(context)
    context.cards = _insert_after_first_card_type(context.cards, "mom_daily", _birthday_focus_status_card(target, exact_count, fallback_count))
    context.cards = _insert_after_first_card_type(context.cards, "birthday_focus_status", history_card)
    return context
