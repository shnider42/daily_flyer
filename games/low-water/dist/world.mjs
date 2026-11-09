import * as THREE from './vendor/three.module.js';

// Every static object is baked into a material batch. Decorative detail therefore
// costs geometry, rather than an individual draw call for every pipe and bolt.
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (current, target, dt, speed = 4) => mix(current, target, 1 - Math.exp(-dt * speed));
function seeded(seed = 7) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
function canvas(width, height = width) {
  const image = document.createElement('canvas');
  image.width = width; image.height = height;
  return [image, image.getContext('2d')];
}
function makeTexture(kind) {
  const [image, ctx] = canvas(kind === 'sign' ? 512 : 256);
  const r = seeded(kind.length * 313 + kind.charCodeAt(0));
  const palettes = {
    wall: ['#9baba0', '#344c44'], concrete: ['#80847b', '#252d28'],
    floor: ['#5e6961', '#293a32'], metal: ['#616c65', '#23372f'],
    rust: ['#a27047', '#473e2d'], tile: ['#a2b2a5', '#56675b'],
    grate: ['#5e6b65', '#15251d'], hazard: ['#baa35c', '#252d25'],
  };
  const [base, dark] = palettes[kind] || palettes.concrete;
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 15000; i++) {
    ctx.fillStyle = r() > .48 ? `rgba(255,255,229,${r() * .065})` : `rgba(4,19,12,${r() * .12})`;
    const s = r() < .96 ? 1 : 3;
    ctx.fillRect(r() * 256, r() * 256, s, s);
  }
  if (kind === 'wall' || kind === 'tile') {
    const step = kind === 'tile' ? 64 : 128;
    ctx.strokeStyle = '#28392e'; ctx.lineWidth = 3;
    for (let a = 0; a <= 256; a += step) {
      ctx.beginPath(); ctx.moveTo(0, a); ctx.lineTo(256, a); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, 256); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(235,239,218,.25)'; ctx.lineWidth = 1;
    for (let a = 2; a <= 256; a += step) {
      ctx.beginPath(); ctx.moveTo(0, a); ctx.lineTo(256, a); ctx.stroke();
    }
  }
  if (kind === 'metal' || kind === 'floor') {
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 254, 254);
    for (const x of [9, 247]) for (const y of [9, 247]) {
      ctx.fillStyle = '#283b31'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b7c3ad'; ctx.fillRect(x - 1, y - 2, 1, 1);
    }
    if (kind === 'floor') {
      ctx.strokeStyle = 'rgba(177,188,163,.22)'; ctx.lineWidth = 3;
      for (let y = 16; y < 255; y += 16) for (let x = 8; x < 255; x += 16) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 5); ctx.stroke();
      }
    }
  }
  if (kind === 'grate') {
    ctx.fillStyle = '#0b1a13';
    for (let y = 6; y < 256; y += 16) for (let x = 6; x < 256; x += 16) ctx.fillRect(x, y, 10, 10);
    ctx.fillStyle = 'rgba(211,219,196,.2)';
    for (let y = 4; y < 256; y += 16) ctx.fillRect(0, y, 256, 1);
  }
  if (kind === 'hazard') {
    ctx.fillStyle = '#1e2923';
    for (let x = -256; x < 512; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 288, 256); ctx.lineTo(x + 256, 256); ctx.fill();
    }
  }
  if (kind === 'rust' || kind === 'wall' || kind === 'concrete') {
    for (let i = 0; i < 22; i++) {
      const x = r() * 256, y = r() * 256, h = 10 + r() * 80;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(47,39,22,.27)'); g.addColorStop(1, 'rgba(47,39,22,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, r() * 8 + 1, h);
    }
  }
  const tex = new THREE.CanvasTexture(image);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function mergedGeometry(parts) {
  let length = 0;
  for (const p of parts) length += p.getAttribute('position').count;
  const positions = new Float32Array(length * 3), normals = new Float32Array(length * 3), uvs = new Float32Array(length * 2);
  let cursor = 0;
  for (const p of parts) {
    const n = p.getAttribute('position').count;
    positions.set(p.getAttribute('position').array, cursor * 3);
    normals.set(p.getAttribute('normal').array, cursor * 3);
    uvs.set(p.getAttribute('uv').array, cursor * 2);
    cursor += n; p.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

export class World {
  constructor(scene, level, state = {}) {
    this.scene = scene; this.level = level; this.group = new THREE.Group();
    this.group.name = 'Bellwether ' + (level.name || 'Station');
    this.interactableMeshes = new Map(); this.enemyMeshes = new Map();
    this.batches = new Map(); this.dynamic = []; this.doors = []; this.controls = [];
    this.waterSurfaces = []; this.rotors = []; this.signMaterials = [];
    this.disposed = false; this.random = seeded(247 + (level.index || 0) * 803);
    this.textures = ['wall', 'concrete', 'floor', 'metal', 'rust', 'tile', 'grate', 'hazard'].map(makeTexture);
    const tex = Object.fromEntries(['wall', 'concrete', 'floor', 'metal', 'rust', 'tile', 'grate', 'hazard'].map((k, i) => [k, this.textures[i]]));
    const standard = (color, map, more = {}) => new THREE.MeshStandardMaterial({ color, map, roughness: .85, metalness: .12, ...more });
    this.mat = {
      wall: standard(0xb2b4a0, tex.wall, { roughness: .96, metalness: 0 }),
      concrete: standard(0x7c8d80, tex.concrete, { roughness: .98, metalness: 0 }),
      floor: standard(0x6d7e71, tex.floor, { roughness: .62, metalness: .32 }),
      tile: standard(0x9db8aa, tex.tile, { roughness: .61 }),
      metal: standard(0x6c8a7a, tex.metal, { metalness: .6, roughness: .42 }),
      rust: standard(0x9f6443, tex.rust, { roughness: .9, metalness: .2 }),
      dark: standard(0x1d3029, null, { roughness: .72, metalness: .45 }),
      black: standard(0x0b1713, null, { roughness: .82 }),
      paint: standard(0x23594f, tex.metal, { roughness: .48, metalness: .35 }),
      cream: standard(0xa3ad8f, null, { roughness: .8 }),
      ochre: standard(0xc28d39, null, { roughness: .7 }),
      red: standard(0x8c342a, null),
      grate: standard(0x758175, tex.grate, { roughness: .6, metalness: .45 }),
      hazard: standard(0xc8b26c, tex.hazard, { roughness: .7 }),
      cable: standard(0x18251e, null, { roughness: .9 }),
      warm: new THREE.MeshBasicMaterial({ color: 0xffd59b }),
      cold: new THREE.MeshBasicMaterial({ color: 0x96dfc5 }),
      alarm: new THREE.MeshBasicMaterial({ color: 0xcb593f }),
      screen: new THREE.MeshBasicMaterial({ color: 0x4aa78b }),
      glass: new THREE.MeshStandardMaterial({ color: 0x60988b, roughness: .13, metalness: .16, transparent: true, opacity: .17, depthWrite: false, side: THREE.DoubleSide }),
      frosted: new THREE.MeshStandardMaterial({ color: 0x809e8d, roughness: .72, metalness: .08, transparent: true, opacity: .48, depthWrite: false, side: THREE.DoubleSide }),
      water: new THREE.MeshStandardMaterial({ color: 0x214d43, roughness: .18, metalness: .5, transparent: true, opacity: .84, side: THREE.DoubleSide }),
      ghost: new THREE.MeshStandardMaterial({ color: 0x294838, roughness: .5, metalness: .1 }),
    };
    this.buildShell();
    this.buildRooms();
    for (const prop of level.props || []) this.prop(prop);
    this.buildBridge();
    this.buildGates();
    for (const interaction of level.interactables || []) this.interaction(interaction);
    for (const enemy of level.enemies || []) this.enemy(enemy);
    this.buildWater();
    this.finishBatches();
    scene.add(this.group);
    this.update(0, 0, state, level.spawn || {});
  }

  bake(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.applyMatrix4(transform);
    if (!this.batches.has(material)) this.batches.set(material, []);
    this.batches.get(material).push(g);
  }
  box(x, y, z, w, h, d, material = this.mat.metal, ry = 0, uvScale = false) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (uvScale) {
      const uv = g.getAttribute('uv');
      const scales = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let face = 0; face < 6; face++) for (let v = 0; v < 4; v++) {
        const i = face * 4 + v; uv.setXY(i, uv.getX(i) * scales[face][0] / 2, uv.getY(i) * scales[face][1] / 2);
      }
    }
    this.bake(g, material, x, y, z, 0, ry);
  }
  plane(x, y, z, w, h, material, rx = 0, ry = 0, uvScale = false) {
    const g = new THREE.PlaneGeometry(w, h);
    if (uvScale) {
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * h / 2);
    }
    this.bake(g, material, x, y, z, rx, ry);
  }
  cylinder(x, y, z, radius, length, material = this.mat.metal, axis = 'y', segments = 10, radius2 = radius) {
    this.bake(new THREE.CylinderGeometry(radius2, radius, length, segments), material, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  }
  sphere(x, y, z, radius, material, scale = [1, 1, 1]) {
    const g = new THREE.SphereGeometry(radius, 10, 7); g.scale(...scale); this.bake(g, material, x, y, z);
  }
  pipe(a, b, radius = .12, material = this.mat.rust, flanges = false) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), dir = end.clone().sub(start), length = dir.length();
    if (length < .01) return;
    const g = new THREE.CylinderGeometry(radius, radius, length, 9);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
    this.bake(g, material, ...start.clone().add(end).multiplyScalar(.5).toArray());
    if (flanges) for (const t of [.08, .92]) {
      const p = start.clone().lerp(end, t);
      const fg = new THREE.CylinderGeometry(radius * 1.55, radius * 1.55, .09, 9);
      fg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
      this.bake(fg, this.mat.dark, ...p.toArray());
    }
  }
  rail(x1, z1, x2, z2, y = 0, material = this.mat.ochre) {
    this.pipe([x1, y + 1.05, z1], [x2, y + 1.05, z2], .045, material);
    this.pipe([x1, y + .55, z1], [x2, y + .55, z2], .03, material);
    const count = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 2));
    for (let i = 0; i <= count; i++) this.cylinder(mix(x1, x2, i / count), y + .55, mix(z1, z2, i / count), .045, 1.1, material, 'y', 7);
  }

  finishBatches() {
    for (const [material, geometries] of this.batches) {
      if (!geometries.length) continue;
      const mesh = new THREE.Mesh(mergedGeometry(geometries), material);
      mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'Static station detail';
      this.group.add(mesh);
    }
    this.batches.clear();
  }

  buildShell() {
    const cells = new Map(), size = 2;
    const rooms = this.level.rooms || [];
    for (const room of rooms) {
      const x0 = room.x, z0 = room.z;
      for (let x = x0; x < x0 + room.w - .01; x += size) for (let z = z0; z < z0 + room.d - .01; z += size) {
        const key = `${x},${z}`, before = cells.get(key);
        if (!before || (room.y || 0) >= (before.room.y || 0)) cells.set(key, { x, z, room });
      }
    }
    this.cells = cells;
    const ramps = this.level.ramps || [];
    const onRamp = (x, z) => ramps.some(r => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d);
    for (const cell of cells.values()) {
      const { x, z, room } = cell, floor = room.y || 0, h = room.h || 6;
      const open = room.open || room.kind === 'dock';
      const floorMat = ['office', 'lab'].includes(room.kind) ? this.mat.tile : room.kind === 'gantry' ? this.mat.grate : this.mat.floor;
      if (!onRamp(x + 1, z + 1) && !room.void) this.floorPatch(x, z, size, size, floor, floorMat);
      if (!open && !room.noRoof) this.plane(x + 1, floor + h, z + 1, size, size, this.mat.dark, Math.PI / 2, 0, true);
      const sides = [
        { dx: -2, dz: 0, x: x, z: z + 1, w: .24, d: 2, ry: Math.PI / 2, outerX: -1, outerZ: 0 },
        { dx: 2, dz: 0, x: x + 2, z: z + 1, w: .24, d: 2, ry: -Math.PI / 2, outerX: 1, outerZ: 0 },
        { dx: 0, dz: -2, x: x + 1, z: z, w: 2, d: .24, ry: 0, outerX: 0, outerZ: -1 },
        { dx: 0, dz: 2, x: x + 1, z: z + 2, w: 2, d: .24, ry: Math.PI, outerX: 0, outerZ: 1 },
      ];
      for (const side of sides) {
        const adjacent = cells.get(`${x + side.dx},${z + side.dz}`);
        if (adjacent) {
          const delta = (adjacent.room.y || 0) - floor;
          if (delta > .1 && !onRamp(x + 1 + side.dx / 2, z + 1 + side.dz / 2)) this.box(side.x, floor + delta / 2, side.z, side.w, delta, side.d, this.mat.concrete, 0, true);
          continue;
        }
        const windowed = !room.noWindows && ['arrival', 'office', 'lab', 'dock'].includes(room.kind) && (side.outerX === 1 || side.outerZ === -1) && h >= 4;
        if (open) {
          this.box(side.x, floor - .18, side.z, Math.max(.4, side.w), .36, Math.max(.4, side.d), this.mat.concrete);
          this.rail(side.x - (side.w > side.d ? 1 : 0), side.z - (side.d > side.w ? 1 : 0), side.x + (side.w > side.d ? 1 : 0), side.z + (side.d > side.w ? 1 : 0), floor);
        } else if (windowed) {
          const bottom = 1.05, top = Math.min(h - .65, 3.9);
          this.box(side.x, floor + bottom / 2, side.z, side.w, bottom, side.d, this.mat.concrete, 0, true);
          this.box(side.x, floor + (top + h) / 2, side.z, side.w, h - top, side.d, this.mat.wall, 0, true);
          this.plane(side.x, floor + (bottom + top) / 2, side.z, 1.88, top - bottom, this.mat.glass, 0, side.ry);
          this.box(side.x, floor + bottom, side.z, side.w > side.d ? 2 : .25, .11, side.w > side.d ? .25 : 2, this.mat.paint);
          this.box(side.x, floor + top, side.z, side.w > side.d ? 2 : .25, .11, side.w > side.d ? .25 : 2, this.mat.paint);
          const atX = side.x + (side.w > side.d ? .97 : 0), atZ = side.z + (side.d > side.w ? .97 : 0);
          this.box(atX, floor + (bottom + top) / 2, atZ, .12, top - bottom, .12, this.mat.paint);
        } else {
          this.box(side.x, floor + h / 2, side.z, side.w, h, side.d, ['office', 'lab'].includes(room.kind) ? this.mat.tile : this.mat.wall, 0, true);
          this.box(side.x - side.outerX * .13, floor + .24, side.z - side.outerZ * .13, side.w > side.d ? 2 : .06, .48, side.w > side.d ? .06 : 2, this.mat.paint);
          this.box(side.x - side.outerX * .14, floor + 1.17, side.z - side.outerZ * .14, side.w > side.d ? 2 : .04, .065, side.w > side.d ? .04 : 2, this.mat.ochre);
        }
      }
    }
    for (const ramp of ramps) this.ramp(ramp);
    if (rooms.some(r => ['arrival', 'office', 'dock'].includes(r.kind))) this.exterior();
  }

  floorPatch(x, z, w, d, y, material) {
    const bridge = this.level.bridge;
    const emit = (px, pz, pw, pd) => {
      if (pw > .001 && pd > .001) this.plane(px + pw / 2, y, pz + pd / 2, pw, pd, material, -Math.PI / 2, 0, true);
    };
    if (!bridge?.requires) { emit(x, z, w, d); return; }
    const bx0 = bridge.x - bridge.w / 2, bx1 = bridge.x + bridge.w / 2;
    const bz0 = bridge.z - bridge.d / 2, bz1 = bridge.z + bridge.d / 2;
    const ix0 = Math.max(x, bx0), ix1 = Math.min(x + w, bx1);
    const iz0 = Math.max(z, bz0), iz1 = Math.min(z + d, bz1);
    if (ix1 <= ix0 || iz1 <= iz0) { emit(x, z, w, d); return; }
    // Exact clipping matters because the bridge edge can bisect a floor tile.
    // No slab remains beneath the gap before the real moving deck arrives.
    emit(x, z, ix0 - x, d);
    emit(ix1, z, x + w - ix1, d);
    emit(ix0, z, ix1 - ix0, iz0 - z);
    emit(ix0, iz1, ix1 - ix0, z + d - iz1);
  }

  buildBridge() {
    const b = this.level.bridge;
    if (!b?.requires) return;
    const y = b.y || 0, bottom = y - 2, x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    this.plane(b.x, bottom, b.z, b.w, b.d, this.mat.black, -Math.PI / 2);
    this.box(x0, y - 1, b.z, .13, 2, b.d, this.mat.dark);
    this.box(x1, y - 1, b.z, .13, 2, b.d, this.mat.dark);
    this.box(b.x, y - 1, z0, b.w, 2, .13, this.mat.concrete, 0, true);
    this.box(b.x, y - 1, z1, b.w, 2, .13, this.mat.concrete, 0, true);
    // Lateral tracks continue into a mechanical stow pocket under the east wall.
    for (const zz of [z0 + .17, z1 - .17]) {
      this.box(b.x + b.w * .55, y - .34, zz, b.w * 2.1, .22, .18, this.mat.metal);
      this.box(b.x, y + .015, zz === z0 + .17 ? z0 - .14 : z1 + .14, b.w, .028, .25, this.mat.hazard, 0, true);
    }
    const deck = new THREE.Group(); deck.name = 'Movable research access bridge';
    deck.position.set(b.x, y, b.z);
    this.dynamicBox(deck, 0, -.12, 0, b.w - .04, .24, b.d - .04, this.mat.dark);
    const surface = new THREE.PlaneGeometry(b.w - .04, b.d - .04), uv = surface.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * b.w / 2, uv.getY(i) * b.d / 2);
    const top = new THREE.Mesh(surface, this.mat.grate); top.rotation.x = -Math.PI / 2; top.position.y = .005; deck.add(top);
    for (const xx of [-b.w / 2 + .16, b.w / 2 - .16]) this.dynamicBox(deck, xx, -.16, 0, .18, .38, b.d, this.mat.ochre);
    for (let n = 1; n < 4; n++) this.dynamicBox(deck, -b.w / 2 + b.w * n / 4, -.24, 0, .12, .23, b.d, this.mat.metal);
    const lamps = [];
    for (const xx of [-b.w * .35, b.w * .35]) for (const zz of [-b.d * .43, b.d * .43]) {
      const lamp = this.dynamicBox(deck, xx, .025, zz, .26, .045, .08, new THREE.MeshBasicMaterial({ color: 0xc4944b })); lamps.push(lamp);
    }
    this.group.add(deck);
    this.dynamic.push({ kind: 'bridge-deck', object: deck, home: deck.position.clone(), definition: b, lamps });
  }

  ramp(r) {
    const x = r.x, z = r.z, w = r.w, d = r.d, low = r.fromY || 0, high = r.toY || 0;
    const alongX = r.axis === 'x';
    const coords = alongX
      ? [x, low, z, x + w, high, z, x, low, z + d, x + w, high, z + d]
      : [x, low, z, x + w, low, z, x, high, z + d, x + w, high, z + d];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / 2, 0, 0, d / 2, w / 2, d / 2], 2));
    g.setIndex([0, 2, 1, 2, 3, 1]); g.computeVertexNormals(); this.bake(g, this.mat.grate);
    const run = alongX ? w : d, steps = Math.max(4, Math.round(run / .45));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (alongX) this.box(x + t * w, mix(low, high, t) + .015, z + d / 2, .045, .035, d, this.mat.dark);
      else this.box(x + w / 2, mix(low, high, t) + .015, z + t * d, w, .035, .045, this.mat.dark);
    }
    const ends = alongX ? [[x, z, x + w, z], [x, z + d, x + w, z + d]] : [[x, z, x, z + d], [x + w, z, x + w, z + d]];
    for (const [x1, z1, x2, z2] of ends) {
      this.pipe([x1, low + 1.0, z1], [x2, high + 1.0, z2], .045, this.mat.ochre);
      this.pipe([x1, low + .55, z1], [x2, high + .55, z2], .03, this.mat.ochre);
      for (let i = 0; i <= 3; i++) this.cylinder(mix(x1, x2, i / 3), mix(low, high, i / 3) + .5, mix(z1, z2, i / 3), .04, 1, this.mat.ochre, 'y', 7);
    }
  }

  sign(text, subtext, x, y, z, width = 2.2, height = .64, ry = 0, options = {}) {
    const [image, ctx] = canvas(512, 160);
    ctx.fillStyle = options.warning ? '#bc9a48' : '#16392f'; ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = options.warning ? '#302f20' : '#608675'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, 502, 150);
    ctx.fillStyle = options.warning ? '#23362b' : '#e2e5c9';
    ctx.font = 'bold 32px sans-serif';
    const label = String(text || '').toUpperCase();
    const fontSize = Math.min(32, Math.floor(455 / Math.max(1, ctx.measureText(label).width) * 32));
    ctx.font = `bold ${Math.max(16, fontSize)}px sans-serif`;
    ctx.fillText(label, 24, 67);
    ctx.fillStyle = options.warning ? '#3b4030' : '#8fb3a1';
    ctx.font = '17px monospace'; ctx.fillText(String(subtext || 'BELLWETHER  /  AUTHORIZED PERSONNEL').toUpperCase().slice(0, 48), 24, 113);
    for (const px of [14, 498]) for (const py of [14, 146]) {
      ctx.fillStyle = '#7c8d73'; ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(image); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
    this.textures.push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    this.signMaterials.push(mat);
    this.plane(x, y, z, width, height, mat, options.floor ? -Math.PI / 2 : 0, ry);
    if (!options.floor) {
      this.box(x, y, z - Math.cos(ry) * .025, width + .06, height + .06, .05, this.mat.dark, ry);
    }
  }

  buildRooms() {
    const rooms = this.level.rooms || [];
    const lightRooms = rooms.filter(r => r.kind !== 'corridor' && r.kind !== 'dock').sort((a, b) => b.w * b.d - a.w * a.d).slice(0, 3);
    for (let ri = 0; ri < rooms.length; ri++) {
      const r = rooms[ri], y = r.y || 0, h = r.h || 6, x = r.x, z = r.z, mx = x + r.w / 2, mz = z + r.d / 2;
      const indoors = !r.open && r.kind !== 'dock';
      const teal = ['lab', 'core', 'pump'].includes(r.kind);
      const lamp = teal ? this.mat.cold : this.mat.warm;
      if (indoors) {
        const alongZ = r.d >= r.w;
        const run = alongZ ? r.d : r.w;
        for (let p = 2.5; p < run - 1; p += 5.8) {
          const lx = alongZ ? mx : x + p, lz = alongZ ? z + p : mz;
          this.box(lx, y + h - .23, lz, alongZ ? 2.4 : .5, .23, alongZ ? .5 : 2.4, this.mat.dark);
          this.box(lx, y + h - .36, lz, alongZ ? 2.1 : .25, .045, alongZ ? .25 : 2.1, lamp);
          // A raised conduit and deep structural ribs provide useful parallax.
          this.box(lx, y + h - .05, lz, alongZ ? r.w : .2, .23, alongZ ? .2 : r.d, this.mat.paint);
        }
        const px = x + Math.min(1.1, r.w * .14), pz = z + .8;
        const pipeY = y + h - .7;
        for (let i = 0; i < 2; i++) {
          const radius = i ? .10 : .19;
          if (r.d >= r.w) {
            this.pipe([px + i * .6, pipeY, z + .25], [px + i * .6, pipeY, z + r.d - .25], radius, i ? this.mat.paint : this.mat.rust, true);
            for (let q = 2; q < r.d; q += 5) this.box(px + i * .6, pipeY + .24, z + q, .08, .5, .08, this.mat.dark);
          } else {
            this.pipe([x + .25, pipeY, pz + i * .6], [x + r.w - .25, pipeY, pz + i * .6], radius, i ? this.mat.paint : this.mat.rust, true);
            for (let q = 2; q < r.w; q += 5) this.box(x + q, pipeY + .24, pz + i * .6, .08, .5, .08, this.mat.dark);
          }
        }
        // Perimeter bulkheads are shallow enough not to change player collision.
        for (let a = 1; a < r.w; a += 6) {
          this.box(x + a, y + h / 2, z + .2, .18, h, .16, this.mat.dark);
          this.box(x + a, y + h / 2, z + r.d - .2, .18, h, .16, this.mat.dark);
        }
        const signY = y + Math.min(h - .6, 3.15), signZ = z + 1.1;
        if (r.w >= 5 && r.d >= 5 && r.name) {
          this.sign(r.name, `BELLWETHER / SECTOR ${String((this.level.index || 0) + 1).padStart(2, '0')}  ·  ${String(ri + 1).padStart(2, '0')}`, mx, signY, signZ, Math.min(3.4, r.w - 1), .76);
          this.pipe([mx - 1, signY + .4, signZ], [mx - 1, y + h, signZ], .025, this.mat.dark);
          this.pipe([mx + 1, signY + .4, signZ], [mx + 1, y + h, signZ], .025, this.mat.dark);
        }
      }
      if (lightRooms.includes(r)) {
        const light = new THREE.PointLight(teal ? 0xa5d5bc : 0xffc894, teal ? 13 : 17, Math.max(r.w, r.d) * 1.65, 2);
        light.position.set(mx, y + Math.min(4, h - 1), mz); this.group.add(light);
      }
      if (r.kind === 'arrival') {
        // Repeating window mullions and visible marine structures establish scale.
        this.sign('BELLWETHER', 'TIDAL FIELD STATION  /  SINCE 1978', mx, y + 2.4, z + r.d - .21, Math.min(4.5, r.w - 1), 1.2, Math.PI);
        this.box(x + .28, y + 1.9, z + r.d * .63, .14, 1.4, 1.1, this.mat.dark);
        this.sign('LOW TIDE  03:40', 'ALL ARRIVALS REPORT TO OPERATIONS', x + .37, y + 1.9, z + r.d * .63, 1.05, .7, Math.PI / 2);
        this.box(mx, y + .008, mz, Math.max(2, r.w - 2), .018, .085, this.mat.ochre);
      } else if (r.kind === 'office') {
        this.sign('SHIFT NOTICE', 'DO NOT ANSWER THE LOWER INTERCOM', x + r.w - .16, y + 1.7, mz, 2.0, .65, -Math.PI / 2, { warning: true });
        this.box(x + .25, y + 1.5, mz, .18, 1.7, 2.0, this.mat.dark);
        for (let f = 0; f < 3; f++) this.box(x + .36, y + 1.25 + f * .23, mz, .03, .16, 1.7, f === 1 ? this.mat.ochre : this.mat.cream);
      } else if (r.kind === 'pump') {
        const py = y + h - 1.5;
        this.pipe([x + .65, y + .8, z + .65], [x + .65, py, z + .65], .31, this.mat.paint, true);
        this.sphere(x + .65, py, z + .65, .32, this.mat.paint);
        this.pipe([x + .65, py, z + .65], [x + r.w - .65, py, z + .65], .31, this.mat.paint, true);
        this.sign('PRESSURE GALLERY', 'INTAKE → BYPASS → DRAIN', mx, y + 2.0, z + r.d - .2, 3.2, .7, Math.PI, { warning: true });
        this.box(mx, y + .016, mz, Math.max(2, r.w - 1), .018, .22, this.mat.hazard, 0, true);
      } else if (r.kind === 'workshop') {
        // Pegboard tools and cable reels are attached to the perimeter, not paths.
        this.box(x + .2, y + 1.55, mz, .15, 1.25, 2.4, this.mat.grate, 0, true);
        for (let a = 0; a < 6; a++) {
          const tz = mz - .95 + a * .36;
          this.pipe([x + .31, y + 1.15, tz], [x + .31, y + 1.85, tz], .035, this.mat.metal);
          this.box(x + .31, y + 1.9, tz, .08, .16, .16, this.mat.ochre);
        }
        this.sign('FIELD EQUIPMENT', 'RETURN ALL TOOLS AT END OF SHIFT', mx, y + 2.3, z + r.d - .17, 2.8, .7, Math.PI);
      } else if (r.kind === 'gantry') {
        this.box(mx, y + h - .8, mz, Math.max(1, r.w - 1), .65, .55, this.mat.ochre);
        this.box(x + .45, y + h - .5, mz, .22, .25, r.d, this.mat.dark);
        this.box(x + r.w - .45, y + h - .5, mz, .22, .25, r.d, this.mat.dark);
        this.box(mx, y + h - 1.25, mz, 1.2, .5, 1.1, this.mat.paint);
        const hook = new THREE.Group(); hook.position.set(mx, y + h - 1.5, mz);
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.7, 6), this.mat.cable); cable.position.y = -.85; hook.add(cable);
        const hookMesh = new THREE.Mesh(new THREE.TorusGeometry(.2, .075, 5, 10, Math.PI * 1.5), this.mat.ochre); hookMesh.position.y = -1.8; hook.add(hookMesh);
        this.group.add(hook); this.dynamic.push({ kind: 'gantry', object: hook, home: hook.position.clone(), room: r });
        this.sign('OVERHEAD CRANE', 'KEEP CLEAR OF SUSPENDED LOADS', mx, y + 2.4, z + r.d - .2, 3.3, .75, Math.PI, { warning: true });
      } else if (r.kind === 'lab') {
        this.sign('AQUATIC ACOUSTICS', 'OBSERVATION ONLY / NO DIRECT CONTACT', mx, y + 2.1, z + r.d - .19, 3.4, .72, Math.PI);
        // An observation window into an inaccessible test niche adds depth.
        this.box(x + r.w - .36, y + 1.6, mz, .16, 2.3, Math.max(2, r.d * .5), this.mat.dark);
        this.plane(x + r.w - .46, y + 1.7, mz, Math.max(1.8, r.d * .5 - .25), 1.8, this.mat.glass, 0, -Math.PI / 2);
        this.box(x + r.w - .48, y + 2.67, mz, .035, .04, Math.max(2, r.d * .5), this.mat.cold);
      } else if (r.kind === 'core') {
        this.sign('LISTENING CHAMBER', 'NO PERSONNEL BELOW THE SERVICE RING', mx, y + 2.2, z + r.d - .2, 3.9, .8, Math.PI, { warning: true });
        for (let n = 0; n < 4; n++) {
          const px = x + 1.2 + n * Math.max(.8, (r.w - 2.4) / 3);
          this.pipe([px, y + .8, z + .6], [px, y + h - .8, z + .6], .18, this.mat.paint, true);
          this.box(px, y + h - 1.1, z + .6, .55, .7, .5, this.mat.ochre);
        }
        this.box(mx, y + .01, mz, Math.max(2, r.w - 2), .02, .18, this.mat.hazard, 0, true);
      } else if (r.kind === 'dock') {
        for (let n = 1; n < r.d; n += 4) {
          this.cylinder(x + .5, y - 1.2, z + n, .22, 3.4, this.mat.rust);
          this.cylinder(x + r.w - .5, y - 1.2, z + n, .22, 3.4, this.mat.rust);
        }
        this.sign('EMERGENCY BERTH', 'WAIT FOR THE WATER TO FALL', mx, y + 2.5, z + r.d - .5, 3.1, .75, Math.PI);
      }
    }
  }

  exterior() {
    const rooms = this.level.rooms || [];
    if (!rooms.length) return;
    const minX = Math.min(...rooms.map(r => r.x)), maxX = Math.max(...rooms.map(r => r.x + r.w));
    const minZ = Math.min(...rooms.map(r => r.z)), maxZ = Math.max(...rooms.map(r => r.z + r.d));
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 18, 18), this.mat.water.clone());
    ocean.material.color.setHex(0x294b4c); ocean.material.opacity = 1; ocean.material.roughness = .27;
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(cx, -2.4, cz); ocean.name = 'Atlantic water';
    this.group.add(ocean); this.waterSurfaces.push({ mesh: ocean, base: -2.4, ocean: true });
    for (let i = 0; i < 9; i++) {
      const x = maxX + 12 + (i % 3) * 13, z = minZ - 18 + Math.floor(i / 3) * 30;
      this.cylinder(x, -.8, z, .65, 8 + this.random() * 3, this.mat.concrete, 'y', 7);
      this.box(x, 2.6, z, 1.8, .45, 1.8, this.mat.dark);
    }
    this.box(maxX + 22, 2.4, cz, 2.5, .45, maxZ - minZ + 40, this.mat.dark);
    this.box(maxX + 38, 9, minZ - 10, 7, 22, 6, this.mat.concrete);
    this.box(maxX + 38, 20.5, minZ - 10, 10, 2, 9, this.mat.paint);
    this.cylinder(maxX + 38, 26, minZ - 10, .15, 10, this.mat.rust);
    this.sphere(maxX + 38, 31.1, minZ - 10, .2, this.mat.alarm);
    // Rain-dark sea defences and distant retaining walls frame the view.
    for (let i = 0; i < 8; i++) this.box(maxX + 55 + i * 5, -.2, minZ - 35 + i * 6, 7, 6 + this.random() * 9, 7, this.mat.dark, this.random() * .7);
  }

  prop(p) {
    const x = p.x, z = p.z, y = p.y || 0, w = p.w || 1.4, d = p.d || 1.1, h = p.h || 1.3;
    const type = p.type || 'crate';
    if (type === 'crate' || type === 'cargo' || type === 'box') {
      this.box(x, y + h / 2, z, w, h, d, p.color === 'yellow' ? this.mat.ochre : this.mat.paint, p.rotation || 0, true);
      this.box(x, y + .09, z, w + .08, .16, d + .08, this.mat.dark, p.rotation || 0);
      this.box(x, y + h - .08, z, w + .06, .12, d + .06, this.mat.dark, p.rotation || 0);
      for (const s of [-1, 1]) this.box(x + s * w * .29, y + h / 2, z, .07, h + .04, d + .03, this.mat.metal, p.rotation || 0);
      if (w > 1.2) this.sign('BWS', 'FRAGILE / KEEP DRY', x, y + h * .55, z + d / 2 + .015, Math.min(.8, w * .7), .31);
    } else if (['tank', 'vessel', 'pressure-tank', 'reactor', 'core', 'coil'].includes(type)) {
      const rad = Math.min(w, d) * .44, height = p.h || 2.8;
      this.cylinder(x, y + height / 2, z, rad, height * .83, ['reactor', 'core'].includes(type) ? this.mat.dark : this.mat.paint, 'y', 16);
      this.sphere(x, y + height * .88, z, rad, this.mat.metal, [1, .42, 1]);
      this.sphere(x, y + height * .1, z, rad, this.mat.metal, [1, .36, 1]);
      for (const yy of [.25, .6, .92]) this.cylinder(x, y + height * yy, z, rad + .045, .09, this.mat.dark, 'y', 16);
      for (const [dx, dz] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) this.box(x + dx * rad, y + .18, z + dz * rad, .18, .36, .18, this.mat.dark);
      this.pipe([x, y + height, z], [x, y + height + .48, z], .12, this.mat.rust, true);
      this.pipe([x, y + height + .48, z], [x + rad + .4, y + height + .48, z], .12, this.mat.rust);
      this.box(x, y + height * .55, z + rad + .03, .4, .45, .07, this.mat.cream);
      if (['reactor', 'core', 'coil'].includes(type)) {
        for (let n = 0; n < 5; n++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(rad + .12, .055, 5, 24), this.mat.cold);
          ring.rotation.x = Math.PI / 2; ring.position.set(x, y + .4 + n * (height - .7) / 4, z); this.group.add(ring);
          this.dynamic.push({ kind: 'core-ring', object: ring, offset: n });
        }
      }
    } else if (['pump', 'turbine', 'generator', 'motor'].includes(type)) {
      const wide = p.w || 2.7, deep = p.d || 1.6, high = p.h || 1.8;
      this.box(x, y + .15, z, wide + .15, .3, deep + .15, this.mat.concrete, 0, true);
      this.cylinder(x, y + high * .55, z, Math.min(.7, deep * .43), wide * .8, this.mat.paint, 'x', 14);
      this.cylinder(x - wide * .39, y + high * .55, z, Math.min(.74, deep * .46), .18, this.mat.dark, 'x', 14);
      this.cylinder(x + wide * .39, y + high * .55, z, Math.min(.74, deep * .46), .18, this.mat.dark, 'x', 14);
      for (let i = 0; i < 7; i++) this.cylinder(x - wide * .31 + i * wide * .1, y + high * .55, z, Math.min(.72, deep * .45), .035, this.mat.metal, 'x', 14);
      this.box(x + wide * .2, y + high * .95, z, .55, .4, .6, this.mat.dark);
      this.pipe([x - wide * .45, y + high * .55, z], [x - wide * .45, y + high + .45, z], .17, this.mat.rust, true);
      const fan = new THREE.Group(); fan.position.set(x + wide * .49, y + high * .55, z); fan.rotation.z = Math.PI / 2;
      for (let a = 0; a < 4; a++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(.12, .025, deep * .65), this.mat.metal); blade.rotation.y = a * Math.PI / 4; fan.add(blade);
      }
      this.group.add(fan); this.rotors.push({ object: fan, axis: 'y', speed: type === 'generator' ? 3 : 1.5 });
    } else if (type === 'bench') {
      const width = p.w || 2.6, depth = p.d || .8, top = Math.min(.65, p.h || .55), rot = p.rotation || 0;
      const centre = new THREE.Vector3(x, 0, z), transform = new THREE.Matrix4().makeRotationY(rot);
      const part = (dx, yy, dz, ww, hh, dd, material) => {
        const pos = new THREE.Vector3(dx, yy, dz).applyMatrix4(transform).add(centre);
        this.box(pos.x, y + pos.y, pos.z, ww, hh, dd, material, rot);
      };
      for (let n = 0; n < 4; n++) part(0, top, -depth * .32 + n * depth * .21, width, .08, depth * .17, this.mat.cream);
      for (let n = 0; n < 3; n++) part(0, top + .18 + n * .15, -depth * .43, width, .11, .07, this.mat.paint);
      for (const dx of [-width * .38, width * .38]) {
        part(dx, top * .5, 0, .08, top, depth * .75, this.mat.dark);
        part(dx, top + .25, -depth * .43, .06, .65, .06, this.mat.dark);
      }
    } else if (['desk', 'workbench', 'table', 'console'].includes(type)) {
      const width = p.w || 2.2, depth = p.d || 1, top = Math.min(1.15, p.h || .9);
      this.box(x, y + top, z, width, .12, depth, this.mat.metal, 0, true);
      for (const dx of [-width * .39, width * .39]) for (const dz of [-depth * .34, depth * .34]) this.box(x + dx, y + top / 2, z + dz, .07, top, .07, this.mat.dark);
      if (type === 'desk' || type === 'console') {
        this.box(x - width * .15, y + top + .38, z - depth * .12, .64, .56, .48, this.mat.cream);
        this.box(x - width * .15, y + top + .4, z + depth * .13, .5, .38, .022, this.mat.screen);
        for (let i = 0; i < 4; i++) this.box(x - width * .15, y + top + .29 + i * .07, z + depth * .145, .4 - i * .05, .012, .008, this.mat.cold);
        this.box(x - width * .15, y + top + .09, z + depth * .31, .68, .05, .24, this.mat.dark);
        this.cylinder(x + width * .32, y + top + .14, z + depth * .14, .09, .18, this.mat.cream, 'y', 10);
      } else {
        this.box(x - .3, y + top + .15, z, .55, .2, .36, this.mat.ochre);
        this.pipe([x + .25, y + top + .08, z], [x + .7, y + top + .08, z + .18], .035, this.mat.rust);
      }
      this.plane(x + width * .24, y + top + .065, z - depth * .12, .36, .5, this.mat.cream, -Math.PI / 2, .18);
    } else if (['locker', 'cabinet', 'rack', 'shelves'].includes(type)) {
      const height = p.h || 2.1, width = p.w || 1.1, depth = p.d || .6;
      this.box(x, y + height / 2, z, width, height, depth, this.mat.paint, 0, true);
      const alongZ = depth > width * 1.6, run = alongZ ? depth : width;
      const count = Math.max(1, Math.floor(run / .85)), cell = run / count;
      const towards = this.faceRoom(x, z), side = alongZ ? (Math.sin(towards) >= 0 ? 1 : -1) : (Math.cos(towards) >= 0 ? 1 : -1);
      for (let n = 0; n < count; n++) {
        const a = -run / 2 + cell * (n + .5);
        const fx = alongZ ? x + side * (width / 2 + .025) : x + a, fz = alongZ ? z + a : z + side * (depth / 2 + .025);
        this.box(fx, y + height / 2, fz, alongZ ? .04 : cell * .92, height * .94, alongZ ? cell * .92 : .04, this.mat.metal, 0, true);
        this.box(fx + (alongZ ? side * .03 : cell * .3), y + height * .49, fz + (alongZ ? cell * .3 : side * .03), alongZ ? .035 : .045, .26, alongZ ? .045 : .035, this.mat.dark);
        for (let i = 0; i < 5; i++) this.box(fx + (alongZ ? side * .025 : 0), y + height * .79 + i * .045, fz + (alongZ ? 0 : side * .025), alongZ ? .012 : cell * .65, .017, alongZ ? cell * .65 : .012, this.mat.black);
        this.box(fx + (alongZ ? side * .03 : 0), y + height * .66, fz + (alongZ ? 0 : side * .03), alongZ ? .015 : cell * .3, .15, alongZ ? cell * .3 : .015, this.mat.cream);
      }
    } else if (type === 'pillar' || type === 'column') {
      this.box(x, y + h / 2, z, w, h, d, this.mat.concrete, p.rotation || 0, true);
      this.box(x, y + .35, z, w + .02, .7, d + .02, this.mat.hazard, p.rotation || 0, true);
    } else if (type === 'barrel' || type === 'drum') {
      this.cylinder(x, y + .55, z, Math.min(w, d) * .4, 1.1, this.mat.rust, 'y', 12);
      for (const yy of [.12, .95]) this.cylinder(x, y + yy, z, Math.min(w, d) * .42, .06, this.mat.dark, 'y', 12);
    } else if (type === 'chair') {
      this.box(x, y + .48, z, .6, .11, .6, this.mat.paint);
      this.box(x, y + .86, z - .23, .61, .65, .1, this.mat.paint);
      for (const dx of [-.22, .22]) for (const dz of [-.22, .22]) this.box(x + dx, y + .24, z + dz, .045, .48, .045, this.mat.metal);
    } else if (type === 'pipe') {
      this.pipe([x - w / 2, y + (p.h || 1), z], [x + w / 2, y + (p.h || 1), z], p.radius || .2, this.mat.rust, true);
    } else if (type === 'rail') {
      this.rail(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y);
    } else if (type === 'sign') {
      this.sign(p.text || 'RESTRICTED', p.subtext || '', x, y + 1.8, z, w, .65, p.rotation || 0, { warning: p.warning });
    } else if (type === 'partition') {
      const alongX = w >= d, span = Math.max(w, d), thickness = Math.max(.12, Math.min(w, d)), low = Math.min(1.15, h * .4);
      this.box(x, y + low / 2, z, w, low, d, this.mat.paint, 0, true);
      this.box(x, y + low, z, alongX ? span : thickness + .04, .10, alongX ? thickness + .04 : span, this.mat.dark);
      this.box(x, y + h, z, alongX ? span : thickness + .04, .14, alongX ? thickness + .04 : span, this.mat.metal);
      this.plane(x, y + (low + h) / 2, z, span, h - low, this.mat.frosted, 0, alongX ? 0 : Math.PI / 2);
      const posts = Math.max(1, Math.ceil(span / 2.5));
      for (let i = 0; i <= posts; i++) this.box(x + (alongX ? -span / 2 + span * i / posts : 0), y + h / 2, z + (alongX ? 0 : -span / 2 + span * i / posts), .12, h, .12, this.mat.metal);
    } else if (type === 'window') {
      const alongX = w >= d, span = Math.max(w, d), thickness = Math.max(.08, Math.min(w, d)), cy = y + h / 2;
      const frame = this.mat.paint;
      this.box(x, y, z, alongX ? span + .2 : thickness + .1, .14, alongX ? thickness + .1 : span + .2, frame);
      this.box(x, y + h, z, alongX ? span + .2 : thickness + .1, .14, alongX ? thickness + .1 : span + .2, frame);
      const parts = Math.max(2, Math.round(span / 2));
      for (let i = 0; i <= parts; i++) this.box(x + (alongX ? -span / 2 + span * i / parts : 0), cy, z + (alongX ? 0 : -span / 2 + span * i / parts), .09, h, .09, frame);
      this.plane(x, cy, z, span, h, this.mat.glass, 0, alongX ? 0 : Math.PI / 2);
      this.box(x, y + h + .10, z, alongX ? span * .9 : .06, .045, alongX ? .06 : span * .9, this.mat.cold);
      if (p.label) this.sign(p.label, 'OBSERVATION PORT / DO NOT STRIKE GLASS', x, y + h + .42, z, Math.min(3, span), .42, alongX ? 0 : Math.PI / 2);
      if (p.cracked || this.level.index === 4) {
        const offset = alongX ? [0, 0, .02] : [.02, 0, 0];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          const dx = Math.cos(a) * .7, dy = Math.sin(a) * .7;
          this.pipe([x + offset[0], cy, z + offset[2]], [x + (alongX ? dx : 0) + offset[0], cy + dy, z + (alongX ? 0 : dx) + offset[2]], .008, this.mat.cream);
        }
      }
    } else if (type === 'vent') {
      this.box(x, y + h / 2, z, w, h, d, this.mat.grate, 0, true);
    } else {
      this.box(x, y + h / 2, z, w, h, d, this.mat.metal, p.rotation || 0, true);
      this.box(x, y + h + .025, z, w * .88, .05, d * .88, this.mat.dark, p.rotation || 0);
    }
  }

  dynamicBox(parent, x, y, z, w, h, d, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  dynamicCylinder(parent, x, y, z, radius, length, material, axis = 'y') {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
    mesh.position.set(x, y, z);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    parent.add(mesh); return mesh;
  }
  floorAtObject(x, z) {
    let y = 0;
    for (const room of this.level.rooms || []) if (x >= room.x && x <= room.x + room.w && z >= room.z && z <= room.z + room.d) y = Math.max(y, room.y || 0);
    for (const r of this.level.ramps || []) if (x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) {
      const t = r.axis === 'x' ? (x - r.x) / r.w : (z - r.z) / r.d;
      y = mix(r.fromY, r.toY, clamp(t, 0, 1));
    }
    return y;
  }

  faceRoom(x, z) {
    const room = (this.level.rooms || []).filter(r => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d).sort((a, b) => a.w * a.d - b.w * b.d)[0];
    if (!room) return 0;
    const dx = room.x + room.w / 2 - x, dz = room.z + room.d / 2 - z;
    if (Math.hypot(dx, dz) < 1) return 0;
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : dz > 0 ? 0 : Math.PI;
  }

  buildGates() {
    for (const gate of this.level.gates || []) {
      const floor = gate.y ?? this.floorAtObject(gate.x, gate.z);
      const w = gate.w || 4, d = gate.d || .35, h = gate.h || 3;
      const alongX = w >= d, width = Math.max(w, d), thickness = Math.max(.15, Math.min(w, d));
      const group = new THREE.Group(); group.position.set(gate.x, floor, gate.z); group.rotation.y = alongX ? 0 : Math.PI / 2;
      // The moving slab and its independent header make its physical state legible.
      const panel = new THREE.Group(); panel.position.y = 0; group.add(panel);
      this.dynamicBox(panel, 0, h / 2, 0, width, h, thickness, this.mat.paint);
      this.dynamicBox(panel, 0, h * .82, thickness * .51, width * .75, .14, .02, this.mat.hazard);
      this.dynamicBox(panel, 0, h * .18, thickness * .51, width * .75, .14, .02, this.mat.hazard);
      this.dynamicBox(panel, 0, h / 2, thickness * .52, .05, h * .88, .02, this.mat.dark);
      for (const dx of [-width / 2 - .14, width / 2 + .14]) this.dynamicBox(group, dx, h / 2, 0, .24, h + .3, .42, this.mat.dark);
      this.dynamicBox(group, 0, h + .17, 0, width + .5, .36, .48, this.mat.metal);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xbb5c35 });
      const indicator = this.dynamicBox(group, width * .3, h + .17, .26, .38, .08, .025, lampMat);
      this.group.add(group);
      const open = false;
      this.doors.push({ gate, group, panel, indicator, h, open, progress: 0 });
      this.sign(gate.label || 'ACCESS BULKHEAD', gate.requires === 'waterDrained' ? 'FLOOD INTERLOCK / DO NOT FORCE' : 'AUTOMATIC INTERLOCK', gate.x, floor + h + .65, gate.z + (alongX ? .3 : 0), Math.min(2.7, width), .5, alongX ? 0 : Math.PI / 2, { warning: true });
    }
  }

  interaction(item) {
    const floor = this.floorAtObject(item.x, item.z), y = item.y ?? floor + 1.3;
    const ry = item.rotation ?? this.faceRoom(item.x, item.z);
    const group = new THREE.Group(); group.position.set(item.x, y, item.z); group.rotation.y = ry;
    group.name = item.label || item.id; group.userData.interactionId = item.id;
    const type = item.type || 'console';
    const control = { id: item.id, type, object: group, y, baseRotation: group.rotation.y };
    if (type === 'breaker') {
      this.dynamicBox(group, 0, -.19, 0, 1.04, 1.25, .35, this.mat.paint);
      this.dynamicBox(group, 0, -.14, .19, .9, 1.03, .08, this.mat.metal);
      this.dynamicBox(group, 0, -.25, .25, .20, .53, .06, this.mat.black);
      const lever = new THREE.Group(); lever.position.set(0, -.27, .3);
      this.dynamicCylinder(lever, 0, .11, .12, .035, .32, this.mat.metal, 'z');
      this.dynamicBox(lever, 0, .11, .32, .36, .13, .13, this.mat.ochre);
      group.add(lever); control.lever = lever;
      const indicator = this.dynamicBox(group, .3, .21, .26, .08, .08, .025, new THREE.MeshBasicMaterial({ color: 0xc76643 }));
      control.indicator = indicator;
      this.dynamicBox(group, 0, floor - y + .4, -.12, .23, .8, .23, this.mat.dark);
      this.sign(item.id === 'crane-breaker' ? '01 / CRANE' : '02 / TRANSIT', item.id === 'crane-breaker' ? 'DRAW 2 / HOUSE 1 / SUPPLY 3' : 'DRAW 2  /  TOTAL SUPPLY 3', item.x, y + .73, item.z, 1.35, .4, ry, { warning: true });
    } else if (type === 'valve' || type === 'seal') {
      this.dynamicBox(group, 0, -.2, -.14, .7, .8, .35, this.mat.paint);
      this.dynamicCylinder(group, 0, -.05, .15, .10, .4, this.mat.metal, 'z');
      const wheel = new THREE.Group(); wheel.position.set(0, -.05, .38);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(type === 'seal' ? .48 : .36, .055, 6, 18), type === 'seal' ? this.mat.ochre : this.mat.red);
      wheel.add(ring);
      for (let a = 0; a < 3; a++) {
        const spoke = this.dynamicBox(wheel, 0, 0, 0, .65, .04, .04, this.mat.metal); spoke.rotation.z = a * Math.PI / 3;
      }
      this.dynamicCylinder(wheel, 0, 0, .025, .10, .07, this.mat.metal, 'z');
      group.add(wheel); control.wheel = wheel;
      this.dynamicCylinder(group, 0, -.2, -.18, .15, .9, this.mat.rust, 'x');
      this.dynamicBox(group, 0, floor - y + .35, -.15, .18, .7, .18, this.mat.dark);
      const indicator = this.dynamicBox(group, .27, .2, .07, .08, .08, .02, new THREE.MeshBasicMaterial({ color: 0xdd9562 })); control.indicator = indicator;
      this.sign(item.label || 'MANUAL VALVE', type === 'seal' ? 'EMERGENCY ISOLATION / TURN TO SEAL' : item.id === 'intake-valve' ? 'FLOW FROM SEA / CLOSE BEFORE DRAIN' : 'DRAIN TO SUMP / OPEN AFTER ISOLATION', item.x, y + .72, item.z, 1.7, .4, ry, { warning: type === 'seal' });
    } else if (type === 'pickup' || type === 'tool') {
      this.dynamicBox(group, 0, -.35, 0, 1.02, .12, .72, this.mat.dark);
      this.dynamicBox(group, 0, floor - y + .4, -.1, .7, .8, .5, this.mat.metal);
      const tool = new THREE.Group(); tool.rotation.z = -.25;
      this.dynamicCylinder(tool, 0, 0, 0, .11, .55, this.mat.metal, 'x');
      this.dynamicBox(tool, .05, -.16, .03, .14, .28, .17, this.mat.dark);
      this.dynamicBox(tool, -.27, 0, 0, .17, .22, .20, this.mat.ochre);
      this.dynamicBox(tool, .32, 0, 0, .06, .09, .25, this.mat.cold);
      this.dynamicBox(tool, .32, 0, .16, .19, .04, .04, this.mat.metal);
      this.dynamicBox(tool, .32, 0, -.16, .19, .04, .04, this.mat.metal);
      group.add(tool); control.tool = tool;
      this.sign('ARC DRIVER', 'FIELD SERVICE / CHARGE BEFORE USE', item.x, y + .65, item.z, 1.5, .4, ry);
    } else if (type === 'damper') {
      const unit = new THREE.Group();
      this.dynamicBox(unit, 0, -.17, 0, 1.02, 1.25, .55, this.mat.paint);
      this.dynamicCylinder(unit, 0, .04, .3, .32, .08, this.mat.cream, 'z');
      const dial = new THREE.Group(); dial.position.set(0, .04, .365);
      this.dynamicBox(dial, 0, .10, 0, .035, .22, .018, this.mat.red);
      this.dynamicCylinder(dial, 0, 0, .02, .055, .03, this.mat.metal, 'z'); unit.add(dial); control.dial = dial;
      for (let n = 0; n < 3; n++) {
        const led = this.dynamicBox(unit, -.24 + n * .24, -.48, .3, .10, .055, .025, new THREE.MeshBasicMaterial({ color: n ? 0x263c2c : 0xaacf7e }));
        if (!control.leds) control.leds = []; control.leds.push(led);
      }
      this.dynamicBox(unit, 0, floor - y + .35, -.1, .35, .7, .3, this.mat.dark);
      group.add(unit);
      const letter = item.id.endsWith('a') ? 'A' : item.id.endsWith('b') ? 'B' : 'C';
      this.sign(`DAMPER ${letter}`, 'MATCH THE CALIBRATION PLATE', item.x, y + .7, item.z, 1.65, .4, ry);
    } else if (type === 'note') {
      this.dynamicBox(group, 0, 0, -.025, .42, .56, .04, this.mat.dark);
      this.dynamicBox(group, 0, 0, .001, .36, .48, .009, this.mat.cream);
      for (let i = 0; i < 7; i++) this.dynamicBox(group, -.02, .16 - i * .045, .008, .25 - (i % 3) * .03, .009, .002, this.mat.dark);
      this.dynamicBox(group, 0, .25, .013, .17, .07, .025, this.mat.metal);
      const light = this.dynamicBox(group, .24, -.2, .01, .04, .04, .02, this.mat.cold); control.indicator = light;
    } else if (type === 'exit') {
      this.dynamicBox(group, 0, -.15, -.05, .6, .85, .22, this.mat.dark);
      this.dynamicBox(group, 0, .04, .08, .43, .35, .015, this.mat.cold);
      this.dynamicBox(group, 0, -.3, .09, .24, .10, .03, this.mat.ochre);
      this.sign(item.label || 'PROCEED', 'BELLWETHER TRANSIT / USE TO CONTINUE', item.x, y + .61, item.z, 1.8, .4, ry);
    } else {
      // Crane controls and unusual field consoles share the same visual language.
      this.dynamicBox(group, 0, -.18, 0, 1.12, .9, .52, this.mat.paint);
      this.dynamicBox(group, 0, .08, .29, .88, .3, .035, this.mat.black);
      for (let n = 0; n < 3; n++) {
        const led = this.dynamicBox(group, -.28 + n * .28, .08, .32, .13, .12, .018, new THREE.MeshBasicMaterial({ color: n ? 0x243e2f : 0xc3c384 }));
        if (!control.leds) control.leds = []; control.leds.push(led);
      }
      const handle = new THREE.Group(); handle.position.set(.2, -.3, .33);
      this.dynamicCylinder(handle, 0, .05, .09, .035, .25, this.mat.metal, 'z');
      this.dynamicBox(handle, 0, .05, .24, .20, .12, .12, this.mat.ochre); group.add(handle); control.lever = handle;
      this.dynamicBox(group, 0, floor - y + .4, -.1, .45, .8, .35, this.mat.dark);
      this.sign('GANTRY CONTROL', '0 PARK / 1 TOOL BAY / 2 TRANSIT', item.x, y + .62, item.z, 1.9, .4, ry, { warning: true });
    }
    group.traverse(object => { if (object.isMesh) object.userData.interactionId = item.id; });
    this.group.add(group); this.interactableMeshes.set(item.id, group); this.controls.push(control);
  }

  enemy(enemy) {
    const group = new THREE.Group(); group.position.set(enemy.x, enemy.y ?? this.floorAtObject(enemy.x, enemy.z), enemy.z);
    group.name = enemy.kind === 'watcher' ? 'Remote pressure observer' : 'The returned';
    const body = new THREE.Group(); group.add(body);
    const eyesMaterial = new THREE.MeshBasicMaterial({ color: 0xc2d9b4 });
    const skin = this.mat.ghost;
    if (enemy.kind === 'watcher') {
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 1), this.mat.dark); shell.position.y = 1.4; body.add(shell);
      for (let n = 0; n < 3; n++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.48 + n * .09, .025, 5, 16), this.mat.metal);
        ring.position.y = 1.4; ring.rotation.set(n * .7, n * .3, n * .8); body.add(ring);
      }
      this.dynamicBox(body, 0, 1.4, .41, .18, .035, .03, eyesMaterial);
      for (const s of [-1, 1]) this.dynamicCylinder(body, s * .22, .7, 0, .02, .7, this.mat.cable);
    } else {
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(.20, .27, .77, 7), this.mat.dark); torso.position.y = 1.02; body.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.19, 9, 6), skin); head.scale.set(.8, 1.2, .9); head.position.y = 1.61; body.add(head);
      for (const s of [-1, 1]) {
        const leg = this.dynamicCylinder(body, s * .12, .35, 0, .085, .7, this.mat.dark); leg.rotation.z = s * .04;
        const arm = this.dynamicCylinder(body, s * .28, .89, .02, .065, .85, skin); arm.rotation.z = s * -.12;
        const hand = new THREE.Mesh(new THREE.SphereGeometry(.085, 6, 5), skin); hand.scale.y = 1.5; hand.position.set(s * .32, .43, .06); body.add(hand);
        this.dynamicBox(body, s * .06, 1.65, .16, .04, .027, .025, eyesMaterial);
      }
      this.dynamicBox(body, 0, 1.08, .20, .16, .25, .03, this.mat.cream);
    }
    group.userData.body = body; group.userData.eyes = eyesMaterial; group.userData.phase = this.random() * TAU;
    this.group.add(group); this.enemyMeshes.set(enemy.id, group);
  }

  buildWater() {
    const w = this.level.water;
    if (!w) return;
    const material = this.mat.water.clone(); material.opacity = .9;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.d, 12, 12), material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(w.x, w.high ?? .7, w.z); mesh.name = 'Flooded intake surface';
    this.group.add(mesh); this.waterSurfaces.push({ mesh, base: w.high ?? .7, definition: w, ocean: false });
    // Debris below the drained water marks how long the room has been submerged.
    for (let i = 0; i < 9; i++) {
      const x = w.x + (this.random() - .5) * w.w * .8, z = w.z + (this.random() - .5) * w.d * .8;
      this.box(x, -.025, z, .12 + this.random() * .22, .04, .1 + this.random() * .3, this.mat.dark, this.random() * TAU);
    }
    this.sign('HIGH WATER MARK', 'CLOSE INTAKE BEFORE OPENING BYPASS', w.x, 1.85, w.z - w.d / 2 + .2, Math.min(3.2, w.w - .4), .6, 0, { warning: true });
  }

  update(dt = 0, time = 0, state = {}, player = {}) {
    if (this.disposed) return;
    const timestep = Math.min(.1, Math.max(0, dt));
    for (const door of this.doors) {
      const open = !!state[door.gate.requires];
      // The small initial lift remains visible; collision is owned by level data.
      door.progress = dt === 0 ? (open ? 1 : 0) : ease(door.progress, open ? 1 : 0, timestep, 3.5);
      door.panel.position.y = door.progress * (door.h + .15);
      door.indicator.material.color.setHex(open ? 0x8ed4ac : 0xc37045);
    }
    for (const water of this.waterSurfaces) {
      const definition = water.definition;
      const target = water.ocean ? water.base : state[definition.flag || 'waterDrained'] ? definition.low ?? -.4 : definition.high ?? .7;
      water.base = dt === 0 ? target : ease(water.base, target, timestep, .75);
      water.mesh.position.y = water.base + Math.sin(time * (water.ocean ? .45 : .7)) * (water.ocean ? .04 : .008);
      water.mesh.material.color.setHex(water.ocean ? 0x294b4c : state.coreStable ? 0x356357 : 0x234f43);
    }
    for (const control of this.controls) {
      if (control.type === 'breaker') {
        const on = control.id === 'crane-breaker' ? !!state.breakers?.crane : !!state.breakers?.exit;
        control.lever.rotation.x = ease(control.lever.rotation.x, on ? -.55 : .55, timestep, 10);
        control.indicator.material.color.setHex(on ? 0xa4d28d : 0xa95f3b);
      } else if (control.type === 'valve' || control.type === 'seal') {
        const turned = control.type === 'seal' ? state.evacReady : control.id === 'intake-valve' ? state.intakeClosed : state.bypassOpen;
        control.wheel.rotation.z = ease(control.wheel.rotation.z, turned ? Math.PI * 1.65 : 0, timestep, 2.5);
        if (control.indicator) control.indicator.material.color.setHex(turned ? 0xa7d9a1 : 0xc78c4a);
      } else if (control.type === 'pickup' || control.type === 'tool') {
        control.tool.visible = !state.tool;
        control.tool.position.y = .04 + Math.sin(time * 1.5) * .025;
      } else if (control.type === 'damper') {
        const index = control.id.endsWith('a') ? 0 : control.id.endsWith('b') ? 1 : 2;
        const value = state.dampers?.[index] || 1;
        control.dial.rotation.z = ease(control.dial.rotation.z, .9 - (value - 1) * .9, timestep, 9);
        for (let n = 0; n < 3; n++) control.leds[n].material.color.setHex(n < value ? 0xb8d598 : 0x263d2d);
      } else if (control.type === 'gantry' || control.type === 'console') {
        const value = state.gantryPosition || 0;
        if (control.lever) control.lever.rotation.z = ease(control.lever.rotation.z, -.5 + value * .5, timestep, 8);
        if (control.leds) for (let n = 0; n < 3; n++) control.leds[n].material.color.setHex(n === value ? 0xc2d5a0 : 0x243d2c);
      }
    }
    const powered = this.level.index > 0 || state.powerRouted;
    for (const rotor of this.rotors) rotor.object.rotation[rotor.axis] += timestep * rotor.speed * (powered ? 1 : .06);
    for (const item of this.dynamic) {
      if (item.kind === 'bridge-deck') {
        const aligned = !!state[item.definition.requires];
        const offset = aligned ? 0 : item.definition.w + .6;
        const target = item.home.x + offset;
        item.object.position.x = dt === 0 ? target : ease(item.object.position.x, target, timestep, 9);
        for (const lamp of item.lamps) lamp.material.color.setHex(aligned ? 0xa6dab1 : 0xc4944b);
      } else if (item.kind === 'gantry') {
        const value = state.gantryPosition || 0;
        const offset = (value - 1) * Math.min(3, item.room.w * .22);
        item.object.position.x = ease(item.object.position.x, item.home.x + offset, timestep, .6);
        item.object.rotation.z = Math.sin(time * .65) * .018;
      } else if (item.kind === 'core-ring') {
        item.object.rotation.z = Math.sin(time * .4 + item.offset) * (state.coreStable ? .015 : .07);
        item.object.scale.setScalar(1 + Math.sin(time * 1.1 + item.offset) * (state.coreStable ? .003 : .015));
      }
    }
    for (const enemy of state.enemies || []) {
      const mesh = this.enemyMeshes.get(enemy.id); if (!mesh) continue;
      mesh.visible = enemy.alive !== false;
      mesh.position.set(enemy.x, enemy.y ?? this.floorAtObject(enemy.x, enemy.z), enemy.z);
      if (enemy.yaw !== undefined) mesh.rotation.y = enemy.yaw;
      else if (player.x !== undefined) mesh.rotation.y = Math.atan2(player.x - enemy.x, player.z - enemy.z);
      const phase = mesh.userData.phase;
      const stunned = (enemy.stunned || 0) > 0;
      mesh.userData.body.position.y = Math.sin(time * (enemy.kind === 'watcher' ? 1.7 : 3) + phase) * (stunned ? .008 : .04);
      mesh.userData.body.rotation.z = Math.sin(time * 1.3 + phase) * .035 + (stunned ? .18 : 0);
      mesh.userData.eyes.color.setHex(stunned ? 0x85ddd0 : enemy.kind === 'watcher' ? 0xe1bb71 : 0xc2d9b4);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.scene.remove(this.group);
    const geometries = new Set(), materials = new Set(), textures = new Set(this.textures);
    this.group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach(m => materials.add(m));
      else if (object.material) materials.add(object.material);
    });
    Object.values(this.mat).forEach(m => materials.add(m));
    this.signMaterials.forEach(m => materials.add(m));
    for (const g of geometries) g.dispose();
    for (const m of materials) { if (m.map) textures.add(m.map); m.dispose(); }
    for (const texture of textures) texture.dispose();
    this.group.clear(); this.interactableMeshes.clear(); this.enemyMeshes.clear();
  }
}
