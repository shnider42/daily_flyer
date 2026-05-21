from __future__ import annotations

import random

from daily_flyer.birthdays import birthdays_for_date, filter_phones_excluding_birthday_people, load_birthdays, people_to_phone_list, phones_to_to_field_text
from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def _first_name(name: str) -> str:
    parts = [part for part in str(name or "").split() if part]
    return parts[0] if parts else "there"


def _join_names(names: list[str]) -> str:
    clean = [name for name in names if name]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    if len(clean) == 2:
        return clean[0] + " and " + clean[1]
    return ", ".join(clean[:-1]) + ", and " + clean[-1]


def build(ctx: FlyerContext) -> FlyerExperience:
    rng = random.Random(ctx.seed)
    all_birthdays = load_birthdays()
    hits = birthdays_for_date(all_birthdays, ctx.selected_date.month, ctx.selected_date.day)
    names = [str(item.get("name", "")).strip() for item in hits if str(item.get("name", "")).strip()]
    first_names = [_first_name(name) for name in names]
    joined = _join_names(first_names)
    phone_pool = people_to_phone_list(all_birthdays)
    recipients = filter_phones_excluding_birthday_people(phone_pool, hits)
    to_field = phones_to_to_field_text(recipients)

    if names:
        message = rng.choice([
            "Happy birthday, " + joined + "! Hope you have a great day!",
            "Happy birthday, " + joined + "! Wishing you a fun day and a great year ahead!",
            "Happy birthday, " + joined + "! Hope today treats you really well!",
        ])
        lead_title = "Birthday today"
        lead_body = "Today is for " + _join_names(names) + ". The send list below excludes the birthday person."
    else:
        message = "No birthday today. Good day to check the calendar and plan ahead."
        lead_title = "No birthday today"
        lead_body = "Nothing urgent for this date. The helper is still ready if you jump to another day."

    lead = FlyerItem(kind="birthday_status", label="Today", title=lead_title, body=lead_body, data={"birthday_count": len(hits)})
    sections = [
        FlyerItem(kind="people", label="Birthday person", title=_join_names(names) if names else "Nobody listed", body="People found for this date.", data={"names": names}),
        FlyerItem(kind="recipients", label="Send to", title=str(len(recipients)) + " recipients", body=to_field or "No phone list loaded yet.", data={"to_field": to_field}),
        FlyerItem(kind="message", label="Text", title="Suggested message", body=message, data={"message": message}),
    ]
    actions = [
        FlyerItem(kind="calendar", label="Pick a day", title="Birthday calendar", body="Tap a month/day link to reload the helper for that date."),
        FlyerItem(kind="copy", label="Copy", title="Copy-ready fields", body="Use the copy buttons for the recipient list and message."),
    ]
    return FlyerExperience(
        product="birthday_helper",
        layout="birthday_helper",
        title="Birthday Helper",
        subtitle="A simple birthday texting desk for Mom.",
        date_label=ctx.display_date,
        lead=lead,
        sections=sections,
        actions=actions,
        footer="Private, practical, and intentionally less fancy than the public Daily Flyer themes.",
        data={"month": ctx.selected_date.month, "day": ctx.selected_date.day},
    )
