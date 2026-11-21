import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATURES, creatureProfile, selectHabitatCreatures } from '../dist/creature-catalog.mjs';

const habitats = ['limestone', 'root-grotto', 'tidal', 'glacial', 'lava-tube', 'service-tunnel'];

test('habitat selection is stable, local and can reach every ordinary biological creature', () => {
  const seen = new Set(), variations = new Map();
  for (const habitat of habitats) {
    const compositions = new Set(); variations.set(habitat, compositions);
    for (let index = 0; index < 128; index++) {
      const seed = `ecology-selection-${index}`;
      const selected = selectHabitatCreatures(habitat, seed);
      assert.deepEqual(selected, selectHabitatCreatures(habitat, seed));
      assert.equal(new Set(selected.map(profile => profile.id)).size, selected.length);
      assert.equal(selected.length, 2);
      compositions.add(selected.map(profile => profile.id).join(','));
      for (const profile of selected) {
        assert.ok(profile.habitats.includes(habitat));
        assert.equal(profile.kind, 'biological');
        assert.notEqual(profile.id, 'bellwether');
        seen.add(profile.id);
      }
    }
  }
  assert.deepEqual(seen, new Set(Object.values(CREATURES).filter(profile => profile.randomSpawn).map(profile => profile.id)));
  for (const [habitat, compositions] of variations) assert.ok(compositions.size > 1, `${habitat} needs multiple possible compositions.`);
});

test('peaceful selection has compatible choices without inventing hostility or pulling in bosses', () => {
  for (const habitat of habitats) {
    const selected = selectHabitatCreatures(habitat, 'quiet-survey', { count: 2, peaceful: true });
    assert.equal(selected.length, 2, `${habitat} can support a quiet pair.`);
    for (const profile of selected) {
      assert.ok(profile.peacefulEligible && profile.habitats.includes(habitat));
      assert.equal(profile.hostileToPlayer, undefined, 'The physical encounter owns disposition.');
    }
  }
  assert.deepEqual(selectHabitatCreatures('tinbell-hollow', 'no-generic-boss'), []);
  assert.deepEqual(selectHabitatCreatures('limestone', 'empty-site', { count: 0 }), []);
  assert.deepEqual(selectHabitatCreatures('unknown-habitat', 'unknown'), []);
  assert.equal(creatureProfile('sentry-drone'), null);
  assert.equal(creatureProfile('human'), null);
  assert.equal(creatureProfile('__proto__'), null);
  assert.equal(creatureProfile(null), null);
});
