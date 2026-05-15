from __future__ import annotations

import json
import random
from datetime import date
from html import escape
from math import comb
from typing import Any

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "commander_readiness"
DECK_SIZE = 99

THEME_CONFIG = {
    "page_title": "Commander Opening Plan — Daily Flyer",
    "header_title": "Commander Opening Plan",
    "header_subtitle": "A visual early-game readiness check for a 99-card Commander deck: lands, creatures, auras, and interaction by turns 5–6.",
    "footer_text": "Built on Daily Flyer. Commander readiness prototype.",
    "hero_kicker": "Daily Flyer • Magic Commander Theme",
    "hero_summary_pill": "99-card deck audit · turn 5–6 plan · visual probability check",
}

DEFAULT_DECK = {
    "lands": 37,
    "creatures": 18,
    "auras": 22,
    "interaction": 10,
}

DEFAULT_GOAL = {
    "cards_seen": 12,
    "lands_min": 3,
    "lands_max": 4,
    "creatures_min": 1,
    "auras_min": 3,
    "interaction_min": 1,
}

CARD_TYPES = (
    ("lands", "Land", "🟫"),
    ("creatures", "Creature", "🧍"),
    ("auras", "Aura", "🟣"),
    ("interaction", "Interaction", "⚡"),
    ("other", "Other", "◇"),
)


def _deck_with_other(deck: dict[str, int]) -> dict[str, int]:
    clean = {
        "lands": max(0, int(deck.get("lands", 0))),
        "creatures": max(0, int(deck.get("creatures", 0))),
        "auras": max(0, int(deck.get("auras", 0))),
        "interaction": max(0, int(deck.get("interaction", 0))),
    }
    clean["other"] = max(0, DECK_SIZE - sum(clean.values()))
    return clean


def _goal_from_defaults() -> dict[str, int]:
    return {key: int(value) for key, value in DEFAULT_GOAL.items()}


def _safe_comb(n: int, k: int) -> int:
    if k < 0 or k > n:
        return 0
    return comb(n, k)


def _single_category_probability(
    total_good: int,
    sample_size: int,
    minimum: int,
    maximum: int | None = None,
) -> float:
    if sample_size < 0 or sample_size > DECK_SIZE:
        return 0.0

    max_hits = min(total_good, sample_size)
    if maximum is not None:
        max_hits = min(max_hits, maximum)

    denominator = _safe_comb(DECK_SIZE, sample_size)
    if denominator <= 0:
        return 0.0

    numerator = 0
    for hits in range(max(0, minimum), max_hits + 1):
        misses = sample_size - hits
        if 0 <= misses <= DECK_SIZE - total_good:
            numerator += _safe_comb(total_good, hits) * _safe_comb(DECK_SIZE - total_good, misses)

    return numerator / denominator


def _opening_plan_probability(deck: dict[str, int], goal: dict[str, int]) -> float:
    sample_size = int(goal["cards_seen"])
    if sample_size < 0 or sample_size > DECK_SIZE:
        return 0.0

    if sum(deck.values()) != DECK_SIZE:
        return 0.0

    denominator = _safe_comb(DECK_SIZE, sample_size)
    if denominator <= 0:
        return 0.0

    lands_min = int(goal["lands_min"])
    lands_max = int(goal["lands_max"])
    creatures_min = int(goal["creatures_min"])
    auras_min = int(goal["auras_min"])
    interaction_min = int(goal["interaction_min"])

    numerator = 0
    for lands in range(lands_min, min(lands_max, deck["lands"], sample_size) + 1):
        remaining_after_lands = sample_size - lands
        for creatures in range(creatures_min, min(deck["creatures"], remaining_after_lands) + 1):
            remaining_after_creatures = remaining_after_lands - creatures
            for auras in range(auras_min, min(deck["auras"], remaining_after_creatures) + 1):
                remaining_after_auras = remaining_after_creatures - auras
                for interaction in range(
                    interaction_min,
                    min(deck["interaction"], remaining_after_auras) + 1,
                ):
                    other = remaining_after_auras - interaction
                    if 0 <= other <= deck["other"]:
                        numerator += (
                            _safe_comb(deck["lands"], lands)
                            * _safe_comb(deck["creatures"], creatures)
                            * _safe_comb(deck["auras"], auras)
                            * _safe_comb(deck["interaction"], interaction)
                            * _safe_comb(deck["other"], other)
                        )

    return numerator / denominator


