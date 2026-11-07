import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, LEVELS, ROOMS, OBJECTS, ITEMS, MAX_HINTS, CAMPAIGNS,
  newGame, reduce, availableRooms, getObjects, hasItem, isDone, inspect,
  objective, getHint, getHints, scanPhase, isValidState, validateSave, objectView, getGuidance,
} from '../public/world.mjs';

const SAFE_TIME = 6000;
const interact = id => ({ type: 'interact', id, room: OBJECTS[id]?.room });
const solve = (id, value) => ({ type: 'solve', id, value, room: OBJECTS[id]?.room });
const route = ['gate', 'eye', 'lamp', 'moon'];
const act0 = [interact('bunkPocket'), interact('holdingDoor'), solve('routeCabinet', route), interact('recordsDoor'), interact('transferDesk'), interact('transferExit')];
const act1 = [interact('laundryCart'), interact('watchroomDoor'), solve('authorisationPanel', '846'), interact('dispatchShutter'), interact('dispatchDesk'), interact('dispatchExit')];
const act2 = [interact('toolChest'), interact('sluiceDoor'), solve('valveBank', [2, 4, 1]), interact('quayDoor'), interact('keeperBox'), interact('quayExit')];

function apply(state, action, now = SAFE_TIME, options = {}) {
  const before = JSON.stringify(state);
  const result = reduce(state, action, { now, ...options });
  assert.equal(result.ok, true, `${JSON.stringify(action)}: ${result.message}`);
  assert.equal(JSON.stringify(state), before, 'the reducer does not mutate its input');
  assert.equal(isValidState(result.state), true, 'every accepted state can be loaded');
  assert.equal(result.state.revision, state.revision + (result.changed ? 1 : 0));
  return result;
}
const sequence = (state, actions) => actions.reduce((current, action) => apply(current, action).state, state);
const toAct1 = () => sequence(newGame({ now: 0 }), act0);
const toAct2 = () => sequence(toAct1(), act1);
function reject(state, action, now = SAFE_TIME, options = {}) {
  const before = JSON.stringify(state);
  const result = reduce(state, action, { now, ...options });
  assert.equal(result.ok, false, `${JSON.stringify(action)} should fail`);
  assert.equal(result.changed, false);
  assert.strictEqual(result.state, state);
  assert.equal(JSON.stringify(state), before);
  return result;
}

test('a full legal campaign crosses nine rooms and exits advance acts automatically', () => {
  let state = newGame({ now: 0 });
  assert.equal(state.version, VERSION);
  assert.equal(state.campaign, 'escape');
  assert.deepEqual(availableRooms(state).map(room => room.id), ['holding']);
  assert.match(objective(state), /Holding 41/);
  for (const action of act0.slice(0, -1)) state = apply(state, action).state;
  assert.deepEqual(availableRooms(state).map(room => room.id), ['holding', 'washroom', 'records']);
  const firstExit = apply(state, act0.at(-1));
  assert.deepEqual(firstExit.event, { type: 'level', level: 1, room: 'laundry' });
  state = firstExit.state;
  assert.deepEqual(state.completedLevels, [0]);
  assert.deepEqual(availableRooms(state).map(room => room.id), ['laundry']);
  for (const action of act1.slice(0, -1)) state = apply(state, action).state;
  assert.deepEqual(availableRooms(state).map(room => room.id), ['laundry', 'watchroom', 'dispatch']);
  const secondExit = apply(state, act1.at(-1));
  assert.deepEqual(secondExit.event, { type: 'level', level: 2, room: 'boiler' });
  state = secondExit.state;
  assert.deepEqual(state.completedLevels, [0, 1]);
  for (const action of act2.slice(0, -1)) state = apply(state, action).state;
  assert.deepEqual(availableRooms(state).map(room => room.id), ['boiler', 'sluice', 'quay']);
  const finalExit = apply(state, act2.at(-1));
  state = finalExit.state;
  assert.equal(state.level, 2);
  assert.equal(state.won, true);
  assert.equal(finalExit.event.type, 'win');
  assert.deepEqual(state.completedLevels, [0, 1, 2]);
  assert.match(objective(state), /escaped Ashgate/);
  assert.deepEqual(validateSave(JSON.stringify(state)), state);
  assert.equal(apply(state, act2.at(-1)).changed, false, 'a repeated final interaction is harmless');
});

