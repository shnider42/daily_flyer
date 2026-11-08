import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout, enemyHullProfile, getShipClass, isCabinWalkable } from '../../dist/fleet.mjs';
import { SIDEARM } from '../../dist/combat.mjs';

const storage = () => ({ kind: 'memory', save: async (_id, version) => ({ version: version + 1 }) });
async function fixture(count = 2) {
  const realm = new Realm({ id: 'BOARD123', seed: 'boarding-authority', persistence: storage() });
  const captains = [];
  for (let i = 0; i < count; i++) {
    const { captain } = await realm.createCaptain(`Captain ${i + 1}`); realm.attach(captain, { close() {} });
    const vessel = realm.vessels.get(captain.ownedVesselId); Object.assign(vessel.ship, { x: i * 130, y: 0, angle: 0, vx: 0, vy: 0 });
    captains.push(captain);
  }
  const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = []; room.runtime.asteroids = []; room.runtime.pickups = []; room.runtime.signals = [];
  return { realm, captains, room, vessels: captains.map(c => realm.vessels.get(c.ownedVesselId)) };
}
const tick = (realm, count = 1) => { for (let i = 0; i < count; i++) realm.step(1 / 30, realm.tick + 1, Date.now()); };
function enemyFixture(room, source, classId = 'sparrow') {
  const enemy = { id: 'persistent-raider', name: 'Practice raider', ...enemyHullProfile(classId), x: source.ship.x + 130, y: source.ship.y, angle: 0,
    hp: 35, maxHp: 100, shield: 0, disabled: true, active: false, cooldown: 99, speed: 0, damage: 5, reward: 20, faction: 'covenant' };
  room.runtime.enemies.push(enemy); return enemy;
}
function closePeople(realm, vessel, people) {
  const layout = cabinLayout(vessel.ship.classId), from = layout.spawn;
  for (let i = 0; i < people.length; i++) {
    const offsets = [[0, 0], [18, 0], [-18, 0], [0, -18], [0, 18]];
    const point = offsets.slice(i).map(([dx, dy]) => ({ x: from.x + dx, y: from.y + dy })).find(p => isCabinWalkable(layout, p.x, p.y, 3)) || from;
    Object.assign(people[i].game.state.person, point);
  }
}
async function invade() {
  const f = await fixture(3), [attacker, defender] = f.captains, [source, target] = f.vessels;
  target.ship.hull = target.ship.maxHull * .35; target.ship.shield = 0;
  assert.equal(f.realm._command(attacker, 'declareHostility', { vesselId: target.id }).ok, true);
  assert.equal(f.realm._command(attacker, 'boardHostileShip', { vesselId: target.id }).ok, true);
  return { ...f, attacker, defender, source, target };
}

test('NPC boarding changes the physical vessel and leaves source crew, hull and remote presence intact', async () => {
  const { realm, captains: [captain, witness], vessels: [source], room } = await fixture();
  captain.game.state.crew = [{ id: 'source-engineer', name: 'Engineer', role: 'engineer', health: 100, maxHealth: 100 }];
  const originalCrew = captain.game.state.crew, origin = { x: source.ship.x, y: source.ship.y, hull: source.ship.hull }, enemy = enemyFixture(room, source, 'hauler');
  assert.equal(realm._command(captain, 'boardEnemy', { id: enemy.id }).ok, true);
  const target = realm.vessels.get(captain.aboard), view = realm.snapshotFor(captain);
  assert.notEqual(target.id, source.id); assert.equal(captain.returnVesselId, source.id); assert.equal(captain.ownedVesselId, source.id);
  assert.equal(view.state.ship.id, target.id); assert.equal(view.room.vesselId, target.id); assert.equal(view.state.boarding.vesselId, target.id);
  assert.equal(view.state.boarding.shipClass, target.ship.classId); assert.equal(view.state.interior.location.shipClassId, target.ship.classId);
  assert.equal(target.ship.hull / target.ship.maxHull, .35); assert.equal(source.ship, captain.game.state.ship); assert.notEqual(target.ship, source.ship);
  assert.equal(realm._crewFor(source), originalCrew); assert.deepEqual(realm._crewFor(target), []); assert.deepEqual(target.boarding.allies, []);
  tick(realm, 3); assert.deepEqual({ x: source.ship.x, y: source.ship.y, hull: source.ship.hull }, origin);
  const ships = realm.snapshotFor(witness).remoteShips; assert.ok(ships.some(ship => ship.id === source.id), 'Unattended source remains visible.'); assert.ok(ships.some(ship => ship.id === target.id));
  assert.ok(!realm.snapshotFor(witness).world.enemies.some(e => e.id === enemy.id), 'The promoted hull is rendered exactly once.');
});

