import { WORLD_CONTENT_VERSION } from '../../dist/world-content.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Realm } from '../../server/realm.mjs';
import { startServer } from '../../server/index.mjs';
import { FarwakeNetwork, readRealmStartOptions } from '../../dist/network.mjs';
import { buildGalaxy } from '../../dist/engine.mjs';

const starterEquipment = { thrusters_1: 1, scanner_1: 1, fold_1: 1 };
const copy = value => structuredClone(value);
const ok = value => { assert.equal(value?.ok, true, value?.reason || value?.result?.reason || JSON.stringify(value)); return value; };
function persistence() {
  const records = new Map();
  return { kind: 'casual-memory', durable: true, records, writes: 0,
    async ping() { return { ok: true }; },
    async load(id) { return copy(records.get(id) || { version: 0, snapshot: null }); },
    async save(id, version, snapshot) {
      assert.equal(records.get(id)?.version || 0, version);
      records.set(id, { version: version + 1, snapshot: copy(snapshot) }); this.writes++;
      return { version: version + 1 };
    }
  };
}
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
async function serverFixture(t) {
  const store = persistence(), clients = [];
  let server = await startServer({ port: 0, host: '127.0.0.1', persistence: store });
  t.after(async () => { for (const client of clients) client.disconnect(); await server.close(); });
  return {
    store, get server() { return server; },
    async request(body) {
      const response = await fetch(`${server.url}/api/realms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, worldContentVersion: WORLD_CONTENT_VERSION }) });
      const result = await response.json(); assert.equal(response.status, 200, result.reason); return ok(result);
    },
    async connect(options) {
      const client = new FarwakeNetwork({ url: server.url, WebSocketImpl: WebSocket, storage: storage(), autoReconnect: false });
      clients.push(client); await client.connect(options); return client;
    },
    async restart() { for (const client of clients) client.disconnect(); await server.close(); server = await startServer({ port: 0, host: '127.0.0.1', persistence: store }); }
  };
}
function assertOrigin(realm, captain, systemId) {
  const game = captain.game, state = game.state, port = game.system.bodies.find(body => body.kind === 'station' && body.portType !== 'military' && body.portServices !== false && body.landable !== false);
  assert.ok(port, 'The selected system has a real civilian station.');
  const vessel = realm.vessels.get(captain.ownedVesselId);
  assert.equal(state.startMode, 'casual'); assert.equal(state.systemId, systemId); assert.equal(vessel.systemId, systemId);
  assert.equal(state.mode, 'ship'); assert.equal(captain.aboard, vessel.id); assert.equal(vessel.dockedAt, null);
  assert.deepEqual(captain.home, { kind: 'port', systemId, locationId: port.id });
  assert.equal(state.lastBodyId, port.id);
  const separation = Math.hypot(vessel.ship.x - port.x, vessel.ship.y - port.y);
  assert.ok(Math.abs(separation - (port.radius + 95)) < 1e-8, `The ship starts in the arrival ring outside ${port.name}, not at the coordinate origin (${separation}).`);
  assert.deepEqual(state.upgrades, starterEquipment); assert.equal(vessel.ship.warpRange, 5);
  assert.equal(state.credits, 180); assert.equal(game.openingMissionStatus().active, false);
  assert.deepEqual(state.completedChapters, []); assert.equal(state.flags.includes('belt_signal_found'), false);
}

test('a remote Casual host uses the preview seed and local port, skips the Hearth opening, and creates no Kettle lobby', async t => {
  const f = await serverFixture(t), seed = 'casual-preview-create_42';
  const created = await f.request({ action: 'create', name: 'Casual host', galaxySeed: seed, startMode: 'casual', startSystemId: 'brindle', starterShip: 'kestrel', openingMission: true, startTogether: true });
  const realm = f.server.manager.realms.get(created.passport.realmCode), host = realm.captains.get(created.passport.captainId);
  assert.equal(realm.seed, seed); assert.equal(host.game.state.seed, seed); assert.equal(host.game.shipClass.id, 'kestrel');
  assertOrigin(realm, host, 'brindle');
  assert.equal(realm.settings.startTogether, false); assert.equal(realm.groupStart, null);
  assert.equal(realm.settings.openingMission, true, 'The remote captain cannot disable the host-selected opening for later Hearth arrivals.');
  assert.deepEqual(host.game.state.visited, ['brindle']);
  assert.equal(host.game.travelInfo('hearth').ok, true, 'An actual fold can be plotted immediately without story flags.');
});

test('shared origin lookup uses the actual galaxy and cannot allocate captains, reveal passports, or create unknown realms', async t => {
  const f = await serverFixture(t), created = await f.request({ action: 'create', galaxySeed: 'casual-catalog-seed', name: 'Host', openingMission: true });
  const realm = f.server.manager.realms.get(created.passport.realmCode), before = { captains: realm.captains.size, vessels: realm.vessels.size, records: f.store.records.size, writes: f.store.writes };
  const options = await readRealmStartOptions({ url: f.server.url, realmCode: realm.id });
  assert.equal(options.seed, realm.seed); assert.deepEqual(options.settings, realm.settings);
  assert.equal(JSON.stringify(options).includes(created.passport.token), false);
  assert.equal(JSON.stringify(options).includes('tokenHash'), false);
  assert.deepEqual({ captains: realm.captains.size, vessels: realm.vessels.size, records: f.store.records.size, writes: f.store.writes }, before);
  const preview = buildGalaxy(options.seed), chosen = preview.find(system => system.id === 'sector-287');
  const joined = await f.request({ action: 'join', realmCode: realm.id, name: 'Remote explorer', galaxySeed: 'cannot-reseed-a-live-realm', startMode: 'casual', startSystemId: chosen.id, starterShip: 'mule' });
  const captain = realm.captains.get(joined.passport.captainId), actual = captain.game.galaxy.find(system => system.id === captain.game.state.systemId);
  assertOrigin(realm, captain, chosen.id);
  assert.equal(realm.seed, options.seed); assert.equal(captain.game.state.seed, options.seed);
  assert.deepEqual([actual.name, actual.faction, actual.danger, actual.gx, actual.gy], [chosen.name, chosen.faction, chosen.danger, chosen.gx, chosen.gy]);
  for (const [code, status] of [['bad-code!', 400], ['ABSENT77', 404]]) {
    const response = await fetch(`${f.server.url}/api/realms/${encodeURIComponent(code)}/start-options`);
    assert.equal(response.status, status); assert.equal((await response.json()).ok, false);
  }
  assert.equal(f.server.manager.realms.has('ABSENT77'), false); assert.equal(f.store.records.has('ABSENT77'), false);
});

test('remote start input cannot move Regular or Hardcore captains and an invalid Casual origin consistently falls back to Hearth', async t => {
  const f = await serverFixture(t), created = await f.request({ action: 'create', name: 'Regular host', startSystemId: 'sol' }), realm = f.server.manager.realms.get(created.passport.realmCode);
  const host = realm.captains.get(created.passport.captainId);
  assert.equal(host.game.state.startMode, 'regular'); assert.equal(host.game.state.systemId, 'hearth'); assert.equal(host.game.state.ship.warpRange, 0); assert.deepEqual(host.game.state.upgrades, {});
  const shipless = await f.request({ action: 'join', realmCode: realm.id, name: 'Hardcore guest', startMode: 'hardcore', startSystemId: 'sol' });
  const guest = realm.captains.get(shipless.passport.captainId);
  assert.equal(guest.game.state.startMode, 'hardcore'); assert.equal(guest.game.state.systemId, 'hearth'); assert.equal(guest.game.state.locationId, 'morrow'); assert.equal(guest.ownedVesselId, null);
  const invalid = await f.request({ action: 'join', realmCode: realm.id, name: 'Invalid origin', startMode: 'casual', startSystemId: 'not-in-this-galaxy' });
  assertOrigin(realm, realm.captains.get(invalid.passport.captainId), 'hearth');
});

test('invalid preview seeds are rejected before allocating a galaxy or captain', async t => {
  const f = await serverFixture(t);
  for (const galaxySeed of [{ seed: 'unexpected-object' }, '', 'x'.repeat(101), 'not a seed']) {
    const response = await fetch(`${f.server.url}/api/realms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ worldContentVersion: WORLD_CONTENT_VERSION, action: 'create', name: 'Invalid preview', galaxySeed, startMode: 'casual', startSystemId: 'brindle' }) });
    assert.equal(response.status, 400); assert.equal((await response.json()).ok, false);
    assert.equal(f.server.manager.realms.size, 0); assert.equal(f.store.records.size, 0); assert.equal(f.store.writes, 0);
  }
});

