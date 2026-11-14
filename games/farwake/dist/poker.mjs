/** Card and poker rules shared by the local game and multiplayer authority. */
export const CARD_SUITS = Object.freeze(['♣', '♦', '♥', '♠']);
export const POKER_HAND_NAMES = Object.freeze(['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']);
export const gamblingHash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export function gamblingRandom(state) {
  state.rng = (state.rng + 0x6D2B79F5) >>> 0;
  let n = state.rng; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}
export function shuffledDeck(state) {
  const deck = Array.from({ length: 52 }, (_, index) => index);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(gamblingRandom(state) * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
export function cardInfo(card) {
  if (!Number.isInteger(card) || card < 0 || card >= 52) return { rank: '', value: null, suit: '', label: 'Face down', color: 'back', hidden: true };
  const value = card % 13 + 2, suitIndex = Math.floor(card / 13), rank = value <= 10 ? String(value) : ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[value];
  return { rank, value, suit: CARD_SUITS[suitIndex], label: `${rank}${CARD_SUITS[suitIndex]}`, color: suitIndex === 1 || suitIndex === 2 ? 'red' : 'black', hidden: false };
}
const compareValues = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1; } return 0; };
function rankFive(cards) {
  const ranks = cards.map(card => card % 13 + 2).sort((a, b) => b - a), groups = [];
  for (const rank of new Set(ranks)) groups.push({ rank, count: ranks.filter(value => value === rank).length });
  groups.sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every(card => Math.floor(card / 13) === Math.floor(cards[0] / 13));
  const unique = [...new Set(ranks)], straightHigh = unique.length === 5 ? (unique[0] - unique[4] === 4 ? unique[0] : unique.join(',') === '14,5,4,3,2' ? 5 : 0) : 0;
  let values;
  if (flush && straightHigh) values = [8, straightHigh];
  else if (groups[0].count === 4) values = [7, groups[0].rank, groups[1].rank];
  else if (groups[0].count === 3 && groups[1].count === 2) values = [6, groups[0].rank, groups[1].rank];
  else if (flush) values = [5, ...ranks];
  else if (straightHigh) values = [4, straightHigh];
  else if (groups[0].count === 3) values = [3, groups[0].rank, ...groups.slice(1).map(group => group.rank)];
  else if (groups[0].count === 2 && groups[1].count === 2) values = [2, ...groups.slice(0, 2).map(group => group.rank).sort((a, b) => b - a), groups[2].rank];
  else if (groups[0].count === 2) values = [1, groups[0].rank, ...groups.slice(1).map(group => group.rank)];
  else values = [0, ...ranks];
  return { category: values[0], name: values[0] === 8 && values[1] === 14 ? 'Royal flush' : POKER_HAND_NAMES[values[0]], values, cards: [...cards] };
}
export function evaluatePokerHand(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7 || new Set(cards).size !== cards.length || cards.some(card => !Number.isInteger(card) || card < 0 || card > 51)) return null;
  let best = null;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++) for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) {
    const hand = rankFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || compareValues(hand.values, best.values) > 0) best = hand;
  }
  return best;
}
export function comparePokerHands(a, b) {
  const left = Array.isArray(a) ? evaluatePokerHand(a) : a, right = Array.isArray(b) ? evaluatePokerHand(b) : b;
  if (!left || !right) return null;
  return compareValues(left.values, right.values);
}
export function blackjackTotal(cards) {
  let total = 0, aces = 0;
  for (const card of cards) { const rank = card % 13 + 2; total += rank === 14 ? 11 : Math.min(10, rank); if (rank === 14) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0, blackjack: cards.length === 2 && total === 21 };
}

