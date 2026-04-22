from __future__ import annotations

import json
import random
from datetime import date
from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "rlcs_daily"

THEME_CONFIG = {
    "page_title": "RLCS Daily — Hidden Pro, Boosted Atmosphere",
    "header_title": "RLCS Daily 🚗⚽",
    "header_subtitle": "A Rocket League Championship Series spin on the Daily Flyer formula",
    "footer_text": "Built on Daily Flyer. RLCS hidden-player starter theme.",
    "hero_kicker": "Daily Flyer • RLCS Theme",
    "hero_summary_pill": "Hidden pro puzzle, scene primers, and esports-style cards",
}


PLAYERS = [
    {
        "slug": "garrettg",
        "name": "GarrettG",
        "region": "North America",
        "country": "United States",
        "first_year": 2015,
        "status": "Active",
        "world_titles": 1,
        "signature_org": "NRG",
        "playstyle": "Field General",
        "hint": "NRG icon and one of NA's most recognizable long-term veterans.",
        "blurb": "A long-time NA cornerstone whose name is almost synonymous with the early RLCS era.",
    },
    {
        "slug": "jstn",
        "name": "jstn.",
        "region": "North America",
        "country": "United States",
        "first_year": 2017,
        "status": "Active",
        "world_titles": 1,
        "signature_org": "NRG",
        "playstyle": "Mechanical",
        "hint": "Known for one of the most replayed zero-second moments in RLCS history.",
        "blurb": "Explosive mechanics, huge goals, and one of the most famous moments the esport has produced.",
    },
    {
        "slug": "squishy",
        "name": "SquishyMuffinz",
        "region": "North America",
        "country": "Canada",
        "first_year": 2015,
        "status": "Retired",
        "world_titles": 1,
        "signature_org": "Cloud9",
        "playstyle": "Creative",
        "hint": "Cloud9 world champion and one of the biggest creator-pro crossover names in Rocket League.",
        "blurb": "A fan favorite whose style and content presence helped define Rocket League's public identity.",
    },
    {
        "slug": "daniel",
        "name": "Daniel",
        "region": "North America",
        "country": "United States",
        "first_year": 2021,
        "status": "Active",
        "world_titles": 0,
        "signature_org": "Spacestation",
        "playstyle": "Mechanical",
        "hint": "A modern-era NA prodigy often associated with highlight-reel car control.",
        "blurb": "A newer-generation superstar whose ceiling feels absurdly high any time he gets space.",
    },
    {
        "slug": "beastmode",
        "name": "BeastMode",
        "region": "North America",
        "country": "United States",
        "first_year": 2020,
        "status": "Active",
        "world_titles": 0,
        "signature_org": "Version1",
        "playstyle": "Striker",
        "hint": "A top NA attacker whose name sounds like a built-in game title.",
        "blurb": "Relentless pressure, speed, and scoring threat make him an easy pick for daily spotlight cards.",
    },
    {
        "slug": "atomic",
        "name": "Atomic",
        "region": "North America",
        "country": "United States",
        "first_year": 2017,
        "status": "Active",
        "world_titles": 0,
        "signature_org": "G2 Esports",
        "playstyle": "Balanced",
        "hint": "A polished NA all-rounder closely tied to G2's top-level era.",
        "blurb": "An adaptable modern pro whose game rarely looks rushed or out of control.",
    },
    {
        "slug": "turbo",
        "name": "Turbopolsa",
        "region": "Europe",
        "country": "Sweden",
        "first_year": 2015,
        "status": "Retired",
        "world_titles": 4,
        "signature_org": "Dignitas",
        "playstyle": "Clutch",
        "hint": "The four-time world champion benchmark.",
        "blurb": "One of the all-time standards for winning, legacy, and impossible big-match résumé lines.",
    },
    {
        "slug": "kaydop",
        "name": "Kaydop",
        "region": "Europe",
        "country": "France",
        "first_year": 2015,
        "status": "Active",
        "world_titles": 3,
        "signature_org": "Team Vitality",
        "playstyle": "Ice Cold",
        "hint": "French legend, stacked résumé, and one of the defining names of European RLCS.",
        "blurb": "A career built on consistency, titles, and always being in the conversation when history is discussed.",
    },
    {
        "slug": "fairypeak",
        "name": "Fairy Peak!",
        "region": "Europe",
        "country": "France",
        "first_year": 2015,
        "status": "Retired",
        "world_titles": 1,
        "signature_org": "Team Vitality",
        "playstyle": "Defensive",
        "hint": "Vitality legend with a reputation for discipline and control.",
        "blurb": "A calmer, colder style that still felt terrifying because mistakes around him rarely went unpunished.",
    },
    {
        "slug": "monkeymoon",
        "name": "M0nkey M00n",
        "region": "Europe",
        "country": "France",
        "first_year": 2020,
        "status": "Active",
        "world_titles": 2,
        "signature_org": "Team BDS",
        "playstyle": "Complete",
        "hint": "BDS centerpiece with a résumé that already feels historic.",
        "blurb": "A brutally complete player who seems to make the correct decision before everyone else sees it.",
    },
    {
        "slug": "zen",
        "name": "zen",
        "region": "Europe",
        "country": "France",
        "first_year": 2023,
        "status": "Active",
        "world_titles": 1,
        "signature_org": "Team Vitality",
        "playstyle": "Mechanical",
        "hint": "A modern French phenom whose arrival immediately changed the conversation.",
        "blurb": "The kind of player who makes even elite defenders look a step too slow.",
    },
    {
        "slug": "seikoo",
        "name": "Seikoo",
        "region": "Europe",
        "country": "France",
        "first_year": 2021,
        "status": "Active",
        "world_titles": 1,
        "signature_org": "Team BDS",
        "playstyle": "Striker",
        "hint": "French star with top-tier finishing and world-champion credentials.",
        "blurb": "A direct and punishing scorer who can turn a half-chance into a lost game state fast.",
    },
    {
        "slug": "rise",
        "name": "rise.",
        "region": "Europe",
        "country": "England",
        "first_year": 2021,
        "status": "Active",
        "world_titles": 0,
        "signature_org": "Moist Esports",
        "playstyle": "Disruptor",
        "hint": "English star whose signature teams always seem to stay loud and dangerous.",
        "blurb": "Energy, pressure, and opportunism make him feel like the human version of a speed-up button.",
    },
    {
        "slug": "jack",
        "name": "ApparentlyJack",
        "region": "Europe",
        "country": "England",
        "first_year": 2020,
        "status": "Active",
        "world_titles": 0,
        "signature_org": "Dignitas",
        "playstyle": "Playmaker",
        "hint": "English star with a strong creator voice and a very recognizable handle.",
        "blurb": "A high-IQ player who often looks like he is diagramming the field while everyone else is still rotating.",
    },
    {
        "slug": "ahmad",
        "name": "Ahmad",
        "region": "MENA",
        "country": "Saudi Arabia",
        "first_year": 2021,
        "status": "Active",
        "world_titles": 0,
        "signature_org": "Team Falcons",
        "playstyle": "Pressure",
        "hint": "Falcons star from the region that forced the scene to recalibrate expectations.",
        "blurb": "One of the core names behind MENA becoming impossible to treat as an afterthought.",
    },
    {
        "slug": "okhalid",
        "name": "oKhalid",
        "region": "MENA",
        "country": "Saudi Arabia",
        "first_year": 2021,
        "status": "Active",
        "world_titles": 0,
        "signature_org": "Team Falcons",
        "playstyle": "1v1 Legend",
        "hint": "A duel icon whose reputation crossed over into RLCS team play.",
        "blurb": "Even his label alone gives you a built-in story card: elite 1v1 credibility meeting the RLCS stage.",
    },
    {
        "slug": "yanxnz",
        "name": "yanxnz",
        "region": "South America",
        "country": "Brazil",
        "first_year": 2021,
        "status": "Active",
        "world_titles": 0,
        "signature_org": "FURIA",
        "playstyle": "Aggressive",
        "hint": "Brazilian star closely linked with FURIA's speed and swagger.",
        "blurb": "Pure forward momentum — the kind of player who makes every defensive touch feel temporary.",
    },
]


