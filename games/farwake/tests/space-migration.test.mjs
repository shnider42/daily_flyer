import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, buildGalaxy } from '../dist/engine.mjs';
import { migrateGameSpace, migrateWorldSpace } from '../dist/space-migration.mjs';
import { systemBodyPosition } from '../dist/system-space.mjs';
import { systemCosmicBodies } from '../dist/galaxy-expansion.mjs';
import { cabinLayout } from '../dist/fleet.mjs';
import { findDerelict, placeRaider } from './helpers/combat-fixtures.mjs';
import { createSystemTraffic, captureTraffic } from '../dist/traffic.mjs';

const copy = value => structuredClone(value);
const pose = value => ({ x: value.x, y: value.y });
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const close = (actual, expected) => { assert.ok(Math.abs(actual.x - expected.x) < 1e-8, `${actual.x} != ${expected.x}`); assert.ok(Math.abs(actual.y - expected.y) < 1e-8, `${actual.y} != ${expected.y}`); };
function legacy(state) {
  delete state.spaceVersion;
  for (const record of Object.values(state.worlds || {})) delete record.spaceVersion;
  return state;
}
function portSave(seed = 'space-berth') {
  const raw = legacy(new Game(seed).save()); raw.worlds = {};
  Object.assign(raw, { mode: 'person', systemId: 'hearth', locationId: 'morrow', lastBodyId: 'morrow', interior: null });
  Object.assign(raw.ship, { x: 840, y: -420 + 122 + 75, vx: 0, vy: 0, hull: 67, fuel: 13 });
  raw.credits = 864; raw.stats.time = 1234; raw.cargo.ore = 7; raw.person.x = 444; raw.person.y = 555;
  return raw;
}

test('world migration moves only persisted space positions and is idempotent', () => {
  const deck = { enemies: [{ id: 'guard', x: 46, y: 98, health: 12 }], shot: { x: 40, y: 90 } };
  const record = { depleted: ['rock'], defeated: ['foe'], scanned: ['beacon'], enemyHealth: { foe: 32 },
    enemyStates: { foe: { x: 800, y: -900, vx: 22, vy: -5, deck: copy(deck) } },
    spawned: [{ id: 'foe', x: 800, y: -900, deck: copy(deck), reward: 0 }],
    parkedShips: [{ id: 'parked', x: -1000, y: 1200, crew: [{ x: 88, y: 64 }] }],
    pickups: [{ x: 600, y: 720, amount: 4 }], encounterContacts: { wreck: { id: 'wreck', signalId: 'signal', x: 1200, y: 1500, evacuated: true } },
    trafficStates: [{ id: 'traffic', routeTime: 42, routeKey: 'old-lane' }] };
  const before = copy(record); migrateWorldSpace(record);
  close(record.enemyStates.foe, { x: 2400, y: -2700 }); close(record.spawned[0], { x: 2400, y: -2700 });
  close(record.parkedShips[0], { x: -3000, y: 3600 }); close(record.pickups[0], { x: 1800, y: 2160 });
  close(record.encounterContacts.wreck, { x: 3600, y: 4500 });
  assert.deepEqual(record.enemyStates.foe.deck, deck); assert.deepEqual(record.parkedShips[0].crew, before.parkedShips[0].crew);
  assert.equal(record.enemyStates.foe.vx, 22); assert.equal(record.enemyStates.foe.vy, -5);
  for (const key of ['depleted', 'defeated', 'scanned', 'enemyHealth', 'trafficStates']) assert.deepEqual(record[key], before[key]);
  const once = copy(record); migrateWorldSpace(record); assert.deepEqual(record, once); assert.equal(record.spaceVersion, 1);
});

test('a legacy port save keeps its berth, surface pose, resources, and an immediately usable launch', () => {
  const raw = portSave(), original = copy(raw), game = Game.fromSave(raw), body = game.system.bodies.find(body => body.id === 'morrow');
  close(body, { x: 2520, y: -1260 }); close(game.state.ship, { x: body.x, y: body.y + body.radius + 75 });
  close(game.state.person, { x: 444, y: 555 }); assert.equal(game.canUseOwnShipHere(), true);
  assert.equal(game.state.ship.hull, 67); assert.equal(game.state.ship.fuel, 13); assert.equal(game.state.credits, 864); assert.equal(game.state.cargo.ore, 7); assert.equal(game.state.stats.time, 1234);
  assert.deepEqual(raw, original, 'Loading does not mutate an imported save.');
  const once = game.save(), again = Game.fromSave(once);
  close(again.state.ship, pose(game.state.ship)); assert.equal(again.state.spaceVersion, 1); ok(again.launch());
  close(again.state.ship, { x: body.x, y: body.y + body.radius + 75 });
});

