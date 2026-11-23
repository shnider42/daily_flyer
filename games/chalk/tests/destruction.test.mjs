import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBuildingInteriors, getSolidWalls } from '../public/building-geometry.mjs';
import { createDestructionState, breachAtBlast, syncBuildingDamage } from '../public/destruction.mjs';
import { createGame, hasLineOfSight, segmentRectEntry, step } from '../public/sim.mjs';
import { traceAim } from '../public/desktop-input.mjs';
import { predictMovement } from '../public/coop-client.mjs';

function fixture() {
  const world = prepareBuildingInteriors({ width: 2400, height: 1900, buildings: [
    { id: 'home', x: 100, y: 100, w: 240, h: 240, tone: .3 },
    { id: 'neighbor', x: 500, y: 100, w: 160, h: 240, tone: .5 },
  ] });
  return { world, house: world.buildings[0], destruction: createDestructionState() };
}
const hitWest = (world, destruction) => breachAtBlast(world, destruction, { x: 99, y: 180, radius: 76, wallId: 'home:west' });

test('a localized breach changes shared sight, aim and clearance while preserving doors, partitions and corners', () => {
  const { world, house, destruction } = fixture(), original = structuredClone(house), solids = world.walls;
  const before = { x: 62, y: 180 }, after = { x: 138, y: 180 };
  assert.equal(hasLineOfSight({ world }, before, after), false);
  assert.equal(traceAim(world, before, after).blocked, true);
  const result = hitWest(world, destruction), opening = result.created[0];
  assert.equal(result.changed, true); assert.equal(destruction.revision, 1);
  assert.equal(opening.width, 80); assert.equal(opening.x, 100); assert.equal(opening.y, 180);
  assert.equal(world.walls, solids, 'the shared solids array retains its identity');
  assert.equal(hasLineOfSight({ world }, before, after), true);
  assert.equal(traceAim(world, before, after).blocked, false);
  assert.ok(getSolidWalls(world).every(wall => !Number.isFinite(segmentRectEntry(opening.outside, opening.inside, wall, 17))), 'the opening clears the full navigation radius');
  assert.deepEqual(house.baseWalls, original.baseWalls);
  assert.deepEqual(house.doors, original.doors);
  assert.deepEqual(house.walls.filter(wall => wall.kind === 'partition'), original.walls.filter(wall => wall.kind === 'partition'));
  assert.equal(hasLineOfSight({ world }, { x: 62, y: 110 }, { x: 138, y: 110 }), false, 'the corner remains solid');
  assert.equal(hasLineOfSight({ world }, { x: 138, y: 180 }, { x: 138, y: 280 }), false, 'the interior partition remains solid');
  assert.equal(world.buildings[1].wallRevision, 0);
});

test('repeat impacts stay local and no building receives more than four openings', () => {
  const { world, house, destruction } = fixture();
  assert.equal(hitWest(world, destruction).changed, true);
  assert.equal(hitWest(world, destruction).changed, false, 'the same impact cannot widen an existing gap');
  const second = breachAtBlast(world, destruction, { x: 341, y: 180, wallId: 'home:east' });
  assert.equal(second.changed, true);
  assert.equal(breachAtBlast(world, destruction, { x: 99, y: 260, wallId: 'home:west' }).changed, true);
  assert.equal(breachAtBlast(world, destruction, { x: 341, y: 260, wallId: 'home:east' }).changed, true);
  assert.equal(breachAtBlast(world, destruction, { x: 150, y: 99, wallId: 'home:north-left' }).changed, false);
  assert.equal(destruction.breaches.length, 4); assert.equal(house.breaches.length, 4);
  assert.ok(house.walls.length >= house.baseWalls.length, 'cuts split walls rather than erasing the house');
  assert.equal(world.buildings.length, 2);
});

test('range, intact cover, fixed doors and partitions constrain explosive openings', () => {
  for (const impact of [
    { x: 40, y: 180 }, { x: 99, y: 180, radius: 0 },
    { x: 220, y: 99 }, { x: 150, y: 214, wallId: 'home:partition-left' }, { x: NaN, y: 180 },
  ]) {
    const { world, destruction } = fixture();
    assert.equal(breachAtBlast(world, destruction, impact).changed, false, JSON.stringify(impact));
    assert.equal(destruction.revision, 0);
  }
  const { world, destruction } = fixture(), barrier = { x: 50, y: 100, w: 10, h: 200 };
  world.walls.push(barrier);
  assert.equal(breachAtBlast(world, destruction, { x: 49, y: 180, wallId: 'home:west' }).changed, false, 'a separate intact wall shields the candidate');
  assert.equal(breachAtBlast(world, destruction, { x: 341, y: 180, wallId: 'home:east' }).changed, true);
  assert.ok(world.walls.includes(barrier), 'unrelated custom solids survive reconstruction');
});

test('near-corner blasts remove a usable wall section without removing the corner support', () => {
  const { world, house, destruction } = fixture();
  const result = breachAtBlast(world, destruction, { x: 99, y: 99, wallId: 'home:west' });
  assert.equal(result.changed, true);
  assert.equal(hasLineOfSight({ world }, { x: 62, y: 105 }, { x: 138, y: 105 }), false);
  assert.ok(house.walls.some(wall => wall.id === 'home:west' && wall.y === house.y && wall.h >= 10));
  const opening = result.created[0];
  assert.ok(world.walls.every(wall => !Number.isFinite(segmentRectEntry(opening.outside, opening.inside, wall, 17))));
});