def _format_pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def _score_label(probability: float) -> str:
    if probability >= 0.70:
        return "Strong"
    if probability >= 0.50:
        return "Playable"
    if probability >= 0.30:
        return "Stretch"
    return "Long shot"


def _checkbox_probabilities(deck: dict[str, int], goal: dict[str, int]) -> dict[str, float]:
    sample_size = int(goal["cards_seen"])
    return {
        "lands": _single_category_probability(deck["lands"], sample_size, goal["lands_min"], goal["lands_max"]),
        "creatures": _single_category_probability(deck["creatures"], sample_size, goal["creatures_min"]),
        "auras": _single_category_probability(deck["auras"], sample_size, goal["auras_min"]),
        "interaction": _single_category_probability(deck["interaction"], sample_size, goal["interaction_min"]),
    }


def _probabilities_by_turn(deck: dict[str, int], goal: dict[str, int]) -> list[dict[str, Any]]:
    rows = []
    for seen in (10, 11, 12, 13):
        adjusted = dict(goal)
        adjusted["cards_seen"] = seen
        probability = _opening_plan_probability(deck, adjusted)
        rows.append(
            {
                "cards_seen": seen,
                "label": _cards_seen_label(seen),
                "probability": probability,
                "percent": _format_pct(probability),
            }
        )
    return rows


def _cards_seen_label(cards_seen: int) -> str:
    labels = {
        10: "Opening 7 + first 3 draws",
        11: "Opening 7 + first 4 draws",
        12: "Opening 7 + first 5 draws",
        13: "Opening 7 + first 6 draws",
    }
    return labels.get(cards_seen, f"{cards_seen} cards seen")


def _hand_passes(counts: dict[str, int], goal: dict[str, int]) -> bool:
    return (
        goal["lands_min"] <= counts["lands"] <= goal["lands_max"]
        and counts["creatures"] >= goal["creatures_min"]
        and counts["auras"] >= goal["auras_min"]
        and counts["interaction"] >= goal["interaction_min"]
    )


def _sample_hand(deck: dict[str, int], goal: dict[str, int], rng: random.Random) -> dict[str, Any]:
    pool: list[str] = []
    for card_type, _, _ in CARD_TYPES:
        pool.extend([card_type] * deck[card_type])

    sample_size = min(goal["cards_seen"], len(pool))
    drawn = rng.sample(pool, sample_size)
    counts = {card_type: drawn.count(card_type) for card_type, _, _ in CARD_TYPES}

    return {
        "drawn": drawn,
        "counts": counts,
        "passes": _hand_passes(counts, goal),
    }


def _sample_hands(deck: dict[str, int], goal: dict[str, int], seed: int) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    return [_sample_hand(deck, goal, rng) for _ in range(6)]


def _token_row_html(hand: dict[str, Any]) -> str:
    emoji_by_type = {card_type: emoji for card_type, _, emoji in CARD_TYPES}
    tokens = "".join(
        f"<span class='commander-token commander-token--{escape(card_type)}'>{emoji_by_type[card_type]}</span>"
        for card_type in hand["drawn"]
    )
    counts = hand["counts"]
    verdict = "PASS" if hand["passes"] else "MISS"
    verdict_class = "pass" if hand["passes"] else "miss"
    return f"""
        <article class="sample-hand sample-hand--{verdict_class}">
            <div class="sample-hand-top">
                <strong>{verdict}</strong>
                <span>{counts['lands']} land · {counts['creatures']} creature · {counts['auras']} aura · {counts['interaction']} interaction</span>
            </div>
            <div class="commander-token-row">{tokens}</div>
        </article>
    """


