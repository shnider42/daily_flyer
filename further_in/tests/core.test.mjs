import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL, PATTERN, createGame, update, interact, target, pulse,
  beginChase, developerAction, finalHall, pathBetween, openAt, distance,
} from '../dist/core.mjs';

const at = (x, z) => ({ x: (x + .5) * CELL, z: (z + .5) * CELL });

function advance(state, seconds, input = {}) {
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i++) update(state, input, 1 / 60);
  return state;
}

function chooseDoor(state, id) {
  const door = state.doors.find(d => d.id === id);
  assert.ok(door, `Door ${id} exists`);
  state.player = { ...state.player, x: door.x, z: door.z };
  assert.equal(target(state)?.kind, 'door');
  assert.equal(interact(state), true);
  for (let i = 0; state.transition && i < 60; i++) update(state, {}, 1 / 60);
  assert.equal(state.transition, null);
}

function reachableFloorCount(state) {
  const start = [Math.floor(state.player.x / CELL), Math.floor(state.player.z / CELL)];
  const todo = [start], visited = new Set([start.join(',')]);
  for (let i = 0; i < todo.length; i++) {
    const [x, z] = todo[i];
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const key = `${nx},${nz}`;
      if (state.map[nz]?.[nx] === 0 && !visited.has(key)) {
        visited.add(key);
        todo.push([nx, nz]);
      }
    }
  }
  return visited.size;
}

test('all three floors start independently, with reproducible seeds', () => {
  for (const level of [1, 2, 3]) {
    const first = createGame(level, 104), replay = createGame(level, 104);
    assert.equal(first.level, level);
    assert.equal(first.status, 'playing');
    assert.equal(first.tool, false);
    assert.ok(openAt(first.map, first.player.x, first.player.z));
    assert.deepEqual(first.map, replay.map);
    assert.equal(first.ghostDoor, replay.ghostDoor);
  }
  assert.equal(createGame(1, 104).phase, 'explore');
  assert.equal(createGame(2, 104).chasing, false);
  assert.equal(createGame(3, 104).phase, 'garden');
});

test('the first floor loops on mistakes and only exits on the remembered rhythm', () => {
  const state = createGame(1, 104);
  chooseDoor(state, 2);
  assert.equal(state.pattern, 0);
  assert.equal(state.status, 'playing');
  chooseDoor(state, 1);
  assert.equal(state.pattern, 1);
  chooseDoor(state, 3);
  assert.equal(state.pattern, 0);
  assert.equal(state.loops, 3);
  for (const id of PATTERN) chooseDoor(state, id);
  assert.equal(state.status, 'next');
  assert.equal(state.nextLevel, 2);
  assert.equal(state.loops, 7);
});

test('the first floor allows just one distant glimpse across repeated loops', () => {
  const state = createGame(1, 104);
  state.time = 27;
  state.player = { ...at(11, 13), yaw: 0, pitch: 0 };
  update(state);
  assert.equal(state.events.filter(event => event.type === 'glimpse').length, 1);
  assert.ok(state.glimpseUntil - state.time < .4);
  chooseDoor(state, 2);
  state.player = { ...at(11, 13), yaw: 0, pitch: 0 };
  advance(state, 90);
  assert.equal(state.events.filter(event => event.type === 'glimpse').length, 1);
  assert.ok(state.events.filter(event => event.type === 'distant').length <= 4);
  assert.equal(state.status, 'playing');
});

test('200 yellow-room seeds keep every room, the tool, and the random exit reachable', () => {
  const exits = new Set(), timings = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const state = createGame(2, seed);
    const totalFloor = state.map.flat().filter(cell => cell === 0).length;
    assert.equal(reachableFloorCount(state), totalFloor, `Connected map for seed ${seed}`);
    assert.ok(pathBetween(state.map, state.player, state.hole).length > 1);
    assert.ok(pathBetween(state.map, state.player, state.items[0]).length > 0);
    assert.ok(openAt(state.map, state.hole.x, state.hole.z));
    assert.ok(state.chaseAt >= 45 && state.chaseAt < 70);
    exits.add(`${state.hole.x},${state.hole.z}`);
    timings.add(state.chaseAt);
  }
  assert.equal(exits.size, 5);
  assert.equal(timings.size, 200);
});

