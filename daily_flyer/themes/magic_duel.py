from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "Magic Duel — Daily Flyer",
    "header_title": "Magic Duel ✨",
    "header_subtitle": "A one-player collectible-card duel prototype built inside Daily Flyer, with the game state shaped for future online multiplayer.",
    "footer_text": "Daily Flyer • Magic Duel prototype • Original placeholder cards; not affiliated with or endorsed by Wizards of the Coast.",
    "hero_kicker": "Daily Flyer • Playable Theme",
    "hero_summary_pill": "Single-player now • network-ready actions later",
}

BACKGROUND_CADENCE = "daily"
BACKGROUNDS: list[dict] = []


def _game_host() -> str:
    return """
<div class="magic-duel" id="magic-duel-root">
  <div class="magic-loading">Preparing the battlefield…</div>
  <noscript>This theme needs JavaScript enabled to play.</noscript>
</div>
""".strip()


def _magic_css() -> str:
    return r"""
.card--magic_game {
    grid-column: 1 / -1;
    min-height: 0;
    padding: 0;
    overflow: visible;
    background: rgba(7, 8, 14, 0.92);
}
.card--magic_game::after { display: none; }
.card--magic_game > .card-head {
    padding: 1.15rem 1.15rem 0;
}
.card--magic_game > .body {
    margin: 0;
}
.magic-duel {
    --md-bg: #111018;
    --md-panel: rgba(27, 24, 34, 0.96);
    --md-panel-2: rgba(37, 32, 45, 0.94);
    --md-border: rgba(226, 210, 171, 0.18);
    --md-gold: #d7bf7a;
    --md-cream: #eee4c9;
    --md-red: #c95c54;
    --md-green: #639768;
    --md-blue: #587fa8;
    --md-purple: #78658f;
    --md-muted: #aaa1b3;
    color: var(--md-cream);
    padding: 1rem;
}
.magic-loading {
    padding: 2rem;
    color: var(--md-muted);
}
.md-shell {
    display: grid;
    gap: 0.85rem;
    max-width: 1160px;
    margin: 0 auto;
}
.md-topbar,
.md-toolbar,
.md-playerbar,
.md-zone,
.md-log-panel {
    border: 1px solid var(--md-border);
    background:
        radial-gradient(circle at top right, rgba(215,191,122,0.08), transparent 34%),
        linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)),
        var(--md-panel);
    border-radius: 18px;
}
.md-topbar {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    align-items: center;
    padding: 0.8rem 0.95rem;
}
.md-title {
    font-weight: 800;
    letter-spacing: 0.02em;
}
.md-subtitle {
    color: var(--md-muted);
    font-size: 0.86rem;
}
.md-top-actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
    justify-content: flex-end;
}
.md-btn {
    appearance: none;
    border: 1px solid rgba(238,228,201,0.18);
    background: rgba(255,255,255,0.055);
    color: var(--md-cream);
    border-radius: 11px;
    padding: 0.6rem 0.8rem;
    font: inherit;
    cursor: pointer;
    transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
}
.md-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    background: rgba(255,255,255,0.09);
    border-color: rgba(238,228,201,0.32);
}
.md-btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
}
.md-btn--primary {
    background: linear-gradient(180deg, rgba(215,191,122,0.26), rgba(215,191,122,0.14));
    border-color: rgba(215,191,122,0.42);
}
.md-btn--danger {
    border-color: rgba(201,92,84,0.42);
}
.md-playerbar {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.7rem 0.9rem;
}
.md-avatar {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #564a66, #241f2c);
    border: 1px solid rgba(255,255,255,0.12);
    font-size: 1.1rem;
}
.md-player-name {
    font-weight: 800;
}
.md-player-meta {
    color: var(--md-muted);
    font-size: 0.82rem;
}
.md-life {
    min-width: 64px;
    text-align: center;
    font-weight: 900;
    font-size: 1.25rem;
    padding: 0.45rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(201,92,84,0.32);
    background: rgba(201,92,84,0.12);
}
.md-board {
    display: grid;
    gap: 0.75rem;
}
.md-zone {
    padding: 0.75rem;
}
.md-zone-title {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    align-items: center;
    color: var(--md-muted);
    font-size: 0.76rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.55rem;
}
.md-cards {
    display: flex;
    gap: 0.55rem;
    align-items: stretch;
    overflow-x: auto;
    padding: 0.1rem 0.05rem 0.35rem;
    min-height: 126px;
}
.md-cards--compact {
    min-height: 88px;
}
.md-card {
    flex: 0 0 128px;
    min-height: 170px;
    border-radius: 12px;
    padding: 0.45rem;
    border: 2px solid #514a57;
    background:
        linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.08)),
        #28232d;
    box-shadow: 0 8px 18px rgba(0,0,0,0.25);
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 0.4rem;
    color: #f3ead6;
    user-select: none;
    transition: transform 140ms ease, border-color 140ms ease, opacity 140ms ease;
}
.md-card[data-clickable="true"] {
    cursor: pointer;
}
.md-card[data-clickable="true"]:hover {
    transform: translateY(-4px);
    border-color: var(--md-gold);
}
.md-card.is-selected {
    border-color: #f0d67b;
    box-shadow: 0 0 0 2px rgba(240,214,123,0.18), 0 12px 24px rgba(0,0,0,0.32);
    transform: translateY(-5px);
}
.md-card.is-tapped {
    transform: rotate(5deg);
    opacity: 0.72;
}
.md-card.is-sick::after {
    content: "summoning";
    position: absolute;
    right: 5px;
    bottom: 5px;
    font-size: 0.58rem;
    text-transform: uppercase;
    color: #d6cbe0;
    background: rgba(120,101,143,0.58);
    padding: 0.18rem 0.3rem;
    border-radius: 999px;
}
.md-card--land { border-color: #68745d; background: linear-gradient(180deg, #2e3b2d, #20281f); }
.md-card--creature { border-color: #78658f; background: linear-gradient(180deg, #352d42, #251f2d); }
.md-card--spell { border-color: #587fa8; background: linear-gradient(180deg, #26384b, #1d2733); }
.md-card-name {
    font-size: 0.82rem;
    line-height: 1.08;
    font-weight: 800;
}
.md-card-cost {
    position: absolute;
    top: 5px;
    right: 6px;
    border-radius: 999px;
    min-width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    font-size: 0.7rem;
    font-weight: 900;
    background: rgba(0,0,0,0.34);
    border: 1px solid rgba(255,255,255,0.13);
}
.md-card-art {
    border-radius: 7px;
    min-height: 66px;
    display: grid;
    place-items: center;
    font-size: 2rem;
    background:
        radial-gradient(circle at 25% 20%, rgba(255,255,255,0.15), transparent 30%),
        rgba(0,0,0,0.18);
}
.md-card-text {
    font-size: 0.66rem;
    line-height: 1.28;
    color: #d6ccd8;
}
.md-card-pt {
    justify-self: end;
    font-weight: 900;
    font-size: 0.75rem;
    padding: 0.15rem 0.32rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(0,0,0,0.28);
}
.md-card-back {
    flex: 0 0 74px;
    min-height: 108px;
    border-radius: 10px;
    border: 2px solid #5a4d37;
    background:
        radial-gradient(circle, rgba(215,191,122,0.15) 0 18%, transparent 19%),
        repeating-radial-gradient(circle, #261e18 0 5px, #171218 6px 10px);
    box-shadow: inset 0 0 0 4px rgba(12,10,12,0.72), 0 8px 18px rgba(0,0,0,0.26);
}
.md-empty {
    color: #746e79;
    font-style: italic;
    display: grid;
    place-items: center;
    min-height: 88px;
    width: 100%;
}
.md-toolbar {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0.9rem;
}
.md-phase {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
}
.md-phase-step {
    font-size: 0.72rem;
    color: #81798a;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    padding: 0.28rem 0.48rem;
}
.md-phase-step.is-active {
    color: var(--md-cream);
    border-color: rgba(215,191,122,0.35);
    background: rgba(215,191,122,0.11);
}
.md-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
}
.md-status {
    color: var(--md-muted);
    font-size: 0.84rem;
    line-height: 1.35;
}
.md-mana {
    color: #cfe3bd;
}
.md-log-panel {
    padding: 0.75rem 0.9rem;
}
.md-log {
    max-height: 132px;
    overflow-y: auto;
    display: grid;
    gap: 0.24rem;
    font-size: 0.78rem;
    color: #aea5b4;
}
.md-log-entry strong {
    color: #e5dac0;
}
.md-winner {
    border-color: rgba(215,191,122,0.62);
    background:
        radial-gradient(circle at center, rgba(215,191,122,0.16), transparent 52%),
        var(--md-panel);
}
.md-rules {
    color: var(--md-muted);
    font-size: 0.78rem;
    line-height: 1.5;
    margin: 0;
}
@media (max-width: 720px) {
    .magic-duel { padding: 0.6rem; }
    .md-topbar { align-items: flex-start; flex-direction: column; }
    .md-top-actions { justify-content: flex-start; }
    .md-playerbar { grid-template-columns: auto 1fr; }
    .md-life { grid-column: 1 / -1; justify-self: stretch; }
    .md-card { flex-basis: 116px; min-height: 160px; }
}
"""


