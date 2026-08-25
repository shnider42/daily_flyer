from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes import magic_duel as legacy_theme
from daily_flyer.utils import resolve_date


THEME_CONFIG = {
    "page_title": "Magic Duel — Color Rules v2",
    "header_title": "Magic Duel",
    "header_subtitle": (
        "A color-aware duel prototype with five mana colors, colored casting costs, "
        "color identity, and color-conscious auto-tapping."
    ),
    "footer_text": (
        "Daily Flyer • Magic Duel rules prototype • Original placeholder cards; "
        "not affiliated with or endorsed by Wizards of the Coast."
    ),
    "hero_kicker": "Daily Flyer • Rules Engine v2",
    "hero_summary_pill": "W U B R G mana • colored costs • 40-card training decks",
}

BACKGROUND_CADENCE = "daily"
BACKGROUNDS: list[dict] = []


COLOR_CSS = r"""
/* Color-aware rules/UI layer. Letter pips are intentionally original UI, not copied mana symbols. */
.md-cost-pips,
.md-mana-breakdown {
    display: inline-flex;
    gap: 0.22rem;
    align-items: center;
    flex-wrap: wrap;
}
.md-cost-pips {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 12;
    max-width: 74px;
    justify-content: flex-end;
}
.md-mana-pip {
    width: 22px;
    height: 22px;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    border: 1px solid rgba(0,0,0,0.42);
    box-shadow: inset 0 1px rgba(255,255,255,0.36), 0 1px 2px rgba(0,0,0,0.32);
    font: 800 0.66rem/1 system-ui, sans-serif;
    color: #141414;
    text-shadow: 0 1px rgba(255,255,255,0.28);
}
.md-mana-pip--N { background: linear-gradient(180deg, #ded8c9, #9d978b); color: #24211d; }
.md-mana-pip--W { background: linear-gradient(180deg, #fff8d9, #d9cda5); }
.md-mana-pip--U { background: linear-gradient(180deg, #b9ddf2, #588eb4); color: #0d2638; }
.md-mana-pip--B { background: linear-gradient(180deg, #716979, #27242a); color: #f1e9f4; text-shadow: 0 1px #000; }
.md-mana-pip--R { background: linear-gradient(180deg, #e99a76, #a3422e); color: #35120c; }
.md-mana-pip--G { background: linear-gradient(180deg, #a9ce96, #4f8150); color: #102b15; }
.md-mana-pip--small { width: 18px; height: 18px; font-size: 0.56rem; }
.md-card-type {
    margin-top: -0.18rem;
    color: rgba(238,228,201,0.70);
    font-size: 0.58rem;
    line-height: 1.15;
    letter-spacing: 0.045em;
    text-transform: uppercase;
}
.md-color-W { border-color: #cfc398 !important; }
.md-color-U { border-color: #5d93b9 !important; }
.md-color-B { border-color: #655b6b !important; }
.md-color-R { border-color: #ad5039 !important; }
.md-color-G { border-color: #5d895c !important; }
.md-color-multi { border-color: #c2a258 !important; }
.md-card[data-clickable="false"].is-color-blocked { opacity: 0.56; filter: saturate(0.62); }
.md-card[data-clickable="false"].is-color-blocked::after {
    content: "mana";
    position: absolute;
    left: 6px;
    bottom: 6px;
    padding: 0.15rem 0.28rem;
    border-radius: 999px;
    background: rgba(10,8,8,0.76);
    color: #e9d7b0;
    border: 1px solid rgba(233,215,176,0.20);
    font-size: 0.52rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}
.md-color-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.7rem;
    margin-top: 0.42rem;
    color: #aaa1b3;
    font-size: 0.72rem;
}
.md-color-legend span { display: inline-flex; align-items: center; gap: 0.24rem; }
"""


