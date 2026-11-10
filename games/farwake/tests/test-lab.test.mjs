import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { SHIP_CLASSES, enemyHullProfile } from '../dist/fleet.mjs';
import { cabinLayout, isCabinWalkable } from '../dist/interior-layouts.mjs';
import { DAMAGE_CONTROL_ACTIONS } from '../dist/interior-damage.mjs';
import { TEST_SCENARIOS, unlockTestMode, testEnemyChoices, createTestSession, resetTestSession, testSessionStatus } from '../dist/test-lab.mjs';

function frames(game, input = {}, count = 60) { for (let index = 0; index < count; index++) game.step(1 / 60, input); }

// A small, deliberately limited catalogue is a product boundary, not just a UI filter.
test('test mode accepts its requested code and exposes only the smaller half of the hulls', () => {
  assert.equal(unlockTestMode('123'), true);
  for (const wrong of ['', '12', '1234', 'password', 123, null]) assert.equal(unlockTestMode(wrong), false);
  const choices = testEnemyChoices();
  const bySize = [...SHIP_CLASSES].sort((a, b) => a.stats.renderLength * a.stats.renderWidth - b.stats.renderLength * b.stats.renderWidth);
  const cutoff = Math.max(1, Math.floor(SHIP_CLASSES.length / 2));
  assert.deepEqual(choices.map(choice => choice.id), bySize.slice(0, cutoff).map(hull => hull.id));
  assert.deepEqual(Object.keys(choices[0]).sort(), ['berths', 'id', 'name', 'renderLength', 'renderWidth', 'subtitle'].sort());
  for (const hidden of bySize.slice(cutoff)) assert.throws(() => createTestSession({ enemyClassId: hidden.id }), /not available in test mode/);
  for (const hidden of bySize.slice(cutoff)) assert.throws(() => createTestSession({ scenario: 'damage-control', enemyClassId: hidden.id }), /not available in test mode/);
  assert.throws(() => createTestSession({ enemyClassId: 'made-up-hull' }), /not available in test mode/);
  assert.throws(() => createTestSession({ scenario: 'unlock-everything' }), /available test exercises/);
});

test('exercises cannot save, mutate a normal voyage, unlock story, or leave their anonymous range', () => {
  const voyage = new Game('untouched-voyage');
  voyage.state.credits = 317;
  const original = voyage.serialize();
  const exercise = createTestSession({ scenario: 'ship-combat', seed: 'isolated' });
  const { game } = exercise;
  assert.notEqual(game, voyage);
  assert.equal(game.chapter, null);
  assert.equal(game.galaxy.length, 1);
  assert.equal(game.currentSystem.name, 'Test range');
  assert.equal(game.state.journal.length, 0);
  assert.equal(game.state.knownLore.length, 0);
  assert.equal(game.state.crew.length, 0);
  assert.equal(game.hasHyperdrive, false);
  assert.deepEqual(game.state.fleet.owned, [SHIP_CLASSES[0].id]);
  assert.equal(game.travel('hearth').ok, false);
  assert.equal(game.triggerEncounter().ok, false);
  assert.deepEqual(game.availableJobs(), []);
  assert.throws(() => game.save(), /cannot be saved/);
  assert.throws(() => game.serialize(), /cannot be saved/);
  frames(game, {}, 300);
  assert.equal(game.state.completedChapters.length, 0);
  assert.equal(game.state.pendingEncounter, null);
  assert.equal(voyage.serialize(), original);
  const retry = resetTestSession(exercise);
  assert.notEqual(retry.game, game);
  assert.deepEqual(retry.config, exercise.config);
  assert.equal(retry.game.state.stats.time, 0);
  assert.equal(retry.game.state.ship.hull, retry.game.state.ship.maxHull);
  assert.equal(retry.game.state.crew.length, 0);
  assert.equal(voyage.serialize(), original);
});

