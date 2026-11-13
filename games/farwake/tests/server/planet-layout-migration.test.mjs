import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGalaxy } from '../../dist/engine.mjs';
import { generateSurface, isWalkable } from '../../dist/surface.mjs';
import { migrateRealmPlanetLayouts, PLANET_LAYOUT_MIGRATION_VERSION } from '../../server/place-migration.mjs';

const seed = 'planet-home-migration', systems = buildGalaxy(seed);
const system = systems.find(system => !system.authored && system.bodies.some(body => body.kind === 'planet'));
const body = system.bodies.find(body => body.kind === 'planet'), surface = generateSurface(body, seed);

test('paid homes and outposts on invalid old tiles move to connected ground without losing their records', () => {
  const lease = { id: 'captain-home', kind: 'outpost', ownerId: 'captain', ownerName: 'Captain', systemId: system.id, locationId: body.id, x: -24, y: 72, createdAt: 12345, inventory: { ore: 18 } };
  const snapshot = { seed, leases: { 'captain-home': lease }, captains: { captain: { home: structuredClone(lease), game: { credits: 219, cargo: { ore: 14 }, flags: ['purchased-home'], person: { x: 180, y: 210, health: 71 } } } } };
  const before = structuredClone(snapshot), result = migrateRealmPlanetLayouts(snapshot, { systems });
  assert.deepEqual(snapshot, before); assert.notEqual(result, snapshot);
  const home = result.captains.captain.home;
  assert.ok(isWalkable(surface, home.x, home.y)); assert.deepEqual(home, result.leases['captain-home']);
  assert.equal(home.ownerId, 'captain'); assert.equal(home.createdAt, 12345); assert.deepEqual(home.inventory, { ore: 18 });
  assert.deepEqual(result.captains.captain.game, before.captains.captain.game);
  assert.equal(result.planetLayoutVersion, PLANET_LAYOUT_MIGRATION_VERSION);
  assert.equal(migrateRealmPlanetLayouts(result, { systems }), result);
});

test('usable current home positions and authored Morrow or ship berths stay exact', () => {
  const home = { kind: 'room', systemId: system.id, locationId: body.id, ...surface.spawn, createdAt: 9 };
  const snapshot = { seed, leases: { current: home, oldMorrow: { kind: 'room', systemId: 'hearth', locationId: 'morrow', x: -5, y: -7 } },
    captains: { one: { home: structuredClone(home) }, two: { home: { kind: 'bunk', vesselId: 'vessel', bunkIndex: 2, x: 71, y: 93 } } } };
  const before = structuredClone(snapshot), result = migrateRealmPlanetLayouts(snapshot, { systems });
  assert.deepEqual(result.leases, before.leases); assert.deepEqual(result.captains, before.captains);
});

test('only conversation holds on changed outdoor settlements are released', () => {
  const changedKey = `realm:surface:${system.id}:${body.id}`, hold = [{ id: 'local-worker', x: 122, y: 211, until: 60, resumeAt: 110 }];
  const snapshot = { seed, npcHolds: { [changedKey]: structuredClone(hold), 'realm:surface:hearth:morrow': structuredClone(hold), 'realm:surface:hearth:kettle': structuredClone(hold), 'realm:ship:carrier': structuredClone(hold), [`realm:site:${system.id}:${body.id}:site:hollow`]: structuredClone(hold) }, captains: {}, leases: {} };
  const result = migrateRealmPlanetLayouts(snapshot, { systems });
  assert.equal(result.npcHolds[changedKey], undefined);
  for (const [key, value] of Object.entries(snapshot.npcHolds)) if (key !== changedKey) assert.deepEqual(result.npcHolds[key], value);
  assert.deepEqual(snapshot.npcHolds[changedKey], hold);
});
