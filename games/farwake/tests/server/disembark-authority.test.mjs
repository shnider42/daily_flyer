import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout } from '../../dist/fleet.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const storage = () => ({ kind: 'memory', async save(_id, version) { return { version: version + 1 }; } });
const pose = vessel => ({ id: vessel.id, systemId: vessel.systemId, dockedAt: vessel.dockedAt, ship: structuredClone(vessel.ship) });
function airlock(captain, vessel) { Object.assign(captain.game.state.person, cabinLayout(vessel.ship.classId).spawn); }
async function dock(realm, captain, bodyId) {
  const vessel = realm.vessels.get(captain.aboard), body = realm._room(vessel.systemId).runtime.bodies.find(body => body.id === bodyId);
  Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  ok(await realm.command(captain, 'dock', { id: bodyId })); return body;
}
async function spaceVisit({ revoke = false } = {}) {
  const realm = new Realm({ id: 'AIRLOCK', seed: 'physical-docked-airlock', persistence: storage() });
  const owner = (await realm.createCaptain('Pilot')).captain, guest = (await realm.createCaptain('Passenger')).captain;
  for (const captain of [owner, guest]) ok(realm.attach(captain, { close() {} }));
  const room = realm._room('hearth'); for (const field of ['enemies', 'bullets', 'pickups', 'signals']) room.runtime[field] = [];
  const carrier = realm.vessels.get(owner.ownedVesselId), personal = realm.vessels.get(guest.ownedVesselId);
  Object.assign(carrier.ship, { x: 6000, y: 400, vx: 0, vy: 0 }); Object.assign(personal.ship, { x: 6100, y: 400, vx: 0, vy: 0 });
  ok(await realm.command(owner, 'setCrewAccess', { captainId: guest.id, allowed: true, roles: [] }));
  ok(await realm.command(guest, 'boardShip', { vesselId: carrier.id }));
  assert.equal(guest.returnVesselId, personal.id, 'boarding a friend in space keeps the real source tether');
  assert.equal(realm._canRole(guest, carrier, 'helm'), false);
  if (revoke) ok(await realm.command(owner, 'setCrewAccess', { captainId: guest.id, allowed: false }));
  return { realm, owner, guest, carrier, personal };
}

test('a passenger who boarded in space can use the docked airlock without a helm grant or a surviving return tether', async () => {
  for (const bodyId of ['kettle', 'morrow']) {
    const { realm, owner, guest, carrier, personal } = await spaceVisit(), before = pose(personal);
    const body = await dock(realm, owner, bodyId); assert.equal(guest.aboard, carrier.id);
    assert.equal(realm._canReturn(guest), false, 'the origin hull is now far from the arriving carrier');
    assert.ok(guest.events.some(event => event.type === 'crew' && event.dockedAt === bodyId && /entry airlock/.test(event.text)));
    for (const compact of [false, true]) {
      const state = realm.snapshotFor(guest, { compact, drainEvents: false }).state;
      for (const view of [state.multiplayer, state.interior.location]) {
        assert.equal(view.dockedAt, bodyId); assert.equal(view.dockedName, body.name); assert.equal(view.dockedKind, body.kind);
      }
    }
    airlock(guest, carrier);
    const result = ok(await realm.command(guest, 'disembark', { vesselId: personal.id, bodyId: 'earth', systemId: 'sol' }, 'leave-current-carrier'));
    assert.equal(result.bodyId, bodyId); assert.equal(result.vesselId, carrier.id);
    assert.equal(guest.aboard, null); assert.equal(guest.portVesselId, carrier.id); assert.equal(guest.returnVesselId, null);
    assert.equal(guest.game.state.locationId, bodyId); assert.equal(guest.game.state.mode, 'person'); assert.equal(guest.game.state.interior, null);
    assert.equal(guest.ownedVesselId, personal.id); assert.deepEqual(pose(personal), before);
    assert.deepEqual(ok(await realm.command(guest, 'disembark', {}, 'leave-current-carrier')), result, 'acknowledgement replay cannot repeat settlement or change destination');
    ok(await realm.command(guest, 'boardShip', { vesselId: carrier.id }));
    assert.equal(guest.aboard, carrier.id); assert.equal((await realm.command(guest, 'quickHelm')).code, 'permission');
    assert.equal(carrier.dockedAt, bodyId); assert.deepEqual(pose(personal), before);
  }
});

