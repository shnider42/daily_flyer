from __future__ import annotations

import json
import random
from datetime import date
from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.providers.county import fetch_county_of_the_week
from daily_flyer.providers.davy_holden import DAVY_WEBSITE_URL, fetch_davy_collection, fetch_davy_feature
from daily_flyer.providers.facts import fetch_irish_connection
from daily_flyer.themes import irish_today as base_theme
from daily_flyer.utils import resolve_date


THEME_NAME = "irish_today_plus"

THEME_CONFIG = {
    "page_title": "Irish Today Plus — Interactive Irish culture, history, and client storytelling",
    "header_title": "☘️ Irish Today Plus ☘️",
    "header_title_image": base_theme.THEME_CONFIG.get("header_title_image"),
    "header_subtitle": "A richer Irish Today prototype with interactivity, visuals, and a client spotlight layer for Davy Holden History.",
    "footer_text": "Built by Holtsnider Tech. Irish Today Plus prototype for Davy Holden History.",
    "hero_kicker": "Daily Flyer • Irish Today Plus",
    "hero_summary_pill": "Interactive cards, richer visuals, and a client-ready spotlight",
}

BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = list(getattr(base_theme, "BACKGROUNDS", []))


TRIVIA_QUESTIONS = [
    {
        "question": "Which prehistoric monument in County Meath is especially famous for its winter-solstice light alignment?",
        "answer": "Newgrange.",
        "hint": "It predates the pyramids and sits in the Boyne Valley.",
    },
    {
        "question": "What is the Irish word 'sláinte' most commonly used to mean in everyday speech?",
        "answer": "A toast meaning 'cheers' or 'health.'",
        "hint": "You would often hear it raised with a drink.",
    },
    {
        "question": "Which Irish sport uses a hurley and a sliotar?",
        "answer": "Hurling.",
        "hint": "It is often described as one of the fastest field games in the world.",
    },
    {
        "question": "What seasonal festival is widely connected to the older roots of Halloween in Ireland?",
        "answer": "Samhain.",
        "hint": "It marks the turn toward winter.",
    },
    {
        "question": "What is the name of Ireland's Irish-language television channel?",
        "answer": "TG4.",
        "hint": "Its name includes a number.",
    },
    {
        "question": "What are regions where Irish is still recognized as the community language called?",
        "answer": "Gaeltacht areas.",
        "hint": "The term starts with a capital G in English writing.",
    },
]


def _day_of_year(month: int, day: int) -> int:
    return date(2001, month, day).timetuple().tm_yday


def _circular_day_distance(a: int, b: int) -> int:
    raw = abs(a - b)
    return min(raw, 365 - raw)


def _normalize_history_entry(entry) -> tuple[str, str | None]:
    if isinstance(entry, dict):
        return str(entry.get("body", "")).strip(), entry.get("source_url")
    return str(entry).strip(), None


def _pick_history(today) -> tuple[str, str, str | None]:
    mmdd = today.strftime("%m-%d")
    this_day = getattr(base_theme, "HISTORY_THIS_DAY", {})
    week_events = getattr(base_theme, "HISTORY_WEEK_EVENTS", [])

    if mmdd in this_day:
        body, source_url = _normalize_history_entry(this_day[mmdd])
        return "This Day in Irish History", body, source_url

    today_doy = today.timetuple().tm_yday
    candidates: list[tuple[int, int, int, dict]] = []
    for event in week_events:
        event_doy = _day_of_year(int(event["month"]), int(event["day"]))
        distance = _circular_day_distance(today_doy, event_doy)
        if distance <= 5:
            candidates.append((distance, int(event["month"]), int(event["day"]), event))

    if candidates:
        candidates.sort(key=lambda item: (item[0], item[1], item[2]))
        chosen = candidates[0][3]
        return (
            str(chosen.get("title", "This Week in Irish History")).strip() or "This Week in Irish History",
            str(chosen.get("body", "")).strip(),
            chosen.get("source_url"),
        )

    fallback = "Irish history is full of strong daily hooks — uprisings, literature, sport, and language revival all give this theme room to breathe."
    return "Irish History Spotlight", fallback, None


