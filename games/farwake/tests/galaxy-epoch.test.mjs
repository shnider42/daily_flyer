import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { GALAXY_EPOCH, NEW_GALAXY_REQUIRED } from '../dist/galaxy-epoch.mjs';
import { readSave, saveGame, STORAGE_KEY } from '../dist/ui.mjs';
import { readPassport, readPassports, savePassport, PASSPORT_STORAGE_KEY } from '../dist/network.mjs';
import { collectBrowserData } from '../dist/privacy-data.mjs';

test('new-chart voyages reload their captain and progress without starting again', () => {
  const game = new Game('compact-reload', { startMode: 'casual' });
  game.state.credits = 741;
  game.state.cargo.ore = 9;
  game.state.flags.push('compact-test-progress');
  game.state.knownLore.push('the_quiet');
  const saved = game.save(), before = structuredClone(saved);
  const restored = Game.fromSave(JSON.stringify(saved));
  assert.equal(saved.galaxyEpoch, GALAXY_EPOCH);
  assert.equal(restored.state.galaxyEpoch, GALAXY_EPOCH);
  assert.equal(restored.state.ship.id, game.state.ship.id);
  assert.equal(restored.state.credits, 741);
  assert.equal(restored.state.cargo.ore, 9);
  assert.ok(restored.hasFlag('compact-test-progress'));
  assert.ok(restored.state.knownLore.includes('the_quiet'));
  assert.deepEqual(saved, before);
});

test('precompact imports fail clearly before old locations enter the new game', () => {
  const legacy = new Game('old-import-fixture').save();
  delete legacy.galaxyEpoch;
  legacy.systemId = 'sector-287';
  legacy.locationId = 'world-287';
  legacy.credits = 1927;
  const before = structuredClone(legacy);
  for (const input of [legacy, { state: legacy }, JSON.stringify(legacy)]) {
    assert.throws(() => Game.fromSave(input), error => error.code === NEW_GALAXY_REQUIRED && /Start a new solo voyage/.test(error.message));
  }
  assert.throws(() => new Game({ ...legacy, galaxyEpoch: 'another-chart' }), error => error.code === NEW_GALAXY_REQUIRED);
  assert.deepEqual(legacy, before, 'Old saves are left intact; they are not partly migrated.');
});

test('the browser uses new save and passport slots while leaving earlier data and preferences intact', t => {
  const legacySaveKey = 'dfe.farwake.save.v1', legacyPassportKey = 'farwake.multiplayer.passport.v1';
  const oldPassport = { realmCode: 'OLDMAP26', captainId: 'old_captain', token: 'old-test-token' };
  const entries = new Map([
    [legacySaveKey, JSON.stringify({ seed: 'old', credits: 4321 })],
    [legacyPassportKey, JSON.stringify({ lastRealm: oldPassport.realmCode, [oldPassport.realmCode]: oldPassport })],
    ['dfe.farwake.settings.v1', JSON.stringify({ textScale: 1.3, sound: false })]
  ]);
  const original = new Map(['localStorage', 'document'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const storage = {
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, value); }
  };
  const saveLabel = { textContent: '' };
  Object.assign(globalThis, { localStorage: storage, document: { getElementById: () => saveLabel } });
  t.after(() => {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const oldSave = entries.get(legacySaveKey), oldPassports = entries.get(legacyPassportKey), preferences = entries.get('dfe.farwake.settings.v1');
  assert.equal(readSave(), null);
  assert.equal(readPassport(undefined, storage), null);
  assert.deepEqual(readPassports(storage), {});
  const game = new Game('browser-compact');
  game.state.credits = 526;
  assert.equal(saveGame(game), true);
  assert.equal(readSave().credits, 526);
  assert.equal(readSave().galaxyEpoch, GALAXY_EPOCH);
  const passport = { realmCode: 'NEWMAP26', captainId: 'new_captain', token: 'new-test-token' };
  savePassport(passport, storage);
  assert.deepEqual(readPassport(undefined, storage), passport);
  assert.ok(entries.has(STORAGE_KEY));
  assert.ok(entries.has(PASSPORT_STORAGE_KEY));
  const report = collectBrowserData(storage);
  assert.equal(report.data.soloVoyage.credits, 526);
  assert.deepEqual(report.data.savedCaptains.map(captain => captain.realmCode), ['NEWMAP26']);
  assert.ok(!JSON.stringify(report).includes(passport.token));
  assert.equal(entries.get(legacySaveKey), oldSave);
  assert.equal(entries.get(legacyPassportKey), oldPassports);
  assert.equal(entries.get('dfe.farwake.settings.v1'), preferences);
});