test('all docked exit aliases defeat stale hostile-interior, tether, lobby and encounter gates at the physical airlock', async () => {
  for (const command of ['exitCabin', 'leaveInterior', 'leaveCrew', 'returnToOwnShip', 'retreatBoarding', 'surfaceAction']) {
    const { realm, owner, guest, carrier, personal } = await spaceVisit(); await dock(realm, owner, 'kettle'); airlock(guest, carrier);
    guest.returnVesselId = 'missing-former-tether'; guest.game.state.interior.kind = 'enemy'; guest.boardingTeam = guest.id;
    guest.game.state.pendingEncounter = { id: 'stale-open-channel', options: [] };
    carrier.npcHostile = true; carrier.captured = false;
    carrier.boarding = { id: 'unfinished-deck', kind: 'defense', phase: 'active', enemies: [{ id: 'living-boarder', health: 100 }], allies: [] };
    guest.game.state.boarding = carrier.boarding;
    realm.groupStart = { status: 'assembling', selectedClassId: 'sparrow', selectionRevision: 3, participants: [] }; guest.launchStatus = 'waiting'; guest.launchReady = false;
    const lobby = structuredClone(realm.groupStart), hull = pose(personal), credits = guest.game.state.credits, jobs = guest.game.state.stats.jobs;
    const args = command === 'surfaceAction' ? { entityId: `ship:${carrier.id}:entry-airlock`, action: 'leave' } : {};
    ok(await realm.command(guest, command, args));
    assert.equal(guest.aboard, null, command); assert.equal(guest.game.state.locationId, 'kettle'); assert.equal(guest.portVesselId, carrier.id);
    assert.equal(guest.returnVesselId, null); assert.equal(guest.boardingTeam, null); assert.equal(guest.game.state.boarding, null);
    assert.deepEqual(realm.groupStart, lobby); assert.equal(guest.launchStatus, 'waiting'); assert.equal(guest.launchReady, false);
    assert.equal(carrier.boarding.phase, 'active'); assert.equal(carrier.boarding.enemies[0].health, 100);
    assert.equal(guest.game.state.credits, credits); assert.equal(guest.game.state.stats.jobs, jobs); assert.deepEqual(pose(personal), hull);
  }
});

test('disembarkation requires the conscious captain at the real airlock and a current valid dock', async () => {
  const { realm, owner, guest, carrier } = await spaceVisit(); airlock(guest, carrier);
  assert.equal((await realm.command(guest, 'disembark', { dockedAt: 'kettle', bodyId: 'kettle' })).code, 'location');
  await dock(realm, owner, 'kettle');
  Object.assign(guest.game.state.person, cabinLayout(carrier.ship.classId).stations.helm);
  assert.equal((await realm.command(guest, 'disembark', { entityId: `ship:${carrier.id}:entry-airlock` })).code, 'distance');
  assert.equal(guest.aboard, carrier.id); airlock(guest, carrier);
  for (const injury of [{ health: 0, down: false }, { health: 100, down: true }]) {
    Object.assign(guest.game.state.person, injury); assert.equal((await realm.command(guest, 'disembark')).code, 'incapacitated'); assert.equal(guest.aboard, carrier.id);
  }
  Object.assign(guest.game.state.person, { health: 100, down: false }); carrier.dockedAt = 'not-a-real-port';
  assert.equal((await realm.command(guest, 'disembark', { bodyId: 'kettle' })).code, 'location'); assert.equal(guest.aboard, carrier.id);
  carrier.dockedAt = 'kettle'; guest.game.state.mode = 'ship';
  assert.equal((await realm.command(guest, 'disembark')).code, 'mode'); guest.game.state.mode = 'person';
  ok(await realm.command(guest, 'disembark')); assert.equal(guest.game.state.locationId, 'kettle');
  assert.equal((await realm.command(guest, 'disembark')).code, 'mode', 'ashore captains cannot use a remembered hull as a teleport');
});

