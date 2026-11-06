import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY, DEFAULT_SETTINGS, SETTING_RANGES, normalizeSettings, loadSettings, saveSettings } from '../public/settings.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values, writes,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); writes.push(key); },
  };
}

test('new settings are usable and silent by default, respecting the device motion preference', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.equal(normalizeSettings(null).sound, false);
  assert.equal(normalizeSettings(null, true).reduced, true);
  assert.equal(normalizeSettings({ reduced: false }, true).reduced, false, 'an explicit saved choice overrides the device default');
  const copy = normalizeSettings(null);
  copy.brightness = 1.8;
  assert.equal(DEFAULT_SETTINGS.brightness, 1.2, 'a returned settings object does not mutate defaults');
});

test('every numeric setting is bounded before it can affect controls, rendering or volume', () => {
  for (const [key, [min, max]] of Object.entries(SETTING_RANGES)) {
    assert.equal(normalizeSettings({ [key]: min - 100 })[key], min, key);
    assert.equal(normalizeSettings({ [key]: max + 100 })[key], max, key);
    assert.equal(normalizeSettings({ [key]: (min + max) / 2 })[key], (min + max) / 2, key);
    for (const value of [NaN, Infinity, -Infinity, null, undefined, '', '1', '<input>', {}, []]) {
      assert.equal(normalizeSettings({ [key]: value })[key], DEFAULT_SETTINGS[key], `${key} rejects ${String(value)}`);
    }
  }
});

test('boolean preferences require actual booleans and unrelated data cannot enter settings', () => {
  for (const key of ['invert', 'reduced', 'leftHanded', 'lookGuide', 'sound']) {
    assert.equal(normalizeSettings({ [key]: true })[key], true);
    assert.equal(normalizeSettings({ [key]: false })[key], false);
    for (const value of ['true', 'false', 0, 1, null, {}, []]) assert.equal(normalizeSettings({ [key]: value })[key], DEFAULT_SETTINGS[key]);
  }
  const clean = normalizeSettings({ room: 'quay', state: { won: true }, volume: 0.2, unknown: true });
  assert.deepEqual(Object.keys(clean).sort(), Object.keys(DEFAULT_SETTINGS).sort());
  assert.equal(clean.volume, 0.2);
});

test('older visual-only settings migrate without enabling sound or losing saved preferences', () => {
  const old = { brightness: 1.45, sensitivity: 1.4, invert: true, reduced: true };
  const store = storage({ [SETTINGS_KEY]: JSON.stringify(old) });
  const loaded = loadSettings(store);
  for (const [key, value] of Object.entries(old)) assert.equal(loaded[key], value);
  assert.equal(loaded.sound, false);
  assert.equal(loaded.stickSize, 88);
  assert.equal(loaded.lookGuide, true);
  assert.deepEqual(store.writes, [], 'reading preferences does not write a new save');
});

test('malformed or unavailable storage falls back without preventing the game from starting', () => {
  for (const raw of ['{broken', 'null', '[]', '"text"', '42', 'true']) {
    assert.deepEqual(loadSettings(storage({ [SETTINGS_KEY]: raw }), true), { ...DEFAULT_SETTINGS, reduced: true });
  }
  const denied = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage full'); } };
  assert.deepEqual(loadSettings(denied, true), { ...DEFAULT_SETTINGS, reduced: true });
  assert.equal(saveSettings(denied, { sound: true }), false);
  assert.deepEqual(loadSettings(undefined), DEFAULT_SETTINGS);
  assert.equal(saveSettings(undefined, DEFAULT_SETTINGS), false);
});

test('saving normalizes values and touches only the independent preference slot', () => {
  const solo = JSON.stringify({ state: { revision: 17, inventory: ['holdingKey'] }, owner: 'existing-run' });
  const team = JSON.stringify({ code: 'ABC234', token: 'existing-seat' });
  const store = storage({ 'night-transfer.solo.v1': solo, 'night-transfer.coop.session.v1': team });
  const preferences = { ...DEFAULT_SETTINGS, brightness: 99, stickSize: 500, sound: true, volume: 0.35, atmosphere: 0.2, leftHanded: true, lookGuide: false };
  const before = structuredClone(preferences);
  assert.equal(saveSettings(store, preferences), true);
  assert.deepEqual(preferences, before, 'saving does not mutate the caller');
  assert.deepEqual(store.writes, [SETTINGS_KEY]);
  const loaded = loadSettings(store);
  assert.equal(loaded.brightness, 1.8);
  assert.equal(loaded.stickSize, 124);
  assert.equal(loaded.volume, 0.35);
  assert.equal(loaded.atmosphere, 0.2);
  assert.equal(loaded.leftHanded, true);
  assert.equal(loaded.lookGuide, false);
  assert.equal(store.values.get('night-transfer.solo.v1'), solo);
  assert.equal(store.values.get('night-transfer.coop.session.v1'), team);
  assert.equal(saveSettings(store, { ...loaded, sound: false }), true);
  const muted = loadSettings(store);
  assert.equal(muted.sound, false);
  assert.equal(muted.volume, 0.35, 'muting retains the chosen listening level');
  assert.equal(muted.atmosphere, 0.2, 'muting retains the chosen atmosphere mix');
});