test('guard wounds, hull damage and canonical occupation survive retreat, reboarding and authority restart', async () => {
  const { realm, captains: [captain], vessels: [source], room } = await fixture(1), enemy = enemyFixture(room, source);
  realm._command(captain, 'boardEnemy', { id: enemy.id }); const target = realm.vessels.get(captain.aboard), guard = target.boarding.enemies[0];
  Object.assign(captain.game.state.person, { x: guard.x, y: guard.y });
  const shot = realm._command(captain, 'attackBoarder', { enemyId: guard.id }); assert.equal(shot.ok, true); assert.equal(guard.health, 52 - SIDEARM.damage);
  target.ship.hull -= 5; Object.assign(captain.game.state.person, cabinLayout(target.ship.classId).spawn);
  assert.equal(realm._command(captain, 'returnToOwnShip', {}).ok, true); assert.equal(captain.aboard, source.id); assert.equal(target.ship.hull, 30);
  assert.equal(realm._command(captain, 'boardEnemy', { id: enemy.id }).ok, true); assert.equal(target.boarding.enemies[0].health, 28);
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence: realm.persistence }), person = restored.captains.get(captain.id), prize = restored.vessels.get(target.id);
  assert.equal(person.aboard, target.id); assert.equal(person.returnVesselId, source.id); assert.equal(prize.ship.hull, 30); assert.equal(prize.boarding.enemies[0].health, 28);
  assert.equal(restored.snapshotFor(person).state.ship.id, target.id); assert.equal(restored.vessels.get(source.id).ship, person.game.state.ship); assert.notEqual(prize.ship, person.game.state.ship);
  tick(restored); assert.equal(prize.boarding.enemies[0].health, 28);
});

test('cleared NPC prizes keep their hull and can take the helm without replacing the original ship', async () => {
  const { realm, captains: [captain], vessels: [source], room } = await fixture(1), enemy = enemyFixture(room, source);
  realm._command(captain, 'boardEnemy', { id: enemy.id }); const target = realm.vessels.get(captain.aboard), actor = realm._actor(target);
  for (const guard of target.boarding.enemies) guard.health = 0; actor._finishBoarding('won'); realm._syncActor(target);
  assert.equal(enemy.hp, 35); assert.equal(enemy.deck.cleared, true); assert.equal(target.ship.hull, 35); assert.equal(target.captured, true);
  const bridge = realm._surface(captain).entities.find(entity => entity.data?.stationRole === 'helm'); Object.assign(captain.game.state.person, { x: bridge.x, y: bridge.y });
  assert.equal(realm._command(captain, 'takeCapturedHelm', {}).ok, true); assert.equal(target.helmOwner, captain.id); assert.equal(captain.game.state.mode, 'ship'); assert.equal(captain.ownedVesselId, source.id);
  const before = target.ship.x; realm.acceptInput(captain, 1, { thrust: 1 }); tick(realm, 8); assert.ok(target.ship.x > before); assert.equal(captain.game.state.ship, source.ship);
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence: realm.persistence });
  assert.equal(restored.vessels.get(target.id).helmOwner, captain.id); assert.equal(restored.captains.get(captain.id).aboard, target.id); assert.notEqual(restored.vessels.get(target.id).ship, restored.vessels.get(source.id).ship);
});

test('player ship fire is protected by default and becomes bilateral only after a nearby helm declares hostility', async () => {
  const { realm, captains: [one, two], vessels: [source, target], room } = await fixture(); target.ship.shield = 0;
  const shooter = realm._actor(source); shooter.fireWeapons(one.id); tick(realm, 10); assert.equal(target.ship.hull, target.ship.maxHull);
  target.ship.x = 1500; assert.equal(realm._command(one, 'declareHostility', { vesselId: target.id }).ok, false);
  target.ship.x = 130; realm._cabin(one, source); assert.equal(realm._command(one, 'declareHostility', { vesselId: target.id }).ok, false);
  one.game.state.mode = 'ship'; one.game.state.interior = null; source.helmOwner = one.id; one.crewRole = 'helm';
  assert.equal(realm._command(one, 'declareHostility', { vesselId: target.id }).ok, true); assert.equal(realm._shipsHostile(target, source), true);
  room.runtime.bullets = []; target.ship.shield = 0; shooter._shotTimer = 0; shooter.fireWeapons(one.id); tick(realm, 10); assert.ok(target.ship.hull < target.ship.maxHull);
  assert.equal(realm._canHostileBoard(one, target), false, 'A healthy hull still rejects a hostile boarder.');
});

