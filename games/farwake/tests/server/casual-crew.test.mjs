import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { startServer } from '../../server/index.mjs';
import { WORLD_CONTENT_VERSION } from '../../dist/world-content.mjs';
import { cabinLayout, getShipClass } from '../../dist/fleet.mjs';
import { isCasualCrew } from '../../dist/casual-crew.mjs';

const copy = value => structuredClone(value);
const ok = value => { assert.equal(value?.ok, true, value?.reason || JSON.stringify(value)); return value; };
function storage() {
  const records = new Map();
  return { kind: 'memory', durable: true, async ping() { return { ok: true }; },
    async load(id) { return copy(records.get(id) || { version: 0, snapshot: null }); },
    async save(id, version, snapshot) { records.set(id, { version: version + 1, snapshot: copy(snapshot) }); return { version: version + 1 }; }
  };
}
async function launch({ count = 1_000_000, guestCount = 73, classId = 'lamprey' } = {}) {
  const realm = new Realm({ id: 'CASUALCR', seed: 'casual-shared-watch', persistence: storage(), settings: { startTogether: true } });
  const owner = (await realm.createCaptain('Host', { startMode: 'casual', casualCrewCount: count })).captain;
  const guest = (await realm.createCaptain('Friend', { startMode: 'casual', casualCrewCount: guestCount })).captain;
  for (const captain of [owner, guest]) ok(realm.attach(captain, { close() {} }));
  const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = [];
  ok(await realm.command(owner, 'chooseGroupShip', { classId }));
  const preview = realm._groupStartView(owner);
  assert.equal(preview.hostStartMode, 'casual'); assert.equal(preview.casualCrew.requestedCount, count);
  assert.ok(preview.casualCrew.activeCount <= getShipClass(classId).berths - 2);
  ok(await realm.command(guest, 'groupStartReady', { ready: true, classId, selectionRevision: realm.groupStart.selectionRevision }));
  ok(await realm.command(owner, 'startGroupVoyage'));
  return { realm, owner, guest, vessel: realm.vessels.get(owner.ownedVesselId), room };
}
async function take(realm, captain, role) {
  if (role === 'passenger') return ok(await realm.command(captain, 'takeStation', { role }));
  const stationRole = ['weapons', 'security'].includes(role) ? 'security' : ['navigation', 'scanner'].includes(role) ? 'navigation' : role;
  const station = realm._surface(captain).entities.find(entity => entity.data?.stationRole === stationRole);
  assert.ok(station, `The actual ${stationRole} station exists.`);
  Object.assign(captain.game.state.person, { x: station.x, y: station.y });
  return ok(await realm.command(captain, 'takeStation', { role, entityId: station.id }));
}
async function lateArrival(realm, owner, name) {
  const captain = (await realm.createCaptain(name)).captain;
  ok(realm.attach(captain, { close() {} }));
  const ship = realm.vessels.get(captain.ownedVesselId), port = realm._room('hearth').runtime.bodies.find(body => body.id === 'kettle');
  Object.assign(ship.ship, { x: port.x, y: port.y + port.radius + 75, vx: 0, vy: 0 });
  ok(await realm.command(captain, 'dock', { id: 'kettle' }));
  ok(await realm.command(owner, 'setCrewAccess', { captainId: captain.id, allowed: true }));
  return captain;
}

test('two friends launch with the host’s compact reserve and keep their personal ship manifests', async () => {
  const { realm, owner, guest, vessel } = await launch();
  const ownGuest = realm.vessels.get(guest.ownedVesselId);
  assert.equal(vessel.ship.classId, 'lamprey'); assert.equal(vessel.ship.warpRange, 5);
  assert.equal(vessel.ship.casualCrew.requestedCount, 1_000_000);
  assert.equal(ownGuest.ship.casualCrew.requestedCount, 73);
  assert.notEqual(vessel.ship.casualCrew.id, ownGuest.ship.casualCrew.id, 'Distinct physical ships receive distinct departure companies in the same galaxy.');
  const hostCrewIds = new Set(vessel.ship.casualCrew.records.map(member => member.id));
  assert.ok(ownGuest.ship.casualCrew.records.every(member => !hostCrewIds.has(member.id)), 'The host and guest never share an NPC identity.');
  assert.equal(ownGuest.dockedAt, 'kettle'); assert.notEqual(ownGuest.id, vessel.id);
  assert.equal(owner.game.state.credits, 180); assert.equal(guest.game.state.credits, 180);
  const active = realm._crewFor(vessel).filter(isCasualCrew), status = realm._publicVessel(vessel, owner);
  assert.equal(active.length, 4); assert.equal(status.casualCrew.activeCount, 4);
  assert.equal(status.casualCrew.reserveCount, 999_996);
  assert.equal(status.occupiedBerths, 6); assert.equal(status.availableBerths, 4, 'NPCs offer their places to arriving people.');
  assert.ok(vessel.ship.casualCrew.records.length <= 24, 'A million reserves do not allocate a million actors.');
  const guestView = realm.snapshotFor(guest);
  assert.equal(guestView.state.ship.casualCrew.requestedCount, 1_000_000);
  assert.deepEqual(guestView.state.crew.map(member => member.id), active.map(member => member.id));
  assert.ok(JSON.stringify(guestView.state.ship.casualCrew).length < 20_000);
});

