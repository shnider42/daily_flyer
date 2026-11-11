import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Realm } from '../../server/realm.mjs';
import { startServer } from '../../server/index.mjs';
import { FarwakeNetwork } from '../../dist/network.mjs';
import { groupLaunchChoices } from '../../dist/group-start.mjs';

const copy = value => structuredClone(value);
const ok = value => { assert.equal(value?.ok, true, value?.reason || value?.result?.reason || JSON.stringify(value)); return value; };
function persistence() {
  const records = new Map();
  return { kind: 'group-memory', durable: true, async ping() { return { ok: true }; },
    async load(id) { return copy(records.get(id) || { version: 0, snapshot: null }); },
    async save(id, version, snapshot) { assert.equal(records.get(id)?.version || 0, version); records.set(id, { version: version + 1, snapshot: copy(snapshot) }); return { version: version + 1 }; } };
}
const storage = () => { const data = new Map(); return { getItem: id => data.get(id) || null, setItem: (id, value) => data.set(id, value), removeItem: id => data.delete(id) }; };
async function fixture(count = 2, options = {}) {
  const store = persistence(), realm = new Realm({ id: 'CREWTEST', seed: 'group-start', persistence: store, settings: { startTogether: true, ...options } }), captains = [];
  for (let i = 0; i < count; i++) { const { captain } = await realm.createCaptain(`Captain ${i + 1}`); ok(realm.attach(captain, { close() {} })); captains.push(captain); }
  return { realm, captains, host: captains[0], store };
}
const readyArgs = realm => ({ ready: true, classId: realm.groupStart.selectedClassId, selectionRevision: realm.groupStart.selectionRevision });
async function ready(realm, captains) { for (const captain of captains.slice(1)) ok(await realm.command(captain, 'groupStartReady', readyArgs(realm))); }

test('group hull thresholds are 2, 4 and 7 actual captains, with room for every occupant', () => {
  const allowed = count => groupLaunchChoices(count).filter(hull => hull.eligible).map(hull => hull.id);
  assert.deepEqual(allowed(1), ['sparrow', 'kestrel', 'mule']);
  assert.deepEqual(allowed(2), ['sparrow', 'mule', 'lark']);
  assert.deepEqual(allowed(3), ['lark']);
  assert.deepEqual(allowed(4), ['lark', 'puffin']);
  assert.deepEqual(allowed(6), ['puffin']);
  assert.deepEqual(allowed(7), ['puffin', 'osprey']);
  assert.deepEqual(allowed(10), ['osprey']);
  assert.deepEqual(allowed(11), []);
  assert.deepEqual(allowed(Infinity), []);
});

for (const [count, classId] of [[2, 'lark'], [4, 'puffin'], [7, 'osprey'], [10, 'osprey']]) test(`${count} waiting captains board one ${classId}, retain their own ships and receive no progression`, async () => {
  const { realm, captains, host } = await fixture(count), compactIds = captains.map(c => c.ownedVesselId);
  ok(await realm.command(host, 'chooseGroupShip', { classId })); await ready(realm, captains);
  const grant = ok(await realm.command(host, 'startGroupVoyage', {}, 'departure-once')), vessel = realm.vessels.get(host.ownedVesselId);
  assert.equal(vessel.ship.classId, classId); assert.equal(vessel.dockedAt, 'kettle'); assert.equal(vessel.installedBunks, count);
  assert.equal(realm.vessels.size, count); assert.equal(realm.groupStart.status, 'launched'); assert.equal(realm._berthsUsed(vessel), count);
  assert.equal(new Set(captains.map(c => `${c.game.state.person.x},${c.game.state.person.y}`)).size, count, 'Crew gather near the airlock without overlapping.');
  for (const [i, c] of captains.entries()) {
    assert.equal(c.ownedVesselId, compactIds[i]); assert.equal(c.aboard, vessel.id); assert.equal(c.game.state.interior.kind, 'ship');
    assert.equal(c.game.state.person.health, 100); assert.equal(c.game.state.credits, 180); assert.deepEqual(c.game.state.upgrades, {});
    assert.deepEqual(c.game.state.completedChapters, []); assert.equal(c.game.state.ship.warpRange, 0);
    assert.equal(realm._canRole(c, vessel, 'helm'), true); assert.equal(realm._canRole(c, vessel, 'engineering'), true);
    assert.equal(c.returnVesselId, null); assert.equal(c.game.state.stats.time, 0);
    assert.equal(realm.snapshotFor(c).state.multiplayer.waitingForGroupStart, false);
    if (i) { assert.equal(realm.vessels.get(c.ownedVesselId).ship.classId, 'sparrow'); assert.equal(realm.vessels.get(c.ownedVesselId).dockedAt, 'kettle'); }
  }
  vessel.ship.hull = 53; vessel.ship.fuel = 3;
  assert.deepEqual(await realm.command(host, 'startGroupVoyage', {}, 'departure-once'), grant);
  assert.equal((await realm.command(host, 'startGroupVoyage', {})).ok, false);
  assert.equal(vessel.ship.hull, 53); assert.equal(vessel.ship.fuel, 3);
  const restored = new Realm({ id: realm.id, snapshot: copy(realm.document()), persistence: persistence() });
  assert.equal(restored.groupStart.status, 'launched'); assert.equal(restored.vessels.size, count);
  assert.ok([...restored.captains.values()].every(c => c.aboard === vessel.id));
  assert.equal(restored.vessels.get(vessel.id).ship.hull, 53);
  const late = await restored.createCaptain('Late arrival'); ok(restored.attach(late.captain, { close() {} }));
  assert.equal(late.captain.game.state.ship.classId, 'sparrow'); assert.equal(restored._isGroupWaiting(late.captain), false);
  assert.equal((await restored.command(late.captain, 'chooseGroupShip', { classId: 'osprey' })).ok, false);
});

