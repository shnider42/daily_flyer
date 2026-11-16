import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout } from '../../dist/fleet.mjs';
import { FIELD_HOSPITALS } from '../../dist/medical-recovery.mjs';
import { MILITARY_RECRUITER } from '../../dist/military-content.mjs';

const storage = () => ({ kind: 'memory', async save(_id, version) { return { version: version + 1 }; } });
const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const tick = realm => realm.step(.1, realm.tick + 1);
function recruiter(realm, captain) {
  const entity = realm._surface(captain).entities.find(value => value.id === MILITARY_RECRUITER.id);
  assert.ok(entity); Object.assign(captain.game.state.person, { x: entity.x, y: entity.y });
  captain.game.state.pendingEncounter = null;
  return entity.id;
}
async function recruit(realm, name, { ownsShip = false } = {}) {
  const { captain } = await realm.createCaptain(name, { startMode: ownsShip ? 'regular' : 'hardcore' });
  ok(realm.attach(captain, { close() {} }));
  if (ownsShip) {
    const own = realm.vessels.get(captain.ownedVesselId), body = realm._room('hearth').runtime.bodies.find(value => value.id === 'morrow');
    Object.assign(own.ship, { x: body.x + body.radius + 80, y: body.y, vx: 0, vy: 0 });
    ok(realm._command(captain, 'dock', { id: 'morrow' }));
  }
  ok(realm._command(captain, 'militaryCareerAction', { action: 'join', branchId: 'navy', entityId: recruiter(realm, captain) }));
  Object.assign(captain.game.state.professions.careers.military, { completed: 8, rankVersion: 1, legacyRankFloor: 0 });
  return captain;
}
async function lostNavyCrew() {
  const realm = new Realm({ id: 'FIELDEV1', seed: 'field-evacuation-authority', persistence: storage() });
  const leader = await recruit(realm, 'Owner ashore after rescue', { ownsShip: true }), guest = await recruit(realm, 'Shipless survivor');
  const ownId = leader.ownedVesselId, own = realm.vessels.get(ownId), ownShip = structuredClone(own.ship), home = structuredClone(leader.home);
  const { operationId } = ok(realm._command(leader, 'militaryCareerAction', { action: 'createOperation', entityId: recruiter(realm, leader) }));
  ok(realm._command(guest, 'militaryCareerAction', { action: 'joinOperation', operationId, entityId: recruiter(realm, guest) }));
  ok(realm._command(leader, 'militaryCareerAction', { action: 'launchOperation', operationId }));
  const carrier = realm.vessels.get(leader.aboard), vey = realm._room('crosswind').runtime.bodies.find(body => body.id === 'crosswind-vey');
  carrier.systemId = 'crosswind'; carrier.dockedAt = null;
  Object.assign(carrier.ship, { x: vey.x + vey.radius + 200, y: vey.y, dockedAt: null, vx: 0, vy: 0 });
  for (const captain of [leader, guest]) { realm._bindCaptain(captain); captain.game.state.credits = 0; }
  realm._destroyVessel(carrier);
  return { realm, leader, guest, carrier, ownId, ownShip, home };
}
function wake(realm, captains) {
  for (let count = 0; count < 80 && captains.some(c => c.game.medicalRecoveryActive()); count++) tick(realm);
  for (const captain of captains) assert.equal(captain.game.medicalRecoveryActive(), false);
}
function arrive(realm, captain) {
  for (let count = 0; count < 4000 && captain.game.state.npcContract?.phase !== 'docked'; count++) {
    tick(realm);
    assert.ok(captain.game.state.npcContract?.active, 'the evacuation must remain a usable transport through the active battle');
  }
  assert.equal(captain.game.state.npcContract?.phase, 'docked');
  const vessel = realm.vessels.get(captain.aboard);
  Object.assign(captain.game.state.person, cabinLayout(vessel.ship.classId).spawn);
  ok(realm._command(captain, 'disembark', {}));
  assert.equal(captain.game.state.npcContract, null); assert.equal(captain.aboard, null);
}

