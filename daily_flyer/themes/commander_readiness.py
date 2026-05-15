from __future__ import annotations

import json
import random
from html import escape
from typing import Any

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "commander_readiness"
DECK_SIZE = 99
SIMULATION_RUNS = 900

THEME_CONFIG = {
    "page_title": "Commander Opening Plan — Daily Flyer",
    "header_title": "Commander Opening Plan",
    "header_subtitle": "A visual early-game readiness check for a 99-card Commander deck: mana, castable cards, board presence, damage, and value by turns 5–6.",
    "footer_text": "Built on Daily Flyer. Commander readiness prototype.",
    "hero_kicker": "Daily Flyer • Magic Commander Theme",
    "hero_summary_pill": "99-card deck audit · mana-value model · board/value forecast",
}

DEFAULT_DECK = {
    "lands": 37,
    "cheap_creatures": 8,
    "mid_creatures": 10,
    "cheap_auras": 14,
    "mid_auras": 8,
    "cheap_interaction": 7,
    "mid_interaction": 3,
    "value_engines": 5,
}

DEFAULT_GOAL = {
    "target_turn": 6,
    "commander_mv": 3,
    "commander_power": 2,
    "cards_seen": 13,
    "nonland_permanents_min": 4,
    "damage_min": 7,
    "value_min": 1,
    "restriction_friction": 10,
    "aura_bonus": 2,
}

DECK_INPUTS = (
    ("lands", "Lands", "Mana base; one land can be played per turn."),
    ("cheap_creatures", "Cheap creatures", "MV 1–2 bodies that can carry auras."),
    ("mid_creatures", "Mid creatures", "MV 3–4 bodies / payoff creatures."),
    ("cheap_auras", "Cheap auras", "MV 1–2 auras, protection, or buffs."),
    ("mid_auras", "Mid auras", "MV 3–4 auras or larger payoffs."),
    ("cheap_interaction", "Cheap interaction", "MV 1–2 removal, tricks, protection, answers."),
    ("mid_interaction", "Mid interaction", "MV 3–4 interaction / higher-cost answers."),
    ("value_engines", "Ramp / draw / value", "Cards that generate more cards, mana, or repeated value."),
)

TOKEN_META = {
    "land": ("🟫", "Land"),
    "cheap_creature": ("🧍", "Cheap creature"),
    "mid_creature": ("🧍", "Mid creature"),
    "cheap_aura": ("🟣", "Cheap aura"),
    "mid_aura": ("🔮", "Mid aura"),
    "cheap_interaction": ("⚡", "Cheap interaction"),
    "mid_interaction": ("🌩️", "Mid interaction"),
    "value_engine": ("💎", "Value"),
    "other": ("◇", "Other"),
}


def _deck_with_other(deck: dict[str, int]) -> dict[str, int]:
    clean = {key: max(0, int(deck.get(key, 0))) for key, _, _ in DECK_INPUTS}
    clean["other"] = max(0, DECK_SIZE - sum(clean.values()))
    return clean


def _goal_from_defaults() -> dict[str, int]:
    return {key: int(value) for key, value in DEFAULT_GOAL.items()}


def _format_pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def _score_label(probability: float) -> str:
    if probability >= 0.70:
        return "Strong"
    if probability >= 0.50:
        return "Playable"
    if probability >= 0.30:
        return "Developing"
    return "Needs tuning"


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, int(value)))


def _build_deck_cards(deck: dict[str, int], aura_bonus: int) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []

    def add(count: int, **attrs: Any) -> None:
        for idx in range(max(0, count)):
            card = dict(attrs)
            card["id"] = f"{attrs['kind']}-{idx}"
            cards.append(card)

    add(deck["lands"], kind="land", mv=0, permanent=True, damage=0, value=0)
    add(deck["cheap_creatures"], kind="cheap_creature", mv_cycle=(1, 2), permanent=True, creature=True, damage=2, value=0)
    add(deck["mid_creatures"], kind="mid_creature", mv_cycle=(3, 4), permanent=True, creature=True, damage=3, value=0)
    add(deck["cheap_auras"], kind="cheap_aura", mv_cycle=(1, 2), permanent=True, aura=True, damage=max(1, aura_bonus), value=0)
    add(deck["mid_auras"], kind="mid_aura", mv_cycle=(3, 4), permanent=True, aura=True, damage=max(1, aura_bonus + 1), value=0)
    add(deck["cheap_interaction"], kind="cheap_interaction", mv_cycle=(1, 2), permanent=False, interaction=True, damage=0, value=0)
    add(deck["mid_interaction"], kind="mid_interaction", mv_cycle=(3, 4), permanent=False, interaction=True, damage=0, value=0)
    add(deck["value_engines"], kind="value_engine", mv_cycle=(2, 3), permanent=True, value_engine=True, damage=0, value=1)
    add(deck["other"], kind="other", mv_cycle=(2, 3, 4), permanent=False, damage=0, value=0)

    for card in cards:
        cycle = card.pop("mv_cycle", None)
        if cycle:
            suffix = int(str(card["id"]).split("-")[-1])
            card["mv"] = cycle[suffix % len(cycle)]

    return cards


