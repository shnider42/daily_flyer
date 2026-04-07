from __future__ import annotations

import json
import random
from datetime import date

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


def _render_birthday_spotlight(birthday_hits: list[dict]) -> str:
    if not birthday_hits:
        return (
            "<p><em>No birthdays are listed for this date.</em></p>"
            "<p>This is still a useful day to plan ahead or test the calendar workflow.</p>"
        )

    parts: list[str] = ["<div class='birthday-stack'>"]

    for hit in birthday_hits:
        name = str(hit.get("name", "")).strip() or "Someone Awesome"
        relation = clean_optional_text(hit.get("relation"))
        note = clean_optional_text(hit.get("note"))
        phone = str(hit.get("phone", "")).strip()

        parts.append("<div class='birthday-person'>")
        parts.append(f"<div class='birthday-name'>🎉 {name}</div>")

        if relation:
            parts.append(f"<div class='birthday-meta'>{relation}</div>")
        if phone:
            parts.append(f"<div class='birthday-meta'>📱 {phone}</div>")
        if note:
            parts.append(f"<div class='birthday-note'>{note}</div>")

        parts.append("</div>")

    parts.append("</div>")
    return "".join(parts)


def _render_phone_helper(phones_text: str, birthday_hits: list[dict]) -> str:
    if birthday_hits:
        names = ", ".join(
            str(x.get("name", "")).strip()
            for x in birthday_hits
            if str(x.get("name", "")).strip()
        )
        intro = f"<p>This list excludes today’s birthday person: <strong>{names}</strong>.</p>"
    else:
        intro = "<p>No birthday person to exclude for this date, so the full list is shown.</p>"

    if not phones_text.strip():
        return intro + "<p><em>No phone numbers are available yet.</em></p>"

    return f"""
        {intro}
        <textarea id="birthday-phone-list" class="birthday-textarea" readonly>{phones_text}</textarea>
        <div class="birthday-actions">
            <button class="birthday-btn" onclick="copyBirthdayPhones()">Copy numbers</button>
            <span id="birthday-phone-copy-status" class="birthday-hint"></span>
            <span class="birthday-hint">Paste into a new group text “To:” field.</span>
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

        upcoming.append((occurrence, name.lower(), name, relation))

    upcoming.sort(key=lambda x: (x[0], x[1]))
    rows = upcoming[:limit]

    if not rows:
        return "<p><em>No upcoming birthdays found.</em></p>"

    html_parts = ["<ul class='birthday-list'>"]
    for occurrence, _, name, relation in rows:
        relation_text = f" — {relation}" if relation else ""
        html_parts.append(
            f"<li><strong>{occurrence.strftime('%b %d')}</strong> · {name}{relation_text}</li>"
        )
    html_parts.append("</ul>")
    return "".join(html_parts)


def _render_message_starter(birthday_hits: list[dict], rng: random.Random) -> str:
    if birthday_hits:
        names = [
            str(x.get("name", "")).strip()
            for x in birthday_hits
            if str(x.get("name", "")).strip()
        ]
        joined = ", ".join(names)
        prompts = [
            f"Happy birthday, {joined}! Hope today is a great one.",
            f"Happy birthday, {joined}! Hope the day treats you really well.",
            f"Happy birthday, {joined}! Wishing you a fun day and a great year ahead.",
            f"Happy birthday, {joined}! Hope you get to relax, celebrate, and enjoy the day.",
        ]
    else:
        prompts = [
            "No birthday today — good day to check the calendar and plan ahead.",
            "No one is scheduled today, so this is a nice chance to line up the next birthday text.",
            "Quiet birthday day. Use it to test the flow before the next real one comes up.",
        ]

    return f"<div class='birthday-message'>{rng.choice(prompts)}</div>"


def _calendar_card_html(today: date) -> str:
    selected_label = today.strftime("%B %d, %Y")
    return f"""
        <div class="birthday-calendar-wrap">
            <div class="birthday-calendar-head">
                <div class="birthday-calendar-title" id="birthdayCalTitle">Month YYYY</div>
                <div class="birthday-calendar-nav">
                    <button class="birthday-iconbtn" id="birthdayCalPrev" aria-label="Previous month">‹</button>
                    <button class="birthday-iconbtn" id="birthdayCalNext" aria-label="Next month">›</button>
                </div>
            </div>

            <table class="birthday-calendar">
                <thead>
                    <tr id="birthdayCalHeadRow"></tr>
                </thead>
                <tbody id="birthdayCalBody"></tbody>
            </table>

            <div class="birthday-calendar-controls">
                <button class="birthday-btn" id="birthdayGenerateBtn">Generate</button>
                <div>
                    <div class="birthday-selected" id="birthdaySelectedLabel">Selected: {selected_label}</div>
                    <div class="birthday-hint" id="birthdayGenerateHint">Click a date, then Generate.</div>
                </div>
            </div>
        </div>
    """


def _extra_css() -> str:
    return r"""
    .birthday-calendar-wrap {
        display: grid;
        gap: 0.75rem;
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
    }

    .birthday-iconbtn,
    .birthday-btn {
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.08);
        color: var(--ink);
        border-radius: 12px;
        cursor: pointer;
    }

    .birthday-iconbtn {
        width: 36px;
        height: 36px;
        font-size: 1rem;
    }

    .birthday-btn {
        padding: 0.65rem 0.95rem;
        font-weight: 700;
    }

    .birthday-iconbtn:hover,
    .birthday-btn:hover {
        background: rgba(255,255,255,0.12);
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
        min-height: 42px;
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

    .birthday-day-dot {
        position: absolute;
        bottom: 5px;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 215, 120, 0.95);
        box-shadow: 0 0 10px rgba(255, 215, 120, 0.45);
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
        padding: 0.85rem;
        border-radius: 14px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
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
        margin-top: 0.4rem;
        color: var(--ink-soft);
    }

    .birthday-list {
        margin: 0;
        padding-left: 1.1rem;
    }

    .birthday-list li {
        margin: 0.45rem 0;
    }

    .birthday-message {
        font-size: 1rem;
        line-height: 1.6;
        color: var(--ink-soft);
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
    """


def _extra_js(today: date, birthday_index: dict[str, list[str]]) -> str:
    payload_index = json.dumps(birthday_index, ensure_ascii=False)
    payload_init = json.dumps(
        {
            "year": today.year,
            "month": today.month,
            "day": today.day,
            "theme": "this_day_birthday",
        },
        ensure_ascii=False,
    )

    return f"""
    const BDAY_INDEX = {payload_index};
    const BDAY_INIT = {payload_init};

    function copyBirthdayPhones() {{
        const el = document.getElementById("birthday-phone-list");
        const status = document.getElementById("birthday-phone-copy-status");
        if (!el) return;

        el.focus();
        el.select();

        try {{
            document.execCommand("copy");
            if (status) {{
                status.textContent = "Copied ✅";
                setTimeout(() => status.textContent = "", 1500);
            }}
        }} catch (err) {{
            if (status) {{
                status.textContent = "Select and copy manually";
                setTimeout(() => status.textContent = "", 1800);
            }}
        }}
    }}

    (function () {{
        const titleEl = document.getElementById("birthdayCalTitle");
        const bodyEl = document.getElementById("birthdayCalBody");
        const headRowEl = document.getElementById("birthdayCalHeadRow");
        const prevEl = document.getElementById("birthdayCalPrev");
        const nextEl = document.getElementById("birthdayCalNext");
        const generateEl = document.getElementById("birthdayGenerateBtn");
        const selectedLabelEl = document.getElementById("birthdaySelectedLabel");
        const hintEl = document.getElementById("birthdayGenerateHint");

        if (!titleEl || !bodyEl || !headRowEl || !prevEl || !nextEl || !generateEl) {{
            return;
        }}

        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

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

        function keyMMDD(m, d) {{
            return `${{pad2(m)}}-${{pad2(d)}}`;
        }}

        function daysInMonth(y, m) {{
            return new Date(y, m, 0).getDate();
        }}

        function firstDow(y, m) {{
            return new Date(y, m - 1, 1).getDay();
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
            if (hits.length) {{
                hintEl.textContent = `🎂 Birthdays: ${{hits.join(", ")}}`;
            }} else {{
                hintEl.textContent = "Click Generate to reload the page for that date.";
            }}
        }}

        function renderCalendar() {{
            titleEl.textContent = `${{monthNames[viewMonth - 1]}} ${{viewYear}}`;
            bodyEl.innerHTML = "";

            const today = new Date();
            const isCurrentMonth = today.getFullYear() === viewYear && (today.getMonth() + 1) === viewMonth;

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
                        const hasBirthday = Array.isArray(BDAY_INDEX[mmdd]) && BDAY_INDEX[mmdd].length > 0;

                        if (hasBirthday) {{
                            cell.classList.add("has-birthday");
                            const dot = document.createElement("div");
                            dot.className = "birthday-day-dot";
                            cell.appendChild(dot);
                            cell.title = `Birthdays: ${{BDAY_INDEX[mmdd].join(", ")}}`;
                        }}

                        if (isCurrentMonth && day === today.getDate()) {{
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

            const maxDay = daysInMonth(viewYear, viewMonth);
            if (selected.month === viewMonth && selected.year === viewYear && selected.day > maxDay) {{
                selected.day = maxDay;
            }}

            renderCalendar();
        }}

        function generate() {{
            const mm = pad2(selected.month);
            const dd = pad2(selected.day);
            const iso = `${{selected.year}}-${{mm}}-${{dd}}`;
            window.location.href = `/?theme=this_day_birthday&date=${{iso}}`;
        }}

        prevEl.addEventListener("click", () => goMonth(-1));
        nextEl.addEventListener("click", () => goMonth(1));
        generateEl.addEventListener("click", generate);

        renderHead();
        updateSelectedText();
        renderCalendar();
    }})();
    """


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
    phone_text = phones_to_to_field_text(phones_without_birthday_person)

    cards = [
        CardItem(
            card_type="trivia",
            eyebrow="Pick a Date",
            title="Birthday Calendar",
            body=_calendar_card_html(today),
            source_url=None,
        ),
        CardItem(
            card_type="birthday",
            eyebrow="Birthday Spotlight",
            title=today.strftime("%B %d"),
            body=_render_birthday_spotlight(birthday_hits),
            source_url=None,
        ),
        CardItem(
            card_type="did_you_know",
            eyebrow="Quick Outreach",
            title="Phone List Helper",
            body=_render_phone_helper(phone_text, birthday_hits),
            source_url=None,
        ),
        CardItem(
            card_type="word",
            eyebrow="Message Starter",
            title="What to Say",
            body=_render_message_starter(birthday_hits, rng),
            source_url=None,
        ),
        CardItem(
            card_type="phrase",
            eyebrow="Plan Ahead",
            title="Upcoming Birthdays",
            body=_render_upcoming_birthdays(today, birthdays),
            source_url=None,
        ),
    ]

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "this_day_birthday",
            "date_key": today.strftime("%m-%d"),
            "background": None,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker", "Daily Flyer • Theme"),
            "hero_summary_pill": THEME_CONFIG.get(
                "hero_summary_pill",
                "Curated cards and timely sources",
            ),
            "extra_css": _extra_css(),
            "extra_js": _extra_js(today, birthday_index),
            "extra_head_html": "",
        },
    )
