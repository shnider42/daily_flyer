from __future__ import annotations

import json
import random
from collections import Counter
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
from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "this_day_birthday"
THEME_CONFIG = {
    "page_title": "BirthDay Today — Celebrate the right people, on the right day",
    "header_title": "BirthDay Today 🎂",
    "header_subtitle": "Birthday reminders, a visual date picker, and fast outreach helpers",
    "footer_text": "Built on Daily Flyer. Birthday theme prototype.",
    "hero_kicker": "Daily Flyer • Birthday Theme",
    "hero_summary_pill": "Calendar-driven birthday planning and contact helpers",
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
            "<p><em>No birthdays are listed for this date.</em></p>"
            "<p>Use the calendar to jump to a highlighted date, or keep this open as a planning view.</p>"
        )

    parts: list[str] = ["<div class='birthday-stack'>"]

    for hit in birthday_hits:
        raw_name = str(hit.get("name", "")).strip() or "Someone Awesome"
        relation = clean_optional_text(hit.get("relation"))
        note = clean_optional_text(hit.get("note"))
        phone = str(hit.get("phone", "")).strip()
        sms_href = _sms_href(phone)

        parts.append("<div class='birthday-person'>")
        parts.append("<div class='birthday-person-head'>")
        parts.append(f"<div class='birthday-name'>🎉 {escape(raw_name)}</div>")
        parts.append("</div>")

        meta_bits: list[str] = []
        if relation:
            meta_bits.append(escape(relation))
        if phone:
            meta_bits.append(f"📱 {escape(_display_phone(phone))}")
        if meta_bits:
            parts.append(f"<div class='birthday-meta'>{' · '.join(meta_bits)}</div>")
        if note:
            parts.append(f"<div class='birthday-note'>{escape(note)}</div>")

        parts.append("<div class='birthday-actions'>")
        if sms_href:
            parts.append(
                f"<a class='birthday-btn birthday-btn--link' href='{escape(sms_href, quote=True)}'>Open text</a>"
            )
        parts.append(
            f"<button class='birthday-btn' type='button' data-copy-text='{escape(message_text, quote=True)}'>Copy message</button>"
        )
        parts.append("</div>")
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
        return intro + "<p><em>No phone numbers are available yet.</em></p>"

    count_label = f"{len(phones)} recipient{'s' if len(phones) != 1 else ''}"
    return f"""
        {intro}
        <p class="birthday-hint">Ready to paste into a new group text “To:” field · {escape(count_label)}</p>
        <textarea id="birthday-phone-list" class="birthday-textarea" readonly>{escape(phones_text)}</textarea>
        <div class="birthday-actions">
            <button class="birthday-btn" type="button" id="birthdayPhoneCopyBtn">Copy numbers</button>
            <span id="birthday-phone-copy-status" class="birthday-hint"></span>
        </div>
    """


def _render_upcoming_birthdays(today: date, birthdays: list[dict], limit: int = 10) -> str:
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
        return "<p><em>No upcoming birthdays found.</em></p>"

    html_parts = ["<ul class='birthday-list'>"]
    for occurrence, delta_days, _, name, relation in rows:
        relation_text = f" — {escape(relation)}" if relation else ""
        if delta_days == 0:
            delta_text = "Today"
        elif delta_days == 1:
            delta_text = "Tomorrow"
        else:
            delta_text = f"In {delta_days} days"

        html_parts.append(
            "<li>"
            f"<strong>{escape(occurrence.strftime('%b %d'))}</strong> · {escape(name)}{relation_text} "
            f"<span class='birthday-chip'>{escape(delta_text)}</span>"
            "</li>"
        )
    html_parts.append("</ul>")
    return "".join(html_parts)


def _render_month_overview(today: date, birthdays: list[dict]) -> str:
    month_rows = []
    for item in birthdays:
        try:
            month = int(item.get("month", 0))
            day = int(item.get("day", 0))
        except (TypeError, ValueError):
            continue

        if month != today.month or not (1 <= day <= 31):
            continue

        name = str(item.get("name", "")).strip()
        if not name:
            continue

        relation = clean_optional_text(item.get("relation"))
        marker = ""
        if day == today.day:
            marker = " <span class='birthday-chip'>Selected day</span>"
        elif day < today.day:
            marker = " <span class='birthday-chip'>Passed</span>"

        relation_text = f" — {escape(relation)}" if relation else ""
        month_rows.append(
            (day, _sort_name_key(name),
             f"<li><strong>{day:02d}</strong> · {escape(name)}{relation_text}{marker}</li>")
        )

    month_rows.sort(key=lambda x: (x[0], x[1]))

    if not month_rows:
        return f"<p><em>No birthdays on file for {escape(today.strftime('%B'))}.</em></p>"

    html_parts = [
        f"<p><strong>{len(month_rows)}</strong> birthday{'s' if len(month_rows) != 1 else ''} on file for {escape(today.strftime('%B'))}.</p>",
        "<ul class='birthday-list birthday-list--compact'>",
    ]
    html_parts.extend(row[2] for row in month_rows)
    html_parts.append("</ul>")
    return "".join(html_parts)


