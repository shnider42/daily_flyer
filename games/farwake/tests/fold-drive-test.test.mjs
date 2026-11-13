import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { UPGRADES } from '../dist/content.mjs';
import { createTestSession, resetTestSession, testSessionStatus } from '../dist/test-lab.mjs';
import { FOLD_TEST_CASES, foldDriveTestState, foldTestActionAllowed } from '../dist/fold-drive-test.mjs';

const ORIGIN = 'fold-test-origin';
const NEARBY = 'fold-test-nearby';
const DISTANT = 'fold-test-distant';
const port = id => `${id}:port`;
const exercise = (foldCase = 'round-trip', seed = 'fold-contract') => createTestSession({ scenario: 'fold-drive', foldCase, seed });
const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const stateCopy = game => JSON.stringify(game.state);
const frames = (game, count = 300) => { for (let index = 0; index < count; index++) game.step(1 / 60, {}); };

test('fold practice advertises seven explicit fixtures and creates independent bounded sessions', () => {
  const ids = ['round-trip', 'installation', 'no-drive', 'calibration', 'fuel', 'range', 'docked'];
  assert.deepEqual(FOLD_TEST_CASES.map(item => item.id), ids);
  assert.ok(Object.isFrozen(FOLD_TEST_CASES));
  assert.ok(FOLD_TEST_CASES.every(item => Object.isFrozen(item) && item.title && item.description && item.goal));
  for (const foldCase of ids) {
    const session = exercise(foldCase), model = foldDriveTestState(session);
    assert.equal(session.scenarioId, 'fold-drive');
    assert.equal(session.config.foldCase, foldCase);
    assert.equal(model.case.id, foldCase);
    assert.equal(model.current.systemId, ORIGIN);
    assert.equal(session.game.galaxy.length, 3);
    assert.deepEqual(session.game.galaxy.map(system => system.id), [ORIGIN, NEARBY, DISTANT]);
    assert.deepEqual(session.game.system.enemies, []);
    assert.deepEqual(session.game.system.traffic, []);
    assert.deepEqual(model.attempts, []);
    assert.equal(model.complete, false, `${foldCase} must wait for an actual operation`);
    assert.equal(testSessionStatus(session).complete, false);
  }
  assert.equal(createTestSession({ scenario: 'fold-drive' }).config.foldCase, 'round-trip');
  assert.throws(() => exercise('unlock-everything'), RangeError);
});

test('a ready practice drive uses the real fuel debit and arrival rules for an outbound and return jump', () => {
  const session = exercise(), game = session.game;
  assert.equal(game.hasHyperdrive, true);
  assert.equal(game.state.ship.warpRange, 5);
  assert.equal(game.state.mode, 'ship');
  const initialFuel = game.state.ship.fuel, initialJumps = game.state.stats.jumps, shipId = game.state.ship.id;
  const quote = ok(game.travelInfo(NEARBY));
  assert.equal(quote.distance, 4);
  assert.equal(quote.fuelCost, 5);
  const outbound = ok(game.travel(NEARBY));
  assert.equal(outbound.fuelCost, 5);
  assert.equal(game.state.systemId, NEARBY);
  assert.equal(game.state.ship.fuel, initialFuel - 5);
  assert.equal(game.state.stats.jumps, initialJumps + 1);
  assert.equal(game.state.ship.id, shipId);
  assert.equal(game.state.ship.vx, 0);
  assert.equal(game.state.ship.vy, 0);
  assert.ok(game.state.visited.includes(NEARBY));
  assert.ok(game.state.discovered.includes(NEARBY));
  assert.ok(game.events.some(event => event.type === 'jump' && event.systemId === NEARBY));
  assert.equal(testSessionStatus(session).complete, false, 'Arrival alone does not complete the return leg.');
  ok(game.travel(ORIGIN));
  assert.equal(game.state.systemId, ORIGIN);
  assert.equal(game.state.ship.fuel, initialFuel - 10);
  assert.equal(game.state.stats.jumps, initialJumps + 2);
  assert.equal(testSessionStatus(session).complete, true);
  const model = foldDriveTestState(session);
  assert.equal(model.attempts.filter(item => item.action === 'travel').length, 2);
  assert.ok(model.attempts.every(item => item.actual.ok && item.passed));
  assert.ok(model.lastAttempt.observations.length > 0);
  assert.ok(model.lastAttempt.observations.every(item => item.passed));
});

