import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, perform, availableActions, getEnding } from '../dist/state.mjs';
import { RECORDS } from '../dist/content.mjs';
import { mobileActions, mobileLabel } from '../dist/mobile-actions.mjs';

const ids = actions => actions.map(action => action.id);
const view = state => mobileActions(state, availableActions(state));
const apply = (state, ...actionIds) => actionIds.reduce((current, id) => {
  const action = availableActions(current).find(candidate => candidate.id === id);
  assert.ok(action && !action.disabled, `${id} must be available in ${current.scene}`);
  return perform(current, id).state;
}, state);
const beforeDiagnosis = () => apply(initialState(), 'go:airlock', 'go:junction', 'go:survey',
  'take-photo', 'read-survey-log', 'go:junction', 'go:service', 'read-maintenance', 'open-panel',
  'power-inspection', 'go:junction', 'go:shaft');

test('new clues remain visible; collected clues leave the action list but remain in the notebook', () => {
  const start = view(initialState());
  assert.deepEqual(ids(start.interactions), ['read-dispatch']);
  assert.deepEqual(ids(start.routes), ['go:airlock', 'go:beacon']);
  assert.equal(start.defaultTab, 'inspect');
  let state = apply(initialState(), 'go:airlock', 'go:junction', 'go:survey');
  assert.deepEqual(ids(view(state).interactions), ['take-photo', 'read-survey-log']);
  state = apply(state, 'take-photo');
  assert.deepEqual(ids(view(state).interactions), ['read-survey-log']);
  assert.equal(view(state).defaultTab, 'inspect');
  state = apply(state, 'read-survey-log');
  assert.deepEqual(view(state).interactions, []);
  assert.equal(view(state).defaultTab, 'move');
  assert.deepEqual(state.records, ['photograph', 'survey_log']);
  for (const id of state.records) assert.ok(RECORDS[id].body, `${id} remains readable from the notebook`);
});

test('locked routes preserve their explanations and disabled interactions create no hotspots', () => {
  const junction = apply(initialState(), 'go:airlock', 'go:junction');
  const actions = availableActions(junction);
  const presented = mobileActions(junction, actions);
  assert.deepEqual(presented.routes, actions.filter(action => action.kind === 'move'));
  const shaft = presented.routes.find(action => action.target === 'shaft');
  assert.equal(shaft.disabled, true);
  assert.match(shaft.reason, /inspection lamps/);
  assert.equal(presented.routes.find(action => action.target === 'airlock').disabled, false);
  assert.equal(presented.defaultTab, 'move');
  const beacon = view(apply(initialState(), 'go:beacon'));
  assert.equal(beacon.interactions[0].disabled, true);
  assert.match(beacon.interactions[0].reason, /field recorder/);
  assert.deepEqual(beacon.hotspots, []);
  assert.equal(beacon.defaultTab, 'move');
});

test('completed safety checks and restored circuit controls no longer crowd the action list', () => {
  let state = apply(initialState(), 'go:airlock');
  assert.ok(ids(view(state).interactions).includes('check-return'));
  state = apply(state, 'check-return');
  assert.deepEqual(view(state).interactions, []);
  state = apply(state, 'go:junction', 'go:service', 'read-maintenance', 'open-panel');
  assert.deepEqual(ids(view(state).interactions), ['power-inspection', 'power-receiver']);
  state = apply(state, 'power-inspection');
  assert.deepEqual(view(state).interactions, []);
  assert.deepEqual(ids(view(state).routes), ['go:junction']);
  assert.equal(view(state).defaultTab, 'move');
});

test('diagnosis keeps both receiver choices while removing the overlapping listen marker', () => {
  let state = beforeDiagnosis();
  assert.ok(ids(view(state).hotspots).includes('listen-receiver'));
  state = apply(state, 'listen-receiver', 'inspect-cable', 'compare-signal');
  const presented = view(state);
  assert.deepEqual(ids(presented.interactions), ['listen-receiver', 'mute-receiver', 'redirect-receiver']);
  assert.deepEqual(ids(presented.hotspots), ['mute-receiver', 'redirect-receiver']);
  assert.equal(presented.defaultTab, 'inspect');
  for (const mode of ['mute', 'redirect']) {
    const resolved = view(apply(state, `${mode}-receiver`));
    assert.deepEqual(resolved.interactions, []);
    assert.equal(resolved.routes.find(action => action.target === 'lower').disabled, false);
    assert.equal(resolved.defaultTab, 'move');
  }
});

test('a replay alone does not hold Inspect open when missing evidence requires a different room', () => {
  const state = apply(initialState(), 'go:airlock', 'go:junction', 'go:service', 'read-maintenance',
    'open-panel', 'power-inspection', 'go:junction', 'go:shaft', 'listen-receiver', 'inspect-cable');
  const presented = view(state);
  assert.ok(presented.interactions.some(action => action.id === 'listen-receiver' && !action.disabled));
  assert.equal(presented.interactions.find(action => action.id === 'compare-signal').disabled, true);
  assert.equal(presented.defaultTab, 'move');
});

test('presentation accepts frozen inputs without modifying the state or action descriptors', () => {
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const state = freeze(beforeDiagnosis());
  const actions = freeze(availableActions(state));
  const before = JSON.stringify({ state, actions });
  const presented = mobileActions(state, actions);
  for (const action of [...presented.routes, ...presented.interactions, ...presented.hotspots]) {
    assert.ok(actions.includes(action), 'presentation preserves the authoritative descriptor');
  }
  assert.equal(JSON.stringify({ state, actions }), before);
  assert.equal(mobileLabel(actions.find(action => action.id === 'inspect-cable')), 'Cable marks');
  assert.equal(mobileLabel({ id: 'future-action', label: 'Future action' }), 'Future action');
});

for (const mode of ['mute', 'redirect']) {
  test(`the mobile controls retain every required action through the ${mode} ending`, () => {
    let state = initialState();
    const path = ['read-dispatch', 'go:airlock', 'check-return', 'go:junction', 'go:survey',
      'take-photo', 'read-survey-log', 'go:junction', 'go:service', 'read-maintenance', 'open-panel',
      'power-inspection', 'go:junction', 'go:shaft', 'listen-receiver', 'inspect-cable', 'compare-signal',
      `${mode}-receiver`, 'go:lower', 'recover-recorder', 'go:shaft', 'go:junction', 'go:airlock',
      'go:approach', 'go:beacon', 'publish-warning', 'go:approach', 'go:airlock', 'finish'];
    for (const id of path) {
      const presented = view(state);
      const action = [...presented.interactions, ...presented.routes].find(candidate => candidate.id === id);
      assert.ok(action && !action.disabled, `${id} must be reachable in the mobile action area`);
      state = perform(state, id).state;
    }
    assert.ok(getEnding(state));
    assert.equal(getEnding(state).recordsRecovered, 6);
    assert.deepEqual(view(state), { interactions: [], routes: [], defaultTab: 'inspect', hotspots: [] });
  });
}
