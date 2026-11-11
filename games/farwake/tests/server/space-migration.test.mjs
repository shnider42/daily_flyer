import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { Game } from '../../dist/engine.mjs';
import { cabinLayout, enemyHullProfile } from '../../dist/fleet.mjs';
import { systemBodyPosition } from '../../dist/system-space.mjs';
import { findDerelict } from '../helpers/combat-fixtures.mjs';

const copy = value => structuredClone(value);
const pose = value => ({ x: value.x, y: value.y });
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const close = (actual, expected) => { assert.ok(Math.abs(actual.x - expected.x) < 1e-8, `${actual.x} != ${expected.x}`); assert.ok(Math.abs(actual.y - expected.y) < 1e-8, `${actual.y} != ${expected.y}`); };
const persistence = () => ({ kind: 'memory', save: async (_id, version) => ({ version: version + 1 }) });
function legacy(snapshot) {
  delete snapshot.spaceVersion;
  for (const captain of Object.values(snapshot.captains)) {
    delete captain.game.spaceVersion;
    for (const record of Object.values(captain.game.worlds || {})) delete record.spaceVersion;
  }
  for (const world of Object.values(snapshot.worlds)) { delete world.spaceVersion; if (world.record) delete world.record.spaceVersion; }
  return snapshot;
}
async function fixture(seed = 'shared-space-migration') {
  const realm = new Realm({ id: 'SPACE123', seed, persistence: persistence() }), captains = [];
  for (const name of ['Owner', 'Guest']) { const { captain } = await realm.createCaptain(name); ok(realm.attach(captain, { close() {} })); captains.push(captain); }
  const [owner, guest] = captains, carrier = realm.vessels.get(owner.ownedVesselId), personal = realm.vessels.get(guest.ownedVesselId);
  owner.game.state.fleet.owned.push('tern'); owner.game._activateClass('tern', true);
  carrier.grants[guest.id] = { allowed: true, roles: ['helm', 'scanner'], allowBunk: true };
  return { realm, owner, guest, carrier, personal };
}

test('shared migration keeps remote personal ownership, docked crew, launch access, and canonical snapshot poses', async () => {
  const { realm, owner, guest, carrier, personal } = await fixture();
  carrier.systemId = 'hearth'; carrier.dockedAt = 'morrow'; carrier.helmOwner = null;
  Object.assign(carrier.ship, { x: 840, y: -223, vx: 0, vy: 0, hull: 112 });
  realm._cabin(owner, carrier); realm._cabin(guest, carrier);
  const remoteSystem = realm.galaxy.find(system => system.id === 'vesper'), remoteBody = remoteSystem.bodies[1], oldRemote = systemBodyPosition(remoteBody, 1, 'vesper', 1), nextRemote = systemBodyPosition(remoteBody, 1, 'vesper');
  personal.systemId = 'vesper'; personal.dockedAt = remoteBody.id; personal.helmOwner = null;
  Object.assign(personal.ship, { x: oldRemote.x, y: oldRemote.y + (remoteBody.kind === 'planet' ? 122 : 76) + 75, vx: 0, vy: 0, hull: 63 });
  guest.game.state.livelihoods.parkedShip = { ...copy(personal.ship), vesselId: personal.id, systemId: 'vesper', bodyId: remoteBody.id };
  const guestPose = pose(guest.game.state.person), data = legacy(realm.document());
  data.captains[guest.id].game.ship.id = 'legacy-personal-hull-alias';
  const original = copy(data);
  const restored = new Realm({ id: realm.id, snapshot: data, persistence: persistence() }), returning = restored.captains.get(guest.id), ship = restored.vessels.get(carrier.id), own = restored.vessels.get(personal.id);
  close(ship.ship, { x: 2520, y: -1063 }); close(own.ship, { x: nextRemote.x, y: nextRemote.y + (remoteBody.kind === 'planet' ? 122 : 76) + 75 });
  close(returning.game.state.person, guestPose); assert.equal(returning.game.state.ship, own.ship); assert.equal(returning.aboard, carrier.id); assert.equal(returning.ownedVesselId, personal.id);
  close(returning.game.state.livelihoods.parkedShip, pose(own.ship)); assert.equal(own.ship.hull, 63); assert.equal(ship.ship.hull, 112);
  const packet = restored.snapshotFor(returning, { drainEvents: false }); close(packet.state.ship, pose(ship.ship)); assert.equal(packet.state.spaceVersion, 1); assert.equal(packet.world.radius, 8100);
  assert.deepEqual(data, original, 'The authority never changes the loaded persistence document in place.');
  ok(restored._command(returning, 'quickHelm', {}));
  assert.equal(ship.dockedAt, null); assert.equal(ship.helmOwner, guest.id); assert.equal(own.dockedAt, remoteBody.id); close(own.ship, pose(returning.game.state.ship));
  const saved = restored.document(), again = new Realm({ id: realm.id, snapshot: saved, persistence: persistence() });
  close(again.vessels.get(carrier.id).ship, pose(ship.ship)); close(again.vessels.get(personal.id).ship, pose(own.ship)); assert.equal(saved.spaceVersion, 1);
});

