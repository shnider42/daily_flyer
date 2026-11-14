import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMBLING_STAKES, createGamblingSession, gamblingAction, publicGamblingSession, gamblingEscrow, blackjackTotal, cardInfo, validateGamblingSession } from '../dist/gambling-rules.mjs';
import { evaluatePokerHand, comparePokerHands } from '../dist/poker.mjs';
import { simulatePoolShot, POOL_TABLE } from '../dist/pool.mjs';

const card = (rank, suit = 0) => suit * 13 + rank - 2;
const cards = values => values.map(([rank, suit]) => card(rank, suit));
const create = (gameId, options = {}) => createGamblingSession({ gameId, stake: 10, seed: 'gambling-rules', ...options }).session;
function poolFixture(active, groups = [null, null]) {
  const session = create('pool', { humanOpponent: true });
  for (const ball of session.pool.balls) ball.pocketed = true;
  for (const item of active) Object.assign(session.pool.balls.find(ball => ball.id === item.id), item, { pocketed: false });
  session.pool.isBreak = false; session.pool.groups = [...groups];
  return session;
}

test('stakes and up-front reserves are explicit and reject coercion, overflow and unknown games', () => {
  assert.deepEqual(GAMBLING_STAKES, [10, 20, 50, 100]);
  for (const stake of GAMBLING_STAKES) {
    assert.equal(gamblingEscrow('poker', stake), stake);
    assert.equal(gamblingEscrow('pool', stake), stake);
    assert.equal(gamblingEscrow('blackjack', stake), stake * 2);
  }
  for (const stake of [NaN, Infinity, -10, 0, 25, 1e20, '10']) assert.equal(createGamblingSession({ gameId: 'poker', stake }).ok, false);
  assert.equal(createGamblingSession({ gameId: 'unknown', stake: 10 }).ok, false);
  assert.equal(createGamblingSession({ gameId: 'blackjack', stake: 10, humanOpponent: true }).ok, false);
});

test('all 52 card faces have stable labels; hidden and invalid cards are not rendered as aces', () => {
  assert.equal(new Set(Array.from({ length: 52 }, (_, i) => cardInfo(i).label)).size, 52);
  assert.equal(cardInfo(card(14, 3)).label, 'A♠');
  assert.equal(cardInfo(card(12, 2)).color, 'red');
  for (const invalid of [null, undefined, -1, 52, NaN]) assert.equal(cardInfo(invalid).hidden, true);
});

test('seven-card evaluation chooses the best five across every poker hand category', () => {
  const examples = [
    { category: 8, cards: [[14, 3], [13, 3], [12, 3], [11, 3], [10, 3], [2, 0], [2, 1]] },
    { category: 7, cards: [[12, 0], [12, 1], [12, 2], [12, 3], [14, 0], [2, 0], [3, 0]] },
    { category: 6, cards: [[12, 0], [12, 1], [12, 2], [11, 0], [11, 1], [11, 2], [3, 0]] },
    { category: 5, cards: [[14, 1], [12, 1], [9, 1], [7, 1], [3, 1], [2, 0], [2, 2]] },
    { category: 4, cards: [[14, 0], [5, 1], [4, 2], [3, 3], [2, 0], [8, 0], [10, 1]] },
    { category: 3, cards: [[7, 0], [7, 1], [7, 2], [14, 3], [12, 0], [9, 0], [3, 1]] },
    { category: 2, cards: [[7, 0], [7, 1], [12, 2], [12, 3], [14, 0], [3, 0], [2, 1]] },
    { category: 1, cards: [[7, 0], [7, 1], [12, 2], [11, 3], [14, 0], [3, 0], [2, 1]] },
    { category: 0, cards: [[7, 0], [8, 1], [12, 2], [10, 3], [14, 0], [3, 0], [2, 1]] },
  ];
  for (const example of examples) assert.equal(evaluatePokerHand(cards(example.cards)).category, example.category);
  assert.deepEqual(evaluatePokerHand(cards(examples[2].cards)).values, [6, 12, 11]);
  assert.deepEqual(evaluatePokerHand(cards(examples[4].cards)).values, [4, 5]);
});