test('street-facing walls can open into existing doors while the outer supports and partitions stay intact', () => {
  for (const side of ['north', 'south']) {
    const { world } = createGame({ mission: 0, seed: 17 }), house = world.buildings.find(building => building.id === 'b03');
    const original = structuredClone(house), door = house.doors.find(door => door.side === side), destruction = createDestructionState();
    const result = breachAtBlast(world, destruction, { x: 1825, y: door.y + (side === 'north' ? -1 : 1), wallId: `b03:${side}-left` });
    assert.equal(result.changed, true);
    const opening = result.created[0];
    assert.equal(opening.width, 50);
    assert.equal(opening.to, door.x - door.width / 2, 'the new gap joins the original threshold without an invisible jamb');
    assert.equal(traceAim({ walls: original.baseWalls }, opening.outside, opening.inside).blocked, true);
    assert.equal(traceAim(world, opening.outside, opening.inside).blocked, false);
    assert.ok(world.walls.every(wall => !Number.isFinite(segmentRectEntry(opening.outside, opening.inside, wall, 17))));
    assert.deepEqual(house.doors, original.doors);
    assert.deepEqual(house.walls.filter(wall => wall.kind === 'partition'), original.walls.filter(wall => wall.kind === 'partition'));
    assert.ok(house.walls.some(wall => wall.id === opening.wallId && wall.x === house.x + 10 && wall.w === 10));
    const remote = createGame({ mission: 0, seed: 17 }).world;
    assert.equal(syncBuildingDamage(remote, JSON.parse(JSON.stringify(destruction))).changed, true);
    assert.deepEqual(remote.walls, world.walls);
    const forged = structuredClone(destruction), record = forged.breaches[0];
    record.from -= 1; record.id = `${record.wallId}:${record.from}:${record.to}`;
    const untouched = createGame({ mission: 0, seed: 17 }).world, intact = structuredClone(untouched.walls);
    assert.equal(syncBuildingDamage(untouched, forged).changed, false, 'arbitrary wider cuts are not canonical');
    assert.deepEqual(untouched.walls, intact);
  }
});

test('canonical snapshots reproduce breaches once and a reset restores original walls', () => {
  const source = fixture(), remote = fixture();
  hitWest(source.world, source.destruction);
  const wire = JSON.parse(JSON.stringify(source.destruction));
  assert.equal(syncBuildingDamage(remote.world, wire).changed, true);
  assert.deepEqual(remote.world.walls, source.world.walls);
  assert.deepEqual(remote.house.breaches, source.house.breaches);
  const walls = remote.house.walls;
  for (let i = 0; i < 20; i++) assert.equal(syncBuildingDamage(remote.world, structuredClone(wire)).changed, false);
  assert.equal(remote.house.walls, walls);
  assert.equal(syncBuildingDamage(remote.world, createDestructionState()).changed, true);
  assert.deepEqual(remote.house.walls, remote.house.baseWalls);
  assert.deepEqual(remote.house.breaches, []); assert.equal(remote.world.geometryRevision, 0);
});

test('invalid destruction data cannot remove walls or mutate a partly valid snapshot', () => {
  const source = fixture(); hitWest(source.world, source.destruction);
  for (const corrupt of [
    { ...source.destruction, version: 9 }, { ...source.destruction, revision: 2 },
    { version: 1, revision: 1, breaches: [{ ...source.destruction.breaches[0], to: 5000 }] },
    { version: 1, revision: 2, breaches: [source.destruction.breaches[0], { ...source.destruction.breaches[0], id: 'fake', wallId: 'missing' }] },
  ]) {
    const { world } = fixture(), original = structuredClone(world.walls);
    assert.equal(syncBuildingDamage(world, corrupt).changed, false);
    assert.deepEqual(world.walls, original); assert.equal(world.geometryRevision, 0);
  }
});

test('actual player movement and client prediction both cross the opened seed-17 sidewall', () => {
  const game = createGame({ mission: 0, seed: 17 }), actor = game.squad[0];
  game.enemies = []; game.civilians = []; game.maxEnemies = 0;
  Object.assign(actor, { x: 252, y: 1500 });
  const closed = predictMovement(actor, { moveX: 1 }, .2, game.world);
  assert.ok(closed.x + actor.radius < 290);
  const damage = createDestructionState();
  const result = breachAtBlast(game.world, damage, { x: 289, y: 1500, wallId: 'b30a:west' });
  assert.equal(result.changed, true);
  const predicted = predictMovement(actor, { moveX: 1 }, .2, game.world);
  for (let i = 0; i < 12; i++) step(game, { moveX: 1 }, 1 / 60);
  assert.ok(Math.abs(actor.x - predicted.x) < 1e-8);
  for (let i = 0; i < 40; i++) step(game, { moveX: 1 }, 1 / 60);
  assert.ok(actor.x > 315 && actor.x < 400, 'the soldier passes through the real wall opening');
});

test('every generated building has a usable destructible section across all six mission layouts', () => {
  for (let mission = 0; mission < 6; mission++) for (const seed of [4, 17, 19931003]) {
    const { world } = createGame({ mission, seed }), destruction = createDestructionState();
    for (const house of world.buildings) {
      let result;
      for (const side of ['west', 'east']) {
        for (let y = Math.ceil((house.y - 20) / 40) * 40 + 20; y < house.y + house.h; y += 40) {
          result = breachAtBlast(world, destruction, { x: side === 'west' ? house.x - 1 : house.x + house.w + 1, y, wallId: `${house.id}:${side}` });
          if (result.changed) break;
        }
        if (result?.changed) break;
      }
      assert.ok(result?.changed, `${mission}/${seed}/${house.id} has a usable destructible wall`);
      const opening = result.created[0];
      assert.ok(world.walls.every(wall => !Number.isFinite(segmentRectEntry(opening.outside, opening.inside, wall, 17))), `${mission}/${seed}/${house.id} leaves a usable passage`);
    }
  }
});
