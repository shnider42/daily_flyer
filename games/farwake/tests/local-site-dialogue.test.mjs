import test from 'node:test';
import assert from 'node:assert/strict';
import { localSiteResponse } from '../dist/local-site-dialogue.mjs';
import { SPECIES_HOMEWORLDS, SPECIES_INTERIOR_RESIDENTS } from '../dist/species-content.mjs';

function fixture(bodyId = 'avel', option) {
  const { systemId } = SPECIES_HOMEWORLDS.find(row => row.body.id === bodyId), siteId = bodyId === 'avel' ? 'threshold-house' : 'repair-court';
  const resident = SPECIES_INTERIOR_RESIDENTS[`${bodyId}:${siteId}`].find(row => row.data?.localSiteResponses), rule = resident.data.localSiteResponses[0];
  const siteKey = `${bodyId}:site:${siteId}`, recordKey = `${systemId}:${bodyId}:${siteId}`;
  const encounter = { id: siteKey, choices: option ? { [rule.choiceId]: option } : {} };
  const entity = { ...resident, data: { ...resident.data, bodyId, siteId } };
  const state = { mode: 'person', systemId, locationId: siteKey, credits: 180, rep: { freewake: 0 },
    exploration: { key: recordKey, bodyId, siteId, encounter },
    interior: { kind: 'site', location: { id: siteKey, parentId: bodyId, siteId } },
    explorationRecords: { [recordKey]: structuredClone(encounter) }
  };
  return { state, entity, rule, encounter, recordKey, siteKey };
}

test('locals acknowledge only a recorded option and preserve state, rewards and relationships', () => {
  for (const body of ['avel', 'hadrun']) {
    const beforeChoice = fixture(body); assert.equal(localSiteResponse(beforeChoice.state, beforeChoice.entity), null);
    for (const option of Object.keys(beforeChoice.rule.options)) {
      const { state, entity, rule } = fixture(body, option), before = JSON.stringify({ state, entity });
      assert.deepEqual(localSiteResponse(state, entity), { context: 'local-choice', greeting: rule.options[option].greeting });
      assert.equal(JSON.stringify({ state, entity }), before);
      assert.ok(!/has been built|is repaired|is running|have finished/.test(rule.options[option].greeting), 'Advice is acknowledged without inventing completed construction.');
    }
  }
});

test('a current encounter wins over stale saved choices and exact saved records work after reload', () => {
  const { state, entity, rule, recordKey } = fixture('avel', 'ramp');
  state.explorationRecords[recordKey].choices[rule.choiceId] = 'washroom';
  assert.equal(localSiteResponse(state, entity).greeting, rule.options.ramp.greeting);
  state.exploration.encounter.choices = {};
  assert.equal(localSiteResponse(state, entity), null, 'A stale copy cannot manufacture an active choice.');
  state.exploration = null;
  assert.equal(localSiteResponse(state, entity).greeting, rule.options.washroom.greeting);
  state.explorationRecords[recordKey].id = 'hadrun:site:repair-court';
  assert.equal(localSiteResponse(state, entity), null);
});

test('remembered advice is not projected into another planet, site, system or ship', () => {
  const changes = [
    state => { state.locationId = 'morrow'; },
    state => { state.systemId = 'hearth'; },
    state => { state.mode = 'ship'; },
    state => { state.exploration.bodyId = 'hadrun'; },
    state => { state.exploration.siteId = 'repair-court'; },
    state => { state.exploration.key = 'another:record'; }
  ];
  for (const alter of changes) { const { state, entity } = fixture('avel', 'ramp'); alter(state); assert.equal(localSiteResponse(state, entity), null); }
  const { state, entity } = fixture('avel', 'ramp');
  entity.data.bodyId = 'hadrun'; assert.equal(localSiteResponse(state, entity), null);
});

test('malformed, inherited or unknown choices never become dialogue', () => {
  const { state, entity, rule } = fixture('avel', 'ramp');
  for (const invalid of [null, undefined, false, [], {}, { mode: 'person' }]) assert.equal(localSiteResponse(invalid, entity), null);
  for (const invalid of [null, undefined, false, [], {}, { data: { localSiteResponses: {} } }]) assert.equal(localSiteResponse(state, invalid), null);
  for (const value of ['constructor', '__proto__', 'invented', [], {}, 42]) {
    state.exploration.encounter.choices = { [rule.choiceId]: value };
    assert.equal(localSiteResponse(state, entity), null);
  }
  state.exploration.encounter.choices = Object.create({ [rule.choiceId]: 'ramp' });
  assert.equal(localSiteResponse(state, entity), null);
  state.exploration.encounter.choices = { [rule.choiceId]: 'ramp' };
  const inherited = { ...entity, data: { ...entity.data, localSiteResponses: [Object.create(rule)] } };
  assert.equal(localSiteResponse(state, inherited), null);
});
