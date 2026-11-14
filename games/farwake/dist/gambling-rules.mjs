/**
 * Farwake house games. No DOM, network, wallet or clock dependencies.
 *
 * createGamblingSession({gameId,stake,seed,...}) -> {ok,session,escrow}.
 * Reserve escrow ONCE in the caller. gamblingAction mutates an accepted action
 * and completes any NPC turns. At status:'complete', return payout[seat] ONCE.
 * Poker and pool escrow is the stake; blackjack reserves twice the bet to make
 * doubling possible without another wallet transaction. Unused reserve returns.
 * Public projections never contain the deck, PRNG state or hidden hole cards.
 */
import { cardInfo, blackjackTotal, shuffledDeck, gamblingHash, createPoker, actPoker, pokerLegal, npcPokerAction, evaluatePokerHand, comparePokerHands } from './poker.mjs';
import { POOL_TABLE, createPool, actPool, forfeitPool, npcPoolAction, poolLegal, poolRemaining } from './pool.mjs';
export { cardInfo, blackjackTotal, evaluatePokerHand } from './poker.mjs';
export { POOL_TABLE } from './pool.mjs';

export const GAMBLING_STAKES = Object.freeze([10, 20, 50, 100]);
export const GAMBLING_GAMES = Object.freeze([
  Object.freeze({ id: 'poker', name: "Texas Hold’em", shortName: 'Poker', opponentName: 'Mara Venn', escrowMultiplier: 1,
    description: 'A heads-up hand against a cardroom regular. Read the board, price a call, or make them fold.',
    rules: 'Two hole cards, five community cards, best five-card hand. The stake is your maximum hand budget. Unspent chips return, ties split the pot, and there is no rake. Raise amounts are the total bet for this street.' }),
  Object.freeze({ id: 'pool', name: 'Eight-ball', shortName: 'Pool', opponentName: 'Dax Mercer', escrowMultiplier: 1,
    description: 'A proper table: aim, power, cushions, collisions and six pockets. A local hustler has the next cue.',
    rules: 'Pocket solids or stripes, then the 8. The table stays open after the break; your first legal pot assigns groups. Hit your own group first and send a ball to a cushion or pocket. Fouls give ball in hand anywhere. The 8 on the break is respotted. An early 8 or a scratch with the 8 loses. No called pockets.' }),
  Object.freeze({ id: 'blackjack', name: 'Blackjack', shortName: 'Blackjack', opponentName: 'House dealer', escrowMultiplier: 2,
    description: 'Hit, stand, or double against the dealer. A quick hand between flights.',
    rules: 'Dealer stands on all 17s. A natural pays 3:2; other wins pay 1:1; ties push. Double only on your first two cards. Twice the bet is reserved at the start; unused reserve returns. No splitting or insurance.' })
]);
const fail = reason => ({ ok: false, reason });
const clone = value => JSON.parse(JSON.stringify(value));
const cleanName = (value, fallback) => String(value || fallback).replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) || fallback;
const note = (session, message) => { session.log.push(message); session.log = session.log.slice(-16); };
export function gamblingEscrow(gameId, stake) {
  const game = GAMBLING_GAMES.find(game => game.id === gameId);
  return game && GAMBLING_STAKES.includes(stake) ? stake * game.escrowMultiplier : null;
}
function finishBlackjack(session) {
  const b = session.blackjack, player = blackjackTotal(b.cards);
  let dealer = blackjackTotal(b.dealerCards), outcome, returned, reason;
  if (player.blackjack || dealer.blackjack) {
    outcome = player.blackjack && dealer.blackjack ? 'push' : player.blackjack ? 'win' : 'loss';
    returned = outcome === 'push' ? b.bet : outcome === 'win' ? b.bet * 2.5 : 0;
    reason = outcome === 'push' ? 'Two naturals. The hand is a push.' : player.blackjack ? 'Blackjack! The natural pays 3:2.' : 'Dealer blackjack.';
  } else {
    if (player.total <= 21) while (dealer.total < 17 && b.deck.length) { b.dealerCards.push(b.deck.pop()); dealer = blackjackTotal(b.dealerCards); }
    outcome = player.total > 21 ? 'loss' : dealer.total > 21 || player.total > dealer.total ? 'win' : player.total === dealer.total ? 'push' : 'loss';
    returned = outcome === 'win' ? b.bet * 2 : outcome === 'push' ? b.bet : 0;
    reason = player.total > 21 ? `Bust on ${player.total}.` : dealer.total > 21 ? `Dealer busts on ${dealer.total}. You win.` : outcome === 'push' ? `Both have ${player.total}. Push.` : outcome === 'win' ? `${player.total} beats the dealer's ${dealer.total}.` : `Dealer's ${dealer.total} beats ${player.total}.`;
  }
  session.status = 'complete'; session.turn = null; session.payout = [session.escrow - b.bet + returned, 0];
  session.result = { winner: outcome === 'push' ? null : outcome === 'win' ? 0 : 1, outcome, reason, returned: session.payout[0], net: session.payout[0] - session.escrow };
  note(session, reason);
}
function createBlackjack(session) {
  const deck = shuffledDeck(session);
  session.blackjack = { deck, cards: [deck.pop(), deck.pop()], dealerCards: [deck.pop(), deck.pop()], bet: session.stake, doubled: false };
  note(session, `${session.stake} cr bet; ${session.escrow} cr reserved, including the option to double.`);
  if (blackjackTotal(session.blackjack.cards).blackjack || blackjackTotal(session.blackjack.dealerCards).blackjack) finishBlackjack(session);
}
function blackjackLegal(session) {
  return session.status === 'playing' ? ['hit', 'stand', ...(session.blackjack.cards.length === 2 && !session.blackjack.doubled ? ['double'] : [])] : [];
}
function actBlackjack(session, action) {
  const b = session.blackjack;
  if (!blackjackLegal(session).includes(action.type)) return fail('That blackjack action is not available.');
  if (action.type === 'stand') { note(session, `${session.names[0]} stands.`); finishBlackjack(session); }
  else {
    if (action.type === 'double') { b.bet *= 2; b.doubled = true; note(session, `${session.names[0]} doubles to ${b.bet} cr.`); }
    b.cards.push(b.deck.pop());
    if (action.type !== 'double') note(session, `${session.names[0]} takes a card.`);
    if (action.type === 'double' || blackjackTotal(b.cards).total >= 21) finishBlackjack(session);
  }
  return { ok: true };
}

