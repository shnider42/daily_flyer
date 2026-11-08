import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, MISSIONS, getMission } from '../public/campaign.mjs';
import { FlightSimulation, terrainHeight } from '../public/sim.mjs';
import { basis } from '../public/orientation.mjs';
import { carrierLaunchLane } from '../public/terrain.mjs';

const dt = 1 / 60;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const angle = n => ((n + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const fly = (sim, seconds, input = {}) => {
  for (let i = 0; i < Math.ceil(seconds * 60) && sim.status === 'flying'; i++) sim.step(dt, typeof input === 'function' ? input(sim) : input);
};
const free = aircraft => ({ ...structuredClone(getMission('first-light')), id: 'freeflight', kind: 'free', aircraft, start: { x: 0, y: 1800, z: 0, speed: AIRCRAFT[aircraft].cruise, heading: 0, airborne: true }, waypoints: [], enemies: [], targets: [], goal: {} });

test('cold start needs four steps and the wheel brake holds full throttle', () => {
  const sim = new FlightSimulation(getMission('first-light'));
  fly(sim, 3, { throttle: 1 });
  assert.equal(sim.player.engine, false);
  assert.equal(sim.player.speed, 0);
  for (let i = 1; i <= 4; i++) { assert.equal(sim.action('startup'), true); assert.equal(sim.player.startupStep, i); }
  fly(sim, 4, { throttle: 1 });
  assert.equal(sim.player.speed, 0);
  sim.action('brake');
  fly(sim, 20, s => ({ throttle: 1, pitch: s.player.onGround ? 0.35 : clamp((0.15 - s.player.pitch) * 4, -0.5, 0.5) }));
  assert.equal(sim.player.onGround, false);
  assert.ok(sim.player.speed > AIRCRAFT.avro504.stallSpeed * 1.3);
  assert.ok(sim.player.y > 90);
  assert.equal(sim.player.gear, true);
  assert.equal(sim.action('gear'), false);
  assert.equal(sim.action('flaps'), false);
});

test('first sortie can be flown through every ring and landed using only continuous controls', () => {
  const sim = new FlightSimulation(getMission('first-light'));
  for (let i = 0; i < 4; i++) sim.action('startup');
  sim.action('brake');
  // A simple feedback pilot, not teleportation: flies from the cold runway to
  // the actual destination using the same pitch/bank/throttle inputs as UI.
  fly(sim, 400, s => {
    const p = s.player, waypoint = s.mission.waypoints[s.waypointIndex], runway = s.mission.runways[1];
    let throttle = 1, pitch = 0.5, roll = 0;
    if (!p.onGround) {
      const destination = waypoint || { x: runway.x, z: runway.z + 400, y: runway.y + 1 + Math.max(0, runway.z - runway.length / 2 - p.z) * 0.1 };
      const desiredHeading = Math.atan2(destination.x - p.x, destination.z - p.z) - Math.asin(clamp(5 / Math.max(25, p.speed), -0.5, 0.5));
      const desiredBank = clamp(angle(desiredHeading - p.heading) * 2, -0.7, 0.7);
      roll = clamp((p.roll - desiredBank) * 2, -0.8, 0.8);
      const climb = clamp((destination.y - p.y) * 0.12, -8, 11);
      const desiredPitch = Math.asin(clamp((climb - p.settlingSpeed) / Math.max(20, p.speed), -0.8, 0.8));
      pitch = clamp((desiredPitch - p.pitch) * 4 / Math.max(0.3, Math.cos(p.roll)), -0.7, 0.7);
      throttle = waypoint ? 1 : 0.38;
    } else if (p.everAirborne) {
      if (!p.brake) s.action('brake');
      throttle = 0; pitch = 0;
    }
    return { throttle, pitch, roll };
  });
  assert.equal(sim.status, 'success', `${sim.objective}: ${sim.player.crashCause || sim.hint}`);
  assert.equal(sim.waypointIndex, 3);
  assert.equal(sim.player.lastLanding.runwayIndex, 1);
  assert.ok(sim.time < 300, 'The compressed training flight should not take ten minutes.');
  assert.ok(sim.player.speed < 12);
  assert.equal(sim.player.settlingSpeed, 0);
  assert.ok(basis(sim.player.orientation).up.y > 0.999999, 'touchdown must synchronize the aircraft quaternion with its level wheels');
});

test('low airspeed produces a stall and full throttle with a lowered nose recovers', () => {
  const sim = new FlightSimulation(free('avro504'));
  fly(sim, 22, { throttle: 0 });
  assert.equal(sim.player.stalled, true);
  assert.ok(sim.player.verticalSpeed < -3);
  const lowAltitude = sim.player.y;
  fly(sim, 12, { throttle: 1, pitch: -0.2 });
  assert.equal(sim.player.stalled, false);
  assert.ok(sim.player.speed > AIRCRAFT.avro504.stallSpeed * 1.5);
  assert.ok(sim.player.y < lowAltitude, 'Recovery trades altitude for airspeed.');
  assert.equal(sim.status, 'flying');
});

test('an excessive-speed landing fails instead of counting as a safe arrival', () => {
  const sim = new FlightSimulation(getMission('first-light'));
  Object.assign(sim.player, { x: 1800, y: 65, z: 6500, speed: 90, engine: true, startupStep: 4, brake: false, everAirborne: true, onGround: false });
  sim.waypointIndex = 3;
  fly(sim, 15, { throttle: 1, pitch: -0.8 });
  assert.equal(sim.status, 'failed');
  assert.equal(sim.player.health, 0);
  assert.ok(sim.player.crashCause);
});

test('generation changes alter actual displacement, acceleration and turning radius', () => {
  const early = new FlightSimulation(free('camel')), jet = new FlightSimulation(free('f15'));
  // Hold the same bank with a rate controller; holding a roll control now
  // correctly keeps rolling instead of targeting a world-relative bank angle.
  const holdBank = s => ({ throttle: 1, roll: clamp((s.player.roll + 0.6) * 2, -0.8, 0.8),
    pitch: clamp((Math.asin(clamp(-s.player.settlingSpeed / s.player.speed, -0.8, 0.8)) - s.player.pitch) * 4, -0.7, 0.7) });
  fly(early, 10, holdBank);
  fly(jet, 10, holdBank);
  assert.ok(jet.player.speed > early.player.speed * 4);
  assert.ok(Math.hypot(jet.player.x, jet.player.z) > Math.hypot(early.player.x, early.player.z) * 3);
  assert.ok(Math.abs(jet.player.heading) < Math.abs(early.player.heading), 'A fast jet should not trace the biplane turn.');
});

test('guns damage a balloon only when the player closes to range and points toward it', () => {
  const sim = new FlightSimulation(getMission('new-teeth'));
  const balloon = sim.targets[0];
  fly(sim, 0.8, { throttle: sim.player.throttle, fire: true });
  assert.equal(balloon.health, 55, 'The initial out-of-range burst must miss.');
  Object.assign(sim.player, { x: balloon.x, y: balloon.y, z: balloon.z - 700, heading: 0, pitch: 0 });
  fly(sim, 1, { throttle: sim.player.throttle, fire: true });
  assert.equal(balloon.health, 0);
  assert.ok(sim.score >= 125);
  assert.ok(sim.player.ammo < AIRCRAFT.camel.gun.ammo);
});

test('missiles require a lock, guide to a moving target, and have independent launch cooldown', () => {
  const sim = new FlightSimulation(getMission('missile-age'));
  Object.assign(sim.player, { x: -650, z: 1200 }); sim.targetId = 'mig-1';
  assert.equal(sim.action('missile'), false);
  fly(sim, 2.5, { throttle: sim.player.throttle });
  assert.equal(sim.lockProgress, 1);
  assert.equal(sim.action('missile'), true);
  assert.equal(sim.action('missile'), false);
  fly(sim, 10, { throttle: sim.player.throttle });
  assert.equal(sim.enemies[0].health, 0);
  assert.equal(sim.player.missiles, AIRCRAFT.f4.missiles - 1);
  sim.action('radar');
  fly(sim, 0.2, { throttle: sim.player.throttle });
  assert.equal(sim.lockProgress, 0);
});

test('conventional bombs fall to terrain and blast both nearby depot objectives', () => {
  const sim = new FlightSimulation(getMission('heavy-weather'));
  Object.assign(sim.player, { x: 0, y: 800, z: 5900, speed: 94, vx: 0, vz: 94 });
  sim.step(dt, { throttle: sim.player.throttle });
  assert.ok(sim.bombAim.z > sim.player.z + 500);
  assert.ok(sim.bombAim.timeToImpact > 5);
  assert.equal(sim.action('payload'), true);
  fly(sim, 0.5, { throttle: sim.player.throttle });
  assert.equal(sim.action('payload'), true);
  fly(sim, 22, { throttle: sim.player.throttle });
  assert.equal(sim.targets.find(t => t.id === 'rail-east').health, 0);
  assert.equal(sim.targets.find(t => t.id === 'rail-west').health, 0);
  assert.equal(sim.status, 'success');
});

test('transport rejects an unstable drop and counts parachutes only after safe ground arrival', () => {
  const sim = new FlightSimulation(getMission('longest-minute'));
  assert.equal(sim.action('payload'), false, 'The initial position is outside the zone.');
  Object.assign(sim.player, { x: 0, y: 550, z: 7100, speed: 80, roll: 0.6 });
  assert.equal(sim.action('payload'), false, 'A banked aircraft is outside the stable drop window.');
  sim.player.roll = 0;
  assert.equal(sim.action('payload'), true);
  assert.equal(sim.dropsLanded, 0);
  assert.equal(sim.paratroopers.length, 12);
  fly(sim, 35, { throttle: sim.player.throttle });
  assert.equal(sim.status, 'success');
  assert.ok(sim.dropsLanded >= 8);
  assert.ok(sim.paratroopers.some(t => t.landed && t.safe));
});

test('Harrier hover supports deck recovery after the defense objectives', () => {
  const sim = new FlightSimulation(getMission('small-runway'));
  for (const e of sim.enemies) { e.health = 0; e.alive = false; }
  // Start over the visible, unobstructed lane so the wind does not drift the
  // aircraft's wing into the carrier island during the uncorrected descent.
  Object.assign(sim.player, { x: carrierLaunchLane(sim.mission.runways[0]), y: 65, z: 0, speed: 0, engine: true, gear: true, onGround: false, everAirborne: true, brake: false });
  assert.equal(sim.action('hover'), true);
  assert.equal(sim.player.throttle, 0.5);
  fly(sim, 15, { throttle: 0.38 });
  assert.equal(sim.status, 'success');
  assert.equal(sim.player.lastLanding.runwayIndex, 0);
  assert.equal(sim.player.onGround, true);
});

test('nuclear finale gates release by the route and offers a complete abort ending', () => {
  const abort = new FlightSimulation(getMission('last-light'));
  assert.equal(abort.action('payload'), false);
  assert.equal(abort.action('abort'), true);
  assert.equal(abort.status, 'success');
  assert.equal(abort.ending, 'abort');
  assert.equal(abort.player.bombs, 1);
  const release = new FlightSimulation(getMission('last-light'));
  for (const waypoint of release.mission.waypoints) {
    Object.assign(release.player, { x: waypoint.x, y: waypoint.y, z: waypoint.z });
    release.step(dt, { throttle: release.player.throttle });
  }
  Object.assign(release.player, { x: 0, y: 3900, z: 15000 });
  assert.equal(release.action('payload'), true);
  assert.equal(release.status, 'success');
  assert.equal(release.ending, 'strike');
  assert.equal(release.player.bombs, 0);
});

test('cooperative snapshots preserve local flight and apply only addressed damage once', () => {
  const mission = getMission('missile-age'), host = new FlightSimulation(mission, { playerId: 'host' }), guest = new FlightSimulation(mission, { playerId: 'guest' });
  guest.player.x = 333; guest.player.pitch = 0.19; guest.player.throttle = 0.7;
  const localOrientation = structuredClone(guest.player.orientation);
  host.remoteDamage.guest = 12;
  const snapshot = host.getSnapshot();
  assert.equal(Object.hasOwn(snapshot, 'player'), false);
  assert.equal(guest.applySnapshot(snapshot), true);
  assert.equal(guest.player.x, 333);
  assert.equal(guest.player.pitch, 0.19);
  assert.deepEqual(guest.player.orientation, localOrientation, 'world snapshots must preserve local attitude');
  assert.equal(guest.player.health, AIRCRAFT.f4.health - 12);
  guest.applySnapshot(snapshot);
  assert.equal(guest.player.health, AIRCRAFT.f4.health - 12);
  assert.equal(guest.worldAuthority, false);
  const oldZ = guest.player.z;
  guest.step(dt, { throttle: 0.7 });
  assert.ok(guest.player.z > oldZ, 'Local movement must remain immediate between host snapshots.');
});

test('host, guest, and second guest each have independent payload stores and cooldowns', () => {
  const sim = new FlightSimulation(getMission('heavy-weather'));
  assert.equal(sim.action('payload'), true);
  const pose = { ...sim.player, id: 'guest', x: 100, aircraft: 'f22' };
  assert.equal(sim.applyRemoteAction({ name: 'payload' }, pose), true);
  assert.equal(sim.applyRemoteAction({ name: 'payload' }, pose), false);
  assert.equal(sim.applyRemoteAction({ name: 'payload' }, { ...pose, id: 'guest-two', x: -100 }), true);
  assert.equal(sim.projectiles.filter(p => p.type === 'bomb').length, 3);
  assert.equal(sim.player.bombs, AIRCRAFT.b17.bombs - 1);
  assert.equal(sim.remoteWeapons.get('guest').bombs, AIRCRAFT.b17.bombs - 1, 'A guest pose cannot replace the assigned aircraft or its stores.');
});

test('all campaign data has finite valid flight starts and resolvable mission objectives', () => {
  assert.equal(MISSIONS.length, 18);
  for (const mission of MISSIONS) {
    const sim = new FlightSimulation(mission);
    fly(sim, 3, { throttle: sim.player.throttle });
    assert.equal(sim.status, 'flying', mission.id);
    assert.ok([sim.player.x, sim.player.y, sim.player.z, sim.player.speed].every(Number.isFinite), mission.id);
    if (mission.goal.targetIds) for (const id of mission.goal.targetIds) assert.ok(mission.targets.some(t => t.id === id), `${mission.id}: ${id}`);
    if (mission.goal.destinationRunway != null) assert.ok(mission.runways[mission.goal.destinationRunway]);
    if (mission.goal.zoneId) assert.ok(mission.targets.some(t => t.id === mission.goal.zoneId));
  }
  assert.equal(terrainHeight(0, 0, getMission('blue-water')), -8, 'Carrier decks sit above water; the terrain does not become land.');
  assert.equal(terrainHeight(1800, 7000, getMission('first-light')), 14, 'Runway terrain is flat at its authored elevation.');
});
