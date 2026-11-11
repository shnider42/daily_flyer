import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { STARTER_SHIP_IDS } from '../dist/fleet.mjs';
import { OPENING_JOB_ID, OPENING_BELT_DISTANCE, openingContactId, isOpeningMiningRock } from '../dist/opening-mission.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const create = (options = {}) => new Game('opening-evidence', { openingMission: true, ...options });
const map = game => generateSurface(game.currentBody, game.state.seed, game.state.flags);
function at(game, id) {
  const entity = map(game).entities.find(value => value.id === id); assert.ok(entity, id);
  Object.assign(game.state.person, { x: entity.x, y: entity.y }); return entity;
}
function accept(game) {
  const id = openingContactId(game.state.openingMission.originBody); at(game, id);
  return ok(game.openingAction('accept', { entityId: id }));
}
function repair(game, { entityId = game.state.openingMission.relayId, job = null } = {}) {
  at(game, entityId);
  // The browser's validated relay puzzle calls this rule, then pays the normal
  // one-use relay wage. Shared puzzle validation is covered by authority tests.
  const result = ok(game.recordActivity('work', { token: `${entityId}:${job?.id || 'once'}`, role: 'repair', kind: 'repair' }));
  if (result.first) game.state.credits += 12;
  return result;
}
function mineRock(game, preferred) {
  const rock = preferred || game.system.asteroids.find(value => value.hp > 0 && isOpeningMiningRock(game, value)); assert.ok(rock);
  Object.assign(game.state.ship, { x: rock.x, y: rock.y, vx: 0, vy: 0 });
  for (let step = 0; rock.hp > 0 && step < 100; step++) game._mine(.1);
  assert.equal(rock.hp, 0); return rock;
}
function collectOre(game) {
  ok(game.quickLaunch());
  for (let index = 0; game.state.openingMission.oreMined < 2 && index < 3; index++) mineRock(game);
  assert.equal(game.state.openingMission.oreMined, 2);
}
function dock(game, id = 'kettle') {
  const body = game.system.bodies.find(value => value.id === id);
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 75, vx: 0, vy: 0 });
  ok(game.dock(id));
}
function finish(game) { at(game, 'kettle:dockworker'); return game.openingAction('finish', { entityId: 'kettle:dockworker' }); }
function passage(game, bodyId) {
  const result = ok(game.takePassengerTransit(bodyId));
  game.observeOpeningAction('takePassengerTransit', { bodyId }, result); return result;
}

test('opening is opt-in and every chosen regular starter begins at the actual Kettle berth and surface spawn', () => {
  for (const value of [undefined, false, 'true', 1]) {
    const game = new Game('ordinary-start', { openingMission: value });
    assert.equal(game.state.mode, 'ship'); assert.equal(game.state.locationId, null); assert.equal(game.openingMissionStatus().active, false);
  }
  for (const starterShip of STARTER_SHIP_IDS) {
    const game = create({ starterShip }), surface = map(game), body = game.currentBody;
    assert.equal(game.state.mode, 'person'); assert.equal(body.id, 'kettle'); assert.equal(game.state.ship.classId, starterShip);
    assert.deepEqual({ x: game.state.person.x, y: game.state.person.y }, surface.spawn);
    assert.ok(isWalkable(surface, game.state.person.x, game.state.person.y));
    assert.equal(game.canUseOwnShipHere(), true); assert.equal(game.state.ship.y, body.y + body.radius + 75);
    assert.equal(game.state.credits, 180); assert.deepEqual(game.state.cargo, { ore: 0, crystal: 0 });
    assert.equal(game.openingMissionStatus().target.entityId, 'kettle:dockworker');
  }
});

test('Hardcore introduction preserves the ordinary shipless start and economy', () => {
  const game = create({ startMode: 'hardcore' }), ordinary = new Game('opening-evidence', { startMode: 'hardcore' });
  for (const key of ['credits', 'ship', 'fleet', 'person', 'cargo', 'upgrades']) assert.deepEqual(game.state[key], ordinary.state[key], key);
  assert.equal(game.state.locationId, 'morrow'); assert.equal(game.ownsShip, false); assert.equal(game.hasActiveVessel, false);
  assert.equal(game.openingMissionStatus().target.entityId, 'morrow:courier');
});