test('keys and sequential room gates cannot be bypassed', () => {
  let state = newGame({ now: 0 });
  reject(state, interact('holdingDoor'));
  reject(state, solve('routeCabinet', route));
  reject(state, interact('transferDesk'));
  reject(state, interact('laundryCart'));
  reject(state, { type: 'enter', room: 'washroom' });
  assert.equal(inspect(state, 'routeCabinet'), null);
  assert.deepEqual(getObjects(state, 'records'), []);
  state = apply(state, interact('floorDrain')).state;
  assert.equal(ITEMS.bentKey.decoy, true);
  reject(state, interact('holdingDoor'));
  state = sequence(state, act0.slice(0, 2));
  reject(state, interact('recordsDoor'));
  assert.deepEqual(availableRooms(state).map(room => room.id), ['holding', 'washroom']);
  state = sequence(state, act0.slice(2, 4));
  reject(state, interact('transferExit'));
  const third = toAct2();
  reject(third, interact('keeperBox'));
  reject(third, solve('valveBank', [2, 4, 1]));
  let sluice = sequence(third, act2.slice(0, 2));
  reject(sluice, interact('quayDoor'));
  sluice = sequence(sluice, act2.slice(2, 4));
  reject(sluice, interact('quayExit'));
});

test('room entry is personal and validates the current act without adding position to shared state', () => {
  let state = sequence(newGame({ now: 0 }), act0.slice(0, 2));
  const enter = apply(state, { type: 'enter', room: 'washroom' });
  assert.strictEqual(enter.state, state);
  assert.equal(enter.changed, false);
  assert.deepEqual(enter.event, { type: 'room', room: 'washroom' });
  assert.equal('room' in enter.state, false);
  assert.equal('position' in enter.state, false);
  assert.deepEqual(apply(state, interact('washReturn')).event, { type: 'room', room: 'holding' });
  reject(state, { ...interact('routeCabinet'), room: 'holding' });
  reject(state, solve('routeCabinet', route), SAFE_TIME, { playerRoom: 'holding' });
  state = apply(state, solve('routeCabinet', route), SAFE_TIME, { playerRoom: 'washroom' }).state;
  assert.equal(hasItem(state, 'fileKey'), true);
  reject(state, { type: 'enter', room: '__proto__' });
  reject(state, { type: 'enter', room: 'laundry' });
  reject(toAct1(), { type: 'enter', room: 'holding' });
});

test('collection, unlocked passages, clues and solved puzzles are idempotent', () => {
  const initial = newGame({ now: 0 });
  const first = apply(initial, interact('bunkPocket'));
  assert.deepEqual(initial.inventory, []);
  assert.deepEqual(first.state.inventory, ['holdingKey']);
  assert.equal(isDone(first.state, 'bunkPocket'), true);
  assert.equal(inspect(first.state, 'bunkPocket').owned, true);
  const again = apply(first.state, interact('bunkPocket'));
  assert.strictEqual(again.state, first.state);
  const opened = apply(first.state, interact('holdingDoor'));
  const reopen = apply(opened.state, interact('holdingDoor'));
  assert.strictEqual(reopen.state, opened.state);
  assert.deepEqual(reopen.event, { type: 'room', room: 'washroom' });
  const viewed = apply(opened.state, interact('routeMarks'));
  assert.equal(isDone(viewed.state, 'routeMarks'), true);
  assert.equal(inspect(viewed.state, 'routeMarks').viewed, true);
  const revisit = apply(viewed.state, interact('routeMarks'));
  assert.strictEqual(revisit.state, viewed.state);
  assert.equal(revisit.event.type, 'inspect');
  const solved = apply(viewed.state, solve('routeCabinet', route));
  assert.strictEqual(apply(solved.state, solve('routeCabinet', route)).state, solved.state);
  assert.equal(solved.state.inventory.filter(id => id === 'fileKey').length, 1);
});

test('sequence and code puzzles reject malformed values and the plausible obsolete clues', () => {
  const state = sequence(newGame({ now: 0 }), act0.slice(0, 2));
  for (const value of [null, [], 'gate,eye,lamp,moon', ['moon', 'gate', 'lamp', 'eye'], ['gate', 'eye', 'lamp'], [...route, 'moon'], ['gate', 'gate', 'lamp', 'moon'], [0, 1, 2, 3]]) reject(state, solve('routeCabinet', value));
  const readOnly = apply(state, interact('routeCabinet'));
  assert.equal(readOnly.changed, false);
  assert.equal(readOnly.event.type, 'puzzle');
  const watchroom = sequence(toAct1(), act1.slice(0, 2));
  for (const value of [null, 846, ['8', '4', '6'], '28416', '216', '648', '846 ', '0846']) reject(watchroom, solve('authorisationPanel', value));
});