test('Casual passport resume after a server restart preserves the origin, spent fuel and removed equipment', async t => {
  const f = await serverFixture(t), created = await f.request({ action: 'create', name: 'Persistent Casual', galaxySeed: 'casual-durable', startMode: 'casual', startSystemId: 'brindle' });
  let realm = f.server.manager.realms.get(created.passport.realmCode), captain = realm.captains.get(created.passport.captainId);
  const vesselId = captain.ownedVesselId, home = copy(captain.home);
  captain.game.state.upgrades = {}; captain.game._updateStats(false);
  Object.assign(captain.game.state.ship, { hull: 53, fuel: 3 }); captain.game.state.credits = 42;
  realm.markDirty(); await realm.flush(); await f.restart();
  await f.request({ action: 'resume', passport: created.passport, startMode: 'casual', startSystemId: 'sol', galaxySeed: 'cannot-reseed-on-resume', starterShip: 'mule', openingMission: true, startTogether: true });
  realm = f.server.manager.realms.get(created.passport.realmCode); captain = realm.captains.get(created.passport.captainId);
  assert.equal(realm.seed, 'casual-durable'); assert.equal(captain.game.state.startMode, 'casual'); assert.equal(captain.game.state.systemId, 'brindle');
  assert.equal(captain.ownedVesselId, vesselId); assert.deepEqual(captain.home, home); assert.equal(realm.vessels.size, 1);
  assert.deepEqual(captain.game.state.upgrades, {}); assert.equal(captain.game.state.ship.warpRange, 0);
  assert.equal(captain.game.state.ship.hull, 53); assert.equal(captain.game.state.ship.fuel, 3); assert.equal(captain.game.state.credits, 42);
  assert.equal(captain.game.openingMissionStatus().active, false); assert.equal(realm.groupStart, null);
});