test('acceptance requires the real named contact, port, healthy person and physical range', () => {
  const game = create(), before = game.state.credits;
  assert.equal(game.openingAction('accept', { entityId: 'kettle:dockworker' }).code, 'distance');
  at(game, 'kettle:dockworker');
  assert.equal(game.openingAction('accept', { entityId: 'kettle:story' }).code, 'entity');
  game.state.person.down = true; assert.equal(game.openingAction('accept', { entityId: 'kettle:dockworker' }).ok, false); delete game.state.person.down;
  ok(game.openingAction('accept', { entityId: 'kettle:dockworker' }));
  assert.equal(game.openingMissionStatus().stageId, 'repair'); assert.equal(game.state.credits, before);
  assert.equal(game.openingAction('accept', { entityId: 'kettle:dockworker' }).code, 'duplicate');
  assert.equal(game.openingAction('advance', { stage: 'return' }).code, 'action');
});

test('only a successful real repair at the marked relay advances the first job', () => {
  const game = create(); accept(game);
  assert.equal(game.observeOpeningAction('surfaceAction', { entityId: game.state.openingMission.relayId, action: 'repair' }, { ok: true, first: true }), false);
  const other = map(game).entities.find(value => value.type === 'work' && value.id !== game.state.openingMission.relayId);
  repair(game, { entityId: other.id }); assert.equal(game.openingMissionStatus().stageId, 'repair');
  const before = game.state.credits, result = repair(game);
  assert.equal(result.first, true); assert.equal(game.openingMissionStatus().stageId, 'ore');
  assert.equal(game.state.credits, before + 12); assert.equal(game.state.stats.jobs, 0);
  assert.equal(game.observeOpeningAction('surfaceAction', { entityId: game.state.openingMission.relayId, action: 'repair' }, result), false);
  const after = game.state.credits; assert.equal(repair(game).first, false); assert.equal(game.state.credits, after);
});

test('real pre-acceptance relay work is acknowledged once, including normal maintenance tokens', () => {
  for (const acceptedWork of [false, true]) {
    const game = create();
    const job = acceptedWork ? game.availableJobs().find(value => value.type === 'work') : null;
    if (job) ok(game.acceptJob(job.id));
    repair(game, { job }); assert.equal(game.openingMissionStatus().stageId, 'meet');
    const credits = game.state.credits; accept(game);
    assert.equal(game.openingMissionStatus().stageId, 'ore'); assert.equal(game.state.credits, credits);
    assert.equal(game.state.openingMission.oreMined, 0);
    if (job) assert.equal(game.state.missions.find(value => value.id === job.id).progress, 1);
  }
});

test('regular opening requires newly mined ore and pays once only after the own hull returns', () => {
  const game = create();
  ok(game.quickLaunch()); mineRock(game); const earlyOre = game.state.stats.oreMined; assert.ok(earlyOre > 0);
  dock(game); accept(game); repair(game);
  assert.equal(game.state.openingMission.oreMined, 0); assert.equal(game.openingMissionStatus().stageId, 'ore');
  assert.equal(finish(game).ok, false, 'Existing cargo alone is not mining evidence.');
  collectOre(game); assert.equal(game.openingMissionStatus().stageId, 'return');
  dock(game, 'morrow'); passage(game, 'kettle');
  assert.equal(finish(game).code, 'ship-location', 'A ferry does not bring the delivery hull and its ore.');
  passage(game, 'morrow'); ok(game.quickLaunch()); dock(game);
  const credits = game.state.credits, ore = game.state.cargo.ore; ok(finish(game));
  assert.equal(game.state.credits, credits + 35); assert.equal(game.state.cargo.ore, ore - 2);
  assert.equal(game.state.stats.jobs, 1); assert.ok(game.hasFlag('first_job')); assert.ok(game.hasFlag('completed_job'));
  assert.equal(game.state.completedJobs.filter(value => value === OPENING_JOB_ID).length, 1);
  assert.equal(game.state.missions.filter(value => value.id === OPENING_JOB_ID).length, 1);
  assert.equal(game.state.completedChapters.length, 0, 'No mechanic conversation or unrelated story milestone is fabricated.');
  assert.equal(finish(game).ok, false); assert.equal(game.state.credits, credits + 35);
});