COLOR_JS = r"""
(function () {
    const root = document.getElementById("magic-duel-root");
    if (!root) return;

    const STORAGE_KEY = "dailyflyer:magic-duel:v2-colors";
    const COLORS = ["W", "U", "B", "R", "G"];
    const COLOR_NAMES = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

    const C = (generic = 0, colored = {}) => Object.assign({ generic }, colored);

    const CARD_LIBRARY = {
        sunfield: { key: "sunfield", name: "Sunlit Sanctuary", type: "land", subtype: "Sanctuary", produces: ["W"], colors: [], art: "☀️", text: "Land — tap for white mana." },
        tidalIsle: { key: "tidalIsle", name: "Tidal Isle", type: "land", subtype: "Isle", produces: ["U"], colors: [], art: "🌊", text: "Land — tap for blue mana." },
        duskMarsh: { key: "duskMarsh", name: "Dusk Marsh", type: "land", subtype: "Marsh", produces: ["B"], colors: [], art: "🌑", text: "Land — tap for black mana." },
        emberPeak: { key: "emberPeak", name: "Ember Peak", type: "land", subtype: "Peak", produces: ["R"], colors: [], art: "🌋", text: "Land — tap for red mana." },
        aetherGrove: { key: "aetherGrove", name: "Aether Grove", type: "land", subtype: "Grove", produces: ["G"], colors: [], art: "🌿", text: "Land — tap for green mana." },

        veilKnight: { key: "veilKnight", name: "Veil Knight", type: "creature", subtype: "Knight", cost: C(1,{W:1}), colors: ["W"], power: 2, toughness: 3, art: "🛡️", text: "A disciplined white creature built to hold the ground." },
        dawnCleric: { key: "dawnCleric", name: "Dawn Cleric", type: "creature", subtype: "Cleric", cost: C(0,{W:1}), colors: ["W"], power: 1, toughness: 2, art: "🕊️", text: "When cast, gain 1 life.", onCast: "gain1" },
        mendVeil: { key: "mendVeil", name: "Mend the Veil", type: "spell", subtype: "Sorcery", cost: C(1,{W:1}), colors: ["W"], art: "✨", text: "Gain 4 life.", effect: "gain4" },

        mistform: { key: "mistform", name: "Mistform Adept", type: "creature", subtype: "Wizard", cost: C(1,{U:1}), colors: ["U"], power: 2, toughness: 2, art: "🫧", text: "Blue trades raw size for flexibility and cards." },
        skyDrake: { key: "skyDrake", name: "Sky Drake", type: "creature", subtype: "Drake", cost: C(2,{U:1}), colors: ["U"], power: 3, toughness: 2, art: "🐉", text: "A quick blue threat with an aggressive stat line." },
        deepInsight: { key: "deepInsight", name: "Deep Insight", type: "spell", subtype: "Sorcery", cost: C(2,{U:1}), colors: ["U"], art: "🔮", text: "Draw 2 cards.", effect: "draw2" },

        gloomStalker: { key: "gloomStalker", name: "Gloom Stalker", type: "creature", subtype: "Rogue", cost: C(1,{B:1}), colors: ["B"], power: 2, toughness: 2, art: "🗡️", text: "Black pressures life totals and accepts risk for value." },
        graveScholar: { key: "graveScholar", name: "Grave Scholar", type: "creature", subtype: "Warlock", cost: C(2,{B:1}), colors: ["B"], power: 3, toughness: 2, art: "📖", text: "A fragile black value creature." },
        soulTithe: { key: "soulTithe", name: "Soul Tithe", type: "spell", subtype: "Sorcery", cost: C(1,{B:1}), colors: ["B"], art: "🩸", text: "Opponent loses 2 life. You gain 2 life.", effect: "drain2" },

        emberFox: { key: "emberFox", name: "Ember Fox", type: "creature", subtype: "Fox", cost: C(1,{R:1}), colors: ["R"], power: 2, toughness: 2, art: "🦊", text: "Red wants to turn mana into pressure quickly." },
        cinderBrute: { key: "cinderBrute", name: "Cinder Brute", type: "creature", subtype: "Elemental", cost: C(2,{R:1}), colors: ["R"], power: 3, toughness: 3, art: "🔥", text: "Straightforward red battlefield pressure." },
        sparkVolley: { key: "sparkVolley", name: "Spark Volley", type: "spell", subtype: "Sorcery", cost: C(1,{R:1}), colors: ["R"], art: "⚡", text: "Deal 3 damage to the opposing player.", effect: "damage3" },

        rootling: { key: "rootling", name: "Rootling", type: "creature", subtype: "Plant Beast", cost: C(1,{G:1}), colors: ["G"], power: 2, toughness: 3, art: "🌱", text: "Green gets efficient creatures and durable bodies." },
        mossGiant: { key: "mossGiant", name: "Moss Giant", type: "creature", subtype: "Giant", cost: C(3,{G:1}), colors: ["G"], power: 4, toughness: 5, art: "🌲", text: "A large green creature that can dominate combat." },
        verdantWisdom: { key: "verdantWisdom", name: "Verdant Wisdom", type: "spell", subtype: "Sorcery", cost: C(1,{G:1}), colors: ["G"], art: "🍃", text: "Gain 2 life, then draw a card.", effect: "gain2draw1" },

        dawnwoodChampion: { key: "dawnwoodChampion", name: "Dawnwood Champion", type: "creature", subtype: "Guardian", cost: C(1,{W:1,G:1}), colors: ["W","G"], power: 3, toughness: 4, art: "🦌", text: "Multicolor cards require each colored pip in their cost." },
        stormHexer: { key: "stormHexer", name: "Storm Hexer", type: "creature", subtype: "Warlock", cost: C(1,{U:1,B:1}), colors: ["U","B"], power: 3, toughness: 3, art: "⛈️", text: "A blue-black threat that asks for two different mana colors." }
    };

    const repeat = (key, count) => Array.from({length: count}, () => key);
    const PLAYER_DECK = [
        ...repeat("sunfield",6), ...repeat("emberPeak",6), ...repeat("aetherGrove",5),
        ...repeat("veilKnight",3), ...repeat("dawnCleric",2), ...repeat("mendVeil",2),
        ...repeat("emberFox",3), ...repeat("sparkVolley",3), ...repeat("cinderBrute",2),
        ...repeat("rootling",3), ...repeat("mossGiant",2), ...repeat("verdantWisdom",1),
        ...repeat("dawnwoodChampion",2)
    ];
    const AI_DECK = [
        ...repeat("tidalIsle",6), ...repeat("duskMarsh",6), ...repeat("emberPeak",5),
        ...repeat("mistform",2), ...repeat("skyDrake",3), ...repeat("deepInsight",2),
        ...repeat("gloomStalker",3), ...repeat("graveScholar",2), ...repeat("soulTithe",3),
        ...repeat("emberFox",2), ...repeat("sparkVolley",2), ...repeat("cinderBrute",2),
        ...repeat("stormHexer",2)
    ];

    let uid = 1;
    let state = null;
    let aiTimer = null;

    function manaValue(card) {
        if (!card.cost) return 0;
        return Number(card.cost.generic || 0) + COLORS.reduce((sum, color) => sum + Number(card.cost[color] || 0), 0);
    }

    function cardFromKey(key) {
        const base = CARD_LIBRARY[key];
        return Object.assign({}, base, {
            cost: base.cost ? Object.assign({}, base.cost) : null,
            colors: (base.colors || []).slice(),
            produces: (base.produces || []).slice(),
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

    function freshSide(name, avatar, deckList, identity) {
        return { name, avatar, identity, life: 20, deck: shuffledDeck(deckList), hand: [], battlefield: [], graveyard: [], landPlayed: false };
    }

    function newGame() {
        uid = 1;
        const next = {
            version: 2,
            rules: "colors-v1",
            turn: 1,
            active: "player",
            phase: "main",
            winner: null,
            message: "Your first main phase. Lands now make specific colors of mana.",
            player: freshSide("You — Dawnwild", "🧙", PLAYER_DECK, ["W","R","G"]),
            ai: freshSide("The Archivist — Nighttide", "🕯️", AI_DECK, ["U","B","R"]),
            log: [],
            pendingAttackers: []
        };
        for (let i = 0; i < 7; i++) { drawCard(next.player); drawCard(next.ai); }
        addLog(next, "Game", "Opening hands drawn. Five-color mana rules are active.");
        return next;
    }

    function addLog(s, actor, text) {
        s.log.push({ actor, text });
        if (s.log.length > 50) s.log.shift();
    }

    function drawCard(side) {
        const card = side.deck.shift();
        if (!card) { side.life = 0; return null; }
        side.hand.push(card);
        return card;
    }

    function untappedLands(side) {
        return side.battlefield.filter(card => card.type === "land" && !card.tapped);
    }

    function manaAvailability(side) {
        const pool = { total: 0, W:0, U:0, B:0, R:0, G:0 };
        untappedLands(side).forEach(land => {
            pool.total += 1;
            (land.produces || []).forEach(color => { if (COLORS.includes(color)) pool[color] += 1; });
        });
        return pool;
    }

    function buildPaymentPlan(side, cost) {
        if (!cost) return [];
        const lands = untappedLands(side);
        const symbols = [];
        COLORS.forEach(color => {
            for (let i = 0; i < Number(cost[color] || 0); i++) symbols.push(color);
        });
        symbols.sort((a,b) => {
            const ac = lands.filter(l => (l.produces || []).includes(a)).length;
            const bc = lands.filter(l => (l.produces || []).includes(b)).length;
            return ac - bc;
        });

        function assign(index, used) {
            if (index >= symbols.length) return used.slice();
            const color = symbols[index];
            const candidates = lands.filter(land => !used.includes(land.id) && (land.produces || []).includes(color));
            for (const land of candidates) {
                used.push(land.id);
                const result = assign(index + 1, used);
                if (result) return result;
                used.pop();
            }
            return null;
        }

        const coloredIds = assign(0, []);
        if (!coloredIds) return null;
        const generic = Number(cost.generic || 0);
        const remaining = lands.filter(land => !coloredIds.includes(land.id));
        if (remaining.length < generic) return null;
        return coloredIds.concat(remaining.slice(0, generic).map(land => land.id));
    }

    function canPayMana(side, cost) { return buildPaymentPlan(side, cost) !== null; }

    function payMana(side, cost) {
        const plan = buildPaymentPlan(side, cost);
        if (!plan) return false;
        const ids = new Set(plan);
        side.battlefield.forEach(card => { if (ids.has(card.id)) card.tapped = true; });
        return true;
    }

    function costText(cost) {
        if (!cost) return "";
        const bits = [];
        if (cost.generic) bits.push(String(cost.generic));
        COLORS.forEach(color => { for (let i=0; i<(cost[color]||0); i++) bits.push(color); });
        return bits.join("");
    }

    function manaPipsHtml(cost, small=false) {
        if (!cost) return "";
        const pips = [];
        if (cost.generic) pips.push(`<span class="md-mana-pip md-mana-pip--N ${small ? "md-mana-pip--small" : ""}">${cost.generic}</span>`);
        COLORS.forEach(color => {
            for (let i=0; i<(cost[color]||0); i++) pips.push(`<span class="md-mana-pip md-mana-pip--${color} ${small ? "md-mana-pip--small" : ""}" title="${COLOR_NAMES[color]}">${color}</span>`);
        });
        return pips.join("");
    }

    function manaSummaryHtml(side) {
        const pool = manaAvailability(side);
        const active = COLORS.filter(color => pool[color] > 0).map(color => `<span title="${COLOR_NAMES[color]} mana">${manaPipsHtml({[color]:pool[color]}, true)}</span>`).join("");
        return `<span class="md-mana-breakdown">${active || "no untapped mana"}<span>${pool.total} total</span></span>`;
    }

    function untapAndReady(side) {
        side.battlefield.forEach(card => { card.tapped = false; if (card.type === "creature") card.summoningSick = false; card.selected = false; });
        side.landPlayed = false;
    }

    function checkWinner(s) {
        if (s.player.life <= 0 && s.ai.life <= 0) { s.winner = "draw"; s.message = "Both duelists fell at the same time."; }
        else if (s.ai.life <= 0) { s.winner = "player"; s.message = "Victory! The Archivist is out of life."; }
        else if (s.player.life <= 0) { s.winner = "ai"; s.message = "Defeat. Reset the duel and try another line."; }
    }

    function removeFromHand(side, cardId) {
        const index = side.hand.findIndex(card => card.id === cardId);
        if (index < 0) return null;
        return side.hand.splice(index, 1)[0];
    }

    function applyOnCast(s, casterKey, card) {
        const caster = s[casterKey];
        if (card.onCast === "gain1") { caster.life += 1; addLog(s, caster.name, `${card.name} gains 1 life on cast.`); }
    }

    function resolveSpell(s, casterKey, card) {
        const caster = s[casterKey];
        const opponent = casterKey === "player" ? s.ai : s.player;
        if (card.effect === "damage3") { opponent.life -= 3; addLog(s, caster.name, `${card.name} deals 3 damage to ${opponent.name}.`); }
        else if (card.effect === "gain4") { caster.life += 4; addLog(s, caster.name, `${card.name} restores 4 life.`); }
        else if (card.effect === "draw2") { const a=drawCard(caster), b=drawCard(caster); addLog(s, caster.name, `${card.name} draws ${Number(Boolean(a))+Number(Boolean(b))} card(s).`); }
        else if (card.effect === "drain2") { opponent.life -= 2; caster.life += 2; addLog(s, caster.name, `${card.name} drains 2 life.`); }
        else if (card.effect === "gain2draw1") { caster.life += 2; const a=drawCard(caster); addLog(s, caster.name, `${card.name} gains 2 life and draws ${a ? 1 : 0} card.`); }
        caster.graveyard.push(card);
        checkWinner(s);
    }

    function playCard(s, sideKey, cardId) {
        const side = s[sideKey];
        const card = side.hand.find(c => c.id === cardId);
        if (!card || s.winner) return false;
        if (card.type === "land") {
            if (side.landPlayed) return false;
            removeFromHand(side, cardId); card.tapped = false; side.battlefield.push(card); side.landPlayed = true;
            addLog(s, side.name, `plays ${card.name} (${(card.produces||[]).join("/")}).`); return true;
        }
        if (!canPayMana(side, card.cost)) return false;
        payMana(side, card.cost); removeFromHand(side, cardId);
        if (card.type === "creature") {
            card.tapped = false; card.summoningSick = true; side.battlefield.push(card);
            addLog(s, side.name, `casts ${card.name} [${costText(card.cost)}] (${card.power}/${card.toughness}).`);
            applyOnCast(s, sideKey, card);
        } else resolveSpell(s, sideKey, card);
        return true;
    }

    function legalPlayerAttackers(s) { return s.player.battlefield.filter(c => c.type === "creature" && !c.tapped && !c.summoningSick); }
    function toggleAttacker(s, cardId) {
        const card = s.player.battlefield.find(c => c.id === cardId);
        if (!card || card.type !== "creature" || card.tapped || card.summoningSick) return;
        card.selected = !card.selected;
        s.pendingAttackers = s.player.battlefield.filter(c => c.selected).map(c => c.id);
    }

    function chooseBlocks(defender, attackers) {
        const blockers = defender.battlefield.filter(c => c.type === "creature" && !c.tapped).slice().sort((a,b) => b.toughness-a.toughness);
        const assignments = [];
        attackers.slice().sort((a,b) => b.power-a.power).forEach(attacker => {
            if (!blockers.length) return;
            let idx = blockers.findIndex(b => b.toughness >= attacker.power);
            if (idx < 0) idx = blockers.findIndex(b => b.power >= attacker.toughness);
            if (idx < 0) idx = 0;
            assignments.push({attacker, blocker:blockers.splice(idx,1)[0]});
        });
        return assignments;
    }

    function removeDead(side, deadIds, s) {
        side.battlefield = side.battlefield.filter(card => {
            if (!deadIds.has(card.id)) return true;
            card.tapped=false; card.selected=false; side.graveyard.push(card); addLog(s, side.name, `${card.name} goes to the graveyard.`); return false;
        });
    }

    function resolveCombat(s, attackerKey) {
        const defenderKey = attackerKey === "player" ? "ai" : "player";
        const attackingSide = s[attackerKey], defendingSide = s[defenderKey];
        const attackers = attackerKey === "player"
            ? attackingSide.battlefield.filter(c => s.pendingAttackers.includes(c.id))
            : attackingSide.battlefield.filter(c => c.type === "creature" && !c.tapped && !c.summoningSick);
        if (!attackers.length) { addLog(s, "Combat", `${attackingSide.name} attacks with no creatures.`); return; }
        attackers.forEach(c => { c.tapped=true; c.selected=false; });
        const assignments = chooseBlocks(defendingSide, attackers);
        const blocked = new Set(assignments.map(x => x.attacker.id));
        const deadAttackers = new Set(), deadBlockers = new Set();
        assignments.forEach(({attacker,blocker}) => {
            addLog(s,"Combat",`${attacker.name} (${attacker.power}/${attacker.toughness}) is blocked by ${blocker.name} (${blocker.power}/${blocker.toughness}).`);
            if (attacker.power >= blocker.toughness) deadBlockers.add(blocker.id);
            if (blocker.power >= attacker.toughness) deadAttackers.add(attacker.id);
        });
        attackers.forEach(attacker => { if (!blocked.has(attacker.id)) { defendingSide.life -= attacker.power; addLog(s,"Combat",`${attacker.name} hits ${defendingSide.name} for ${attacker.power}.`); } });
        removeDead(attackingSide, deadAttackers, s); removeDead(defendingSide, deadBlockers, s);
        s.pendingAttackers=[]; checkWinner(s);
    }

    function aiMain(s) {
        const ai=s.ai;
        const landChoices = ai.hand.filter(c => c.type === "land");
        if (landChoices.length && !ai.landPlayed) {
            const uncastable = ai.hand.filter(c => c.type !== "land" && !canPayMana(ai,c.cost));
            const wanted = COLORS.slice().sort((a,b) => uncastable.filter(c => (c.cost?.[b]||0)>0).length - uncastable.filter(c => (c.cost?.[a]||0)>0).length)[0];
            const land = landChoices.find(l => (l.produces||[]).includes(wanted)) || landChoices[0];
            playCard(s,"ai",land.id);
        }
        let safety=18;
        while (safety-- > 0) {
            const playable=ai.hand.filter(c => c.type!=="land" && canPayMana(ai,c.cost)).sort((a,b) => {
                const av=(a.type==="creature"?10:0)+manaValue(a), bv=(b.type==="creature"?10:0)+manaValue(b); return bv-av;
            });
            if (!playable.length) break;
            playCard(s,"ai",playable[0].id); if (s.winner) break;
        }
    }

    function beginPlayerTurn(s) {
        s.turn += 1; s.active="player"; s.phase="main"; untapAndReady(s.player);
        const drawn=drawCard(s.player); if (drawn) addLog(s,"You",`draw ${drawn.name}.`);
        s.message="Your main phase. Match colored pips to lands, then decide whether to commit to combat."; checkWinner(s);
    }

    function runAiTurn(s) {
        if (s.winner) return; s.active="ai"; s.phase="ai"; untapAndReady(s.ai);
        const drawn=drawCard(s.ai); if (drawn) addLog(s,s.ai.name,"draws a card.");
        addLog(s,"Turn",`${s.ai.name} begins turn ${s.turn}.`); checkWinner(s); if (s.winner) return;
        aiMain(s); if (s.winner) return; resolveCombat(s,"ai"); if (s.winner) return; beginPlayerTurn(s);
    }

    function dispatch(action) {
        if (!state || state.winner) {
            if (action.type === "RESET") { state=newGame(); persist(); render(); }
            return;
        }
        switch(action.type) {
            case "PLAY_CARD":
                if (state.active!=="player" || !["main","secondMain"].includes(state.phase)) return;
                if (playCard(state,"player",action.cardId)) state.message="Card played. Colored lands used to satisfy its mana cost.";
                break;
            case "GO_COMBAT":
                if (state.active!=="player" || state.phase!=="main") return;
                state.phase="combat"; state.pendingAttackers=[]; state.player.battlefield.forEach(c=>c.selected=false);
                state.message=legalPlayerAttackers(state).length ? "Choose attackers, then resolve combat." : "No creatures can attack this turn.";
                break;
            case "TOGGLE_ATTACKER":
                if (state.active!=="player" || state.phase!=="combat") return; toggleAttacker(state,action.cardId); break;
            case "RESOLVE_COMBAT":
                if (state.active!=="player" || state.phase!=="combat") return; resolveCombat(state,"player");
                if (!state.winner) { state.phase="secondMain"; state.message="Second main phase. Colored mana restrictions still apply."; } break;
            case "END_TURN":
                if (state.active!=="player" || !["main","secondMain"].includes(state.phase)) return;
                state.player.battlefield.forEach(c=>c.selected=false); state.pendingAttackers=[]; state.message="The Archivist is taking a turn…";
                persist(); render(); clearTimeout(aiTimer); aiTimer=setTimeout(()=>{runAiTurn(state);persist();render();},550); return;
            case "RESET": state=newGame(); break;
        }
        checkWinner(state); persist(); render();
    }

    function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) { console.warn("Could not save Magic Duel v2 state",e); } }
    function restore() { try { const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return null; const parsed=JSON.parse(raw); return parsed?.version===2 && parsed?.rules==="colors-v1" ? parsed : null; } catch(e) { return null; } }

    function colorClass(card) {
        if (card.type === "land" && card.produces && card.produces.length === 1) return `md-produces-${card.produces[0]}`;
        if (!card.colors || !card.colors.length) return "md-color-colorless";
        if (card.colors.length > 1) return "md-color-multi";
        return `md-color-${card.colors[0]}`;
    }

    function typeLine(card) {
        if (card.type === "land") return `Land — ${card.subtype || "Land"}`;
        if (card.type === "creature") return `Creature — ${card.subtype || "Creature"}`;
        return card.subtype || "Sorcery";
    }

    function cardHtml(card, options={}) {
        const clickable=Boolean(options.clickable), selected=Boolean(card.selected), tapped=Boolean(card.tapped), sick=card.type==="creature"&&card.summoningSick;
        const colorBlocked = Boolean(options.colorBlocked);
        const classes=["md-card",`md-card--${card.type}`,colorClass(card),selected?"is-selected":"",tapped?"is-tapped":"",sick?"is-sick":"",colorBlocked?"is-color-blocked":""].filter(Boolean).join(" ");
        const pt=card.type==="creature"?`<div class="md-card-pt">${card.power}/${card.toughness}</div>`:`<div></div>`;
        return `<div class="${classes}" data-card-id="${card.id}" data-clickable="${clickable}" data-colors="${(card.colors||[]).join("")}">
            <div class="md-card-name">${card.name}</div>${card.type==="land"?"":`<div class="md-cost-pips">${manaPipsHtml(card.cost)}</div>`}
            <div class="md-card-art">${card.art}</div><div class="md-card-type">${typeLine(card)}</div><div class="md-card-text">${card.text}</div>${pt}</div>`;
    }

    function zoneCards(side, zoneName, options={}) {
        const cards=side[zoneName]||[]; if(!cards.length) return `<div class="md-empty">Empty</div>`;
        return cards.map(card=>cardHtml(card,options)).join("");
    }
    function opponentHandHtml(){ return state.ai.hand.length ? state.ai.hand.map(()=>`<div class="md-card-back" title="Hidden card"></div>`).join("") : `<div class="md-empty">No cards</div>`; }
    function phaseHtml(){ return [["main","Main"],["combat","Combat"],["secondMain","Second Main"],["ai","Opponent"]].map(([k,l])=>`<span class="md-phase-step ${state.phase===k?"is-active":""}">${l}</span>`).join(""); }
    function playerHandClickable(card){ if(state.active!=="player" || !["main","secondMain"].includes(state.phase)) return false; if(card.type==="land") return !state.player.landPlayed; return canPayMana(state.player,card.cost); }

    function colorLegendHtml(){ return COLORS.map(c=>`<span>${manaPipsHtml({[c]:1},true)} ${COLOR_NAMES[c]}</span>`).join(""); }

    function render() {
        const winnerText=state.winner==="player"?"You win":state.winner==="ai"?"The Archivist wins":state.winner==="draw"?"Draw":"";
        root.innerHTML=`<div class="md-shell">
            <div class="md-topbar ${state.winner?"md-winner":""}"><div><div class="md-title">${state.winner?winnerText:"Magic Duel — Color Rules v2"}</div>
            <div class="md-subtitle">20 life • 40-card training decks • one land per turn • colored mana • auto-tap • simplified combat</div>
            <div class="md-color-legend">${colorLegendHtml()}</div></div><div class="md-top-actions"><button class="md-btn md-btn--danger" type="button" data-action="reset">New game</button></div></div>

            <div class="md-playerbar"><div class="md-avatar">${state.ai.avatar}</div><div><div class="md-player-name">${state.ai.name}</div><div class="md-player-meta">Colors ${state.ai.identity.join("/")} • Deck ${state.ai.deck.length} • Hand ${state.ai.hand.length} • Graveyard ${state.ai.graveyard.length}</div></div><div class="md-life">♥ ${state.ai.life}</div></div>
            <div class="md-board">
                <section class="md-zone"><div class="md-zone-title"><span>Opponent hand</span><span>hidden information</span></div><div class="md-cards md-cards--compact">${opponentHandHtml()}</div></section>
                <section class="md-zone"><div class="md-zone-title"><span>Opponent battlefield</span><span>${manaSummaryHtml(state.ai)}</span></div><div class="md-cards">${zoneCards(state.ai,"battlefield")}</div></section>
                <div class="md-toolbar"><div><div class="md-phase">${phaseHtml()}</div><div class="md-status">${state.message}</div></div><div class="md-actions">
                    <button class="md-btn md-btn--primary" type="button" data-action="combat" ${state.active!=="player"||state.phase!=="main"||state.winner?"disabled":""}>Go to combat</button>
                    <button class="md-btn md-btn--primary" type="button" data-action="resolve" ${state.active!=="player"||state.phase!=="combat"||state.winner?"disabled":""}>Resolve combat</button>
                    <button class="md-btn" type="button" data-action="end" ${state.active!=="player"||!["main","secondMain"].includes(state.phase)||state.winner?"disabled":""}>End turn</button></div></div>
                <section class="md-zone"><div class="md-zone-title"><span>Your battlefield</span><span class="md-mana">${manaSummaryHtml(state.player)}</span></div><div class="md-cards" data-zone="player-battlefield">${state.player.battlefield.length ? state.player.battlefield.map(card=>cardHtml(card,{clickable:state.phase==="combat" && card.type==="creature" && !card.tapped && !card.summoningSick})).join("") : `<div class="md-empty">Empty</div>`}</div></section>
                <section class="md-zone"><div class="md-zone-title"><span>Your hand</span><span>Deck ${state.player.deck.length} • Graveyard ${state.player.graveyard.length}</span></div><div class="md-cards" data-zone="player-hand">${state.player.hand.length?state.player.hand.map(card=>cardHtml(card,{clickable:playerHandClickable(card),colorBlocked:card.type!=="land"&&untappedLands(state.player).length>=manaValue(card)&&!canPayMana(state.player,card.cost)})).join(""):`<div class="md-empty">No cards in hand</div>`}</div></section>
            </div>
            <div class="md-playerbar"><div class="md-avatar">${state.player.avatar}</div><div><div class="md-player-name">${state.player.name}</div><div class="md-player-meta">Colors ${state.player.identity.join("/")} • Turn ${state.turn} • ${state.player.landPlayed?"Land played":"Land available"}</div></div><div class="md-life">♥ ${state.player.life}</div></div>
            <div class="md-log-panel"><div class="md-zone-title"><span>Game log</span><span>latest events</span></div><div class="md-log">${state.log.slice().reverse().map(i=>`<div class="md-log-entry"><strong>${i.actor}:</strong> ${i.text}</div>`).join("")}</div></div>
            <p class="md-rules">Color rules v2: lands produce W/U/B/R/G mana; every colored pip must be matched before generic mana can be paid. A card can therefore be uncastable even when you control enough total lands. Multicolor cards require each listed color. Auto-tap chooses a legal payment. Combat is still simplified: no instants, stack, activated abilities, manual defending blocks, or priority yet.</p>
        </div>`;

        root.querySelector('[data-action="reset"]')?.addEventListener("click",()=>dispatch({type:"RESET"}));
        root.querySelector('[data-action="combat"]')?.addEventListener("click",()=>dispatch({type:"GO_COMBAT"}));
        root.querySelector('[data-action="resolve"]')?.addEventListener("click",()=>dispatch({type:"RESOLVE_COMBAT"}));
        root.querySelector('[data-action="end"]')?.addEventListener("click",()=>dispatch({type:"END_TURN"}));
        root.querySelectorAll('[data-zone="player-hand"] .md-card[data-clickable="true"]').forEach(el=>el.addEventListener("click",()=>dispatch({type:"PLAY_CARD",cardId:el.dataset.cardId})));
        root.querySelectorAll('[data-zone="player-battlefield"] .md-card[data-clickable="true"]').forEach(el=>el.addEventListener("click",()=>dispatch({type:"TOGGLE_ATTACKER",cardId:el.dataset.cardId})));
    }

    state=restore()||newGame(); checkWinner(state); render();
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    cards = [CardItem(card_type="magic_game", eyebrow="Rules Engine v2", title="Magic Duel", body=legacy_theme._game_host())]
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "magic_duel_colors",
            "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": legacy_theme._magic_css() + "\n" + COLOR_CSS,
            "extra_js": COLOR_JS,
            "extra_head_html": "",
        },
    )
