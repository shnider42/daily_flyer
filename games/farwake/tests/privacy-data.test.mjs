import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_DATA_KEYS as KEYS, availableCaptains, collectBrowserData, normalizePassport, pickDeviceSettings, requestCaptainData } from '../dist/privacy-data.mjs';
import { FarwakeNetwork, readPassport, savePassport } from '../dist/network.mjs';
import { readSettings, applySettings } from '../dist/ui.mjs';

const first = { realmCode: 'GALAXY01', captainId: 'captain_first', token: 'private-first-credential-1234567890123456789' };
const second = { realmCode: 'GALAXY02', captainId: 'captain_second', token: 'private-second-credential-12345678901234567' };
const copy = value => JSON.parse(JSON.stringify(value));
function browserStorage(values = {}) {
  const entries = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const reads = [], writes = [];
  return {
    entries, reads, writes,
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { reads.push(key); return entries.get(key) ?? null; },
    setItem(key, value) { writes.push(key); entries.set(key, value); },
    removeItem(key) { writes.push(key); entries.delete(key); }
  };
}
const serverReport = passport => ({ schemaVersion: 1, scope: { kind: 'farwake-shared-captain', realmCode: passport.realmCode, captainId: passport.captainId, source: 'live-authority' }, captain: { id: passport.captainId, game: { activityTokens: ['work:kettle:1'], stats: { jobs: 3 } } }, manifest: { exclusions: ['Private credentials and provider logs'] } });

test('browser export reads only Farwake values, discloses device-wide scope and never mutates stored data', () => {
  const storage = browserStorage({
    [KEYS.voyage]: { seed: 'solo-one', captainName: 'Player One', stats: { jobs: 2 }, activityTokens: ['work:solo:1'] },
    [KEYS.settings]: { guidance: 'moderate', sound: false, worldZoom: .7, mysteryProfile: { email: 'never-export@example.invalid' } },
    [KEYS.guidance]: { '["solo","solo-one"]': { profileId: '["solo","solo-one"]', counts: { dock: 2 } }, '["captain","GALAXY02","captain_second"]': { counts: { mine: 1 } } },
    [KEYS.passports]: { GALAXY01: first, GALAXY02: second, lastRealm: 'GALAXY02' },
    [KEYS.cameraPrefix + 'GALAXY01:captain_first']: { key: 'GALAXY01:captain_first', revision: 3, fields: { shipZoom: .35 } },
    'unrelated-site-session': { token: 'unrelated-private-data' },
    'unrelated-journal': { text: 'not Farwake information' }
  });
  const before = [...storage.entries];
  const report = collectBrowserData(storage, { now: () => '2026-11-10T20:00:00Z' });
  assert.equal(report.scope.kind, 'this-browser');
  assert.equal(report.scope.deviceWide, true);
  assert.equal(report.scope.includesServerData, false);
  assert.match(report.scope.description, /more than one player/);
  assert.equal(report.generatedAt, '2026-11-10T20:00:00.000Z');
  assert.equal(report.data.soloVoyage.captainName, 'Player One');
  assert.deepEqual(report.data.soloVoyage.activityTokens, ['work:solo:1']);
  assert.equal(report.data.deviceSettings.worldZoom, .7);
  assert.equal(report.data.deviceSettings.mysteryProfile, undefined);
  assert.equal(report.manifest.omissions.unrecognizedSettingsFields, 1);
  assert.equal(report.data.savedCaptains.length, 2);
  assert.equal(report.data.savedCaptains[1].lastUsedOnThisBrowser, true);
  assert.equal(Object.keys(report.data.actionTipProfiles).length, 2);
  assert.equal(report.data.pendingCameraChanges[0].data.fields.shipZoom, .35);
  const serialized = JSON.stringify(report);
  for (const secret of [first.token, second.token, 'unrelated-private-data', 'not Farwake information', 'never-export@example.invalid']) assert.ok(!serialized.includes(secret));
  assert.ok(storage.reads.every(key => Object.values(KEYS).includes(key) || key.startsWith(KEYS.cameraPrefix)));
  assert.deepEqual([...storage.entries], before);
  assert.deepEqual(storage.writes, []);
});