test('regular mining evidence excludes ship proxies, passengers, and NPC employers', () => {
  const game = create(); accept(game); repair(game); ok(game.quickLaunch());
  const source = game.system.asteroids.find(value => isOpeningMiningRock(game, value)); assert.ok(source);
  const proxy = Game.fromSave(game.save()); proxy.netVesselId = 'proxy-hull';
  assert.equal(proxy.recordOpeningMining(2, source), false); assert.equal(proxy.state.openingMission.oreMined, 0);
  game.state.multiplayer = { serverAuthoritative: true, ownedVesselId: game.state.ship.id, aboardVesselId: 'another-hull' };
  assert.equal(game.recordOpeningMining(2, source), false);
  game.state.multiplayer.aboardVesselId = game.state.ship.id; game.state.mode = 'person';
  assert.equal(game.recordOpeningMining(2, source), false);
  game.state.mode = 'ship'; game.state.npcContract = { active: true };
  assert.equal(game.recordOpeningMining(2, source), false); delete game.state.npcContract;
  assert.equal(game.recordOpeningMining(2), false, 'A missing source cannot claim belt ore.');
  const inside = game.system.asteroids.find(value => value.id !== source.id);
  // The expanded generated field is farther out. Put a real rock beside the
  // berth to exercise the rule independently of this seed's field spacing.
  Object.assign(inside, { x: 100, y: 100 });
  assert.equal(game.recordOpeningMining(2, { ...inside, x: 2000, y: 2000 }), false, 'Supplied coordinates cannot replace the actual rock.');
  assert.equal(game.recordOpeningMining(2, source), true); assert.equal(game.state.openingMission.oreMined, 2);
});

test('all three starters must fly to the expanded field, while any berth-side ore remains ordinary cargo', () => {
  for (const starterShip of STARTER_SHIP_IDS) {
    const game = create({ starterShip }); accept(game); repair(game); ok(game.quickLaunch());
    const launch = { x: game.state.ship.x, y: game.state.ship.y }, target = game.openingMissionStatus().target;
    assert.equal(target.kind, 'asteroid'); assert.ok(target.radius > 0);
    const kettle = game.system.bodies.find(body => body.id === 'kettle');
    assert.ok(Math.hypot(target.x - kettle.x, target.y - kettle.y) - target.radius >= OPENING_BELT_DISTANCE);
    assert.equal(game.openingMissionStatus().miningInRange, false);
    for (let step = 0; step < 60; step++) game._mine(.1);
    assert.equal(game.state.cargo.ore, 0, 'The mining beam cannot reach the expanded field from the launch berth.');
    const dockside = game.system.asteroids.find(value => value.id !== target.entityId);
    Object.assign(dockside, { x: launch.x + 50, y: launch.y, hp: dockside.maxHp });
    for (let step = 0; step < 100 && dockside.hp > 0; step++) game._mine(.1);
    assert.ok(game.state.cargo.ore > 0, `${starterShip} still receives its actual dockside ore.`);
    assert.ok(game.state.stats.oreMined > 0); assert.equal(game.state.openingMission.oreMined, 0);
    assert.deepEqual({ x: game.state.ship.x, y: game.state.ship.y }, launch);
    const rock = game.system.asteroids.find(value => value.id === target.entityId);
    Object.assign(game.state.ship, { x: rock.x, y: rock.y });
    assert.equal(game.openingMissionStatus().miningInRange, true);
    mineRock(game, rock); assert.ok(game.state.openingMission.oreMined > 0);
  }
});

test('the mining hint follows the real nearest target rather than a farther marked qualifying rock', () => {
  const game = create(); accept(game); repair(game); ok(game.quickLaunch());
  const [near, outer] = game.system.asteroids;
  for (const rock of game.system.asteroids) rock.hp = 0;
  Object.assign(near, { x: 590, y: 0, radius: 20, hp: 10, ore: 1 });
  Object.assign(outer, { x: 660, y: 0, radius: 20, hp: 10, ore: 2 });
  Object.assign(game.state.ship, { x: 610, y: 0 });
  assert.equal(isOpeningMiningRock(game, near), false); assert.equal(isOpeningMiningRock(game, outer), true);
  assert.equal(game.openingMissionStatus().target.entityId, outer.id);
  assert.equal(game.openingMissionStatus().miningInRange, false, 'The closer berth-side rock would receive the beam.');
  game._mine(.1); assert.ok(near.hp < 10); assert.equal(outer.hp, 10);
  game.state.ship.x = outer.x;
  assert.equal(game.openingMissionStatus().miningInRange, true);
  game._mine(.1); assert.ok(outer.hp < 10);
});

