import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, getMission } from '../public/campaign.mjs';
import { FlightSimulation, advancePlayer } from '../public/sim.mjs';
import { ARENA_MAPS, ROUND_DURATIONS, createArenaMission, prepareMissionStarts, spawnForPlayer, carrierCompatibility } from '../public/arena.mjs';
import { terrainHeight, terrainGridHeight, TERRAIN_CELL_SIZE, lineOfSight, segmentTerrainTime, terrainClearance, surfaceHeight } from '../public/terrain.mjs';
import { orientationFromEuler } from '../public/orientation.mjs';

const roster = (host = 'f16', guest = 'camel') => [{ id: 'host', name: 'Leader', aircraft: host, startMode: 'airborne', connected: true }, { id: 'guest', name: 'Wing', aircraft: guest, startMode: 'airborne', connected: true }];
const arena = ({ mode = 'dogfight', host = 'f16', guest = 'camel', local = 'host', seconds = 300, lives = 3, mapId = 'canyon' } = {}) => {
  const config = { mode, mapId, durationSeconds: seconds, lives };
  return new FlightSimulation(createArenaMission(config, local === 'host' ? host : guest), { playerId: local, autoLevel: false })
    .configureMultiplayer({ mode, config, players: roster(host, guest), playerId: local, hostId: 'host', runId: 'run-1' });
};
const fly = (sim, seconds) => { for (let i = 0; i < Math.ceil(seconds / 0.05); i++) sim.step(0.05, { throttle: sim.player.throttle }); };
const place = (sim, id, x, y, z, heading = 0) => {
  const record = sim.participants.get(id);
  Object.assign(record.pose, { x, y, z, heading, pitch: 0, roll: 0, orientation: orientationFromEuler(heading, 0, 0), onGround: false, speed: 100, vx: 0, vz: 100, verticalSpeed: 0 });
  return record.pose;
};
const remote = (sim, name, extras = {}, actionId = `${name}-${sim.time}`) => sim.applyRemoteAction({ name, ...extras }, { ...sim.participants.get('guest').pose }, { lifeId: sim.participants.get('guest').lifeId, runId: 'run-1', actionId });

test('every roster aircraft retains its own stores and flight profile on both clients', () => {
  const host = arena({ host: 'avro504', guest: 'f22' }), guest = arena({ host: 'avro504', guest: 'f22', local: 'guest' });
  assert.equal(host.player.aircraft, 'avro504'); assert.equal(host.player.ammo, 0); assert.equal(host.player.missiles, 0);
  assert.equal(guest.player.aircraft, 'f22'); assert.equal(guest.player.missiles, AIRCRAFT.f22.missiles);
  for (const sim of [host, guest]) for (const id of ['host', 'guest']) {
    const record = sim.participants.get(id); assert.equal(record.health, AIRCRAFT[record.aircraft].health); assert.equal(record.lifeId, 1);
  }
  const coop = new FlightSimulation(getMission('missile-age')).configureMultiplayer({ mode: 'squadron', players: roster('camel', 'f22'), playerId: 'host', hostId: 'host' });
  assert.equal(coop.participants.get('guest').aircraft, 'f22'); assert.equal(coop.player.aircraft, 'camel');
});

test('airfield, airborne and carrier starts are real for every aircraft on both maps', () => {
  for (const map of ARENA_MAPS) for (const aircraft of Object.keys(AIRCRAFT)) {
    const mission = createArenaMission({ mapId: map.id }, aircraft);
    const deck = spawnForPlayer(mission, aircraft, 0, 'carrier');
    assert.equal(deck.airborne, false); assert.equal(deck.y, 31); assert.ok(terrainHeight(deck.x, deck.z, mission) < 0);
    assert.equal(surfaceHeight(deck.x, deck.z, mission), 28); assert.equal(carrierCompatibility(aircraft).allowed, true);
    const runway = spawnForPlayer(mission, aircraft, 0, 'runway');
    assert.equal(runway.airborne, false); assert.ok(runway.y > 100); assert.ok(Math.abs(terrainHeight(runway.x, runway.z, mission) - runway.y + 3) < 0.01);
    const air = spawnForPlayer(mission, aircraft, 0, 'airborne'); assert.equal(air.airborne, true); assert.ok(air.y > terrainHeight(air.x, air.z, mission) + 400);
  }
  const source = getMission('first-light'), prepared = prepareMissionStarts(source, [{ startMode: 'carrier' }]);
  assert.ok(prepared.runways.some(runway => runway.carrier));
  assert.equal(terrainHeight(0, 0, prepared), terrainHeight(0, 0, source), 'distant launch ocean must preserve the mission terrain');
  assert.deepEqual(prepared, prepareMissionStarts(source, [{ startMode: 'carrier' }]));
});

