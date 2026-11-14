import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3 } from '../public/vendor/three.module.js';
import { AIRCRAFT } from '../public/campaign.mjs';
import { makeAircraft } from '../public/models.mjs';
import { modeledAirframeBounds } from '../public/airframes.mjs';
import { createArenaMission, spawnForPlayer, carrierCompatibility } from '../public/arena.mjs';
import { FlightSimulation } from '../public/sim.mjs';
import { carrierObstacleTime, carrierIslandParts, carrierLaunchLane } from '../public/terrain.mjs';
import { orientationFromEuler } from '../public/orientation.mjs';

const flight = aircraft => {
  const mission = createArenaMission({ mapId: 'islands' }, aircraft);
  mission.start = spawnForPlayer(mission, aircraft, 0, 'carrier');
  return new FlightSimulation(mission);
};
const advance = (sim, seconds, input = { throttle: 1 }) => {
  for (let i = 0; i < seconds * 60 && sim.status === 'flying'; i++) sim.step(1 / 60, input);
};

test('airframe collision bounds match the generated aircraft meshes', () => {
  for (const id of Object.keys(AIRCRAFT)) {
    const actual = new Box3().setFromObject(makeAircraft(id)), modeled = modeledAirframeBounds(id);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(actual.min.toArray()[axis] - modeled.min[axis]) < 0.003, `${id} min ${axis}`);
      assert.ok(Math.abs(actual.max.toArray()[axis] - modeled.max[axis]) < 0.003, `${id} max ${axis}`);
    }
  }
});

test('every carrier spawn is clear of superstructure, including stationary oversized aircraft', () => {
  for (const aircraft of Object.keys(AIRCRAFT)) {
    const sim = flight(aircraft), carrier = sim.mission.runways.find(runway => runway.carrier);
    assert.equal(carrier.width, 40); assert.equal(carrierLaunchLane(carrier), -4.8);
    for (let slot = 0; slot < 4; slot++) {
      const pose = { ...spawnForPlayer(sim.mission, aircraft, slot, 'carrier'), orientation: orientationFromEuler(0, 0, 0) };
      assert.equal(carrierObstacleTime(pose, pose, aircraft, sim.mission), null, `${aircraft} slot ${slot}`);
    }
    advance(sim, 2, { throttle: 0 }); assert.equal(sim.status, 'flying'); assert.equal(sim.player.onGround, true);
  }
});

test('carrier-equipped aircraft clear the marked launch lane at normal power', () => {
  for (const aircraft of ['hellcat', 'harrier', 'f14', 'f18']) {
    const sim = flight(aircraft); sim.action('brake'); advance(sim, 14);
    assert.equal(sim.status, 'flying', aircraft); assert.equal(sim.player.onGround, false);
    assert.ok(sim.player.y > 100); assert.ok(carrierCompatibility(aircraft).wingClearance > 4);
  }
});

test('oversized aircraft strike the actual island when driven straight down the marked lane', () => {
  for (const aircraft of ['b17', 'b2', 'ac130']) {
    const sim = flight(aircraft); sim.action('brake'); advance(sim, 12);
    assert.equal(sim.status, 'failed', aircraft); assert.equal(sim.player.health, 0); assert.match(sim.player.crashCause, /carrier island/);
    assert.equal(carrierCompatibility(aircraft).oversized, true); assert.match(carrierCompatibility(aircraft).warning, /modeled wings overlap/);
    assert.ok(sim.time > 1, 'selection and stationary spawning are safe; moving into the visible structure causes the loss');
  }
});

test('the same oversized aircraft can clear the island on a physically clear deck path', () => {
  for (const aircraft of ['b17', 'b2', 'ac130']) {
    const sim = flight(aircraft), carrier = sim.mission.runways.find(runway => runway.carrier);
    const bounds = modeledAirframeBounds(aircraft), halfSpan = (bounds.max[0] - bounds.min[0]) / 2;
    const island = carrierIslandParts(carrier)[0];
    sim.player.x = carrier.x + island.x - island.width / 2 - halfSpan - 2;
    sim.action('brake'); advance(sim, 14);
    assert.equal(sim.status, 'flying', aircraft); assert.equal(sim.player.onGround, false); assert.ok(sim.player.y > 70);
  }
});

test('carrier sweeps catch an island crossed in one step and use the ship heading', () => {
  const mission = createArenaMission({ mapId: 'islands' }, 'b17'), carrier = mission.runways.find(runway => runway.carrier);
  carrier.heading = 0.71;
  const pose = along => {
    const across = carrierLaunchLane(carrier);
    return { x: carrier.x + Math.sin(carrier.heading) * along + Math.cos(carrier.heading) * across,
      z: carrier.z + Math.cos(carrier.heading) * along - Math.sin(carrier.heading) * across,
      y: carrier.y + 3, orientation: orientationFromEuler(carrier.heading, 0, 0) };
  };
  const hit = carrierObstacleTime(pose(-140), pose(100), 'b17', mission);
  assert.ok(hit > 0 && hit < 0.5);
  assert.equal(carrierObstacleTime(pose(-140), pose(100), 'hellcat', mission), null);
});

test('the authority rejects a guest flying a wide wing through the carrier island', () => {
  const mission = createArenaMission({ mapId: 'islands' }, 'hellcat');
  const sim = new FlightSimulation(mission, { playerId: 'host' }).configureMultiplayer({ mode: 'freeflight',
    playerId: 'host', hostId: 'host', players: [{ id: 'host', aircraft: 'hellcat', startMode: 'carrier' }, { id: 'guest', aircraft: 'b17', startMode: 'carrier' }] });
  const record = sim.participants.get('guest');
  sim.setRemotePlayers([{ ...record.pose, z: record.pose.z + 70, speed: 30, brake: false }]);
  assert.equal(record.alive, false); assert.equal(record.deaths, 1); assert.equal(sim.status, 'flying');
});
