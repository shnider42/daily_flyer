/**
 * Vineyard Table — deterministic, server-authoritative game rules.
 *
 * Essential Edition's core economy and seasonal worker rules are the reference.
 * The starter estate, order catalog, visitor deck and strategic opponents are
 * original to this implementation. No official card text or artwork is used.
 *
 * State is plain JSON. Only applyAction changes it, by changing a private clone.
 * Legal actions include every parameter the server needs; clients submit only
 * the opaque key, never resource quantities or a proposed result.
 */

const COLORS = ['#9dbb90', '#d9ad60', '#ab94c9', '#7eafcb', '#d78f7c', '#ddd0ac'];
const SEASONS = ['summer', 'winter'];
const WINE_TYPES = ['red', 'white', 'blush', 'sparkling'];
const HAND_TYPES = ['vines', 'orders', 'summer', 'winter'];
const STRUCTURES = {
  trellis: { name: 'Trellis', cost: 2, description: 'Supports vines that need a trellis.' },
  irrigation: { name: 'Irrigation', cost: 3, description: 'Supports vines that need irrigation.' },
  medium_cellar: { name: 'Medium cellar', cost: 4, description: 'Store wine through value 6 and make blush.' },
  large_cellar: { name: 'Large cellar', cost: 6, requires: 'medium_cellar', description: 'Store wine through value 9 and make sparkling.' },
  windmill: { name: 'Windmill', cost: 5, description: 'Gain 1 reputation the first time you plant each year.' },
  tasting_room: { name: 'Tasting room', cost: 6, description: 'Gain 1 reputation from a tour each year while you have wine.' },
  cottage: { name: 'Cottage', cost: 4, description: 'Invite two visitors each autumn.' },
  yoke: { name: 'Yoke', cost: 2, description: 'Your own once-a-year harvest or uproot space, in either working season.' },
};

const VINES = [
  { name: 'Sangiovese', red: 1, white: 0, requires: [], count: 4 },
  { name: 'Malvasia', red: 0, white: 1, requires: [], count: 4 },
  { name: 'Pinot', red: 1, white: 1, requires: ['trellis'], count: 6 },
  { name: 'Syrah', red: 2, white: 0, requires: ['trellis'], count: 5 },
  { name: 'Trebbiano', red: 0, white: 2, requires: ['trellis'], count: 5 },
  { name: 'Merlot', red: 3, white: 0, requires: ['irrigation'], count: 5 },
  { name: 'Sauvignon Blanc', red: 0, white: 3, requires: ['irrigation'], count: 5 },
  { name: 'Cabernet Sauvignon', red: 4, white: 0, requires: ['trellis', 'irrigation'], count: 4 },
  { name: 'Chardonnay', red: 0, white: 4, requires: ['trellis', 'irrigation'], count: 4 },
];

const order = (name, requirements, points, income = 1) => ({
  name, requirements: requirements.map(([type, value]) => ({ type, value })), points, income,
});
const ORDERS = [
  order('Village table', [['red', 2]], 2),
  order('Garden supper', [['white', 2]], 2),
  order('Hilltop trattoria', [['red', 4]], 3),
  order('Seaside lunch', [['white', 4]], 3),
  order('Red reserve', [['red', 6]], 4, 2),
  order('White reserve', [['white', 6]], 4, 2),
  order('The collector', [['red', 8]], 5, 2),
  order('Golden vintage', [['white', 8]], 5, 2),
  order('Two glasses', [['red', 2], ['white', 2]], 3),
  order('Harvest supper', [['red', 3], ['white', 4]], 4),
  order('A cellar pairing', [['red', 5], ['white', 5]], 5, 2),
  order('Scarlet tasting', [['red', 2], ['red', 4]], 4),
  order('Ivory tasting', [['white', 2], ['white', 4]], 4),
  order('Rose terrace', [['blush', 4]], 3),
  order('Summer wedding', [['blush', 6]], 4, 2),
  order('Pink horizon', [['blush', 8]], 5, 2),
  order('First celebration', [['sparkling', 7]], 5, 2),
  order('Grand occasion', [['sparkling', 9]], 6, 2),
  order('Tuscan evening', [['blush', 4], ['red', 3]], 5, 2),
  order('Midnight toast', [['sparkling', 7], ['white', 3]], 7, 2),
  order('Courtyard reception', [['blush', 5], ['white', 4]], 5, 2),
  order('Estate collection', [['red', 6], ['white', 6]], 6, 2),
];

// Each visitor has deliberately small, explicit choices. These are original
// cards, not a transcription of the reference game's visitor decks.
const VISITORS = {
  summer: [
    ['nursery', 'Nursery courier', 'Draw two vine cards.'],
    ['mason', 'Terrace mason', 'Build a trellis at no cost, if you do not own one.'],
    ['water', 'Water finder', 'Pay 1 lira to build irrigation, if you do not own it.'],
    ['host', 'Roadside host', 'Gain 4 lira.'],
    ['architect', 'Cellar architect', 'Build your next cellar level at a 2-lira discount.'],
    ['mentor', 'Planting mentor', 'Plant one vine without its structure requirements; field capacity still applies.'],
    ['broker', 'Orchard broker', 'Sell one grape and receive 2 extra lira.'],
    ['steward', 'Field steward', 'Harvest one field this summer. Each field still yields only once per year.'],
    ['sponsor', 'Cooperative sponsor', 'Gain 1 lira and draw one wine order.'],
    ['patron', 'Estate patron', 'If at least three vines are planted on your estate, gain 2 reputation.'],
  ],
  winter: [
    ['barrel', 'Barrel tender', 'Make one wine from grapes on your crush pad. Cellar limits still apply.'],
    ['keeper', 'Vintage keeper', 'Age all your wines twice, respecting cellar limits and occupied spaces.'],
    ['hand', 'Cellar hand', 'Harvest one unharvested field and gain 1 lira.'],
    ['scout', 'Market scout', 'Draw two wine orders.'],
    ['recruiter', 'Guild recruiter', 'Pay 2 lira to train a worker for next year.'],
    ['merchant', 'Wine merchant', 'Fill one wine order and gain 1 extra lira.'],
    ['pruner', 'Pruning crew', 'Gain 2 lira and draw one vine card.'],
    ['host', 'Winter host', 'Gain 4 lira.'],
    ['judge', 'Reserve judge', 'Discard one wine of value 4 or more to gain 2 reputation.'],
    ['accountant', 'Estate accountant', 'Pay 2 lira to increase annual income by 1, up to 5.'],
  ],
};

const BOARD = [
  ['draw_vine', 'Find vines', 'summer', 'Draw one vine for your hand.', '♧', 'Draw one extra vine.'],
  ['plant', 'Plant vines', 'summer', 'Plant a vine in an owned field with space and the required structures.', '❧', 'Plant one extra vine.'],
  ['build', 'Build a structure', 'summer', 'Pay to improve your estate.', '⌂', 'Gain 1 lira before paying.'],
  ['tour', 'Give a tour', 'summer', 'Earn 2 lira showing guests around your estate.', '☀', 'Gain 1 extra lira.'],
  ['trade', 'Grape & land market', 'summer', 'Sell grapes, or buy or sell one empty field.', '¤', 'Gain 1 reputation.'],
  ['summer_visitor', 'Summer visitors', 'summer', 'Play one summer visitor from your hand.', '☷', 'Play one extra visitor.'],
  ['harvest', 'Harvest a field', 'winter', 'Collect each color of grapes from one field; its vines stay planted.', '♧', 'Harvest one extra field.'],
  ['make_wine', 'Make wine', 'winter', 'Turn grapes into up to two wines. Blends need upgraded cellars.', '♜', 'Make one extra wine.'],
  ['draw_order', 'Find wine orders', 'winter', 'Draw one merchant order for your hand.', '▤', 'Draw one extra order.'],
  ['fill_order', 'Fill an order', 'winter', 'Deliver wines to earn reputation and annual income.', '✧', 'Gain 1 extra reputation.'],
  ['train', 'Train a worker', 'winter', 'Pay 4 lira for a regular worker available next year.', '♟', 'Gain 1 lira before paying.'],
  ['winter_visitor', 'Winter visitors', 'winter', 'Play one winter visitor from your hand.', '☷', 'Play one extra visitor.'],
  ['work', 'Casual work', 'both', 'Gain 1 lira. This space never fills.', '¤', 'No placement bonus.'],
  ['yoke', 'Your yoke', 'both', 'With a yoke, harvest one field or uproot one vine, once a year.', '⚒', 'A private space for your estate.'],
].map(([id, title, season, description, icon, bonus]) => ({ id, title, season, description, icon, bonus }));