test('poker tie-breaks include every kicker and the wheel loses to a six-high straight', () => {
  assert.equal(comparePokerHands(cards([[14, 0], [5, 1], [4, 2], [3, 3], [2, 0]]), cards([[6, 0], [5, 1], [4, 2], [3, 3], [2, 0]])), -1);
  assert.equal(comparePokerHands(cards([[7, 0], [7, 1], [14, 2], [12, 3], [9, 0]]), cards([[7, 2], [7, 3], [14, 0], [12, 1], [8, 0]])), 1);
  assert.equal(comparePokerHands(cards([[11, 0], [11, 1], [9, 0], [9, 1], [14, 0]]), cards([[11, 2], [11, 3], [8, 0], [8, 1], [14, 1]])), 1);
  assert.equal(evaluatePokerHand([0, 0, 1, 2, 3]), null);
  assert.equal(evaluatePokerHand([0, 1, 2, 3]), null);
});

test('folding loses only committed poker chips and returns the unspent hand budget', () => {
  const session = create('poker');
  assert.equal(gamblingAction(session, { type: 'fold' }).ok, true);
  assert.equal(session.status, 'complete');
  assert.deepEqual(session.payout, [9, 11]);
  assert.equal(session.result.net, -1);
  const finished = JSON.stringify(session);
  assert.equal(gamblingAction(session, { type: 'call' }).ok, false);
  assert.equal(JSON.stringify(session), finished);
});

test('poker betting rejects premature checks and invalid raises without changing state', () => {
  const session = create('poker', { humanOpponent: true });
  for (const action of [{ type: 'check' }, ...[0, 1, 2, 3, 11, Infinity, NaN, '4'].map(amount => ({ type: 'raise', amount }))]) {
    const before = JSON.stringify(session);
    assert.equal(gamblingAction(session, action).ok, false);
    assert.equal(JSON.stringify(session), before);
  }
  assert.equal(gamblingAction(session, { type: 'raise', amount: 4 }).ok, true);
  assert.equal(session.poker.currentBet, 4);
  assert.equal(publicGamblingSession(session, 1).minRaise, 6);
  assert.equal(gamblingAction(session, { type: 'call' }, 1).ok, true);
  assert.equal(session.poker.street, 'flop');
  assert.equal(session.turn, 1);
});

test('two calls/checks advance streets and all-in calls run out the board exactly once', () => {
  const session = create('poker', { humanOpponent: true });
  assert.equal(gamblingAction(session, { type: 'raise', amount: 10 }).ok, true);
  assert.equal(gamblingAction(session, { type: 'call' }, 1).ok, true);
  assert.equal(session.status, 'complete');
  assert.equal(session.poker.board.length, 5);
  assert.equal(new Set([...session.poker.hands.flat(), ...session.poker.board]).size, 9);
  assert.equal(session.payout.reduce((a, b) => a + b, 0), 20);
  assert.equal(publicGamblingSession(session).opponentCards.every(Number.isInteger), true);
});

test('a board-playing tie divides the pot and returns both unspent stacks', () => {
  const session = create('poker', { humanOpponent: true });
  Object.assign(session.poker, { board: cards([[14, 3], [13, 3], [12, 3], [11, 3], [10, 3]]), hands: [cards([[2, 0], [3, 0]]), cards([[4, 0], [5, 0]])], street: 'river', stacks: [9, 9], bets: [0, 0], currentBet: 0, committed: [1, 1], pot: 2, acted: [false, false] });
  assert.equal(gamblingAction(session, { type: 'check' }).ok, true);
  assert.equal(gamblingAction(session, { type: 'check' }, 1).ok, true);
  assert.deepEqual(session.payout, [10, 10]);
  assert.equal(session.result.outcome, 'push');
});