test('the yellow rooms stay quiet before their random pursuit threshold', () => {
  const state = createGame(2, 104);
  state.explored = 17;
  advance(state, 44);
  assert.equal(state.chasing, false);
  assert.equal(state.events.some(event => ['distant', 'glimpse', 'screech'].includes(event.type)), false);
  state.time = state.chaseAt + .01;
  update(state);
  assert.equal(state.chasing, true);
  assert.equal(state.events.filter(event => event.type === 'screech').length, 1);
  assert.ok(distance(state.entity, state.player) > 15);
  beginChase(state);
  assert.equal(state.events.filter(event => event.type === 'screech').length, 1);
});

test('the yellow-room pursuer remains on walkable floor while following moving targets', () => {
  let checkedFrames = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const state = createGame(2, seed);
    beginChase(state);
    const destinations = [at(3, 3), at(27, 3), at(27, 27), at(3, 27)];
    let route = [], destination = 0;
    for (let frame = 0; frame < 3600 && state.status === 'playing'; frame++) {
      if (!route.length) route = pathBetween(state.map, state.player, destinations[destination++ % 4]).slice(1);
      const next = route[0];
      if (next) {
        state.player.yaw = Math.atan2(next.x - state.player.x, state.player.z - next.z);
        if (distance(state.player, next) < .12) route.shift();
      }
      state.stamina = 1; // Keep this route/collision test running beyond a normal sprint.
      update(state, { forward: next ? 1 : 0, run: true }, 1 / 60);
      assert.ok(openAt(state.map, state.entity.x, state.entity.z), `Pursuer stayed on floor, seed ${seed}`);
      checkedFrames++;
      if (state.transition) break;
    }
  }
  assert.ok(checkedFrames > 10000);
});

test('the resonator is collected, cannot kill, respects aim/walls, and becomes less effective', () => {
  const state = createGame(2, 104);
  state.player = { ...state.player, ...state.items[0] };
  assert.equal(interact(state), true);
  assert.equal(state.tool, true);
  assert.equal(state.items.some(item => item.kind === 'tool'), false);
  state.map = Array.from({ length: 9 }, (_, z) => Array.from({ length: 9 }, (_, x) => x && z && x < 8 && z < 8 ? 0 : 1));
  state.player = { ...at(4, 5), yaw: 0, pitch: 0 };
  state.entity = { ...at(4, 2), stunned: 0 };
  assert.equal(pulse(state), true);
  const firstStun = state.entity.stunned;
  assert.equal(state.stunCount, 1);
  assert.equal(pulse(state), false, 'Cooling down blocks another pulse');
  state.cooldown = 0;
  assert.equal(pulse(state), true);
  assert.ok(state.entity.stunned < firstStun);
  assert.equal(state.status, 'playing');
  assert.ok(state.entity);
  state.cooldown = 0;
  state.map[3][4] = 1;
  pulse(state);
  assert.equal(state.stunCount, 2, 'A wall blocks the pulse');
  state.map[3][4] = 0;
  state.cooldown = 0;
  state.player.yaw = Math.PI;
  pulse(state);
  assert.equal(state.stunCount, 2, 'Facing away misses the pursuer');
});

test('dropping through the hole advances to the third floor', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const state = createGame(2, seed);
    developerAction(state, 'hole');
    assert.ok(openAt(state.map, state.player.x, state.player.z), `Safe test position for seed ${seed}`);
    assert.equal(target(state)?.kind, 'hole');
    assert.equal(interact(state), true);
    advance(state, 1.3);
    assert.equal(state.status, 'next');
    assert.equal(state.nextLevel, 3);
  }
});

