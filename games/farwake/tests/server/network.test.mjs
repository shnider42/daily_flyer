import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import WebSocket from 'ws';
import { startServer, compactSnapshot } from '../../server/index.mjs';
import { FilePersistence, GatewayPersistence, PersistenceConflict, persistenceFromEnvironment } from '../../server/persistence.mjs';
import { getShipClass } from '../../dist/fleet.mjs';
import { repairSolution } from '../../dist/surface.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';

async function until(predicate, timeout = 6000) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for a multiplayer condition.'); await pause(15); }
}
class CaptainClient {
  constructor(server, passport, { delayMs = 0, autoPong = true } = {}) { this.server = server; this.passport = passport; this.delayMs = delayMs; this.autoPong = autoPong; this.seq = 0; this.serial = 0; this.pending = new Map(); this.packets = []; this.bytes = 0; this.delayed = new Set(); }
  async connect() {
    this.ws = new WebSocket(this.server.url.replace(/^http/, 'ws') + '/ws', { autoPong: this.autoPong });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Welcome timed out.')), 6000);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'hello', protocol: 1, passport: this.passport })));
      this.ws.on('message', buffer => {
        this.bytes += buffer.length;
        const packet = JSON.parse(buffer.toString());
        if (packet.type === 'welcome') { clearTimeout(timer); this.latest = packet; resolve(); }
        if (packet.type === 'error' && !this.latest) { clearTimeout(timer); reject(new Error(packet.reason)); }
        const receive = () => {
          this.packets.push(packet); if (this.packets.length > 200) this.packets.shift();
          if (packet.state) this.latest = mergeSnapshot(this.latest, packet);
          if (packet.type === 'result') { const pending = this.pending.get(packet.id); if (pending) { clearTimeout(pending.timer); this.pending.delete(packet.id); pending.resolve(packet); } }
        };
        if (this.delayMs && packet.type !== 'welcome') { const timer = setTimeout(() => { this.delayed.delete(timer); receive(); }, this.delayMs); this.delayed.add(timer); } else receive();
      });
      this.ws.once('error', error => { clearTimeout(timer); reject(error); });
    });
    return this;
  }
  send(packet) {
    const send = () => { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(packet)); };
    if (this.delayMs) { const timer = setTimeout(() => { this.delayed.delete(timer); send(); }, this.delayMs); this.delayed.add(timer); } else send();
  }
  input(value) { this.send({ type: 'input', seq: ++this.seq, input: value }); }
  hold(value) { this.input(value); clearInterval(this.inputTimer); this.inputTimer = setInterval(() => this.input(value), 50); }
  command(name, args = {}, id = `test-${++this.serial}`) {
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${name} did not receive an acknowledgment.`)); }, 6000); this.pending.set(id, { resolve, reject, timer }); this.send({ type: 'command', id, name, args }); });
  }
  close() { clearInterval(this.inputTimer); for (const timer of this.delayed) clearTimeout(timer); this.delayed.clear(); for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Test client closed.')); } this.pending.clear(); this.ws?.terminate(); }
}
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'farwake-network-'));
  const persistence = options.persistence || new FilePersistence(directory);
  let server = await startServer({ port: 0, host: '127.0.0.1', persistence, ...options });
  const clients = [];
  const result = { directory, persistence, get server() { return server; }, clients,
    async register(action, realmCode, name = 'Test captain') { const response = await fetch(server.url + '/api/realms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, realmCode, name, realmName: 'Network regression realm' }) }); const data = await response.json(); return { ...data, status: response.status }; },
    async connect(passport, options) { const client = new CaptainClient(server, passport, options); clients.push(client); await client.connect(); return client; },
    async restart() { for (const c of clients) c.close(); await server.close(); server = await startServer({ port: 0, host: '127.0.0.1', persistence, ...options }); return server; },
  };
  t.after(async () => { for (const c of clients) c.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  return result;
}
function placeInSpace(realm, captain, systemId = 'hearth', { x = 0, y = 0 } = {}) {
  const vessel = realm.vessels.get(captain.ownedVesselId);
  captain.aboard = vessel.id; captain.crewRole = 'helm'; captain.game.state.mode = 'ship'; captain.game.state.locationId = null; captain.game.state.interior = null; captain.game.state.systemId = systemId;
  vessel.systemId = systemId; vessel.dockedAt = null; vessel.helmOwner = captain.id; vessel.actor = null; Object.assign(vessel.ship, { x, y, vx: 0, vy: 0 });
  const room = realm._bindCaptain(captain); room.runtime.enemies.length = 0;
  return vessel;
}
function useEarnedCrewHull(realm,captain,classId){
  captain.game.state.fleet.owned.push(classId);captain.game._activateClass(classId,true);
  const vessel=realm.vessels.get(captain.ownedVesselId);vessel.actor=null;return vessel;
}
function landAt(realm, captain, bodyId = 'kettle', systemId = 'hearth') {
  const vessel = realm.vessels.get(captain.ownedVesselId); vessel.systemId = systemId; vessel.dockedAt = bodyId; vessel.helmOwner = null; vessel.actor = null; realm._landCharacter(captain, systemId, bodyId); return vessel;
}
function approach(realm, captain, predicate) {
  const entity = realm._surface(captain).entities.find(typeof predicate === 'string' ? entity => entity.type === predicate : predicate);
  assert.ok(entity, 'A generated, authoritative interaction entity exists.');
  Object.assign(captain.game.state.person, { x: entity.x, y: entity.y }); return entity;
}

test('ten separate systems advance independently while a 200ms client is delayed; cap is enforced', async t => {
  const f = await fixture(t), created = await f.register('create'); assert.equal(created.ok, true);
  const passports = [created.passport];
  for (let i = 1; i <= 10; i++) passports.push((await f.register('join', created.passport.realmCode, `Captain ${i}`)).passport);
  const clients = [];
  for (let i = 0; i < 10; i++) clients.push(await f.connect(passports[i], i === 9 ? { delayMs: 200 } : {}));
  const realm = f.server.manager.realms.get(created.passport.realmCode), systems = [...realm.captains.values()][0].game.galaxy.slice(0, 10).map(s => s.id);
  for (let i = 0; i < clients.length; i++) placeInSpace(realm, realm.captains.get(passports[i].captainId), systems[i]);
  const beforeTick = f.server.tick, beforeRooms = new Map([...realm.rooms].map(([id, room]) => [id, room.ticks]));
  for (const client of clients) client.hold({ thrust: 1, flightAssist: false });
  await pause(950);
  const ticks = f.server.tick - beforeTick; assert.ok(ticks >= 20, `Authority advanced ${ticks} fixed ticks.`);
  for (let i = 0; i < clients.length; i++) {
    const c = realm.captains.get(passports[i].captainId), room = realm.rooms.get(systems[i]);
    assert.ok(Math.hypot(c.game.state.ship.x, c.game.state.ship.y) > 8, 'Each captain advances without waiting for another input acknowledgment.');
    assert.ok(Math.abs((room.ticks - beforeRooms.get(systems[i])) - ticks) <= 1, 'The world advances once per system tick.');
    await until(() => clients[i].latest?.room.systemId === systems[i]);
    const localHullIds = [...realm.vessels.values()].filter(v => v.systemId === systems[i] && v.id !== c.aboard && !v.dockedAt).map(v => v.id).sort();
    assert.deepEqual(clients[i].latest.remoteShips.map(v => v.id).sort(), localHullIds, 'Only physical hulls in this system are visible, including the unconnected eleventh passport’s ship in Hearth.');
    assert.equal(clients[i].latest.players.length, 0);
    assert.ok(!('x' in clients[i].latest.presence.find(p => p.captainId !== passports[i].captainId)), 'Cross-room presence contains no detailed movement.');
  }
  const overflow = await f.register('join', created.passport.realmCode); assert.equal(overflow.status, 409);
  await assert.rejects(f.connect(passports[10]), /ten|Ten/);
  assert.equal(realm.onlineCount, 10);
  const first = realm.captains.get(passports[0].captainId), initialBytes = Buffer.byteLength(JSON.stringify(realm.snapshotFor(first, { drainEvents: false })));
  first.game.state.journal = Array.from({ length: 160 }, (_, i) => ({ id: `entry-${i}`, title: 'A remembered voyage', text: 'A damaged receiver, a promised delivery, and a faction choice remain part of this captain’s history.', time: i * 60 }));
  const journalBytes = Buffer.byteLength(JSON.stringify(realm.snapshotFor(first, { drainEvents: false })));
  const motionBytes = Buffer.byteLength(JSON.stringify(compactSnapshot(realm.snapshotFor(first, { drainEvents: false }))));
  assert.ok(motionBytes < initialBytes * .55, 'Compact motion avoids resending journals and all static geometry.');
  t.diagnostic(`Measured JSON: ten-realm-members full startup snapshot ${initialBytes} bytes; 160-entry synthetic journal full snapshot ${journalBytes} bytes; compact motion ${motionBytes} bytes. At one full plus nine motion packets/s: approximately ${(initialBytes + motionBytes * 9) * 10} startup bytes/s across ten clients before transport overhead.`);
});

test('ten humans aboard one capital share one canonical vessel and one helm, with independent deck movement', async t => {
  const f = await fixture(t), created = await f.register('create'); const passports = [created.passport];
  for (let i = 1; i < 10; i++) passports.push((await f.register('join', created.passport.realmCode, `Crew ${i}`)).passport);
  const clients = [];
  for (const passport of passports) clients.push(await f.connect(passport));
  const realm = f.server.manager.realms.get(created.passport.realmCode), owner = realm.captains.get(passports[0].captainId), vessel = placeInSpace(realm, owner);
  owner.game.state.ship.classId = 'capital'; owner.game.state.fleet.owned.push('capital'); owner.game._updateStats(false); owner.game.state.crew = [];
  for (let i = 1; i < 10; i++) placeInSpace(realm, realm.captains.get(passports[i].captainId));
  assert.equal((await clients[0].command('setCrewAccess', { allowed: true })).ok, true);
  for (let i = 1; i < 10; i++) assert.equal((await clients[i].command('boardShip', { vesselId: vessel.id })).ok, true, `Crew ${i} boarded.`);
  assert.equal((await clients[0].command('enterCabin')).ok, true);
  assert.equal([...realm.captains.values()].filter(c => c.aboard === vessel.id).length, 10);
  assert.equal(realm._actor(vessel).state.ship.humanOccupants, 10);
  assert.equal(realm.snapshotFor(owner).fleet.find(v => v.id === vessel.id).occupants, 10);
  assert.equal(realm.snapshotFor(owner).players.length, 9);
  assert.ok([...realm.vessels.values()].filter(v => v.id !== vessel.id).every(v => !v.dockedAt), 'Guest vessels remain physically in space after a crew transfer.');
  assert.equal(realm.snapshotFor(owner).remoteShips.length, 0, 'Person mode does not render external hulls.');
  const guest = realm.captains.get(passports[1].captainId), second = realm.captains.get(passports[2].captainId);
  const before = { ...guest.game.state.person }, secondBefore = { ...second.game.state.person };
  clients[1].hold({ x: 1, y: 0 }); await pause(260); clients[1].hold({}); await pause(80);
  assert.ok(Math.hypot(guest.game.state.person.x - before.x, guest.game.state.person.y - before.y) > 4);
  assert.equal(second.game.state.person.x, secondBefore.x); assert.equal(second.game.state.person.y, secondBefore.y);
  const helmEntity = approach(realm, guest, e => e.data?.stationRole === 'helm');
  assert.equal((await clients[1].command('takeStation', { role: 'helm', entityId: helmEntity.id })).result.code, 'permission');
  assert.equal((await clients[0].command('setCrewAccess', { captainId: guest.id, allowed: true, roles: ['helm', 'engineering'], allowBunk: true })).ok, true);
  assert.equal((await clients[1].command('takeStation', { role: 'helm', entityId: helmEntity.id })).ok, true);
  approach(realm, owner, e => e.data?.stationRole === 'helm');
  assert.equal((await clients[0].command('takeStation', { role: 'helm' })).result.code, 'station-occupied');
  const room = realm.rooms.get(vessel.systemId), beforeTicks = room.ticks, beforeGlobal = f.server.tick, beforeShip = { x: vessel.ship.x, y: vessel.ship.y };
  clients[0].close(); clients[1].hold({ thrust: 1 }); await pause(550);
  assert.ok(Math.hypot(vessel.ship.x - beforeShip.x, vessel.ship.y - beforeShip.y) > 5, 'A permitted guest keeps flying after the owner disconnects.');
  assert.ok(Math.abs(room.ticks - beforeTicks - (f.server.tick - beforeGlobal)) <= 1, 'Nine characters do not multiply shared NPC simulation.');
  assert.equal(vessel.helmOwner, guest.id);
  assert.equal(realm.snapshotFor(second).state.ship.id, vessel.id);
});

test('commands reject forged state, remote interactions, invalid puzzle answers, and duplicate reward collection', async t => {
  const f = await fixture(t), created = await f.register('create'), client = await f.connect(created.passport);
  const realm = f.server.manager.realms.get(created.passport.realmCode), captain = realm.captains.get(created.passport.captainId);
  landAt(realm, captain);
  const originalCredits = captain.game.state.credits;
  assert.equal((await client.command('patchState', { credits: 999999, flags: ['campaign_complete'] })).ok, false);
  assert.equal(captain.game.state.credits, originalCredits);
  const work = realm._surface(captain).entities.find(e => e.type === 'work'); assert.ok(work);
  Object.assign(captain.game.state.person, { x: 1, y: 1 });
  assert.equal((await client.command('surfaceAction', { action: 'repair', entityId: work.id, solution: repairSolution(work.id) })).result.code, 'distance');
  approach(realm, captain, e => e.id === work.id);
  const wrong = repairSolution(work.id).map(v => (v + 1) % 4);
  assert.equal((await client.command('surfaceAction', { action: 'repair', entityId: work.id, solution: wrong })).result.code, 'puzzle');
  const first = await client.command('surfaceAction', { action: 'repair', entityId: work.id, solution: repairSolution(work.id) }, 'repair-once'); assert.equal(first.ok, true);
  const earned = captain.game.state.credits; assert.equal(earned - originalCredits, 12);
  assert.equal((await client.command('surfaceAction', { action: 'repair', entityId: work.id, solution: repairSolution(work.id) }, 'repair-once')).ok, true);
  assert.equal(captain.game.state.credits, earned);
  await client.command('surfaceAction', { action: 'repair', entityId: work.id, solution: repairSolution(work.id) });
  assert.equal(captain.game.state.credits, earned, 'Fresh request IDs cannot duplicate a completed local shift.');
  assert.equal((await client.command('setCrewAccess', { vesselId: 'not-owned', allowed: true })).result.code, 'ownership');
  const document = realm.document(); assert.ok(!JSON.stringify(document).includes(created.passport.token), 'Only the passport hash is stored.');
  assert.ok(!JSON.stringify(realm.snapshotFor(captain)).includes(captain.tokenHash), 'Authentication hashes never enter snapshots.');
});

test('a shared hull change sends coherent interior geometry immediately and explicit revocation overrides general boarding', async t => {
  const f = await fixture(t), created = await f.register('create'), joined = await f.register('join', created.passport.realmCode);
  const ownerClient = await f.connect(created.passport), guestClient = await f.connect(joined.passport);
  const realm = f.server.manager.realms.get(created.passport.realmCode), owner = realm.captains.get(created.passport.captainId), guest = realm.captains.get(joined.passport.captainId), vessel = placeInSpace(realm, owner);
  placeInSpace(realm, guest); vessel.allowCrew = true;
  assert.equal((await guestClient.command('boardShip', { vesselId: vessel.id })).ok, true);
  assert.equal(guestClient.latest.state.interior.location.shipClassId, 'sparrow');
  owner.game.state.ship.classId = 'hauler'; owner.game._updateStats(false);
  await until(() => guestClient.latest.state.ship.classId === 'hauler');
  assert.equal(guestClient.latest.state.interior.location.shipClassId, 'hauler', 'A new collision layout is never paired with the preceding hull descriptor.');
  assert.equal(guestClient.packets.findLast(packet => packet.state?.ship.classId === 'hauler').partial, undefined);
  assert.equal((await ownerClient.command('setCrewAccess', { captainId: guest.id, allowed: false })).ok, true);
  assert.equal(realm._canBoard(guest, vessel), false); assert.equal(realm._canRole(guest, vessel, 'engineering'), false);
  assert.equal((await guestClient.command('boardShip', { vesselId: vessel.id })).result.code, 'permission');
});

test('persistent leases, decisions, shared changes, resources, and passport identity survive an authority restart', async t => {
  const f = await fixture(t), created = await f.register('create'), client = await f.connect(created.passport);
  let realm = f.server.manager.realms.get(created.passport.realmCode), captain = realm.captains.get(created.passport.captainId);
  landAt(realm, captain, 'morrow');
  assert.equal((await client.command('setHome', { kind: 'room' })).ok, true, 'Planet settlement supports a standing room lease.');
  const work = approach(realm, captain, 'work');
  assert.equal((await client.command('surfaceAction', { action: 'repair', entityId: work.id, solution: repairSolution(work.id) })).ok, true);
  captain.game._flag('review_test_remembered_choice');
  const record = realm._room('hearth').record; record.regressionMarker = 'shared world persists';
  const credits = captain.game.state.credits, home = structuredClone(captain.home), seed = realm.seed;
  await realm.flush(realm.markDirty());
  await f.restart();
  const resumed = await f.connect(created.passport);
  realm = f.server.manager.realms.get(created.passport.realmCode); captain = realm.captains.get(created.passport.captainId);
  assert.equal(realm.seed, seed); assert.equal(captain.game.state.credits, credits); assert.deepEqual(captain.home, home);
  assert.ok(captain.game.hasFlag('review_test_remembered_choice')); assert.equal(realm._room('hearth').record.regressionMarker, 'shared world persists');
  assert.equal(resumed.latest.state.multiplayer.captainId, created.passport.captainId);
  assert.equal(resumed.latest.homes.length, 1); assert.equal(resumed.latest.homes[0].kind, 'room');
  assert.equal((await resumed.command('setHome', { kind: 'room' })).ok, true); assert.equal(captain.game.state.credits, credits, 'Reactivating the same standing lease is free.');
});

test('assault and retreat use the canonical vessel; unrelated deck and surface viewers do not receive boarders', async t => {
  const f = await fixture(t), created = await f.register('create'), second = await f.register('join', created.passport.realmCode);
  const ownerClient = await f.connect(created.passport), guestClient = await f.connect(second.passport);
  const realm = f.server.manager.realms.get(created.passport.realmCode), owner = realm.captains.get(created.passport.captainId), guest = realm.captains.get(second.passport.captainId), vessel = placeInSpace(realm, owner);
  placeInSpace(realm, guest); vessel.allowCrew = true;
  assert.equal((await guestClient.command('boardShip', { vesselId: vessel.id })).ok, true);
  const room = realm.rooms.get('hearth'); room.runtime.enemies.push({ id: 'network-disabled-ship', name: 'Disabled raider', x: vessel.ship.x + 50, y: vessel.ship.y, angle: 0, radius: 26, classId: 'tern', hp: 40, maxHp: 100, shield: 0, disabled: true, active: false, cooldown: 60, faction: 'covenant', speed: 0, damage: 5, reward: 20 });
  const boarded = await ownerClient.command('boardEnemy', { id: 'network-disabled-ship' }); assert.equal(boarded.ok, true);
  assert.equal(owner.game.state.interior.kind, 'enemy'); assert.equal(vessel.helmOwner, null);
  const targetVessel = realm.vessels.get(owner.aboard);
  assert.notEqual(targetVessel.id, vessel.id); assert.equal(owner.returnVesselId, vessel.id); assert.equal(owner.game.state.ship, vessel.ship);
  assert.equal(realm.snapshotFor(owner).state.ship.id, targetVessel.id); assert.equal(guest.aboard, vessel.id);
  assert.equal(realm.snapshotFor(owner).room.kind, 'boarding'); assert.equal(realm.snapshotFor(owner).state.boarding.phase, 'active');
  assert.equal(realm.snapshotFor(guest).state.boarding, null, 'Friendly deck does not display enemy-deck combat.');
  assert.equal((await guestClient.command('attackBoarder')).result.code, 'location');
  assert.equal((await ownerClient.command('retreatBoarding')).ok, true);
  assert.equal(owner.game.state.mode, 'ship'); assert.equal(vessel.helmOwner, owner.id); assert.equal(owner.aboard, vessel.id); assert.equal(owner.game.state.boarding, null); assert.equal(owner.game.state.boardingHistory.at(-1).phase, 'retreated');
  assert.equal(targetVessel.boarding.phase, 'retreated'); assert.ok(targetVessel.ship.hull > 0); assert.equal(targetVessel.dockedAt, null);
  landAt(realm, owner); assert.equal(realm.snapshotFor(owner).state.boarding, null, 'A planetary view never renders stale ship boarders.');
});

test('defensive boarding moves the helm onto the shared deck; downed guests cannot walk and recover at outcome', async t => {
  const f = await fixture(t), created = await f.register('create'), second = await f.register('join', created.passport.realmCode);
  const ownerClient = await f.connect(created.passport), guestClient = await f.connect(second.passport);
  const realm = f.server.manager.realms.get(created.passport.realmCode), owner = realm.captains.get(created.passport.captainId), guest = realm.captains.get(second.passport.captainId), vessel = placeInSpace(realm, owner);
  useEarnedCrewHull(realm,owner,'tern');
  placeInSpace(realm, guest); vessel.allowCrew = true; assert.equal((await guestClient.command('boardShip', { vesselId: vessel.id })).ok, true);
  const room = realm.rooms.get('hearth'); room.runtime.enemies.push({ id: 'network-breacher', name: 'Breacher', x: 45, y: 0, angle: 0, radius: 26, classId:'tern', hp: 90, maxHp: 90, shield: 0, active: false, cooldown: 99, faction: 'covenant', speed: 0, damage: 5, reward: 20 });
  vessel.ship.shield = 0; const actor = realm._actor(vessel); assert.equal(actor.startBoarding('network-breacher').ok, true); realm._syncActor(vessel);
  assert.equal(owner.game.state.mode, 'person'); assert.equal(owner.game.state.interior.kind, 'ship'); assert.equal(vessel.helmOwner, null);
  guest.game.state.person.health = 0; guest.game.state.person.down = true; const position = { x: guest.game.state.person.x, y: guest.game.state.person.y };
  guestClient.hold({ x: 1 }); await pause(180); assert.equal(guest.game.state.person.x, position.x); assert.equal(guest.game.state.person.y, position.y);
  assert.equal((await guestClient.command('takeStation', { role: 'helm' })).result.code, 'incapacitated');
  const liveActor = realm._actor(vessel); liveActor._finishBoarding('won'); realm._syncActor(vessel);
  assert.ok(guest.game.state.person.health > 0); assert.equal(guest.game.state.person.down, false);
  approach(realm, owner, e => e.data?.stationRole === 'helm'); assert.equal((await ownerClient.command('takeStation', { role: 'helm' })).ok, true);
});

test('restart expires a disconnected helm and a returning bunk owner cannot exceed shared berth capacity', async t => {
  const f = await fixture(t), created = await f.register('create'), second = await f.register('join', created.passport.realmCode);
  const ownerClient = await f.connect(created.passport), guestClient = await f.connect(second.passport);
  let realm = f.server.manager.realms.get(created.passport.realmCode), owner = realm.captains.get(created.passport.captainId), guest = realm.captains.get(second.passport.captainId), vessel = placeInSpace(realm, owner);
  useEarnedCrewHull(realm,owner,'quill');
  placeInSpace(realm, guest); vessel.grants[guest.id] = { allowed: true, roles: ['helm'], allowBunk: true }; vessel.installedBunks = 2; vessel.bunks[1] = guest.id;
  assert.equal((await guestClient.command('boardShip', { vesselId: vessel.id })).ok, true);
  guest.home = { kind: 'bunk', vesselId: vessel.id, bunkIndex: 1, systemId: 'hearth', locationId: `ship:${vessel.id}` };
  await realm.flush(realm.markDirty()); await f.restart();
  const returnedGuestClient = await f.connect(second.passport);
  realm = f.server.manager.realms.get(created.passport.realmCode); owner = realm.captains.get(created.passport.captainId); guest = realm.captains.get(second.passport.captainId); vessel = realm.vessels.get(owner.ownedVesselId);
  realm.step(1 / 30, f.server.tick + 1, Date.now() + 31000);
  assert.equal(vessel.helmOwner, null);
  const helm = approach(realm, guest, e => e.data?.stationRole === 'helm');
  assert.equal((await returnedGuestClient.command('takeStation', { role: 'helm', entityId: helm.id })).ok, true);
  landAt(realm, guest); owner.game.state.crew = Array.from({ length: 3 }, (_, i) => ({ id: `hired-${i}`, role: 'engineer', name: `Engineer ${i}`, health: 100, maxHealth: 100 }));
  realm._restoreAtHome(guest);
  assert.notEqual(guest.aboard, vessel.id, 'A full four-berth Quill cannot restore a fifth human/NPC occupant.');
  assert.equal(guest.game.state.locationId, 'kettle'); assert.equal(getShipClass(vessel.ship.classId).berths, 4);
});

test('raw WebSocket heartbeat releases a dead TCP session without waiting for gameplay acknowledgments', async t => {
  const f = await fixture(t, { heartbeatIntervalMs: 70 }), created = await f.register('create');
  const client = await f.connect(created.passport, { autoPong: false }); const realm = f.server.manager.realms.get(created.passport.realmCode);
  await until(() => client.ws.readyState === WebSocket.CLOSED, 2000);
  assert.equal(realm.onlineCount, 0); assert.ok(realm.captains.get(created.passport.captainId).disconnectUntil > Date.now());
});

test('durable command acknowledgment waits for storage; CAS conflicts close and reload instead of overwriting', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'farwake-cas-')); const disk = new FilePersistence(directory); let delayed = false, release;
  const adapter = { kind: disk.kind, durable: false, ping: () => disk.ping(), load: id => disk.load(id), save: async (...args) => { if (delayed) await new Promise(resolve => { release = resolve; }); return disk.save(...args); } };
  const f = await fixture(t, { persistence: adapter }); t.after(() => rm(directory, { recursive: true, force: true }));
  const created = await f.register('create'), client = await f.connect(created.passport), realm = f.server.manager.realms.get(created.passport.realmCode), captain = realm.captains.get(created.passport.captainId);
  await realm.flush(realm.markDirty()); delayed = true; let acknowledged = false;
  const command = client.command('renameCaptain', { name: 'Durably renamed' }).then(value => { acknowledged = true; return value; });
  await until(() => !!release); await pause(100); assert.equal(acknowledged, false); delayed = false; release(); assert.equal((await command).ok, true);
  const durable = await disk.load(realm.id); assert.equal(durable.snapshot.captains[captain.id].name, 'Durably renamed');
  await disk.save(realm.id, durable.version, { ...durable.snapshot, name: 'External newer revision' });
  captain.name = 'Must not overwrite'; realm.markDirty(); await assert.rejects(realm.flush(), PersistenceConflict);
  assert.equal(realm.conflicted, true); assert.equal(f.server.manager.realms.has(realm.id), false);
  assert.equal((await disk.load(realm.id)).snapshot.name, 'External newer revision');
});

test('gateway adapter implements authenticated CAS and production refuses ephemeral storage', async () => {
  const calls = [], fakeFetch = async (url, request) => { calls.push({ url, request, body: JSON.parse(request.body) }); const op = calls.at(-1).body.op; return new Response(JSON.stringify(op === 'load' ? { ok: true, version: 4, snapshot: { marker: 1 } } : { ok: true, version: 5 }), { status: 200 }); };
  const gateway = new GatewayPersistence('https://storage.example.test/gateway', 'test-secret-never-browser', { fetchImpl: fakeFetch });
  await gateway.ping(); assert.deepEqual(await gateway.load('ABCDEF12'), { version: 4, snapshot: { marker: 1 } }); assert.deepEqual(await gateway.save('ABCDEF12', 4, { marker: 2 }), { version: 5 });
  assert.equal(calls[2].request.headers.authorization, 'Bearer test-secret-never-browser'); assert.deepEqual(calls[2].body, { op: 'save', realmId: 'ABCDEF12', expectedVersion: 4, snapshot: { marker: 2 } });
  const conflicting = new GatewayPersistence('https://storage.example.test/gateway', 'secret', { fetchImpl: async () => new Response(JSON.stringify({ ok: false, conflict: true, version: 9 }), { status: 409 }) });
  await assert.rejects(conflicting.save('ABCDEF12', 4, {}), error => error instanceof PersistenceConflict && error.version === 9);
  assert.throws(() => persistenceFromEnvironment({ NODE_ENV: 'production' }), /Production startup refused/);
});