test('canyon collision is the exact pair of triangles rendered in each shared cell', () => {
  const mission = createArenaMission({ mapId: 'canyon' }), size = TERRAIN_CELL_SIZE;
  for (const [x0, z0] of [[0, 0], [640, 320], [-960, -448], [5248, -6528]]) {
    const h00 = terrainGridHeight(x0, z0, mission), h10 = terrainGridHeight(x0 + size, z0, mission), h01 = terrainGridHeight(x0, z0 + size, mission), h11 = terrainGridHeight(x0 + size, z0 + size, mission);
    for (const [x, z] of [[0.2, 0.3], [0.8, 0.7]]) {
      const expected = x + z <= 1 ? h00 + (h10 - h00) * x + (h01 - h00) * z : h11 + (h01 - h11) * (1 - x) + (h10 - h11) * (1 - z);
      assert.ok(Math.abs(terrainHeight(x0 + size * x, z0 + size * z, mission) - expected) < 1e-7);
    }
  }
});

test('a ridge breaks radar immediately and intercepts a swept missile before a pilot behind it', () => {
  const sim = arena({ guest: 'f16' });
  const branchZ = 2200 + 4000 * 0.45 + 420 * Math.sin(4000 / 1100);
  const shooter = place(sim, 'host', 0, 400, 0), victim = place(sim, 'guest', 4000, 400, branchZ);
  assert.ok(terrainHeight(shooter.x, shooter.z, sim.mission) < 150); assert.ok(terrainHeight(victim.x, victim.z, sim.mission) < 150);
  assert.equal(lineOfSight(shooter, victim, sim.mission), false);
  const crossing = segmentTerrainTime(shooter, victim, sim.mission); assert.ok(crossing > 0 && crossing < 1);
  sim.targetId = 'guest'; sim.lockProgress = 1; sim._updateLock(1 / 60); assert.equal(sim.lockProgress, 0);
  const health = victim.health;
  sim.projectiles.push({ id: 'fast-test', type: 'missile', x: shooter.x, y: shooter.y, z: shooter.z, vx: victim.x * 2, vy: 0, vz: victim.z * 2, speed: 12000, life: 2, owner: 'host', targetId: 'guest', targetPlayerId: 'guest', targetLifeId: 1, damage: 9999 });
  sim._advanceProjectiles(0.5);
  assert.equal(sim.projectiles[0].life, 0); assert.equal(sim.projectiles[0].seekerLost, true); assert.equal(victim.health, health);
  assert.ok(sim.effects.some(effect => effect.type === 'explosion')); assert.equal(sim.participants.get('host').kills, 0);
  const warning = terrainClearance({ ...shooter, health: 100, onGround: false, vx: victim.x, vz: victim.z, verticalSpeed: 0 }, sim.mission, 1);
  assert.equal(warning.pullUp, true); assert.ok(warning.timeToImpact > 0 && warning.timeToImpact < 1);
});

