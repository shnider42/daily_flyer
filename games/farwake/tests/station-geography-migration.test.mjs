import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, buildGalaxy } from '../dist/engine.mjs';
import { STATION_GEOGRAPHY_VERSION, stationRelocations } from '../dist/station-geography.mjs';
import { migrateGameStationGeography, migrateRealmStationGeography, legacyStationGeography } from '../dist/station-geography-migration.mjs';
import { SYSTEM_SPACE_SCALE, WORLD_RADIUS, systemBodyPosition } from '../dist/system-space.mjs';
import { bodyVisualRadius, applySystemActivity } from '../dist/world-types.mjs';
import { systemContext } from '../dist/encounter-context.mjs';
import { systemCosmicBodies } from '../dist/galaxy-expansion.mjs';
import { createSystemTraffic, restoreTraffic } from '../dist/traffic.mjs';

const seed = 'station-migration-tests', systems = buildGalaxy(seed);
const system = systems.find(value => !value.authored && stationRelocations(value).length);
const moved = stationRelocations(system)[0], delta = { x: moved.to.x - moved.from.x, y: moved.to.y - moved.from.y };
const pose = (id, extra = {}) => ({ id, x: moved.from.x, y: moved.from.y + moved.radius + 130, vx: 7, vy: -2, angle: .4, angularVelocity: .2, hull: 63, shield: 11, fuel: 17, ...extra });
const translated = value => ({ x: value.x + delta.x, y: value.y + delta.y });
const point = value => ({ x: value.x, y: value.y });
const close = (actual, expected) => { assert.ok(Math.abs(actual.x - expected.x) < 1e-7, `x ${actual.x} ≠ ${expected.x}`); assert.ok(Math.abs(actual.y - expected.y) < 1e-7, `y ${actual.y} ≠ ${expected.y}`); };

test('a solo saved berth follows its same station exactly once without changing the captain or cargo', () => {
  const old = new Game(seed).save(); delete old.stationGeographyVersion;
  old.systemId = system.id; old.mode = 'person'; old.locationId = moved.bodyId;
  old.ship = { ...old.ship, ...pose(old.ship.id), dockedAt: moved.bodyId };
  old.credits = 437; old.cargo = { ore: 13, crystal: 4 }; old.flags.push('station-test-earned');
  const before = structuredClone(old), restored = Game.fromSave(old);
  close(restored.state.ship, translated(before.ship)); assert.deepEqual(old, before);
  assert.equal(restored.state.credits, 437); assert.deepEqual(restored.state.cargo, old.cargo);
  assert.equal(restored.state.ship.hull, 63); assert.equal(restored.state.ship.fuel, 17);
  assert.ok(restored.state.flags.includes('station-test-earned'));
  assert.equal(restored.state.stationGeographyVersion, STATION_GEOGRAPHY_VERSION);
  close(Game.fromSave(restored.save()).state.ship, restored.state.ship);
});

test('a remote owned hull is migrated separately from the ship a shared guest occupies', () => {
  const own = pose('own', { dockedAt: moved.bodyId }), carrier = { id: 'carrier', x: 0, y: 150, hull: 250, vx: 0, vy: 0 };
  const original = { seed, vessels: { own: { id: 'own', ship: own, systemId: system.id, dockedAt: moved.bodyId }, carrier: { id: 'carrier', ship: carrier, systemId: 'hearth', dockedAt: 'kettle' } },
    captains: { guest: { id: 'guest', ownedVesselId: 'own', aboard: 'carrier', game: { systemId: 'hearth', ship: structuredClone(own), person: { x: 180, y: 250, health: 72 }, interior: { kind: 'ship', returnShip: structuredClone(carrier) },
      livelihoodStatus: 'employed', credits: 777, cargo: { ore: 9 }, livelihoods: { parkedShip: { ...structuredClone(own), bodyId: moved.bodyId, systemId: system.id, vesselId: 'own' } } } } }, worlds: {} };
  const before = structuredClone(original), result = migrateRealmStationGeography(original, { systems });
  assert.deepEqual(original, before); close(result.vessels.own.ship, translated(own)); close(result.captains.guest.game.ship, translated(own));
  close(result.captains.guest.game.livelihoods.parkedShip, translated(own));
  assert.deepEqual(result.vessels.carrier, before.vessels.carrier); assert.deepEqual(result.captains.guest.game.interior, before.captains.guest.game.interior);
  assert.deepEqual(result.captains.guest.game.person, before.captains.guest.game.person);
  assert.equal(result.captains.guest.game.credits, 777); assert.equal(result.captains.guest.aboard, 'carrier');
  assert.equal(migrateRealmStationGeography(result, { systems }), result);
});

