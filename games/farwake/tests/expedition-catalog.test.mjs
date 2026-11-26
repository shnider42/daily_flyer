import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGalaxy } from '../dist/engine.mjs';
import { createSiteState, inspectSiteRecord, claimSiteReward, explorationLocation } from '../dist/exploration.mjs';
import { applyStoryConsequences, storyGate, storyStatus, storyThreats, EXPEDITION_COMBAT_PROFILES } from '../dist/expedition-story-rules.mjs';
import { EXPEDITION_ARCHETYPES, EXPEDITION_LAYOUT_IDS, EXPEDITION_SHOWCASES, expeditionStorySites, materializeExpeditionArchetype, storyArchetypeById } from '../dist/expedition-stories.mjs';

const fresh = EXPEDITION_ARCHETYPES.filter(story => !story.legacy);
const knownSpecies = new Set(['human', 'choral', 'vaeli', 'keth', 'oru']);
const clone = value => JSON.parse(JSON.stringify(value));
const ok = (result, context) => { assert.equal(result?.ok, true, `${context}: ${result?.reason || 'action failed'}`); return result; };
const normalizedBiome = body => body.kind === 'asteroid' ? 'barren' : ({ arid: 'desert', earth: 'temperate' })[body.biome] || body.biome;
const assertSettlement = (result, authored, context) => {
  assert.equal(result.completed, true, context);
  for (const item of ['credits', 'ore', 'crystal', 'heal']) assert.equal(result[item], authored.reward?.[item], `${context}: ${item} reward`);
  assert.deepEqual(result.rep, authored.effects?.rep, `${context}: faction consequence`);
  assert.deepEqual(result.effects, authored.effects || {}, `${context}: outcome effects`);
  assert.equal(result.text, authored.text, `${context}: outcome prose`);
};

test('the fifty-entry catalog preserves both Hearth caverns and gives forty-nine different playable objectives', () => {
  assert.equal(EXPEDITION_ARCHETYPES.length, 50);
  assert.equal(fresh.length, 49);
  assert.equal(new Set(EXPEDITION_ARCHETYPES.map(story => story.id)).size, 50);
  assert.equal(new Set(fresh.map(story => story.objective)).size, 49);
  assert.deepEqual(EXPEDITION_ARCHETYPES.filter(story => story.legacy).map(story => story.legacyLocations), [[
    { bodyId: 'morrow', siteId: 'chalkfold' }, { bodyId: 'tinbell', siteId: 'hollow', bossId: 'bellwether' }
  ]]);
  assert.equal(materializeExpeditionArchetype('hearth-chalkfold'), null, 'Hearth remains in its released implementation.');
  assert.equal(storyArchetypeById('story-witness-archive'), storyArchetypeById('witness-archive'));
  assert.equal(storyArchetypeById('missing-archetype'), null);
  assert.deepEqual([...new Set(fresh.map(story => story.layout))].sort(), [...EXPEDITION_LAYOUT_IDS].sort());
  assert.equal(EXPEDITION_LAYOUT_IDS.length, 16);
  assert.equal(fresh.filter(story => story.satire).length, 3, 'Recruiting satire remains occasional.');
  assert.equal(fresh.filter(story => story.horror).length, 2, 'Horror is a small part of the wider galaxy.');
  const profiles = new Set();
  const residentSpecies = new Set();
  for (const story of fresh) {
    assert.ok(Object.isFrozen(story) && Object.isFrozen(story.choices), story.id);
    assert.match(story.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const field of ['name', 'objective', 'summary', 'story']) assert.ok(story[field]?.length > 10, `${story.id}: ${field}`);
    assert.equal(story.cols, 48); assert.equal(story.rows, 36);
    assert.equal(typeof story.outdoors, 'boolean');
    assert.ok(story.biomes.length > 0 && new Set(story.biomes).size === story.biomes.length);
    assert.ok(story.records.length > 0 && story.choices.length > 0, `${story.id}: evidence and an actual task`);
    assert.ok(story.choices.some(choice => choice.id === story.completionChoiceId));
    for (const items of [story.records, story.choices, story.caches, story.residents, story.hostiles]) {
      assert.equal(new Set(items.map(item => item.id)).size, items.length, `${story.id}: stable local identifiers`);
    }
    for (const person of story.residents) { assert.ok(knownSpecies.has(person.species), story.id); residentSpecies.add(person.species); }
    assert.ok(story.hostiles.length <= 8, `${story.id}: bounded battle`);
    for (const actor of story.hostiles) {
      assert.ok(EXPEDITION_COMBAT_PROFILES[actor.combatProfile], `${story.id}: ${actor.combatProfile}`);
      profiles.add(actor.combatProfile);
      assert.ok(Number.isInteger(actor.tileX) && actor.tileX > 0 && actor.tileX < story.cols - 1);
      assert.ok(Number.isInteger(actor.tileY) && actor.tileY > 0 && actor.tileY < story.rows - 1);
      if (actor.combatProfile.startsWith('faction-')) {
        assert.equal(actor.hostileToPlayer, false, `${story.id}: observing a faction battle does not make a captain an enemy`);
        assert.ok(actor.factionId && actor.hostileTo.length);
      }
    }
  }
  assert.deepEqual([...profiles].sort(), Object.keys(EXPEDITION_COMBAT_PROFILES).sort());
  assert.deepEqual([...residentSpecies].sort(), [...knownSpecies].sort());
});