const WAKE = [
  'First to act', 'Draw a vine', 'Draw an order', 'Gain 1 lira',
  'Invite a visitor', 'Gain 1 reputation', 'One temporary worker',
];

function clone(value) { return structuredClone(value); }
function hash(value) {
  let result = 2166136261;
  for (const c of String(value)) result = Math.imul(result ^ c.charCodeAt(0), 16777619);
  return result >>> 0 || 1;
}
function random(state) {
  let n = state.rng;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  state.rng = n >>> 0 || 1;
  return state.rng / 4294967296;
}
function shuffle(state, cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function card(state, category, definition) {
  const copy = clone(definition);
  delete copy.count;
  return { id: `${category}-${++state.cardSeq}`, ...copy };
}
function playerOf(state, id) { return state.players.find(p => p.id === id); }
function countHand(p) { return HAND_TYPES.reduce((sum, kind) => sum + p.hand[kind].length, 0); }
function workersLeft(p) { return p.workers.available + Number(p.workers.grandeAvailable); }
function has(p, structure) { return p.structures.includes(structure); }
function cellar(p) { return has(p, 'large_cellar') ? 9 : has(p, 'medium_cellar') ? 6 : 3; }
function planted(p) { return p.fields.reduce((sum, field) => sum + field.vines.length, 0); }
function fieldValue(field) { return field.vines.reduce((sum, v) => sum + v.red + v.white, 0); }
function wineCount(p) { return WINE_TYPES.reduce((sum, type) => sum + p.wines[type].length, 0); }
function grapeCount(p) { return p.grapes.red.length + p.grapes.white.length; }
function tokensValue(collection) { return Object.values(collection).flat().reduce((sum, v) => sum + v, 0); }
function deckCount(state, kind) { return state.decks[kind].length + state.discards[kind].length; }
function spaceCount(state) { return state.players.length <= 2 ? 1 : state.players.length <= 4 ? 2 : 3; }
function showType(type) { return type === 'blush' ? 'blush' : type; }
function showTokens(tokens) { return tokens.map(t => `${showType(t.type)} ${t.value}`).join(' + '); }
function log(state, p, text) {
  state.log.push({ id: ++state.logSeq, year: state.year, phase: state.phase, text, playerId: p?.id ?? null });
  if (state.log.length > 160) state.log.splice(0, state.log.length - 160);
}
function draw(state, p, kind, number = 1) {
  let drawn = 0;
  for (let i = 0; i < number; i++) {
    if (!state.decks[kind].length && state.discards[kind].length) {
      state.decks[kind] = shuffle(state, state.discards[kind].splice(0));
    }
    const next = state.decks[kind].pop();
    if (!next) break;
    p.hand[kind].push(next);
    drawn++;
  }
  return drawn;
}
function discardCard(state, p, kind, id) {
  const index = p.hand[kind].findIndex(c => c.id === id);
  if (index < 0) throw new Error('That card is no longer in your hand.');
  const [selected] = p.hand[kind].splice(index, 1);
  state.discards[kind].push(selected);
  return selected;
}
function addScore(state, p, points) {
  p.score += points;
  if (p.score >= state.target && !state.finalYear) {
    state.finalYear = true;
    log(state, p, `${p.name} reached ${state.target} reputation. Finish this year, then compare estates.`);
  }
}
function nextFree(values, requested, min = 1, max = 9) {
  for (let n = Math.min(requested, max); n >= min; n--) if (!values.includes(n)) return n;
  return null;
}
function putToken(values, requested, min = 1, max = 9) {
  const value = nextFree(values, requested, min, max);
  if (value != null) { values.push(value); values.sort((a, b) => a - b); }
  return value;
}
function removeToken(values, value) {
  const index = values.indexOf(value);
  if (index < 0) throw new Error('That grape or wine is no longer available.');
  values.splice(index, 1);
}
function ageTrack(values, maximum) {
  const occupied = new Set(values);
  for (const value of [...values].sort((a, b) => b - a)) {
    if (value < maximum && !occupied.has(value + 1)) {
      occupied.delete(value); occupied.add(value + 1);
    }
  }
  return [...occupied].sort((a, b) => a - b);
}
function ageWine(p, times = 1) {
  for (let i = 0; i < times; i++) for (const type of WINE_TYPES) p.wines[type] = ageTrack(p.wines[type], cellar(p));
}

export function createGame({ players, target = 20, seed = 'vineyard-table' } = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) throw new Error('A table needs 2–6 players, including computer opponents.');
  if (![12, 20].includes(Number(target))) throw new Error('Choose a 12- or 20-reputation game.');
  if (new Set(players.map(p => p.id)).size !== players.length || players.some(p => typeof p.id !== 'string' || !p.id)) throw new Error('Every player needs a unique identifier.');
  const state = {
    schema: 1, version: 1, status: 'playing', phase: 'spring', year: 1,
    target: Number(target), activePlayerId: players[0].id, finalYear: false,
    rng: hash(seed), cardSeq: 0, logSeq: 0, log: [],
    firstChooser: 0, phaseIndex: 0, order: players.map(p => p.id), placements: [],
    pending: null, discardQueue: [], winnerIds: [], rankings: [],
    decks: { vines: [], orders: [], summer: [], winter: [] },
    discards: { vines: [], orders: [], summer: [], winter: [] }, players: [],
  };
  for (const definition of VINES) for (let i = 0; i < definition.count; i++) state.decks.vines.push(card(state, 'vine', definition));
  for (const definition of ORDERS) for (let i = 0; i < 2; i++) state.decks.orders.push(card(state, 'order', definition));
  for (const season of SEASONS) for (const [effect, name, description] of VISITORS[season]) {
    for (let i = 0; i < 3; i++) state.decks[season].push(card(state, season, { name, season, description, effect }));
  }
  for (const kind of HAND_TYPES) shuffle(state, state.decks[kind]);
  state.players = players.map((definition, index) => {
    const p = {
      id: definition.id, name: String(definition.name || `Estate ${index + 1}`).slice(0, 32),
      bot: Boolean(definition.bot), color: COLORS[index], coins: 5, score: 0, income: 0,
      wake: null, passed: false,
      workers: { available: 2, grandeAvailable: true, total: 3, pending: 0 },
      temporaryWorker: false, windmillUsed: false, tastingUsed: false, yokeUsed: false,
      fields: [5, 6, 7].map((capacity, id) => ({ id, capacity, sold: false, vines: [], harvested: false })),
      grapes: { red: [], white: [] }, wines: { red: [], white: [], blush: [], sparkling: [] },
      structures: [], hand: { vines: [], orders: [], summer: [], winter: [] }, ordersFilled: 0,
    };
    // Everyone starts with the same usable vines and approachable orders. These
    // starter cards are additional to the finite, shuffled draw decks.
    p.hand.vines.push(card(state, 'vine', VINES[0]), card(state, 'vine', VINES[1]));
    p.hand.orders.push(card(state, 'order', ORDERS[0]), card(state, 'order', ORDERS[1]));
    draw(state, p, 'summer'); draw(state, p, 'winter');
    return p;
  });
  log(state, null, 'Every estate starts with 5 lira, two regular workers, a grande worker, and a small cellar. Choose your wake-up row.');
  return state;
}