test('ship-combat exercise uses real pulses and a size-matched target with honest boarding eligibility', () => {
  for (const hull of testEnemyChoices()) {
    const session = createTestSession({ scenario: 'ship-combat', enemyClassId: hull.id });
    const { game } = session, enemy = game.system.enemies[0], profile = enemyHullProfile(hull.id);
    for (const key of ['classId', 'interiorClassId', 'radius', 'renderLength', 'renderWidth']) assert.equal(enemy[key], profile[key]);
    assert.equal(enemy.boardable,hull.berths>=3);
    assert.equal(testSessionStatus(session).complete, false);
    const initialHp = enemy.hp;
    // Hold the exercise target still to isolate the ordinary swept-pulse collision.
    enemy.speed = 0; enemy.cooldown = 999;
    for (let index = 0; index < 300 && !enemy.disabled && enemy.hp > 0; index++) game.step(1 / 60, { fire: true });
    assert.ok(enemy.hp < initialHp);
    assert.ok(enemy.disabled, 'controlled pulses reach the disabled threshold before destroying the hull');
    assert.equal(testSessionStatus(session).complete, true);
    assert.equal(testSessionStatus(session).title, 'Target disabled');
  }
});

test('boarding exercises enter the selected hull through the real boarding rules without allied kills', () => {
  for (const hull of testEnemyChoices().filter(hull=>hull.berths>=3)) {
    const session = createTestSession({ scenario: 'boarding', enemyClassId: hull.id });
    const { game } = session;
    assert.equal(game.state.mode, 'ship');
    assert.equal(game.interact().type, 'board');
    assert.equal(game.boardEnemy(session.targetId).ok, true);
    assert.equal(game.state.mode, 'person');
    assert.equal(game.state.boarding.shipClass, hull.id);
    assert.equal(game.currentBody.shipClass, hull.id);
    assert.deepEqual(game.state.boarding.allies, []);
    const health = game.state.boarding.enemies.map(actor => actor.health);
    frames(game, {}, 30);
    assert.deepEqual(game.state.boarding.enemies.map(actor => actor.health), health);
    assert.equal(testSessionStatus(session).phase, 'active');
    assert.ok(testSessionStatus(session).enemiesRemaining > 0);
  }
});

test('person-combat starts inside the target and raid-defense reaches the ordinary pirate grapple', () => {
  const person = createTestSession({ scenario: 'person-combat' });
  assert.equal(person.game.state.mode, 'person');
  assert.equal(person.game.state.boarding.kind, 'assault');
  assert.equal(person.game.state.boarding.targetId, person.targetId);
  assert.equal(person.game.state.boarding.phase, 'active');
  assert.deepEqual(person.game.state.boarding.allies, []);
  const raid = createTestSession({ scenario: 'raid-defense' });
  assert.equal(raid.game.state.mode, 'ship');
  assert.equal(raid.game.state.ship.shield, 0);
  for (let index = 0; index < 240 && !raid.game.state.boarding; index++) raid.game.step(1 / 60, {});
  assert.equal(raid.game.state.mode, 'person');
  assert.equal(raid.game.state.boarding?.kind, 'defense');
  assert.equal(raid.game.state.ship.classId,'tern');
  assert.equal(raid.game.state.boarding?.shipClass,'tern');
  assert.equal(testSessionStatus(raid).phase, 'active');
});

test('goal summaries preserve a completed boarding after leaving the deck and report an ordinary rescue', () => {
  const session = createTestSession({ scenario: 'person-combat' });
  const { game } = session;
  game._finishBoarding('won');
  assert.equal(testSessionStatus(session).complete, true);
  game.state.boarding = null;
  assert.equal(testSessionStatus(session).complete, true);
  game._rescue('Exercise recovery.');
  assert.equal(testSessionStatus(session).phase, 'failed');
  assert.equal(game.state.pendingEncounter, null);
  assert.equal(game.state.completedChapters.length, 0);
});

