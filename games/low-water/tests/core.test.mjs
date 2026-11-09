import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshState, enterLevel, interact, serializable, restoreState,
  objective, objectiveTarget,
} from '../dist/core.mjs';
import { getLevel, floorAt, activeGate } from '../dist/levels.mjs';

function exitChapter(state, expectedNext) {
  const result = interact(state, 'exit');
  assert.equal(result.changed, true);
  assert.equal(result.checkpoint, true);
  assert.equal(result.nextChapter, expectedNext);
  enterLevel(state, expectedNext);
  assert.equal(state.chapter, expectedNext);
  assert.equal(state.unlocked, expectedNext);
}

test('the authored puzzle sequence reaches all five chapters and a completed ending', () => {
  const state = freshState();
  assert.equal(state.chapter, 0);
  assert.equal(interact(state, 'exit').changed, false, 'Arrival exit starts locked');
  interact(state, 'crane-breaker');
  assert.equal(interact(state, 'exit-breaker').checkpoint, true);
  assert.equal(state.powerRouted, true);
  exitChapter(state, 1);

  assert.equal(interact(state, 'exit').changed, false, 'Flood interlock starts locked');
  interact(state, 'intake-valve');
  assert.equal(state.waterDrained, false);
  assert.equal(interact(state, 'bypass-valve').checkpoint, true);
  assert.equal(state.waterDrained, true);
  exitChapter(state, 2);

  assert.equal(interact(state, 'exit').changed, false, 'Research bridge starts disconnected');
  interact(state, 'gantry-control');
  assert.equal(state.toolAccessible, true);
  assert.equal(interact(state, 'arc-tool').checkpoint, true);
  assert.equal(state.tool, true);
  interact(state, 'gantry-control');
  assert.equal(state.bridgeAligned, true);
  assert.equal(floorAt(getLevel(2), 44, 33, state), 2);
  exitChapter(state, 3);

  assert.equal(interact(state, 'exit').changed, false, 'Chamber interlock starts locked');
  interact(state, 'damper-a');
  interact(state, 'damper-c');
  assert.equal(state.coreStable, false);
  assert.equal(interact(state, 'damper-c').checkpoint, true);
  assert.deepEqual(state.dampers, [2, 1, 3]);
  assert.equal(state.coreStable, true);
  exitChapter(state, 4);

  assert.equal(interact(state, 'exit').changed, false, 'Evacuation is interlocked before isolation');
  assert.equal(interact(state, 'emergency-seal').checkpoint, true);
  assert.equal(state.evacReady, true);
  const ending = interact(state, 'exit');
  assert.equal(ending.complete, true);
  assert.equal(state.completed, true);
  assert.equal(state.chapter, 4);
  assert.equal(state.unlocked, 4);
});

test('attempting the freight load before isolation leaves the power puzzle recoverable', () => {
  const state = freshState();
  const overload = interact(state, 'exit-breaker');
  assert.equal(overload.changed, false);
  assert.equal(overload.sound, 'error');
  assert.equal(state.breakers.exit, false);
  assert.equal(state.powerRouted, false);
  assert.equal(activeGate(getLevel(0).gates[0], state), true);
  interact(state, 'crane-breaker');
  interact(state, 'exit-breaker');
  assert.equal(activeGate(getLevel(0).gates[0], state), false);
  interact(state, 'crane-breaker');
  assert.equal(state.powerRouted, true, 'A completed route cannot be accidentally invalidated');
});

test('opening bypass first cannot drain the basin until the incoming flow is isolated', () => {
  const state = freshState(1);
  interact(state, 'bypass-valve');
  assert.equal(state.bypassOpen, true);
  assert.equal(state.waterDrained, false);
  assert.equal(interact(state, 'exit').changed, false);
  interact(state, 'intake-valve');
  assert.equal(state.waterDrained, true);
  assert.equal(interact(state, 'exit').nextChapter, 2);
});