test('both unattended source and boarded target remain vulnerable to actual third-party pulses', async () => {
  const { realm, captains: [boarder, raider], vessels: [source, third], room } = await fixture(); third.ship.x = -160;
  const enemy = enemyFixture(room, source); realm._command(boarder, 'boardEnemy', { id: enemy.id }); const target = realm.vessels.get(boarder.aboard);
  source.ship.shield = 0; assert.equal(realm._command(raider, 'declareHostility', { vesselId: source.id }).ok, true);
  const gun = realm._actor(third); gun.fireWeapons(raider.id); tick(realm, 10); assert.ok(source.ship.hull < source.ship.maxHull); assert.equal(boarder.aboard, target.id);
  Object.assign(third.ship, { x: target.ship.x + 160, y: target.ship.y, angle: Math.PI }); gun._shotTimer = 0; const before = target.ship.hull; gun.fireWeapons(raider.id); tick(realm, 10);
  assert.ok(target.ship.hull < before); assert.equal(source.dockedAt, null); assert.equal(target.dockedAt, null);
});

test('PvP deck combat uses real people on one vessel, protects friendly crew and credits the attacker', async () => {
  const { realm, attacker, defender, target, source, captains } = await invade();
  assert.equal(attacker.aboard, target.id); assert.equal(defender.aboard, target.id); assert.equal(source.helmOwner, null); assert.equal(target.helmOwner, null);
  assert.equal(realm.roomInfo(attacker).id, realm.roomInfo(defender).id); assert.equal(realm.snapshotFor(attacker).players.find(p => p.captainId === defender.id).team, 'hostile');
  const attackerView = realm.snapshotFor(attacker).state.boarding, defenderView = realm.snapshotFor(defender).state.boarding;
  assert.ok(attackerView.enemies.some(person => person.id === defender.id && person.human)); assert.ok(defenderView.enemies.some(person => person.id === attacker.id));
  const friendly = captains[2]; realm._cabin(friendly, target); friendly.boardingTeam = target.ownerId;
  closePeople(realm, target, [defender, friendly]); assert.equal(realm._command(defender, 'attackBoarder', { enemyId: friendly.id }).ok, false); assert.equal(friendly.game.state.person.health, 100);
  realm._landCharacter(friendly, 'hearth', 'kettle');
  closePeople(realm, target, [attacker, defender]); const before = defender.game.state.person.health;
  assert.equal(realm._command(attacker, 'attackBoarder', { enemyId: defender.id }).ok, true); assert.equal(defender.game.state.person.health, before - SIDEARM.damage);
  const events = realm.snapshotFor(attacker).events; assert.ok(events.some(event => event.type === 'person-shot' && event.attackerId === attacker.id && event.targetId === defender.id && event.damage === SIDEARM.damage));
  assert.equal(realm._command(friendly, 'takeCapturedHelm', {}).ok, false);
});

test('a killed owner recovers outside the occupied hull; capture and restart retain its location and damage', async () => {
  const { realm, attacker, defender, target } = await invade(); defender.home = { kind: 'bunk', vesselId: target.id, bunkIndex: 0, systemId: 'hearth', locationId: `ship:${target.id}` };
  closePeople(realm, target, [attacker, defender]); defender.game.state.person.health = 24; const pose = { x: target.ship.x, y: target.ship.y, hull: target.ship.hull };
  assert.equal(realm._command(attacker, 'attackBoarder', { enemyId: defender.id }).ok, true);
  assert.equal(defender.aboard, null); assert.equal(defender.game.state.interior, null); assert.equal(defender.game.state.locationId, 'kettle'); assert.notEqual(defender.ownedVesselId, target.id);
  assert.deepEqual({ x: target.ship.x, y: target.ship.y, hull: target.ship.hull }, pose); assert.equal(target.dockedAt, null); assert.equal(realm._canBoard(defender, target), false);
  assert.equal(realm._command(attacker, 'takeCapturedHelm', {}).code, 'distance'); const bridge = realm._surface(attacker).entities.find(entity => entity.data?.stationRole === 'helm'); Object.assign(attacker.game.state.person, bridge);
  assert.equal(realm._command(attacker, 'takeCapturedHelm', {}).ok, true); assert.equal(target.occupation.controllerId, attacker.id); assert.equal(target.ownerId, defender.id);
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence: realm.persistence }), recovered = restored.captains.get(defender.id), captured = restored.vessels.get(target.id);
  assert.equal(captured.ship.hull, pose.hull); assert.equal(captured.ship.x, pose.x); assert.equal(captured.ship.y, pose.y); assert.equal(captured.occupation.controllerId, attacker.id);
  restored._restoreAtHome(recovered); assert.equal(recovered.aboard, null); assert.equal(captured.dockedAt, null); assert.equal(captured.ship.hull, pose.hull);
  assert.notEqual(captured.ship, recovered.game.state.ship, 'A new recovery cutter never aliases the stolen hull.');
});

