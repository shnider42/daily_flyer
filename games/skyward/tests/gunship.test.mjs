import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, MISSIONS, SPECIAL_MISSIONS, getMission } from '../public/campaign.mjs';
import { FlightSimulation, terrainHeight } from '../public/sim.mjs';
import { basis, orientationFromEuler } from '../public/orientation.mjs';
import { GUNSHIP_AIM_LIMITS, GUNSHIP_BASE_ELEVATION, GUNSHIP_INPUT_TIMEOUT, GUNSHIP_STATIONS,
  clampCrewInput, getGunshipStation, gunshipStationPose } from '../public/gunship.mjs';

const dt = 1 / 60;
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const angle = value => ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const mission = () => structuredClone(getMission('gunship-nightwatch'));
const crewInput = (seat = '25mm', extras = {}) => ({ seat, yaw: 0, pitch: 0, fire: true, ...extras });
const fly = (sim, seconds, input = {}) => {
  for (let frame = 0; frame < seconds * 60 && sim.status === 'flying'; frame++) sim.step(dt, typeof input === 'function' ? input(sim) : input);
};

test('Nightwatch is a separate two-person operation with eight real ground objectives', () => {
  assert.equal(MISSIONS.length, 18);
  assert.equal(MISSIONS[17].id, 'last-light');
  assert.deepEqual(MISSIONS.map(item => item.number), Array.from({ length: 18 }, (_, index) => index + 1));
  const operation = getMission('gunship-nightwatch');
  assert.equal(SPECIAL_MISSIONS.includes(operation), true);
  assert.equal(operation.kind, 'gunship');
  assert.equal(operation.aircraft, 'ac130');
  assert.equal(operation.number, undefined);
  assert.equal(operation.weather.timeOfDay, 'night');
  assert.deepEqual(operation.crew, { pilot: 1, gunner: 1 });
  assert.equal(operation.goal.targetIds.length, 8);
  for (const id of operation.goal.targetIds) assert.ok(operation.targets.some(target => target.id === id && target.health > 0));
  assert.ok(AIRCRAFT.ac130.health > AIRCRAFT.c47.health);
});

test('all station frames remain port-relative and orthogonal through banks, loops and inversion', () => {
  for (const [heading, pitch, roll] of [[0, 0, 0], [0.7, 0.3, 1.2], [1, Math.PI / 2, -0.9], [-1, -0.2, Math.PI]]) {
    const plane = { x: 300, y: 1700, z: -200, orientation: orientationFromEuler(heading, pitch, roll) };
    const axes = basis(plane.orientation);
    for (const station of GUNSHIP_STATIONS) {
      const frame = gunshipStationPose(plane, station.id, { yaw: 0.28, pitch: -0.2 });
      near(Math.hypot(frame.direction.x, frame.direction.y, frame.direction.z), 1);
      near(Math.hypot(frame.up.x, frame.up.y, frame.up.z), 1);
      near(dot(frame.up, frame.direction), 0);
      assert.ok(dot(frame.direction, axes.right) < -0.6, 'every muzzle stays on the pilot left side');
      near(dot(frame.direction, axes.up), Math.sin(GUNSHIP_BASE_ELEVATION - 0.2));
      near(dot(frame.direction, axes.forward), Math.cos(GUNSHIP_BASE_ELEVATION - 0.2) * Math.sin(0.28));
      near(Math.hypot(frame.origin.x - frame.mount.x, frame.origin.y - frame.mount.y, frame.origin.z - frame.mount.z), station.barrelLength);
      assert.equal(gunshipStationPose(plane, station.id, { zoom: true }).fov, station.zoomFov);
    }
  }
  const inverted = gunshipStationPose({ orientation: orientationFromEuler(0, 0, Math.PI) });
  assert.ok(inverted.direction.y > 0, 'inverted guns aim skyward rather than staying tied to the ground');
});

test('screen-right yaw and upward pitch move the port sight correctly, with bounded finite input', () => {
  const neutral = gunshipStationPose(), right = gunshipStationPose({}, '25mm', { yaw: 0.2 });
  const raised = gunshipStationPose({}, '25mm', { pitch: 0.2 });
  assert.ok(right.direction.z > neutral.direction.z);
  assert.ok(raised.direction.y > neutral.direction.y);
  assert.deepEqual(clampCrewInput({ seat: '40mm', yaw: 99, pitch: -99, fire: false, damage: 1e9 }), {
    seat: '40mm', yaw: GUNSHIP_AIM_LIMITS.yawMax, pitch: GUNSHIP_AIM_LIMITS.pitchMin, fire: false,
  });
  for (const bad of [null, {}, crewInput('999mm'), crewInput('25mm', { yaw: NaN }), crewInput('25mm', { pitch: Infinity }), crewInput('25mm', { fire: 1 })]) {
    assert.equal(clampCrewInput(bad), null);
  }
});

