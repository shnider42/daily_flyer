import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout, getShipClass } from '../../dist/fleet.mjs';
import { CROSSWIND_BODY_IDS } from '../../dist/warzone-content.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const persistence = { kind: 'warzone-credit-memory', async save(_id, version) { return { version: version + 1 }; } };
const mission = captain => captain.game.state.warzone.mission;
const tick = realm => realm.step(.1, realm.tick + 1, Date.now());

async function fixture(seed, { ownedGunnerShip = false } = {}) {
  const realm = new Realm({ id: 'WARCRED1', seed, persistence });
  const owner = (await realm.createCaptain('Owner ashore')).captain;
  const helm = (await realm.createCaptain('Borrowed helm', { startMode: 'hardcore' })).captain;
  const gunner = (await realm.createCaptain('First gunner', ownedGunnerShip ? {} : { startMode: 'hardcore' })).captain;
  const second = (await realm.createCaptain('Second gunner', { startMode: 'hardcore' })).captain;
  const captains = [owner, helm, gunner, second];
  for (const captain of captains) ok(realm.attach(captain, { close() {} }));
  const carrier = realm.vessels.get(owner.ownedVesselId), hull = getShipClass('corvette');
  Object.assign(carrier.ship, hull.stats, { classId: hull.id, hull: hull.stats.maxHull, shield: hull.stats.maxShield, energy: hull.stats.maxEnergy, dockedAt: null });
  carrier.systemId = 'crosswind'; carrier.dockedAt = null; carrier.helmOwner = null;
  for (const captain of [helm, gunner, second]) {
    carrier.grants[captain.id] = { allowed: true, roles: captain === helm ? ['helm'] : ['weapons'] };
    realm._cabin(captain, carrier); captain.crewRole = captain === helm ? 'helm' : 'weapons';
    Object.assign(captain.game.state.person, cabinLayout(carrier.ship.classId).stations.security);
  }
  carrier.helmOwner = helm.id; Object.assign(helm.game.state, { mode: 'ship', interior: null, locationId: null });
  realm._landCharacter(owner, 'crosswind', CROSSWIND_BODY_IDS.orsa);
  for (const captain of captains) { realm._bindCaptain(captain); ok(await realm.command(captain, 'warzoneAction', { action: 'join', factionId: 'freewake' })); }
  const room = realm._room('crosswind'), vey = room.runtime.bodies.find(body => body.id === CROSSWIND_BODY_IDS.vey); assert.ok(vey);
  Object.assign(carrier.ship, { x: vey.x + Math.min(900, vey.radius + 180), y: vey.y, vx: 0, vy: 0, angle: 0, angularVelocity: 0 });
  // Keep the actual damage and room-tick paths, but remove unrelated volleys
  // and reinforcements so these tests isolate whose work and credits count.
  const target = room.runtime.enemies.find(enemy => enemy.faction === 'meridian' && enemy.warzoneSize === 'massive'); assert.ok(target);
  Object.assign(target, { x: carrier.ship.x + 320, y: carrier.ship.y, vx: 0, vy: 0, disabled: true, active: false, warzoneExitAt: 1e9 });
  room.runtime.enemies = [target]; room.runtime.bullets = []; room.runtime.warzone.projectiles = [];
  room.runtime.warzone.nextPhaseAt = 1e9; room.runtime.warzone.nextBoardingAt = 1e9;
  for (const faction of room.runtime.warzone.factions) room.runtime.warzone.nextWaveAt[faction] = 1e9;
  return { realm, owner, helm, gunner, second, carrier, target };
}

function hit(fixture, captain) {
  const { realm, carrier, target } = fixture, before = target.hp, actor = realm._actor(carrier);
  actor._shotTimer = 0; carrier.ship.energy = carrier.ship.maxEnergy;
  ok(actor.fireWeapons(captain.id));
  for (let index = 0; index < 12 && target.hp === before; index++) tick(realm);
  const damage = before - target.hp; assert.ok(damage > 0, 'a real authoritative projectile must hit the fleet hull');
  return damage;
}