function plantChoices(p, ignoreRequirements = false) {
  const result = [];
  for (const vine of p.hand.vines) {
    if (!ignoreRequirements && vine.requires.some(required => !has(p, required))) continue;
    for (const field of p.fields) if (!field.sold && fieldValue(field) + vine.red + vine.white <= field.capacity) {
      result.push({ kind: 'plant', cardId: vine.id, fieldId: field.id, ignoreRequirements,
        label: `Plant ${vine.name} in field ${field.id + 1}`,
        detail: `Yield ${vine.red ? `red ${vine.red}` : ''}${vine.red && vine.white ? ' + ' : ''}${vine.white ? `white ${vine.white}` : ''}. Field use ${fieldValue(field) + vine.red + vine.white}/${field.capacity}.${ignoreRequirements ? ' Structure requirements are waived.' : ''}` });
    }
  }
  return result;
}
function harvestChoices(p) {
  return p.fields.filter(f => !f.sold && f.vines.length && !f.harvested).map(field => {
    const red = field.vines.reduce((sum, v) => sum + v.red, 0);
    const white = field.vines.reduce((sum, v) => sum + v.white, 0);
    const gains = [{ type: 'red', value: red }, { type: 'white', value: white }].filter(t => t.value);
    return { kind: 'harvest', fieldId: field.id, label: `Harvest field ${field.id + 1}`,
      detail: `Yield ${showTokens(gains)}. Occupied values move the new grape downward; vines stay planted.` };
  });
}
function wineChoices(p) {
  const result = [];
  function add(type, grapes) {
    const minimum = type === 'blush' ? 4 : type === 'sparkling' ? 7 : 1;
    if (cellar(p) < minimum) return;
    const sum = grapes.reduce((total, t) => total + t.value, 0);
    const value = nextFree(p.wines[type], sum, minimum, cellar(p));
    if (value == null) return;
    result.push({ kind: 'make_wine', recipe: { type, grapes, value },
      label: `Make ${type} ${value}`, detail: `Use ${showTokens(grapes)} → ${type} wine ${value}.${sum !== value ? ` Limited from ${sum} by cellar space.` : ''}` });
  }
  for (const type of ['red', 'white']) for (const value of p.grapes[type]) add(type, [{ type, value }]);
  if (cellar(p) >= 6) for (const red of p.grapes.red) for (const white of p.grapes.white) add('blush', [{ type: 'red', value: red }, { type: 'white', value: white }]);
  if (cellar(p) >= 9) for (let a = 0; a < p.grapes.red.length; a++) for (let b = a + 1; b < p.grapes.red.length; b++) for (const white of p.grapes.white) {
    add('sparkling', [{ type: 'red', value: p.grapes.red[a] }, { type: 'red', value: p.grapes.red[b] }, { type: 'white', value: white }]);
  }
  return result;
}
function orderChoices(p) {
  const result = [];
  for (const selected of p.hand.orders) {
    const seen = new Set();
    function match(index, used) {
      if (index === selected.requirements.length) {
        const wines = [...used].sort((a, b) => WINE_TYPES.indexOf(a.type) - WINE_TYPES.indexOf(b.type) || a.value - b.value);
        const signature = JSON.stringify(wines);
        if (seen.has(signature)) return;
        seen.add(signature);
        result.push({ kind: 'fill_order', cardId: selected.id, wines,
          label: `Fill ${selected.name}`, detail: `Deliver ${showTokens(wines)}. Gain ${selected.points} reputation and +${selected.income} annual income (maximum 5).` });
        return;
      }
      const requirement = selected.requirements[index];
      for (const value of p.wines[requirement.type]) if (value >= requirement.value && !used.some(t => t.type === requirement.type && t.value === value)) {
        match(index + 1, [...used, { type: requirement.type, value }]);
      }
    }
    match(0, []);
  }
  return result;
}
function sellChoices(p, extra = 0) {
  return ['red', 'white'].flatMap(type => p.grapes[type].map(value => ({
    kind: 'sell_grape', type, value, extra,
    label: `Sell ${type} grape ${value}`,
    detail: `Remove this grape and gain ${Math.ceil(value / 3) + extra} lira.`,
  })));
}
function buildChoices(p, discount = 0, only = null) {
  return Object.entries(STRUCTURES).filter(([id, definition]) =>
    (!only || only.includes(id)) && !has(p, id) && (!definition.requires || has(p, definition.requires)) && p.coins >= Math.max(0, definition.cost - discount),
  ).map(([structure, definition]) => ({ kind: 'build', structure, discount,
    label: `Build ${definition.name.toLowerCase()}`,
    detail: `Pay ${Math.max(0, definition.cost - discount)} lira. ${definition.description}` }));
}

function visitorChoices(state, p, season) {
  const result = [];
  for (const visitor of p.hand[season]) {
    let choices = [];
    const simple = (effect, label, detail = visitor.description) => [{ kind: 'visitor_effect', effect, label, detail }];
    if (season === 'summer') {
      switch (visitor.effect) {
        case 'nursery': if (deckCount(state, 'vines')) choices = simple('draw_vines', 'Draw two vines'); break;
        case 'mason': choices = buildChoices(p, 2, ['trellis']); break;
        case 'water': choices = buildChoices(p, 2, ['irrigation']); break;
        case 'host': choices = simple('coins4', 'Gain 4 lira'); break;
        case 'architect': choices = buildChoices(p, 2, ['medium_cellar', 'large_cellar']); break;
        case 'mentor': choices = plantChoices(p, true); break;
        case 'broker': choices = sellChoices(p, 2); break;
        case 'steward': choices = harvestChoices(p); break;
        case 'sponsor': if (deckCount(state, 'orders')) choices = simple('sponsor', 'Gain 1 lira and an order'); break;
        case 'patron': if (planted(p) >= 3) choices = simple('points2', 'Gain 2 reputation'); break;
      }
    } else {
      switch (visitor.effect) {
        case 'barrel': choices = wineChoices(p); break;
        case 'keeper': {
          const next = clone(p); ageWine(next, 2);
          if (JSON.stringify(next.wines) !== JSON.stringify(p.wines)) choices = simple('age2', 'Age wines twice');
          break;
        }
        case 'hand': choices = harvestChoices(p).map(c => ({ ...c, extraCoin: 1, detail: `${c.detail} Gain 1 lira.` })); break;
        case 'scout': if (deckCount(state, 'orders')) choices = simple('draw_orders', 'Draw two orders'); break;
        case 'recruiter': if (p.workers.total < 6 && p.coins >= 2) choices = [{ kind: 'train', cost: 2, label: 'Train a worker for 2 lira', detail: 'Pay 2 lira. Your worker joins next year.' }]; break;
        case 'merchant': choices = orderChoices(p).map(c => ({ ...c, extraCoin: 1, detail: `${c.detail} Gain 1 lira.` })); break;
        case 'pruner': if (deckCount(state, 'vines')) choices = simple('pruner', 'Gain 2 lira and a vine'); break;
        case 'host': choices = simple('coins4', 'Gain 4 lira'); break;
        case 'judge': choices = WINE_TYPES.flatMap(type => p.wines[type].filter(v => v >= 4).map(value => ({ kind: 'judge', type, value, label: `Present ${type} ${value}`, detail: `Discard ${type} wine ${value}; gain 2 reputation.` }))); break;
        case 'accountant': if (p.coins >= 2 && p.income < 5) choices = simple('income', 'Increase annual income'); break;
      }
    }
    for (const choice of choices) result.push({ kind: 'visitor', season, cardId: visitor.id, choice,
      label: `${visitor.name} · ${choice.label}`, detail: choice.detail });
  }
  return result;
}