test('canonical aliases, a boarding tether and unloaded hull records share one translation', () => {
  const boarded = pose('target', { hp: 31, dockedAt: moved.bodyId, deck: { enemies: [{ x: 90, y: 120, health: 17 }] } });
  const visitor = pose('visitor', { x: moved.from.x + 120 });
  const snapshot = { seed, vessels: { target: { id: 'target', ship: boarded, systemId: system.id, dockedAt: moved.bodyId, npcEnemyId: 'raider-1' }, visitor: { id: 'visitor', ship: visitor, systemId: system.id, boarding: { targetVesselId: 'target' } } },
    captains: { one: { id: 'one', ownedVesselId: 'visitor', aboard: 'visitor', game: { systemId: system.id, ship: structuredClone(visitor), boarding: { targetId: 'raider-1' }, interior: { kind: 'enemy', returnShip: structuredClone(visitor) } } } },
    worlds: { [system.id]: { record: { enemyStates: { 'raider-1': { ...structuredClone(boarded), id: undefined } }, spawned: [{ ...structuredClone(boarded), id: 'raider-1' }], parkedShips: [{ ...structuredClone(boarded), id: 'target' }], depleted: ['old-rock'], pickups: [{ x: 1, y: 2, amount: 5 }] }, enemies: [{ ...structuredClone(boarded), id: 'raider-1' }] } } };
  const result = migrateRealmStationGeography(snapshot, { systems }), world = result.worlds[system.id];
  for (const value of [result.vessels.target.ship, world.record.enemyStates['raider-1'], world.record.spawned[0], world.enemies[0], world.record.parkedShips[0]]) close(value, translated(boarded));
  close(result.vessels.visitor.ship, translated(visitor)); close(result.captains.one.game.interior.returnShip, translated(visitor));
  assert.deepEqual(world.record.enemyStates['raider-1'].deck, boarded.deck);
  assert.deepEqual(world.record.depleted, ['old-rock']); assert.deepEqual(world.record.pickups, snapshot.worlds[system.id].record.pickups);
});

test('NPC service return points and saved personal ships follow the origin without completing work', () => {
  const ship = pose('employer', { dockedAt: moved.bodyId }), dockPoint = point(ship), workPoint = { x: 7000, y: 5000 };
  const origin = { bodyId: moved.bodyId, systemId: system.id, ...moved.from, radius: moved.radius };
  const job = { id: 'crew-watch-1', active: true, vesselId: ship.id, phase: 'boarding', dockedAt: moved.bodyId, origin, dockPoint, workPoint, clock: 19, phaseClock: 7, paid: false, reward: 83, personal: { ship: pose('personal') }, work: { done: false, progress: 3 }, navy: { route: { remote: true, reached: false, homeGate: { ...workPoint, angle: .5 }, destinationSystemId: 'hearth' } } };
  const old = { seed, systemId: system.id, ship, npcContract: job, livelihoods: { parkedShip: { ...pose('personal'), bodyId: moved.bodyId, systemId: system.id } } };
  const before = structuredClone(old); migrateGameStationGeography(old, { systems });
  close(old.ship, translated(before.ship)); close(job.origin, moved.to); close(job.dockPoint, translated(before.npcContract.dockPoint));
  close(job.personal.ship, translated(before.npcContract.personal.ship)); assert.deepEqual(job.workPoint, workPoint);
  for (const field of ['clock', 'phaseClock', 'paid', 'reward', 'work']) assert.deepEqual(job[field], before.npcContract[field]);
  assert.equal(job.navy.route.reached, false); assert.deepEqual(job.navy.route.homeGate, before.npcContract.navy.route.homeGate);
});

test('old/current projections preserve planets and authored coordinates; valid distant flight stays exact', () => {
  const previous = legacyStationGeography(systems), priorSystem = previous.find(value => value.id === system.id);
  const index = priorSystem.bodies.findIndex(body => body.id === moved.bodyId);
  close(systemBodyPosition(priorSystem.bodies[index], index, system.id), moved.from);
  assert.equal(legacyStationGeography(systems), previous);
  assert.equal(previous.find(value => value.id === 'hearth'), systems.find(value => value.id === 'hearth'));
  for (const body of system.bodies.filter(value => value.kind !== 'station')) assert.equal(priorSystem.bodies.find(value => value.id === body.id), body);
  const ship = { id: 'far-away', x: 7000, y: 6500, vx: 12, vy: -6, hull: 66 };
  const old = { seed, systemId: system.id, ship: structuredClone(ship), worlds: {} }; migrateGameStationGeography(old, { systems });
  assert.deepEqual(old.ship, ship); assert.equal(migrateGameStationGeography(old, { systems }), old);
});