test('NPC poker hands terminate, conserve chips and do not disclose hidden information', () => {
  for (let index = 0; index < 80; index++) {
    const session = create('poker', { seed: `simulation-${index}`, stake: GAMBLING_STAKES[index % 4] });
    for (let step = 0; step < 40 && session.status === 'playing'; step++) {
      assert.equal(validateGamblingSession(session), true, 'every reachable private betting state can be restored');
      const view = publicGamblingSession(session);
      assert.deepEqual(view.opponentCards, [null, null]);
      assert.equal(Object.hasOwn(view, 'deck'), false); assert.equal(Object.hasOwn(view, 'rng'), false); assert.equal(Object.hasOwn(view, 'poker'), false);
      assert.equal(session.turn, 0);
      const action = index % 3 === 0 && view.legalActions.includes('raise') ? { type: 'raise', amount: view.maxRaise } : { type: view.legalActions.includes('call') ? 'call' : 'check' };
      assert.equal(gamblingAction(session, action).ok, true);
    }
    assert.equal(session.status, 'complete');
    assert.equal(validateGamblingSession(session), true);
    assert.equal(session.payout[0] + session.payout[1], session.stake * 2);
    assert.ok(session.payout.every(value => Number.isInteger(value) && value >= 0));
  }
});

test('two human poker seats see only their own cards and cannot act for the other seat', () => {
  const session = create('poker', { humanOpponent: true });
  const first = publicGamblingSession(session), second = publicGamblingSession(session, 1);
  assert.deepEqual(first.cards, session.poker.hands[0]); assert.deepEqual(second.cards, session.poker.hands[1]);
  assert.deepEqual(second.opponentCards, [null, null]); assert.equal(second.turn, 1);
  const before = JSON.stringify(session);
  assert.equal(gamblingAction(session, { type: 'call' }, 1).ok, false);
  assert.equal(JSON.stringify(session), before);
});

test('blackjack aces adjust correctly and soft seventeen is identifiable', () => {
  assert.deepEqual(blackjackTotal(cards([[14, 0], [14, 1], [5, 2]])), { total: 17, soft: true, blackjack: false });
  assert.deepEqual(blackjackTotal(cards([[14, 0], [14, 1], [10, 2]])), { total: 12, soft: false, blackjack: false });
  assert.equal(blackjackTotal(cards([[14, 0], [13, 1]])).blackjack, true);
});

test('blackjack naturals pay three to two and dealer naturals take only the wager', () => {
  const session = create('blackjack'); session.status = 'playing'; session.turn = 0;
  Object.assign(session.blackjack, { cards: cards([[14, 0], [13, 1]]), dealerCards: cards([[10, 0], [9, 1]]) });
  assert.equal(gamblingAction(session, { type: 'stand' }).ok, true); assert.equal(session.payout[0], 35); assert.equal(session.result.net, 15);
  const dealer = create('blackjack'); dealer.status = 'playing'; dealer.turn = 0;
  Object.assign(dealer.blackjack, { cards: cards([[10, 0], [9, 1]]), dealerCards: cards([[14, 0], [13, 1]]) });
  gamblingAction(dealer, { type: 'stand' }); assert.equal(dealer.payout[0], 10); assert.equal(dealer.result.net, -10);
});

test('blackjack stands on soft 17 and pushes return the entire reserve', () => {
  const session = create('blackjack'); session.status = 'playing'; session.turn = 0;
  Object.assign(session.blackjack, { cards: cards([[10, 0], [7, 1]]), dealerCards: cards([[14, 0], [6, 1]]), deck: [card(10, 2)] });
  gamblingAction(session, { type: 'stand' });
  assert.equal(session.blackjack.dealerCards.length, 2); assert.equal(session.payout[0], 20); assert.equal(session.result.outcome, 'push');
});

