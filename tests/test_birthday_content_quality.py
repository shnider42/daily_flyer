from __future__ import annotations

from datetime import date

from daily_flyer.content_weighting import load_keyword_weight_profile
from daily_flyer.curated_fact_store import CuratedFact
from daily_flyer.providers import birthday_on_this_day as birthday_feed
from daily_flyer.themes import this_day_birthday
from daily_flyer.themes import this_day_birthday_content_quality as quality
from daily_flyer.themes import this_day_birthday_mom_drafts as mom_drafts


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


def test_exact_selector_never_fills_from_another_date() -> None:
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


def test_week_and_plus_minus_three_day_facts_have_a_separate_tier() -> None:
    target = date(2026, 8, 19)
    profile = load_keyword_weight_profile(quality.WEIGHT_PROFILE_NAME)
    exact = _fact("exact")
    week = _fact("week", day=17, week_mode="within_days", within_days=3)
    nearby = _fact("nearby", day=21)
    too_far = _fact("too_far", day=23)

    related = quality._select_related_facts(
        [exact, week, nearby, too_far],
        target,
        profile,
    )

    assert [fact.fact_id for fact in related] == ["week", "nearby"]
    assert quality._related_label(week, target) == "This week"
    assert quality._related_label(nearby, target) == "In 2 days"


def test_empty_exact_fact_categories_are_omitted() -> None:
    target = date(2026, 8, 19)
    profile = load_keyword_weight_profile(quality.WEIGHT_PROFILE_NAME)
    facts = [_fact("only_fun_fact", card_type="fun_fact")]

    cards = quality._build_quality_fact_cards(facts, target, profile)

    assert [card.card_type for card in cards] == ["fun_fact"]


def test_wikipedia_payload_adds_events_birthdays_and_holidays_but_skips_dark_items() -> None:
    target = date(2026, 8, 19)
    payload = {
        "events": [
            {
                "year": 1977,
                "text": "A beloved television comedy aired a memorable episode.",
                "pages": [{"titles": {"normalized": "A Happy TV Moment"}}],
            },
            {
                "year": 1944,
                "text": "A war battle killed many people.",
                "pages": [{"titles": {"normalized": "A Dark Event"}}],
            },
        ],
        "births": [
            {
                "year": 1871,
                "text": "Orville Wright, American aviation pioneer.",
                "pages": [{"titles": {"normalized": "Orville Wright"}}],
            }
        ],
        "holidays": [
            {
                "text": "National Aviation Day in the United States.",
                "pages": [{"titles": {"normalized": "National Aviation Day"}}],
            }
        ],
    }

    facts = birthday_feed.facts_from_payload(payload, target)

    assert [fact.card_type for fact in facts] == [
        "this_day_history",
        "famous_person_birthday",
        "fun_fact",
    ]
    assert all(fact.month == 8 and fact.day == 19 for fact in facts)


def test_dynamic_filter_does_not_confuse_award_with_war() -> None:
    assert birthday_feed._is_birthday_friendly("A comedy series won an award.")
    assert not birthday_feed._is_birthday_friendly("A war began.")


def test_public_birthday_wrapper_uses_mom_draft_layer() -> None:
    assert this_day_birthday.build_theme_page is mom_drafts.build_theme_page


def test_august_19_integration_keeps_fuzzy_material_out_of_exact_cards(monkeypatch) -> None:
    # The integration shape should be deterministic/offline; the provider itself is
    # covered separately and the live fetch is intentionally best-effort enrichment.
    monkeypatch.setattr(quality, "fetch_birthday_on_this_day", lambda target: [])
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
