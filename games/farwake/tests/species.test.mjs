import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES, SPECIES_IDS, NONHUMAN_SPECIES_IDS, POPULATION_PROFILES,
  normalizeSpecies, isPeopleSpecies, isWildlifeSpecies, populationProfile,
  chooseNpcSpecies, speciesName, resolveNpcIdentity, speciesBackground
} from '../dist/species.mjs';
import {
  SPECIES_HOMEWORLDS, SPECIES_DISTRICT_NAMES, SPECIES_DISTRICT_RESIDENTS,
  SPECIES_PLANET_PLACES, SPECIES_INTERIOR_RESIDENTS
} from '../dist/species-content.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { explorationLocation, createSiteState, claimSiteReward, inspectSiteRecord } from '../dist/exploration.mjs';

test('species identities are a closed catalog, separate from wildlife and unsafe object keys', () => {
  assert.deepEqual(SPECIES_IDS, ['human', 'choral', 'vaeli', 'keth', 'oru']);
  assert.equal(NONHUMAN_SPECIES_IDS.length, 4);
  for (const value of [null, undefined, false, 42, {}, [], 'Human', 'constructor', '__proto__', 'toString', 'stoneback', 'skitter', 'invented']) {
    assert.equal(normalizeSpecies(value), 'human');
    assert.equal(isPeopleSpecies(value), false);
  }
  for (const id of SPECIES_IDS) { assert.equal(normalizeSpecies(id), id); assert.equal(isPeopleSpecies(id), true); assert.equal(isWildlifeSpecies(id), false); }
  assert.equal(isWildlifeSpecies('stoneback'), true); assert.equal(isWildlifeSpecies('skitter'), true);
  assert.equal(isWildlifeSpecies('not-in-catalog'), false);
  for (const entry of Object.values(SPECIES)) {
    assert.ok(Object.isFrozen(entry)); assert.ok(Object.isFrozen(entry.palette));
    for (const forbidden of ['faction', 'role', 'disposition', 'hostile', 'health', 'damage', 'speed']) assert.equal(Object.hasOwn(entry, forbidden), false);
  }
});

test('population profiles are bounded, immutable and keyed to places, not factions or cultures', () => {
  for (const rows of Object.values(POPULATION_PROFILES)) {
    assert.equal(rows.reduce((sum, row) => sum + row.weight, 0), 10000);
    assert.ok(Object.isFrozen(rows));
    for (const row of rows) { assert.ok(Object.isFrozen(row)); assert.ok(row.weight > 0); assert.ok(isPeopleSpecies(row.species)); }
  }
  assert.equal(populationProfile('morrow'), POPULATION_PROFILES.hearth);
  assert.equal(populationProfile({ id: 'new-body', systemId: 'hearth' }), POPULATION_PROFILES.hearth);
  assert.equal(populationProfile({ id: 'new-body', techLevel: 'preflight' }), POPULATION_PROFILES.human);
  assert.equal(populationProfile({ id: 'a-site', parentId: 'avel', kind: 'site' }), POPULATION_PROFILES['vaeli-home']);
  for (const faction of ['freewake', 'cinder', 'meridian', 'lantern', 'concord']) {
    assert.equal(populationProfile({ id: 'ordinary', faction, culture: 'choral', population: { human: 0 } }), POPULATION_PROFILES.settled);
  }
  assert.equal(populationProfile({ id: '__proto__' }), POPULATION_PROFILES.settled);
  assert.equal(populationProfile(Object.create({ id: 'avel' })), POPULATION_PROFILES.settled);
});

test('ordinary settlements remain overwhelmingly human while only specific homeworlds have nonhuman majorities', () => {
  const samples = 20000;
  function counts(body) { const result = Object.fromEntries(SPECIES_IDS.map(id => [id, 0])); for (let i = 0; i < samples; i++) result[chooseNpcSpecies('population-check', `resident:${i}`, body)]++; return result; }
  const settled = counts('frontier-a-world');
  assert.ok(settled.human / samples > .91 && settled.human / samples < .93);
  for (const id of NONHUMAN_SPECIES_IDS) assert.ok(settled[id] > 0 && settled[id] / samples < .04);
  const hearth = counts('morrow'); assert.ok(hearth.human / samples > .975); assert.equal(hearth.choral, 0);
  assert.ok(counts('chora').choral / samples > .80);
  assert.ok(counts('avel').vaeli / samples > .78);
  assert.ok(counts('hadrun').keth / samples > .78);
  assert.ok(counts('ochre-garden').human / samples > .63);
  assert.equal(counts('reedbank').human, samples);
  assert.equal(counts('earth').human, samples);
});

