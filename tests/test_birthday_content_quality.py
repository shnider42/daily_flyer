from __future__ import annotations

from datetime import date

from daily_flyer.content_weighting import load_keyword_weight_profile
from daily_flyer.curated_fact_store import CuratedFact
from daily_flyer.themes import this_day_birthday
from daily_flyer.themes import this_day_birthday_content_quality as quality


def _fact(
    fact_id: str,
    *,
    card_type: str = "fun_fact",
    month: int = 8,
    day: int = 19,
    week_mode: str | None = None,
    within_days: int | None = None,
    verified: bool = False,
    title: str = "A useful fact",
    body: str = "A friendly fact for the birthday page.",
) -> CuratedFact:
    return CuratedFact(
        fact_id=fact_id,
        card_type=card_type,
        title=title,
        body=body,
        source_name="Test source",
        source_url="https://example.com/source",
        verified=verified,
        status="approved",
        tone="fun",
        tags=["birthday", "family"],
        month=month,
        day=day,
        week_mode=week_mode,
        within_days=within_days,
    )


def test_exact_calendar_date_rejects_nearby_window_facts() -> None:
    target = date(2026, 8, 19)
    exact = _fact("exact")
    nearby = _fact("nearby", day=17, week_mode="within_days", within_days=3)
    anchored_window = _fact("window_on_anchor", week_mode="within_days", within_days=3)

    assert quality._is_exact_calendar_date(exact, target)
    assert not quality._is_exact_calendar_date(nearby, target)
    assert not quality._is_exact_calendar_date(anchored_window, target)


def test_verified_exact_fact_sorts_ahead_of_unverified_fact() -> None:
    target = date(2026, 8, 19)
    profile = load_keyword_weight_profile(quality.WEIGHT_PROFILE_NAME)
    unverified = _fact("unverified", title="Birthday birthday birthday")
    verified = _fact("verified", verified=True, title="Simple calendar note")

    selected = quality._select_exact_facts(
        [unverified, verified],
        target,
        profile,
        card_type="fun_fact",
    )

    assert [fact.fact_id for fact in selected] == ["verified", "unverified"]


def test_manual_verification_ledger_is_honored() -> None:
    fact = _fact("birthday_family_date_0819_002")
    assert quality._is_fact_verified(fact)


def test_selector_never_fills_from_another_date() -> None:
    target = date(2026, 8, 19)
    profile = load_keyword_weight_profile(quality.WEIGHT_PROFILE_NAME)
    exact = _fact("exact")
    yesterday = _fact("yesterday", day=18)
    tomorrow = _fact("tomorrow", day=20)

    selected = quality._select_exact_facts(
        [yesterday, exact, tomorrow],
        target,
        profile,
        card_type="fun_fact",
        limit=4,
    )

    assert [fact.fact_id for fact in selected] == ["exact"]


def test_empty_fact_categories_are_omitted() -> None:
    target = date(2026, 8, 19)
    profile = load_keyword_weight_profile(quality.WEIGHT_PROFILE_NAME)
    facts = [_fact("only_fun_fact", card_type="fun_fact")]

    cards = quality._build_quality_fact_cards(facts, target, profile)

    assert [card.card_type for card in cards] == ["fun_fact"]


def test_public_birthday_wrapper_uses_content_quality_layer() -> None:
    assert this_day_birthday.build_theme_page is quality.build_theme_page


def test_august_19_integration_has_no_nearby_fact_labels_or_empty_fact_cards() -> None:
    context = quality.build_theme_page("2026-08-19", seed=42)
    fact_cards = [
        card for card in context.cards
        if card.card_type in quality.enhanced.FACT_CARD_ORDER
    ]

    assert fact_cards
    for card in fact_cards:
        assert "Near this date" not in card.body
        assert "Same month" not in card.body
        assert "Related" not in card.body
        assert not card.body.startswith("<p>No approved")
