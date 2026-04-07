
from __future__ import annotations

import json
import random
from datetime import date
from html import escape

from daily_flyer.birthdays import (
    birthdays_for_date,
    build_birthday_index,
    clean_optional_text,
    filter_phones_excluding_birthday_people,
    load_birthdays,
    people_to_phone_list,
    phones_to_to_field_text,
)
from daily_flyer.curated_fact_store import CuratedFact, approved_facts, select_fact_for_card_type
from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "this_day_birthday"
CURATED_CARD_ORDER = (
    "classic_rock",
    "irish_history",
    "boston_sports",
    "famous_person_birthday",
    "fun_fact",
)

THEME_CONFIG = {
    "page_title": "BirthDay Today — Celebrate the right people, on the right day",
    "header_title": "BirthDay Today 🎂",
    "header_subtitle": "Birthday reminders, a visual date picker, and fast outreach helpers",
    "footer_text": "Built on Daily Flyer. Birthday theme prototype.",
    "hero_kicker": "Daily Flyer • Birthday Theme",
    "hero_summary_pill": "Calendar-driven birthday planning and curated cards",
}


def _safe_birthday_date(year: int, month: int, day: int) -> date:
    try:
        return date(year, month, day)
    except ValueError:
        if month == 2 and day == 29:
            return date(year, 2, 28)
        raise


def _next_occurrence(base: date, month: int, day: int) -> date:
    candidate = _safe_birthday_date(base.year, month, day)
    if candidate < base:
        candidate = _safe_birthday_date(base.year + 1, month, day)
    return candidate


def _digits_only(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _display_phone(phone: str) -> str:
    digits = _digits_only(phone)
    if len(digits) == 10:
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    return str(phone or "").strip()


def _sms_href(phone: str) -> str | None:
    digits = _digits_only(phone)
    if not digits:
        return None
    return f"sms:{digits}"


def _first_name(full_name: str) -> str:
    parts = [part for part in str(full_name or "").strip().split() if part]
    return parts[0] if parts else "there"


def _join_names_human(names: list[str]) -> str:
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])}, and {names[-1]}"


def _sort_name_key(name: str) -> str:
    parts = name.split()
    last = parts[-1] if parts else ""
    return f"{last}|{name}".lower()


def _message_text_for_hits(birthday_hits: list[dict], rng: random.Random) -> str:
    names = [
        str(item.get("name", "")).strip()
        for item in birthday_hits
        if str(item.get("name", "")).strip()
    ]

    if not names:
        return "No birthday today — good day to check the calendar and plan ahead."

    first_names = [_first_name(name) for name in names]
    joined = _join_names_human(first_names)
    prompts = [
        f"Happy birthday, {joined}! Hope you have a great day.",
        f"Happy birthday, {joined}! Wishing you a fun day and a great year ahead.",
        f"Happy birthday, {joined}! Hope today treats you really well.",
        f"Happy birthday, {joined}! Hope you get to celebrate and enjoy the day.",
    ]
    return rng.choice(prompts)


def _render_birthday_spotlight(birthday_hits: list[dict], message_text: str) -> str:
    if not birthday_hits:
        return (
            "<div class='birthday-empty-state'>"
            "<div class='birthday-empty-emoji'>🎈</div>"
            "<div>"
            "<div class='birthday-empty-title'>No birthday is on file for this date</div>"
            "<p>Use the calendar to jump ahead, or treat this as a planning day with fun cards and a future-message draft.</p>"
            "</div>"
            "</div>"
        )

    count = len(birthday_hits)
    count_label = f"{count} birthday{'s' if count != 1 else ''} on file"

    parts: list[str] = [
        "<div class='birthday-spotlight-shell'>",
        "<div class='birthday-summary-row'>",
        f"<span class='birthday-summary-pill birthday-summary-pill--warm'>🎂 {escape(count_label)}</span>",
        "<span class='birthday-summary-pill'>💬 Message starter ready</span>",
        "<span class='birthday-summary-pill'>📱 Text helpers below</span>",
        "</div>",
        "<div class='birthday-stack'>",
    ]

    for hit in birthday_hits:
        raw_name = str(hit.get("name", "")).strip() or "Someone Awesome"
        relation = clean_optional_text(hit.get("relation"))
        note = clean_optional_text(hit.get("note"))
        phone = str(hit.get("phone", "")).strip()
        sms_href = _sms_href(phone)

        parts.append("<article class='birthday-person'>")
        parts.append("<div class='birthday-person-top'>")
        parts.append("<div>")
        parts.append("<div class='birthday-mini-label'>Today’s celebration</div>")
        parts.append(f"<div class='birthday-name'>🎉 {escape(raw_name)}</div>")
        parts.append("</div>")
        parts.append("<div class='birthday-person-badge' aria-hidden='true'>🎂</div>")
        parts.append("</div>")

        meta_bits: list[str] = []
        if relation:
            meta_bits.append(f"👥 {escape(relation)}")
        if phone:
            meta_bits.append(f"📱 {escape(_display_phone(phone))}")
        if meta_bits:
            parts.append(f"<div class='birthday-meta'>{' · '.join(meta_bits)}</div>")
        if note:
            parts.append(f"<div class='birthday-note'>{escape(note)}</div>")

        parts.append("<div class='birthday-message-preview'>")
        parts.append("<div class='birthday-mini-label'>Suggested text</div>")
        parts.append(f"<p>{escape(message_text)}</p>")
        parts.append("</div>")

        parts.append("<div class='birthday-actions'>")
        if sms_href:
            parts.append(
                f"<a class='birthday-btn birthday-btn--link' href='{escape(sms_href, quote=True)}'>Open text</a>"
            )
        parts.append(
            f"<button class='birthday-btn' type='button' data-copy-text='{escape(message_text, quote=True)}'>Copy message</button>"
        )
        parts.append("</div>")
        parts.append("</article>")

    parts.append("</div>")
    parts.append("</div>")
    return "".join(parts)