test('Casual captains choosing the same system receive distinct port-side positions and can dock, launch, and fold normally', async () => {
  const realm = new Realm({ id: 'CASUAL78', seed: 'casual-spaced-arrivals', persistence: persistence() }), captains = [];
  for (let index = 0; index < 3; index++) {
    const captain = (await realm.createCaptain(`Arrival ${index + 1}`, { startMode: 'casual', startSystemId: 'brindle' })).captain;
    assertOrigin(realm, captain, 'brindle'); ok(realm.attach(captain, { send() {}, close() {} })); captains.push(captain);
  }
  const poses = captains.map(captain => captain.game.state.ship);
  for (let left = 0; left < poses.length; left++) for (let right = left + 1; right < poses.length; right++) {
    assert.ok(Math.hypot(poses[left].x - poses[right].x, poses[left].y - poses[right].y) > 100, 'Independent starters have clear space around their hulls.');
  }
  const captain = captains[1], vessel = realm.vessels.get(captain.ownedVesselId), portId = captain.home.locationId;
  ok(await realm.command(captain, 'dock', { id: portId }));
  assert.equal(captain.game.state.locationId, portId); assert.equal(captain.game.state.mode, 'person'); assert.equal(vessel.dockedAt, portId);
  const airlock = realm._surface(captain).entities.find(entity => entity.type === 'exit');
  assert.ok(airlock); Object.assign(captain.game.state.person, { x: airlock.x, y: airlock.y });
  ok(await realm.command(captain, 'launch'));
  assert.equal(vessel.dockedAt, null); assert.equal(captain.game.state.mode, 'ship'); assert.equal(captain.aboard, vessel.id);
  const fuel = vessel.ship.fuel; ok(await realm.command(captain, 'travel', { id: 'hearth' }));
  assert.equal(captain.game.state.systemId, 'hearth'); assert.equal(vessel.systemId, 'hearth'); assert.ok(vessel.ship.fuel < fuel);
  assert.deepEqual(captain.home, { kind: 'port', systemId: 'brindle', locationId: portId }, 'Departing leaves the selected home at the original local port.');
});

