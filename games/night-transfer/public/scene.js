import * as THREE from './vendor/three.module.js';
import { scanPhase } from './world.mjs';
import { SoftwareRenderer } from './software-renderer.js';

/* NIGHT TRANSFER / Ashgate Penitentiary.
 * All artwork is procedural geometry and canvas material work. No remote assets.
 * Coordinates: metres, y-up, room centred at x/z=0. Yaw 0 faces -z.
 */
const PI = Math.PI;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ROOM_HEIGHT = 3.35;
const MAX_FOCUS = 5;
const THEMES = {
  holding: { paint: 0x485b58, upper: 0xb6b5a5, light: 0xffd4a1, name: 'HOLDING / 41', sector: 'A', warm: 1 },
  washroom: { paint: 0x637c72, upper: 0xc4c9b9, light: 0xe5ead2, name: 'WASH HOUSE', sector: 'A', warm: .7 },
  records: { paint: 0x5b6256, upper: 0xb7b09a, light: 0xffd195, name: 'RECORDS OFFICE', sector: 'A', warm: 1.25 },
  laundry: { paint: 0x596c67, upper: 0xa9b3a8, light: 0xffdfb6, name: 'LINEN / SERVICE', sector: 'B', warm: .9 },
  watchroom: { paint: 0x394e4c, upper: 0xa7afa0, light: 0xdfdfb6, name: 'WATCH OFFICE', sector: 'B', warm: .75 },
  dispatch: { paint: 0x4a5757, upper: 0xa6afa9, light: 0xf4ca8f, name: 'SECURE DISPATCH', sector: 'B', warm: 1.05 },
  boiler: { paint: 0x555f59, upper: 0xaaa68e, light: 0xffc185, name: 'BOILER HOUSE', sector: 'C', warm: 1.25 },
  sluice: { paint: 0x425c59, upper: 0x9dacaa, light: 0xd5ded0, name: 'SEA DEFENCE / 03', sector: 'C', warm: .6 },
  quay: { paint: 0x3e5455, upper: 0x8b9e97, light: 0xe1debd, name: 'NORTH QUAY', sector: 'C', warm: .65 }
};
const FOOTPRINTS = {
  bed: [1.08, 2.14], bunk: [1.12, 2.18], toilet: [.62, .83], sink: [.78, .55],
  locker: [.91, .68], cabinet: [1.04, .58], shelf: [1.36, .52], desk: [1.8, .92],
  cart: [1.12, .75], generator: [1.65, 1.05], boiler: [1.5, 1.45], crate: [.78, .7],
  cage: [1.3, .72], terminal: [1.55, .82], monitor: [1.55, .82], washer: [1.35, 1.1]
};
function seeded(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function targetHeight(o) {
  if (Number.isFinite(o.y)) return o.y;
  return ({ note: 1.55, camera: 2.45, panel: 1.5, valve: 1.35, bed: .73, bunk: .73, drain: .08, grate: .08, desk: 1.0, cart: .95, gate: 1.4, door: 1.4 })[o.prop] || 1.1;
}
function coords(o) { return { x: Number(o.x ?? o.position?.x ?? 0), z: Number(o.z ?? o.position?.z ?? 0) }; }
function owns(state, item) { return !!item && (state?.inventory || []).includes(item); }
function complete(state, object) {
  return !!(object.flag && state?.flags?.[object.flag]) || (state?.collected || []).includes(object.id);
}
function opened(state, object) {
  if (object.open || (object.flag && state?.flags?.[object.flag])) return true;
  if (object.kind === 'return' || object.kind === 'back' || object.kind === 'navigation') return true;
  if (object.kind === 'door' && !object.flag && !object.requires && !object.key && !object.keys) return true;
  if (object.kind === 'passage' || object.kind === 'travel') return !object.requires || !!state?.flags?.[object.requires];
  return false;
}

export function createScene(canvas) { return new PrisonScene(canvas); }
export class PrisonScene {
  constructor(canvas) {
    this.canvas = canvas;
    const contextOptions = { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' };
    let context = null;
    try { context = canvas.getContext('webgl2', contextOptions); } catch { /* Restricted browsers can disable WebGL entirely. */ }
    this.renderer = context
      ? new THREE.WebGLRenderer({ canvas, context, ...contextOptions })
      : new SoftwareRenderer({ canvas, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(71, 1, .055, 95);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.6, 3.2);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = MAX_FOCUS + 2;
    this.clip = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.planeGeo = new THREE.PlaneGeometry(1, 1);
    this.cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
    this.sphereGeo = new THREE.SphereGeometry(1, 12, 8);
    this.coneGeo = new THREE.ConeGeometry(1, 1, 18, 1, true);
    this.sharedGeometries = new Set([this.boxGeo, this.planeGeo, this.cylinderGeo, this.sphereGeo, this.coneGeo]);
    this.geometryAssets = new Set(); this.materialAssets = new Set(); this.textureAssets = new Set();
    this.actors = new Map(); this.peers = new Map();
    this.blockers = []; this.targetMeshes = []; this.colliders = []; this.scanners = [];
    this.room = null; this.state = {}; this.lastState = null; this.lastPhase = null;
    this.width = 0; this.height = 0; this.brightness = 1;
    this.resize();
  }
  material(options = {}) { const m = new THREE.MeshStandardMaterial({ roughness: .88, metalness: .03, ...options }); this.materialAssets.add(m); return m; }
  basic(options = {}) { const m = new THREE.MeshBasicMaterial(options); this.materialAssets.add(m); return m; }
  geometry(g) { this.geometryAssets.add(g); return g; }
  texture(canvas, repeat = true) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.textureAssets.add(tex); return tex;
  }
  owner(parent) { for (let p = parent; p; p = p.parent) if (p.userData.targetId) return p.userData.targetId; return null; }
  mesh(parent, geometry, material, x, y, z, options = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = options.shadow !== false && !material.transparent;
    mesh.receiveShadow = options.receiveShadow !== false;
    const owner = this.owner(parent); if (owner) mesh.userData.targetId = owner;
    parent.add(mesh);
    if (options.blocker !== false && (!material.transparent || material.opacity > .85)) this.blockers.push(mesh);
    return mesh;
  }
  box(parent, w, h, d, x, y, z, material, options = {}) {
    const mesh = this.mesh(parent, this.boxGeo, material, x, y, z, options); mesh.scale.set(w, h, d); return mesh;
  }
  plane(parent, w, h, x, y, z, material, rx = 0, ry = 0, options = {}) {
    const mesh = this.mesh(parent, this.planeGeo, material, x, y, z, { shadow: false, ...options });
    mesh.scale.set(w, h, 1); mesh.rotation.set(rx, ry, 0); return mesh;
  }
  cylinder(parent, radius, height, x, y, z, material, rx = 0, rz = 0, options = {}) {
    const mesh = this.mesh(parent, this.cylinderGeo, material, x, y, z, options); mesh.scale.set(radius, height, radius); mesh.rotation.set(rx, 0, rz); return mesh;
  }
  sphere(parent, radius, x, y, z, material, scaleY = 1, options = {}) {
    const mesh = this.mesh(parent, this.sphereGeo, material, x, y, z, options); mesh.scale.set(radius, radius * scaleY, radius); return mesh;
  }
  torus(parent, radius, tube, x, y, z, material, rx = 0, ry = 0) {
    const mesh = this.mesh(parent, this.geometry(new THREE.TorusGeometry(radius, tube, 7, 24)), material, x, y, z); mesh.rotation.set(rx, ry, 0); return mesh;
  }
  pipe(parent, a, b, radius, material = this.m.pipe) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const mesh = this.cylinder(parent, radius, delta.length(), ...start.clone().add(end).multiplyScalar(.5).toArray(), material);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize()); return mesh;
  }
  group(parent, x = 0, y = 0, z = 0, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g;
  }
  surface(parent, w, h, d, x, y, z, material, repeat = 2, options = {}) {
    const geo = this.geometry(new THREE.BoxGeometry(w, h, d));
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getY(i)) > .5) uv.setXY(i, p.getX(i) / repeat, p.getZ(i) / repeat);
      else if (Math.abs(n.getX(i)) > .5) uv.setXY(i, p.getZ(i) / repeat, p.getY(i) / repeat);
      else uv.setXY(i, p.getX(i) / repeat, p.getY(i) / repeat);
    }
    return this.mesh(parent, geo, material, x, y, z, options);
  }
  noiseTexture(kind, seed = 1) {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d');
    const base = kind === 'floor' ? '#a6aaa0' : kind === 'tile' ? '#d5d7c6' : kind === 'wood' ? '#a39372' : '#c4c6bb';
    ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4200; i++) {
      const a = seeded(i + seed * 3), x = seeded(i * 7 + seed) * 512, y = seeded(i * 19 + 31) * 512;
      ctx.fillStyle = a > .5 ? `rgba(255,255,245,${.01 + a * .07})` : `rgba(15,28,26,${.015 + a * .1})`;
      ctx.fillRect(x, y, 1 + seeded(i + 73) * 8, 1 + seeded(i + 93) * 4);
    }
    if (kind === 'floor' || kind === 'tile') {
      const cell = kind === 'floor' ? 128 : 64;
      for (let y = 0; y < 512; y += cell) for (let x = 0; x < 512; x += cell) {
        ctx.fillStyle = `rgba(12,25,24,${seeded(x * 5 + y + seed) * .12})`; ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
        ctx.strokeStyle = kind === 'floor' ? 'rgba(40,49,43,.4)' : 'rgba(60,74,61,.44)'; ctx.lineWidth = kind === 'floor' ? 3 : 2; ctx.strokeRect(x, y, cell, cell);
        ctx.strokeStyle = 'rgba(234,239,218,.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
      }
    } else if (kind === 'wood') {
      for (let y = 0; y < 512; y += 3) { ctx.strokeStyle = `rgba(42,33,23,${seeded(y) * .2})`; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(140, y - 3, 230, y + 7, 512, y); ctx.stroke(); }
    } else {
      for (let y = 0; y < 512; y += 128) {
        ctx.strokeStyle = 'rgba(58,71,63,.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
        const offset = y % 256 ? 0 : 128;
        for (let x = offset; x < 512; x += 256) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 128); ctx.stroke(); }
      }
      for (let i = 0; i < 8; i++) {
        const x = seeded(i + seed) * 512, y = seeded(i + 76) * 512, w = 10 + seeded(i + 12) * 65;
        const g = ctx.createLinearGradient(x, y, x, y + 100); g.addColorStop(0, 'rgba(30,50,38,.13)'); g.addColorStop(1, 'rgba(30,50,38,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, 100);
      }
    }
    for (let i = 0; i < 7; i++) { const x = seeded(i + seed * 4) * 512, y = seeded(i + 176) * 512; ctx.strokeStyle = 'rgba(34,47,38,.17)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12, y + 9); ctx.lineTo(x + 8, y + 22); ctx.lineTo(x + 27, y + 39); ctx.stroke(); }
    return this.texture(c);
  }
  prepareMaterials() {
    const t = this.theme, concrete = this.noiseTexture('concrete', this.room.id.length), floor = this.noiseTexture('floor', 17), wood = this.noiseTexture('wood', 8);
    this.m = {
      upper: this.material({ color: t.upper, map: concrete, bumpMap: concrete, bumpScale: .035 }),
      lower: this.material({ color: t.paint, map: concrete, bumpMap: concrete, bumpScale: .025 }),
      floor: this.material({ color: 0x7b847d, map: floor, bumpMap: floor, bumpScale: .027, roughness: this.room.id === 'quay' || this.room.id === 'sluice' ? .52 : .9 }),
      ceiling: this.material({ color: 0x696f65, map: concrete, roughness: 1 }),
      trim: this.material({ color: 0x303e3a, roughness: .8, metalness: .12 }),
      steel: this.material({ color: 0x586866, roughness: .62, metalness: .55 }),
      steelLight: this.material({ color: 0xa9b3a5, roughness: .5, metalness: .65 }),
      dark: this.material({ color: 0x182a2b, roughness: .82, metalness: .25 }),
      iron: this.material({ color: 0x353f3b, roughness: .75, metalness: .55 }),
      pipe: this.material({ color: 0x7e8a79, roughness: .66, metalness: .45 }),
      rust: this.material({ color: 0x815a3b, roughness: .94, metalness: .2 }),
      wood: this.material({ color: 0x9c8968, map: wood, roughness: .95 }),
      paper: this.material({ color: 0xe0d9b9, roughness: 1 }),
      brass: this.material({ color: 0xbea15b, roughness: .42, metalness: .65 }),
      porcelain: this.material({ color: 0xc1cebd, roughness: .32 }),
      fabric: this.material({ color: 0x737966, roughness: 1 }),
      blanket: this.material({ color: 0x545e58, roughness: 1 }),
      orange: this.material({ color: 0xaf7449, roughness: .94 }),
      lamp: this.material({ color: 0xffe4bd, emissive: 0xffd59e, emissiveIntensity: 1.25, roughness: .6 }),
      glass: this.material({ color: 0x63868a, emissive: 0x366374, emissiveIntensity: .3, roughness: .3, metalness: .15 }),
      green: this.material({ color: 0xa1c3a1, emissive: 0x66886f, emissiveIntensity: .5, roughness: .55 }),
      red: this.material({ color: 0xb16b40, emissive: 0x8d4624, emissiveIntensity: .38, roughness: .6 })
    };
    const shadow = document.createElement('canvas'); shadow.width = shadow.height = 128; const ctx = shadow.getContext('2d'); const g = ctx.createRadialGradient(64, 64, 5, 64, 64, 64); g.addColorStop(0, 'rgba(2,8,8,.75)'); g.addColorStop(.55, 'rgba(2,8,8,.45)'); g.addColorStop(1, 'rgba(2,8,8,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    this.m.contact = this.basic({ map: this.texture(shadow, false), transparent: true, opacity: .7, depthWrite: false });
    this.m.invisible = this.basic({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide });
  }
  sign(parent, lines, w, h, x, y, z, options = {}) {
    const c = document.createElement('canvas'); c.width = 768; c.height = Math.max(128, Math.round(768 * h / w));
    const ctx = c.getContext('2d'), { width: cw, height: ch } = c;
    ctx.fillStyle = options.bg || '#c9c6aa'; ctx.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 180; i++) { ctx.fillStyle = `rgba(40,45,30,${seeded(i) * .07})`; ctx.fillRect(seeded(i + 20) * cw, seeded(i + 40) * ch, seeded(i + 30) * 40 + 2, seeded(i + 60) * 8 + 1); }
    if (options.border !== false) { ctx.strokeStyle = options.ink || '#34473f'; ctx.lineWidth = 8; ctx.strokeRect(15, 15, cw - 30, ch - 30); }
    const list = Array.isArray(lines) ? lines : String(lines).split('\n');
    ctx.fillStyle = options.ink || '#30433d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = Math.min(ch / (list.length + .55), cw / Math.max(7, ...list.map(s => String(s).length)) * 1.45);
    ctx.font = `${options.weight || 700} ${size}px ${options.font || "'Arial Narrow',Arial,sans-serif"}`;
    list.forEach((line, i) => ctx.fillText(String(line), cw / 2, ch / 2 + (i - (list.length - 1) / 2) * size * 1.22, cw - 70));
    const tex = this.texture(c, false);
    const mat = this.material({ map: tex, roughness: .95, emissive: 0xb5b5a2, emissiveIntensity: options.emissive ?? .1, side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
    const mesh = this.plane(parent, w, h, x, y, z, mat, options.rx || 0, options.ry || 0, { blocker: options.blocker !== false });
    mesh.userData.canvas = c; mesh.userData.texture = tex; return mesh;
  }
  floorShadow(parent, w, d, x = 0, z = 0) { return this.plane(parent, w * 1.4, d * 1.4, x, .006, z, this.m.contact, -PI / 2, 0, { blocker: false }); }
  collider(x, z, w, d, ry = 0) { this.colliders.push({ x, z, w, d, ry }); }
  clearRoom() {
    this.scene.clear();
    for (const geo of this.geometryAssets) geo.dispose();
    for (const m of this.materialAssets) m.dispose();
    for (const tex of this.textureAssets) tex.dispose();
    this.geometryAssets.clear(); this.materialAssets.clear(); this.textureAssets.clear();
    this.actors.clear(); this.peers.clear(); this.blockers = []; this.targetMeshes = []; this.colliders = []; this.scanners = []; this.rain = null;
    this.lastState = null; this.lastPhase = null;
  }
  loadRoom(room, objects = [], state = {}) {
    this.clearRoom();
    this.room = typeof room === 'string' ? { id: room, width: 8, depth: 10 } : room;
    this.roomWidth = this.room.width || 8; this.roomDepth = this.room.depth || 10;
    this.theme = THEMES[this.room.id] || THEMES.holding; this.objects = objects; this.state = state;
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.peerRoot = new THREE.Group(); this.scene.add(this.peerRoot);
    this.scene.background = new THREE.Color(this.room.id === 'quay' ? 0x243d49 : 0x1b2c2d);
    this.scene.fog = new THREE.FogExp2(this.room.id === 'quay' ? 0x314b55 : 0x34423e, this.room.id === 'quay' ? .018 : .025);
    this.prepareMaterials(); this.buildLighting(); this.buildShell(); this.buildArchitecture();
    for (const object of objects) this.buildObject(object);
    this.scene.updateMatrixWorld(true); this.renderer.shadowMap.needsUpdate = true;
    this.updateState(state); this.resize();
    return this;
  }
  buildLighting() {
    const outdoor = this.room.id === 'quay';
    this.hemi = new THREE.HemisphereLight(outdoor ? 0x9bb9c7 : 0xbed2cb, 0x3b3023, outdoor ? 1.55 : 1.35); this.scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0xa8c4d5, outdoor ? 2.1 : 1.6); moon.position.set(-3, 7, -5); moon.target.position.set(1, .3, 1);
    moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); moon.shadow.camera.left = -7; moon.shadow.camera.right = 7; moon.shadow.camera.top = 8; moon.shadow.camera.bottom = -8; moon.shadow.camera.near = .5; moon.shadow.camera.far = 24; moon.shadow.bias = -.0006; moon.shadow.normalBias = .025;
    this.scene.add(moon, moon.target);
    if (!outdoor) {
      const warm = new THREE.PointLight(this.theme.light, 18 * this.theme.warm, 13, 2); warm.position.set(.8, 2.82, .5); this.scene.add(warm);
      const spill = new THREE.PointLight(0xffd6a0, 6, 7, 2); spill.position.set(0, 1.9, -5.8); this.scene.add(spill);
      const blue = new THREE.PointLight(0x8db6c9, 7, 7, 2); blue.position.set(-2.6, 2.2, -3.8); this.scene.add(blue);
    } else {
      const lamp = new THREE.PointLight(0xf2d3a0, 20, 12, 2); lamp.position.set(2.7, 3.1, 1.3); this.scene.add(lamp);
    }
  }
  wallPiece(x, z, w, d, bottom = 0, height = ROOM_HEIGHT) {
    const paintTop = Math.min(1.25, bottom + height);
    if (bottom < paintTop) this.surface(this.root, w, paintTop - bottom, d, x, (paintTop + bottom) / 2, z, this.m.lower, 2, { shadow: false });
    const upperBottom = Math.max(bottom, 1.25);
    if (upperBottom < bottom + height) this.surface(this.root, w, bottom + height - upperBottom, d, x, (bottom + height + upperBottom) / 2, z, this.m.upper, 2, { shadow: false });
    if (bottom === 0) {
      this.box(this.root, w + .01, .1, d + .02, x, .05, z, this.m.trim, { shadow: false });
      this.box(this.root, w + .01, .032, d + .02, x, 1.26, z, this.m.trim, { shadow: false });
    }
  }
  buildShell() {
    const w = this.roomWidth, d = this.roomDepth, outdoor = this.room.id === 'quay';
    this.surface(this.root, w + .25, .18, d + .25, 0, -.09, 0, this.m.floor, 2.4, { shadow: false });
    if (outdoor) { this.buildQuay(); return; }
    this.wallPiece(-w / 2, 0, .2, d + .2); this.wallPiece(w / 2, 0, .2, d + .2);
    for (const side of [-1, 1]) {
      const z = side * d / 2, doors = this.objects.filter(o => ['door', 'gate', 'shutter'].includes(o.prop) && Math.abs(coords(o).z - z) < .65);
      const holes = doors.length ? doors.map(o => ({ x: coords(o).x, width: o.width || 1.55 })).sort((a, b) => a.x - b.x) : [];
      let start = -w / 2;
      for (const hole of holes) {
        const left = hole.x - hole.width / 2, right = hole.x + hole.width / 2;
        if (left > start) this.wallPiece((start + left) / 2, z, left - start, .2);
        this.wallPiece(hole.x, z, hole.width, .2, 2.6, ROOM_HEIGHT - 2.6);
        this.corridorBackdrop(hole.x, z, side);
        start = right;
      }
      if (start < w / 2) this.wallPiece((start + w / 2) / 2, z, w / 2 - start, .2);
    }
    this.surface(this.root, w, .12, d, 0, ROOM_HEIGHT + .06, 0, this.m.ceiling, 2, { shadow: false });
    for (const z of [-3.15, 0, 3.15]) this.box(this.root, w, .15, .14, 0, ROOM_HEIGHT - .08, z, this.m.trim, { shadow: false });
    this.pipe(this.root, [-w / 2 + .17, 2.85, -d / 2 + .2], [-w / 2 + .17, 2.85, d / 2 - .2], .045, this.m.pipe);
    for (const z of [-4, -1.5, 1, 3.5]) this.box(this.root, .12, .13, .07, -w / 2 + .17, 2.85, z, this.m.iron);
    this.ceilingLamp(.7, .1, this.room.id === 'records');
    this.sign(this.root, [this.theme.name, 'ASHGATE PENITENTIARY'], 1.95, .35, -w / 2 + .12, 2.45, -d / 2 + 1.9, { ry: PI / 2, bg: '#404e46', ink: '#ddd9bc', emissive: .13 });
    this.sign(this.root, ['KEEP THE PASSAGE CLEAR'], 1.85, .2, 0, .012, 2.7, { bg: '#687367', ink: '#b8b79d', rx: -PI / 2, border: false, emissive: .015, blocker: false });
  }
  corridorBackdrop(x, z, side) {
    const g = this.group(this.root, x, 0, z, side > 0 ? PI : 0);
    this.surface(g, 2.5, .15, 4, 0, -.085, -2, this.m.floor, 2.4, { shadow: false });
    this.surface(g, .18, 3.1, 4.1, -1.25, 1.55, -2, this.m.lower, 2, { shadow: false });
    this.surface(g, .18, 3.1, 4.1, 1.25, 1.55, -2, this.m.lower, 2, { shadow: false });
    this.surface(g, 2.6, 3.1, .18, 0, 1.55, -4, this.m.upper, 2, { shadow: false });
    for (let i = 0; i < 7; i++) this.cylinder(g, .022, 2.7, -.96 + i * .32, 1.4, -3.65, this.m.iron);
    this.box(g, 2.35, .1, .07, 0, .75, -3.65, this.m.iron);
    this.box(g, .8, .05, .12, 0, 2.95, -1.8, this.m.lamp, { blocker: false, shadow: false });
  }
  ceilingLamp(x, z, pendant = false) {
    const g = this.group(this.root, x, 0, z);
    if (pendant) {
      this.cylinder(g, .018, .55, 0, 3.06, 0, this.m.iron);
      const shade = this.mesh(g, this.geometry(new THREE.ConeGeometry(.38, .27, 20, 1, true)), this.m.steel, 0, 2.72, 0); shade.rotation.x = PI;
      this.sphere(g, .08, 0, 2.65, 0, this.m.lamp, 1, { blocker: false, shadow: false });
    } else {
      this.box(g, 1.1, .13, .24, 0, 3.16, 0, this.m.steel);
      this.cylinder(g, .043, .93, 0, 3.065, 0, this.m.lamp, 0, PI / 2, { blocker: false, shadow: false });
      for (let i = 0; i < 5; i++) this.box(g, .018, .08, .28, -.43 + i * .215, 3.065, 0, this.m.iron);
    }
  }
  window(x, z, width = 1.8, ry = 0) {
    const g = this.group(this.root, x, 1.95, z, ry), h = 1.0;
    this.box(g, width + .15, h + .16, .075, 0, 0, 0, this.m.trim);
    this.plane(g, width, h, 0, 0, .046, this.m.glass, 0, 0, { blocker: false });
    for (let i = 0; i < 6; i++) this.cylinder(g, .022, h + .05, -width / 2 + .1 + i * (width - .2) / 5, 0, .11, this.m.iron);
    this.box(g, width, .035, .055, 0, 0, .11, this.m.iron);
    this.box(g, width + .27, .09, .26, 0, -h / 2 - .08, .05, this.m.upper);
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const ctx = c.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256); gradient.addColorStop(0, 'rgba(169,201,211,.27)'); gradient.addColorStop(1, 'rgba(169,201,211,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 6; i++) ctx.clearRect(i * 22, 0, 5, 256);
    const mat = this.basic({ map: this.texture(c, false), transparent: true, depthWrite: false, opacity: .48, side: THREE.DoubleSide });
    const beam = this.plane(this.root, width + .7, 4.7, x + .3, .014, z + (ry === 0 ? 2.4 : 0), mat, -PI / 2, 0, { blocker: false });
    if (ry) { beam.position.set(x + Math.sin(ry) * 2.2, .014, z); beam.rotation.z = -ry; }
  }
  buildArchitecture() {
    const id = this.room.id, w = this.roomWidth, d = this.roomDepth;
    if (id === 'quay') return;
    const windowRight = ['records', 'dispatch', 'sluice'].includes(id);
    this.window(windowRight ? 2.55 : -2.55, -d / 2 + .13, id === 'washroom' ? 1.65 : 1.8);
    if (id === 'holding') {
      this.sign(this.root, ['41'], .68, .83, 3.88, 2.22, 2.75, { bg: '#485b58', ink: '#c9c9ad', ry: -PI / 2, border: false, font: 'Georgia,serif', emissive: .05 });
      const toilet = this.group(this.root, 3.42, 0, -3.45, -PI / 2); this.toilet(toilet); this.collider(3.42, -3.45, .63, .82, -PI / 2);
      this.sign(this.root, ['NO PERSONAL EFFECTS'], 1.35, .19, -3.88, 1.84, 2.5, { bg: '#c5c6ad', ink: '#49594c', ry: PI / 2, border: false });
      for (let i = 0; i < 4; i++) this.box(this.root, .006, .18, .008, -3.885, 1.48, 2.15 + i * .035, this.m.dark, { shadow: false });
    }
    if (id === 'washroom') {
      const tile = this.noiseTexture('tile', 28), mat = this.material({ color: 0xc0c7b4, map: tile, roughness: .64, bumpMap: tile, bumpScale: .012 });
      this.surface(this.root, .035, 1.75, 7.5, 3.87, .88, -.25, mat, 1.3, { shadow: false });
      for (const z of [-2.8, -.3, 2.3]) {
        this.pipe(this.root, [3.8, .3, z], [3.8, 2.35, z], .025, this.m.steelLight);
        this.pipe(this.root, [3.8, 2.35, z], [3.3, 2.35, z], .025, this.m.steelLight);
        this.cylinder(this.root, .12, .035, 3.3, 2.31, z, this.m.steelLight);
        this.cylinder(this.root, .055, .05, 3.75, 1.2, z, this.m.steelLight, 0, PI / 2);
      }
      this.grate(this.root, 0, .002, -1, .24, 4.4);
      const puddle = this.material({ color: 0x4c706d, roughness: .22, metalness: .25, transparent: true, opacity: .28, depthWrite: false });
      const water = this.plane(this.root, 2.5, 2.3, 2.6, .012, -.8, puddle, -PI / 2, 0, { blocker: false }); water.rotation.z = -.12;
      this.ceilingLamp(-1.3, -2.8);
    }
    if (id === 'records') {
      this.sign(this.root, ['ASHGATE', 'PROPERTY & MOVEMENT'], 1.8, .55, 3.88, 2.25, 2.2, { ry: -PI / 2, bg: '#5b6256', ink: '#d9d3b4', border: false, font: 'Georgia,serif' });
      for (const z of [1.15, 2.55]) { const g = this.group(this.root, -3.53, 0, z, PI / 2); this.filingCabinet(g); this.collider(-3.53, z, 1.0, .62, PI / 2); }
      const g = this.group(this.root, 2.85, 0, -3.5, 0); this.crate(g); this.collider(2.85, -3.5, .78, .7);
      this.wallClock(this.root, .95, 2.45, -4.85);
    }
    if (id === 'laundry') {
      for (const z of [-3.1, 2.0]) { const g = this.group(this.root, -3.25, 0, z, PI / 2); this.washer(g); this.collider(-3.25, z, 1.25, 1.1, PI / 2); }
      this.pipe(this.root, [-3.85, 2.65, -4.7], [3.85, 2.65, -4.7], .085, this.m.pipe);
      this.pipe(this.root, [3.8, 2.65, -4.7], [3.8, 2.65, 4.4], .085, this.m.pipe);
      this.sign(this.root, ['ALL LINEN / RETURN BY 04:00'], 1.55, .24, 3.88, 2.1, 2.8, { ry: -PI / 2, bg: '#bfc2aa', ink: '#45564b' });
      for (let i = 0; i < 3; i++) this.box(this.root, .42, .06, .64, -3.25, 1.35 + i * .065, 2.0, this.m.fabric);
      this.grate(this.root, 0, .002, 0, .25, 6);
    }
    if (id === 'watchroom') {
      this.wallClock(this.root, -.95, 2.48, -4.85);
      for (let i = 0; i < 3; i++) this.sign(this.root, [`CAM ${String(i + 1).padStart(2, '0')}`, i === 1 ? 'NO MOVEMENT' : 'NIGHT WATCH'], .7, .39, -2.0 + i * .75, 2.7, -4.83, { bg: '#243e35', ink: '#94b495', emissive: .18 });
      this.sign(this.root, ['RESERVE POWER', 'CAMERAS REMAIN ACTIVE'], 1.5, .44, 3.88, 2.4, 2.4, { ry: -PI / 2, bg: '#424c42', ink: '#d8c69e' });
      const chair = this.group(this.root, -2.15, 0, .8, .4); this.chair(chair); this.collider(-2.15, .8, .5, .55, .4);
    }
    if (id === 'dispatch') {
      this.sign(this.root, ['DISPATCH', 'NO UNSUPERVISED MOVEMENT'], 2.2, .5, 3.88, 2.5, 2.5, { ry: -PI / 2, bg: '#a7ae9c', ink: '#3c4d43' });
      for (const z of [1.25, 2.2, 3.15]) { const g = this.group(this.root, -3.32, 0, z, .08); this.crate(g); this.collider(-3.32, z, .8, .72, .08); }
      this.floorStripe(-1.1, 1.7, 2.2, .075); this.floorStripe(-1.1, 1.9, 2.2, .04);
    }
    if (id === 'boiler') {
      for (const z of [-3.0, 2.25]) { const g = this.group(this.root, 3.03, 0, z, -PI / 2); this.boiler(g); this.collider(3.03, z, 1.22, 1.5, -PI / 2); }
      for (let i = 0; i < 3; i++) this.pipe(this.root, [-3.6 + i * .25, 2.75 + i * .12, -4.7], [-3.6 + i * .25, 2.75 + i * .12, 4.6], .07, i === 1 ? this.m.rust : this.m.pipe);
      this.pipe(this.root, [-3.6, 2.75, 2.2], [-3.6, .2, 2.2], .07, this.m.rust);
      this.sign(this.root, ['CAUTION', 'RESIDUAL PRESSURE'], 1.2, .42, -3.88, 2.04, 2.2, { ry: PI / 2, bg: '#b29b59', ink: '#38443b' });
      for (let i = 0; i < 8; i++) this.floorStripe(1.7, -3.7 + i * .75, .22, .4);
    }
    if (id === 'sluice') {
      this.grate(this.root, 0, .006, 0, 1.3, 8.8);
      for (const x of [-1.05, 1.05]) this.pipe(this.root, [x, .07, -4.4], [x, .07, 4.4], .045, this.m.iron);
      this.pipe(this.root, [-3.8, 2.8, -4.6], [3.8, 2.8, -4.6], .12, this.m.pipe);
      this.pipe(this.root, [3.8, 2.8, -4.6], [3.8, .3, -4.6], .12, this.m.pipe);
      this.sign(this.root, ['FLOOD LEVEL', '2.4 m'], .85, .45, 3.88, 2.48, 2.3, { ry: -PI / 2, bg: '#4b5f57', ink: '#c4d0b9', border: false });
      const water = this.material({ color: 0x355d5b, roughness: .14, metalness: .25 }); this.plane(this.root, 1.24, 8.7, 0, -.018, 0, water, -PI / 2, 0, { blocker: false });
    }
  }
  buildQuay() {
    const w = this.roomWidth, d = this.roomDepth;
    const sky = document.createElement('canvas'); sky.width = 64; sky.height = 512; const ctx = sky.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512); grad.addColorStop(0, '#071923'); grad.addColorStop(.48, '#243e4d'); grad.addColorStop(.65, '#6d878b'); grad.addColorStop(1, '#29444d'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 512);
    const dome = this.mesh(this.root, this.geometry(new THREE.SphereGeometry(65, 24, 12)), this.basic({ map: this.texture(sky, false), side: THREE.BackSide, fog: false }), 0, 0, 0, { blocker: false, shadow: false });
    const moon = this.basic({ color: 0xd1d8c5, fog: false }); this.mesh(this.root, this.geometry(new THREE.CircleGeometry(1.25, 32)), moon, -16, 17, -42, { blocker: false, shadow: false });
    this.surface(this.root, 80, .1, 80, 0, -.48, -43, this.material({ color: 0x34565e, roughness: .3, metalness: .25 }), 10, { shadow: false, blocker: false });
    for (let i = 0; i < 14; i++) this.box(this.root, .1 + seeded(i) * 3, .005, .03, -12 + seeded(i + 20) * 24, -.42, -10 - seeded(i + 40) * 30, this.basic({ color: 0x759695, transparent: true, opacity: .16, depthWrite: false }), { shadow: false, blocker: false });
    this.surface(this.root, 2.5, .15, 13, 0, -.11, -11, this.m.floor, 2.4, { shadow: false });
    for (const x of [-1.25, 1.25]) this.pipe(this.root, [x, .95, -5.1], [x, .95, -15.3], .035, this.m.iron);
    for (let z = -6; z > -16; z -= 2) for (const x of [-1.25, 1.25]) this.pipe(this.root, [x, 0, z], [x, 1.0, z], .035, this.m.iron);
    for (const x of [-w / 2, w / 2]) {
      this.surface(this.root, .2, 1.0, d + .2, x, .5, 0, this.m.lower, 2, { shadow: false });
      const wall = this.group(this.root, x, 0, 0, x < 0 ? PI / 2 : -PI / 2); this.fence(wall, d, 2.0, 0, 2.0, 0);
    }
    for (const x of [-2.4, 2.4]) { this.surface(this.root, 3.1, .8, .2, x, .4, -d / 2, this.m.upper, 2, { shadow: false }); this.fence(this.root, 3.1, 2.15, x, 1.87, -d / 2); }
    this.wallPiece(-2.4, d / 2, 3.2, .2); this.wallPiece(2.4, d / 2, 3.2, .2); this.wallPiece(0, d / 2, 1.6, .2, 2.6, .75);
    this.corridorBackdrop(0, d / 2, 1);
    this.pipe(this.root, [2.7, 0, 1.3], [2.7, 3.5, 1.3], .055, this.m.iron); this.pipe(this.root, [2.7, 3.5, 1.3], [2.2, 3.5, 1.3], .055, this.m.iron);
    this.box(this.root, .45, .14, .3, 2.2, 3.44, 1.3, this.m.steel); this.box(this.root, .33, .025, .24, 2.2, 3.35, 1.3, this.m.lamp, { blocker: false, shadow: false });
    this.sign(this.root, ['RIVER PATH', '↗'], 1.2, .5, 0, 2.95, -4.87, { bg: '#334d48', ink: '#d1d3b4' });
    const pos = new Float32Array(180 * 6), seeds = [];
    for (let i = 0; i < 180; i++) seeds.push([seeded(i + 1) * w - w / 2, seeded(i + 100) * 5, seeded(i + 200) * d - d / 2]);
    const geo = this.geometry(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0x9fb9c1, transparent: true, opacity: .25, depthWrite: false }); this.materialAssets.add(rainMat);
    const rain = new THREE.LineSegments(geo, rainMat); rain.frustumCulled = false; this.root.add(rain); this.rain = { mesh: rain, seeds };
  }
  fence(parent, width, height, x, y, z) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d'); ctx.strokeStyle = '#899e94'; ctx.lineWidth = 2;
    for (let k = -128; k < 256; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 128, 128); ctx.moveTo(k, 0); ctx.lineTo(k - 128, 128); ctx.stroke(); }
    const tex = this.texture(c); tex.repeat.set(width * 2, height * 2);
    const mat = this.material({ map: tex, transparent: true, alphaTest: .14, roughness: .8, metalness: .4, side: THREE.DoubleSide });
    this.plane(parent, width, height, x, y, z, mat, 0, 0, { blocker: false });
    for (let px = -width / 2; px <= width / 2 + .01; px += width / Math.ceil(width / 2)) this.pipe(parent, [x + px, y - height / 2, z], [x + px, y + height / 2 + .12, z], .035, this.m.iron);
    this.pipe(parent, [x - width / 2, y + height / 2, z], [x + width / 2, y + height / 2, z], .026, this.m.iron);
  }
  floorStripe(x, z, w, d) { this.box(this.root, w, .004, d, x, .008, z, this.material({ color: 0xb5a15e, roughness: 1 }), { blocker: false, shadow: false }); }
  wallClock(parent, x, y, z) {
    this.cylinder(parent, .24, .045, x, y, z, this.m.iron, PI / 2);
    this.sign(parent, ['12', '9    •    3', '6'], .4, .4, x, y, z + .032, { bg: '#c9c8ab', ink: '#35453b', border: false, emissive: .04 });
    this.box(parent, .012, .15, .012, x, y + .05, z + .046, this.m.dark, { shadow: false }); const hand = this.box(parent, .11, .012, .012, x + .04, y, z + .05, this.m.dark, { shadow: false }); hand.rotation.z = -.35;
  }
  buildObject(object) {
    const p = coords(object), group = this.group(this.root, p.x, 0, p.z, object.ry || 0);
    group.userData.targetId = object.id;
    const actor = { object, group, anchor: new THREE.Vector3(p.x, targetHeight(object), p.z), parts: {} };
    this.actors.set(object.id, actor);
    const prop = object.prop || 'note';
    const footprint = FOOTPRINTS[prop] || (prop === 'basket' ? [.8, .75] : null);
    if (footprint) { this.collider(p.x, p.z, ...footprint, object.ry || 0); this.floorShadow(group, ...footprint); }
    if (['door', 'gate', 'shutter'].includes(prop)) this.collider(p.x, p.z, 1.5, .3, object.ry || 0);
    if (prop === 'panel' || prop === 'valve') {
      const offset = prop === 'valve' ? .2 : .1, depth = prop === 'valve' ? .48 : .27, ry = object.ry || 0;
      this.collider(p.x + Math.sin(ry) * offset, p.z + Math.cos(ry) * offset, prop === 'valve' ? 2.2 : 1.08, depth, ry);
    }
    switch (prop) {
      case 'bed': case 'bunk': this.bed(group, actor); break;
      case 'toilet': this.toilet(group); break;
      case 'sink': this.sink(group); break;
      case 'drain': case 'grate': this.grate(group, 0, .004, 0, .75, .75); if (object.item) actor.parts.pickup = this.key(group, .14, .035, .1, object.item); break;
      case 'door': case 'gate': case 'shutter': this.door(group, actor, prop !== 'door'); break;
      case 'locker': case 'cabinet': this.locker(group, actor); break;
      case 'shelf': this.filingCabinet(group); break;
      case 'desk': this.desk(group, actor); break;
      case 'cart': this.cart(group, actor); break;
      case 'basket': this.basket(group); break;
      case 'monitor': case 'terminal': this.monitor(group, actor); break;
      case 'panel': this.panel(group, actor); break;
      case 'camera': this.securityCamera(group, targetHeight(object), actor); break;
      case 'generator': if (this.room.id === 'laundry') this.washer(group); else this.generator(group); break;
      case 'boiler': this.boiler(group); break;
      case 'valve': this.valves(group, actor); break;
      case 'cage': this.cage(group); break;
      case 'crate': this.crate(group); break;
      case 'key': actor.parts.pickup = this.key(group, 0, targetHeight(object), 0, object.item); break;
      default: this.note(group, actor); break;
    }
    const targetSize = this.targetSize(object, footprint);
    const hit = this.mesh(group, this.boxGeo, this.m.invisible, 0, targetHeight(object), .02, { blocker: false, shadow: false });
    hit.scale.set(...targetSize); hit.userData.targetId = object.id; this.targetMeshes.push(hit); actor.hit = hit;
  }
  targetSize(object, footprint) {
    if (['door', 'gate', 'shutter'].includes(object.prop)) return [1.35, 2.2, .3];
    if (object.prop === 'note') return [.95, object.y < .5 ? .5 : .75, .22];
    if (['drain', 'grate'].includes(object.prop)) return [.9, .32, .9];
    if (object.prop === 'valve') return [2.05, 1.2, .65];
    if (object.prop === 'panel') return [1.1, 1.05, .42];
    if (object.prop === 'camera') return [.6, .5, .8];
    return [Math.max(.7, footprint?.[0] || 1), object.prop === 'bed' ? .65 : .95, Math.max(.35, footprint?.[1] || .6)];
  }
  bed(parent, actor) {
    for (const x of [-.48, .48]) for (const z of [-.95, .95]) this.box(parent, .045, .62, .045, x, .31, z, this.m.steel);
    for (const x of [-.49, .49]) this.box(parent, .045, .11, 2.05, x, .47, 0, this.m.steel);
    this.box(parent, 1.0, .14, 2.02, 0, .58, 0, this.m.fabric);
    this.box(parent, .92, .105, .42, 0, .7, -.72, this.m.paper);
    this.box(parent, 1.02, .04, 1.34, 0, .68, .31, this.m.blanket);
    for (let i = 0; i < 11; i++) this.box(parent, .006, .004, 1.32, -.45 + i * .09, .705, .31, i % 3 ? this.m.fabric : this.m.dark, { blocker: false, shadow: false });
    this.box(parent, .99, .15, .1, 0, .74, -.31, this.m.blanket);
    for (const z of [-1.03, 1.03]) { this.box(parent, 1.08, .04, .04, 0, .91, z, this.m.steel); for (const x of [-.5, .5]) this.box(parent, .04, .47, .04, x, .69, z, this.m.steel); }
    this.box(parent, .7, .25, .49, 0, .15, .3, this.m.dark); this.box(parent, .16, .035, .025, 0, .22, .56, this.m.steelLight);
    this.sign(parent, ['AG / 41'], .32, .15, .18, .708, .65, { rx: -PI / 2, bg: '#747b68', ink: '#bfc1a7', border: false, emissive: .025, blocker: false });
    if (actor?.object.item) actor.parts.pickup = this.key(parent, -.39, .72, -.28, actor.object.item);
  }
  toilet(parent) {
    this.box(parent, .23, .35, .35, 0, .19, .02, this.m.porcelain);
    const bowl = this.cylinder(parent, .28, .19, 0, .43, .09, this.m.porcelain); bowl.scale.z *= 1.22;
    const rim = this.torus(parent, .235, .046, 0, .53, .1, this.m.porcelain, PI / 2); rim.scale.y = 1.22;
    this.cylinder(parent, .18, .012, 0, .535, .1, this.m.dark);
    this.box(parent, .46, .5, .18, 0, .71, -.28, this.m.porcelain);
    this.box(parent, .49, .045, .21, 0, .98, -.28, this.m.porcelain);
    this.box(parent, .1, .03, .035, .13, .9, -.17, this.m.steelLight);
    this.pipe(parent, [0, .4, -.25], [0, .12, -.36], .045, this.m.steel);
  }
  sink(parent) {
    this.box(parent, .78, .13, .53, 0, .9, .05, this.m.porcelain);
    const hole = this.cylinder(parent, .21, .012, 0, .971, .1, this.m.dark); hole.scale.z *= .85;
    const rim = this.torus(parent, .225, .035, 0, .982, .1, this.m.porcelain, PI / 2); rim.scale.y = .85;
    this.pipe(parent, [0, .98, -.12], [0, 1.17, -.12], .022, this.m.steelLight); this.pipe(parent, [0, 1.17, -.12], [0, 1.17, .03], .022, this.m.steelLight);
    for (const x of [-.23, .23]) this.cylinder(parent, .04, .05, x, 1.0, -.12, this.m.steelLight);
    this.pipe(parent, [0, .87, .06], [0, .45, .06], .03, this.m.pipe); this.pipe(parent, [0, .45, .06], [0, .45, -.24], .03, this.m.pipe);
    for (const x of [-.29, .29]) this.pipe(parent, [x, .85, .18], [x, .62, -.2], .018, this.m.steel);
  }
  grate(parent, x, y, z, w, d) {
    this.box(parent, w, .015, d, x, y, z, this.m.dark, { shadow: false });
    for (let xx = -w / 2 + .025; xx < w / 2; xx += .065) this.box(parent, .015, .02, d - .035, x + xx, y + .015, z, this.m.steel, { shadow: false });
    for (const zz of [-d / 2, d / 2]) this.box(parent, w + .02, .025, .03, x, y + .01, z + zz, this.m.iron, { shadow: false });
  }
  door(parent, actor, bars = false) {
    const o = actor.object;
    for (const x of [-.77, .77]) this.box(parent, .11, 2.66, .39, x, 1.33, 0, this.m.iron);
    this.box(parent, 1.65, .13, .39, 0, 2.66, 0, this.m.iron);
    this.box(parent, 1.55, .035, .4, 0, .018, 0, this.m.steelLight);
    const hinge = this.group(parent, -.67, 0, .04); actor.parts.hinge = hinge;
    const isBars = bars || this.room.id === 'holding' || (o.targetRoom === 'holding');
    if (isBars) {
      for (let i = 0; i < 8; i++) this.cylinder(hinge, .022, 2.49, .09 + i * .168, 1.31, 0, this.m.iron);
      for (const y of [.08, .78, 1.78, 2.56]) this.box(hinge, 1.33, .055, .06, .665, y, 0, this.m.iron);
      for (const x of [0, 1.33]) this.box(hinge, .055, 2.53, .075, x, 1.31, 0, this.m.iron);
      if (o.id === 'dispatchShutter') for (let i = 0; i < 7; i++) this.box(hinge, 1.3, .15, .05, .665, .15 + i * .19, .025, this.m.steel);
    } else {
      this.box(hinge, 1.33, 2.49, .095, .665, 1.31, 0, this.m.steel);
      this.box(hinge, 1.16, .59, .045, .665, .51, .07, this.m.iron);
      this.box(hinge, .66, .49, .025, .665, 1.79, .067, this.m.dark);
      for (let i = 0; i < 4; i++) this.box(hinge, .015, .46, .023, .42 + i * .16, 1.79, .086, this.m.steelLight);
      this.box(hinge, .69, .025, .03, .665, 1.55, .086, this.m.steelLight);
      this.box(hinge, .69, .025, .03, .665, 2.04, .086, this.m.steelLight);
    }
    this.box(hinge, .19, .32, .09, 1.16, 1.2, .075, this.m.brass);
    this.cylinder(hinge, .025, .018, 1.16, 1.18, .135, this.m.dark, PI / 2);
    this.pipe(hinge, [1.14, 1.32, .17], [1.02, 1.32, .17], .015, this.m.steelLight);
    this.sign(hinge, [o.symbol || '↶'], .15, .13, 1.16, 1.43, .145, { bg: '#b7a070', ink: '#263b35', border: false, emissive: .06 });
    const title = o.targetRoom ? `TO ${o.targetRoom.toUpperCase()}` : ({ quayExit: 'RIVER PATH', returnGate: 'ASHGATE RECEIVING', dispatchExit: 'MAINTENANCE', transferExit: 'SERVICE TRANSFER' }[o.id] || o.title.toUpperCase());
    this.sign(parent, [title], 1.15, .2, 0, 2.88, .12, { bg: '#b8b69a', ink: '#344b3d', emissive: .07 });
    const status = this.box(parent, .19, .065, .07, .85, 1.67, .17, this.m.red); actor.parts.status = status;
    if (o.kind === 'timed') {
      const display = this.sign(parent, ['CAMERA WATCHING'], 1.16, .21, 0, 2.4, .15, { bg: '#39463b', ink: '#d1b77e', emissive: .14 });
      actor.parts.scanDisplay = display;
    }
  }
  key(parent, x, y, z, id) {
    const key = this.group(parent, x, y, z, -.45);
    const material = id === 'bentKey' ? this.m.rust : this.m.brass;
    this.torus(key, .065, .012, 0, 0, 0, material, PI / 2);
    this.box(key, .024, .018, .17, 0, 0, .13, material);
    for (const zz of [.17, .21]) this.box(key, .075, .02, .022, .027, 0, zz, material);
    return key;
  }
  locker(parent, actor) {
    const low = actor?.object.id === 'toolChest', h = low ? 1.18 : 1.78;
    this.box(parent, .88, h, .6, 0, h / 2, 0, this.m.steel);
    this.box(parent, .78, h - .13, .018, 0, h / 2, .308, this.m.dark);
    const leaf = this.group(parent, -.39, 0, .33); if (actor) actor.parts.hinge = leaf;
    this.box(leaf, .78, h - .12, .035, .39, h / 2, 0, this.m.steel);
    for (let i = 0; i < 4; i++) this.box(leaf, .46, .014, .012, .39, h - .2 - i * .055, .025, this.m.dark, { shadow: false });
    this.box(leaf, .025, .17, .03, .68, h * .56, .04, this.m.steelLight);
    this.sign(leaf, [low ? 'PLANT TOOLS' : 'ASHGATE', actor?.object.symbol || 'PROPERTY'], .36, .16, .38, h * .6, .03, { bg: '#babba0', ink: '#3b4e40', emissive: .04 });
    if (actor?.object.puzzle?.type === 'sequence') {
      const symbols = ['☾', '✦', '▥', '◉'];
      for (let i = 0; i < 4; i++) this.sign(leaf, [symbols[i]], .13, .14, .17 + i * .145, .94, .055, { bg: '#c8c6aa', ink: '#30493d', emissive: .09 });
    }
    this.box(parent, .74, .04, .49, 0, .46, 0, this.m.steelLight);
    if (actor?.object.item) actor.parts.pickup = this.key(parent, -.1, .49, .05, actor.object.item);
  }
  filingCabinet(parent) {
    this.box(parent, 1.0, 1.85, .57, 0, .93, 0, this.m.steel);
    for (let i = 0; i < 4; i++) {
      this.box(parent, .9, .4, .02, 0, .26 + i * .43, .3, this.m.iron);
      this.box(parent, .2, .025, .035, .19, .31 + i * .43, .33, this.m.steelLight);
      this.sign(parent, [`${1910 + i * 5} — ${1914 + i * 5}`], .3, .1, -.22, .29 + i * .43, .318, { border: false, bg: '#c6bfa2', ink: '#455441', emissive: .04 });
    }
    this.box(parent, .64, .22, .43, .05, 1.97, 0, this.m.wood);
  }
  desk(parent, actor) {
    this.box(parent, 1.8, .085, .94, 0, .88, 0, this.m.wood);
    for (const x of [-.78, .78]) for (const z of [-.37, .37]) this.box(parent, .055, .83, .055, x, .42, z, this.m.iron);
    this.box(parent, .58, .67, .77, .5, .45, -.015, this.m.steel);
    for (let i = 0; i < 3; i++) { this.box(parent, .52, .012, .025, .5, .26 + i * .19, .385, this.m.dark); this.box(parent, .13, .025, .035, .5, .32 + i * .19, .41, this.m.steelLight); }
    this.sign(parent, ['ASHGATE / NIGHT DUTY', 'MOVEMENT ORDER', 'NT-041  •  ESCORT PENDING'], .55, .39, -.21, .929, .02, { rx: -PI / 2, bg: '#d6cdae', ink: '#53604e', border: false, emissive: .025, blocker: false });
    this.box(parent, .29, .065, .41, .58, .96, -.19, this.m.fabric);
    this.cylinder(parent, .07, .12, -.63, .99, -.25, this.m.porcelain);
    if (actor?.object.item) actor.parts.pickup = this.key(parent, -.13, .946, .19, actor.object.item);
  }
  cart(parent, actor) {
    for (const x of [-.48, .48]) for (const z of [-.28, .28]) {
      this.cylinder(parent, .065, .045, x, .09, z, this.m.dark, 0, PI / 2);
      this.box(parent, .035, .95, .035, x, .59, z, this.m.steelLight);
    }
    this.box(parent, 1.05, .045, .7, 0, .22, 0, this.m.steel);
    this.box(parent, 1.05, .035, .7, 0, 1.04, 0, this.m.steel);
    this.box(parent, .98, .48, .64, 0, .48, 0, this.m.fabric);
    for (let i = 0; i < 4; i++) this.box(parent, .65, .07, .49, -.13, 1.095 + i * .07, -.03, i % 2 ? this.m.paper : this.m.fabric);
    this.pipe(parent, [-.53, .72, -.3], [-.53, 1.3, -.3], .022, this.m.steelLight); this.pipe(parent, [-.53, 1.3, -.3], [-.53, 1.3, .3], .022, this.m.steelLight);
    this.sign(parent, ['LINEN / 03'], .39, .18, .04, .72, .336, { bg: '#c5c4a7', ink: '#384e43', emissive: .07 });
    if (actor) actor.parts.pickup = this.sign(parent, ['SERVICE', '▥'], .16, .22, .28, .73, .345, { bg: '#b2c2aa', ink: '#345544', emissive: .08 });
  }
  basket(parent) {
    this.box(parent, .78, .56, .7, 0, .31, 0, this.m.wood);
    for (let i = 0; i < 8; i++) this.box(parent, .012, .49, .02, -.34 + i * .096, .32, .36, this.m.dark, { shadow: false });
    for (let i = 0; i < 3; i++) this.box(parent, .7, .012, .02, 0, .2 + i * .14, .365, this.m.fabric, { shadow: false });
    for (let i = 0; i < 4; i++) { const cloth = this.box(parent, .63, .06, .45, (seeded(i) - .5) * .08, .61 + i * .05, 0, i % 2 ? this.m.fabric : this.m.paper); cloth.rotation.y = (seeded(i + 5) - .5) * .18; }
  }
  crate(parent) {
    this.box(parent, .78, .7, .68, 0, .36, 0, this.m.wood);
    for (const x of [-.29, .29]) this.box(parent, .065, .72, .71, x, .36, 0, this.m.fabric);
    this.sign(parent, ['ASHGATE', 'PROPERTY'], .32, .21, .02, .42, .347, { bg: '#c0b99b', ink: '#4d5642', border: false, emissive: .04 });
  }
  monitor(parent, actor) {
    this.desk(parent);
    this.box(parent, .91, .62, .56, 0, 1.24, -.09, this.m.iron);
    this.box(parent, .82, .51, .045, 0, 1.26, .21, this.m.dark);
    const entries = actor?.object.clue?.entries || [];
    const lines = ['ASHGATE / SAVED FRAMES', ...entries.map(e => `${e.label}    ${e.value}`)];
    this.sign(parent, lines, .73, .44, 0, 1.27, .24, { bg: '#254738', ink: '#aac79f', emissive: .36, border: false, font: 'monospace' });
    this.box(parent, .77, .035, .23, 0, .95, .32, this.m.steelLight);
    for (let i = 0; i < 10; i++) this.box(parent, .043, .009, .17, -.32 + i * .07, .972, .32, this.m.iron, { shadow: false });
  }
  gauge(parent, x, y, z, label, angle = -.7) {
    this.cylinder(parent, .155, .055, x, y, z, this.m.iron, PI / 2);
    const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
    ctx.fillStyle = '#d0cdb1'; ctx.beginPath(); ctx.arc(128, 128, 119, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = '#394b3d'; ctx.lineWidth = 3;
    for (let i = 0; i < 13; i++) { const a = -.78 * PI + i / 12 * PI * 1.56; ctx.beginPath(); ctx.moveTo(128 + Math.sin(a) * 88, 135 - Math.cos(a) * 88); ctx.lineTo(128 + Math.sin(a) * 105, 135 - Math.cos(a) * 105); ctx.stroke(); }
    ctx.fillStyle = '#4a5742'; ctx.font = '700 23px Arial'; ctx.textAlign = 'center'; ctx.fillText(label, 128, 192); ctx.font = '15px Arial'; ctx.fillText('ASHGATE / BAR', 128, 214);
    const face = this.plane(parent, .285, .285, x, y, z + .032, this.material({ map: this.texture(c, false), emissive: 0x7b8069, emissiveIntensity: .08 }), 0, 0, { blocker: false });
    const needle = this.group(parent, x, y, z + .04); needle.rotation.z = angle;
    this.box(needle, .008, .108, .008, 0, .045, 0, this.m.red, { shadow: false });
    this.cylinder(parent, .014, .012, x, y, z + .05, this.m.iron, PI / 2);
    return needle;
  }
  panel(parent, actor) {
    const y = targetHeight(actor.object), clue = actor.object.kind === 'clue';
    this.box(parent, 1.04, 1.05, .22, 0, y, .015, this.m.steel);
    this.box(parent, .94, .93, .025, 0, y, .14, this.m.iron);
    if (clue) {
      for (let i = 0; i < 3; i++) this.gauge(parent, -.3 + i * .3, y + .11, .17, ['F', 'B', 'D'][i], -.6 + i * .25);
      this.sign(parent, ['TOTAL = 7', 'BYPASS = FEED × 2', 'DRAIN = FEED − 1'], .79, .29, 0, y - .3, .17, { bg: '#c8c7ad', ink: '#344e40', emissive: .09 });
    } else {
      this.sign(parent, ['SHUTTER AUTHORISATION', '—  —  —'], .75, .24, 0, y + .23, .169, { bg: '#273e33', ink: '#bdd0ab', emissive: .32 });
      for (let i = 0; i < 9; i++) {
        const x = -.19 + (i % 3) * .19, yy = y - .03 - Math.floor(i / 3) * .15;
        this.box(parent, .135, .105, .025, x, yy, .18, this.m.steelLight);
        this.sign(parent, [String(i + 1)], .09, .065, x, yy, .199, { bg: '#acb8a5', ink: '#344c3d', border: false, emissive: .05 });
      }
    }
    this.pipe(parent, [0, y + .53, 0], [0, 2.95, 0], .025, this.m.pipe);
  }
  securityCamera(parent, y = 2.3, actor = null) {
    this.box(parent, .14, .29, .045, 0, y, -.02, this.m.iron);
    this.pipe(parent, [0, y, 0], [0, y, .3], .03, this.m.steel);
    const pan = this.group(parent, 0, y, .3); this.box(pan, .24, .21, .44, 0, 0, .11, this.m.steelLight);
    this.box(pan, .27, .035, .49, 0, .125, .12, this.m.iron);
    this.cylinder(pan, .073, .045, 0, 0, .355, this.m.dark, PI / 2);
    const lens = this.cylinder(pan, .034, .01, 0, 0, .382, this.m.red, PI / 2, 0, { shadow: false });
    const source = new THREE.Vector3(0, 0, .4), end = new THREE.Vector3(0, -y + .08, 4.3), delta = source.clone().sub(end);
    const beam = this.mesh(pan, this.coneGeo, this.basic({ color: 0xe0cf94, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide }), ...source.clone().add(end).multiplyScalar(.5).toArray(), { shadow: false, blocker: false });
    beam.scale.set(1.15, delta.length(), 1.15); beam.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
    this.scanners.push({ pan, lens, beam });
    if (actor) actor.parts.scanner = pan;
  }
  generator(parent) {
    this.box(parent, 1.65, .17, 1.04, 0, .12, 0, this.m.iron);
    this.box(parent, 1.43, .83, .9, 0, .62, 0, this.m.steel);
    this.box(parent, 1.51, .06, .97, 0, 1.07, 0, this.m.pipe);
    for (let i = 0; i < 8; i++) this.box(parent, .035, .56, .018, -.63 + i * .17, .67, .46, this.m.dark, { shadow: false });
    this.cylinder(parent, .23, .09, -.36, .69, .53, this.m.iron, PI / 2);
    this.torus(parent, .19, .021, -.36, .69, .59, this.m.steelLight);
    for (let i = 0; i < 6; i++) { const spoke = this.box(parent, .31, .018, .018, -.36, .69, .59, this.m.steelLight, { shadow: false }); spoke.rotation.z = i * PI / 6; }
    this.pipe(parent, [-.5, 1.1, -.18], [-.5, 1.65, -.18], .065, this.m.pipe); this.pipe(parent, [-.5, 1.65, -.18], [-.5, 1.65, -.7], .065, this.m.pipe);
    this.gauge(parent, .43, .78, .485, 'BAR', -.3);
    this.sign(parent, ['RESERVE / 03'], .58, .16, .24, .32, .475, { bg: '#b6b492', ink: '#334b3e', emissive: .05 });
  }
  washer(parent) {
    this.box(parent, 1.24, 1.25, 1.04, 0, .65, 0, this.m.steelLight);
    this.box(parent, 1.12, .15, .035, 0, 1.12, .54, this.m.iron);
    for (let i = 0; i < 3; i++) this.cylinder(parent, .032, .025, -.3 + i * .2, 1.12, .57, this.m.paper, PI / 2);
    this.cylinder(parent, .37, .065, 0, .61, .55, this.m.iron, PI / 2);
    this.torus(parent, .32, .045, 0, .61, .59, this.m.steelLight);
    this.cylinder(parent, .27, .012, 0, .61, .6, this.m.dark, PI / 2);
    this.box(parent, .23, .06, .035, .34, .66, .64, this.m.steelLight);
    this.sign(parent, ['ASHGATE / LINEN'], .61, .12, 0, .17, .536, { bg: '#aeb8a8', ink: '#4d5f50', border: false, emissive: .04 });
  }
  boiler(parent) {
    this.cylinder(parent, .58, 2.12, 0, 1.15, 0, this.m.iron);
    this.cylinder(parent, .6, .09, 0, .17, 0, this.m.rust); this.cylinder(parent, .6, .09, 0, 2.19, 0, this.m.rust);
    this.cylinder(parent, .47, .18, 0, 2.32, 0, this.m.steel);
    this.pipe(parent, [0, 2.4, 0], [0, 2.98, 0], .12, this.m.pipe); this.pipe(parent, [0, 2.98, 0], [0, 2.98, -.8], .12, this.m.pipe);
    this.box(parent, .48, .39, .06, 0, .6, .57, this.m.rust);
    for (let i = 0; i < 5; i++) this.box(parent, .36, .025, .01, 0, .47 + i * .06, .61, this.m.dark);
    this.gauge(parent, 0, 1.55, .59, 'BAR', -.45);
    this.sign(parent, ['PLANT 03', 'RESIDUAL PRESSURE'], .58, .23, 0, 1.0, .595, { bg: '#a59c70', ink: '#354a3c', emissive: .05 });
  }
  valves(parent, actor) {
    const y = targetHeight(actor.object), wheels = [];
    this.box(parent, 2.18, 1.65, .13, 0, y, -.03, this.m.iron);
    for (let i = 0; i < 3; i++) {
      const x = -.68 + i * .68;
      this.pipe(parent, [x, .2, .11], [x, 2.65, .11], .06, i === 1 ? this.m.rust : this.m.pipe);
      this.cylinder(parent, .11, .16, x, y, .24, this.m.steel, PI / 2);
      const wheel = this.group(parent, x, y, .37); wheels.push(wheel);
      this.torus(wheel, .215, .027, 0, 0, 0, this.m.rust);
      for (let j = 0; j < 3; j++) { const spoke = this.box(wheel, .4, .025, .035, 0, 0, 0, this.m.rust); spoke.rotation.z = j * PI / 3; }
      this.cylinder(wheel, .055, .065, 0, 0, .01, this.m.brass, PI / 2);
      this.gauge(parent, x, y + .57, .15, ['FEED', 'BYPASS', 'DRAIN'][i], -.85 + i * .3);
      this.sign(parent, [[ 'FEED', 'BYPASS', 'DRAIN' ][i]], .53, .18, x, y - .48, .09, { bg: '#c5bd97', ink: '#384c3d', emissive: .06 });
    }
    actor.parts.wheels = wheels;
    this.pipe(parent, [-.68, .2, .11], [.68, .2, .11], .07, this.m.pipe);
  }
  cage(parent) {
    this.box(parent, 1.33, .06, .82, 0, .035, 0, this.m.iron);
    this.box(parent, 1.33, .06, .82, 0, 2.25, 0, this.m.iron);
    for (let i = 0; i < 8; i++) { const x = -.61 + i * .174; this.cylinder(parent, .018, 2.2, x, 1.14, .38, this.m.iron); this.cylinder(parent, .018, 2.2, x, 1.14, -.38, this.m.iron); }
    for (const x of [-.65, .65]) for (let i = 0; i < 4; i++) this.cylinder(parent, .02, 2.2, x, 1.14, -.36 + i * .24, this.m.iron);
    for (const y of [.7, 1.55]) this.box(parent, 1.33, .035, .04, 0, y, .4, this.m.iron);
    this.sign(parent, ['TEMPORARY HOLD'], .82, .16, 0, 2.08, .42, { bg: '#a6ad97', ink: '#394b3d', emissive: .04 });
  }
  chair(parent) {
    for (const x of [-.2, .2]) for (const z of [-.2, .2]) this.box(parent, .035, .5, .035, x, .25, z, this.m.iron);
    this.box(parent, .5, .065, .48, 0, .5, 0, this.m.wood);
    this.box(parent, .5, .4, .045, 0, .78, -.2, this.m.wood);
  }
  note(parent, actor) {
    const o = actor.object, y = targetHeight(o), clue = o.clue;
    if (y < .5) {
      actor.parts.pickup = this.sign(parent, ['VISITOR', 'VOID'], .24, .36, 0, .025, 0, { rx: -PI / 2, bg: '#c5b998', ink: '#885d42', emissive: .06 });
      return;
    }
    const lines = clue ? [clue.heading || o.title.toUpperCase(), ...(clue.entries || []).map(e => `${e.symbol || ''}  ${e.label || ''}  ${e.value || ''}`), ...(clue.lines || []), ...(clue.stamp ? [clue.stamp] : [])] : [o.title.toUpperCase(), 'ASHGATE PENITENTIARY'];
    const height = lines.length > 5 ? .86 : .65;
    this.box(parent, 1.02, height + .08, .027, 0, y, 0, this.m.wood, { shadow: false });
    const paper = this.sign(parent, lines, .95, height, 0, y, .018, { bg: '#c9c6a8', ink: '#3e5140', border: false, emissive: .09 });
    for (const x of [-.45, .45]) this.cylinder(parent, .012, .012, x, y + height / 2 - .04, .026, this.m.iron, PI / 2, 0, { shadow: false });
    if (o.item) actor.parts.pickup = paper;
  }
  updateState(state = {}) {
    this.state = state; this.lastState = state;
    for (const actor of this.actors.values()) {
      const { object: o, parts } = actor, done = complete(state, o);
      if (parts.pickup) parts.pickup.visible = !done;
      actor.pickable = !(done && (o.prop === 'key' || (o.prop === 'note' && o.item)));
      if (parts.hinge) parts.hinge.rotation.y = (opened(state, o) || (done && o.prop === 'locker')) ? -1.25 : 0;
      if (parts.status) parts.status.material = opened(state, o) ? this.m.green : this.m.red;
      if (parts.wheels && done) parts.wheels.forEach((wheel, i) => { wheel.rotation.z = [2, 4, 1][i] * PI / 3; });
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.updateMatrixWorld(true);
  }
  setCamera(pose = {}) {
    if (Number.isFinite(pose.x)) this.camera.position.x = pose.x;
    if (Number.isFinite(pose.z)) this.camera.position.z = pose.z;
    const crouch = typeof pose.crouch === 'number' ? clamp(pose.crouch, 0, 1) : pose.crouch ? 1 : 0;
    this.camera.position.y = Number.isFinite(pose.y) ? pose.y : 1.6 - crouch * .58;
    if (Number.isFinite(pose.yaw)) this.camera.rotation.y = pose.yaw;
    if (Number.isFinite(pose.pitch)) this.camera.rotation.x = clamp(pose.pitch, -1.35, 1.35);
    this.camera.updateMatrixWorld();
  }
  canMove(x, z, radius = .22) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !this.room) return false;
    if (Math.abs(x) > this.roomWidth / 2 - .12 - radius || Math.abs(z) > this.roomDepth / 2 - .12 - radius) return false;
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.ry), sn = Math.sin(c.ry);
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const qx = lx - clamp(lx, -c.w / 2, c.w / 2), qz = lz - clamp(lz, -c.d / 2, c.d / 2);
      if (qx * qx + qz * qz < radius * radius) return false;
    }
    return true;
  }
  visibleTo(actor, direction, distance) {
    this.raycaster.ray.origin.copy(this.camera.position); this.raycaster.ray.direction.copy(direction);
    this.raycaster.far = distance + .05;
    const obstruction = this.raycaster.intersectObjects(this.blockers, false)[0];
    return !obstruction || obstruction.distance >= distance - .12 || obstruction.object.userData.targetId === actor.object.id;
  }
  focusAt(ndc, assist = true) {
    if (!this.room) return null;
    this.camera.updateMatrixWorld(); this.raycaster.far = MAX_FOCUS + 2;
    this.raycaster.setFromCamera(ndc, this.camera);
    const initialDirection = this.raycaster.ray.direction.clone();
    const direct = this.raycaster.intersectObjects(this.targetMeshes, false);
    for (const hit of direct) {
      const actor = this.actors.get(hit.object.userData.targetId); if (!actor || actor.pickable === false) continue;
      const distance = Math.hypot(this.camera.position.x - actor.anchor.x, this.camera.position.z - actor.anchor.z);
      if (distance > MAX_FOCUS) continue;
      if (this.visibleTo(actor, initialDirection, hit.distance)) return { id: actor.object.id, distance };
    }
    if (!assist) return null;
    let best = null, bestScore = Infinity;
    for (const actor of this.actors.values()) {
      if (actor.pickable === false) continue;
      const distance = Math.hypot(this.camera.position.x - actor.anchor.x, this.camera.position.z - actor.anchor.z); if (distance > MAX_FOCUS || distance < .08) continue;
      const vector = actor.anchor.clone().sub(this.camera.position), length = vector.length(); vector.divideScalar(length);
      const angle = Math.acos(clamp(vector.dot(initialDirection), -1, 1)); if (angle > .105) continue;
      const score = angle + distance * .002;
      if (score < bestScore && this.visibleTo(actor, vector, length)) { best = { id: actor.object.id, distance }; bestScore = score; }
    }
    return best;
  }
  getTarget() { return this.focusAt(new THREE.Vector2(0, 0)); }
  targetAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return this.focusAt(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1));
  }
  projectMarkers() {
    const results = [];
    for (const actor of this.actors.values()) {
      if (actor.pickable === false) continue;
      const distance = Math.hypot(this.camera.position.x - actor.anchor.x, this.camera.position.z - actor.anchor.z);
      if (distance > 5.5) continue;
      const projected = actor.anchor.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
      const direction = actor.anchor.clone().sub(this.camera.position), length = direction.length(); direction.divideScalar(length);
      if (!this.visibleTo(actor, direction, length)) continue;
      results.push({ id: actor.object.id, x: (projected.x + 1) / 2 * this.width, y: (1 - projected.y) / 2 * this.height, distance });
    }
    return results;
  }
  addPeer(player) {
    const color = [0x9d8466, 0x748e7d, 0xa07862][this.peers.size % 3], cloth = this.material({ color, roughness: 1 });
    const group = this.group(this.peerRoot); const body = this.group(group);
    this.box(body, .4, .58, .23, 0, 1.03, 0, cloth, { shadow: false, blocker: false });
    this.sphere(body, .14, 0, 1.51, 0, this.m.paper, 1.12, { shadow: false, blocker: false });
    this.sphere(body, .145, 0, 1.56, -.02, this.m.iron, .65, { shadow: false, blocker: false });
    for (const x of [-.115, .115]) this.box(body, .13, .65, .16, x, .44, 0, this.m.dark, { shadow: false, blocker: false });
    for (const x of [-.27, .27]) this.box(body, .12, .58, .14, x, .97, .01, cloth, { shadow: false, blocker: false });
    const label = this.sign(group, [String(player.name || 'PRISONER').slice(0, 18)], .8, .13, 0, 1.91, 0, { bg: '#31463f', ink: '#d4d7bd', border: false, emissive: .25, doubleSide: true, blocker: false });
    const peer = { group, body, label, initialized: false }; this.peers.set(player.id, peer); return peer;
  }
  updatePeers(players = [], dt = .016) {
    const seen = new Set();
    for (const p of players) {
      const pose = p.pose || p.position || p; const room = pose.room || p.room;
      if (!p.id || (room && room !== this.room.id) || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) continue;
      seen.add(p.id); const peer = this.peers.get(p.id) || this.addPeer(p); peer.group.visible = true;
      // Network samples are already interpolated; avoid adding another delay here.
      peer.group.position.x = pose.x; peer.group.position.z = pose.z;
      peer.body.rotation.y = (pose.yaw || 0) + PI; peer.body.scale.y = pose.crouch ? .68 : 1;
      peer.label.position.y = pose.crouch ? 1.36 : 1.91; peer.label.quaternion.copy(this.camera.quaternion);
      peer.initialized = true;
    }
    for (const [id, peer] of this.peers) if (!seen.has(id)) peer.group.visible = false;
  }
  render({ dt = .016, time = Date.now(), state = this.state, players = [] } = {}) {
    if (!this.room) return;
    if (state !== this.lastState) this.updateState(state);
    const phase = scanPhase(time);
    for (const scanner of this.scanners) {
      scanner.pan.rotation.y = Math.sin(phase.progress * PI * 2) * .58;
      scanner.beam.visible = !phase.safe; scanner.lens.material = phase.safe ? this.m.dark : this.m.red;
    }
    for (const actor of this.actors.values()) if (actor.parts.scanDisplay) {
      const unlocked = opened(state, actor.object), key = unlocked ? 'OPEN' : phase.safe ? 'BLIND INTERVAL' : 'CAMERA WATCHING';
      if (actor.scanLabel !== key) {
        const display = actor.parts.scanDisplay, c = display.userData.canvas, ctx = c.getContext('2d');
        ctx.fillStyle = unlocked || phase.safe ? '#324e3f' : '#514b35'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = unlocked || phase.safe ? '#b4d1b2' : '#e5c68e'; ctx.font = `700 ${c.height * .43}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(key, c.width / 2, c.height / 2, c.width - 36); display.userData.texture.needsUpdate = true; actor.scanLabel = key;
      }
      actor.parts.status.material = unlocked || phase.safe ? this.m.green : this.m.red;
    }
    if (this.rain) {
      const positions = this.rain.mesh.geometry.attributes.position;
      for (let i = 0; i < this.rain.seeds.length; i++) { const [x, y, z] = this.rain.seeds[i], yy = ((y - time / 1000 * 3.2) % 5 + 5) % 5; positions.setXYZ(i * 2, x, yy, z); positions.setXYZ(i * 2 + 1, x - .035, yy + .19, z + .01); }
      positions.needsUpdate = true;
    }
    this.updatePeers(players, clamp(dt, 0, .1)); this.resize(); this.renderer.render(this.scene, this.camera);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(), w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.fov = w / h < .82 ? 81 : 71; this.camera.updateProjectionMatrix();
  }
  setBrightness(value = 1) { this.brightness = clamp(Number(value) || 1, .7, 1.8); this.renderer.toneMappingExposure = 1.12 * this.brightness; }
  dispose() {
    this.clearRoom(); for (const geometry of this.sharedGeometries) geometry.dispose();
    this.renderer.renderLists?.dispose?.(); this.renderer.dispose();
  }
}
