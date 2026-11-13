import test from 'node:test';
import assert from 'node:assert/strict';
import { OPERATIONS, getOperation } from '../public/operations.mjs';
import { AIRCRAFT, getMission } from '../public/campaign.mjs';
import { FlightSimulation, terrainHeight, surfaceHeight } from '../public/sim.mjs';
import { createArenaMission } from '../public/arena.mjs';
import { orientationFromEuler } from '../public/orientation.mjs';

const fly = (sim, seconds, input = { throttle: 0 }) => {
  for (let elapsed = 0; elapsed < seconds && sim.status === 'flying'; elapsed += .05) sim.step(.05, typeof input === 'function' ? input(sim) : input);
};
const operation = id => new FlightSimulation(structuredClone(getOperation(id)));
function touchdown(sim, index, hover = false) {
  const r = sim.mission.runways[index], p = sim.player, before = p.landings;
  Object.assign(p, { x: r.x + (r.carrier ? -5 : 0), z: r.z, y: r.y + 3.08, heading: r.heading, pitch: -.015, roll: 0,
    orientation: orientationFromEuler(r.heading, -.015, 0), speed: hover ? 0 : AIRCRAFT[p.aircraft].stallSpeed * 1.15,
    throttle: hover ? .42 : 0, engine: true, gear: true, flaps: true, onGround: false, everAirborne: true,
    verticalSpeed: -3, settlingSpeed: -3, vx: 0, vz: 0, brake: false, hover });
  sim.step(.05, { throttle: p.throttle });
  assert.equal(p.crashed, undefined, p.crashCause);
  assert.equal(p.onGround, true);
  assert.equal(p.landings, before + 1);
  p.brake = true;
  fly(sim, 4, { throttle: 0 });
}

test('operations have their own goals, legal aircraft, safe starts and useful landing fields', () => {
  assert.equal(OPERATIONS.length, 9);
  assert.equal(new Set(OPERATIONS.map(m => m.id)).size, 9);
  assert.equal(getOperation('unknown'), null);
  const tasks = new Set();
  for (const m of OPERATIONS) {
    assert.ok(AIRCRAFT[m.aircraft]); assert.equal(m.goal.type, 'operation'); tasks.add(m.goal.task);
    assert.equal(m.operation.id, m.id); assert.equal(m.weatherPreset, 'authored');
    assert.ok(m.operation.medals.gold.time < m.operation.medals.silver.time);
    const sim = new FlightSimulation(structuredClone(m));
    assert.equal(sim.status, 'flying');
    assert.ok(m.start.y >= surfaceHeight(m.start.x, m.start.z, m) + 2.9);
    if (m.start.airborne) assert.ok(m.start.y > surfaceHeight(m.start.x, m.start.z, m) + 150);
    for (const w of m.waypoints) assert.ok(w.y - w.radius > Math.max(0, terrainHeight(w.x, w.z, m)) + 50, `${m.id}: gate does not force ground contact`);
    for (const index of m.goal.stops || [m.goal.destinationRunway]) assert.ok(m.runways[index]);
    if (m.goal.task === 'ground') assert.ok(AIRCRAFT[m.aircraft].bombs > m.goal.count);
  }
  assert.deepEqual([...tasks].sort(), ['air', 'courier', 'ground', 'passenger', 'route']);
});

test('route gates count in order, swept passage is detected, and the route never times out', () => {
  const sim = operation('op-ridge-runner'), gates = sim.mission.waypoints;
  Object.assign(sim.player, gates[3]); sim._stepStart = { ...sim.player };
  sim._advanceWaypoints(); assert.equal(sim.waypointIndex, 0, 'later gates cannot skip the route');
  for (const w of gates) {
    sim._stepStart = { x: w.x, y: w.y, z: w.z - w.radius - 30 };
    Object.assign(sim.player, { x: w.x, y: w.y, z: w.z + w.radius + 30, onGround: false });
    sim._advanceWaypoints();
  }
  sim.time = 1500; sim._updateObjective(0);
  assert.equal(sim.status, 'flying'); assert.equal(sim.phase, 'landing');
  assert.equal(sim.sortieStats.gatesReached, gates.length);
  assert.equal(sim.navigationTarget.runwayIndex, 0);
  touchdown(sim, 0);
  assert.equal(sim.status, 'success');
  assert.equal(sim.operationState.stage, 'complete');
});

