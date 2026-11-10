import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout } from '../../dist/fleet.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const persistence = () => ({ kind: 'memory', async save(_id, version) { return { version: version + 1 }; } });
const pose = ship => Object.fromEntries(['id', 'x', 'y', 'vx', 'vy', 'angle', 'hull', 'shield', 'fuel'].map(key => [key, ship[key]]));

async function dock(realm, captain, bodyId) {
  const vessel = realm.vessels.get(captain.aboard), body = realm._room(vessel.systemId).runtime.bodies.find(body => body.id === bodyId);
  Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  ok(await realm.command(captain, 'dock', { id: bodyId }));
}
function approach(realm, captain, predicate) {
  const entity = realm._surface(captain).entities.find(predicate); assert.ok(entity);
  Object.assign(captain.game.state.person, { x: entity.x, y: entity.y }); return entity;
}
async function fixture({ startMode = 'regular', roles = ['helm'] } = {}) {
  const realm = new Realm({ id: 'PORTRETURN', seed: 'shared-port-return', persistence: persistence() });
  const owner = (await realm.createCaptain('Owner')).captain, guest = (await realm.createCaptain('Visiting captain', { startMode })).captain;
  for (const captain of [owner, guest]) ok(realm.attach(captain, { close() {} }));
  const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = [];
  const vessel = realm.vessels.get(owner.ownedVesselId), original = realm.vessels.get(guest.ownedVesselId);
  await dock(realm, owner, 'morrow'); if (original) await dock(realm, guest, 'morrow');
  ok(await realm.command(owner, 'setCrewAccess', { captainId: guest.id, allowed: true, roles }));
  return { realm, owner, guest, vessel, original, room };
}
async function sharedVoyage(options) {
  const f = await fixture(options), { realm, owner, guest, vessel } = f;
  for (const captain of [owner, guest]) ok(await realm.command(captain, 'boardShip', { vesselId: vessel.id }));
  const pilot = options?.roles?.includes('helm') === false ? owner : guest;
  ok(await realm.command(pilot, 'quickHelm')); await dock(realm, pilot, 'kettle');
  const remaining = pilot === owner ? guest : owner;
  return { ...f, pilot, remaining };
}

test('both captains reboard the same borrowed hull after docking, in either order or together', async () => {
  for (const startMode of ['regular', 'hardcore']) for (const order of ['owner-first', 'guest-first', 'together']) {
    const { realm, owner, guest, vessel, original, remaining } = await sharedVoyage({ startMode });
    const originalPose = original && pose(original.ship);
    ok(await realm.command(remaining, 'leaveCrew'));
    for (const captain of [owner, guest]) { assert.equal(captain.aboard, null); assert.equal(captain.portVesselId, vessel.id); assert.equal(captain.game.state.locationId, 'kettle'); }
    const before = pose(vessel.ship), boarding = order === 'guest-first' ? [guest, owner] : [owner, guest];
    if (order === 'together') for (const result of await Promise.all(boarding.map(c => realm.command(c, 'boardShip', { vesselId: vessel.id })))) ok(result);
    else for (const captain of boarding) { ok(await realm.command(captain, 'boardShip', { vesselId: vessel.id })); assert.equal(vessel.dockedAt, 'kettle'); assert.equal(vessel.helmOwner, null); }
    assert.deepEqual(pose(vessel.ship), before); assert.equal(realm._publicVessel(vessel, owner).occupiedBerths, 2);
    assert.equal(realm._publicVessel(vessel, guest).availableBerths, 0);
    ok(await realm.command(guest, 'quickHelm'));
    assert.equal(vessel.helmOwner, guest.id); assert.equal(vessel.dockedAt, null);
    assert.equal(owner.aboard, vessel.id); assert.equal(guest.aboard, vessel.id); assert.equal(owner.game.state.mode, 'person');
    assert.equal(guest.ownedVesselId, original?.id || null); if (original) assert.deepEqual(pose(original.ship), originalPose);
    assert.notEqual(realm.failed, true);
  }
});

test('a crewmate who stays aboard keeps their berth while the docking pilot returns from port', async () => {
  const { realm, owner, guest, vessel } = await sharedVoyage();
  assert.equal(owner.aboard, vessel.id); assert.equal(guest.aboard, null);
  ok(await realm.command(guest, 'boardShip', { vesselId: vessel.id }));
  assert.equal(vessel.dockedAt, 'kettle'); assert.equal(realm._publicVessel(vessel, owner).occupiedBerths, 2);
  ok(await realm.command(guest, 'quickHelm')); assert.equal(owner.aboard, vessel.id);
});

