import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingAt, getSolidWalls, prepareBuildingInteriors } from '../public/building-geometry.mjs';
import { createGame, findPath, hasLineOfSight, issueOrder, segmentRectEntry, setHumanPlayers, step, stepCoop } from '../public/sim.mjs';
import { traceAim } from '../public/desktop-input.mjs';
import { CoopStateHydrator, predictMovement } from '../public/coop-client.mjs';

function quietGame(options = {}) {
  const game = createGame(options);
  game.enemies = []; game.civilians = []; game.maxEnemies = 0;
  return game;
}
const player = game => game.squad.find(actor => actor.id === game.playerId);
const run = (game, seconds, input = {}) => { for (let i = 0; i < seconds * 30; i++) step(game, input, 1 / 30); };
const broadHouse = game => game.world.buildings.find(building => building.rooms.length === 2);
function assertClearRoute(game, from, to, label) {
  const route = findPath(game, from, to);
  assert.ok(route.length, `${label}: has a route`);
  let previous = from;
  for (const point of route) {
    assert.ok(getSolidWalls(game.world).every(wall => !Number.isFinite(segmentRectEntry(previous, point, wall, 13))), `${label}: a soldier clears every wall along the route`);
    previous = point;
  }
  assert.ok(Math.hypot(previous.x - to.x, previous.y - to.y) < 1e-6, `${label}: reaches the actual room or street point`);
}

test('every house has usable street doors and reachable rooms in all four missions', () => {
  for (let mission = 0; mission < 4; mission++) for (const seed of [4, 17, 19931003]) {
    const game = quietGame({ mission, seed });
    for (const building of game.world.buildings) {
      assert.equal(building.enterable, true);
      assert.equal(building.doors.length, 2);
      const [north, south] = building.doors;
      assert.equal((south.x - 20) % 40, 0, 'door centers coincide with walkable navigation columns');
      assert.equal(hasLineOfSight(game, south.outside, north.outside), true, 'doors and interior passage form an open sight line');
      assertClearRoute(game, south.outside, north.outside, `${mission}/${seed}/${building.id} street crossing`);
      for (const room of building.rooms) {
        const center = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
        assert.equal(buildingAt(game.world, center), building);
        assertClearRoute(game, south.outside, center, `${mission}/${seed}/${building.id} entry`);
        assertClearRoute(game, center, north.outside, `${mission}/${seed}/${building.id} exit`);
      }
    }
  }
});

test('a player walks through the spawn house doorway and exits while side walls stay solid', () => {
  const game = quietGame(), actor = player(game), house = game.world.buildings.find(building => building.id === 'b30a');
  const door = house.doors.find(door => door.side === 'south');
  Object.assign(actor, door.outside);
  run(game, 1, { moveY: -1 });
  assert.equal(buildingAt(game.world, actor), house);
  assert.ok(actor.y < door.y - actor.radius);
  run(game, 1.5, { moveY: 1 });
  assert.equal(buildingAt(game.world, actor), null);
  assert.ok(actor.y > door.y + actor.radius);
  Object.assign(actor, { x: house.x - 15, y: house.y + 65 });
  run(game, 1, { moveX: 1 });
  assert.ok(actor.x + actor.radius < house.x, 'a side wall cannot be entered');
});

test('the full AI squad follows a leader into a house and takes the door back out', () => {
  const game = quietGame(), house = game.world.buildings.find(building => building.id === 'b30a');
  Object.assign(player(game), { x: house.doors[1].x, y: house.y + 89 });
  for (let i = 1; i < game.squad.length; i++) Object.assign(game.squad[i], { x: house.doors[1].x + (i - 2) * 25, y: house.y + house.h + 49 + i * 22 });
  run(game, 12);
  assert.equal(game.squad.length, 4);
  assert.ok(game.squad.every(actor => buildingAt(game.world, actor) === house), 'all three AI teammates join the human indoors');
  issueOrder(game, 'move', { x: house.doors[1].x, y: house.y + house.h + 119 });
  run(game, 12);
  assert.ok(game.squad.slice(1).every(actor => !buildingAt(game.world, actor) && actor.y > house.y + house.h + 13), 'every ordered teammate exits through the street doorway');
});

