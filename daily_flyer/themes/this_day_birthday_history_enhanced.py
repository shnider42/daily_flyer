from __future__ import annotations

from daily_flyer.birthday_theme_extra_facts import approved_birthday_theme_facts
from daily_flyer.content_weighting import load_keyword_weight_profile
from daily_flyer.curated_fact_store import approved_facts
from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes import this_day_birthday_weighted as weighted
from daily_flyer.utils import resolve_date


THEME_NAME = weighted.THEME_NAME
WEIGHT_PROFILE_NAME = weighted.WEIGHT_PROFILE_NAME
CURATED_CARD_ORDER = ("this_day_history",) + weighted.CURATED_CARD_ORDER
THEME_CONFIG = dict(weighted.THEME_CONFIG)
THEME_CONFIG["hero_summary_pill"] = "History-rich, birthday-safe facts plus Patti Mode"


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


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = weighted.build_theme_page(date_str=date_str, seed=seed)
    target = resolve_date(date_str)
    rng_seed = seed if seed is not None else target.toordinal()
    profile = load_keyword_weight_profile(WEIGHT_PROFILE_NAME)
    available_facts = approved_facts() + approved_birthday_theme_facts()
    history_facts = weighted._select_facts_for_card_type(  # noqa: SLF001 - internal theme extension point
        available_facts,
        "this_day_history",
        target,
        rng_seed,
        profile,
        limit=5,
    )

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
    context.cards = _insert_after_first_card_type(context.cards, "mom_daily", history_card)

    fact_count = sum(1 for fact in history_facts)
    context.header_subtitle = f"{context.header_subtitle} History card added with {fact_count} birthday-safe option{'s' if fact_count != 1 else ''}."
    context.footer_text = f"{context.footer_text} Dedicated history supplement enabled."
    context.metadata["hero_summary_pill"] = str(context.metadata.get("hero_summary_pill", "")).replace(
        "weighted facts",
        "weighted facts · history-rich",
    )
    return context