test('a forged Solo starting context cannot turn NPCs into connected captains or unlock a shared departure hull', async () => {
  const realm = new Realm({ id: 'SOLOFAKE', seed: 'shared-start-context', persistence: storage(), settings: { startTogether: true } });
  const { captain } = await realm.createCaptain('One real captain', { startMode: 'casual', startContext: 'solo', starterShip: 'osprey', casualCrewCount: 8 });
  ok(realm.attach(captain, { close() {} }));
  const vessel = realm.vessels.get(captain.ownedVesselId), lobby = realm._groupStartView(captain);
  assert.equal(vessel.ship.classId, 'sparrow'); assert.deepEqual(captain.game.state.fleet.owned, ['sparrow']);
  assert.equal(vessel.ship.casualCrew.requestedCount, 8);
  assert.equal(captain.game.casualCrewStatus().activeCount, 1); assert.equal(captain.game.casualCrewStatus().reserveCount, 7);
  assert.equal(lobby.onlineCount, 1); assert.equal(lobby.roster.length, 1);
  assert.deepEqual(lobby.choices.filter(hull => hull.eligible).map(hull => hull.id), ['sparrow', 'kestrel', 'mule']);
  assert.equal(lobby.choices.find(hull => hull.id === 'osprey').eligible, false);
  const requested = await realm.command(captain, 'chooseGroupShip', { classId: 'osprey', startContext: 'solo', casualCrewCount: 8, connectedCount: 9 });
  assert.equal(requested.ok, false); assert.equal(realm.groupStart.selectedClassId, 'sparrow');
  assert.equal(vessel.ship.classId, 'sparrow'); assert.equal(captain.game.state.credits, 180);
});

test('late human arrivals replace NPC duty berths up to the real hull capacity', async () => {
  const { realm, owner, vessel } = await launch();
  for (let index = 0; index < 4; index++) {
    const captain = await lateArrival(realm, owner, `Late ${index + 1}`);
    assert.equal(realm._hasBerth(captain, vessel), true);
    ok(await realm.command(captain, 'boardShip', { vesselId: vessel.id }));
    assert.equal(realm._crewFor(vessel).filter(isCasualCrew).length, 3 - index);
    assert.equal(realm._berthsUsed(vessel), 6);
  }
  const overflow = await lateArrival(realm, owner, 'One too many humans');
  assert.equal((await realm.command(overflow, 'boardShip', { vesselId: vessel.id })).code, 'capacity');
  assert.equal(overflow.aboard, null); assert.equal(realm._publicVessel(vessel, owner).availableBerths, 0);
  assert.equal(vessel.ship.casualCrew.requestedCount, 1_000_000);
});

test('NPC specialists yield only to successful authorized human station choices and retain their wounds', async () => {
  const { realm, owner, guest, vessel } = await launch();
  const engineer = realm._crewFor(vessel).find(member => member.role === 'engineer');
  assert.ok(engineer); engineer.health = 41; engineer.status = 'injured';
  const ownGuest = copy(realm.vessels.get(guest.ownedVesselId).ship.casualCrew);
  for (const [humanRole, npcRole] of [['engineering', 'engineer'], ['weapons', 'gunner'], ['medical', 'medic'], ['navigation', 'navigator'], ['scanner', 'scientist'], ['security', 'security']]) {
    await take(realm, guest, humanRole);
    assert.equal(realm._crewFor(vessel).some(member => isCasualCrew(member) && member.role === npcRole), false, humanRole);
    assert.equal(guest.crewRole, humanRole);
    assert.deepEqual(realm.vessels.get(guest.ownedVesselId).ship.casualCrew, ownGuest, 'Working aboard a friend’s ship never rewrites the personal reserve.');
  }
  await take(realm, guest, 'engineering');
  const station = realm._surface(owner).entities.find(entity => entity.data?.stationRole === 'engineering');
  Object.assign(owner.game.state.person, { x: station.x, y: station.y });
  assert.equal((await realm.command(owner, 'takeStation', { role: 'engineering', entityId: station.id })).code, 'station-occupied');
  assert.equal(guest.crewRole, 'engineering', 'A real person is never displaced by a replacement watch.');
  await take(realm, guest, 'passenger');
  const returned = realm._crewFor(vessel).find(member => member.id === engineer.id);
  assert.ok(returned); assert.equal(returned.health, 41, 'Going off duty does not heal the NPC.');
});

