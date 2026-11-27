import test from 'node:test';
import assert from 'node:assert/strict';
import { populateDistrictLife, streetPropBounds } from '../public/district-life.mjs';
import { getSolidWalls } from '../public/building-geometry.mjs';
import { MISSIONS, createGame, applyBreach, findPath, hasLineOfSight, segmentRectEntry, step } from '../public/sim.mjs';
import { traceAim } from '../public/desktop-input.mjs';
import { CoopStateHydrator, predictMovement } from '../public/coop-client.mjs';

const VEHICLES = ['car', 'pickup', 'van'];
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('each seeded district has a bounded varied civilian street fabric and isolated contextual fires', () => {
  const signatures = new Set(), types = new Set();
  for (let mission = 0; mission < 10; mission++) for (const seed of [4, 17, 19931003]) {
    const { world } = createGame({ mission, seed }), vehicles = world.streetProps.filter(prop => VEHICLES.includes(prop.type));
    assert.ok(vehicles.length >= 24 && vehicles.length <= 65, `${mission}/${seed}: visible parked street traffic remains bounded`);
    assert.ok(world.streetProps.length >= 45 && world.streetProps.length <= 120);
    assert.ok(world.streetSolids.length <= 90, 'static cover adds a bounded number of visibility and navigation obstacles');
    assert.ok(world.ambientFires.length >= 2 && world.ambientFires.length <= 3);
    for (const prop of world.props.filter(prop => VEHICLES.includes(prop.type))) {
      assert.ok(world.streetProps.includes(prop) && prop.cover, 'every visible parked vehicle belongs to shared solid street cover');
      assert.ok(world.streetSolids.some(wall => wall.propId === prop.id), 'no legacy decorative car can be walked or shot through');
    }
    for (const prop of world.streetProps) {
      types.add(prop.type);
      assert.ok(world.props.includes(prop));
      assert.deepEqual(prop.bounds, streetPropBounds(prop));
      assert.ok(world.buildings.every(building => !overlaps(prop.bounds, building)));
      if (prop.cover) assert.deepEqual(world.streetSolids.find(wall => wall.propId === prop.id),
        { ...prop.bounds, id: `${prop.id}:cover`, propId: prop.id, kind: 'street-cover', material: world.streetSolids.find(wall => wall.propId === prop.id).material });
    }
    for (const fire of world.ambientFires) {
      const source = world.streetProps.find(prop => prop.id === fire.propId);
      assert.ok(source.burning && source.condition === 'burned' && VEHICLES.includes(source.type));
      assert.ok(fire.intensity >= .45 && fire.intensity <= .85);
      assert.ok(world.ambientFires.every(other => other === fire || Math.hypot(other.x - fire.x, other.y - fire.y) > 350), 'fires are scattered incidents, not a burning street on every block');
    }
    assert.ok(vehicles.filter(prop => !prop.burning).length > vehicles.length * .85);
    const original = structuredClone({ props: world.streetProps, solids: world.streetSolids, fires: world.ambientFires });
    populateDistrictLife(world);
    assert.deepEqual({ props: world.streetProps, solids: world.streetSolids, fires: world.ambientFires }, original, 'reconstruction does not duplicate street objects or consume combat state');
    signatures.add(JSON.stringify(world.streetProps));
  }
  assert.equal(signatures.size, 10 * 3, 'both seed and every grid mission identity change the street fabric');
  for (const type of ['car', 'pickup', 'van', 'handcart', 'washline', 'materials', 'barrels', 'tires', 'jars', 'sacks']) assert.ok(types.has(type), type);
});