test('double draws exactly one card and uses the reserved maximum; hitting removes the double option', () => {
  const session = create('blackjack'); session.status = 'playing'; session.turn = 0;
  Object.assign(session.blackjack, { cards: cards([[5, 0], [6, 1]]), dealerCards: cards([[10, 0], [7, 1]]), deck: [card(10, 2)] });
  assert.equal(gamblingAction(session, { type: 'double' }).ok, true);
  assert.equal(session.blackjack.cards.length, 3); assert.equal(session.blackjack.bet, 20); assert.equal(session.payout[0], 40);
  const other = create('blackjack'); other.status = 'playing'; other.turn = 0;
  Object.assign(other.blackjack, { cards: cards([[2, 0], [3, 1]]), dealerCards: cards([[10, 0], [7, 1]]), deck: [card(4, 2), card(2, 2)] });
  gamblingAction(other, { type: 'hit' }); const before = JSON.stringify(other);
  assert.equal(gamblingAction(other, { type: 'double' }).ok, false); assert.equal(JSON.stringify(other), before);
});

test('blackjack public projections hide the hole card and raw deck until resolution', () => {
  const session = create('blackjack'); session.status = 'playing'; session.turn = 0;
  const view = publicGamblingSession(session);
  assert.deepEqual(view.dealerCards, [session.blackjack.dealerCards[0], null]);
  assert.equal(Object.hasOwn(view, 'blackjack'), false); assert.equal(Object.hasOwn(view, 'rng'), false);
  assert.equal(view.dealerTotal, blackjackTotal(session.blackjack.dealerCards.slice(0, 1)).total);
  gamblingAction(session, { type: 'leave' }); assert.equal(session.status, 'complete');
  assert.deepEqual(publicGamblingSession(session).dealerCards, session.blackjack.dealerCards);
});

test('factory seeds and JSON-restored sessions follow identical card decisions', () => {
  for (const gameId of ['poker', 'blackjack']) {
    const original = create(gameId), restored = JSON.parse(JSON.stringify(original));
    for (let step = 0; step < 20 && original.status === 'playing'; step++) {
      const view = publicGamblingSession(original), action = { type: gameId === 'blackjack' ? 'stand' : view.legalActions.includes('call') ? 'call' : 'check' };
      assert.equal(gamblingAction(original, action).ok, true); assert.equal(gamblingAction(restored, action).ok, true);
      assert.deepEqual(original, restored);
    }
  }
});

test('pool starts with a proper 15-ball rack and a reproducible full-power break', () => {
  const session = create('pool', { humanOpponent: true });
  assert.equal(session.pool.balls.length, 16); assert.equal(new Set(session.pool.balls.map(ball => ball.id)).size, 16);
  const before = JSON.stringify(session.pool.balls), first = simulatePoolShot(session.pool.balls, 0, 1), second = simulatePoolShot(session.pool.balls, 0, 1);
  assert.equal(JSON.stringify(session.pool.balls), before); assert.deepEqual(first, second);
  assert.equal(first.firstContact, 1); assert.ok(first.railBalls.filter(id => id !== 0).length >= 4 || first.pocketed.length);
  assert.ok(first.duration <= 10); assert.ok(first.frames.length <= 50);
  assert.ok(first.balls.some(ball => ball.id > 0 && Math.hypot(ball.x - session.pool.balls.find(old => old.id === ball.id).x, ball.y - session.pool.balls.find(old => old.id === ball.id).y) > 100));
});

test('pool physical shots transfer momentum, pocket object balls, and do not move the input', () => {
  const balls = [{ id: 0, x: 500, y: 220, pocketed: false }, { id: 1, x: 500, y: 90, pocketed: false }], before = JSON.stringify(balls);
  const shot = simulatePoolShot(balls, -Math.PI / 2, .3);
  assert.equal(JSON.stringify(balls), before); assert.equal(shot.firstContact, 1); assert.deepEqual(shot.pocketed, [1]);
  assert.equal(shot.balls.find(ball => ball.id === 0).pocketed, false);
});