def _deck_recipe_html(deck: dict[str, int]) -> str:
    total_core = deck["lands"] + deck["creatures"] + deck["auras"] + deck["interaction"]
    warning = ""
    if total_core > DECK_SIZE:
        warning = "<p class='commander-warning'>The visible categories add up to more than 99. Lower one category before trusting the result.</p>"

    rows = [
        ("lands", "Lands", deck["lands"], "Mana base / early land drops"),
        ("creatures", "Creatures", deck["creatures"], "Bodies that can carry auras"),
        ("auras", "Auras", deck["auras"], "The engine this deck wants to see"),
        ("interaction", "Interaction", deck["interaction"], "Instants, sorceries, protection, removal"),
    ]

    controls = "".join(
        f"""
        <label class="commander-input-row">
            <span>
                <strong>{escape(label)}</strong>
                <small>{escape(help_text)}</small>
            </span>
            <input id="deck-{escape(key)}" type="number" min="0" max="99" value="{value}" inputmode="numeric">
        </label>
        """
        for key, label, value, help_text in rows
    )

    return f"""
        <div class="commander-panel">
            <p class="commander-lede">Classify the 99-card deck into the buckets that matter for the first 5–6 turns. The commander is treated as always available.</p>
            <div class="commander-controls">{controls}</div>
            <div class="commander-derived">
                <span>Commander: <strong>always available</strong></span>
                <span>Other / ramp / utility: <strong id="deck-other">{deck['other']}</strong></span>
                <span>Total: <strong id="deck-total">{DECK_SIZE}</strong></span>
            </div>
            {warning}
        </div>
    """


def _turn_goal_html(goal: dict[str, int], checks: dict[str, float]) -> str:
    return f"""
        <div class="commander-panel">
            <p class="commander-lede">The target board-state checklist can be tuned without changing the deck recipe.</p>
            <div class="goal-grid">
                <label class="commander-input-row">
                    <span><strong>Cards seen</strong><small>{escape(_cards_seen_label(goal['cards_seen']))}</small></span>
                    <input id="goal-cards-seen" type="number" min="7" max="20" value="{goal['cards_seen']}" inputmode="numeric">
                </label>
                <label class="commander-input-row">
                    <span><strong>Lands min</strong><small>Usually 3 by turn 5</small></span>
                    <input id="goal-lands-min" type="number" min="0" max="10" value="{goal['lands_min']}" inputmode="numeric">
                </label>
                <label class="commander-input-row">
                    <span><strong>Lands max</strong><small>Use 99 for “at least”</small></span>
                    <input id="goal-lands-max" type="number" min="0" max="99" value="{goal['lands_max']}" inputmode="numeric">
                </label>
                <label class="commander-input-row">
                    <span><strong>Creatures min</strong><small>At least one aura carrier</small></span>
                    <input id="goal-creatures-min" type="number" min="0" max="20" value="{goal['creatures_min']}" inputmode="numeric">
                </label>
                <label class="commander-input-row">
                    <span><strong>Auras min</strong><small>The demanding part</small></span>
                    <input id="goal-auras-min" type="number" min="0" max="20" value="{goal['auras_min']}" inputmode="numeric">
                </label>
                <label class="commander-input-row">
                    <span><strong>Interaction min</strong><small>Protection, removal, answers</small></span>
                    <input id="goal-interaction-min" type="number" min="0" max="20" value="{goal['interaction_min']}" inputmode="numeric">
                </label>
            </div>
            <div id="goal-checklist" class="goal-checklist">
                {_goal_checklist_html(checks)}
            </div>
        </div>
    """


def _goal_checklist_html(checks: dict[str, float]) -> str:
    labels = {
        "lands": "3–4 lands",
        "creatures": "1+ creature",
        "auras": "3+ auras",
        "interaction": "1+ interaction",
    }
    return "".join(
        f"""
        <div class="goal-check">
            <span>{escape(labels[key])}</span>
            <strong>{_format_pct(value)}</strong>
        </div>
        """
        for key, value in checks.items()
    )


def _probability_meter_html(probability: float, rows: list[dict[str, Any]]) -> str:
    row_html = "".join(
        f"""
        <div class="prob-row">
            <div>
                <strong>{escape(str(row['cards_seen']))} cards</strong>
                <small>{escape(row['label'])}</small>
            </div>
            <div class="prob-bar" aria-label="{escape(row['percent'])}">
                <span style="width: {max(2, min(100, row['probability'] * 100)):.1f}%"></span>
            </div>
            <strong>{escape(row['percent'])}</strong>
        </div>
        """
        for row in rows
    )
    return f"""
        <div class="commander-panel">
            <div class="confidence-hero">
                <span class="confidence-number" id="opening-probability">{_format_pct(probability)}</span>
                <span class="confidence-label" id="opening-label">{escape(_score_label(probability))}</span>
            </div>
            <p class="commander-lede">This is the chance that all checklist boxes are true in the same early-game window, not just one category at a time.</p>
            <div id="probability-rows">{row_html}</div>
        </div>
    """