function choicesFor(state, p, action, bonus = false) {
  switch (action) {
    case 'draw_vine': return deckCount(state, 'vines') ? [{ kind: 'draw', deck: 'vines', count: bonus ? 2 : 1, label: `Draw ${bonus ? 'two vines' : 'a vine'}`, detail: `Add ${bonus ? 'up to two vine cards' : 'one vine card'} to your hand.` }] : [];
    case 'plant': return plantChoices(p);
    case 'build': return buildChoices(p, bonus ? 1 : 0);
    case 'tour': return [{ kind: 'tour', coins: bonus ? 3 : 2, label: `Give a tour · +${bonus ? 3 : 2} lira`, detail: `Gain ${bonus ? 3 : 2} lira.${has(p, 'tasting_room') && wineCount(p) && !p.tastingUsed ? ' Also gain 1 reputation from your tasting room.' : ''}` }];
    case 'trade': return [
      ...sellChoices(p),
      ...p.fields.filter(f => !f.sold && !f.vines.length).map(f => ({ kind: 'sell_field', fieldId: f.id, label: `Sell field ${f.id + 1}`, detail: `Gain ${f.capacity} lira. This field cannot be planted until you buy it back.` })),
      ...p.fields.filter(f => f.sold && p.coins >= f.capacity).map(f => ({ kind: 'buy_field', fieldId: f.id, label: `Buy back field ${f.id + 1}`, detail: `Pay ${f.capacity} lira; restore capacity ${f.capacity}.` })),
    ];
    case 'summer_visitor': return visitorChoices(state, p, 'summer');
    case 'harvest': return harvestChoices(p);
    case 'make_wine': return wineChoices(p);
    case 'draw_order': return deckCount(state, 'orders') ? [{ kind: 'draw', deck: 'orders', count: bonus ? 2 : 1, label: `Draw ${bonus ? 'two orders' : 'an order'}`, detail: `Add ${bonus ? 'up to two wine orders' : 'one wine order'} to your hand.` }] : [];
    case 'fill_order': return orderChoices(p);
    case 'train': return p.workers.total < 6 && p.coins >= (bonus ? 3 : 4) ? [{ kind: 'train', cost: bonus ? 3 : 4, label: `Train a worker · ${bonus ? 3 : 4} lira`, detail: `Pay ${bonus ? 3 : 4} lira. The new worker is available next year; six permanent workers maximum.` }] : [];
    case 'winter_visitor': return visitorChoices(state, p, 'winter');
    case 'work': return [{ kind: 'work', label: 'Casual work · +1 lira', detail: 'Gain 1 lira. This action has unlimited space.' }];
    case 'yoke': return has(p, 'yoke') && !p.yokeUsed ? [
      ...harvestChoices(p),
      ...p.fields.flatMap(field => field.vines.map(vine => ({ kind: 'uproot', fieldId: field.id, cardId: vine.id, label: `Uproot ${vine.name} from field ${field.id + 1}`, detail: 'Return this vine to your hand. It can be replanted later.' }))),
    ] : [];
    default: return [];
  }
}

function pendingChoices(state, p) {
  switch (state.pending?.kind) {
    case 'plant': return plantChoices(p);
    case 'harvest': return harvestChoices(p);
    case 'make_wine': return wineChoices(p);
    case 'visitor': return visitorChoices(state, p, state.pending.season);
    case 'sell_grape': return sellChoices(p);
    default: return [];
  }
}
function pendingName(pending) {
  return { plant: 'planting', harvest: 'harvesting', make_wine: 'winemaking', visitor: 'visitors', sell_grape: 'selling grapes' }[pending.kind];
}
function placementsFor(state, p, action) {
  if (!workersLeft(p)) return [];
  const workers = [];
  if (p.workers.available > 0) workers.push('regular');
  if (p.workers.grandeAvailable) workers.push('grande');
  if (action === 'work' || action === 'yoke') return workers.map(worker => ({ action, worker, slot: -1, bonus: false }));
  const occupied = new Set(state.placements.filter(place => place.action === action && place.slot >= 0).map(place => place.slot));
  const slots = Array.from({ length: spaceCount(state) }, (_, i) => i).filter(i => !occupied.has(i));
  if (!slots.length) return p.workers.grandeAvailable ? [{ action, worker: 'grande', slot: -1, bonus: false }] : [];
  return workers.flatMap(worker => slots.map(slot => ({ action, worker, slot, bonus: slot === 1 })));
}

function listMoves(state, playerId) {
  const p = playerOf(state, playerId);
  if (!p || state.status !== 'playing' || state.activePlayerId !== playerId) return [];
  const moves = [];
  function add(group, move, placement = null, extra = {}) {
    const worker = placement?.worker ?? null;
    let detail = move.detail || '';
    if (placement) detail = `${worker === 'grande' ? 'Use your grande worker' : 'Use one regular worker'}${placement.slot === -1 && placement.action !== 'work' && placement.action !== 'yoke' ? ' on this full action' : ''}. ${detail}`;
    if (placement?.bonus && ['plant', 'harvest', 'summer_visitor', 'winter_visitor'].includes(group)) detail += ` Bonus: ${BOARD.find(b => b.id === group).bonus.toLowerCase()}`;
    if (group === 'make_wine') detail += state.pending ? ' Included in this placement; no additional worker.' : ` You may make ${placement?.bonus ? 'two more wines' : 'one more wine'} afterward without another worker.`;
    if (group === 'trade' && move.kind === 'sell_grape' && !state.pending) detail += ' You may sell more grapes in this placement.';
    if (placement?.bonus && ['trade', 'fill_order'].includes(group)) detail += ' Bonus: +1 reputation.';
    if (state.pending && group !== 'make_wine' && group !== 'pass') detail += ' Included in this placement; no additional worker.';
    moves.push({ key: `v${state.version}:${moves.length}`, group, label: move.label + (placement?.bonus ? ' · bonus space' : ''), detail, worker,
      _move: move, _placement: placement, ...extra });
  }
  if (state.pending) {
    for (const choice of pendingChoices(state, p)) add(state.pending.group, choice);
    add('pass', { kind: 'finish', label: `Finish ${pendingName(state.pending)}`, detail: 'End this placement and let the next estate act.' });
    return moves;
  }
  if (state.phase === 'spring') {
    for (let row = 1; row <= 7; row++) if (!state.players.some(player => player.wake === row)) {
      for (const visitorSeason of row === 5 ? SEASONS : [null]) add('wake', {
        kind: 'wake', row, visitorSeason,
        label: row === 1 ? 'Wake up first' : `Wake up ${row}${visitorSeason ? ` · ${visitorSeason} visitor` : ''}`,
        detail: `${row === 5 ? `Draw one ${visitorSeason} visitor` : WAKE[row - 1]}. Earlier rows act first in summer, autumn, and winter.`,
      });
    }
    return moves;
  }
  if (state.phase === 'autumn') {
    const combinations = has(p, 'cottage') ? [['summer', 'summer'], ['summer', 'winter'], ['winter', 'winter']] : [['summer'], ['winter']];
    for (const decks of combinations) add('visitor', { kind: 'autumn', decks,
      label: decks.length === 1 ? `Invite a ${decks[0]} visitor` : decks[0] === decks[1] ? `Invite two ${decks[0]} visitors` : 'Invite one visitor of each season',
      detail: `${decks.length === 2 ? 'Your cottage provides an extra invitation. ' : ''}Draw visitors now; play them on their seasonal worker action.` });
    return moves;
  }
  if (state.phase === 'discard') {
    for (const kind of HAND_TYPES) for (const selected of p.hand[kind]) add('discard', { kind: 'discard', deck: kind, cardId: selected.id,
      label: `Discard ${selected.name}`, detail: `${kind === 'vines' ? 'Vine' : kind === 'orders' ? 'Wine order' : `${kind} visitor`}. You have ${countHand(p)} cards; keep at most seven at year-end.` });
    return moves;
  }
  if (SEASONS.includes(state.phase)) {
    for (const action of BOARD.filter(b => b.season === state.phase || b.season === 'both')) {
      for (const placement of placementsFor(state, p, action.id)) for (const choice of choicesFor(state, p, action.id, placement.bonus)) add(action.id, choice, placement);
    }
    add('pass', { kind: 'pass', label: state.phase === 'summer' ? 'Pass to winter' : 'Finish the year',
      detail: state.phase === 'summer' ? `Save ${workersLeft(p)} unused worker${workersLeft(p) === 1 ? '' : 's'} for winter. You cannot act again this summer.` : 'Take no more winter actions. Year-end begins after every estate finishes.' });
  }
  return moves;
}