test('host death preserves world ticks, enemy AI and remaining squadron lives', () => {
  const sim = new FlightSimulation(getMission('missile-age'), { playerId: 'host' })
    .configureMultiplayer({ mode: 'squadron', config: { lives: 3 }, players: roster('f4', 'f4'), playerId: 'host', hostId: 'host' });
  const before = { x: sim.enemies[0].x, z: sim.enemies[0].z };
  sim.player.health = 0; fly(sim, 1);
  assert.equal(sim.status, 'flying'); assert.equal(sim.localParticipant.alive, false); assert.equal(sim.localParticipant.livesRemaining, 2);
  assert.ok(sim.time > 0.9); assert.notDeepEqual({ x: sim.enemies[0].x, z: sim.enemies[0].z }, before);
  assert.ok(sim.effects[0].age > 0.8, 'explosions keep animating while the host spectates');
  assert.equal(sim.requestRespawn(), false); fly(sim, 4.2); assert.equal(sim.requestRespawn(), true);
  assert.equal(sim.player.lifeId, 2); assert.equal(sim.player.health, AIRCRAFT.f4.health); assert.equal(sim.status, 'flying');
});

test('limited-life missions finish only after every connected pilot has exhausted lives', () => {
  const sim = new FlightSimulation(getMission('missile-age'), { playerId: 'host' })
    .configureMultiplayer({ mode: 'squadron', config: { lives: 1 }, players: roster('f4', 'f4'), playerId: 'host', hostId: 'host' });
  sim.player.health = 0; sim.step(0.05); assert.equal(sim.status, 'flying'); assert.equal(sim.canRespawn, false);
  sim._damageParticipant(sim.participants.get('guest'), 9999, null, 'enemy'); sim.step(0.05);
  assert.equal(sim.status, 'failed'); assert.match(sim.objective, /squadron/);
});

test('host resolves remote gun damage, credits each death once and rejects claimed stores or kills', () => {
  const sim = arena({ host: 'camel', guest: 'camel' });
  place(sim, 'host', 0, 2200, 400); place(sim, 'guest', 0, 2200, 0);
  const pose = { ...sim.participants.get('guest').pose, aircraft: 'f22', ammo: 999999, missiles: 999999, health: 999999 };
  assert.equal(sim.applyRemoteAction({ name: 'fire' }, pose, { lifeId: 1, runId: 'run-1', actionId: 'shot-1' }), true);
  assert.equal(sim.player.health, AIRCRAFT.camel.health - AIRCRAFT.camel.gun.damage);
  assert.equal(sim.participants.get('guest').pose.ammo, AIRCRAFT.camel.gun.ammo - 1);
  assert.equal(sim.participants.get('guest').pose.aircraft, 'camel');
  assert.equal(sim.applyRemoteAction({ name: 'fire' }, pose, { lifeId: 1, runId: 'run-1', actionId: 'shot-1' }), false);
  assert.equal(remote(sim, 'kill', { targetId: 'host', damage: 99999 }), false);
  sim.localParticipant.health = AIRCRAFT.camel.gun.damage; sim.player.health = AIRCRAFT.camel.gun.damage;
  fly(sim, 0.15); assert.equal(remote(sim, 'fire', {}, 'final-shot'), true);
  assert.equal(sim.localParticipant.deaths, 1); assert.equal(sim.participants.get('guest').kills, 1); assert.equal(sim.status, 'flying');
  assert.equal(remote(sim, 'fire', {}, 'final-shot'), false); assert.equal(sim.localParticipant.deaths, 1);
  assert.equal(sim.scoreboard[0].id, 'guest');
});

test('remote missile launch requires host-observed lock time and the selected airframe stores', () => {
  const sim = arena({ host: 'f16', guest: 'f16' });
  place(sim, 'host', 0, 2200, 2600); const guest = place(sim, 'guest', 0, 2200, 0);
  guest.targetId = 'host'; guest.radarOn = true;
  assert.equal(remote(sim, 'missile', { targetId: 'host' }, 'early'), false);
  fly(sim, 1.5);
  assert.equal(remote(sim, 'missile', { targetId: 'host' }, 'locked'), true);
  assert.equal(guest.missiles, AIRCRAFT.f16.missiles - 1);
  const harmless = arena({ host: 'f16', guest: 'avro504' });
  place(harmless, 'host', 0, 2200, 400); place(harmless, 'guest', 0, 2200, 0);
  assert.equal(remote(harmless, 'fire'), false); assert.equal(remote(harmless, 'missile', { targetId: 'host' }), false);
});