test('recovered crew navigate house partitions and return to the street with their leader', () => {
  const game = quietGame({ mission: 1 }), house = game.world.buildings.find(building => building.id === 'b30');
  Object.assign(player(game), { x: house.doors[1].x, y: house.y + 64 });
  game.survivors.forEach((crew, index) => Object.assign(crew, { alive: true, downed: false, stabilized: true, x: house.doors[1].x + index * 20, y: house.y + house.h + 65 }));
  run(game, 12);
  assert.ok(game.survivors.every(crew => buildingAt(game.world, crew) === house));
  Object.assign(player(game), { x: house.doors[1].x, y: house.y + house.h + 109 });
  run(game, 12);
  assert.ok(game.survivors.every(crew => !buildingAt(game.world, crew) && crew.y > house.y + house.h + 13));
});

test('projectiles and the aim cue agree on open doors, perimeter walls, and partitions', () => {
  const game = quietGame(), house = broadHouse(game), south = house.doors[1];
  const partition = house.walls.find(wall => wall.kind === 'partition');
  const paths = [
    { from: south.outside, to: south.inside, blocked: false },
    { from: { x: house.x - 35, y: house.y + 55 }, to: { x: house.x + 55, y: house.y + 55 }, blocked: true },
    { from: { x: partition.x + partition.w / 2, y: partition.y - 35 }, to: { x: partition.x + partition.w / 2, y: partition.y + 45 }, blocked: true },
  ];
  for (const { from, to, blocked } of paths) {
    const trace = traceAim(game.world, from, to);
    assert.equal(trace.blocked, blocked);
    assert.equal(hasLineOfSight(game, from, to), !blocked);
    game.soundEvents = [];
    game.bullets = [{ id: 9999, x: from.x, y: from.y, px: from.x, py: from.y, vx: (to.x - from.x) / .05, vy: (to.y - from.y) / .05, team: 'squad', owner: game.playerId, weapon: 'rifle', damage: 24, ttl: 1 }];
    step(game, {}, .05);
    const impact = game.soundEvents.find(event => event.type === 'impact');
    if (blocked) {
      assert.ok(impact); assert.equal(game.bullets.length, 0);
      assert.ok(Math.hypot(impact.x - trace.point.x, impact.y - trace.point.y) < 1e-8);
    } else {
      assert.equal(impact, undefined); assert.equal(game.bullets.length, 1);
      assert.ok(Math.hypot(game.bullets[0].x - to.x, game.bullets[0].y - to.y) < 1e-8);
    }
  }
});

test('hugging an interior wall does not spawn shots through it or move the impact inside it', () => {
  const game = quietGame(), actor = player(game), house = broadHouse(game);
  Object.assign(actor, { x: house.interior.x + actor.radius + .1, y: house.y + 55, cooldown: 0 });
  step(game, { fire: true, aimX: house.x - 100, aimY: actor.y }, .05);
  const impact = game.soundEvents.find(event => event.type === 'impact');
  assert.ok(impact); assert.equal(game.bullets.length, 0);
  assert.ok(Math.abs(impact.x - house.interior.x) < 1e-8, 'impact occurs on the visible inner wall face');
});

test('a medic uses a doorway to reach a casualty even when separated by a nearby wall', () => {
  const game = quietGame({ role: 'member' }), casualty = player(game), medic = game.squad.find(actor => actor.role === 'medic'), house = broadHouse(game);
  Object.assign(casualty, { x: house.interior.x + 14, y: house.y + 65, hp: 0, downed: true });
  Object.assign(medic, { x: house.x - 14, y: casualty.y });
  assert.ok(Math.hypot(medic.x - casualty.x, medic.y - casualty.y) < 40);
  assert.equal(hasLineOfSight(game, medic, casualty), false);
  step(game, {}, 1 / 30);
  assert.equal(casualty.reviveProgress, 0, 'proximity alone must not heal through the wall');
  assert.equal(medic.moving, true, 'the nearby wall does not satisfy the path stopping distance');
  run(game, 14);
  assert.equal(casualty.downed, false);
  assert.ok(casualty.hp > 0);
});

