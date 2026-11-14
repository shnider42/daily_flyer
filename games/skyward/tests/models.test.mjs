import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { buildAircraftSilhouette } from '../public/aircraft-silhouettes.mjs';
import { AIRCRAFT } from '../public/campaign.mjs';
import { makeAircraft, animateAircraft, disposeModelCache } from '../public/models.mjs';
import { makeSkyReflection } from '../public/aircraft-lighting.mjs';

const kinds = ['avro504','camel','spitfire','hellcat','bf109','b17','c47','he111','f4','f15','f16','f22','harrier','a10','b2','mig21',
  'p38','f14','f18','sr71'];

test('every detailed airframe has finite geometry within the rendering budget', () => {
  for (const kind of kinds) {
    const plane = makeAircraft(kind), data = plane.userData, box = new THREE.Box3().setFromObject(plane), size = box.getSize(new THREE.Vector3());
    assert.ok(size.x > 5 && size.x < 55 && size.y > 1 && size.y < 9 && size.z > 4 && size.z < (kind === 'sr71' ? 33 : 28), kind + ' physical extent');
    assert.ok(data.geometryStats.triangles > 3500 && data.geometryStats.triangles < 23000, kind + ' triangle budget');
    assert.ok(data.geometryStats.drawCalls <= 30, kind + ' batched draw budget');
    assert.ok(Number.isFinite(data.groundOffset));
    plane.traverse(mesh => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry, position = geometry.attributes.position;
      for (const attribute of Object.values(geometry.attributes)) for (const value of attribute.array) assert.ok(Number.isFinite(value), kind + ' finite attribute');
      if (geometry.index) {
        assert.equal(geometry.index.count % 3, 0);
        for (const index of geometry.index.array) assert.ok(index < position.count, kind + ' valid index');
      }
      assert.ok(geometry.attributes.normal, kind + ' surface normals');
    });
    const distant = makeAircraft(kind, 'enemy');
    assert.ok(distant.userData.geometryStats.triangles < data.geometryStats.triangles * .82, kind + ' reduced distant detail');
    assert.equal(distant.userData.span, data.span); assert.equal(distant.userData.length, data.length);
  }
});

test('different aircraft retain distinguishing proportions instead of sharing a generic hull', () => {
  const bounds = kind => new THREE.Box3().setFromObject(makeAircraft(kind)).getSize(new THREE.Vector3());
  const trainer = bounds('avro504'), camel = bounds('camel'), hellcat = bounds('hellcat'), spitfire = bounds('spitfire'), b2 = bounds('b2'), eagle = bounds('f15'), falcon = bounds('f16');
  assert.ok(trainer.z > camel.z * 1.45, 'long tandem trainer versus compact single-seat Camel');
  assert.ok(hellcat.x > spitfire.x * 1.13, 'Hellcat has its broad naval-fighter wings');
  assert.ok(b2.x / b2.z > 2.45 && b2.x / b2.z < 2.55, 'B-2 span and chord retain flying-wing proportions');
  assert.ok(eagle.x > falcon.x * 1.2 && eagle.z > falcon.z * 1.15, 'F-15 and F-16 retain different proportions');
  assert.equal(makeAircraft('b17').userData.propellers.length, 4);
  assert.equal(makeAircraft('c47').userData.propellers.length, 2);
  const lightning = makeAircraft('p38');
  assert.deepEqual(lightning.userData.propellers.map(prop => prop.position.x), [-2.73, 2.73]);
  assert.ok(bounds('sr71').z > bounds('f14').z * 1.45);
  assert.ok(bounds('f14').x > bounds('f18').x * 1.5);
});

test('Tomcat wings sweep symmetrically in flight and extend independently for landing', () => {
  const plane = makeAircraft('f14'), parked = makeAircraft('f14');
  const span = model => new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x;
  const extended = span(plane);
  animateAircraft(plane, { gear: false, speed: 340 }, .016);
  assert.ok(span(plane) < extended * .87);
  assert.equal(span(parked), extended);
  assert.ok(Math.abs(plane.userData.sweepWings[0].rotation.y + plane.userData.sweepWings[1].rotation.y) < 1e-8);
  animateAircraft(plane, { gear: true, speed: 340 }, .016);
  assert.equal(span(plane), extended);
});