test('each act gets three contextual hints, with durable history and no hidden free reveals', () => {
  let state = newGame({ now: 0 });
  assert.match(getHint(state), /blanket/i);
  state = apply(state, { type: 'hint' }).state;
  const first = state.hintLog[0][0];
  state = sequence(state, act0.slice(0, 2));
  assert.match(getHint(state), /transfer.route/i);
  state = apply(state, { type: 'hint' }).state;
  state = apply(state, { type: 'hint' }).state;
  assert.match(state.hintLog[0][2], /GATE.*EYE.*LAMP.*MOON/);
  assert.equal(getHint(state), null);
  assert.equal(getHints(state).remaining, 0);
  reject(state, { type: 'hint' });
  assert.equal(state.hintLog[0][0], first);
  state = sequence(state, act0.slice(2));
  assert.equal(getHints(state).remaining, 3);
  state = sequence(state, act1.slice(0, 2));
  for (let i = 0; i < MAX_HINTS; i++) state = apply(state, { type: 'hint' }).state;
  assert.match(state.hintLog[1][2], /846/);
  reject(state, { type: 'hint' });
  state = sequence(state, act1.slice(2));
  state = sequence(state, act2.slice(0, 2));
  for (let i = 0; i < MAX_HINTS; i++) state = apply(state, { type: 'hint' }).state;
  assert.match(state.hintLog[2][2], /FEED to 2, BYPASS to 4 and DRAIN to 1/);
  reject(state, { type: 'hint' });
  assert.deepEqual(state.hintsUsed, [3, 3, 3, 0]);
  state = sequence(state, act2.slice(2));
  assert.equal(getHint(state), null);
  reject(state, { type: 'hint' });
  assert.deepEqual(newGame().hintsUsed, [0, 0, 0, 0]);
});

test('the watched shutter requires authorisation and only trusts server-time scan boundaries', () => {
  let state = toAct1();
  state = apply(state, interact('voidPass')).state;
  reject(state, interact('watchroomDoor'));
  state = sequence(state, act1.slice(0, 2));
  reject(state, interact('dispatchShutter'), 6000);
  state = apply(state, act1[2]).state;
  const inventory = [...state.inventory];
  for (const time of [0, 4999, 4999.99, 8000, 12999]) reject(state, { ...interact('dispatchShutter'), now: 6000, safe: true }, time);
  assert.deepEqual(state.inventory, inventory);
  assert.equal(scanPhase(4999).safe, false);
  assert.equal(scanPhase(5000).safe, true);
  assert.equal(scanPhase(7999.99).safe, true);
  assert.equal(scanPhase(8000).safe, false);
  assert.equal(scanPhase(13000).safe, true);
  assert.equal(scanPhase(5000).remaining, 3, 'remaining is expressed in seconds');
  const opened = apply(state, interact('dispatchShutter'), 5000, { playerRoom: 'watchroom' });
  assert.deepEqual(opened.event, { type: 'room', room: 'dispatch' });
  assert.equal(isDone(opened.state, 'dispatchShutter'), true);
  const later = apply(opened.state, interact('dispatchShutter'), 8000);
  assert.strictEqual(later.state, opened.state);
  assert.deepEqual(later.event, { type: 'room', room: 'dispatch' }, 'an opened shutter remains a usable passage during watched intervals');
});

test('the mechanical diagram has exactly one legal solution and the two-key river exit is enforced', () => {
  const candidates = [];
  const { min, max } = OBJECTS.valveBank.puzzle;
  for (let feed = min; feed <= max; feed++) {
    for (let bypass = min; bypass <= max; bypass++) {
      for (let drain = min; drain <= max; drain++) {
        if (feed + bypass + drain === 7 && bypass === 2 * feed && drain === feed - 1) candidates.push([feed, bypass, drain]);
      }
    }
  }
  assert.deepEqual(candidates, [[2, 4, 1]]);
  let state = sequence(toAct2(), act2.slice(0, 2));
  for (const value of [null, [], [3, 3, 3], [2, 1, 4], [2, 4, 0], [2, 4, 1, 0], ['2', '4', '1'], [2, 4, 1.1], [-1, 7, 1]]) reject(state, solve('valveBank', value));
  const values = [2, 4, 1];
  state = apply(state, solve('valveBank', values)).state;
  values[0] = 0;
  assert.deepEqual(state.flags.valveSettings, [2, 4, 1], 'the submitted array cannot mutate authoritative state');
  state = apply(state, interact('quayDoor')).state;
  reject(state, interact('quayExit'));
  const decoy = apply(state, interact('returnGate'));
  assert.equal(decoy.state.won, false);
  assert.deepEqual(decoy.state.inventory, state.inventory);
  assert.equal(decoy.event.type, 'inspect');
  state = sequence(decoy.state, act2.slice(4));
  assert.equal(state.won, true);
  assert.equal(state.inventory.includes('plantKey'), true);
  assert.equal(state.inventory.includes('quayKey'), true);
});