test('installation spends the native first-drive chain costs and then requires the actual round trip', () => {
  const session = exercise('installation'), game = session.game;
  assert.equal(game.atInhabitedPort, true);
  assert.equal(game.currentBody.id, port(ORIGIN));
  assert.equal(game.hasFlag('belt_signal_found'), true, 'Calibration is clearly supplied as a fixture.');
  assert.deepEqual(game.state.upgrades, {});
  assert.equal(game.state.credits, 500);
  assert.equal(game.state.cargo.ore, 12);
  const untouched = stateCopy(game);
  assert.equal(game.buyUpgrade('fold_1').code, 'prerequisite');
  assert.equal(stateCopy(game), untouched);
  ok(game.buyUpgrade('thrusters_1'));
  assert.equal(game.state.credits, 415);
  assert.equal(game.state.cargo.ore, 10);
  ok(game.buyUpgrade('scanner_1'));
  assert.equal(game.state.credits, 320);
  assert.equal(game.state.cargo.ore, 8);
  ok(game.buyUpgrade('fold_1'));
  assert.equal(game.state.credits, 0);
  assert.equal(game.state.cargo.ore, 0);
  assert.equal(game.state.ship.warpRange, 5);
  assert.equal(game.hasHyperdrive, true);
  assert.equal(testSessionStatus(session).complete, false);
  assert.equal(game.travel(NEARBY).code, 'mode');
  ok(game.launch());
  ok(game.travel(NEARBY));
  ok(game.travel(ORIGIN));
  assert.equal(testSessionStatus(session).complete, true);
  assert.deepEqual(game.state.completedChapters, [], 'Practice purchases and jumps do not award the campaign chapters.');
  assert.ok(foldDriveTestState(session).checks.every(check => check.complete));
});

test('the missing-calibration fixture exposes the actual story gate without manufacturing a completed chapter', () => {
  const session = exercise('calibration'), game = session.game;
  assert.equal(game.atInhabitedPort, true);
  assert.ok(game.state.upgrades.thrusters_1);
  assert.ok(game.state.upgrades.scanner_1);
  assert.equal(game.hasFlag('belt_signal_found'), false);
  const before = stateCopy(game);
  assert.equal(game.upgradeInfo('fold_1').code, 'story');
  assert.equal(testSessionStatus(session).complete, false, 'Reading an unavailable purchase does not perform the test.');
  const result = game.buyUpgrade('fold_1');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'story');
  assert.equal(stateCopy(game), before);
  const model = foldDriveTestState(session);
  assert.equal(model.lastAttempt.actual.code, 'story');
  assert.equal(model.lastAttempt.passed, true);
  assert.equal(model.complete, true);
});

test('missing drive, low fuel, excessive range and being docked return native failures without changing the ship', () => {
  for (const [foldCase, target, code] of [
    ['no-drive', NEARBY, 'hyperdrive'],
    ['fuel', NEARBY, 'fuel'],
    ['range', DISTANT, 'range'],
    ['docked', NEARBY, 'mode']
  ]) {
    const session = exercise(foldCase), game = session.game, before = stateCopy(game);
    const readiness = game.travelInfo(target);
    assert.equal(readiness.ok, false, foldCase);
    assert.equal(readiness.code, code, foldCase);
    assert.equal(testSessionStatus(session).complete, false);
    const result = game.travel(target);
    assert.equal(result.ok, false, foldCase);
    assert.equal(result.code, code, foldCase);
    assert.equal(stateCopy(game), before, `${foldCase} rejected travel must preserve all voyage state`);
    const model = foldDriveTestState(session);
    assert.equal(model.lastAttempt.action, 'travel');
    assert.equal(model.lastAttempt.targetId, target);
    assert.equal(model.lastAttempt.actual.code, code);
    assert.equal(model.lastAttempt.passed, true);
    assert.equal(model.complete, true);
  }
});