export function legalActions(state, playerId) {
  return listMoves(state, playerId).map(({ _move, _placement, ...action }) => action);
}

function harvest(state, p, fieldId) {
  const field = p.fields.find(f => f.id === fieldId);
  const results = [];
  for (const type of ['red', 'white']) {
    const yieldValue = field.vines.reduce((sum, vine) => sum + vine[type], 0);
    if (yieldValue) {
      const value = putToken(p.grapes[type], yieldValue);
      results.push(value == null ? `${type} grapes had no free space` : `${type} ${value}`);
    }
  }
  field.harvested = true;
  log(state, p, `${p.name} harvested field ${field.id + 1}: ${results.join(', ')}.`);
}
function perform(state, p, move, placement = null) {
  switch (move.kind) {
    case 'draw': {
      const count = draw(state, p, move.deck, move.count);
      log(state, p, `${p.name} drew ${count} ${move.deck === 'vines' ? 'vine card' : 'wine order'}${count === 1 ? '' : 's'}.`);
      break;
    }
    case 'plant': {
      const index = p.hand.vines.findIndex(v => v.id === move.cardId);
      const [vine] = p.hand.vines.splice(index, 1);
      p.fields.find(f => f.id === move.fieldId).vines.push(vine);
      log(state, p, `${p.name} planted ${vine.name} in field ${move.fieldId + 1}.`);
      if (has(p, 'windmill') && !p.windmillUsed) { p.windmillUsed = true; addScore(state, p, 1); log(state, p, `${p.name}'s windmill earned 1 reputation.`); }
      break;
    }
    case 'build': {
      const definition = STRUCTURES[move.structure];
      p.coins -= Math.max(0, definition.cost - move.discount);
      p.structures.push(move.structure);
      log(state, p, `${p.name} built a ${definition.name.toLowerCase()}.`);
      break;
    }
    case 'tour':
      p.coins += move.coins;
      log(state, p, `${p.name} gave a vineyard tour and earned ${move.coins} lira.`);
      if (has(p, 'tasting_room') && wineCount(p) && !p.tastingUsed) { p.tastingUsed = true; addScore(state, p, 1); log(state, p, `${p.name}'s tasting room earned 1 reputation.`); }
      break;
    case 'sell_grape':
      removeToken(p.grapes[move.type], move.value);
      p.coins += Math.ceil(move.value / 3) + (move.extra || 0);
      log(state, p, `${p.name} sold a ${move.type} ${move.value} grape.`);
      break;
    case 'sell_field': {
      const field = p.fields.find(f => f.id === move.fieldId); field.sold = true; p.coins += field.capacity;
      log(state, p, `${p.name} sold field ${field.id + 1} for ${field.capacity} lira.`); break;
    }
    case 'buy_field': {
      const field = p.fields.find(f => f.id === move.fieldId); field.sold = false; p.coins -= field.capacity;
      log(state, p, `${p.name} bought back field ${field.id + 1}.`); break;
    }
    case 'harvest': harvest(state, p, move.fieldId); break;
    case 'make_wine':
      for (const token of move.recipe.grapes) removeToken(p.grapes[token.type], token.value);
      p.wines[move.recipe.type].push(move.recipe.value);
      p.wines[move.recipe.type].sort((a, b) => a - b);
      log(state, p, `${p.name} made ${move.recipe.type} wine ${move.recipe.value}.`);
      break;
    case 'fill_order': {
      const selected = discardCard(state, p, 'orders', move.cardId);
      for (const token of move.wines) removeToken(p.wines[token.type], token.value);
      p.income = Math.min(5, p.income + selected.income);
      p.ordersFilled++;
      log(state, p, `${p.name} filled ${selected.name}: +${selected.points} reputation; annual income ${p.income}.`);
      addScore(state, p, selected.points);
      break;
    }
    case 'train':
      p.coins -= move.cost; p.workers.total++; p.workers.pending++;
      log(state, p, `${p.name} trained a worker for next year.`); break;
    case 'work': p.coins++; log(state, p, `${p.name} earned 1 lira from casual work.`); break;
    case 'uproot': {
      const field = p.fields.find(f => f.id === move.fieldId);
      const index = field.vines.findIndex(v => v.id === move.cardId);
      const [vine] = field.vines.splice(index, 1); p.hand.vines.push(vine);
      log(state, p, `${p.name} returned ${vine.name} from field ${field.id + 1} to their hand.`); break;
    }
    case 'visitor': {
      const visitor = discardCard(state, p, move.season, move.cardId);
      log(state, p, `${p.name} welcomed ${visitor.name}.`);
      perform(state, p, move.choice);
      break;
    }
    case 'visitor_effect':
      switch (move.effect) {
        case 'draw_vines': draw(state, p, 'vines', 2); break;
        case 'coins4': p.coins += 4; break;
        case 'sponsor': p.coins++; draw(state, p, 'orders'); break;
        case 'points2': addScore(state, p, 2); break;
        case 'age2': ageWine(p, 2); break;
        case 'draw_orders': draw(state, p, 'orders', 2); break;
        case 'pruner': p.coins += 2; draw(state, p, 'vines'); break;
        case 'income': p.coins -= 2; p.income++; break;
      }
      log(state, p, `${p.name}: ${move.label.toLowerCase()}.`); break;
    case 'judge': removeToken(p.wines[move.type], move.value); addScore(state, p, 2); log(state, p, `${p.name} presented ${move.type} ${move.value} for 2 reputation.`); break;
  }
  if (move.extraCoin) p.coins += move.extraCoin;
  if (placement?.bonus && ['trade', 'fill_order'].includes(placement.action)) addScore(state, p, 1);
}