test('borrowed helm and physical crew accrue one duty tick each while the owner ashore accrues none', async () => {
  const f = await fixture('warzone-duty-credit'), { realm, owner, helm, gunner, second, carrier } = f;
  assert.equal(carrier.ownerId, owner.id); assert.equal(carrier.helmOwner, helm.id); assert.equal(helm.ownedVesselId, null);
  tick(realm);
  assert.equal(mission(owner).seconds, 0);
  for (const captain of [helm, gunner, second]) assert.ok(Math.abs(mission(captain).seconds - .1) < 1e-8, `${captain.name} must count exactly one physical room tick`);
  realm._landCharacter(gunner, 'crosswind', CROSSWIND_BODY_IDS.orsa); tick(realm);
  assert.ok(Math.abs(mission(gunner).seconds - .1) < 1e-8, 'being ashore cannot accumulate the borrowed carrier’s flight duty');
  assert.ok(Math.abs(mission(helm).seconds - .2) < 1e-8); assert.equal(mission(owner).seconds, 0);
});

test('an empty owned hull cannot suppress duty aboard a borrowed ship or substitute its own approach position', async () => {
  const { realm, owner, helm, gunner, carrier } = await fixture('warzone-empty-owned-hull', { ownedGunnerShip: true });
  const empty = realm.vessels.get(gunner.ownedVesselId), vey = realm._room('crosswind').runtime.bodies.find(body => body.id === CROSSWIND_BODY_IDS.vey);
  assert.ok(empty); assert.notEqual(empty.id, carrier.id); assert.equal(gunner.aboard, carrier.id);
  empty.systemId = 'crosswind'; empty.dockedAt = null; empty.helmOwner = null; empty.actor = null;
  Object.assign(empty.ship, { x: -6000, y: -4800, vx: 0, vy: 0, angularVelocity: 0 });
  const actualPosition = { x: carrier.ship.x, y: carrier.ship.y };
  tick(realm);
  assert.ok(empty.actor, 'the empty owned hull participates in the same authoritative room tick');
  assert.equal(empty.actor.state.warzone, gunner.game.state.warzone, 'the hull proxy shares its owner’s personal mission state');
  assert.ok(Math.abs(mission(gunner).seconds - .1) < 1e-8, 'the actual borrowed-carrier context must earn exactly one tick');
  assert.ok(Math.abs(mission(helm).seconds - .1) < 1e-8); assert.equal(mission(owner).seconds, 0);
  Object.assign(carrier.ship, { x: vey.x + 2400, y: vey.y, vx: 0, vy: 0 });
  Object.assign(empty.ship, { ...actualPosition, vx: 0, vy: 0 });
  tick(realm);
  assert.ok(Math.abs(mission(gunner).seconds - .1) < 1e-8, 'an empty owned hull inside the approach cannot stand in for the occupied carrier outside it');
  Object.assign(carrier.ship, { ...actualPosition, vx: 0, vy: 0 });
  realm._landCharacter(gunner, 'crosswind', CROSSWIND_BODY_IDS.orsa); tick(realm);
  assert.ok(Math.abs(mission(gunner).seconds - .1) < 1e-8, 'an ashore captain must remain ineligible even with both hulls near Vey');
});

test('each gunner receives their own confirmed hull damage and the actual commander receives crew damage without crediting the owner', async () => {
  const f = await fixture('warzone-crew-hits'), { owner, helm, gunner, second, carrier, realm } = f;
  const firstDamage = hit(f, gunner);
  assert.equal(mission(gunner).damage, Math.min(180, firstDamage)); assert.equal(mission(helm).damage, Math.min(180, firstDamage));
  assert.equal(mission(second).damage, 0); assert.equal(mission(owner).damage, 0);
  const secondDamage = hit(f, second);
  assert.equal(mission(gunner).damage, Math.min(180, firstDamage)); assert.equal(mission(second).damage, Math.min(180, secondDamage));
  assert.equal(mission(helm).damage, Math.min(180, firstDamage + secondDamage)); assert.equal(mission(owner).damage, 0);
  for (const captain of [helm, gunner, second]) assert.ok(captain.game.state.warzone.hostileFactions.includes('meridian'));
  assert.deepEqual(owner.game.state.warzone.hostileFactions, []); assert.ok(carrier.warzoneHostileFactions.includes('meridian'));
  const restored = new Realm({ id: realm.id, snapshot: realm.document(), persistence }), savedCarrier = restored.vessels.get(carrier.id);
  assert.deepEqual(savedCarrier.warzoneHostileFactions, carrier.warzoneHostileFactions);
  assert.equal(mission(restored.captains.get(helm.id)).damage, mission(helm).damage);
  assert.equal(mission(restored.captains.get(owner.id)).damage, 0);
});

