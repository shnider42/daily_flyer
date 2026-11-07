import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, getMission } from '../public/campaign.mjs';
import { FlightSimulation, terrainHeight } from '../public/sim.mjs';
import { orientationFromEuler, orientationOf, basis, deriveEuler, slerp, normalizeOrientation, integrateBodyRotation } from '../public/orientation.mjs';

const dt = 1 / 60;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const quaternionDot = (a, b) => dot(a, b) + a.w * b.w;
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be ${expected} ± ${tolerance}`);
const fly = (sim, seconds, input = {}) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    sim.step(dt, input);
    assert.equal(sim.status, 'flying');
  }
};
function flight(assist = 'assisted', autoLevel = true, aircraft = 'f15') {
  const mission = { ...structuredClone(getMission('first-light')), id: 'attitude-flight', kind: 'free', aircraft,
    start: { x: 0, y: 10000, z: 0, heading: 0, speed: AIRCRAFT[aircraft].cruise, airborne: true },
    waypoints: [], enemies: [], targets: [], goal: {}, weather: { wind: { x: 0, z: 0 } } };
  return new FlightSimulation(mission, { assist, autoLevel });
}
function attitude(sim, heading, pitch, roll) {
  sim.player.orientation = orientationFromEuler(heading, pitch, roll);
  Object.assign(sim.player, deriveEuler(sim.player.orientation));
}

test('legacy Euler snapshots preserve attitude through vertical poles and inverted flight', () => {
  for (const heading of [-2.5, 0, 1.7]) for (const pitch of [-Math.PI, -Math.PI / 2, -1.2, 0, 1.2, Math.PI / 2, 2.4, Math.PI]) {
    for (const roll of [-Math.PI, -1.4, 0, 0.9, Math.PI]) {
      const original = orientationFromEuler(heading, pitch, roll), angles = deriveEuler(original);
      const rebuilt = orientationOf(angles);
      near(Math.abs(quaternionDot(original, rebuilt)), 1);
      const frame = basis(rebuilt);
      near(dot(frame.forward, frame.up), 0);
      near(dot(frame.forward, frame.right), 0);
      near(dot(frame.up, frame.right), 0);
    }
  }
});

test('named pitch, yaw and roll inputs follow cockpit up/right rather than model-axis assumptions', () => {
  for (const initial of [orientationFromEuler(0, 0, 0), orientationFromEuler(1.1, 0.5, -Math.PI / 2), orientationFromEuler(-0.6, 0, Math.PI)]) {
    const frame = basis(initial);
    const pitched = basis(integrateBodyRotation(initial, { pitch: 1 }, 0.1));
    const yawed = basis(integrateBodyRotation(initial, { yaw: 1 }, 0.1));
    const rolled = basis(integrateBodyRotation(initial, { roll: 1 }, 0.1));
    assert.ok(dot(pitched.forward, frame.up) > 0.09, 'pull must move the nose toward the canopy');
    assert.ok(dot(yawed.forward, frame.right) > 0.09, 'right yaw must move the nose toward cockpit right');
    assert.ok(dot(rolled.up, frame.right) > 0.09, 'right roll must lower the cockpit-right wing');
    near(dot(rolled.forward, frame.forward), 1);
  }
});

test('orientation normalization and shortest-path interpolation remain finite and do not mutate inputs', () => {
  const malformed = { orientation: { x: NaN, y: 0, z: 0, w: 1 }, heading: 0.8, pitch: 0.2, roll: -0.4 };
  near(Math.abs(quaternionDot(orientationOf(malformed), orientationFromEuler(0.8, 0.2, -0.4))), 1);
  const extreme = normalizeOrientation({ x: 1e308, y: 1e308, z: 1e308, w: 1e308 });
  near(Math.hypot(extreme.x, extreme.y, extreme.z, extreme.w), 1);
  const q = orientationFromEuler(0.7, 1.4, -2.8), opposite = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, -v]));
  const before = structuredClone([q, opposite]);
  near(Math.abs(quaternionDot(slerp(q, opposite, 0.5), q)), 1);
  assert.deepEqual([q, opposite], before);
});

test('a banked pull turns the nose and flight path sideways in every assistance mode', () => {
  for (const assist of ['assisted', 'standard', 'expert']) {
    const sim = flight(assist);
    attitude(sim, 0, 0, -Math.PI / 2); // Right wing points down.
    fly(sim, 0.5, { pitch: 1, throttle: 0.7 });
    const p = sim.player, forward = basis(p.orientation).forward;
    assert.ok(forward.x < -0.35, `${assist}: pull in a right bank must bend the nose right`);
    near(forward.y, 0);
    assert.ok(p.x < -15, `${assist}: the airplane must actually travel along that turn`);
    assert.ok(p.y < 10000, 'banking removes vertical lift; pulling must not command world-up ascent');
    near(p.verticalSpeed - p.settlingSpeed, forward.y * p.speed);
    near(p.vz, forward.z * p.speed);
  }
});

test('pulling while inverted lowers both the nose and the flight path in every assistance mode', () => {
  for (const assist of ['assisted', 'standard', 'expert']) {
    const sim = flight(assist);
    attitude(sim, 0, 0, Math.PI);
    fly(sim, 0.5, { pitch: 1, throttle: 0.7 });
    const p = sim.player, frame = basis(p.orientation);
    assert.ok(frame.forward.y < -0.25, `${assist}: inverted pull must point the nose toward the ground`);
    assert.ok(frame.up.y < -0.9, 'active controls must not trigger forced upright recovery');
    assert.ok(p.y < 9980 && p.verticalSpeed < -60, 'the trajectory must follow the lowered nose');
    near(p.verticalSpeed - p.settlingSpeed, frame.forward.y * p.speed);
  }
});

test('right yaw rotates about local up at level, banked and inverted attitudes', () => {
  for (const assist of ['assisted', 'standard', 'expert']) {
    const level = flight(assist), banked = flight(assist), inverted = flight(assist);
    attitude(banked, 0, 0, -Math.PI / 2);
    attitude(inverted, 0, 0, Math.PI);
    for (const sim of [level, banked, inverted]) fly(sim, 0.5, { yaw: 1, throttle: 0.7 });
    assert.ok(basis(level.player.orientation).forward.x < -0.04, 'upright cockpit right is world −X');
    assert.ok(basis(inverted.player.orientation).forward.x > 0.04, 'inverted cockpit right is world +X');
    assert.ok(basis(banked.player.orientation).forward.y < -0.04, 'right yaw in a right bank must move the nose down');
    assert.ok(banked.player.verticalSpeed < -15, 'banked yaw must change the actual vertical path');
  }
});

test('every assistance mode allows full rolls and loops without angle clamps or pole jumps', () => {
  for (const assist of ['assisted', 'standard', 'expert']) for (const control of ['pitch', 'roll']) {
    const sim = flight(assist), rate = control === 'pitch' ? 0.55 : sim.aircraft.rollRate;
    let inverted = false, previous = sim.player.orientation;
    for (let i = 0; i < Math.ceil(2 * Math.PI / rate / dt); i++) {
      sim.step(dt, { [control]: 1, throttle: 1 });
      assert.equal(sim.status, 'flying');
      const orientation = sim.player.orientation;
      near(Math.hypot(orientation.x, orientation.y, orientation.z, orientation.w), 1);
      assert.ok(Math.abs(quaternionDot(previous, orientation)) > 0.999, 'adjacent attitudes must remain continuous across Euler branches');
      inverted ||= basis(orientation).up.y < -0.99;
      previous = orientation;
    }
    assert.equal(inverted, true, `${assist}: ${control} must be allowed through inversion`);
    assert.ok(basis(sim.player.orientation).up.y > 0.999, 'a full rotation must finish upright');
  }
});

test('gravity stays world-down and lift rotates with the wings', () => {
  const upright = flight('assisted', false), banked = flight('assisted', false), inverted = flight('assisted', false);
  attitude(banked, 0, 0, -Math.PI / 2); attitude(inverted, 0, 0, Math.PI);
  for (const sim of [upright, banked, inverted]) fly(sim, 1, { throttle: 0.7 });
  near(upright.player.verticalSpeed, 0);
  assert.ok(banked.player.verticalSpeed < -7);
  assert.ok(inverted.player.verticalSpeed < banked.player.verticalSpeed * 1.9);
  assert.ok(basis(inverted.player.orientation).up.y < -0.99, 'turning auto-level off must preserve an inverted attitude');
});

test('LEVEL recovery is smooth and immediately yields to an aircraft-relative control', () => {
  const sim = flight('assisted', false);
  attitude(sim, 0.4, 0.2, Math.PI);
  const before = structuredClone(sim.player.orientation);
  assert.equal(sim.action('level'), true);
  assert.deepEqual(sim.player.orientation, before, 'LEVEL must not teleport the orientation');
  sim.step(dt, { throttle: 0.7 });
  assert.ok(Math.abs(quaternionDot(before, sim.player.orientation)) > 0.995);
  fly(sim, 1.5, { throttle: 0.7 });
  assert.ok(basis(sim.player.orientation).up.y > 0.99);
  const priorBank = sim.player.roll;
  sim.action('level'); sim.step(dt, { roll: 1, throttle: 0.7 });
  assert.equal(sim.player.levelAssist, 0, 'pilot input must cancel explicit recovery');
  assert.ok(sim.player.roll < priorBank - 0.025, 'right roll must respond immediately from the remaining recovery attitude');
});

test('fine thumb corrections suspend automatic leveling just as full keyboard controls do', () => {
  for (const assist of ['assisted', 'standard', 'expert']) for (const control of ['pitch', 'roll', 'yaw']) {
    const on = flight(assist, true), off = flight(assist, false);
    for (const sim of [on, off]) {
      attitude(sim, 0.4, 0.3, Math.PI);
      sim.step(dt, { [control]: 0.001, throttle: 0.7 });
    }
    assert.deepEqual(on.player, off.player, `${assist}: ${control} must not fight auto-level near the thumb dead zone`);
  }
});

test('hover uses aircraft-relative controls and aircraft-up thrust instead of world-up thrust', () => {
  const sim = flight('assisted', false, 'harrier');
  sim.player.speed = 0; attitude(sim, 0, 0, Math.PI);
  assert.equal(sim.action('hover'), true);
  fly(sim, 0.5, { yaw: 1, throttle: 0.5 });
  assert.ok(basis(sim.player.orientation).forward.x > 0.3, 'inverted local yaw must reverse its world direction');
  assert.ok(sim.player.verticalSpeed < -30, 'half throttle cannot hold altitude when the nozzles point upward');
});

test('legacy pose edits and runway steering keep quaternion and display angles synchronized', () => {
  const sim = flight('assisted', false);
  Object.assign(sim.player, { heading: 0.7, pitch: 0.25, roll: -0.4 });
  sim.step(dt, { throttle: 0.7 });
  near(sim.player.pitch, 0.25); near(sim.player.roll, -0.4);
  near(Math.abs(quaternionDot(orientationFromEuler(sim.player.heading, sim.player.pitch, sim.player.roll), sim.player.orientation)), 1);
  Object.assign(sim.player, { onGround: true, heading: 0, pitch: 0, roll: 0, speed: 20, brake: false });
  fly(sim, 0.5, { yaw: 1, throttle: 0.1 });
  assert.equal(sim.player.onGround, true);
  assert.ok(sim.player.heading < 0, 'right rudder must steer toward cockpit right on the runway');
  near(basis(sim.player.orientation).up.y, 1);
});

test('remote guns can point straight up without the old pitch clamp deflecting the shot', () => {
  const sim = flight('assisted', false, 'camel');
  sim.targets = [{ id: 'above', type: 'balloon', x: 0, y: 10500, z: 0, health: 55, initialHealth: 55, alive: true }];
  const remote = { id: 'wingmate', x: 0, y: 10000, z: 0, heading: 0, pitch: Math.PI / 2, roll: 0, speed: 50, aircraft: 'camel' };
  assert.equal(sim.applyRemoteAction({ name: 'fire' }, remote), true);
  const bullet = sim.projectiles.at(-1);
  near(bullet.vx, 0); near(bullet.vy, 1000); near(bullet.vz, 0);
  assert.ok(sim.targets[0].health < 55);
});

test('an almost stationary vertical aircraft cannot count as a safe wheels-down landing', () => {
  const sim = flight('assisted', false);
  attitude(sim, 0, -Math.PI / 2, 0);
  Object.assign(sim.player, { y: terrainHeight(0, 0, sim.mission) + 3.001, speed: 0, engine: false, gear: true });
  sim.step(dt, { throttle: 0 });
  assert.equal(sim.status, 'failed');
  assert.equal(sim.player.crashed, true);
  assert.equal(sim.player.landings, 0);
});
