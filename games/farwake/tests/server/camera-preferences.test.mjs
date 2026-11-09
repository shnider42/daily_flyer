import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import WebSocket from 'ws';
import { startServer, compactSnapshot } from '../../server/index.mjs';
import { Realm } from '../../server/realm.mjs';
import { FilePersistence } from '../../server/persistence.mjs';
import { SHIP_ZOOM, PERSON_ZOOM, zoomLimits, normalizeModeZoom, normalizeCameraPreferences } from '../../dist/camera-preferences.mjs';

async function until(predicate, timeout = 6000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for the camera preference condition.');
    await pause(10);
  }
}

class Client {
  constructor(server, passport) { this.server = server; this.passport = passport; this.serial = 0; this.pending = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.server.url.replace(/^http/, 'ws') + '/ws');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Welcome timed out.')), 6000);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'hello', protocol: 1, passport: this.passport })));
      this.ws.on('message', buffer => {
        const packet = JSON.parse(buffer.toString());
        if (packet.type === 'welcome') { clearTimeout(timer); this.welcome = packet; resolve(); }
        if (packet.type === 'error' && !this.welcome) { clearTimeout(timer); reject(new Error(packet.reason)); }
        if (packet.type === 'result') {
          const pending = this.pending.get(packet.id);
          if (pending) { clearTimeout(pending.timer); this.pending.delete(packet.id); pending.resolve(packet); }
        }
      });
      this.ws.once('error', error => { clearTimeout(timer); reject(error); });
    });
    return this;
  }
  command(name, args = {}, id = `camera-test-${++this.serial}`) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Command acknowledgment timed out.')); }, 6000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ type: 'command', id, name, args }));
    });
  }
  close() {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Test client closed.')); }
    this.pending.clear(); this.ws?.terminate();
  }
}

async function fixture(t, { wrapPersistence = disk => disk } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'farwake-camera-'));
  const disk = new FilePersistence(directory), persistence = wrapPersistence(disk), clients = [];
  let server = await startServer({ port: 0, host: '127.0.0.1', persistence, flushIntervalMs: 60000 });
  const f = {
    disk, get server() { return server; },
    async register(action, realmCode, name = 'Camera captain') {
      const response = await fetch(server.url + '/api/realms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, realmCode, name }) });
      const data = await response.json(); assert.equal(response.status, 200, data.reason); return data;
    },
    async connect(passport) { const client = new Client(server, passport); clients.push(client); return client.connect(); },
    async restart() { clients.forEach(client => client.close()); await server.close(); server = await startServer({ port: 0, host: '127.0.0.1', persistence, flushIntervalMs: 60000 }); },
  };
  t.after(async () => { clients.forEach(client => client.close()); await server.close(); await rm(directory, { recursive: true, force: true }); });
  return f;
}

function memoryPersistence() {
  return { kind: 'camera-test', durable: false, saved: null, async save(id, version, snapshot) { this.saved = structuredClone(snapshot); return { version: version + 1 }; } };
}

function placeInSpace(realm, captain, systemId = 'hearth') {
  const vessel = realm.vessels.get(captain.ownedVesselId);
  captain.aboard = vessel.id; captain.crewRole = 'helm'; captain.game.state.mode = 'ship'; captain.game.state.locationId = null; captain.game.state.interior = null; captain.game.state.systemId = systemId;
  vessel.systemId = systemId; vessel.dockedAt = null; vessel.helmOwner = captain.id; vessel.actor = null;
  Object.assign(vessel.ship, { x: 0, y: 0, vx: 0, vy: 0 });
  realm._bindCaptain(captain).runtime.enemies.length = 0;
  return vessel;
}

