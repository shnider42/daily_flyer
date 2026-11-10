import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, getMission } from '../public/campaign.mjs';
import { FlightSimulation, terrainHeight } from '../public/sim.mjs';
import { createArenaMission } from '../public/arena.mjs';
import { NUCLEAR_PAYLOADS, getNuclearPayload, normalizePayload, nuclearDamageAtDistance, expandingBlastTime } from '../public/payloads.mjs';
import { orientationFromEuler } from '../public/orientation.mjs';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function flight(payload = 'atomic', aircraft = 'b2', altitude = 10000) {
  return new FlightSimulation({ ...structuredClone(getMission('first-light')), id: 'nuclear-test', kind: 'free', aircraft, payload,
    start: { x: 0, y: altitude, z: 0, speed: AIRCRAFT[aircraft].cruise, heading: 0, airborne: true },
    enemies: [], targets: [], waypoints: [], goal: {}, weather: { wind: { x: 0, z: 0 } } }, { autoLevel: false });
}
function fly(sim, seconds, controller = () => ({ throttle: sim.player.throttle })) {
  for (let t = 0; t < seconds && sim.status === 'flying'; t += .05) sim.step(.05, controller(sim));
}
function detonate(sim) {
  assert.equal(sim.action('payload'), true);
  const bomb = sim.projectiles.at(-1);
  Object.assign(bomb, { x: 0, y: Math.max(0, terrainHeight(0, 0, sim.mission)) + 4, z: 0, vx: 0, vy: -100, vz: 0 });
  sim._advanceProjectiles(.05);
  assert.equal(bomb.life, 0);
  assert.equal(sim.effects.at(-1).type, 'nuclear');
  return sim.effects.at(-1);
}
function wave(sim, seconds) {
  for (let t = 0; t < seconds; t += .05) {
    sim._advanceNuclearBlasts(.05);
    for (const effect of sim.effects) effect.age += .05;
  }
}
function multiplayer(mode = 'dogfight', local = 'host') {
  const config = { mode, mapId: 'canyon', durationSeconds: 300 };
  const players = ['host', 'guest'].map(id => ({ id, name: id, aircraft: 'b2', payload: 'atomic', startMode: 'airborne' }));
  const sim = new FlightSimulation({ ...createArenaMission(config, 'b2'), payload: 'atomic' }, { playerId: local, autoLevel: false })
    .configureMultiplayer({ ...config, config, players, playerId: local, hostId: 'host', runId: 'nuclear-round' });
  for (const record of sim.participants.values()) Object.assign(record.pose, { x: 0, y: 10000, z: 0, onGround: false });
  return sim;
}

test('nuclear loadouts are B-2 only and each tier escalates its fictional release floor and blast', () => {
  assert.equal(normalizePayload('f16', 'tsar'), 'conventional');
  assert.equal(normalizePayload('b2', 'unknown'), 'conventional');
  assert.equal(normalizePayload('b2', undefined, 'atomic'), 'atomic');
  assert.equal(getNuclearPayload('constructor'), null);
  const tiers = Object.values(NUCLEAR_PAYLOADS);
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].minimumAltitude > tiers[i - 1].minimumAltitude);
    assert.ok(tiers[i].blastRadius > tiers[i - 1].blastRadius);
    assert.ok(tiers[i].damage > tiers[i - 1].damage);
  }
  assert.equal(flight('tsar', 'f16').player.payload, 'conventional');
});

test('release checks terrain clearance, preserves ammunition below the floor, and launches a falling bomb', () => {
  for (const profile of Object.values(NUCLEAR_PAYLOADS)) {
    const sim = flight(profile.id), ground = Math.max(0, terrainHeight(0, 0, sim.mission));
    sim.player.y = ground + profile.minimumAltitude - 1;
    assert.equal(sim.action('payload'), false); assert.equal(sim.player.bombs, 1); assert.equal(sim.payloadCooldown, 0);
    sim.player.y = ground + profile.minimumAltitude;
    assert.equal(sim.action('payload'), true); assert.equal(sim.player.bombs, 0);
    const bomb = sim.projectiles[0];
    assert.equal(bomb.payload, profile.id); assert.equal(sim.effects.length, 0);
    const y = bomb.y; sim._advanceProjectiles(.05); assert.ok(bomb.y < y);
    assert.equal(sim.status, 'flying'); assert.equal(sim.nuclearThreat.phase, 'falling');
  }
  const sim = flight('atomic');
  sim.mission = { ...createArenaMission({ mapId: 'canyon' }, 'b2'), payload: 'atomic' };
  Object.assign(sim.player, { x: 1000, z: 4000 });
  const ground = terrainHeight(sim.player.x, sim.player.z, sim.mission);
  assert.ok(ground > 100);
  sim.player.y = ground + 899;
  assert.equal(sim.action('payload'), false, 'high sea-level altitude on a ridge is still below the AGL release floor');
});

