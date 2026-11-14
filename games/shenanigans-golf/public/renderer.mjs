import * as THREE from './vendor/three.module.js';
import { obstaclePose } from './holes.mjs';
import { CanvasGolfRenderer } from './fallback-renderer.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const GROUND = new THREE.Plane(UP, 0);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const color = (value, fallback) => value === undefined ? fallback : value;

function rng(seed) {
  let v = seed | 0;
  return () => { v = Math.imul(v ^ v >>> 16, 0x45d9f3b); v = Math.imul(v ^ v >>> 16, 0x45d9f3b); v ^= v >>> 16; return (v >>> 0) / 4294967296; };
}

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A renderer, never a source of score or collision state. */
export class GolfRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    try {
      const attrs = { alpha: false, antialias: true, powerPreference: 'high-performance' };
      const context = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
      if (!context) return new CanvasGolfRenderer(canvas, options);
      this.gl = new THREE.WebGLRenderer({ canvas, context, ...attrs });
    } catch {
      return new CanvasGolfRenderer(canvas, options);
    }
    this.kind = 'webgl';
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.15;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b8d5d0');
    this.camera = new THREE.OrthographicCamera(-20, 20, 16, -16, .1, 250);
    this.camera.position.set(11, 28, 23);
    this.camera.lookAt(0, 0, 0);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.target = new THREE.Vector3();
    this.desiredTarget = new THREE.Vector3();
    this.cameraOffset = new THREE.Vector3(10, 29, 23);
    this.orbit = .27;
    this.cameraSpan = 34;
    this.cameraMode = 'follow';
    this.width = this.height = 0;
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.local = new Set();
    this.commonMaterials = new Map();
    this.geometries = {
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      sphere: new THREE.SphereGeometry(1, 16, 12),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 20),
      cone: new THREE.ConeGeometry(1, 1, 16),
      ring: new THREE.RingGeometry(.79, 1, 32),
      torus: new THREE.TorusGeometry(1, .065, 8, 32),
      octahedron: new THREE.OctahedronGeometry(1),
    };
    this.shadowTexture = canvasTexture(64, 64, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 3, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(19,29,24,.38)'); grad.addColorStop(.45, 'rgba(19,29,24,.24)'); grad.addColorStop(1, 'rgba(19,29,24,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    });
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false });
    this.ambient = new THREE.HemisphereLight('#effaf3', '#61503b', 2.7);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#fff2d4', 3.5);
    this.sun.position.set(-16, 28, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.normalBias = .035;
    this.sun.shadow.bias = -.00035;
    this.sun.shadow.camera.near = .1; this.sun.shadow.camera.far = 95;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight('#b1dce8', 1.1);
    this.fill.position.set(15, 10, -20); this.scene.add(this.fill);
    this.ballGroup = new THREE.Group(); this.scene.add(this.ballGroup);
    this.balls = new Map();
    this.aim = new THREE.Group(); this.scene.add(this.aim);
    this.aimDots = [];
    const aimMat = this.material('#fff8d8', { emissive: '#a19862', roughness: .5 });
    for (let i = 0; i < 24; i++) {
      const dot = new THREE.Mesh(this.geometries.sphere, aimMat);
      dot.scale.setScalar(.065); this.aim.add(dot); this.aimDots.push(dot);
    }
    this.aimRing = new THREE.Mesh(this.geometries.torus, aimMat);
    this.aimRing.rotation.x = Math.PI / 2; this.aimRing.scale.setScalar(.38); this.aim.add(this.aimRing);
    this.aimArrow = new THREE.Mesh(this.geometries.cone, aimMat);
    this.aimArrow.scale.set(.22, .65, .22); this.aim.add(this.aimArrow);
    this.aim.visible = false;
    this.resize();
    this.onContextLost = event => { event.preventDefault(); this.contextLost = true; };
    this.onContextRestored = () => { this.contextLost = false; };
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  material(hex, extra = {}) {
    const key = String(hex) + JSON.stringify(extra);
    if (!this.commonMaterials.has(key)) {
      this.commonMaterials.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: .84, metalness: .02, ...extra }));
    }
    return this.commonMaterials.get(key);
  }

  mesh(shape, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, parent = this.world) {
    const mesh = new THREE.Mesh(this.geometries[shape] || shape, typeof mat === 'string' || typeof mat === 'number' ? this.material(mat) : mat);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = shape !== 'plane' && shape !== 'ring'; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  shadow(x, z, w, d, y = .016, parent = this.world) {
    const mesh = this.mesh('plane', this.shadowMaterial, x, y, z, w, d, 1, parent);
    mesh.rotation.x = -Math.PI / 2; mesh.castShadow = false; mesh.receiveShadow = false;
    return mesh;
  }

  label(text, width = 3.5, foreground = '#203a2d', background = '#f3edce', fontSize = 34) {
    const texture = canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = foreground; ctx.lineWidth = 5; ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.font = `800 ${fontSize}px Arial, sans-serif`; ctx.fillStyle = foreground;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2, w - 30);
    });
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    this.local.add(texture); this.local.add(material);
    const mesh = this.mesh('plane', material, 0, 0, 0, width, width / 4, 1);
    mesh.castShadow = true;
    return mesh;
  }

  setHole(hole) {
    if (!hole) return;
    this.hole = hole;
    this.world.clear();
    for (const resource of this.local) resource.dispose?.();
    this.local.clear();
    this.obstacleMeshes = []; this.animations = []; this.portalMeshes = []; this.flags = [];
    this.lastTime = undefined;
    const p = hole.palette || {};
    const sky = color(p.sky, '#bad6cf');
    this.scene.background.set(sky);
    this.scene.fog = new THREE.Fog(sky, 75, 150);
    const moon = hole.gravity && hole.gravity < 10 || /moon|space|orbit|cosmi/i.test(hole.scenery || '');
    const lava = /lava|volcan|reactor|chaos|final/i.test(hole.scenery || '');
    this.theme = { moon, lava, dark: moon || lava };
    this.sun.color.set(moon ? '#c6d9ff' : lava ? '#ffb380' : '#fff2d4');
    this.ambient.color.set(moon ? '#a3c1ed' : '#e2f3e5');
    this.ambient.groundColor.set(lava ? '#62403c' : '#615440');
    const turfColor = color(p.turf, '#4b845b');
    const random = rng(hole.id * 3907 + 23);
    const texture = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = typeof turfColor === 'number' ? '#' + turfColor.toString(16).padStart(6, '0') : turfColor;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(0, 0, w / 2, h);
      for (let i = 0; i < 3200; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.06)';
        ctx.fillRect(random() * w, random() * h, 1, 1 + random());
      }
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = Math.min(8, this.gl.capabilities.getMaxAnisotropy());
    this.local.add(texture);
    const turf = new THREE.MeshStandardMaterial({ map: texture, roughness: .98, color: '#ffffff' });
    this.local.add(turf);
    const wood = this.material(moon ? '#6e8591' : lava ? '#464052' : '#816340');
    const railTop = this.material(moon ? '#b0c9d8' : lava ? '#9e7d69' : '#c2a078');
    const b = hole.bounds;
    this.center = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    const ground = this.mesh('plane', color(p.ground, '#d0c19a'), this.center.x, -1.03, this.center.z, 180, 180);
    ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
    for (const platform of hole.platforms) {
      this.mesh('box', wood, platform.x, -.55, platform.z, platform.w + .12, 1.0, platform.d + .12);
      // A thin timber fascia makes the playable surface read as a physical miniature.
      for (const edge of [-1, 1]) {
        this.mesh('box', railTop, platform.x, -.25, platform.z + edge * platform.d / 2, platform.w, .055, .065);
      }
    }
    // Partition the union once. Overlapping rectangles must not produce coplanar
    // turf surfaces; this also keeps mowing stripes continuous through bends.
    const xs = [...new Set(hole.platforms.flatMap(p => [p.x - p.w / 2, p.x + p.w / 2]))].sort((a, b) => a - b);
    const zs = [...new Set(hole.platforms.flatMap(p => [p.z - p.d / 2, p.z + p.d / 2]))].sort((a, b) => a - b);
    const positions = [], uv = [], normals = [];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (!hole.platforms.some(p => Math.abs(cx - p.x) < p.w / 2 + 1e-7 && Math.abs(cz - p.z) < p.d / 2 + 1e-7)) continue;
      for (const [x, z] of [[xs[i], zs[j + 1]], [xs[i + 1], zs[j + 1]], [xs[i + 1], zs[j]], [xs[i], zs[j + 1]], [xs[i + 1], zs[j]], [xs[i], zs[j]]]) {
        positions.push(x, .002, z); normals.push(0, 1, 0); uv.push(x / 4, z / 4);
      }
    }
    const turfGeometry = new THREE.BufferGeometry();
    turfGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    turfGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    turfGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.local.add(turfGeometry);
    const top = this.mesh(turfGeometry, turf); top.castShadow = false;
    for (const rail of hole.rails || []) {
      const dx = rail.bx - rail.ax, dz = rail.bz - rail.az;
      const length = Math.hypot(dx, dz);
      const beam = this.mesh('box', wood, (rail.ax + rail.bx) / 2, .19, (rail.az + rail.bz) / 2, length + .12, .38, .22);
      beam.rotation.y = -Math.atan2(dz, dx);
      const cap = this.mesh('box', railTop, beam.position.x, .39, beam.position.z, length + .15, .045, .25);
      cap.rotation.y = beam.rotation.y;
      for (const t of [.12, .88]) {
        const nail = this.mesh('cylinder', '#5a5042', rail.ax + dx * t, .422, rail.az + dz * t, .035, .018, .035);
        nail.castShadow = false;
      }
    }
    for (const zone of hole.zones || []) this.buildZone(zone);
    for (const obstacle of hole.obstacles || []) this.buildObstacle(obstacle);
    this.buildCup(hole);
    this.buildScenery(hole, random);
    const tee = this.mesh('ring', this.material('#e8e1bd', { transparent: true, opacity: .48, side: THREE.DoubleSide }), hole.tee.x, .025, hole.tee.z, .75, .75);
    tee.rotation.x = -Math.PI / 2; tee.receiveShadow = false;
    // A tiny course card beside the tee gives every hole its own identity.
    const signX = b.minX - 1.5, signZ = Math.max(b.minZ + 1, Math.min(b.maxZ - 1, hole.tee.z));
    this.mesh('box', '#6d573e', signX, .25, signZ, .14, 2.6, .14);
    const sign = this.label(`${String(hole.id).padStart(2, '0')}   /   PAR ${hole.par}`, 3.0);
    sign.position.set(signX, 1.65, signZ); sign.rotation.y = .22;
    this.target.set(this.center.x, 0, this.center.z);
    this.cameraSpan = this.fitSpan();
    this.sun.target.position.set(this.center.x, 0, this.center.z);
    this.sun.position.set(this.center.x - 16, 30, this.center.z + 18);
    const extent = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * .75 + 5;
    this.sun.shadow.camera.left = -extent; this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent; this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.camera.updateProjectionMatrix();
    for (const ball of this.balls.values()) ball.initialized = false;
    this.updateCamera(null, { overview: true }, 1);
  }

  buildCup(hole) {
    const { x, z } = hole.cup, r = hole.cup.r || .48;
    const black = this.mesh('cylinder', '#14211e', x, -.025, z, r, .09, r);
    black.castShadow = false;
    const rim = this.mesh('torus', '#f3e7bc', x, .04, z, r, r, r);
    rim.rotation.x = Math.PI / 2; rim.castShadow = false;
    this.mesh('cylinder', '#efe6c9', x, 1.02, z, .035, 2.05, .035);
    const flagGeometry = new THREE.PlaneGeometry(.85, .53, 6, 2);
    this.local.add(flagGeometry);
    const flag = this.mesh(flagGeometry, this.material(color(hole.palette?.accent, '#de6546'), { side: THREE.DoubleSide }), x + .42, 1.82, z, 1, 1, 1);
    flag.userData.origin = flagGeometry.attributes.position.array.slice();
    this.flags.push(flag);
    const badge = this.label(String(hole.id).padStart(2, '0'), .47, '#fff6dd', color(hole.palette?.accent, '#de6546'), 68);
    badge.position.set(x + .4, 1.82, z + .014); badge.scale.y *= 1.7;
    this.shadow(x, z, 1.5, 1.3);
  }

  arrow(x, z, angle, scale = 1, hex = '#f8e4a8', parent = this.world, y = .06) {
    const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = -angle; parent.add(group);
    const stem = this.mesh('box', hex, 0, 0, .10 * scale, .12 * scale, .025, .7 * scale, group);
    stem.castShadow = false;
    for (const side of [-1, 1]) {
      const arm = this.mesh('box', hex, side * .18 * scale, 0, -.21 * scale, .11 * scale, .025, .46 * scale, group);
      arm.rotation.y = side * Math.PI / 4; arm.castShadow = false;
    }
    return group;
  }

  buildZone(zone) {
    const w = zone.w || 2, d = zone.d || 2;
    const palette = {
      sand: '#d7bb77', ice: '#91d9e2', water: '#3d9fac', lava: '#dd5227',
      boost: '#d9a832', conveyor: '#344f52', portal: '#7661c9', ramp: '#b48a47', wind: '#90c8ae', magnet: '#667a8b',
    };
    const hex = palette[zone.type] || '#b5bca1';
    const material = this.material(hex, zone.type === 'ice' ? { metalness: .25, roughness: .17 } : {});
    const pad = this.mesh('plane', material, zone.x, .026, zone.z, w, d);
    pad.rotation.x = -Math.PI / 2; pad.castShadow = false;
    if (zone.type === 'water' || zone.type === 'lava') {
      const waves = new THREE.Group(); this.world.add(waves);
      for (let i = 0; i < 5; i++) {
        const line = this.mesh('box', zone.type === 'lava' ? '#ffac41' : '#9bdcd7', zone.x + Math.sin(i * 1.9) * w * .17, .044, zone.z + (i / 4 - .5) * d * .77, w * .25, .012, .035, waves);
        line.rotation.y = Math.sin(i) * .2; line.castShadow = false;
      }
      this.animations.push({ type: 'water', mesh: waves, zone });
      if (zone.type === 'lava') {
        for (const side of [-1, 1]) this.mesh('box', '#f8a140', zone.x + side * (w / 2 - .07), .045, zone.z, .045, .02, d);
      }
    } else if (zone.type === 'sand') {
      const random = rng(Math.round(zone.x * 31 + zone.z * 73) + 9);
      for (let i = 0; i < 22; i++) {
        const spot = this.mesh('sphere', i % 2 ? '#b49557' : '#e5cd8d', zone.x + (random() - .5) * w * .9, .035, zone.z + (random() - .5) * d * .9, .035, .012, .035);
        spot.castShadow = false;
      }
    } else if (zone.type === 'ice') {
      for (let i = 0; i < 4; i++) {
        const crack = this.mesh('box', '#d5f3e9', zone.x + (i / 3 - .5) * w * .7, .043, zone.z, .025, .01, d * .65);
        crack.rotation.y = i % 2 ? .16 : -.2; crack.castShadow = false;
      }
    } else if (zone.type === 'portal') {
      const ring = this.mesh('torus', this.material('#ac91ff', { emissive: '#7a4acb', emissiveIntensity: .65 }), zone.x, .11, zone.z, w * .42, d * .42, .8);
      ring.rotation.x = Math.PI / 2; ring.castShadow = false;
      this.portalMeshes.push(ring);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        this.mesh('cylinder', '#d4baff', zone.x + sx * w * .45, .15, zone.z + sz * d * .45, .075, .3, .075);
      }
      if (zone.to) {
        const exit = this.mesh('torus', this.material('#a2f0d0', { emissive: '#387b75', emissiveIntensity: .7 }), zone.to.x, .06, zone.to.z, .67, .67, .67);
        exit.rotation.x = Math.PI / 2; exit.castShadow = false;
        this.portalMeshes.push(exit);
      }
    } else if (zone.type === 'ramp') {
      const h = zone.height || .55;
      // A shallow launch wedge; the glowing face marks the actual trigger rectangle.
      const geom = new THREE.BufferGeometry();
      const hw = w / 2, hd = d / 2;
      const verts = new Float32Array([
        -hw,0,hd, hw,0,hd, hw,h,-hd, -hw,0,hd, hw,h,-hd, -hw,h,-hd,
        -hw,0,hd, -hw,h,-hd, -hw,0,-hd, hw,0,hd, hw,0,-hd, hw,h,-hd,
        -hw,0,-hd, -hw,h,-hd, hw,h,-hd, -hw,0,-hd, hw,h,-hd, hw,0,-hd,
      ]);
      geom.setAttribute('position', new THREE.BufferAttribute(verts, 3)); geom.computeVertexNormals(); this.local.add(geom);
      const wedge = this.mesh(geom, material, zone.x, .035, zone.z);
      wedge.rotation.y = -(zone.angle || 0);
      this.arrow(zone.x, zone.z, zone.angle || 0, Math.min(w, d) * .45, '#fff4c5', this.world, h * .6 + .05);
      const edge = this.mesh('box', '#f4d55b', 0, h, -hd, w, .055, .1, wedge);
      edge.castShadow = false;
    } else if (zone.type === 'conveyor' || zone.type === 'boost') {
      const direction = zone.angle || 0;
      for (let i = 0; i < 5; i++) {
        const offset = (i - 2) * d / 5;
        this.arrow(zone.x + Math.sin(direction) * offset, zone.z - Math.cos(direction) * offset, direction, Math.min(w, d) * .27, zone.type === 'boost' ? '#fff4c8' : '#91c3b2');
      }
      for (const side of [-1, 1]) {
        this.mesh('box', zone.type === 'boost' ? '#f3d875' : '#1e383a', zone.x + side * w * .47, .08, zone.z, .1, .14, d);
      }
    } else if (zone.type === 'wind') {
      for (let i = 0; i < 3; i++) this.arrow(zone.x + (i - 1) * w * .27, zone.z, zone.angle || 0, Math.min(1.5, d * .35), '#dcf1d3');
      // Machinery stays off the playable surface: only the marked wind field affects a ball.
      const fan = new THREE.Group(); fan.position.set(this.hole.bounds.minX - 1.1, .5, zone.z); fan.rotation.y = Math.PI / 2; this.world.add(fan);
      this.mesh('cylinder', '#e5d7ad', 0, 0, 0, .34, .18, .34, fan).rotation.x = Math.PI / 2;
      const blades = new THREE.Group(); fan.add(blades);
      for (let i = 0; i < 3; i++) {
        const blade = this.mesh('box', '#758e8b', 0, 0, 0, .1, .85, .04, blades);
        blade.rotation.z = i * Math.PI / 3;
      }
      this.animations.push({ type: 'fan', mesh: blades, zone });
    } else if (zone.type === 'magnet') {
      for (let i = 0; i < 3; i++) {
        const field = this.mesh('torus', this.material('#b2d3e7', { transparent: true, opacity: .5 }), zone.x, .06, zone.z, (i + 1) * Math.min(w, d) * .13, (i + 1) * Math.min(w, d) * .13, .35);
        field.rotation.x = Math.PI / 2; field.castShadow = false;
      }
      this.mesh('box', '#ce534d', zone.x - .25, .09, zone.z, .18, .18, .55);
      this.mesh('box', '#5476ad', zone.x + .25, .09, zone.z, .18, .18, .55);
      this.mesh('box', '#d5d6c5', zone.x, .09, zone.z + .24, .55, .18, .12);
    }
  }

  buildObstacle(obstacle) {
    const group = new THREE.Group(); this.world.add(group);
    const type = obstacle.type;
    const h = obstacle.height || (type === 'bumper' ? .6 : .8);
    const accent = color(this.hole.palette?.accent, '#d87742');
    if (type === 'post' || type === 'bumper') {
      const r = obstacle.r || .6;
      const mat = type === 'bumper' ? accent : '#b4a082';
      this.mesh('cylinder', '#415449', 0, .07, 0, r * 1.02, .14, r * 1.02, group);
      this.mesh('cylinder', mat, 0, h * .5, 0, r, h * .8, r, group);
      this.mesh('cylinder', type === 'bumper' ? '#ffe9a5' : '#e2d1a7', 0, h * .91, 0, r * .82, h * .17, r * .82, group);
      if (type === 'bumper') {
        this.mesh('sphere', this.material('#fff1af', { emissive: '#ffb850', emissiveIntensity: .55 }), 0, h, 0, r * .18, .08, r * .18, group);
      }
    } else {
      const w = obstacle.w || 3, d = obstacle.d || .5;
      this.mesh('box', type === 'block' ? '#8a9b86' : accent, 0, h / 2, 0, w, h, d, group);
      this.mesh('box', '#f1dbad', 0, h + .015, 0, w * .96, .06, d * .94, group);
      for (let x = -w * .38; x < w * .45; x += .7) {
        const stripe = this.mesh('box', '#4d5144', x, h / 2, d / 2 + .012, .19, h * .88, .018, group);
        stripe.rotation.z = -.28; stripe.castShadow = false;
      }
      if (type === 'block' && this.hole.id === 2) {
        this.mesh('box', '#64513b', 0, h + .055, 0, w * .9, .06, d * .9, group);
        for (let i = 0; i < 13; i++) {
          const x = Math.sin(i * 2.4) * w * .32, z = Math.cos(i * 1.9) * d * .33;
          this.mesh('box', '#4c7851', x, h + .22, z, .035, .35, .035, group);
          this.mesh('sphere', ['#e4ab65', '#d97b87', '#f2e0aa'][i % 3], x, h + .4, z, .17, .09, .17, group);
          this.mesh('sphere', '#d2a044', x, h + .49, z, .05, .035, .05, group);
        }
      }
      if (type === 'spinner' || type === 'windmill') {
        this.mesh('cylinder', '#d9c8a2', 0, h * .65, 0, .24, h * 1.3, .24, group);
        this.mesh('sphere', accent, 0, h * 1.35, 0, .18, .12, .18, group);
        if (type === 'windmill') {
          // The turning mill is also the collider, so what swings into your line is real.
          for (const side of [-1, 1]) {
            this.mesh('box', '#eedcae', side * w * .32, h * .83, 0, w * .26, .04, d * .8, group);
            for (let i = 0; i < 3; i++) this.mesh('box', '#7c694d', side * (w * .22 + i * w * .075), h * .88, 0, .055, .04, d * .78, group);
          }
        }
      }
      if (type === 'gate') {
        const axis = obstacle.axis === 'z' ? 'z' : 'x';
        const travel = obstacle.travel || 1;
        const track = this.mesh('box', '#d3b87f', obstacle.x, .026, obstacle.z, axis === 'x' ? travel * 2 + w : .07, .016, axis === 'z' ? travel * 2 + d : .07);
        track.castShadow = false;
      }
    }
    this.obstacleMeshes.push({ definition: obstacle, group });
    const pose = obstaclePose(obstacle, 0);
    group.position.set(pose.x, 0, pose.z); group.rotation.y = -pose.angle;
  }

  buildScenery(hole, random) {
    const b = hole.bounds;
    const outside = (side, t, gap = 3) => ({ x: side < 0 ? b.minX - gap : b.maxX + gap, z: b.minZ + (b.maxZ - b.minZ) * t });
    const scene = hole.scenery || '';
    const industrial = /factory|industrial|work|machine|construction|conveyor/i.test(scene);
    const arcade = /arcade|pinball|carnival|portal|neon|weird/i.test(scene);
    const { moon, lava } = this.theme;
    if (moon || lava) {
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? -1 : 1, point = outside(side, random(), 2.3 + random() * 15);
        const s = .4 + random() * 1.8;
        const rock = this.mesh('octahedron', lava ? (i % 3 ? '#715653' : '#97715d') : (i % 3 ? '#8b9eae' : '#b3bcc2'), point.x, -.65 + s * .28, point.z, s, s * .65, s * .85);
        rock.rotation.set(random(), random(), random());
      }
      const planet = this.mesh('sphere', moon ? '#aec5c8' : '#b66d47', b.minX - 24, 16, b.minZ - 28, 7, 7, 7);
      planet.castShadow = false;
      if (moon) {
        const ring = this.mesh('torus', '#e0c794', planet.position.x, planet.position.y, planet.position.z, 10.4, 10.4, 1.6);
        ring.rotation.set(.95, .25, .15); ring.castShadow = false;
      }
      const starsGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(180 * 3);
      for (let i = 0; i < 180; i++) { positions[i * 3] = (random() - .5) * 140; positions[i * 3 + 1] = 20 + random() * 45; positions[i * 3 + 2] = -20 - random() * 70; }
      starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const starsMaterial = new THREE.PointsMaterial({ color: '#e3ebdb', size: .16, sizeAttenuation: true });
      this.local.add(starsGeometry); this.local.add(starsMaterial); this.world.add(new THREE.Points(starsGeometry, starsMaterial));
      if (lava) {
        for (let i = 0; i < 5; i++) {
          const mountain = this.mesh('cone', '#55434a', b.maxX + 10 + i * 5, 1.6, b.minZ - 5 - i * 6, 4 + random() * 3, 6 + random() * 6, 4 + random() * 3);
          mountain.castShadow = false;
        }
      }
    } else if (industrial) {
      for (let i = 0; i < 8; i++) {
        const p = outside(i % 2 ? -1 : 1, .05 + i / 8 * .9, 2.8 + random() * 1.4);
        this.mesh('box', i % 2 ? '#b6a078' : '#718f83', p.x, -.2, p.z, 1.3, 1.6, 1.1);
        for (const dx of [-.48, .48]) this.mesh('box', '#6f654f', p.x + dx, -.2, p.z + .57, .09, 1.7, .04);
        if (i % 3 === 0) {
          this.mesh('cone', '#d96b39', p.x + 1.2, -.5, p.z, .25, .85, .25);
          this.mesh('box', '#eee1b6', p.x + 1.2, -.42, p.z, .34, .12, .34);
        }
      }
      const p = outside(-1, .15, 6);
      this.mesh('box', '#d9aa50', p.x, 2, p.z, .5, 6, .5);
      this.mesh('box', '#d9aa50', p.x + 2, 4.8, p.z, 6, .4, .4);
      this.mesh('box', '#6e7263', p.x + 4, 3.8, p.z, .045, 2.2, .045);
      this.mesh('torus', '#535d57', p.x + 4, 2.6, p.z, .25, .25, .25);
    } else if (arcade) {
      for (let i = 0; i < 9; i++) {
        const p = outside(i % 2 ? -1 : 1, .06 + i / 9 * .9, 2.3 + random() * 2);
        const hex = ['#d88458', '#78afb5', '#9b80b6'][i % 3];
        this.mesh('cylinder', '#516765', p.x, .8, p.z, .12, 3.6, .12);
        this.mesh('sphere', this.material(hex, { emissive: hex, emissiveIntensity: .18 }), p.x, 2.7, p.z, .55, .55, .55);
        const pennant = this.mesh('cone', hex, p.x, 1.2, p.z, .7, 1.2, .7);
        pennant.rotation.z = Math.PI;
      }
      const sign = this.label('PLEASE REMAIN REASONABLE', 7, '#eee3bf', '#3d5c58', 27);
      sign.position.set(this.center.x, 3.6, b.minZ - 3.5);
      this.mesh('box', '#7a6b55', this.center.x - 2.8, 1.2, b.minZ - 3.5, .16, 5, .16);
      this.mesh('box', '#7a6b55', this.center.x + 2.8, 1.2, b.minZ - 3.5, .16, 5, .16);
    } else {
      for (let i = 0; i < 11; i++) {
        const point = outside(i % 2 ? -1 : 1, .01 + random() * .98, 2.8 + random() * 4);
        this.tree(point.x, point.z, .8 + random() * .75, i % 3);
      }
      for (let i = 0; i < 12; i++) {
        const point = outside(i % 2 ? -1 : 1, random(), 1.1 + random() * .8);
        const shade = ['#efdba2', '#d77555', '#bd8193', '#f3e6cb'][i % 4];
        this.mesh('box', '#6b8e5d', point.x, -.6, point.z, .035, .8, .035);
        this.mesh('sphere', shade, point.x, -.18, point.z, .16, .10, .16);
        this.mesh('sphere', '#d8b35f', point.x, -.08, point.z, .05, .035, .05);
      }
      const benchX = b.maxX + 3.2, benchZ = b.maxZ - 3;
      this.mesh('box', '#a9875c', benchX, -.25, benchZ, 1.2, .16, 2.5);
      this.mesh('box', '#a9875c', benchX + .55, .25, benchZ, .1, .9, 2.5);
      for (const dz of [-.8, .8]) this.mesh('box', '#485e4d', benchX, -.65, benchZ + dz, .85, .8, .12);
    }
    if (/storm/.test(scene)) {
      for (let i = 0; i < 4; i++) {
        const cloud = new THREE.Group();
        cloud.position.set(b.minX - 7 + i * 6, 6 + Math.sin(i), b.minZ - 5 - i * 1.4);
        this.world.add(cloud);
        for (let j = 0; j < 3; j++) {
          const puff = this.mesh('sphere', '#98a8b0', (j - 1) * 1.2, Math.sin(j) * .4, 0, 1.5, .8, 1.0, cloud);
          puff.castShadow = false;
        }
      }
      const x = b.maxX + 2, z = b.maxZ - 3;
      this.mesh('cylinder', '#bdbda7', x, 1.4, z, .05, 4.8, .05);
      const sock = this.mesh('cone', '#e19761', x + .65, 3.7, z, .3, 1.4, .3);
      sock.rotation.z = -Math.PI / 2;
    }
    if (/reactor/.test(scene)) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? b.minX - 3 : b.maxX + 3, z = this.center.z;
        this.mesh('cylinder', '#5b6e79', x, .75, z, 1.2, 3.5, 1.2);
        this.mesh('cone', '#a2b7bd', x, 2.8, z, 1.3, .6, 1.3);
        for (let i = 0; i < 3; i++) {
          const ring = this.mesh('torus', this.material('#e6af73', { emissive: '#c48552', emissiveIntensity: .25 }), x, i * .8, z, 1.22, 1.22, .8);
          ring.rotation.x = Math.PI / 2;
        }
      }
    }
    // Low fence rails establish the garden perimeter without obscuring a ball.
    if (!moon && !lava) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? b.minX - 7.5 : b.maxX + 7.5;
        this.mesh('box', '#bda37a', x, -.17, this.center.z, .12, .12, b.maxZ - b.minZ + 5);
        this.mesh('box', '#bda37a', x, .34, this.center.z, .12, .12, b.maxZ - b.minZ + 5);
        for (let z = b.minZ - 2; z < b.maxZ + 3; z += 4) this.mesh('box', '#ae946b', x, -.2, z, .22, 1.7, .22);
      }
    }
  }

  tree(x, z, size, style) {
    this.mesh('cylinder', '#80674b', x, -.2 + size, z, .17 * size, 2 * size, .17 * size);
    this.shadow(x, z, 3.3 * size, 2.7 * size, -1.01);
    if (style === 2) {
      for (let i = 0; i < 3; i++) this.mesh('cone', ['#55754e', '#668557', '#789767'][i], x, 1 + size * (1 + i * .5), z, size * (1.25 - i * .24), size * 1.6, size * (1.25 - i * .24));
    } else {
      this.mesh('sphere', style ? '#789253' : '#5d815c', x, 1.1 + 1.4 * size, z, size * 1.25, size * 1.5, size * 1.2);
      this.mesh('sphere', style ? '#879c60' : '#6d9269', x + size * .6, 1.0 + 1.2 * size, z + .3, size * .8, size, size * .8);
    }
  }

  createBall(player) {
    const group = new THREE.Group(); this.ballGroup.add(group);
    const hex = player.color || '#f2d373';
    const sphere = this.mesh('sphere', this.material(hex, { roughness: .28, metalness: .02 }), 0, 0, 0, .22, .22, .22, group);
    const stripe = this.mesh('torus', '#fff5d8', 0, 0, 0, .212, .212, .212, group);
    stripe.rotation.x = Math.PI / 2;
    const mark = this.mesh('sphere', '#f9f2de', 0, .19, 0, .07, .025, .07, group);
    mark.castShadow = false;
    const shadow = this.shadow(0, 0, .85, .7, .019, this.ballGroup);
    const halo = this.mesh('torus', this.material(hex, { transparent: true, opacity: .75, emissive: hex, emissiveIntensity: .14 }), 0, .03, 0, .52, .52, .52, this.ballGroup);
    halo.rotation.x = Math.PI / 2; halo.castShadow = false;
    const beacon = this.mesh('cone', this.material('#fff4cf', { emissive: '#6d674b' }), 0, 1.1, 0, .13, .27, .13, this.ballGroup);
    beacon.rotation.z = Math.PI;
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    const trailMaterial = new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: .32, depthWrite: false });
    const trail = new THREE.Line(trailGeometry, trailMaterial); this.ballGroup.add(trail);
    const item = { group, sphere, stripe, shadow, halo, beacon, trail, trailGeometry, trailMaterial, history: [], position: new THREE.Vector3(), initialized: false, color: hex };
    this.balls.set(player.id, item); return item;
  }

  fitSpan() {
    if (!this.hole) return 34;
    const b = this.hole.bounds;
    const width = b.maxX - b.minX + 3;
    const depth = b.maxZ - b.minZ + 3;
    const aspect = Math.max(.45, this.width / Math.max(1, this.height));
    const yaw = this.orbit;
    const projectedWidth = Math.abs(Math.cos(yaw)) * width + Math.abs(Math.sin(yaw)) * depth;
    const projectedHeight = (Math.abs(Math.sin(yaw)) * width + Math.abs(Math.cos(yaw)) * depth) * .77 + 3;
    return Math.max(projectedHeight * 1.15, projectedWidth / aspect * 1.18, 17);
  }

  updateCamera(snapshot, view, dt) {
    if (!this.hole) return;
    const overview = view.overview ?? this.cameraMode === 'overview';
    const player = snapshot?.players?.find(p => p.id === view.playerId);
    const fullSpan = this.fitSpan();
    let targetSpan = fullSpan;
    this.desiredTarget.set(this.center.x, 0, this.center.z);
    if (!overview && player?.ball && !player.ball.holed && snapshot?.phase === 'playing') {
      const b = player.ball, cup = this.hole.cup;
      const z = b.z * .72 + cup.z * .28;
      const x = b.x * .72 + cup.x * .28;
      this.desiredTarget.set(this.center.x * .32 + x * .68, 0, this.center.z * .32 + z * .68);
      targetSpan = Math.max(fullSpan * .76, 18);
    }
    const blend = view.reducedMotion ? 1 : 1 - Math.exp(-dt * 4.2);
    this.target.lerp(this.desiredTarget, blend);
    this.cameraSpan += (targetSpan - this.cameraSpan) * blend;
    const horizontal = 25;
    this.cameraOffset.set(Math.sin(this.orbit) * horizontal, 31, Math.cos(this.orbit) * horizontal);
    this.camera.position.copy(this.target).add(this.cameraOffset);
    this.camera.lookAt(this.target);
    const aspect = this.width / Math.max(1, this.height);
    const menuX = view.menu && this.width > 800 ? -this.cameraSpan * aspect * .23 : 0;
    const menuY = view.menu && this.width <= 580 ? -this.cameraSpan * .22 : 0;
    this.camera.left = -this.cameraSpan * aspect / 2 + menuX;
    this.camera.right = this.cameraSpan * aspect / 2 + menuX;
    this.camera.top = this.cameraSpan / 2 + menuY;
    this.camera.bottom = -this.cameraSpan / 2 + menuY;
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }

  render(snapshot, view = {}, dt = 1 / 60) {
    if (!this.hole || this.contextLost) return;
    this.resize();
    const time = Number(snapshot?.time) || 0;
    const reset = this.lastTime === undefined || time < this.lastTime || Math.abs(time - this.lastTime) > 2;
    this.lastTime = time;
    this.updateCamera(snapshot, view, Math.max(0, Math.min(.1, dt)));
    for (const item of this.obstacleMeshes) {
      const pose = obstaclePose(item.definition, time);
      item.group.position.set(pose.x, 0, pose.z); item.group.rotation.y = -pose.angle;
    }
    for (const { mesh, type, zone } of this.animations) {
      if (type === 'fan') mesh.rotation.z = time * 5;
      if (type === 'water') mesh.position.x = Math.sin(time * .6 + zone.z) * .12;
    }
    for (const ring of this.portalMeshes) {
      ring.material.emissiveIntensity = .5 + Math.sin(time * 2.4) * .22;
    }
    if (!view.reducedMotion) for (const flag of this.flags) {
      const attribute = flag.geometry.attributes.position, original = flag.userData.origin;
      for (let i = 0; i < attribute.count; i++) {
        const x = original[i * 3];
        attribute.setZ(i, Math.sin(time * 3 + x * 5) * .075 * (x + .425));
      }
      attribute.needsUpdate = true;
    }
    const activeIds = new Set();
    for (const player of snapshot?.players || []) {
      if (!player.ball) continue;
      activeIds.add(player.id);
      const item = this.balls.get(player.id) || this.createBall(player);
      const b = player.ball;
      const target = new THREE.Vector3(b.x, b.holed ? -.19 : Math.max(.22, b.y || .22), b.z);
      const distance = item.position.distanceTo(target);
      if (reset || !item.initialized || distance > 4.5 || !b.moving) {
        item.position.copy(target); if (reset || distance > 4.5) item.history = [];
      } else item.position.lerp(target, 1 - Math.exp(-Math.max(.001, dt) * 24));
      item.initialized = true;
      item.group.visible = !b.holed;
      item.group.position.copy(item.position);
      item.sphere.rotation.x += (b.vz || 0) * dt / .22; item.sphere.rotation.z -= (b.vx || 0) * dt / .22;
      item.stripe.rotation.z += (b.vx || 0) * dt / .22;
      item.shadow.visible = !b.holed;
      item.shadow.position.set(item.position.x, .019, item.position.z);
      const shadowScale = 1 + Math.max(0, item.position.y - .22) * .15;
      item.shadow.scale.set(.85 * shadowScale, .7 * shadowScale, 1);
      const mine = player.id === view.playerId;
      // Identical tee positions are fair; draw the watched ball last at equal depth.
      item.group.renderOrder = mine ? 10 : 0;
      item.halo.visible = !b.holed;
      item.halo.position.set(item.position.x, .045, item.position.z);
      const haloScale = mine ? .53 : .36; item.halo.scale.setScalar(haloScale);
      item.beacon.visible = mine && !b.holed && !b.moving && snapshot.phase === 'playing';
      item.beacon.position.set(item.position.x, 1.02 + (view.reducedMotion ? 0 : Math.sin(time * 3) * .06), item.position.z);
      if (b.moving && !view.reducedMotion) {
        item.history.unshift(item.position.clone()); item.history.length = Math.min(14, item.history.length);
      } else if (item.history.length) item.history.pop();
      const positions = item.trailGeometry.attributes.position;
      item.trail.visible = item.history.length > 1;
      for (let i = 0; i < 14; i++) {
        const point = item.history[Math.min(i, item.history.length - 1)] || item.position;
        positions.setXYZ(i, point.x, Math.max(.06, point.y - .08), point.z);
      }
      positions.needsUpdate = true; item.trailGeometry.computeBoundingSphere();
    }
    for (const [id, item] of this.balls) if (!activeIds.has(id)) {
      item.group.visible = item.shadow.visible = item.halo.visible = item.beacon.visible = item.trail.visible = false;
    }
    const local = snapshot?.players?.find(player => player.id === view.playerId);
    this.aim.visible = Boolean(local?.ball && !local.ball.moving && !local.ball.holed && snapshot.phase === 'playing' && view.aiming !== false);
    if (this.aim.visible) {
      const b = local.ball, angle = Number(view.angle) || 0, power = clamp(Number(view.power) || .4, .05, 1);
      const length = 1.8 + power * 10, dx = Math.sin(angle), dz = -Math.cos(angle);
      const count = Math.floor(8 + power * 16);
      this.aimDots.forEach((dot, i) => {
        dot.visible = i < count;
        const distance = .55 + i / Math.max(1, count - 1) * (length - .55);
        dot.position.set(b.x + dx * distance, .12, b.z + dz * distance);
        dot.scale.setScalar(.055 + .025 * i / count);
      });
      this.aimRing.position.set(b.x + dx * length, .075, b.z + dz * length);
      this.aimArrow.position.set(b.x + dx * (length + .18), .12, b.z + dz * (length + .18));
      this.aimArrow.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx, 0, dz));
    }
    this.gl.render(this.scene, this.camera);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.6 : 1.8));
    this.gl.setSize(width, height, false);
    this.gl.shadowMap.enabled = width >= 650;
    if (this.hole) this.updateCamera(null, { overview: true, reducedMotion: true }, 1);
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.ndc.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(GROUND, point) ? { x: point.x, z: point.z } : null;
  }

  setCamera(mode) { this.cameraMode = mode; }
  rotate(delta) { this.orbit = clamp(this.orbit + delta, -.7, .7); }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    for (const resource of this.local) resource.dispose?.();
    for (const material of this.commonMaterials.values()) material.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    for (const ball of this.balls.values()) { ball.trailGeometry.dispose(); ball.trailMaterial.dispose(); }
    this.shadowTexture.dispose(); this.shadowMaterial.dispose(); this.gl.dispose();
  }
}