test('disconnect grace reserves the chosen human station; reconnect and persisted passports preserve the roster', async () => {
  const { realm, owner, guest, vessel } = await launch();
  await take(realm, guest, 'engineering');
  realm.detach(guest, guest.session);
  realm._syncCasualCrew(vessel);
  assert.equal(realm._crewFor(vessel).some(member => isCasualCrew(member) && member.role === 'engineer'), false);
  const restored = new Realm({ id: realm.id, snapshot: copy(realm.document()), persistence: storage() });
  const returnedOwner = restored.captains.get(owner.id), returnedGuest = restored.captains.get(guest.id), physical = restored.vessels.get(vessel.id);
  ok(restored.attach(returnedOwner, { close() {} })); ok(restored.attach(returnedGuest, { close() {} }));
  assert.equal(returnedGuest.aboard, physical.id); assert.equal(returnedGuest.crewRole, 'engineering');
  assert.equal(physical.ship.casualCrew.requestedCount, 1_000_000);
  assert.equal(restored._crewFor(physical).some(member => isCasualCrew(member) && member.role === 'engineer'), false);
  restored.detach(returnedGuest, returnedGuest.session); returnedGuest.disconnectUntil = Date.now() - 1;
  restored.step(.1, restored.tick + 1, Date.now(), Date.now());
  restored._syncCasualCrew(physical);
  assert.equal(returnedGuest.crewRole, 'passenger');
  assert.ok(restored._crewFor(physical).some(member => isCasualCrew(member) && member.role === 'engineer'));
  ok(restored.attach(returnedGuest, { close() {} })); await take(restored, returnedGuest, 'engineering');
  assert.equal(restored._crewFor(physical).some(member => isCasualCrew(member) && member.role === 'engineer'), false);
});

test('leaving the vessel reopens a duty place without losing reserve identities or charging the captain', async () => {
  const { realm, owner, guest, vessel } = await launch();
  const before = realm._crewFor(vessel).filter(isCasualCrew).map(member => member.id), credits = owner.game.state.credits;
  Object.assign(guest.game.state.person, cabinLayout(vessel.ship.classId).spawn);
  ok(await realm.command(guest, 'disembark'));
  assert.equal(realm._crewFor(vessel).filter(isCasualCrew).length, 5);
  ok(await realm.command(guest, 'boardShip', { vesselId: vessel.id }));
  assert.deepEqual(realm._crewFor(vessel).filter(isCasualCrew).map(member => member.id), before);
  assert.equal(owner.game.state.credits, credits);
});

test('HTTP creation and join carry the count once; resume cannot replace a roster and other modes ignore it', async t => {
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence: storage() });
  t.after(() => server.close());
  async function request(body) {
    const response = await fetch(`${server.url}/api/realms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ worldContentVersion: WORLD_CONTENT_VERSION, ...body }) });
    assert.equal(response.status, 200); return ok(await response.json());
  }
  const created = await request({ action: 'create', name: 'HTTP host', startMode: 'casual', casualCrewCount: 5000 });
  const realm = server.manager.realms.get(created.passport.realmCode), host = realm.captains.get(created.passport.captainId);
  assert.equal(host.game.state.ship.casualCrew.requestedCount, 5000);
  const joined = await request({ action: 'join', realmCode: realm.id, name: 'HTTP guest', startMode: 'casual', casualCrewCount: 71 });
  assert.equal(realm.captains.get(joined.passport.captainId).game.state.ship.casualCrew.requestedCount, 71);
  await request({ action: 'resume', passport: created.passport, startMode: 'casual', casualCrewCount: 999999 });
  assert.equal(host.game.state.ship.casualCrew.requestedCount, 5000);
  for (const startMode of ['regular', 'hardcore']) {
    const result = await request({ action: 'join', realmCode: realm.id, name: startMode, startMode, casualCrewCount: 5000 });
    const captain = realm.captains.get(result.passport.captainId);
    assert.equal(captain.game.state.crew.some(isCasualCrew), false);
    assert.ok(!captain.game.state.ship.casualCrew || captain.game.state.ship.casualCrew.requestedCount === 0);
  }
});
