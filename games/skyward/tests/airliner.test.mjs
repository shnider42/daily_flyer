import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { AIRCRAFT } from '../public/campaign.mjs';
import { FlightSimulation } from '../public/sim.mjs';
import { aircraftKind, makeAircraft, animateAircraft } from '../public/models.mjs';
import { modeledAirframeBounds } from '../public/airframes.mjs';
import { cockpitFamily, cockpitLayout } from '../public/cockpit-models.mjs';
import { cockpitView, chaseAirframeFraming } from '../public/camera-pose.mjs';
import { orientationFromEuler, basis } from '../public/orientation.mjs';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function flight(aircraft = 'b767', ground = false) {
  return new FlightSimulation({ id: 'airliner-flight-test', kind: 'free', aircraft, biome: 'countryside',
    weather: { wind: { x: 0, z: 0 } }, enemies: [], targets: [], waypoints: [], goal: {},
    runways: [{ x: 0, y: 24, z: 0, heading: 0, length: 3000, width: 100, airport: true }],
    start: { x: 0, y: ground ? 27 : 9000, z: ground ? -1400 : 0, heading: 0, speed: ground ? 0 : AIRCRAFT[aircraft].cruise, airborne: !ground },
  }, { assist: 'standard', autoLevel: false });
}
function fly(sim, seconds, input) {
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60, input);
  assert.equal(sim.status, 'flying');
  return sim.player;
}

test('passenger jet carries people but cannot fire, launch missiles, drop bombs or use military radar', () => {
  const aircraft = AIRCRAFT.b767, sim = flight();
  assert.equal(aircraft.passenger, true); assert.equal(aircraft.passengerCapacity, 216);
  assert.equal(aircraft.gun, null); assert.equal(aircraft.missiles, 0); assert.equal(aircraft.bombs, 0);
  assert.equal(aircraft.radar, false); assert.notEqual(aircraft.crew, true);
  assert.equal(sim.player.ammo, 0); assert.equal(sim.player.troopers, 0); assert.equal(sim.player.dropsRemaining, 0);
  for (const action of ['fire', 'missile', 'payload', 'countermeasure', 'radar', 'hover']) assert.equal(sim.action(action), false, action);
  assert.equal(sim.projectiles.length, 0);
  assert.equal(sim.action('gear'), true); assert.equal(sim.action('flaps'), true);
  assert.equal(sim.player.gear, true); assert.equal(sim.player.flaps, true);
});

test('airliner control response and acceleration are markedly slower than the existing jets', () => {
  for (const axis of ['pitch', 'roll']) {
    const airliner = flight(), bomber = flight('b2'), fighter = flight('f15');
    const a = fly(airliner, 1, { [axis]: 1, throttle: 1 });
    const b = fly(bomber, 1, { [axis]: 1, throttle: 1 });
    const f = fly(fighter, 1, { [axis]: 1, throttle: 1 });
    assert.ok(Math.abs(a[axis]) > .08, 'a deliberate command still has useful response');
    assert.ok(Math.abs(a[axis]) < Math.abs(b[axis]) * .85, 'slower than the already heavy B-2');
    assert.ok(Math.abs(a[axis]) < Math.abs(f[axis]) * .30, 'distinct from a fighter');
    if (axis === 'pitch') assert.ok(a.y - 9000 < (f.y - 9000) * .25, 'the same pull produces a much gentler initial climb');
  }
  const results = {};
  for (const id of ['b767', 'b2', 'f15']) {
    const sim = flight(id); sim.player.speed = 100;
    results[id] = fly(sim, 3, { throttle: 1 }).speed - 100;
  }
  assert.ok(results.b767 < results.b2 * .75);
  assert.ok(results.b767 < results.f15 * .35);
});

test('the airliner needs a deliberate takeoff roll and can then sustain jet cruise', () => {
  const sim = flight('b767', true), start = sim.player.z;
  sim.action('brake');
  while (sim.player.onGround && sim.time < 30 && sim.status === 'flying') sim.step(1 / 60, { throttle: 1, pitch: .25 });
  assert.equal(sim.status, 'flying'); assert.equal(sim.player.onGround, false);
  assert.ok(sim.time > 4 && sim.time < 15, 'takeoff needs several seconds of acceleration');
  assert.ok(sim.player.z - start > 150 && sim.player.z - start < 1000, 'arcade departure uses a meaningful runway roll');
  const cruise = flight(), throttle = (AIRCRAFT.b767.cruise / AIRCRAFT.b767.maxSpeed) ** (1 / .68);
  fly(cruise, 60, { throttle });
  near(cruise.player.speed, AIRCRAFT.b767.cruise, .1);
  assert.ok(cruise.player.speed > 200, 'heavy handling does not make the airliner a slow propeller plane');
});