export function createGamblingSession(options = {}) {
  const game = GAMBLING_GAMES.find(game => game.id === options.gameId), stake = options.stake ?? 10;
  if (!game) return fail('Choose poker, pool, or blackjack.');
  if (!GAMBLING_STAKES.includes(stake)) return fail(`Choose a stake of ${GAMBLING_STAKES.join(', ')} credits.`);
  if (options.humanOpponent && game.id === 'blackjack') return fail('Blackjack is played against the house dealer.');
  const seed = options.seed ?? 'farwake-table';
  const session = { version: 1, id: String(options.id || `table-${gamblingHash(`${seed}:${game.id}:${stake}`).toString(36)}`).replace(/[^\w:-]/g, '').slice(0, 100), gameId: game.id, stake, escrow: gamblingEscrow(game.id, stake), status: 'playing', turn: 0, revision: 1, rng: gamblingHash(seed), names: [cleanName(options.playerName, 'You'), cleanName(options.opponentName, game.opponentName)], humanOpponent: !!options.humanOpponent, payout: [0, 0], result: null, log: [] };
  if (game.id === 'poker') createPoker(session);
  else if (game.id === 'pool') createPool(session);
  else createBlackjack(session);
  return { ok: true, session, escrow: session.escrow };
}

const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, lo, hi) => Number.isSafeInteger(value) && value >= lo && value <= hi;
const boundedText = (value, maximum, empty = false) => typeof value === 'string' && (empty || value.length > 0) && value.length <= maximum && !/[<>\u0000-\u001f\u007f]/.test(value);
const pair = (value, predicate) => Array.isArray(value) && value.length === 2 && value.every(predicate);
const validCards = (value, lo, hi) => Array.isArray(value) && integer(value.length, lo, hi) && value.every(card => integer(card, 0, 51));
function distinctCards(...parts) { const all = parts.flat(); return new Set(all).size === all.length; }
function validPoolBalls(balls) {
  return Array.isArray(balls) && balls.length === 16 && new Set(balls.map(ball => ball?.id)).size === 16 && balls.every(ball => record(ball) && integer(ball.id, 0, 15) && typeof ball.pocketed === 'boolean' && typeof ball.x === 'number' && Number.isFinite(ball.x) && ball.x >= -64 && ball.x <= POOL_TABLE.width + 64 && typeof ball.y === 'number' && Number.isFinite(ball.y) && ball.y >= -64 && ball.y <= POOL_TABLE.height + 64);
}
function validPoolReplay(shot, shotNumber) {
  if (!record(shot) || !integer(shot.actor, 0, 1) || !integer(shot.number, 1, shotNumber) || !Array.isArray(shot.pocketed) || shot.pocketed.length > 16 || !shot.pocketed.every(id => integer(id, 0, 15)) || new Set(shot.pocketed).size !== shot.pocketed.length || shot.firstContact !== null && !integer(shot.firstContact, 1, 15) || shot.foul !== null && !boundedText(shot.foul, 200) || !boundedText(shot.message, 300) || typeof shot.duration !== 'number' || !Number.isFinite(shot.duration) || shot.duration < 0 || shot.duration > 10) return false;
  // Replay is deliberately discarded after the command response. It is never
  // needed to resume a game, and absence of frames must remain a valid save.
  if (shot.frames === undefined) return true;
  if (!Array.isArray(shot.frames) || !integer(shot.frames.length, 2, 50)) return false;
  let previous = -1;
  for (const frame of shot.frames) {
    if (!record(frame) || typeof frame.t !== 'number' || !Number.isFinite(frame.t) || frame.t < previous || frame.t < 0 || frame.t > 10 || !validPoolBalls(frame.balls)) return false;
    previous = frame.t;
  }
  return true;
}
function validPokerRestore(s) {
  const p = s.poker, boardLengths = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };
  if (!record(p) || !Object.hasOwn(boardLengths, p.street) || !validCards(p.board, boardLengths[p.street], boardLengths[p.street]) || !pair(p.hands, hand => validCards(hand, 2, 2))) return false;
  const burns = p.board.length === 0 ? 0 : p.board.length - 2, deckLength = 48 - p.board.length - burns;
  if (!validCards(p.deck, deckLength, deckLength) || !distinctCards(p.deck, p.board, p.hands[0], p.hands[1])) return false;
  if (!pair(p.stacks, value => integer(value, 0, s.stake)) || !pair(p.bets, value => integer(value, 0, s.stake)) || !pair(p.committed, value => integer(value, 0, s.stake)) || p.stacks.some((value, index) => value + p.committed[index] !== s.stake || p.bets[index] > p.committed[index])) return false;
  if (!integer(p.pot, 0, s.stake * 2) || p.pot !== p.committed[0] + p.committed[1] || !integer(p.currentBet, 0, s.stake) || p.currentBet !== Math.max(...p.bets) || !integer(p.minRaiseIncrement, 1, s.stake) || p.bigBlind !== Math.max(2, Math.floor(s.stake / 10)) || !pair(p.acted, value => typeof value === 'boolean') || !integer(p.raises, 0, 64) || typeof p.showdown !== 'boolean') return false;
  if (s.status === 'playing') return !p.showdown && p.street !== 'showdown' && p.stacks[s.turn] > 0;
  if (p.showdown) {
    if (p.street !== 'showdown') return false;
    const hands = p.hands.map(hand => evaluatePokerHand([...hand, ...p.board])), comparison = comparePokerHands(...hands), winner = comparison === 0 ? null : comparison > 0 ? 0 : 1;
    if (!pair(p.handNames, value => typeof value === 'string') || p.handNames.some((name, index) => name !== hands[index].name) || s.result.winner !== winner) return false;
  } else if (p.street === 'showdown' || s.result.winner === null) return false;
  const payout = [...p.stacks];
  if (s.result.winner === null) { payout[0] += Math.ceil(p.pot / 2); payout[1] += Math.floor(p.pot / 2); }
  else payout[s.result.winner] += p.pot;
  return payout.every((value, index) => value === s.payout[index]);
}
function validBlackjackRestore(s) {
  const b = s.blackjack;
  if (!record(b) || !validCards(b.cards, 2, 12) || !validCards(b.dealerCards, 2, 12) || !validCards(b.deck, 52 - b.cards.length - b.dealerCards.length, 52 - b.cards.length - b.dealerCards.length) || !distinctCards(b.cards, b.dealerCards, b.deck) || ![s.stake, s.stake * 2].includes(b.bet) || typeof b.doubled !== 'boolean' || b.doubled !== (b.bet === s.stake * 2) || b.doubled && b.cards.length !== 3) return false;
  const player = blackjackTotal(b.cards), dealer = blackjackTotal(b.dealerCards);
  if (s.status === 'playing') return !b.doubled && player.total < 21 && !dealer.blackjack && b.dealerCards.length === 2 && s.turn === 0;
  let outcome, returned;
  if (player.blackjack || dealer.blackjack) {
    if (b.cards.length !== 2 || b.dealerCards.length !== 2 || b.doubled) return false;
    outcome = player.blackjack && dealer.blackjack ? 'push' : player.blackjack ? 'win' : 'loss';
    returned = outcome === 'push' ? b.bet : outcome === 'win' ? b.bet * 2.5 : 0;
  } else {
    if (player.total > 21 ? b.dealerCards.length !== 2 : dealer.total < 17) return false;
    outcome = player.total > 21 ? 'loss' : dealer.total > 21 || player.total > dealer.total ? 'win' : player.total === dealer.total ? 'push' : 'loss';
    returned = outcome === 'win' ? b.bet * 2 : outcome === 'push' ? b.bet : 0;
  }
  return s.result.outcome === outcome && s.payout[0] === s.escrow - b.bet + returned && s.payout[1] === 0;
}
function validPoolRestore(s) {
  const p = s.pool;
  if (!record(p) || !validPoolBalls(p.balls) || !pair(p.groups, value => value === null || value === 'solids' || value === 'stripes') || (p.groups[0] === null ? p.groups[1] !== null : p.groups[1] === null || p.groups[1] === p.groups[0]) || typeof p.ballInHand !== 'boolean' || !integer(p.shotNumber, 0, 1000000) || typeof p.isBreak !== 'boolean' || p.isBreak !== (p.shotNumber === 0)) return false;
  if (!Array.isArray(p.recentShots) || p.recentShots.length > 16 || !p.recentShots.every(shot => validPoolReplay(shot, p.shotNumber)) || p.recentShots.some((shot, index) => index > 0 && shot.number !== p.recentShots[index - 1].number + 1)) return false;
  if (p.shotNumber === 0 ? p.lastShot !== null || p.recentShots.length !== 0 : !validPoolReplay(p.lastShot, p.shotNumber) || p.lastShot.number !== p.shotNumber) return false;
  if (p.recentShots.length && p.recentShots.at(-1).number !== p.shotNumber) return false;
  if (s.status === 'playing') return !p.balls.find(ball => ball.id === 0).pocketed && !p.balls.find(ball => ball.id === 8).pocketed;
  return s.result.winner !== null && s.payout[s.result.winner] === s.stake * 2 && s.payout[1 - s.result.winner] === 0;
}