def _pick_background(today) -> dict | None:
    backgrounds = list(getattr(base_theme, "BACKGROUNDS", []))
    if not backgrounds:
        return None

    cadence = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
    if cadence == "weekly":
        index = today.isocalendar().week % len(backgrounds)
    else:
        index = today.toordinal() % len(backgrounds)
    return backgrounds[index]


def _pick_word(today) -> dict:
    words = list(getattr(base_theme, "WORDS", []))
    if not words:
        return {
            "native_text": "Fáilte",
            "pronunciation": "fawl-cha",
            "english": "Welcome",
        }
    return words[today.toordinal() % len(words)]


def _pick_phrase(rng: random.Random) -> dict:
    phrases = list(getattr(base_theme, "PHRASES", []))
    if not phrases:
        return {
            "native_text": "Dia dhuit",
            "pronunciation": "dee-ah gwit",
            "english": "Hello",
        }
    return rng.choice(phrases)


def _pick_fact(rng: random.Random) -> str:
    facts = list(getattr(base_theme, "DID_YOU_KNOW", []))
    if not facts:
        return "Ireland has deep layers of language, history, and cultural continuity that reward a theme built around curiosity."
    return rng.choice(facts)


def _pick_sport(rng: random.Random) -> str:
    sports = list(getattr(base_theme, "SPORTS_SPOTLIGHT", []))
    if not sports:
        return "Irish sport can easily support richer visual cards, especially when county identity is part of the story."
    return rng.choice(sports)


def _render_history_body(title: str, body: str) -> str:
    return f"""
        <div class="it-story-shell">
            <div class="it-story-kicker">Featured history card</div>
            <p class="it-story-text">{escape(body)}</p>
            <div class="it-chip-row">
                <span class="it-chip">📚 Curated Irish history</span>
                <span class="it-chip">🗓️ Rotates with the calendar</span>
            </div>
        </div>
    """


def _render_trivia_card(today, rng: random.Random) -> CardItem:
    questions = list(TRIVIA_QUESTIONS)
    rng.shuffle(questions)
    starter = questions[0]
    payload = escape(json.dumps(questions, ensure_ascii=False), quote=True)

    body = f"""
        <div class="it-trivia-shell" data-it-trivia="{payload}">
            <div class="it-trivia-head">
                <span class="it-chip">🎯 Mini game</span>
                <span class="it-chip">6-question pool</span>
            </div>
            <div class="it-trivia-question">{escape(starter["question"])}</div>
            <div class="it-trivia-hint">Hint: {escape(starter["hint"])}</div>
            <div class="it-trivia-answer" hidden>{escape(starter["answer"])}</div>
            <div class="it-action-row">
                <button class="it-btn" type="button" data-action="reveal-answer">Reveal answer</button>
                <button class="it-btn it-btn--ghost" type="button" data-action="next-question">Next question</button>
            </div>
        </div>
    """
    return CardItem(
        card_type="trivia",
        eyebrow="Irish Trivia",
        title="Quick Craic Challenge",
        body=body,
        source_url=None,
    )


def _render_language_card(today, rng: random.Random) -> CardItem:
    word = _pick_word(today)
    phrase = _pick_phrase(rng)
    slug = f"itlang-{today.toordinal()}"

    body = f"""
        <div class="it-language-shell">
            <div class="it-language-primary">{escape(word["native_text"])}</div>
            <div class="it-language-sub">Tap to reveal the meaning, pronunciation, and a bonus phrase.</div>

            <div class="it-action-row">
                <button class="it-btn" type="button" data-toggle-target="{slug}-meaning">Meaning</button>
                <button class="it-btn" type="button" data-toggle-target="{slug}-pronunciation">Pronunciation</button>
                <button class="it-btn it-btn--ghost" type="button" data-toggle-target="{slug}-phrase">Bonus phrase</button>
            </div>

            <div class="it-reveal" id="{slug}-meaning" hidden>{escape(word["english"])}</div>
            <div class="it-reveal" id="{slug}-pronunciation" hidden>{escape(word.get("pronunciation", ""))}</div>
            <div class="it-reveal" id="{slug}-phrase" hidden>
                <strong>{escape(phrase["native_text"])}</strong><br>
                {escape(phrase.get("pronunciation", ""))}<br>
                {escape(phrase["english"])}
            </div>
        </div>
    """
    return CardItem(
        card_type="word",
        eyebrow="Gaeilge",
        title="Language Lab",
        body=body,
        source_url=None,
    )