test('arc driver cannot be acquired early and both gantry panels can restore the route', () => {
  const state = freshState(2);
  assert.equal(state.tool, false);
  const earlyPickup = interact(state, 'arc-tool');
  assert.equal(earlyPickup.changed, false);
  assert.equal(earlyPickup.sound, 'error');
  assert.equal(state.tool, false);
  assert.equal(floorAt(getLevel(2), 44, 33, state), null);

  interact(state, 'gantry-control'); // tool bay
  assert.equal(state.gantryPosition, 1);
  assert.equal(state.toolAccessible, true);
  interact(state, 'gantry-control-return'); // exit selected without tool
  assert.equal(state.gantryPosition, 2);
  assert.equal(state.bridgeAligned, false);
  interact(state, 'arc-tool');
  assert.equal(state.tool, true);
  assert.equal(state.bridgeAligned, true);
  interact(state, 'gantry-control-return'); // parked
  assert.equal(state.bridgeAligned, false);
  assert.equal(state.toolAccessible, true, 'Tool-bay service access remains released after first docking');
  interact(state, 'gantry-control-return'); // tool bay
  interact(state, 'gantry-control-return'); // exit
  assert.equal(state.bridgeAligned, true);
  assert.equal(interact(state, 'exit').nextChapter, 3);
});

test('wrong damper settings never release the chamber and can be cycled into calibration', () => {
  const state = freshState(3);
  interact(state, 'damper-b');
  interact(state, 'damper-a');
  interact(state, 'damper-c');
  interact(state, 'damper-c');
  assert.deepEqual(state.dampers, [2, 2, 3]);
  assert.equal(state.coreStable, false);
  assert.equal(interact(state, 'exit').changed, false);
  interact(state, 'damper-b');
  interact(state, 'damper-b');
  assert.deepEqual(state.dampers, [2, 1, 3]);
  assert.equal(state.coreStable, true);
  interact(state, 'damper-a');
  assert.deepEqual(state.dampers, [2, 1, 3], 'A calibrated chamber remains stable');
});

test('optional notes are readable, deduplicated and never required by a chapter exit', () => {
  const state = freshState();
  const note = getLevel(0).notes[0];
  const first = interact(state, note.id);
  assert.equal(first.note.title, note.title);
  assert.equal(first.note.text, note.text);
  assert.equal(first.changed, true);
  assert.equal(interact(state, note.id).changed, false);
  assert.deepEqual(state.notes, [note.id]);
  assert.equal(state.powerRouted, false);
  interact(state, 'crane-breaker');
  interact(state, 'exit-breaker');
  assert.equal(interact(state, 'exit').nextChapter, 1);
  enterLevel(state, 1);
  assert.deepEqual(state.notes, [note.id], 'Collected notes survive chapter transitions');
});

test('saved progress restores puzzle state, location, collected notes and chapter access', () => {
  const original = freshState(2);
  interact(original, 'gantry-control');
  interact(original, 'arc-tool');
  interact(original, 'gantry-control');
  interact(original, 'gantry-note');
  original.player = { x: 37, z: 27, y: 2, yaw: 0.8, pitch: -0.15, vy: 3 };
  original.health = 63;
  original.elapsed = 412;
  original.enemies[0].path = [{ x: 2, z: 3 }];
  original.enemies[0].pathTime = 12;
  const saved = serializable(original);
  assert.equal(original.player.vy, 3, 'Serializing does not mutate live state');
  assert.equal(saved.player.vy, 0);
  assert.equal('path' in saved.enemies[0], false);
  const restored = restoreState(JSON.parse(JSON.stringify(saved)));
  assert.ok(restored);
  assert.equal(restored.chapter, 2);
  assert.equal(restored.unlocked, 2);
  assert.equal(restored.tool, true);
  assert.equal(restored.bridgeAligned, true);
  assert.equal(restored.gantryPosition, 2);
  assert.deepEqual(restored.notes, ['gantry-note']);
  assert.deepEqual(restored.player, { x: 37, z: 27, y: 2, yaw: 0.8, pitch: -0.15, vy: 0 });
  assert.equal(restored.health, 63);
  assert.equal(restored.elapsed, 412);
  assert.equal(interact(restored, 'exit').nextChapter, 3);
});

test('invalid save identities are rejected without inventing campaign progress', () => {
  assert.equal(restoreState(null), null);
  assert.equal(restoreState({ version: 2, chapter: 0 }), null);
  assert.equal(restoreState({ version: 1, chapter: -1 }), null);
  assert.equal(restoreState({ version: 1, chapter: 5 }), null);
  assert.equal(restoreState({ version: 1, chapter: '2' }), null);
});

test('guidance changes assistance while retaining the same playable puzzle sequence', () => {
  const state = freshState();
  assert.equal(objective(state, 'expert'), '');
  assert.ok(objective(state, 'moderate').length);
  assert.equal(objectiveTarget(state), 'crane-breaker');
  interact(state, 'crane-breaker');
  assert.equal(objectiveTarget(state), 'exit-breaker');
  interact(state, 'exit-breaker');
  assert.equal(objectiveTarget(state), 'exit');
});
