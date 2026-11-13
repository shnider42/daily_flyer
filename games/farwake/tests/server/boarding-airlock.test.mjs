import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout, enemyHullProfile } from '../../dist/fleet.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const storage = () => ({ kind: 'memory', save: async (_id, version) => ({ version: version + 1 }) });
const tick = (realm, count = 1) => { for (let i = 0; i < count; i++) realm.step(1 / 30, realm.tick + 1, Date.now()); };
async function fixture(count = 2) {
  const realm = new Realm({ id: 'AIRLOCK21', seed: 'boarding-airlock', persistence: storage() }), captains = [];
  for (let i = 0; i < count; i++) {
    const { captain } = await realm.createCaptain(`Captain ${i + 1}`); realm.attach(captain, { close() {} });
    captain.game.state.fleet.owned.push('hauler'); captain.game._activateClass('hauler', true);
    Object.assign(realm.vessels.get(captain.aboard).ship, { x: i * 130, y: 0, angle: 0, vx: 0, vy: 0 }); captains.push(captain);
  }
  const room = realm._room('hearth'); for (const key of ['enemies', 'bullets', 'asteroids', 'pickups', 'signals']) room.runtime[key] = [];
  const [host, guest] = captains, source = realm.vessels.get(host.aboard), guestShip = guest && realm.vessels.get(guest.aboard);
  source.allowCrew = true;
  if (guest) ok(realm._command(guest, 'boardShip', { vesselId: source.id }));
  const enemy = { id: 'scrap-raider', name: 'Scrap raider', ...enemyHullProfile('hauler'), x: source.ship.x + 150, y: 0, angle: 0,
    hp: 35, maxHp: 100, shield: 0, disabled: true, active: false, cooldown: 99, speed: 0, damage: 5, reward: 20, faction: 'covenant' };
  room.runtime.enemies.push(enemy);
  return { realm, captains, host, guest, source, guestShip, room, enemy };
}
function actionFor(realm, captain, id) {
  const target = realm.snapshotFor(captain).state.multiplayer.boardingTargets.find(target => target.id === id || target.enemyId === id);
  assert.ok(target, `Boarding target ${id} appears in the actual carrier's airlock menu.`); return target.boardingAction;
}
function cross(realm, captain, action) { assert.equal(action.enabled, true, action.reason); return ok(realm._command(captain, action.command, action.args)); }

// The reported path: a guest walks to an airlock, boards the disabled NPC,
// then their still-piloting friend joins the already-promoted canonical hull.
test('a passenger can initiate the displayed NPC boarding action and the pilot can join without resetting the deck', async () => {
  const { realm, host, guest, source, guestShip, enemy } = await fixture();
  const guestOwned = structuredClone(guestShip.ship), credits = guest.game.state.credits;
  Object.assign(source.ship, { vx: 12, vy: 3, angularVelocity: .1 });
  assert.equal(realm._canRole(guest, source, 'helm'), false);
  assert.equal(realm.snapshotFor(guest).state.multiplayer.canUseBoardingAirlock, true);
  const initial = actionFor(realm, guest, enemy.id); assert.equal(initial.command, 'boardEnemy'); assert.equal(initial.label, 'Board Scrap raider');
  cross(realm, guest, initial);
  const target = realm.vessels.get(guest.aboard), boarding = target.boarding;
  boarding.enemies[0].health = 19; boarding.elapsed = 4; boarding.shotSerial = 7;
  assert.equal(source.helmOwner, host.id, 'A guest crossing the tether does not release somebody else’s helm.');
  assert.equal(host.game.state.mode, 'ship'); assert.equal(host.aboard, source.id);
  assert.equal(source.ship.vx, 12); assert.equal(source.ship.vy, 3); assert.equal(source.ship.angularVelocity, .1);
  assert.equal(guest.returnVesselId, source.id); assert.equal(guest.ownedVesselId, guestShip.id);
  assert.deepEqual(guestShip.ship, guestOwned); assert.equal(guest.game.state.credits, credits);
  const displayed = realm.snapshotFor(host).fleet.find(vessel => vessel.id === target.id).boardingAction;
  assert.equal(displayed.command, 'boardEnemy'); assert.equal(displayed.label, 'Join boarding of Scrap raider');
  cross(realm, host, displayed);
  assert.equal(host.aboard, target.id); assert.equal(host.returnVesselId, source.id); assert.equal(source.helmOwner, null);
  assert.equal(target.boarding, boarding); assert.equal(boarding.enemies[0].health, 19); assert.equal(boarding.elapsed, 4); assert.equal(boarding.shotSerial, 7);
  assert.equal(target.boardingLeaderId, guest.id); assert.equal(realm.roomInfo(host).id, realm.roomInfo(guest).id);
  assert.ok(realm.snapshotFor(host).players.some(person => person.captainId === guest.id && person.team === 'friendly'));
});