test('credential keys, copied credential values and imported prototype fields cannot leak or alter prototypes', () => {
  const voyage = JSON.parse('{"seed":"safe","__proto__":{"token":"hidden-prototype-secret","notPrototype":true},"tokenHash":"hash-to-omit","activityTokens":["legitimate-game-dedupe"],"nested":[{"refresh_token":"refresh-to-omit","signingKey":"signing-key-to-omit","credentials":{"value":"credentials-to-omit"},"note":"prefix '+first.token+' suffix"}]}');
  const storage = browserStorage({ [KEYS.voyage]: voyage, [KEYS.passports]: { GALAXY01: { ...first, tokenHash: 'stored-hash-to-omit' } } });
  const report = collectBrowserData(storage);
  const serialized = JSON.stringify(report);
  for (const secret of [first.token, 'hash-to-omit', 'refresh-to-omit', 'hidden-prototype-secret', 'stored-hash-to-omit', 'signing-key-to-omit', 'credentials-to-omit']) assert.ok(!serialized.includes(secret));
  assert.equal(report.data.soloVoyage.nested[0].note, 'prefix [credential omitted] suffix');
  assert.deepEqual(report.data.soloVoyage.activityTokens, ['legitimate-game-dedupe']);
  assert.equal({}.notPrototype, undefined);
  assert.ok(report.manifest.omissions.credentialFields >= 4);
  assert.ok(report.manifest.omissions.credentialValues >= 1);
});

test('unavailable or malformed browser records fail explicitly without an incomplete download or a write', () => {
  assert.throws(() => collectBrowserData(null), /unavailable/);
  assert.throws(() => collectBrowserData({ getItem() { throw new Error('blocked'); } }), /could not read browser storage/);
  for (const bad of ['{broken', '[]', 'null']) {
    const storage = browserStorage({ [KEYS.guidance]: bad });
    assert.throws(() => collectBrowserData(storage), /No browser data report was created/);
    assert.equal(storage.writes.length, 0);
  }
  const empty = collectBrowserData(browserStorage());
  assert.equal(empty.data.soloVoyage, null);
  assert.ok(empty.manifest.absentData.includes('soloVoyage'));
});

test('captain choices are distinct and only retain the required passport fields in memory', () => {
  const storage = browserStorage({ [KEYS.passports]: { GALAXY01: { ...first, endpoint: 'https://evil.invalid', email: 'unused@example.invalid' }, GALAXY02: second, lastRealm: 'GALAXY02', broken: { token: 'incomplete' } } });
  const choices = availableCaptains(storage, { ...first, extra: 'not-needed' });
  assert.equal(choices.length, 2);
  assert.deepEqual(choices.map(choice => choice.id), ['GALAXY01:captain_first', 'GALAXY02:captain_second']);
  assert.equal(choices[0].current, true); assert.equal(choices[1].current, false);
  assert.deepEqual(choices[0].passport, first);
  assert.equal(storage.writes.length, 0);
  assert.equal(normalizePassport({ ...first, realmCode: '__proto__' }), null);
});

test('selected server export sends only one credential in the POST body with no cookies, caching or redirects', async () => {
  const calls = [], expected = serverReport(second);
  const result = await requestCaptainData({ serverURL: 'https://galaxy.example.test', passport: { ...second, email: 'do-not-send', endpoint: 'https://evil.invalid', otherPassport: first }, fetchImpl: async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({ ok: true, export: expected }) };
  } });
  assert.equal(result, expected); assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, 'https://galaxy.example.test/api/privacy/export');
  assert.ok(!url.includes(second.token)); assert.ok(!url.includes(second.captainId));
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.deepEqual(JSON.parse(options.body), { passport: second });
  assert.deepEqual(result.captain.game.activityTokens, ['work:kettle:1']);
});

