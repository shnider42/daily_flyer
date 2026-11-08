import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialRuntime, GUIDE_STORAGE_KEY } from '../dist/tutorial-runtime.mjs';
import { advanceShip, getShipClass } from '../dist/fleet.mjs';
import { movePerson, TILE } from '../dist/surface.mjs';

function storageFixture(initial = {}) {
  const values = new Map(Object.entries(initial)), writes = [], reads = [];
  return { values, writes, reads, getItem(key) { reads.push(key); return values.get(key) ?? null; }, setItem(key, value) { writes.push({ key, value }); values.set(key, value); } };
}
function fixture({ device = 'keyboard', selection = { seed: 'tutorial-voyage' }, storage = storageFixture() } = {}) {
  const runtime = new TutorialRuntime({ storage, nonce: 'tutorial-evidence' }); runtime.select(selection);
  runtime.update({ mode: 'ship', systemId: 'hearth', device, playing: true, ship: { speed: 0 } });
  return { runtime, storage };
}
const hull = changes => ({ ...getShipClass('sparrow').stats, id: 'tutorial-hull', classId: 'sparrow', x: 0, y: 0, vx: 0, vy: 0, angle: 0, angularVelocity: 0, energy: 100, ...changes });
const foot = () => ({ mode: 'person', person: { x: 30, y: 48, health: 100, speed: 112, down: false }, ship: hull() });
const waitFrames = (runtime, state, seconds, input = {}, options = {}) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) runtime.observe(input, state, state, 1 / 30, options); };
const press = (runtime, state, input = {}) => runtime.observe({ fire: true, ...input }, state, state, 1 / 60, { combat: state.mode === 'person' });
const release = (runtime, state) => runtime.observe({}, state, state, 1 / 60, { combat: state.mode === 'person' });

test('holding against an actual collision wall never earns walking progress; movement counts once until release', () => {
  const { runtime } = fixture(); runtime.update({ mode: 'person', device: 'keyboard', playing: true });
  const surface = { width: 2400, height: 240, tileSize: 24, cols: 100, rows: 10, solids: [], spawn: { x: 30, y: 48 }, tiles: Array.from({ length: 10 }, () => Array.from({ length: 100 }, (_, x) => x === 0 ? TILE.WALL : TILE.FLOOR)) };
  const state = foot(), frame = (input, count = 1) => { for (let i = 0; i < count; i++) { const before = structuredClone(state); movePerson(surface, state.person, input.x || 0, input.y || 0, 1 / 60); const after = structuredClone(state), untouched = JSON.stringify({ before, after }); runtime.observe(input, before, after, 1 / 60); assert.equal(JSON.stringify({ before, after }), untouched, 'evidence never mutates physics'); } };
  frame({ x: -1 }, 180); assert.equal(state.person.x, 30); assert.equal(runtime.controller.count('person-move'), 0);
  frame({}); frame({ x: 1 }, 120); assert.equal(runtime.controller.count('person-move'), 1);
  frame({ x: 1 }, 240); assert.equal(runtime.controller.count('person-move'), 1, 'a held gesture is not another lesson');
  frame({}); frame({ x: 1 }, 60); assert.equal(runtime.controller.count('person-move'), 2);
  frame({}); frame({ x: 1 }, 60); assert.equal(runtime.controller.count('person-move'), 2, 'successful-use progress is capped at two');
});

test('real flight acceleration, turning, strafing and braking earn independent evidence, while frozen controls do not', () => {
  for (const [action, input, initial] of [
    ['flight-thrust', { thrust: 1 }, {}], ['flight-turn', { turn: 1 }, {}], ['flight-strafe', { strafe: 1 }, {}], ['flight-brake', { brake: true }, { vx: 200 }]
  ]) {
    const { runtime } = fixture(), frozen = { mode: 'ship', ship: hull(initial) };
    waitFrames(runtime, frozen, 3, input); assert.equal(runtime.controller.count(action), 0, `${action} needs observable results`);
    release(runtime, frozen); let state = structuredClone(frozen);
    for (let frame = 0; frame < 60; frame++) { const before = structuredClone(state); state = { mode: 'ship', ship: advanceShip(state.ship, 1 / 60, { ...input, flightAssist: true }, { worldRadius: Infinity }) }; runtime.observe(input, before, state, 1 / 60); }
    assert.equal(runtime.controller.count(action), 1, `${action} counts once after actual ship motion`);
  }
});