test('save validation rejects broken invariants, unknown IDs, inconsistent progress and malformed payloads', () => {
  const state = newGame({ now: 0 });
  for (const action of [null, [], {}, { type: 'reset' }, { type: 'advance' }, { type: 'grant_keys' }, { type: 'interact', id: '__proto__' }, { type: 'interact', id: 'constructor' }, { type: 'interact', id: {} }, solve('bunkPocket', '846')]) reject(state, action);
  for (const candidate of [null, [], {}, { ...state, game: 'lockstep' }, { ...state, version: 'old' }, { ...state, level: 3 }, { ...state, revision: -1 }, { ...state, inventory: ['holdingKey'] }, { ...state, inventory: ['unknown'] }, { ...state, inspected: ['unknown'] }, { ...state, hintsUsed: [4, 0, 0] }, { ...state, hintsUsed: [1, 0, 0] }, { ...state, flags: { madeUp: true } }, { ...state, flags: { washOpen: true } }, { ...state, flags: { pressureBalanced: true } }, { ...state, flags: { valveSettings: [2, 4, 1] } }, { ...state, completedLevels: [0] }, { ...state, won: true }, { ...state, startedAt: NaN }]) {
    assert.equal(isValidState(candidate), false);
    assert.equal(validateSave(candidate), null);
    assert.equal(reduce(candidate, interact('bunkPocket')).ok, false);
  }
  assert.equal(validateSave('{invalid json'), null);
  const saved = sequence(toAct1(), act1.slice(0, 2));
  const restored = validateSave(JSON.stringify(saved));
  assert.deepEqual(restored, saved);
  assert.notStrictEqual(restored, saved);
  restored.inventory.push('quayKey');
  assert.equal(saved.inventory.includes('quayKey'), false, 'a restored local copy is detached from the source');
  reject(toAct1(), interact('transferExit'), 6000);
});

test('scene data retains the original nine rooms and adds a separate four-room annex', () => {
  assert.equal(LEVELS.length, 4);
  assert.equal(Object.keys(ROOMS).length, 13);
  assert.equal(new Set(LEVELS.flatMap(level => level.roomIds)).size, 13);
  assert.deepEqual(CAMPAIGNS.escape.levelIds, [0, 1, 2]);
  assert.deepEqual(CAMPAIGNS.annex.levelIds, [3]);
  for (const level of LEVELS) {
    assert.equal(level.rooms.length, level.campaign === 'annex' ? 4 : 3);
    assert.equal(level.roomIds.includes(level.startRoom), true);
    for (const room of level.rooms) {
      assert.equal(ROOMS[room.id], room);
      assert.equal(room.width, 8);
      assert.equal(room.depth, 10);
      assert.equal(room.level, level.level);
      assert.equal(room.objects.length >= 4, true);
      for (const id of room.objects) {
        const object = OBJECTS[id];
        assert.equal(object.room, room.id);
        assert.equal(object.level, room.level);
        assert.equal(Math.abs(object.x) < room.width / 2, true, `${id} lies within room width`);
        assert.equal(Math.abs(object.z) < room.depth / 2, true, `${id} lies within room depth`);
        assert.equal(object.y > 0 && object.y < room.height, true);
        assert.equal(Number.isFinite(object.ry), true);
        if (object.targetRoom) assert.equal(ROOMS[object.targetRoom].level, object.level, 'ordinary doors stay within one act');
        for (const key of [object.item, object.key, ...(object.keys || [])].filter(Boolean)) assert.ok(ITEMS[key], key);
        if (object.clue) { assert.equal(typeof object.clue.heading, 'string'); assert.equal(Array.isArray(object.clue.lines), true); assert.equal(Array.isArray(object.clue.entries), true); }
      }
    }
  }
  const options = OBJECTS.routeCabinet.puzzle.options;
  assert.deepEqual(OBJECTS.routeMarks.clue.entries.map(entry => options.find(option => option.symbol === entry.symbol).value), route);
  assert.equal(OBJECTS.cameraArchive.clue.entries.filter(frame => !frame.watched).map(frame => frame.value).join(''), '846');
  assert.equal(OBJECTS.cameraArchive.clue.entries.every(frame => frame.label.includes(frame.watched ? 'WATCHED' : 'DARK')), true, 'the surveillance clue is readable without relying on color');
  assert.equal('targets' in OBJECTS.valveBank.puzzle, false, 'the controls do not disclose the solution');
});