function activate(state, phase) {
  state.phase = phase; state.phaseIndex = 0; state.pending = null;
  for (const p of state.players) p.passed = SEASONS.includes(phase) && workersLeft(p) === 0;
  if (phase === 'summer' || phase === 'winter') {
    const first = state.order.find(id => !playerOf(state, id).passed);
    if (!first) { if (phase === 'summer') activate(state, 'autumn'); else yearEnd(state); return; }
    state.activePlayerId = first;
  } else state.activePlayerId = state.order[0];
  log(state, null, phase === 'summer' ? 'Summer begins. Build, plant, and keep workers for winter.' : phase === 'autumn' ? 'Autumn invitations: each estate chooses a visitor.' : 'Winter begins. Harvest, make wine, and fill orders.');
}
function advanceTurn(state, actingId) {
  const p = playerOf(state, actingId);
  if (!workersLeft(p)) p.passed = true;
  const start = state.order.indexOf(actingId);
  for (let offset = 1; offset <= state.order.length; offset++) {
    const id = state.order[(start + offset) % state.order.length];
    if (!playerOf(state, id).passed) { state.activePlayerId = id; return; }
  }
  if (state.phase === 'summer') activate(state, 'autumn');
  else yearEnd(state);
}
function finishGame(state) {
  state.status = 'finished'; state.phase = 'finished'; state.activePlayerId = null;
  state.rankings = state.players.map(p => ({ id: p.id, name: p.name, score: p.score, coins: p.coins, wineValue: tokensValue(p.wines), grapeValue: tokensValue(p.grapes) }))
    .sort((a, b) => b.score - a.score || b.coins - a.coins || b.wineValue - a.wineValue || b.grapeValue - a.grapeValue);
  const leader = state.rankings[0];
  state.winnerIds = state.rankings.filter(p => p.score === leader.score && p.coins === leader.coins && p.wineValue === leader.wineValue && p.grapeValue === leader.grapeValue).map(p => p.id);
  state.rankings = state.rankings.map((p, index, list) => ({ ...p, rank: index && p.score === list[index - 1].score && p.coins === list[index - 1].coins && p.wineValue === list[index - 1].wineValue && p.grapeValue === list[index - 1].grapeValue ? list.findIndex(other => other.score === p.score && other.coins === p.coins && other.wineValue === p.wineValue && other.grapeValue === p.grapeValue) + 1 : index + 1 }));
  log(state, null, `${state.winnerIds.map(id => playerOf(state, id).name).join(' and ')} ${state.winnerIds.length === 1 ? 'wins' : 'share the win'} with ${leader.score} reputation.`);
}
function nextYear(state) {
  if (state.finalYear) { finishGame(state); return; }
  state.year++; state.phase = 'spring'; state.phaseIndex = 0;
  state.firstChooser = (state.firstChooser + state.players.length - 1) % state.players.length;
  for (const p of state.players) { p.wake = null; p.passed = false; }
  state.order = Array.from({ length: state.players.length }, (_, i) => state.players[(state.firstChooser + i) % state.players.length].id);
  state.activePlayerId = state.order[0];
  log(state, null, `Year ${state.year}. Choose new wake-up positions.`);
}
function yearEnd(state) {
  state.pending = null;
  for (const p of state.players) {
    p.grapes.red = ageTrack(p.grapes.red, 9); p.grapes.white = ageTrack(p.grapes.white, 9);
    ageWine(p);
    p.coins += p.income;
    p.workers.available = p.workers.total - 1; p.workers.grandeAvailable = true; p.workers.pending = 0;
    p.temporaryWorker = false; p.windmillUsed = false; p.tastingUsed = false; p.yokeUsed = false;
    for (const field of p.fields) field.harvested = false;
  }
  state.placements = [];
  log(state, null, 'Year-end: grapes and eligible wines age, annual income is paid, and workers return.');
  state.discardQueue = state.order.filter(id => countHand(playerOf(state, id)) > 7);
  if (state.discardQueue.length) { state.phase = 'discard'; state.activePlayerId = state.discardQueue[0]; }
  else nextYear(state);
}
function setPending(state, p, selected) {
  const { _move: move, _placement: placement } = selected;
  let pending = null;
  if (placement.action === 'plant' && placement.bonus) pending = { kind: 'plant', group: 'plant', remaining: 1 };
  if (placement.action === 'harvest' && placement.bonus) pending = { kind: 'harvest', group: 'harvest', remaining: 1 };
  if (placement.action === 'make_wine') pending = { kind: 'make_wine', group: 'make_wine', remaining: placement.bonus ? 2 : 1 };
  if (['summer_visitor', 'winter_visitor'].includes(placement.action) && placement.bonus) pending = { kind: 'visitor', group: placement.action, remaining: 1, season: move.season };
  if (placement.action === 'trade' && move.kind === 'sell_grape') pending = { kind: 'sell_grape', group: 'trade', remaining: 99 };
  if (pending) {
    state.pending = { ...pending, playerId: p.id };
    if (pendingChoices(state, p).length) return true;
    state.pending = null;
  }
  return false;
}

export function applyAction(state, playerId, key) {
  if (typeof key !== 'string') throw new Error('Choose a currently available action.');
  const selected = listMoves(state, playerId).find(action => action.key === key);
  if (!selected) throw new Error(state.activePlayerId !== playerId ? 'It is not your turn.' : 'That action is no longer available. Refresh the table and choose again.');
  const next = clone(state);
  const p = playerOf(next, playerId);
  const move = selected._move;
  next.version++;
  if (next.pending) {
    if (move.kind !== 'finish') { perform(next, p, move); next.pending.remaining--; }
    if (move.kind !== 'finish' && next.pending.remaining > 0 && pendingChoices(next, p).length) return next;
    next.pending = null; advanceTurn(next, playerId); return next;
  }
  switch (move.kind) {
    case 'wake':
      p.wake = move.row;
      if (move.row === 2) draw(next, p, 'vines');
      if (move.row === 3) draw(next, p, 'orders');
      if (move.row === 4) p.coins++;
      if (move.row === 5) draw(next, p, move.visitorSeason);
      if (move.row === 6) addScore(next, p, 1);
      if (move.row === 7) { p.workers.available++; p.temporaryWorker = true; }
      log(next, p, `${p.name} chose wake-up row ${move.row}: ${WAKE[move.row - 1].toLowerCase()}.`);
      next.phaseIndex++;
      if (next.phaseIndex === next.players.length) {
        next.order = [...next.players].sort((a, b) => a.wake - b.wake).map(player => player.id);
        activate(next, 'summer');
      } else next.activePlayerId = next.order[next.phaseIndex];
      return next;
    case 'autumn':
      for (const deck of move.decks) draw(next, p, deck);
      log(next, p, `${p.name} invited ${move.decks.join(' and ')} visitor${move.decks.length > 1 ? 's' : ''}.`);
      next.phaseIndex++;
      if (next.phaseIndex === next.players.length) activate(next, 'winter');
      else next.activePlayerId = next.order[next.phaseIndex];
      return next;
    case 'discard':
      discardCard(next, p, move.deck, move.cardId);
      // Discards are public only after leaving a hidden hand. The log names the
      // category, avoiding unnecessary hand history for reconnecting opponents.
      log(next, p, `${p.name} discarded a ${move.deck === 'vines' ? 'vine' : move.deck === 'orders' ? 'wine order' : `${move.deck} visitor`}.`);
      if (countHand(p) <= 7) next.discardQueue.shift();
      if (next.discardQueue.length) next.activePlayerId = next.discardQueue[0];
      else nextYear(next);
      return next;
    case 'pass':
      p.passed = true; log(next, p, `${p.name} ${next.phase === 'summer' ? `saved ${workersLeft(p)} workers for winter` : 'finished the year'}.`);
      advanceTurn(next, playerId); return next;
  }
  const placement = selected._placement;
  if (placement.worker === 'regular') p.workers.available--; else p.workers.grandeAvailable = false;
  next.placements.push({ action: placement.action, playerId, worker: placement.worker, slot: placement.slot, bonus: placement.bonus });
  if (placement.action === 'yoke') p.yokeUsed = true;
  perform(next, p, move, placement);
  if (!setPending(next, p, selected)) advanceTurn(next, playerId);
  return next;
}

