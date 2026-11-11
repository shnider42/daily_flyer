import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout, enemyHullProfile } from '../../dist/fleet.mjs';
import { SIDEARM, getPersonalWeapon } from '../../dist/combat.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const storage = () => ({ kind: 'memory', save: async (_id, version) => ({ version: version + 1 }) });
async function fixture(modes = ['regular', 'hardcore']) {
  const realm = new Realm({ id: 'GEAR1234', seed: 'personal-gear-authority', persistence: storage() }), captains = [];
  for (const [index, startMode] of modes.entries()) {
    const { captain } = await realm.createCaptain(`Gear captain ${index + 1}`, { startMode }); ok(realm.attach(captain, { close() {} }));
    const vessel = realm.vessels.get(captain.ownedVesselId); if (vessel) { vessel.dockedAt = 'kettle'; vessel.helmOwner = null; }
    realm._landCharacter(captain, 'hearth', 'kettle'); realm._bindCaptain(captain);
    const shop = realm._surface(captain).entities.find(entity => entity.type === 'mechanic'); assert.ok(shop); Object.assign(captain.game.state.person, { x: shop.x, y: shop.y });
    captain.game.state.stats.jobs = 18; captain.game.state.visited = realm.galaxy.slice(0, 8).map(system => system.id); captain.game.state.credits = 9000; captains.push(captain);
  }
  return { realm, captains };
}
function space(realm, captain, x) {
  const vessel = realm.vessels.get(captain.ownedVesselId); captain.game.state.fleet.owned.push('tern'); captain.game._activateClass('tern', true);
  vessel.dockedAt = null; Object.assign(vessel.ship, { x, y: 0, angle: 0, vx: 0, vy: 0 }); realm._cabin(captain, vessel);
  captain.game.state.mode = 'ship'; captain.game.state.interior = null; captain.game.state.locationId = null; captain.crewRole = 'helm'; vessel.helmOwner = captain.id; return vessel;
}

test('the authority validates the real mechanic, actual progress, and exact personal charge', async () => {
  const { realm, captains: [captain, other] } = await fixture(), game = captain.game, funds = game.state.credits, original = { x: game.state.person.x, y: game.state.person.y };
  game.state.person.x += 200;
  assert.equal((await realm.command(captain, 'buyPersonalWeapon', { id: 'field-carbine', ...original, entityType: 'mechanic' })).code, 'distance');
  Object.assign(game.state.person, original); game.state.stats.jobs = 0; game.state.visited = ['hearth', 'hearth/kettle', 'hearth/morrow'];
  assert.equal((await realm.command(captain, 'buyPersonalWeapon', { id: 'field-carbine', jobs: 100, visited: realm.galaxy.map(value => value.id), credits: 100000 })).code, 'requirements');
  assert.equal(game.state.credits, funds);
  game.state.stats.jobs = 6; game.state.visited = realm.galaxy.slice(0, 3).map(value => value.id);
  const args = { id: 'field-carbine', captainId: other.id, cost: 0, damage: 99999, weapon: { damage: 99999 }, ownedWeapons: ['breach-rifle'] };
  const first = ok(await realm.command(captain, 'buyPersonalWeapon', args, 'personal-purchase'));
  assert.equal(game.state.credits, funds - 1400); assert.equal(other.game.state.credits, 9000); assert.equal(first.weapon.damage, 38); assert.equal(getPersonalWeapon(game.state.person).id, 'field-carbine');
  assert.deepEqual(ok(await realm.command(captain, 'buyPersonalWeapon', args, 'personal-purchase')), first); assert.equal(game.state.credits, funds - 1400);
  assert.equal((await realm.command(captain, 'buyPersonalWeapon', args)).code, 'owned'); assert.equal((await realm.command(captain, 'equipPersonalWeapon', { id: 'breach-rifle' })).code, 'owned');
});

test('shipless personal equipment persists aboard a borrowed hull without revealing or borrowing the owner’s inventory', async () => {
  const { realm, captains: [owner, guest] } = await fixture();
  ok(await realm.command(owner, 'buyPersonalWeapon', { id: 'breach-rifle' })); ok(await realm.command(guest, 'buyPersonalWeapon', { id: 'field-carbine' }));
  assert.equal(guest.ownedVesselId, null); assert.equal(guest.game.ownsShip, false);
  const carrier = realm.vessels.get(owner.ownedVesselId); owner.game.state.fleet.owned.push('tern'); owner.game._activateClass('tern', true);
  carrier.grants[guest.id] = { allowed: true, roles: ['security'], allowBunk: true }; realm._cabin(owner, carrier); realm._cabin(guest, carrier);
  const full = realm.snapshotFor(guest), compact = realm.snapshotFor(guest, { compact: true }), publicGuest = realm.snapshotFor(owner).players.find(person => person.captainId === guest.id);
  assert.deepEqual(full.state.person.ownedWeapons, ['pulse-sidearm', 'field-carbine']); assert.deepEqual(compact.state.person.ownedWeapons, full.state.person.ownedWeapons);
  assert.equal(full.state.person.weapon, 'field-carbine'); assert.equal(publicGuest.weapon, 'field-carbine'); assert.equal(Object.hasOwn(publicGuest, 'ownedWeapons'), false);
  assert.equal((await realm.command(guest, 'equipPersonalWeapon', { id: SIDEARM.id, captainId: owner.id })).code, 'distance');
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence: storage() }), returning = restored.captains.get(guest.id);
  assert.equal(returning.ownedVesselId, null); assert.equal(returning.aboard, carrier.id); assert.equal(getPersonalWeapon(returning.game.state.person).id, 'field-carbine');
  assert.deepEqual(returning.game.state.person.ownedWeapons, ['pulse-sidearm', 'field-carbine']); assert.equal(restored.captains.get(owner.id).game.state.person.weapon, 'breach-rifle');
  assert.equal(mergeSnapshot(full, compact).state.person.weapon, 'field-carbine');
});