test('new aircraft retain distinct, inexpensive Canvas silhouettes matching their roster profiles', () => {
  const ids = ['p38','mig21','f14','f18','sr71'];
  const extents = [];
  for (const id of ids) {
    const profile = AIRCRAFT[id], tris = buildAircraftSilhouette(id);
    assert.equal(profile.model, id);
    assert.ok(tris.length > 15 && tris.length < 75, id + ' distant triangle budget');
    const box = new THREE.Box3();
    for (const { p } of tris) for (let i = 0; i < p.length; i += 3) box.expandByPoint(new THREE.Vector3(...p.slice(i, i + 3)));
    const size = box.getSize(new THREE.Vector3()), full = makeAircraft(profile), bounds = new THREE.Box3();
    for (const mesh of full.children) if (mesh.isMesh && mesh.visible) bounds.expandByObject(mesh);
    assert.ok(Math.abs(size.x - full.userData.span) < .2 && Math.abs(size.z - bounds.getSize(new THREE.Vector3()).z) < 1.1, id);
    extents.push(size.x);
  }
  assert.equal(new Set(extents).size, ids.length);
  assert.equal(AIRCRAFT.sr71.gun, null);
  assert.equal(AIRCRAFT.sr71.missiles + AIRCRAFT.sr71.bombs, 0);
  assert.ok(AIRCRAFT.sr71.maxSpeed > AIRCRAFT.f22.maxSpeed);
});

test('cached aircraft share geometry while propeller, engine and gear states remain independent', () => {
  const first = makeAircraft('spitfire'), second = makeAircraft('spitfire');
  const a = first.userData, b = second.userData;
  assert.notEqual(a.propellers[0], b.propellers[0]); assert.notEqual(a.gear, b.gear);
  const firstBatch = first.children.find(node => node.isMesh), secondBatch = second.children.find(node => node.isMesh);
  assert.equal(firstBatch.geometry, secondBatch.geometry, 'clones reuse uploaded static buffers');
  animateAircraft(first, {engine:true,throttle:.7,gear:false}, .1);
  assert.ok(a.propellers[0].rotation.z > 0); assert.ok(Math.abs(b.propellers[0].rotation.z) < 1e-12);
  assert.equal(a.gear.visible, false); assert.equal(b.gear.visible, true);
  const rotation = a.propellers[0].rotation.z;
  animateAircraft(first, {engine:false,gear:true}, .1);
  assert.equal(a.propellers[0].rotation.z, rotation); assert.equal(a.propellers[0].getObjectByName('prop-disc').visible, false);
  assert.equal(a.gear.visible, true);
  const fixed = makeAircraft('avro504'); animateAircraft(fixed, {gear:false}, .1); assert.equal(fixed.userData.gear.visible, true);
});

test('wheel contact follows each model instead of one universal vertical offset', () => {
  for (const kind of kinds) {
    const model = makeAircraft(kind); assert.ok(model.userData.gear, kind + ' gear');
    model.position.y = 3 - model.userData.groundOffset; model.updateMatrixWorld(true);
    const wheels = new THREE.Box3().setFromObject(model.userData.gear);
    assert.ok(Math.abs(wheels.min.y) < 1e-5, kind + ' rests on runway surface');
  }
});

test('afterburners are absent from non-afterburning aircraft and only appear at high thrust', () => {
  for (const kind of ['a10','harrier','b2','p38']) assert.equal(makeAircraft(kind).userData.exhausts.length, 0, kind);
  for (const kind of ['f4','f15','f16','f22','mig21','f14','f18','sr71']) {
    const model = makeAircraft(kind); assert.ok(model.userData.exhausts.length > 0);
    animateAircraft(model, {engine:true,throttle:.6}, .016); assert.ok(model.userData.exhausts.every(part => !part.visible), kind + ' cruise');
    animateAircraft(model, {engine:true,throttle:1}, .016); assert.ok(model.userData.exhausts.every(part => part.visible), kind + ' high thrust');
    animateAircraft(model, {engine:false,throttle:1}, .016); assert.ok(model.userData.exhausts.every(part => !part.visible), kind + ' engine off');
  }
});

test('sky reflections stay locally generated, bounded and darker at night', () => {
  const settings = {top:'#84aabb',horizon:'#d6d7bc',ground:'#526254',sun:'#ffe9c6',sunDirection:{x:-.75,y:.5,z:-.5}};
  const day = makeSkyReflection(settings), night = makeSkyReflection({...settings,night:true});
  assert.equal(day.image.data.byteLength, 256 * 128 * 4); assert.equal(day.mapping, THREE.EquirectangularReflectionMapping);
  const brightness = texture => texture.image.data.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : value), 0);
  assert.ok(brightness(night) < brightness(day) * .8);
  assert.equal(day.colorSpace, THREE.SRGBColorSpace);
  day.dispose(); night.dispose();
});

test.after(() => disposeModelCache());
