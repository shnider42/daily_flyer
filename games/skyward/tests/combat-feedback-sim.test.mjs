import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightSimulation } from '../public/sim.mjs';
import { createArenaMission } from '../public/arena.mjs';
import { getAircraft, getMission } from '../public/campaign.mjs';
import { orientationFromEuler } from '../public/orientation.mjs';

const roster = [
  { id: 'host', name: 'Lead', aircraft: 'f16', startMode: 'airborne' },
  { id: 'guest', name: 'Wing', aircraft: 'camel', startMode: 'airborne' },
];
function arena(mode = 'dogfight', local = 'host') {
  const config = { mode, mapId: 'canyon', durationSeconds: 300 };
  return new FlightSimulation(createArenaMission(config), { playerId: local })
    .configureMultiplayer({ mode, config, players: roster, playerId: local, hostId: 'host', runId: 'feedback-run' });
}
function place(pose, x = 0, y = 3000, z = 0) {
  Object.assign(pose, { x, y, z, heading: 0, pitch: 0, roll: 0, orientation: orientationFromEuler(0, 0, 0),
    onGround: false, alive: true, crashed: false });
  return pose;
}
function incoming(sim, type = 'bullet', damage = 17, overrides = {}) {
  const p = sim.player;
  const projectile = { id: `incoming-${type}`, type, x: p.x - 100, y: p.y, z: p.z,
    vx: 1000, vy: 0, vz: 0, speed: 1000, life: 2, owner: 'enemy', targetId: 'player',
    targetPlayerId: p.id, targetLifeId: p.lifeId, damage, ...overrides };
  sim.projectiles.push(projectile); sim._advanceProjectiles(.2);
  return projectile;
}
const damageEvents = sim => sim.events.filter(event => event.kind === 'damage');

test('an accepted PvP gun hit names the damaged life and immutable incoming direction', () => {
  const sim = arena(), victim = sim.participants.get('guest');
  place(sim.player); place(victim.pose, 0, 3000, 200);
  const health = victim.health, source = { x: 0, y: 3000, z: 0 };
  assert.equal(sim._shoot(sim.player), true);
  const [event] = damageEvents(sim);
  assert.equal(damageEvents(sim).length, 1);
  assert.equal(event.targetId, 'guest'); assert.equal(event.targetLifeId, 1);
  assert.equal(event.weapon, 'gun'); assert.equal(event.damage, health - victim.health);
  assert.equal(event.health, victim.health); assert.equal(event.maxHealth, getAircraft('camel').health);
  assert.equal(event.damageId, victim.damageId); assert.equal(event.at, sim.time);
  assert.deepEqual(event.source, source); assert.deepEqual(event.position, { x: 0, y: 3000, z: 200 });
  assert.equal(victim.lastDamage.eventId, event.id); assert.equal(victim.pose.lastDamage, victim.lastDamage);
  assert.equal(sim.player.lastDamage, null, 'firing does not make the shooter report damage');
  sim.player.x = 900; victim.pose.z = 600;
  assert.deepEqual(event.source, source); assert.equal(event.position.z, 200);
});

test('solo bullet and missile hits carry distinct receipts with their approach positions', () => {
  for (const type of ['bullet', 'missile']) {
    const sim = new FlightSimulation(createArenaMission({}, 'f16')); place(sim.player);
    const health = sim.player.health, shot = incoming(sim, type);
    assert.equal(shot.life, 0); assert.equal(sim.player.health, health - 17);
    const event = damageEvents(sim)[0];
    assert.equal(event.weapon, type); assert.equal(event.targetId, 'local'); assert.equal(event.targetLifeId, 1);
    assert.deepEqual(event.source, { x: -100, y: 3000, z: 0 });
    assert.equal(sim.player.lastDamage.eventId, event.id); assert.equal(sim.player.damageId, 1);
    assert.equal(sim.events.some(event => event.kind === 'hit'), false, 'the old untargeted hit cue is not duplicated');
  }
});

test('flak reports only actual solo damage while retaining its existing one-health floor', () => {
  const sim = new FlightSimulation(createArenaMission({}, 'f16')); place(sim.player);
  sim.targets = [{ id: 'flak', type: 'flak', hazard: true, health: 100, x: 100, y: 3000, z: 0, radius: 1200, fireTimer: 0 }];
  sim._random = () => .5; sim.player.health = 3;
  sim._advanceHazards(.05);
  assert.equal(sim.player.health, 1); assert.equal(damageEvents(sim)[0].damage, 2);
  assert.equal(damageEvents(sim)[0].weapon, 'flak');
  assert.deepEqual(damageEvents(sim)[0].source, { x: 0, y: 3000, z: 0 });
  sim.targets[0].fireTimer = 0; sim._advanceHazards(.05);
  assert.equal(damageEvents(sim).length, 1, 'a burst causing no further health loss has no damage receipt');
});