test('upgraded player weapons fire on real NPC boarding decks using the caller’s gear and cooldown', async () => {
  const { realm, captains: [captain], } = await fixture(['regular']); ok(await realm.command(captain, 'buyPersonalWeapon', { id: 'field-carbine' }));
  const source = space(realm, captain, 0), room = realm._room('hearth'), enemy = { id: 'personal-gear-raider', name: 'Disabled transport', faction: 'covenant', ...enemyHullProfile('hauler'), x: 130, y: 0, hp: 35, maxHp: 100, shield: 0, disabled: true, active: false, cooldown: 99, speed: 0, damage: 5, reward: 0 };
  room.runtime.enemies.push(enemy); room.record.spawned.push(structuredClone(enemy)); ok(realm._command(captain, 'boardEnemy', { id: enemy.id }));
  const target = realm.vessels.get(captain.aboard), guard = target.boarding.enemies[0]; Object.assign(captain.game.state.person, { x: guard.x, y: guard.y }); guard.health = 100;
  const answer = ok(realm._command(captain, 'attackBoarder', { enemyId: guard.id, damage: 9999, weaponId: 'breach-rifle' }));
  assert.equal(answer.damage, 38); assert.equal(guard.health, 62); assert.equal(answer.shot.weaponId, 'field-carbine'); assert.equal(captain.game._boardingShotTimer, .36);
  assert.equal(realm._command(captain, 'attackBoarder', { enemyId: guard.id }).code, 'cooldown'); assert.equal(captain.ownedVesselId, source.id); assert.equal(captain.game.state.person.weapon, 'field-carbine');
});

test('hostile shared captains use their own upgraded damage, traits, and cooldown while NPC guards keep authored attacks', async () => {
  const { realm, captains: [attacker, defender] } = await fixture(['regular', 'regular']);
  ok(await realm.command(attacker, 'buyPersonalWeapon', { id: 'field-carbine' })); ok(await realm.command(defender, 'buyPersonalWeapon', { id: 'breach-rifle' }));
  attacker.game.state.character.traits = ['hot_cell']; defender.game.state.character.traits = ['quick_hands'];
  defender.game.state.crew = [{ id: 'ordinary-security', name: 'Security guard', role: 'security', health: 140, maxHealth: 140 }];
  const source = space(realm, attacker, 0), target = space(realm, defender, 130); target.ship.hull = target.ship.maxHull * .35; target.ship.shield = 0;
  ok(realm._command(attacker, 'declareHostility', { vesselId: target.id })); ok(realm._command(attacker, 'boardHostileShip', { vesselId: target.id }));
  const spawn = cabinLayout(target.ship.classId).spawn; Object.assign(attacker.game.state.person, spawn); Object.assign(defender.game.state.person, { x: spawn.x + 18, y: spawn.y });
  let answer = ok(realm._command(attacker, 'attackBoarder', { enemyId: defender.id, weaponId: 'breach-rifle' })); assert.equal(answer.damage, 47.5); assert.equal(defender.game.state.person.health, 52.5); assert.equal(answer.shot.weaponId, 'field-carbine');
  answer = ok(realm._command(defender, 'attackBoarder', { enemyId: attacker.id })); assert.equal(answer.damage, 72 * .85); assert.equal(attacker.game.state.person.health, 100 - 72 * .85); assert.equal(defender.game._boardingShotTimer, .65 * .8);
  const guard = target.pvp.crewActors[0]; Object.assign(guard, { x: spawn.x + 18, y: spawn.y, cooldown: 0 });
  const before = attacker.game.state.person.health; realm._actor(target); realm._stepPvP(target, .01, [attacker, defender]);
  assert.equal(attacker.game.state.person.health, before - guard.damage); assert.equal(guard.weapon, SIDEARM.id);
  const shot = attacker.events.findLast(event => event.type === 'person-shot' && event.attackerId === guard.id); assert.equal(shot.weaponId, SIDEARM.id); assert.equal(shot.damage, guard.damage); assert.equal(attacker.ownedVesselId, source.id);
});
