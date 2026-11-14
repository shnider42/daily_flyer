import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineRoom } from '../public/online.mjs';

const store = new Map();
globalThis.sessionStorage = { getItem: key => store.get(key) || null,
  setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
const json = (data, status = 200) => new Response(JSON.stringify(data),
  { status, headers: { 'Content-Type': 'application/json' } });
const snapshot = (revision = 1, extra = {}) => ({ code: 'ABC234', revision, rackId: 'rack-one',
  phase: 'playing', game: { shotNumber: 0, phase: 'aiming', turn: 0 }, ...extra });
const credentials = (extra = {}) => ({ ok: true, code: 'ABC234', token: 'a'.repeat(64),
  seatIndex: 0, lastSeq: 0, snapshot: snapshot(), ...extra });
const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture(fetchImpl) {
  store.clear();
  const received = [], statuses = [], errors = [];
  const client = new OnlineRoom({ fetchImpl, onSnapshot: state => received.push(state),
    onStatus: (...args) => statuses.push(args), onError: error => errors.push(error) });
  client.streamLoop = async () => { client.connected = true; client.onStatus('online', 'Connected'); };
  return { client, received, statuses, errors };
}

test('room creation saves only this tab’s identity and command envelopes use the acknowledged rack', async () => {
  const requests = [];
  const f = fixture(async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return json(url === '/api/rooms' ? credentials() : { ok: true, snapshot: snapshot(2) });
  });
  await f.client.create('Chris');
  assert.equal(f.client.session.seatIndex, 0); assert.equal(OnlineRoom.saved().token, 'a'.repeat(64));
  await f.client.command('shoot', { angle: .2, power: .7 });
  const request = requests[1];
  assert.equal(request.options.headers.Authorization, `Bearer ${'a'.repeat(64)}`);
  assert.deepEqual(request.body, { angle: .2, power: .7, seq: 1, rackId: 'rack-one', shotNumber: 0, action: 'shoot' });
  assert.equal(request.url.includes(f.client.session.token), false);
  f.client.destroy();
});

test('resume keeps the original seat and never reuses a possibly in-flight sequence number', async () => {
  const f = fixture(async () => json(credentials({ lastSeq: 4 })));
  store.set('corner-pocket-session', JSON.stringify({ code: 'ABC234', token: 'a'.repeat(64),
    seatIndex: 0, lastSeq: 7, baseUrl: '' }));
  await f.client.resume();
  assert.equal(f.client.sequence, 7); assert.equal(f.client.session.seatIndex, 0);
  assert.equal(f.client.session.token, 'a'.repeat(64));
  f.client.destroy();
});

test('a lost shot response retries exactly the same command without issuing another shot', async () => {
  const sent = [];
  const f = fixture(async (_url, options) => {
    sent.push(options.body);
    if (sent.length === 1) throw new TypeError('Connection interrupted after send');
    return json({ ok: true, duplicate: true, snapshot: snapshot(2, { game: { shotNumber: 1, phase: 'rolling' } }) });
  });
  await f.client.attach(credentials());
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await f.client.command('shoot', { angle: 0, power: .7 });
    assert.equal(result.duplicate, true); assert.equal(sent.length, 2); assert.equal(sent[0], sent[1]);
    assert.equal(f.client.sequence, 1); assert.equal(f.client.snapshot.game.shotNumber, 1);
  } finally { clearTimeout(keepAlive); f.client.destroy(); }
});

test('leaving detaches immediately, forgets the credential and never publishes the late reply', async () => {
  let finish;
  const f = fixture(async () => new Promise(resolve => { finish = resolve; }));
  await f.client.attach(credentials());
  const count = f.received.length, leaving = f.client.leave();
  assert.equal(f.client.session, null); assert.equal(OnlineRoom.saved(), null);
  finish(json({ ok: true, snapshot: snapshot(20) })); await leaving;
  assert.equal(f.received.length, count); assert.equal(f.client.alive, false);
});