test('invulnerable, nonauthoritative, and peaceful-flight strikes do not report false damage', () => {
  for (const reason of ['invulnerable', 'guest', 'freeflight']) {
    const sim = arena(reason === 'freeflight' ? 'freeflight' : 'dogfight'), victim = sim.participants.get('guest');
    if (reason === 'invulnerable') victim.invulnerableUntil = 10;
    if (reason === 'guest') sim.worldAuthority = false;
    const health = victim.health;
    assert.equal(sim._damageParticipant(victim, 20, 'host', 'gun', sim.player), false);
    assert.equal(victim.health, health); assert.equal(victim.lastDamage, null); assert.equal(damageEvents(sim).length, 0);
    assert.equal(sim.effects.length, 0);
  }
});

test('overkill reports the health actually lost and a new life cannot inherit old hit feedback', () => {
  const sim = arena(), guest = arena('dogfight', 'guest'), victim = sim.participants.get('guest');
  victim.health = victim.pose.health = 7;
  sim._damageParticipant(victim, 999, 'host', 'missile', sim.player);
  assert.equal(victim.lastDamage.damage, 7); assert.equal(victim.lastDamage.health, 0);
  assert.equal(victim.deaths, 1); assert.equal(sim.participants.get('host').kills, 1);
  const oldSnapshot = sim.getSnapshot(); guest.applySnapshot(oldSnapshot);
  assert.equal(guest.player.lastDamage.damage, 7);
  sim.time = victim.respawnAt; assert.equal(sim.requestRespawn('guest'), true);
  assert.equal(victim.lastDamage, null); assert.equal(victim.pose.lastDamage, null);
  guest.applySnapshot(sim.getSnapshot()); assert.equal(guest.player.lifeId, 2); assert.equal(guest.player.lastDamage, null);
  assert.equal(guest.applySnapshot(oldSnapshot), false); assert.equal(guest.player.lastDamage, null);
  const count = damageEvents(sim).length;
  sim.projectiles.push({ id: 'stale-missile', type: 'missile', x: victim.pose.x - 100, y: victim.pose.y, z: victim.pose.z,
    vx: 1000, vy: 0, vz: 0, life: 2, owner: 'host', targetId: 'guest', targetPlayerId: 'guest', targetLifeId: 1, damage: 999 });
  sim._advanceProjectiles(.2);
  assert.equal(victim.health, getAircraft('camel').health); assert.equal(damageEvents(sim).length, count);
});

test('a guest receives the last authoritative damage even after the shared event tail advances', () => {
  const host = arena(), guest = arena('dogfight', 'guest'), victim = host.participants.get('guest');
  host._damageParticipant(victim, 20, 'host', 'gun', host.player);
  for (let i = 0; i < 20; i++) host._event('radio', `Other event ${i}`);
  const snapshot = host.getSnapshot();
  assert.equal(snapshot.events.some(event => event.kind === 'damage'), false);
  assert.equal(guest.applySnapshot(snapshot), true);
  assert.deepEqual(guest.localParticipant.lastDamage, victim.lastDamage);
  assert.deepEqual(guest.player.lastDamage, victim.lastDamage);
  const health = guest.player.health;
  guest.applySnapshot(snapshot); assert.equal(guest.player.health, health, 'metadata never applies the damage twice');
});

test('both AC-130 seats identify the same damaged aircraft after a crew snapshot', () => {
  const host = new FlightSimulation(getMission('gunship-nightwatch'), { playerId: 'pilot' });
  const gunner = new FlightSimulation(getMission('gunship-nightwatch'), { playerId: 'gunner' });
  gunner.worldAuthority = false; place(host.player); incoming(host, 'missile', 25);
  const receipt = host.player.lastDamage; assert.equal(receipt.targetId, 'pilot');
  assert.equal(gunner.applySnapshot(host.getSnapshot()), true);
  assert.equal(gunner.player.id, 'pilot'); assert.equal(gunner.player.lastDamage.targetId, gunner.player.id);
  assert.equal(gunner.player.lastDamage.targetLifeId, gunner.player.lifeId);
  assert.deepEqual(gunner.player.lastDamage, receipt);
});

test('a missile intercepted by a canyon wall explodes without a received-damage event', () => {
  const sim = arena(), victim = sim.participants.get('guest');
  const branchZ = 2200 + 4000 * .45 + 420 * Math.sin(4000 / 1100);
  place(sim.player, 0, 400, 0); place(victim.pose, 4000, 400, branchZ);
  sim.projectiles.push({ id: 'ridge-missile', type: 'missile', x: 0, y: 400, z: 0,
    vx: 8000, vy: 0, vz: branchZ * 2, speed: 12000, life: 2, owner: 'host',
    targetId: 'guest', targetPlayerId: 'guest', targetLifeId: 1, damage: 999 });
  sim._advanceProjectiles(.5);
  assert.equal(victim.lastDamage, null); assert.equal(damageEvents(sim).length, 0);
  assert.ok(sim.effects.some(effect => effect.type === 'explosion'));
});