def _render_phone_helper(phones: list[dict[str, str]], birthday_hits: list[dict]) -> str:
    phones_text = phones_to_to_field_text(phones)

    birthday_names = [
        str(x.get("name", "")).strip()
        for x in birthday_hits
        if str(x.get("name", "")).strip()
    ]
    safe_joined = escape(_join_names_human(birthday_names)) if birthday_names else ""

    if birthday_names:
        intro = f"<p>This list excludes today’s birthday person: <strong>{safe_joined}</strong>.</p>"
    else:
        intro = "<p>No birthday person to exclude for this date, so the full list is shown.</p>"

    if not phones_text.strip():
        return (
            "<div class='birthday-helper-panel'>"
            f"{intro}"
            "<p><em>No phone numbers are available yet.</em></p>"
            "</div>"
        )

    count_label = f"{len(phones)} recipient{'s' if len(phones) != 1 else ''}"
    return f"""
        <div class="birthday-helper-panel">
            {intro}
            <div class="birthday-stat-row">
                <span class="birthday-soft-pill">👥 {escape(count_label)}</span>
                <span class="birthday-soft-pill">📋 Copy-paste ready</span>
            </div>
            <p class="birthday-hint">Ready to paste into a new group text “To:” field.</p>
            <textarea id="birthday-phone-list" class="birthday-textarea" readonly>{escape(phones_text)}</textarea>
            <div class="birthday-actions">
                <button class="birthday-btn" type="button" id="birthdayPhoneCopyBtn">Copy numbers</button>
                <span id="birthday-phone-copy-status" class="birthday-hint"></span>
            </div>
        </div>
    """


def _render_upcoming_birthdays(today: date, birthdays: list[dict], limit: int = 8) -> str:
    upcoming = []
    for item in birthdays:
        try:
            month = int(item.get("month", 0))
            day = int(item.get("day", 0))
        except (TypeError, ValueError):
            continue

        name = str(item.get("name", "")).strip()
        if not name or not (1 <= month <= 12 and 1 <= day <= 31):
            continue

        occurrence = _next_occurrence(today, month, day)
        relation = clean_optional_text(item.get("relation"))
        delta_days = (occurrence - today).days
        upcoming.append((occurrence, delta_days, _sort_name_key(name), name, relation))

    upcoming.sort(key=lambda x: (x[0], x[2]))
    rows = upcoming[:limit]
    if not rows:
        return "<div class='birthday-helper-panel'><p><em>No upcoming birthdays found.</em></p></div>"

    html_parts = ["<div class='birthday-upcoming-list'>"]
    for occurrence, delta_days, _, name, relation in rows:
        relation_text = f" · {escape(relation)}" if relation else ""
        if delta_days == 0:
            delta_text = "Today"
        elif delta_days == 1:
            delta_text = "Tomorrow"
        else:
            delta_text = f"In {delta_days} days"

        html_parts.append(
            "<div class='birthday-upcoming-item'>"
            "<div class='birthday-date-badge'>"
            f"<span class='birthday-date-month'>{escape(occurrence.strftime('%b'))}</span>"
            f"<strong>{escape(occurrence.strftime('%d'))}</strong>"
            "</div>"
            "<div class='birthday-upcoming-copy'>"
            f"<div class='birthday-upcoming-name'>{escape(name)}</div>"
            f"<div class='birthday-upcoming-meta'>{escape(delta_text)}{relation_text}</div>"
            "</div>"
            "</div>"
        )
    html_parts.append("</div>")
    return "".join(html_parts)


def _calendar_card_html(today: date) -> str:
    selected_label = today.strftime("%B %d, %Y")
    return f"""
        <div class="birthday-calendar-wrap">
            <div class="birthday-calendar-head">
                <div>
                    <div class="birthday-calendar-title" id="birthdayCalTitle">Month YYYY</div>
                    <div class="birthday-calendar-subtitle">Browse birthdays across the year and jump to any date.</div>
                </div>
                <div class="birthday-calendar-nav">
                    <button class="birthday-iconbtn" type="button" id="birthdayTodayBtn">Today</button>
                    <button class="birthday-iconbtn" type="button" id="birthdayCalPrev" aria-label="Previous month">‹</button>
                    <button class="birthday-iconbtn" type="button" id="birthdayCalNext" aria-label="Next month">›</button>
                </div>
            </div>

            <table class="birthday-calendar">
                <thead>
                    <tr id="birthdayCalHeadRow"></tr>
                </thead>
                <tbody id="birthdayCalBody"></tbody>
            </table>

            <div class="birthday-calendar-legend">
                <span><span class="birthday-legend-dot"></span> birthday on file</span>
                <span><span class="birthday-legend-pill"></span> selected date</span>
            </div>

            <div class="birthday-calendar-controls">
                <button class="birthday-btn" type="button" id="birthdayGenerateBtn">Generate</button>
                <div>
                    <div class="birthday-selected" id="birthdaySelectedLabel">Selected: {escape(selected_label)}</div>
                    <div class="birthday-hint" id="birthdayGenerateHint">Click a date, then Generate.</div>
                </div>
            </div>
        </div>
    """