test('beauty gives way to black, then every available door advances toward a 7–9-door ending', () => {
  const thresholds = new Set(), maps = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const state = createGame(3, seed);
    advance(state, 4.5);
    assert.equal(state.phase, 'garden');
    advance(state, .5);
    assert.equal(state.phase, 'blackout');
    advance(state, 2.2);
    assert.equal(state.phase, 'doors');
    assert.equal(state.choices, 0);
    thresholds.add(state.ghostDoor);
    for (let choice = 0; choice < state.ghostDoor; choice++) {
      assert.equal(state.phase, 'doors');
      assert.equal(state.choices, choice);
      maps.add(JSON.stringify(state.map));
      for (const door of state.doors) assert.ok(pathBetween(state.map, state.player, door).length > 0);
      assert.equal(state.props.some(prop => prop.kind === 'closedDoor'), true);
      const door = state.doors[(seed + choice) % state.doors.length];
      chooseDoor(state, door.id);
    }
    assert.equal(state.phase, 'ghost');
    assert.equal(state.choices, state.ghostDoor);
    assert.equal(state.events.filter(event => event.type === 'door-close').length, state.ghostDoor);
  }
  assert.deepEqual([...thresholds].sort(), [7, 8, 9]);
  assert.ok(maps.size > 100);
});

test('the ghost is defeated only by staying still and looking at it', () => {
  const state = createGame(3, 104);
  finalHall(state);
  state.player.yaw = Math.PI;
  const startingDistance = distance(state.entity, state.player);
  advance(state, 4);
  assert.equal(state.status, 'playing');
  assert.equal(distance(state.entity, state.player), startingDistance);
  advance(state, .7);
  assert.equal(state.status, 'won');
  assert.equal(state.medal, false);
  assert.equal(state.events.filter(event => event.type === 'release').length, 1);

  for (const scenario of ['look-away', 'look-too-high', 'move-while-looking']) {
    const other = createGame(3, 104);
    finalHall(other);
    if (scenario !== 'look-away') other.player.yaw = Math.PI;
    if (scenario === 'look-too-high') other.player.pitch = .7;
    advance(other, 15, scenario === 'move-while-looking' ? { forward: -1, run: true } : {});
    assert.equal(other.status, 'lost', scenario);
    assert.equal(other.medal, false, scenario);
  }
});

test('running away loses; charging the ghost awards the medal but still loses', () => {
  const fleeing = createGame(3, 104);
  finalHall(fleeing);
  advance(fleeing, 20, { forward: 1, run: true });
  assert.equal(fleeing.status, 'lost');
  assert.equal(fleeing.medal, false);

  const charging = createGame(3, 104);
  finalHall(charging);
  charging.player.yaw = Math.PI;
  advance(charging, 8, { forward: 1, run: true });
  assert.equal(charging.status, 'lost');
  assert.equal(charging.medal, true);
  assert.equal(charging.events.filter(event => event.type === 'medal').length, 1);
  const capturedPosition = { ...charging.player }, capturedEntity = { ...charging.entity };
  advance(charging, 5, { forward: 1, turn: 1, run: true });
  assert.deepEqual(charging.player, capturedPosition);
  assert.deepEqual(charging.entity, capturedEntity);
});

test('ghost contact is resolved in the same frame, before a last-second stare can freeze it', () => {
  const state = createGame(3, 104);
  finalHall(state);
  state.entity.z = state.player.z + 1;
  state.phaseTime = 2;
  update(state, {}, .05);
  assert.equal(state.status, 'lost');
  state.player.yaw = Math.PI;
  advance(state, 6);
  assert.equal(state.status, 'lost');
});

test('testing jumps cannot be overwritten by a doorway transition already in progress', () => {
  const state = createGame(3, 104);
  advance(state, 7);
  const door = state.doors[0];
  state.player = { ...state.player, x: door.x, z: door.z };
  interact(state);
  assert.ok(state.transition);
  developerAction(state, 'ghost');
  assert.equal(state.transition, null);
  advance(state, 1);
  assert.equal(state.phase, 'ghost');
  assert.equal(state.status, 'playing');

  const pattern = createGame(1, 104);
  developerAction(pattern, 'pattern');
  assert.equal(target(pattern)?.id, 1);
  interact(pattern);
  advance(pattern, .7);
  assert.equal(pattern.nextLevel, 2);
});