test('an expanding blast kills close aircraft, severely damages the edge once, and spares aircraft outside it', () => {
  for (const fraction of [.15, .88, 1.05]) {
    const sim = flight(), effect = detonate(sim), profile = getNuclearPayload(effect.payload);
    Object.assign(sim.player, { x: profile.blastRadius * fraction, y: effect.y, z: 0 });
    for (const blast of sim.nuclearBlasts) blast.before.set(sim.player.id, { x: sim.player.x, y: sim.player.y, z: sim.player.z });
    wave(sim, profile.blastRadius / profile.waveSpeed + .1);
    const health = sim.player.health;
    if (fraction < .2) assert.equal(health, 0);
    else if (fraction < 1) assert.ok(health > 0 && health < AIRCRAFT.b2.health * .6);
    else assert.equal(health, AIRCRAFT.b2.health);
    wave(sim, 4); assert.equal(sim.player.health, health);
    assert.equal(sim.events.filter(event => event.kind === 'damage').length, fraction < 1 ? 1 : 0);
  }
});

test('wave collision catches a between-frame crossing and lets an aircraft outrun an unreached front', () => {
  const origin = { x: 0, y: 0, z: 0 };
  assert.ok(expandingBlastTime({ x: -300, y: 0, z: 0 }, { x: 300, y: 0, z: 0 }, origin, 100, 110) > 0);
  assert.equal(expandingBlastTime({ x: 300, y: 0, z: 0 }, { x: 600, y: 0, z: 0 }, origin, 100, 200), null);
  assert.equal(expandingBlastTime({ x: 0, y: 0, z: 0 }, origin, origin, 0, 1), 0);
  const sim = flight(), effect = detonate(sim);
  const blast = sim.nuclearBlasts[0];
  effect.age = .1;
  blast.before.set(sim.player.id, { x: -200, y: effect.y, z: 0 });
  Object.assign(sim.player, { x: 200, y: effect.y, z: 0 });
  sim._advanceNuclearBlasts(.05);
  assert.equal(sim.player.health, 0, 'the front crossing cannot tunnel between snapshots');
});

test('nuclear damage belongs to the authority and respects peaceful peers, self damage and life generations', () => {
  for (const mode of ['dogfight', 'freeflight', 'squadron']) {
    const sim = multiplayer(mode), effect = detonate(sim);
    for (const record of sim.participants.values()) {
      Object.assign(record.pose, { x: 300, y: effect.y, z: 0 });
      sim.nuclearBlasts[0].before.set(record.id, { x: 300, y: effect.y, z: 0 });
    }
    wave(sim, 1);
    assert.equal(sim.participants.get('host').alive, false, 'own nuclear blast is hazardous in every mode');
    assert.equal(sim.participants.get('guest').alive, mode !== 'dogfight');
    assert.equal(sim.participants.get('host').kills, mode === 'dogfight' ? 1 : 0);
  }
  const host = multiplayer(), effect = detonate(host), guest = host.participants.get('guest');
  host._killParticipant(guest, null); host.time = guest.respawnAt;
  assert.equal(host.requestRespawn('guest'), true);
  Object.assign(guest.pose, { x: 100, y: effect.y, z: 0 });
  guest.invulnerableUntil = 0;
  wave(host, 5); assert.equal(guest.health, AIRCRAFT.b2.health, 'old payload cannot damage a fresh life');
  assert.equal(guest.pose.payload, 'atomic');
  const client = multiplayer('dogfight', 'guest');
  const before = client.player.health;
  assert.equal(client.applySnapshot(host.getSnapshot()), true);
  assert.equal(client.worldAuthority, false);
  client._advanceNuclearBlasts(1); assert.equal(client.player.health, before);
});

test('host rejects a guest pose that tries to switch its nuclear loadout', () => {
  const sim = multiplayer(), guest = sim.participants.get('guest');
  guest.payload = 'atomic'; guest.pose.payload = 'atomic';
  const pose = { ...guest.pose, payload: 'tsar' };
  assert.equal(sim.applyRemoteAction({ name: 'payload' }, pose, { lifeId: 1, runId: 'nuclear-round', actionId: 'drop-1' }), true);
  assert.equal(sim.projectiles.at(-1).payload, 'atomic');
});