test('an active shared boarding party retains its two hulls, wounded guard and real return tether', async () => {
  const { realm, owner, carrier } = await fixture('shared-space-tether'), room = realm._room('hearth');
  Object.assign(carrier.ship, { x: -900, y: -1300, vx: 0, vy: 0 });
  const enemy = { id: 'space-tether-raider', name: 'Disabled raider', faction: 'cinder', ...enemyHullProfile('tern'), x: -770, y: -1300, hp: 35, maxHp: 100, shield: 0, disabled: true, active: false, cooldown: 99, speed: 0, damage: 5, reward: 20 };
  room.runtime.enemies.push(enemy); room.record.spawned.push(copy(enemy)); ok(realm._command(owner, 'boardEnemy', { id: enemy.id }));
  const prize = realm.vessels.get(owner.aboard); prize.boarding.enemies[0].health = 19;
  const raw = legacy(realm.document()), restored = new Realm({ id: realm.id, snapshot: raw, persistence: persistence() }), captain = restored.captains.get(owner.id), source = restored.vessels.get(carrier.id), target = restored.vessels.get(prize.id);
  close(source.ship, { x: -2700, y: -3900 }); close(target.ship, { x: -2570, y: -3900 });
  assert.equal(target.boarding.enemies[0].health, 19); assert.equal(captain.returnVesselId, source.id); assert.equal(captain.aboard, target.id); assert.notEqual(source.ship, target.ship);
  const canonicalEnemy = restored._room('hearth').runtime.enemies.find(value => value.id === enemy.id); close(canonicalEnemy, pose(target.ship));
  Object.assign(captain.game.state.person, cabinLayout(target.ship.classId).spawn); ok(restored._command(captain, 'returnToOwnShip', {}));
  assert.equal(captain.aboard, source.id); assert.equal(target.boarding.enemies[0].health, 19);
});

