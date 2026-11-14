import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { gamblingEscrow } from '../dist/gambling-rules.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
function seated(gameId, seed = 'gaming-wallet') {
  const game = new Game(seed), body = game.system.bodies.find(value => value.id === 'kettle');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  ok(game.dock(body.id));
  const surface = generateSurface(body, seed, game.state.flags), table = surface.entities.find(entity => entity.type === 'gambling' && entity.data.gameId === gameId);
  assert.ok(table, `Kettle has a ${gameId} table`);
  Object.assign(game.state.person, { x: table.x, y: table.y });
  return { game, table };
}

test('tables enforce physical location, canonical game, healthy captain and posted affordable stakes', () => {
  const { game, table } = seated('poker'), funds = game.state.credits;
  const pose = { ...game.state.person };
  game.state.person.x += 180;
  assert.equal(game.startGambling(table.id, 'poker', 10).code, 'distance');
  Object.assign(game.state.person, pose);
  assert.equal(game.startGambling(table.id, 'pool', 10).code, 'target');
  for (const stake of [-10, 0, 1, 11, 25, 1e9, Infinity, NaN, '10', {}]) assert.equal(game.startGambling(table.id, 'poker', stake).ok, false);
  game.state.person.health = 0;
  assert.equal(game.startGambling(table.id, 'poker', 10).code, 'incapacitated');
  game.state.person.health = pose.health;
  assert.equal(game.state.credits, funds);
  game.state.credits = 9;
  assert.equal(game.startGambling(table.id, 'poker', 10).code, 'cost');
  assert.equal(game.state.credits, 9);
  assert.equal(game.state.gamblingSerial, 0);
});

test('each game reserves exactly its quote and returns its resolved payout once', () => {
  for (const gameId of ['poker', 'pool', 'blackjack']) {
    const { game, table } = seated(gameId, `wallet-${gameId}`), funds = game.state.credits;
    const opened = ok(game.startGambling(table.id, gameId, 20));
    const reserve = gamblingEscrow(gameId, 20);
    assert.equal(game.state.credits, funds - reserve + (opened.session.settled ? opened.session.creditsReturned : 0));
    if (opened.session.status === 'playing') assert.equal(game.startGambling(table.id, gameId, 20).code, 'gambling-active');
    const resolved = ok(game.leaveGambling()).session;
    assert.equal(resolved.status, 'complete');
    assert.equal(resolved.settled, true);
    assert.equal(game.state.credits, funds - reserve + resolved.creditsReturned);
    assert.equal(game.state.gamblingHistory.length, 1);
    const credited = game.state.credits;
    ok(game.leaveGambling());
    assert.equal(game.gamblingAction({ type: 'stand' }).ok, false);
    assert.equal(game.state.credits, credited);
    assert.equal(game.gamblingStatus(), null);
  }
});

test('a saved hand resumes its same deck and escrow, while completed receipts cannot pay twice', () => {
  const { game, table } = seated('poker', 'persistent-cards'), funds = game.state.credits;
  ok(game.startGambling(table.id, 'poker', 50));
  const before = game.gamblingStatus(), saved = game.save(), restored = Game.fromSave(saved);
  assert.equal(restored.state.credits, funds - 50);
  assert.deepEqual(restored.gamblingStatus(), before);
  const result = ok(restored.gamblingAction({ type: 'fold', sessionId: before.id, revision: before.revision }));
  assert.equal(result.session.settled, true);
  const settled = restored.state.credits;
  const again = Game.fromSave(restored.save());
  assert.equal(again.state.credits, settled);
  ok(again.leaveGambling());
  assert.equal(again.state.credits, settled);
  assert.equal(again.state.gamblingHistory.length, 1);
});

test('walking away cannot play remote shots, but leaving a reserved round is always possible', () => {
  const { game, table } = seated('pool');
  const session = ok(game.startGambling(table.id, 'pool', 10)).session;
  game.state.person.x += 250;
  assert.equal(game.gamblingAction({ type: 'shoot', angle: 0, power: .7, sessionId: session.id, revision: session.revision }).code, 'distance');
  ok(game.leaveGambling({ sessionId: session.id, revision: session.revision }));
  assert.equal(game.state.credits, 170);
});

test('old saves acquire empty gambling state and receipt history remains bounded', () => {
  const old = new Game('old-gaming-save').save();
  delete old.gamblingSession; delete old.gamblingSerial; delete old.gamblingHistory;
  const restored = Game.fromSave(old);
  assert.equal(restored.gamblingStatus(), null);
  assert.equal(restored.state.credits, old.credits);
  const { game, table } = seated('pool');
  game.state.credits = 1000;
  for (let n = 0; n < 20; n++) { ok(game.startGambling(table.id, 'pool', 10)); ok(game.leaveGambling()); }
  assert.equal(game.state.gamblingHistory.length, 16);
  assert.equal(game.state.gamblingSerial, 20);
  assert.equal(game.state.credits, 800);
});

test('malformed saved rounds are discarded without crashing or changing the purse', () => {
  const { game, table } = seated('poker', 'damaged-table-save');
  ok(game.startGambling(table.id, 'poker', 20));
  const valid = game.save();
  for (const damage of [
    saved => { saved.gamblingSession = { gameId: 'poker', stake: 20, escrow: 20, id: 'table-1', entityId: table.id, systemId: 'hearth', locationId: 'kettle', status: 'playing' }; },
    saved => { saved.gamblingSession.poker.deck[0] = saved.gamblingSession.poker.hands[0][0]; },
    saved => { saved.gamblingSession.poker.stacks[0] = Infinity; },
    saved => { saved.gamblingSession.venue = {}; },
    saved => { saved.gamblingSession.settled = true; },
    saved => { saved.gamblingSerial = 0; },
  ]) {
    const saved = structuredClone(valid);
    saved.gamblingView = game.gamblingStatus();
    damage(saved);
    const restored = Game.fromSave(saved);
    assert.equal(restored.gamblingStatus(), null);
    assert.equal(restored.state.credits, valid.credits);
    assert.equal(restored.state.gamblingHistory.length, 0);
  }
  ok(game.gamblingAction({ type: 'fold' }));
  const completed = game.save(), purse = completed.credits;
  completed.gamblingSession.settled = false;
  const restored = Game.fromSave(completed);
  assert.equal(restored.gamblingStatus(), null);
  ok(restored.leaveGambling());
  assert.equal(restored.state.credits, purse);
});