def _render_circle_snapshot(birthdays: list[dict]) -> str:
    loaded_count = len(birthdays)
    with_phone = sum(1 for item in birthdays if str(item.get("phone", "")).strip())
    with_note = sum(1 for item in birthdays if clean_optional_text(item.get("note")))
    relation_counts = Counter(
        clean_optional_text(item.get("relation")).title()
        for item in birthdays
        if clean_optional_text(item.get("relation"))
    )
    relation_rows = relation_counts.most_common(5)

    html_parts = ["<div class='birthday-stats-grid'>"]
    html_parts.append(
        f"<div class='birthday-stat'><div class='birthday-stat-num'>{loaded_count}</div><div class='birthday-stat-label'>people loaded</div></div>"
    )
    html_parts.append(
        f"<div class='birthday-stat'><div class='birthday-stat-num'>{with_phone}</div><div class='birthday-stat-label'>with phone</div></div>"
    )
    html_parts.append(
        f"<div class='birthday-stat'><div class='birthday-stat-num'>{with_note}</div><div class='birthday-stat-label'>with note</div></div>"
    )
    html_parts.append(
        f"<div class='birthday-stat'><div class='birthday-stat-num'>{len(relation_counts)}</div><div class='birthday-stat-label'>relation groups</div></div>"
    )
    html_parts.append("</div>")

    if relation_rows:
        html_parts.append("<div class='birthday-subsection-title'>Top relation groups</div>")
        html_parts.append("<ul class='birthday-list birthday-list--compact'>")
        for label, count in relation_rows:
            html_parts.append(
                f"<li><strong>{escape(label)}</strong> · {count} entr{'y' if count == 1 else 'ies'}</li>"
            )
        html_parts.append("</ul>")
    else:
        html_parts.append("<p><em>No relation labels are populated yet.</em></p>")

    return "".join(html_parts)


def _render_message_starter(message_text: str, birthday_hits: list[dict]) -> str:
    if birthday_hits:
        intro = "<p>Editable starter you can copy into a text message.</p>"
    else:
        intro = "<p>No birthday today, but this keeps the workflow easy to test.</p>"

    return f"""
        {intro}
        <textarea id="birthday-message-starter" class="birthday-textarea">{escape(message_text)}</textarea>
        <div class="birthday-actions">
            <button class="birthday-btn" type="button" id="birthdayMessageCopyBtn">Copy message</button>
            <span id="birthday-message-copy-status" class="birthday-hint"></span>
        </div>
    """


