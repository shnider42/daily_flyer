import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import { OnlineGolf } from '../public/online.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) { const end = Date.now() + 3000; while (!predicate()) { if (Date.now() > end) throw new Error('Client condition timed out'); await wait(5); } }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function fixture(t, fetchImpl = globalThis.fetch) {
  const storage = new Map();
  globalThis.sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const server = createServer({ automaticTicks: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`, clients = [];
  t.after(async () => { clients.forEach(client => client.destroy()); await new Promise(resolve => server.shutdown(resolve)); delete globalThis.sessionStorage; });
  function client(options = {}) { const result = new OnlineGolf({ baseUrl, fetchImpl, ...options }); clients.push(result); return result; }
  return { server, baseUrl, client, storage };
}

test('OnlineGolf joins with the assigned player identity and resumes the acknowledged sequence', async t => {
  const f = await fixture(t), host = f.client();
  await host.create({ name: 'Host' }); await until(() => host.connected);
  await host.input('start');
  const guest = f.client(); await guest.join(host.session.code.toLowerCase(), 'Guest'); await until(() => guest.connected);
  assert.equal(guest.session.playerId, 'p2');
  await guest.input('shot', { angle: 0, power: .3 });
  const session = { ...guest.session }; guest.destroy(false);
  const resumed = f.client(); await resumed.resume(); await until(() => resumed.connected);
  assert.equal(resumed.session.playerId, 'p2'); assert.equal(resumed.sequence, 1);
  assert.equal(resumed.snapshot.players[1].strokes, 1); assert.equal(resumed.session.token, session.token);
});

test('leaving detaches immediately and no leave response publishes another game snapshot', async t => {
  const snapshots = [], f = await fixture(t), client = f.client({ onSnapshot: value => snapshots.push(value) });
  await client.create({ name: 'Leave' }); await until(() => client.connected); await client.input('start');
  const count = snapshots.length, leaving = client.leave();
  assert.equal(client.alive, false); assert.equal(client.session, null);
  await leaving; await wait(30);
  assert.equal(snapshots.length, count); assert.equal(client.snapshot, null); assert.equal(f.storage.size, 0);
});

test('a shot response arriving after destroy cannot resurrect the old session', async t => {
  const entered = deferred(), release = deferred(), native = globalThis.fetch;
  const wrapped = async (url, options) => {
    const response = await native(url, options);
    if (options?.method === 'POST' && JSON.parse(options.body).action === 'shot') {
      const body = await response.text(); entered.resolve(); await release.promise;
      return new Response(body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }
    return response;
  };
  const f = await fixture(t, wrapped), values = [], client = f.client({ onSnapshot: value => values.push(value) });
  await client.create({ name: 'Delayed' }); await until(() => client.connected); await client.input('start');
  const shot = client.input('shot', { angle: 0, power: .25 }); const rejected = assert.rejects(shot, error => error.code === 'cancelled');
  await entered.promise; client.destroy(false); const count = values.length; release.resolve(); await rejected; await wait(20);
  assert.equal(client.snapshot, null); assert.equal(values.length, count);
});

test('a cancelled creation cannot attach its late response or save an unwanted seat', async t => {
  const entered = deferred(), release = deferred(), native = globalThis.fetch;
  const wrapped = async (url, options) => {
    const response = await native(url, options);
    if (options?.method === 'POST' && url.endsWith('/api/rooms')) {
      const body = await response.text(); entered.resolve(); await release.promise;
      return new Response(body, { status: response.status });
    }
    return response;
  };
  const f = await fixture(t, wrapped), client = f.client();
  const opening = client.create({ name: 'Cancelled' }), rejected = assert.rejects(opening, error => error.code === 'cancelled');
  await entered.promise; client.destroy(false); release.resolve(); await rejected;
  assert.equal(client.session, null); assert.equal(client.alive, false); assert.equal(f.storage.size, 0);
});

test('a lost shot response retries the same sequence without adding another stroke', async t => {
  let attempts = 0; const sequences = [], native = globalThis.fetch;
  const wrapped = async (url, options) => {
    const body = options?.method === 'POST' ? JSON.parse(options.body) : null;
    const response = await native(url, options);
    if (body?.action === 'shot') {
      attempts++; sequences.push(body.seq);
      if (attempts === 1) { await response.text(); throw new TypeError('Simulated lost response'); }
    }
    return response;
  };
  const f = await fixture(t, wrapped), client = f.client();
  await client.create({ name: 'Retry' }); await until(() => client.connected); await client.input('start');
  const result = await client.input('shot', { angle: 0, power: .3 });
  assert.equal(result.duplicate, true); assert.equal(attempts, 2); assert.equal(sequences[0], sequences[1]);
  assert.equal(f.server.golfHub.room(client.session.code).game.state.players[0].strokes, 1);
});

test('old-round replies cannot rewind a rematch with a newer room revision', async t => {
  const f = await fixture(t), client = f.client();
  await client.create({ name: 'Rematch' }); await until(() => client.connected); await client.input('start');
  const room = f.server.golfHub.room(client.session.code); room.game.state.phase = 'finished'; f.server.golfHub.broadcast(room);
  await until(() => client.snapshot.phase === 'finished'); const old = structuredClone(client.snapshot);
  await client.input('rematch'); const round = client.snapshot.roundId;
  assert.notEqual(round, old.roundId); client.accept(old);
  assert.equal(client.snapshot.roundId, round); assert.equal(client.snapshot.phase, 'playing');
});

test('reusing a client cancels its old stream loop and keeps only the new room alive', async t => {
  let streamRequests = 0; const native = globalThis.fetch;
  const wrapped = async (url, options) => { if (url.endsWith('/stream')) streamRequests++; return native(url, options); };
  const f = await fixture(t, wrapped), client = f.client();
  await client.create({ name: 'First' }); await until(() => client.connected); const first = client.session.code;
  await client.create({ name: 'Second' }); await until(() => client.connected); const second = client.session.code;
  await wait(100);
  assert.notEqual(first, second); assert.equal(client.snapshot.code, second); assert.equal(streamRequests, 2);
  assert.equal(OnlineGolf.saved(f.baseUrl).code, second);
});