test('parked body cover agrees across aim, bullets, sight, client movement, and route planning', () => {
  const game = createGame({ mission: 0, seed: 17 });
  game.enemies = []; game.civilians = []; game.maxEnemies = 0;
  const prop = game.world.streetProps.find(prop => VEHICLES.includes(prop.type) && prop.x < 200 && prop.bounds.h > prop.bounds.w);
  assert.ok(prop);
  const from = { x: prop.bounds.x - 32, y: prop.y }, to = { x: prop.bounds.x + prop.bounds.w + 32, y: prop.y };
  const aim = traceAim(game.world, from, to);
  assert.equal(aim.wall.propId, prop.id); assert.equal(hasLineOfSight(game, from, to), false);
  assert.equal(aim.point.x, prop.bounds.x);
  const actor = game.squad[0]; Object.assign(actor, from);
  const predicted = predictMovement(actor, { moveX: 1 }, .25, game.world);
  for (let i = 0; i < 15; i++) step(game, { moveX: 1 }, 1 / 60);
  assert.ok(Math.abs(actor.x - predicted.x) < 1e-8);
  assert.ok(actor.x + actor.radius <= prop.bounds.x, 'neither local nor network movement enters the painted body');
  const path = findPath(game, from, to);
  assert.ok(path.length > 1, 'navigation goes around the parked vehicle');
  let last = from;
  for (const point of path) {
    assert.ok(getSolidWalls(game.world).every(wall => !Number.isFinite(segmentRectEntry(last, point, wall, 13))));
    last = point;
  }
  assert.ok(Math.hypot(last.x - to.x, last.y - to.y) < .001);
  game.soundEvents = [];
  game.bullets = [{ id: 99000, ...from, px: from.x, py: from.y, vx: (to.x - from.x) / .05, vy: 0,
    team: 'squad', owner: game.playerId, weapon: 'rifle', damage: 24, ttl: 1 }];
  step(game, {}, .05);
  const impact = game.soundEvents.find(event => event.type === 'impact');
  assert.ok(impact); assert.equal(game.bullets.length, 0);
  assert.ok(Math.hypot(impact.x - aim.point.x, impact.y - aim.point.y) < 1e-8, 'visible cover cue is the actual projectile collision');
});

test('street collision caching survives delayed population, wall reconstruction, and co-op hydration', () => {
  const game = createGame({ mission: 0, seed: 17 }), world = game.world;
  const merged = getSolidWalls(world), street = [...world.streetSolids];
  assert.equal(getSolidWalls(world), merged, 'unchanged queries do not reset AI/navigation caches');
  const result = applyBreach(game, { x: 1789, y: 340, wallId: 'b03:west' });
  assert.equal(result.changed, true);
  const changed = getSolidWalls(world);
  assert.notEqual(changed, merged, 'in-place wall reconstruction invalidates the cached combination');
  assert.ok(street.every(wall => changed.includes(wall)), 'a building breach cannot erase parked cover');
  assert.equal(getSolidWalls(world), changed);
  const { world: _world, grid, stages, ...state } = game;
  const packet = { state, init: { seed: 17, mission: 0, difficulty: 'standard', epoch: 1 },
    room: { code: 'ABCDEF', players: [{ id: 'human', actorId: game.playerId, role: 'leader' }] } };
  const remote = new CoopStateHydrator().apply(packet, 'human').game;
  assert.deepEqual(remote.world.streetProps, world.streetProps);
  assert.deepEqual(remote.world.ambientFires, world.ambientFires);
  assert.deepEqual(getSolidWalls(remote.world), changed);
  assert.deepEqual(remote.grid, grid, 'prediction and authority reconstruct the same roads, parked cover, and breach');
  const custom = { walls: [], buildings: [], geometryRevision: 0 };
  assert.equal(getSolidWalls(custom), custom.walls);
  custom.streetSolids = [{ x: 100, y: 200, w: 30, h: 60 }];
  assert.deepEqual(getSolidWalls(custom), custom.streetSolids);
  const first = getSolidWalls(custom);
  custom.streetSolids = [{ x: 200, y: 200, w: 30, h: 60 }];
  assert.notEqual(getSolidWalls(custom), first, 'late generation/replay must not retain stale parked collision');
});