def _kind_priority(card: dict[str, Any], has_carrier: bool) -> tuple[int, int]:
    kind = card["kind"]
    if kind == "value_engine":
        return (0, card["mv"])
    if kind == "cheap_creature":
        return (1, card["mv"])
    if kind == "mid_creature":
        return (2, card["mv"])
    if kind in ("cheap_aura", "mid_aura"):
        return ((3 if has_carrier else 8), card["mv"])
    if "interaction" in kind:
        return (6, card["mv"])
    return (9, card["mv"])


def _simulate_opening(deck: dict[str, int], goal: dict[str, int], seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    cards = _build_deck_cards(deck, goal["aura_bonus"])
    cards_seen = _clamp(goal.get("cards_seen", 7 + goal["target_turn"]), 7, DECK_SIZE)
    drawn = rng.sample(cards, min(cards_seen, len(cards)))

    lands_drawn = sum(1 for card in drawn if card["kind"] == "land")
    lands_in_play = min(lands_drawn, goal["target_turn"])
    peak_mana = lands_in_play
    mana_budget = sum(min(lands_drawn, turn) for turn in range(1, goal["target_turn"] + 1))
    friction = max(0, min(95, goal.get("restriction_friction", 0))) / 100

    spells = [card for card in drawn if card["kind"] != "land"]
    usable_spells = [card for card in spells if rng.random() >= friction]

    commander_cast = peak_mana >= goal["commander_mv"] and mana_budget >= goal["commander_mv"]
    if commander_cast:
        mana_budget -= goal["commander_mv"]

    cast_cards: list[dict[str, Any]] = []
    value_score = 0
    virtual_resource_bonus = 0

    def has_carrier() -> bool:
        return commander_cast or any(card.get("creature") for card in cast_cards)

    remaining = sorted(usable_spells, key=lambda card: _kind_priority(card, has_carrier()))
    changed = True
    while changed:
        changed = False
        remaining = sorted(remaining, key=lambda card: _kind_priority(card, has_carrier()))
        for card in list(remaining):
            if card.get("aura") and not has_carrier():
                continue
            if card.get("interaction"):
                continue
            if card["mv"] <= peak_mana + virtual_resource_bonus and card["mv"] <= mana_budget:
                cast_cards.append(card)
                mana_budget -= card["mv"]
                remaining.remove(card)
                changed = True
                if card.get("value_engine"):
                    value_score += 1
                    virtual_resource_bonus = min(2, virtual_resource_bonus + 1)
                    mana_budget += 1
                break

    interaction_ready = sum(
        1
        for card in usable_spells
        if card.get("interaction") and card["mv"] <= peak_mana + virtual_resource_bonus
    )

    creature_count = sum(1 for card in cast_cards if card.get("creature"))
    aura_count = sum(1 for card in cast_cards if card.get("aura"))
    value_engine_count = sum(1 for card in cast_cards if card.get("value_engine"))
    nonland_permanents = (1 if commander_cast else 0) + sum(1 for card in cast_cards if card.get("permanent"))
    battlefield_permanents = lands_in_play + nonland_permanents
    damage = (goal["commander_power"] if commander_cast else 0) + sum(card.get("damage", 0) for card in cast_cards)

    value_score += min(2, interaction_ready)

    success = (
        commander_cast
        and nonland_permanents >= goal["nonland_permanents_min"]
        and damage >= goal["damage_min"]
        and value_score >= goal["value_min"]
    )

    return {
        "drawn": drawn,
        "lands_drawn": lands_drawn,
        "lands_in_play": lands_in_play,
        "peak_mana": peak_mana + virtual_resource_bonus,
        "commander_cast": commander_cast,
        "cast_cards": cast_cards,
        "creatures": creature_count,
        "auras": aura_count,
        "value_engines": value_engine_count,
        "interaction_ready": interaction_ready,
        "nonland_permanents": nonland_permanents,
        "battlefield_permanents": battlefield_permanents,
        "damage": damage,
        "value_score": value_score,
        "success": success,
    }


def _aggregate_simulation(deck: dict[str, int], goal: dict[str, int], seed: int, runs: int = SIMULATION_RUNS) -> dict[str, Any]:
    outcomes = [_simulate_opening(deck, goal, seed + idx * 17) for idx in range(runs)]

    def avg(key: str) -> float:
        return sum(float(outcome[key]) for outcome in outcomes) / len(outcomes)

    success_rate = sum(1 for outcome in outcomes if outcome["success"]) / len(outcomes)
    commander_rate = sum(1 for outcome in outcomes if outcome["commander_cast"]) / len(outcomes)
    interaction_rate = sum(1 for outcome in outcomes if outcome["interaction_ready"] > 0) / len(outcomes)

    return {
        "success_rate": success_rate,
        "commander_rate": commander_rate,
        "interaction_rate": interaction_rate,
        "avg_nonland": avg("nonland_permanents"),
        "avg_battlefield": avg("battlefield_permanents"),
        "avg_damage": avg("damage"),
        "avg_value": avg("value_score"),
        "avg_auras": avg("auras"),
        "runs": runs,
    }


def _sample_hands(deck: dict[str, int], goal: dict[str, int], seed: int) -> list[dict[str, Any]]:
    return [_simulate_opening(deck, goal, seed + idx * 101) for idx in range(6)]


def _goal_summary(goal: dict[str, int]) -> str:
    return (
        f"Turn {goal['target_turn']} · commander MV {goal['commander_mv']} · "
        f"{goal['nonland_permanents_min']}+ nonland permanents · "
        f"{goal['damage_min']}+ potential damage · {goal['value_min']}+ value/answer"
    )


def _deck_recipe_html(deck: dict[str, int]) -> str:
    total_visible = sum(deck[key] for key, _, _ in DECK_INPUTS)
    warning = ""
    if total_visible > DECK_SIZE:
        warning = "<p class='commander-warning'>The visible categories add up to more than 99. Lower one category before trusting the result.</p>"

    controls = "".join(
        f"""
        <label class="commander-input-row">
            <span>
                <strong>{escape(label)}</strong>
                <small>{escape(help_text)}</small>
            </span>
            <input id="deck-{escape(key)}" type="number" min="0" max="99" value="{deck[key]}" inputmode="numeric">
        </label>
        """
        for key, label, help_text in DECK_INPUTS
    )

    return f"""
        <div class="commander-panel">
            <p class="commander-lede">This version no longer treats “aura” or “creature” as automatically useful. It estimates whether the deck can actually spend mana on those cards before the target turn.</p>
            <div class="commander-controls">{controls}</div>
            <div class="commander-derived">
                <span>Commander: <strong>available, but costs mana</strong></span>
                <span>Other / unknown cards: <strong id="deck-other">{deck['other']}</strong></span>
                <span>Total: <strong id="deck-total">{DECK_SIZE}</strong></span>
            </div>
            {warning}
        </div>
    """


def _mana_goal_html(goal: dict[str, int]) -> str:
    fields = (
        ("target-turn", "Target turn", "Usually turn 5 or turn 6.", goal["target_turn"], 3, 8),
        ("commander-mv", "Commander mana value", "Commander is always accessible, but not free.", goal["commander_mv"], 0, 10),
        ("commander-power", "Commander power", "Used for rough damage-pressure estimates.", goal["commander_power"], 0, 20),
        ("cards-seen", "Cards seen", "Opening hand plus draw steps.", goal["cards_seen"], 7, 20),
        ("nonland-permanents-min", "Board pieces goal", "Nonland permanents: commander, creatures, auras, value engines.", goal["nonland_permanents_min"], 0, 20),
        ("damage-min", "Damage pressure goal", "Rough potential damage, not exact combat math.", goal["damage_min"], 0, 40),
        ("value-min", "Value / answer goal", "Draw/ramp/value engines plus ready interaction.", goal["value_min"], 0, 10),
        ("restriction-friction", "Restriction friction %", "Card text, timing, target, color, or board-state restrictions.", goal["restriction_friction"], 0, 95),
        ("aura-bonus", "Aura damage bonus", "Average extra pressure from a cast aura.", goal["aura_bonus"], 0, 10),
    )

    controls = "".join(
        f"""
        <label class="commander-input-row">
            <span><strong>{escape(label)}</strong><small>{escape(help)}</small></span>
            <input id="goal-{escape(key)}" type="number" min="{low}" max="{high}" value="{value}" inputmode="numeric">
        </label>
        """
        for key, label, help, value, low, high in fields
    )

    return f"""
        <div class="commander-panel">
            <p class="commander-lede">The goal is now value-oriented: do we get enough mana, board presence, damage pressure, and usable value/answers by the target turn?</p>
            <div class="goal-grid">{controls}</div>
            <div class="commander-derived">
                <span id="goal-summary">{escape(_goal_summary(goal))}</span>
            </div>
        </div>
    """


def _probability_meter_html(summary: dict[str, Any], goal: dict[str, int]) -> str:
    success = summary["success_rate"]
    stat_rows = (
        ("Commander castable", _format_pct(summary["commander_rate"])),
        ("Interaction/value seen", _format_pct(summary["interaction_rate"])),
        ("Avg nonland board pieces", f"{summary['avg_nonland']:.1f}"),
        ("Avg battlefield permanents", f"{summary['avg_battlefield']:.1f}"),
        ("Avg damage pressure", f"{summary['avg_damage']:.1f}"),
        ("Avg value / answer score", f"{summary['avg_value']:.1f}"),
    )
    rows_html = "".join(
        f"""
        <div class="stat-tile">
            <span>{escape(label)}</span>
            <strong>{escape(value)}</strong>
        </div>
        """
        for label, value in stat_rows
    )

    return f"""
        <div class="commander-panel">
            <div class="confidence-hero">
                <span class="confidence-number" id="opening-probability">{_format_pct(success)}</span>
                <span class="confidence-label" id="opening-label">{escape(_score_label(success))}</span>
            </div>
            <p class="commander-lede">This is a simulated estimate of the deck producing a useful outcome, not just drawing the right labels. It accounts for mana value, commander cost, rough restrictions, board pieces, damage pressure, and value/answers.</p>
            <div class="outcome-grid" id="outcome-grid">{rows_html}</div>
            <p class="commander-hint" id="simulation-note">Default model: {summary['runs']} simulated openings. {escape(_goal_summary(goal))}.</p>
        </div>
    """


def _token_row_html(outcome: dict[str, Any]) -> str:
    cast_keys = {f"{card['kind']}:{card['id']}" for card in outcome["cast_cards"]}
    tokens = []
    for card in outcome["drawn"]:
        emoji, label = TOKEN_META.get(card["kind"], ("◇", "Card"))
        cast = f"{card['kind']}:{card['id']}" in cast_keys
        classes = f"commander-token commander-token--{escape(card['kind'])}"
        if cast:
            classes += " is-cast"
        tokens.append(
            f"<span class='{classes}' title='{escape(label)} · MV {card['mv']}'>{emoji}</span>"
        )

    verdict = "GOOD OUTCOME" if outcome["success"] else "CLUNKY / SLOW"
    verdict_class = "pass" if outcome["success"] else "miss"
    return f"""
        <article class="sample-hand sample-hand--{verdict_class}">
            <div class="sample-hand-top">
                <strong>{verdict}</strong>
                <span>
                    {outcome['lands_in_play']} lands · {outcome['nonland_permanents']} nonland permanents ·
                    {outcome['damage']} damage · {outcome['value_score']} value/answer
                </span>
            </div>
            <div class="commander-token-row">{''.join(tokens)}</div>
        </article>
    """


def _sample_hands_html(hands: list[dict[str, Any]]) -> str:
    return f"""
        <div class="commander-panel">
            <p class="commander-lede">Sample openings now show whether cards are likely to be castable. Highlighted tokens were spent into the board/value model.</p>
            <div class="token-legend">
                <span>🟫 Land</span>
                <span>🧍 Creature</span>
                <span>🟣 Aura</span>
                <span>⚡ Interaction</span>
                <span>💎 Value</span>
                <span>Outlined = castable/used</span>
            </div>
            <div id="sample-hands" class="sample-hand-list">
                {''.join(_token_row_html(hand) for hand in hands)}
            </div>
            <button class="commander-btn" type="button" id="sample-reroll">Reroll sample hands</button>
        </div>
    """


def _tuning_advice_html(summary: dict[str, Any], goal: dict[str, int]) -> str:
    success = summary["success_rate"]
    advice: list[str] = []

    if summary["commander_rate"] < 0.80:
        advice.append("Commander access is being limited by mana. Lower the commander mana value assumption, add ramp/value, or increase early land consistency.")
    if summary["avg_nonland"] < goal["nonland_permanents_min"]:
        advice.append("The deck is not putting enough nonland material onto the board by the target turn. Cheap creatures, cheap auras, and value engines help more than expensive payoffs.")
    if summary["avg_damage"] < goal["damage_min"]:
        advice.append("Damage pressure is below the target. Either the aura bonus/payoff assumption is too low, or too many cards are not castable early enough.")
    if summary["avg_value"] < goal["value_min"]:
        advice.append("The value/answer score is light. Add draw, ramp, protection, or cheap interaction that is live in the first few turns.")
    if not advice:
        advice.append("The model likes this opening plan. Next improvement would be using real card names, mana values, colors, and card text restrictions.")

    bullets = "".join(f"<li>{escape(item)}</li>" for item in advice)

    return f"""
        <div class="commander-panel">
            <div class="advice-stack" id="tuning-advice">
                <p><strong>Outcome confidence:</strong> {_format_pct(success)} ({escape(_score_label(success))}).</p>
                <p><strong>What changed:</strong> this is now measuring castable value, not just whether the opening cards contain labels like “aura” or “instant.”</p>
                <ul>{bullets}</ul>
                <p class="commander-hint">Best next version: paste/import the actual decklist, then calculate this from real mana values, colors, card types, and rules text tags.</p>
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

    .hero h1, h2, .confidence-number { font-family: "Cinzel", Georgia, serif; }
    .card::after { background: linear-gradient(90deg, #9c64ff, #ffbe63, #4dc9a4); }

    .card--deck_recipe { grid-column: span 5; }
    .card--turn_goal { grid-column: span 7; }
    .card--probability_meter { grid-column: span 6; }
    .card--sample_hands { grid-column: span 6; }
    .card--tuning_advice { grid-column: span 12; }

    .commander-panel { display: grid; gap: 0.95rem; }
    .commander-lede, .commander-hint { color: #d3cce2; margin: 0; }
    .commander-hint { font-size: 0.92rem; }

    .commander-controls, .goal-grid, .sample-hand-list, .advice-stack { display: grid; gap: 0.75rem; }
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

    .commander-derived, .token-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
    }

    .commander-derived span, .token-legend span, .stat-tile {
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        border-radius: 18px;
        padding: 0.55rem 0.72rem;
        font-size: 0.86rem;
    }

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

    .outcome-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.7rem;
    }

    .stat-tile { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; }
    .stat-tile span { color: #d3cce2; }
    .stat-tile strong { color: var(--ink); font-size: 1.08rem; }

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
        opacity: 0.68;
    }

    .commander-token.is-cast {
        opacity: 1;
        outline: 2px solid rgba(77, 201, 164, 0.65);
        box-shadow: 0 0 16px rgba(77, 201, 164, 0.18);
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
    .advice-stack ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.45rem; color: #d3cce2; }

    @media (max-width: 980px) {
        .card--deck_recipe, .card--turn_goal, .card--probability_meter, .card--sample_hands, .card--tuning_advice { grid-column: span 12; }
    }

    @media (max-width: 720px) {
        .goal-grid, .outcome-grid { grid-template-columns: 1fr; }
        .commander-input-row { align-items: stretch; }
        .sample-hand-top { flex-direction: column; }
    }
    """


def _extra_js(deck: dict[str, int], goal: dict[str, int], seed: int) -> str:
    payload = json.dumps({"deck": deck, "goal": goal, "seed": seed}, ensure_ascii=False)
    return r"""
    const COMMANDER_INIT = __PAYLOAD__;
    const DECK_SIZE = 99;

    const TOKEN_META = {
        land: ["🟫", "Land"],
        cheap_creature: ["🧍", "Cheap creature"],
        mid_creature: ["🧍", "Mid creature"],
        cheap_aura: ["🟣", "Cheap aura"],
        mid_aura: ["🔮", "Mid aura"],
        cheap_interaction: ["⚡", "Cheap interaction"],
        mid_interaction: ["🌩️", "Mid interaction"],
        value_engine: ["💎", "Value"],
        other: ["◇", "Other"],
    };

    function readInt(id, fallback) {
        const el = document.getElementById(id);
        if (!el) return fallback;
        const value = parseInt(el.value, 10);
        return Number.isFinite(value) ? Math.max(0, value) : fallback;
    }

    function pct(value) { return `${(value * 100).toFixed(1)}%`; }

    function scoreLabel(value) {
        if (value >= 0.70) return "Strong";
        if (value >= 0.50) return "Playable";
        if (value >= 0.30) return "Developing";
        return "Needs tuning";
    }

    function readCommanderState() {
        const deck = {
            lands: readInt("deck-lands", 0),
            cheap_creatures: readInt("deck-cheap_creatures", 0),
            mid_creatures: readInt("deck-mid_creatures", 0),
            cheap_auras: readInt("deck-cheap_auras", 0),
            mid_auras: readInt("deck-mid_auras", 0),
            cheap_interaction: readInt("deck-cheap_interaction", 0),
            mid_interaction: readInt("deck-mid_interaction", 0),
            value_engines: readInt("deck-value_engines", 0),
        };
        deck.other = Math.max(0, DECK_SIZE - Object.values(deck).reduce((a, b) => a + b, 0));

        const goal = {
            target_turn: readInt("goal-target-turn", 6),
            commander_mv: readInt("goal-commander-mv", 3),
            commander_power: readInt("goal-commander-power", 2),
            cards_seen: readInt("goal-cards-seen", 13),
            nonland_permanents_min: readInt("goal-nonland-permanents-min", 4),
            damage_min: readInt("goal-damage-min", 7),
            value_min: readInt("goal-value-min", 1),
            restriction_friction: readInt("goal-restriction-friction", 10),
            aura_bonus: readInt("goal-aura-bonus", 2),
        };
        return { deck, goal };
    }

    function addCards(pool, count, attrs, cycle) {
        for (let i = 0; i < count; i += 1) {
            pool.push({ ...attrs, id: `${attrs.kind}-${i}`, mv: cycle ? cycle[i % cycle.length] : attrs.mv });
        }
    }

    function buildDeck(deck, auraBonus) {
        const pool = [];
        addCards(pool, deck.lands, { kind: "land", mv: 0, permanent: true, damage: 0, value: 0 });
        addCards(pool, deck.cheap_creatures, { kind: "cheap_creature", permanent: true, creature: true, damage: 2, value: 0 }, [1, 2]);
        addCards(pool, deck.mid_creatures, { kind: "mid_creature", permanent: true, creature: true, damage: 3, value: 0 }, [3, 4]);
        addCards(pool, deck.cheap_auras, { kind: "cheap_aura", permanent: true, aura: true, damage: Math.max(1, auraBonus), value: 0 }, [1, 2]);
        addCards(pool, deck.mid_auras, { kind: "mid_aura", permanent: true, aura: true, damage: Math.max(1, auraBonus + 1), value: 0 }, [3, 4]);
        addCards(pool, deck.cheap_interaction, { kind: "cheap_interaction", permanent: false, interaction: true, damage: 0, value: 0 }, [1, 2]);
        addCards(pool, deck.mid_interaction, { kind: "mid_interaction", permanent: false, interaction: true, damage: 0, value: 0 }, [3, 4]);
        addCards(pool, deck.value_engines, { kind: "value_engine", permanent: true, value_engine: true, damage: 0, value: 1 }, [2, 3]);
        addCards(pool, deck.other, { kind: "other", permanent: false, damage: 0, value: 0 }, [2, 3, 4]);
        return pool;
    }

    function sampleWithoutReplacement(pool, sampleSize) {
        const copy = [...pool];
        const drawn = [];
        for (let i = 0; i < sampleSize && copy.length; i += 1) {
            const index = Math.floor(Math.random() * copy.length);
            drawn.push(copy.splice(index, 1)[0]);
        }
        return drawn;
    }

    function priority(card, hasCarrier) {
        if (card.kind === "value_engine") return [0, card.mv];
        if (card.kind === "cheap_creature") return [1, card.mv];
        if (card.kind === "mid_creature") return [2, card.mv];
        if (card.kind === "cheap_aura" || card.kind === "mid_aura") return [hasCarrier ? 3 : 8, card.mv];
        if (card.interaction) return [6, card.mv];
        return [9, card.mv];
    }

    function simulateOpening(deck, goal) {
        const cards = buildDeck(deck, goal.aura_bonus);
        const drawn = sampleWithoutReplacement(cards, Math.min(goal.cards_seen, cards.length));
        const landsDrawn = drawn.filter((card) => card.kind === "land").length;
        const landsInPlay = Math.min(landsDrawn, goal.target_turn);
        let peakMana = landsInPlay;
        let manaBudget = 0;
        for (let turn = 1; turn <= goal.target_turn; turn += 1) manaBudget += Math.min(landsDrawn, turn);

        const friction = Math.min(95, Math.max(0, goal.restriction_friction)) / 100;
        const spells = drawn.filter((card) => card.kind !== "land");
        const usableSpells = spells.filter(() => Math.random() >= friction);

        const commanderCast = peakMana >= goal.commander_mv && manaBudget >= goal.commander_mv;
        if (commanderCast) manaBudget -= goal.commander_mv;

        const castCards = [];
        let valueScore = 0;
        let virtualResourceBonus = 0;

        function hasCarrier() { return commanderCast || castCards.some((card) => card.creature); }

        let remaining = [...usableSpells];
        let changed = true;
        while (changed) {
            changed = false;
            remaining.sort((a, b) => {
                const pa = priority(a, hasCarrier());
                const pb = priority(b, hasCarrier());
                return pa[0] - pb[0] || pa[1] - pb[1];
            });

            for (const card of [...remaining]) {
                if (card.aura && !hasCarrier()) continue;
                if (card.interaction) continue;
                if (card.mv <= peakMana + virtualResourceBonus && card.mv <= manaBudget) {
                    castCards.push(card);
                    manaBudget -= card.mv;
                    remaining = remaining.filter((candidate) => `${candidate.kind}:${candidate.id}` !== `${card.kind}:${card.id}`);
                    changed = true;
                    if (card.value_engine) {
                        valueScore += 1;
                        virtualResourceBonus = Math.min(2, virtualResourceBonus + 1);
                        manaBudget += 1;
                    }
                    break;
                }
            }
        }

        const interactionReady = usableSpells.filter((card) => card.interaction && card.mv <= peakMana + virtualResourceBonus).length;
        const auras = castCards.filter((card) => card.aura).length;
        const nonland = (commanderCast ? 1 : 0) + castCards.filter((card) => card.permanent).length;
        const battlefield = landsInPlay + nonland;
        const damage = (commanderCast ? goal.commander_power : 0) + castCards.reduce((sum, card) => sum + (card.damage || 0), 0);
        valueScore += Math.min(2, interactionReady);

        const success = commanderCast
            && nonland >= goal.nonland_permanents_min
            && damage >= goal.damage_min
            && valueScore >= goal.value_min;

        return {
            drawn,
            castCards,
            lands_in_play: landsInPlay,
            peak_mana: peakMana + virtualResourceBonus,
            commander_cast: commanderCast,
            auras,
            interaction_ready: interactionReady,
            nonland_permanents: nonland,
            battlefield_permanents: battlefield,
            damage,
            value_score: valueScore,
            success,
        };
    }

    function aggregate(deck, goal, runs = 600) {
        const outcomes = Array.from({ length: runs }, () => simulateOpening(deck, goal));
        const avg = (key) => outcomes.reduce((sum, outcome) => sum + outcome[key], 0) / runs;
        return {
            success_rate: outcomes.filter((o) => o.success).length / runs,
            commander_rate: outcomes.filter((o) => o.commander_cast).length / runs,
            interaction_rate: outcomes.filter((o) => o.interaction_ready > 0).length / runs,
            avg_nonland: avg("nonland_permanents"),
            avg_battlefield: avg("battlefield_permanents"),
            avg_damage: avg("damage"),
            avg_value: avg("value_score"),
            avg_auras: avg("auras"),
            runs,
        };
    }

    function renderOutcomeGrid(summary) {
        const rows = [
            ["Commander castable", pct(summary.commander_rate)],
            ["Interaction/value seen", pct(summary.interaction_rate)],
            ["Avg nonland board pieces", summary.avg_nonland.toFixed(1)],
            ["Avg battlefield permanents", summary.avg_battlefield.toFixed(1)],
            ["Avg damage pressure", summary.avg_damage.toFixed(1)],
            ["Avg value / answer score", summary.avg_value.toFixed(1)],
        ];
        const target = document.getElementById("outcome-grid");
        if (!target) return;
        target.innerHTML = rows.map(([label, value]) => `
            <div class="stat-tile"><span>${label}</span><strong>${value}</strong></div>
        `).join("");
    }

    function goalSummary(goal) {
        return `Turn ${goal.target_turn} · commander MV ${goal.commander_mv} · ${goal.nonland_permanents_min}+ nonland permanents · ${goal.damage_min}+ potential damage · ${goal.value_min}+ value/answer`;
    }

    function renderAdvice(summary, goal) {
        const target = document.getElementById("tuning-advice");
        if (!target) return;
        const advice = [];
        if (summary.commander_rate < 0.80) advice.push("Commander access is being limited by mana. Lower the commander mana value assumption, add ramp/value, or increase early land consistency.");
        if (summary.avg_nonland < goal.nonland_permanents_min) advice.push("The deck is not putting enough nonland material onto the board by the target turn. Cheap creatures, cheap auras, and value engines help more than expensive payoffs.");
        if (summary.avg_damage < goal.damage_min) advice.push("Damage pressure is below the target. Either the aura bonus/payoff assumption is too low, or too many cards are not castable early enough.");
        if (summary.avg_value < goal.value_min) advice.push("The value/answer score is light. Add draw, ramp, protection, or cheap interaction that is live in the first few turns.");
        if (!advice.length) advice.push("The model likes this opening plan. Next improvement would be using real card names, mana values, colors, and card text restrictions.");

        target.innerHTML = `
            <p><strong>Outcome confidence:</strong> ${pct(summary.success_rate)} (${scoreLabel(summary.success_rate)}).</p>
            <p><strong>What changed:</strong> this is now measuring castable value, not just whether the opening cards contain labels like “aura” or “instant.”</p>
            <ul>${advice.map((item) => `<li>${item}</li>`).join("")}</ul>
            <p class="commander-hint">Best next version: paste/import the actual decklist, then calculate this from real mana values, colors, card types, and rules text tags.</p>
        `;
    }

    function renderSampleHands(deck, goal) {
        const target = document.getElementById("sample-hands");
        if (!target) return;
        target.innerHTML = Array.from({ length: 6 }, () => simulateOpening(deck, goal)).map((outcome) => {
            const castIds = new Set(outcome.castCards.map((card) => `${card.kind}:${card.id}`));
            const tokens = outcome.drawn.map((card) => {
                const meta = TOKEN_META[card.kind] || ["◇", "Card"];
                const cast = castIds.has(`${card.kind}:${card.id}`);
                return `<span class="commander-token commander-token--${card.kind}${cast ? " is-cast" : ""}" title="${meta[1]} · MV ${card.mv}">${meta[0]}</span>`;
            }).join("");
            return `
                <article class="sample-hand sample-hand--${outcome.success ? "pass" : "miss"}">
                    <div class="sample-hand-top">
                        <strong>${outcome.success ? "GOOD OUTCOME" : "CLUNKY / SLOW"}</strong>
                        <span>${outcome.lands_in_play} lands · ${outcome.nonland_permanents} nonland permanents · ${outcome.damage} damage · ${outcome.value_score} value/answer</span>
                    </div>
                    <div class="commander-token-row">${tokens}</div>
                </article>
            `;
        }).join("");
    }

    function updateCommanderReadiness({ reroll = false } = {}) {
        const { deck, goal } = readCommanderState();
        const total = Object.entries(deck).reduce((sum, [key, value]) => key === "other" ? sum : sum + value, 0) + deck.other;
        const otherEl = document.getElementById("deck-other");
        const totalEl = document.getElementById("deck-total");
        const goalEl = document.getElementById("goal-summary");
        if (otherEl) otherEl.textContent = String(deck.other);
        if (totalEl) totalEl.textContent = String(total);
        if (goalEl) goalEl.textContent = goalSummary(goal);

        const summary = aggregate(deck, goal);
        const probabilityEl = document.getElementById("opening-probability");
        const labelEl = document.getElementById("opening-label");
        const noteEl = document.getElementById("simulation-note");
        if (probabilityEl) probabilityEl.textContent = pct(summary.success_rate);
        if (labelEl) labelEl.textContent = scoreLabel(summary.success_rate);
        if (noteEl) noteEl.textContent = `Interactive model: ${summary.runs} simulated openings. ${goalSummary(goal)}.`;

        renderOutcomeGrid(summary);
        renderAdvice(summary, goal);
        if (reroll) renderSampleHands(deck, goal);
    }

    (function () {
        document.querySelectorAll(".commander-input-row input").forEach((input) => {
            input.addEventListener("input", () => updateCommanderReadiness({ reroll: false }));
        });
        const reroll = document.getElementById("sample-reroll");
        if (reroll) reroll.addEventListener("click", () => {
            const { deck, goal } = readCommanderState();
            renderSampleHands(deck, goal);
            updateCommanderReadiness({ reroll: false });
        });
        updateCommanderReadiness({ reroll: false });
    })();
    """.replace("__PAYLOAD__", payload)


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng_seed = seed if seed is not None else today.toordinal()

    deck = _deck_with_other(DEFAULT_DECK)
    goal = _goal_from_defaults()
    summary = _aggregate_simulation(deck, goal, rng_seed)
    hands = _sample_hands(deck, goal, rng_seed)

    cards = [
        CardItem(
            "deck_recipe",
            "Deck + Mana Model",
            "99-Card Composition",
            _deck_recipe_html(deck),
        ),
        CardItem(
            "turn_goal",
            "Turn 5–6 Value Checklist",
            "Mana, Board, Damage, Value",
            _mana_goal_html(goal),
        ),
        CardItem(
            "probability_meter",
            "Outcome Forecast",
            "How Often It Comes Together",
            _probability_meter_html(summary, goal),
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
            _tuning_advice_html(summary, goal),
        ),
    ]

    footer = (
        f"{THEME_CONFIG['footer_text']} Default recipe: "
        f"{deck['lands']} lands, {deck['cheap_creatures'] + deck['mid_creatures']} creatures, "
        f"{deck['cheap_auras'] + deck['mid_auras']} auras, "
        f"{deck['cheap_interaction'] + deck['mid_interaction']} interaction, "
        f"{deck['value_engines']} value/ramp, {deck['other']} other."
    )

    return PageContext(
        page_title=f"Commander Opening Plan — {today.strftime('%B %d, %Y')}",
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=(
            "Tune the deck buckets, mana values, commander cost, and outcome goals to see whether the deck produces useful board presence and damage by turns 5–6."
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
                f"{_format_pct(summary['success_rate'])} default outcome confidence · mana-aware · value-focused"
            ),
            "extra_css": _extra_css(),
            "extra_js": _extra_js(deck, goal, rng_seed),
            "extra_head_html": _extra_head_html(),
        },
    )