test('widebody model is long, broad, unarmed and fits a bounded shared rendering budget', () => {
  const model = makeAircraft(AIRCRAFT.b767), distant = makeAircraft('b767', 'enemy');
  for (const name of ['b767', 'Boeing 767', 'Passenger jet']) assert.equal(aircraftKind(name), 'b767');
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  const transport = new THREE.Box3().setFromObject(makeAircraft('ac130'));
  assert.ok(size.z > transport.getSize(new THREE.Vector3()).z * 1.7);
  assert.ok(size.x > 48 && size.x < 50); assert.ok(size.z > 53 && size.z < 55); assert.ok(size.y > 15 && size.y < 17);
  const data = model.userData;
  assert.equal(data.propellers.length, 0); assert.equal(data.exhausts.length, 0, 'civil turbofans do not have afterburner flames');
  assert.ok(data.geometryStats.triangles < 20000); assert.ok(data.geometryStats.drawCalls <= 22);
  assert.ok(distant.userData.geometryStats.triangles < data.geometryStats.triangles * .75);
  const modeled = modeledAirframeBounds('b767');
  bounds.min.toArray().forEach((value, index) => near(value, modeled.min[index], .003));
  bounds.max.toArray().forEach((value, index) => near(value, modeled.max[index], .003));
  model.traverse(node => {
    if (!node.geometry) return;
    for (const attribute of Object.values(node.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
    const positions = node.geometry.attributes.position;
    for (const index of node.geometry.index?.array || []) assert.ok(index < positions.count);
  });
});

test('widebody wheels contact the runway at the physics origin and retract independently per model', () => {
  const first = makeAircraft('b767'), second = makeAircraft('b767');
  near(first.userData.groundOffset, 0);
  first.position.y = 3; first.updateMatrixWorld(true);
  near(new THREE.Box3().setFromObject(first.userData.gear).min.y, 0);
  assert.notEqual(first.userData.gear, second.userData.gear);
  animateAircraft(first, { engine: true, throttle: 1, gear: false }, .016);
  assert.equal(first.userData.gear.visible, false); assert.equal(second.userData.gear.visible, true);
  animateAircraft(first, { gear: true }, .016); assert.equal(first.userData.gear.visible, true);
});

test('airliner cockpit keeps the central view open and uses civil displays without a combat sight', () => {
  assert.equal(cockpitFamily('b767'), 'airliner');
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 720]]) {
    const layout = cockpitLayout('b767', width, height);
    assert.equal(layout.hud, null); assert.equal(layout.sight, null);
    assert.equal(layout.screens.length, 2);
    assert.ok(Math.min(...layout.panel.map(point => point[1])) >= height * .75);
    for (const screen of layout.screens) {
      assert.ok(screen.x >= 0 && screen.x + screen.w <= width);
      assert.ok(screen.y >= height * .75 && screen.y + screen.h <= height);
    }
  }
});

test('civil cockpit eye sits near the nose and follows the aircraft body axes', () => {
  const pose = { aircraft: 'b767', x: 30, y: 100, z: -80, orientation: orientationFromEuler(.8, .12, -.25) };
  const view = cockpitView(pose), frame = basis(pose.orientation);
  for (const key of ['x', 'y', 'z']) near(view.position[key], pose[key] + frame.forward[key] * 22 + frame.up[key] * 3.1);
  const ground = cockpitView({ aircraft: 'b767', x: 0, y: 27, z: 0, heading: 0 });
  near(ground.position.y, 30.1); near(ground.position.z, 22);
  const existing = cockpitView({ aircraft: 'f16', x: 0, y: 100, z: 0 });
  near(existing.position.y, 100.85); near(existing.position.z, 2);
});

test('portrait and landscape passenger chase framing show the whole plane with open sky around it', () => {
  const model = makeAircraft('b767'); animateAircraft(model, { gear: false }, 0);
  model.updateMatrixWorld(true);
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]]) for (const cinematic of [false, true]) {
    const fov = width < height ? 67 : 59, length = model.userData.length;
    const fit = chaseAirframeFraming({ length, span: model.userData.span, speed: 216, width, height, fov, passenger: true });
    const angle = cinematic ? .68 : 0, ahead = cinematic ? length * .2 : 95;
    const camera = new THREE.PerspectiveCamera(fov, width / height, .35, 95000);
    camera.position.set(-Math.sin(angle) * fit.distance, fit.elevation, -Math.cos(angle) * fit.distance);
    camera.lookAt(0, length * .18, ahead); camera.updateMatrixWorld(true);
    let minX = Infinity, maxX = -Infinity;
    model.traverseVisible(node => {
      if (!node.isMesh) return;
      const positions = node.geometry.attributes.position, projected = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        projected.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).project(camera);
        minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
        assert.ok(Math.abs(projected.x) < .97 && Math.abs(projected.y) < .97, `${width}×${height}: whole aircraft inside viewport`);
      }
    });
    assert.ok((maxX - minX) / 2 < (cinematic ? .76 : .62), 'airliner leaves the sides of the view usable');
    assert.ok(fit.distance > 84, 'passenger aircraft is not clipped by the old fighter camera distance cap');
  }
  for (const length of [9, 20, 30]) for (const speed of [0, 200]) {
    const fit = chaseAirframeFraming({ length, speed });
    near(fit.distance, Math.min(84, Math.max(23, length * 2.35 + speed * .055)));
    near(fit.elevation, Math.min(20, Math.max(5.4, length * .4 + speed * .012)));
  }
});