test('Hardcore uses a new paid Morrow-to-Kettle ferry receipt, earns wages and remains shipless', () => {
  const game = create({ startMode: 'hardcore' });
  const oldReceipt = passage(game, 'kettle'); passage(game, 'morrow');
  accept(game); repair(game); assert.equal(game.openingMissionStatus().stageId, 'passage');
  assert.equal(game.observeOpeningAction('takePassengerTransit', { bodyId: 'kettle' }, { ok: true, receipt: { id: 'invented' } }), false);
  assert.equal(game.observeOpeningAction('takePassengerTransit', { bodyId: 'kettle' }, oldReceipt), false);
  const fare = game.passengerQuote('kettle').fare, credits = game.state.credits;
  passage(game, 'kettle'); assert.equal(game.state.credits, credits - fare); assert.equal(game.openingMissionStatus().stageId, 'return');
  ok(finish(game)); assert.equal(game.state.credits, credits - fare + 35);
  assert.equal(game.ownsShip, false); assert.equal(game.hasActiveVessel, false); assert.deepEqual(game.state.fleet.owned, []);
  assert.equal(game.state.stats.jobs, 1); assert.equal(game.chapter.id, 'earn_first_ship');
  assert.equal(game.state.completedChapters.length, 0); assert.equal(finish(game).ok, false);
});

test('a depleted marker retargets another real rock and an exhausted field offers a guarded relay-report fallback', () => {
  const game = create(); accept(game); repair(game);
  const first = game.openingMissionStatus().target;
  assert.equal(first.kind, 'asteroid'); game.system.asteroids.find(value => value.id === first.entityId).hp = 0;
  assert.notEqual(game.openingMissionStatus().target.entityId, first.entityId);
  const dockside = game.system.asteroids.find(value => value.id !== first.entityId);
  Object.assign(dockside, { x: 100, y: 100, hp: dockside.maxHp });
  for (const rock of game.system.asteroids) if (isOpeningMiningRock(game, rock)) rock.hp = 0;
  assert.ok(game.system.asteroids.some(rock => rock.hp > 0 && rock.ore > 0), 'Berth-side ore remains ordinary usable cargo.');
  assert.equal(game.openingMissionStatus().stageId, 'return'); assert.equal(game.openingMissionStatus().target.entityId, 'kettle:dockworker');
  const credits = game.state.credits, ore = game.state.cargo.ore; at(game, 'kettle:dockworker');
  assert.equal(game.openingMissionStatus().fallbackAvailable, true); assert.equal(game.openingMissionStatus().canFinish, true);
  const rock = game.system.asteroids.find(value => isOpeningMiningRock(game, value)); rock.hp = 1;
  assert.equal(finish(game).ok, false, 'Completion rechecks the actual field after UI status was read.');
  rock.hp = 0; const result = ok(finish(game)); assert.equal(result.oreCost, 0);
  assert.equal(game.state.credits, credits + 35); assert.equal(game.state.cargo.ore, ore); assert.equal(game.state.openingMission.outcome, 'relay-report');
});

test('missing geometry is unknown; server view projection can explain fallback but cannot authorize payment', () => {
  const game = create(); accept(game); repair(game); at(game, 'kettle:dockworker');
  game._runtime.asteroids = [];
  assert.equal(game.openingMissionStatus().fallbackAvailable, false); assert.equal(game.openingMissionStatus().stageId, 'ore');
  game.state.openingMissionAvailability = { id: 'small-favor', systemId: 'hearth', oreFieldExhausted: true };
  assert.equal(game.openingMissionStatus().fallbackAvailable, false, 'A local flag is not authority metadata.');
  game.state.multiplayer = { serverAuthoritative: true, ownedVesselId: game.state.ship.id, aboardVesselId: null };
  assert.equal(game.openingMissionStatus().fallbackAvailable, true); assert.equal(game.openingMissionStatus().canFinish, true);
  const credits = game.state.credits; assert.equal(finish(game).code, 'requirements'); assert.equal(game.state.credits, credits);
});