test('free flight is untimed and peaceful while practice guns remain available', () => {
  const sim = arena({ mode: 'freeflight', host: 'camel', guest: 'camel' });
  place(sim, 'host', 0, 2200, 400); place(sim, 'guest', 0, 2200, 0);
  assert.equal(remote(sim, 'fire'), true); assert.equal(sim.player.health, AIRCRAFT.camel.health); assert.ok(sim.projectiles.length);
  assert.equal(sim.round.duration, null); sim.time = 1800; sim.step(0.05); assert.equal(sim.status, 'flying');
});

test('each dogfight duration ends on host time even while the host is dead', () => {
  assert.deepEqual(ROUND_DURATIONS, [300, 600, 1200]);
  for (const seconds of ROUND_DURATIONS) {
    const sim = arena({ seconds }); sim.player.health = 0; sim.step(0.05);
    sim.time = seconds - 0.02; sim.step(0.05);
    assert.equal(sim.status, 'success'); assert.equal(sim.round.remaining, 0); assert.equal(sim.round.ended, true);
    const time = sim.time; sim.step(0.05); assert.equal(sim.time, time); assert.equal(sim.action('fire'), false);
  }
});

test('life generations reconcile authoritative deaths once and reset a respawn without stale damage', () => {
  const host = arena({ host: 'f16', guest: 'f22' }), guest = arena({ host: 'f16', guest: 'f22', local: 'guest' });
  guest.player.x += 20;
  const originalX = guest.player.x; assert.equal(guest.applySnapshot(host.getSnapshot()), true); assert.equal(guest.player.x, originalX, 'live movement stays locally predicted');
  host._damageParticipant(host.participants.get('guest'), 9999, 'host', 'missile');
  const death = host.getSnapshot(); guest.applySnapshot(death); guest.applySnapshot(death);
  assert.equal(guest.player.health, 0); assert.equal(guest.localParticipant.deaths, 1); assert.equal(guest.status, 'flying');
  assert.equal(host.requestRespawn('guest'), false); fly(host, 4.2); assert.equal(host.requestRespawn('guest'), true);
  const life = host.getSnapshot(); guest.applySnapshot(life);
  assert.equal(guest.player.lifeId, 2); assert.equal(guest.player.crashed, undefined); assert.equal(guest.player.health, AIRCRAFT.f22.health);
  assert.equal(guest.localParticipant.deaths, 1); assert.equal(guest.player.ammo, AIRCRAFT.f22.gun.ammo);
  assert.equal(guest.applySnapshot(death), false); assert.equal(guest.player.health, AIRCRAFT.f22.health);
  assert.equal(host.applyRemoteAction({ name: 'fire' }, { ...host.participants.get('guest').pose }, { lifeId: 1, runId: 'run-1', actionId: 'old-life' }), false);
});

test('a claimed midair crash is ignored and impossible teleports cannot move a firing platform', () => {
  const sim = arena(), guest = sim.participants.get('guest'), origin = { x: guest.pose.x, z: guest.pose.z };
  assert.equal(remote(sim, 'crash', { health: 0 }), false); assert.equal(guest.alive, true);
  sim.setRemotePlayers([{ ...guest.pose, x: 50000, z: 50000, aircraft: 'f22', health: 99999 }]);
  assert.deepEqual({ x: guest.pose.x, z: guest.pose.z }, origin); assert.equal(guest.aircraft, 'camel');
});

test('rolling beyond a carrier preserves deck height before the aircraft falls toward the sea', () => {
  const mission = createArenaMission({ mapId: 'islands' }, 'b17'), sim = new FlightSimulation(mission);
  const carrier = mission.runways.find(runway => runway.carrier);
  Object.assign(sim.player, { ...spawnForPlayer(mission, 'b17', 0, 'carrier'), z: carrier.z + carrier.length / 2 + 2.9,
    y: carrier.y + 3, speed: 15, onGround: true, engine: false, gear: true, brake: false, health: AIRCRAFT.b17.health });
  advancePlayer(sim.player, { throttle: 0 }, 0.05, AIRCRAFT.b17, mission);
  assert.equal(sim.player.onGround, false); assert.equal(sim.player.y, carrier.y + 3); assert.equal(sim.player.crashed, undefined);
  fly(sim, 8); assert.equal(sim.player.health, 0); assert.match(sim.player.crashCause, /water/);
});

