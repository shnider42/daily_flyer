import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraProfile } from '../dist/camera-profile.mjs';

const prefs = (shipZoom = 1, personZoom = 1) => ({ shipZoom, personZoom });
const reply = (revision, preferences, extra = {}) => ({ ok: true, cameraRevision: revision, cameraPreferences: preferences, ...extra });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture() {
  let id = 0;
  const timers = new Map(), changes = [];
  const profile = new CameraProfile({
    onChange: (preferences, status) => changes.push({ preferences, status }),
    schedule: callback => { timers.set(++id, callback); return id; },
    cancel: timer => timers.delete(timer),
  });
  const activate = (send, options = {}) => profile.activateShared({ key: 'realm:captain', preferences: prefs(), revision: 1, send, ...options });
  return { profile, timers, changes, activate };
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('default browser timers retain their host receiver while queuing, replacing, and flushing a save', async () => {
  const originalSchedule = globalThis.setTimeout, originalCancel = globalThis.clearTimeout;
  const timers = new Map(), calls = [];
  let timerId = 0, profile, flushed;
  // Browser host timers can reject a CameraProfile receiver with "Illegal
  // invocation". Node's timers and injected arrow-function fakes do not.
  globalThis.setTimeout = function (callback, delay) {
    assert.equal(this, globalThis, 'setTimeout must be called on its host');
    calls.push(['schedule', delay]);
    timers.set(++timerId, callback);
    return timerId;
  };
  globalThis.clearTimeout = function (id) {
    assert.equal(this, globalThis, 'clearTimeout must be called on its host');
    calls.push(['cancel', id]);
    timers.delete(id);
  };
  try {
    profile = new CameraProfile();
    const shared = { key: 'realm:captain', preferences: prefs(), revision: 1, send: async () => reply(2, prefs(1, .75)) };
    profile.activateShared(shared);
    profile.set('ship', .8);
    profile.set('ship', .7);
    assert.equal(timers.size, 1, 'a replacement slider edit keeps one debounce');
    profile.activateLocal(prefs());
    assert.equal(timers.size, 0, 'switching scope cancels the browser timer');
    profile.activateShared(shared);
    profile.set('person', .75);
    flushed = profile.flush();
    assert.equal(timers.size, 0, 'explicit flush clears its browser debounce');
  } finally {
    globalThis.setTimeout = originalSchedule;
    globalThis.clearTimeout = originalCancel;
  }
  assert.equal(await flushed, true);
  assert.equal(profile.status, 'saved');
  assert.equal(calls.filter(([kind]) => kind === 'schedule').length, 3);
  assert.equal(calls.filter(([kind]) => kind === 'cancel').length, 3);
});

test('local modes normalize independently and practice can restore the previous local values', async () => {
  const { profile } = fixture();
  profile.activateLocal(prefs(.8, 1.2));
  profile.set('ship', .24);
  assert.deepEqual(profile.preferences, prefs(.25, 1.2));
  const saved = profile.preferences;
  saved.shipZoom = .6;
  assert.equal(profile.preferences.shipZoom, .25, 'getter does not expose mutable internal values');
  const restore = profile.preferences;
  profile.activateLocal(restore, { practice: true });
  profile.set('person', .3);
  assert.equal(profile.status, 'practice');
  assert.deepEqual(profile.preferences, prefs(.25, .5));
  assert.equal(await profile.flush(), true);
  profile.activateLocal(restore);
  assert.equal(profile.status, 'local');
  assert.deepEqual(profile.preferences, prefs(.25, 1.2));
});

test('existing captain values win over migration and stale or other-captain snapshots', async () => {
  const { profile, timers, activate } = fixture();
  activate(() => assert.fail('an initialized profile must not upload legacy values'), {
    preferences: prefs(.4, .9), revision: 7, seedPreferences: prefs(.8, 1.3),
  });
  assert.deepEqual(profile.preferences, prefs(.4, .9));
  assert.equal(timers.size, 0);
  assert.equal(profile.receiveShared({ key: 'another:captain', preferences: prefs(1.6, 1.6), revision: 9 }), false);
  assert.equal(profile.receiveShared({ key: 'realm:captain', preferences: prefs(1.6, 1.6), revision: 7 }), false);
  assert.equal(profile.receiveShared({ key: 'realm:captain', preferences: prefs(1.6, 1.6), revision: 6 }), false);
  assert.deepEqual(profile.preferences, prefs(.4, .9));
  assert.equal(await profile.flush(), true);
});

test('revision zero imports both explicitly supplied legacy modes before its first notification', async () => {
  const { profile, changes, timers, activate } = fixture();
  const calls = [];
  activate(async args => { calls.push(args); return { result: reply(1, prefs(.65, 1.2)) }; }, {
    revision: 0, seedPreferences: prefs(.65, 1.2),
  });
  assert.deepEqual(changes[0], { preferences: prefs(.65, 1.2), status: 'saving' });
  assert.equal(timers.size, 1);
  assert.equal(await profile.flush(), true);
  assert.deepEqual(calls, [{ expectedRevision: 0, shipZoom: .65, personZoom: 1.2 }]);
  assert.equal(timers.size, 0);
  assert.equal(profile.status, 'saved');
});

test('revision zero without an explicit seed never uploads browser defaults', async () => {
  const { profile, timers, activate } = fixture();
  activate(() => assert.fail('no implicit migration'), { revision: 0, preferences: prefs(.8, .9) });
  assert.deepEqual(profile.preferences, prefs(.8, .9));
  assert.equal(timers.size, 0);
  assert.equal(await profile.flush(), true);
});

test('edits during a request stay immediate and serialize into a second field patch', async () => {
  const { profile, activate } = fixture();
  const first = deferred(), second = deferred(), calls = [];
  activate(args => { calls.push(args); return calls.length === 1 ? first.promise : second.promise; });
  profile.set('ship', .8);
  const flushed = profile.flush();
  assert.equal(profile.flush(), flushed, 'overlapping flushes share one writer');
  await turn();
  profile.set('ship', .6);
  profile.set('person', .75);
  assert.deepEqual(profile.preferences, prefs(.6, .75));
  assert.equal(calls.length, 1);
  first.resolve(reply(2, prefs(.8, 1)));
  await turn();
  assert.deepEqual(calls, [
    { expectedRevision: 1, shipZoom: .8 },
    { expectedRevision: 2, shipZoom: .6, personZoom: .75 },
  ]);
  assert.equal(profile.status, 'saving');
  assert.deepEqual(profile.preferences, prefs(.6, .75));
  second.resolve(reply(3, prefs(.6, .75)));
  assert.equal(await flushed, true);
  assert.equal(profile.status, 'saved');
});

test('returning a slider to the previous server value while a write is in flight is still saved', async () => {
  const { profile, activate } = fixture();
  const first = deferred(), calls = [];
  activate(args => { calls.push(args); return calls.length === 1 ? first.promise : Promise.resolve(reply(3, prefs())); });
  profile.set('ship', .8);
  const flushed = profile.flush();
  await turn();
  profile.set('ship', 1);
  first.resolve(reply(2, prefs(.8, 1)));
  assert.equal(await flushed, true);
  assert.deepEqual(calls[1], { expectedRevision: 2, shipZoom: 1 });
  assert.deepEqual(profile.preferences, prefs());
});

test('snapshots before ack preserve pending values; a stale ack cannot replace a newer snapshot', async () => {
  const { profile, activate } = fixture();
  const request = deferred();
  activate(() => request.promise, { revision: 4 });
  profile.set('ship', .7);
  const flushed = profile.flush();
  await turn();
  profile.receiveShared({ key: 'realm:captain', preferences: prefs(.7, .8), revision: 5 });
  assert.equal(profile.status, 'saving', 'a snapshot does not prove the write was durably acknowledged');
  profile.receiveShared({ key: 'realm:captain', preferences: prefs(.5, .9), revision: 6 });
  assert.deepEqual(profile.preferences, prefs(.7, .9));
  request.resolve({ result: reply(5, prefs(.7, .8)), ...reply(6, prefs(.5, .9)) });
  assert.equal(await flushed, true);
  assert.deepEqual(profile.preferences, prefs(.5, .9));
  assert.equal(profile.status, 'saved');
});

test('conflict retries only locally touched fields against the newest server revision', async () => {
  const { profile, activate } = fixture();
  const calls = [];
  activate(async args => {
    calls.push(args);
    return calls.length === 1
      ? reply(6, prefs(.4, .65), { ok: false, code: 'camera-conflict' })
      : reply(7, prefs(.8, .65));
  }, { revision: 5 });
  profile.set('ship', .8);
  assert.equal(await profile.flush(), true);
  assert.deepEqual(calls, [
    { expectedRevision: 5, shipZoom: .8 },
    { expectedRevision: 6, shipZoom: .8 },
  ]);
  assert.deepEqual(profile.preferences, prefs(.8, .65));
});

test('conflict retries are bounded, keep unsaved values, and allow a later retry', async () => {
  const { profile, activate } = fixture();
  let calls = 0, succeeds = false;
  activate(async args => {
    calls++;
    return succeeds ? reply(args.expectedRevision + 1, prefs(.85, .65))
      : reply(args.expectedRevision + 1, prefs(.4, .65), { ok: false, code: 'camera-conflict' });
  });
  profile.set('ship', .85);
  assert.equal(await profile.flush(), false);
  assert.equal(calls, 4);
  assert.equal(profile.status, 'offline');
  assert.deepEqual(profile.preferences, prefs(.85, .65));
  succeeds = true;
  assert.equal(await profile.flush(), true);
  assert.equal(calls, 5);
  assert.equal(profile.status, 'saved');
});

test('connection failure retains local intent across a reconnect snapshot until acknowledged', async () => {
  const { profile, activate } = fixture();
  let connected = false;
  const calls = [];
  activate(async args => {
    calls.push(args);
    if (!connected) throw new Error('disconnected');
    return { result: reply(4, prefs(.7, .6)) };
  });
  profile.set('ship', .7);
  assert.equal(await profile.flush(), false);
  assert.equal(profile.status, 'offline');
  profile.receiveShared({ key: 'realm:captain', preferences: prefs(.9, .6), revision: 3 });
  assert.deepEqual(profile.preferences, prefs(.7, .6));
  assert.equal(profile.status, 'offline');
  connected = true;
  assert.equal(await profile.flush(), true);
  assert.deepEqual(calls[1], { expectedRevision: 3, shipZoom: .7 });
  assert.equal(profile.status, 'saved');
});

test('switching profiles cancels queued work and ignores an old captain acknowledgment', async () => {
  const { profile, timers, activate } = fixture();
  activate(() => assert.fail('cancelled debounce must not send'));
  profile.set('ship', .8);
  const staleTimer = [...timers.values()][0];
  profile.activateLocal(prefs(.6, 1.1));
  staleTimer();
  assert.equal(timers.size, 0);
  assert.deepEqual(profile.preferences, prefs(.6, 1.1));

  const old = deferred(), next = deferred();
  activate(() => old.promise);
  profile.set('ship', .8);
  const oldFlush = profile.flush();
  await turn();
  activate(() => next.promise, { key: 'realm:other', preferences: prefs(.5, .75), revision: 8 });
  profile.set('person', 1.2);
  const newFlush = profile.flush();
  old.resolve(reply(2, prefs(.8, 1)));
  assert.equal(await oldFlush, false);
  assert.deepEqual(profile.preferences, prefs(.5, 1.2));
  assert.equal(profile.status, 'saving');
  next.resolve(reply(9, prefs(.5, 1.2)));
  assert.equal(await newFlush, true);
  assert.equal(profile.status, 'saved');
});

test('a late failure from the same captain in an earlier activation cannot mark a new session offline', async () => {
  const { profile, activate } = fixture();
  const old = deferred();
  activate(() => old.promise);
  profile.set('ship', .8);
  const oldFlush = profile.flush();
  await turn();
  activate(() => assert.fail('no write expected'), { preferences: prefs(.5, .75), revision: 8 });
  old.reject(new Error('old connection closed'));
  assert.equal(await oldFlush, false);
  assert.deepEqual(profile.preferences, prefs(.5, .75));
  assert.equal(profile.status, 'saved');
});

test('concurrent initialization supersedes untouched migration seeds before debounce', async () => {
  const { profile, activate, timers } = fixture();
  activate(() => assert.fail('another device already initialized the profile'), { revision: 0, seedPreferences: prefs(.8, 1.2) });
  profile.receiveShared({ key: 'realm:captain', preferences: prefs(.4, .65), revision: 1 });
  assert.deepEqual(profile.preferences, prefs(.4, .65));
  assert.equal(timers.size, 0);
  assert.equal(await profile.flush(), true);
});

test('migration conflict yields to existing preferences but preserves a real slider edit', async () => {
  const { profile, activate } = fixture();
  const first = deferred(), calls = [];
  activate(args => {
    calls.push(args);
    return calls.length === 1 ? first.promise : Promise.resolve(reply(2, prefs(.7, .65)));
  }, { revision: 0, seedPreferences: prefs(.8, 1.2) });
  const flushed = profile.flush();
  await turn();
  profile.set('ship', .7);
  first.resolve(reply(1, prefs(.4, .65), { ok: false, code: 'camera-conflict' }));
  assert.equal(await flushed, true);
  assert.deepEqual(calls[1], { expectedRevision: 1, shipZoom: .7 });
  assert.deepEqual(profile.preferences, prefs(.7, .65));
});

test('failed storage or malformed success does not mark an unsaved edit saved', async () => {
  for (const response of [{ ok: false, code: 'storage-unconfirmed' }, { ok: true }]) {
    const { profile, activate } = fixture();
    activate(async () => response);
    profile.set('person', .8);
    assert.equal(await profile.flush(), false);
    assert.equal(profile.status, 'offline');
    assert.deepEqual(profile.preferences, prefs(1, .8));
  }
});

test('pending export includes only deliberate fields and no migration seeds or mutable references', () => {
  const { profile, activate } = fixture();
  assert.equal(profile.exportPending(), null);
  activate(() => assert.fail('not flushing'), { revision: 0, seedPreferences: prefs(.8, 1.2) });
  assert.equal(profile.exportPending(), null);
  profile.set('ship', .65);
  const pending = profile.exportPending();
  assert.deepEqual(pending, { key: 'realm:captain', revision: 0, fields: { shipZoom: .65 } });
  pending.fields.shipZoom = 1.6;
  assert.equal(profile.exportPending().fields.shipZoom, .65);
  profile.activateLocal(prefs());
  assert.equal(profile.exportPending(), null);
});

test('matching cached pending fields appear immediately and retry only their own patch', async () => {
  const { profile, activate, changes } = fixture();
  const request = deferred(), calls = [];
  activate(args => { calls.push(args); return request.promise; }, {
    revision: 5, preferences: prefs(.9, .75),
    pendingChanges: { key: 'realm:captain', revision: 5, fields: { shipZoom: .4 } },
  });
  assert.deepEqual(changes[0], { preferences: prefs(.4, .75), status: 'saving' });
  const flushed = profile.flush();
  await turn();
  assert.deepEqual(calls, [{ expectedRevision: 5, shipZoom: .4 }]);
  assert.deepEqual(profile.exportPending(), { key: 'realm:captain', revision: 5, fields: { shipZoom: .4 } });
  request.resolve(reply(6, prefs(.4, .75)));
  assert.equal(await flushed, true);
  assert.equal(profile.exportPending(), null);
});

test('a cached lost acknowledgment cannot overwrite a newer saved authority revision', async () => {
  const first = fixture();
  first.activate(async () => { throw new Error('acknowledgment lost after server commit'); });
  first.profile.set('ship', .8);
  assert.equal(await first.profile.flush(), false);
  const pendingChanges = first.profile.exportPending();
  assert.equal(pendingChanges.revision, 1);

  // The server may contain the committed edit, or an even later device edit.
  // In either case the older cached command must not be replayed over it.
  for (const serverShipZoom of [.8, .45]) {
    const resumed = fixture();
    resumed.activate(() => assert.fail('do not replay a stale cached edit'), {
      revision: 2, preferences: prefs(serverShipZoom, .65), pendingChanges,
    });
    assert.deepEqual(resumed.profile.preferences, prefs(serverShipZoom, .65));
    assert.equal(resumed.profile.exportPending(), null);
    assert.equal(resumed.timers.size, 0);
    assert.equal(await resumed.profile.flush(), true);
  }
});

test('cached pending data is restricted to the exact captain, authority revision, and finite zoom fields', async () => {
  const invalid = [
    { key: 'other:captain', revision: 5, fields: { shipZoom: .4 } },
    { key: 'realm:captain', revision: 4, fields: { shipZoom: .4 } },
    { key: 'realm:captain', revision: 6, fields: { shipZoom: .4 } },
    { key: 'realm:captain', revision: '5', fields: { shipZoom: .4 } },
    { key: 'realm:captain', revision: 5, fields: { shipZoom: Infinity } },
    { key: 'realm:captain', revision: 5, fields: { shipZoom: NaN } },
    { key: 'realm:captain', revision: 5, fields: { shipZoom: '.4' } },
    { key: 'realm:captain', revision: 5, fields: { shipZoom: .4, textScale: 1.5 } },
    { key: 'realm:captain', revision: 5, fields: { shipZoom: .4, token: 'must-not-enter-preferences' } },
    { key: 'realm:captain', revision: 5, fields: [.4] },
    { key: 'realm:captain', revision: 5, fields: null },
  ];
  for (const pendingChanges of invalid) {
    const { profile, activate, timers } = fixture();
    activate(() => assert.fail('invalid cached data must not be sent'), { revision: 5, preferences: prefs(.9, .75), pendingChanges });
    assert.deepEqual(profile.preferences, prefs(.9, .75));
    assert.equal(profile.exportPending(), null);
    assert.equal(timers.size, 0);
    assert.equal(await profile.flush(), true);
  }
});

test('pending export follows newer snapshots but keeps later edits after an earlier acknowledgment', async () => {
  const { profile, activate } = fixture();
  const first = deferred(), second = deferred();
  let calls = 0;
  activate(() => ++calls === 1 ? first.promise : second.promise);
  profile.set('ship', .8);
  const flushed = profile.flush();
  await turn();
  profile.set('ship', .65);
  profile.receiveShared({ key: 'realm:captain', revision: 2, preferences: prefs(.8, .75) });
  assert.deepEqual(profile.exportPending(), { key: 'realm:captain', revision: 2, fields: { shipZoom: .65 } });
  first.resolve(reply(2, prefs(.8, .75)));
  await turn();
  assert.deepEqual(profile.exportPending(), { key: 'realm:captain', revision: 2, fields: { shipZoom: .65 } });
  second.resolve(reply(3, prefs(.65, .75)));
  assert.equal(await flushed, true);
  assert.equal(profile.exportPending(), null);
});