test('real launch and docking actions change the training location and are captured in the attempt history', () => {
  const session = exercise('docked'), game = session.game;
  ok(game.launch());
  assert.equal(game.state.mode, 'ship');
  assert.equal(game.state.locationId, null);
  assert.equal(game.state.ship.dockedAt, null);
  assert.equal(foldDriveTestState(session).lastAttempt.action, 'launch');
  ok(game.dock(port(ORIGIN)));
  assert.equal(game.atInhabitedPort, true);
  assert.equal(game.state.locationId, port(ORIGIN));
  assert.equal(game.state.ship.dockedAt, port(ORIGIN));
  assert.equal(foldDriveTestState(session).lastAttempt.action, 'dock');
  assert.equal(testSessionStatus(session).complete, false, 'Launching and docking do not count as testing a rejected jump.');
});

test('fold practice checks expose live readiness and attempts without mutating or consuming state', () => {
  const session = exercise('installation'), game = session.game;
  game.buyUpgrade('fold_1');
  const before = stateCopy(game), events = structuredClone(game.events);
  const first = foldDriveTestState(session);
  for (let index = 0; index < 5; index++) {
    assert.deepEqual(foldDriveTestState(session), first);
    testSessionStatus(session);
  }
  assert.equal(stateCopy(game), before);
  assert.deepEqual(game.events, events);
  assert.equal(first.current.range, 0);
  assert.equal(first.current.credits, 500);
  assert.equal(first.current.ore, 12);
  assert.equal(first.current.calibration, true);
  assert.equal(first.upgrades.find(item => item.id === 'fold_1').code, 'prerequisite');
  assert.equal(first.destinations.find(item => item.id === NEARBY).code, 'mode');
  assert.equal(first.destinations.find(item => item.id === ORIGIN).current, true);
  assert.equal(foldDriveTestState(createTestSession({ scenario: 'ship-combat' })), null);
  assert.equal(foldDriveTestState({ game: new Game('ordinary-voyage') }), null);
});

test('the action exception is limited to fold sessions, named components and the private training systems', () => {
  const session = exercise();
  for (const id of ['thrusters_1', 'scanner_1', 'fold_1']) assert.equal(foldTestActionAllowed(session, 'buyUpgrade', { id }), true);
  for (const id of [ORIGIN, NEARBY, DISTANT]) assert.equal(foldTestActionAllowed(session, 'travel', { id }), true);
  assert.equal(foldTestActionAllowed(session, 'dock', { id: port(ORIGIN) }), true);
  assert.equal(foldTestActionAllowed(session, 'launch', {}), true);
  for (const [name, args] of [
    ['travel', { id: 'hearth' }], ['travel', { id: 'sol' }],
    ['dock', { id: 'kettle' }], ['dock', { id: port(NEARBY) }],
    ['buyUpgrade', { id: 'fold_3' }], ['buyShip', { id: 'mule' }],
    ['selectShip', { id: 'mule' }], ['triggerEncounter', { id: 'earth_arrival' }],
    ['setCrewAccess', { allowed: true }], ['service', { action: 'refuel' }],
    ['travel', {}], ['buyUpgrade', {}]
  ]) assert.equal(foldTestActionAllowed(session, name, args), false, `${name}:${JSON.stringify(args)}`);
  assert.equal(foldTestActionAllowed(createTestSession(), 'travel', { id: NEARBY }), false);
  assert.equal(foldTestActionAllowed(null, 'launch', {}), false);
});