test('damage-control practice begins on the starter deck and receives one real, delayed external impact', () => {
  const voyage = new Game('damage-practice-untouched'), original = voyage.serialize();
  const session = createTestSession({ scenario: 'damage-control', enemyClassId: testEnemyChoices().at(-1).id });
  const { game } = session, ship = game.state.ship;
  assert.equal(ship.classId, 'sparrow');
  assert.equal(session.enemyClassId, 'sparrow');
  assert.equal(session.targetId, null);
  assert.equal(game.state.mode, 'person');
  assert.equal(game.state.interior.kind, 'ship');
  assert.equal(game.currentBody.vesselId, ship.id);
  assert.equal(game.system.enemies.length, 0);
  assert.equal(game.state.cargo.ore, 6);
  assert.equal(ship.energy, ship.maxEnergy);
  assert.equal(testSessionStatus(session).phase, 'ready');
  frames(game, {}, 120);
  assert.equal(ship.hull, ship.maxHull);
  assert.equal(ship.damageControl.serial, 0);
  frames(game, {}, 120);
  assert.equal(ship.hull, ship.maxHull - 18);
  assert.equal(ship.damageControl.serial, 1);
  assert.equal(game.state.person.health, 100, 'The captain begins safely away from the controlled impact.');
  const section = ship.damageControl.sections.find(item => item.breach > 0), layout = cabinLayout(ship.classId);
  assert.ok(section);
  assert.ok(section.fire > 0 && section.damage > 0);
  assert.ok(isCabinWalkable(layout, section.x, section.y));
  assert.equal(testSessionStatus(session).sectionId, section.id);
  assert.equal(testSessionStatus(session).action, 'suppress');
  assert.ok(game.drainEvents().some(event => event.type === 'hit' && event.vesselId === ship.id));
  frames(game, {}, 1800);
  assert.equal(ship.damageControl.serial, 1, 'The exercise never repeats its attack.');
  assert.equal(ship.hull, ship.maxHull - 18);
  assert.equal(game.state.pendingEncounter, null);
  assert.deepEqual(game.state.completedChapters, []);
  assert.throws(() => game.save(), /cannot be saved/);
  assert.equal(voyage.serialize(), original);
});

test('damage-control guidance follows actual suppression, patching, and repairs before completing', () => {
  const session = createTestSession({ scenario: 'damage-control' }), { game } = session;
  frames(game, {}, 240);
  const ship = game.state.ship, section = ship.damageControl.sections.find(item => item.breach > 0);
  assert.equal(game.damageControl(section.id, 'suppress').code, 'distance');
  assert.equal(testSessionStatus(session).complete, false);
  Object.assign(game.state.person, { x: section.x, y: section.y });
  let oreSpent = 0;
  for (const action of ['suppress', 'patch', 'repair']) {
    const spec = DAMAGE_CONTROL_ACTIONS[action];
    assert.equal(testSessionStatus(session).action, action);
    while (section[spec.field] > .1) {
      const energy = ship.energy, ore = game.state.cargo.ore;
      assert.equal(game.damageControl(section.id, action).ok, true);
      assert.equal(ship.energy, energy - spec.energy);
      assert.equal(game.state.cargo.ore, ore - spec.ore);
      oreSpent += spec.ore;
      frames(game, {}, 73);
    }
    if (action !== 'repair') assert.equal(testSessionStatus(session).complete, false);
  }
  assert.equal(testSessionStatus(session).title, 'Damage contained');
  assert.equal(testSessionStatus(session).complete, true);
  assert.ok(ship.damageControl.sections.every(item => item.fire === 0 && item.breach === 0 && item.damage === 0));
  assert.equal(game.state.cargo.ore, 6 - oreSpent);
  assert.equal(oreSpent, 3);
  assert.ok(game.state.person.health > 0, 'There is time to finish every repair using the real tool cooldown.');
  const beforeSummary = structuredClone(game.state);
  testSessionStatus(session);
  assert.deepEqual(game.state, beforeSummary, 'Reading the practice objective does not mutate the voyage.');
  const retry = resetTestSession(session);
  assert.equal(testSessionStatus(retry).phase, 'ready');
  assert.equal(retry.game.state.ship.damageControl.serial, 0);
  assert.equal(retry.game.state.ship.hull, retry.game.state.ship.maxHull);
  assert.equal(retry.game.state.cargo.ore, 6);
});

test('all advertised exercise choices produce a fresh playable setup and reject non-test resets', () => {
  for (const scenario of TEST_SCENARIOS) {
    const session = createTestSession({ scenario: scenario.id });
    assert.equal(session.scenario.id, scenario.id);
    assert.ok(session.goal.length > 20);
    assert.ok(testSessionStatus(session));
    assert.equal(session.game.state.person.health, 100);
    assert.equal(session.game.system.enemies.length, scenario.id === 'damage-control' ? 0 : 1);
  }
  assert.equal(testSessionStatus({ game: new Game('normal') }), null);
  assert.throws(() => resetTestSession({ game: new Game('normal') }), /test exercise first/);
});