test('a direct realm creation with a remote Casual host closes a Kettle lobby that cannot be used', async () => {
  const realm = new Realm({ id: 'CASUAL79', seed: 'casual-remote-lobby', persistence: persistence(), settings: { startTogether: true } });
  const host = (await realm.createCaptain('Remote host', { startMode: 'casual', startSystemId: 'brindle' })).captain;
  ok(realm.attach(host, { send() {}, close() {} })); assertOrigin(realm, host, 'brindle');
  assert.equal(realm.groupStart.status, 'closed'); assert.equal(realm._isGroupWaiting(host), false);
  const late = (await realm.createCaptain('Hearth arrival')).captain;
  assert.equal(late.game.state.systemId, 'hearth'); assert.equal(realm._isGroupWaiting(late), false);
  const result = await realm.command(host, 'chooseGroupShip', { classId: 'lark' });
  assert.equal(result.ok, false); assert.equal(result.code, 'group-start-closed');
  assert.equal(host.game.state.systemId, 'brindle'); assert.equal(host.game.state.ship.classId, 'sparrow');
});

async function groupFixture({ hostMode = 'casual', guestMode = 'regular', remote = false } = {}) {
  const realm = new Realm({ id: 'CASUAL77', seed: 'casual-departure', persistence: persistence(), settings: { startTogether: true } });
  const host = (await realm.createCaptain('Host', { startMode: hostMode })).captain;
  const guest = (await realm.createCaptain('Guest', { startMode: guestMode })).captain;
  const away = remote ? (await realm.createCaptain('Away', { startMode: 'casual', startSystemId: 'brindle' })).captain : null;
  for (const captain of [host, guest, away].filter(Boolean)) ok(realm.attach(captain, { send() {}, close() {} }));
  ok(await realm.command(host, 'chooseGroupShip', { classId: 'lark' }));
  ok(await realm.command(guest, 'groupStartReady', { ready: true, classId: realm.groupStart.selectedClassId, selectionRevision: realm.groupStart.selectionRevision }));
  return { realm, host, guest, away };
}