test('the fold exercise itself rejects arbitrary progression even if the UI allowlist is missed', () => {
  const { game } = exercise('installation');
  for (const operation of [
    () => game.travel('hearth'),
    () => game.travel('sol'),
    () => game.dock('kettle'),
    () => game.buyUpgrade('fold_2'),
    () => game.buyUpgrade('laser_1'),
    () => game.buyShip('mule'),
    () => game.selectShip('mule'),
    () => game.triggerEncounter('earth_arrival')
  ]) {
    const before = stateCopy(game), result = operation();
    assert.equal(result.ok, false);
    assert.equal(result.code, 'test-mode');
    assert.equal(stateCopy(game), before);
  }
  assert.deepEqual(game.availableJobs(), []);
});

test('private destinations remain peaceful under real flight simulation and repeated system changes', () => {
  const { game } = exercise();
  for (const target of [ORIGIN, NEARBY, ORIGIN]) {
    if (game.state.systemId !== target) ok(game.travel(target));
    frames(game, 600);
    assert.equal(game.system.id, target);
    assert.deepEqual(game.system.enemies, []);
    assert.deepEqual(game.system.traffic, []);
    assert.deepEqual(game.system.signals, []);
    assert.equal(game.state.pendingEncounter, null);
    assert.deepEqual(game.state.completedChapters, []);
    assert.equal(game.chapter, null);
  }
});

test('reset and unsavable exercise state protect the ordinary voyage and restore the selected fixture', () => {
  const voyage = new Game('untouched-fold-voyage');
  voyage.state.credits = 417;
  const original = voyage.serialize(), session = exercise('installation', 'repeatable-fold');
  for (const id of ['thrusters_1', 'scanner_1', 'fold_1']) ok(session.game.buyUpgrade(id));
  ok(session.game.launch());
  ok(session.game.travel(NEARBY));
  assert.throws(() => session.game.save(), /cannot be saved/);
  assert.throws(() => session.game.serialize(), /cannot be saved/);
  assert.equal(voyage.serialize(), original);
  const retry = resetTestSession(session);
  assert.notEqual(retry.game, session.game);
  assert.deepEqual(retry.config, session.config);
  assert.equal(retry.game.state.systemId, ORIGIN);
  assert.equal(retry.game.state.mode, 'person');
  assert.equal(retry.game.state.credits, 500);
  assert.equal(retry.game.state.cargo.ore, 12);
  assert.deepEqual(retry.game.state.upgrades, {});
  assert.equal(retry.game.state.stats.jumps, 0);
  assert.equal(retry.game.state.stats.time, 0);
  assert.deepEqual(foldDriveTestState(retry).attempts, []);
  assert.equal(testSessionStatus(retry).complete, false);
  assert.equal(voyage.serialize(), original);
});

test('the diagnostic expectation catches jump gates wrongly bypassed by the production readiness query', () => {
  for (const [foldCase, targetId, expectedCode] of [
    ['no-drive', NEARBY, 'hyperdrive'],
    ['fuel', NEARBY, 'fuel'],
    ['range', DISTANT, 'range'],
    ['docked', NEARBY, 'mode']
  ]) {
    const session = exercise(foldCase), game = session.game;
    const ordinaryReadiness = game.travelInfo.bind(game);
    // Emulate a real regression in the query Game.travel consults. The test
    // expectation must come from the fixture contract, not this broken query.
    game.travelInfo = id => id === targetId ? {
      ok: true,
      target: game.galaxy.find(system => system.id === id),
      distance: id === DISTANT ? 8 : 4,
      fuelCost: id === DISTANT ? 8 : 5,
      range: game.state.ship.warpRange
    } : ordinaryReadiness(id);
    const result = game.travel(targetId);
    assert.equal(result.ok, true, 'The deliberately broken native query must actually allow the bad jump.');
    const model = foldDriveTestState(session);
    assert.equal(model.lastAttempt.expected.ok, false, foldCase);
    assert.equal(model.lastAttempt.expected.code, expectedCode, foldCase);
    assert.equal(model.lastAttempt.actual.ok, true, foldCase);
    assert.equal(model.lastAttempt.passed, false, foldCase);
    assert.equal(model.phase, 'failed', foldCase);
    assert.equal(model.complete, false, 'An incorrect success must never satisfy a rejection exercise.');
  }
});