test('a guest’s saved transmission uses the actual occupied hull, not their parked personal ship', async () => {
  const seed = 'shared-space-transmission', { realm, owner, guest, carrier, personal } = await fixture(seed), finder = new Game(seed), signal = findDerelict(finder), systemId = finder.state.systemId;
  carrier.systemId = systemId; carrier.dockedAt = null; Object.assign(carrier.ship, { x: signal.x + 200, y: signal.y, vx: 0, vy: 0 });
  realm._cabin(owner, carrier); realm._cabin(guest, carrier); guest.crewRole = 'scanner';
  personal.dockedAt = 'kettle'; personal.helmOwner = null; Object.assign(personal.ship, { x: 0, y: 145 });
  realm._bindCaptain(guest);
  const scanner = realm._surface(guest).entities.find(entity => entity.data?.stationRole === 'navigation'); assert.ok(scanner); Object.assign(guest.game.state.person, pose(scanner));
  ok(realm._command(guest, 'scan', { id: signal.id })); assert.equal(guest.game.state.pendingEncounter?.id, 'ghost_freighter');
  const raw = legacy(realm.document()), oldPoint = { x: signal.x / 3, y: signal.y / 3 };
  Object.assign(raw.vessels[carrier.id].ship, { x: oldPoint.x + 200, y: oldPoint.y });
  Object.assign(raw.captains[owner.id].game.ship, { x: oldPoint.x + 200, y: oldPoint.y });
  Object.assign(raw.worlds[systemId].record.encounterContacts[signal.vesselId], oldPoint);
  Object.assign(raw.captains[guest.id].game.pendingEncounter, oldPoint);
  for (const id of [owner.id, guest.id]) Object.assign(raw.captains[id].game.interior.returnShip, { x: oldPoint.x + 200, y: oldPoint.y });
  const restored = new Realm({ id: realm.id, snapshot: raw, persistence: persistence() }), actual = restored.captains.get(guest.id), hull = restored.vessels.get(carrier.id);
  assert.equal(actual.game.state.pendingEncounter?.id, 'ghost_freighter'); close(hull.ship, { x: signal.x + 200, y: signal.y });
  close(actual.game.state.ship, { x: 0, y: 145 }); assert.equal(actual.game.state.ship, restored.vessels.get(personal.id).ship);
  const pending = copy(actual.game.state.pendingEncounter), snapshot = restored.snapshotFor(actual, { drainEvents: false }); assert.deepEqual(snapshot.state.pendingEncounter, pending); close(snapshot.state.ship, pose(hull.ship));
  const again = new Realm({ id: realm.id, snapshot: restored.document(), persistence: persistence() }); assert.equal(again.captains.get(guest.id).game.state.pendingEncounter?.id, 'ghost_freighter'); close(again.vessels.get(carrier.id).ship, pose(hull.ship));
});

test('unloaded shared world records migrate once and room eviction does not move them again', async () => {
  const { realm } = await fixture('shared-space-unloaded'), raw = legacy(realm.document());
  raw.worlds.cinder = { savedAt: Date.now(), enemies: [{ id: 'cinder:raider:0', x: -1300, y: 1600, hp: 44, angle: 1, vx: 8, vy: -3 }], traffic: [], record: { spawned: [], defeated: [], enemyHealth: { 'cinder:raider:0': 44 }, enemyStates: { 'cinder:raider:0': { x: -1300, y: 1600, classId: 'hauler', hp: 44, vx: 8, vy: -3 } }, pickups: [{ x: -1400, y: 1500, kind: 'ore', amount: 3 }] } };
  const restored = new Realm({ id: realm.id, snapshot: raw, persistence: persistence() }); assert.equal(restored.rooms.has('cinder'), false);
  close(restored.worlds.cinder.record.enemyStates['cinder:raider:0'], { x: -3900, y: 4800 }); close(restored.worlds.cinder.enemies[0], { x: -3900, y: 4800 });
  let room = restored._room('cinder'), enemy = room.runtime.enemies.find(value => value.id === 'cinder:raider:0'); close(enemy, { x: -3900, y: 4800 }); assert.equal(enemy.hp, 44); assert.equal(enemy.vx, 8); assert.equal(enemy.vy, -3);
  close(room.runtime.pickups[0], { x: -4200, y: 4500 }); restored._captureRoom(room); restored.rooms.delete('cinder');
  room = restored._room('cinder'); enemy = room.runtime.enemies.find(value => value.id === 'cinder:raider:0'); close(enemy, { x: -3900, y: 4800 }); assert.equal(enemy.hp, 44);
  const saved = restored.document(); assert.equal(saved.worlds.cinder.spaceVersion, 1); assert.equal(saved.worlds.cinder.record.spaceVersion, 1);
  const again = new Realm({ id: realm.id, snapshot: saved, persistence: persistence() }); close(again._room('cinder').runtime.enemies.find(value => value.id === enemy.id), pose(enemy));
});