def _render_davy_card(rng: random.Random) -> CardItem:
    feature = fetch_davy_feature(rng)
    collection = fetch_davy_collection(limit=3, rng=rng)

    links = []
    for item in collection:
        title = escape(item["title"])
        source_name = escape(item["source_name"])
        if item.get("source_url"):
            source_url = escape(item["source_url"], quote=True)
            links.append(
                f'<a class="it-list-link" href="{source_url}" target="_blank" rel="noopener noreferrer">'
                f"<span>{title}</span><span>{source_name}</span></a>"
            )
        else:
            links.append(
                f'<div class="it-list-link it-list-link--static"><span>{title}</span><span>{source_name}</span></div>'
            )

    action_html = ""
    if feature.get("source_url"):
        action_html = (
            f'<a class="it-btn" href="{escape(feature["source_url"], quote=True)}" '
            f'target="_blank" rel="noopener noreferrer">Open feature</a>'
        )
    else:
        action_html = '<span class="it-chip">Link slot ready for channel URL</span>'

    body = f"""
        <div class="it-davy-shell">
            <div class="it-chip-row">
                <span class="it-chip">Client spotlight</span>
                <span class="it-chip">{escape(feature["source_name"])}</span>
                <span class="it-chip">{escape(feature["media_type"])}</span>
            </div>
            <p class="it-story-text">{escape(feature["snippet"])}</p>
            <div class="it-action-row">
                {action_html}
                <a class="it-btn it-btn--ghost" href="{escape(DAVY_WEBSITE_URL, quote=True)}" target="_blank" rel="noopener noreferrer">Visit site</a>
            </div>
            <div class="it-list">
                {''.join(links)}
            </div>
        </div>
    """
    return CardItem(
        card_type="news",
        eyebrow="From Davy Holden",
        title=feature["title"],
        body=body,
        source_url=feature.get("source_url"),
    )


def _render_visual_card(background: dict | None) -> CardItem:
    label = "Irish Visual of the Day"
    if background and background.get("label"):
        label = str(background["label"]).strip() or label

    body = """
        <div class="it-visual-shell">
            <p class="it-story-text">A visual card gives Irish Today a breather between text-heavy cards and helps the page feel more like a polished daily product than a plain article grid.</p>
            <div class="it-chip-row">
                <span class="it-chip">🖼️ Reuses theme assets</span>
                <span class="it-chip">✨ Easy place for future photography</span>
            </div>
        </div>
    """
    return CardItem(
        card_type="did_you_know",
        eyebrow="Visual Layer",
        title=label,
        body=body,
        source_url=None,
        image_url=background.get("path") if background else None,
    )


def _render_fact_card(rng: random.Random) -> CardItem:
    body = f"""
        <div class="it-story-shell">
            <p class="it-story-text">{escape(_pick_fact(rng))}</p>
            <div class="it-chip-row">
                <span class="it-chip">💡 Curiosity card</span>
                <span class="it-chip">☘️ Irish culture</span>
            </div>
        </div>
    """
    return CardItem(
        card_type="did_you_know",
        eyebrow="Irish Fact",
        title="Did You Know?",
        body=body,
        source_url=None,
    )


def _render_sport_card(rng: random.Random) -> CardItem:
    body = f"""
        <div class="it-story-shell">
            <p class="it-story-text">{escape(_pick_sport(rng))}</p>
            <div class="it-chip-row">
                <span class="it-chip">🏆 Sporting identity</span>
                <span class="it-chip">📣 County pride</span>
            </div>
        </div>
    """
    return CardItem(
        card_type="sport",
        eyebrow="Sports Spotlight",
        title="Play, Pride, and Rivalry",
        body=body,
        source_url=None,
    )