test('courier requires two distinct physical landings and uninterrupted stopped unloading', () => {
  const sim = operation('op-mail-run');
  Object.assign(sim.player, { everAirborne: true, x: sim.mission.runways[1].x, z: sim.mission.runways[1].z, y: 38 });
  fly(sim, 5); assert.equal(sim.operationState.leg, 0, 'ground placement is not a touchdown');
  touchdown(sim, 1);
  sim.player.brake = false; sim.step(.05, { throttle: .3 });
  assert.equal(sim.operationState.unloadTime, 0, 'moving cancels unloading');
  sim.player.brake = true; fly(sim, 4.2);
  assert.equal(sim.operationState.leg, 1);
  const firstLanding = sim.player.landings;
  fly(sim, 6);
  assert.equal(sim.operationState.leg, 1, 'waiting at first field cannot deliver the second load');
  touchdown(sim, 2); fly(sim, 4.2);
  assert.equal(sim.player.landings, firstLanding + 1); assert.equal(sim.status, 'success');
  assert.equal(sim.sortieStats.landings, 2); assert.ok(sim.sortieStats.lastLanding.sinkRate > 0);
});

test('mail cargo cannot be dropped as paratroopers while ordinary C-47 loads are preserved', () => {
  const courier = operation('op-mail-run');
  assert.equal(courier.player.troopers, 0); assert.equal(courier.player.dropsRemaining, 0);
  assert.equal(courier.action('payload'), false); assert.equal(courier.paratroopers.length, 0);
  assert.equal(courier.operationState.leg, 0);
  const campaign = new FlightSimulation(getMission('longest-minute'));
  assert.equal(campaign.player.troopers, 24); assert.equal(campaign.player.dropsRemaining, 2);
  const zone = campaign.targets.find(target => target.id === campaign.mission.goal.zoneId);
  Object.assign(campaign.player, { x: zone.x, y: Math.max(0, terrainHeight(zone.x, zone.z, campaign.mission)) + 500, z: zone.z, speed: 80, roll: 0 });
  assert.equal(campaign.action('payload'), true); assert.equal(campaign.paratroopers.length, 12);
  const free = new FlightSimulation(createArenaMission({ mode: 'freeflight' }, 'c47'));
  assert.equal(free.player.troopers, 24); assert.equal(free.player.dropsRemaining, 2);
});

test('air operation brings in its second patrol once and still requires recovery', () => {
  const sim = operation('op-coastwatch');
  for (const e of [...sim.enemies]) sim._damage(e, 1000, 'missile', sim.player.id);
  sim._updateObjective(0);
  assert.equal(sim.enemies.length, 4); assert.equal(sim.operationState.reinforcementsSent, true);
  sim._updateObjective(0); assert.equal(sim.enemies.length, 4);
  for (const e of sim.enemies.filter(e => e.health > 0)) sim._damage(e, 1000, 'missile', sim.player.id);
  sim._updateObjective(0);
  assert.equal(sim.status, 'flying'); assert.equal(sim.phase, 'landing');
  assert.equal(sim.sortieStats.airKills, 4);
  touchdown(sim, 0); assert.equal(sim.status, 'success');
});

test('ground strike protects the relief camp and counts the specified supply objectives', () => {
  const sim = operation('op-broken-supply');
  sim._damage(sim.targets.find(t => t.hazard), 1000, 'gun', sim.player.id);
  sim._updateObjective(0); assert.equal(sim.operationState.stage, 'task');
  for (const target of sim.targets.filter(t => sim.mission.goal.targetIds.includes(t.id))) sim._damage(target, 1000, 'bomb', sim.player.id);
  sim._updateObjective(0); assert.equal(sim.phase, 'landing'); assert.equal(sim.status, 'flying');
  const bad = operation('op-broken-supply');
  bad._damage(bad.targets.find(t => t.friendly), 1000, 'bomb', bad.player.id); bad._updateObjective(0);
  assert.equal(bad.status, 'failed'); assert.match(bad.objective, /protected friendly/);
});