test('a passenger’s personal ship stays at the remote berth until they actually return', () => {
  const raw = portSave('space-passenger'); raw.locationId = raw.lastBodyId = 'kettle';
  raw.livelihoods = { version: 1, parkedShip: { ...copy(raw.ship), vesselId: raw.ship.id, systemId: 'hearth', bodyId: 'morrow' }, transitSerial: 1, journeys: [] };
  const game = Game.fromSave(raw), body = game.system.bodies.find(body => body.id === 'morrow');
  close(game.state.ship, { x: body.x, y: body.y + body.radius + 75 });
  close(game.state.livelihoods.parkedShip, pose(game.state.ship)); assert.equal(game.canUseOwnShipHere(), false);
  assert.equal(game.launch().ok, false); ok(game.takePassengerTransit('morrow')); assert.equal(game.canUseOwnShipHere(), true); ok(game.launch());
});

test('a legacy hired watch keeps its employer, local work waypoint, personal berth and deck positions', () => {
  const game = new Game('space-watch'); ok(game.dock('kettle'));
  const offer = game.npcContractOffers().find(offer => offer.familyId === 'freight'); assert.ok(offer);
  ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId }));
  const raw = legacy(game.save()), job = raw.npcContract;
  // An established watch is already alongside Morrow, with a partly completed work order.
  job.origin = { ...job.origin, bodyId: 'kettle', x: 0, y: 0 };
  job.destination = { systemId: 'hearth', bodyId: 'morrow', name: 'Morrow', x: 840, y: -420, radius: 122 };
  job.dockPoint = { x: 130, y: 65 }; job.workPoint = { x: 840, y: -420 + 197 };
  job.phase = 'working'; job.dockedAt = null; job.clock = 53; job.phaseClock = 12;
  Object.assign(raw.ship, { x: job.workPoint.x + 16, y: job.workPoint.y - 8, vx: 2, vy: -3 });
  Object.assign(raw.interior.returnShip, pose(raw.ship));
  const personal = pose(job.personal.ship), deck = raw.crew.map(person => ({ id: person.id, ...pose(person) })), beforeWork = copy(job.work), assignment = copy(job.assignment);
  const restored = Game.fromSave(raw), actual = restored.state.npcContract;
  close(actual.origin, { x: 0, y: 0 }); close(actual.destination, { x: 2520, y: -1260 });
  close(actual.dockPoint, { x: 130, y: 65 }); close(actual.workPoint, { x: 2520, y: -1260 + 197 });
  close(restored.state.ship, { x: actual.workPoint.x + 16, y: actual.workPoint.y - 8 });
  close(actual.personal.ship, personal); assert.equal(restored.state.ship.vx, 2); assert.equal(restored.state.ship.vy, -3);
  assert.deepEqual(actual.work, beforeWork); assert.deepEqual(actual.assignment, assignment); assert.equal(actual.clock, 53); assert.equal(actual.phaseClock, 12);
  assert.deepEqual(restored.state.crew.map(person => ({ id: person.id, ...pose(person) })), deck);
  const next = Game.fromSave(restored.save()); close(next.state.ship, pose(restored.state.ship)); close(next.state.npcContract.workPoint, pose(actual.workPoint));
});

test('a saved boarding tether keeps its local separation and permits an actual return after migration', () => {
  const game = new Game('space-tether'); Object.assign(game.state.ship, { x: -900, y: -1300, vx: 0, vy: 0, hull: 71, shield: 0 });
  const enemy = placeRaider(game, { x: -770, y: -1300, hp: 14, maxHp: 46, disabled: true, active: false });
  ok(game.boardEnemy(enemy.id)); game.state.boarding.enemies[0].health = 11;
  const raw = legacy(game.save()), person = pose(raw.person), restored = Game.fromSave(raw), target = restored.system.enemies.find(value => value.id === enemy.id);
  assert.ok(target); close(restored.state.person, person); assert.equal(restored.state.boarding.enemies[0].health, 11);
  close(restored.state.ship, { x: -2700, y: -3900 }); close(target, { x: -2570, y: -3900 });
  assert.equal(target.hp, 14); assert.equal(restored.state.ship.hull, 71);
  Object.assign(restored.state.person, cabinLayout(restored.state.boarding.shipClass).spawn); ok(restored.returnToOwnShip());
  assert.equal(restored.state.mode, 'ship'); assert.equal(target.hp, 14);
});