/** Check imported private state before restoration; no mutation or settlement. */
export function validateGamblingSession(raw) {
  try {
    if (!record(raw) || raw.version !== 1 || !boundedText(raw.id, 100) || !/^[\w:-]+$/.test(raw.id) || !GAMBLING_GAMES.some(game => game.id === raw.gameId) || !GAMBLING_STAKES.includes(raw.stake) || raw.escrow !== gamblingEscrow(raw.gameId, raw.stake) || !['playing', 'complete'].includes(raw.status) || !integer(raw.revision, 1, 1000000) || !integer(raw.rng, 0, 0xffffffff) || !pair(raw.names, name => boundedText(name, 40)) || typeof raw.humanOpponent !== 'boolean' || raw.gameId === 'blackjack' && raw.humanOpponent || !Array.isArray(raw.log) || raw.log.length > 16 || !raw.log.every(line => boundedText(line, 300))) return false;
    if (!pair(raw.payout, value => integer(value, 0, raw.escrow * 3))) return false;
    if (raw.status === 'playing') {
      if (!integer(raw.turn, 0, 1) || raw.result !== null || raw.payout.some(value => value !== 0)) return false;
    } else {
      const result = raw.result;
      if (raw.turn !== null || !record(result) || ![null, 0, 1].includes(result.winner) || result.outcome !== (result.winner === null ? 'push' : result.winner === 0 ? 'win' : 'loss') || !boundedText(result.reason, 300) || result.returned !== raw.payout[0] || result.net !== raw.payout[0] - raw.escrow) return false;
    }
    return raw.gameId === 'poker' ? validPokerRestore(raw) : raw.gameId === 'pool' ? validPoolRestore(raw) : validBlackjackRestore(raw);
  } catch { return false; }
}