test('a previous landing cannot finish a newly completed strike, and final bombs may still hit', () => {
  const sim = operation('op-heavy-metal');
  touchdown(sim, 0); assert.equal(sim.status, 'flying');
  for (const target of sim.targets.filter(t => sim.mission.goal.targetIds.includes(t.id))) sim._damage(target, 1000, 'bomb', sim.player.id);
  sim._updateObjective(0); fly(sim, 2);
  assert.equal(sim.status, 'flying', 'the crew must fly a recovery after the task');
  touchdown(sim, 0); assert.equal(sim.status, 'success');
  const lastBomb = operation('op-heavy-metal'); lastBomb.player.bombs = 0;
  lastBomb.projectiles.push({ id: 'last-bomb', type: 'bomb', life: 3 }); lastBomb._updateObjective(0);
  assert.equal(lastBomb.status, 'flying'); lastBomb.projectiles[0].life = 0; lastBomb._updateObjective(0);
  assert.equal(lastBomb.status, 'failed');
});

test('carrier circuit requires an actual hover touchdown after the circuit', () => {
  const sim = operation('op-deck-circuit'); sim.waypointIndex = sim.mission.waypoints.length; sim._updateObjective(0);
  touchdown(sim, 0, true);
  assert.equal(sim.status, 'success'); assert.equal(sim.player.lastLanding.hover, true);
  assert.ok(sim.player.lastLanding.sinkRate >= 0); assert.equal(sim.player.lastLanding.quality, 'smooth');
});

function servicingSim() {
  const mission = { ...structuredClone(getOperation('op-heavy-metal')), id: 'service-test', operation: null, kind: 'free', goal: {}, enemies: [], targets: [], waypoints: [] };
  const sim = new FlightSimulation(mission), r = mission.runways[0];
  Object.assign(sim.player, { x: r.x, y: r.y + 3, z: r.z, onGround: true, gear: true, brake: true, speed: 0, throttle: 0, health: 100, fuel: 40, bombs: 2 });
  return sim;
}

test('ground crew restores a stopped solo aircraft only after an uninterrupted dwell', () => {
  const sim = servicingSim(); fly(sim, 4);
  assert.equal(sim.player.health, 100); assert.ok(sim.groundService.active); assert.ok(sim.groundService.progress > .45);
  sim.player.brake = false; sim.step(.05, { throttle: .3 }); assert.equal(sim.groundService.progress, 0);
  sim.player.brake = true; fly(sim, 7);
  assert.equal(sim.player.health, 100); fly(sim, 2);
  assert.equal(sim.player.health, AIRCRAFT.b17.health); assert.equal(sim.player.bombs, 12); assert.ok(sim.player.fuel > 99);
  assert.equal(sim.groundService.completed, true); assert.equal(sim.sortieStats.damageTaken, 0, 'repair is not counted as damage');
});

test('ground service cannot refill in the air, away from a runway, during operations or in multiplayer', () => {
  for (const setup of [
    sim => { sim.player.onGround = false; sim.player.y = 1000; sim.player.speed = 94; },
    sim => { sim.player.x += 4000; },
    sim => { sim.mission.kind = 'operation'; },
    sim => { sim.multiplayer = { mode: 'freeflight' }; },
    sim => { sim.worldAuthority = false; },
  ]) {
    const sim = servicingSim(); setup(sim);
    for (let i = 0; i < 200; i++) sim._advanceGroundService(.05);
    assert.equal(sim.player.health, 100); assert.equal(sim.player.bombs, 2); assert.equal(sim.groundService.progress, 0);
  }
});