test('larger aircraft rotate and recover more slowly and retain rotational momentum', () => {
  const fighter = flight('conventional', 'f16'), transport = flight('conventional', 'c47'), bomber = flight('conventional', 'b2');
  for (const sim of [fighter, transport, bomber]) fly(sim, .6, () => ({ pitch: 1, roll: .35, throttle: 1 }));
  assert.ok(fighter.player.pitch > transport.player.pitch * 1.5);
  assert.ok(transport.player.pitch > bomber.player.pitch * 1.3);
  assert.ok(Math.abs(fighter.player.roll) > Math.abs(transport.player.roll) * 1.5);
  assert.ok(Math.abs(transport.player.roll) > Math.abs(bomber.player.roll) * 1.3);
  const bank = bomber.player.roll;
  bomber.step(.05, { throttle: 1 });
  assert.ok(bomber.player.roll < bank, 'letting go decays the heavy roll instead of stopping it instantly');
  for (const sim of [fighter, bomber]) {
    Object.assign(sim.player, { pitch: 0, roll: -1, heading: 0, orientation: orientationFromEuler(0, 0, -1) });
    sim.action('level'); fly(sim, 1);
  }
  assert.ok(Math.abs(bomber.player.roll) > Math.abs(fighter.player.roll) * 3, 'LEVEL also respects heavy handling');
});

test('all payload tiers have a controllable escape while a straight minimum-height drop is lethal', () => {
  for (const profile of Object.values(NUCLEAR_PAYLOADS)) {
    const low = flight(profile.id, 'b2', profile.minimumAltitude + 100);
    assert.equal(low.action('payload'), true);
    fly(low, 50, () => ({ throttle: 1 }));
    assert.equal(low.status, 'failed', `${profile.id}: a reckless minimum-height release must be dangerous`);
    const altitude = { atomic: 1600, hydrogen: 3500, tsar: 6500 }[profile.id];
    const straight = flight(profile.id, 'b2', altitude);
    assert.equal(straight.action('payload'), true);
    fly(straight, 50, () => ({ throttle: 1 }));
    assert.ok(straight.player.health < AIRCRAFT.b2.health * .3, `${profile.id}: without the turn, this altitude still causes heavy damage or death`);
    const high = flight(profile.id, 'b2', altitude);
    assert.equal(high.action('payload'), true);
    fly(high, 50, sim => {
      const p = sim.player, targetBank = sim.time < 22 ? -1 : 0;
      const targetPitch = Math.asin(clamp(-p.settlingSpeed / p.speed, -.5, .5));
      return { throttle: 1, roll: clamp((p.roll - targetBank) * 2, -1, 1), pitch: clamp((targetPitch - p.pitch) * 4 / Math.max(.3, Math.cos(p.roll)), -.7, .7) };
    });
    assert.equal(high.status, 'flying', `${profile.id}: a high release and immediate turn must leave an escape`);
    assert.equal(high.player.health, AIRCRAFT.b2.health, `${profile.id}: the escape clears the wave`);
  }
});

test('ordinary mission success waits for its released nuclear danger instead of freezing damage', () => {
  const sim = flight('tsar', 'b2', 6500);
  sim.mission.kind = 'strike'; sim.mission.goal = { type: 'targets', count: 1, egress: .05 };
  sim.targets = [{ id: 'depot', type: 'depot', x: 0, y: 20, z: 0, health: 100, initialHealth: 100, alive: true }];
  assert.equal(sim.action('payload'), true);
  sim.targets[0].health = 0; sim.targets[0].alive = false;
  sim.step(.05, { throttle: 1 });
  assert.equal(sim.status, 'flying'); assert.ok(sim._pendingNuclearSuccess);
  fly(sim, 50, () => ({ throttle: 1 }));
  assert.equal(sim.status, 'failed', 'the success overlay cannot make a lethal wave harmless');
});

test('a replacement life cannot be described as the finale crew surviving the blast', () => {
  const mission = structuredClone(getMission('last-light'));
  const sim = new FlightSimulation(mission, { playerId: 'host' }).configureMultiplayer({ mode: 'squadron', config: { lives: 3 },
    players: [{ id: 'host', aircraft: 'b2', payload: 'atomic', startMode: 'airborne' }], playerId: 'host', hostId: 'host' });
  sim.waypointIndex = mission.waypoints.length;
  Object.assign(sim.player, { x: 0, y: 3900, z: 15000, onGround: false });
  assert.equal(sim.action('payload'), true);
  sim.nuclearRelease.detonated = true; sim.nuclearRelease.detonatedAt = 0;
  sim.projectiles.length = 0;
  const owner = sim.localParticipant;
  sim._killParticipant(owner); sim.time = owner.respawnAt;
  assert.equal(sim.requestRespawn('host'), true);
  sim.time = 20; sim._updateObjective(.05);
  assert.equal(sim.status, 'failed'); assert.match(sim.objective, /releasing aircraft lost/i);
  assert.doesNotMatch(sim.endingText, /survives the blast/);
});
