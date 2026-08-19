from __future__ import annotations

from datetime import date
from html import escape

from daily_flyer.birthdays import birthdays_for_date, load_birthdays
from daily_flyer.content_weighting import load_keyword_weight_profile
from daily_flyer.curated_fact_store import CuratedFact
from daily_flyer.models import PageContext
from daily_flyer.themes import this_day_birthday_content_quality as quality
from daily_flyer.utils import resolve_date


THEME_NAME = quality.THEME_NAME
WEIGHT_PROFILE_NAME = quality.WEIGHT_PROFILE_NAME
CURATED_CARD_ORDER = quality.CURATED_CARD_ORDER
THEME_CONFIG = dict(quality.THEME_CONFIG)
THEME_CONFIG["hero_summary_pill"] = "Birthdays first · lots of facts · four Patti drafts"


def _date_label(target: date) -> str:
    return f"{target.strftime('%B')} {target.day}"


def _birthday_names(birthday_hits: list[dict]) -> str:
    names = quality.enhanced._birthday_names_for_copy(birthday_hits)  # noqa: SLF001
    return quality.enhanced.weighted._join_names_human(names)  # noqa: SLF001


def _fact_line(fact: CuratedFact, limit: int = 165) -> str:
    body = quality.enhanced.weighted._trim_fact_text(fact.body, limit)  # noqa: SLF001
    title = str(fact.title or "").strip()
    return f"{title}: {body}" if title else body


def _fact_lines(facts: list[CuratedFact], count: int) -> list[str]:
    return [_fact_line(fact) for fact in facts[:count]]


def _draft_variants(
    target: date,
    birthday_hits: list[dict],
    facts: list[CuratedFact],
) -> list[dict[str, str]]:
    date_label = _date_label(target)
    joined = _birthday_names(birthday_hits)
    birthday_message = quality.enhanced._message_text_for_hits(birthday_hits)  # noqa: SLF001
    lines = _fact_lines(facts, 5)

    fact_one = lines[0] if len(lines) > 0 else "The calendar is a little quiet today, which just leaves more room for the birthday headline."
    fact_two = lines[1] if len(lines) > 1 else ""
    fact_three = lines[2] if len(lines) > 2 else ""

    if joined:
        classic_parts = [
            f"Here is your {date_label} family calendar update 🎂",
            "A few things sharing the date:",
            fact_one,
        ]
        if fact_two:
            classic_parts.append(fact_two)
        classic_parts.extend([
            f"Interesting stuff, but the real headline is {joined}.",
            f"Please send some love today: {birthday_message}",
            "Love you all, and hope everyone has a great day 😘",
        ])

        birthday_first_parts = [
            f"Happy birthday to {joined}! 🎉🎂",
            f"{date_label} belongs to {joined} in the family calendar, so birthday wishes come first today.",
            "For a little birthday-date trivia:",
            fact_one,
        ]
        if fact_two:
            birthday_first_parts.append(fact_two)
        birthday_first_parts.append("Hope the birthday is a great one, and hope everybody has a wonderful day! ❤️")

        whimsical_parts = [
            f"The {date_label} random-calendar department has been busy 😂",
            f"✨ {fact_one}",
        ]
        if fact_two:
            whimsical_parts.append(f"🎈 {fact_two}")
        if fact_three:
            whimsical_parts.append(f"🤓 {fact_three}")
        whimsical_parts.extend([
            f"But all of that loses to the most important event on the calendar: {joined}'s birthday! 🎂",
            birthday_message,
            "Love you all 😘",
        ])

        short_parts = [
            f"Happy birthday, {joined}! 🎂🥳",
            f"Quick {date_label} trivia: {fact_one}",
            "Hope everyone has a great day! ❤️",
        ]
    else:
        classic_parts = [
            f"Here is your {date_label} family calendar update 🎂",
            fact_one,
        ]
        if fact_two:
            classic_parts.append(fact_two)
        classic_parts.extend([
            "No family birthday today, so consider this a warm-up for the next one.",
            "Love you all, and hope everyone has a great day 😘",
        ])

        birthday_first_parts = [
            f"No family birthday on {date_label} — but the calendar still gave us a few things to talk about.",
            fact_one,
        ]
        if fact_two:
            birthday_first_parts.append(fact_two)
        birthday_first_parts.append("Hope everybody has a wonderful day! ❤️")

        whimsical_parts = [
            f"Today's random calendar report for {date_label} 😂",
            f"✨ {fact_one}",
        ]
        if fact_two:
            whimsical_parts.append(f"🎈 {fact_two}")
        if fact_three:
            whimsical_parts.append(f"🤓 {fact_three}")
        whimsical_parts.extend([
            "No birthday headline today, but there is always something weird on the calendar.",
            "Love you all 😘",
        ])

        short_parts = [
            f"Quick {date_label} note: {fact_one}",
            "No family birthday today. Hope everyone has a great day! ❤️",
        ]

    return [
        {
            "label": "Classic Patti",
            "description": "Warm family update: trivia first, birthday gets the final headline.",
            "text": "\n\n".join(classic_parts),
        },
        {
            "label": "Birthday First",
            "description": "Leads immediately with the cousin birthday, then adds date trivia.",
            "text": "\n\n".join(birthday_first_parts),
        },
        {
            "label": "Whimsical",
            "description": "The goofiest version: more emojis and more random-calendar energy.",
            "text": "\n\n".join(whimsical_parts),
        },
        {
            "label": "Short & Sweet",
            "description": "A compact version when the full family-newsletter treatment feels like too much.",
            "text": "\n\n".join(short_parts),
        },
    ]