test('a Casual host takes the starting fold drive into a larger shared ship while remote Casual captains remain in their chosen system', async () => {
  const { realm, host, guest, away } = await groupFixture({ remote: true }), remoteVesselId = away.ownedVesselId;
  assert.equal(realm._groupStartView(host).onlineCount, 2); assert.equal(realm._isGroupWaiting(away), false);
  assertOrigin(realm, away, 'brindle'); const remotePose = { x: away.game.state.ship.x, y: away.game.state.ship.y };
  ok(await realm.command(host, 'startGroupVoyage'));
  const flagship = realm.vessels.get(host.ownedVesselId), personal = realm.vessels.get(guest.ownedVesselId);
  assert.equal(flagship.ship.classId, 'lark'); assert.equal(flagship.ship.warpRange, 5); assert.deepEqual(host.game.state.upgrades, starterEquipment);
  assert.equal(host.aboard, flagship.id); assert.equal(guest.aboard, flagship.id); assert.equal(flagship.dockedAt, 'kettle');
  assert.equal(personal.ship.warpRange, 0); assert.equal(personal.dockedAt, 'kettle');
  assert.equal(away.ownedVesselId, remoteVesselId); assert.equal(away.aboard, remoteVesselId); assert.equal(away.game.state.systemId, 'brindle');
  assert.deepEqual({ x: away.game.state.ship.x, y: away.game.state.ship.y }, remotePose);
  assert.deepEqual(realm.groupStart.participants, [host.id, guest.id]);
  const restored = new Realm({ id: realm.id, snapshot: copy(realm.document()), persistence: persistence() });
  assert.equal(restored.vessels.get(flagship.id).ship.warpRange, 5);
  assert.equal(restored.vessels.get(personal.id).ship.warpRange, 0);
  assert.equal(restored.captains.get(away.id).game.state.systemId, 'brindle');
});

test('a Casual guest keeps their fold-equipped personal hull when boarding a Regular host’s shared ship', async () => {
  const { realm, host, guest } = await groupFixture({ hostMode: 'regular', guestMode: 'casual' }), guestShip = guest.ownedVesselId;
  ok(await realm.command(host, 'startGroupVoyage'));
  assert.equal(realm.vessels.get(host.ownedVesselId).ship.warpRange, 0);
  assert.equal(realm.vessels.get(guestShip).ship.warpRange, 5);
  assert.equal(realm.vessels.get(guestShip).dockedAt, 'kettle');
  assert.equal(guest.aboard, host.ownedVesselId); assert.equal(guest.game.state.startMode, 'casual');
});

for (const [name, change] of [
  ['an extra upgrade', state => { state.upgrades.shield_1 = 1; }],
  ['an altered starter upgrade', state => { state.upgrades.fold_1 = 2; }],
  ['missing starter equipment', state => { delete state.upgrades.scanner_1; }],
  ['elapsed play', state => { state.stats.time = 1; }]
]) test(`Casual starter exceptions cannot authorize a group grant after ${name}`, async () => {
  const { realm, host } = await groupFixture(); change(host.game.state);
  const result = await realm.command(host, 'startGroupVoyage');
  assert.equal(result.ok, false); assert.equal(result.code, 'group-start-progressed');
  assert.equal(realm.groupStart.status, 'assembling'); assert.equal(realm.vessels.get(host.ownedVesselId).ship.classId, 'sparrow');
});

test('the real multiplayer client creates and joins the same seeded galaxy with independent Casual origins', async t => {
  const f = await serverFixture(t), host = await f.connect({ create: true, name: 'Network host', galaxySeed: 'casual-network-seed', startMode: 'casual', startSystemId: 'brindle' });
  const options = await readRealmStartOptions({ url: f.server.url, realmCode: host.passport.realmCode });
  const guest = await f.connect({ name: 'Network guest', realmCode: host.passport.realmCode, galaxySeed: 'ignored-join-seed', startMode: 'casual', startSystemId: 'vesper' });
  assert.equal(options.seed, 'casual-network-seed');
  assert.equal(host.latest.state.seed, options.seed); assert.equal(guest.latest.state.seed, options.seed);
  assert.equal(host.latest.state.systemId, 'brindle'); assert.equal(guest.latest.state.systemId, 'vesper');
  assert.equal(host.latest.state.startMode, 'casual'); assert.equal(guest.latest.state.startMode, 'casual');
  assert.equal(host.latest.state.ship.warpRange, 5); assert.equal(guest.latest.state.ship.warpRange, 5);
  assert.equal(host.latest.state.multiplayer.waitingForGroupStart, false); assert.equal(guest.latest.state.multiplayer.waitingForGroupStart, false);
});
