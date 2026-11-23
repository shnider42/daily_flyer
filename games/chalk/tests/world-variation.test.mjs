import test from 'node:test';
import assert from 'node:assert/strict';
import { varyWorldLayout } from '../public/world-variation.mjs';
import { createGame, findPath, segmentRectEntry } from '../public/sim.mjs';
import { getSolidWalls } from '../public/building-geometry.mjs';
import { CoopStateHydrator } from '../public/coop-client.mjs';

const SEEDS = [0, 1, 17, 19931003, 0xffffffff];
const XS = [200, 680, 1160, 1640, 2120], YS = [200, 580, 960, 1340, 1720];
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const geometry = world => world.buildings.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));

function assertClearRoute(game, from, to, label) {
  const route = findPath(game, from, to);
  assert.ok(route.length, `${label}: route exists`);
  let previous = from;
  for (const point of route) {
    assert.ok(getSolidWalls(game.world).every(wall => !Number.isFinite(segmentRectEntry(previous, point, wall, 13))), `${label}: route clears soldier radius`);
    previous = point;
  }
  assert.ok(Math.hypot(previous.x - to.x, previous.y - to.y) < 1e-6, `${label}: reaches the requested destination`);
}

test('a replay seed changes playable footprints and districts without changing the mission street grid', () => {
  for (let mission = 0; mission < 6; mission++) {
    const games = SEEDS.map(seed => createGame({ mission, seed }));
    const signatures = games.map(game => JSON.stringify(geometry(game.world).filter(building => !/^b30/.test(building.id))));
    assert.equal(new Set(signatures).size, SEEDS.length, `mission ${mission}: every seed changes usable building geometry`);
    for (const game of games) {
      assert.equal(game.world.layoutVersion, 2, 'simulation invokes shared variation before preparing interiors');
      assert.equal(game.world.layoutSeed, game.seed >>> 0);
      assert.equal(game.world.width, 2400); assert.equal(game.world.height, 1900);
      assert.deepEqual(game.world.roads, games[0].world.roads);
      assert.equal(game.world.districts.length, 16);
      assert.ok(new Set(game.world.districts.map(district => district.variant)).size >= 3);
      assert.ok(game.world.buildings.some(building => building.rooms.length === 2), 'wide divided homes remain available');
      assert.ok(game.world.buildings.length <= 32, 'static geometry stays bounded');
    }
  }
});

test('variation is deterministic, independent of Math.random, and mission-specific', () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => { throw new Error('world layout must use the shared seed'); };
    for (let mission = 0; mission < 6; mission++) for (const seed of SEEDS) {
      const a = createGame({ mission, seed }), b = createGame({ mission, seed });
      assert.deepEqual(a.world, b.world);
      assert.deepEqual(a.grid, b.grid);
      const fixture = { buildings: [{ id: 'b30a', x: 290, y: 1426, w: 130, h: 205, tone: .5 }], props: [] };
      varyWorldLayout(fixture, seed, mission);
      const firstLayout = structuredClone(fixture);
      varyWorldLayout(fixture, seed, mission);
      assert.deepEqual(fixture, firstLayout, 'reapplying variation does not accumulate geometry or decoration');
    }
    const missionLayouts = Array.from({ length: 6 }, (_, mission) => JSON.stringify(geometry(createGame({ mission, seed: 123 }).world)));
    assert.equal(new Set(missionLayouts).size, 6);
  } finally { Math.random = originalRandom; }
});

test('all varied homes have legal doors, street approaches, rooms, and passable alleys', () => {
  for (let mission = 0; mission < 6; mission++) for (const seed of SEEDS) {
    const game = createGame({ mission, seed });
    for (const building of game.world.buildings) {
      const district = game.world.districts.find(item => item.id === building.districtId);
      const label = `${mission}/${seed}/${building.id}`;
      assert.ok(building.w >= 110 && building.h >= 150, `${label}: room and doorway minimum dimensions`);
      assert.ok(game.world.buildings.every(other => other === building || !overlaps(building, other)), `${label}: no overlapping houses`);
      assert.ok(game.world.roads.every(road => !overlaps(building, road)), `${label}: established roads remain open`);
      assert.equal(building.enterable, true); assert.equal(building.doors.length, 2);
      for (const door of building.doors) {
        assert.equal(door.width, 80);
        assert.equal((door.x - 20) % 40, 0, `${label}: navigation column aligns with the doorway`);
        const street = { x: door.x, y: YS[district.row + (door.side === 'south' ? 1 : 0)] };
        assertClearRoute(game, street, door.inside, `${label}/${door.side} street entry`);
        for (const room of building.rooms) {
          const center = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
          assertClearRoute(game, door.inside, center, `${label}/${door.side} room entry`);
          assertClearRoute(game, center, street, `${label}/${door.side} street exit`);
        }
      }
    }
    for (const district of game.world.districts.filter(item => item.variant === 'alley' || item.variant === 'court')) {
      const pair = game.world.buildings.filter(building => building.districtId === district.id).sort((a, b) => a.x - b.x);
      assert.equal(pair.length, 2);
      const x = (pair[0].x + pair[0].w + pair[1].x) / 2;
      assert.ok(pair[1].x - pair[0].x - pair[0].w >= 40, 'split blocks retain a soldier-width alley');
      assertClearRoute(game, { x, y: YS[district.row] }, { x, y: YS[district.row + 1] }, `${mission}/${seed}/${district.id} alley`);
    }
  }
});