def _sample_hands_html(hands: list[dict[str, Any]]) -> str:
    return f"""
        <div class="commander-panel">
            <p class="commander-lede">Sample hands translate the math into something closer to goldfishing. Each row shows the first target-window cards seen.</p>
            <div class="token-legend">
                <span>🟫 Land</span>
                <span>🧍 Creature</span>
                <span>🟣 Aura</span>
                <span>⚡ Interaction</span>
                <span>◇ Other</span>
            </div>
            <div id="sample-hands" class="sample-hand-list">
                {''.join(_token_row_html(hand) for hand in hands)}
            </div>
            <button class="commander-btn" type="button" id="sample-reroll">Reroll sample hands</button>
        </div>
    """


def _tuning_advice_html(deck: dict[str, int], goal: dict[str, int], probability: float, checks: dict[str, float]) -> str:
    lowest_key = min(checks, key=checks.get)
    labels = {
        "lands": "land window",
        "creatures": "creature density",
        "auras": "aura density",
        "interaction": "interaction density",
    }

    if lowest_key == "auras":
        suggestion = "The aura requirement is probably the bottleneck. Try comparing 2+ auras versus 3+ auras, or increase aura density."
    elif lowest_key == "interaction":
        suggestion = "Interaction is the likely bottleneck. Add flexible protection/removal, or accept that interaction is a later-turn plan."
    elif lowest_key == "creatures":
        suggestion = "Creature count is the likely bottleneck. Add cheap aura carriers or cards that create bodies early."
    else:
        suggestion = "The land window is the likely bottleneck. Compare strict 3–4 lands against simple 3+ lands."

    return f"""
        <div class="commander-panel">
            <div class="advice-stack" id="tuning-advice">
                <p><strong>Opening plan confidence:</strong> {_format_pct(probability)} ({escape(_score_label(probability))}).</p>
                <p><strong>Main pressure point:</strong> {escape(labels[lowest_key])} at {_format_pct(checks[lowest_key])} as a single checkbox.</p>
                <p>{escape(suggestion)}</p>
                <p class="commander-hint">This is not saying the deck is bad. It is saying this exact “creature + commander + 3–4 lands + 3+ auras + interaction” opening is a high-bar scenario.</p>
            </div>
        </div>
    """


def _extra_head_html() -> str:
    return """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    """


