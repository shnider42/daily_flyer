import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, LEVELS, ITEMS, ALL_OBJECTS, MAX_HINTS, PIPE_SOLUTION,
  newGame, reduce, availableRooms, getObjects, hasItem, isDone, isInspected,
  inspect, objective, getHints, scanPhase, pipePorts, evaluateCircuit, isValidState,
} from '../public/world.mjs';

const NOW = 6000;
const interact = id => ({ type: 'interact', id });
const solve = (id, value) => ({ type: 'solve', id, value });
function apply(state, action, now = NOW) {
  const result = reduce(state, action, { now });
  assert.equal(result.ok, true, `${JSON.stringify(action)}: ${result.message}`);
  assert.equal(isValidState(result.state), true, 'every resulting state is a loadable save');
  return result.state;
}
function sequence(state, actions) { return actions.reduce((s, a) => apply(s, a), state); }
const wing0 = [interact('bunk'), interact('cellDoor'), solve('laundryLocker', '714'), interact('intakeDoor'), interact('transferDesk'), interact('transferDoor')];
const wing1 = [interact('cleaningCart'), interact('controlDoor'), solve('switchboard', [true, false, true]), interact('keyCage'), interact('archiveDoor')];
const wing2 = [interact('maintenanceDesk'), interact('turbineDoor'), solve('powerGrid', PIPE_SOLUTION), interact('seawallBox'), interact('seawallGate')];
const toWing1 = () => apply(sequence(newGame({ now: 0 }), wing0), { type: 'advance' });
const toWing2 = () => apply(sequence(toWing1(), wing1), { type: 'advance' });

function reject(state, action, now = NOW) {
  const snapshot = JSON.stringify(state);
  const result = reduce(state, action, { now });
  assert.equal(result.ok, false, result.message);
  assert.equal(result.changed, false);
  assert.strictEqual(result.state, state);
  assert.equal(JSON.stringify(state), snapshot, 'rejected input does not mutate state');
  return result;
}

// This is the full intended play path, with no state fabrication or developer unlocks.
test('the three-wing campaign is completable from a fresh save using only legal actions', () => {
  let state = newGame({ now: 0 });
  assert.deepEqual(availableRooms(state).map(r => r.id), ['cell']);
  assert.equal(state.version, VERSION);
  state = sequence(state, wing0);
  assert.deepEqual(state.completedLevels, [0]);
  assert.equal(state.won, false);
  assert.equal(state.inventory.includes('intakeKey'), true);
  state = apply(state, { type: 'advance' });
  assert.equal(state.level, 1);
  assert.deepEqual(availableRooms(state).map(r => r.id), ['service']);
  state = sequence(state, wing1);
  assert.deepEqual(state.completedLevels, [0, 1]);
  state = apply(state, { type: 'advance' });
  assert.equal(state.level, 2);
  state = sequence(state, wing2);
  assert.equal(state.won, true);
  assert.deepEqual(state.completedLevels, [0, 1, 2]);
  assert.deepEqual(availableRooms(state).map(r => r.id), ['archive', 'turbine', 'yard']);
  assert.match(objective(state), /escaped/i);
  assert.equal(reduce(state, { type: 'advance' }).changed, false);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state, 'campaign state roundtrips through JSON');
  const fresh = newGame({ now: 123 });
  assert.equal(fresh.level, 0);
  assert.equal(fresh.won, false);
  assert.deepEqual(fresh.inventory, []);
  assert.deepEqual(fresh.hintsUsed, [0, 0, 0]);
});

test('room gates and key requirements cannot be skipped or satisfied by red herrings', () => {
  const initial = newGame({ now: 0 });
  reject(initial, interact('cellDoor'));
  reject(initial, interact('transferDesk'));
  reject(initial, solve('laundryLocker', '714'));
  reject(initial, interact('cleaningCart'));
  reject(initial, { type: 'advance' });
  const decoy = apply(initial, interact('drain'));
  assert.equal(ITEMS.rustedKey.decoy, true);
  reject(decoy, interact('cellDoor'));
  assert.equal(inspect(initial, 'laundryLocker'), null);
  assert.deepEqual(getObjects(initial, 'intake'), []);
  const gallery = sequence(decoy, wing0.slice(0, 2));
  assert.deepEqual(availableRooms(gallery).map(r => r.id), ['cell', 'gallery']);
  reject(gallery, interact('intakeDoor'));
  reject(gallery, solve('laundryLocker', '0915'));
  reject(gallery, solve('laundryLocker', '417'));
  reject(gallery, solve('laundryLocker', 714));
});