test('revoked boarding and faction clearance cannot prevent leaving, but remembering the carrier grants no new access or private inventory', async () => {
  const { realm, owner, guest, carrier, personal } = await spaceVisit({ revoke: true });
  const room = realm._room('brindle'), body = room.runtime.bodies.find(body => body.id === 'common-watch'); assert.ok(body);
  carrier.systemId = 'brindle'; carrier.dockedAt = body.id; Object.assign(carrier.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  realm._bindCaptain(guest); assert.equal(guest.game.portAccess(body).ok, false);
  owner.game.state.cargo = { ore: 24, crystal: 9 }; guest.game.state.cargo = { ore: 2, crystal: 1 };
  const personalPose = pose(personal), credits = guest.game.state.credits; airlock(guest, carrier);
  ok(await realm.command(guest, 'disembark'));
  assert.equal(guest.game.state.systemId, 'brindle'); assert.equal(guest.game.state.locationId, body.id); assert.equal(guest.portVesselId, carrier.id);
  assert.equal((await realm.command(guest, 'boardShip', { vesselId: carrier.id })).code, 'permission');
  assert.equal((await realm.command(guest, 'quickLaunch')).code, 'permission');
  for (const compact of [false, true]) {
    const state = realm.snapshotFor(guest, { compact, drainEvents: false }).state;
    assert.equal(state.ship.id, personal.id); assert.deepEqual(state.cargo, { ore: 2, crystal: 1 }); assert.equal(state.multiplayer.portVesselId, carrier.id);
  }
  assert.equal(guest.game.state.credits, credits); assert.deepEqual(pose(personal), personalPose);
});

test('live arrivals and a restart retain the current dock and the same friend’s reboarding reference through a second port', async () => {
  const f = await spaceVisit(), { realm, owner, guest, carrier, personal } = f, original = pose(personal);
  const underway = realm.snapshotFor(guest).state; assert.equal(underway.multiplayer.dockedAt, null); assert.equal(underway.interior.location.dockedAt, null);
  await dock(realm, owner, 'kettle'); airlock(guest, carrier); ok(await realm.command(guest, 'disembark'));
  for (const captain of [owner, guest]) ok(await realm.command(captain, 'boardShip', { vesselId: carrier.id }));
  ok(await realm.command(owner, 'quickHelm'));
  const departed = realm.snapshotFor(guest, { compact: true }).state; assert.equal(departed.multiplayer.dockedAt, null); assert.equal(departed.interior.location.dockedAt, null);
  await dock(realm, owner, 'morrow');
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence: storage() }), resumed = restored.captains.get(guest.id), vessel = restored.vessels.get(carrier.id);
  ok(restored.attach(resumed, { close() {} }));
  for (const compact of [false, true]) {
    const state = restored.snapshotFor(resumed, { compact }).state;
    assert.equal(state.multiplayer.dockedAt, 'morrow'); assert.equal(state.interior.location.dockedAt, 'morrow');
  }
  airlock(resumed, vessel); ok(await restored.command(resumed, 'exitCabin'));
  assert.equal(resumed.game.state.locationId, 'morrow'); assert.equal(resumed.portVesselId, carrier.id); assert.deepEqual(pose(restored.vessels.get(personal.id)), original);
  ok(await restored.command(resumed, 'boardShip', { vesselId: carrier.id })); assert.equal(resumed.aboard, carrier.id);
  assert.equal((await restored.command(resumed, 'quickHelm')).code, 'permission');
});

test('leaving an employer at its actual dock closes the watch once and leaves the employee’s personal vessel alone', async () => {
  for (const startMode of ['regular', 'hardcore']) {
    const realm = new Realm({ id: 'EMPLOYEXIT', seed: 'physical-employer-airlock', persistence: storage() });
    const captain = (await realm.createCaptain('Employee', { startMode })).captain; ok(realm.attach(captain, { close() {} }));
    const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = [];
    if (startMode === 'regular') await dock(realm, captain, 'morrow');
    const owned = realm.vessels.get(captain.ownedVesselId), before = owned && pose(owned), credits = captain.game.state.credits, jobs = captain.game.state.stats.jobs;
    ok(await realm.command(captain, 'acceptNpcContract', { roleId: 'medic' }));
    const contract = captain.game.state.npcContract, employer = realm.vessels.get(contract.vesselId); airlock(captain, employer);
    const result = ok(await realm.command(captain, 'disembark', {}, 'end-unstarted-watch'));
    assert.equal(result.wages, 0); assert.equal(captain.game.state.npcContract, null); assert.equal(captain.game.state.locationId, 'morrow'); assert.equal(captain.portVesselId, owned?.id || null);
    assert.equal(realm.vessels.has(employer.id), false, 'a completed empty employer departs rather than accumulating inaccessible hulls');
    assert.equal(captain.game.state.credits, credits); assert.equal(captain.game.state.stats.jobs, jobs); assert.equal(captain.game.state.npcContractHistory.filter(entry => entry.id === contract.id).length, 1);
    assert.equal(captain.ownedVesselId, owned?.id || null); if (owned) assert.deepEqual(pose(owned), before);
    ok(await realm.command(captain, 'disembark', {}, 'end-unstarted-watch')); assert.equal(captain.game.state.credits, credits);
    assert.equal((await realm.command(captain, 'completeNpcContract')).ok, false); assert.equal((await realm.command(captain, 'boardShip', { vesselId: employer.id })).ok, false);
    realm.step(.1, realm.tick + 1, Date.now()); assert.equal(captain.aboard, null); assert.equal(captain.game.state.locationId, 'morrow');
    assert.equal(employer.dockedAt, 'morrow'); if (owned) assert.deepEqual(pose(owned), before);
  }
});

