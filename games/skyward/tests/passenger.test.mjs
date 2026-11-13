import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT } from '../public/campaign.mjs';
import { OPERATIONS, getOperation } from '../public/operations.mjs';
import { FlightSimulation } from '../public/sim.mjs';
import { orientationFromEuler, basis } from '../public/orientation.mjs';

const routes = OPERATIONS.filter(mission => mission.goal.task === 'passenger');
const make = (id = 'op-coastal-connection') => new FlightSimulation(structuredClone(getOperation(id)));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angle = value => ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
function fly(sim, seconds, input = { throttle: 0 }) {
  for (let time = 0; time < seconds && sim.status === 'flying'; time += .05) sim.step(.05, typeof input === 'function' ? input(sim) : input);
}
function depart(sim) {
  sim.player.brake = false; sim.player.flaps = true;
  fly(sim, 5, { throttle: 1, pitch: .3 });
  assert.equal(sim.player.onGround, false); assert.equal(sim.passengerState.departed, true);
}
function touchdown(sim, index) {
  const p = sim.player, r = sim.mission.runways[index], before = p.landings;
  Object.assign(p, { x: r.x, y: r.y + 3.08, z: r.z, heading: r.heading, pitch: -.015, roll: 0,
    orientation: orientationFromEuler(r.heading, -.015, 0), speed: AIRCRAFT.b767.stallSpeed * 1.15,
    throttle: 0, engine: true, gear: true, flaps: true, onGround: false, everAirborne: true,
    verticalSpeed: -3, settlingSpeed: -3, vx: 0, vz: 0, brake: false });
  sim.step(.05, { throttle: 0 });
  assert.equal(p.onGround, true, p.crashCause); assert.equal(p.landings, before + 1);
  p.brake = true;
}

test('passenger routes have populated cabins, distinct airports and no combat or mandatory racing gates', () => {
  assert.equal(routes.length, 3);
  assert.deepEqual(routes.map(route => route.weather.timeOfDay).sort(), ['day', 'dusk', 'night']);
  for (const m of routes) {
    const sim = make(m.id);
    assert.equal(m.aircraft, 'b767'); assert.equal(m.waypoints.length, 0); assert.equal(m.enemies.length, 0); assert.equal(m.targets.length, 0);
    assert.ok(m.passengers > 0 && m.passengers <= AIRCRAFT.b767.passengerCapacity);
    assert.equal(sim.passengerState.aboard, m.passengers); assert.equal(sim.passengerState.delivered, 0);
    assert.equal(sim.passengerState.departed, false); assert.equal(sim.operationState.stage, 'departure');
    assert.notEqual(m.goal.departureRunway, m.goal.destinationRunway);
    for (const runway of m.runways) { assert.ok(runway.airport); assert.equal(runway.airfieldType, 'airport'); assert.ok(runway.length >= 3000 && runway.width >= 140); }
    assert.ok(m.passengerRoute.arrivalDistance >= 15000, 'the heavy aircraft needs room to slow down before descent');
    assert.equal(sim.player.ammo, 0); assert.equal(sim.player.missiles, 0); assert.equal(sim.player.bombs, 0); assert.equal(sim.player.troopers, 0);
    assert.equal(sim.action('payload'), false); assert.equal(sim.action('missile'), false); assert.equal(sim.action('fire'), false);
    assert.equal(sim.projectiles.length, 0); assert.equal(sim.paratroopers.length, 0);
  }
});

test('passengers cannot be delivered without a real departure or at the wrong airport', () => {
  const noDeparture = make(), destination = noDeparture.mission.goal.destinationRunway;
  touchdown(noDeparture, destination); fly(noDeparture, 10);
  assert.equal(noDeparture.status, 'flying'); assert.equal(noDeparture.passengerState.departed, false);
  assert.equal(noDeparture.passengerState.delivered, 0); assert.equal(noDeparture.passengerState.aboard, 198);
  const wrongAirport = make(); depart(wrongAirport);
  touchdown(wrongAirport, wrongAirport.mission.goal.departureRunway); fly(wrongAirport, 10);
  assert.equal(wrongAirport.status, 'flying'); assert.equal(wrongAirport.passengerState.delivered, 0);
  assert.match(wrongAirport.hint, /not Seabury/);
});

