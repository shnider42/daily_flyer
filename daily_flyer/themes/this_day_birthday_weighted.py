from __future__ import annotations

import random
from datetime import date
from html import escape
from typing import Any

from daily_flyer.birthdays import (
    birthdays_for_date,
    build_birthday_index,
    clean_optional_text,
    filter_phones_excluding_birthday_people,
    load_birthdays,
    people_to_phone_list,
    phones_to_to_field_text,
)
from daily_flyer.birthday_theme_extra_facts import approved_birthday_theme_facts
from daily_flyer.content_weighting import (
    KeywordWeightProfile,
    is_copy_friendly,
    is_primary_friendly,
    load_keyword_weight_profile,
    score_content_item,
)
from daily_flyer.curated_fact_store import CuratedFact, approved_facts
from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "this_day_birthday"
WEIGHT_PROFILE_NAME = "birthday_family_friendly"
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
    "header_subtitle": "Birthday reminders, Patti-style copy, family-friendly fact weighting, and quick outreach helpers.",
    "footer_text": "Built on Daily Flyer. Birthday theme prototype.",
    "hero_kicker": "Daily Flyer • Birthday Theme",
    "hero_summary_pill": "Weighted birthday-safe facts plus Patti Mode",
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


def _safe_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _birth_year_for_hit(hit: dict) -> int | None:
    for key in ("year", "birth_year", "born_year"):
        year = _safe_int(hit.get(key))
        if year and 1800 <= year <= 2200:
            return year

    dob = str(hit.get("dob", "") or hit.get("birthdate", "") or "").strip()
    if len(dob) >= 4:
        year = _safe_int(dob[:4])
        if year and 1800 <= year <= 2200:
            return year
    return None


def _age_for_hit(target: date, hit: dict) -> int | None:
    year = _birth_year_for_hit(hit)
    if not year:
        return None
    age = target.year - year
    return age if 0 <= age <= 130 else None


def _ordinal(value: int) -> str:
    if 10 <= value % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(value % 10, "th")
    return f"{value}{suffix}"