test('open physical encounters and derelict return poses remain within their unchanged interaction ranges', () => {
  const game = new Game('space-transmission'), signal = findDerelict(game), contact = game.system.traffic.find(value => value.id === signal.vesselId);
  assert.ok(contact); Object.assign(game.state.ship, { x: signal.x + 200, y: signal.y, vx: 0, vy: 0 });
  ok(game.triggerEncounter('ghost_freighter', { sourceType: 'signal', sourceId: signal.id }));
  const raw = legacy(game.save()), oldSource = { x: signal.x / 3, y: signal.y / 3 }, record = raw.worlds[raw.systemId];
  Object.assign(record.encounterContacts[contact.id], oldSource); Object.assign(raw.pendingEncounter, oldSource);
  Object.assign(raw.ship, { x: oldSource.x + 200, y: oldSource.y });
  const restored = Game.fromSave(raw);
  assert.equal(restored.state.pendingEncounter?.id, 'ghost_freighter'); close(restored.state.ship, { x: signal.x + 200, y: signal.y });
  assert.equal(restored.state.encounterHistory.includes('ghost_freighter'), false);
  // A person already aboard that same derelict must emerge beside it, not at the old coordinate.
  raw.pendingEncounter = null; raw.mode = 'person'; raw.locationId = `derelict-${signal.id}`;
  raw.interior = { kind: 'derelict', signalId: signal.id, location: { id: raw.locationId, kind: 'derelict', biome: 'derelict', name: 'Silent freighter' }, liveVessel: false, returnShip: { x: oldSource.x + 120, y: oldSource.y, vx: 0, vy: 0, angle: 0 }, returnLocation: null };
  Object.assign(raw.ship, raw.interior.returnShip); Object.assign(raw.person, { x: 156, y: 348 });
  const aboard = Game.fromSave(raw); close(aboard.state.person, { x: 156, y: 348 }); ok(aboard.leaveDerelict());
  close(aboard.state.ship, { x: signal.x + 120, y: signal.y });
});

test('existing ships near a cosmic well keep their physical warning and quest offsets', () => {
  const seed = 'space-gravity', systems = buildGalaxy(seed), system = systems.find(value => value.id === 'umbra'), oldWell = systemCosmicBodies(system, seed)[0];
  const raw = legacy(new Game(seed).save()); raw.systemId = 'umbra'; raw.worlds = {}; Object.assign(raw.ship, { x: 1450, y: -350, vx: 24, vy: -9 });
  const restored = Game.fromSave(raw), well = restored.system.bodies.find(body => body.kind === 'blackhole');
  close(well, { x: oldWell.x * 3, y: oldWell.y * 3 });
  close(restored.state.ship, { x: well.x + 1450 - oldWell.x, y: well.y - 350 - oldWell.y });
  assert.equal(restored.state.ship.vx, 24); assert.equal(restored.state.ship.vy, -9);
});

test('a pending scheduled-traffic hail follows the same migrated route phase', () => {
  const seed = 'space-scheduled-radio', game = new Game(seed); game.state.systemId = 'cinder'; game._loadSystem('cinder');
  const catalog = game.currentSystem, oldBodies = game.system.bodies.map(body => {
    const index = catalog.bodies.findIndex(value => value.id === body.id);
    return { ...body, ...systemBodyPosition(catalog.bodies[index], index, catalog.id, 1) };
  });
  const oldTraffic = createSystemTraffic({ seed, system: { ...catalog, spatialScale: 1, radius: 2700 }, bodies: oldBodies, count: game.system.context.trafficCount });
  const contact = oldTraffic.find(value => value.faction === 'cinder' && value._trafficLane && game.system.traffic.some(current => current.id === value.id)); assert.ok(contact);
  const raw = legacy(game.save()); raw.flags.push('cinder_warmth'); raw.ship.hull = 50;
  Object.assign(raw.ship, { x: contact.x + 180, y: contact.y, vx: 0, vy: 0 });
  raw.worlds.cinder.trafficStates = captureTraffic(oldTraffic);
  raw.pendingEncounter = { id: 'cinder_sanctuary', sourceType: 'traffic', sourceId: contact.id, vesselId: contact.id, kind: 'traffic', faction: 'cinder', x: contact.x, y: contact.y, distance: 180, shipId: raw.ship.id, locationId: null, systemId: 'cinder' };
  const restored = Game.fromSave(raw), current = restored.system.traffic.find(value => value.id === contact.id);
  assert.equal(restored.state.pendingEncounter?.id, 'cinder_sanctuary'); close(restored.state.ship, { x: current.x + 180, y: current.y });
  assert.deepEqual(raw.worlds.cinder.trafficStates, captureTraffic(oldTraffic));
});

test('current saves and fresh voyages are never expanded a second time', () => {
  const game = new Game('space-current'), fresh = game.save(); assert.equal(fresh.spaceVersion, 1); assert.equal(fresh.worlds.hearth.spaceVersion, 1);
  const before = copy(fresh); migrateGameSpace(fresh, { systems: game.galaxy }); assert.deepEqual(fresh, before);
  const restored = Game.fromSave(fresh); close(restored.state.ship, pose(game.state.ship)); assert.equal(restored.system.radius, 8100);
  const catalog = restored.galaxy.find(value => value.id === 'hearth');
  const morrow = catalog.bodies.findIndex(body => body.id === 'morrow'); close(systemBodyPosition(catalog.bodies[morrow], morrow, 'hearth'), { x: 2520, y: -1260 });
});