test('human interaction also requires a clear route to the casualty', () => {
  const game = quietGame(), actor = player(game), casualty = game.squad[1], house = broadHouse(game);
  Object.assign(actor, { x: house.x - 14, y: house.y + 65 });
  Object.assign(casualty, { x: house.interior.x + 14, y: actor.y, hp: 0, downed: true });
  step(game, { interact: true }, 1 / 30);
  assert.equal(casualty.reviveProgress, 0);
  Object.assign(actor, { x: casualty.x + 30, y: casualty.y });
  step(game, { interact: true }, 1 / 30);
  assert.ok(casualty.reviveProgress > 0);
});

test('two co-op humans use the same door and wall collision as local movement prediction', () => {
  const game = quietGame(), house = broadHouse(game), humanIds = game.squad.slice(0, 2).map(actor => actor.id);
  setHumanPlayers(game, humanIds);
  const door = house.doors[1], controls = { moveY: -1 };
  for (let index = 0; index < 2; index++) Object.assign(game.squad[index], { x: door.x + (index ? 15 : -15), y: door.y + 8 });
  const predicted = game.squad.slice(0, 2).map(actor => predictMovement(actor, controls, .2, game.world));
  for (let tick = 0; tick < 12; tick++) stepCoop(game, Object.fromEntries(humanIds.map(id => [id, controls])), 1 / 60);
  for (let index = 0; index < 2; index++) {
    assert.ok(Math.hypot(game.squad[index].x - predicted[index].x, game.squad[index].y - predicted[index].y) < 1e-8);
    assert.equal(buildingAt(game.world, game.squad[index]), house);
  }
  assert.equal(game.squad.length, 4); assert.equal(game.humanIds.length, 2);
  const actor = game.squad[0]; Object.assign(actor, { x: house.x - 14, y: house.y + 65 });
  const blocked = predictMovement(actor, { moveX: 1 }, .2, game.world);
  for (let tick = 0; tick < 12; tick++) stepCoop(game, { [actor.id]: { moveX: 1 } }, 1 / 60);
  assert.ok(Math.abs(actor.x - blocked.x) < 1e-8); assert.ok(actor.x + actor.radius < house.x);
});

test('co-op hydration rebuilds identical static interiors from the authoritative seed', () => {
  const original = quietGame({ mission: 2, seed: 2468 });
  const { world, grid, stages, ...state } = original;
  const packet = { state, init: { seed: 2468, mission: 2, difficulty: 'standard', epoch: 1 }, room: { code: 'ABCDEF', players: [{ id: 'human', actorId: original.playerId, role: 'leader' }] }, selfId: 'human' };
  const hydrated = new CoopStateHydrator().apply(packet, 'human').game;
  assert.deepEqual(hydrated.world.walls, world.walls);
  assert.deepEqual(hydrated.world.buildings, world.buildings);
  assert.deepEqual(hydrated.grid, grid);
});

test('legacy and custom worlds retain solid-footprint collision when interior data is absent', () => {
  const footprint = { id: 'solid', x: 100, y: 100, w: 80, h: 90 }, world = { buildings: [footprint] };
  assert.equal(getSolidWalls(world), world.buildings);
  assert.equal(buildingAt(world, { x: 120, y: 120 }), null);
  assert.equal(traceAim(world, { x: 20, y: 130 }, { x: 200, y: 130 }).blocked, true);
  prepareBuildingInteriors(world);
  assert.deepEqual(getSolidWalls(world), [footprint]);
  assert.equal(buildingAt(world, { x: NaN, y: 120 }), null);
  assert.deepEqual(getSolidWalls({}), []);
});