test('pickups, unlocked doors and inspected clues are idempotent and input state stays immutable', () => {
  const initial = newGame({ now: 0 });
  const snapshot = JSON.stringify(initial);
  const first = reduce(initial, interact('bunk'), { now: 100 });
  assert.equal(JSON.stringify(initial), snapshot);
  assert.equal(first.state.revision, 1);
  assert.equal(first.state.updatedAt, 100);
  assert.equal(first.changed, true);
  assert.equal(hasItem(first.state, 'brassKey'), true);
  assert.equal(isDone(first.state, 'bunk'), true);
  assert.equal(isInspected(first.state, 'bunk'), true);
  const duplicate = reduce(first.state, interact('bunk'), { now: 200 });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.changed, false);
  assert.strictEqual(duplicate.state, first.state);
  assert.deepEqual(first.state.inventory, ['brassKey']);
  const opened = apply(first.state, interact('cellDoor'));
  assert.equal(isDone(opened, 'cellDoor'), true);
  assert.strictEqual(reduce(opened, interact('cellDoor')).state, opened);
  const viewed = apply(opened, interact('scratches'));
  assert.equal(inspect(viewed, 'scratches').viewed, true);
  assert.equal(inspect(viewed, 'bunk').owned, true);
  assert.strictEqual(reduce(viewed, interact('scratches')).state, viewed);
  assert.deepEqual(viewed.inspected.filter(id => id === 'scratches'), ['scratches']);
});

test('three hints are contextual, durable, and capped separately for each level', () => {
  let state = newGame({ now: 0 });
  assert.match(getHints(state).next, /bunk|blanket/i);
  state = apply(state, { type: 'hint' });
  const originalHint = state.hintLog[0][0];
  state = sequence(state, wing0.slice(0, 2));
  assert.match(getHints(state).next, /triangle|marks|count/i);
  state = apply(state, { type: 'hint' });
  state = apply(state, { type: 'hint' });
  assert.equal(state.hintsUsed[0], MAX_HINTS);
  assert.match(state.hintLog[0][2], /714/);
  assert.equal(state.hintLog[0][0], originalHint);
  assert.equal(getHints(state).remaining, 0);
  assert.equal(getHints(state).next, null);
  reject(state, { type: 'hint' });
  state = sequence(state, wing0.slice(2));
  reject(state, { type: 'hint' });
  state = apply(state, { type: 'advance' });
  assert.equal(getHints(state).remaining, 3);
  for (let i = 0; i < MAX_HINTS; i++) state = apply(state, { type: 'hint' });
  reject(state, { type: 'hint' });
  assert.deepEqual(state.hintsUsed, [3, 3, 0]);
  state = sequence(state, wing1);
  state = apply(state, { type: 'advance' });
  for (let i = 0; i < MAX_HINTS; i++) state = apply(state, { type: 'hint' });
  reject(state, { type: 'hint' });
  assert.deepEqual(state.hintsUsed, [3, 3, 3]);
  assert.equal(state.hintLog.every(log => log.length === 3), true);
});

test('the visual surveillance window uses authority time and a failed reach never loses progress', () => {
  let state = toWing1();
  reject(state, interact('keyCage'), 6000);
  state = apply(state, interact('visitorCard'));
  reject(state, interact('controlDoor'));
  state = sequence(state, wing1.slice(0, 2));
  reject(state, solve('switchboard', [true, true, true]));
  reject(state, solve('switchboard', [1, 0, 1]));
  reject(state, interact('evidenceDoor'));
  state = apply(state, wing1[2]);
  assert.deepEqual(availableRooms(state).map(r => r.id), ['service', 'control', 'evidence']);
  reject(state, interact('keyCage'), 4999);
  reject(state, { ...interact('keyCage'), now: 6000, safe: true }, 8000);
  reject(state, interact('archiveDoor'));
  assert.equal(scanPhase(4999).safe, false);
  assert.equal(scanPhase(5000).safe, true);
  assert.equal(scanPhase(7999).safe, true);
  assert.equal(scanPhase(8000).safe, false);
  assert.equal(scanPhase(13000).safe, true);
  assert.equal(scanPhase(5000).remaining, 3);
  const key = reduce(state, interact('keyCage'), { now: 5000, server: true });
  assert.equal(key.ok, true);
  assert.equal(key.state.inventory.includes('evidenceKey'), true);
  assert.equal(reduce(key.state, interact('keyCage'), { now: 8000 }).changed, false, 'a second player can safely replay the pickup after the window closes');
});