def _render_fact_card_body(fact: CuratedFact | None, fallback_title: str, fallback_body: str) -> tuple[str, str, str | None]:
    if fact is None:
        return fallback_title, f"<p>{escape(fallback_body)}</p>", None
    body_html = f"<p>{escape(fact.body)}</p><p class='birthday-hint'>Source: {escape(fact.source_name)}</p>"
    return fact.title, body_html, fact.source_url


def _mom_opening(target: date, birthday_hits: list[dict], rng: random.Random) -> str:
    openers = [
        f"Happy {target.strftime('%A')} everybody!",
        "Well hello there cousins!",
        "Hi everyone — here is your little daily update!",
        "Hope everybody is doing well today!",
    ]
    if birthday_hits:
        openers.append("Big birthday energy today!")
    return rng.choice(openers)


def _mom_fact_sentence(label: str, fact: CuratedFact | None) -> str:
    if not fact:
        return ""
    return f"For {label}, {fact.body.rstrip('.! ')}."


def _render_mom_daily(
    target: date,
    birthday_hits: list[dict],
    message_text: str,
    selected_facts: dict[str, CuratedFact | None],
    rng: random.Random,
) -> str:
    names = [
        str(item.get("name", "")).strip()
        for item in birthday_hits
        if str(item.get("name", "")).strip()
    ]
    first_names = [_first_name(name) for name in names]
    birthday_joined = _join_names_human(first_names)

    lines: list[str] = []
    lines.append(_mom_opening(target, birthday_hits, rng))

    for label, card_type in (
        ("classic rock", "classic_rock"),
        ("Irish history", "irish_history"),
        ("Boston sports", "boston_sports"),
        ("a famous birthday", "famous_person_birthday"),
        ("today’s fun fact", "fun_fact"),
    ):
        line = _mom_fact_sentence(label, selected_facts.get(card_type))
        if line:
            lines.append(line)

    if birthday_hits:
        lines.append(
            f"But of course the most important thing today is wishing {birthday_joined} a very happy birthday!"
        )
        lines.append(message_text)
    else:
        lines.append("No family birthday lands on this date, so this is a nice little planning day.")

    closer = rng.choice(
        [
            "Have a great day everybody 💕",
            "Love you all and hope you have a fun day 😊",
            "Enjoy the day and do not forget to check in on each other 💖",
            "Sending love to everybody and hope somebody has cake somewhere 🎂",
        ]
    )
    lines.append(closer)

    body = " ".join(lines)
    return f"""
        <p class="birthday-hint">Warm, casual, copy-paste-ready draft in Patti mode.</p>
        <textarea id="mom-daily-text" class="birthday-textarea birthday-textarea--large">{escape(body)}</textarea>
        <div class="birthday-actions">
            <button class="birthday-btn" type="button" id="momDailyCopyBtn">Copy full draft</button>
            <span id="mom-daily-copy-status" class="birthday-hint"></span>
        </div>
    """


def _extra_head_html() -> str:
    return """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    """


