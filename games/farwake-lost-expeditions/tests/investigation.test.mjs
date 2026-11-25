import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, perform, availableActions, hydrateState } from '../dist/state.mjs';
import { SCENES } from '../dist/content.mjs';
import { EVIDENCE_QUESTIONS, evidenceCards, assessEvidence, sceneObservations, sceneObservationLead } from '../dist/investigation.mjs';

const apply = (state, ...ids) => ids.reduce((s, id) => {
  const action = availableActions(s).find(option => option.id === id);
  assert.ok(action && !action.disabled, `${id} must be available in ${s.scene}`);
  return perform(s, id).state;
}, state);

const beforeShaft = () => apply(initialState(), 'go:airlock', 'go:junction', 'go:survey',
  'take-photo', 'read-survey-log', 'go:junction', 'go:service', 'read-maintenance',
  'open-panel', 'power-inspection', 'go:junction', 'go:shaft');
const ready = () => apply(beforeShaft(), 'listen-receiver', 'inspect-cable');
const correctAnswers = { signal: 'repeated-call', return: 'separate-supply' };

test('evidence cards reveal only collected and listened clues, including after reload', () => {
  assert.deepEqual(evidenceCards(initialState()), []);
  const photograph = apply(initialState(), 'go:airlock', 'go:junction', 'go:survey', 'take-photo');
  assert.deepEqual(evidenceCards(photograph).map(card => card.id), ['photograph']);
  const listening = apply(beforeShaft(), 'listen-receiver');
  assert.deepEqual(evidenceCards(listening).map(card => card.id), ['photograph', 'survey_log', 'receiver']);
  assert.deepEqual(evidenceCards(hydrateState(JSON.parse(JSON.stringify(listening)))), evidenceCards(listening));
  assert.equal(evidenceCards(ready()).length, 4);
});

test('the comparison cannot be solved by guessing while any original clue is missing', () => {
  const complete = ready();
  for (const id of ['photograph', 'survey_log', 'cable_marks', 'receiver']) {
    const partial = structuredClone(complete);
    if (id === 'receiver') partial.flags.receiverListened = false;
    else partial.records = partial.records.filter(record => record !== id);
    const result = assessEvidence(partial, correctAnswers);
    assert.equal(result.ready, false, id);
    assert.equal(result.correct, false, id);
    assert.equal(result.missing.length, 1, id);
  }
});

test('incorrect or incomplete conclusions provide feedback without changing the recovery', () => {
  const s = ready(), before = JSON.stringify(s);
  for (const answers of [null, [], {}, { signal: 'unknown' }, { signal: 'repeated-call' },
    { signal: 'live-reply', return: 'separate-supply' },
    { signal: 'crew-fate', return: 'separate-supply' },
    { signal: 'repeated-call', return: 'all-power' },
    { signal: 'repeated-call', return: 'follow-call' }]) {
    const result = assessEvidence(s, answers);
    assert.equal(result.ready, true);
    assert.equal(result.correct, false);
    assert.ok(result.feedback.length > 20);
    assert.equal(JSON.stringify(s), before);
  }
  assert.match(assessEvidence(s, { signal: 'crew-fate', return: 'separate-supply' }).feedback, /do not establish/);
  assert.match(assessEvidence(s, { signal: 'repeated-call', return: 'all-power' }).feedback, /separate supply/);
});

test('supported conclusions leave both existing receiver resolutions available', () => {
  for (const mode of ['mute', 'redirect']) {
    const s = ready(), before = JSON.stringify(s);
    assert.deepEqual(assessEvidence(s, correctAnswers), {
      ready: true, correct: true, missing: [],
      feedback: 'The call is repeating, and the green return supply is independent. You can now choose whether to mute the receiver or redirect it into the side shaft.'
    });
    assert.equal(JSON.stringify(s), before);
    const decided = apply(s, 'compare-signal', `${mode}-receiver`);
    assert.equal(decided.receiverMode, mode);
    assert.equal(decided.flags.inspectionPowered, true);
  }
});

test('optional observations follow the room and do not grant evidence or disclose the creature early', () => {
  const s = ready(), before = JSON.stringify(s);
  const earlyText = [JSON.stringify(EVIDENCE_QUESTIONS), JSON.stringify(evidenceCards(s))];
  for (const scene of Object.keys(SCENES)) {
    const located = { ...s, scene };
    const observations = sceneObservations(located);
    assert.ok(observations.length >= 1 && observations.length <= 2, scene);
    assert.equal(new Set(observations.map(item => item.id)).size, observations.length);
    assert.ok(sceneObservationLead(located).length > 0);
    earlyText.push(sceneObservationLead(located), ...observations.map(item => item.body));
  }
  assert.doesNotMatch(earlyText.join(' '), /animal|mimic|glassmaw|Collective|Earth.?s core/i);
  assert.equal(JSON.stringify(s), before);
  const first = sceneObservations(s);
  first[0].body = 'Changed by a caller';
  first[0].anchor[0] = -500;
  assert.notEqual(sceneObservations(s)[0].body, first[0].body);
  assert.ok(sceneObservations(s)[0].anchor[0] >= 0);
});

test('revisits describe the chosen receiver outcome and recovered recorder accurately', () => {
  const diagnosed = apply(ready(), 'compare-signal');
  const muted = apply(diagnosed, 'mute-receiver');
  const redirected = apply(diagnosed, 'redirect-receiver');
  assert.match(sceneObservationLead(muted), /stopped/);
  assert.match(sceneObservationLead(redirected), /side shaft/);
  assert.doesNotMatch(sceneObservationLead(muted), /side shaft/);
  const recovered = apply(muted, 'go:lower', 'recover-recorder');
  assert.match(sceneObservations(recovered)[0].body, /clean outline/);
  assert.match(sceneObservationLead(recovered), /recorder is with you/);
  const warned = apply(recovered, 'go:shaft', 'go:junction', 'go:airlock', 'go:approach', 'go:beacon', 'publish-warning');
  assert.match(sceneObservations(warned)[0].body, /makes no claim/);
  assert.match(sceneObservationLead(warned), /last step is the airlock/);
});