test('the second crew member can join from the now-unpiloted carrier and one retreat does not cancel the other person’s fight', async () => {
  const { realm, host, guest, source, enemy } = await fixture();
  cross(realm, host, actionFor(realm, host, enemy.id)); const target = realm.vessels.get(host.aboard);
  target.boarding.enemies[0].health = 17;
  assert.equal(source.helmOwner, null); cross(realm, guest, actionFor(realm, guest, target.id));
  Object.assign(host.game.state.person, cabinLayout(target.ship.classId).spawn);
  ok(realm._command(host, 'returnToOwnShip', {}));
  assert.equal(host.aboard, source.id); assert.equal(guest.aboard, target.id); assert.equal(target.boarding.phase, 'active');
  assert.equal(target.boardingLeaderId, guest.id); assert.equal(target.boarding.leaderId, guest.id); assert.equal(enemy.boardingTargetId, guest.id);
  tick(realm); assert.equal(target.boarding.phase, 'active'); assert.equal(target.boarding.enemies[0].health, 17);
  Object.assign(guest.game.state.person, cabinLayout(target.ship.classId).spawn); ok(realm._command(guest, 'returnToOwnShip', {}));
  assert.equal(guest.aboard, source.id); assert.equal(target.boarding.phase, 'retreated'); assert.equal(enemy.boardingTargetId, undefined);
});

test('a disabled canonical NPC stays boardable after its shields recharge during a fifteen-second retreat', async () => {
  const { realm, host, guest, source, enemy } = await fixture();
  cross(realm, host, actionFor(realm, host, enemy.id)); const target = realm.vessels.get(host.aboard);
  target.boarding.enemies[0].health = 13;
  Object.assign(host.game.state.person, cabinLayout(target.ship.classId).spawn); ok(realm._command(host, 'returnToOwnShip', {}));
  tick(realm, 450);
  assert.ok(target.ship.shield > target.ship.maxShield * .2, 'The regression includes actual passive shield recovery.');
  assert.equal(enemy.disabled, true, 'Recharging shields does not repair a disabled NPC engine.');
  const published = realm.snapshotFor(host).fleet.find(vessel => vessel.id === target.id);
  assert.equal(published.disabled, true); assert.equal(published.canHostileBoard, true); assert.equal(published.boardingAction.enabled, true);
  cross(realm, guest, actionFor(realm, guest, target.id)); cross(realm, host, actionFor(realm, host, target.id));
  assert.equal(guest.aboard, target.id); assert.equal(host.aboard, target.id); assert.equal(target.boarding.enemies[0].health, 13);
  assert.equal(guest.returnVesselId, source.id); assert.equal(host.returnVesselId, source.id);
});

