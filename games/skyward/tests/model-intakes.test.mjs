import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {makeAircraft, disposeModelCache} from '../public/models.mjs';

after(disposeModelCache);

function firstVisibleSurface(aircraft, mouth, dx = 0, dy = 0) {
  aircraft.userData.gear.visible = false;
  aircraft.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(mouth[0] + dx, mouth[1] + dy, mouth[2] + .05),
    new THREE.Vector3(0, 0, -1),
  );
  return ray.intersectObject(aircraft, true).find(hit => {
    for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
    return true;
  });
}

function assertRecessed(aircraft, mouth, dx = 0, dy = 0, minimum = .6) {
  const hit = firstVisibleSurface(aircraft, mouth, dx, dy);
  const label = `${aircraft.userData.kind} inlet at ${mouth}, offset ${dx}, ${dy}`;
  assert.ok(hit, `${label} needs a visible inner wall, throat or fan`);
  const depth = hit.distance - .05;
  assert.ok(depth > minimum, `${label} was filled by a surface only ${depth.toFixed(3)} m behind its lip`);
  assert.ok(depth < 2.2, `${label} must terminate inside its duct rather than look through the aircraft`);
}

test('fighter and Harrier inlet volumes stay open after model batching', () => {
  // These probes caught two actual defects: capped engine lofts inside the
  // openings, and the F-15/F-22 wing roots crossing through their intake throats.
  const intakes = [
    {kind: 'f4', xs: [-1.2, 1.2], y: .02, z: 3.88, dx: .28, dy: .3},
    {kind: 'f15', xs: [-1.2, 1.2], y: .04, z: 3.78, dx: .35, dy: .35},
    {kind: 'f16', xs: [0], y: -.7, z: 3.12, dx: .3, dy: .22},
    {kind: 'f22', xs: [-1.36, 1.36], y: -.08, z: 3.62, dx: .3, dy: .24},
    {kind: 'harrier', xs: [-.93, .93], y: .22, z: 3.07, dx: .28, dy: .35},
  ];
  for (const {kind, xs, y, z, dx, dy} of intakes) {
    const aircraft = makeAircraft(kind);
    for (const x of xs) for (const [ox, oy] of [[0, 0], [-dx, 0], [dx, 0], [0, -dy], [0, dy]]) {
      assertRecessed(aircraft, [x, y, z], ox, oy);
    }
  }
});

test('A-10 fans sit behind their inlet lips', () => {
  const aircraft = makeAircraft('a10');
  for (const x of [-1.78, 1.78]) for (const dx of [-.3, 0, .3]) {
    assertRecessed(aircraft, [x, 1.39, -1.1], dx, 0, .5);
  }
});

test('B-2 recessed ducts and MiG-21 annular intake remain open', () => {
  const spirit = makeAircraft('b2');
  // Probe beside the B-2's intake dividers, and around the MiG's shock cone.
  for (const x of [-2.78, -2.14, 2.14, 2.78]) assertRecessed(spirit, [x, .88, 3.83]);
  const mig = makeAircraft('mig21');
  for (const x of [-.4, .4]) assertRecessed(mig, [x, .02, 5.79]);
});