def _render_mom_daily_variants(
    target: date,
    birthday_hits: list[dict],
    facts: list[CuratedFact],
) -> str:
    variants = _draft_variants(target, birthday_hits, facts)
    parts = [
        "<div class='mom-daily-frame mom-daily-variants' data-mom-drafts>",
        "<p class='birthday-hint'>Four ready-to-send versions use the same birthday and exact-day fact pool. Pick whichever sounds most like Patti today.</p>",
        "<div class='mom-draft-tabs' role='tablist' aria-label='Mom Daily draft styles'>",
    ]

    for index, variant in enumerate(variants):
        active = " is-active" if index == 0 else ""
        selected = "true" if index == 0 else "false"
        parts.append(
            f"<button class='mom-draft-tab{active}' type='button' role='tab' "
            f"aria-selected='{selected}' data-mom-draft-go='{index}'>{escape(variant['label'])}</button>"
        )
    parts.append("</div>")

    for index, variant in enumerate(variants):
        hidden = "" if index == 0 else " hidden"
        parts.append(
            f"<section class='mom-draft-panel' data-mom-draft-panel data-index='{index}'{hidden}>"
            f"<div class='mom-draft-heading'><div><div class='birthday-mini-label'>Version {index + 1} of {len(variants)}</div>"
            f"<strong>{escape(variant['label'])}</strong></div>"
            f"<span class='birthday-hint'>{escape(variant['description'])}</span></div>"
            f"<textarea class='birthday-textarea birthday-textarea--large mom-draft-text'>{escape(variant['text'])}</textarea>"
            "</section>"
        )

    parts.extend([
        "<div class='mom-draft-controls'>",
        "<button class='birthday-btn' type='button' data-mom-draft-prev>← Previous</button>",
        f"<span class='mom-draft-counter' data-mom-draft-counter>1 of {len(variants)}</span>",
        "<button class='birthday-btn' type='button' data-mom-draft-next>Next →</button>",
        "<button class='birthday-btn mom-draft-copy' type='button' data-mom-draft-copy>Copy this version</button>",
        "<span class='birthday-hint' data-mom-draft-copy-status></span>",
        "</div></div>",
    ])
    return "".join(parts)


def _replace_mom_daily_card(
    context: PageContext,
    target: date,
    birthday_hits: list[dict],
    facts: list[CuratedFact],
) -> None:
    replacement = _render_mom_daily_variants(target, birthday_hits, facts)
    for card in context.cards:
        if card.card_type == "mom_daily":
            card.body = replacement
            card.title = "Mom Daily Drafts"
            card.eyebrow = "Patti Mode · 4 Versions"
            return