test('camera zoom schema keeps independent ranges and finite, stepped fallbacks', () => {
  assert.equal(zoomLimits('ship'), SHIP_ZOOM); assert.equal(zoomLimits('person'), PERSON_ZOOM);
  assert.deepEqual(normalizeCameraPreferences(), { shipZoom: .25, personZoom: .8 });
  assert.deepEqual(normalizeCameraPreferences({ shipZoom: .1, personZoom: 2 }), { shipZoom: .25, personZoom: 1.6 });
  assert.equal(normalizeModeZoom(.79, 'ship'), .8);
  assert.equal(normalizeModeZoom(.27, 'ship'), .25);
  assert.equal(normalizeModeZoom(.3, 'person'), .5);
  assert.equal(normalizeModeZoom('0.35', 'ship'), .35);
  for (const invalid of [null, '', ' ', false, {}, [], Infinity, NaN]) assert.equal(normalizeModeZoom(invalid, 'ship', .6), .6);
  assert.deepEqual(normalizeCameraPreferences({ personZoom: .75 }, { shipZoom: .3, personZoom: 1.5 }), { shipZoom: .3, personZoom: .75 });
  assert.deepEqual(normalizeCameraPreferences({ shipZoom: 'broken' }, { shipZoom: null, personZoom: Infinity }), { shipZoom: .25, personZoom: .8 });
});

test('authenticated camera settings remain private, survive restart, and reject stale or repeated writes', async t => {
  const f = await fixture(t), created = await f.register('create'), second = await f.register('join', created.passport.realmCode);
  const owner = await f.connect(created.passport), guest = await f.connect(second.passport);
  assert.deepEqual(owner.welcome.cameraPreferences, { shipZoom: .25, personZoom: .8 }); assert.equal(owner.welcome.cameraRevision, 0);
  await assert.rejects(f.connect({ ...created.passport, token: 'invalid-camera-passport' }), /passport/i);
  const response = await fetch(f.server.url + '/api/realms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resume', passport: { ...created.passport, token: 'invalid-camera-passport' } }) });
  assert.equal(response.status, 401);

  const first = await owner.command('setCameraPreferences', { shipZoom: .35, personZoom: .8, expectedRevision: 0 }, 'initial-camera');
  assert.equal(first.ok, true); assert.deepEqual(first.cameraPreferences, { shipZoom: .35, personZoom: .8 }); assert.equal(first.cameraRevision, 1);
  assert.deepEqual(first.result.cameraPreferences, first.cameraPreferences); assert.equal(first.result.cameraRevision, 1);
  const saved = (await f.disk.load(created.passport.realmCode)).snapshot.captains[created.passport.captainId];
  assert.deepEqual(saved.cameraPreferences, first.cameraPreferences); assert.equal(saved.cameraRevision, 1);
  const spoof = await guest.command('setCameraPreferences', { captainId: created.passport.captainId, shipZoom: 1.6, expectedRevision: 0 });
  assert.equal(spoof.result.code, 'camera-invalid'); assert.equal(spoof.cameraRevision, 0);
  let guestSaved = await guest.command('setCameraPreferences', { shipZoom: .65, personZoom: 1.4, expectedRevision: 0 });
  assert.equal(guestSaved.ok, true);
  const raced = await Promise.all([
    guest.command('setCameraPreferences', { personZoom: 1.1, expectedRevision: 1 }),
    guest.command('setCameraPreferences', { shipZoom: 1.2, expectedRevision: 1 }),
  ]);
  assert.equal(raced.filter(packet => packet.ok).length, 1);
  assert.equal(raced.find(packet => !packet.ok).result.code, 'camera-conflict');
  guestSaved = raced.find(packet => packet.ok); assert.equal(guestSaved.cameraRevision, 2);
  const stale = await owner.command('setCameraPreferences', { shipZoom: 1.5, expectedRevision: 0 });
  assert.equal(stale.result.code, 'camera-conflict'); assert.equal(stale.result.cameraRevision, 1); assert.deepEqual(stale.result.cameraPreferences, first.cameraPreferences);
  const next = await owner.command('setCameraPreferences', { personZoom: .9, expectedRevision: 1 }, 'second-camera');
  assert.equal(next.ok, true); assert.equal(next.cameraRevision, 2); assert.deepEqual(next.cameraPreferences, { shipZoom: .35, personZoom: .9 });
  const replay = await owner.command('setCameraPreferences', { shipZoom: .35, personZoom: .8, expectedRevision: 0 }, 'initial-camera');
  assert.equal(replay.ok, true); assert.equal(replay.result.cameraRevision, 1); assert.equal(replay.cameraRevision, 2); assert.deepEqual(replay.cameraPreferences, next.cameraPreferences);
  for (const packet of [next, guestSaved]) {
    const publicData = { state: packet.state, players: packet.players, remoteShips: packet.remoteShips, presence: packet.presence, fleet: packet.fleet, crew: packet.crew };
    assert.doesNotMatch(JSON.stringify(publicData), /cameraPreferences|cameraRevision|shipZoom|personZoom/);
    assert.equal('cameraPreferences' in compactSnapshot(packet), false);
  }

  await f.restart();
  const resumed = await f.connect(created.passport), resumedGuest = await f.connect(second.passport);
  assert.deepEqual(resumed.welcome.cameraPreferences, next.cameraPreferences); assert.equal(resumed.welcome.cameraRevision, 2);
  assert.deepEqual(resumedGuest.welcome.cameraPreferences, guestSaved.cameraPreferences); assert.equal(resumedGuest.welcome.cameraRevision, 2);
  const replayAfterRestart = await resumed.command('setCameraPreferences', { shipZoom: .35, personZoom: .8, expectedRevision: 0 }, 'initial-camera');
  assert.equal(replayAfterRestart.result.cameraRevision, 1); assert.equal(replayAfterRestart.cameraRevision, 2);
  const anotherDevice = await f.connect(created.passport);
  await until(() => resumed.ws.readyState === WebSocket.CLOSED);
  assert.deepEqual(anotherDevice.welcome.cameraPreferences, next.cameraPreferences); assert.equal(anotherDevice.welcome.cameraRevision, 2);
  const staleDevice = await anotherDevice.command('setCameraPreferences', { shipZoom: 1, expectedRevision: 0 });
  assert.equal(staleDevice.result.code, 'camera-conflict'); assert.deepEqual(staleDevice.cameraPreferences, next.cameraPreferences);
});