test('the insertion doorway, every mission anchor, and full convoy route remain usable', () => {
  for (let mission = 0; mission < 6; mission++) for (const seed of SEEDS) {
    const game = createGame({ mission, seed }), spawn = { x: 200, y: 1720 };
    if (mission === 0) {
      const house = game.world.buildings.find(building => building.id === 'b30a');
      assert.ok(house); assert.equal(house.x, 290); assert.equal(house.y, 1426); assert.equal(house.h, 205);
      assert.equal(house.doors[1].x, 340); assert.equal(house.doors[1].y, 1631);
    }
    for (const point of [...game.stages, ...game.survivors, ...game.vehicles, ...(game.convoyRoute || [])]) {
      assertClearRoute(game, spawn, point, `${mission}/${seed} mission anchor ${point.x},${point.y}`);
    }
    for (const x of XS) {
      assert.ok(getSolidWalls(game.world).every(wall => !Number.isFinite(segmentRectEntry({ x, y: 50 }, { x, y: 1850 }, wall, 42))), 'vertical road remains wide enough for the convoy');
    }
    for (const y of YS) {
      assert.ok(getSolidWalls(game.world).every(wall => !Number.isFinite(segmentRectEntry({ x: 50, y }, { x: 2350, y }, wall, 42))), 'horizontal road remains wide enough for the convoy');
    }
  }
});

test('district finishes and varied street decoration are coherent and clear of buildings and doorways', () => {
  const seenTypes = new Set();
  for (let mission = 0; mission < 6; mission++) for (const seed of SEEDS) {
    const { world } = createGame({ mission, seed });
    for (const district of world.districts) {
      assert.ok(['residential', 'market', 'workshop', 'courtyard'].includes(district.kind));
      assert.ok(district.tone >= 0 && district.tone < 1);
      for (const building of world.buildings.filter(item => item.districtId === district.id)) {
        assert.equal(building.districtKind, district.kind);
        assert.ok(['plaster', 'masonry', 'workshop'].includes(building.style));
      }
    }
    const decorations = world.props.filter(prop => prop.layoutDecoration);
    assert.ok(decorations.length >= 8, 'each replay includes district decoration');
    for (const prop of decorations) {
      seenTypes.add(prop.type);
      assert.ok(world.roads.every(road => !overlaps(prop.layoutBounds, road)), 'decoration does not clutter the mission road');
      assert.ok(world.buildings.every(building => !overlaps(prop.layoutBounds, building)), 'decoration does not intersect a house');
      for (const building of world.buildings) for (const door of building.doors) {
        assert.equal(Number.isFinite(segmentRectEntry(door.inside, door.outside, prop.layoutBounds, 17)), false, 'doors do not lead into decorative vehicles or stalls');
      }
    }
    if (mission === 1) {
      assert.ok(world.districts.filter(district => [1, 2].includes(district.row) && [1, 2].includes(district.col)).every(district => district.kind === 'market'));
    }
  }
  assert.deepEqual([...seenTypes].sort(), ['crate', 'debris', 'oil-stain', 'rubble', 'stall']);
});

test('co-op hydration reconstructs the same varied neighbourhood and navigation grid', () => {
  for (let mission = 0; mission < 6; mission++) {
    const original = createGame({ mission, seed: 7721 });
    const { world, grid, stages, ...state } = original;
    const packet = { state, init: { seed: 7721, mission, difficulty: 'standard', epoch: 1 }, room: { code: 'ABCDEF', players: [{ id: 'human', actorId: original.playerId, role: 'leader' }] }, selfId: 'human' };
    const hydrated = new CoopStateHydrator().apply(packet, 'human').game;
    assert.deepEqual(hydrated.world, world);
    assert.deepEqual(hydrated.grid, grid);
  }
});