test('a large flying hull overlapped by a newly moved station clears its full physical radius', () => {
  const ship = { id: 'capital', x: moved.to.x, y: moved.to.y, radius: 145, renderLength: 500, renderWidth: 280, vx: 20, vy: 9, hull: 640, fuel: 88 };
  const old = { seed, systemId: system.id, ship: structuredClone(ship), worlds: {} };
  migrateGameStationGeography(old, { systems });
  assert.ok(Math.hypot(old.ship.x - moved.to.x, old.ship.y - moved.to.y) >= moved.radius + ship.radius + 15);
  assert.equal(old.ship.hull, ship.hull); assert.equal(old.ship.fuel, ship.fuel);
  assert.equal(old.ship.vx, 0); assert.equal(old.ship.vy, 0);
  const current = structuredClone(old); migrateGameStationGeography(old, { systems }); assert.deepEqual(old, current);
});

test('a pre-expansion save scales against its former station before following the new berth', () => {
  const old = new Game(seed).save(); delete old.stationGeographyVersion; delete old.spaceVersion; delete old.worldTypesVersion;
  old.systemId = system.id; old.mode = 'person'; old.locationId = moved.bodyId;
  const berth = { x: moved.from.x / SYSTEM_SPACE_SCALE, y: moved.from.y / SYSTEM_SPACE_SCALE + moved.radius + 130 };
  Object.assign(old.ship, berth, { dockedAt: moved.bodyId });
  const restored = Game.fromSave(old);
  close(restored.state.ship, { x: moved.to.x, y: moved.to.y + moved.radius + 130 });
});

test('saved traffic retains its loading leg instead of restarting or teleporting into a different leg', () => {
  const previous = legacyStationGeography(systems), prior = previous.find(value => value.id === system.id);
  const bodies = s => [...s.bodies.map((body, index) => ({ ...body, ...systemBodyPosition(body, index, s.id), radius: bodyVisualRadius(body), faction: body.faction || s.faction })),
    ...systemCosmicBodies(s, seed).map(body => ({ ...body, x: body.x * SYSTEM_SPACE_SCALE, y: body.y * SYSTEM_SPACE_SCALE }))];
  const count = applySystemActivity(system, systemContext(system)).trafficCount;
  const oldTraffic = createSystemTraffic({ seed, system: { ...prior, spatialScale: 3, radius: WORLD_RADIUS }, bodies: bodies(prior), count });
  const newTraffic = createSystemTraffic({ seed, system: { ...system, spatialScale: 3, radius: WORLD_RADIUS }, bodies: bodies(system), count });
  const pair = oldTraffic.flatMap(old => { const next = newTraffic.find(next => next.id === old.id && next.classId === old.classId && next._trafficLane?.origin.id === old._trafficLane?.origin.id && next._trafficLane?.destination.id === old._trafficLane?.destination.id); return next && old._trafficLane ? [{ old, next }] : []; })[0];
  assert.ok(pair, 'fixture supplies a stable route before and after the move');
  const a = pair.old._trafficLane, b = pair.next._trafficLane;
  const saved = { id: pair.old.id, routeKey: a.key, routeTime: 2 * a.travel + a.dwellB + a.dwellA * .4 };
  restoreTraffic(oldTraffic, [saved]);
  const record = { trafficStates: [saved] }, state = { seed, systemId: system.id, ship: { id: 'hailing', x: pair.old.x + 120, y: pair.old.y },
    pendingEncounter: { sourceType: 'traffic', sourceId: pair.old.id, x: pair.old.x, y: pair.old.y }, worlds: { [system.id]: record } };
  migrateGameStationGeography(state, { systems });
  assert.equal(record.trafficStates[0].routeKey, b.key);
  assert.ok(Math.abs(record.trafficStates[0].routeTime - (2 * b.travel + b.dwellB + b.dwellA * .4)) < 1e-8);
  assert.equal(record.trafficStates[0].id, saved.id);
  restoreTraffic(newTraffic, record.trafficStates);
  close(state.ship, { x: pair.next.x + 120, y: pair.next.y });
  close(state.pendingEncounter, pair.next);
});