test('all authored gates refer to real evidence and possible prior results without dependency cycles', () => {
  for (const story of fresh) {
    const records = new Map(story.records.map(record => [record.id, record]));
    const choices = new Map(story.choices.map(choice => [choice.id, choice]));
    const dependencies = new Map();
    const gate = (node, source) => {
      const edges = dependencies.get(node) || new Set();
      for (const id of source.requireRecords || []) { assert.ok(records.has(id), `${story.id}/${node}: missing record ${id}`); edges.add(`record:${id}`); }
      for (const [id, expected] of Object.entries(source.requireChoices || {})) {
        const target = choices.get(id); assert.ok(target, `${story.id}/${node}: missing choice ${id}`);
        const values = Array.isArray(expected) ? expected : [expected];
        for (const value of values) assert.ok(target.puzzle ? value === 'complete' : target.options.some(option => option.id === value), `${story.id}/${node}: impossible result ${id}=${value}`);
        edges.add(`choice:${id}`);
      }
      dependencies.set(node, edges);
    };
    for (const record of story.records) gate(`record:${record.id}`, record);
    for (const cache of story.caches) gate(`cache:${cache.id}`, cache);
    for (const choice of story.choices) {
      const node = `choice:${choice.id}`;
      gate(node, choice);
      assert.equal(new Set(choice.options.map(option => option.id)).size, choice.options.length);
      assert.ok(choice.options.length > 0);
      for (const option of choice.options) gate(node, option);
      if (choice.puzzle) {
        assert.ok(choice.puzzle.solution.length >= 2, `${story.id}: an ordered task has more than one step`);
        for (const id of choice.puzzle.solution) assert.ok(choice.options.some(option => option.id === id), `${story.id}: missing puzzle action ${id}`);
      }
    }
    const visiting = new Set(), visited = new Set();
    const visit = node => {
      assert.ok(!visiting.has(node), `${story.id}: cyclic prerequisite at ${node}`);
      if (visited.has(node)) return;
      visiting.add(node);
      for (const next of dependencies.get(node) || []) visit(next);
      visiting.delete(node); visited.add(node);
    };
    for (const node of dependencies.keys()) visit(node);
  }
});