test('pool rejects invalid shots and occupied ball-in-hand placements without advancing anything', () => {
  const session = create('pool', { humanOpponent: true });
  for (const action of [{ type: 'shoot', angle: NaN, power: .5 }, { type: 'shoot', angle: Infinity, power: .5 }, { type: 'shoot', angle: 0, power: -1 }, { type: 'shoot', angle: 0, power: 2 }, { type: 'shoot', angle: '0', power: .5 }, { type: 'place', x: 100, y: 100 }]) {
    const before = JSON.stringify(session); assert.equal(gamblingAction(session, action).ok, false); assert.equal(JSON.stringify(session), before);
  }
  session.pool.ballInHand = true;
  for (const point of [{ x: -1, y: 200 }, { x: 700, y: 250 }, { x: Infinity, y: 200 }]) {
    const before = JSON.stringify(session); assert.equal(gamblingAction(session, { type: 'place', ...point }).ok, false); assert.equal(JSON.stringify(session), before);
  }
  assert.equal(gamblingAction(session, { type: 'place', x: 200, y: 300 }).ok, true); assert.equal(session.pool.ballInHand, false);
});

test('a legal first pot assigns groups and keeps the shooter at the table', () => {
  const session = poolFixture([{ id: 0, x: 500, y: 220 }, { id: 1, x: 500, y: 90 }, { id: 8, x: 800, y: 250 }, { id: 9, x: 700, y: 300 }]);
  assert.equal(gamblingAction(session, { type: 'shoot', angle: -Math.PI / 2, power: .3 }).ok, true);
  assert.deepEqual(session.pool.groups, ['solids', 'stripes']); assert.equal(session.turn, 0); assert.equal(session.pool.lastShot.foul, null);
});

test('a scratch and wrong first contact give the other captain ball in hand', () => {
  const scratch = poolFixture([{ id: 0, x: 500, y: 100 }, { id: 1, x: 100, y: 100 }, { id: 8, x: 800, y: 250 }]);
  gamblingAction(scratch, { type: 'shoot', angle: -Math.PI / 2, power: .3 });
  assert.equal(scratch.pool.lastShot.foul, 'Scratch'); assert.equal(scratch.turn, 1); assert.equal(scratch.pool.ballInHand, true);
  assert.equal(scratch.pool.balls.find(ball => ball.id === 0).pocketed, false);
  const wrong = poolFixture([{ id: 0, x: 500, y: 220 }, { id: 9, x: 500, y: 90 }, { id: 1, x: 200, y: 300 }, { id: 8, x: 800, y: 250 }], ['solids', 'stripes']);
  gamblingAction(wrong, { type: 'shoot', angle: -Math.PI / 2, power: .3 });
  assert.equal(wrong.pool.lastShot.foul, 'Wrong ball hit first'); assert.equal(wrong.turn, 1); assert.equal(wrong.pool.ballInHand, true);
});

test('the eight wins only after the shooter clears their own group', () => {
  const ready = poolFixture([{ id: 0, x: 500, y: 220 }, { id: 8, x: 500, y: 90 }, { id: 9, x: 700, y: 300 }], ['solids', 'stripes']);
  gamblingAction(ready, { type: 'shoot', angle: -Math.PI / 2, power: .3 });
  assert.equal(ready.status, 'complete'); assert.deepEqual(ready.payout, [20, 0]); assert.equal(ready.result.outcome, 'win');
  const early = poolFixture([{ id: 0, x: 500, y: 220 }, { id: 8, x: 500, y: 90 }, { id: 1, x: 200, y: 300 }], ['solids', 'stripes']);
  gamblingAction(early, { type: 'shoot', angle: -Math.PI / 2, power: .3 });
  assert.equal(early.status, 'complete'); assert.deepEqual(early.payout, [0, 20]); assert.equal(early.result.outcome, 'loss');
});