test('a destination-port exit pays only recorded partial work and never returns the employee or personal hull to the hiring port', async () => {
  const realm = new Realm({ id: 'PARTIALEXIT', seed: 'actual-destination-watch', persistence: storage() });
  const captain = (await realm.createCaptain('Returning employee')).captain; ok(realm.attach(captain, { close() {} }));
  const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = [];
  await dock(realm, captain, 'morrow'); const personal = realm.vessels.get(captain.ownedVesselId), before = pose(personal);
  ok(await realm.command(captain, 'acceptNpcContract', { roleId: 'medic' }));
  const contract = captain.game.state.npcContract, employer = realm.vessels.get(contract.vesselId), destination = room.runtime.bodies.find(body => body.id === 'kettle');
  // A persisted working watch may still name its old route phase even though
  // the actual service ship is now alongside its destination landing.
  employer.dockedAt = destination.id; Object.assign(employer.ship, { x: destination.x, y: destination.y + destination.radius + 60, vx: 0, vy: 0 });
  contract.phase = 'working'; contract.dockedAt = null; contract.work.progress = .5; contract.work.done = false;
  const credits = captain.game.state.credits, jobs = captain.game.state.stats.jobs, earned = Math.floor(contract.reward * .35 * .5), carrierPose = pose(employer);
  airlock(captain, employer);
  const result = ok(await realm.command(captain, 'disembark', { wages: 99999, done: true, bodyId: 'morrow' }, 'destination-exit'));
  assert.equal(result.wages, earned); assert.equal(captain.game.state.credits, credits + earned); assert.equal(captain.game.state.stats.jobs, jobs);
  assert.equal(captain.game.state.locationId, 'kettle'); assert.equal(captain.portVesselId, null); assert.equal(captain.game.state.npcContract, null);
  assert.equal(realm.vessels.has(employer.id), false);
  assert.equal(contract.active, false); assert.equal(contract.paid, true); assert.equal(contract.outcome, 'partial');
  assert.deepEqual(pose(personal), before); assert.deepEqual(pose(employer), carrierPose);
  ok(await realm.command(captain, 'disembark', {}, 'destination-exit')); assert.equal(captain.game.state.credits, credits + earned);
  realm.step(.1, realm.tick + 1, Date.now()); assert.equal(captain.aboard, null); assert.equal(captain.game.state.locationId, 'kettle');
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence: storage() }), returned = restored.captains.get(captain.id);
  ok(restored.attach(returned, { close() {} })); assert.equal(returned.game.state.locationId, 'kettle'); assert.equal(returned.portVesselId, null);
  assert.equal(returned.game.state.credits, credits + earned); assert.equal(returned.game.state.npcContract, null); assert.deepEqual(pose(restored.vessels.get(personal.id)), before);
});

test('ending a watch never removes an employer that still contains another physical captain', async () => {
  const realm = new Realm({ id: 'OCCUPIEDEXIT', seed: 'occupied-employer-airlock', persistence: storage() });
  const captain = (await realm.createCaptain('Employee', { startMode: 'hardcore' })).captain, other = (await realm.createCaptain('Still aboard', { startMode: 'hardcore' })).captain;
  for (const c of [captain, other]) ok(realm.attach(c, { close() {} }));
  ok(await realm.command(captain, 'acceptNpcContract', { roleId: 'medic' }));
  const employer = realm.vessels.get(captain.aboard);
  realm._cabin(other, employer); const person = structuredClone(other.game.state.person), hull = pose(employer);
  airlock(captain, employer); ok(await realm.command(captain, 'disembark'));
  assert.equal(realm.vessels.has(employer.id), true); assert.equal(other.aboard, employer.id); assert.equal(other.game.state.interior.location.vesselId, employer.id);
  assert.deepEqual(other.game.state.person, person); assert.deepEqual(pose(employer), hull); assert.equal(captain.portVesselId, employer.id);
  assert.equal(captain.ownedVesselId, null); assert.equal(other.ownedVesselId, null);
  const credits = captain.game.state.credits, history = structuredClone(captain.game.state.npcContractHistory);
  airlock(other, employer); ok(await realm.command(other, 'disembark'));
  assert.equal(other.aboard, null); assert.equal(other.game.state.locationId, 'morrow');
  assert.equal(realm.vessels.has(employer.id), false, 'the final physical occupant releases the already-settled employer');
  assert.equal(captain.portVesselId, null); assert.equal(other.portVesselId, null);
  assert.equal(captain.game.state.credits, credits); assert.deepEqual(captain.game.state.npcContractHistory, history, 'the second exit cannot settle the employee’s wages again');
});