test('all fifty archetypes have stable chart coverage without changing bodies, settlement slots, or protected worlds', () => {
  const showcaseIds = Object.values(EXPEDITION_SHOWCASES).flat();
  assert.equal(showcaseIds.length, 49);
  assert.equal(new Set(showcaseIds).size, 49);
  assert.deepEqual([...showcaseIds].sort(), fresh.map(story => story.id).sort());
  for (const seed of ['farwake', 'catalog-independent-stream']) {
    const galaxy = buildGalaxy(seed), before = JSON.stringify(galaxy), covered = new Set();
    assert.equal(galaxy.length,26);
    const byBody = new Map();
    for (const system of galaxy) for (const body of system.bodies) {
      const context = { ...body, systemId: system.id }, sites = expeditionStorySites(context, seed);
      byBody.set(body.id, { body: context, sites });
      if (!sites.length) continue;
      const oldSlots = ['hollow', 'shelter', 'field-relay'].map(id => explorationLocation(context, id, seed)?.site).filter(Boolean);
      assert.equal(sites.length, oldSlots.length, `${body.id}: original entrance count`);
      assert.deepEqual(sites.map(site => [site.tileX, site.tileY]), oldSlots.map(site => [site.tileX, site.tileY]), `${body.id}: original entrance footprints`);
      assert.equal(new Set(sites.map(site => site.id)).size, sites.length);
      for (const site of sites) {
        assert.ok(site.biomes.includes('any') || site.biomes.includes(normalizedBiome(body)), `${body.id}/${body.biome}: ${site.id} biome`);
        assert.equal(site.key, `${body.id}:site:${site.id}`);
        assert.equal(site.id, `story-${site.archetypeId}`);
        covered.add(site.archetypeId);
      }
    }
    assert.deepEqual([...covered].sort(), fresh.map(story => story.id).sort());
    for (const [bodyId, expected] of Object.entries(EXPEDITION_SHOWCASES)) {
      const actual = byBody.get(bodyId); assert.ok(actual, `showcase world ${bodyId} exists`);
      assert.deepEqual(actual.sites.slice(0, expected.length).map(site => site.archetypeId), expected, bodyId);
      assert.deepEqual(expeditionStorySites(actual.body, seed), actual.sites, `${bodyId}: repeatable selection`);
    }
    assert.equal(JSON.stringify(galaxy), before, 'Content selection never changes or consumes the galaxy stream.');
  }
  for (const body of [
    { id: 'morrow' }, { id: 'tinbell' }, { id: 'other-hearth-body', systemId: 'hearth' },
    { id: 'glimmer' }, { id: 'reedbank' }, { id: 'crosswind-vey' },
    { id: 'protected-port', portType: 'military' }, { id: 'protected-ground', military: true },
    { id: 'preflight-world', techLevel: 'preflight' }, { id: 'reedbound-world', culture: 'reedbound' },
    { id: 'station', kind: 'station' }, { id: 'blackhole', kind: 'blackhole' }, { id: 'unlandable', landable: false }
  ]) assert.deepEqual(expeditionStorySites(body), [], body.id);
});

test('materialization isolates mutable site data and gives peaceful fauna an accurate entrance cue', () => {
  const body = { id: 'materializer-world', biome: 'forest' };
  const one = materializeExpeditionArchetype('migration-fence', body), two = materializeExpeditionArchetype('migration-fence', body);
  assert.deepEqual(one, two); assert.equal(one.hostile, false); assert.equal(one.monsterCount, 1);
  one.choices[0].puzzle.solution.reverse(); one.residents[0].name = 'changed';
  assert.notDeepEqual(one, two);
  assert.deepEqual(two, materializeExpeditionArchetype('migration-fence', body));
  assert.equal(materializeExpeditionArchetype('nightglass-listening', body).terrainBiome, 'cave');
  assert.equal(materializeExpeditionArchetype('sleeping-foundry', body).terrainBiome, 'shelter');
  for (const id of ['quarantine-pantry', 'underice-hatch', 'buried-armistice', 'mosaic-provenance']) assert.equal(materializeExpeditionArchetype(id, body).outdoors, true, id);
});

/** Solve content through the public runtime. Combat is resolved only when an
 * authored action explicitly requires a clear field; combat AI has its own tests.
 * Every normal-choice branch is explored, so a plausible alternate cannot strand
 * a later task behind the wrong result ID. */
