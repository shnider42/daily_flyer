from __future__ import annotations

import json
import random
from html import escape
from typing import Any

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "commander_readiness"
DECK_SIZE = 99
SIMULATION_RUNS = 600

THEME_CONFIG = {
    "page_title": "Commander Opening Plan — Daily Flyer",
    "header_title": "Commander Opening Plan",
    "header_subtitle": "Paste a Moxfield-style Commander export, map card names to real card data, then estimate early-game readiness.",
    "footer_text": "Built on Daily Flyer. Commander readiness prototype.",
    "hero_kicker": "Daily Flyer • Magic Commander Theme",
    "hero_summary_pill": "Moxfield export intake · card-data lookup · opening readiness · recommendation experiments",
}

DEFAULT_DECK = {
    "lands": 37,
    "cheap_creatures": 8,
    "mid_creatures": 10,
    "cheap_payoffs": 14,
    "mid_payoffs": 8,
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
    "payoff_bonus": 2,
}

DECK_INPUTS = (
    ("lands", "Lands", "Mana base; one land can be played per turn."),
    ("cheap_creatures", "Cheap creatures", "MV 1–2 creatures or early bodies."),
    ("mid_creatures", "Mid creatures", "MV 3+ bodies / payoff creatures."),
    ("cheap_payoffs", "Cheap payoffs", "MV 1–2 equipment, aura-like, or pressure pieces."),
    ("mid_payoffs", "Mid payoffs", "MV 3+ equipment, aura-like, or larger payoffs."),
    ("cheap_interaction", "Cheap interaction", "MV 1–2 removal, protection, tutors, tricks, answers."),
    ("mid_interaction", "Mid interaction", "MV 3+ removal, board wipes, protection, or higher-cost answers."),
    ("value_engines", "Ramp / draw / value", "Mana rocks, ramp, draw, treasures, tokens, tutors, or repeated value."),
)

TOKEN_META = {
    "land": ("🟫", "Land"),
    "cheap_creature": ("🧍", "Cheap creature"),
    "mid_creature": ("🧍", "Mid creature"),
    "cheap_payoff": ("🟣", "Cheap payoff"),
    "mid_payoff": ("🔮", "Mid payoff"),
    "cheap_interaction": ("⚡", "Cheap interaction"),
    "mid_interaction": ("🌩️", "Mid interaction"),
    "value_engine": ("💎", "Value"),
    "other": ("◇", "Other"),
}

RECOMMENDATION_PLANS = (
    {
        "title": "Add cheap early bodies",
        "adds": {"cheap_creatures": 2},
        "removes": {"other": 2},
        "why": "Tests whether more low-cost bodies improve early board development and pressure.",
    },
    {
        "title": "Add ramp / draw / value",
        "adds": {"value_engines": 2},
        "removes": {"other": 2},
        "why": "Tests whether more early resources improve castability and value score.",
    },
    {
        "title": "Add live early interaction",
        "adds": {"cheap_interaction": 2},
        "removes": {"other": 2},
        "why": "Tests whether more cheap protection, removal, or answers are available while developing.",
    },
    {
        "title": "Lower the payoff curve",
        "adds": {"cheap_payoffs": 2},
        "removes": {"mid_payoffs": 2},
        "why": "Tests whether similar payoff density performs better when more of it costs 1–2 mana.",
    },
    {
        "title": "Raise the early resource floor",
        "adds": {"lands": 1, "value_engines": 1},
        "removes": {"other": 2},
        "why": "Tests a conservative mana/value adjustment instead of adding more payoff cards.",
    },
)

EXAMPLE_DECKLIST = """1 Academy Manufactor
1 Akroma's Will
1 Anim Pakal, Thousandth Moon
1 Anointed Procession
1 Arcane Signet
1 Arid Mesa
1 Azusa, Lost but Seeking
1 Badlands
1 Bayou
1 Beamtown Beatstick
1 Birds of Paradise
1 Black Market Connections
1 Blasphemous Act
1 Blood Artist
1 Blood Crypt
1 Bloodstained Mire
1 Braids, Arisen Nightmare
1 Bristly Bill, Spine Sower
1 Command Tower
1 Conduit of Worlds
1 Crop Rotation
1 Crucible of Worlds
1 Dark Ritual
1 Deadly Rollick
1 Demonic Tutor
1 Doubling Season
1 Eldritch Evolution
1 Enlightened Tutor
1 Esper Sentinel
1 Exalted Sunborn
1 Exotic Orchard
1 Exploration
3 Forest
1 Gamble
1 Generous Plunderer
1 Gilded Goose
1 Godless Shrine
1 Hearthhull, the Worldseed
1 Icetill Explorer
1 Ignoble Hierarch
1 Illustrious Wanderglyph
1 Kellogg, Dangerous Mind
1 Knuckles's Gloves
1 Lotho, Corrupt Shirriff
1 Lotus Cobra
1 Lumra, Bellow of the Woods
1 Luxury Suite
1 Mahadi, Emporium Master
1 Marsh Flats
1 Mayhem Devil
1 Mirkwood Bats
1 Mondrak, Glory Dominus
1 Monologue Tax
2 Mountain
1 Mox Opal
1 Nature's Lore
1 Olivia, Opulent Outlaw
1 Overgrown Tomb
1 Path to Exile
2 Plains
1 Plateau
1 Rampant Growth
1 Ramunap Excavator
1 Reanimate
1 Ruthless Technomancer
1 Sacred Foundry
1 Savannah
1 Scrubland
1 Six
1 Slicer, Hired Muscle
1 Smothering Tithe
1 Sol Ring
1 Spire Garden
1 Stomping Ground
3 Swamp
1 Swords to Plowshares
1 Taiga
1 Temple Garden
1 The Meathook Massacre
1 Three Visits
1 Tireless Provisioner
1 Toxic Deluge
1 Unexpected Windfall
1 Verdant Catacombs
1 Warren Soultrader
1 Wayward Swordtooth
1 Windswept Heath
1 Wooded Foothills
1 Worldly Tutor
1 Xorn
1 Zidane Tribal
1 Zulaport Cutthroat

1 Korvold, Fae-Cursed King
1 Vihaan, Goldwaker"""


def _deck_with_other(deck: dict[str, int]) -> dict[str, int]:
    clean = {key: max(0, int(deck.get(key, 0))) for key, _, _ in DECK_INPUTS}
    clean["other"] = max(0, DECK_SIZE - sum(clean.values()))
    return clean


def _goal_from_defaults() -> dict[str, int]:
    return {key: int(value) for key, value in DEFAULT_GOAL.items()}


def _format_pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def _format_delta(value: float) -> str:
    sign = "+" if value >= 0 else ""
    return f"{sign}{value * 100:.1f} pts"


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


def _build_deck_cards(deck: dict[str, int], payoff_bonus: int) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []

    def add(count: int, **attrs: Any) -> None:
        for idx in range(max(0, count)):
            card = dict(attrs)
            card["id"] = f"{attrs['kind']}-{idx}"
            cards.append(card)

    add(deck["lands"], kind="land", mv=0, permanent=True, damage=0, value=0)
    add(deck["cheap_creatures"], kind="cheap_creature", mv_cycle=(1, 2), permanent=True, creature=True, damage=2, value=0)
    add(deck["mid_creatures"], kind="mid_creature", mv_cycle=(3, 4), permanent=True, creature=True, damage=3, value=0)
    add(deck["cheap_payoffs"], kind="cheap_payoff", mv_cycle=(1, 2), permanent=True, payoff=True, damage=max(1, payoff_bonus), value=0)
    add(deck["mid_payoffs"], kind="mid_payoff", mv_cycle=(3, 4), permanent=True, payoff=True, damage=max(1, payoff_bonus + 1), value=0)
    add(deck["cheap_interaction"], kind="cheap_interaction", mv_cycle=(1, 2), permanent=False, interaction=True, damage=0, value=0)
    add(deck["mid_interaction"], kind="mid_interaction", mv_cycle=(3, 4), permanent=False, interaction=True, damage=0, value=0)
    add(deck["value_engines"], kind="value_engine", mv_cycle=(1, 2, 3), permanent=True, value_engine=True, damage=0, value=1)
    add(deck["other"], kind="other", mv_cycle=(2, 3, 4), permanent=False, damage=0, value=0)

    for card in cards:
        cycle = card.pop("mv_cycle", None)
        if cycle:
            suffix = int(str(card["id"]).split("-")[-1])
            card["mv"] = cycle[suffix % len(cycle)]
    return cards