ROTATING_FACTS = [
    {
        "title": "Why this mechanic fits RLCS",
        "body": "Rocket League fans tend to remember players by <strong>region, era, org, and résumé</strong>. That makes a Driverle-style comparison card feel natural, because each guess carries multiple useful signals even before you hit the exact player.",
    },
    {
        "title": "Best first expansion",
        "body": "After the hidden-player card works, add a <strong>Today in RLCS</strong> card and a <strong>Stat Leader</strong> card. That gives the page one anchor game and two timely support cards without turning the theme into clutter.",
    },
    {
        "title": "Why org matters",
        "body": "In RLCS, org identity is part of how fans remember eras. A player's <strong>signature org</strong> is often a better game field than a strictly current team, because it stays recognizable even after roster moves.",
    },
    {
        "title": "Good difficulty ramp",
        "body": "Start with exact fields like <strong>region</strong> and <strong>country</strong>, then use numeric comparisons like <strong>first year</strong> and <strong>world titles</strong>. That keeps the puzzle accessible without flattening it into random guessing.",
    },
]

REGION_PRIMERS = [
    {
        "title": "Region Radar",
        "body": "<strong>North America</strong> is packed with long-running legacy names and newer mechanical stars. <strong>Europe</strong> brings deep title history, <strong>MENA</strong> changed how global ceiling discussions sound, and <strong>South America</strong> keeps producing explosive pressure-heavy teams.",
    },
    {
        "title": "Region Radar",
        "body": "<strong>EU</strong> guesses are often great for narrowing by country and titles. <strong>NA</strong> guesses are strong for legacy stars, while <strong>MENA</strong> and <strong>SAM</strong> help the board feel instantly broader than just old-school NA vs EU talk.",
    },
]