test('commander and contributing gunner are paid 220 once each, with no owner credit or replay after a realm restart', async () => {
  let f = await fixture('warzone-once-payment'); const { owner, helm, gunner, second } = f;
  for (const captain of [helm, gunner]) Object.assign(mission(captain), { seconds: 45, damage: 179 });
  const before = new Map([owner, helm, gunner, second].map(captain => [captain.id, captain.game.state.credits]));
  hit(f, gunner);
  assert.equal(helm.game.state.credits, before.get(helm.id) + 220); assert.equal(gunner.game.state.credits, before.get(gunner.id) + 220);
  assert.equal(owner.game.state.credits, before.get(owner.id)); assert.equal(second.game.state.credits, before.get(second.id));
  assert.equal(mission(helm).status, 'complete'); assert.equal(mission(gunner).paid, true);
  hit(f, gunner); for (let index = 0; index < 3; index++) tick(f.realm);
  const next = new Realm({ id: f.realm.id, snapshot: f.realm.document(), persistence });
  const nextOwner = next.captains.get(owner.id), nextHelm = next.captains.get(helm.id), nextGunner = next.captains.get(gunner.id), nextSecond = next.captains.get(second.id);
  for (const captain of [nextOwner, nextHelm, nextGunner, nextSecond]) ok(next.attach(captain, { close() {} }));
  f = { realm: next, owner: nextOwner, helm: nextHelm, gunner: nextGunner, second: nextSecond, carrier: next.vessels.get(f.carrier.id), target: next._room('crosswind').runtime.enemies.find(enemy => enemy.id === f.target.id) };
  assert.ok(f.target); hit(f, nextGunner);
  for (const captain of [nextHelm, nextGunner]) {
    ok(await next.command(captain, 'warzoneAction', { action: 'join', factionId: 'freewake' }));
    assert.equal(captain.game.state.credits, before.get(captain.id) + 220); assert.equal(mission(captain).status, 'complete'); assert.equal(mission(captain).paid, true);
  }
  assert.equal(nextOwner.game.state.credits, before.get(owner.id)); assert.equal(nextSecond.game.state.credits, before.get(second.id));
});

test('a guest gunner cannot finish an absent owner’s sortie when nobody occupies the helm', async () => {
  const f = await fixture('warzone-vacant-helm'), { realm, carrier, owner, helm, gunner } = f;
  realm._cabin(helm, carrier); helm.crewRole = 'passenger'; carrier.helmOwner = null;
  for (const captain of [owner, gunner]) Object.assign(mission(captain), { seconds: 45, damage: 179 });
  const ownerCredits = owner.game.state.credits, gunnerCredits = gunner.game.state.credits;
  hit(f, gunner);
  assert.equal(mission(gunner).status, 'complete'); assert.equal(gunner.game.state.credits, gunnerCredits + 220);
  assert.equal(mission(owner).damage, 179); assert.equal(mission(owner).status, 'active');
  assert.equal(owner.game.state.credits, ownerCredits, 'ownership alone does not earn a physical sortie payment');
});

for (const occupied of [true, false]) test(`a promoted warship preserves gunner credit with ${occupied ? 'a borrowed' : 'a vacant'} helm and never rewards the absent owner`, async () => {
  const f = await fixture(`warzone-promoted-credit-${occupied}`), { realm, carrier, owner, helm, gunner, second, target } = f;
  target.hp = Math.floor(target.maxHp * .35); target.x = carrier.ship.x + carrier.ship.radius + target.radius + 65;
  Object.assign(second.game.state.person, cabinLayout(carrier.ship.classId).spawn);
  const result = ok(await realm.command(second, 'boardEnemy', { id: target.id }));
  const promoted = realm.vessels.get(result.vesselId); assert.ok(promoted); assert.equal(target.canonicalVesselId, promoted.id);
  promoted.ship.shield = 0;
  if (!occupied) { realm._cabin(helm, carrier); helm.crewRole = 'passenger'; carrier.helmOwner = null; }
  for (const captain of [owner, helm, gunner]) Object.assign(mission(captain), { seconds: 45, damage: 179 });
  const before = new Map([owner, helm, gunner].map(captain => [captain.id, captain.game.state.credits]));
  hit(f, gunner);
  assert.equal(gunner.game.state.credits, before.get(gunner.id) + 220); assert.equal(mission(gunner).status, 'complete');
  assert.equal(helm.game.state.credits, before.get(helm.id) + (occupied ? 220 : 0));
  assert.equal(owner.game.state.credits, before.get(owner.id)); assert.equal(mission(owner).damage, 179);
  assert.ok(carrier.warzoneHostileFactions.includes('meridian'));
  assert.ok(gunner.game.state.warzone.hostileFactions.includes('meridian'));
});