def _extra_css() -> str:
    return r"""
    body {
        font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
            radial-gradient(circle at 10% 10%, rgba(255, 170, 196, 0.20), transparent 22%),
            radial-gradient(circle at 88% 12%, rgba(255, 218, 122, 0.18), transparent 24%),
            radial-gradient(circle at 50% 100%, rgba(123, 197, 255, 0.15), transparent 28%),
            linear-gradient(180deg, #1b1323 0%, #141d2e 42%, #0a1320 100%);
    }

    body::before {
        width: 480px;
        height: 480px;
        top: -110px;
        left: -140px;
        background: radial-gradient(circle, rgba(255, 170, 196, 0.18), transparent 70%);
    }

    body::after {
        width: 420px;
        height: 420px;
        right: -120px;
        top: 120px;
        background: radial-gradient(circle, rgba(255, 218, 122, 0.16), transparent 70%);
    }

    header.hero {
        padding: 46px 30px 38px;
        border-radius: 34px;
        border-color: rgba(255,255,255,0.16);
        background:
            radial-gradient(circle at top left, rgba(255, 199, 112, 0.18), transparent 28%),
            radial-gradient(circle at 78% 18%, rgba(255, 146, 175, 0.14), transparent 24%),
            linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03)),
            linear-gradient(150deg, rgba(64, 32, 84, 0.92), rgba(25, 32, 52, 0.94));
        box-shadow:
            0 28px 80px rgba(0,0,0,0.34),
            inset 0 1px 0 rgba(255,255,255,0.10);
    }

    header.hero::before {
        background:
            linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent),
            radial-gradient(circle at 10% 20%, rgba(255, 211, 127, 0.18), transparent 20%),
            radial-gradient(circle at 90% 24%, rgba(255, 146, 175, 0.18), transparent 22%);
        opacity: 1;
    }

    header.hero::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
            radial-gradient(circle at 14% 72%, rgba(255,255,255,0.16) 0 2px, transparent 3px),
            radial-gradient(circle at 24% 18%, rgba(255, 211, 127, 0.35) 0 3px, transparent 4px),
            radial-gradient(circle at 60% 16%, rgba(255, 155, 183, 0.28) 0 3px, transparent 4px),
            radial-gradient(circle at 88% 72%, rgba(146, 219, 255, 0.20) 0 3px, transparent 4px);
        opacity: 0.7;
    }

    .hero-kicker,
    .hero-pill,
    .birthday-soft-pill,
    .birthday-summary-pill,
    .birthday-chip {
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }

    .hero-kicker {
        background: rgba(255,255,255,0.09);
        border-color: rgba(255,255,255,0.14);
        color: #ffe7c2;
    }

    .hero h1,
    h2,
    .birthday-calendar-title,
    .birthday-name,
    .birthday-upcoming-name,
    .birthday-empty-title {
        font-family: "Fraunces", Georgia, serif;
    }

    .hero h1 {
        max-width: 11ch;
        font-size: clamp(2.7rem, 6.4vw, 5.25rem);
        line-height: 0.94;
        letter-spacing: -0.04em;
        text-shadow: 0 8px 30px rgba(0,0,0,0.22);
    }

    .hero .subtitle {
        max-width: 60ch;
        font-size: 1.08rem;
        color: #eadff4;
    }

    .hero-pill {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.10);
    }

    .eyebrow {
        color: #f7d6a3;
    }

    .icon-badge {
        background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06));
        border-color: rgba(255,255,255,0.12);
        box-shadow: 0 12px 24px rgba(0,0,0,0.16);
    }

    .card {
        min-height: 230px;
        border-color: rgba(255,255,255,0.10);
        background:
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
            rgba(18, 26, 43, 0.82);
        box-shadow:
            0 18px 44px rgba(0,0,0,0.22),
            inset 0 1px 0 rgba(255,255,255,0.05);
    }

    .card:hover {
        transform: translateY(-5px);
    }

    .card::after {
        height: 5px;
        background: linear-gradient(90deg, #ffd16a, #ff8cb0, #7dd5ff);
    }

    .card--birthday_calendar {
        grid-column: span 7;
        background:
            radial-gradient(circle at top left, rgba(255, 211, 127, 0.16), transparent 26%),
            linear-gradient(180deg, rgba(143, 213, 255, 0.10), rgba(255,255,255,0.02)),
            rgba(15, 27, 46, 0.90);
    }

    .card--birthday_spotlight {
        grid-column: span 5;
        background:
            radial-gradient(circle at top right, rgba(255, 151, 179, 0.18), transparent 28%),
            linear-gradient(180deg, rgba(255, 199, 112, 0.12), rgba(255,255,255,0.03)),
            rgba(32, 24, 45, 0.92);
    }

    .card--birthday_phone_helper,
    .card--birthday_message_starter,
    .card--birthday_upcoming,
    .card--classic_rock,
    .card--irish_history,
    .card--boston_sports,
    .card--famous_person_birthday,
    .card--fun_fact {
        grid-column: span 4;
    }

    .card--birthday_phone_helper {
        background:
            linear-gradient(180deg, rgba(122, 219, 187, 0.14), rgba(255,255,255,0.03)),
            rgba(16, 35, 41, 0.88);
    }

    .card--birthday_message_starter {
        background:
            linear-gradient(180deg, rgba(255, 163, 193, 0.16), rgba(255,255,255,0.03)),
            rgba(34, 21, 38, 0.90);
    }

    .card--birthday_upcoming {
        background:
            linear-gradient(180deg, rgba(160, 188, 255, 0.16), rgba(255,255,255,0.03)),
            rgba(20, 28, 48, 0.90);
    }

    .card--classic_rock {
        background:
            linear-gradient(180deg, rgba(255, 170, 90, 0.18), rgba(255,255,255,0.03)),
            rgba(39, 26, 29, 0.90);
    }

    .card--irish_history {
        background:
            linear-gradient(180deg, rgba(88, 196, 133, 0.18), rgba(255,255,255,0.03)),
            rgba(15, 36, 30, 0.90);
    }

    .card--boston_sports {
        background:
            linear-gradient(180deg, rgba(128, 182, 255, 0.18), rgba(255,255,255,0.03)),
            rgba(16, 27, 45, 0.90);
    }

    .card--famous_person_birthday {
        background:
            linear-gradient(180deg, rgba(255, 188, 120, 0.18), rgba(255,255,255,0.03)),
            rgba(40, 27, 34, 0.90);
    }

    .card--fun_fact {
        background:
            linear-gradient(180deg, rgba(115, 220, 228, 0.18), rgba(255,255,255,0.03)),
            rgba(16, 34, 39, 0.90);
    }

    .card--mom_daily {
        grid-column: span 12;
        background:
            radial-gradient(circle at top left, rgba(255, 203, 122, 0.16), transparent 24%),
            linear-gradient(180deg, rgba(255, 170, 90, 0.14), rgba(255,255,255,0.02)),
            rgba(43, 28, 28, 0.92);
    }

    .birthday-calendar-wrap {
        display: grid;
        gap: 1rem;
    }

    .birthday-calendar-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
    }

    .birthday-calendar-title {
        font-size: 1.28rem;
        font-weight: 700;
        color: var(--ink);
    }

    .birthday-calendar-subtitle {
        margin-top: 0.2rem;
        color: #d4c9e7;
        font-size: 0.92rem;
    }

    .birthday-calendar-nav {
        display: flex;
        gap: 0.55rem;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .birthday-iconbtn,
    .birthday-btn {
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.08);
        color: var(--ink);
        border-radius: 14px;
        cursor: pointer;
        text-decoration: none;
        font: inherit;
        transition: background 160ms ease, transform 160ms ease, border-color 160ms ease;
    }

    .birthday-iconbtn {
        min-width: 38px;
        height: 38px;
        padding: 0 0.8rem;
        font-size: 0.95rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .birthday-btn {
        padding: 0.72rem 1rem;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .birthday-btn--link {
        color: var(--ink);
    }

    .birthday-iconbtn:hover,
    .birthday-btn:hover {
        background: rgba(255,255,255,0.12);
        border-color: rgba(255,255,255,0.18);
        transform: translateY(-1px);
        text-decoration: none;
    }

    .birthday-calendar {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0.3rem;
    }

    .birthday-calendar th {
        font-size: 0.78rem;
        color: #d3c5e8;
        padding: 0.2rem 0;
        text-align: center;
    }

    .birthday-calendar td {
        padding: 0;
    }

    .birthday-day {
        width: 100%;
        min-height: 58px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.05);
        color: var(--ink);
        cursor: pointer;
        user-select: none;
        font-weight: 700;
        transition: transform 150ms ease, background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    }

    .birthday-day:hover {
        background: rgba(255,255,255,0.09);
        transform: translateY(-1px);
    }

    .birthday-day.muted {
        opacity: 0.24;
        cursor: default;
    }

    .birthday-day.today {
        outline: 2px solid rgba(255,255,255,0.22);
    }

    .birthday-day.selected {
        outline: 2px solid rgba(255, 214, 116, 0.78);
        background: rgba(255, 214, 116, 0.14);
        box-shadow: 0 12px 24px rgba(255, 214, 116, 0.14);
    }

    .birthday-day.has-birthday {
        background: rgba(255, 170, 90, 0.12);
        border-color: rgba(255, 170, 90, 0.30);
    }

    .birthday-day-dot,
    .birthday-day-count {
        position: absolute;
        bottom: 6px;
        border-radius: 999px;
        background: rgba(255, 215, 120, 0.96);
        box-shadow: 0 0 10px rgba(255, 215, 120, 0.40);
    }

    .birthday-day-dot {
        width: 6px;
        height: 6px;
    }

    .birthday-day-count {
        min-width: 18px;
        height: 18px;
        padding: 0 0.35rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #24160a;
        font-size: 0.72rem;
        font-weight: 800;
    }

    .birthday-calendar-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.9rem;
        color: #d7cbe7;
        font-size: 0.84rem;
    }

    .birthday-calendar-legend span {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
    }

    .birthday-legend-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255, 215, 120, 0.95);
        display: inline-block;
    }

    .birthday-legend-pill {
        width: 18px;
        height: 12px;
        border-radius: 999px;
        background: rgba(255, 215, 120, 0.30);
        border: 1px solid rgba(255, 215, 120, 0.72);
        display: inline-block;
    }

    .birthday-calendar-controls {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        flex-wrap: wrap;
    }

    .birthday-selected {
        font-weight: 700;
        color: var(--ink-soft);
    }

    .birthday-hint {
        color: #d5c8e6;
        font-size: 0.85rem;
    }

    .birthday-spotlight-shell,
    .birthday-helper-panel {
        display: grid;
        gap: 0.9rem;
    }

    .birthday-summary-row,
    .birthday-stat-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
    }

    .birthday-summary-pill,
    .birthday-soft-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.42rem 0.72rem;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        font-size: 0.8rem;
        color: var(--ink);
        font-weight: 700;
    }

    .birthday-summary-pill--warm {
        background: rgba(255, 204, 122, 0.18);
        border-color: rgba(255, 204, 122, 0.28);
        color: #fff0ca;
    }

    .birthday-stack {
        display: grid;
        gap: 1rem;
    }

    .birthday-person {
        padding: 1rem;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
        border: 1px solid rgba(255,255,255,0.10);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .birthday-person-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
    }

    .birthday-mini-label {
        color: #ffd9a0;
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .birthday-person-badge {
        width: 42px;
        height: 42px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.10);
        font-size: 1.1rem;
    }

    .birthday-name {
        margin-top: 0.18rem;
        font-weight: 700;
        font-size: 1.26rem;
        line-height: 1.08;
        color: var(--ink);
    }

    .birthday-meta {
        margin-top: 0.4rem;
        color: #e5d8f6;
    }

    .birthday-note {
        margin-top: 0.55rem;
        color: var(--ink-soft);
    }

    .birthday-message-preview {
        margin-top: 0.8rem;
        padding: 0.8rem 0.9rem;
        border-radius: 16px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
    }

    .birthday-message-preview p {
        margin: 0.35rem 0 0;
        color: var(--ink);
    }

    .birthday-empty-state {
        min-height: 220px;
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
        border: 1px solid rgba(255,255,255,0.10);
    }

    .birthday-empty-emoji {
        width: 68px;
        height: 68px;
        border-radius: 22px;
        display: grid;
        place-items: center;
        font-size: 1.9rem;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.10);
        flex: 0 0 auto;
    }

    .birthday-empty-title {
        font-size: 1.18rem;
        color: var(--ink);
    }

    .birthday-upcoming-list {
        display: grid;
        gap: 0.8rem;
    }

    .birthday-upcoming-item {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        padding: 0.8rem 0.85rem;
        border-radius: 18px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.09);
    }

    .birthday-date-badge {
        width: 64px;
        min-width: 64px;
        border-radius: 18px;
        padding: 0.55rem 0.35rem;
        background: linear-gradient(180deg, rgba(255, 214, 116, 0.22), rgba(255,255,255,0.06));
        border: 1px solid rgba(255,255,255,0.10);
        text-align: center;
        color: var(--ink);
    }

    .birthday-date-badge strong {
        display: block;
        font-size: 1.2rem;
        line-height: 1;
    }

    .birthday-date-month {
        display: block;
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ffe6b8;
        margin-bottom: 0.22rem;
    }

    .birthday-upcoming-copy {
        min-width: 0;
    }

    .birthday-upcoming-name {
        font-size: 1.02rem;
        color: var(--ink);
    }

    .birthday-upcoming-meta {
        margin-top: 0.2rem;
        color: #d5c8e6;
    }

    .birthday-chip {
        display: inline-flex;
        align-items: center;
        margin-left: 0.45rem;
        padding: 0.12rem 0.5rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--muted);
        font-size: 0.74rem;
        font-weight: 700;
    }

    .birthday-textarea {
        width: 100%;
        min-height: 120px;
        resize: vertical;
        padding: 0.95rem 1rem;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: var(--ink);
        font: inherit;
        line-height: 1.55;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .birthday-textarea:focus {
        outline: 2px solid rgba(255, 214, 116, 0.38);
        border-color: rgba(255, 214, 116, 0.48);
    }

    .birthday-textarea--large {
        min-height: 280px;
    }

    .birthday-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-top: 0.75rem;
    }

    @media (max-width: 980px) {
        .card--birthday_calendar,
        .card--birthday_spotlight,
        .card--birthday_phone_helper,
        .card--birthday_message_starter,
        .card--birthday_upcoming,
        .card--classic_rock,
        .card--irish_history,
        .card--boston_sports,
        .card--famous_person_birthday,
        .card--fun_fact {
            grid-column: span 6;
        }

        .card--mom_daily {
            grid-column: span 12;
        }
    }

    @media (max-width: 720px) {
        .card--birthday_calendar,
        .card--birthday_spotlight,
        .card--birthday_phone_helper,
        .card--birthday_message_starter,
        .card--birthday_upcoming,
        .card--classic_rock,
        .card--irish_history,
        .card--boston_sports,
        .card--famous_person_birthday,
        .card--fun_fact,
        .card--mom_daily {
            grid-column: auto;
        }

        header.hero {
            padding: 38px 22px 30px;
            border-radius: 26px;
        }

        .birthday-calendar-head {
            align-items: flex-start;
            flex-direction: column;
        }

        .birthday-calendar-nav {
            justify-content: flex-start;
        }

        .birthday-empty-state {
            align-items: flex-start;
            flex-direction: column;
        }
    }
    """


