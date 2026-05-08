from __future__ import annotations

import re
from datetime import date
from html import escape

from daily_flyer.birthday_theme_extra_facts import approved_birthday_theme_facts
from daily_flyer.birthdays import birthdays_for_date, clean_optional_text, load_birthdays
from daily_flyer.content_weighting import KeywordWeightProfile, is_copy_friendly, is_primary_friendly, load_keyword_weight_profile, score_content_item
from daily_flyer.curated_fact_store import CuratedFact, approved_facts
from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes import this_day_birthday_weighted as weighted
from daily_flyer.utils import resolve_date


THEME_NAME = weighted.THEME_NAME
WEIGHT_PROFILE_NAME = weighted.WEIGHT_PROFILE_NAME
CURATED_CARD_ORDER = ("this_day_history",) + weighted.CURATED_CARD_ORDER
THEME_CONFIG = dict(weighted.THEME_CONFIG)
THEME_CONFIG["hero_summary_pill"] = "Birthday-safe facts, family reminders, and Patti Mode"

FACT_CARD_CONFIG = {
    "this_day_history": {
        "eyebrow": "On This Date",
        "title": "This Day in History",
        "empty": "No birthday-safe history fact matched this date yet.",
        "more": "history notes",
    },
    "famous_person_birthday": {
        "eyebrow": "Famous Birthdays",
        "title": "Famous Birthdays",
        "empty": "No approved famous birthday fact matched this date yet.",
        "more": "famous birthday notes",
    },
    "fun_fact": {
        "eyebrow": "Calendar Note",
        "title": "Fun Fact",
        "empty": "No approved fun fact matched this date yet.",
        "more": "fun notes",
    },
    "classic_rock": {
        "eyebrow": "Music",
        "title": "Classic Rock",
        "empty": "No approved classic rock fact matched this date yet.",
        "more": "music notes",
    },
    "irish_history": {
        "eyebrow": "Irish History",
        "title": "Irish History",
        "empty": "No approved Irish history fact matched this date yet.",
        "more": "Irish history notes",
    },
    "boston_sports": {
        "eyebrow": "Sports",
        "title": "Boston Sports",
        "empty": "No approved Boston sports fact matched this date yet.",
        "more": "Boston sports notes",
    },
}

FACT_CARD_ORDER = (
    "this_day_history",
    "famous_person_birthday",
    "fun_fact",
    "classic_rock",
    "irish_history",
    "boston_sports",
)

TOP_CARD_ORDER = (
    "birthday_calendar",
    "mom_daily",
    "birthday_phone_helper",
    "birthday_spotlight",
)

BOTTOM_CARD_ORDER = (
    "birthday_message_starter",
    "birthday_upcoming",
)


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

    fallback = _sort_weighted_exact_first([fact for fact in friendly if fact not in exact], target, profile)
    return (exact + fallback)[:limit]


def _select_mom_daily_facts(
    all_facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
    limit: int = 4,
) -> list[CuratedFact]:
    """Pick facts for the sendable Mom Daily copy, with exact dates first."""
    copy_pool = [fact for fact in all_facts if is_copy_friendly(fact, profile)]
    primary_pool = [fact for fact in copy_pool if is_primary_friendly(fact, profile)] or copy_pool
    exact = [fact for fact in primary_pool if fact.matches_date(target)]
    if exact:
        return _sort_weighted_exact_first(exact, target, profile)[:limit]

    fallback = [fact for fact in primary_pool if fact.month == target.month or fact.distance_from(target) <= 21]
    return _sort_weighted_exact_first(fallback or primary_pool, target, profile)[:limit]


def _birthday_focus_status_card(target: date, exact_count: int, fallback_count: int) -> CardItem:
    """Kept as an internal diagnostic card, but no longer inserted into the public page."""
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


def _fact_label(fact: CuratedFact, target: date, profile: KeywordWeightProfile) -> str:
    return _polish_fact_labels(weighted._fact_relevance_label(fact, target, profile))  # noqa: SLF001


def _fact_sentence(fact: CuratedFact, limit: int = 140) -> str:
    title = str(fact.title or "").strip()
    body = weighted._trim_fact_text(fact.body, limit)  # noqa: SLF001 - shared theme text helper
    return f"{title}: {body}" if title else body