def _calendar_card_html(today: date) -> str:
    selected_label = today.strftime("%B %d, %Y")
    return f"""
        <div class="birthday-calendar-wrap">
            <div class="birthday-calendar-head">
                <div class="birthday-calendar-title" id="birthdayCalTitle">Month YYYY</div>
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


def _extra_css() -> str:
    return r"""
    .card--birthday_calendar,
    .card--birthday_spotlight {
        grid-column: span 6;
    }

    .card--birthday_message_starter,
    .card--birthday_phone_helper,
    .card--birthday_upcoming,
    .card--birthday_month_overview,
    .card--birthday_circle_snapshot {
        grid-column: span 4;
    }

    .card--birthday_calendar {
        background:
            linear-gradient(180deg, rgba(125,183,217,0.12), rgba(255,255,255,0.02)),
            var(--card-strong);
    }

    .card--birthday_spotlight {
        background:
            linear-gradient(180deg, rgba(255, 170, 90, 0.10), rgba(255,255,255,0.02)),
            var(--card-strong);
    }

    .card--birthday_message_starter,
    .card--birthday_phone_helper,
    .card--birthday_upcoming,
    .card--birthday_month_overview,
    .card--birthday_circle_snapshot {
        background:
            linear-gradient(180deg, rgba(73,197,182,0.10), rgba(255,255,255,0.02)),
            var(--card);
    }

    .birthday-calendar-wrap {
        display: grid;
        gap: 0.85rem;
    }

    .birthday-calendar-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
    }

    .birthday-calendar-title {
        font-weight: 800;
        color: var(--ink);
    }

    .birthday-calendar-nav {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .birthday-iconbtn,
    .birthday-btn {
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.08);
        color: var(--ink);
        border-radius: 12px;
        cursor: pointer;
        text-decoration: none;
        font: inherit;
    }

    .birthday-iconbtn {
        min-width: 36px;
        height: 36px;
        padding: 0 0.7rem;
        font-size: 0.95rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .birthday-btn {
        padding: 0.65rem 0.95rem;
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
        text-decoration: none;
    }

    .birthday-calendar {
        width: 100%;
        border-collapse: collapse;
    }

    .birthday-calendar th {
        font-size: 0.78rem;
        color: var(--muted);
        padding: 0.35rem 0;
        text-align: center;
    }

    .birthday-calendar td {
        padding: 0.15rem;
    }

    .birthday-day {
        width: 100%;
        min-height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--ink);
        cursor: pointer;
        user-select: none;
        font-weight: 700;
    }

    .birthday-day:hover {
        background: rgba(255,255,255,0.08);
    }

    .birthday-day.muted {
        opacity: 0.28;
        cursor: default;
    }

    .birthday-day.today {
        outline: 2px solid rgba(255,255,255,0.22);
    }

    .birthday-day.selected {
        outline: 2px solid rgba(255, 215, 120, 0.72);
        background: rgba(255, 215, 120, 0.10);
    }

    .birthday-day.has-birthday {
        background: rgba(255, 170, 90, 0.12);
        border-color: rgba(255, 170, 90, 0.28);
    }

    .birthday-day-dot,
    .birthday-day-count {
        position: absolute;
        bottom: 5px;
        border-radius: 999px;
        background: rgba(255, 215, 120, 0.95);
        box-shadow: 0 0 10px rgba(255, 215, 120, 0.45);
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
        color: var(--muted);
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
        color: var(--muted);
        font-size: 0.85rem;
    }

    .birthday-stack {
        display: grid;
        gap: 0.75rem;
    }

    .birthday-person {
        padding: 0.9rem;
        border-radius: 14px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
    }

    .birthday-person-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
    }

    .birthday-name {
        font-weight: 800;
        font-size: 1.02rem;
        color: var(--ink);
    }

    .birthday-meta {
        margin-top: 0.28rem;
        color: var(--muted);
    }

    .birthday-note {
        margin-top: 0.45rem;
        color: var(--ink-soft);
    }

    .birthday-list {
        margin: 0;
        padding-left: 1.1rem;
    }

    .birthday-list li {
        margin: 0.55rem 0;
    }

    .birthday-list--compact li {
        margin: 0.45rem 0;
    }

    .birthday-chip {
        display: inline-flex;
        align-items: center;
        margin-left: 0.45rem;
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--muted);
        font-size: 0.74rem;
        font-weight: 700;
    }

    .birthday-subsection-title {
        margin-top: 0.9rem;
        margin-bottom: 0.25rem;
        color: var(--ink);
        font-weight: 800;
        font-size: 0.92rem;
    }

    .birthday-stats-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
    }

    .birthday-stat {
        padding: 0.85rem;
        border-radius: 14px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
    }

    .birthday-stat-num {
        color: var(--ink);
        font-size: 1.5rem;
        font-weight: 800;
        line-height: 1;
    }

    .birthday-stat-label {
        color: var(--muted);
        margin-top: 0.35rem;
        font-size: 0.84rem;
    }

    .birthday-textarea {
        width: 100%;
        min-height: 120px;
        resize: vertical;
        padding: 0.85rem;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.16);
        color: var(--ink);
        font: inherit;
        line-height: 1.45;
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
        .card--birthday_message_starter,
        .card--birthday_phone_helper,
        .card--birthday_upcoming,
        .card--birthday_month_overview,
        .card--birthday_circle_snapshot {
            grid-column: span 6;
        }
    }

    @media (max-width: 720px) {
        .card--birthday_calendar,
        .card--birthday_spotlight,
        .card--birthday_message_starter,
        .card--birthday_phone_helper,
        .card--birthday_upcoming,
        .card--birthday_month_overview,
        .card--birthday_circle_snapshot {
            grid-column: auto;
        }

        .birthday-calendar-head {
            align-items: flex-start;
            flex-direction: column;
        }

        .birthday-calendar-nav {
            justify-content: flex-start;
        }

        .birthday-stats-grid {
            grid-template-columns: 1fr;
        }
    }
    """


def _extra_js(today: date, birthday_index: dict[str, list[str]]) -> str:
    payload_index = json.dumps(birthday_index, ensure_ascii=False)
    payload_init = json.dumps(
        {
            "year": today.year,
            "month": today.month,
            "day": today.day,
            "theme": THEME_NAME,
        },
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
            setTimeout(() => {{
                if (status.textContent === text) {{
                    status.textContent = "";
                }}
            }}, 1600);
        }}

        try {{
            if (navigator.clipboard && window.isSecureContext) {{
                await navigator.clipboard.writeText(value);
                updateStatus("Copied ✅");
                return true;
            }}
        }} catch (err) {{
        }}

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
        const phoneCopyBtn = document.getElementById("birthdayPhoneCopyBtn");
        const messageCopyBtn = document.getElementById("birthdayMessageCopyBtn");
        const phoneList = document.getElementById("birthday-phone-list");
        const messageStarter = document.getElementById("birthday-message-starter");

        if (phoneCopyBtn && phoneList) {{
            phoneCopyBtn.addEventListener("click", () => copyTextValue(phoneList.value, "birthday-phone-copy-status"));
        }}

        if (messageCopyBtn && messageStarter) {{
            messageCopyBtn.addEventListener("click", () => copyTextValue(messageStarter.value, "birthday-message-copy-status"));
        }}

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

        if (!titleEl || !bodyEl || !headRowEl || !prevEl || !nextEl || !generateEl || !selectedLabelEl || !hintEl) {{
            return;
        }}

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        let viewYear = BDAY_INIT.year;
        let viewMonth = BDAY_INIT.month;
        let selected = {{
            year: BDAY_INIT.year,
            month: BDAY_INIT.month,
            day: BDAY_INIT.day,
        }};

        function pad2(n) {{
            return String(n).padStart(2, "0");
        }}

        function keyMMDD(month, day) {{
            return `${{pad2(month)}}-${{pad2(day)}}`;
        }}

        function daysInMonth(year, month) {{
            return new Date(year, month, 0).getDate();
        }}

        function firstDow(year, month) {{
            return new Date(year, month - 1, 1).getDay();
        }}

        function sameDate(a, b) {{
            return a && b && a.year === b.year && a.month === b.month && a.day === b.day;
        }}

        function renderHead() {{
            headRowEl.innerHTML = "";
            for (const label of dow) {{
                const th = document.createElement("th");
                th.textContent = label;
                headRowEl.appendChild(th);
            }}
        }}

        function updateSelectedText() {{
            const pretty = `${{monthNames[selected.month - 1]}} ${{String(selected.day).padStart(2, "0")}}, ${{selected.year}}`;
            selectedLabelEl.textContent = `Selected: ${{pretty}}`;

            const key = keyMMDD(selected.month, selected.day);
            const hits = BDAY_INDEX[key] || [];
            if (hits.length === 1) {{
                hintEl.textContent = `🎂 Birthday: ${{hits[0]}}`;
            }} else if (hits.length > 1) {{
                hintEl.textContent = `🎂 Birthdays: ${{hits.join(", ")}}`;
            }} else {{
                hintEl.textContent = "Click Generate to reload the page for that date.";
            }}
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
                        const hasBirthday = hits.length > 0;

                        if (hasBirthday) {{
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

                        if (isCurrentMonth && day === realToday.getDate()) {{
                            cell.classList.add("today");
                        }}

                        const candidate = {{ year: viewYear, month: viewMonth, day }};
                        if (sameDate(candidate, selected)) {{
                            cell.classList.add("selected");
                        }}

                        cell.addEventListener("click", () => {{
                            selected = candidate;
                            updateSelectedText();
                            renderCalendar();
                        }});

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

            if (nextMonth < 1) {{
                nextMonth = 12;
                nextYear -= 1;
            }}
            if (nextMonth > 12) {{
                nextMonth = 1;
                nextYear += 1;
            }}

            viewMonth = nextMonth;
            viewYear = nextYear;
            renderCalendar();
        }}

        function jumpToToday() {{
            const now = new Date();
            viewYear = now.getFullYear();
            viewMonth = now.getMonth() + 1;
            selected = {{
                year: now.getFullYear(),
                month: now.getMonth() + 1,
                day: now.getDate(),
            }};
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
        if (todayEl) {{
            todayEl.addEventListener("click", jumpToToday);
        }}
        generateEl.addEventListener("click", generate);

        renderHead();
        updateSelectedText();
        renderCalendar();
    }})();
    """