test('version 1.0 classic saves migrate at every checkpoint without resetting progress or reopening a completed escape', () => {
  let current = newGame({ now: 0 });
  const checkpoints = [current];
  for (const action of [...act0, ...act1, ...act2]) {
    if (action.type === 'interact' && ['bunkPocket', 'laundryCart', 'toolChest'].includes(action.id)) current = apply(current, { type: 'hint' }).state;
    current = apply(current, action).state;
    checkpoints.push(current);
  }
  for (const state of checkpoints) {
    const legacy = { ...structuredClone(state), version: '1.0.0', hintsUsed: state.hintsUsed.slice(0, 3), hintLog: state.hintLog.slice(0, 3) };
    delete legacy.campaign; delete legacy.seed;
    const before = JSON.stringify(legacy);
    const migrated = validateSave(legacy);
    assert.deepEqual(migrated, state);
    assert.notStrictEqual(migrated, state);
    assert.equal(JSON.stringify(legacy), before, 'migration does not edit the caller or its legacy hint arrays');
    assert.deepEqual(validateSave(before), state, 'serialized legacy saves use the same migration');
  }
  const completed = checkpoints.at(-1);
  assert.equal(completed.won, true);
  assert.equal(completed.level, 2);
  assert.deepEqual(completed.completedLevels, [0, 1, 2]);
  assert.deepEqual(completed.hintsUsed, [1, 1, 1, 0]);
  assert.deepEqual(availableRooms(completed).map(room => room.id), ['boiler', 'sluice', 'quay']);
});

test('migration rejects malformed or cross-campaign legacy data instead of granting an annex run', () => {
  const original = newGame({ now: 0 });
  const legacy = { ...original, version: '1.0.0', hintsUsed: [0, 0, 0], hintLog: [[], [], []] };
  delete legacy.campaign; delete legacy.seed;
  for (const altered of [
    { ...legacy, campaign: 'annex' }, { ...legacy, level: 3 }, { ...legacy, won: true },
    { ...legacy, hintsUsed: [0, 0, 0, 0] }, { ...legacy, hintLog: [[], []] },
    { ...legacy, flags: { annexRouteSolved: true } }, { ...legacy, inventory: ['annexServiceKey'] },
    { ...legacy, inspected: ['annexRouteNotice'] }, { ...legacy, completedLevels: [3] },
  ]) assert.equal(validateSave(altered), null);
  assert.equal(validateSave({ ...original, version: '1.2.0' }), null);
});

test('presentation keeps inspected classic evidence readable after a wing transition and guidance is read-only', () => {
  let state = apply(newGame({ now: 0 }), interact('routeMarks')).state;
  state = sequence(state, act0);
  assert.equal(inspect(state, 'routeMarks'), null, 'the old room cannot be interacted with');
  assert.deepEqual(objectView(state, 'routeMarks', 'expert').clue, OBJECTS.routeMarks.clue, 'its recorded clue remains available to the notebook');
  assert.equal(objectView(state, 'departureBoard'), null, 'unrecorded old evidence is not silently discovered');
  assert.equal(objectView(state, 'annexRouteNotice'), null, 'other campaigns cannot leak through the notebook');
  const before = JSON.stringify(state);
  for (const tier of ['simple', 'moderate', 'expert']) {
    const guide = getGuidance(state, tier);
    assert.equal(guide.tier, tier); assert.equal(guide.audioRequired, false);
    assert.equal(typeof guide.objective, 'string');
    if (tier === 'expert') assert.equal(guide.detail, '');
  }
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(state.hintsUsed, [0, 0, 0, 0]);
});