def _fact_body_sentence(fact: CuratedFact, limit: int = 170) -> str:
    return weighted._trim_fact_text(fact.body, limit)  # noqa: SLF001 - shared theme text helper


def _source_link(fact: CuratedFact) -> str:
    source_name = str(getattr(fact, "source_name", "") or "Source").strip() or "Source"
    source_url = str(getattr(fact, "source_url", "") or "").strip()
    if source_url:
        return (
            "<p class='birthday-hint fact-source'>"
            f"<a href='{escape(source_url, quote=True)}' target='_blank' rel='noopener noreferrer'>Source: {escape(source_name)}</a>"
            "</p>"
        )
    return f"<p class='birthday-hint fact-source'>Source: {escape(source_name)}</p>"


def _birthday_names_for_copy(birthday_hits: list[dict], first_names_only: bool = True) -> list[str]:
    names: list[str] = []
    for item in birthday_hits:
        raw_name = str(item.get("name", "")).strip()
        if not raw_name:
            continue
        names.append(weighted._first_name(raw_name) if first_names_only else raw_name)  # noqa: SLF001 - shared theme name helper
    return names


def _clean_display_note(value: object) -> str:
    note = clean_optional_text(value)
    if note.lower() in {"note_placeholder", "placeholder", "todo", "none"}:
        return ""
    return note


def _birthday_copy_line(target: date, birthday_hits: list[dict]) -> str:
    names = _birthday_names_for_copy(birthday_hits)
    joined = weighted._join_names_human(names)  # noqa: SLF001 - shared theme formatting helper
    if not joined:
        return "No family birthday lands on this date, so this is a good planning day for the next round of cake and texts."

    ages = [weighted._age_for_hit(target, hit) for hit in birthday_hits]  # noqa: SLF001 - shared theme age helper
    ages = [age for age in ages if age is not None]
    if len(birthday_hits) == 1:
        age_text = f" turns {weighted._ordinal(ages[0])}" if ages else " gets the headline"
        return f"The real reason to remember the day is {joined}, who{age_text} today."
    if ages:
        age_text = weighted._join_names_human([weighted._ordinal(age) for age in ages])  # noqa: SLF001
        return f"The real reason to remember the day is {joined}, bringing {age_text} birthday energy to the family calendar."
    return f"The real reason to remember the day is {joined}."


def _message_text_for_hits(birthday_hits: list[dict]) -> str:
    names = _birthday_names_for_copy(birthday_hits)
    joined = weighted._join_names_human(names)  # noqa: SLF001
    if not joined:
        return "No birthday today — good day to check the calendar and plan ahead."
    return f"Happy birthday, {joined}! Hope you have a great day 🎂"


def _natural_fact_paragraph(target: date, facts_for_copy: list[CuratedFact], exact_facts: list[CuratedFact]) -> str:
    date_label = target.strftime("B %d") if False else target.strftime("%B %d")
    if exact_facts:
        fact_bits = [_fact_body_sentence(fact) for fact in exact_facts[:3]]
        if len(fact_bits) == 1:
            return f"{date_label} already has a good calendar note: {fact_bits[0]}."
        if len(fact_bits) == 2:
            return f"{date_label} already has a couple of calendar notes. {fact_bits[0]} Also sharing the date: {fact_bits[1]}."
        return f"{date_label} has a busy calendar. {fact_bits[0]} Also sharing the date: {fact_bits[1]} And one more for the pile: {fact_bits[2]}."

    if facts_for_copy:
        return f"The exact-date trivia shelf is still a little light for {date_label}, but the nearby calendar gives us this: {_fact_body_sentence(facts_for_copy[0])}."

    return f"The history department is quiet for {date_label}, which is fine because the family calendar is doing the heavy lifting."