test('new identity selection is deterministic and independent of faction, time, role and creation order', () => {
  const baseline = [4, 42, 51, 64].map(index => chooseNpcSpecies('population-check', `resident:${index}`, { id: 'ordinary', faction: 'freewake' }));
  assert.deepEqual(baseline, ['keth', 'vaeli', 'oru', 'vaeli'], 'Version-one stream fixture protects existing generated people.');
  const reverse = [64, 51, 42, 4].map(index => chooseNpcSpecies('population-check', `resident:${index}`, { id: 'ordinary', faction: 'cinder', role: 'pirate', time: 999999 })).reverse();
  assert.deepEqual(reverse, baseline);
  for (let i = 0; i < 100; i++) chooseNpcSpecies('a-different-world', `other:${i}`, 'avel');
  assert.deepEqual([4, 42, 51, 64].map(index => chooseNpcSpecies('population-check', `resident:${index}`, 'ordinary')), baseline);
  assert.equal(chooseNpcSpecies('anything', null, 'avel'), 'human');
});

test('authored people and saved legacy identities are never recast by a homeworld population', () => {
  for (const body of ['chora', 'avel', 'hadrun']) {
    assert.equal(chooseNpcSpecies('old', `${body}:medic`, body, { authored: true }), 'human');
    assert.equal(chooseNpcSpecies('old', `${body}:medic`, body, { explicitSpecies: 'oru', authored: true }), 'oru');
    assert.equal(chooseNpcSpecies('old', `${body}:medic`, body, { explicitSpecies: 'unknown' }), 'human');
    const saved = { name: 'Iona Vale', species: undefined, faction: 'cinder', damage: 999 };
    assert.deepEqual(resolveNpcIdentity('changed-seed', 'same-person', body, { savedIdentity: saved }), { version: 1, species: 'human', name: 'Iona Vale' });
    assert.equal(saved.damage, 999, 'Normalizer does not mutate its caller.');
    assert.equal(resolveNpcIdentity('changed-seed', 'same-person', body, { savedIdentity: { name: 'Sae Meral', species: 'vaeli' } }).species, 'vaeli');
    assert.equal(resolveNpcIdentity('changed-seed', 'same-person', body, { savedIdentity: {} }).species, 'human');
  }
  assert.deepEqual(resolveNpcIdentity('seed', 'same', 'avel', { species: 'vaeli', name: 'Jo Renn' }), { version: 1, species: 'vaeli', name: 'Jo Renn' }, 'A nonhuman person may have a human-style name.');
  assert.equal(resolveNpcIdentity('seed', 'same', 'avel', { savedIdentity: Object.create({ species: 'keth', name: 'inherited' }) }).species, 'human');
});

test('ordinary homeworld workers anchor the visible local majority without changing visitors or authored identities', () => {
  for (const [body, species] of [['chora', 'choral'], ['avel', 'vaeli'], ['hadrun', 'keth']]) {
    for (const seed of ['one', 'two', 'old-save', 'shared-realm']) {
      for (const slot of ['mechanic', 'medic', 'bartender', 'story', 'field-keeper']) assert.equal(chooseNpcSpecies(seed, `${body}:${slot}`, { id: body }), species);
    }
  }
  assert.equal(chooseNpcSpecies('population-check', 'resident:4', 'avel'), 'keth', 'An unrelated resident keeps its weighted result.');
  assert.equal(chooseNpcSpecies('seed', 'avel:medic', { id: 'site', parentId: 'avel' }, { authored: true }), 'human');
});

test('names and optional replies are bounded, deterministic and do not introduce species-wide faction behavior', () => {
  for (const id of SPECIES_IDS) {
    const name = speciesName(id, 'name-test', 'person:44');
    assert.equal(name, speciesName(id, 'name-test', 'person:44')); assert.ok(name.length > 2 && name.length <= 90);
    const reply = speciesBackground(id, 'person:44', 'avel');
    assert.equal(reply, speciesBackground(id, 'person:44', 'avel')); assert.ok(reply.length > 20 && reply.length < 300);
    assert.equal(typeof reply, 'string');
  }
  const source = { species: 'vaeli', name: '<Sae>\u0000' + 'x'.repeat(200) };
  const normalized = resolveNpcIdentity('seed', 'id', 'avel', { savedIdentity: source });
  assert.equal(normalized.name.length, 90); assert.ok(!/[<>\u0000]/.test(normalized.name)); assert.ok(source.name.includes('<'));
  const replies = new Set(Array.from({ length: 30 }, (_, i) => speciesBackground('keth', `person:${i}`, 'hadrun')));
  assert.ok(replies.size >= 4, 'People on the same homeworld do not all supply the same cultural answer.');
});