test('an airborne spawn, a takeoff at the wrong airport, and a runway overrun are not valid departures', () => {
  const airborneMission = structuredClone(getOperation('op-coastal-connection'));
  airborneMission.start = { x: -900, y: 1500, z: -7500, speed: 216, airborne: true, heading: 0 };
  const airborne = new FlightSimulation(airborneMission); fly(airborne, 3, { throttle: .8 });
  assert.equal(airborne.passengerState.departed, false);
  const wrong = make(), r = wrong.mission.runways[1];
  Object.assign(wrong.player, { x: r.x, z: r.z - 1400, y: r.y + 3, brake: false, flaps: true });
  fly(wrong, 6, { throttle: 1, pitch: .3 });
  assert.equal(wrong.player.onGround, false); assert.equal(wrong.passengerState.departed, false);
  // A physical roll off a deck can change onGround without an actual lift-off.
  // This isolates that transition; authored passenger airports remain on land.
  const overrun = make(), field = overrun.mission.runways[0]; field.carrier = true;
  Object.assign(overrun.player, { x: field.x, z: field.z + field.length / 2 - 1, y: field.y + 3, speed: 100, throttle: 0, brake: false });
  overrun.step(.05, { throttle: 0, pitch: -1 });
  assert.equal(overrun.player.onGround, false); assert.ok(overrun.player.verticalSpeed < 0);
  assert.equal(overrun.passengerState.departed, false);
});

test('optional en-route fix cannot trap an arrival and disembarkation requires an uninterrupted stop', () => {
  const sim = make(); depart(sim); assert.equal(sim.passengerState.fixPassed, false);
  touchdown(sim, sim.mission.goal.destinationRunway); fly(sim, 3);
  assert.equal(sim.status, 'flying'); assert.equal(sim.passengerState.fixPassed, true);
  assert.ok(sim.operationState.unloadTime > 0 && sim.operationState.unloadTime < 4);
  sim.step(.05, { throttle: .3 }); assert.equal(sim.operationState.unloadTime, 0);
  assert.equal(sim.passengerState.aboard, 198); fly(sim, 4.2);
  assert.equal(sim.status, 'success'); assert.equal(sim.passengerState.delivered, 198); assert.equal(sim.passengerState.aboard, 0);
  const snapshot = sim.getSnapshot(), copy = make(); assert.equal(copy.applySnapshot(snapshot), true);
  assert.deepEqual(copy.passengerState, sim.passengerState);
});

test('passenger engine startup uses the jet checklist without changing the four-step sequence', () => {
  const sim = make(); sim.player.engine = false; sim.player.startupStep = 0; sim._updateObjective(0);
  const text = [sim.hint];
  for (let step = 0; step < 4; step++) { assert.equal(sim.action('startup'), true); text.push(sim.events.at(-1).text, sim.hint); }
  assert.equal(sim.player.engine, true); assert.equal(sim.player.startupStep, 4);
  assert.match(text.join(' '), /Fuel pumps|fuel pumps/); assert.doesNotMatch(text.join(' '), /propeller|magneto|prime/i);
});

function climbFlight(aircraft = 'b767', pitch = .32) {
  const m = structuredClone(getOperation('op-coastal-connection'));
  Object.assign(m, { id: 'airliner-energy', aircraft, kind: 'free', operation: null, goal: {}, start: { x: 0, y: 8000, z: 0, speed: AIRCRAFT[aircraft].cruise, heading: 0, airborne: true } });
  const sim = new FlightSimulation(m, { autoLevel: false });
  Object.assign(sim.player, { pitch, orientation: orientationFromEuler(0, pitch, 0) });
  return sim;
}