def _render_connection_card(rng: random.Random) -> CardItem | None:
    fact = fetch_irish_connection(rng)
    if not fact:
        return None

    body = f"""
        <div class="it-story-shell">
            <p class="it-story-text">{escape(fact["body"])}</p>
            <div class="it-chip-row">
                <span class="it-chip">🔗 Cross-cultural connection</span>
            </div>
        </div>
    """
    return CardItem(
        card_type="irish_connection",
        eyebrow="Irish Connection",
        title=fact["title"],
        body=body,
        source_url=fact.get("source_url"),
    )


def _render_county_card(today) -> CardItem | None:
    county = fetch_county_of_the_week(today)
    if not county:
        return None

    body = f"""
        <div class="it-story-shell">
            <p class="it-story-text">{escape(county["body"])}</p>
            <div class="it-chip-row">
                <span class="it-chip">🗺️ Rotating county card</span>
                <span class="it-chip">📸 Visual-first</span>
            </div>
        </div>
    """
    return CardItem(
        card_type="county",
        eyebrow="County of the Week",
        title=county["title"],
        body=body,
        source_url=county.get("source_url"),
        image_url=county.get("image_url"),
    )


def _extra_head_html() -> str:
    return """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    """


def _extra_css() -> str:
    return r"""
    .hero h1,
    h2,
    .it-language-primary,
    .it-trivia-question {
        font-family: "Fraunces", Georgia, serif;
    }

    .hero {
        background:
            radial-gradient(circle at top left, rgba(26, 168, 93, 0.18), transparent 24%),
            radial-gradient(circle at 88% 20%, rgba(255, 164, 82, 0.16), transparent 22%),
            linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02)),
            linear-gradient(155deg, rgba(12, 55, 43, 0.92), rgba(15, 34, 52, 0.94));
    }

    .hero h1 {
        max-width: 12ch;
    }

    .card {
        border-color: rgba(255,255,255,0.11);
        box-shadow:
            0 18px 46px rgba(0,0,0,0.24),
            inset 0 1px 0 rgba(255,255,255,0.05);
    }

    .card--history {
        grid-column: span 7;
        background:
            radial-gradient(circle at top left, rgba(255, 214, 116, 0.16), transparent 28%),
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
            rgba(35, 29, 21, 0.88);
    }

    .card--trivia {
        grid-column: span 5;
        background:
            radial-gradient(circle at top right, rgba(91, 208, 187, 0.18), transparent 30%),
            linear-gradient(180deg, rgba(73,197,182,0.10), rgba(255,255,255,0.03)),
            rgba(12, 33, 40, 0.90);
    }

    .card--news {
        grid-column: span 6;
        background:
            radial-gradient(circle at top left, rgba(41,179,106,0.18), transparent 26%),
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
            rgba(14, 36, 30, 0.90);
    }

    .card--word {
        grid-column: span 6;
        background:
            radial-gradient(circle at top left, rgba(125,183,217,0.18), transparent 24%),
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
            rgba(16, 28, 42, 0.90);
    }

    .card--county,
    .card--sport,
    .card--did_you_know,
    .card--irish_connection {
        grid-column: span 6;
    }

    .it-story-shell,
    .it-davy-shell,
    .it-language-shell,
    .it-trivia-shell,
    .it-visual-shell {
        display: grid;
        gap: 0.9rem;
    }

    .it-story-kicker,
    .it-language-sub,
    .it-trivia-hint {
        color: var(--ink-soft);
        font-size: 0.92rem;
        line-height: 1.55;
    }

    .it-story-text {
        margin: 0;
        color: var(--ink);
        line-height: 1.72;
        font-size: 1rem;
    }

    .it-chip-row,
    .it-action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
    }

    .it-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.42rem 0.7rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.10);
        color: var(--ink);
        font-size: 0.8rem;
        font-weight: 700;
    }

    .it-btn {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.09);
        color: var(--ink);
        border-radius: 14px;
        padding: 0.72rem 1rem;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
        transition: background 150ms ease, transform 150ms ease, border-color 150ms ease;
    }

    .it-btn:hover {
        background: rgba(255,255,255,0.14);
        border-color: rgba(255,255,255,0.22);
        transform: translateY(-1px);
        text-decoration: none;
    }

    .it-btn--ghost {
        background: transparent;
    }

    .it-trivia-head {
        display: flex;
        justify-content: space-between;
        gap: 0.6rem;
        flex-wrap: wrap;
    }

    .it-trivia-question {
        font-size: 1.35rem;
        line-height: 1.22;
        color: var(--ink);
    }

    .it-trivia-answer,
    .it-reveal {
        padding: 0.85rem 0.95rem;
        border-radius: 16px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.10);
        color: var(--ink);
        line-height: 1.65;
    }

    .it-language-primary {
        font-size: 1.75rem;
        line-height: 1;
        color: var(--ink);
    }

    .it-list {
        display: grid;
        gap: 0.65rem;
    }

    .it-list-link {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
        padding: 0.8rem 0.9rem;
        border-radius: 15px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
        text-decoration: none;
        color: var(--ink);
    }

    .it-list-link span:last-child {
        color: var(--ink-soft);
        font-size: 0.88rem;
        white-space: nowrap;
    }

    .it-list-link--static {
        opacity: 0.92;
    }

    @media (max-width: 980px) {
        .card--history,
        .card--trivia,
        .card--news,
        .card--word,
        .card--county,
        .card--sport,
        .card--did_you_know,
        .card--irish_connection {
            grid-column: span 6;
        }
    }

    @media (max-width: 720px) {
        .card--history,
        .card--trivia,
        .card--news,
        .card--word,
        .card--county,
        .card--sport,
        .card--did_you_know,
        .card--irish_connection {
            grid-column: auto;
        }

        .it-list-link {
            align-items: flex-start;
            flex-direction: column;
        }
    }
    """