test('a shot response after destroying the client cannot revive the old table', async () => {
  let finish;
  const f = fixture(async () => new Promise(resolve => { finish = resolve; }));
  await f.client.attach(credentials());
  const shooting = f.client.command('shoot', { angle: 0, power: .7 });
  const rejected = assert.rejects(shooting, error => error.code === 'cancelled');
  await turn(); const count = f.received.length;
  f.client.destroy(); finish(json({ ok: true, snapshot: snapshot(50) }));
  await rejected;
  assert.equal(f.received.length, count); assert.equal(f.client.snapshot, null);
});

test('a cancelled room creation cannot attach a late response or save its credential', async () => {
  let finish;
  const f = fixture(async () => new Promise(resolve => { finish = resolve; }));
  const creating = f.client.create('Chris'), rejected = assert.rejects(creating, error => error.code === 'cancelled');
  f.client.destroy(); finish(json(credentials())); await rejected;
  assert.equal(f.client.session, null); assert.equal(OnlineRoom.saved(), null); assert.equal(f.received.length, 0);
});

test('older command replies cannot rewind a newer rack snapshot', async () => {
  const f = fixture(async () => json({ ok: true }));
  await f.client.attach(credentials());
  f.client.accept(snapshot(20, { rackId: 'rack-two' }));
  f.client.accept(snapshot(19, { rackId: 'rack-one' }));
  assert.equal(f.client.snapshot.rackId, 'rack-two'); assert.equal(f.received.length, 2);
  f.client.destroy();
});

test('a slow cosmetic aim request does not block an accepted shot', async () => {
  let finishAim;
  const sent = [];
  const f = fixture(async (_url, options) => {
    const body = JSON.parse(options.body); sent.push(body);
    if (body.action === 'aim') return new Promise(resolve => { finishAim = resolve; });
    return json({ ok: true, snapshot: snapshot(2, { game: { shotNumber: 1, phase: 'rolling' } }) });
  });
  await f.client.attach(credentials());
  const aiming = f.client.command('aim', { angle: .3, power: .7 });
  await f.client.command('shoot', { angle: .3, power: .7 });
  assert.deepEqual(sent.map(value => value.action), ['aim', 'shoot']);
  assert.equal(sent[0].aimSeq, 1); assert.equal(sent[0].seq, undefined); assert.equal(sent[1].seq, 1);
  finishAim(json({ ok: false, error: 'Old shot', code: 'stale_shot' }, 409));
  await aiming; assert.equal(f.errors.length, 0); assert.equal(f.client.snapshot.game.shotNumber, 1);
  f.client.destroy();
});

test('a dead room stops reconnecting and clears the saved credential', async () => {
  store.clear(); const statuses = [];
  const client = new OnlineRoom({ fetchImpl: async () => json({ error: 'This room has ended.' }, 404),
    onStatus: (...args) => statuses.push(args) });
  await client.attach(credentials()); await client.streamTask;
  assert.equal(client.alive, false); assert.equal(client.connected, false);
  assert.equal(OnlineRoom.saved(), null); assert.equal(statuses.at(-1)[0], 'offline');
  client.destroy();
});

test('a cancelled resume cannot mark a newly created room offline', async () => {
  let finishResume;
  const f = fixture(async url => {
    if (url.endsWith('/rejoin')) return new Promise(resolve => { finishResume = resolve; });
    return json(credentials({ code: 'DEF456', token: 'b'.repeat(64),
      snapshot: snapshot(1, { code: 'DEF456' }) }));
  });
  store.set('corner-pocket-session', JSON.stringify({ code: 'ABC234', token: 'a'.repeat(64),
    seatIndex: 0, lastSeq: 0, baseUrl: '' }));
  const resuming = f.client.resume();
  const rejected = assert.rejects(resuming, error => error.code === 'cancelled');
  await f.client.create('New table');
  finishResume(json({ error: 'Old table expired.' }, 404)); await rejected;
  assert.equal(f.statuses.at(-1)[0], 'online'); assert.equal(f.client.connected, true);
  assert.equal(f.client.session.code, 'DEF456'); assert.equal(OnlineRoom.saved().code, 'DEF456');
  f.client.destroy();
});