test('crew on one ship and a pilot in another system save separate camera preferences concurrently', async t => {
  const f = await fixture(t), created = await f.register('create');
  const passports = [created.passport, (await f.register('join', created.passport.realmCode)).passport, (await f.register('join', created.passport.realmCode)).passport];
  const clients = await Promise.all(passports.map(passport => f.connect(passport))), realm = f.server.manager.realms.get(created.passport.realmCode);
  const captains = passports.map(passport => realm.captains.get(passport.captainId)), vessel = placeInSpace(realm, captains[0]);
  placeInSpace(realm, captains[1]); placeInSpace(realm, captains[2], captains[2].game.galaxy.find(system => system.id !== 'hearth').id);
  assert.equal((await clients[0].command('setCrewAccess', { allowed: true })).ok, true);
  assert.equal((await clients[1].command('boardShip', { vesselId: vessel.id })).ok, true);
  assert.equal((await clients[0].command('enterCabin')).ok, true);
  const values = [{ shipZoom: .25, personZoom: .75 }, { shipZoom: .6, personZoom: 1.2 }, { shipZoom: .9, personZoom: 1.6 }];
  const results = await Promise.all(clients.map((client, i) => client.command('setCameraPreferences', { ...values[i], expectedRevision: 0 })));
  for (let i = 0; i < results.length; i++) {
    assert.equal(results[i].ok, true); assert.deepEqual(results[i].cameraPreferences, values[i]); assert.deepEqual(captains[i].cameraPreferences, values[i]);
    assert.equal(results[i].cameraRevision, 1);
  }
  assert.equal(captains[0].aboard, captains[1].aboard); assert.notEqual(captains[2].game.state.systemId, captains[0].game.state.systemId);
  assert.equal(captains[0].game.state.mode, 'person'); assert.equal(captains[1].game.state.mode, 'person'); assert.equal(captains[2].game.state.mode, 'ship');
  assert.equal('cameraPreferences' in vessel, false);
});

test('camera success waits for confirmed storage instead of acknowledging an in-memory update', async t => {
  let holdNextSave = false, release;
  const f = await fixture(t, { wrapPersistence: disk => ({
    kind: disk.kind, durable: false, ping: () => disk.ping(), load: id => disk.load(id),
    async save(...args) { if (holdNextSave) { holdNextSave = false; await new Promise(resolve => { release = resolve; }); } return disk.save(...args); },
  }) });
  const created = await f.register('create'), client = await f.connect(created.passport);
  const realm = f.server.manager.realms.get(created.passport.realmCode); await realm.flush(realm.markDirty());
  holdNextSave = true; let acknowledged = false;
  const command = client.command('setCameraPreferences', { shipZoom: .4, personZoom: .7, expectedRevision: 0 }).then(result => { acknowledged = true; return result; });
  try { await until(() => !!release); await pause(100); assert.equal(acknowledged, false); }
  finally { release?.(); }
  assert.equal((await command).ok, true);
  const saved = (await f.disk.load(created.passport.realmCode)).snapshot.captains[created.passport.captainId];
  assert.deepEqual(saved.cameraPreferences, { shipZoom: .4, personZoom: .7 }); assert.equal(saved.cameraRevision, 1);
});