test('the diagnostic expectation catches missing calibration wrongly permitted by the production upgrade query', () => {
  const session = exercise('calibration'), game = session.game;
  const ordinaryReadiness = game.upgradeInfo.bind(game);
  game.upgradeInfo = id => id === 'fold_1'
    ? { ok: true, upgrade: UPGRADES.find(upgrade => upgrade.id === 'fold_1') }
    : ordinaryReadiness(id);
  const result = game.buyUpgrade('fold_1');
  assert.equal(result.ok, true);
  assert.equal(game.hasFlag('belt_signal_found'), false);
  assert.ok(game.state.upgrades.fold_1, 'The injected regression must reach the actual equipment mutation.');
  const model = foldDriveTestState(session);
  assert.equal(model.lastAttempt.expected.ok, false);
  assert.equal(model.lastAttempt.expected.code, 'story');
  assert.equal(model.lastAttempt.actual.ok, true);
  assert.equal(model.lastAttempt.passed, false);
  assert.equal(model.phase, 'failed');
  assert.equal(model.complete, false);
});

test('an incorrect native fuel quote cannot make a free jump pass the observed debit check', () => {
  const session = exercise(), game = session.game, fuelBefore = game.state.ship.fuel;
  const ordinaryReadiness = game.travelInfo.bind(game);
  game.travelInfo = id => {
    const quote = ordinaryReadiness(id);
    return quote.ok ? { ...quote, fuelCost: 0 } : quote;
  };
  ok(game.travel(NEARBY));
  assert.equal(game.state.systemId, NEARBY);
  assert.equal(game.state.ship.fuel, fuelBefore, 'The deliberately wrong quote was used by real Game.travel.');
  const model = foldDriveTestState(session), debit = model.lastAttempt.observations.find(item => item.label === 'Fuel after jump');
  assert.ok(debit);
  assert.equal(debit.expected, fuelBefore - 5);
  assert.equal(debit.actual, fuelBefore);
  assert.equal(debit.passed, false);
  assert.equal(model.lastAttempt.actual.ok, true);
  assert.equal(model.lastAttempt.passed, false);
  assert.equal(model.phase, 'failed');
  assert.equal(model.complete, false);
});

test('completed evidence survives the bounded attempt history without counting later rejections as new progress', () => {
  const session = exercise(), game = session.game;
  ok(game.travel(NEARBY));
  ok(game.travel(ORIGIN));
  assert.equal(testSessionStatus(session).complete, true);
  for (let index = 0; index < 65; index++) assert.equal(game.travel(ORIGIN).code, 'same-system');
  const model = foldDriveTestState(session);
  assert.equal(model.attempts.length, 60);
  assert.ok(model.attempts.every(item => item.actual.code === 'same-system'));
  assert.equal(model.complete, true, 'Dropping an old report row must not forget a completed leg.');
  assert.ok(model.checks.every(item => item.complete));
  assert.equal(game.state.stats.jumps, 2);
});

test('a thrown native check is recorded as a failure and its diagnostic panel remains readable', () => {
  for (const kind of ['travel', 'upgrade']) {
    const session = exercise(kind === 'travel' ? 'round-trip' : 'calibration'), game = session.game;
    if (kind === 'travel') game.travelInfo = () => { throw new Error('Injected jump failure'); };
    else game.upgradeInfo = () => { throw new Error('Injected equipment failure'); };
    const result = kind === 'travel' ? game.travel(NEARBY) : game.buyUpgrade('fold_1');
    assert.equal(result.code, 'exception');
    const model = foldDriveTestState(session);
    assert.equal(model.phase, 'failed');
    assert.equal(model.complete, false);
    assert.equal(model.lastAttempt.passed, false);
    assert.equal(model.lastAttempt.actual.code, 'exception');
    const check = kind === 'travel' ? model.destinations.find(item => item.id === NEARBY) : model.upgrades.find(item => item.id === 'fold_1');
    assert.equal(check.code, 'exception');
    assert.match(check.reason, /Injected/);
  }
});
