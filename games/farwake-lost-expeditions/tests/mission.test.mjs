import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, hydrateState, availableActions, perform, getEnding } from '../dist/state.mjs';
import { missionStatus, MISSION_BRIEF } from '../dist/mission.mjs';

const apply = (state, ...ids) => ids.reduce((current, id) => {
  const action = availableActions(current).find(candidate => candidate.id === id);
  assert.ok(action && !action.disabled, `${id} must be available in ${current.scene}`);
  return perform(current, id).state;
}, state);
const prepared = () => apply(initialState(), 'go:airlock', 'go:junction', 'go:survey',
  'take-photo', 'read-survey-log', 'go:junction', 'go:service', 'read-maintenance', 'open-panel', 'power-inspection');
const diagnosed = () => apply(prepared(), 'go:junction', 'go:shaft', 'listen-receiver', 'inspect-cable', 'compare-signal');

function checkRecommendation(state) {
  const status = missionStatus(state);
  if (status.nextActionId === null) {
    assert.ok(state.completed || (state.scene === 'shaft' && state.flags.signalCompared && !state.receiverMode),
      `Only a receiver choice or completion should omit an action: ${state.scene}`);
  } else {
    const action = availableActions(state).find(candidate => candidate.id === status.nextActionId);
    assert.ok(action && !action.disabled, `${status.nextActionId} must be reachable from ${state.scene}`);
    assert.equal(status.nextScene, action.kind === 'move' ? action.target : state.scene);
    if (action.kind !== 'move') assert.equal(status.destination, state.scene);
  }
  return status;
}

test('the opening explains the job and directs the player indoors without requiring the optional assignment', () => {
  for (const phrase of ['recovery operator', 'Moon', 'field recorder', 'surface beacon', 'airlock']) {
    assert.ok(MISSION_BRIEF.includes(phrase), `The brief includes ${phrase}`);
  }
  const start = missionStatus(initialState());
  assert.equal(start.nextActionId, 'go:airlock');
  assert.equal(start.nextScene, 'airlock');
  assert.equal(start.destination, 'survey');
  assert.equal(start.phase, 'recover');
  assert.deepEqual(start.steps, [
    { label: 'Recover recorder', done: false, current: true },
    { label: 'Warn next crew', done: false, current: false },
    { label: 'Return to the airlock', done: false, current: false }
  ]);
  const briefed = missionStatus(apply(initialState(), 'read-dispatch'));
  assert.deepEqual(briefed, start, 'collecting the optional assignment does not change the next step');
});

for (const mode of ['mute', 'redirect']) {
  test(`shared guidance reaches the ${mode} ending through enabled local actions and adjacent routes`, () => {
    let state = initialState();
    const trace = [];
    while (!state.completed && trace.length < 70) {
      const status = checkRecommendation(state);
      let id = status.nextActionId;
      if (id === null) {
        for (const choice of ['mute-receiver', 'redirect-receiver']) {
          assert.ok(availableActions(state).some(action => action.id === choice && !action.disabled));
        }
        assert.equal(status.destination, 'shaft');
        id = `${mode}-receiver`;
      }
      trace.push(id);
      state = apply(state, id);
    }
    assert.equal(state.completed, true, `Guidance did not finish: ${trace.join(', ')}`);
    assert.equal(state.receiverMode, mode);
    assert.equal(getEnding(state).recordsRecovered, 5);
    assert.equal(trace.includes('read-dispatch'), false, 'the optional assignment is not a completion gate');
    for (const id of ['power-inspection', 'compare-signal', 'recover-recorder', 'publish-warning', 'finish']) {
      assert.ok(trace.includes(id), `Guidance retained ${id}`);
    }
    const final = checkRecommendation(state);
    assert.equal(final.phase, 'complete');
    assert.ok(final.steps.every(step => step.done && !step.current));
  });
}

test('visiting the service bay first gives useful local work and then directs the player to missing records', () => {
  let state = apply(initialState(), 'go:airlock', 'go:junction', 'go:service');
  for (const id of ['read-maintenance', 'open-panel', 'power-inspection']) {
    assert.equal(missionStatus(state).nextActionId, id);
    state = apply(state, id);
  }
  const beforeReload = missionStatus(state);
  state = hydrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(missionStatus(state), beforeReload);
  assert.equal(beforeReload.destination, 'survey');
  assert.equal(beforeReload.nextScene, 'junction');
  assert.equal(beforeReload.nextActionId, 'go:junction');
  state = apply(state, 'go:junction', 'go:shaft');
  assert.equal(missionStatus(state).nextActionId, 'listen-receiver');
  state = apply(state, 'listen-receiver');
  assert.equal(missionStatus(state).nextActionId, 'inspect-cable');
  state = apply(state, 'inspect-cable');
  assert.equal(missionStatus(state).destination, 'survey');
  assert.equal(missionStatus(state).nextActionId, 'go:junction');
});

test('existing saves without an assignment record keep their progress instead of acquiring an opening requirement', () => {
  const oldSave = JSON.parse(JSON.stringify(apply(prepared(), 'go:junction', 'go:airlock', 'go:approach')));
  assert.equal(oldSave.version, 1);
  assert.equal(oldSave.records.includes('dispatch'), false);
  const status = missionStatus(oldSave);
  assert.equal(status.nextActionId, 'go:airlock');
  assert.equal(status.destination, 'shaft');
  assert.equal(status.phase, 'recover');
  assert.equal(missionStatus(null).nextActionId, 'go:airlock');
});

test('guidance remains reachable when exploring any connected room before and after major milestones', () => {
  const diagnosis = diagnosed();
  const muted = apply(diagnosis, 'mute-receiver');
  const redirected = apply(diagnosis, 'redirect-receiver');
  const recovered = apply(muted, 'go:lower', 'recover-recorder');
  const warned = apply(recovered, 'go:shaft', 'go:junction', 'go:airlock', 'go:approach', 'go:beacon', 'publish-warning');
  for (const sample of [initialState(), prepared(), diagnosis, muted, redirected, recovered, warned]) {
    const queue = [sample], seen = new Set();
    while (queue.length) {
      const state = queue.shift();
      if (seen.has(state.scene)) continue;
      seen.add(state.scene);
      checkRecommendation(state);
      for (const action of availableActions(state)) {
        if (action.kind === 'move' && !action.disabled) queue.push(perform(state, action.id).state);
      }
    }
  }
  assert.equal(missionStatus(recovered).phase, 'warn');
  assert.equal(missionStatus(recovered).nextActionId, 'go:shaft');
  assert.equal(missionStatus(recovered).destination, 'beacon');
  assert.equal(missionStatus(warned).phase, 'return');
  assert.equal(missionStatus(warned).nextActionId, 'go:approach');
});

test('guidance does not modify saves, available actions, or the two receiver choices', () => {
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const state = freeze(diagnosed());
  const before = JSON.stringify(state), actions = availableActions(state);
  const first = missionStatus(state), second = missionStatus(state);
  assert.deepEqual(first, second);
  assert.equal(first.nextActionId, null);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(availableActions(state), actions);
});