test('airlock, target integrity, range, speed and training safeguards agree with their displayed action', async () => {
  const { realm, guest, source, enemy } = await fixture();
  const cases = [
    ['airlock', () => Object.assign(guest.game.state.person, cabinLayout(source.ship.classId).stations.helm), () => Object.assign(guest.game.state.person, cabinLayout(source.ship.classId).spawn)],
    ['incapacitated', () => { guest.game.state.person.down = true; }, () => { guest.game.state.person.down = false; }],
    ['contract', () => { guest.game.state.npcContract = { id: 'active-duty', active: true }; }, () => { guest.game.state.npcContract = null; }],
    ['disabled', () => { enemy.disabled = false; }, () => { enemy.disabled = true; }],
    ['distance', () => { enemy.x = 800; }, () => { enemy.x = 150; }],
    ['speed', () => { enemy.vx = 100; }, () => { enemy.vx = 0; }],
    ['training-target', () => { enemy.trainingTarget = true; }, () => { delete enemy.trainingTarget; }],
  ];
  for (const [code, change, restore] of cases) {
    change(); const action = realm._boardingAction(guest, { enemy });
    assert.equal(action.enabled, false, code); const result = realm._command(guest, action.command, action.args);
    assert.equal(result.ok, false, code); assert.equal(result.code, code); assert.equal(result.reason, action.reason);
    assert.equal(guest.aboard, source.id); assert.equal(enemy.canonicalVesselId, undefined); restore();
  }
  source.dockedAt = 'kettle'; assert.equal(realm._command(guest, 'boardEnemy', { id: enemy.id }).ok, false);
  source.dockedAt = null; source.destroyed = true; assert.equal(realm._command(guest, 'boardEnemy', { id: enemy.id }).ok, false);
});

test('another independent crew cannot silently join an occupied NPC assault', async () => {
  const { realm, host, enemy, captains: [, , outsider] } = await fixture(3);
  cross(realm, host, actionFor(realm, host, enemy.id)); const target = realm.vessels.get(host.aboard), outsiderShip = outsider.aboard;
  const action = actionFor(realm, outsider, target.id); assert.equal(action.enabled, false); assert.match(action.reason, /another boarding party/i);
  assert.equal(realm._command(outsider, action.command, action.args).ok, false); assert.equal(outsider.aboard, outsiderShip);
  assert.equal(target.boardingLeaderId, host.id);
});

test('a passenger can board a declared hostile player hull from the airlock while player hostility and shield rules remain enforced', async () => {
  const { realm, host, guest, source, room, captains: [, , defender] } = await fixture(3); room.runtime.enemies = [];
  const target = realm.vessels.get(defender.aboard); Object.assign(target.ship, { x: 150, hull: target.ship.maxHull * .35, shield: 0 });
  assert.equal(realm._command(guest, 'declareHostility', { vesselId: target.id }).ok, false);
  assert.equal(realm._command(guest, 'boardHostileShip', { vesselId: target.id }).code, 'permission');
  ok(realm._command(host, 'declareHostility', { vesselId: target.id }));
  target.ship.shield = target.ship.maxShield; assert.equal(realm._command(guest, 'boardHostileShip', { vesselId: target.id }).code, 'disabled');
  target.ship.shield = 0; const action = actionFor(realm, guest, target.id); assert.equal(action.command, 'boardHostileShip'); cross(realm, guest, action);
  assert.equal(guest.aboard, target.id); assert.equal(source.helmOwner, host.id); assert.equal(host.game.state.mode, 'ship'); assert.equal(target.ownerId, defender.id);
  assert.equal(realm._canTakeCapturedHelm(guest, target), false, 'A transfer never grants an uncleared bridge.');
});

test('friendly transfer uses the passenger’s real carrier and target invitation without requiring helm access', async () => {
  const { realm, host, guest, source, guestShip, room, captains: [, , friend] } = await fixture(3); room.runtime.enemies = [];
  const target = realm.vessels.get(friend.aboard); Object.assign(target.ship, { x: 160 });
  assert.equal(realm._command(guest, 'boardShip', { vesselId: target.id }).code, 'permission');
  target.grants[guest.id] = { allowed: true, roles: [] };
  guestShip.systemId = 'sol'; realm._actor(guestShip)._hitTimer = 5;
  const action = actionFor(realm, guest, target.id); assert.equal(action.command, 'boardShip'); cross(realm, guest, action);
  assert.equal(guest.aboard, target.id); assert.equal(guest.returnVesselId, source.id); assert.equal(source.helmOwner, host.id);
  assert.equal(realm._canRole(guest, target, 'helm'), false); assert.equal(target.helmOwner, friend.id);
});