def _magic_js() -> str:
    return r"""
(function () {
    const root = document.getElementById("magic-duel-root");
    if (!root) return;

    const STORAGE_KEY = "dailyflyer:magic-duel:v1";

    const CARD_LIBRARY = {
        land: { key: "land", name: "Aether Grove", type: "land", cost: 0, art: "🌿", text: "Land — provides 1 mana." },
        emberFox: { key: "emberFox", name: "Ember Fox", type: "creature", cost: 2, power: 2, toughness: 2, art: "🦊", text: "A quick, dependable attacker." },
        mossGiant: { key: "mossGiant", name: "Moss Giant", type: "creature", cost: 4, power: 4, toughness: 5, art: "🌲", text: "Big body; excellent at stabilizing a board." },
        skyDrake: { key: "skyDrake", name: "Sky Drake", type: "creature", cost: 3, power: 3, toughness: 2, art: "🐉", text: "A glass-cannon creature for pressure." },
        veilKnight: { key: "veilKnight", name: "Veil Knight", type: "creature", cost: 3, power: 2, toughness: 4, art: "🛡️", text: "A sturdy blocker that trades time for value." },
        sparkVolley: { key: "sparkVolley", name: "Spark Volley", type: "spell", cost: 2, art: "🔥", text: "Deal 3 damage to the opposing player.", effect: "damage3" },
        mendVeil: { key: "mendVeil", name: "Mend the Veil", type: "spell", cost: 2, art: "✨", text: "Gain 4 life.", effect: "gain4" },
        insight: { key: "insight", name: "Deep Insight", type: "spell", cost: 3, art: "🔮", text: "Draw 2 cards.", effect: "draw2" }
    };

    const PLAYER_DECK = [
        "land","land","land","land","land","land","land","land","land","land",
        "emberFox","emberFox","emberFox",
        "skyDrake","skyDrake",
        "veilKnight","veilKnight",
        "mossGiant","mossGiant",
        "sparkVolley","sparkVolley",
        "mendVeil","mendVeil",
        "insight"
    ];

    const AI_DECK = [
        "land","land","land","land","land","land","land","land","land","land",
        "emberFox","emberFox","emberFox",
        "skyDrake","skyDrake",
        "veilKnight","veilKnight",
        "mossGiant","mossGiant",
        "sparkVolley","sparkVolley",
        "mendVeil",
        "insight","insight"
    ];

    let uid = 1;
    let state = null;
    let aiTimer = null;

    function cardFromKey(key) {
        const base = CARD_LIBRARY[key];
        return Object.assign({}, base, {
            id: "c" + (uid++),
            tapped: false,
            summoningSick: base.type === "creature",
            selected: false
        });
    }

    function shuffledDeck(list) {
        const copy = list.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.map(cardFromKey);
    }

    function freshSide(name, avatar, deckList) {
        return {
            name,
            avatar,
            life: 20,
            deck: shuffledDeck(deckList),
            hand: [],
            battlefield: [],
            graveyard: [],
            landPlayed: false
        };
    }

    function newGame() {
        uid = 1;
        const next = {
            version: 1,
            turn: 1,
            active: "player",
            phase: "main",
            winner: null,
            message: "Your first main phase. Play one land, then cast what you can.",
            player: freshSide("You", "🧙", PLAYER_DECK),
            ai: freshSide("The Archivist", "🕯️", AI_DECK),
            log: [],
            pendingAttackers: []
        };
        for (let i = 0; i < 7; i++) {
            drawCard(next.player);
            drawCard(next.ai);
        }
        addLog(next, "Game", "Opening hands drawn. You play first.");
        return next;
    }

    function addLog(targetState, actor, text) {
        targetState.log.push({ actor, text });
        if (targetState.log.length > 40) targetState.log.shift();
    }

    function drawCard(side) {
        const card = side.deck.shift();
        if (!card) {
            side.life = 0;
            return null;
        }
        side.hand.push(card);
        return card;
    }

    function availableMana(side) {
        return side.battlefield.filter(card => card.type === "land" && !card.tapped).length;
    }

    function payMana(side, amount) {
        let left = amount;
        side.battlefield
            .filter(card => card.type === "land" && !card.tapped)
            .forEach(card => {
                if (left > 0) {
                    card.tapped = true;
                    left -= 1;
                }
            });
        return left === 0;
    }

    function untapAndReady(side) {
        side.battlefield.forEach(card => {
            card.tapped = false;
            if (card.type === "creature") card.summoningSick = false;
            card.selected = false;
        });
        side.landPlayed = false;
    }

    function checkWinner(s) {
        if (s.player.life <= 0 && s.ai.life <= 0) {
            s.winner = "draw";
            s.message = "Both duelists fell at the same time.";
        } else if (s.ai.life <= 0) {
            s.winner = "player";
            s.message = "Victory! The Archivist is out of life.";
        } else if (s.player.life <= 0) {
            s.winner = "ai";
            s.message = "Defeat. Reset the duel and try another line.";
        }
    }

    function removeFromHand(side, cardId) {
        const index = side.hand.findIndex(card => card.id === cardId);
        if (index < 0) return null;
        return side.hand.splice(index, 1)[0];
    }

    function resolveSpell(s, casterKey, card) {
        const caster = s[casterKey];
        const opponent = casterKey === "player" ? s.ai : s.player;

        if (card.effect === "damage3") {
            opponent.life -= 3;
            addLog(s, caster.name, `${card.name} deals 3 damage to ${opponent.name}.`);
        } else if (card.effect === "gain4") {
            caster.life += 4;
            addLog(s, caster.name, `${card.name} restores 4 life.`);
        } else if (card.effect === "draw2") {
            const first = drawCard(caster);
            const second = drawCard(caster);
            addLog(s, caster.name, `${card.name} draws ${Number(Boolean(first)) + Number(Boolean(second))} card(s).`);
        }
        caster.graveyard.push(card);
        checkWinner(s);
    }

    function playCard(s, sideKey, cardId) {
        const side = s[sideKey];
        const card = side.hand.find(c => c.id === cardId);
        if (!card || s.winner) return false;

        if (card.type === "land") {
            if (side.landPlayed) return false;
            removeFromHand(side, cardId);
            card.tapped = false;
            card.summoningSick = false;
            side.battlefield.push(card);
            side.landPlayed = true;
            addLog(s, side.name, `plays ${card.name}.`);
            return true;
        }

        if (availableMana(side) < card.cost) return false;
        payMana(side, card.cost);
        removeFromHand(side, cardId);

        if (card.type === "creature") {
            card.tapped = false;
            card.summoningSick = true;
            side.battlefield.push(card);
            addLog(s, side.name, `casts ${card.name} (${card.power}/${card.toughness}).`);
        } else {
            resolveSpell(s, sideKey, card);
        }
        return true;
    }

    function legalPlayerAttackers(s) {
        return s.player.battlefield.filter(card =>
            card.type === "creature" &&
            !card.tapped &&
            !card.summoningSick
        );
    }

    function toggleAttacker(s, cardId) {
        const card = s.player.battlefield.find(c => c.id === cardId);
        if (!card || card.type !== "creature" || card.tapped || card.summoningSick) return;
        card.selected = !card.selected;
        s.pendingAttackers = s.player.battlefield.filter(c => c.selected).map(c => c.id);
    }

    function chooseAiBlocks(s, attackers) {
        const blockers = s.ai.battlefield
            .filter(card => card.type === "creature" && !card.tapped)
            .slice()
            .sort((a, b) => b.toughness - a.toughness);

        const assignments = [];
        const targets = attackers.slice().sort((a, b) => b.power - a.power);

        targets.forEach(attacker => {
            if (!blockers.length) return;
            let chosenIndex = blockers.findIndex(blocker => blocker.toughness >= attacker.power);
            if (chosenIndex < 0) chosenIndex = 0;
            const blocker = blockers.splice(chosenIndex, 1)[0];
            assignments.push({ attacker, blocker });
        });
        return assignments;
    }

    function removeDead(side, deadIds, s) {
        const survivors = [];
        side.battlefield.forEach(card => {
            if (deadIds.has(card.id)) {
                card.tapped = false;
                card.selected = false;
                side.graveyard.push(card);
                addLog(s, side.name, `${card.name} goes to the graveyard.`);
            } else {
                survivors.push(card);
            }
        });
        side.battlefield = survivors;
    }

    function resolvePlayerCombat(s) {
        const attackers = s.player.battlefield.filter(card => s.pendingAttackers.includes(card.id));
        if (!attackers.length) {
            addLog(s, "Combat", "You attack with no creatures.");
            return;
        }

        attackers.forEach(card => {
            card.tapped = true;
            card.selected = false;
        });

        const assignments = chooseAiBlocks(s, attackers);
        const blockedIds = new Set(assignments.map(item => item.attacker.id));
        const deadPlayer = new Set();
        const deadAi = new Set();

        assignments.forEach(({ attacker, blocker }) => {
            addLog(s, "Combat", `${attacker.name} (${attacker.power}/${attacker.toughness}) is blocked by ${blocker.name} (${blocker.power}/${blocker.toughness}).`);
            if (attacker.power >= blocker.toughness) deadAi.add(blocker.id);
            if (blocker.power >= attacker.toughness) deadPlayer.add(attacker.id);
        });

        attackers.forEach(attacker => {
            if (!blockedIds.has(attacker.id)) {
                s.ai.life -= attacker.power;
                addLog(s, "Combat", `${attacker.name} hits The Archivist for ${attacker.power}.`);
            }
        });

        removeDead(s.player, deadPlayer, s);
        removeDead(s.ai, deadAi, s);
        s.pendingAttackers = [];
        checkWinner(s);
    }

    function choosePlayerBlocksForAi(s, attackers) {
        const blockers = s.player.battlefield
            .filter(card => card.type === "creature" && !card.tapped)
            .slice()
            .sort((a, b) => b.toughness - a.toughness);

        const assignments = [];
        attackers
            .slice()
            .sort((a, b) => b.power - a.power)
            .forEach(attacker => {
                if (!blockers.length) return;
                let chosenIndex = blockers.findIndex(blocker => blocker.power >= attacker.toughness);
                if (chosenIndex < 0) chosenIndex = blockers.findIndex(blocker => blocker.toughness > attacker.power);
                if (chosenIndex < 0) return;
                const blocker = blockers.splice(chosenIndex, 1)[0];
                assignments.push({ attacker, blocker });
            });

        return assignments;
    }

    function resolveAiCombat(s) {
        const attackers = s.ai.battlefield.filter(card =>
            card.type === "creature" &&
            !card.tapped &&
            !card.summoningSick
        );

        if (!attackers.length) {
            addLog(s, "Combat", "The Archivist has no profitable attack.");
            return;
        }

        attackers.forEach(card => card.tapped = true);

        const assignments = choosePlayerBlocksForAi(s, attackers);
        const blockedIds = new Set(assignments.map(item => item.attacker.id));
        const deadPlayer = new Set();
        const deadAi = new Set();

        assignments.forEach(({ attacker, blocker }) => {
            addLog(s, "Combat", `${blocker.name} blocks ${attacker.name}.`);
            if (attacker.power >= blocker.toughness) deadPlayer.add(blocker.id);
            if (blocker.power >= attacker.toughness) deadAi.add(attacker.id);
        });

        attackers.forEach(attacker => {
            if (!blockedIds.has(attacker.id)) {
                s.player.life -= attacker.power;
                addLog(s, "Combat", `${attacker.name} hits you for ${attacker.power}.`);
            }
        });

        removeDead(s.player, deadPlayer, s);
        removeDead(s.ai, deadAi, s);
        checkWinner(s);
    }

    function aiMain(s) {
        const ai = s.ai;

        const land = ai.hand.find(card => card.type === "land");
        if (land && !ai.landPlayed) playCard(s, "ai", land.id);

        let safety = 12;
        while (safety-- > 0) {
            const mana = availableMana(ai);
            const playable = ai.hand
                .filter(card => card.type !== "land" && card.cost <= mana)
                .sort((a, b) => {
                    const aScore = (a.type === "creature" ? 10 : 0) + a.cost;
                    const bScore = (b.type === "creature" ? 10 : 0) + b.cost;
                    return bScore - aScore;
                });
            if (!playable.length) break;
            playCard(s, "ai", playable[0].id);
            if (s.winner) break;
        }
    }

    function beginPlayerTurn(s) {
        s.turn += 1;
        s.active = "player";
        s.phase = "main";
        untapAndReady(s.player);
        const drawn = drawCard(s.player);
        if (drawn) addLog(s, "You", `draw ${drawn.name}.`);
        s.message = "Your main phase. Play a land and cast spells, or move to combat.";
        checkWinner(s);
    }

    function runAiTurn(s) {
        if (s.winner) return;
        s.active = "ai";
        s.phase = "ai";
        untapAndReady(s.ai);
        const drawn = drawCard(s.ai);
        if (drawn) addLog(s, "The Archivist", "draws a card.");
        addLog(s, "Turn", `The Archivist begins turn ${s.turn}.`);
        checkWinner(s);
        if (s.winner) return;

        aiMain(s);
        if (s.winner) return;
        resolveAiCombat(s);
        if (s.winner) return;
        beginPlayerTurn(s);
    }

    // All UI and AI moves pass through actions. For online play later,
    // send these action objects to a server and let the server own/reduce state.
    function dispatch(action) {
        if (!state || state.winner) {
            if (action.type === "RESET") {
                state = newGame();
                persist();
                render();
            }
            return;
        }

        switch (action.type) {
            case "PLAY_CARD":
                if (state.active !== "player" || state.phase !== "main") return;
                if (playCard(state, "player", action.cardId)) {
                    state.message = "Card played. Continue your main phase or move to combat.";
                }
                break;

            case "GO_COMBAT":
                if (state.active !== "player" || state.phase !== "main") return;
                state.phase = "combat";
                state.pendingAttackers = [];
                state.player.battlefield.forEach(card => card.selected = false);
                state.message = legalPlayerAttackers(state).length
                    ? "Choose any creatures that can attack, then resolve combat."
                    : "No creatures can attack this turn. You can resolve combat to continue.";
                break;

            case "TOGGLE_ATTACKER":
                if (state.active !== "player" || state.phase !== "combat") return;
                toggleAttacker(state, action.cardId);
                break;

            case "RESOLVE_COMBAT":
                if (state.active !== "player" || state.phase !== "combat") return;
                resolvePlayerCombat(state);
                if (!state.winner) {
                    state.phase = "secondMain";
                    state.message = "Second main phase. You may cast more spells before ending the turn.";
                }
                break;

            case "END_TURN":
                if (state.active !== "player" || !["main", "secondMain"].includes(state.phase)) return;
                state.player.battlefield.forEach(card => card.selected = false);
                state.pendingAttackers = [];
                state.message = "The Archivist is taking a turn…";
                persist();
                render();
                clearTimeout(aiTimer);
                aiTimer = setTimeout(() => {
                    runAiTurn(state);
                    persist();
                    render();
                }, 550);
                return;

            case "RESET":
                state = newGame();
                break;
        }

        checkWinner(state);
        persist();
        render();
    }

    function persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn("Could not save Magic Duel state", error);
        }
    }

    function restore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== 1) return null;
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function cardHtml(card, options = {}) {
        const clickable = Boolean(options.clickable);
        const selected = Boolean(card.selected);
        const tapped = Boolean(card.tapped);
        const sick = card.type === "creature" && card.summoningSick;
        const classes = [
            "md-card",
            `md-card--${card.type}`,
            selected ? "is-selected" : "",
            tapped ? "is-tapped" : "",
            sick ? "is-sick" : ""
        ].filter(Boolean).join(" ");

        const pt = card.type === "creature"
            ? `<div class="md-card-pt">${card.power}/${card.toughness}</div>`
            : `<div></div>`;

        return `
            <div class="${classes}" data-card-id="${card.id}" data-clickable="${clickable}">
                <div class="md-card-name">${card.name}</div>
                ${card.type === "land" ? "" : `<div class="md-card-cost">${card.cost}</div>`}
                <div class="md-card-art">${card.art}</div>
                <div class="md-card-text">${card.text}</div>
                ${pt}
            </div>
        `;
    }

    function zoneCards(side, zoneName, options = {}) {
        const cards = side[zoneName] || [];
        if (!cards.length) return `<div class="md-empty">Empty</div>`;
        return cards.map(card => cardHtml(card, options)).join("");
    }

    function opponentHandHtml() {
        if (!state.ai.hand.length) return `<div class="md-empty">No cards</div>`;
        return state.ai.hand.map(() => `<div class="md-card-back" title="Hidden card"></div>`).join("");
    }

    function phaseHtml() {
        const labels = [
            ["main", "Main"],
            ["combat", "Combat"],
            ["secondMain", "Second Main"],
            ["ai", "Opponent"]
        ];
        return labels.map(([key, label]) =>
            `<span class="md-phase-step ${state.phase === key ? "is-active" : ""}">${label}</span>`
        ).join("");
    }

    function playerHandClickable(card) {
        if (state.active !== "player" || state.phase !== "main" && state.phase !== "secondMain") return false;
        if (card.type === "land") return !state.player.landPlayed;
        return availableMana(state.player) >= card.cost;
    }

    function render() {
        const mana = availableMana(state.player);
        const winnerText = state.winner === "player"
            ? "You win"
            : state.winner === "ai"
                ? "The Archivist wins"
                : state.winner === "draw"
                    ? "Draw"
                    : "";

        root.innerHTML = `
            <div class="md-shell">
                <div class="md-topbar ${state.winner ? "md-winner" : ""}">
                    <div>
                        <div class="md-title">${state.winner ? winnerText : "Magic Duel — Prototype Match"}</div>
                        <div class="md-subtitle">20 life • one land per turn • auto-tap mana • simplified combat • local save</div>
                    </div>
                    <div class="md-top-actions">
                        <button class="md-btn md-btn--danger" type="button" data-action="reset">New game</button>
                    </div>
                </div>

                <div class="md-playerbar">
                    <div class="md-avatar">${state.ai.avatar}</div>
                    <div>
                        <div class="md-player-name">${state.ai.name}</div>
                        <div class="md-player-meta">Deck ${state.ai.deck.length} • Hand ${state.ai.hand.length} • Graveyard ${state.ai.graveyard.length}</div>
                    </div>
                    <div class="md-life">♥ ${state.ai.life}</div>
                </div>

                <div class="md-board">
                    <section class="md-zone">
                        <div class="md-zone-title"><span>Opponent hand</span><span>hidden information</span></div>
                        <div class="md-cards md-cards--compact">${opponentHandHtml()}</div>
                    </section>

                    <section class="md-zone">
                        <div class="md-zone-title"><span>Opponent battlefield</span><span>${availableMana(state.ai)} mana available</span></div>
                        <div class="md-cards">${zoneCards(state.ai, "battlefield")}</div>
                    </section>

                    <div class="md-toolbar">
                        <div>
                            <div class="md-phase">${phaseHtml()}</div>
                            <div class="md-status">${state.message}</div>
                        </div>
                        <div class="md-actions">
                            <button class="md-btn md-btn--primary" type="button" data-action="combat"
                                ${state.active !== "player" || state.phase !== "main" || state.winner ? "disabled" : ""}>
                                Go to combat
                            </button>
                            <button class="md-btn md-btn--primary" type="button" data-action="resolve"
                                ${state.active !== "player" || state.phase !== "combat" || state.winner ? "disabled" : ""}>
                                Resolve combat
                            </button>
                            <button class="md-btn" type="button" data-action="end"
                                ${state.active !== "player" || !["main","secondMain"].includes(state.phase) || state.winner ? "disabled" : ""}>
                                End turn
                            </button>
                        </div>
                    </div>

                    <section class="md-zone">
                        <div class="md-zone-title"><span>Your battlefield</span><span class="md-mana">${mana} mana available</span></div>
                        <div class="md-cards" data-zone="player-battlefield">
                            ${zoneCards(state.player, "battlefield", { clickable: state.phase === "combat" })}
                        </div>
                    </section>

                    <section class="md-zone">
                        <div class="md-zone-title"><span>Your hand</span><span>Deck ${state.player.deck.length} • Graveyard ${state.player.graveyard.length}</span></div>
                        <div class="md-cards" data-zone="player-hand">
                            ${state.player.hand.length
                                ? state.player.hand.map(card => cardHtml(card, { clickable: playerHandClickable(card) })).join("")
                                : `<div class="md-empty">No cards in hand</div>`}
                        </div>
                    </section>
                </div>

                <div class="md-playerbar">
                    <div class="md-avatar">${state.player.avatar}</div>
                    <div>
                        <div class="md-player-name">${state.player.name}</div>
                        <div class="md-player-meta">Turn ${state.turn} • ${state.player.landPlayed ? "Land played" : "Land available"} • ${mana} untapped land(s)</div>
                    </div>
                    <div class="md-life">♥ ${state.player.life}</div>
                </div>

                <div class="md-log-panel">
                    <div class="md-zone-title"><span>Game log</span><span>latest events</span></div>
                    <div class="md-log">
                        ${state.log.slice().reverse().map(item =>
                            `<div class="md-log-entry"><strong>${item.actor}:</strong> ${item.text}</div>`
                        ).join("")}
                    </div>
                </div>

                <p class="md-rules">
                    Prototype rules: play one land per turn; costs are generic mana; casting automatically taps enough lands;
                    creatures cannot attack the turn they enter; choose your attackers in combat; the computer assigns blocks.
                    The AI also attacks and your side currently auto-blocks when a favorable block exists. No instants, stack,
                    activated abilities, mulligans, color restrictions, or manual blocker assignment yet.
                </p>
            </div>
        `;

        root.querySelector('[data-action="reset"]')?.addEventListener("click", () => dispatch({ type: "RESET" }));
        root.querySelector('[data-action="combat"]')?.addEventListener("click", () => dispatch({ type: "GO_COMBAT" }));
        root.querySelector('[data-action="resolve"]')?.addEventListener("click", () => dispatch({ type: "RESOLVE_COMBAT" }));
        root.querySelector('[data-action="end"]')?.addEventListener("click", () => dispatch({ type: "END_TURN" }));

        root.querySelectorAll('[data-zone="player-hand"] .md-card[data-clickable="true"]').forEach(el => {
            el.addEventListener("click", () => dispatch({ type: "PLAY_CARD", cardId: el.dataset.cardId }));
        });

        root.querySelectorAll('[data-zone="player-battlefield"] .md-card[data-clickable="true"]').forEach(el => {
            el.addEventListener("click", () => dispatch({ type: "TOGGLE_ATTACKER", cardId: el.dataset.cardId }));
        });
    }

    state = restore() || newGame();
    checkWinner(state);
    render();
})();
"""


def build_theme_page(
    date_str: str | None = None,
    seed: int | None = None,
) -> PageContext:
    today = resolve_date(date_str)

    cards = [
        CardItem(
            card_type="magic_game",
            eyebrow="Playable Prototype",
            title="Magic Duel",
            body=_game_host(),
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
            "theme_name": "magic_duel",
            "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": _magic_css(),
            "extra_js": _magic_js(),
            "extra_head_html": "",
        },
    )