test('hired defenders take real damage and a living guard prevents commandeering the bridge', async () => {
  const { realm, captains: [attacker, defender], vessels: [source, target] } = await fixture();
  defender.game.state.crew = [{ id: 'guard', name: 'Guard', role: 'security', health: 24, maxHealth: 140 }]; target.ship.hull = 30; target.ship.shield = 0;
  realm._command(attacker, 'declareHostility', { vesselId: target.id }); realm._command(attacker, 'boardHostileShip', { vesselId: target.id });
  realm._landCharacter(defender, 'hearth', 'kettle'); assert.equal(realm._canTakeCapturedHelm(attacker, target), false);
  const guard = target.pvp.crewActors[0]; Object.assign(attacker.game.state.person, { x: guard.x, y: guard.y });
  const shot = realm._command(attacker, 'attackBoarder', { enemyId: guard.id }); assert.equal(shot.ok, true); assert.equal(defender.game.state.crew[0].health, 0); assert.equal(defender.game.state.crew[0].dead, true);
  assert.equal(realm._canTakeCapturedHelm(attacker, target), true); assert.ok(defender.game.state.memorial.some(entry => entry.crewId === 'guard')); assert.equal(source.dockedAt, null);
});

test('destroying an abandoned source does not teleport the boarder, and destroying the target evacuates its occupants without repairing either hull', async () => {
  const { realm, captains: [captain], vessels: [source], room } = await fixture(1), enemy = enemyFixture(room, source);
  realm._command(captain, 'boardEnemy', { id: enemy.id }); const target = realm.vessels.get(captain.aboard), pose = { x: target.ship.x, y: target.ship.y };
  realm._actor(source)._damageShip(9999); realm._syncActor(source); assert.equal(source.ship.hull, 0); assert.equal(source.destroyed, true); assert.equal(captain.aboard, target.id);
  realm._actor(target)._damageShip(9999); realm._syncActor(target); assert.equal(target.ship.hull, 0); assert.equal(target.destroyed, true); assert.equal(captain.aboard, null); assert.equal(captain.game.state.locationId, 'kettle');
  assert.deepEqual({ x: target.ship.x, y: target.ship.y }, pose); assert.equal(source.ship.hull, 0); assert.notEqual(captain.ownedVesselId, source.id); assert.equal(realm.vessels.get(captain.ownedVesselId).name, 'Recovery cutter');
});

test('friendly transfers leave physical ships in space and return requires a live nearby tether', async () => {
  const { realm, captains: [one, two], vessels: [source, target] } = await fixture(); target.allowCrew = true;
  const before = { x: source.ship.x, y: source.ship.y }; assert.equal(realm._command(one, 'boardShip', { vesselId: target.id }).ok, true);
  assert.equal(source.dockedAt, null); assert.deepEqual({ x: source.ship.x, y: source.ship.y }, before); assert.equal(one.returnVesselId, source.id);
  source.ship.x = 1500; assert.equal(realm._command(one, 'returnToOwnShip', {}).ok, false); source.ship.x = before.x;
  assert.equal(realm._command(one, 'returnToOwnShip', {}).ok, true); assert.equal(one.aboard, source.id); assert.equal(two.aboard, target.id);
});