def _extra_js(today: date, birthday_index: dict[str, list[str]]) -> str:
    payload_index = json.dumps(birthday_index, ensure_ascii=False)
    payload_init = json.dumps(
        {"year": today.year, "month": today.month, "day": today.day, "theme": THEME_NAME},
        ensure_ascii=False,
    )
    return f"""
    const BDAY_INDEX = {payload_index};
    const BDAY_INIT = {payload_init};

    async function copyTextValue(value, statusId) {{
        const status = statusId ? document.getElementById(statusId) : null;
        function updateStatus(text) {{
            if (!status) return;
            status.textContent = text;
            setTimeout(() => {{ if (status.textContent === text) status.textContent = ""; }}, 1600);
        }}
        try {{
            if (navigator.clipboard && window.isSecureContext) {{
                await navigator.clipboard.writeText(value);
                updateStatus("Copied ✅");
                return true;
            }}
        }} catch (err) {{}}
        const helper = document.createElement("textarea");
        helper.value = value;
        helper.setAttribute("readonly", "readonly");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.focus();
        helper.select();
        try {{
            document.execCommand("copy");
            updateStatus("Copied ✅");
            document.body.removeChild(helper);
            return true;
        }} catch (err) {{
            document.body.removeChild(helper);
            updateStatus("Copy manually");
            return false;
        }}
    }}

    (function () {{
        const binds = [
            ["birthdayPhoneCopyBtn", "birthday-phone-list", "birthday-phone-copy-status"],
            ["birthdayMessageCopyBtn", "birthday-message-starter", "birthday-message-copy-status"],
            ["momDailyCopyBtn", "mom-daily-text", "mom-daily-copy-status"],
        ];
        binds.forEach(([btnId, fieldId, statusId]) => {{
            const btn = document.getElementById(btnId);
            const field = document.getElementById(fieldId);
            if (btn && field) btn.addEventListener("click", () => copyTextValue(field.value, statusId));
        }});
        document.querySelectorAll("[data-copy-text]").forEach((el) => {{
            el.addEventListener("click", () => copyTextValue(el.getAttribute("data-copy-text") || "", "birthday-message-copy-status"));
        }});
    }})();

    (function () {{
        const titleEl = document.getElementById("birthdayCalTitle");
        const bodyEl = document.getElementById("birthdayCalBody");
        const headRowEl = document.getElementById("birthdayCalHeadRow");
        const prevEl = document.getElementById("birthdayCalPrev");
        const nextEl = document.getElementById("birthdayCalNext");
        const todayEl = document.getElementById("birthdayTodayBtn");
        const generateEl = document.getElementById("birthdayGenerateBtn");
        const selectedLabelEl = document.getElementById("birthdaySelectedLabel");
        const hintEl = document.getElementById("birthdayGenerateHint");
        if (!titleEl || !bodyEl || !headRowEl || !prevEl || !nextEl || !generateEl || !selectedLabelEl || !hintEl) return;

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        let viewYear = BDAY_INIT.year;
        let viewMonth = BDAY_INIT.month;
        let selected = {{ year: BDAY_INIT.year, month: BDAY_INIT.month, day: BDAY_INIT.day }};

        function pad2(n) {{ return String(n).padStart(2, "0"); }}
        function keyMMDD(month, day) {{ return `${{pad2(month)}}-${{pad2(day)}}`; }}
        function daysInMonth(year, month) {{ return new Date(year, month, 0).getDate(); }}
        function firstDow(year, month) {{ return new Date(year, month - 1, 1).getDay(); }}
        function sameDate(a, b) {{ return a && b && a.year === b.year && a.month === b.month && a.day === b.day; }}
        function renderHead() {{ headRowEl.innerHTML = ""; dow.forEach((label) => {{ const th = document.createElement("th"); th.textContent = label; headRowEl.appendChild(th); }}); }}
        function updateSelectedText() {{
            const pretty = `${{monthNames[selected.month - 1]}} ${{String(selected.day).padStart(2, "0")}}, ${{selected.year}}`;
            selectedLabelEl.textContent = `Selected: ${{pretty}}`;
            const key = keyMMDD(selected.month, selected.day);
            const hits = BDAY_INDEX[key] || [];
            if (hits.length === 1) hintEl.textContent = `🎂 Birthday: ${{hits[0]}}`;
            else if (hits.length > 1) hintEl.textContent = `🎂 Birthdays: ${{hits.join(", ")}}`;
            else hintEl.textContent = "Click Generate to reload the page for that date.";
        }}
        function renderCalendar() {{
            titleEl.textContent = `${{monthNames[viewMonth - 1]}} ${{viewYear}}`;
            bodyEl.innerHTML = "";
            const realToday = new Date();
            const isCurrentMonth = realToday.getFullYear() === viewYear && (realToday.getMonth() + 1) === viewMonth;
            const first = firstDow(viewYear, viewMonth);
            const total = daysInMonth(viewYear, viewMonth);
            let day = 1;
            for (let row = 0; row < 6; row++) {{
                const tr = document.createElement("tr");
                for (let col = 0; col < 7; col++) {{
                    const td = document.createElement("td");
                    if ((row === 0 && col < first) || day > total) {{
                        td.innerHTML = "<div class='birthday-day muted'></div>";
                    }} else {{
                        const cell = document.createElement("div");
                        cell.className = "birthday-day";
                        cell.textContent = String(day);
                        const mmdd = keyMMDD(viewMonth, day);
                        const hits = Array.isArray(BDAY_INDEX[mmdd]) ? BDAY_INDEX[mmdd] : [];
                        if (hits.length > 0) {{
                            cell.classList.add("has-birthday");
                            if (hits.length > 1) {{
                                const count = document.createElement("div");
                                count.className = "birthday-day-count";
                                count.textContent = String(hits.length);
                                cell.appendChild(count);
                            }} else {{
                                const dot = document.createElement("div");
                                dot.className = "birthday-day-dot";
                                cell.appendChild(dot);
                            }}
                            cell.title = `Birthdays: ${{hits.join(", ")}}`;
                        }}
                        if (isCurrentMonth && day === realToday.getDate()) cell.classList.add("today");
                        const candidate = {{ year: viewYear, month: viewMonth, day }};
                        if (sameDate(candidate, selected)) cell.classList.add("selected");
                        cell.addEventListener("click", () => {{ selected = candidate; updateSelectedText(); renderCalendar(); }});
                        td.appendChild(cell);
                        day += 1;
                    }}
                    tr.appendChild(td);
                }}
                bodyEl.appendChild(tr);
                if (day > total) break;
            }}
        }}
        function goMonth(delta) {{
            let nextMonth = viewMonth + delta;
            let nextYear = viewYear;
            if (nextMonth < 1) {{ nextMonth = 12; nextYear -= 1; }}
            if (nextMonth > 12) {{ nextMonth = 1; nextYear += 1; }}
            viewMonth = nextMonth;
            viewYear = nextYear;
            renderCalendar();
        }}
        function jumpToToday() {{
            const now = new Date();
            viewYear = now.getFullYear();
            viewMonth = now.getMonth() + 1;
            selected = {{ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }};
            updateSelectedText();
            renderCalendar();
        }}
        function generate() {{
            const mm = pad2(selected.month);
            const dd = pad2(selected.day);
            const iso = `${{selected.year}}-${{mm}}-${{dd}}`;
            const params = new URLSearchParams(window.location.search);
            params.set("theme", BDAY_INIT.theme);
            params.set("date", iso);
            window.location.search = params.toString();
        }}
        prevEl.addEventListener("click", () => goMonth(-1));
        nextEl.addEventListener("click", () => goMonth(1));
        if (todayEl) todayEl.addEventListener("click", jumpToToday);
        generateEl.addEventListener("click", generate);
        renderHead();
        updateSelectedText();
        renderCalendar();
    }})();
    """