test('conduit validation follows connected ports and permits a second valid route', () => {
  assert.deepEqual(pipePorts('elbow', 0), [0, 1]);
  assert.deepEqual(pipePorts('elbow', 3), [3, 0]);
  assert.equal(evaluateCircuit(ALL_OBJECTS.powerGrid.puzzle.initial).connected, false);
  const top = evaluateCircuit(PIPE_SOLUTION);
  assert.equal(top.connected, true);
  assert.deepEqual(top.path, [3, 0, 1, 2, 5]);
  const bottom = [0, 0, 0, 2, 0, 1, 0, 1, 3];
  const second = evaluateCircuit(bottom);
  assert.equal(second.connected, true);
  assert.deepEqual(second.path, [3, 6, 7, 8, 5]);
  for (const invalid of [null, [], [...PIPE_SOLUTION, 0], PIPE_SOLUTION.map(String), [NaN, ...PIPE_SOLUTION.slice(1)], [4, ...PIPE_SOLUTION.slice(1)]]) {
    assert.equal(evaluateCircuit(invalid).valid, false);
    assert.equal(evaluateCircuit(invalid).connected, false);
  }
  let state = toWing2();
  reject(state, interact('seawallBox'));
  reject(state, solve('powerGrid', PIPE_SOLUTION));
  state = sequence(state, wing2.slice(0, 2));
  reject(state, interact('yardDoor'));
  reject(state, solve('powerGrid', ALL_OBJECTS.powerGrid.puzzle.initial));
  const original = [...bottom];
  state = apply(state, solve('powerGrid', bottom));
  bottom[0] = 3;
  assert.deepEqual(state.flags.pipeRotations, original, 'submitted arrays cannot mutate saved puzzle state');
  reject(state, interact('seawallGate'));
  const decoy = apply(state, interact('returnGate'));
  assert.equal(decoy.won, false);
  assert.equal(decoy.level, 2);
  assert.equal(decoy.inventory.length, state.inventory.length);
  state = sequence(decoy, wing2.slice(3));
  assert.equal(state.won, true);
});

test('unknown actions and malformed saves fail cleanly without mutations', () => {
  const state = newGame({ now: 0 });
  for (const action of [null, [], {}, { type: 'reset' }, { type: 'restart' }, interact('missing'), interact('__proto__'), interact('constructor'), interact({}), solve('bunk', '714')]) reject(state, action);
  for (const altered of [null, {}, { ...state, version: 'old' }, { ...state, level: 3 }, { ...state, hintsUsed: [4, 0, 0] }, { ...state, inventory: ['inventedKey'] }, { ...state, hintsUsed: [1, 0, 0] }, { ...state, completedLevels: [0, 1, 2] }, { ...state, won: true }, { ...state, startedAt: NaN }]) {
    assert.equal(isValidState(altered), false);
    assert.equal(reduce(altered, interact('bunk')).ok, false);
  }
  const corruptedFinal = { ...toWing2(), completedLevels: [0, 1, 2], won: false };
  assert.equal(reduce(corruptedFinal, { type: 'advance' }).ok, false, 'inconsistent final saves cannot advance past campaign bounds');
});

test('level data references valid rooms, keys, and readable visual clues', () => {
  const ids = LEVELS.flatMap(l => l.objects.map(o => o.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(LEVELS.length, 3);
  for (const level of LEVELS) {
    assert.equal(level.rooms.length, 3);
    assert.equal(level.rooms.some(r => r.id === level.startRoom), true);
    for (const object of level.objects) {
      assert.equal(level.rooms.some(r => r.id === object.room), true, object.id);
      assert.equal(object.position.x >= 0 && object.position.x <= 10, true);
      assert.equal(object.position.y >= 0 && object.position.y <= 10, true);
      for (const item of [object.item, object.key, ...(object.keys || [])].filter(Boolean)) assert.ok(ITEMS[item], item);
      if (object.opens) assert.equal(level.rooms.some(r => r.id === object.opens), true);
    }
  }
  const counts = Object.fromEntries(ALL_OBJECTS.scratches.clue.entries.map(e => [e.symbol, e.count]));
  assert.equal(ALL_OBJECTS.laundryLocker.puzzle.symbols.map(symbol => counts[symbol]).join(''), '714');
  assert.deepEqual(ALL_OBJECTS.wiringDiagram.clue.entries.map(e => e.on), [true, false, true]);
  assert.equal(ALL_OBJECTS.evacuationPlan.clue.routes.filter(route => route.escape).length, 1);
});
