import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { batchAircraft, aircraftGeometryStats } from '../public/model-batching.mjs';

const box = (material, x = 0) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); mesh.position.x = x; return mesh; };
function bounds(root) { root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root); return [...b.min.toArray(), ...b.max.toArray()]; }
function close(a, b, tolerance = 1e-5) { a.forEach((n, i) => assert.ok(Math.abs(n - b[i]) < tolerance, `${n} != ${b[i]}`)); }

test('batching preserves world geometry and independently moving assemblies', () => {
  const root = new THREE.Group(), paint = new THREE.MeshStandardMaterial();
  root.position.set(12, 8, -3); root.rotation.y = .7;
  const wing = new THREE.Group(); wing.rotation.z = .2; wing.add(box(paint, 1), box(paint, -1)); root.add(wing);
  const prop = new THREE.Group(); prop.name = 'prop-0'; prop.position.set(2, 1, 4); prop.rotation.y = .1; prop.userData.animated = true;
  prop.add(box(paint, -.7), box(paint, .7)); root.add(prop);
  const disc = box(paint); disc.name = 'prop-disc'; disc.userData.animated = true; prop.add(disc);
  const before = bounds(root), originalTriangles = aircraftGeometryStats(root).triangles;
  batchAircraft(root);
  close(bounds(root), before);
  assert.equal(aircraftGeometryStats(root).triangles, originalTriangles);
  assert.equal(aircraftGeometryStats(root).drawCalls, 3, 'body, prop blades and independent blur disc');
  assert.equal(root.getObjectByName('prop-0'), prop);
  assert.equal(prop.getObjectByName('prop-disc'), disc);
  assert.equal(prop.children.length, 2);
  const staticBatch = root.children.find(node => node.isMesh), bodyBounds = bounds(staticBatch);
  prop.rotation.z += Math.PI / 2; disc.visible = false; root.updateMatrixWorld(true);
  close(bounds(staticBatch), bodyBounds);
  assert.equal(disc.visible, false);
});

test('mirrored parts keep front-facing winding after transforms are baked', () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  const mirrored = box(material); mirrored.scale.x = -1; root.add(mirrored); batchAircraft(root);
  const geometry = root.children.find(node => node.isMesh).geometry.toNonIndexed(), positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2); n.fromBufferAttribute(normals, i);
    assert.ok(b.sub(a).cross(c.sub(a)).dot(n) > 0, 'geometric and shaded normal agree');
  }
});