test('authored additions keep a small bounded set of worlds, peaceful choices and individual people', () => {
  assert.equal(SPECIES_HOMEWORLDS.length, 2);
  assert.deepEqual(SPECIES_HOMEWORLDS.map(row => [row.systemId, row.body.id]), [['kindred', 'avel'], ['brassfall', 'hadrun']]);
  for (const { body } of SPECIES_HOMEWORLDS) {
    assert.equal(body.kind, 'planet'); assert.ok(NONHUMAN_SPECIES_IDS.includes(body.homeworldOf)); assert.equal(SPECIES_DISTRICT_NAMES[body.id].length, 4);
    assert.equal(SPECIES_PLANET_PLACES[body.id].length, 1);
    const site = SPECIES_PLANET_PLACES[body.id][0]; assert.equal(site.hostile, false); assert.equal(site.caches.length, 0); assert.equal(site.choices.length, 1);
    assert.equal(site.records.length, 2); assert.equal(site.choices[0].options.length, 2);
    for (const option of site.choices[0].options) assert.equal(option.reward, undefined, 'Civic advice is not a repeatable money faucet.');
    assert.equal(SPECIES_INTERIOR_RESIDENTS[`${body.id}:${site.id}`].length, 2);
  }
  for (const people of Object.values(SPECIES_DISTRICT_RESIDENTS)) {
    const ids = new Set();
    for (const person of people) { assert.ok(!ids.has(person.id)); ids.add(person.id); assert.ok(isPeopleSpecies(person.species)); assert.ok(Object.isFrozen(person)); }
  }
});

const peopleOn = map => map.entities.filter(entity => ['npc', 'medic', 'mechanic'].includes(entity.type) && !entity.data?.automated);
function reachableCells(map) {
  const tile = map.tileSize, start = Math.floor(map.spawn.y / tile) * map.cols + Math.floor(map.spawn.x / tile), queue = [start], seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i], x = cell % map.cols, y = Math.floor(cell / map.cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = ny * map.cols + nx;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows || seen.has(next) || !isWalkable(map, (nx + .5) * tile, (ny + .5) * tile)) continue;
      seen.add(next); queue.push(next);
    }
  }
  return seen;
}
function assertReachable(map, context) {
  const reached = reachableCells(map);
  assert.equal(new Set(map.entities.map(entity => entity.id)).size, map.entities.length, `${context}: unique entity IDs`);
  for (const entity of map.entities) {
    assert.ok(isWalkable(map, entity.x, entity.y), `${context}: ${entity.id} is on open ground`);
    assert.ok(reached.has(Math.floor(entity.y / map.tileSize) * map.cols + Math.floor(entity.x / map.tileSize)), `${context}: ${entity.id} has a route from arrival`);
  }
}

test('actual small homeworld settlements retain their local majority across seeds and do not recast authored humans', () => {
  for (const seed of Array.from({ length: 12 }, (_, i) => `homeworld-population:${i}`)) {
    for (const [bodyId, species] of [['chora', 'choral'], ['avel', 'vaeli'], ['hadrun', 'keth']]) {
      const map = generateSurface(bodyId, seed), people = peopleOn(map);
      assert.ok(people.length > 5, `${bodyId}: a settlement, not a single specimen`);
      assert.ok(people.filter(person => person.species === species).length > people.length / 2, `${seed}/${bodyId}: a visible local majority`);
      for (const person of people) assert.equal(person.species, person.data.species);
      if (bodyId === 'avel') assert.equal(people.find(person => person.name === 'Mina Renn')?.species, 'human');
      if (bodyId === 'hadrun') assert.equal(people.find(person => person.name === 'Neri Leth')?.species, 'oru');
    }
  }
});

test('new world doors, inhabitants, interior records and civic choices are physically reachable and save their result once', () => {
  for (const seed of ['people-paths', 'alternate-paths', 'legacy-voyage']) for (const { systemId, body } of SPECIES_HOMEWORLDS) {
    const local = { ...body, systemId }, map = generateSurface(local, seed);
    assertReachable(map, `${seed}/${body.id}`);
    for (const authored of SPECIES_PLANET_PLACES[body.id]) {
      assert.ok(map.entities.some(entity => entity.data?.siteId === authored.id && entity.type === 'siteEntrance'));
      const location = explorationLocation(local, authored.id, seed), interior = generateSurface(location, seed), site = location.site, state = createSiteState(site);
      assertReachable(interior, `${seed}/${site.key}`);
      assert.equal(state.monsters.length, 0); assert.equal(site.hostile, false);
      assert.ok(Math.hypot(interior.exit.x - interior.spawn.x, interior.exit.y - interior.spawn.y) <= 48);
      assert.equal(peopleOn(interior).length, SPECIES_INTERIOR_RESIDENTS[`${body.id}:${site.id}`].length);
      for (const record of site.records) {
        assert.ok(interior.entities.some(entity => entity.data?.recordId === record.id));
        assert.equal(inspectSiteRecord(site, record.id).ok, true);
      }
      const choice = site.choices[0], selected = choice.options[0];
      assert.ok(interior.entities.some(entity => entity.data?.choiceId === choice.id));
      const result = claimSiteReward(state, site, choice.id, selected.id); assert.equal(result.ok, true); assert.equal(result.credits, undefined);
      const restored = createSiteState(site, JSON.parse(JSON.stringify(state)));
      assert.equal(restored.choices[choice.id], selected.id);
      assert.equal(claimSiteReward(restored, site, choice.id, choice.options[1].id).ok, false);
    }
  }
});