def _draft_css() -> str:
    return r"""
    .mom-daily-variants { gap: 1rem; }
    .mom-draft-tabs { display: flex; flex-wrap: wrap; gap: .5rem; }
    .mom-draft-tab {
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color: var(--ink-soft);
        border-radius: 999px;
        padding: .48rem .78rem;
        cursor: pointer;
        font: inherit;
        font-size: .86rem;
        font-weight: 750;
    }
    .mom-draft-tab:hover, .mom-draft-tab.is-active {
        background: rgba(255, 214, 116, .18);
        border-color: rgba(255, 214, 116, .42);
        color: var(--ink);
    }
    .mom-draft-panel { display: grid; gap: .8rem; }
    .mom-draft-panel[hidden] { display: none; }
    .mom-draft-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .65rem 1rem; align-items: end; }
    .mom-draft-heading strong { display: block; margin-top: .15rem; font-size: 1.06rem; color: var(--ink); }
    .mom-draft-heading > .birthday-hint { max-width: 42ch; text-align: right; }
    .mom-draft-text { min-height: 350px; }
    .mom-draft-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem; }
    .mom-draft-counter { color: #ffe6b8; font-weight: 850; min-width: 4.2rem; text-align: center; }
    .mom-draft-copy { margin-left: auto; }
    @media (max-width: 720px) {
        .mom-draft-heading > .birthday-hint { max-width: none; text-align: left; }
        .mom-draft-copy { margin-left: 0; width: 100%; justify-content: center; }
        .mom-draft-text { min-height: 420px; }
    }
    """


def _draft_js() -> str:
    return r"""
    (function () {
        document.querySelectorAll('[data-mom-drafts]').forEach(function (root) {
            const panels = Array.from(root.querySelectorAll('[data-mom-draft-panel]'));
            const tabs = Array.from(root.querySelectorAll('[data-mom-draft-go]'));
            const counter = root.querySelector('[data-mom-draft-counter]');
            const status = root.querySelector('[data-mom-draft-copy-status]');
            if (!panels.length) return;
            let index = 0;

            function show(nextIndex) {
                index = (nextIndex + panels.length) % panels.length;
                panels.forEach(function (panel, panelIndex) {
                    panel.hidden = panelIndex !== index;
                });
                tabs.forEach(function (tab, tabIndex) {
                    const active = tabIndex === index;
                    tab.classList.toggle('is-active', active);
                    tab.setAttribute('aria-selected', active ? 'true' : 'false');
                });
                if (counter) counter.textContent = `${index + 1} of ${panels.length}`;
                if (status) status.textContent = '';
            }

            root.querySelector('[data-mom-draft-prev]')?.addEventListener('click', function () {
                show(index - 1);
            });
            root.querySelector('[data-mom-draft-next]')?.addEventListener('click', function () {
                show(index + 1);
            });
            tabs.forEach(function (tab) {
                tab.addEventListener('click', function () {
                    show(Number(tab.dataset.momDraftGo || 0));
                });
            });
            root.querySelector('[data-mom-draft-copy]')?.addEventListener('click', async function () {
                const textarea = panels[index].querySelector('.mom-draft-text');
                if (!textarea) return;
                try {
                    await navigator.clipboard.writeText(textarea.value);
                    if (status) status.textContent = 'Copied.';
                } catch (error) {
                    textarea.focus();
                    textarea.select();
                    document.execCommand('copy');
                    if (status) status.textContent = 'Copied.';
                }
            });

            show(0);
        });
    })();
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = quality.build_theme_page(date_str=date_str, seed=seed)
    target = resolve_date(date_str)
    profile = load_keyword_weight_profile(WEIGHT_PROFILE_NAME)
    birthday_hits = birthdays_for_date(load_birthdays(), target.month, target.day)
    facts = quality._select_patti_copy_facts(  # noqa: SLF001
        quality._all_fact_sources(target),  # noqa: SLF001
        target,
        profile,
        limit=6,
    )

    _replace_mom_daily_card(context, target, birthday_hits, facts)
    context.metadata["extra_css"] = f"{context.metadata.get('extra_css', '')}\n{_draft_css()}"
    context.metadata["extra_js"] = f"{context.metadata.get('extra_js', '')}\n{_draft_js()}"
    context.metadata["hero_summary_pill"] = "Birthdays first · lots of facts · four Patti drafts"
    return context