test('shared view uses own-hull facts while finish ignores forged projections and respects canonical berth authority', () => {
  const game = create(); accept(game); repair(game); collectOre(game); dock(game); at(game, 'kettle:dockworker');
  game.state.multiplayer = { serverAuthoritative: true, ownedVesselId: game.state.ship.id, aboardVesselId: null };
  game.state.openingMissionAvailability = { id: 'small-favor', systemId: 'hearth', oreAvailable: 2, ownShipHere: true, oreFieldExhausted: false };
  game.state.cargo.ore = 0;
  assert.equal(game.openingMissionStatus().stageId, 'return'); assert.equal(game.openingMissionStatus().oreAvailable, 2);
  assert.equal(game.openingMissionStatus().canFinish, true);
  const credits = game.state.credits;
  assert.equal(finish(game).code, 'requirements', 'Display-only cargo cannot supply a delivery.');
  game.state.cargo.ore = 2; game.openingOwnShipHere = () => false;
  assert.equal(finish(game).code, 'ship-location', 'Canonical hull location overrides a coincident local pose.');
  assert.equal(game.state.credits, credits); assert.equal(game.state.cargo.ore, 2);
  game.openingOwnShipHere = () => true;
  game.state.openingMissionAvailability.oreAvailable = 0;
  assert.equal(game.openingMissionStatus().stageId, 'ore', 'The display also honors an authoritative zero own-hull balance.');
  ok(finish(game)); assert.equal(game.state.credits, credits + 35);
});

test('Hardcore restores a completed crossing and ordinary maintenance tokens remain valid after accepting the favor', () => {
  let game = create({ startMode: 'hardcore' }); accept(game);
  const job = game.availableJobs().find(value => value.type === 'work'); ok(game.acceptJob(job.id));
  repair(game, { job }); assert.equal(game.openingMissionStatus().stageId, 'passage');
  passage(game, 'kettle'); const receipt = game.state.openingMission.passageId;
  game = Game.fromSave(game.serialize());
  assert.equal(game.openingMissionStatus().stageId, 'return'); assert.equal(game.state.openingMission.passageId, receipt);
  const stateBefore = JSON.stringify(game.state);
  for (let index = 0; index < 8; index++) game.openingMissionStatus();
  assert.equal(JSON.stringify(game.state), stateBefore, 'HUD queries do not advance or rewrite persisted progress.');
  ok(finish(game)); assert.equal(game.ownsShip, false); assert.equal(game.state.missions.find(value => value.id === job.id).progress, 1);
});

test('mission state survives each important interruption without relocating or repaying the captain', () => {
  let game = create(); accept(game); repair(game); ok(game.quickLaunch());
  const oneOre = game.system.asteroids.find(value => value.ore === 1 && isOpeningMiningRock(game, value)); assert.ok(oneOre); mineRock(game, oneOre);
  const pose = { x: game.state.ship.x, y: game.state.ship.y };
  game = Game.fromSave(game.serialize());
  assert.equal(game.state.mode, 'ship'); assert.deepEqual({ x: game.state.ship.x, y: game.state.ship.y }, pose);
  assert.equal(game.state.openingMission.oreMined, 1); assert.equal(game.openingMissionStatus().stageId, 'ore');
  mineRock(game); dock(game); ok(finish(game)); const credits = game.state.credits;
  game = Game.fromSave(game.serialize()); assert.equal(game.openingMissionStatus().active, false);
  assert.equal(game.state.credits, credits); assert.equal(game.state.stats.jobs, 1); assert.equal(finish(game).ok, false);
  const legacy = game.save(); delete legacy.openingMission;
  const restored = Game.fromSave(legacy); assert.equal(restored.openingMissionStatus().active, false); assert.equal(restored.state.locationId, legacy.locationId);
});

test('skip is available anywhere and retires only the assignment without grants or teleports', () => {
  const game = create({ startMode: 'hardcore' }); accept(game); repair(game);
  game.state.person.down = true; game.state.person.health = 0;
  const before = game.save(); ok(game.openingAction('skip'));
  const after = game.save(); delete before.openingMission; delete after.openingMission;
  assert.deepEqual(after, before); assert.equal(game.openingMissionStatus().active, false);
  assert.equal(game.openingAction('accept', { entityId: 'morrow:courier' }).code, 'inactive');
  assert.equal(Game.fromSave(game.save()).state.openingMission.status, 'skipped');
});
