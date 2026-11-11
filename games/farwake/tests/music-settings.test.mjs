import test from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, applySettings } from '../dist/ui.mjs';
import { BROWSER_DATA_KEYS, collectBrowserData, pickDeviceSettings } from '../dist/privacy-data.mjs';

function browser(initial) {
  const entries = new Map([
    [BROWSER_DATA_KEYS.voyage, JSON.stringify({ seed: 'music-preference-voyage', stats: { time: 180 } })],
    [BROWSER_DATA_KEYS.guidance, JSON.stringify({ learned: { dock: 2 } })],
    ['unrelated-note', 'private unrelated text'],
  ]);
  if (initial !== undefined) entries.set(BROWSER_DATA_KEYS.settings, JSON.stringify(initial));
  const writes = [];
  const storage = {
    get length() { return entries.size; },
    key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) { writes.push(key); entries.set(key, value); },
  };
  const originals = new Map(['window', 'document', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: false }) },
    document: { body: { classList: { toggle() {} } }, documentElement: { style: { setProperty() {} } } },
    localStorage: storage,
  });
  return { storage, entries, writes, restore() {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  } };
}

test('existing master-mute preferences migrate without unexpectedly starting music', () => {
  for (const oldMusic of [undefined, false, true]) {
    const old = { sound: false, ...(oldMusic === undefined ? {} : { music: oldMusic }), textScale: 1.3 };
    const b = browser(old);
    try {
      const settings = readSettings();
      assert.equal(settings.sound, false);
      assert.equal(settings.music, false, 'Old sound-off also muted the score, even when music was selected.');
      assert.equal(settings.textScale, 1.3);
      assert.equal(b.writes.length, 0, 'Reading/migrating preferences remains side-effect free.');
      applySettings(settings);
      assert.equal(readSettings().music, false, 'The effective mute survives a second visit.');
      assert.equal(JSON.parse(b.entries.get(BROWSER_DATA_KEYS.settings)).musicSettingsVersion, 1);
      settings.music = true;
      applySettings(settings);
      assert.equal(readSettings().sound, false);
      assert.equal(readSettings().music, true, 'An explicit later choice enables music independently of effects.');
    } finally { b.restore(); }
  }
});

test('existing music-off preferences remain off when sound effects were enabled', () => {
  const b = browser({ sound: true, music: false });
  try {
    const settings = readSettings();
    assert.equal(settings.sound, true);
    assert.equal(settings.music, false);
    applySettings(settings);
    assert.equal(readSettings().music, false);
  } finally { b.restore(); }
});

test('independent effects/music choices, zero volume, and cue cadence survive reload', () => {
  for (const sound of [false, true]) for (const music of [false, true]) {
    const b = browser();
    try {
      const initial = readSettings();
      for (const presence of ['quiet', 'balanced', 'frequent']) {
        for (const volume of [0, .35, 1]) {
          Object.assign(initial, { sound, music, musicPresence: presence, musicVolume: volume });
          applySettings(initial);
          const restored = readSettings();
          assert.equal(restored.sound, sound);
          assert.equal(restored.music, music);
          assert.equal(restored.musicVolume, volume, 'A zero-volume preference must not fall back to the default.');
          assert.equal(restored.musicPresence, presence);
        }
      }
      assert.ok(b.writes.every(key => key === BROWSER_DATA_KEYS.settings));
      assert.equal(JSON.parse(b.entries.get(BROWSER_DATA_KEYS.voyage)).seed, 'music-preference-voyage');
      assert.equal(b.entries.get('unrelated-note'), 'private unrelated text');
    } finally { b.restore(); }
  }
});

test('imported invalid music preferences cannot become arbitrary retained profile data', () => {
  assert.deepEqual(pickDeviceSettings({ musicVolume: 'loud', musicPresence: { mood: 'user-profile' }, musicSettingsVersion: Infinity }), {});
  assert.deepEqual(pickDeviceSettings({ musicVolume: NaN, musicPresence: 'always', music: [] }), {});
  for (const [volume, expected] of [[-20, 0], [20, 1]]) {
    const b = browser({ musicVolume: volume, musicPresence: 'unrecognized', sound: true });
    try {
      const settings = readSettings();
      assert.equal(settings.musicVolume, expected);
      assert.equal(settings.musicPresence, 'balanced');
      applySettings(settings);
      assert.equal(readSettings().musicVolume, expected);
    } finally { b.restore(); }
  }
});

test('browser data export includes music controls without retaining playback history or unrelated data', () => {
  const b = browser();
  try {
    const settings = readSettings();
    Object.assign(settings, {
      sound: false, music: true, musicVolume: .4, musicPresence: 'quiet',
      listeningHistory: ['private-session-cue'], currentMusic: { location: 'session-only' },
    });
    applySettings(settings);
    const before = [...b.entries], writeCount = b.writes.length;
    const report = collectBrowserData(b.storage, { now: () => '2026-11-11T12:00:00Z' });
    assert.equal(report.data.deviceSettings.sound, false);
    assert.equal(report.data.deviceSettings.music, true);
    assert.equal(report.data.deviceSettings.musicVolume, .4);
    assert.equal(report.data.deviceSettings.musicPresence, 'quiet');
    assert.equal(report.data.deviceSettings.musicSettingsVersion, 1);
    assert.equal(report.data.deviceSettings.listeningHistory, undefined);
    assert.equal(report.data.deviceSettings.currentMusic, undefined);
    assert.equal(report.manifest.omissions.unrecognizedSettingsFields, 0);
    assert.deepEqual([...b.entries], before);
    assert.equal(b.writes.length, writeCount, 'Inspection does not write settings or listening records.');
    assert.ok(!JSON.stringify(report).includes('private unrelated text'));
  } finally { b.restore(); }
});