function walkOutcomes(site, state = createSiteState(site), path = [], outcomes = []) {
  let evidenceChanged;
  do {
    evidenceChanged = false;
    for (const record of site.records) if (!state.story.readRecords.includes(record.id) && storyGate(state, site, record).ok) {
      ok(inspectSiteRecord(site, record.id, state), `${site.id}/${record.id}`); evidenceChanged = true;
    }
  } while (evidenceChanged);
  const settleCombatGate = (draft, gate) => {
    if (!gate.requireClear || !storyThreats(draft).length) return;
    if (!storyGate(draft, site, { ...gate, requireClear: false }).ok) return;
    for (const actor of storyThreats(draft)) { actor.health = 0; actor.status = 'dead'; }
    applyStoryConsequences(draft, site);
  };
  const choice = site.choices.find(choice => !state.choices[choice.id]);
  if (!choice) {
    const status = storyStatus(state, site);
    assert.equal(status.completed, true, `${site.id}: ${path.join('/')}`);
    assert.ok(status.aftermath.trim().length, `${site.id}: persistent resolution`);
    assert.equal(status.completedTasks, status.taskCount);
    assert.equal(status.nextTargetId, null);
    const expectedNotes = site.choices.map(task => task.puzzle || task.options.find(option => option.id === state.choices[task.id])).map(outcome => outcome.effects?.aftermath).filter(Boolean);
    assert.deepEqual(status.aftermathNotes, expectedNotes, `${site.id}: honest selected aftermath`);
    const restored = createSiteState(site, clone(state));
    assert.deepEqual(storyStatus(restored, site), status, `${site.id}: saved outcome`);
    const before = JSON.stringify(restored);
    for (const task of site.choices) {
      const optionId = task.puzzle ? task.puzzle.solution.at(-1) : restored.choices[task.id];
      const repeat = claimSiteReward(restored, site, task.id, optionId);
      assert.equal(repeat.ok, false, `${site.id}/${task.id}: cannot pay twice`);
      assert.equal(repeat.credits, undefined);
    }
    assert.equal(JSON.stringify(restored), before);
    outcomes.push({ path, aftermath: status.aftermath });
    return outcomes;
  }
  settleCombatGate(state, choice);
  assert.equal(storyGate(state, site, choice).ok, true, `${site.id}/${path.join('/')}: blocked ${choice.id}`);
  if (choice.puzzle) {
    const wrong = choice.options.find(option => option.id !== choice.puzzle.solution[0]);
    if (wrong) {
      const result = ok(claimSiteReward(state, site, choice.id, wrong.id), `${site.id}: wrong sequence remains retryable`);
      assert.equal(result.wrong, true); assert.equal(result.completed, false); assert.equal(result.credits, undefined);
      assert.equal(state.choices[choice.id], undefined);
    }
    for (const [index, id] of choice.puzzle.solution.entries()) {
      const result = ok(claimSiteReward(state, site, choice.id, id), `${site.id}/${choice.id}/${id}`);
      assert.equal(result.completed, index === choice.puzzle.solution.length - 1);
      if (!result.completed) {
        assert.equal(result.credits, undefined, `${site.id}: partial sequence is not a reward`);
        state = createSiteState(site, clone(state));
        assert.deepEqual(state.story.puzzles[choice.id], choice.puzzle.solution.slice(0, index + 1), `${site.id}: partial sequence survives save`);
      } else assertSettlement(result, choice.puzzle, `${site.id}/${choice.id}`);
    }
    assert.equal(state.choices[choice.id], 'complete');
    return walkOutcomes(site, state, [...path, `${choice.id}=complete`], outcomes);
  }
  let branches = 0;
  for (const option of choice.options) {
    const branch = createSiteState(site, clone(state));
    settleCombatGate(branch, option);
    if (!storyGate(branch, site, option).ok) continue;
    const result = ok(claimSiteReward(branch, site, choice.id, option.id), `${site.id}/${choice.id}/${option.id}`);
    assertSettlement(result, option, `${site.id}/${choice.id}/${option.id}`);
    branches++;
    walkOutcomes(site, branch, [...path, `${choice.id}=${option.id}`], outcomes);
  }
  assert.ok(branches > 0, `${site.id}/${choice.id}: at least one attainable continuation`);
  return outcomes;
}

for (const archetype of fresh) test(`playable catalog: ${archetype.id} resolves every authored branch and persists its outcome`, () => {
  const site = materializeExpeditionArchetype(archetype, { id: 'catalog-walkthrough', biome: archetype.biomes[0] });
  const outcomes = walkOutcomes(site);
  assert.ok(outcomes.length > 0);
  const reached = new Set(outcomes.flatMap(outcome => outcome.path));
  for (const choice of site.choices.filter(choice => !choice.puzzle)) for (const option of choice.options) {
    assert.ok(reached.has(`${choice.id}=${option.id}`), `${site.id}: authored option ${choice.id}/${option.id} reaches a complete outcome`);
  }
});