def _render_exact_day_mom_daily(
    target: date,
    birthday_hits: list[dict],
    all_facts: list[CuratedFact],
    profile: KeywordWeightProfile,
) -> str:
    day_facts = _select_mom_daily_facts(all_facts, target, profile, limit=4)
    exact_facts = [fact for fact in day_facts if fact.matches_date(target)]
    facts_for_copy = exact_facts or day_facts[:2]
    date_label = target.strftime("%B %d")

    paragraphs = [
        f"Here is your {date_label} family calendar update 🎂",
        _natural_fact_paragraph(target, facts_for_copy, exact_facts),
    ]

    birthday_line = _birthday_copy_line(target, birthday_hits)
    if birthday_hits:
        paragraphs.append(f"Interesting stuff, but not the main event. {birthday_line}")
        paragraphs.append(f"Please send some love today: {_message_text_for_hits(birthday_hits)}")
    else:
        paragraphs.append(birthday_line)

    paragraphs.append("Love you all, and hope everyone has a great day 😘")
    body = "\n\n".join(paragraphs)

    return f"""
        <div class="mom-daily-frame mom-daily-frame--exact-day">
            <p class="birthday-hint">Copy-paste-ready family note in Patti mode. The draft favors facts from {escape(date_label)} when they are available.</p>
            <textarea id="mom-daily-text" class="birthday-textarea birthday-textarea--large">{escape(body)}</textarea>
            <div class="birthday-actions"><button class="birthday-btn" type="button" id="momDailyCopyBtn">Copy Patti draft</button><span id="mom-daily-copy-status" class="birthday-hint"></span></div>
        </div>
    """


def _render_birthday_spotlight(
    target: date,
    birthday_hits: list[dict],
    facts_for_copy: list[CuratedFact],
) -> str:
    if not birthday_hits:
        return (
            "<div class='birthday-empty-state birthday-empty-state--headline'>"
            "<div class='birthday-empty-emoji'>🎈</div>"
            "<div><div class='birthday-empty-title'>No birthday is on file for this date</div>"
            "<p>Use this as a planning view: pick a birthday from the calendar, then generate the page for that day.</p></div>"
            "</div>"
        )

    names = _birthday_names_for_copy(birthday_hits)
    joined = weighted._join_names_human(names)  # noqa: SLF001
    date_label = target.strftime("%B %d")
    opening_act = _fact_sentence(facts_for_copy[0], 110) if facts_for_copy else ""
    parts = [
        "<div class='birthday-spotlight-shell birthday-spotlight-shell--headline'>",
        "<div class='birthday-headline-intro'>",
        f"<div class='birthday-mini-label'>The family headline for {escape(date_label)}</div>",
        f"<p>Everything else on the calendar is the opening act. Today’s name to remember is <strong>{escape(joined)}</strong>.</p>",
        "</div>",
    ]
    if opening_act:
        parts.append(f"<div class='birthday-opening-act'><span>Opening act</span><p>{escape(opening_act)}</p></div>")

    parts.append("<div class='birthday-stack'>")
    for hit in birthday_hits:
        raw_name = str(hit.get("name", "")).strip() or "Someone Awesome"
        relation = clean_optional_text(hit.get("relation"))
        note = _clean_display_note(hit.get("note"))
        phone = str(hit.get("phone", "")).strip()
        sms_href = f"sms:{weighted._digits_only(phone)}" if weighted._digits_only(phone) else ""  # noqa: SLF001
        age = weighted._age_for_hit(target, hit)  # noqa: SLF001
        meta = []
        if relation:
            meta.append(f"👥 {relation}")
        if age is not None:
            meta.append(f"🎈 Turns {weighted._ordinal(age)}")  # noqa: SLF001
        if phone:
            meta.append(f"📱 {weighted._display_phone(phone)}")  # noqa: SLF001
        message_text = _message_text_for_hits([hit])
        parts.append("<article class='birthday-person birthday-person--headline'>")
        parts.append("<div class='birthday-person-top'><div><div class='birthday-mini-label'>Today’s real headline</div>")
        parts.append(f"<div class='birthday-name'>🎉 {escape(raw_name)}</div></div><div class='birthday-person-badge'>🎂</div></div>")
        if meta:
            parts.append(f"<div class='birthday-meta'>{escape(' · '.join(meta))}</div>")
        if note:
            parts.append(f"<div class='birthday-note'>{escape(note)}</div>")
        parts.append(f"<div class='birthday-message-preview'><div class='birthday-mini-label'>Suggested quick text</div><p>{escape(message_text)}</p></div>")
        parts.append("<div class='birthday-actions'>")
        if sms_href:
            parts.append(f"<a class='birthday-btn birthday-btn--link' href='{escape(sms_href, quote=True)}'>Open text</a>")
        parts.append(f"<button class='birthday-btn' type='button' data-copy-text='{escape(message_text, quote=True)}'>Copy message</button></div></article>")
    parts.append("</div></div>")
    return "".join(parts)


