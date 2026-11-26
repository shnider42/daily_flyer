import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Realm } from '../../server/realm.mjs';
import { RealmManager, startServer } from '../../server/index.mjs';
import { GALAXY_EPOCH, NEW_GALAXY_REQUIRED } from '../../dist/galaxy-epoch.mjs';
import { WORLD_CONTENT_VERSION } from '../../dist/world-content.mjs';
import { FarwakeNetwork, readRealmStartOptions } from '../../dist/network.mjs';

function memoryPersistence() {
  const records = new Map();
  return {
    kind: 'galaxy-epoch-test', durable: false, writes: 0, records,
    async ping() { return { ok: true }; },
    async load(id) { return structuredClone(records.get(id) || { version: 0, snapshot: null }); },
    async save(id, version, snapshot) {
      assert.equal(records.get(id)?.version || 0, version);
      this.writes++;
      records.set(id, { version: version + 1, snapshot: structuredClone(snapshot) });
      return { version: version + 1 };
    }
  };
}

test('a fresh shared galaxy persists its epoch and resumes the same captains and ships', async () => {
  const persistence = memoryPersistence(), manager = new RealmManager(persistence);
  const realm = await manager.create('Compact friends', {}, 'compact-friends');
  const first = await realm.createCaptain('First'), second = await realm.createCaptain('Second');
  first.captain.game.state.credits = 617;
  first.captain.game.state.flags.push('earned-in-compact-chart');
  const firstShip = first.captain.ownedVesselId, secondShip = second.captain.ownedVesselId;
  realm.markDirty();
  await realm.flush();
  const stored = await persistence.load(realm.id);
  assert.equal(stored.snapshot.galaxyEpoch, GALAXY_EPOCH);
  assert.ok(Object.values(stored.snapshot.captains).every(captain => captain.game.galaxyEpoch === GALAXY_EPOCH));
  const restarted = new RealmManager(persistence), resumed = await restarted.get(realm.id);
  assert.equal(resumed.captains.size, 2);
  assert.equal(resumed.authenticate(first.passport).game.state.credits, 617);
  assert.ok(resumed.authenticate(first.passport).game.hasFlag('earned-in-compact-chart'));
  assert.equal(resumed.authenticate(first.passport).ownedVesselId, firstShip);
  assert.equal(resumed.authenticate(second.passport).ownedVesselId, secondShip);
  assert.ok(resumed.vessels.has(firstShip) && resumed.vessels.has(secondShip));
  const third = await resumed.createCaptain('Third');
  assert.equal(resumed.captains.size, 3);
  assert.equal(third.captain.game.state.galaxyEpoch, GALAXY_EPOCH);
  assert.equal(resumed.document().galaxyEpoch, GALAXY_EPOCH);
});

test('precompact realm snapshots are rejected without modifying their stored data', () => {
  const snapshot = { format: 1, realmId: 'OLDMAP26', seed: 'old-map', worlds: { 'sector-287': { marker: 'keep' } }, captains: {}, vessels: {} };
  const before = structuredClone(snapshot);
  assert.throws(() => new Realm({ id: snapshot.realmId, snapshot, persistence: memoryPersistence() }), error => error.code === NEW_GALAXY_REQUIRED && /Create a new shared galaxy/.test(error.message));
  assert.deepEqual(snapshot, before);
});

function rejectedHello(server, passport) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${server.url.replace(/^http/, 'ws')}/ws`), packets = [];
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error('Old galaxy was not rejected.')); }, 4000);
    socket.once('open', () => socket.send(JSON.stringify({ type: 'hello', protocol: 1, worldContentVersion: WORLD_CONTENT_VERSION, passport })));
    socket.on('message', data => packets.push(JSON.parse(data.toString())));
    socket.once('close', code => { clearTimeout(timeout); resolve({ code, packets }); });
    socket.once('error', error => { clearTimeout(timeout); reject(error); });
  });
}

test('old invitation lookup, join, resume and WebSocket hello explain that a new galaxy is required', async t => {
  const persistence = memoryPersistence(), code = 'OLDMAP26';
  const legacy = { version: 17, snapshot: { format: 1, realmId: code, seed: 'precompact', captains: {}, worlds: {}, vessels: {} } };
  persistence.records.set(code, structuredClone(legacy));
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence, flushIntervalMs: 600000 });
  t.after(() => server.close());
  const passport = { realmCode: code, captainId: 'old_captain', token: 'old-test-token' };
  const preview = await fetch(`${server.url}/api/realms/${code}/start-options`);
  assert.equal(preview.status, 409);
  assert.equal((await preview.json()).code, NEW_GALAXY_REQUIRED);
  for (const action of ['join', 'resume']) {
    const response = await fetch(`${server.url}/api/realms`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, worldContentVersion: WORLD_CONTENT_VERSION, realmCode: code, passport, name: 'Returning captain' })
    });
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.equal(result.code, NEW_GALAXY_REQUIRED);
    assert.match(result.reason, /Create a new shared galaxy/);
  }
  // Browser callers retain the permanent error code for the new-galaxy action.
  await assert.rejects(readRealmStartOptions({ url: server.url, realmCode: code }), error => error.code === NEW_GALAXY_REQUIRED);
  const network = new FarwakeNetwork({ url: server.url, WebSocketImpl: WebSocket, storage: null, autoReconnect: false });
  t.after(() => network.disconnect());
  await assert.rejects(network.connect({ passport }), error => error.code === NEW_GALAXY_REQUIRED && /Create a new shared galaxy/.test(error.message));
  assert.equal(network.socket, null, 'An incompatible HTTP response never opens a game session.');
  await assert.rejects(network._open(), error => error.code === NEW_GALAXY_REQUIRED);
  const hello = await rejectedHello(server, passport);
  assert.equal(hello.code, 4001);
  assert.equal(hello.packets.length, 1);
  assert.equal(hello.packets[0].code, NEW_GALAXY_REQUIRED);
  assert.match(hello.packets[0].reason, /Create a new shared galaxy/);
  assert.equal(server.manager.realms.size, 0);
  assert.equal(persistence.writes, 0);
  assert.deepEqual(persistence.records.get(code), legacy);
  const health = await fetch(`${server.url}/healthz`);
  assert.equal(health.status, 200, 'An old invitation must not crash or poison the authority.');
});