ROLE_PRIMERS = [
    {
        "title": "Playstyle Primer",
        "body": "<strong>Mechanical</strong> players win space with solo threat. <strong>Playmakers</strong> tilt the field with timing and passing, <strong>Disruptors</strong> make every possession ugly for the other team, and <strong>Field Generals</strong> keep the whole rotation coherent.",
    },
    {
        "title": "Playstyle Primer",
        "body": "These labels are intentionally broad. They are not meant to lock a player into one job forever — they give the hidden-player card a useful <strong>flavor clue</strong> without pretending RLCS roles are rigid like a hero shooter.",
    },
]


def _pick_daily(items: list[dict], today: date) -> dict:
    return items[today.toordinal() % len(items)]


def _starter_pool_html(players: list[dict]) -> str:
    chips = "".join(
        f"<span class='rlcs-chip'>{escape(player['name'])}</span>"
        for player in players
    )
    return (
        "<p>This first version ships with a <strong>starter pool</strong> of iconic RLCS names so you can test the mechanic immediately. "
        "Once you like the feel, you can widen the pool, add more regions, and make the comparison grid stricter.</p>"
        f"<div class='rlcs-chip-row'>{chips}</div>"
    )


def _guess_card_html(today: date, players: list[dict]) -> str:
    starter_names = ", ".join(player["name"] for player in players)
    return f"""
        <div class="rlcs-hero-shell">
            <div class="rlcs-hero-topline">
                <span class="rlcs-pill rlcs-pill--accent">Daily hidden player</span>
                <span class="rlcs-pill">Starter pool: {len(players)} pros</span>
                <span class="rlcs-pill">Persists on refresh</span>
            </div>
            <p class="rlcs-lede">
                Guess the hidden RLCS player. Each row compares your guess against today's answer across
                <strong>region</strong>, <strong>country</strong>, <strong>first RLCS year</strong>,
                <strong>status</strong>, <strong>world titles</strong>, <strong>signature org</strong>, and <strong>playstyle</strong>.
            </p>
            <div class="rlcs-controls">
                <div class="rlcs-input-wrap">
                    <label class="rlcs-label" for="rlcsGuessInput">Type a pro name</label>
                    <input id="rlcsGuessInput" class="rlcs-input" type="text" placeholder="Try GarrettG, zen, M0nkey M00n..." autocomplete="off">
                    <div id="rlcsSuggestionList" class="rlcs-suggestions" aria-live="polite"></div>
                </div>
                <div class="rlcs-button-stack">
                    <button id="rlcsGuessBtn" class="rlcs-btn rlcs-btn--primary" type="button">Submit guess</button>
                    <button id="rlcsHintBtn" class="rlcs-btn" type="button">Hint</button>
                    <button id="rlcsRevealBtn" class="rlcs-btn" type="button">Reveal</button>
                    <button id="rlcsResetBtn" class="rlcs-btn" type="button">Reset</button>
                </div>
            </div>

            <div class="rlcs-meta-row">
                <div id="rlcsStatus" class="rlcs-status">New board loaded for {escape(today.strftime('%B %d, %Y'))}.</div>
                <button id="rlcsShareBtn" class="rlcs-btn rlcs-btn--ghost" type="button">Copy result</button>
            </div>

            <div id="rlcsHintBox" class="rlcs-hintbox" hidden></div>

            <div class="rlcs-legend">
                <span class="rlcs-key rlcs-key--match">Exact match</span>
                <span class="rlcs-key rlcs-key--higher">Need higher</span>
                <span class="rlcs-key rlcs-key--lower">Need lower</span>
                <span class="rlcs-key rlcs-key--miss">No match</span>
            </div>

            <div class="rlcs-grid-wrap">
                <div class="rlcs-grid rlcs-grid--header">
                    <div>Guess</div>
                    <div>Region</div>
                    <div>Country</div>
                    <div>First Year</div>
                    <div>Status</div>
                    <div>World Titles</div>
                    <div>Org</div>
                    <div>Playstyle</div>
                </div>
                <div id="rlcsBoard" class="rlcs-board"></div>
            </div>

            <details class="rlcs-disclosure">
                <summary>Starter pool in this build</summary>
                <div class="rlcs-disclosure-copy">
                    <p>This card currently searches this starter list:</p>
                    <p>{escape(starter_names)}</p>
                    <p>The hidden answer for this date is selected from the same pool client-side, so the theme stays self-contained.</p>
                </div>
            </details>
        </div>
    """


def _daily_fact_card(today: date) -> CardItem:
    fact = _pick_daily(ROTATING_FACTS, today)
    return CardItem(
        card_type="rlcs_fact",
        eyebrow="Broadcast Desk",
        title=fact["title"],
        body=f"<p>{fact['body']}</p>",
        source_url=None,
    )


def _region_card(today: date) -> CardItem:
    item = _pick_daily(REGION_PRIMERS, today)
    return CardItem(
        card_type="rlcs_regions",
        eyebrow="Scene Primer",
        title=item["title"],
        body=f"<p>{item['body']}</p>",
        source_url=None,
    )