test('wall elapsed ends the round through dropped frames without accelerating physics', () => {
  const sim = arena();
  sim.advanceRoundTime(10); sim.step(0.05);
  assert.equal(sim.round.elapsed, 10); assert.equal(sim.round.remaining, 290); assert.equal(sim.time, 0.05);
  sim.advanceRoundTime(290);
  assert.equal(sim.status, 'success'); assert.equal(sim.round.elapsed, 300); assert.equal(sim.time, 0.05);
  assert.equal(sim.advanceRoundTime(10), false);
});

test('PvP radar and incoming missile warnings reach the target guest and clear after masking', () => {
  const host = arena({ host: 'f16', guest: 'f16' }), guest = arena({ host: 'f16', guest: 'f16', local: 'guest' });
  place(host, 'host', 0, 2200, 0); place(host, 'guest', 0, 2200, 2600);
  place(guest, 'guest', 0, 2200, 2600); host.targetId = 'guest';
  fly(host, 1.5); assert.equal(host.lockProgress, 1);
  guest.applySnapshot(host.getSnapshot()); assert.match(guest.threatWarning, /RADAR LOCK/); assert.ok(guest.threat >= 0.8);
  assert.equal(host.action('missile'), true); guest.applySnapshot(host.getSnapshot()); assert.match(guest.threatWarning, /MISSILE INCOMING/);
  host.projectiles = [];
  place(host, 'host', 0, 400, 0);
  const branchZ = 2200 + 4000 * 0.45 + 420 * Math.sin(4000 / 1100);
  place(host, 'guest', 4000, 400, branchZ); place(guest, 'guest', 4000, 400, branchZ);
  host.step(0.05); guest.applySnapshot(host.getSnapshot());
  assert.equal(host.lockProgress, 0); assert.match(host.lockReason, /Terrain/); assert.equal(guest.threatWarning, ''); assert.equal(guest.threat, 0);
});

test('a ground target five meters above terrain can be seen and radar locked', () => {
  const mission = createArenaMission({ mapId: 'islands' }, 'f16');
  mission.biome = 'night'; mission.runways = []; mission.arena = false;
  mission.targets = [{ id: 'depot', x: 0, y: 5, z: 1500, health: 100, type: 'depot' }];
  mission.start = { x: 0, y: 300, z: 0, heading: 0, speed: 200, airborne: true };
  const sim = new FlightSimulation(mission), target = sim.targets[0];
  sim.player.pitch = Math.atan2(target.y - sim.player.y, target.z - sim.player.z); sim.targetId = target.id;
  assert.equal(lineOfSight(sim.player, target, mission), true);
  sim._updateLock(2); assert.equal(sim.lockProgress, 1); assert.equal(sim.action('missile'), true);
});

test('a different teammate can finish the landing after the mission host dies', () => {
  const mission = getMission('first-light');
  const sim = new FlightSimulation(mission, { playerId: 'host' }).configureMultiplayer({ mode: 'squadron', config: { lives: 1 }, players: roster('camel', 'c47'), playerId: 'host', hostId: 'host' });
  sim.player.health = 0; sim.step(0.05); sim.waypointIndex = mission.waypoints.length;
  const runway = sim.mission.runways[mission.goal.destinationRunway], guest = sim.participants.get('guest');
  place(sim, 'guest', runway.x, runway.y + 4, runway.z);
  const touchdown = { ...guest.pose, y: runway.y + 3, speed: 0, gear: true, brake: true, onGround: true, verticalSpeed: -1 };
  sim.setRemotePlayers([touchdown]); sim._updateObjective(0.05);
  assert.equal(sim.status, 'success'); assert.equal(guest.pose.lastLanding.runwayIndex, mission.goal.destinationRunway);
});