test('an authentic v0.2.1 active assault migrates without overwriting the source ship, friend, crew, wounds, credits or quest progress', async () => {
  const legacy = JSON.parse(await readFile(new URL('../fixtures/realm-v021-boarding.json', import.meta.url), 'utf8'));
  for (const c of Object.values(legacy.captains)) c.lastSeen = Date.now();
  const before = structuredClone(legacy), ownerId = 'captain_legacy_owner', friendId = 'captain_legacy_friend', sourceId = before.captains[ownerId].ownedVesselId;
  const realm = new Realm({ id: legacy.realmId, snapshot: legacy, persistence: storage() }), captain = realm.captains.get(ownerId), friend = realm.captains.get(friendId), source = realm.vessels.get(sourceId), target = realm.vessels.get(captain.aboard);
  assert.notEqual(target.id, source.id); assert.equal(captain.ownedVesselId, source.id); assert.equal(captain.returnVesselId, source.id); assert.equal(friend.aboard, source.id);
  assert.deepEqual(source.ship, before.vessels[sourceId].ship); assert.equal(source.ship, captain.game.state.ship); assert.notEqual(source.ship, target.ship);
  assert.equal(captain.game.state.credits, 477); assert.equal(captain.game.state.cargo.ore, 13); assert.ok(captain.game.state.flags.includes('legacy-quest-kept')); assert.equal(captain.game.state.person.health, 61);
  assert.equal(realm._crewFor(source)[0].health, 78); assert.deepEqual(realm._crewFor(target), []); assert.equal(target.boarding.enemies[0].health, 19); assert.equal(target.boarding.enemies[1].health, 0);
  assert.equal(realm.snapshotFor(captain).state.ship.id, target.id); assert.equal(realm.snapshotFor(friend).state.boarding, null);
  realm.attach(captain, { close() {} }); assert.equal(captain.aboard, target.id); assert.equal(captain.game.state.person.health, 61);
  Object.assign(captain.game.state.person, cabinLayout(target.ship.classId).spawn); assert.equal(realm._command(captain, 'returnToOwnShip', {}).ok, true); assert.equal(captain.aboard, source.id);
  assert.equal(realm._command(captain, 'boardEnemy', { id: 'legacy-raider' }).ok, true); assert.equal(target.boarding.enemies[0].health, 19);
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence: storage() }); assert.equal(restored.vessels.size, realm.vessels.size, 'Migration is idempotent after durable save.');
  assert.equal(restored.vessels.get(sourceId).ship.hull, source.ship.hull); assert.equal(restored.vessels.get(target.id).boarding.enemies[0].health, 19);
});


test('v0.2.1 normal play and an existing defensive boarding keep the same ship, crew and combat state', async () => {
  const authentic = JSON.parse(await readFile(new URL('../fixtures/realm-v021-boarding.json', import.meta.url), 'utf8'));
  for (const defensive of [false, true]) {
    const snapshot = structuredClone(authentic), owner = snapshot.captains.captain_legacy_owner, id = owner.ownedVesselId, vessel = snapshot.vessels[id];
    delete vessel.combatInterior; delete vessel.boardingLeaderId;
    if (defensive) { owner.game.boarding.kind = 'defense'; owner.game.boarding.vesselId = id; owner.game.interior.kind = 'ship'; owner.game.interior.location.id = `ship:${id}`; owner.game.locationId = `ship:${id}`; }
    else { owner.game.boarding = null; owner.game.interior = null; owner.game.locationId = null; owner.game.mode = 'ship'; vessel.helmOwner = owner.id; }
    const before = structuredClone(snapshot), realm = new Realm({ id: snapshot.realmId, snapshot, persistence: storage() }), loaded = realm.captains.get(owner.id), hull = realm.vessels.get(id);
    assert.equal(realm.vessels.size, Object.keys(before.vessels).length); assert.equal(loaded.ownedVesselId, id); assert.equal(loaded.aboard, id); assert.deepEqual(hull.ship, before.vessels[id].ship);
    assert.equal(loaded.game.state.credits, 477); assert.equal(loaded.game.state.cargo.ore, 13); assert.equal(realm._crewFor(hull)[0].health, 78); assert.ok(loaded.game.state.flags.includes('legacy-quest-kept'));
    if (defensive) { assert.equal(hull.boarding.kind, 'defense'); assert.equal(hull.boarding.enemies[0].health, 19); assert.equal(hull.boarding.enemies[1].health, 0); assert.equal(realm.snapshotFor(loaded).state.boarding.phase, 'active'); }
    else assert.equal(realm.snapshotFor(loaded).state.boarding, null);
  }
});