def _extra_js() -> str:
    return """
    (function () {
        document.querySelectorAll("[data-toggle-target]").forEach((button) => {
            button.addEventListener("click", () => {
                const targetId = button.getAttribute("data-toggle-target");
                if (!targetId) return;
                const target = document.getElementById(targetId);
                if (!target) return;
                target.hidden = !target.hidden;
            });
        });

        document.querySelectorAll("[data-it-trivia]").forEach((root) => {
            let questions = [];
            try {
                questions = JSON.parse(root.getAttribute("data-it-trivia") || "[]");
            } catch (err) {
                questions = [];
            }
            if (!Array.isArray(questions) || !questions.length) return;

            let index = 0;
            const questionEl = root.querySelector(".it-trivia-question");
            const hintEl = root.querySelector(".it-trivia-hint");
            const answerEl = root.querySelector(".it-trivia-answer");
            const revealBtn = root.querySelector('[data-action="reveal-answer"]');
            const nextBtn = root.querySelector('[data-action="next-question"]');

            function renderCurrent() {
                const current = questions[index % questions.length];
                if (questionEl) questionEl.textContent = current.question || "";
                if (hintEl) hintEl.textContent = current.hint ? `Hint: ${current.hint}` : "";
                if (answerEl) {
                    answerEl.textContent = current.answer || "";
                    answerEl.hidden = true;
                }
            }

            if (revealBtn) {
                revealBtn.addEventListener("click", () => {
                    if (answerEl) answerEl.hidden = false;
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener("click", () => {
                    index = (index + 1) % questions.length;
                    renderCurrent();
                });
            }

            renderCurrent();
        });
    })();
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng_seed = seed if seed is not None else today.toordinal()
    rng = random.Random(rng_seed)

    history_title, history_body, history_source = _pick_history(today)
    background = _pick_background(today)

    cards: list[CardItem] = [
        CardItem(
            card_type="history",
            eyebrow="Irish History",
            title=history_title,
            body=_render_history_body(history_title, history_body),
            source_url=history_source,
        ),
        _render_trivia_card(today, rng),
        _render_davy_card(rng),
        _render_language_card(today, rng),
        _render_visual_card(background),
        _render_fact_card(rng),
        _render_sport_card(rng),
    ]

    county_card = _render_county_card(today)
    if county_card:
        cards.append(county_card)

    connection_card = _render_connection_card(rng)
    if connection_card:
        cards.append(connection_card)

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "background": background,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker"),
            "hero_summary_pill": THEME_CONFIG.get("hero_summary_pill"),
            "extra_css": _extra_css(),
            "extra_js": _extra_js(),
            "extra_head_html": _extra_head_html(),
        },
    )