test('the initial station sight is already centered on the objective compound', () => {
  const sim = new FlightSimulation(mission());
  const station = gunshipStationPose(sim.player), depot = sim.targets.find(target => target.id === 'nightwatch-depot');
  const direction = { x: depot.x - station.eye.x, y: depot.y - station.eye.y, z: depot.z - station.eye.z };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  assert.ok(dot(station.direction, direction) / length > Math.cos(0.015), 'the compound is within one degree of the default sight');
  assert.equal(sim.applyCrewInput(crewInput(), 'gunner'), true);
  sim.step(dt);
  sim.applyCrewInput(crewInput('25mm', { fire: false }), 'gunner');
  assert.equal(sim.targets[0].health, sim.targets[0].initialHealth, 'damage waits for the shell to arrive');
  fly(sim, 3);
  assert.ok(sim.targets[0].health < sim.targets[0].initialHealth, 'a default shot reaches the visible depot');
});

test('station cadence, ammunition and reloads remain independent when changing seats', () => {
  const sim = new FlightSimulation(mission());
  sim.applyCrewInput(crewInput('105mm'), 'gunner'); sim.step(dt);
  const first = sim.crew.stations['105mm'];
  assert.equal(first.ammo, getGunshipStation('105mm').ammo - 1);
  assert.equal(first.shots, 1);
  sim.applyCrewInput(crewInput('25mm'), 'gunner'); sim.step(dt);
  assert.equal(sim.crew.stations['25mm'].shots, 1);
  sim.applyCrewInput(crewInput('105mm'), 'gunner'); fly(sim, 0.2);
  assert.equal(first.shots, 1, 'changing away and back cannot bypass a heavy-cannon reload');
  assert.ok(first.cooldown > 2);
  assert.equal(sim.crew.stations['40mm'].ammo, getGunshipStation('40mm').ammo);
  for (const station of GUNSHIP_STATIONS) {
    const isolated = new FlightSimulation(mission());
    fly(isolated, 1, state => { state.applyCrewInput(crewInput(station.id), 'gunner'); return {}; });
    const shots = isolated.crew.stations[station.id].shots;
    assert.ok(shots >= Math.floor(station.rate) && shots <= Math.ceil(station.rate), `${station.id} has its distinct cadence`);
  }
});

test('stale held fire stops after a disconnected or paused gunner stops sending input', () => {
  const sim = new FlightSimulation(mission());
  sim.applyCrewInput(crewInput(), 'gunner');
  fly(sim, GUNSHIP_INPUT_TIMEOUT + 0.1);
  assert.equal(sim.crew.fire, false);
  const shots = sim.crew.stations['25mm'].shots;
  assert.ok(shots > 0 && shots <= 5);
  fly(sim, 1);
  assert.equal(sim.crew.stations['25mm'].shots, shots);
  sim.applyCrewInput(crewInput('40mm'), 'replacement-gunner'); sim.step(dt);
  assert.equal(sim.crew.gunnerId, 'replacement-gunner');
  assert.equal(sim.crew.stations['25mm'].shots, shots, 'a new gunner inherits the same stores');
});

test('a press and release between physics steps fires once with its original station and aim', () => {
  const sim = new FlightSimulation(mission());
  sim.applyCrewInput(crewInput('105mm', { yaw: 0.2, pitch: -0.1 }), 'gunner');
  sim.applyCrewInput(crewInput('105mm', { yaw: 0.4, pitch: 0.2, fire: false }), 'gunner');
  sim.applyCrewInput(crewInput('25mm', { fire: false }), 'gunner');
  sim.step(dt);
  assert.equal(sim.crew.fire, false);
  assert.equal(sim.crew.stations['105mm'].shots, 1);
  assert.equal(sim.crew.stations['25mm'].shots, 0);
  const shell = sim.projectiles.find(projectile => projectile.type === 'shell');
  const direction = gunshipStationPose(sim.player, '105mm', { yaw: 0.2, pitch: -0.1 }).direction;
  near(shell.vx / getGunshipStation('105mm').speed, direction.x);
  near(shell.vz / getGunshipStation('105mm').speed, direction.z);
  fly(sim, 0.2);
  assert.equal(sim.crew.stations['105mm'].shots, 1, 'release leaves no repeat fire');
});