test('server export rejects another captain, credential-bearing results, non-JSON responses and HTTP failures', async () => {
  const request = fetchImpl => requestCaptainData({ serverURL: 'https://galaxy.example.test', passport: first, fetchImpl });
  await assert.rejects(request(async () => ({ ok: true, json: async () => ({ ok: true, export: serverReport(second) }) })), /selected captain/);
  for (const [field, value] of [['tokenHash', 'a'.repeat(64)], ['refresh_token', 'hidden'], ['signingKey', 'private-signing-key'], ['credentials', { value: 'credential-container' }], ['note', 'Copied '+first.token]]) {
    const report = serverReport(first); report.captain[field] = value;
    await assert.rejects(request(async () => ({ ok: true, json: async () => ({ ok: true, export: report }) })), /credential safety check/);
  }
  await assert.rejects(request(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })), /unreadable report/);
  for (const status of [401, 403, 404, 429, 500, 503]) await assert.rejects(request(async () => ({ ok: false, status })), /No .*report.*downloaded|No report was downloaded/);
  await assert.rejects(request(async () => { throw new Error('sensitive transport contents '+first.token); }), error => !error.message.includes(first.token) && /No server data report was downloaded/.test(error.message));
  await assert.rejects(requestCaptainData({ serverURL: 'http://remote.example.test', passport: first, fetchImpl: () => { throw new Error('must not fetch'); } }), /not valid/);
});

test('normal save/resume transport and recovery backups retain credentials but drop imported extras', async () => {
  const storage = browserStorage(), sent = [];
  const privateBackup = { ...first, email: 'unneeded@example.invalid', arbitrary: { secret: 'not-needed' } };
  savePassport(privateBackup, storage);
  assert.deepEqual(readPassport(first.realmCode, storage), first);
  const network = new FarwakeNetwork({ url: 'https://galaxy.example.test', storage, fetchImpl: async (url, options) => {
    sent.push({ url, options }); return { ok: true, json: async () => ({ ok: true, passport: { ...first, unnecessary: 'response-field' } }) };
  } });
  network._open = async () => ({ ok: true });
  await network.connect({ passport: privateBackup });
  assert.deepEqual(JSON.parse(sent[0].options.body).passport, first);
  assert.equal(sent[0].options.credentials, 'omit');
  assert.deepEqual(JSON.parse(network.exportPassport()), first);
  assert.deepEqual(readPassport(first.realmCode, storage), first);
});

test('settings minimization preserves legacy zoom and supported preferences without touching voyages', () => {
  const storage = browserStorage({ [KEYS.voyage]: { seed: 'keep-voyage', stats: { jobs: 4 } }, [KEYS.settings]: { worldZoom: .75, sound: false, guidance: 'expert', textScale: 1.3, controlScale: 1.1, hiddenProfile: { email: 'drop@example.invalid' }, token: first.token } });
  const beforeVoyage = storage.entries.get(KEYS.voyage);
  const old = new Map(['localStorage', 'window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { localStorage: storage, window: { matchMedia: () => ({ matches: false }) }, document: { body: { classList: { toggle() {} } }, documentElement: { style: { setProperty() {} } } } });
  try {
    const settings = readSettings();
    assert.equal(settings.shipZoom, .75); assert.equal(settings.personZoom, .75);
    assert.equal(settings.sound, false); assert.equal(settings.guidance, 'expert');
    assert.equal(settings.hiddenProfile, undefined); assert.equal(settings.token, undefined);
    settings.injected = 'never-persist';
    applySettings(settings);
    const saved = JSON.parse(storage.entries.get(KEYS.settings));
    assert.equal(saved.shipZoom, .75); assert.equal(saved.personZoom, .75);
    assert.equal(saved.textScale, 1.3); assert.equal(saved.controlScale, 1.1);
    assert.equal(saved.worldZoom, undefined); assert.equal(saved.injected, undefined);
    assert.equal(storage.entries.get(KEYS.voyage), beforeVoyage);
    assert.deepEqual(pickDeviceSettings({ sound: { password: 'x' }, guidance: 'wrong', shipZoom: 'bad' }), {});
  } finally {
    for (const [key, descriptor] of old) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