test('two people and their wounded NPC deck survive authority restart and retain independent return tethers', async () => {
  const { realm, host, guest, source, enemy } = await fixture();
  cross(realm, guest, actionFor(realm, guest, enemy.id)); const target = realm.vessels.get(guest.aboard);
  cross(realm, host, actionFor(realm, host, target.id)); target.boarding.enemies[0].health = 11;
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence: storage() });
  const returnedHost = restored.captains.get(host.id), returnedGuest = restored.captains.get(guest.id), restoredTarget = restored.vessels.get(target.id);
  assert.equal(returnedHost.aboard, target.id); assert.equal(returnedGuest.aboard, target.id);
  assert.equal(returnedHost.returnVesselId, source.id); assert.equal(returnedGuest.returnVesselId, source.id); assert.equal(restoredTarget.boarding.enemies[0].health, 11);
  Object.assign(returnedGuest.game.state.person, cabinLayout(target.ship.classId).spawn); ok(restored._command(returnedGuest, 'returnToOwnShip', {}));
  assert.equal(restoredTarget.boarding.phase, 'active'); assert.equal(restoredTarget.boardingLeaderId, host.id);
});

test('a guest-led boarding party remains friendly when it wins the NPC prize and takes its helm', async () => {
  const { realm, host, guest, enemy } = await fixture();
  cross(realm, guest, actionFor(realm, guest, enemy.id)); const target = realm.vessels.get(guest.aboard);
  cross(realm, host, actionFor(realm, host, target.id));
  const actor = realm._actor(target); for (const guard of target.boarding.enemies) guard.health = 0;
  actor._finishBoarding('won'); realm._syncActor(target);
  assert.equal(target.ownerId, guest.id); assert.equal(target.captured, true);
  assert.equal(realm._captainTeam(host, target), realm._captainTeam(guest, target)); assert.equal(realm._hostileOccupied(target), false);
  Object.assign(guest.game.state.person, cabinLayout(target.ship.classId).stations.helm); ok(realm._command(guest, 'takeCapturedHelm', {}));
  const hostView = realm.snapshotFor(host); assert.equal(hostView.state.multiplayer.hostileBoarding, false);
  assert.ok(hostView.players.some(person => person.captainId === guest.id && person.team === 'friendly'));
  assert.equal(realm._canRole(host, target, 'helm'), false, 'Winning together does not invent a helm grant.');
  assert.equal(realm._canBoard(host, target), true); assert.equal(target.grants[host.id].allowBunk, false);
  Object.assign(host.game.state.person, cabinLayout(target.ship.classId).spawn); ok(realm._command(host, 'returnToOwnShip', {}));
  cross(realm, host, actionFor(realm, host, target.id));
  assert.equal(host.aboard, target.id); assert.equal(target.helmOwner, guest.id);
});

test('full fleet snapshots keep evicted remote NPC rooms asleep while preserving disabled boarding actions', async () => {
  const { realm, host, guest, source, room, enemy } = await fixture();
  room.record.spawned.push(structuredClone(enemy));
  cross(realm, host, actionFor(realm, host, enemy.id)); const target = realm.vessels.get(host.aboard);
  Object.assign(host.game.state.person, cabinLayout(target.ship.classId).spawn); ok(realm._command(host, 'returnToOwnShip', {}));
  realm._captureRoom(room);
  source.systemId = 'brindle'; source.actor = null;
  for (const captain of [host, guest]) { captain.game.state.systemId = 'brindle'; realm._bindCaptain(captain); }
  realm.rooms.delete('hearth'); target.actor = null;
  const loadRoom = realm._room; let remoteLoads = 0;
  realm._room = function (systemId) { if (systemId === 'hearth') remoteLoads++; return loadRoom.call(this, systemId); };
  for (const captain of [host, guest]) {
    const snapshot = realm.snapshotFor(captain, { compact: false }), remote = snapshot.fleet.find(vessel => vessel.id === target.id);
    assert.ok(remote, 'The remote vessel remains listed without simulating its system.');
    assert.equal(remote.canHostileBoard, false); assert.equal(remote.boardingAction.command, 'boardEnemy');
    assert.deepEqual(remote.boardingAction.args, { id: enemy.id }); assert.equal(remote.boardingAction.enabled, false);
    assert.match(remote.boardingAction.reason, /same system|in this system/i);
    assert.equal(remoteLoads, 0, 'Snapshot boarding metadata never requests the evicted remote NPC room.');
    assert.equal(realm.rooms.has('hearth'), false);
  }
});