function orderFit(p, recipe) {
  let best = 0;
  for (const selected of p.hand.orders) for (const requirement of selected.requirements) if (requirement.type === recipe.type) {
    best = Math.max(best, recipe.value >= requirement.value ? 4 - Math.min(1.5, (recipe.value - requirement.value) * .2) : 2 - (requirement.value - recipe.value) * .2);
  }
  return best;
}
function valueMove(state, p, move) {
  const fillable = orderChoices(p).length;
  const harvestable = harvestChoices(p).length;
  switch (move.kind) {
    case 'wake': return ({ 1: 2, 2: p.hand.vines.length < 2 ? 7 : 3, 3: p.hand.orders.length < 2 ? 7 : 2, 4: p.coins < 4 ? 6 : 2.5, 5: 4, 6: p.score >= state.target - 2 ? 14 : 5, 7: p.workers.total < 5 ? 10 : 7 })[move.row];
    case 'autumn': return move.decks.reduce((sum, deck) => sum + (deck === 'winter' ? (planted(p) ? 5 : 3) : (p.coins < 4 || planted(p) < 2 ? 5 : 3)), 0);
    case 'discard': {
      const chosen = p.hand[move.deck].find(c => c.id === move.cardId);
      if (move.deck === 'vines') return 3 + p.hand.vines.length + planted(p) * .8 - chosen.red - chosen.white + chosen.requires.filter(r => !has(p, r)).length;
      if (move.deck === 'orders') {
        const ready = orderChoices(p).some(c => c.cardId === chosen.id);
        return ready ? -20 : 2 + p.hand.orders.length + Math.max(...chosen.requirements.map(r => r.value)) * .25 - (chosen.requirements.some(r => r.type === 'red' || r.type === 'white') ? 1 : 0);
      }
      return visitorChoices(state, p, move.deck).some(c => c.cardId === chosen.id) ? -2 : 5;
    }
    case 'plant': {
      const v = p.hand.vines.find(c => c.id === move.cardId), f = p.fields.find(field => field.id === move.fieldId);
      return (planted(p) === 0 ? 12 : planted(p) < 4 ? 7 : 3) + (v.red + v.white) * .45 + (f.vines.length && fieldValue(f) < 5 ? 1 : 0) + (has(p, 'windmill') && !p.windmillUsed ? 1 : 0);
    }
    case 'harvest': {
      const f = p.fields.find(field => field.id === move.fieldId);
      const yieldValue = f.vines.reduce((sum, v) => sum + v.red + v.white, 0);
      return (grapeCount(p) < 2 ? 8 : 4) + yieldValue * .4 + (f.vines.some(v => v.red) && f.vines.some(v => v.white) ? 1 : 0);
    }
    case 'make_wine': return 6 + orderFit(p, move.recipe) + (move.recipe.type === 'red' || move.recipe.type === 'white' ? .4 : 0) - Math.max(0, move.recipe.grapes.reduce((s, t) => s + t.value, 0) - move.recipe.value) * .25;
    case 'fill_order': return 15 + p.hand.orders.find(c => c.id === move.cardId).points * 1.5 - move.wines.reduce((sum, t) => sum + t.value, 0) * .08;
    case 'build': {
      const c = move.structure;
      if (['trellis', 'irrigation'].includes(c)) return p.hand.vines.some(v => v.requires.includes(c) && v.requires.every(r => r === c || has(p, r))) ? 8.5 : planted(p) < 2 ? 4 : 1;
      if (c === 'medium_cellar') return grapeCount(p) && (Math.max(0, ...p.grapes.red, ...p.grapes.white) >= 3 || p.hand.orders.some(o => o.requirements.some(r => r.type === 'blush'))) ? 9 : state.year >= 3 && planted(p) ? 6 : 1;
      if (c === 'large_cellar') return p.hand.orders.some(o => o.requirements.some(r => r.type === 'sparkling' || r.value > 6)) && (grapeCount(p) + wineCount(p) > 1) ? 7 : 1;
      if (c === 'cottage') return state.year <= 4 && p.workers.total >= 4 ? 5 : 1;
      if (c === 'windmill') return p.hand.vines.length && planted(p) < 3 && state.year <= 4 ? 5 : 1;
      if (c === 'tasting_room') return wineCount(p) ? (p.score >= state.target - 4 ? 8 : 4) : 1;
      return c === 'yoke' && planted(p) && p.workers.total >= 4 ? 4.5 : 1;
    }
    case 'train': return p.score >= state.target - 4 ? 2 : p.workers.total === 3 ? 11 : p.workers.total === 4 ? 8 : state.year <= 5 ? 5 : 2;
    case 'tour': return (p.coins < 4 ? 7 : p.coins < 7 ? 4.5 : 1) + (has(p, 'tasting_room') && wineCount(p) && !p.tastingUsed ? 3 : 0);
    case 'work': return p.coins < 4 ? 3.5 : 1;
    case 'draw': return move.deck === 'vines' ? (p.hand.vines.length === 0 && planted(p) < 3 ? 9 : planted(p) < 2 && p.hand.vines.length < 2 ? 6 : .5) : (p.hand.orders.length === 0 ? 12 : !fillable && wineCount(p) && p.hand.orders.length < 3 ? 8 : p.hand.orders.length < 2 ? 5 : .5);
    case 'sell_field': return p.coins < 4 && p.fields.filter(f => !f.sold).length > 1 ? 7 + move.fieldId * .1 : .25;
    case 'buy_field': return p.fields.filter(f => !f.sold).every(f => fieldValue(f) >= f.capacity - 1) && p.hand.vines.length ? 5 : .1;
    case 'sell_grape': return (p.coins < 3 ? 4 : .2) + (move.extra || 0) - move.value * .2;
    case 'uproot': return .05;
    case 'judge': return p.score >= state.target - 2 ? 18 : fillable ? 1 : 5;
    case 'visitor': return valueMove(state, p, move.choice) + .7;
    case 'visitor_effect':
      switch (move.effect) {
        case 'coins4': return p.coins < 4 ? 9 : p.coins < 8 ? 5 : 2;
        case 'draw_vines': return p.hand.vines.length < 2 && planted(p) < 4 ? 8 : 2;
        case 'sponsor': return p.hand.orders.length < 2 ? 7 : 3;
        case 'points2': return p.score >= state.target - 2 ? 18 : 6;
        case 'age2': {
          const aged = clone(p); ageWine(aged, 2);
          return orderChoices(aged).length > fillable ? 13 : 5;
        }
        case 'draw_orders': return !p.hand.orders.length ? 12 : !fillable && wineCount(p) && p.hand.orders.length < 3 ? 9 : 3;
        case 'pruner': return p.coins < 4 || p.hand.vines.length < 2 ? 7 : 3;
        case 'income': return state.year < 6 && p.income < 3 ? 6 : 2;
      }
      return 1;
    case 'finish': return state.pending?.kind === 'sell_grape' ? 4 : .1;
    case 'pass': {
      if (state.phase === 'winter') return 0;
      let reserve = harvestable ? 2 : grapeCount(p) ? 1 : 0;
      if (fillable) reserve++;
      if (p.workers.total < 5 && p.coins >= 3) reserve++;
      reserve = Math.min(3, reserve);
      return workersLeft(p) <= reserve && (planted(p) || grapeCount(p) || wineCount(p) || p.coins >= 4) ? 11.5 : .1;
    }
    default: return 0;
  }
}

export function chooseBotAction(state, playerId) {
  const p = playerOf(state, playerId), actions = listMoves(state, playerId);
  if (!p || !actions.length) return null;
  let best = actions[0], bestValue = -Infinity;
  for (const action of actions) {
    let value = valueMove(state, p, action._move);
    if (action._placement?.bonus) value += .6;
    if (action.worker === 'grande' && p.workers.available > 0) value -= .75;
    // Keep a few workers for the production pipeline. The first planted vine
    // remains urgent: conserving an empty estate's workers accomplishes little.
    if (state.phase === 'summer' && action._placement && planted(p) && workersLeft(p) <= 2) {
      const underlying = action._move.kind === 'visitor' ? action._move.choice.kind : action._move.kind;
      if (!['harvest', 'make_wine', 'fill_order'].includes(underlying)) value -= 2;
    }
    value += (hash(`${playerId}/${state.version}/${action.key}`) % 101) / 10000;
    if (value > bestValue) { bestValue = value; best = action; }
  }
  return best.key;
}