def _dynamic_header_subtitle(today: date, birthday_hits: list[dict], selected_facts: dict[str, CuratedFact | None]) -> str:
    fact_count = sum(1 for fact in selected_facts.values() if fact is not None)
    if birthday_hits:
        names = [str(item.get("name", "")).strip() for item in birthday_hits if str(item.get("name", "")).strip()]
        if len(names) == 1:
            return f"{names[0]} is up today — birthday tools plus {fact_count} curated fun cards for Patti to mix and match."
        return f"{len(names)} birthdays are up today — birthday tools plus {fact_count} curated fun cards for Patti to mix and match."
    return f"No family birthday lands on {today.strftime('%B %d')} — use this as a planning day with {fact_count} curated fun cards."


def _dynamic_hero_summary_pill(birthday_hits: list[dict], selected_facts: dict[str, CuratedFact | None]) -> str:
    fact_count = sum(1 for fact in selected_facts.values() if fact is not None)
    birthday_count = len(birthday_hits)
    if birthday_count:
        return f"{birthday_count} birthday{'s' if birthday_count != 1 else ''} today · {fact_count} fun cards"
    return f"Planning view · {fact_count} fun cards"


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng_seed = seed if seed is not None else today.toordinal()
    rng = random.Random(rng_seed)

    birthdays = load_birthdays()
    birthday_hits = birthdays_for_date(birthdays, today.month, today.day)
    birthday_index = build_birthday_index(birthdays)
    all_phones = people_to_phone_list(birthdays)
    phones_without_birthday_person = filter_phones_excluding_birthday_people(all_phones, birthday_hits)
    message_text = _message_text_for_hits(birthday_hits, rng)
    selected_facts = {card_type: select_fact_for_card_type(card_type, today, seed=rng_seed) for card_type in CURATED_CARD_ORDER}
    available_curated = approved_facts()

    cards: list[CardItem] = [
        CardItem("birthday_calendar", "Pick a Date", "Birthday Calendar", _calendar_card_html(today), None),
        CardItem("birthday_spotlight", "Birthday Spotlight", today.strftime("%B %d"), _render_birthday_spotlight(birthday_hits, message_text), None),
        CardItem("birthday_phone_helper", "Quick Outreach", "Phone List Helper", _render_phone_helper(phones_without_birthday_person, birthday_hits), None),
    ]

    fact_meta = {
        "classic_rock": ("Classic Rock", "Classic Rock", "No approved classic rock fact matched this date yet."),
        "irish_history": ("Irish History", "Irish History", "No approved Irish history fact matched this date yet."),
        "boston_sports": ("Boston Sports", "Boston Sports", "No approved Boston sports fact matched this date yet."),
        "famous_person_birthday": ("Famous Birthday", "Famous Person Birthday", "No approved famous birthday fact matched this date yet."),
        "fun_fact": ("Fun Fact", "Fun Fact", "No approved fun fact matched this date yet."),
    }

    for card_type in CURATED_CARD_ORDER:
        eyebrow, fallback_title, fallback_body = fact_meta[card_type]
        title, body_html, source_url = _render_fact_card_body(selected_facts.get(card_type), fallback_title, fallback_body)
        cards.append(CardItem(card_type, eyebrow, title, body_html, source_url))

    cards.extend([
        CardItem(
            "birthday_message_starter",
            "Message Starter",
            "What to Say",
            f"""
                <p>Editable starter you can copy into a text message.</p>
                <textarea id=\"birthday-message-starter\" class=\"birthday-textarea\">{escape(message_text)}</textarea>
                <div class=\"birthday-actions\">
                    <button class=\"birthday-btn\" type=\"button\" id=\"birthdayMessageCopyBtn\">Copy message</button>
                    <span id=\"birthday-message-copy-status\" class=\"birthday-hint\"></span>
                </div>
            """,
            None,
        ),
        CardItem("birthday_upcoming", "Plan Ahead", "Upcoming Birthdays", _render_upcoming_birthdays(today, birthdays), None),
        CardItem("mom_daily", "Patti Mode", "Mom Daily Draft", _render_mom_daily(today, birthday_hits, message_text, selected_facts, rng), None),
    ])

    footer_text = (
        f"{THEME_CONFIG['footer_text']} {len(birthdays)} birthday entr{'y' if len(birthdays) == 1 else 'ies'} loaded. "
        f"{len(available_curated)} approved curated fact{'s' if len(available_curated) != 1 else ''} available."
    )

    return PageContext(
        page_title=f"BirthDay Today — {today.strftime('%B %d, %Y')}",
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=_dynamic_header_subtitle(today, birthday_hits, selected_facts),
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=footer_text,
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "background": None,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker", "Daily Flyer • Theme"),
            "hero_summary_pill": _dynamic_hero_summary_pill(birthday_hits, selected_facts),
            "extra_css": _extra_css(),
            "extra_js": _extra_js(today, birthday_index),
            "extra_head_html": _extra_head_html(),
        },
    )