test('boarding-only guests retain the arriving vessel across disembarkation and authority restoration', async () => {
  const { realm, owner, guest, vessel, remaining } = await sharedVoyage({ startMode: 'hardcore', roles: [] });
  ok(await realm.command(remaining, 'leaveCrew')); assert.equal(guest.portVesselId, vessel.id);
  const saved = realm.document(), restored = new Realm({ id: realm.id, snapshot: saved, persistence: persistence() });
  const returnedOwner = restored.captains.get(owner.id), returnedGuest = restored.captains.get(guest.id);
  for (const captain of [returnedOwner, returnedGuest]) ok(restored.attach(captain, { close() {} }));
  assert.equal(restored.snapshotFor(returnedGuest).state.multiplayer.portVesselId, vessel.id);
  assert.equal(restored._publicVessel(restored.vessels.get(vessel.id), returnedGuest).canPilot, false);
  ok(await restored.command(returnedGuest, 'boardShip', { vesselId: vessel.id }));
  assert.equal((await restored.command(returnedGuest, 'quickHelm')).code, 'permission');
  ok(await restored.command(returnedOwner, 'boardShip', { vesselId: vessel.id }));
  ok(await restored.command(returnedOwner, 'quickHelm'));
  assert.equal(returnedGuest.aboard, vessel.id); assert.equal(returnedGuest.ownedVesselId, null);
});

test('every departure path names online crew ashore and leaves state unchanged until departure is explicit', async () => {
  for (const command of ['quickHelm', 'takeStation', 'launch', 'quickLaunch']) {
    const { realm, owner, guest, vessel, remaining } = await sharedVoyage();
    ok(await realm.command(remaining, 'leaveCrew'));
    const args = command === 'takeStation' ? { role: 'helm' } : {};
    if (command !== 'quickLaunch') ok(await realm.command(guest, 'boardShip', { vesselId: vessel.id }));
    if (command === 'takeStation') args.entityId = approach(realm, guest, entity => entity.data?.stationRole === 'helm').id;
    const before = { person: structuredClone(guest.game.state.person), ship: pose(vessel.ship), mode: guest.game.state.mode, role: guest.crewRole, aboard: guest.aboard };
    const refused = await realm.command(guest, command, args);
    assert.equal(refused.code, 'crew-ashore', command); assert.deepEqual(refused.crewAshore, [{ captainId: owner.id, name: owner.name }]); assert.equal(refused.vesselId, vessel.id);
    assert.equal(vessel.helmOwner, null); assert.equal(vessel.dockedAt, 'kettle'); assert.equal(guest.crewRole, before.role); assert.equal(guest.aboard, before.aboard);
    assert.equal(guest.game.state.mode, before.mode); assert.deepEqual(guest.game.state.person, before.person); assert.deepEqual(pose(vessel.ship), before.ship);
    ok(await realm.command(guest, command, { ...args, leaveCrewBehind: true }));
    assert.equal(vessel.helmOwner, guest.id); assert.equal(guest.aboard, vessel.id); assert.equal(vessel.dockedAt, null);
    assert.equal(owner.aboard, null); assert.equal(owner.game.state.locationId, 'kettle');
  }
});

test('offline crew and people elsewhere never hold up a departure', async () => {
  for (const situation of ['offline', 'other-port']) {
    const { realm, owner, guest, vessel, remaining } = await sharedVoyage(); ok(await realm.command(remaining, 'leaveCrew'));
    if (situation === 'offline') { owner.session = null; owner.disconnectUntil = Date.now() + 30_000; }
    else ok(await realm.command(owner, 'takePassengerTransit', { bodyId: 'morrow' }));
    ok(await realm.command(guest, 'boardShip', { vesselId: vessel.id })); assert.deepEqual(realm._publicVessel(vessel, guest).crewAshore, []);
    ok(await realm.command(guest, 'quickHelm')); assert.equal(owner.aboard, null);
  }
});

test('withdrawing only helm access releases flight control but preserves the guest aboard the same deck', async () => {
  const { realm, owner, guest, vessel } = await fixture();
  for (const captain of [owner, guest]) ok(await realm.command(captain, 'boardShip', { vesselId: vessel.id }));
  ok(await realm.command(guest, 'quickHelm')); realm.acceptInput(guest, 1, { thrust: 1, fire: true });
  const before = pose(vessel.ship), helm = cabinLayout(vessel.ship.classId).stations.helm;
  ok(await realm.command(owner, 'setCrewAccess', { captainId: guest.id, allowed: true, roles: ['medical'] }));
  assert.equal(vessel.helmOwner, null); assert.equal(guest.game.state.mode, 'person'); assert.equal(guest.crewRole, 'passenger'); assert.equal(guest.aboard, vessel.id);
  assert.equal(realm._canBoard(guest, vessel), true); assert.equal(realm._canRole(guest, vessel, 'helm'), false); assert.equal(guest.input.thrust, 0); assert.equal(guest.input.fire, false);
  assert.deepEqual({ x: guest.game.state.person.x, y: guest.game.state.person.y }, { x: helm.x, y: helm.y }); assert.deepEqual(pose(vessel.ship), before);
  ok(await realm.command(owner, 'quickHelm')); assert.equal(vessel.helmOwner, owner.id);
});

