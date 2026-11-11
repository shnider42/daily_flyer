import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import WebSocket from 'ws';
import { Realm } from '../../server/realm.mjs';
import { startServer } from '../../server/index.mjs';
import { PersistenceConflict } from '../../server/persistence.mjs';
import { createPrivacyExport } from '../../server/privacy.mjs';
import { FarwakeNetwork, mergeSnapshot } from '../../dist/network.mjs';
import { Game } from '../../dist/engine.mjs';
import { isOpeningMiningRock } from '../../dist/opening-mission.mjs';
import { repairSolution } from '../../dist/surface.mjs';

const copy = value => structuredClone(value);
const ok = value => { assert.equal(value?.ok, true, value?.reason || value?.result?.reason || JSON.stringify(value)); return value; };
const status = captain => captain.game.openingMissionStatus();
function persistence() {
  const records = new Map();
  return { kind: 'test-memory', durable: true,
    async ping() { return { ok: true }; },
    async load(id) { return copy(records.get(id) || { version: 0, snapshot: null }); },
    async save(id, expectedVersion, snapshot) {
      const version = records.get(id)?.version || 0;
      if (version !== expectedVersion) throw new PersistenceConflict(version);
      records.set(id, { version: version + 1, snapshot: copy(snapshot) });
      return { version: version + 1 };
    },
  };
}
function storage() { const values = new Map(); return { getItem:key=>values.get(key)||null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) }; }
function approach(realm, captain, predicate) {
  const entity = realm._surface(captain).entities.find(typeof predicate === 'string' ? value => value.id === predicate : predicate);
  assert.ok(entity, 'The actual authored interaction exists at this port.');
  Object.assign(captain.game.state.person, { x: entity.x, y: entity.y });
  return entity;
}
function approachObjective(realm, captain) { return approach(realm, captain, status(captain).target.entityId); }
async function accept(realm, captain, invoke = (name,args)=>realm.command(captain,name,args)) {
  const entity = approachObjective(realm, captain);
  ok(await invoke('openingAction', { action: 'accept', entityId: entity.id }));
  assert.equal(status(captain).stageId, 'repair');
}
async function repair(realm, captain, invoke = (name,args)=>realm.command(captain,name,args)) {
  const entity = approachObjective(realm, captain);
  const result = ok(await invoke('surfaceAction', { action: 'repair', entityId: entity.id, solution: repairSolution(entity.id) }));
  assert.equal(result.first, true, 'The ordinary relay job performed new paid work.');
  return entity;
}
async function fixture(options = [{}]) {
  const realm = new Realm({ id: 'OPENING1', seed: 'opening-authority', settings: { openingMission: true }, persistence: persistence() });
  const captains = [];
  for (const [index, origin] of options.entries()) {
    const { captain } = await realm.createCaptain(`Opening ${index}`, origin);
    ok(realm.attach(captain, { send() {}, close() {} })); captains.push(captain);
  }
  realm._room('hearth').runtime.enemies.length = 0;
  return { realm, captains };
}
async function launch(realm, captain, extra = {}) {
  ok(await realm.command(captain, 'boardShip', { vesselId: captain.ownedVesselId }));
  ok(await realm.command(captain, 'quickHelm', extra));
  assert.equal(captain.game.state.mode, 'ship');
}
function prepareRock(realm, captain, { qualifying = true } = {}) {
  const vessel = realm.vessels.get(captain.aboard), room = realm._room(vessel.systemId);
  const rock = room.runtime.asteroids.find(value => value.hp > 0 && isOpeningMiningRock(captain.game, value) === qualifying);
  assert.ok(rock, 'The test uses a real generated asteroid.');
  Object.assign(rock, { hp: .01, ore: 2, crystal: 0 });
  Object.assign(vessel.ship, { x: rock.x, y: rock.y, vx: 0, vy: 0, angularVelocity: 0 });
  return { rock, vessel };
}
function mineOneRock(realm, captain, options) {
  const prepared = prepareRock(realm, captain, options);
  realm.acceptInput(captain, captain.inputSeq + 1, { mine: true });
  realm.step(1 / 30, realm.tick + 1, Date.now());
  realm.acceptInput(captain, captain.inputSeq + 1, {});
  assert.equal(prepared.rock.hp, 0, 'Real authoritative mining depleted the rock.');
  return prepared;
}
async function dockAtKettle(realm, captain, invoke = (name,args)=>realm.command(captain,name,args)) {
  const vessel = realm.vessels.get(captain.aboard), body = realm._room('hearth').runtime.bodies.find(value => value.id === 'kettle');
  Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 75, vx: 0, vy: 0 });
  ok(await invoke('dock', { id: body.id }));
}
async function until(predicate, timeout = 3000) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Opening multiplayer condition timed out.'); await pause(10); }
}
async function serverFixture(t) {
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence: persistence() }), clients = [];
  t.after(async () => { for (const client of clients) client.disconnect(); await server.close(); });
  return { server,
    async request(body) { const response = await fetch(`${server.url}/api/realms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); assert.equal(response.status, 200, data.reason); return ok(data); },
    async connect(options) { const client = new FarwakeNetwork({ url: server.url, WebSocketImpl: WebSocket, storage: storage(), autoReconnect: false }); clients.push(client); await client.connect(options); return client; },
  };
}
function clientView(realm, captain, compact = false) {
  const full = realm.snapshotFor(captain, { drainEvents: false });
  const packet = compact ? mergeSnapshot(full, realm.snapshotFor(captain, { compact: true, drainEvents: false })) : full;
  const game = Game.fromSave(packet.state);
  game.state = copy(packet.state); game._runtime = copy(packet.world);
  return { packet, game, status: game.openingMissionStatus() };
}

test('only explicit host opt-in enables an opening; joins inherit and legacy realms remain disabled', async t => {
  const f = await serverFixture(t);
  for (const value of [undefined, false, 'true', 1]) {
    const response = await f.request({ action: 'create', name: 'Ordinary captain', openingMission: value });
    const realm = f.server.manager.realms.get(response.passport.realmCode), captain = realm.captains.get(response.passport.captainId);
    assert.equal(realm.settings.openingMission, false); assert.equal(status(captain).active, false);
    assert.equal(captain.game.state.mode, 'ship'); assert.equal(captain.aboard, captain.ownedVesselId); assert.equal(captain.game.state.credits, 180);
    const joined = await f.request({ action: 'join', realmCode: realm.id, name: 'Cannot override', openingMission: true });
    assert.equal(status(realm.captains.get(joined.passport.captainId)).active, false);
  }
  const created = await f.request({ action: 'create', openingMission: true, name: 'Opted in', starterShip: 'mule' });
  const realm = f.server.manager.realms.get(created.passport.realmCode), host = realm.captains.get(created.passport.captainId), hull = realm.vessels.get(host.ownedVesselId);
  assert.equal(created.realm.settings.openingMission, true); assert.equal(created.realm.capacity, 10);
  assert.equal(host.game.state.mode, 'person'); assert.equal(host.game.state.locationId, 'kettle');
  assert.equal(host.aboard, null); assert.equal(host.portVesselId, hull.id); assert.equal(hull.helmOwner, null); assert.equal(hull.dockedAt, 'kettle');
  assert.equal(hull.ship.classId, 'mule'); assert.equal(host.game.canUseOwnShipHere(), true); assert.equal(host.home.locationId, 'kettle');
  const joined = await f.request({ action: 'join', realmCode: realm.id, openingMission: false, name: 'Inherited', startMode: 'hardcore' });
  const guest = realm.captains.get(joined.passport.captainId);
  assert.equal(status(guest).active, true); assert.equal(guest.game.state.locationId, 'morrow'); assert.equal(guest.ownedVesselId, null); assert.equal(realm.vessels.size, 1);
  await f.request({ action: 'resume', passport: created.passport, openingMission: false, startMode: 'hardcore' });
  assert.equal(status(host).active, true); assert.equal(host.game.state.startMode, 'regular');

  const legacy = new Realm({ id: 'LEGACY01', persistence: persistence() });
  const old = (await legacy.createCaptain('Old save')).captain, saved = legacy.document(); delete saved.settings;
  const restored = new Realm({ id: legacy.id, snapshot: saved, settings: { openingMission: true }, persistence: persistence() });
  assert.equal(restored.settings.openingMission, false); assert.equal(status(restored.captains.get(old.id)).active, false);
  const newcomer = (await restored.createCaptain('New arrival', { openingMission: true })).captain;
  assert.equal(status(newcomer).active, false); assert.equal(newcomer.game.state.mode, 'ship');
});

test('four real shared clients can repair, mine, travel, skip and finish their own openings independently', async t => {
  const f = await serverFixture(t), ownerClient = await f.connect({ create: true, name: 'Owner pilot', realmName: 'Four openings', openingMission: true });
  const code = ownerClient.passport.realmCode;
  const waitingClient = await f.connect({ realmCode: code, name: 'Still repairing', openingMission: false });
  const travelerClient = await f.connect({ realmCode: code, name: 'Paid traveler', startMode: 'hardcore', openingMission: false });
  const skippingClient = await f.connect({ realmCode: code, name: 'Free explorer' });
  const realm = f.server.manager.realms.get(code), clients = [ownerClient, waitingClient, travelerClient, skippingClient];
  const [owner, waiting, traveler, skipping] = clients.map(client => realm.captains.get(client.passport.captainId));
  realm._room('hearth').runtime.enemies.length = 0;
  const command = client => async (name,args,requestId) => { const packet = ok(await client.command(name,args,requestId ? { requestId } : {})); return ok(packet.result); };
  const ownerCommand = command(ownerClient), travelerCommand = command(travelerClient);
  await Promise.all([accept(realm, owner, ownerCommand), accept(realm, waiting, command(waitingClient)), accept(realm, traveler, travelerCommand), command(skippingClient)('openingAction', { action: 'skip' })]);
  await Promise.all([repair(realm, owner, ownerCommand), repair(realm, traveler, travelerCommand)]);
  assert.equal(status(owner).stageId, 'ore'); assert.equal(status(traveler).stageId, 'passage'); assert.equal(status(waiting).stageId, 'repair');
  assert.equal(skipping.game.state.openingMission.status, 'skipped'); assert.equal(skipping.game.state.credits, 180);
  assert.equal(realm.onlineCount, 4); assert.equal(ownerClient.latest.realm.capacity, 10);

  await ownerCommand('boardShip', { vesselId: owner.ownedVesselId }); await ownerCommand('quickHelm', {});
  prepareRock(realm, owner);
  await until(() => { ownerClient.setInput({ mine: true }); return owner.game.state.openingMission.oreMined === 2; }); ownerClient.setInput({});
  assert.equal(waiting.game.state.openingMission.oreMined, 0); assert.equal(traveler.ownedVesselId, null);
  assert.deepEqual(realm.snapshotFor(owner, { compact: true }).state.openingMission, owner.game.state.openingMission);
  await dockAtKettle(realm, owner, ownerCommand);
  const ownerContact = approachObjective(realm, owner), ownerCredits = owner.game.state.credits, ore = owner.game.state.cargo.ore;
  await ownerCommand('openingAction', { action: 'finish', entityId: ownerContact.id }, 'opening-reward-once');
  assert.equal(owner.game.state.openingMission.status, 'completed'); assert.equal(owner.game.state.credits, ownerCredits + 35); assert.equal(owner.game.state.cargo.ore, ore - 2);
  await ownerCommand('openingAction', { action: 'finish', entityId: ownerContact.id }, 'opening-reward-once');
  const repeated = await ownerClient.command('openingAction', { action: 'finish', entityId: ownerContact.id });
  assert.equal(repeated.ok, false); assert.equal(owner.game.state.credits, ownerCredits + 35); assert.equal(owner.game.state.cargo.ore, ore - 2);

  const quote = traveler.game.passengerQuote('kettle'), travelerCredits = traveler.game.state.credits;
  await travelerCommand('takePassengerTransit', { bodyId: 'kettle' });
  assert.equal(traveler.game.state.credits, travelerCredits - quote.fare); assert.equal(status(traveler).stageId, 'return');
  const destination = approachObjective(realm, traveler);
  await travelerCommand('openingAction', { action: 'finish', entityId: destination.id });
  assert.equal(traveler.game.state.credits, travelerCredits - quote.fare + 35); assert.equal(traveler.game.state.openingMission.status, 'completed');
  assert.equal(traveler.ownedVesselId, null); assert.equal(traveler.game.ownsShip, false); assert.equal(traveler.game.state.ship.unowned, true); assert.deepEqual(traveler.game.state.fleet.owned, []);
  assert.equal(realm.vessels.size, 3); assert.equal(status(waiting).stageId, 'repair'); assert.equal(waiting.game.state.credits, 180);
});

test('opening commands reject remote contacts, forged progress and unearned hand-ins without poisoning the galaxy', async () => {
  const { realm, captains: [captain] } = await fixture();
  const before = copy(captain.game.state.openingMission), contact = status(captain).target.entityId;
  Object.assign(captain.game.state.person, { x: 1, y: 1 });
  assert.equal((await realm.command(captain, 'openingAction', { action: 'accept', entityId: contact })).ok, false);
  assert.equal((await realm.command(captain, 'observeOpeningAction', { name: 'surfaceAction', result: { ok: true, first: true } })).ok, false);
  assert.equal((await realm.command(captain, 'recordOpeningMining', { ore: 2 })).ok, false);
  assert.deepEqual(captain.game.state.openingMission, before);
  await accept(realm, captain);
  const relay = approachObjective(realm, captain), solution = repairSolution(relay.id);
  assert.equal((await realm.command(captain, 'surfaceAction', { action: 'repair', entityId: relay.id, solution: solution.map(value => (value + 1) % 4) })).ok, false);
  assert.equal(status(captain).stageId, 'repair'); assert.equal(captain.game.state.credits, 180);
  await repair(realm, captain);
  approach(realm, captain, contact);
  const credits = captain.game.state.credits;
  assert.equal((await realm.command(captain, 'openingAction', { action: 'finish', entityId: contact, stage: 'return', oreMined: 2, fallbackAvailable: true })).ok, false);
  assert.equal(captain.game.state.credits, credits); assert.equal(captain.game.state.openingMission.oreMined, 0);
  assert.notEqual(realm.failed, true);
  captain.game.state.person.health = 0;
  ok(await realm.command(captain, 'openingAction', { action: 'skip' }));
  assert.equal(captain.game.state.openingMission.status, 'skipped'); assert.equal(captain.game.state.credits, credits);
});

test('guest mining cannot advance either captain’s opening through the owner’s proxy statistics', async () => {
  const { realm, captains: [owner, guest] } = await fixture([{}, {}]);
  for (const captain of [owner, guest]) { await accept(realm, captain); await repair(realm, captain); }
  const hull = realm.vessels.get(owner.ownedVesselId);
  ok(await realm.command(owner, 'setCrewAccess', { captainId: guest.id, allowed: true, roles: ['helm'] }));
  ok(await realm.command(guest, 'boardShip', { vesselId: hull.id }));
  ok(await realm.command(guest, 'quickHelm', { leaveCrewBehind: true }));
  mineOneRock(realm, guest);
  assert.equal(owner.game.state.stats.oreMined, 2, 'Existing hull economy still belongs to its owner.');
  assert.equal(owner.game.state.openingMission.oreMined, 0); assert.equal(guest.game.state.openingMission.oreMined, 0);
  assert.equal(status(owner).stageId, 'ore'); assert.equal(status(guest).stageId, 'ore');
  await dockAtKettle(realm, guest);
  await launch(realm, owner, { leaveCrewBehind: true });
  mineOneRock(realm, owner);
  assert.equal(owner.game.state.openingMission.oreMined, 2); assert.equal(guest.game.state.openingMission.oreMined, 0);
});

test('opening ore requires mining the marked belt beyond Kettle rather than clearing dockside rocks', async () => {
  const { realm, captains: [captain] } = await fixture(); await accept(realm, captain); await repair(realm, captain);
  await launch(realm, captain);
  mineOneRock(realm, captain, { qualifying: false });
  assert.equal(captain.game.state.cargo.ore, 2, 'Dockside mining remains ordinary usable cargo.');
  assert.equal(captain.game.state.stats.oreMined, 2);
  assert.equal(captain.game.state.openingMission.oreMined, 0); assert.equal(status(captain).stageId, 'ore');
  mineOneRock(realm, captain);
  assert.equal(captain.game.state.cargo.ore, 4); assert.equal(captain.game.state.openingMission.oreMined, 2);
  assert.equal(status(captain).stageId, 'return');
});

test('ship selection and destruction recovery do not invent opening mining evidence', async () => {
  const { realm, captains: [captain] } = await fixture(); await accept(realm, captain); await repair(realm, captain);
  captain.game.state.fleet.owned.push('mule');
  approach(realm, captain, entity => entity.type === 'mechanic');
  ok(await realm.command(captain, 'selectShip', { id: 'mule' }));
  assert.equal(captain.game.state.openingMission.oreMined, 0);
  await launch(realm, captain);
  const destroyed = realm.vessels.get(captain.ownedVesselId); realm._destroyVessel(destroyed);
  assert.equal(captain.game.state.openingMission.oreMined, 0); assert.equal(status(captain).stageId, 'ore');
  assert.notEqual(realm.failed, true);
});

test('a depleted Hearth field projects its guarded hand-in fallback without sending asteroids to person mode', async () => {
  const { realm, captains: [captain] } = await fixture(); await accept(realm, captain); await repair(realm, captain);
  const room = realm._room('hearth');
  for (const rock of room.runtime.asteroids.filter(value => isOpeningMiningRock(captain.game, value))) { rock.hp = 0; if (!room.record.depleted.includes(rock.id)) room.record.depleted.push(rock.id); }
  assert.ok(room.runtime.asteroids.some(rock => rock.hp > 0 && rock.ore > 0), 'Dockside ore remains when the qualifying belt is exhausted.');
  approach(realm, captain, 'kettle:dockworker');
  const authoritative = status(captain);
  assert.equal(authoritative.stageId, 'return'); assert.equal(authoritative.fallbackAvailable, true); assert.equal(authoritative.canFinish, true);
  for (const compact of [false, true]) {
    const view = clientView(realm, captain, compact);
    assert.deepEqual(view.packet.world.asteroids, []);
    assert.equal(view.status.stageId, 'return'); assert.equal(view.status.fallbackAvailable, true); assert.equal(view.status.canFinish, true);
    assert.equal(view.packet.state.openingMissionAvailability.oreFieldExhausted, true);
  }
  assert.equal(captain.game.state.openingMissionAvailability, undefined);
  assert.equal(realm.document().captains[captain.id].game.openingMissionAvailability, undefined);
  const credits = captain.game.state.credits;
  ok(await realm.command(captain, 'openingAction', { action: 'finish', entityId: 'kettle:dockworker' }));
  assert.equal(captain.game.state.credits, credits + 35); assert.equal(captain.game.state.cargo.ore, 0);
});

test('opening snapshots use personal delivery ore and hull eligibility after visiting a friend’s docked ship', async () => {
  const { realm, captains: [captain, friend] } = await fixture([{}, {}]); await accept(realm, captain); await repair(realm, captain);
  await launch(realm, captain); mineOneRock(realm, captain); await dockAtKettle(realm, captain);
  ok(await realm.command(friend, 'setCrewAccess', { captainId: captain.id, allowed: true }));
  ok(await realm.command(captain, 'boardShip', { vesselId: friend.ownedVesselId }));
  ok(await realm.command(captain, 'leaveCrew', {})); approach(realm, captain, 'kettle:dockworker');
  assert.equal(captain.portVesselId, friend.ownedVesselId);
  for (const compact of [false, true]) {
    const view = clientView(realm, captain, compact);
    assert.equal(view.packet.state.ship.id, friend.ownedVesselId); assert.equal(view.packet.state.cargo.ore, 0);
    assert.equal(view.status.oreAvailable, 2); assert.equal(view.status.stageId, 'return'); assert.equal(view.status.canFinish, true);
  }
  captain.game.state.cargo.ore = 0; friend.game.state.cargo.ore = 2;
  for (const compact of [false, true]) {
    const view = clientView(realm, captain, compact);
    assert.equal(view.packet.state.cargo.ore, 2); assert.equal(view.status.oreAvailable, 0);
    assert.equal(view.status.stageId, 'ore'); assert.equal(view.status.canFinish, false);
  }
});

test('regular delivery requires the actual owned hull at Kettle, not matching coordinates in another system', async () => {
  const { realm, captains: [captain] } = await fixture(); await accept(realm, captain); await repair(realm, captain);
  await launch(realm, captain); mineOneRock(realm, captain); await dockAtKettle(realm, captain);
  const vessel = realm.vessels.get(captain.ownedVesselId);
  vessel.systemId = 'brindle'; vessel.dockedAt = 'orchard'; captain.game.state.livelihoods.parkedShip = null;
  approach(realm, captain, 'kettle:dockworker');
  assert.equal(captain.game.canUseOwnShipHere(), true, 'The old coordinate-only check cannot establish canonical hull location.');
  assert.equal(captain.game.openingOwnShipHere(), false); assert.equal(status(captain).canFinish, false);
  const credits = captain.game.state.credits;
  const denied = await realm.command(captain, 'openingAction', { action: 'finish', entityId: 'kettle:dockworker' });
  assert.equal(denied.ok, false); assert.equal(denied.code, 'ship-location');
  assert.equal(captain.game.state.credits, credits); assert.equal(captain.game.state.cargo.ore, 2);
  assert.equal(clientView(realm, captain, true).status.canFinish, false);
});

test('restart preserves individual progress and paid passage, while late joiners receive a fresh independent opening', async () => {
  const { realm, captains: [owner, traveler, skipped] } = await fixture([{}, { startMode: 'hardcore' }, {}]);
  await accept(realm, owner); await repair(realm, owner);
  await accept(realm, traveler); await repair(realm, traveler);
  ok(await realm.command(traveler, 'takePassengerTransit', { bodyId: 'kettle' }));
  ok(await realm.command(skipped, 'openingAction', { action: 'skip' }));
  traveler.session = null; traveler.disconnectUntil = Date.now() - 1;
  realm.step(1 / 30, realm.tick + 1, Date.now());
  assert.equal(traveler.game.state.locationId, 'kettle', 'An expired disconnect grace does not undo paid opening passage.');
  assert.equal(traveler.home.locationId, 'morrow');
  const progress = copy(owner.game.state.openingMission), passage = copy(traveler.game.state.openingMission), travelerCredits = traveler.game.state.credits;
  const saved = realm.document(); for (const captain of Object.values(saved.captains)) captain.lastSeen = Date.now() - 60000;
  const restored = new Realm({ id: realm.id, snapshot: saved, persistence: persistence() });
  const returned = restored.captains.get(owner.id), returnedTraveler = restored.captains.get(traveler.id);
  for (const captain of restored.captains.values()) ok(restored.attach(captain, { send() {}, close() {} }));
  assert.deepEqual(returned.game.state.openingMission, progress); assert.deepEqual(returnedTraveler.game.state.openingMission, passage);
  assert.equal(returned.game.state.locationId, 'kettle'); assert.equal(returned.game.canUseOwnShipHere(), true);
  assert.equal(returnedTraveler.ownedVesselId, null); assert.equal(returnedTraveler.game.state.credits, travelerCredits);
  assert.equal(returnedTraveler.game.state.locationId, 'kettle', 'A restart resumes the safe paid arrival.'); assert.equal(returnedTraveler.home.locationId, 'morrow');
  assert.equal(restored.captains.get(skipped.id).game.state.openingMission.status, 'skipped');
  const late = (await restored.createCaptain('Late arrival', { openingMission: false })).captain;
  assert.equal(status(late).stageId, 'meet'); assert.equal(late.game.state.credits, 180); assert.equal(restored.settings.openingMission, true);
  assert.deepEqual(returned.game.state.openingMission, progress);
});

test('privacy export includes only the requesting captain’s opening progress', async () => {
  const { realm, captains: [first, second] } = await fixture([{}, {}]);
  await accept(realm, first); ok(await realm.command(second, 'openingAction', { action: 'skip' }));
  const exported = createPrivacyExport(realm, first);
  assert.deepEqual(exported.captain.game.openingMission, first.game.state.openingMission);
  assert.equal(exported.manifest.unrecognizedGameFields.includes('openingMission'), false);
  assert.equal(exported.captain.game.openingMission.status, 'active');
});