test('pool remains open on a legal break and an eight on the break is respotted', () => {
  const session = poolFixture([{ id: 0, x: 500, y: 220 }, { id: 1, x: 500, y: 90 }, { id: 8, x: 800, y: 250 }]); session.pool.isBreak = true;
  gamblingAction(session, { type: 'shoot', angle: -Math.PI / 2, power: .3 });
  assert.deepEqual(session.pool.groups, [null, null]); assert.equal(session.turn, 0);
  const eight = poolFixture([{ id: 0, x: 500, y: 220 }, { id: 8, x: 500, y: 90 }, { id: 1, x: 200, y: 300 }]); eight.pool.isBreak = true;
  gamblingAction(eight, { type: 'shoot', angle: -Math.PI / 2, power: .3 });
  assert.equal(eight.status, 'playing'); assert.equal(eight.pool.balls.find(ball => ball.id === 8).pocketed, false);
});

test('pool NPC responds to the actual table and retains both shots for replay', () => {
  const session = create('pool');
  assert.equal(gamblingAction(session, { type: 'shoot', angle: 0, power: 1 }).ok, true);
  assert.ok(session.status === 'complete' || session.turn === 0);
  assert.ok(session.pool.recentShots.length >= 2); assert.equal(session.pool.recentShots[0].actor, 0); assert.equal(session.pool.recentShots[1].actor, 1);
  const full = publicGamblingSession(session), motion = publicGamblingSession(session, 0, { includeReplay: false });
  assert.ok(full.recentShots[0].frames.length >= 2); assert.equal(Object.hasOwn(motion.recentShots[0], 'frames'), false);
  for (const shot of session.pool.recentShots) delete shot.frames;
  delete session.pool.lastShot.frames;
  assert.doesNotThrow(() => publicGamblingSession(session));
  assert.ok(session.pool.balls.every(ball => ball.pocketed || ball.x >= -32 && ball.x <= POOL_TABLE.width + 32 && ball.y >= -32 && ball.y <= POOL_TABLE.height + 32));
});

test('leaving a pool table concedes once, including while the other human has the cue', () => {
  const session = create('pool', { humanOpponent: true }); session.turn = 1;
  assert.equal(gamblingAction(session, { type: 'leave' }).ok, true); assert.deepEqual(session.payout, [0, 20]);
  assert.equal(gamblingAction(session, { type: 'leave' }).ok, false);
});

test('restoration validation accepts valid private sessions without settling or mutating them', () => {
  for (const gameId of ['poker', 'pool', 'blackjack']) for (const stake of GAMBLING_STAKES) {
    const session = create(gameId, { stake, seed: `restore-${gameId}-${stake}` });
    Object.assign(session, { entityId: 'venue:table', systemId: 'voltage', locationId: 'meridian', settled: false });
    const before = JSON.stringify(session);
    assert.equal(validateGamblingSession(session), true); assert.equal(JSON.stringify(session), before);
    if (session.status === 'playing') gamblingAction(session, { type: 'leave' });
    session.settled = true;
    assert.equal(validateGamblingSession(JSON.parse(JSON.stringify(session))), true);
  }
  for (const raw of [null, undefined, {}, [], { version: 2 }, { get version() { throw new Error('broken imported value'); } }]) {
    assert.equal(validateGamblingSession(raw), false);
  }
});