test('pending presses are bounded, cannot bypass a reload and are cancelled by forced resets', () => {
  const sim = new FlightSimulation(mission());
  for (let i = 0; i < 20; i++) {
    sim.applyCrewInput(crewInput('105mm'), 'gunner');
    sim.applyCrewInput(crewInput('105mm', { fire: false }), 'gunner');
  }
  sim.step(dt);
  assert.equal(sim.crew.stations['105mm'].shots, 1, 'many subframe taps retain at most one press');
  sim.applyCrewInput(crewInput('105mm'), 'gunner');
  sim.applyCrewInput(crewInput('105mm', { fire: false }), 'gunner');
  fly(sim, 3.1);
  assert.equal(sim.crew.stations['105mm'].shots, 1, 'a tap during reload must not fire later after release');
  sim.applyCrewInput(crewInput('40mm'), 'gunner');
  sim.applyCrewInput(crewInput('40mm'), 'gunner', { reset: true });
  sim.step(dt);
  assert.equal(sim.crew.fire, false);
  assert.equal(sim.crew.stations['40mm'].shots, 0, 'pause/disconnect reset cancels an unconsumed press');
});

test('fast cannon shells resolve swept hits and heavy splash damages nearby ground targets', () => {
  const data = mission();
  data.targets = [
    { id: 'direct', type: 'truck', x: 100, z: 0, health: 500, hitRadius: 10 },
    { id: 'nearby', type: 'truck', x: 100, z: 70, health: 500, hitRadius: 10 },
    { id: 'outside', type: 'truck', x: 100, z: 220, health: 500, hitRadius: 10 },
  ];
  const sim = new FlightSimulation(data), y = sim.targets[0].y + 4;
  sim.projectiles.push({ id: 'swept', type: 'shell', seat: '105mm', owner: 'crew', x: 0, y, z: 0,
    vx: 4000, vy: 0, vz: 0, gravity: 0, life: 1, damage: 220, radius: 125 });
  sim._advanceProjectiles(0.05);
  assert.equal(sim.projectiles[0].life, 0);
  assert.equal(sim.targets[0].health, 280, 'a shell crossing both sides of the target still hits');
  assert.ok(sim.targets[1].health < 500, 'the heavy shell splashes a nearby vehicle');
  assert.equal(sim.targets[2].health, 500, 'the blast is bounded');
  assert.equal(sim.crew.lastHit.seat, '105mm');
});

test('the first terrain intersection blocks a cannon hit behind a ridge', () => {
  const data = mission(); data.biome = 'mountains';
  data.targets = [{ id: 'behind-ridge', type: 'depot', x: 6000, z: 0, health: 500, hitRadius: 32 }];
  const sim = new FlightSimulation(data);
  // Put an elevated test objective beyond the ridge at the traced altitude.
  sim.targets[0].y = 900;
  assert.ok(terrainHeight(0, 0, data) < 900 && terrainHeight(1500, 0, data) > 900);
  sim.projectiles.push({ id: 'occluded', type: 'shell', seat: '40mm', owner: 'crew',
    x: 0, y: 900, z: 0, vx: 120000, vy: 0, vz: 0, gravity: 0, life: 1, damage: 65, radius: 58 });
  sim._advanceProjectiles(0.05);
  assert.equal(sim.projectiles[0].life, 0);
  assert.ok(sim.projectiles[0].x < 1500);
  assert.equal(sim.targets[0].health, 500);
});

test('crew aim is not an automatic hit on the selected target and rejects legacy remote weapon actions', () => {
  const sim = new FlightSimulation(mission());
  sim.targetId = 'nightwatch-depot';
  sim.applyCrewInput(crewInput('25mm', { yaw: 0.6 }), 'gunner'); sim.step(dt);
  sim.applyCrewInput(crewInput('25mm', { fire: false }), 'gunner');
  fly(sim, 4);
  assert.equal(sim.targets[0].health, sim.targets[0].initialHealth);
  assert.equal(sim.applyRemoteAction({ name: 'fire', targetId: sim.targets[0].id }, { ...sim.player, id: 'gunner' }), false);
  assert.equal(sim.remoteWeapons.size, 0);
});

