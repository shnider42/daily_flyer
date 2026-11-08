import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, legalActions, applyAction, publicView, chooseBotAction } from '../../server/vineyard/engine.mjs';

function fresh(count = 2, target = 20, seed = 'rules-test') {
  return createGame({ players: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Estate ${i}`, bot: true })), target, seed });
}
function phase(name, count = 2) {
  const s = fresh(count);
  s.phase = name; s.activePlayerId = 'p0'; s.order = s.players.map(p => p.id);
  for (let i = 0; i < count; i++) { s.players[i].wake = i + 1; s.players[i].passed = false; }
  return s;
}
function take(s, predicate, id = s.activePlayerId) {
  const action = legalActions(s, id).find(predicate);
  assert.ok(action, `Expected action at ${s.phase}: ${legalActions(s, id).map(a => `${a.group}/${a.label}`).join('; ')}`);
  return applyAction(s, id, action.key);
}
function named(group, text = '', worker = 'regular') {
  return a => a.group === group && a.label.includes(text) && (worker === undefined || a.worker === worker);
}
function vine(id, red, white = 0, requires = []) { return { id, name: `Test ${id}`, red, white, requires }; }
function order(id, requirements, points = 3, income = 1) { return { id, name: `Order ${id}`, requirements: requirements.map(([type, value]) => ({ type, value })), points, income }; }
function visitor(id, season, effect) { return { id, name: `Visitor ${effect}`, season, effect, description: 'Test visitor' }; }
function endYear(s) {
  s.phase = 'winter'; s.activePlayerId = 'p0'; s.pending = null;
  for (const p of s.players) { p.passed = p.id !== 'p0'; p.hand = { vines: [], orders: [], summer: [], winter: [] }; }
  return take(s, a => a.group === 'pass');
}

test('new tables validate seats, use deterministic draws, and expose a playable spring', () => {
  assert.throws(() => fresh(1), /2–6/);
  assert.throws(() => fresh(7), /2–6/);
  assert.throws(() => fresh(2, 15), /12- or 20/);
  assert.throws(() => createGame({ players: [{ id: 'x' }, { id: 'x' }] }), /unique/);
  assert.deepEqual(fresh(), fresh());
  const s = fresh();
  assert.equal(legalActions(s, 'p0').length, 8); // Row 5 has two visitor choices.
  assert.equal(legalActions(s, 'p1').length, 0);
  assert.equal(s.players[0].workers.total, 3);
  assert.equal(s.players[0].hand.orders.length, 2);
});

test('every rejected action is atomic, including wrong turns and stale keys', () => {
  const s = fresh(), before = JSON.stringify(s), key = legalActions(s, 'p0')[0].key;
  assert.throws(() => applyAction(s, 'p1', key), /not your turn/);
  assert.throws(() => applyAction(s, 'p0', 'invented'), /no longer available/);
  assert.throws(() => applyAction(s, 'p0', { key }), /Choose/);
  assert.equal(JSON.stringify(s), before);
  const next = applyAction(s, 'p0', key);
  assert.equal(JSON.stringify(s), before, 'accepted actions also leave their input intact');
  const newer = applyAction(next, 'p1', legalActions(next, 'p1')[0].key);
  assert.throws(() => applyAction(newer, 'p0', key));
});

test('wake-up order changes action order and row 7 adds one temporary worker', () => {
  let s = fresh();
  s = take(s, a => a.group === 'wake' && a.label.startsWith('Wake up 7'));
  assert.equal(s.players[0].workers.available, 3);
  assert.equal(s.players[0].workers.total, 3);
  assert.ok(!legalActions(s, 'p1').some(a => a.label.startsWith('Wake up 7')));
  s = take(s, a => a.group === 'wake' && a.label === 'Wake up first');
  assert.equal(s.phase, 'summer');
  assert.equal(s.activePlayerId, 'p1');
  assert.deepEqual(s.order, ['p1', 'p0']);
  s = endYear(s);
  assert.equal(s.players[0].workers.available, 2);
  assert.equal(s.players[0].temporaryWorker, false);
});

test('summer placements remain spent in winter and passing prevents more summer moves', () => {
  let s = phase('summer');
  s = take(s, named('tour'));
  assert.equal(s.players[0].workers.available, 1);
  s = take(s, a => a.group === 'pass');
  s = take(s, a => a.group === 'pass');
  assert.equal(s.phase, 'autumn');
  s = take(s, a => a.group === 'visitor');
  s = take(s, a => a.group === 'visitor');
  assert.equal(s.phase, 'winter');
  assert.equal(s.players[0].workers.available, 1);
  assert.ok(s.placements.some(p => p.action === 'tour' && p.playerId === 'p0'));
  assert.ok(!legalActions(s, s.activePlayerId).some(a => a.group === 'tour'));
});

test('regular workers are blocked while a grande can use a full action without its bonus', () => {
  let s = phase('summer');
  s = take(s, named('tour'));
  const options = legalActions(s, 'p1').filter(a => a.group === 'tour');
  assert.equal(options.length, 1);
  assert.equal(options[0].worker, 'grande');
  const coins = s.players[1].coins;
  s = applyAction(s, 'p1', options[0].key);
  assert.equal(s.players[1].coins, coins + 2);
  assert.equal(s.players[1].workers.grandeAvailable, false);
  assert.equal(s.placements.at(-1).bonus, false);
});

test('player-count scaling provides the middle bonus only for three or more players', () => {
  assert.equal(publicView(phase('summer', 2), 'p0').board[0].capacity, 1);
  assert.equal(publicView(phase('summer', 3), 'p0').board[0].capacity, 2);
  assert.equal(publicView(phase('summer', 6), 'p0').board[0].capacity, 3);
  const s = take(phase('summer', 3), a => a.group === 'tour' && a.worker === 'regular' && a.label.includes('bonus'));
  assert.equal(s.players[0].coins, 8);
});

test('planting enforces structure requirements, owned fields and combined color capacity', () => {
  let s = phase('summer'), p = s.players[0];
  p.hand.vines = [vine('needs', 2, 1, ['trellis'])];
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'plant'));
  p.structures.push('trellis');
  p.fields[0].vines = [vine('existing', 3)]; // 3 + (2+1) > 5.
  p.fields[1].sold = true;
  const choices = legalActions(s, 'p0').filter(a => a.group === 'plant');
  assert.ok(choices.length);
  assert.ok(choices.every(a => a.label.includes('field 3')));
  s = take(s, named('plant', 'field 3'));
  assert.equal(s.players[0].fields[2].vines[0].id, 'needs');
  assert.equal(s.players[0].hand.vines.length, 0);
});

test('a planting bonus is optional, keeps the turn, and does not consume a second worker', () => {
  let s = phase('summer', 3);
  s = take(s, a => a.group === 'plant' && a.worker === 'regular' && a.label.includes('bonus'));
  assert.equal(s.activePlayerId, 'p0');
  assert.equal(s.pending.kind, 'plant');
  assert.equal(s.players[0].workers.available, 1);
  assert.ok(legalActions(s, 'p0').every(a => a.worker === null));
  s = take(s, a => a.group === 'plant');
  assert.equal(s.players[0].workers.available, 1);
  assert.equal(s.pending, null);
  assert.equal(s.activePlayerId, 'p1');
});

test('field trading forbids planted field sales and sold field planting', () => {
  let s = phase('summer');
  s.players[0].fields[0].vines = [vine('planted', 1)];
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'trade' && a.label === 'Sell field 1'));
  s = take(s, named('trade', 'Sell field 3'));
  assert.equal(s.players[0].coins, 12);
  assert.equal(s.players[0].fields[2].sold, true);
  s.activePlayerId = 'p0';
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'plant' && a.label.includes('field 3')));
  s = take(s, named('trade', 'Buy back field 3', 'grande'));
  assert.equal(s.players[0].coins, 5);
  assert.equal(s.players[0].fields[2].sold, false);
});

test('harvest combines each color, downgrades collisions, preserves vines, and is once per field/year', () => {
  let s = phase('winter'), p = s.players[0];
  p.fields[0].vines = [vine('one', 1, 1), vine('two', 2, 1)];
  p.grapes.red = [3]; p.grapes.white = [1, 2];
  s = take(s, named('harvest', 'field 1'));
  assert.deepEqual(s.players[0].grapes.red, [2, 3]);
  assert.deepEqual(s.players[0].grapes.white, [1, 2]);
  assert.equal(s.players[0].fields[0].vines.length, 2);
  assert.equal(s.players[0].fields[0].harvested, true);
  s.activePlayerId = 'p0';
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'harvest'));
});

test('winemaking respects color recipes, blend minima, cellar caps, and sequential free wines', () => {
  let s = phase('winter'), p = s.players[0];
  p.grapes = { red: [1, 3, 5], white: [1, 3] };
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'make_wine' && /blush|sparkling/.test(a.label)));
  assert.ok(legalActions(s, 'p0').some(a => a.group === 'make_wine' && a.label === 'Make red 3'));
  p.structures.push('medium_cellar');
  const blushes = legalActions(s, 'p0').filter(a => a.group === 'make_wine' && a.label.includes('blush'));
  assert.ok(blushes.length);
  assert.ok(blushes.every(a => !/blush [123](?:$| )/.test(a.label)));
  assert.ok(!legalActions(s, 'p0').some(a => a.label.includes('sparkling')));
  p.structures.push('large_cellar');
  assert.ok(legalActions(s, 'p0').some(a => a.group === 'make_wine' && a.label === 'Make sparkling 7'));
  s = take(s, named('make_wine', 'Make sparkling 7'));
  assert.deepEqual(s.players[0].wines.sparkling, [7]);
  assert.equal(s.activePlayerId, 'p0');
  assert.equal(s.players[0].workers.available, 1);
  const workerCount = s.players[0].workers.available;
  s = take(s, a => a.group === 'make_wine');
  assert.equal(s.players[0].workers.available, workerCount);
  assert.equal(s.activePlayerId, 'p1');
  assert.equal(s.pending, null);
});

test('a large cellar requires a medium cellar and wine collisions downgrade instead of duplicating', () => {
  const s = phase('summer'); s.players[0].coins = 20;
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'build' && a.label.includes('large cellar')));
  s.players[0].structures.push('medium_cellar');
  assert.ok(legalActions(s, 'p0').some(a => a.group === 'build' && a.label.includes('large cellar')));
  s.phase = 'winter'; s.players[0].wines.red = [3]; s.players[0].grapes.red = [3];
  const next = take(s, named('make_wine', 'Make red 2'));
  assert.deepEqual(next.players[0].wines.red, [2, 3]);
});

test('orders use distinct matching wine tokens, permit higher values, consume wines, and cap income', () => {
  let s = phase('winter'), p = s.players[0];
  p.hand.orders = [order('two', [['red', 2], ['red', 4]], 4, 2)];
  p.wines.red = [5]; p.income = 4;
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'fill_order'));
  p.wines.red.push(6);
  s = take(s, named('fill_order'));
  assert.deepEqual(s.players[0].wines.red, []);
  assert.equal(s.players[0].score, 4);
  assert.equal(s.players[0].income, 5);
  assert.equal(s.players[0].hand.orders.length, 0);
  assert.equal(s.players[0].ordersFilled, 1);
});

test('training is unavailable until next year and the six-worker limit includes trainees', () => {
  let s = phase('winter');
  s = take(s, named('train'));
  assert.equal(s.players[0].workers.available, 1);
  assert.equal(s.players[0].workers.total, 4);
  assert.equal(s.players[0].workers.pending, 1);
  s = endYear(s);
  assert.equal(s.players[0].workers.available, 3);
  assert.equal(s.players[0].workers.pending, 0);
  s.phase = 'winter'; s.activePlayerId = 'p0'; s.players[0].workers.total = 6; s.players[0].coins = 99;
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'train'));
});

test('year-end aging handles blocked tracks, cellar limits, income, and worker recovery', () => {
  let s = phase('winter'), p = s.players[0];
  p.grapes.red = [1, 2, 8, 9]; p.wines.red = [1, 2, 3]; p.income = 3; p.coins = 2;
  p.workers = { available: 0, grandeAvailable: false, total: 5, pending: 1 };
  s = endYear(s); p = s.players[0];
  assert.deepEqual(p.grapes.red, [2, 3, 8, 9]);
  assert.deepEqual(p.wines.red, [1, 2, 3]);
  assert.equal(p.coins, 5);
  assert.equal(p.workers.available, 4);
  assert.equal(p.workers.grandeAvailable, true);
  assert.equal(s.phase, 'spring');
  assert.equal(s.year, 2);
  assert.equal(s.activePlayerId, 'p1');
});

test('hand limit requires explicit private choices and pauses year transition', () => {
  let s = phase('winter');
  s.players[1].passed = true;
  s.players[0].hand.vines.push(vine('extra1', 1), vine('extra2', 1), vine('extra3', 1));
  s = take(s, a => a.group === 'pass');
  assert.equal(s.phase, 'discard');
  assert.equal(s.year, 1);
  assert.equal(legalActions(s, 'p1').length, 0);
  s = take(s, a => a.group === 'discard' && a.label.includes('extra1'));
  assert.equal(s.phase, 'discard');
  s = take(s, a => a.group === 'discard' && a.label.includes('extra2'));
  assert.equal(s.phase, 'spring');
  assert.equal(s.year, 2);
});

test('reaching the target finishes the whole year and uses post-upkeep tiebreakers', () => {
  let s = phase('winter'), p = s.players[0];
  s.target = 12; p.score = 10; p.hand.orders = [order('end', [['red', 2]], 2)]; p.wines.red = [2];
  s = take(s, named('fill_order'));
  assert.equal(s.finalYear, true);
  assert.equal(s.status, 'playing');
  assert.equal(s.activePlayerId, 'p1');
  s.players[1].score = 12; s.players[1].coins = 4; s.players[1].income = 5;
  s.players[0].coins = 5; s.players[0].income = 1;
  s = endYear(s);
  assert.equal(s.status, 'finished');
  assert.equal(s.phase, 'finished');
  assert.equal(s.year, 1);
  assert.equal(s.activePlayerId, null);
  assert.deepEqual(s.winnerIds, ['p1']);
  assert.equal(legalActions(s, 'p0').length, 0);
});

test('yoke harvest works in summer once per year; windmill and tasting points are also once per year', () => {
  let s = phase('summer');
  s.players[0].structures = ['yoke', 'windmill', 'tasting_room'];
  s.players[0].wines.red = [1];
  s = take(s, named('plant', 'field 1'));
  assert.equal(s.players[0].score, 1);
  s.activePlayerId = 'p0';
  s = take(s, named('yoke', 'Harvest field 1'));
  assert.equal(s.players[0].yokeUsed, true);
  s.activePlayerId = 'p0';
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'yoke'));
  s = take(s, named('tour', '', 'grande'));
  assert.equal(s.players[0].score, 2);
  assert.equal(s.players[0].tastingUsed, true);
});

test('original visitors apply their full validated effects and bonus visitors cost no extra worker', () => {
  let s = phase('summer', 3), p = s.players[0];
  p.hand.summer = [visitor('a', 'summer', 'water'), visitor('b', 'summer', 'host')];
  p.coins = 0;
  assert.ok(!legalActions(s, 'p0').some(a => a.group === 'summer_visitor' && a.label.includes('water')));
  s = take(s, a => a.group === 'summer_visitor' && a.worker === 'regular' && a.label.includes('host') && a.label.includes('bonus'));
  assert.equal(s.players[0].coins, 4);
  assert.equal(s.pending.kind, 'visitor');
  assert.equal(s.activePlayerId, 'p0');
  s = take(s, a => a.group === 'summer_visitor' && a.label.includes('water'));
  assert.equal(s.players[0].coins, 3);
  assert.ok(s.players[0].structures.includes('irrigation'));
  assert.equal(s.players[0].workers.available, 1);
  assert.equal(s.pending, null);
});

test('public views reveal no opponent hands, future draws, effects, or PRNG state', () => {
  const s = fresh(), view = publicView(s, 'p0'), encoded = JSON.stringify(view);
  assert.equal(view.you.id, 'p0');
  assert.equal(view.players[1].hand, undefined);
  for (const type of ['vines', 'orders', 'summer', 'winter']) {
    for (const hidden of s.players[1].hand[type]) assert.ok(!encoded.includes(`"${hidden.id}"`));
    assert.ok(!encoded.includes(`"${s.decks[type].at(-1).id}"`));
  }
  assert.equal(view.rng, undefined);
  assert.equal(view.decks, undefined);
  assert.ok(view.you.hand.summer.every(c => !('effect' in c)));
  assert.ok(view.legalActions.some(a => a.key === view.guide.recommendedKey));
  assert.ok(view.board.every(b => typeof b.reason === 'string'));
  view.players[0].coins = 100;
  assert.equal(s.players[0].coins, 5);
});

test('complete strategic games at every supported seat count finish with wine orders and valid resources', () => {
  for (let count = 2; count <= 6; count++) {
    let s = fresh(count, count % 2 ? 12 : 20, `complete-${count}`), decisions = 0;
    for (; decisions < 2000 && s.status === 'playing'; decisions++) {
      const id = s.activePlayerId, key = chooseBotAction(s, id);
      assert.ok(key, `${count}-seat game stuck in ${s.phase}, year ${s.year}`);
      s = applyAction(s, id, key);
      for (const p of s.players) {
        assert.ok(p.coins >= 0);
        assert.ok(p.workers.available >= 0 && p.workers.total <= 6);
        for (const values of [...Object.values(p.grapes), ...Object.values(p.wines)]) {
          assert.equal(new Set(values).size, values.length);
          assert.ok(values.every(v => v >= 1 && v <= 9));
        }
      }
    }
    assert.equal(s.status, 'finished', `${count}-seat game did not finish`);
    assert.ok(s.players.reduce((sum, p) => sum + p.ordersFilled, 0) >= count, 'Opponents should pursue wine orders');
    assert.ok(s.winnerIds.length);
    assert.ok(s.year <= 20);
  }
});