test('revoked boarding cannot keep a stale port shortcut or bypass the invitation', async () => {
  const { realm, owner, guest, vessel, remaining } = await sharedVoyage(); ok(await realm.command(remaining, 'leaveCrew'));
  ok(await realm.command(owner, 'setCrewAccess', { captainId: guest.id, allowed: false }));
  assert.equal(guest.portVesselId, null); assert.equal((await realm.command(guest, 'boardShip', { vesselId: vessel.id })).code, 'permission');
  assert.deepEqual(realm._publicVessel(vessel, owner).crewAshore, [{ captainId: owner.id, name: owner.name }]);
});

test('public free berths include hired crew and a direct port launch cannot overfill the hull', async () => {
  const { realm, owner, guest, vessel } = await fixture();
  owner.game.state.crew.push({ id: 'hired-worker', name: 'Ira', role: 'engineer', health: 100 });
  assert.equal(realm._publicVessel(vessel, owner).availableBerths, 1);
  ok(await realm.command(guest, 'boardShip', { vesselId: vessel.id }));
  const status = realm._publicVessel(vessel, owner); assert.equal(status.occupants, 1); assert.equal(status.occupiedBerths, 2); assert.equal(status.availableBerths, 0);
  assert.equal((await realm.command(owner, 'boardShip', { vesselId: vessel.id })).code, 'capacity');
  assert.equal((await realm.command(owner, 'quickLaunch', { leaveCrewBehind: true })).code, 'capacity');
  assert.equal(vessel.dockedAt, 'morrow'); assert.equal(vessel.helmOwner, null); assert.equal(owner.aboard, null);
});

test('the actual helmsman remains a still, visible person on their own deck in full and motion snapshots', async () => {
  const { realm, owner, guest, vessel } = await fixture();
  for (const captain of [owner, guest]) ok(await realm.command(captain, 'boardShip', { vesselId: vessel.id }));
  Object.assign(guest.game.state.person, { weaponDrawn: true, aimManual: true, vx: 90, vy: 30, lastShot: { x: 2, y: 3 }, attackUntil: 100 });
  ok(await realm.command(guest, 'quickHelm')); const helm = cabinLayout(vessel.ship.classId).stations.helm;
  for (const compact of [false, true]) {
    const packet = realm.snapshotFor(owner, { compact, drainEvents: false }), pilot = packet.players.find(player => player.captainId === guest.id);
    assert.ok(pilot); assert.equal(pilot.mode, 'person'); assert.equal(pilot.perspective, 'ship'); assert.equal(pilot.station, 'helm'); assert.equal(pilot.roomId, packet.room.id); assert.equal(pilot.vesselId, vessel.id);
    assert.equal(pilot.x, helm.x); assert.equal(pilot.y, helm.y); assert.equal(pilot.vx, 0); assert.equal(pilot.vy, 0); assert.equal(pilot.weaponDrawn, false); assert.equal(pilot.lastShot, null);
    assert.deepEqual(pilot.appearance, guest.game.state.person.appearance);
  }
  const presence = realm.snapshotFor(owner).presence.find(person => person.captainId === guest.id); assert.equal(presence.mode, 'ship'); assert.match(presence.roomId, /:system:/);
  assert.equal(guest.game.state.person.x, helm.x); assert.equal(guest.game.state.person.y, helm.y); assert.ok(realm._actor(vessel)._damageHumans.includes(guest.game));
  const observer = (await realm.createCaptain('Elsewhere')).captain; ok(realm.attach(observer, { close() {} })); await dock(realm, observer, 'morrow');
  assert.ok(!realm.snapshotFor(observer).players.some(player => player.captainId === guest.id));
  guest.game.state.person.down = true;
  for (const health of [20, 0]) {
    guest.game.state.person.health = health;
    const injured = realm.snapshotFor(owner).players.find(player => player.captainId === guest.id);
    assert.ok(injured, 'A casualty remains physically aboard until recovery actually moves them.');
    assert.equal(injured.down, true); assert.equal(injured.health, health); assert.equal(injured.x, helm.x); assert.equal(injured.y, helm.y);
  }
  realm._recoverCaptain(guest, 'Test emergency recovery.');
  assert.notEqual(guest.aboard, vessel.id); assert.equal(vessel.helmOwner, null);
  assert.ok(!realm.snapshotFor(owner).players.some(player => player.captainId === guest.id), 'Recovery removes the person from the previous physical deck.');
});

test('a captain who launches directly from a port has a real helm pose for subsequent interior damage', async () => {
  const { realm, owner, vessel } = await fixture();
  approach(realm, owner, entity => entity.type === 'exit'); ok(await realm.command(owner, 'launch'));
  const helm = cabinLayout(vessel.ship.classId).stations.helm;
  assert.deepEqual({ x: owner.game.state.person.x, y: owner.game.state.person.y }, { x: helm.x, y: helm.y });
  assert.equal(owner.game.state.person.weaponDrawn, false); assert.equal(vessel.helmOwner, owner.id);
});
