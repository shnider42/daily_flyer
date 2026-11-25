import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, hydrateState, perform, availableActions, objective, getEnding, saveVersion } from '../dist/state.mjs';

const apply = (state, ...ids) => ids.reduce((s, id) => {
  const option = availableActions(s).find(a => a.id === id);
  assert.ok(option, `Action ${id} should exist in ${s.scene}`);
  assert.equal(option.disabled || false, false, `${id}: ${option.reason}`);
  return perform(s, id).state;
}, state);

function reachDiagnosis() {
  return apply(initialState(), 'read-dispatch', 'go:airlock', 'check-return', 'go:junction', 'go:survey',
    'take-photo', 'read-survey-log', 'go:junction', 'go:service', 'read-maintenance', 'open-panel',
    'power-inspection', 'go:junction', 'go:shaft', 'listen-receiver', 'inspect-cable', 'compare-signal');
}

function finishRecovery(state) {
  return apply(state, 'go:lower', 'recover-recorder', 'go:shaft', 'go:junction', 'go:airlock',
    'go:approach', 'go:beacon', 'publish-warning', 'go:approach', 'go:airlock', 'finish');
}

for (const mode of ['mute', 'redirect']) {
  test(`complete the ${mode} route and preserve its distinct outcome`, () => {
    const diagnosed = reachDiagnosis();
    const chosen = perform(diagnosed, `${mode}-receiver`);
    assert.equal(chosen.event, mode);
    assert.equal(chosen.state.flags.threatRevealed, mode === 'redirect');
    const end = finishRecovery(chosen.state);
    assert.equal(end.completed, true);
    assert.equal(end.scene, 'airlock');
    assert.equal(end.receiverMode, mode);
    assert.equal(end.flags.inspectionPowered, true);
    assert.equal(end.flags.returnChecked, true);
    assert.equal(getEnding(end).recordsRecovered, 6);
    assert.match(getEnding(end).outcome, /route preserved/);
    assert.deepEqual(hydrateState(JSON.parse(JSON.stringify(end))), end);
  });
}

test('direct action IDs cannot bypass evidence, location, lighting or warning gates', () => {
  const start = initialState();
  for (const id of ['recover-recorder', 'publish-warning', 'finish', 'mute-receiver', 'go:lower', 'power-inspection']) {
    assert.deepEqual(perform(start, id).state, start, id);
  }
  const junction = apply(start, 'go:airlock', 'go:junction');
  assert.equal(availableActions(junction).find(a => a.id === 'go:shaft').disabled, true);
  assert.deepEqual(perform(junction, 'go:shaft').state, junction);
  const service = apply(junction, 'go:service', 'open-panel');
  assert.deepEqual(perform(service, 'power-inspection').state, service);
  const powered = apply(service, 'read-maintenance', 'power-inspection', 'go:junction', 'go:shaft');
  assert.deepEqual(perform(powered, 'compare-signal').state, powered);
  assert.deepEqual(perform(powered, 'mute-receiver').state, powered);
  assert.deepEqual(perform(powered, 'go:lower').state, powered);
});

test('wrong circuit feedback is harmless and does not extinguish or alter the return route', () => {
  const before = apply(initialState(), 'go:airlock', 'check-return', 'go:junction', 'go:service', 'open-panel');
  const result = perform(before, 'power-receiver');
  assert.equal(result.event, 'feedback');
  assert.deepEqual(result.state, before);
  assert.equal(result.state.flags.threatRevealed, false);
  assert.equal(result.state.flags.returnChecked, true);
  const back = apply(result.state, 'go:junction', 'go:airlock', 'go:approach');
  assert.equal(back.scene, 'approach');
});

test('save and reload in the middle of an investigation preserves evidence and progress', () => {
  const before = apply(initialState(), 'go:airlock', 'go:junction', 'go:survey', 'take-photo', 'read-survey-log',
    'go:junction', 'go:service', 'read-maintenance', 'open-panel', 'power-inspection', 'go:junction', 'go:shaft', 'listen-receiver');
  const loaded = hydrateState(JSON.parse(JSON.stringify(before)));
  assert.deepEqual(loaded, before);
  assert.equal(loaded.flags.threatRevealed, false);
  const diagnosed = apply(loaded, 'inspect-cable', 'compare-signal', 'mute-receiver');
  assert.equal(finishRecovery(diagnosed).completed, true);
});

test('every reachable scene retains a route to the surface before and after receiver choices', () => {
  const samples = [initialState(), reachDiagnosis(), apply(reachDiagnosis(), 'mute-receiver'), apply(reachDiagnosis(), 'redirect-receiver')];
  for (const sample of samples) {
    const todo = [sample], seen = new Set();
    while (todo.length) {
      const s = todo.shift();
      if (seen.has(s.scene)) continue;
      seen.add(s.scene);
      const route = [{ state: s, path: [] }], routeSeen = new Set();
      let escaped = false;
      while (route.length) {
        const entry = route.shift();
        if (entry.state.scene === 'approach') { escaped = true; break; }
        if (routeSeen.has(entry.state.scene)) continue;
        routeSeen.add(entry.state.scene);
        for (const a of availableActions(entry.state).filter(a => a.kind === 'move' && !a.disabled)) {
          route.push({ state: perform(entry.state, a.id).state, path: [...entry.path, a.id] });
        }
      }
      assert.equal(escaped, true, `No surface return from ${s.scene} with ${s.receiverMode}`);
      for (const a of availableActions(s).filter(a => a.kind === 'move' && !a.disabled)) todo.push(perform(s, a.id).state);
    }
  }
});

test('completed state is terminal and repeated recovery operations do not duplicate records', () => {
  const diagnosed = reachDiagnosis();
  assert.equal(apply(diagnosed, 'inspect-cable', 'inspect-cable').records.filter(id => id === 'cable_marks').length, 1);
  const end = finishRecovery(apply(diagnosed, 'mute-receiver'));
  for (const id of ['finish', 'publish-warning', 'go:approach', 'recover-recorder']) assert.deepEqual(perform(end, id).state, end);
  assert.deepEqual(availableActions(end), []);
  assert.equal(objective(end).title, 'Recovery complete');
});

test('hydration rejects malformed, unsupported and contradictory saves without stranding the player', () => {
  for (const raw of [null, [], 'bad', 0, {version: 999}, {}]) assert.deepEqual(hydrateState(raw), initialState());
  const corrupt = hydrateState({version: saveVersion, scene: 'lower', visited: ['nonsense'], records: ['field_recorder', 'unknown', 'field_recorder'],
    flags: {inspectionPowered: true, recorderRecovered: true, warningPublished: true}, receiverMode: 'redirect', completed: true, moves: -4});
  assert.equal(corrupt.scene, 'junction');
  assert.equal(corrupt.completed, false);
  assert.equal(corrupt.receiverMode, null);
  assert.equal(corrupt.flags.warningPublished, false);
  assert.deepEqual(corrupt.records, []);
  assert.equal(corrupt.moves, 0);
  assert.ok(availableActions(corrupt).some(a => a.id === 'go:airlock' && !a.disabled));
});

test('perform is immutable and repeat listening never spawns a threat', () => {
  const before = apply(reachDiagnosis(), 'mute-receiver');
  const frozen = JSON.stringify(before);
  const after = perform(before, 'listen-receiver').state;
  assert.equal(JSON.stringify(before), frozen);
  assert.equal(after.flags.threatRevealed, false);
  assert.equal(after.receiverMode, 'mute');
});
