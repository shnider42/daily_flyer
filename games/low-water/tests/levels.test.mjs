import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getLevel, floorAt, roomAt, collides, activeGate } from '../dist/levels.mjs';

const openState = { powerRouted: true, waterDrained: true, toolAccessible: true, bridgeAligned: true, coreStable: true, evacReady: true, tool: true, gantryPosition: 2 };

// A grid walker verifies physical paths rather than merely checking level data.
function reachable(level, state, target, start = level.spawn, tolerance = 1.1) {
  const step = 0.5;
  const startX = Math.round(start.x / step), startZ = Math.round(start.z / step);
  const queue = [[startX, startZ]], seen = new Set([`${startX},${startZ}`]);
  for (let i = 0; i < queue.length; i++) {
    const [gx, gz] = queue[i], x = gx * step, z = gz * step;
    if (Math.hypot(x - target.x, z - target.z) <= tolerance) return true;
    const height = floorAt(level, x, z, state);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx, nz = gz + dz, key = `${nx},${nz}`;
      if (seen.has(key) || collides(level, nx * step, nz * step, 0.3, state, height ?? 0)) continue;
      seen.add(key); queue.push([nx, nz]);
    }
  }
  return false;
}

test('five complete chapters have stable indices, unique interactables and valid notes', () => {
  assert.equal(LEVELS.length, 5);
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(level.index, index);
    assert.equal(getLevel(index), level);
    assert.ok(roomAt(level, level.spawn.x, level.spawn.z));
    assert.equal(collides(level, level.spawn.x, level.spawn.z, 0.3, openState, level.spawn.y), false, `${level.id} spawn is clear`);
    const ids = level.interactables.map(item => item.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const item of level.interactables.filter(item => item.type === 'note')) {
      assert.ok(level.notes.find(note => note.id === item.id), `Missing note ${item.id}`);
    }
  }
});

for (const level of LEVELS) {
  test(`${level.name}: exit has a physical route after solving its puzzle`, () => {
    assert.equal(reachable(level, openState, level.exit), true);
  });
  test(`${level.name}: the locked exit cannot be bypassed through another room`, () => {
    assert.equal(reachable(level, { ...openState, [level.exit.requires]: false }, level.exit), false);
  });
  test(`${level.name}: every usable object is physically approachable`, () => {
    for (const item of level.interactables) {
      assert.equal(reachable(level, openState, item, level.spawn, item.type === 'exit' ? 1.1 : 1.65), true, `${item.id} cannot be approached`);
    }
  });
}

test('the opening power puzzle can be reached before the freight gate opens', () => {
  const level = getLevel(0);
  for (const id of ['crane-breaker', 'exit-breaker']) {
    assert.ok(reachable(level, {}, level.interactables.find(item => item.id === id), level.spawn, 1.65));
  }
});

test('both intake valves are accessible without opening the flood interlock', () => {
  const level = getLevel(1);
  for (const id of ['intake-valve', 'bypass-valve']) {
    assert.ok(reachable(level, {}, level.interactables.find(item => item.id === id), level.spawn, 1.65));
  }
});

test('gantry controls cannot strand the player inside the tool bay', () => {
  const level = getLevel(2);
  const control = level.interactables.find(item => item.id === 'gantry-control');
  const recall = level.interactables.find(item => item.id === 'gantry-control-return');
  const tool = level.interactables.find(item => item.id === 'arc-tool');
  assert.ok(reachable(level, {}, control, level.spawn, 1.65));
  assert.equal(reachable(level, {}, tool, level.spawn, 1.1), false);
  assert.ok(reachable(level, { toolAccessible: true }, tool, level.spawn, 1.1));
  assert.ok(reachable(level, {}, recall, tool, 1.65));
  assert.ok(reachable(level, { toolAccessible: true }, control, tool, 1.65));
});

test('the raised east deck requires its ramp and supports a continuous floor', () => {
  const level = getLevel(2);
  assert.equal(floorAt(level, 37, 8), 0);
  assert.ok(Math.abs(floorAt(level, 37, 17) - 1) < 1e-9);
  assert.equal(floorAt(level, 37, 27), 2);
  assert.equal(collides(level, 33, 28, 0.3, openState, 0), true, 'Cannot step sideways onto a two-metre platform');
  assert.equal(collides(level, 37, 17.5, 0.3, openState, 1), false, 'Can walk up a shallow ramp');
});

test('the travelling bridge has no walkable floor until it is physically aligned', () => {
  const level = getLevel(2);
  assert.equal(floorAt(level, 44, 33, {}), null);
  assert.equal(collides(level, 44, 33, 0.3, {}, 2), true);
  assert.equal(floorAt(level, 44, 33, { bridgeAligned: true }), 2);
  assert.equal(collides(level, 44, 33, 0.3, openState, 2), false);
});

test('research cell partitions separate the test areas while leaving their entrances clear', () => {
  const level = getLevel(3);
  assert.equal(collides(level, 26, 25, 0.3, openState, 0), true);
  assert.equal(collides(level, 36, 25, 0.3, openState, 0), true);
  assert.equal(collides(level, 26, 19, 0.3, openState, 0), false);
  assert.equal(collides(level, 36, 19, 0.3, openState, 0), false);
});

test('room boundaries and state gates have explicit semantics', () => {
  assert.equal(floorAt(getLevel(0), -200, -200), null);
  assert.equal(roomAt(getLevel(0), -200, -200), null);
  assert.equal(activeGate({ requires: 'powerRouted' }, {}), true);
  assert.equal(activeGate({ requires: 'powerRouted' }, { powerRouted: true }), false);
  assert.equal(getLevel('listening-room').index, 3);
});