test('legacy captains can seed camera once; validation and camera changes do not change gameplay', async () => {
  const persistence = memoryPersistence(), original = new Realm({ id: 'CAMERA01', name: 'Camera test', persistence });
  const { captain: initial } = await original.createCaptain('Legacy captain'), document = original.document();
  delete document.captains[initial.id].cameraPreferences; delete document.captains[initial.id].cameraRevision;
  document.captains[initial.id].game.cameraPreferences = { shipZoom: .3, personZoom: 1.6 };
  document.captains[initial.id].game.cameraRevision = 44;
  const realm = new Realm({ id: 'CAMERA01', persistence, version: original.version, snapshot: document }), captain = realm.captains.get(initial.id);
  assert.deepEqual(captain.cameraPreferences, { shipZoom: .25, personZoom: .8 }); assert.equal(captain.cameraRevision, 0);
  assert.equal('cameraPreferences' in captain.game.state, false, 'Raw local-save metadata never initializes an authenticated captain profile.');
  assert.equal('cameraRevision' in captain.game.state, false);
  captain.game.state.person.health = 0;
  realm.document();
  const stateBefore = structuredClone(captain.game.state), vesselBefore = structuredClone(realm.document().vessels);
  const invalid = [
    {}, { shipZoom: .5 }, { shipZoom: null, expectedRevision: 0 }, { shipZoom: '0.5', expectedRevision: 0 },
    { personZoom: NaN, expectedRevision: 0 }, { shipZoom: Infinity, expectedRevision: 0 }, { personZoom: false, expectedRevision: 0 },
    { shipZoom: .5, expectedRevision: -1 }, { shipZoom: .5, expectedRevision: .5 }, { shipZoom: .5, expectedRevision: '0' },
    { shipZoom: .5, expectedRevision: 0, crewRole: 'helm' }, { shipZoom: .5, personZoom: null, expectedRevision: 0 },
  ];
  for (const args of invalid) {
    const result = await realm.command(captain, 'setCameraPreferences', args);
    assert.equal(result.code, 'camera-invalid'); assert.equal(captain.cameraRevision, 0);
  }
  for (const args of [null, [], false, '.5']) assert.equal((await realm.command(captain, 'setCameraPreferences', args)).code, 'protocol');
  const initialized = await realm.command(captain, 'setCameraPreferences', { shipZoom: .25, personZoom: .8, expectedRevision: 0 });
  assert.equal(initialized.ok, true); assert.equal(initialized.cameraRevision, 1, 'Saving defaults still marks a legacy local migration complete.');
  const clamped = await realm.command(captain, 'setCameraPreferences', { shipZoom: -100, personZoom: 100, expectedRevision: 1 });
  assert.equal(clamped.ok, true); assert.deepEqual(clamped.cameraPreferences, { shipZoom: .25, personZoom: 1.6 });
  assert.deepEqual(captain.game.state, stateBefore, 'The camera command does not alter inventory, health, movement, quest state or control mode.');
  assert.deepEqual(realm.document().vessels, vesselBefore, 'No shared hull or crew state is affected.');
  assert.deepEqual(persistence.saved.captains[captain.id].cameraPreferences, clamped.cameraPreferences);
  captain.game.state.cameraPreferences = { shipZoom: .6, personZoom: .5 };
  captain.game.state.cameraRevision = 99;
  const snapshot = realm.snapshotFor(captain), serialized = realm.document();
  assert.deepEqual(snapshot.cameraPreferences, clamped.cameraPreferences);
  assert.equal('cameraPreferences' in snapshot.state, false); assert.equal('cameraRevision' in snapshot.state, false);
  assert.equal('cameraPreferences' in serialized.captains[captain.id].game, false); assert.equal('cameraRevision' in serialized.captains[captain.id].game, false);
});