def _kind_priority(card: dict[str, Any], has_body: bool) -> tuple[int, int]:
    kind = card["kind"]
    if kind == "value_engine":
        return (0, card["mv"])
    if kind == "cheap_creature":
        return (1, card["mv"])
    if kind == "mid_creature":
        return (2, card["mv"])
    if kind in ("cheap_payoff", "mid_payoff"):
        return ((3 if has_body else 8), card["mv"])
    if "interaction" in kind:
        return (6, card["mv"])
    return (9, card["mv"])


def _simulate_opening(deck: dict[str, int], goal: dict[str, int], seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    cards = _build_deck_cards(deck, goal["payoff_bonus"])
    cards_seen = _clamp(goal.get("cards_seen", 7 + goal["target_turn"]), 7, len(cards))
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

    def has_body() -> bool:
        return commander_cast or any(card.get("creature") for card in cast_cards)

    remaining = sorted(usable_spells, key=lambda card: _kind_priority(card, has_body()))
    changed = True
    while changed:
        changed = False
        remaining = sorted(remaining, key=lambda card: _kind_priority(card, has_body()))
        for card in list(remaining):
            if card.get("payoff") and not has_body():
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
    nonland_permanents = (1 if commander_cast else 0) + sum(1 for card in cast_cards if card.get("permanent"))
    damage = (goal["commander_power"] if commander_cast else 0) + sum(card.get("damage", 0) for card in cast_cards)
    value_score += min(2, interaction_ready)

    return {
        "drawn": drawn,
        "lands_in_play": lands_in_play,
        "peak_mana": peak_mana + virtual_resource_bonus,
        "commander_cast": commander_cast,
        "cast_cards": cast_cards,
        "payoffs": sum(1 for card in cast_cards if card.get("payoff")),
        "interaction_ready": interaction_ready,
        "nonland_permanents": nonland_permanents,
        "battlefield_permanents": lands_in_play + nonland_permanents,
        "damage": damage,
        "value_score": value_score,
        "success": (
            commander_cast
            and nonland_permanents >= goal["nonland_permanents_min"]
            and damage >= goal["damage_min"]
            and value_score >= goal["value_min"]
        ),
    }


def _aggregate_simulation(deck: dict[str, int], goal: dict[str, int], seed: int, runs: int = SIMULATION_RUNS) -> dict[str, Any]:
    outcomes = [_simulate_opening(deck, goal, seed + idx * 17) for idx in range(runs)]

    def avg(key: str) -> float:
        return sum(float(outcome[key]) for outcome in outcomes) / len(outcomes)

    return {
        "success_rate": sum(1 for outcome in outcomes if outcome["success"]) / len(outcomes),
        "commander_rate": sum(1 for outcome in outcomes if outcome["commander_cast"]) / len(outcomes),
        "interaction_rate": sum(1 for outcome in outcomes if outcome["interaction_ready"] > 0) / len(outcomes),
        "avg_nonland": avg("nonland_permanents"),
        "avg_battlefield": avg("battlefield_permanents"),
        "avg_damage": avg("damage"),
        "avg_value": avg("value_score"),
        "avg_payoffs": avg("payoffs"),
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


def _apply_recommendation_plan(deck: dict[str, int], plan: dict[str, Any]) -> dict[str, int] | None:
    variant = dict(deck)
    for key, count in plan.get("removes", {}).items():
        if variant.get(key, 0) < count:
            return None
        variant[key] -= count
    for key, count in plan.get("adds", {}).items():
        variant[key] = variant.get(key, 0) + count
    return variant


def _format_plan_changes(plan: dict[str, Any]) -> str:
    adds = [f"+{count} {key.replace('_', ' ')}" for key, count in plan.get("adds", {}).items()]
    removes = [f"-{count} {key.replace('_', ' ')}" for key, count in plan.get("removes", {}).items()]
    return " · ".join(adds + removes)


def _recommendation_experiments(deck: dict[str, int], goal: dict[str, int], baseline_summary: dict[str, Any], seed: int) -> list[dict[str, Any]]:
    experiments: list[dict[str, Any]] = []
    for index, plan in enumerate(RECOMMENDATION_PLANS):
        variant = _apply_recommendation_plan(deck, plan)
        if variant is None:
            continue
        summary = _aggregate_simulation(variant, goal, seed + 1009 + index * 97)
        experiments.append(
            {
                "title": plan["title"],
                "changes": _format_plan_changes(plan),
                "why": plan["why"],
                "summary": summary,
                "delta": summary["success_rate"] - baseline_summary["success_rate"],
            }
        )
    experiments.sort(key=lambda item: item["delta"], reverse=True)
    return experiments


def _deck_submission_html() -> str:
    return f"""
        <div class="commander-panel deck-intake-panel">
            <p class="commander-lede">Paste a Moxfield export-style list: <code>1 Card Name</code> per line. Direct Moxfield deck URLs are recognized, but this MVP still needs the exported/pasted list so the browser can map card names to card data.</p>
            <div class="deck-intake-grid">
                <label class="commander-input-row deck-intake-field">
                    <span><strong>Deck name</strong><small>Used only for the on-page summary.</small></span>
                    <input id="deck-name-input" type="text" value="Moxfield Deck Test" autocomplete="off">
                </label>
                <label class="commander-input-row deck-intake-field">
                    <span><strong>Commander candidate(s)</strong><small>Auto-detected from a final 1–2 card block when present.</small></span>
                    <input id="commander-name-input" type="text" value="Korvold, Fae-Cursed King / Vihaan, Goldwaker" autocomplete="off">
                </label>
            </div>
            <label class="decklist-label" for="decklist-input">
                <strong>Moxfield export / plain exported decklist</strong>
                <small>Primary format: <code>1 Sol Ring</code>. Optional override: <code>1 Sol Ring # value_engine</code>.</small>
            </label>
            <textarea id="decklist-input" class="decklist-input" spellcheck="false" placeholder="1 Academy Manufactor&#10;1 Akroma's Will&#10;1 Arcane Signet&#10;3 Forest&#10;&#10;1 Korvold, Fae-Cursed King"></textarea>
            <div class="deck-intake-actions">
                <button class="commander-btn" type="button" id="analyze-decklist">Analyze with card lookup</button>
                <button class="commander-btn commander-btn--ghost" type="button" id="load-example-decklist">Load Korvold / Vihaan example</button>
                <button class="commander-btn commander-btn--ghost" type="button" id="clear-decklist">Clear</button>
            </div>
            <div id="deck-intake-status" class="deck-intake-status" aria-live="polite">
                <strong>Moxfield export intake ready.</strong>
                <span>Paste a quantity/card-name list, then analyze. The tool will use card data when available and fall back to guesses only when needed.</span>
            </div>
            <details class="deck-intake-help">
                <summary>Optional category tags and commander detection</summary>
                <p>The normal format is just <code>1 Card Name</code>. To override lookup/guessing, add <code># land</code>, <code># cheap_creature</code>, <code># mid_creature</code>, <code># cheap_payoff</code>, <code># mid_payoff</code>, <code># cheap_interaction</code>, <code># mid_interaction</code>, <code># value_engine</code>, or <code># other</code>. If there is no <code>Commander:</code> header, the final blank-separated block of one or two cards is treated as command-zone candidate(s), not library cards.</p>
            </details>
            <script type="application/json" id="example-decklist-json">{escape(json.dumps(EXAMPLE_DECKLIST))}</script>
        </div>
    """


def _deck_recipe_html(deck: dict[str, int]) -> str:
    controls = "".join(
        f"""
        <label class="commander-input-row">
            <span><strong>{escape(label)}</strong><small>{escape(help_text)}</small></span>
            <input id="deck-{escape(key)}" type="number" min="0" max="99" value="{deck[key]}" inputmode="numeric">
        </label>
        """
        for key, label, help_text in DECK_INPUTS
    )
    return f"""
        <div class="commander-panel">
            <p class="commander-lede">These buckets are the simulation inputs. Deck intake can fill them from Moxfield-style names plus card data; you can still adjust any bucket by hand.</p>
            <div class="commander-controls">{controls}</div>
            <div class="commander-derived">
                <span>Commander: <strong id="commander-summary">available, but costs mana</strong></span>
                <span>Other / unresolved cards: <strong id="deck-other">{deck['other']}</strong></span>
                <span>Total library model: <strong id="deck-total">{DECK_SIZE}</strong></span>
            </div>
        </div>
    """


def _mana_goal_html(goal: dict[str, int]) -> str:
    fields = (
        ("target-turn", "Target turn", "Usually turn 5 or turn 6.", goal["target_turn"], 3, 8),
        ("commander-mv", "Commander mana value", "Commander is always accessible, but not free.", goal["commander_mv"], 0, 10),
        ("commander-power", "Commander power", "Used for rough damage-pressure estimates.", goal["commander_power"], 0, 20),
        ("cards-seen", "Cards seen", "Opening hand plus draw steps.", goal["cards_seen"], 7, 20),
        ("nonland-permanents-min", "Board pieces goal", "Nonland permanents: commander, creatures, payoffs, value engines.", goal["nonland_permanents_min"], 0, 20),
        ("damage-min", "Damage pressure goal", "Rough potential damage, not exact combat math.", goal["damage_min"], 0, 40),
        ("value-min", "Value / answer goal", "Draw/ramp/value engines plus ready interaction.", goal["value_min"], 0, 10),
        ("restriction-friction", "Restriction friction %", "Card text, timing, target, color, or board-state restrictions.", goal["restriction_friction"], 0, 95),
        ("payoff-bonus", "Payoff damage bonus", "Average pressure from a cast payoff/equipment/aura-like card.", goal["payoff_bonus"], 0, 10),
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
            <p class="commander-lede">The target is value-oriented: do we get enough mana, board presence, pressure, and usable value/answers by the target turn?</p>
            <div class="goal-grid">{controls}</div>
            <div class="commander-derived"><span id="goal-summary">{escape(_goal_summary(goal))}</span></div>
        </div>
    """


def _probability_meter_html(summary: dict[str, Any], goal: dict[str, int]) -> str:
    stat_rows = (
        ("Commander castable", _format_pct(summary["commander_rate"])),
        ("Interaction/value seen", _format_pct(summary["interaction_rate"])),
        ("Avg nonland board pieces", f"{summary['avg_nonland']:.1f}"),
        ("Avg battlefield permanents", f"{summary['avg_battlefield']:.1f}"),
        ("Avg damage pressure", f"{summary['avg_damage']:.1f}"),
        ("Avg value / answer score", f"{summary['avg_value']:.1f}"),
    )
    rows_html = "".join(
        f"<div class='stat-tile'><span>{escape(label)}</span><strong>{escape(value)}</strong></div>"
        for label, value in stat_rows
    )
    success = summary["success_rate"]
    return f"""
        <div class="commander-panel">
            <div class="confidence-hero">
                <span class="confidence-title">Opening Readiness</span>
                <span class="confidence-number" id="opening-probability">{_format_pct(success)}</span>
                <span class="confidence-label" id="opening-label">{escape(_score_label(success))}</span>
            </div>
            <p class="commander-lede"><strong>This percentage is the estimated chance of hitting the selected early-game outcome.</strong> It is not “percent tuning needed.” A 0.0% result means this model did not see the deck meeting the target in the simulations, often because the pasted input was not parsed or too many cards were unresolved.</p>
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
        tokens.append(f"<span class='{classes}' title='{escape(label)} · MV {card['mv']}'>{emoji}</span>")
    verdict = "GOOD OUTCOME" if outcome["success"] else "CLUNKY / SLOW"
    verdict_class = "pass" if outcome["success"] else "miss"
    return f"""
        <article class="sample-hand sample-hand--{verdict_class}">
            <div class="sample-hand-top"><strong>{verdict}</strong><span>{outcome['lands_in_play']} lands · {outcome['nonland_permanents']} nonland permanents · {outcome['damage']} damage · {outcome['value_score']} value/answer</span></div>
            <div class="commander-token-row">{''.join(tokens)}</div>
        </article>
    """


def _sample_hands_html(hands: list[dict[str, Any]]) -> str:
    return f"""
        <div class="commander-panel">
            <p class="commander-lede">Sample openings show whether cards are likely to be castable. Highlighted tokens were spent into the board/value model.</p>
            <div class="token-legend"><span>🟫 Land</span><span>🧍 Creature</span><span>🟣 Payoff</span><span>⚡ Interaction</span><span>💎 Value</span><span>Outlined = castable/used</span></div>
            <div id="sample-hands" class="sample-hand-list">{''.join(_token_row_html(hand) for hand in hands)}</div>
            <button class="commander-btn" type="button" id="sample-reroll">Reroll sample hands</button>
        </div>
    """


def _tuning_advice_html(summary: dict[str, Any], goal: dict[str, int]) -> str:
    advice: list[str] = []
    if summary["commander_rate"] < 0.80:
        advice.append("Commander access is being limited by mana. Lower the commander mana value assumption, add ramp/value, or increase early land consistency.")
    if summary["avg_nonland"] < goal["nonland_permanents_min"]:
        advice.append("The deck is not putting enough nonland material onto the board by the target turn. Cheap creatures, cheap payoffs, and value engines help more than expensive payoffs.")
    if summary["avg_damage"] < goal["damage_min"]:
        advice.append("Damage pressure is below the target. Either the payoff assumption is too low, or too many cards are not castable early enough.")
    if summary["avg_value"] < goal["value_min"]:
        advice.append("The value/answer score is light. Add draw, ramp, protection, or cheap interaction that is live in the first few turns.")
    if not advice:
        advice.append("The model likes this opening plan. Next improvement would be deeper commander-specific card text modeling.")
    bullets = "".join(f"<li>{escape(item)}</li>" for item in advice)
    return f"""
        <div class="commander-panel"><div class="advice-stack" id="tuning-advice">
            <p><strong>Opening Readiness:</strong> {_format_pct(summary['success_rate'])} ({escape(_score_label(summary['success_rate']))}).</p>
            <p><strong>What changed:</strong> intake can now start from a Moxfield export-style list, then classify from card lookup plus fallback tags/guesses.</p>
            <ul>{bullets}</ul>
            <p class="commander-hint">Best next version: direct Moxfield URL import or server-side deck import, then commander-specific assumptions.</p>
        </div></div>
    """


def _recommendations_html(recommendations: list[dict[str, Any]], baseline_summary: dict[str, Any]) -> str:
    if not recommendations:
        body = "<p>No valid category-level experiments could be generated from this recipe.</p>"
    else:
        cards = []
        for rank, item in enumerate(recommendations[:4], start=1):
            summary = item["summary"]
            delta_class = "is-positive" if item["delta"] >= 0 else "is-negative"
            cards.append(
                f"""
                <article class="recommendation-card"><div class="recommendation-rank">#{rank}</div><div class="recommendation-copy">
                    <h3>{escape(item['title'])}</h3><p class="recommendation-change">{escape(item['changes'])}</p><p>{escape(item['why'])}</p>
                    <div class="recommendation-metrics"><span>Opening Readiness: <strong>{_format_pct(baseline_summary['success_rate'])} → {_format_pct(summary['success_rate'])}</strong></span><span class="{delta_class}">Lift: <strong>{_format_delta(item['delta'])}</strong></span></div>
                </div></article>
                """
            )
        body = "".join(cards)
    return f"""
        <div class="commander-panel">
            <p class="commander-lede">These are not card-name recommendations. They are category-level experiments: change a few buckets, rerun the model, and rank what improved Opening Readiness most.</p>
            <div id="recommendations-list" class="recommendations-list">{body}</div>
            <p class="commander-hint">Use this as a conversation starter with someone who knows the deck. The model still simplifies actual card quality and commander text.</p>
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
    body { font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at 8% 10%, rgba(144, 83, 255, 0.18), transparent 24%), radial-gradient(circle at 88% 12%, rgba(255, 185, 91, 0.16), transparent 24%), radial-gradient(circle at 50% 100%, rgba(77, 201, 164, 0.14), transparent 28%), linear-gradient(180deg, #16101f 0%, #101826 46%, #071018 100%); }
    header.hero { background: radial-gradient(circle at top left, rgba(156, 100, 255, 0.20), transparent 30%), radial-gradient(circle at 80% 20%, rgba(255, 190, 99, 0.12), transparent 26%), linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03)), linear-gradient(150deg, rgba(38, 25, 57, 0.94), rgba(17, 27, 44, 0.95)); }
    .hero h1, h2, .confidence-number { font-family: "Cinzel", Georgia, serif; }
    .card::after { background: linear-gradient(90deg, #9c64ff, #ffbe63, #4dc9a4); }
    .card--deck_submission, .card--tuning_advice, .card--recommendations { grid-column: span 12; }
    .card--deck_recipe { grid-column: span 5; } .card--turn_goal { grid-column: span 7; } .card--probability_meter, .card--sample_hands { grid-column: span 6; }
    .commander-panel { display: grid; gap: 0.95rem; } .commander-lede, .commander-hint { color: #d3cce2; margin: 0; } .commander-hint { font-size: 0.92rem; }
    .commander-controls, .goal-grid, .sample-hand-list, .advice-stack, .recommendations-list, .deck-intake-panel { display: grid; gap: 0.75rem; }
    .goal-grid, .deck-intake-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
    .commander-input-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.8rem 0.9rem; border-radius: 16px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09); }
    .commander-input-row span { display: grid; gap: 0.16rem; } .commander-input-row small { color: #b8adc9; line-height: 1.25; }
    .commander-input-row input { width: 76px; border: 1px solid rgba(255,255,255,0.16); border-radius: 12px; padding: 0.55rem 0.6rem; background: rgba(255,255,255,0.08); color: var(--ink); font: inherit; font-weight: 800; }
    .deck-intake-field { align-items: stretch; } .deck-intake-field input { width: min(340px, 100%); font-weight: 700; }
    .decklist-label { display: grid; gap: 0.2rem; color: var(--ink); } .decklist-label small, .deck-intake-help, .deck-intake-status { color: #d3cce2; } .decklist-label code, .deck-intake-help code { color: #ffdf9a; }
    .decklist-input { width: 100%; min-height: 250px; resize: vertical; border: 1px solid rgba(255,255,255,0.14); border-radius: 18px; background: rgba(5, 8, 14, 0.38); color: var(--ink); font: 0.92rem/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 0.9rem; }
    .deck-intake-actions { display: flex; flex-wrap: wrap; gap: 0.55rem; } .deck-intake-status { display: grid; gap: 0.25rem; padding: 0.8rem 0.9rem; border-radius: 16px; background: rgba(77, 201, 164, 0.09); border: 1px solid rgba(77, 201, 164, 0.18); } .deck-intake-status strong { color: var(--ink); }
    .deck-intake-help summary { cursor: pointer; color: #ffdf9a; font-weight: 800; } .deck-intake-help p { margin: 0.55rem 0 0; }
    .commander-derived, .token-legend { display: flex; flex-wrap: wrap; gap: 0.55rem; }
    .commander-derived span, .token-legend span, .stat-tile { border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.06); border-radius: 18px; padding: 0.55rem 0.72rem; font-size: 0.86rem; }
    .confidence-hero { display: grid; gap: 0.25rem; padding: 1rem; border-radius: 22px; border: 1px solid rgba(255,255,255,0.10); background: linear-gradient(135deg, rgba(156, 100, 255, 0.18), rgba(255, 190, 99, 0.10)); }
    .confidence-title { color: #ffdf9a; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; } .confidence-number { font-size: clamp(2.2rem, 7vw, 4.4rem); line-height: 1; letter-spacing: -0.05em; } .confidence-label { font-weight: 800; color: #ffdf9a; text-transform: uppercase; letter-spacing: 0.08em; }
    .outcome-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; } .stat-tile { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; } .stat-tile span { color: #d3cce2; } .stat-tile strong { color: var(--ink); font-size: 1.08rem; }
    .sample-hand, .recommendation-card { padding: 0.85rem; border-radius: 18px; background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.09); }
    .sample-hand--pass { border-color: rgba(77, 201, 164, 0.38); } .sample-hand--miss { border-color: rgba(255, 190, 99, 0.20); }
    .sample-hand-top { display: flex; justify-content: space-between; gap: 0.7rem; color: #d3cce2; font-size: 0.86rem; margin-bottom: 0.55rem; } .sample-hand-top strong { color: var(--ink); }
    .commander-token-row { display: flex; flex-wrap: wrap; gap: 0.28rem; } .commander-token { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 10px; background: rgba(255,255,255,0.075); border: 1px solid rgba(255,255,255,0.09); font-size: 0.95rem; opacity: 0.68; } .commander-token.is-cast { opacity: 1; outline: 2px solid rgba(77, 201, 164, 0.65); box-shadow: 0 0 16px rgba(77, 201, 164, 0.18); }
    .commander-btn { width: fit-content; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.08); color: var(--ink); border-radius: 14px; cursor: pointer; font: inherit; font-weight: 800; padding: 0.72rem 1rem; } .commander-btn:hover { background: rgba(255,255,255,0.13); transform: translateY(-1px); } .commander-btn--ghost { background: rgba(255,255,255,0.035); }
    .advice-stack p { margin: 0; } .advice-stack ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.45rem; color: #d3cce2; }
    .recommendation-card { display: grid; grid-template-columns: auto 1fr; gap: 0.85rem; align-items: flex-start; } .recommendation-rank { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 15px; background: rgba(255, 190, 99, 0.14); border: 1px solid rgba(255, 190, 99, 0.24); color: #ffdf9a; font-weight: 900; } .recommendation-copy { display: grid; gap: 0.45rem; } .recommendation-copy h3 { margin: 0; font-size: 1.08rem; } .recommendation-copy p { margin: 0; color: #d3cce2; } .recommendation-change { color: #ffdf9a !important; font-weight: 800; }
    .recommendation-metrics { display: flex; flex-wrap: wrap; gap: 0.55rem; } .recommendation-metrics span { padding: 0.38rem 0.55rem; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09); color: #d3cce2; font-size: 0.84rem; } .recommendation-metrics strong, .is-positive strong { color: #8ef1c2; } .is-negative strong { color: #ffb6a7; }
    @media (max-width: 980px) { .card--deck_submission, .card--deck_recipe, .card--turn_goal, .card--probability_meter, .card--sample_hands, .card--tuning_advice, .card--recommendations { grid-column: span 12; } }
    @media (max-width: 720px) { .goal-grid, .outcome-grid, .deck-intake-grid { grid-template-columns: 1fr; } .commander-input-row { align-items: stretch; } .sample-hand-top { flex-direction: column; } .recommendation-card { grid-template-columns: 1fr; } }
    """


def _extra_js(deck: dict[str, int], goal: dict[str, int], seed: int) -> str:
    payload = json.dumps({"deck": deck, "goal": goal, "seed": seed}, ensure_ascii=False)
    plans = json.dumps(RECOMMENDATION_PLANS, ensure_ascii=False)
    return r"""
    const COMMANDER_INIT = __PAYLOAD__;
    const RECOMMENDATION_PLANS = __PLANS__;
    const DECK_SIZE = 99;
    const INTERACTIVE_RUNS = 300;
    const DECK_STORAGE_KEY = "dailyFlyerCommanderDeckIntake";
    const MODEL_KEYS = ["lands", "cheap_creatures", "mid_creatures", "cheap_payoffs", "mid_payoffs", "cheap_interaction", "mid_interaction", "value_engines"];
    const TOKEN_META = { land: ["🟫", "Land"], cheap_creature: ["🧍", "Cheap creature"], mid_creature: ["🧍", "Mid creature"], cheap_payoff: ["🟣", "Cheap payoff"], mid_payoff: ["🔮", "Mid payoff"], cheap_interaction: ["⚡", "Cheap interaction"], mid_interaction: ["🌩️", "Mid interaction"], value_engine: ["💎", "Value"], other: ["◇", "Other"] };
    const LAND_NAMES = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes", "arid mesa", "badlands", "bayou", "blood crypt", "bloodstained mire", "command tower", "exotic orchard", "godless shrine", "luxury suite", "marsh flats", "overgrown tomb", "plateau", "sacred foundry", "savannah", "scrubland", "spire garden", "stomping ground", "taiga", "temple garden", "verdant catacombs", "windswept heath", "wooded foothills"]);
    const TAG_ALIASES = { land: "lands", lands: "lands", creature: "cheap_creatures", creatures: "cheap_creatures", cheap_creature: "cheap_creatures", cheap_creatures: "cheap_creatures", mid_creature: "mid_creatures", mid_creatures: "mid_creatures", aura: "cheap_payoffs", equipment: "cheap_payoffs", payoff: "cheap_payoffs", cheap_payoff: "cheap_payoffs", cheap_payoffs: "cheap_payoffs", mid_payoff: "mid_payoffs", mid_payoffs: "mid_payoffs", interaction: "cheap_interaction", instant: "cheap_interaction", sorcery: "cheap_interaction", removal: "cheap_interaction", protection: "cheap_interaction", cheap_interaction: "cheap_interaction", mid_interaction: "mid_interaction", answer: "mid_interaction", answers: "mid_interaction", value: "value_engines", value_engine: "value_engines", value_engines: "value_engines", draw: "value_engines", ramp: "value_engines", treasure: "value_engines", token: "value_engines", tutor: "value_engines", other: "other", unknown: "other", flex: "other" };

    function readInt(id, fallback) { const el = document.getElementById(id); if (!el) return fallback; const value = parseInt(el.value, 10); return Number.isFinite(value) ? Math.max(0, value) : fallback; }
    function pct(value) { return `${(value * 100).toFixed(1)}%`; }
    function delta(value) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pts`; }
    function scoreLabel(value) { if (value >= 0.70) return "Strong"; if (value >= 0.50) return "Playable"; if (value >= 0.30) return "Developing"; return "Needs tuning"; }
    function normalizedName(name) { return String(name || "").toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim(); }
    function lineQuantity(rawLine) { const trimmed = rawLine.trim(); const leading = trimmed.match(/^(\d+)x?\s+/i); if (leading) return Math.max(1, parseInt(leading[1], 10)); const trailing = trimmed.match(/\s+x(\d+)\s*$/i); if (trailing) return Math.max(1, parseInt(trailing[1], 10)); return 1; }
    function cleanCardName(raw) { return raw.replace(/^\s*\d+x?\s+/i, "").replace(/^\s*x\d+\s+/i, "").replace(/\s+x\d+\s*$/i, "").replace(/\s*\[[^\]]+\]\s*/g, " ").replace(/\s*\([^)]*\)\s*$/g, "").trim(); }
    function tagFromLine(rawLine) { const hash = rawLine.match(/#\s*([a-zA-Z_ -]+)/); const bracket = rawLine.match(/\[\s*([a-zA-Z_ -]+)\s*\]/); const rawTag = (hash || bracket || [null, ""])[1].toLowerCase().trim().replaceAll(" ", "_").replaceAll("-", "_"); return TAG_ALIASES[rawTag] || null; }
    function nonEmptyBlocks(text) { return text.split(/\n\s*\n+/).map((block) => block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)).filter((block) => block.length); }
    function cardNameFromLine(line) { return cleanCardName(line.split("#")[0]); }

    function guessedCategory(name) {
        const n = normalizedName(name);
        if (LAND_NAMES.has(n) || n.includes(" land") || n.endsWith("land")) return "lands";
        if (/(signet|tithe|treasure|manufactor|procession|season|engine|draw|ramp|lore|visits|ring|mox|exploration|crucible|worlds|tutor|provisioner|cobra|goose|birds of paradise|hierarch)/.test(n)) return "value_engines";
        if (/(swords to plowshares|path to exile|counterspell|deluge|blasphemous|rollick|removal|reanimate|will|ritual|rotation)/.test(n)) return "cheap_interaction";
        if (/(gloves|beatstick|aura|equipment|armor|blade|sword)/.test(n)) return "cheap_payoffs";
        return "other";
    }

    function parseDecklist(text) {
        const blocks = nonEmptyBlocks(text);
        let commanderNames = [];
        let deckLines = [];
        const hasExplicitCommander = /^commander\s*:?$/im.test(text);
        if (!hasExplicitCommander && blocks.length > 1) {
            const lastBlock = blocks[blocks.length - 1];
            const previousLines = blocks.slice(0, -1).flat();
            const lastBlockCards = lastBlock.reduce((sum, line) => sum + lineQuantity(line), 0);
            const previousCards = previousLines.reduce((sum, line) => sum + lineQuantity(line), 0);
            if (lastBlock.length <= 2 && lastBlockCards <= 2 && previousCards >= 60) { commanderNames = lastBlock.map(cardNameFromLine).filter(Boolean); deckLines = previousLines; }
            else deckLines = blocks.flat();
        } else if (!hasExplicitCommander) deckLines = blocks.flat();
        else {
            let mode = "deck";
            for (const raw of text.split(/\r?\n/)) {
                const line = raw.trim(); if (!line) continue;
                if (/^commander\s*:?$/i.test(line)) { mode = "commander"; continue; }
                if (/^(deck|main|mainboard)\s*:?$/i.test(line)) { mode = "deck"; continue; }
                if (/^(sideboard|maybeboard)\s*:?$/i.test(line)) { mode = "ignore"; continue; }
                if (mode === "ignore") continue;
                if (mode === "commander") { commanderNames.push(cardNameFromLine(line)); continue; }
                deckLines.push(line);
            }
        }
        const entries = [];
        for (const line of deckLines) {
            if (/^(deck|main|mainboard|commander|sideboard|maybeboard)\s*:?$/i.test(line)) continue;
            const quantity = lineQuantity(line); const name = cardNameFromLine(line); if (!name) continue;
            entries.push({ quantity, name, tag: tagFromLine(line) });
        }
        return { entries, commander: commanderNames.filter(Boolean).join(" / "), commanders: commanderNames.filter(Boolean), deckCards: entries.reduce((sum, entry) => sum + entry.quantity, 0) };
    }

    async function fetchCardData(names) {
        const unique = [...new Set(names.map(normalizedName).filter(Boolean))];
        const result = new Map();
        const chunkSize = 75;
        for (let i = 0; i < unique.length; i += chunkSize) {
            const chunk = unique.slice(i, i + chunkSize);
            const response = await fetch("https://api.scryfall.com/cards/collection", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
            });
            if (!response.ok) throw new Error(`Card lookup failed: ${response.status}`);
            const payload = await response.json();
            (payload.data || []).forEach((card) => result.set(normalizedName(card.name), card));
        }
        return result;
    }

    function cardHasValueText(oracle) { return /(draw|treasure|clue|food|token|create|search your library|add one mana|add .* mana|additional land|may play an additional land|whenever.*land|mana of any color)/.test(oracle); }
    function cardHasAnswerText(oracle) { return /(destroy target|exile target|counter target|prevent|protection|indestructible|damage to each|each creature|board wipe|return target|sacrifice)/.test(oracle); }

    function categoryFromCard(entry, card) {
        if (entry.tag) return entry.tag;
        if (!card) return guessedCategory(entry.name);
        const type = normalizedName(card.type_line || "");
        const oracle = normalizedName(card.oracle_text || "");
        const mv = Number(card.cmc ?? card.mana_value ?? 3);
        if (type.includes("land")) return "lands";
        if (cardHasValueText(oracle) || (type.includes("artifact") && oracle.includes("add"))) return "value_engines";
        if (type.includes("equipment") || type.includes("aura")) return mv <= 2 ? "cheap_payoffs" : "mid_payoffs";
        if (type.includes("instant") || type.includes("sorcery") || cardHasAnswerText(oracle)) return mv <= 2 ? "cheap_interaction" : "mid_interaction";
        if (type.includes("creature")) return mv <= 2 ? "cheap_creatures" : "mid_creatures";
        return guessedCategory(entry.name);
    }

    function classifyParsedDeck(parsed, cardMap) {
        const counts = { lands: 0, cheap_creatures: 0, mid_creatures: 0, cheap_payoffs: 0, mid_payoffs: 0, cheap_interaction: 0, mid_interaction: 0, value_engines: 0, other: 0 };
        const unresolved = [];
        let lookedUp = 0;
        let tagged = 0;
        for (const entry of parsed.entries) {
            const card = cardMap.get(normalizedName(entry.name));
            const category = categoryFromCard(entry, card);
            if (entry.tag) tagged += entry.quantity;
            if (card) lookedUp += entry.quantity;
            if (!card && category === "other") unresolved.push(entry.name);
            counts[category] = (counts[category] || 0) + entry.quantity;
        }
        return { counts, unresolved, lookedUp, tagged };
    }

    function readCommanderState() { const deck = { lands: readInt("deck-lands", 0), cheap_creatures: readInt("deck-cheap_creatures", 0), mid_creatures: readInt("deck-mid_creatures", 0), cheap_payoffs: readInt("deck-cheap_payoffs", 0), mid_payoffs: readInt("deck-mid_payoffs", 0), cheap_interaction: readInt("deck-cheap_interaction", 0), mid_interaction: readInt("deck-mid_interaction", 0), value_engines: readInt("deck-value_engines", 0) }; deck.other = Math.max(0, DECK_SIZE - Object.values(deck).reduce((a, b) => a + b, 0)); const goal = { target_turn: readInt("goal-target-turn", 6), commander_mv: readInt("goal-commander-mv", 3), commander_power: readInt("goal-commander-power", 2), cards_seen: readInt("goal-cards-seen", 13), nonland_permanents_min: readInt("goal-nonland-permanents-min", 4), damage_min: readInt("goal-damage-min", 7), value_min: readInt("goal-value-min", 1), restriction_friction: readInt("goal-restriction-friction", 10), payoff_bonus: readInt("goal-payoff-bonus", 2) }; return { deck, goal }; }
    function setDeckInput(key, value) { const el = document.getElementById(`deck-${key}`); if (el) el.value = String(Math.max(0, value)); }
    function setStatus(title, detail) { const target = document.getElementById("deck-intake-status"); if (target) target.innerHTML = `<strong>${title}</strong><span>${detail}</span>`; }

    async function applyDecklistAnalysis() {
        const text = document.getElementById("decklist-input")?.value || "";
        const deckName = document.getElementById("deck-name-input")?.value || "Untitled deck";
        const commanderInput = document.getElementById("commander-name-input");
        if (/moxfield\.com\/decks\//i.test(text) && text.split(/\r?\n/).filter(Boolean).length < 10) { setStatus("Moxfield URL detected, but direct URL import is not active yet.", "Use Moxfield's export/copy list option and paste the quantity + card-name list here. This prevents a misleading 0.0% result from a URL-only input."); return; }
        const parsed = parseDecklist(text);
        if (parsed.deckCards < 40) { setStatus("Not enough deck cards detected.", `Only ${parsed.deckCards} library card(s) parsed. Paste the Moxfield export list, not just the deck URL.`); return; }
        if (parsed.commander && commanderInput) commanderInput.value = parsed.commander;
        setStatus(`${deckName}: looking up ${parsed.entries.length} card names…`, "Using card data first; optional tags and simple guesses are only fallbacks.");
        let cardMap = new Map();
        let lookupFailed = false;
        try { cardMap = await fetchCardData(parsed.entries.map((entry) => entry.name)); }
        catch (error) { lookupFailed = true; console.warn(error); }
        const classified = classifyParsedDeck(parsed, cardMap);
        MODEL_KEYS.forEach((key) => setDeckInput(key, classified.counts[key] || 0));
        const countNote = parsed.deckCards === 99 ? "99-card library detected" : `${parsed.deckCards} library cards detected`;
        const commanderNote = parsed.commander ? `${parsed.commanders.length} commander candidate(s): ${parsed.commander}.` : "No commander candidate detected; use the commander field manually.";
        const lookupNote = lookupFailed ? "Card lookup failed; fallback guesses were used." : `${classified.lookedUp} cards matched card data.`;
        const reviewNote = classified.unresolved.length ? `${classified.unresolved.length} unresolved names folded into Other.` : "No unresolved names folded into Other.";
        setStatus(`${deckName}: ${countNote}.`, `${commanderNote} ${lookupNote} ${classified.tagged} cards used explicit tags. ${reviewNote} Opening Readiness updated.`);
        localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify({ deckName, commander: commanderInput?.value || parsed.commander, text }));
        updateCommanderReadiness({ reroll: true });
    }

    function loadSavedDeckIntake() { try { const saved = JSON.parse(localStorage.getItem(DECK_STORAGE_KEY) || "null"); if (!saved) return; if (saved.deckName && document.getElementById("deck-name-input")) document.getElementById("deck-name-input").value = saved.deckName; if (saved.commander && document.getElementById("commander-name-input")) document.getElementById("commander-name-input").value = saved.commander; if (saved.text && document.getElementById("decklist-input")) document.getElementById("decklist-input").value = saved.text; } catch (error) { console.warn("Could not load saved commander deck intake", error); } }
    function addCards(pool, count, attrs, cycle) { for (let i = 0; i < count; i += 1) pool.push({ ...attrs, id: `${attrs.kind}-${i}`, mv: cycle ? cycle[i % cycle.length] : attrs.mv }); }
    function buildDeck(deck, payoffBonus) { const pool = []; addCards(pool, deck.lands, { kind: "land", mv: 0, permanent: true, damage: 0, value: 0 }); addCards(pool, deck.cheap_creatures, { kind: "cheap_creature", permanent: true, creature: true, damage: 2, value: 0 }, [1, 2]); addCards(pool, deck.mid_creatures, { kind: "mid_creature", permanent: true, creature: true, damage: 3, value: 0 }, [3, 4]); addCards(pool, deck.cheap_payoffs, { kind: "cheap_payoff", permanent: true, payoff: true, damage: Math.max(1, payoffBonus), value: 0 }, [1, 2]); addCards(pool, deck.mid_payoffs, { kind: "mid_payoff", permanent: true, payoff: true, damage: Math.max(1, payoffBonus + 1), value: 0 }, [3, 4]); addCards(pool, deck.cheap_interaction, { kind: "cheap_interaction", permanent: false, interaction: true, damage: 0, value: 0 }, [1, 2]); addCards(pool, deck.mid_interaction, { kind: "mid_interaction", permanent: false, interaction: true, damage: 0, value: 0 }, [3, 4]); addCards(pool, deck.value_engines, { kind: "value_engine", permanent: true, value_engine: true, damage: 0, value: 1 }, [1, 2, 3]); addCards(pool, deck.other, { kind: "other", permanent: false, damage: 0, value: 0 }, [2, 3, 4]); return pool; }
    function sampleWithoutReplacement(pool, sampleSize) { const copy = [...pool]; const drawn = []; for (let i = 0; i < sampleSize && copy.length; i += 1) { const index = Math.floor(Math.random() * copy.length); drawn.push(copy.splice(index, 1)[0]); } return drawn; }
    function priority(card, hasBody) { if (card.kind === "value_engine") return [0, card.mv]; if (card.kind === "cheap_creature") return [1, card.mv]; if (card.kind === "mid_creature") return [2, card.mv]; if (card.kind === "cheap_payoff" || card.kind === "mid_payoff") return [hasBody ? 3 : 8, card.mv]; if (card.interaction) return [6, card.mv]; return [9, card.mv]; }
    function simulateOpening(deck, goal) { const cards = buildDeck(deck, goal.payoff_bonus); const drawn = sampleWithoutReplacement(cards, Math.min(goal.cards_seen, cards.length)); const landsDrawn = drawn.filter((card) => card.kind === "land").length; const landsInPlay = Math.min(landsDrawn, goal.target_turn); let peakMana = landsInPlay; let manaBudget = 0; for (let turn = 1; turn <= goal.target_turn; turn += 1) manaBudget += Math.min(landsDrawn, turn); const friction = Math.min(95, Math.max(0, goal.restriction_friction)) / 100; const spells = drawn.filter((card) => card.kind !== "land"); const usableSpells = spells.filter(() => Math.random() >= friction); const commanderCast = peakMana >= goal.commander_mv && manaBudget >= goal.commander_mv; if (commanderCast) manaBudget -= goal.commander_mv; const castCards = []; let valueScore = 0; let virtualResourceBonus = 0; function hasBody() { return commanderCast || castCards.some((card) => card.creature); } let remaining = [...usableSpells]; let changed = true; while (changed) { changed = false; remaining.sort((a, b) => { const pa = priority(a, hasBody()); const pb = priority(b, hasBody()); return pa[0] - pb[0] || pa[1] - pb[1]; }); for (const card of [...remaining]) { if (card.payoff && !hasBody()) continue; if (card.interaction) continue; if (card.mv <= peakMana + virtualResourceBonus && card.mv <= manaBudget) { castCards.push(card); manaBudget -= card.mv; remaining = remaining.filter((candidate) => `${candidate.kind}:${candidate.id}` !== `${card.kind}:${card.id}`); changed = true; if (card.value_engine) { valueScore += 1; virtualResourceBonus = Math.min(2, virtualResourceBonus + 1); manaBudget += 1; } break; } } } const interactionReady = usableSpells.filter((card) => card.interaction && card.mv <= peakMana + virtualResourceBonus).length; const payoffs = castCards.filter((card) => card.payoff).length; const nonland = (commanderCast ? 1 : 0) + castCards.filter((card) => card.permanent).length; const battlefield = landsInPlay + nonland; const damage = (commanderCast ? goal.commander_power : 0) + castCards.reduce((sum, card) => sum + (card.damage || 0), 0); valueScore += Math.min(2, interactionReady); const success = commanderCast && nonland >= goal.nonland_permanents_min && damage >= goal.damage_min && valueScore >= goal.value_min; return { drawn, castCards, lands_in_play: landsInPlay, peak_mana: peakMana + virtualResourceBonus, commander_cast: commanderCast, payoffs, interaction_ready: interactionReady, nonland_permanents: nonland, battlefield_permanents: battlefield, damage, value_score: valueScore, success }; }
    function aggregate(deck, goal, runs = INTERACTIVE_RUNS) { const outcomes = Array.from({ length: runs }, () => simulateOpening(deck, goal)); const avg = (key) => outcomes.reduce((sum, outcome) => sum + outcome[key], 0) / runs; return { success_rate: outcomes.filter((o) => o.success).length / runs, commander_rate: outcomes.filter((o) => o.commander_cast).length / runs, interaction_rate: outcomes.filter((o) => o.interaction_ready > 0).length / runs, avg_nonland: avg("nonland_permanents"), avg_battlefield: avg("battlefield_permanents"), avg_damage: avg("damage"), avg_value: avg("value_score"), avg_payoffs: avg("payoffs"), runs }; }
    function goalSummary(goal) { return `Turn ${goal.target_turn} · commander MV ${goal.commander_mv} · ${goal.nonland_permanents_min}+ nonland permanents · ${goal.damage_min}+ potential damage · ${goal.value_min}+ value/answer`; }
    function planChanges(plan) { const adds = Object.entries(plan.adds || {}).map(([key, value]) => `+${value} ${key.replaceAll("_", " ")}`); const removes = Object.entries(plan.removes || {}).map(([key, value]) => `-${value} ${key.replaceAll("_", " ")}`); return [...adds, ...removes].join(" · "); }
    function applyPlan(deck, plan) { const variant = { ...deck }; for (const [key, value] of Object.entries(plan.removes || {})) { if ((variant[key] || 0) < value) return null; variant[key] -= value; } for (const [key, value] of Object.entries(plan.adds || {})) variant[key] = (variant[key] || 0) + value; return variant; }
    function recommendationExperiments(deck, goal, baselineSummary) { return RECOMMENDATION_PLANS.map((plan) => { const variant = applyPlan(deck, plan); if (!variant) return null; const summary = aggregate(variant, goal); return { ...plan, changes: planChanges(plan), summary, delta: summary.success_rate - baselineSummary.success_rate }; }).filter(Boolean).sort((a, b) => b.delta - a.delta); }
    function renderOutcomeGrid(summary) { const rows = [["Commander castable", pct(summary.commander_rate)], ["Interaction/value seen", pct(summary.interaction_rate)], ["Avg nonland board pieces", summary.avg_nonland.toFixed(1)], ["Avg battlefield permanents", summary.avg_battlefield.toFixed(1)], ["Avg damage pressure", summary.avg_damage.toFixed(1)], ["Avg value / answer score", summary.avg_value.toFixed(1)]]; const target = document.getElementById("outcome-grid"); if (!target) return; target.innerHTML = rows.map(([label, value]) => `<div class="stat-tile"><span>${label}</span><strong>${value}</strong></div>`).join(""); }
    function renderAdvice(summary, goal) { const target = document.getElementById("tuning-advice"); if (!target) return; const advice = []; if (summary.commander_rate < 0.80) advice.push("Commander access is being limited by mana. Lower the commander mana value assumption, add ramp/value, or increase early land consistency."); if (summary.avg_nonland < goal.nonland_permanents_min) advice.push("The deck is not putting enough nonland material onto the board by the target turn. Cheap creatures, cheap payoffs, and value engines help more than expensive payoffs."); if (summary.avg_damage < goal.damage_min) advice.push("Damage pressure is below the target. Either the payoff assumption is too low, or too many cards are not castable early enough."); if (summary.avg_value < goal.value_min) advice.push("The value/answer score is light. Add draw, ramp, protection, or cheap interaction that is live in the first few turns."); if (!advice.length) advice.push("The model likes this opening plan. Next improvement would be deeper commander-specific card text modeling."); target.innerHTML = `<p><strong>Opening Readiness:</strong> ${pct(summary.success_rate)} (${scoreLabel(summary.success_rate)}).</p><p><strong>What changed:</strong> intake can now start from a Moxfield export-style list, then classify from card lookup plus fallback tags/guesses.</p><ul>${advice.map((item) => `<li>${item}</li>`).join("")}</ul><p class="commander-hint">Best next version: direct Moxfield URL import or server-side deck import, then commander-specific assumptions.</p>`; }
    function renderRecommendations(deck, goal, baselineSummary) { const target = document.getElementById("recommendations-list"); if (!target) return; const experiments = recommendationExperiments(deck, goal, baselineSummary).slice(0, 4); if (!experiments.length) { target.innerHTML = "<p>No valid category-level experiments could be generated from this recipe.</p>"; return; } target.innerHTML = experiments.map((item, index) => `<article class="recommendation-card"><div class="recommendation-rank">#${index + 1}</div><div class="recommendation-copy"><h3>${item.title}</h3><p class="recommendation-change">${item.changes}</p><p>${item.why}</p><div class="recommendation-metrics"><span>Opening Readiness: <strong>${pct(baselineSummary.success_rate)} → ${pct(item.summary.success_rate)}</strong></span><span class="${item.delta >= 0 ? "is-positive" : "is-negative"}">Lift: <strong>${delta(item.delta)}</strong></span></div></div></article>`).join(""); }
    function renderSampleHands(deck, goal) { const target = document.getElementById("sample-hands"); if (!target) return; target.innerHTML = Array.from({ length: 6 }, () => simulateOpening(deck, goal)).map((outcome) => { const castIds = new Set(outcome.castCards.map((card) => `${card.kind}:${card.id}`)); const tokens = outcome.drawn.map((card) => { const meta = TOKEN_META[card.kind] || ["◇", "Card"]; const cast = castIds.has(`${card.kind}:${card.id}`); return `<span class="commander-token commander-token--${card.kind}${cast ? " is-cast" : ""}" title="${meta[1]} · MV ${card.mv}">${meta[0]}</span>`; }).join(""); return `<article class="sample-hand sample-hand--${outcome.success ? "pass" : "miss"}"><div class="sample-hand-top"><strong>${outcome.success ? "GOOD OUTCOME" : "CLUNKY / SLOW"}</strong><span>${outcome.lands_in_play} lands · ${outcome.nonland_permanents} nonland permanents · ${outcome.damage} damage · ${outcome.value_score} value/answer</span></div><div class="commander-token-row">${tokens}</div></article>`; }).join(""); }
    function updateCommanderReadiness({ reroll = false } = {}) { const { deck, goal } = readCommanderState(); const total = Object.entries(deck).reduce((sum, [key, value]) => key === "other" ? sum : sum + value, 0) + deck.other; const otherEl = document.getElementById("deck-other"); const totalEl = document.getElementById("deck-total"); const goalEl = document.getElementById("goal-summary"); const commanderEl = document.getElementById("commander-summary"); const commanderName = document.getElementById("commander-name-input")?.value || "Commander"; if (otherEl) otherEl.textContent = String(deck.other); if (totalEl) totalEl.textContent = String(total); if (goalEl) goalEl.textContent = goalSummary(goal); if (commanderEl) commanderEl.textContent = `${commanderName} available, but costs mana`; const summary = aggregate(deck, goal); const probabilityEl = document.getElementById("opening-probability"); const labelEl = document.getElementById("opening-label"); const noteEl = document.getElementById("simulation-note"); if (probabilityEl) probabilityEl.textContent = pct(summary.success_rate); if (labelEl) labelEl.textContent = scoreLabel(summary.success_rate); if (noteEl) noteEl.textContent = `Interactive model: ${summary.runs} simulated openings. ${goalSummary(goal)}. This is Opening Readiness, not percent tuning needed.`; renderOutcomeGrid(summary); renderAdvice(summary, goal); renderRecommendations(deck, goal, summary); if (reroll) renderSampleHands(deck, goal); }
    (function () { loadSavedDeckIntake(); document.querySelectorAll(".commander-input-row input").forEach((input) => input.addEventListener("input", () => updateCommanderReadiness({ reroll: false }))); const analyze = document.getElementById("analyze-decklist"); if (analyze) analyze.addEventListener("click", applyDecklistAnalysis); const example = document.getElementById("load-example-decklist"); if (example) example.addEventListener("click", () => { const data = JSON.parse(document.getElementById("example-decklist-json")?.textContent || "\"\""); const input = document.getElementById("decklist-input"); if (input) input.value = data; setStatus("Korvold / Vihaan example loaded.", "Click Analyze with card lookup to classify the Moxfield-style export and update Opening Readiness."); }); const clear = document.getElementById("clear-decklist"); if (clear) clear.addEventListener("click", () => { const input = document.getElementById("decklist-input"); if (input) input.value = ""; localStorage.removeItem(DECK_STORAGE_KEY); setStatus("Decklist cleared.", "Manual quick-count fields are still available below."); }); const reroll = document.getElementById("sample-reroll"); if (reroll) reroll.addEventListener("click", () => { const { deck, goal } = readCommanderState(); renderSampleHands(deck, goal); updateCommanderReadiness({ reroll: false }); }); updateCommanderReadiness({ reroll: false }); })();
    """.replace("__PAYLOAD__", payload).replace("__PLANS__", plans)


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    rng_seed = seed if seed is not None else today.toordinal()
    deck = _deck_with_other(DEFAULT_DECK)
    goal = _goal_from_defaults()
    summary = _aggregate_simulation(deck, goal, rng_seed)
    recommendations = _recommendation_experiments(deck, goal, summary, rng_seed)
    hands = _sample_hands(deck, goal, rng_seed)
    cards = [
        CardItem("deck_submission", "Deck Intake", "Submit A New Deck", _deck_submission_html()),
        CardItem("deck_recipe", "Deck + Mana Model", "99-Card Composition", _deck_recipe_html(deck)),
        CardItem("turn_goal", "Turn 5–6 Value Checklist", "Mana, Board, Damage, Value", _mana_goal_html(goal)),
        CardItem("probability_meter", "Opening Readiness", "How Often It Comes Together", _probability_meter_html(summary, goal)),
        CardItem("sample_hands", "Goldfish View", "Sample Opening Windows", _sample_hands_html(hands)),
        CardItem("tuning_advice", "Deck Tuning", "What This Suggests", _tuning_advice_html(summary, goal)),
        CardItem("recommendations", "Recommendation Experiments", "Best Category-Level Changes", _recommendations_html(recommendations, summary)),
    ]
    footer = (
        f"{THEME_CONFIG['footer_text']} Opening Readiness is the simulated chance of hitting the selected early-game outcome, not percent tuning needed."
    )
    return PageContext(
        page_title=f"Commander Opening Plan — {today.strftime('%B %d, %Y')}",
        header_title=THEME_CONFIG["header_title"],
        header_subtitle="Paste a Moxfield export-style decklist, map card names to card data, then rerun the mana-aware forecast and recommendation experiments.",
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=footer,
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "background": None,
            "header_title_image": THEME_CONFIG.get("header_title_image"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": f"{_format_pct(summary['success_rate'])} default Opening Readiness · Moxfield export intake · card lookup",
            "extra_css": _extra_css(),
            "extra_js": _extra_js(deck, goal, rng_seed),
            "extra_head_html": _extra_head_html(),
        },
    )