test('crew snapshots share the one pilot aircraft, damage, stations and objective without guest prediction', () => {
  const host = new FlightSimulation(mission(), { playerId: 'pilot' });
  const guest = new FlightSimulation(mission(), { playerId: 'gunner' });
  host.player.health = 211;
  host.player.orientation = orientationFromEuler(1.2, 0.2, Math.PI);
  host.applyCrewInput(crewInput('40mm', { yaw: 0.3, pitch: -0.1 }), 'gunner'); host.step(dt);
  const snapshot = host.getSnapshot();
  assert.equal(guest.applySnapshot(snapshot), true);
  assert.equal(guest.worldAuthority, false);
  assert.equal(guest.player.id, 'pilot');
  assert.equal(guest.player.health, 211);
  assert.deepEqual(guest.player.orientation, host.player.orientation);
  assert.deepEqual(guest.crew, host.crew);
  assert.equal(guest.objective, host.objective);
  const before = structuredClone(guest.player), stores = structuredClone(guest.crew.stations);
  guest.step(0.05, { roll: 1, pitch: 1, yaw: 1, throttle: 1, fire: true });
  assert.deepEqual(guest.player, before);
  assert.deepEqual(guest.crew.stations, stores);
  assert.equal(guest.applyCrewInput(crewInput(), 'gunner'), false);
  assert.equal(guest.action('gear'), false);
  host.player.health = 0; host.step(dt);
  guest.applySnapshot(host.getSnapshot());
  assert.equal(guest.status, 'failed');
  assert.equal(guest.player.health, 0);
});

test('station ammunition and shared completion survive snapshots without changing campaign unlocks', () => {
  const sim = new FlightSimulation(mission());
  for (const target of sim.targets) sim._damage(target, 1e6, 'test');
  fly(sim, 5.1);
  assert.equal(sim.status, 'success');
  assert.equal(sim.progress, 1);
  assert.equal(sim.crew.fire, false);
  const guest = new FlightSimulation(mission());
  guest.applySnapshot(sim.getSnapshot());
  assert.equal(guest.status, 'success');
  assert.equal(guest.targets.filter(target => target.health <= 0).length, 8);
  assert.equal(MISSIONS.length, 18);
});

test('a pilot flying a left orbit and a gunner aiming actual shells can finish all eight targets', () => {
  const sim = new FlightSimulation(mission(), { autoLevel: false });
  const station = getGunshipStation('40mm'), orbit = sim.mission.orbit;
  fly(sim, 90, state => {
    const p = state.player, target = state.targets.find(item => item.health > 0);
    if (target) {
      const mount = gunshipStationPose(p, station.id).mount, axes = basis(p.orientation);
      const delta = { x: target.x - mount.x, y: target.y - mount.y, z: target.z - mount.z };
      // Low-angle ballistic solution in world gravity, then express its launch
      // vector in the moving aircraft axes. This only drives the test gunner;
      // the production game always receives the human player's bounded aim.
      const horizontal = Math.hypot(delta.x, delta.z), speed2 = station.speed ** 2;
      const discriminant = speed2 ** 2 - station.gravity * (station.gravity * horizontal ** 2 + 2 * delta.y * speed2);
      const elevation = Math.atan((speed2 - Math.sqrt(Math.max(0, discriminant))) / (station.gravity * horizontal));
      const shot = { x: delta.x / horizontal * Math.cos(elevation), y: Math.sin(elevation), z: delta.z / horizontal * Math.cos(elevation) };
      const local = { x: -dot(shot, axes.right), y: dot(shot, axes.up), z: dot(shot, axes.forward) };
      state.applyCrewInput(crewInput('40mm', {
        yaw: Math.atan2(local.z, local.x), pitch: Math.atan2(local.y, Math.hypot(local.x, local.z)) - GUNSHIP_BASE_ELEVATION,
      }), 'gunner');
    } else state.applyCrewInput(crewInput('40mm', { fire: false }), 'gunner');
    const theta = Math.atan2(p.x - orbit.x, p.z - orbit.z) + 0.25;
    const ahead = { x: orbit.x + Math.sin(theta) * orbit.radius, z: orbit.z + Math.cos(theta) * orbit.radius };
    const desiredHeading = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    const desiredBank = clamp(angle(desiredHeading - p.heading) * 2, -0.6, 0.6);
    const climb = clamp((orbit.altitude - p.y) * 0.12, -10, 10);
    const desiredPitch = Math.asin(clamp((climb - p.settlingSpeed) / Math.max(20, p.speed), -0.6, 0.6));
    return { throttle: p.throttle, roll: clamp((p.roll - desiredBank) * 2, -0.8, 0.8), pitch: clamp((desiredPitch - p.pitch) * 4, -0.7, 0.7) };
  });
  assert.equal(sim.status, 'success', `${sim.objective}; ${sim.targets.filter(target => target.health > 0).map(target => `${target.id}:${target.health}`).join(', ')}`);
  assert.equal(sim.targets.filter(target => target.health <= 0).length, 8);
  assert.ok(sim.crew.stations['40mm'].ammo > 0, 'the playable mission does not require infinite stores');
  assert.ok(sim.player.health > 0);
});
