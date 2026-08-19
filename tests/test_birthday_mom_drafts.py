from __future__ import annotations

from datetime import date

from daily_flyer.curated_fact_store import CuratedFact
from daily_flyer.themes import this_day_birthday_mom_drafts as mom_drafts


def _fact(fact_id: str, title: str, body: str) -> CuratedFact:
    return CuratedFact(
        fact_id=fact_id,
        card_type="fun_fact",
        title=title,
        body=body,
        source_name="Test source",
        source_url="https://example.com",
        verified=True,
        status="approved",
        tone="fun",
        tags=["birthday", "fun"],
        month=8,
        day=19,
    )


def test_mom_daily_builds_four_distinct_birthday_drafts() -> None:
    target = date(2026, 8, 19)
    birthday_hits = [{"name": "Claire Lawler", "month": 8, "day": 19}]
    facts = [
        _fact("one", "National Aviation Day", "August 19 celebrates aviation in the United States."),
        _fact("two", "Orville Wright", "Orville Wright was born on August 19, 1871."),
        _fact("three", "A TV Anniversary", "A memorable television moment shares the date."),
    ]

    variants = mom_drafts._draft_variants(target, birthday_hits, facts)

    assert [variant["label"] for variant in variants] == [
        "Classic Patti",
        "Birthday First",
        "Whimsical",
        "Short & Sweet",
    ]
    assert len({variant["text"] for variant in variants}) == 4
    assert all("Claire" in variant["text"] for variant in variants)
    assert "National Aviation Day" in variants[0]["text"]
    assert "random-calendar" in variants[2]["text"]


def test_mom_daily_variant_renderer_has_navigation_and_copy_controls() -> None:
    target = date(2026, 8, 19)
    birthday_hits = [{"name": "Claire Lawler", "month": 8, "day": 19}]
    facts = [_fact("one", "National Aviation Day", "Aviation gets a calendar day too.")]

    html = mom_drafts._render_mom_daily_variants(target, birthday_hits, facts)

    assert html.count("data-mom-draft-panel") == 4
    assert "data-mom-draft-prev" in html
    assert "data-mom-draft-next" in html
    assert "data-mom-draft-copy" in html
    assert "1 of 4" in html
    assert "Classic Patti" in html
    assert "Short &amp; Sweet" in html


def test_mom_daily_variants_still_work_on_non_birthday_dates() -> None:
    variants = mom_drafts._draft_variants(
        date(2026, 8, 20),
        [],
        [_fact("one", "A Calendar Fact", "Something cheerful happened around this time of year.")],
    )

    assert len(variants) == 4
    assert all(variant["text"].strip() for variant in variants)
    assert any("No family birthday" in variant["text"] for variant in variants)