export function gamblingAction(session, action = {}, seat = 0) {
  if (!session || session.version !== 1 || !GAMBLING_GAMES.some(game => game.id === session.gameId)) return fail('This table is no longer available.');
  if (session.status !== 'playing') return fail('This game has already finished.');
  if (!Number.isInteger(seat) || seat < 0 || seat > 1 || !session.humanOpponent && seat !== 0 || session.gameId === 'blackjack' && seat !== 0) return fail('That seat is not controlled by this captain.');
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail('Choose a table action.');
  const leaving = action.type === 'leave' || action.type === 'forfeit';
  if (!leaving && session.turn !== seat) return fail('Wait for your turn.');
  let result;
  if (session.gameId === 'poker') {
    if (leaving) { session.turn = seat; result = actPoker(session, { type: 'fold' }, seat); }
    else result = actPoker(session, action, seat);
  } else if (session.gameId === 'blackjack') result = actBlackjack(session, leaving ? { type: 'stand' } : action);
  else {
    const replay = session.pool.recentShots; session.pool.recentShots = [];
    result = leaving ? forfeitPool(session, seat) : actPool(session, action, seat);
    if (!result.ok) session.pool.recentShots = replay;
  }
  if (!result.ok) return result;
  if (!session.humanOpponent) {
    for (let n = 0; n < 64 && session.status === 'playing' && session.turn === 1; n++) {
      const response = session.gameId === 'poker' ? actPoker(session, npcPokerAction(session), 1) : actPool(session, npcPoolAction(session), 1);
      if (!response.ok) throw new Error(`Invalid house action: ${response.reason}`);
    }
  }
  session.revision++;
  return { ok: true, session };
}
function publicShot(shot, seat, includeReplay) {
  if (!shot) return null;
  return { actor: shot.actor === seat ? 0 : 1, number: shot.number, pocketed: [...shot.pocketed], firstContact: shot.firstContact, foul: shot.foul, message: shot.message, duration: shot.duration,
    ...(includeReplay && Array.isArray(shot.frames) ? { frames: shot.frames.map(frame => ({ t: frame.t, balls: frame.balls.map(ball => ({ id: ball.id, x: ball.x, y: ball.y, pocketed: !!ball.pocketed })) })) } : {}) };
}
export function publicGamblingSession(session, seat = 0, options = {}) {
  if (!session || !GAMBLING_GAMES.some(game => game.id === session.gameId) || ![0, 1].includes(seat)) return null;
  const order = [seat, 1 - seat], ownPayout = session.payout?.[seat] ?? 0;
  const result = session.result ? { ...session.result, winner: session.result.winner === null ? null : session.result.winner === seat ? 0 : 1, outcome: session.result.winner === null ? 'push' : session.result.winner === seat ? 'win' : 'loss', returned: ownPayout, net: ownPayout - session.escrow } : null;
  const view = { version: session.version, id: session.id, gameId: session.gameId, stake: session.stake, escrow: session.escrow, status: session.status, turn: session.turn === null ? null : session.turn === seat ? 0 : 1, revision: session.revision, playerName: session.names[seat], opponentName: session.names[1 - seat], humanOpponent: !!session.humanOpponent, payout: order.map(i => session.payout?.[i] ?? 0), result, log: [...session.log] };
  if (session.gameId === 'poker') {
    const p = session.poker, own = [...p.hands[seat]], hand = p.board.length >= 3 ? evaluatePokerHand([...own, ...p.board]) : null;
    Object.assign(view, { ...pokerLegal(session, seat), cards: own, opponentCards: p.showdown ? [...p.hands[1 - seat]] : [null, null], board: [...p.board], street: p.street, pot: p.pot, stacks: order.map(i => p.stacks[i]), bets: order.map(i => p.bets[i]), currentBet: p.currentBet, bigBlind: p.bigBlind, handName: hand?.name || (own[0] % 13 === own[1] % 13 ? 'Pocket pair' : 'Two hole cards'), opponentHandName: p.showdown ? p.handNames?.[1 - seat] : null });
  } else if (session.gameId === 'pool') {
    const p = session.pool, counts = poolRemaining(p);
    Object.assign(view, { legalActions: poolLegal(session, seat), balls: p.balls.map(ball => ({ id: ball.id, x: ball.x, y: ball.y, pocketed: !!ball.pocketed })), table: clone(POOL_TABLE), groups: order.map(i => p.groups[i]), remaining: { solids: counts[0], stripes: counts[1] }, ballInHand: p.ballInHand && session.turn === seat, shotNumber: p.shotNumber, isBreak: p.isBreak,
      lastShot: publicShot(p.lastShot, seat, options.includeReplay !== false), recentShots: p.recentShots.map(shot => publicShot(shot, seat, options.includeReplay !== false)) });
  } else {
    const b = session.blackjack, visibleDealer = session.status === 'complete' ? b.dealerCards : b.dealerCards.slice(0, 1), player = blackjackTotal(b.cards), dealer = blackjackTotal(visibleDealer);
    Object.assign(view, { legalActions: blackjackLegal(session), cards: [...b.cards], dealerCards: session.status === 'complete' ? [...b.dealerCards] : [b.dealerCards[0], null], total: player.total, soft: player.soft, dealerTotal: dealer.total, dealerSoft: dealer.soft, bet: b.bet, canDouble: blackjackLegal(session).includes('double') });
  }
  return view;
}