test('restoration rejects missing state, excessive text, forged bankrolls and inconsistent receipts', () => {
  const changes = [
    s => { s.version = 99; }, s => { s.revision = NaN; }, s => { s.revision = -1; },
    s => { s.rng = Infinity; }, s => { s.status = 'waiting'; }, s => { s.turn = 2; },
    s => { s.names = null; }, s => { s.names[0] = 'x'.repeat(41); }, s => { s.names[0] = '<script>'; },
    s => { s.log = null; }, s => { s.log = Array(17).fill('note'); }, s => { s.log[0] = 'x'.repeat(301); },
    s => { s.payout = null; }, s => { s.payout[0] = 1000000; }, s => { s.payout[0] = 1; },
    s => { s.escrow = -10; }, s => { s.stake = 25; }, s => { s.humanOpponent = 'yes'; },
    s => { delete s.poker; }, s => { s.poker.stacks[0]++; }, s => { s.poker.pot++; },
    s => { s.poker.bets[0] = Infinity; }, s => { s.poker.committed[0] = -1; }, s => { s.poker.currentBet = 50; },
  ];
  for (const change of changes) { const session = create('poker'); change(session); assert.equal(validateGamblingSession(session), false); }
  const complete = create('poker'); gamblingAction(complete, { type: 'fold' });
  for (const change of [s => { s.result.net++; }, s => { s.result.returned++; }, s => { s.result.winner = null; }, s => { s.payout[0]++; }, s => { s.result = null; }]) {
    const copy = structuredClone(complete); change(copy); assert.equal(validateGamblingSession(copy), false);
  }
});

test('restoration validates complete card populations, streets and dealer state', () => {
  for (const change of [
    s => { s.poker.hands[1][1] = s.poker.hands[0][0]; },
    s => { s.poker.deck[0] = s.poker.hands[0][0]; },
    s => { s.poker.deck.pop(); }, s => { s.poker.hands[0].push(s.poker.deck.pop()); },
    s => { s.poker.deck[0] = 52; }, s => { s.poker.board = [0]; }, s => { s.poker.street = 'showdown'; },
  ]) { const session = create('poker'); change(session); assert.equal(validateGamblingSession(session), false); }
  for (const change of [
    s => { delete s.blackjack; }, s => { s.blackjack.dealerCards[1] = s.blackjack.cards[0]; },
    s => { s.blackjack.deck[0] = s.blackjack.dealerCards[0]; }, s => { s.blackjack.deck.pop(); },
    s => { s.blackjack.bet = 15; }, s => { s.blackjack.doubled = true; }, s => { s.blackjack.cards = []; },
  ]) { const session = create('blackjack'); change(session); assert.equal(validateGamblingSession(session), false); }
  for (let index = 0; index < 40; index++) {
    const session = create('blackjack', { seed: `restore-blackjack-${index}` });
    while (session.status === 'playing') {
      assert.equal(validateGamblingSession(session), true);
      const view = publicGamblingSession(session);
      gamblingAction(session, { type: index % 3 === 0 && view.canDouble ? 'double' : index % 2 && view.total < 16 ? 'hit' : 'stand' });
    }
    assert.equal(validateGamblingSession(session), true);
  }
});

test('pool restoration bounds ids, positions and replay while accepting discarded frames', () => {
  const session = create('pool');
  gamblingAction(session, { type: 'shoot', angle: 0, power: 1 });
  assert.equal(validateGamblingSession(session), true);
  for (const change of [
    s => { s.pool.balls[0].x = NaN; }, s => { s.pool.balls[0].y = Infinity; },
    s => { s.pool.balls[0].x = 1e8; }, s => { s.pool.balls[1].id = 0; },
    s => { s.pool.balls.pop(); }, s => { s.pool.groups = ['solids', 'solids']; },
    s => { s.pool.shotNumber = -1; }, s => { s.pool.isBreak = true; }, s => { s.pool.lastShot = null; },
    s => { s.pool.lastShot.frames[0].balls[0].y = Infinity; },
    s => { s.pool.recentShots[0].number = 1e9; }, s => { s.pool.lastShot.frames[0].t = -1; },
  ]) { const copy = structuredClone(session); change(copy); assert.equal(validateGamblingSession(copy), false); }
  for (const shot of session.pool.recentShots) delete shot.frames;
  delete session.pool.lastShot.frames;
  assert.equal(validateGamblingSession(JSON.parse(JSON.stringify(session))), true);
  assert.equal(validateGamblingSession(publicGamblingSession(session)), false, 'a redacted public view is not a private saved deck');
});