test('a destroyed shared navy carrier gives every Vey survivor independent free passage without moving a surviving personal hull', async () => {
  const { realm, leader, guest, carrier, ownId, ownShip, home } = await lostNavyCrew();
  for (const captain of [leader, guest]) {
    assert.equal(captain.aboard, null); assert.equal(captain.game.state.npcContract, null);
    assert.equal(captain.game.state.locationId, 'crosswind-vey'); assert.equal(captain.game.state.exploration.outdoor, true);
    assert.equal(captain.game.state.medicalRecovery.destination.factionId, 'freewake');
    assert.equal(captain.game.state.militaryCareer.active.phase, 'failed');
    assert.equal(captain.game.militaryRecoveryStatus().detained, false);
    assert.equal(captain.game.militaryRecoveryStatus().evacuation, true);
    assert.equal(realm._command(captain, 'startMilitaryPassage', {}).ok, false, 'wake-up must finish before boarding');
  }
  const front = realm.sites[leader.game.state.exploration.key], rank = structuredClone(leader.game.state.professions.careers.military);
  const guestReceipt = structuredClone(guest.game.state.medicalRecovery);
  wake(realm, [leader, guest]);
  assert.equal(leader.game.militaryRecoveryStatus().canBook, true); assert.equal(guest.game.militaryRecoveryStatus().canBook, true);
  ok(await realm.command(leader, 'startMilitaryPassage', {}, 'field-evacuation-once'));
  const passageId = leader.aboard, transport = realm.vessels.get(passageId), count = realm.vessels.size;
  ok(await realm.command(leader, 'startMilitaryPassage', {}, 'field-evacuation-once'));
  assert.equal(realm.vessels.size, count, 'a retried booking must not create a second transport');
  assert.equal(leader.aboard, passageId); assert.equal(transport.dockedAt, 'crosswind-vey'); assert.equal(leader.crewRole, 'passenger');
  assert.deepEqual(transport.grants[leader.id].roles, []); assert.equal(leader.game.state.exploration, null);
  assert.equal(guest.aboard, null); assert.equal(guest.game.state.locationId, 'crosswind-vey');
  assert.deepEqual(guest.game.state.medicalRecovery, guestReceipt);
  assert.equal(guest.game.state.exploration.encounter, front, 'the other survivor keeps the same shared battlefield');
  assert.equal(guest.game.militaryRecoveryStatus().canBook, true, 'the other survivor retains independent departure clearance');
  arrive(realm, leader);
  assert.equal(leader.game.state.systemId, 'hearth'); assert.equal(leader.game.state.locationId, 'morrow');
  assert.equal(leader.game.state.credits, 0); assert.deepEqual(leader.game.state.professions.careers.military, rank);
  assert.equal(leader.ownedVesselId, ownId); assert.deepEqual(realm.vessels.get(ownId).ship, ownShip);
  assert.equal(realm.vessels.get(ownId).systemId, 'hearth'); assert.equal(realm.vessels.get(ownId).dockedAt, 'morrow');
  assert.deepEqual(leader.home, home); assert.equal(guest.ownedVesselId, null); assert.equal(carrier.destroyed, true);
  assert.equal(leader.game.state.npcContractHistory.at(-1).fare, 0); assert.ok(!realm.failed);
});

for (const factionId of ['freewake', 'meridian']) test(`${factionId} survivors already saved on Vey recover their exit on restart, book locally, and reach their faction posting`, async () => {
  const { realm, leader, guest, ownId } = await lostNavyCrew();
  const survivor = factionId === 'freewake' ? leader : guest;
  survivor.game.state.professions.careers.military.factionId = factionId;
  survivor.game.state.militaryCareer.factionId = factionId;
  survivor.game.state.medicalRecovery.destination.factionId = factionId;
  survivor.game.state.medicalRecovery.destination.name = FIELD_HOSPITALS[factionId].name;
  survivor.game.state.shipRecovery.destination = structuredClone(survivor.game.state.medicalRecovery.destination);
  Object.assign(survivor.game.state.person, FIELD_HOSPITALS[factionId]);
  survivor.game.state.militaryRecovery = null; // The v0.29 hospital path omitted these orders.
  const saved = realm.document(), before = saved.captains[survivor.id], loaded = new Realm({ id: realm.id, persistence: storage(), snapshot: saved });
  const patient = loaded.captains.get(survivor.id); patient.lastSeen = 0;
  ok(loaded.attach(patient, { close() {} }));
  assert.equal(patient.game.state.locationId, 'crosswind-vey'); assert.equal(patient.game.state.person.x, FIELD_HOSPITALS[factionId].x);
  assert.equal(patient.game.state.person.y, FIELD_HOSPITALS[factionId].y); assert.equal(patient.game.state.credits, before.game.credits);
  assert.equal(patient.ownedVesselId, before.ownedVesselId); assert.deepEqual(patient.home, before.home);
  const orders = structuredClone(patient.game.state.militaryRecovery), rank = structuredClone(patient.game.state.professions.careers.military);
  assert.equal(patient.game.militaryRecoveryStatus().evacuation, true); assert.equal(patient.game.militaryRecoveryStatus().factionId, factionId);
  patient.game.initializeMilitaryRecovery(); assert.deepEqual(patient.game.state.militaryRecovery, orders, 'loading again must not issue a second recovery');
  wake(loaded, [patient]);
  patient.game.state.person.x += 200;
  const count = loaded.vessels.size;
  assert.equal(loaded._command(patient, 'startMilitaryPassage', {}).ok, false); assert.equal(loaded.vessels.size, count);
  Object.assign(patient.game.state.person, { x: FIELD_HOSPITALS[factionId].x, y: FIELD_HOSPITALS[factionId].y });
  ok(loaded._command(patient, 'startMilitaryPassage', { systemId: 'sol', bodyId: 'earth', factionId: 'cinder' }));
  const contract = patient.game.state.npcContract;
  assert.equal(contract.destination.systemId, factionId === 'freewake' ? 'hearth' : 'meridian');
  assert.equal(contract.destination.bodyId, factionId === 'freewake' ? 'morrow' : 'serein');
  arrive(loaded, patient);
  assert.equal(patient.game.state.locationId, contract.destination.bodyId); assert.equal(patient.game.state.credits, 0);
  assert.deepEqual(patient.game.state.professions.careers.military, rank);
  assert.equal(loaded.vessels.get(ownId).dockedAt, 'morrow'); assert.ok(!loaded.failed);
});