function boardReason(state, p, board, actions) {
  if (actions.some(a => a.group === board.id)) return '';
  if (state.status === 'finished') return 'The game is finished.';
  if (state.activePlayerId !== p.id) return `Waiting for ${playerOf(state, state.activePlayerId)?.name || 'the active estate'}.`;
  if (state.pending) return `Finish your current ${pendingName(state.pending)} placement first.`;
  if (!SEASONS.includes(state.phase)) return state.phase === 'spring' ? 'Choose a wake-up row first.' : state.phase === 'autumn' ? 'Choose your autumn visitor first.' : 'Discard down to seven cards first.';
  if (board.season !== 'both' && board.season !== state.phase) return `This action opens in ${board.season}.`;
  if (!workersLeft(p)) return 'No unused workers remain this year.';
  if (!placementsFor(state, p, board.id).length) return 'All spaces are occupied and your grande worker has already been used.';
  switch (board.id) {
    case 'plant':
      if (!p.hand.vines.length) return 'Draw a vine card before planting.';
      if (p.fields.every(f => f.sold)) return 'Buy back a field before planting.';
      if (p.hand.vines.every(v => v.requires.some(r => !has(p, r)))) return 'Your vines need a trellis, irrigation, or both. Inspect their requirements in your hand.';
      return 'No owned field has enough remaining capacity for these vines.';
    case 'build': return Object.keys(STRUCTURES).every(s => has(p, s)) ? 'Every estate structure is already built.' : 'You need more lira for an eligible structure. Build the medium cellar before the large one.';
    case 'trade': return 'You need grapes to sell, an empty owned field to sell, or enough lira to buy back a sold field.';
    case 'harvest': return planted(p) ? 'Every planted field has already been harvested this year.' : 'Plant a vine before harvesting.';
    case 'make_wine': return grapeCount(p) ? 'No legal wine fits. Upgrade your cellar for blends or higher values; occupied values must have a free lower space.' : 'Harvest grapes before making wine.';
    case 'fill_order': return p.hand.orders.length ? 'Your cellar does not yet match an order. Each requirement needs its own wine at or above the shown value.' : 'Draw a wine order before filling one.';
    case 'train': return p.workers.total >= 6 ? 'You already have six permanent workers, including anyone still in training.' : 'Training needs 4 lira, or 3 on the bonus space.';
    case 'summer_visitor': case 'winter_visitor': return p.hand[board.season].length ? 'Your visitors need resources or prerequisites that are not available yet.' : `Invite a ${board.season} visitor before playing one.`;
    case 'draw_vine': case 'draw_order': return 'This deck and its discard pile are empty.';
    case 'yoke': return !has(p, 'yoke') ? 'Build a yoke to unlock your private space.' : p.yokeUsed ? 'Your yoke has already been used this year.' : 'You need a planted vine to uproot or an unharvested field.';
    default: return 'This action is unavailable right now.';
  }
}
function cleanCard(selected, type) {
  if (type === 'summer' || type === 'winter') return { id: selected.id, name: selected.name, season: selected.season, description: selected.description };
  return clone(selected);
}

export function publicView(state, playerId) {
  const p = playerOf(state, playerId);
  if (!p) throw new Error('You are not seated at this table.');
  const actions = legalActions(state, playerId);
  const recommendedKey = chooseBotAction(state, playerId);
  const recommended = actions.find(a => a.key === recommendedKey);
  const ownTurn = state.activePlayerId === playerId;
  const waitingName = playerOf(state, state.activePlayerId)?.name;
  let headline, body;
  if (state.status === 'finished') {
    headline = state.winnerIds.includes(playerId) ? 'Your estate takes the honours' : 'The final vintage is in';
    body = 'Reputation leads the ranking; ties use lira, then total wine value, then grape value.';
  } else if (!ownTurn) {
    headline = `${waitingName}'s turn`;
    body = 'Inspect your estate and orders while the next placement is made.';
  } else if (state.pending) {
    headline = `Continue ${pendingName(state.pending)}`;
    body = `You may take ${state.pending.kind === 'sell_grape' ? 'another grape sale' : `${state.pending.remaining} more choice${state.pending.remaining > 1 ? 's' : ''}`} within this placement, or finish it. No extra worker is needed.`;
  } else {
    headline = { spring: 'Choose when to start', summer: 'Build for the coming harvest', autumn: 'Invite a helpful visitor', winter: 'Turn your harvest into reputation', discard: 'Choose the seven cards to keep' }[state.phase];
    body = { spring: 'Earlier rows get first pick of actions; later rows give stronger bonuses.', summer: 'Your workers are shared across summer and winter. Keep enough to harvest, make wine, and fill an order.', autumn: 'This invitation uses no worker. The visitor becomes available for its matching season.', winter: 'Harvesting, winemaking, and filling an order are separate actions. Wines may exceed an order’s minimum value.', discard: `You have ${countHand(p)} cards. Discard one at a time until seven remain.` }[state.phase];
  }
  return {
    version: state.version, status: state.status, phase: state.phase, year: state.year, target: state.target,
    activePlayerId: state.activePlayerId, finalYear: state.finalYear,
    players: state.players.map(player => ({
      id: player.id, name: player.name, color: player.color, bot: player.bot,
      coins: player.coins, score: player.score, income: player.income, wake: player.wake, passed: player.passed,
      workers: clone(player.workers), fields: clone(player.fields), grapes: clone(player.grapes), wines: clone(player.wines),
      structures: [...player.structures], cellar: cellar(player),
      handCounts: Object.fromEntries(HAND_TYPES.map(kind => [kind, player.hand[kind].length])),
    })),
    you: { id: playerId, hand: Object.fromEntries(HAND_TYPES.map(kind => [kind, p.hand[kind].map(c => cleanCard(c, kind))])) },
    board: BOARD.map(board => ({ ...board,
      capacity: board.id === 'work' ? 0 : board.id === 'yoke' ? 1 : spaceCount(state),
      occupied: state.placements.filter(place => place.action === board.id && (board.id !== 'yoke' || place.playerId === playerId))
        .map(({ playerId: id, worker, bonus, slot }) => ({ playerId: id, worker, bonus, slot })),
      reason: boardReason(state, p, board, actions),
    })),
    legalActions: actions,
    wakeTrack: WAKE.map((bonus, i) => ({ row: i + 1, bonus, playerId: state.players.find(player => player.wake === i + 1)?.id ?? null })),
    guide: { headline, body, recommendedKey, recommendation: recommended ? `${recommended.label}. ${recommended.detail}` : null,
      steps: [
        { label: 'Have an order', done: p.hand.orders.length > 0 || p.ordersFilled > 0, detail: 'Match the wine types and minimum values a merchant requests.' },
        { label: 'Plant vines', done: planted(p) > 0, detail: 'Vines stay planted and can yield again next year.' },
        { label: 'Harvest grapes', done: grapeCount(p) > 0 || wineCount(p) > 0 || p.ordersFilled > 0, detail: 'Harvest a field once per year, creating one token per color.' },
        { label: 'Make wine', done: wineCount(p) > 0 || p.ordersFilled > 0, detail: 'Use a separate worker action to turn grapes into wine.' },
        { label: 'Fill orders', done: p.ordersFilled > 0, detail: 'Deliver wine for reputation and income every year.' },
        { label: `Reach ${state.target} reputation`, done: p.score >= state.target, detail: 'The current year finishes before the winner is decided.' },
      ],
    },
    pending: state.pending ? { label: pendingName(state.pending), remaining: state.pending.remaining } : null,
    log: clone(state.log), winnerIds: [...state.winnerIds], rankings: clone(state.rankings),
    ruleset: { name: 'Vineyard Table', version: 1, visitorTypesPerSeason: 10, visitorCardsPerSeason: 30, target: state.target,
      notes: 'Uniform starter estates; original visitors and orders; strategic AI instead of Automa. Base seasonal rules; no Tuscany expansion.' },
  };
}