test('waiting holds progression and movement; guest readiness, host authority and current attendance govern departure', async () => {
  const { realm, captains, host } = await fixture(4), guest = captains[1], departed = captains[3];
  assert.equal((await realm.command(guest, 'chooseGroupShip', { classId: 'puffin' })).code, 'ownership');
  assert.equal((await realm.command(host, 'chooseGroupShip', { classId: 'judicator', onlineCount: 99 })).ok, false);
  assert.equal((await realm.command(host, 'launch')).code, 'group-start');
  const pose = copy(host.game.state.person); host.input = { x: 1, y: 1, thrust: 1, fire: true }; host.inputAt = Date.now();
  realm.step(.05, 1); assert.equal(host.game.state.stats.time, 0); assert.equal(host.game.state.person.x, pose.x); assert.equal(host.game.state.person.y, pose.y);
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'puffin' }));
  assert.equal((await realm.command(host, 'startGroupVoyage')).code, 'group-start-not-ready');
  await ready(realm, captains); realm.detach(departed, departed.session);
  assert.equal(realm._groupStartView(host).onlineCount, 3); assert.equal((await realm.command(host, 'startGroupVoyage')).ok, false);
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'lark' }));
  assert.equal(guest.launchReady, false, 'A ship change needs fresh consent.'); await ready(realm, captains.slice(0, 3));
  ok(await realm.command(host, 'startGroupVoyage')); assert.equal(realm.vessels.get(host.ownedVesselId).ship.classId, 'lark');
  assert.equal(departed.aboard, null); assert.equal(departed.launchStatus, 'missed'); assert.equal(departed.game.state.locationId, 'kettle');
  ok(realm.attach(departed, { close() {} })); assert.equal(departed.aboard, null); assert.equal(departed.game.state.ship.classId, 'sparrow');
});

test('waiting lobbies survive restart; absent host, independent beginnings and established realms cannot acquire a new grant', async () => {
  const { realm, captains, host } = await fixture(2);
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'lark' })); await ready(realm, captains);
  const restored = new Realm({ id: realm.id, snapshot: copy(realm.document()), persistence: persistence() });
  const savedHost = restored.captains.get(host.id), savedGuest = restored.captains.get(captains[1].id);
  ok(restored.attach(savedGuest, { close() {} }));
  assert.match(restored._groupStartView(savedGuest).reason, /host/); assert.equal(restored._groupStartView(savedGuest).onlineCount, 1);
  ok(restored.attach(savedHost, { close() {} })); assert.equal(restored._groupStartView(savedHost).canLaunch, true);
  ok(await restored.command(savedGuest, 'leaveGroupStart')); assert.equal(restored._isGroupWaiting(savedGuest), false);
  assert.equal((await restored.command(savedGuest, 'groupStartReady', { ready: true })).ok, false);
  assert.equal(restored._groupStartView(savedHost).onlineCount, 1);
  ok(await restored.command(savedHost, 'leaveGroupStart')); assert.equal(restored.groupStart.status, 'closed');
  const late = await restored.createCaptain('Independent'); assert.equal(restored._isGroupWaiting(late.captain), false);
  const old = new Realm({ id: 'OLDCREW1', persistence: persistence() });
  const prior = await old.createCaptain('Existing voyage'); ok(old.attach(prior.captain, { close() {} }));
  assert.equal(old.snapshotFor(prior.captain).groupStart, null);
  assert.equal((await old.command(prior.captain, 'startGroupVoyage', { startTogether: true })).ok, false);
});

test('a disconnected guest must consent again when the host changes the ship before they return', async () => {
  const { realm, captains, host } = await fixture(4), absent = captains[3];
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'puffin' })); await ready(realm, captains);
  assert.equal(absent.launchReady, true);
  realm.detach(absent, absent.session);
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'lark' }));
  assert.equal(absent.launchReady, false, 'Offline readiness applies only to the previous ship.');
  await ready(realm, captains.slice(0, 3));
  ok(realm.attach(absent, { close() {} }));
  assert.equal(realm._groupStartView(host).onlineCount, 4);
  assert.equal((await realm.command(host, 'startGroupVoyage')).code, 'group-start-not-ready');
  ok(await realm.command(absent, 'groupStartReady', readyArgs(realm)));
  ok(await realm.command(host, 'startGroupVoyage'));
  assert.equal(realm.vessels.get(host.ownedVesselId).ship.classId, 'lark');
  assert.equal(absent.aboard, host.ownedVesselId);
});