test('flight statistics track local flight and damage once and operation progress survives snapshots', () => {
  const sim = operation('op-coastwatch'); fly(sim, 2, { throttle: sim.player.throttle });
  assert.ok(sim.sortieStats.airTime > 1.9); assert.ok(sim.sortieStats.distance > 450);
  sim._damagePlayer(25, 'bullet'); assert.equal(sim.sortieStats.damageTaken, 25);
  sim.player.health = AIRCRAFT.f15.health; assert.equal(sim.sortieStats.damageTaken, 25);
  const snapshot = sim.getSnapshot(), guest = operation('op-coastwatch');
  assert.equal(guest.applySnapshot(snapshot), true); assert.deepEqual(guest.operationState, sim.operationState);
  assert.notEqual(guest.sortieStats.airTime, sim.sortieStats.airTime, 'another pilot cannot inherit the host flight totals');
  assert.equal(snapshot.sortieStats.damageTaken, 25);
  const arena = createArenaMission({ mode: 'freeflight' }, 'f16');
  assert.equal(new FlightSimulation(arena).operationState, null);
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angle = value => ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
function steer(sim, point, throttle, descent = 20, climbLimit = 30, bankLimit = .72) {
  const p = sim.player, wind = sim.mission.weather.wind;
  let heading = Math.atan2(point.x - p.x, point.z - p.z);
  heading -= Math.asin(clamp((wind.x * Math.cos(heading) - wind.z * Math.sin(heading)) / Math.max(25, p.speed), -.5, .5));
  const bank = clamp(angle(heading - p.heading) * 2, -bankLimit, bankLimit);
  const climb = clamp((point.y - p.y) * .12, -descent, climbLimit);
  const pitch = Math.asin(clamp((climb - p.settlingSpeed) / Math.max(20, p.speed), -.8, .8));
  return { throttle, roll: clamp((p.roll - bank) * 3, -.8, .8), pitch: clamp((pitch - p.pitch) * 5, -.7, .7) };
}

test('both flight courses are traversable using continuous pitch, bank and thrust controls', () => {
  for (const id of ['op-ridge-runner', 'op-deck-circuit']) {
    const sim = operation(id);
    for (let t = 0; t < 300 && sim.status === 'flying' && sim.operationState.stage === 'task'; t += 1 / 60) {
      const point = sim.mission.waypoints[sim.waypointIndex];
      if (!point) break;
      sim.step(1 / 60, steer(sim, point, id === 'op-ridge-runner' ? .42 : .45));
    }
    assert.equal(sim.status, 'flying', `${id}: ${sim.player.crashCause}`);
    assert.equal(sim.waypointIndex, sim.mission.waypoints.length, `${id}: all gates must be reachable without teleportation`);
    assert.equal(sim.operationState.stage, 'return');
  }
});

test('courier can complete both departures, approaches, physical landings and deliveries through flight controls', () => {
  const sim = operation('op-mail-run'); let leg = 0, final = false;
  for (let t = 0; t < 700 && sim.status === 'flying'; t += 1 / 60) {
    const p = sim.player, state = sim.operationState, index = sim.mission.goal.stops[state.leg], r = sim.mission.runways[index];
    if (leg !== state.leg) { leg = state.leg; final = false; }
    let input = { throttle: 1, pitch: .45, roll: 0 };
    if (p.onGround) {
      if (p.lastLanding?.runwayIndex === index) { p.brake = true; input = { throttle: 0, pitch: 0, roll: 0 }; }
      else p.brake = false;
    } else {
      const c = Math.cos(r.heading), s = Math.sin(r.heading), along = (p.x - r.x) * s + (p.z - r.z) * c;
      const approach = { x: r.x - s * (r.length / 2 + 2200), z: r.z - c * (r.length / 2 + 2200), y: r.y + 300 };
      if (Math.hypot(approach.x - p.x, approach.z - p.z) < 330) final = true;
      const point = final ? { x: r.x + s * 3000, z: r.z + c * 3000, y: r.y + 1 + Math.max(0, -r.length / 2 - along) * .09 } : approach;
      input = steer(sim, point, final ? .4 : 1, 8, 12, .6); p.gear = true; p.flaps = final;
    }
    sim.step(1 / 60, input);
  }
  assert.equal(sim.status, 'success', sim.player.crashCause || sim.objective);
  assert.equal(sim.operationState.leg, 2); assert.equal(sim.player.landings, 2);
  assert.ok(sim.time < 420, 'a clean flown route can achieve the authored gold time');
});