def _roles_card(today: date) -> CardItem:
    item = _pick_daily(ROLE_PRIMERS, today)
    return CardItem(
        card_type="rlcs_roles",
        eyebrow="How to Read the Board",
        title=item["title"],
        body=f"<p>{item['body']}</p>",
        source_url=None,
    )


def _pool_card(players: list[dict]) -> CardItem:
    return CardItem(
        card_type="rlcs_pool",
        eyebrow="Starter Pool",
        title="Iconic names first",
        body=_starter_pool_html(players),
        source_url=None,
    )


def _extra_head_html() -> str:
    return """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@600;700;800&display=swap" rel="stylesheet">
    """


def _extra_css() -> str:
    return r"""
    :root {
        --rlcs-orange: #ff9f43;
        --rlcs-blue: #49a9ff;
        --rlcs-cyan: #73e7ff;
        --rlcs-green: #67f0a3;
        --rlcs-red: #ff6d7c;
        --rlcs-panel: rgba(10, 17, 33, 0.86);
        --rlcs-panel-strong: rgba(9, 15, 28, 0.94);
    }

    body {
        background:
            radial-gradient(circle at 12% 12%, rgba(73, 169, 255, 0.20), transparent 24%),
            radial-gradient(circle at 88% 14%, rgba(255, 159, 67, 0.20), transparent 24%),
            radial-gradient(circle at 50% 100%, rgba(115, 231, 255, 0.12), transparent 30%),
            linear-gradient(180deg, #06101e 0%, #081425 42%, #050b15 100%);
    }

    body::before {
        width: 520px;
        height: 520px;
        top: -120px;
        left: -150px;
        background: radial-gradient(circle, rgba(73, 169, 255, 0.18), transparent 70%);
    }

    body::after {
        width: 420px;
        height: 420px;
        right: -120px;
        top: 140px;
        background: radial-gradient(circle, rgba(255, 159, 67, 0.16), transparent 70%);
    }

    header.hero {
        padding: 46px 30px 38px;
        border-radius: 34px;
        border-color: rgba(255,255,255,0.15);
        background:
            radial-gradient(circle at 14% 20%, rgba(73, 169, 255, 0.22), transparent 20%),
            radial-gradient(circle at 84% 22%, rgba(255, 159, 67, 0.18), transparent 22%),
            linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03)),
            linear-gradient(155deg, rgba(8, 17, 34, 0.96), rgba(9, 18, 30, 0.96));
        box-shadow:
            0 28px 80px rgba(0,0,0,0.34),
            inset 0 1px 0 rgba(255,255,255,0.08);
    }

    header.hero::before {
        background:
            linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent),
            radial-gradient(circle at 14% 18%, rgba(73, 169, 255, 0.18), transparent 18%),
            radial-gradient(circle at 90% 22%, rgba(255, 159, 67, 0.16), transparent 20%);
    }

    .hero-kicker {
        background: rgba(255,255,255,0.09);
        border-color: rgba(255,255,255,0.13);
        color: #d8ebff;
    }

    .hero h1,
    h2 {
        font-family: "Orbitron", "Inter", sans-serif;
        letter-spacing: -0.03em;
    }

    .hero h1 {
        max-width: none;
        font-size: clamp(2.5rem, 6vw, 5rem);
        text-shadow: 0 10px 28px rgba(0,0,0,0.28);
    }

    .hero .subtitle {
        max-width: 62ch;
        color: #d5e5f8;
    }

    .hero-pill {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.10);
    }

    .eyebrow {
        color: #b5d6ff;
    }

    .icon-badge {
        background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06));
        border-color: rgba(255,255,255,0.12);
        box-shadow: 0 12px 24px rgba(0,0,0,0.16);
    }

    .card {
        min-height: 220px;
        border-color: rgba(255,255,255,0.10);
        background:
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03)),
            rgba(10, 17, 33, 0.82);
        box-shadow:
            0 18px 44px rgba(0,0,0,0.24),
            inset 0 1px 0 rgba(255,255,255,0.05);
    }

    .card::after {
        height: 5px;
        background: linear-gradient(90deg, var(--rlcs-blue), var(--rlcs-cyan), var(--rlcs-orange));
    }

    .card--rlcs_guess {
        grid-column: span 8;
        background:
            radial-gradient(circle at top left, rgba(73, 169, 255, 0.18), transparent 26%),
            linear-gradient(180deg, rgba(115, 231, 255, 0.08), rgba(255,255,255,0.02)),
            var(--rlcs-panel-strong);
    }

    .card--rlcs_fact,
    .card--rlcs_regions,
    .card--rlcs_roles,
    .card--rlcs_pool {
        grid-column: span 4;
    }

    .card--rlcs_fact {
        background:
            linear-gradient(180deg, rgba(255, 159, 67, 0.14), rgba(255,255,255,0.03)),
            rgba(31, 20, 18, 0.88);
    }

    .card--rlcs_regions {
        background:
            linear-gradient(180deg, rgba(103, 240, 163, 0.14), rgba(255,255,255,0.03)),
            rgba(13, 31, 26, 0.88);
    }

    .card--rlcs_roles {
        background:
            linear-gradient(180deg, rgba(73, 169, 255, 0.14), rgba(255,255,255,0.03)),
            rgba(13, 23, 37, 0.90);
    }

    .card--rlcs_pool {
        background:
            linear-gradient(180deg, rgba(162, 142, 255, 0.14), rgba(255,255,255,0.03)),
            rgba(22, 19, 39, 0.90);
    }

    .rlcs-hero-shell,
    .rlcs-board,
    .rlcs-chip-row,
    .rlcs-disclosure-copy,
    .rlcs-hintbox {
        display: grid;
        gap: 0.95rem;
    }

    .rlcs-hero-topline,
    .rlcs-controls,
    .rlcs-button-stack,
    .rlcs-meta-row,
    .rlcs-legend,
    .rlcs-chip-row {
        display: flex;
        gap: 0.7rem;
        flex-wrap: wrap;
    }

    .rlcs-pill,
    .rlcs-chip,
    .rlcs-key {
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
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    }

    .rlcs-pill--accent {
        background: rgba(255, 159, 67, 0.18);
        border-color: rgba(255, 159, 67, 0.28);
        color: #ffe1bf;
    }

    .rlcs-lede {
        margin: 0;
        color: var(--ink-soft);
        line-height: 1.7;
    }

    .rlcs-input-wrap {
        flex: 1 1 360px;
        min-width: min(100%, 300px);
        display: grid;
        gap: 0.45rem;
    }

    .rlcs-label {
        color: #cde0fb;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .rlcs-input {
        width: 100%;
        padding: 0.9rem 1rem;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: var(--ink);
        font: inherit;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .rlcs-input:focus {
        outline: 2px solid rgba(73, 169, 255, 0.40);
        border-color: rgba(73, 169, 255, 0.52);
    }

    .rlcs-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        min-height: 2rem;
    }

    .rlcs-suggestion {
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        color: var(--ink);
        border-radius: 999px;
        padding: 0.45rem 0.7rem;
        cursor: pointer;
        font: inherit;
    }

    .rlcs-suggestion:hover {
        background: rgba(255,255,255,0.10);
    }

    .rlcs-button-stack {
        align-items: flex-end;
    }

    .rlcs-btn {
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.08);
        color: var(--ink);
        border-radius: 14px;
        cursor: pointer;
        text-decoration: none;
        font: inherit;
        font-weight: 700;
        padding: 0.78rem 1rem;
        transition: background 160ms ease, transform 160ms ease, border-color 160ms ease;
    }

    .rlcs-btn:hover {
        background: rgba(255,255,255,0.12);
        border-color: rgba(255,255,255,0.18);
        transform: translateY(-1px);
    }

    .rlcs-btn--primary {
        background: linear-gradient(180deg, rgba(73, 169, 255, 0.30), rgba(73, 169, 255, 0.14));
        border-color: rgba(73, 169, 255, 0.36);
    }

    .rlcs-btn--ghost {
        margin-left: auto;
    }

    .rlcs-status {
        color: #d9e7fb;
        min-height: 1.5rem;
    }

    .rlcs-hintbox {
        padding: 0.9rem 1rem;
        border-radius: 16px;
        background: rgba(255, 159, 67, 0.12);
        border: 1px solid rgba(255, 159, 67, 0.22);
        color: #ffe4c5;
    }

    .rlcs-grid-wrap {
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
    }

    .rlcs-grid {
        display: grid;
        grid-template-columns: minmax(140px, 1.4fr) repeat(7, minmax(90px, 1fr));
        gap: 0;
    }

    .rlcs-grid--header {
        background: rgba(255,255,255,0.06);
        color: #cfe1fb;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 800;
    }

    .rlcs-grid--header > div,
    .rlcs-row > div {
        padding: 0.75rem 0.7rem;
        border-right: 1px solid rgba(255,255,255,0.06);
        border-bottom: 1px solid rgba(255,255,255,0.06);
        min-height: 58px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
    }

    .rlcs-grid--header > div:first-child,
    .rlcs-row > div:first-child {
        justify-content: flex-start;
        text-align: left;
    }

    .rlcs-row:last-child > div {
        border-bottom: 0;
    }

    .rlcs-cell--guess {
        font-weight: 800;
        color: var(--ink);
    }

    .rlcs-cell {
        background: rgba(255,255,255,0.03);
        color: #dce9fb;
    }

    .rlcs-cell--match {
        background: rgba(103, 240, 163, 0.18);
        color: #eafff2;
    }

    .rlcs-cell--higher {
        background: rgba(73, 169, 255, 0.18);
        color: #e8f4ff;
    }

    .rlcs-cell--lower {
        background: rgba(255, 159, 67, 0.18);
        color: #fff0df;
    }

    .rlcs-cell--miss {
        background: rgba(255, 109, 124, 0.14);
        color: #ffe4e7;
    }

    .rlcs-arrow {
        opacity: 0.8;
        margin-left: 0.35rem;
        font-weight: 900;
    }

    .rlcs-key--match { background: rgba(103, 240, 163, 0.18); }
    .rlcs-key--higher { background: rgba(73, 169, 255, 0.18); }
    .rlcs-key--lower { background: rgba(255, 159, 67, 0.18); }
    .rlcs-key--miss { background: rgba(255, 109, 124, 0.14); }

    .rlcs-disclosure {
        border-top: 1px solid rgba(255,255,255,0.08);
        padding-top: 0.9rem;
    }

    .rlcs-disclosure summary {
        cursor: pointer;
        color: #d7e8ff;
        font-weight: 700;
    }

    .rlcs-disclosure-copy {
        margin-top: 0.8rem;
        color: var(--ink-soft);
    }

    .rlcs-chip-row {
        gap: 0.55rem;
    }

    .rlcs-chip {
        background: rgba(255,255,255,0.07);
        color: #d7e7ff;
    }

    @media (max-width: 1080px) {
        .card--rlcs_guess,
        .card--rlcs_fact,
        .card--rlcs_regions,
        .card--rlcs_roles,
        .card--rlcs_pool {
            grid-column: span 6;
        }
    }

    @media (max-width: 820px) {
        .rlcs-grid {
            min-width: 900px;
        }

        .rlcs-grid-wrap {
            overflow-x: auto;
        }
    }

    @media (max-width: 720px) {
        .card--rlcs_guess,
        .card--rlcs_fact,
        .card--rlcs_regions,
        .card--rlcs_roles,
        .card--rlcs_pool {
            grid-column: auto;
        }

        header.hero {
            padding: 38px 22px 30px;
            border-radius: 26px;
        }

        .rlcs-btn--ghost {
            margin-left: 0;
        }
    }
    """