test('paused input, downed people, mode switches and one unusually long frame cannot manufacture a gesture', () => {
  const { runtime } = fixture(); runtime.update({ mode: 'person', device: 'keyboard', playing: true });
  const before = foot(), after = structuredClone(before); after.person.x += 100;
  for (let i = 0; i < 40; i++) runtime.observe({ x: 1 }, before, after, 1 / 30, { active: false });
  assert.equal(runtime.controller.count('person-move'), 0);
  after.person.down = true; after.person.health = 0;
  for (let i = 0; i < 40; i++) runtime.observe({ x: 1 }, before, after, 1 / 30);
  assert.equal(runtime.controller.count('person-move'), 0);
  after.person.down = false; after.person.health = 100; release(runtime, before); runtime.observe({ x: 1 }, before, after, 20);
  assert.equal(runtime.controller.count('person-move'), 0, 'tab suspension cannot count twenty seconds of activity');
  runtime.observe({ x: 1 }, { ...before, mode: 'ship' }, after, 1); assert.equal(runtime.controller.count('person-move'), 0);
});

test('only locally confirmed firing counts, at most once per held trigger', () => {
  const { runtime } = fixture(), state = foot(); runtime.update({ mode: 'person', device: 'keyboard', playing: true, combat: { active: true } });
  runtime.shot({ type: 'person-shot', id: 'unsolicited' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-fire'), 0);
  press(runtime, state); runtime.shot({ type: 'person-shot', id: 'another-captain' }, { local: false, mode: 'person' }); assert.equal(runtime.controller.count('person-fire'), 0);
  runtime.shot({ type: 'person-shot', id: 'local-first' }, { local: true, mode: 'person' });
  runtime.shot({ type: 'person-shot', id: 'local-first' }, { local: true, mode: 'person' });
  runtime.shot({ type: 'person-shot', id: 'local-second-pulse' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-fire'), 1);
  runtime.shot({ type: 'person-hit', id: 'local-first:hit' }, { local: true, mode: 'person' });
  runtime.shot({ type: 'person-hit', id: 'local-second-pulse:hit' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-hit'), 1);
  release(runtime, state); press(runtime, state); runtime.shot({ type: 'person-shot', id: 'next-gesture' }, { local: true, mode: 'person' }); runtime.shot({ type: 'person-hit', id: 'next-gesture:hit' }, { local: true, mode: 'person' });
  assert.equal(runtime.controller.count('person-fire'), 2); assert.equal(runtime.controller.count('person-hit'), 2);
});

test('a confirmed local shot and its linked hit still count when network delivery follows trigger release', () => {
  const { runtime } = fixture(), state = foot(); runtime.update({ mode: 'person', device: 'keyboard', playing: true, combat: { active: true } });
  press(runtime, state); release(runtime, state); waitFrames(runtime, state, .3);
  runtime.shot({ type: 'person-shot', id: 'delayed-pulse' }, { local: true, mode: 'person' });
  assert.equal(runtime.controller.count('person-fire'), 1, 'a 300ms delayed confirmation belongs to the released trigger');
  runtime.shot({ type: 'person-hit', id: 'delayed-pulse:hit' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-hit'), 1);
  runtime.shot({ type: 'person-hit', id: 'delayed-pulse:hit' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-hit'), 1, 'replayed confirmations cannot teach another use');
});

test('a delayed confirmation teaches the layout that actually fired even after the input device changes', () => {
  const { runtime } = fixture(), state = foot();
  runtime.update({ mode: 'person', device: 'keyboard', playing: true, combat: { active: true } });
  press(runtime, state); release(runtime, state);
  runtime.update({ mode: 'person', device: 'touch', playing: true, combat: { active: true } });
  runtime.shot({ type: 'person-shot', id: 'keyboard-pulse-after-layout-change' }, { local: true, mode: 'person' });
  runtime.shot({ type: 'person-hit', id: 'keyboard-pulse-after-layout-change:hit' }, { local: true, mode: 'person' });
  for (const action of ['person-fire', 'person-hit']) {
    assert.equal(runtime.controller.count(action, { device: 'keyboard' }), 1);
    assert.equal(runtime.controller.count(action, { device: 'touch' }), 0, 'a layout change cannot transfer credit to unused controls');
  }
});

test('recent confirmed shot identity survives release, but expired unrelated events and profile/reset leftovers cannot advance progress', () => {
  const { runtime } = fixture(), state = foot(); runtime.update({ mode: 'person', device: 'keyboard', playing: true, combat: { active: true } });
  press(runtime, state); runtime.shot({ type: 'person-shot', id: 'known-pulse' }, { local: true, mode: 'person' }); release(runtime, state); waitFrames(runtime, state, .4);
  runtime.shot({ type: 'person-hit', id: 'known-pulse:hit' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-hit'), 1);
  runtime.select({ seed: 'another-captain' }); runtime.update({ mode: 'person', device: 'keyboard', playing: true, combat: { active: true } });
  runtime.shot({ type: 'person-hit', id: 'known-pulse:hit' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-hit'), 0);
  press(runtime, state); release(runtime, state); waitFrames(runtime, state, 2.5); runtime.shot({ type: 'person-shot', id: 'too-late-to-match' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-fire'), 0);
  press(runtime, state); runtime.shot({ type: 'person-shot', id: 'before-reset' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-fire'), 1); runtime.reset();
  runtime.shot({ type: 'person-hit', id: 'before-reset:hit' }, { local: true, mode: 'person' }); assert.equal(runtime.controller.count('person-hit'), 0, 'reset drops the old episode and its in-flight confirmations');
});

test('keyboard/touch control evidence stays separate, while semantic action acknowledgments dedupe across layouts', () => {
  const { runtime } = fixture(), before = foot(), after = structuredClone(before); after.person.x += 5;
  for (const device of ['keyboard', 'touch']) {
    runtime.update({ mode: 'person', device, playing: true }); release(runtime, before);
    for (let gesture = 0; gesture < 3; gesture++) { for (let frame = 0; frame < 20; frame++) runtime.observe({ x: 1 }, before, after, 1 / 30); release(runtime, before); }
    assert.equal(runtime.controller.count('person-move', { device }), 2);
  }
  assert.equal(runtime.controller.count('person-move', { device: 'keyboard' }), 2); assert.equal(runtime.controller.count('person-move', { device: 'touch' }), 2);
  runtime.update({ mode: 'ship', device: 'keyboard', docking: { id: 'kettle', inRange: true } }); assert.equal(runtime.record('dock', 'one-authoritative-ack'), true);
  runtime.update({ mode: 'ship', device: 'touch', docking: { id: 'kettle', inRange: true } }); assert.equal(runtime.record('dock', 'one-authoritative-ack'), false); assert.equal(runtime.controller.count('dock'), 1);
});

test('profiles persist independently and isolated exercises never write storage or alter voyage mastery', () => {
  const save = '{"ship":"unchanged"}', passport = '{"token":"private-token"}', storage = storageFixture({ 'dfe.farwake.save': save, 'captain-passport': passport });
  const { runtime } = fixture({ storage }); runtime.record('dock', 'solo-dock');
  runtime.select({ seed: 'tutorial-voyage', captainId: 'captain-a', realmId: 'realm-a' }); runtime.update({ mode: 'person', device: 'touch' }); assert.equal(runtime.controller.count('dock'), 0); runtime.record('person-use', 'captain-conversation');
  const written = storage.writes.length, guideBefore = storage.values.get(GUIDE_STORAGE_KEY);
  runtime.select({ testId: 'boarding-exercise', mode: 'simple' }); runtime.update({ mode: 'person', device: 'touch', testMode: true }); runtime.record('person-use', 'practice-use'); runtime.reset(); runtime.record('person-use', 'practice-again'); runtime.flush();
  assert.equal(storage.writes.length, written); assert.equal(storage.values.get(GUIDE_STORAGE_KEY), guideBefore); assert.equal(storage.values.get('dfe.farwake.save'), save); assert.equal(storage.values.get('captain-passport'), passport);
  runtime.select({ seed: 'tutorial-voyage' }); runtime.update({ mode: 'ship', device: 'keyboard' }); assert.equal(runtime.controller.count('dock'), 1); assert.equal(runtime.controller.count('person-use'), 0);
  const reload = new TutorialRuntime({ storage, nonce: 'reloaded' }); reload.select({ captainId: 'captain-a', realmId: 'realm-a' }); reload.update({ mode: 'person', device: 'touch' }); assert.equal(reload.controller.count('person-use'), 1); assert.equal(reload.controller.count('dock'), 0);
  assert.ok(storage.writes.every(entry => entry.key === GUIDE_STORAGE_KEY)); assert.ok(!storage.values.get(GUIDE_STORAGE_KEY).includes('private-token'));
});

test('reset persists only the selected profile and a malformed or unavailable store cannot stop play', () => {
  const { runtime, storage } = fixture(); runtime.record('dock', 'first-profile'); runtime.select({ seed: 'second' }); runtime.update({ mode: 'ship', device: 'keyboard' }); runtime.record('dock', 'second-profile'); runtime.reset();
  const loaded = new TutorialRuntime({ storage, nonce: 'reset-check' }); loaded.select({ seed: 'second' }); loaded.update({ mode: 'ship', device: 'keyboard' }); assert.equal(loaded.controller.count('dock'), 0);
  loaded.select({ seed: 'tutorial-voyage' }); loaded.update({ mode: 'ship', device: 'keyboard' }); assert.equal(loaded.controller.count('dock'), 1);
  for (const broken of [{ getItem() { return '{invalid'; }, setItem() { throw new Error('full'); } }, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }]) {
    const recovered = new TutorialRuntime({ storage: broken }); recovered.select({ seed: 'usable' }); recovered.update({ mode: 'ship', device: 'keyboard' }); assert.equal(recovered.record('dock', 'safe-use'), true); assert.equal(recovered.controller.count('dock'), 1);
  }
});