test('a C-47 teammate can complete a shared parachute mission with a dead fighter host', () => {
  const sim = new FlightSimulation(getMission('longest-minute'), { playerId: 'host' }).configureMultiplayer({ mode: 'squadron', config: { lives: 1 }, players: roster('f16', 'c47'), playerId: 'host', hostId: 'host', runId: 'run-1' });
  sim.player.health = 0; sim.step(0.05);
  const zone = sim.targets.find(target => target.type === 'dropzone');
  const guest = place(sim, 'guest', zone.x, zone.y + 550, zone.z); guest.speed = 80;
  assert.equal(remote(sim, 'payload', {}, 'drop'), true); assert.equal(sim.paratroopers.length, 12);
  fly(sim, 30); assert.equal(sim.status, 'success'); assert.ok(sim.dropsLanded >= 8);
});

test('escort progress follows any living teammate rather than requiring the host nearby', () => {
  const sim = new FlightSimulation(getMission('paper-wings'), { playerId: 'host' }).configureMultiplayer({ mode: 'squadron', players: roster('f16', 'camel'), playerId: 'host', hostId: 'host' });
  const escort = sim.enemies.find(enemy => enemy.friendly);
  place(sim, 'host', 20000, 2000, 20000); place(sim, 'guest', escort.x, escort.y, escort.z + 100);
  const before = sim.escortTime; sim._updateObjective(0.05); assert.ok(sim.escortTime > before);
});

test('the host validates a guest banked landing crash instead of leaving that pilot stuck alive', () => {
  const sim = arena({ guest: 'camel', mapId: 'islands' }), record = sim.participants.get('guest');
  const runway = sim.mission.runways.find(item => !item.carrier);
  place(sim, 'guest', runway.x, runway.y + 8, runway.z);
  const crash = { ...record.pose, y: runway.y + 3, gear: true, crashed: true, speed: 35, verticalSpeed: -2, roll: 0.55, orientation: orientationFromEuler(0, 0, 0.55), onGround: false };
  sim.setRemotePlayers([crash]);
  assert.equal(record.alive, false); assert.equal(record.deaths, 1); assert.equal(record.respawnAt, 4);
});

test('squadron AIR kills credit host and guest once while ground points remain shared', () => {
  const sim = new FlightSimulation(createArenaMission({}, 'f16'), { playerId: 'host' }).configureMultiplayer({ mode: 'squadron',
    players: roster('f16', 'camel'), playerId: 'host', hostId: 'host', runId: 'run-1' });
  place(sim, 'host', 0, 2300, 0); place(sim, 'guest', 2000, 2300, 0);
  const fighter = { id: 'ai-1', x: 0, y: 2300, z: 500, health: 10, alive: true, type: 'fighter', aircraft: 'f4' };
  sim.enemies.push(fighter); assert.equal(sim.action('fire'), true); assert.equal(fighter.health, 0); assert.equal(sim.localParticipant.kills, 1);
  sim._damage(fighter, 9999, 'gun', 'host'); assert.equal(sim.localParticipant.kills, 1);
  const other = { ...fighter, id: 'ai-2', x: 2000, health: 10, alive: true }; sim.enemies.push(other);
  assert.equal(remote(sim, 'fire', {}, 'guest-ai'), true); assert.equal(other.health, 0); assert.equal(sim.participants.get('guest').kills, 1);
  const third = { ...fighter, id: 'ai-3', health: 10, alive: true }; sim.enemies.push(third);
  sim.projectiles.push({ id: 'legacy-owner', type: 'missile', x: 0, y: 2300, z: 400, vx: 0, vy: 0, vz: 1000, speed: 1000,
    life: 2, owner: 'player', targetId: third.id, damage: 30 });
  sim._advanceProjectiles(0.2); assert.equal(third.health, 0); assert.equal(sim.localParticipant.kills, 2, 'legacy player missile owner maps to the local participant');
  const depot = { id: 'ground', x: 0, y: 10, z: 0, health: 10, alive: true, type: 'depot' }; sim.targets.push(depot);
  const points = sim.score; sim._damage(depot, 20, 'bomb', 'host');
  assert.equal(sim.localParticipant.kills, 2); assert.ok(sim.score > points, 'ground objectives still earn shared mission points');
});
