import * as THREE from './vendor/three.module.js';

// Reuse identical transformed vertices. Besides reducing GPU uploads, this
// avoids transforming the same corner three or six times in Canvas fallback.
function indexedGeometry(arrays, count) {
  const entries = Object.entries(arrays).map(([name, array]) => ({ name, array, bits: new Uint32Array(array.buffer, array.byteOffset, array.length), size: name === 'uv' ? 2 : 3 }));
  const first = new Map(), next = new Int32Array(count); next.fill(-1);
  const unique = new Uint32Array(count), indices = new Uint32Array(count);
  let total = 0;
  for (let i = 0; i < count; i++) {
    let hash = 2166136261;
    for (const { bits, size } of entries) for (let c = 0; c < size; c++) hash = Math.imul(hash ^ bits[i * size + c], 16777619);
    let match = first.get(hash) ?? -1;
    while (match !== -1) {
      const old = unique[match]; let equal = true;
      for (const { bits, size } of entries) {
        for (let c = 0; c < size; c++) if (bits[i * size + c] !== bits[old * size + c]) { equal = false; break; }
        if (!equal) break;
      }
      if (equal) break;
      match = next[match];
    }
    if (match === -1) { match = total++; unique[match] = i; next[match] = first.get(hash) ?? -1; first.set(hash, match); }
    indices[i] = match;
  }
  const geometry = new THREE.BufferGeometry();
  for (const { name, array, size } of entries) {
    const reduced = new Float32Array(total * size);
    for (let i = 0; i < total; i++) for (let c = 0; c < size; c++) reduced[i * size + c] = array[unique[i] * size + c];
    geometry.setAttribute(name, new THREE.BufferAttribute(reduced, size));
  }
  // Airfoil tips and tapered end caps can collapse a triangle to a line.
  // Remove those faces rather than sending zero-area work to either renderer.
  const positions = arrays.position; let retained = 0;
  for (let i = 0; i < count; i += 3) {
    const a = i * 3, b = a + 3, c = a + 6;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-16) continue;
    indices[retained++] = indices[i]; indices[retained++] = indices[i + 1]; indices[retained++] = indices[i + 2];
  }
  const kept = indices.subarray(0, retained);
  geometry.setIndex(new THREE.BufferAttribute(total < 65536 ? new Uint16Array(kept) : kept.slice(), 1));
  return geometry;
}

// Aircraft contain many small modeled fittings. Bake static parts by material,
// but keep each propeller, wheel assembly and exhaust independently animated.
// A batch is expressed in its parent's coordinates, not in world coordinates.
function batchStaticParts(root) {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const buckets = new Map(), removed = [], originals = new Set();
  function collect(node) {
    for (const child of node.children) {
      if (child.userData.animated) continue;
      if (child.isMesh && !Array.isArray(child.material)) {
        const key = [child.material.uuid, child.renderOrder, child.castShadow, child.receiveShadow, child.visible, child.layers.mask].join(':');
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { source: child, geometries: [], vertices: 0, color: false };
          buckets.set(key, bucket);
        }
        const transform = new THREE.Matrix4().multiplyMatrices(inverseRoot, child.matrixWorld);
        const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        geometry.applyMatrix4(transform);
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        // A mirrored wing/marking needs its triangle winding corrected after
        // baking: the renderer no longer sees the original negative scale.
        if (transform.determinant() < 0) {
          for (const attribute of Object.values(geometry.attributes)) {
            for (let i = 0; i < attribute.count; i += 3) {
              for (let c = 0; c < attribute.itemSize; c++) {
                const a = (i + 1) * attribute.itemSize + c, b = (i + 2) * attribute.itemSize + c;
                const value = attribute.array[a]; attribute.array[a] = attribute.array[b]; attribute.array[b] = value;
              }
            }
          }
        }
        bucket.geometries.push(geometry);
        bucket.vertices += geometry.attributes.position.count;
        bucket.color ||= !!geometry.attributes.color;
        removed.push(child); originals.add(child.geometry);
      }
      collect(child);
    }
  }
  collect(root);
  for (const bucket of buckets.values()) {
    const arrays = { position: new Float32Array(bucket.vertices * 3), normal: new Float32Array(bucket.vertices * 3), uv: new Float32Array(bucket.vertices * 2) };
    if (bucket.color) { arrays.color = new Float32Array(bucket.vertices * 3); arrays.color.fill(1); }
    let offset = 0;
    for (const geometry of bucket.geometries) {
      const count = geometry.attributes.position.count;
      for (const [name, array] of Object.entries(arrays)) {
        const attribute = geometry.attributes[name];
        if (!attribute) continue;
        const size = name === 'uv' ? 2 : 3;
        for (let i = 0; i < count; i++) for (let c = 0; c < size; c++) array[(offset + i) * size + c] = attribute.array[i * attribute.itemSize + c];
      }
      offset += count; geometry.dispose();
    }
    const geometry = indexedGeometry(arrays, bucket.vertices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const { source } = bucket, combined = new THREE.Mesh(geometry, source.material);
    combined.name = 'surface-batch';
    combined.castShadow = source.castShadow; combined.receiveShadow = source.receiveShadow;
    combined.renderOrder = source.renderOrder; combined.visible = source.visible; combined.layers.mask = source.layers.mask;
    root.add(combined);
  }
  for (const mesh of removed) mesh.removeFromParent();
  for (const geometry of originals) geometry.dispose();
}

export function batchAircraft(root) {
  const animated = [];
  root.traverse(node => { if (node !== root && node.isGroup && node.userData.animated) animated.push(node); });
  // Descendants first, so a group's own moving descendants remain intact.
  for (const group of animated.reverse()) batchStaticParts(group);
  batchStaticParts(root);
  return root;
}

export function aircraftGeometryStats(root) {
  let triangles = 0, meshes = 0, drawCalls = 0;
  const materials = new Set();
  root.traverse(node => {
    if (!node.isMesh) return;
    meshes++;
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    list.forEach(material => materials.add(material.uuid));
    drawCalls += list.length;
  });
  return { triangles, meshes, drawCalls, materials: materials.size };
}