def _replace_mom_daily_card(
    context: PageContext,
    target: date,
    birthday_hits: list[dict],
    all_facts: list[CuratedFact],
    profile: KeywordWeightProfile,
) -> None:
    replacement = _render_exact_day_mom_daily(target, birthday_hits, all_facts, profile)
    for card in context.cards:
        if card.card_type == "mom_daily":
            card.body = replacement
            card.title = "Mom Daily Draft"
            card.eyebrow = "Patti Mode"
            return


def _replace_birthday_spotlight_card(
    context: PageContext,
    target: date,
    birthday_hits: list[dict],
    facts_for_copy: list[CuratedFact],
) -> None:
    replacement = _render_birthday_spotlight(target, birthday_hits, facts_for_copy)
    for card in context.cards:
        if card.card_type == "birthday_spotlight":
            card.body = replacement
            card.title = "Today’s Real Headline"
            card.eyebrow = "Birthday Spotlight"
            return


def _render_grouped_fact_card_body(
    facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
    empty_body: str,
    more_label: str,
) -> tuple[str, str | None]:
    if not facts:
        return f"<p>{escape(empty_body)}</p>", None

    lead = facts[0]
    more = facts[1:]
    parts = [
        "<div class='fact-stack fact-stack--grouped'>",
        "<article class='fact-lead'>",
        f"<div class='fact-title'>{escape(lead.title)}</div>",
        f"<div class='fact-relevance'>{escape(_fact_label(lead, target, profile))}</div>",
        f"<p>{escape(lead.body)}</p>",
        _source_link(lead),
        "</article>",
    ]
    if more:
        parts.append("<details class='fact-more' open>")
        parts.append(f"<summary>More {escape(more_label)}</summary><ul>")
        for fact in more:
            parts.append(
                "<li>"
                f"<strong>{escape(fact.title)}</strong> "
                f"<span class='fact-relevance fact-relevance--inline'>{escape(_fact_label(fact, target, profile))}</span>"
                f"<p>{escape(weighted._trim_fact_text(fact.body, 175))}</p>"  # noqa: SLF001
                f"{_source_link(fact)}"
                "</li>"
            )
        parts.append("</ul></details>")
    parts.append("</div>")
    return "".join(parts), lead.source_url


def _build_fact_card(
    card_type: str,
    facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
) -> CardItem:
    config = FACT_CARD_CONFIG[card_type]
    body_html, source_url = _render_grouped_fact_card_body(
        facts=facts,
        target=target,
        profile=profile,
        empty_body=config["empty"],
        more_label=config["more"],
    )
    return CardItem(
        card_type,
        config["eyebrow"],
        config["title"],
        _polish_fact_labels(body_html),
        source_url,
    )


def _build_fact_cards(
    all_facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
) -> list[CardItem]:
    return [
        _build_fact_card(
            card_type,
            _select_exact_first_facts(all_facts, card_type, target, profile, limit=5 if card_type == "this_day_history" else 4),
            target,
            profile,
        )
        for card_type in FACT_CARD_ORDER
    ]


def _reorder_cards(context: PageContext, fact_cards: list[CardItem]) -> None:
    existing = {card.card_type: card for card in context.cards}
    ordered: list[CardItem] = []

    for card_type in TOP_CARD_ORDER:
        card = existing.get(card_type)
        if card:
            ordered.append(card)

    ordered.extend(fact_cards)

    for card_type in BOTTOM_CARD_ORDER:
        card = existing.get(card_type)
        if card:
            ordered.append(card)

    handled = {card.card_type for card in ordered}
    debug_or_replaced = {"birthday_focus_status", *FACT_CARD_CONFIG.keys()}
    ordered.extend(
        card
        for card in context.cards
        if card.card_type not in handled and card.card_type not in debug_or_replaced
    )
    context.cards = ordered


def _normalize_base_cards(context: PageContext) -> None:
    for card in context.cards:
        card.body = _polish_fact_labels(card.body)
        if card.card_type == "birthday_calendar":
            card.eyebrow = "Pick a Date"
            card.title = "Birthday Calendar"
        elif card.card_type == "birthday_phone_helper":
            card.eyebrow = "Quick Outreach"
            card.title = "Phone List Helper"
        elif card.card_type == "birthday_message_starter":
            card.eyebrow = "Quick Text"
            card.title = "Message Starter"
        elif card.card_type == "birthday_upcoming":
            card.eyebrow = "Plan Ahead"
            card.title = "Upcoming Birthdays"

    context.footer_text = "Built on Daily Flyer. Birthday theme prototype."
    context.metadata["hero_summary_pill"] = "Birthday tools · Patti Mode · exact-date facts"
    context.metadata["extra_css"] = f"{context.metadata.get('extra_css', '')}\n{_compatibility_css()}"