test('sustained airliner climb trades airspeed for height and a level power recovery restores speed', () => {
  const airliner = climbFlight(), fighter = climbFlight('f16');
  fly(airliner, 120, { throttle: 1 }); fly(fighter, 120, { throttle: 1 });
  assert.equal(airliner.status, 'flying'); assert.ok(airliner.player.speed < 115);
  assert.ok(airliner.player.verticalSpeed > 15 && airliner.player.verticalSpeed < 32);
  assert.ok(fighter.player.verticalSpeed > airliner.player.verticalSpeed * 2.5);
  assert.ok(Math.abs(airliner.player.pitch - .32) < 1e-6, 'energy handling cannot clamp the aircraft attitude');
  fly(airliner, 35, sim => ({ throttle: 1, pitch: clamp(-sim.player.pitch * 4, -.8, .8) }));
  assert.ok(airliner.player.speed > 210); assert.equal(airliner.player.stalled, false);
  const steep = climbFlight('b767', 1.35); fly(steep, 25, { throttle: 1 });
  assert.ok(steep.player.speed < AIRCRAFT.b767.stallSpeed); assert.equal(steep.player.stalled, true);
  assert.ok(basis(steep.player.orientation).forward.y > .95, 'the nose remains under body-axis control while airspeed falls');
});

function passengerPilot(sim, flight) {
  const p = sim.player, m = sim.mission, r = m.runways[m.goal.destinationRunway];
  if (p.onGround) {
    if (sim.passengerState.departed && p.lastLanding?.runwayIndex === m.goal.destinationRunway) {
      p.brake = true; return { throttle: 0, pitch: 0, roll: 0 };
    }
    p.brake = false; p.flaps = true; return { throttle: 1, pitch: .3, roll: 0 };
  }
  const s = Math.sin(r.heading), c = Math.cos(r.heading), along = (p.x - r.x) * s + (p.z - r.z) * c;
  const approach = { x: r.x - s * (r.length / 2 + 6500), z: r.z - c * (r.length / 2 + 6500) };
  if (Math.hypot(approach.x - p.x, approach.z - p.z) < 600) flight.final = true;
  const point = flight.final ? { x: r.x + s * 3000, z: r.z + c * 3000 } : approach;
  point.y = Math.min(m.passengerRoute.cruiseAltitude, r.y + 1 + Math.max(0, -r.length / 2 - along) * .075);
  let heading = Math.atan2(point.x - p.x, point.z - p.z);
  const wind = m.weather.wind;
  heading -= Math.asin(clamp((wind.x * Math.cos(heading) - wind.z * Math.sin(heading)) / Math.max(45, p.speed), -.4, .4));
  const bank = clamp(angle(heading - p.heading) * 1.5, -.35, .35);
  const climb = clamp((point.y - p.y) * .09, -12, 18), pitch = Math.asin(clamp((climb - p.settlingSpeed) / Math.max(45, p.speed), -.5, .5));
  const arriving = Math.hypot(p.x - r.x, p.z - r.z) < m.passengerRoute.arrivalDistance;
  p.gear = arriving; p.flaps = arriving;
  return { throttle: arriving ? .35 : 1, roll: clamp((p.roll - bank) * 2.5, -.65, .65), pitch: clamp((pitch - p.pitch) * 4, -.65, .65) };
}

test('all three airport routes can be flown from brake release through landing using ordinary flight controls', () => {
  for (const m of routes) {
    const sim = make(m.id), flight = { final: false };
    for (let t = 0; t < 650 && sim.status === 'flying'; t += 1 / 60) sim.step(1 / 60, passengerPilot(sim, flight));
    assert.equal(sim.status, 'success', `${m.id}: ${sim.player.crashCause || sim.objective}`);
    assert.equal(sim.passengerState.delivered, m.passengers); assert.equal(sim.passengerState.aboard, 0);
    assert.equal(sim.player.landings, 1); assert.equal(sim.player.lastLanding.runwayIndex, m.goal.destinationRunway);
    assert.ok(sim.time > 180 && sim.time < 430, `${m.id}: compressed route should last a few minutes`);
    assert.ok(sim.player.brake && sim.player.speed < 3); assert.ok(sim.passengerState.departureAt > 0);
  }
});