test('readiness binds the displayed hull and selection revision, including changing away and back', async () => {
  const { realm, captains, host } = await fixture(4), guest = captains[1];
  assert.equal(realm.groupStart.selectionRevision, 0);
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'lark' }));
  const shown = realm.snapshotFor(guest).groupStart, oldConsent = { ready: true, classId: shown.selectedClassId, selectionRevision: shown.selectionRevision };
  assert.equal(shown.selectionRevision, 1);
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'lark' }));
  assert.equal(realm.groupStart.selectionRevision, 1, 'Selecting the same hull is not a new revision.');
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'puffin' }));
  assert.equal((await realm.command(guest, 'groupStartReady', oldConsent)).code, 'group-start-choice-changed');
  assert.equal(guest.launchReady, false);
  assert.equal((await realm.command(guest, 'groupStartReady', { ready: true })).code, 'group-start-choice-changed');
  assert.equal((await realm.command(guest, 'groupStartReady', { ...readyArgs(realm), classId: 'lark' })).code, 'group-start-choice-changed');
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'lark' }));
  assert.equal(realm.groupStart.selectionRevision, 3);
  assert.equal((await realm.command(guest, 'groupStartReady', oldConsent)).code, 'group-start-choice-changed', 'Matching the hull name again cannot revive stale consent.');
  ok(await realm.command(guest, 'groupStartReady', readyArgs(realm)));
  assert.equal(guest.launchReady, true);
  ok(await realm.command(guest, 'groupStartReady', { ready: false, classId: 'puffin', selectionRevision: -1 }));
  assert.equal(guest.launchReady, false, 'Withdrawal never waits for a fresh snapshot.');
  const saved = copy(realm.document()), restored = new Realm({ id: realm.id, snapshot: saved, persistence: persistence() });
  assert.equal(restored.groupStart.selectionRevision, 3, 'A restart preserves the selection generation.');
  delete saved.groupStart.selectionRevision;
  const legacy = new Realm({ id: realm.id, snapshot: saved, persistence: persistence() });
  assert.equal(legacy.groupStart.selectionRevision, 0, 'Older assembling records have an explicit revision.');
});

test('four real connections receive the lobby and chosen hull; fake registration counts and ship requests do not count', async t => {
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence: persistence() }), clients = [];
  t.after(async () => { for (const client of clients) client.disconnect(); await server.close(); });
  async function connect(options) { const client = new FarwakeNetwork({ url: server.url, WebSocketImpl: WebSocket, storage: storage(), autoReconnect: false }); clients.push(client); await client.connect(options); return client; }
  const hostClient = await connect({ create: true, name: 'Lobby host', startTogether: true }), code = hostClient.passport.realmCode;
  assert.equal(hostClient.latest.state.multiplayer.waitingForGroupStart, true);
  for (let i = 1; i < 4; i++) await connect({ realmCode: code, name: `Crew ${i}`, starterShip: 'judicator' });
  const realm = server.manager.realms.get(code), host = realm.captains.get(hostClient.passport.captainId);
  assert.equal(realm._groupStartView(host).onlineCount, 4); assert.ok([...realm.captains.values()].every(c => c.game.state.ship.classId === 'sparrow'));
  ok(await hostClient.command('chooseGroupShip', { classId: 'puffin', connectedCount: 7 }));
  for (const client of clients.slice(1)) ok(await client.command('groupStartReady', readyArgs(realm)));
  ok(await hostClient.command('startGroupVoyage'));
  const launched = realm.snapshotFor(host); assert.equal(launched.groupStart.status, 'launched'); assert.equal(launched.state.ship.classId, 'puffin');
  for (const c of realm.captains.values()) { const snap = realm.snapshotFor(c); assert.equal(snap.state.multiplayer.aboardVesselId, host.ownedVesselId); assert.equal(snap.state.ship.classId, 'puffin'); }
  // A permitted friend can take the helm of this actual hull and launch the
  // whole crew; their own starter remains parked rather than being substituted.
  ok(await clients[1].command('quickHelm'));
  const vessel = realm.vessels.get(host.ownedVesselId);
  assert.equal(vessel.dockedAt, null); assert.equal(vessel.helmOwner, clients[1].passport.captainId);
  assert.ok([...realm.captains.values()].every(c => c.aboard === vessel.id));
  const guest = realm.captains.get(clients[1].passport.captainId);
  assert.equal(realm.vessels.get(guest.ownedVesselId).dockedAt, 'kettle');
  assert.equal(realm.failed, undefined);
});