def _dynamic_header_subtitle(today: date, birthday_hits: list[dict], birthdays: list[dict]) -> str:
    month_count = sum(
        1
        for item in birthdays
        if int(item.get("month", 0) or 0) == today.month
    )

    if not birthday_hits:
        return (
            f"No birthdays are listed for {today.strftime('%B %d')} — "
            f"{month_count} birthday{'s' if month_count != 1 else ''} are on file for {today.strftime('%B')}."
        )

    names = [
        str(item.get("name", "")).strip()
        for item in birthday_hits
        if str(item.get("name", "")).strip()
    ]
    if len(names) == 1:
        return (
            f"{names[0]} is up today — quick outreach, a month view, and a clean snapshot of your birthday list."
        )
    return (
        f"{len(names)} birthdays are up today — fast outreach, a month view, and a clean snapshot of your birthday list."
    )


def _dynamic_hero_summary_pill(today: date, birthday_hits: list[dict], birthdays: list[dict]) -> str:
    month_count = sum(
        1
        for item in birthdays
        if int(item.get("month", 0) or 0) == today.month
    )
    if birthday_hits:
        return f"{len(birthday_hits)} today · {month_count} in {today.strftime('%B')}"
    return f"{month_count} in {today.strftime('%B')} · planning view"


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng = random.Random(seed if seed is not None else today.toordinal())

    birthdays = load_birthdays()
    birthday_hits = birthdays_for_date(birthdays, today.month, today.day)
    birthday_index = build_birthday_index(birthdays)

    all_phones = people_to_phone_list(birthdays)
    phones_without_birthday_person = filter_phones_excluding_birthday_people(
        all_phones,
        birthday_hits,
    )

    message_text = _message_text_for_hits(birthday_hits, rng)
    loaded_count = len(birthdays)

    cards = [
        CardItem(
            card_type="birthday_calendar",
            eyebrow="Pick a Date",
            title="Birthday Calendar",
            body=_calendar_card_html(today),
            source_url=None,
        ),
        CardItem(
            card_type="birthday_spotlight",
            eyebrow="Birthday Spotlight",
            title=today.strftime("%B %d"),
            body=_render_birthday_spotlight(birthday_hits, message_text),
            source_url=None,
        ),
        CardItem(
            card_type="birthday_phone_helper",
            eyebrow="Quick Outreach",
            title="Phone List Helper",
            body=_render_phone_helper(phones_without_birthday_person, birthday_hits),
            source_url=None,
        ),
        CardItem(
            card_type="birthday_message_starter",
            eyebrow="Message Starter",
            title="What to Say",
            body=_render_message_starter(message_text, birthday_hits),
            source_url=None,
        ),
        CardItem(
            card_type="birthday_upcoming",
            eyebrow="Plan Ahead",
            title="Upcoming Birthdays",
            body=_render_upcoming_birthdays(today, birthdays),
            source_url=None,
        ),
        CardItem(
            card_type="birthday_month_overview",
            eyebrow="This Month",
            title=f"{today.strftime('%B')} Overview",
            body=_render_month_overview(today, birthdays),
            source_url=None,
        ),
        CardItem(
            card_type="birthday_circle_snapshot",
            eyebrow="Birthday Data",
            title="Circle Snapshot",
            body=_render_circle_snapshot(birthdays),
            source_url=None,
        ),
    ]

    footer_suffix = (
        f" {loaded_count} birthday entr{'y' if loaded_count == 1 else 'ies'} loaded."
        if loaded_count
        else " No birthdays loaded yet."
    )

    return PageContext(
        page_title=f"BirthDay Today — {today.strftime('%B %d, %Y')}",
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=_dynamic_header_subtitle(today, birthday_hits, birthdays),
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"] + footer_suffix,
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "background": None,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker", "Daily Flyer • Theme"),
            "hero_summary_pill": _dynamic_hero_summary_pill(today, birthday_hits, birthdays),
            "extra_css": _extra_css(),
            "extra_js": _extra_js(today, birthday_index),
            "extra_head_html": "",
        },
    )