def _digits_only(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _display_phone(phone: str) -> str:
    digits = _digits_only(phone)
    if len(digits) == 10:
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    return str(phone or "").strip()


def _first_name(full_name: str) -> str:
    parts = [part for part in str(full_name or "").strip().split() if part]
    return parts[0] if parts else "there"


def _join_names_human(names: list[str]) -> str:
    clean = [str(name).strip() for name in names if str(name).strip()]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    if len(clean) == 2:
        return f"{clean[0]} and {clean[1]}"
    return f"{', '.join(clean[:-1])}, and {clean[-1]}"


def _sort_name_key(name: str) -> str:
    parts = name.split()
    last = parts[-1] if parts else ""
    return f"{last}|{name}".lower()


def _message_text_for_hits(birthday_hits: list[dict], rng: random.Random) -> str:
    first_names = [_first_name(str(item.get("name", "")).strip()) for item in birthday_hits if str(item.get("name", "")).strip()]
    if not first_names:
        return "No birthday today — good day to check the calendar and plan ahead."
    joined = _join_names_human(first_names)
    return rng.choice([
        f"Happy birthday, {joined}! Hope you have a great day 🎂",
        f"Happy birthday, {joined}! Wishing you a fun day and a great year ahead 🥳",
        f"Happy birthday, {joined}! Hope today treats you really well 🎉",
        f"Happy birthday, {joined}! Hope you get to celebrate and enjoy the day 🎈",
    ])


def _all_fact_sources() -> list[CuratedFact]:
    return approved_facts() + approved_birthday_theme_facts()


def _dedupe_facts(facts: list[CuratedFact]) -> list[CuratedFact]:
    seen: set[str] = set()
    out: list[CuratedFact] = []
    for fact in facts:
        if fact.fact_id in seen:
            continue
        seen.add(fact.fact_id)
        out.append(fact)
    return out


def _date_bucket(fact: CuratedFact, target: date) -> int:
    if fact.matches_date(target):
        return 0
    if fact.month is not None and fact.distance_from(target) <= 21:
        return 1
    if fact.month == target.month:
        return 2
    if fact.month is not None:
        return 3
    return 4


def _select_facts_for_card_type(
    all_facts: list[CuratedFact],
    card_type: str,
    target: date,
    seed: int,
    profile: KeywordWeightProfile,
    limit: int = 4,
) -> list[CuratedFact]:
    pool = [fact for fact in all_facts if fact.card_type == card_type]
    if not pool:
        return []

    # Keep negative facts in the data, but avoid making them lead/copy candidates
    # unless there is truly nothing else for the card type.
    primary_pool = [fact for fact in pool if is_primary_friendly(fact, profile)] or pool

    rng = random.Random(f"{card_type}|{target.isoformat()}|{seed}|weighted-facts")
    jitter = {fact.fact_id: rng.random() * 0.01 for fact in primary_pool}

    def sort_key(fact: CuratedFact) -> tuple[int, int, float, str]:
        return (
            _date_bucket(fact, target),
            fact.distance_from(target),
            -(score_content_item(fact, profile) + jitter.get(fact.fact_id, 0.0)),
            fact.fact_id.lower(),
        )

    ranked = sorted(primary_pool, key=sort_key)

    # Add extra non-lead options after the friendly ranked packet, so an editor can
    # still find them manually if needed without Patti Mode using them first.
    backup = [fact for fact in pool if fact not in ranked]
    return _dedupe_facts(ranked + backup)[:limit]


def _trim_fact_text(text: str, limit: int = 210) -> str:
    clean = " ".join(str(text or "").split()).rstrip(".! ")
    if len(clean) <= limit:
        return clean
    return clean[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def _fact_relevance_label(fact: CuratedFact, target: date, profile: KeywordWeightProfile) -> str:
    score = score_content_item(fact, profile)
    if score < profile.copy_floor:
        tone = "low copy fit"
    elif fact.matches_date(target):
        tone = "date match"
    elif fact.month == target.month and fact.distance_from(target) <= 21:
        tone = "nearby"
    elif fact.month == target.month:
        tone = "same month"
    else:
        tone = "fallback"
    return f"{tone} · weight {score:.1f}"


def _render_fact_card_body(
    facts: list[CuratedFact],
    target: date,
    profile: KeywordWeightProfile,
    fallback_title: str,
    fallback_body: str,
) -> tuple[str, str, str | None]:
    if not facts:
        return fallback_title, f"<p>{escape(fallback_body)}</p>", None

    lead = facts[0]
    more = facts[1:]
    parts = [
        "<div class='fact-stack'>",
        "<article class='fact-lead'>",
        f"<div class='fact-relevance'>{escape(_fact_relevance_label(lead, target, profile))}</div>",
        f"<p>{escape(lead.body)}</p>",
        f"<p class='birthday-hint'>Source: {escape(lead.source_name)}</p>",
        "</article>",
    ]
    if more:
        parts.append("<details class='fact-more' open>")
        parts.append("<summary>More birthday-theme facts</summary><ul>")
        for fact in more:
            parts.append(
                "<li>"
                f"<strong>{escape(fact.title)}</strong> "
                f"<span class='fact-relevance fact-relevance--inline'>{escape(_fact_relevance_label(fact, target, profile))}</span>"
                f"<p>{escape(_trim_fact_text(fact.body, 175))}</p>"
                f"<p class='birthday-hint'>Source: {escape(fact.source_name)}</p>"
                "</li>"
            )
        parts.append("</ul></details>")
    parts.append("</div>")
    return lead.title, "".join(parts), lead.source_url


def _fact_title(fact: CuratedFact | None) -> str:
    return str(fact.title).strip() if fact and str(fact.title).strip() else ""


def _fact_nugget(fact: CuratedFact | None, limit: int = 135) -> str:
    if not fact:
        return ""
    return f"{_fact_title(fact)}: {_trim_fact_text(fact.body, limit)}"


def _copy_friendly_facts(fact_groups: dict[str, list[CuratedFact]], profile: KeywordWeightProfile) -> list[CuratedFact]:
    facts: list[CuratedFact] = []
    for card_type in CURATED_CARD_ORDER:
        facts.extend([fact for fact in fact_groups.get(card_type, []) if is_copy_friendly(fact, profile)])
    return _dedupe_facts(facts)


def _render_birthday_spotlight(target: date, birthday_hits: list[dict], message_text: str) -> str:
    if not birthday_hits:
        return "<div class='birthday-empty-state'><div class='birthday-empty-emoji'>🎈</div><div><div class='birthday-empty-title'>No birthday is on file for this date</div><p>Use today as a planning day for future cake, texts, and calendar heroics.</p></div></div>"

    parts = ["<div class='birthday-spotlight-shell'><div class='birthday-summary-row'>"]
    parts.append(f"<span class='birthday-summary-pill birthday-summary-pill--warm'>🎂 {len(birthday_hits)} birthday{'s' if len(birthday_hits) != 1 else ''} on file</span>")
    parts.append("<span class='birthday-summary-pill'>📱 Text helpers below</span></div><div class='birthday-stack'>")
    for hit in birthday_hits:
        raw_name = str(hit.get("name", "")).strip() or "Someone Awesome"
        relation = clean_optional_text(hit.get("relation"))
        note = clean_optional_text(hit.get("note"))
        phone = str(hit.get("phone", "")).strip()
        sms_href = f"sms:{_digits_only(phone)}" if _digits_only(phone) else ""
        age = _age_for_hit(target, hit)
        meta = []
        if relation:
            meta.append(f"👥 {relation}")
        if age is not None:
            meta.append(f"🎈 Turns {_ordinal(age)}")
        if phone:
            meta.append(f"📱 {_display_phone(phone)}")
        parts.append("<article class='birthday-person'>")
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


def _render_phone_helper(phones: list[dict[str, str]], birthday_hits: list[dict]) -> str:
    phones_text = phones_to_to_field_text(phones)
    birthday_names = [str(x.get("name", "")).strip() for x in birthday_hits if str(x.get("name", "")).strip()]
    intro = f"<p>This list excludes today’s birthday person: <strong>{escape(_join_names_human(birthday_names))}</strong>.</p>" if birthday_names else "<p>No birthday person to exclude for this date, so the full list is shown.</p>"
    if not phones_text.strip():
        return f"<div class='birthday-helper-panel'>{intro}<p><em>No phone numbers are available yet.</em></p></div>"
    return f"""
        <div class="birthday-helper-panel">
            {intro}
            <div class="birthday-stat-row"><span class="birthday-soft-pill">👥 {len(phones)} recipient{'s' if len(phones) != 1 else ''}</span><span class="birthday-soft-pill">📋 Copy-paste ready</span></div>
            <p class="birthday-hint">Ready to paste into a new group text “To:” field.</p>
            <textarea id="birthday-phone-list" class="birthday-textarea" readonly>{escape(phones_text)}</textarea>
            <div class="birthday-actions"><button class="birthday-btn" type="button" id="birthdayPhoneCopyBtn">Copy numbers</button><span id="birthday-phone-copy-status" class="birthday-hint"></span></div>
        </div>
    """


def _render_upcoming_birthdays(today: date, birthdays: list[dict], limit: int = 8) -> str:
    upcoming = []
    for item in birthdays:
        month = _safe_int(item.get("month")) or 0
        day = _safe_int(item.get("day")) or 0
        name = str(item.get("name", "")).strip()
        if not name or not (1 <= month <= 12 and 1 <= day <= 31):
            continue
        occurrence = _next_occurrence(today, month, day)
        relation = clean_optional_text(item.get("relation"))
        age = _age_for_hit(occurrence, item)
        upcoming.append((occurrence, (occurrence - today).days, _sort_name_key(name), name, relation, age))
    upcoming.sort(key=lambda x: (x[0], x[2]))
    if not upcoming:
        return "<div class='birthday-helper-panel'><p><em>No upcoming birthdays found.</em></p></div>"
    parts = ["<div class='birthday-upcoming-list'>"]
    for occurrence, delta, _, name, relation, age in upcoming[:limit]:
        details = ["Today" if delta == 0 else "Tomorrow" if delta == 1 else f"In {delta} days"]
        if relation:
            details.append(relation)
        if age is not None:
            details.append(f"turns {_ordinal(age)}")
        parts.append(f"<div class='birthday-upcoming-item'><div class='birthday-date-badge'><span class='birthday-date-month'>{escape(occurrence.strftime('%b'))}</span><strong>{escape(occurrence.strftime('%d'))}</strong></div><div class='birthday-upcoming-copy'><div class='birthday-upcoming-name'>{escape(name)}</div><div class='birthday-upcoming-meta'>{escape(' · '.join(details))}</div></div></div>")
    parts.append("</div>")
    return "".join(parts)


def _calendar_card_html(today: date, birthday_index: dict[str, list[str]]) -> str:
    names = birthday_index.get(today.strftime("%m-%d"), [])
    if names:
        today_note = " · ".join(names)
    else:
        today_note = "No birthday on file for this date"
    return f"""
        <div class="birthday-helper-panel">
            <p><strong>Selected date:</strong> {escape(today.strftime('%B %d, %Y'))}</p>
            <p class="birthday-hint">{escape(today_note)}</p>
            <p>Use the URL date parameter to test any date, for example <code>?theme=this_day_birthday&amp;date=2026-07-10&amp;seed=7</code>.</p>
        </div>
    """


def _birthday_arrival_line(target: date, birthday_hits: list[dict], rng: random.Random) -> str:
    if not birthday_hits:
        return ""
    names = [_first_name(str(item.get("name", "")).strip()) for item in birthday_hits if str(item.get("name", "")).strip()]
    joined = _join_names_human(names)
    ages = [_age_for_hit(target, hit) for hit in birthday_hits]
    ages = [age for age in ages if age is not None]
    if len(birthday_hits) == 1:
        age = ages[0] if ages else None
        milestone = f"turns {_ordinal(age)} today" if age else "gets the real headline today"
        return rng.choice([
            f"Of course, the best thing on the calendar is still our own {joined}, who {milestone}!!!",
            f"All of that is fun, but today really belongs to {joined}, who {milestone}!!!",
        ])
    if ages:
        return f"Most importantly, our own {joined} are bringing {_join_names_human([_ordinal(age) for age in ages])} birthday energy to the family calendar today🎂!!!"
    return f"Most importantly, our own {joined} are the real reason to remember today🎂!!!"


def _wish_line(birthday_hits: list[dict]) -> str:
    names = [_first_name(str(item.get("name", "")).strip()) for item in birthday_hits if str(item.get("name", "")).strip()]
    joined = _join_names_human(names)
    return f"please take a moment to wish {joined} a very Happy Birthday" if joined else "please check the birthday list and make somebody feel remembered"


def _render_mom_daily(
    target: date,
    birthday_hits: list[dict],
    message_text: str,
    fact_groups: dict[str, list[CuratedFact]],
    profile: KeywordWeightProfile,
    rng: random.Random,
) -> str:
    copy_facts = _copy_friendly_facts(fact_groups, profile)
    nuggets = [_fact_nugget(fact) for fact in copy_facts[:4]]
    nuggets = [nugget for nugget in nuggets if nugget]
    lines = [rng.choice([
        f"Hope everybody is having a good {target.strftime('%A')}😊!!!",
        f"Before everybody gets too busy today, here is your {target.strftime('%B %d')} update👏!!!",
        "The calendar has some interesting facts today, but the family calendar still wins😊!!!",
    ])]
    if nuggets:
        lines.append(f"A few fun things are sharing space on today's calendar: {nuggets[0]}.")
        if len(nuggets) > 1:
            lines.append(f"Also worth mentioning, {nuggets[1]}.")
    else:
        lines.append("The trivia department is a little light today, which probably means we should focus on cake anyway🎂!!!")
    if birthday_hits:
        lines.append(_birthday_arrival_line(target, birthday_hits, rng))
        lines.append(f"So while you are finding an excuse for cake, {_wish_line(birthday_hits)}!!!")
        if rng.random() < 0.8:
            lines.append(message_text)
    else:
        lines.append("No family birthday lands on this date, so this is a planning day for future cake, texts, and calendar heroics.")
    lines.append(rng.choice([
        "Hope you all have a great day😘!!!",
        "Love you all and hope everyone has a great day😊!!!",
        "Enjoy the day and do not forget to be nice to each other😘!!!",
    ]))
    body = " ".join(lines)
    anatomy = ["warm family tone", "facts as seasoning", "birthday stays central", "keyword-weighted facts"]
    return f"""
        <div class="mom-daily-frame">
            <p class="birthday-hint">Copy-paste-ready draft in Patti mode. Negative keywords are weighted down so facts about death, tragedy, or disasters are less likely to appear in sendable birthday copy.</p>
            <textarea id="mom-daily-text" class="birthday-textarea birthday-textarea--large">{escape(body)}</textarea>
            <div class="birthday-actions"><button class="birthday-btn" type="button" id="momDailyCopyBtn">Copy Patti draft</button><span id="mom-daily-copy-status" class="birthday-hint"></span></div>
            <div class="mom-daily-anatomy">{''.join(f'<span>{escape(item)}</span>' for item in anatomy)}</div>
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
    body { font-family: Inter, system-ui, sans-serif; background: radial-gradient(circle at 10% 10%, rgba(255,170,196,.20), transparent 22%), radial-gradient(circle at 88% 12%, rgba(255,218,122,.18), transparent 24%), linear-gradient(180deg, #1b1323 0%, #141d2e 42%, #0a1320 100%); }
    header.hero { border-radius: 34px; background: linear-gradient(150deg, rgba(64,32,84,.92), rgba(25,32,52,.94)); box-shadow: 0 28px 80px rgba(0,0,0,.34); }
    .hero h1, h2, .birthday-calendar-title, .birthday-name, .birthday-upcoming-name, .birthday-empty-title { font-family: Fraunces, Georgia, serif; }
    .card { min-height: 230px; border-color: rgba(255,255,255,.10); background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)), rgba(18,26,43,.82); }
    .card::after { height: 5px; background: linear-gradient(90deg, #ffd16a, #ff8cb0, #7dd5ff); }
    .card--birthday_calendar { grid-column: span 7; }
    .card--birthday_spotlight { grid-column: span 5; }
    .card--mom_daily { grid-column: span 12; }
    .card--birthday_phone_helper, .card--birthday_message_starter, .card--birthday_upcoming, .card--classic_rock, .card--irish_history, .card--boston_sports, .card--famous_person_birthday, .card--fun_fact { grid-column: span 4; }
    .birthday-helper-panel, .birthday-spotlight-shell, .mom-daily-frame, .fact-stack, .birthday-upcoming-list, .birthday-stack { display: grid; gap: .9rem; }
    .birthday-summary-row, .birthday-stat-row, .birthday-actions, .mom-daily-anatomy { display: flex; flex-wrap: wrap; gap: .55rem; }
    .birthday-btn, .birthday-soft-pill, .birthday-summary-pill, .mom-daily-anatomy span, .fact-relevance { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.08); color: var(--ink); border-radius: 999px; padding: .45rem .75rem; font-weight: 700; }
    .birthday-btn { border-radius: 14px; cursor: pointer; font: inherit; }
    .birthday-summary-pill--warm { background: rgba(255,204,122,.18); color: #fff0ca; }
    .birthday-person, .birthday-upcoming-item, .fact-lead, .fact-more, .birthday-empty-state { padding: 1rem; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03)); border: 1px solid rgba(255,255,255,.10); }
    .birthday-person-top, .birthday-upcoming-item { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .birthday-mini-label { color: #ffd9a0; font-size: .74rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .birthday-name { margin-top: .18rem; font-weight: 700; font-size: 1.26rem; color: var(--ink); }
    .birthday-meta, .birthday-note, .birthday-upcoming-meta, .birthday-hint { color: #d5c8e6; font-size: .88rem; }
    .birthday-textarea { width: 100%; min-height: 120px; resize: vertical; padding: .95rem 1rem; border-radius: 16px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: var(--ink); font: inherit; line-height: 1.55; }
    .birthday-textarea--large { min-height: 320px; }
    .birthday-date-badge { width: 64px; min-width: 64px; border-radius: 18px; padding: .55rem .35rem; background: rgba(255,214,116,.18); text-align: center; }
    .birthday-date-month { display: block; color: #ffe6b8; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .fact-relevance { width: fit-content; color: #ffe6b8; text-transform: uppercase; letter-spacing: .08em; font-size: .68rem; }
    .fact-relevance--inline { margin-left: .35rem; padding: .18rem .45rem; }
    .fact-more summary { cursor: pointer; color: #ffe6b8; font-weight: 800; }
    .fact-more ul { margin: .85rem 0 0; padding-left: 1.1rem; display: grid; gap: .75rem; }
    @media (max-width: 980px) { .card--birthday_calendar, .card--birthday_spotlight, .card--birthday_phone_helper, .card--birthday_message_starter, .card--birthday_upcoming, .card--classic_rock, .card--irish_history, .card--boston_sports, .card--famous_person_birthday, .card--fun_fact { grid-column: span 6; } }
    @media (max-width: 720px) { .card--birthday_calendar, .card--birthday_spotlight, .card--birthday_phone_helper, .card--birthday_message_starter, .card--birthday_upcoming, .card--classic_rock, .card--irish_history, .card--boston_sports, .card--famous_person_birthday, .card--fun_fact, .card--mom_daily { grid-column: auto; } }
    """


def _extra_js() -> str:
    return """
    async function copyTextValue(value, statusId) {
      const status = statusId ? document.getElementById(statusId) : null;
      try { await navigator.clipboard.writeText(value); if (status) status.textContent = 'Copied ✅'; }
      catch (err) { if (status) status.textContent = 'Copy manually'; }
    }
    (function () {
      [['birthdayPhoneCopyBtn','birthday-phone-list','birthday-phone-copy-status'], ['birthdayMessageCopyBtn','birthday-message-starter','birthday-message-copy-status'], ['momDailyCopyBtn','mom-daily-text','mom-daily-copy-status']].forEach(([btnId, fieldId, statusId]) => {
        const btn = document.getElementById(btnId); const field = document.getElementById(fieldId);
        if (btn && field) btn.addEventListener('click', () => copyTextValue(field.value, statusId));
      });
      document.querySelectorAll('[data-copy-text]').forEach((el) => el.addEventListener('click', () => copyTextValue(el.getAttribute('data-copy-text') || '', 'birthday-message-copy-status')));
    })();
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng_seed = seed if seed is not None else today.toordinal()
    rng = random.Random(rng_seed)
    profile = load_keyword_weight_profile(WEIGHT_PROFILE_NAME)

    birthdays = load_birthdays()
    birthday_hits = birthdays_for_date(birthdays, today.month, today.day)
    birthday_index = build_birthday_index(birthdays)
    all_phones = people_to_phone_list(birthdays)
    phones_without_birthday_person = filter_phones_excluding_birthday_people(all_phones, birthday_hits)
    message_text = _message_text_for_hits(birthday_hits, rng)
    available_curated = _all_fact_sources()
    fact_groups = {
        card_type: _select_facts_for_card_type(available_curated, card_type, today, rng_seed, profile)
        for card_type in CURATED_CARD_ORDER
    }

    cards: list[CardItem] = [
        CardItem("birthday_calendar", "Pick a Date", "Birthday Calendar", _calendar_card_html(today, birthday_index), None),
        CardItem("birthday_spotlight", "Birthday Spotlight", today.strftime("%B %d"), _render_birthday_spotlight(today, birthday_hits, message_text), None),
        CardItem("birthday_phone_helper", "Quick Outreach", "Phone List Helper", _render_phone_helper(phones_without_birthday_person, birthday_hits), None),
        CardItem("mom_daily", "Patti Mode", "Mom Daily Draft", _render_mom_daily(today, birthday_hits, message_text, fact_groups, profile, rng), None),
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
        title, body_html, source_url = _render_fact_card_body(fact_groups.get(card_type, []), today, profile, fallback_title, fallback_body)
        cards.append(CardItem(card_type, eyebrow, title, body_html, source_url))

    cards.extend([
        CardItem("birthday_message_starter", "Message Starter", "What to Say", f"<p>Editable starter you can copy into a direct birthday text.</p><textarea id='birthday-message-starter' class='birthday-textarea'>{escape(message_text)}</textarea><div class='birthday-actions'><button class='birthday-btn' type='button' id='birthdayMessageCopyBtn'>Copy message</button><span id='birthday-message-copy-status' class='birthday-hint'></span></div>", None),
        CardItem("birthday_upcoming", "Plan Ahead", "Upcoming Birthdays", _render_upcoming_birthdays(today, birthdays), None),
    ])

    fact_count = sum(len(facts) for facts in fact_groups.values())
    birthday_count = len(birthday_hits)
    footer_text = f"{THEME_CONFIG['footer_text']} {len(birthdays)} birthday entries loaded. {len(available_curated)} approved facts available. Using keyword profile: {WEIGHT_PROFILE_NAME}."

    if birthday_hits:
        names = [str(item.get("name", "")).strip() for item in birthday_hits if str(item.get("name", "")).strip()]
        subtitle = f"{_join_names_human(names)} is up today — birthday tools plus {fact_count} weighted fact options." if len(names) == 1 else f"{len(names)} birthdays are up today — birthday tools plus {fact_count} weighted fact options."
    else:
        subtitle = f"No family birthday lands on {today.strftime('%B %d')} — planning view with {fact_count} weighted fact options."

    return PageContext(
        page_title=f"BirthDay Today — {today.strftime('%B %d, %Y')}",
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=subtitle,
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=footer_text,
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "background": None,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker", "Daily Flyer • Theme"),
            "hero_summary_pill": f"{birthday_count} birthday{'s' if birthday_count != 1 else ''} · {fact_count} weighted facts" if birthday_count else f"Planning view · {fact_count} weighted facts",
            "extra_css": _extra_css(),
            "extra_js": _extra_js(),
            "extra_head_html": _extra_head_html(),
        },
    )