def _compatibility_css() -> str:
    return r"""
    :root { --max-width: min(1520px, calc(100vw - 44px)); }
    .hero-wrap, main, footer { width: min(100%, var(--max-width)); }
    .hero .subtitle { max-width: 76ch; text-wrap: pretty; }
    .hero-meta { align-items: stretch; }
    .hero-pill { white-space: normal; line-height: 1.35; max-width: 100%; }

    main { gap: clamp(14px, 1.35vw, 24px); align-items: start; }
    .card {
        --card-accent-a: rgba(255, 209, 106, .55);
        --card-accent-b: rgba(125, 213, 255, .42);
        --card-radius-a: 30px;
        --card-radius-b: 22px;
        --card-radius-c: 34px;
        --card-radius-d: 20px;
        border: 1px solid transparent;
        border-radius: var(--card-radius-a) var(--card-radius-b) var(--card-radius-c) var(--card-radius-d);
        background:
            linear-gradient(180deg, rgba(255,255,255,.082), rgba(255,255,255,.028)) padding-box,
            linear-gradient(135deg, var(--card-accent-a), rgba(255,255,255,.10), var(--card-accent-b)) border-box;
    }
    .card::after { background: linear-gradient(90deg, var(--card-accent-a), var(--card-accent-b)); }
    .card::before { opacity: .75; }

    .card--birthday_calendar { grid-column: span 5; --card-accent-a: rgba(255, 214, 116, .70); --card-accent-b: rgba(255, 140, 176, .46); --card-radius-a: 34px; --card-radius-b: 18px; --card-radius-c: 30px; --card-radius-d: 26px; }
    .card--mom_daily { grid-column: span 7; --card-accent-a: rgba(255, 140, 176, .64); --card-accent-b: rgba(255, 214, 116, .54); --card-radius-a: 22px; --card-radius-b: 38px; --card-radius-c: 24px; --card-radius-d: 34px; }
    .card--birthday_phone_helper { grid-column: span 4; --card-accent-a: rgba(125, 213, 255, .60); --card-accent-b: rgba(255, 214, 116, .42); --card-radius-a: 28px; --card-radius-b: 24px; --card-radius-c: 18px; --card-radius-d: 32px; }
    .card--birthday_spotlight { grid-column: span 8; --card-accent-a: rgba(255, 214, 116, .58); --card-accent-b: rgba(255, 140, 176, .58); --card-radius-a: 40px; --card-radius-b: 20px; --card-radius-c: 34px; --card-radius-d: 20px; }
    .card--this_day_history { grid-column: span 6; --card-accent-a: rgba(125, 213, 255, .58); --card-accent-b: rgba(255, 214, 116, .44); --card-radius-a: 20px; --card-radius-b: 34px; --card-radius-c: 22px; --card-radius-d: 34px; }
    .card--famous_person_birthday { grid-column: span 4; --card-accent-a: rgba(255, 214, 116, .50); --card-accent-b: rgba(255, 255, 255, .18); --card-radius-a: 24px; --card-radius-b: 24px; --card-radius-c: 38px; --card-radius-d: 18px; }
    .card--fun_fact { grid-column: span 4; --card-accent-a: rgba(255, 140, 176, .50); --card-accent-b: rgba(125, 213, 255, .40); --card-radius-a: 34px; --card-radius-b: 18px; --card-radius-c: 26px; --card-radius-d: 26px; }
    .card--classic_rock { grid-column: span 4; --card-accent-a: rgba(180, 154, 255, .48); --card-accent-b: rgba(255, 214, 116, .38); --card-radius-a: 18px; --card-radius-b: 34px; --card-radius-c: 30px; --card-radius-d: 20px; }
    .card--irish_history { grid-column: span 4; --card-accent-a: rgba(96, 214, 151, .52); --card-accent-b: rgba(255, 214, 116, .40); --card-radius-a: 30px; --card-radius-b: 20px; --card-radius-c: 18px; --card-radius-d: 34px; }
    .card--boston_sports { grid-column: span 4; --card-accent-a: rgba(125, 183, 217, .52); --card-accent-b: rgba(255, 140, 176, .34); --card-radius-a: 22px; --card-radius-b: 30px; --card-radius-c: 36px; --card-radius-d: 18px; }
    .card--birthday_message_starter, .card--birthday_upcoming { grid-column: span 6; }

    .card-head { gap: .85rem; }
    .eyebrow { line-height: 1.35; overflow-wrap: anywhere; }
    h2 { text-wrap: balance; }
    .body { overflow-wrap: anywhere; }
    .birthday-helper-panel, .birthday-spotlight-shell, .mom-daily-frame, .fact-stack, .birthday-upcoming-list, .birthday-stack, .birthday-calendar-wrap { display: grid; gap: .9rem; }
    .birthday-calendar-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
    .birthday-calendar-title { font-size: 1.28rem; font-weight: 800; color: var(--ink); }
    .birthday-calendar-subtitle, .birthday-selected, .birthday-hint { color: #d5c8e6; font-size: .88rem; }
    .birthday-calendar-nav, .birthday-calendar-controls, .birthday-summary-row, .birthday-stat-row, .birthday-actions, .mom-daily-anatomy { display: flex; flex-wrap: wrap; gap: .55rem; align-items: center; }
    .birthday-iconbtn, .birthday-btn, .birthday-soft-pill, .birthday-summary-pill, .mom-daily-anatomy span, .fact-relevance { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.08); color: var(--ink); border-radius: 999px; padding: .45rem .75rem; font-weight: 700; }
    .birthday-iconbtn, .birthday-btn { cursor: pointer; font: inherit; }
    .birthday-btn { border-radius: 14px; }
    .birthday-summary-pill--warm { background: rgba(255,204,122,.18); color: #fff0ca; }
    .birthday-calendar { width: 100%; border-collapse: separate; border-spacing: .3rem; }
    .birthday-calendar th { font-size: .78rem; color: #d3c5e8; padding: .2rem 0; text-align: center; }
    .birthday-calendar td { padding: 0; }
    .birthday-day { width: 100%; min-height: 58px; display: flex; align-items: center; justify-content: center; position: relative; border-radius: 18px; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.05); color: var(--ink); cursor: pointer; user-select: none; font-weight: 800; }
    .birthday-day:hover { background: rgba(255,255,255,.09); transform: translateY(-1px); }
    .birthday-day.muted { opacity: .24; cursor: default; }
    .birthday-day.today { outline: 2px solid rgba(255,255,255,.22); }
    .birthday-day.selected { outline: 2px solid rgba(255,214,116,.78); background: rgba(255,214,116,.14); box-shadow: 0 12px 24px rgba(255,214,116,.14); }
    .birthday-day.has-birthday { background: rgba(255,170,90,.12); border-color: rgba(255,170,90,.30); }
    .birthday-day-dot, .birthday-day-count { position: absolute; bottom: 6px; border-radius: 999px; background: rgba(255,215,120,.96); box-shadow: 0 0 10px rgba(255,215,120,.40); }
    .birthday-day-dot { width: 6px; height: 6px; }
    .birthday-day-count { min-width: 18px; height: 18px; padding: 0 .35rem; color: #24160a; font-size: .72rem; font-weight: 900; }
    .birthday-calendar-legend { display: flex; flex-wrap: wrap; gap: .9rem; color: #d7cbe7; font-size: .84rem; }
    .birthday-legend-dot, .birthday-legend-pill { display: inline-block; border-radius: 999px; background: rgba(255,215,120,.95); margin-right: .35rem; }
    .birthday-legend-dot { width: 8px; height: 8px; }
    .birthday-legend-pill { width: 18px; height: 12px; background: rgba(255,215,120,.30); border: 1px solid rgba(255,215,120,.72); }
    .birthday-person, .birthday-upcoming-item, .fact-lead, .fact-more, .birthday-empty-state, .birthday-headline-intro, .birthday-opening-act { padding: 1rem; border-radius: 18px 22px 18px 26px; background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03)); border: 1px solid rgba(255,255,255,.10); }
    .birthday-person-top, .birthday-upcoming-item { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .birthday-mini-label { color: #ffd9a0; font-size: .74rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .birthday-name { margin-top: .18rem; font-weight: 700; font-size: 1.26rem; color: var(--ink); }
    .birthday-meta, .birthday-note, .birthday-upcoming-meta { color: #d5c8e6; font-size: .88rem; }
    .birthday-opening-act span { display: inline-flex; margin-bottom: .35rem; color: #ffd9a0; font-size: .72rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .birthday-opening-act p, .birthday-headline-intro p { margin: .2rem 0 0; }
    .birthday-textarea { width: 100%; min-height: 120px; resize: vertical; padding: .95rem 1rem; border-radius: 16px 22px 16px 22px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: var(--ink); font: inherit; line-height: 1.55; box-sizing: border-box; }
    .birthday-textarea--large { min-height: 330px; }
    .birthday-date-badge { width: 64px; min-width: 64px; border-radius: 18px; padding: .55rem .35rem; background: rgba(255,214,116,.18); text-align: center; }
    .birthday-date-month { display: block; color: #ffe6b8; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .fact-title { color: var(--ink); font-weight: 800; font-size: 1.08rem; margin-bottom: .45rem; }
    .fact-source a { color: #ffe6b8; font-weight: 800; text-decoration: none; }
    .fact-source a:hover { text-decoration: underline; }
    .fact-relevance {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        max-width: 100%;
        color: #fff2c8;
        background: rgba(255, 255, 255, .07);
        border-color: rgba(255, 255, 255, .12);
        text-transform: uppercase;
        letter-spacing: .08em;
        font-size: .68rem;
        white-space: normal;
        line-height: 1.3;
        overflow-wrap: anywhere;
    }
    .fact-relevance--inline { margin-left: .35rem; padding: .18rem .45rem; vertical-align: middle; }
    .fact-more summary { cursor: pointer; color: #ffe6b8; font-weight: 800; }
    .fact-more ul { margin: .85rem 0 0; padding-left: 1.1rem; display: grid; gap: .75rem; }
    .birthday-message-preview { margin-top: .85rem; }

    @media (max-width: 1180px) {
        .card--birthday_calendar, .card--mom_daily, .card--birthday_spotlight { grid-column: span 12; }
        .card--birthday_phone_helper, .card--this_day_history, .card--birthday_message_starter, .card--birthday_upcoming { grid-column: span 6; }
    }
    @media (max-width: 980px) {
        :root { --max-width: calc(100vw - 28px); }
        .card--birthday_calendar, .card--mom_daily, .card--birthday_phone_helper, .card--birthday_spotlight, .card--this_day_history, .card--birthday_message_starter, .card--birthday_upcoming, .card--famous_person_birthday, .card--fun_fact, .card--classic_rock, .card--irish_history, .card--boston_sports { grid-column: span 6; }
    }
    @media (max-width: 720px) {
        :root { --max-width: calc(100vw - 18px); }
        .hero-wrap { padding-left: 9px; padding-right: 9px; }
        main { padding-left: 9px; padding-right: 9px; }
        .card--birthday_calendar, .card--mom_daily, .card--birthday_phone_helper, .card--birthday_spotlight, .card--this_day_history, .card--birthday_message_starter, .card--birthday_upcoming, .card--famous_person_birthday, .card--fun_fact, .card--classic_rock, .card--irish_history, .card--boston_sports { grid-column: auto; }
        .birthday-calendar-head { flex-direction: column; }
        .birthday-day { min-height: 48px; border-radius: 14px; }
        .birthday-date-badge { width: 56px; min-width: 56px; }
        .fact-relevance--inline { display: inline-flex; margin: .35rem 0 0; }
    }
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = weighted.build_theme_page(date_str=date_str, seed=seed)
    target = resolve_date(date_str)
    profile = load_keyword_weight_profile(WEIGHT_PROFILE_NAME)
    birthdays = load_birthdays()
    birthday_hits = birthdays_for_date(birthdays, target.month, target.day)
    available_facts = approved_facts() + approved_birthday_theme_facts()
    day_facts = _select_mom_daily_facts(available_facts, target, profile, limit=4)
    fact_cards = _build_fact_cards(available_facts, target, profile)

    _normalize_base_cards(context)
    _replace_mom_daily_card(context, target, birthday_hits, available_facts, profile)
    _replace_birthday_spotlight_card(context, target, birthday_hits, day_facts)
    _reorder_cards(context, fact_cards)
    return context