def _extra_css() -> str:
    return r"""
    body {
        font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
            radial-gradient(circle at 8% 10%, rgba(144, 83, 255, 0.18), transparent 24%),
            radial-gradient(circle at 88% 12%, rgba(255, 185, 91, 0.16), transparent 24%),
            radial-gradient(circle at 50% 100%, rgba(77, 201, 164, 0.14), transparent 28%),
            linear-gradient(180deg, #16101f 0%, #101826 46%, #071018 100%);
    }

    header.hero {
        background:
            radial-gradient(circle at top left, rgba(156, 100, 255, 0.20), transparent 30%),
            radial-gradient(circle at 80% 20%, rgba(255, 190, 99, 0.12), transparent 26%),
            linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03)),
            linear-gradient(150deg, rgba(38, 25, 57, 0.94), rgba(17, 27, 44, 0.95));
    }

    .hero h1, h2, .confidence-number {
        font-family: "Cinzel", Georgia, serif;
    }

    .card::after { background: linear-gradient(90deg, #9c64ff, #ffbe63, #4dc9a4); }

    .card--deck_recipe { grid-column: span 5; }
    .card--turn_goal { grid-column: span 7; }
    .card--probability_meter { grid-column: span 6; }
    .card--sample_hands { grid-column: span 6; }
    .card--tuning_advice { grid-column: span 12; }

    .commander-panel { display: grid; gap: 0.95rem; }
    .commander-lede, .commander-hint { color: #d3cce2; margin: 0; }
    .commander-hint { font-size: 0.92rem; }

    .commander-controls, .goal-grid {
        display: grid;
        gap: 0.75rem;
    }

    .goal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }

    .commander-input-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.8rem 0.9rem;
        border-radius: 16px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.09);
    }

    .commander-input-row span { display: grid; gap: 0.16rem; }
    .commander-input-row small { color: #b8adc9; line-height: 1.25; }
    .commander-input-row input {
        width: 76px;
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 12px;
        padding: 0.55rem 0.6rem;
        background: rgba(255,255,255,0.08);
        color: var(--ink);
        font: inherit;
        font-weight: 800;
    }

    .commander-derived, .token-legend, .goal-checklist {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
    }

    .commander-derived span, .token-legend span, .goal-check {
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        border-radius: 999px;
        padding: 0.45rem 0.72rem;
        font-size: 0.86rem;
    }

    .goal-check { display: inline-flex; gap: 0.55rem; align-items: center; }

    .confidence-hero {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem;
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(135deg, rgba(156, 100, 255, 0.18), rgba(255, 190, 99, 0.10));
    }

    .confidence-number {
        font-size: clamp(2.2rem, 7vw, 4.4rem);
        line-height: 1;
        letter-spacing: -0.05em;
    }

    .confidence-label {
        font-weight: 800;
        color: #ffdf9a;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }

    .prob-row {
        display: grid;
        grid-template-columns: minmax(135px, 1fr) 2fr auto;
        gap: 0.8rem;
        align-items: center;
        padding: 0.72rem 0;
        border-top: 1px solid rgba(255,255,255,0.08);
    }

    .prob-row small { display: block; color: #b8adc9; margin-top: 0.12rem; }

    .prob-bar {
        height: 13px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.08);
    }

    .prob-bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #9c64ff, #ffbe63);
    }

    .sample-hand-list, .advice-stack { display: grid; gap: 0.75rem; }

    .sample-hand {
        padding: 0.85rem;
        border-radius: 18px;
        background: rgba(255,255,255,0.055);
        border: 1px solid rgba(255,255,255,0.09);
    }

    .sample-hand--pass { border-color: rgba(77, 201, 164, 0.38); }
    .sample-hand--miss { border-color: rgba(255, 190, 99, 0.20); }

    .sample-hand-top {
        display: flex;
        justify-content: space-between;
        gap: 0.7rem;
        color: #d3cce2;
        font-size: 0.86rem;
        margin-bottom: 0.55rem;
    }

    .sample-hand-top strong { color: var(--ink); }

    .commander-token-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.28rem;
    }

    .commander-token {
        width: 31px;
        height: 31px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: rgba(255,255,255,0.075);
        border: 1px solid rgba(255,255,255,0.09);
        font-size: 0.95rem;
    }

    .commander-btn {
        width: fit-content;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.08);
        color: var(--ink);
        border-radius: 14px;
        cursor: pointer;
        font: inherit;
        font-weight: 800;
        padding: 0.72rem 1rem;
    }

    .commander-btn:hover {
        background: rgba(255,255,255,0.13);
        transform: translateY(-1px);
    }

    .commander-warning {
        margin: 0;
        padding: 0.75rem 0.85rem;
        border-radius: 14px;
        background: rgba(255, 99, 99, 0.12);
        border: 1px solid rgba(255, 99, 99, 0.22);
        color: #ffd1d1;
    }

    .advice-stack p { margin: 0; }

    @media (max-width: 980px) {
        .card--deck_recipe, .card--turn_goal, .card--probability_meter, .card--sample_hands, .card--tuning_advice { grid-column: span 12; }
    }

    @media (max-width: 720px) {
        .goal-grid { grid-template-columns: 1fr; }
        .commander-input-row { align-items: stretch; }
        .prob-row { grid-template-columns: 1fr; }
        .sample-hand-top { flex-direction: column; }
    }
    """