def _extra_js(today: date, answer: dict, players: list[dict]) -> str:
    js = """
    const RLCS_PLAYERS = __PLAYERS__;
    const RLCS_ANSWER_SLUG = __ANSWER_SLUG__;
    const RLCS_DATE_KEY = __DATE_KEY__;
    const RLCS_STORAGE_KEY = `daily_flyer_rlcs_daily_${RLCS_DATE_KEY}`;

    const rlcsBySlug = Object.fromEntries(RLCS_PLAYERS.map((player) => [player.slug, player]));
    const rlcsByName = Object.fromEntries(RLCS_PLAYERS.map((player) => [player.name.toLowerCase(), player]));
    let rlcsState = loadState();

    function defaultState() {
        return { guesses: [], revealed: false, hintsUsed: 0 };
    }

    function loadState() {
        try {
            const raw = window.localStorage.getItem(RLCS_STORAGE_KEY);
            if (!raw) return defaultState();
            const parsed = JSON.parse(raw);
            return {
                guesses: Array.isArray(parsed.guesses) ? parsed.guesses.filter((slug) => rlcsBySlug[slug]) : [],
                revealed: Boolean(parsed.revealed),
                hintsUsed: Number.isInteger(parsed.hintsUsed) ? parsed.hintsUsed : 0,
            };
        } catch (err) {
            return defaultState();
        }
    }

    function saveState() {
        try {
            window.localStorage.setItem(RLCS_STORAGE_KEY, JSON.stringify(rlcsState));
        } catch (err) {}
    }

    function answerPlayer() {
        return rlcsBySlug[RLCS_ANSWER_SLUG];
    }

    function normalizeName(value) {
        return String(value || "").trim().toLowerCase();
    }

    function findPlayer(value) {
        const exact = rlcsByName[normalizeName(value)];
        if (exact) return exact;
        return RLCS_PLAYERS.find((player) => player.name.toLowerCase() === normalizeName(value)) || null;
    }

    function setStatus(text) {
        const el = document.getElementById("rlcsStatus");
        if (el) el.textContent = text;
    }

    function setHint(text) {
        const box = document.getElementById("rlcsHintBox");
        if (!box) return;
        if (!text) {
            box.hidden = true;
            box.innerHTML = "";
            return;
        }
        box.hidden = false;
        box.innerHTML = text;
    }

    function compareExact(guess, answer, field) {
        const match = guess[field] === answer[field];
        return {
            className: match ? "match" : "miss",
            text: String(guess[field]),
        };
    }

    function compareNumeric(guess, answer, field) {
        if (guess[field] === answer[field]) {
            return { className: "match", text: String(guess[field]), arrow: "" };
        }
        if (guess[field] < answer[field]) {
            return { className: "higher", text: String(guess[field]), arrow: "↑" };
        }
        return { className: "lower", text: String(guess[field]), arrow: "↓" };
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function cellHtml(text, className, arrow="") {
        const safeText = escapeHtml(String(text));
        const arrowHtml = arrow ? `<span class="rlcs-arrow">${escapeHtml(arrow)}</span>` : "";
        return `<div class="rlcs-cell rlcs-cell--${className}">${safeText}${arrowHtml}</div>`;
    }

    function buildRowHtml(guess) {
        const answer = answerPlayer();
        const region = compareExact(guess, answer, "region");
        const country = compareExact(guess, answer, "country");
        const firstYear = compareNumeric(guess, answer, "first_year");
        const status = compareExact(guess, answer, "status");
        const titles = compareNumeric(guess, answer, "world_titles");
        const org = compareExact(guess, answer, "signature_org");
        const playstyle = compareExact(guess, answer, "playstyle");

        return `
            <div class="rlcs-grid rlcs-row">
                <div class="rlcs-cell rlcs-cell--guess">${escapeHtml(guess.name)}</div>
                ${cellHtml(region.text, region.className)}
                ${cellHtml(country.text, country.className)}
                ${cellHtml(firstYear.text, firstYear.className, firstYear.arrow)}
                ${cellHtml(status.text, status.className)}
                ${cellHtml(titles.text, titles.className, titles.arrow)}
                ${cellHtml(org.text, org.className)}
                ${cellHtml(playstyle.text, playstyle.className)}
            </div>
        `;
    }

    function solved() {
        return rlcsState.guesses.includes(RLCS_ANSWER_SLUG);
    }

    function renderBoard() {
        const board = document.getElementById("rlcsBoard");
        if (!board) return;
        if (!rlcsState.guesses.length) {
            board.innerHTML = `<div class="rlcs-grid rlcs-row">
                <div class="rlcs-cell rlcs-cell--guess">No guesses yet</div>
                <div class="rlcs-cell rlcs-cell--miss">—</div>
                <div class="rlcs-cell rlcs-cell--miss">—</div>
                <div class="rlcs-cell rlcs-cell--miss">—</div>
                <div class="rlcs-cell rlcs-cell--miss">—</div>
                <div class="rlcs-cell rlcs-cell--miss">—</div>
                <div class="rlcs-cell rlcs-cell--miss">—</div>
                <div class="rlcs-cell rlcs-cell--miss">—</div>
            </div>`;
            return;
        }
        board.innerHTML = rlcsState.guesses
            .map((slug) => rlcsBySlug[slug])
            .filter(Boolean)
            .map((player) => buildRowHtml(player))
            .join("");
    }

    function renderHints() {
        const answer = answerPlayer();
        if (rlcsState.revealed) {
            setHint(`<strong>Revealed:</strong> ${escapeHtml(answer.name)}<br>${escapeHtml(answer.blurb)}`);
            return;
        }
        if (solved()) {
            setHint(`<strong>Solved:</strong> ${escapeHtml(answer.name)}<br>${escapeHtml(answer.blurb)}`);
            return;
        }
        if (rlcsState.hintsUsed <= 0) {
            setHint("");
            return;
        }
        const parts = [];
        if (rlcsState.hintsUsed >= 1) {
            parts.push(`<strong>Hint 1:</strong> ${escapeHtml(answer.hint)}`);
        }
        if (rlcsState.hintsUsed >= 2) {
            parts.push(`<strong>Hint 2:</strong> Signature org: ${escapeHtml(answer.signature_org)}`);
        }
        if (rlcsState.hintsUsed >= 3) {
            parts.push(`<strong>Hint 3:</strong> First RLCS year: ${escapeHtml(answer.first_year)}`);
        }
        setHint(parts.join("<br>"));
    }

    function updateStatusFromState() {
        const answer = answerPlayer();
        if (rlcsState.revealed) {
            setStatus(`Answer revealed: ${answer.name}.`);
            return;
        }
        if (solved()) {
            setStatus(`Correct — today's hidden player is ${answer.name}. Nicely done.`);
            return;
        }
        if (rlcsState.guesses.length) {
            setStatus(`${rlcsState.guesses.length} guess${rlcsState.guesses.length === 1 ? "" : "es"} logged for today.`);
        } else {
            setStatus(`New board loaded for ${RLCS_DATE_KEY}.`);
        }
    }

    function submitGuess(nameValue) {
        const input = document.getElementById("rlcsGuessInput");
        const candidate = findPlayer(nameValue ?? (input ? input.value : ""));
        if (!candidate) {
            setStatus("That name is not in this starter pool yet.");
            return;
        }
        if (rlcsState.revealed) {
            setStatus("This board has been revealed. Reset to play it again.");
            return;
        }
        if (solved()) {
            setStatus("Already solved. Reset if you want to replay this date.");
            return;
        }
        if (rlcsState.guesses.includes(candidate.slug)) {
            setStatus(`${candidate.name} was already guessed.`);
            return;
        }
        rlcsState.guesses.push(candidate.slug);
        saveState();
        if (input) input.value = "";
        renderSuggestions("");
        renderBoard();
        renderHints();
        updateStatusFromState();
    }

    function renderSuggestions(query) {
        const wrap = document.getElementById("rlcsSuggestionList");
        if (!wrap) return;
        const needle = normalizeName(query);
        const pool = needle
            ? RLCS_PLAYERS.filter((player) => player.name.toLowerCase().includes(needle))
            : RLCS_PLAYERS.slice(0, 8);
        wrap.innerHTML = pool
            .slice(0, 8)
            .map((player) => `<button class="rlcs-suggestion" type="button" data-name="${escapeHtml(player.name)}">${escapeHtml(player.name)}</button>`)
            .join("");
        wrap.querySelectorAll("[data-name]").forEach((button) => {
            button.addEventListener("click", () => {
                const value = button.getAttribute("data-name") || "";
                const input = document.getElementById("rlcsGuessInput");
                if (input) input.value = value;
            });
        });
    }

    async function copyResult() {
        const answer = answerPlayer();
        const lines = rlcsState.guesses.map((slug) => slug === RLCS_ANSWER_SLUG ? "🟩" : "🟦");
        const summary = solved()
            ? `RLCS Daily ${RLCS_DATE_KEY}\n${lines.join("")}\nSolved in ${rlcsState.guesses.length}`
            : rlcsState.revealed
                ? `RLCS Daily ${RLCS_DATE_KEY}\n${lines.join("")}\nRevealed: ${answer.name}`
                : `RLCS Daily ${RLCS_DATE_KEY}\n${lines.join("") || "⬛"}\nIn progress`;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(summary);
                setStatus("Result copied to clipboard.");
                return;
            }
        } catch (err) {}
        setStatus("Clipboard copy was blocked in this browser.");
    }

    (function () {
        const input = document.getElementById("rlcsGuessInput");
        const guessBtn = document.getElementById("rlcsGuessBtn");
        const hintBtn = document.getElementById("rlcsHintBtn");
        const revealBtn = document.getElementById("rlcsRevealBtn");
        const resetBtn = document.getElementById("rlcsResetBtn");
        const shareBtn = document.getElementById("rlcsShareBtn");

        renderBoard();
        renderHints();
        updateStatusFromState();
        renderSuggestions("");

        if (input) {
            input.addEventListener("input", () => renderSuggestions(input.value));
            input.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submitGuess();
                }
            });
        }

        if (guessBtn) guessBtn.addEventListener("click", () => submitGuess());
        if (hintBtn) hintBtn.addEventListener("click", () => {
            if (rlcsState.revealed || solved()) {
                renderHints();
                updateStatusFromState();
                return;
            }
            rlcsState.hintsUsed = Math.min(3, rlcsState.hintsUsed + 1);
            saveState();
            renderHints();
            setStatus(`Hint ${rlcsState.hintsUsed} unlocked.`);
        });
        if (revealBtn) revealBtn.addEventListener("click", () => {
            rlcsState.revealed = true;
            saveState();
            renderHints();
            updateStatusFromState();
        });
        if (resetBtn) resetBtn.addEventListener("click", () => {
            rlcsState = defaultState();
            saveState();
            renderBoard();
            renderHints();
            updateStatusFromState();
            if (input) {
                input.value = "";
                input.focus();
            }
            renderSuggestions("");
        });
        if (shareBtn) shareBtn.addEventListener("click", copyResult);
    })();
    """
    return (
        js.replace("__PLAYERS__", json.dumps(players, ensure_ascii=False))
          .replace("__ANSWER_SLUG__", json.dumps(answer["slug"], ensure_ascii=False))
          .replace("__DATE_KEY__", json.dumps(today.isoformat(), ensure_ascii=False))
    )


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng_seed = seed if seed is not None else today.toordinal()
    rng = random.Random(rng_seed)

    players = list(PLAYERS)
    answer = players[rng_seed % len(players)]

    support_cards = [
        _daily_fact_card(today),
        _region_card(today),
        _roles_card(today),
        _pool_card(players),
    ]
    rng.shuffle(support_cards)

    cards = [
        CardItem(
            card_type="rlcs_guess",
            eyebrow="Featured Card",
            title="Who’s That Pro?",
            body=_guess_card_html(today, players),
            source_url=None,
        ),
        *support_cards,
    ]

    return PageContext(
        page_title=f"RLCS Daily — {today.strftime('%B %d, %Y')}",
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=(
            "A Rocket League-style Daily Flyer theme with a hidden-player card, scene primers, "
            "and a stronger esports-broadcast visual identity."
        ),
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=(
            f"{THEME_CONFIG['footer_text']} "
            f"Starter pool: {len(players)} players. "
            "All game logic is self-contained in the theme via extra CSS and JS."
        ),
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "background": None,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG.get("hero_kicker", "Daily Flyer • Theme"),
            "hero_summary_pill": "Daily hidden pro • persistent guesses • starter RLCS pool",
            "extra_css": _extra_css(),
            "extra_js": _extra_js(today, answer, players),
            "extra_head_html": _extra_head_html(),
        },
    )