const note = (session, text) => { session.log.push(text); session.log = session.log.slice(-16); };
const pay = (poker, seat, amount) => { const paid = Math.min(poker.stacks[seat], amount); poker.stacks[seat] -= paid; poker.bets[seat] += paid; poker.committed[seat] += paid; poker.pot += paid; return paid; };
export function createPoker(session) {
  const deck = shuffledDeck(session), bigBlind = Math.max(2, Math.floor(session.stake / 10)), smallBlind = Math.max(1, Math.floor(bigBlind / 2));
  session.poker = { deck, hands: [[deck.pop(), deck.pop()], [deck.pop(), deck.pop()]], board: [], street: 'preflop', pot: 0, stacks: [session.stake, session.stake], bets: [0, 0], committed: [0, 0], currentBet: bigBlind, minRaiseIncrement: bigBlind, bigBlind, acted: [false, false], raises: 0, showdown: false };
  pay(session.poker, 0, smallBlind); pay(session.poker, 1, bigBlind); session.turn = 0;
  note(session, `Blinds ${smallBlind}/${bigBlind} cr. Each player has a ${session.stake} cr hand budget.`);
}
function finishPoker(session, winner, reason, showdown = false) {
  const p = session.poker; p.showdown = showdown; session.status = 'complete'; session.turn = null;
  session.payout = [p.stacks[0], p.stacks[1]];
  if (winner === null) { session.payout[0] += Math.ceil(p.pot / 2); session.payout[1] += Math.floor(p.pot / 2); }
  else session.payout[winner] += p.pot;
  session.result = { winner, outcome: winner === null ? 'push' : winner === 0 ? 'win' : 'loss', reason, returned: session.payout[0], net: session.payout[0] - session.escrow };
  note(session, reason);
}
function showdownPoker(session) {
  const p = session.poker;
  while (p.board.length < 5) { if (p.board.length === 0) { p.deck.pop(); p.board.push(p.deck.pop(), p.deck.pop(), p.deck.pop()); } else { p.deck.pop(); p.board.push(p.deck.pop()); } }
  const hands = p.hands.map(cards => evaluatePokerHand([...cards, ...p.board])), comparison = comparePokerHands(hands[0], hands[1]);
  p.handNames = hands.map(hand => hand.name); p.street = 'showdown';
  const winner = comparison === 0 ? null : comparison > 0 ? 0 : 1;
  finishPoker(session, winner, winner === null ? `Split pot: both play ${hands[0].name.toLowerCase()}.` : `${session.names[winner]} wins with ${hands[winner].name.toLowerCase()}.`, true);
}
function nextPokerStreet(session) {
  const p = session.poker;
  if (p.street === 'river' || p.stacks.some(stack => stack === 0)) { showdownPoker(session); return; }
  p.deck.pop();
  if (p.street === 'preflop') { p.street = 'flop'; p.board.push(p.deck.pop(), p.deck.pop(), p.deck.pop()); }
  else { p.street = p.street === 'flop' ? 'turn' : 'river'; p.board.push(p.deck.pop()); }
  p.bets = [0, 0]; p.currentBet = 0; p.minRaiseIncrement = p.bigBlind; p.acted = [false, false]; p.raises = 0; session.turn = 1;
  note(session, `${p.street[0].toUpperCase()}${p.street.slice(1)}.`);
}
export function pokerLegal(session, seat = 0) {
  const p = session.poker, owed = Math.max(0, p.currentBet - p.bets[seat]), maxRaise = Math.min(p.bets[seat] + p.stacks[seat], p.bets[1 - seat] + p.stacks[1 - seat]);
  const minRaise = Math.min(maxRaise, p.currentBet + p.minRaiseIncrement);
  const legalActions = session.status === 'playing' && session.turn === seat ? ['fold', owed ? 'call' : 'check', ...(maxRaise > p.currentBet ? ['raise'] : [])] : [];
  return { legalActions, callAmount: Math.min(p.stacks[seat], owed), minRaise, maxRaise };
}
export function actPoker(session, action, seat) {
  const p = session.poker, legal = pokerLegal(session, seat), type = action.type;
  if (!legal.legalActions.includes(type)) return { ok: false, reason: 'That poker action is not available.' };
  if (type === 'raise' && (!Number.isSafeInteger(action.amount) || action.amount < legal.minRaise || action.amount > legal.maxRaise || action.amount <= p.currentBet)) return { ok: false, reason: `Raise to a total of ${legal.minRaise}–${legal.maxRaise} cr.` };
  if (type === 'fold') { finishPoker(session, 1 - seat, `${session.names[seat]} folds. ${session.names[1 - seat]} takes the pot.`); return { ok: true }; }
  if (type === 'raise') {
    const increase = action.amount - p.currentBet;
    pay(p, seat, action.amount - p.bets[seat]);
    p.currentBet = action.amount; p.minRaiseIncrement = Math.max(p.minRaiseIncrement, increase); p.acted = [false, false]; p.raises++;
    note(session, `${session.names[seat]} ${p.currentBet === action.amount && action.amount === increase ? 'bets' : 'raises to'} ${action.amount} cr.`);
  } else if (type === 'call') { const amount = pay(p, seat, legal.callAmount); note(session, `${session.names[seat]} calls ${amount} cr.`); }
  else note(session, `${session.names[seat]} checks.`);
  p.acted[seat] = true;
  if (p.acted.every(Boolean) && p.bets[0] === p.bets[1]) nextPokerStreet(session);
  else session.turn = 1 - seat;
  return { ok: true };
}
function pokerStrength(p, seat) {
  const ranks = p.hands[seat].map(card => card % 13 + 2).sort((a, b) => b - a), suited = Math.floor(p.hands[seat][0] / 13) === Math.floor(p.hands[seat][1] / 13);
  if (!p.board.length) return Math.min(.95, .12 + (ranks[0] + ranks[1] - 4) / 40 + (ranks[0] === ranks[1] ? .25 : 0) + (suited ? .055 : 0) + (ranks[0] - ranks[1] === 1 ? .04 : 0));
  const hand = evaluatePokerHand([...p.hands[seat], ...p.board]);
  return Math.min(.98, .18 + hand.category * .12 + hand.values[1] / 120);
}
export function npcPokerAction(session) {
  const p = session.poker, seat = 1, legal = pokerLegal(session, seat), strength = pokerStrength(p, seat), roll = gamblingRandom(session);
  // This decision sees only the NPC's own cards and the public board.
  const potOdds = legal.callAmount / Math.max(1, p.pot + legal.callAmount), pressure = legal.callAmount / Math.max(1, p.stacks[seat]);
  if (legal.callAmount && roll > strength + .28 - potOdds * .34 - pressure * .13 && p.street !== 'preflop') return { type: 'fold' };
  if (legal.callAmount && strength < .4 && pressure > .5 && roll > .22) return { type: 'fold' };
  if (legal.legalActions.includes('raise') && p.raises < 3 && (strength > .7 && roll < .66 || strength > .48 && roll < .18 || !legal.callAmount && roll < .07)) {
    const amount = Math.min(legal.maxRaise, Math.max(legal.minRaise, p.currentBet + Math.max(p.bigBlind, Math.round(p.pot * (.3 + strength * .25)))));
    return { type: 'raise', amount };
  }
  return { type: legal.callAmount ? 'call' : 'check' };
}