def _extra_js(deck: dict[str, int], goal: dict[str, int], seed: int) -> str:
    payload = json.dumps({"deck": deck, "goal": goal, "seed": seed}, ensure_ascii=False)
    return f"""
    const COMMANDER_INIT = {payload};

    function commanderComb(n, k) {{
        if (k < 0 || k > n) return 0;
        k = Math.min(k, n - k);
        let result = 1;
        for (let i = 1; i <= k; i += 1) {{
            result *= (n - k + i) / i;
        }}
        return result;
    }}

    function readCommanderState() {{
        const deck = {{
            lands: readInt("deck-lands", 0),
            creatures: readInt("deck-creatures", 0),
            auras: readInt("deck-auras", 0),
            interaction: readInt("deck-interaction", 0),
        }};
        deck.other = Math.max(0, 99 - deck.lands - deck.creatures - deck.auras - deck.interaction);

        const goal = {{
            cards_seen: readInt("goal-cards-seen", 12),
            lands_min: readInt("goal-lands-min", 3),
            lands_max: readInt("goal-lands-max", 4),
            creatures_min: readInt("goal-creatures-min", 1),
            auras_min: readInt("goal-auras-min", 3),
            interaction_min: readInt("goal-interaction-min", 1),
        }};
        return {{ deck, goal }};
    }}

    function readInt(id, fallback) {{
        const el = document.getElementById(id);
        if (!el) return fallback;
        const value = parseInt(el.value, 10);
        return Number.isFinite(value) ? Math.max(0, value) : fallback;
    }}

    function pct(value) {{
        return `${{(value * 100).toFixed(1)}}%`;
    }}

    function scoreLabel(value) {{
        if (value >= 0.70) return "Strong";
        if (value >= 0.50) return "Playable";
        if (value >= 0.30) return "Stretch";
        return "Long shot";
    }}

    function singleCategoryProbability(totalGood, sampleSize, minimum, maximum) {{
        if (sampleSize < 0 || sampleSize > 99) return 0;
        let maxHits = Math.min(totalGood, sampleSize);
        if (Number.isFinite(maximum)) maxHits = Math.min(maxHits, maximum);
        const denominator = commanderComb(99, sampleSize);
        let numerator = 0;
        for (let hits = minimum; hits <= maxHits; hits += 1) {{
            const misses = sampleSize - hits;
            if (misses >= 0 && misses <= 99 - totalGood) {{
                numerator += commanderComb(totalGood, hits) * commanderComb(99 - totalGood, misses);
            }}
        }}
        return denominator ? numerator / denominator : 0;
    }}

    function openingProbability(deck, goal) {{
        const total = deck.lands + deck.creatures + deck.auras + deck.interaction + deck.other;
        const sampleSize = goal.cards_seen;
        if (total !== 99 || sampleSize < 0 || sampleSize > 99 || goal.lands_min > goal.lands_max) return 0;

        const denominator = commanderComb(99, sampleSize);
        let numerator = 0;

        for (let lands = goal.lands_min; lands <= Math.min(goal.lands_max, deck.lands, sampleSize); lands += 1) {{
            const afterLands = sampleSize - lands;
            for (let creatures = goal.creatures_min; creatures <= Math.min(deck.creatures, afterLands); creatures += 1) {{
                const afterCreatures = afterLands - creatures;
                for (let auras = goal.auras_min; auras <= Math.min(deck.auras, afterCreatures); auras += 1) {{
                    const afterAuras = afterCreatures - auras;
                    for (let interaction = goal.interaction_min; interaction <= Math.min(deck.interaction, afterAuras); interaction += 1) {{
                        const other = afterAuras - interaction;
                        if (other >= 0 && other <= deck.other) {{
                            numerator += commanderComb(deck.lands, lands)
                                * commanderComb(deck.creatures, creatures)
                                * commanderComb(deck.auras, auras)
                                * commanderComb(deck.interaction, interaction)
                                * commanderComb(deck.other, other);
                        }}
                    }}
                }}
            }}
        }}
        return denominator ? numerator / denominator : 0;
    }}

    function checkboxProbabilities(deck, goal) {{
        return {{
            lands: singleCategoryProbability(deck.lands, goal.cards_seen, goal.lands_min, goal.lands_max),
            creatures: singleCategoryProbability(deck.creatures, goal.cards_seen, goal.creatures_min, Infinity),
            auras: singleCategoryProbability(deck.auras, goal.cards_seen, goal.auras_min, Infinity),
            interaction: singleCategoryProbability(deck.interaction, goal.cards_seen, goal.interaction_min, Infinity),
        }};
    }}

    function cardsSeenLabel(cardsSeen) {{
        const labels = {{
            10: "Opening 7 + first 3 draws",
            11: "Opening 7 + first 4 draws",
            12: "Opening 7 + first 5 draws",
            13: "Opening 7 + first 6 draws",
        }};
        return labels[cardsSeen] || `${{cardsSeen}} cards seen`;
    }}

    function renderGoalChecklist(checks, goal) {{
        const labels = {{
            lands: `${{goal.lands_min}}–${{goal.lands_max}} lands`,
            creatures: `${{goal.creatures_min}}+ creature`,
            auras: `${{goal.auras_min}}+ auras`,
            interaction: `${{goal.interaction_min}}+ interaction`,
        }};
        const target = document.getElementById("goal-checklist");
        if (!target) return;
        target.innerHTML = Object.keys(checks).map((key) => `
            <div class="goal-check">
                <span>${{labels[key]}}</span>
                <strong>${{pct(checks[key])}}</strong>
            </div>
        `).join("");
    }}

    function renderProbabilityRows(deck, goal) {{
        const target = document.getElementById("probability-rows");
        if (!target) return;
        target.innerHTML = [10, 11, 12, 13].map((seen) => {{
            const adjusted = {{ ...goal, cards_seen: seen }};
            const probability = openingProbability(deck, adjusted);
            return `
                <div class="prob-row">
                    <div>
                        <strong>${{seen}} cards</strong>
                        <small>${{cardsSeenLabel(seen)}}</small>
                    </div>
                    <div class="prob-bar" aria-label="${{pct(probability)}}">
                        <span style="width: ${{Math.max(2, Math.min(100, probability * 100)).toFixed(1)}}%"></span>
                    </div>
                    <strong>${{pct(probability)}}</strong>
                </div>
            `;
        }}).join("");
    }}

    function buildPool(deck) {{
        const pool = [];
        [
            ["lands", deck.lands],
            ["creatures", deck.creatures],
            ["auras", deck.auras],
            ["interaction", deck.interaction],
            ["other", deck.other],
        ].forEach(([key, count]) => {{
            for (let i = 0; i < count; i += 1) pool.push(key);
        }});
        return pool;
    }}

    function sampleWithoutReplacement(pool, sampleSize) {{
        const copy = [...pool];
        const drawn = [];
        for (let i = 0; i < sampleSize && copy.length; i += 1) {{
            const index = Math.floor(Math.random() * copy.length);
            drawn.push(copy.splice(index, 1)[0]);
        }}
        return drawn;
    }}

    function handPasses(counts, goal) {{
        return counts.lands >= goal.lands_min
            && counts.lands <= goal.lands_max
            && counts.creatures >= goal.creatures_min
            && counts.auras >= goal.auras_min
            && counts.interaction >= goal.interaction_min;
    }}

    function renderSampleHands(deck, goal) {{
        const target = document.getElementById("sample-hands");
        if (!target) return;
        const emoji = {{ lands: "🟫", creatures: "🧍", auras: "🟣", interaction: "⚡", other: "◇" }};
        const pool = buildPool(deck);
        target.innerHTML = Array.from({{ length: 6 }}).map(() => {{
            const drawn = sampleWithoutReplacement(pool, goal.cards_seen);
            const counts = {{ lands: 0, creatures: 0, auras: 0, interaction: 0, other: 0 }};
            drawn.forEach((item) => {{ counts[item] += 1; }});
            const passes = handPasses(counts, goal);
            const tokens = drawn.map((item) => `<span class="commander-token commander-token--${{item}}">${{emoji[item]}}</span>`).join("");
            return `
                <article class="sample-hand sample-hand--${{passes ? "pass" : "miss"}}">
                    <div class="sample-hand-top">
                        <strong>${{passes ? "PASS" : "MISS"}}</strong>
                        <span>${{counts.lands}} land · ${{counts.creatures}} creature · ${{counts.auras}} aura · ${{counts.interaction}} interaction</span>
                    </div>
                    <div class="commander-token-row">${{tokens}}</div>
                </article>
            `;
        }}).join("");
    }}

    function renderAdvice(probability, checks) {{
        const target = document.getElementById("tuning-advice");
        if (!target) return;
        const labels = {{
            lands: "land window",
            creatures: "creature density",
            auras: "aura density",
            interaction: "interaction density",
        }};
        const suggestions = {{
            lands: "The land window is the likely bottleneck. Compare strict 3–4 lands against simple 3+ lands.",
            creatures: "Creature count is the likely bottleneck. Add cheap aura carriers or cards that create bodies early.",
            auras: "The aura requirement is probably the bottleneck. Try comparing 2+ auras versus 3+ auras, or increase aura density.",
            interaction: "Interaction is the likely bottleneck. Add flexible protection/removal, or accept that interaction is a later-turn plan.",
        }};
        const lowest = Object.keys(checks).sort((a, b) => checks[a] - checks[b])[0];
        target.innerHTML = `
            <p><strong>Opening plan confidence:</strong> ${{pct(probability)}} (${{scoreLabel(probability)}}).</p>
            <p><strong>Main pressure point:</strong> ${{labels[lowest]}} at ${{pct(checks[lowest])}} as a single checkbox.</p>
            <p>${{suggestions[lowest]}}</p>
            <p class="commander-hint">This is not saying the deck is bad. It is saying this exact opening-board-state request is a high-bar scenario.</p>
        `;
    }}

    function updateCommanderReadiness(options = {{ reroll: false }}) {{
        const {{ deck, goal }} = readCommanderState();
        const total = deck.lands + deck.creatures + deck.auras + deck.interaction + deck.other;
        const otherEl = document.getElementById("deck-other");
        const totalEl = document.getElementById("deck-total");
        if (otherEl) otherEl.textContent = String(deck.other);
        if (totalEl) totalEl.textContent = String(total);

        const probability = openingProbability(deck, goal);
        const checks = checkboxProbabilities(deck, goal);

        const probabilityEl = document.getElementById("opening-probability");
        const labelEl = document.getElementById("opening-label");
        if (probabilityEl) probabilityEl.textContent = pct(probability);
        if (labelEl) labelEl.textContent = scoreLabel(probability);

        renderGoalChecklist(checks, goal);
        renderProbabilityRows(deck, goal);
        renderAdvice(probability, checks);

        if (options.reroll) renderSampleHands(deck, goal);
    }}

    (function () {{
        document.querySelectorAll(".commander-input-row input").forEach((input) => {{
            input.addEventListener("input", () => updateCommanderReadiness({{ reroll: false }}));
        }});
        const reroll = document.getElementById("sample-reroll");
        if (reroll) reroll.addEventListener("click", () => {{
            const {{ deck, goal }} = readCommanderState();
            renderSampleHands(deck, goal);
            updateCommanderReadiness({{ reroll: false }});
        }});
        updateCommanderReadiness({{ reroll: false }});
    }})();
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng_seed = seed if seed is not None else today.toordinal()

    deck = _deck_with_other(DEFAULT_DECK)
    goal = _goal_from_defaults()
    probability = _opening_plan_probability(deck, goal)
    checks = _checkbox_probabilities(deck, goal)
    probability_rows = _probabilities_by_turn(deck, goal)
    hands = _sample_hands(deck, goal, rng_seed)

    cards = [
        CardItem(
            "deck_recipe",
            "Deck Recipe",
            "99-Card Composition",
            _deck_recipe_html(deck),
        ),
        CardItem(
            "turn_goal",
            "Opening Plan",
            "Turn 5–6 Checklist",
            _turn_goal_html(goal, checks),
        ),
        CardItem(
            "probability_meter",
            "Consistency",
            "How Often It Comes Together",
            _probability_meter_html(probability, probability_rows),
        ),
        CardItem(
            "sample_hands",
            "Goldfish View",
            "Sample Opening Windows",
            _sample_hands_html(hands),
        ),
        CardItem(
            "tuning_advice",
            "Deck Tuning",
            "What This Suggests",
            _tuning_advice_html(deck, goal, probability, checks),
        ),
    ]

    footer = (
        f"{THEME_CONFIG['footer_text']} Default recipe: "
        f"{deck['lands']} lands, {deck['creatures']} creatures, {deck['auras']} auras, "
        f"{deck['interaction']} interaction, {deck['other']} other."
    )

    return PageContext(
        page_title=f"Commander Opening Plan — {today.strftime('%B %d, %Y')}",
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=(
            "Tune the deck buckets and checklist to see whether the requested early board state is realistic before turn 6."
        ),
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=footer,
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "background": None,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": (
                f"{_format_pct(probability)} default confidence · commander always available · exact 99-card math"
            ),
            "extra_css": _extra_css(),
            "extra_js": _extra_js(deck, goal, rng_seed),
            "extra_head_html": _extra_head_html(),
        },
    )
