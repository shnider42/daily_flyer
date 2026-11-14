import * as THREE from './vendor/three.module.js';
import { TABLE, predictAim } from './engine.mjs';
import { CanvasPoolRenderer } from './fallback-renderer.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const FELT_PLANE = new THREE.Plane(UP, 0);
const BALL_COLORS = ['#eee9d9', '#efbd24', '#2460b2', '#ba3631', '#6e438e', '#e47926', '#206647', '#782f37', '#151917'];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;

function random(seed) {
  let n = seed >>> 0;
  return () => { n = Math.imul(n, 1664525) + 1013904223 >>> 0; return n / 4294967296; };
}

function texture(width, height, paint) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}

function ballTexture(number) {
  return texture(512, 256, (ctx, w, h) => {
    const color = BALL_COLORS[number > 8 ? number - 8 : number];
    ctx.fillStyle = number > 8 || !number ? '#f4efdc' : color; ctx.fillRect(0, 0, w, h);
    if (number > 8) { ctx.fillStyle = color; ctx.fillRect(0, h * .29, w, h * .42); }
    if (!number) {
      // A restrained six-dot cue ball gives rolling and spin a visible reference.
      ctx.fillStyle = '#934537';
      for (const [x, y] of [[.25, .5], [.75, .5], [.0, .5], [.5, .5], [.5, .15], [.5, .85]]) {
        ctx.beginPath(); ctx.arc(w * x, h * y, 3.6, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    for (const u of [.25, .75]) {
      // A 2:1 equirectangular map has equal angular pixel spacing at the equator.
      ctx.beginPath(); ctx.arc(w * u, h / 2, 42, 0, Math.PI * 2);
      ctx.fillStyle = '#f7f2df'; ctx.fill();
      ctx.fillStyle = '#151a17'; ctx.font = '700 53px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(w * u, h / 2 + 2); ctx.scale(.76, 1); ctx.fillText(String(number), 0, 0); ctx.restore();
    }
  });
}

/** Presentation only. The shared engine owns all contacts, pockets and rules. */
export class PoolRenderer {
  constructor(canvas, { renderer = null } = {}) {
    this.canvas = canvas; this.kind = 'webgl'; this.view = 'table'; this.width = 0; this.height = 0;
    this.time = 0; this.lastShot = null; this.lastGame = null; this.strikeTime = -10;
    this.resources = new Set(); this.materials = new Map(); this.balls = new Map(); this.pocketMarkers = []; this.pocketLabels = [];
    this.gl = renderer || new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping; this.gl.toneMappingExposure = 1.13;
    this.gl.shadowMap.enabled = true; this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#181c19');
    this.scene.fog = new THREE.Fog('#181c19', 7, 16);
    this.camera = new THREE.OrthographicCamera(-2, 2, 1.5, -1.5, .05, 30);
    this.raycaster = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.geometries = {
      box: new THREE.BoxGeometry(1, 1, 1), plane: new THREE.PlaneGeometry(1, 1),
      ball: new THREE.SphereGeometry(TABLE.radius, 32, 24),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 32),
      ring: new THREE.RingGeometry(.86, 1, 48),
      torus: new THREE.TorusGeometry(1, .045, 8, 48),
    };
    Object.values(this.geometries).forEach(resource => this.resources.add(resource));
    this._makeTextures(); this._makeLights(); this._makeTable(); this._makeBalls(); this._makeGuides(); this._makeCue();
    this.contextLost = false;
    this._onLost = event => {
      event.preventDefault(); this.contextLost = true;
      this.canvas.dispatchEvent(new CustomEvent('pool-renderer-lost', { bubbles: true }));
    };
    this._onRestored = () => { this.contextLost = false; this.resize(true); };
    canvas.addEventListener?.('webglcontextlost', this._onLost);
    canvas.addEventListener?.('webglcontextrestored', this._onRestored);
    this.resize();
  }

  material(color, extra = {}) {
    const key = String(color) + JSON.stringify(extra);
    if (!this.materials.has(key)) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .02, ...extra });
      this.materials.set(key, mat); this.resources.add(mat);
    }
    return this.materials.get(key);
  }

  mesh(geometry, material, x, y, z, sx = 1, sy = 1, sz = 1, parent = this.world) {
    const mesh = new THREE.Mesh(this.geometries[geometry] || geometry, typeof material === 'string' ? this.material(material) : material);
    mesh.position.set(x || 0, y || 0, z || 0); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  _makeTextures() {
    const rng = random(48019);
    this.feltTexture = texture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#166d56'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 21000; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(238,255,210,.035)' : 'rgba(0,18,12,.08)';
        ctx.fillRect(rng() * w, rng() * h, .6, .6 + rng() * 1.8);
      }
    });
    this.feltTexture.wrapS = this.feltTexture.wrapT = THREE.RepeatWrapping;
    this.feltTexture.repeat.set(5, 2.5);
    this.woodTexture = texture(1024, 128, (ctx, w, h) => {
      ctx.fillStyle = '#543621'; ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        const tone = Math.sin(y * .29) * .07 + rng() * .09;
        ctx.strokeStyle = tone > 0 ? `rgba(196,133,65,${tone})` : `rgba(17,9,4,${-tone})`;
        ctx.lineWidth = .3 + rng() * 1.8; ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const wave = Math.sin(x * .012 + y * .12) * (1 + Math.sin(y * .3));
          if (!x) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
      }
    });
    this.woodTexture.wrapS = this.woodTexture.wrapT = THREE.RepeatWrapping;
    this.floorTexture = texture(1024, 1024, (ctx, w, h) => {
      ctx.fillStyle = '#30271e'; ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 16; row++) {
        const shade = 36 + Math.floor(rng() * 12);
        ctx.fillStyle = `rgb(${shade + 13},${shade + 4},${shade - 5})`;
        ctx.fillRect(0, row * 64 + 1, w, 62);
        for (let j = 0; j < 25; j++) {
          ctx.strokeStyle = `rgba(126,92,59,${rng() * .13})`; ctx.lineWidth = .5;
          ctx.beginPath(); ctx.moveTo(0, row * 64 + rng() * 63);
          ctx.bezierCurveTo(280, row * 64 + rng() * 63, 690, row * 64 + rng() * 63, w, row * 64 + rng() * 63); ctx.stroke();
        }
        for (let x = (row % 3) * 114; x < w; x += 342) {
          ctx.fillStyle = '#1f1d17'; ctx.fillRect(x, row * 64, 1.5, 64);
        }
      }
    });
    this.floorTexture.wrapS = this.floorTexture.wrapT = THREE.RepeatWrapping; this.floorTexture.repeat.set(3, 3);
    this.shadowTexture = texture(64, 64, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(0,10,5,.56)'); grad.addColorStop(.42, 'rgba(0,10,5,.25)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    });
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false });
    [this.feltTexture, this.woodTexture, this.floorTexture, this.shadowTexture, this.shadowMaterial].forEach(r => this.resources.add(r));
    for (const map of [this.feltTexture, this.woodTexture, this.floorTexture]) map.anisotropy = Math.min(8, this.gl.capabilities?.getMaxAnisotropy?.() || 1);
  }

  _makeLights() {
    this.scene.add(new THREE.HemisphereLight('#e5edda', '#402b20', 2));
    this.key = new THREE.DirectionalLight('#ffedd0', 3.1); this.key.position.set(-.9, 3.7, 1.1);
    this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, { left: -2.1, right: 2.1, top: 1.8, bottom: -1.8, near: .2, far: 8 });
    this.key.shadow.normalBias = .0015; this.key.shadow.bias = -.0003; this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target);
    const fill = new THREE.DirectionalLight('#b6d4e2', .95); fill.position.set(1.8, 2.1, -2.3); this.scene.add(fill);
    const rim = new THREE.DirectionalLight('#caa67b', .7); rim.position.set(-2, .6, -2.8); this.scene.add(rim);
    // A tiny cubemap supplies the broad rectangular reflections of table lamps.
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const face = document.createElement('canvas'); face.width = face.height = 128;
      const ctx = face.getContext('2d'); ctx.fillStyle = i === 2 ? '#807b62' : '#272c26'; ctx.fillRect(0, 0, 128, 128);
      if (i === 2 || i === 4 || i === 0) {
        const grad = ctx.createLinearGradient(0, 16, 0, 76); grad.addColorStop(0, '#373c30'); grad.addColorStop(.35, '#fff7d6'); grad.addColorStop(.7, '#fff7d6'); grad.addColorStop(1, '#373c30');
        ctx.fillStyle = grad; ctx.fillRect(27, 16, 74, 60);
      }
      faces.push(face);
    }
    const env = new THREE.CubeTexture(faces); env.colorSpace = THREE.SRGBColorSpace; env.needsUpdate = true;
    this.resources.add(env); this.scene.environment = env;
  }

  _makeTable() {
    const { halfW: w, halfH: h } = TABLE;
    const wood = new THREE.MeshStandardMaterial({ map: this.woodTexture, color: '#dfb99b', roughness: .32, metalness: .04 }); this.resources.add(wood);
    const darkWood = this.material('#36271e', { roughness: .42 });
    const brass = this.material('#ab8c51', { roughness: .26, metalness: .72 });
    const floorMat = new THREE.MeshStandardMaterial({ map: this.floorTexture, roughness: .88 }); this.resources.add(floorMat);
    const floor = this.mesh('plane', floorMat, 0, -.76, 0, 16, 16); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    const groundShadow = this.mesh('plane', this.shadowMaterial, 0, -.749, .015, 3.8, 2.5); groundShadow.rotation.x = -Math.PI / 2; groundShadow.castShadow = false;
    this.mesh('box', darkWood, 0, -.17, 0, 2 * w + .30, .28, 2 * h + .30);
    this.mesh('box', wood, 0, -.085, 0, 2 * w + .34, .12, 2 * h + .34);
    this.mesh('box', '#171e18', 0, -.023, 0, 2 * w + .06, .045, 2 * h + .06);
    const feltMat = new THREE.MeshStandardMaterial({ map: this.feltTexture, roughness: 1, metalness: 0 }); this.resources.add(feltMat);
    const felt = this.mesh('plane', feltMat, 0, 0, 0, 2 * w + .025, 2 * h + .025);
    felt.rotation.x = -Math.PI / 2; felt.castShadow = false;
    for (const side of [-1, 1]) {
      for (const center of [-(w + .03) / 2, (w + .03) / 2]) this.mesh('box', wood, center, .012, side * (h + .087), w - .018, .075, .147);
      this.mesh('box', wood, side * (w + .087), .012, 0, .147, .075, 2 * h - .03);
      // Brass line below the polished rail, repeated on the visible end faces.
      this.mesh('box', brass, 0, -.060, side * (h + .166), 2 * w + .30, .006, .004);
      this.mesh('box', brass, side * (w + .166), -.060, 0, .004, .006, 2 * h + .30);
      for (const x of [-.9525, -.635, -.3175, .3175, .635, .9525]) this._diamond(x, side * (h + .094));
      for (const z of [-.3175, 0, .3175]) this._diamond(side * (w + .094), z);
    }
    for (const rail of TABLE.rails || this._defaultRails()) this._cushion(rail, feltMat);
    for (const p of TABLE.pockets) {
      const isCorner = Math.abs(p.x) > .01;
      const pocket = new THREE.Group(); pocket.position.set(p.x, 0, p.z); this.world.add(pocket);
      // The black opening masks the cloth and makes the drop legible at any angle.
      const cup = this.mesh('cylinder', '#090d0a', 0, .005, 0, TABLE.pocketRadius + .006, .012, TABLE.pocketRadius + .006, pocket); cup.castShadow = false;
      const lip = this.mesh('torus', this.material(isCorner ? '#564536' : '#594933', { roughness: .45 }), 0, .014, 0, TABLE.pocketRadius + .009, TABLE.pocketRadius + .009, TABLE.pocketRadius + .009, pocket);
      lip.rotation.x = Math.PI / 2; lip.castShadow = false;
      const lining = this.mesh('torus', brass, 0, .010, 0, TABLE.pocketRadius + .014, TABLE.pocketRadius + .014, TABLE.pocketRadius + .014, pocket); lining.rotation.x = Math.PI / 2; lining.scale.z = (TABLE.pocketRadius + .014) * .36; lining.castShadow = false;
      const markerMaterial = new THREE.MeshBasicMaterial({ color: '#efcf76', transparent: true, opacity: .9, depthWrite: false }); this.resources.add(markerMaterial);
      const marker = this.mesh('ring', markerMaterial, p.x, .058, p.z, .103, .103, .103);
      marker.rotation.x = -Math.PI / 2; marker.castShadow = false; marker.visible = false; this.pocketMarkers.push(marker);
      const labelTexture = texture(128, 128, (ctx, tw, th) => {
        ctx.beginPath(); ctx.arc(tw / 2, th / 2, 58, 0, Math.PI * 2);
        ctx.fillStyle = '#18231b'; ctx.fill(); ctx.strokeStyle = '#d2bd7a'; ctx.lineWidth = 5; ctx.stroke();
        ctx.font = '700 76px Arial, sans-serif'; ctx.fillStyle = '#f3e4b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.id + 1), tw / 2, th / 2 + 3);
      });
      const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false, depthTest: false });
      this.resources.add(labelTexture); this.resources.add(labelMaterial);
      const label = new THREE.Sprite(labelMaterial);
      label.position.set(p.x ? p.x - Math.sign(p.x) * .12 : 0, .075, p.z - Math.sign(p.z) * (p.x ? .12 : .17));
      label.visible = false; label.renderOrder = 6; this.world.add(label); this.pocketLabels.push(label);
    }
    for (const x of [-.93, .93]) for (const z of [-.43, .43]) {
      this.mesh('cylinder', darkWood, x, -.48, z, .095, .57, .095);
      this.mesh('cylinder', brass, x, -.705, z, .101, .025, .101);
      this.mesh('cylinder', '#1d211b', x, -.732, z, .112, .025, .112);
    }
    // Useful physical details, kept beyond the playing surface.
    this.mesh('box', '#346e82', -.64, .067, -h - .092, .038, .026, .038);
    this.mesh('box', '#d8d6ba', -.64, .081, -h - .092, .031, .003, .031);
    this.mesh('box', '#3a737e', -.64, .084, -h - .092, .023, .002, .023);
    const plaqueMap = texture(512, 96, (ctx, pw, ph) => {
      ctx.fillStyle = '#8c7549'; ctx.fillRect(0, 0, pw, ph);
      ctx.strokeStyle = '#cfb16b'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, pw - 16, ph - 16);
      ctx.fillStyle = '#231e13'; ctx.font = '600 35px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CORNER POCKET', pw / 2, ph / 2 + 1);
    }); this.resources.add(plaqueMap);
    const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueMap, roughness: .3, metalness: .35 }); this.resources.add(plaqueMat);
    const plaque = this.mesh('plane', plaqueMat, 0, -.136, h + .154, .37, .069, 1); plaque.castShadow = false;
    // A spare cue and wood triangle rest on the floor, outside the table silhouette.
    this._floorCue(-1.72, -.744, -.65, 1.34, .1);
    const triangle = new THREE.Group(); triangle.position.set(1.77, -.738, .4); triangle.rotation.y = -.3; this.world.add(triangle);
    const trianglePts = [[-.15, .09], [.15, .09], [0, -.17]];
    for (let i = 0; i < 3; i++) {
      const a = trianglePts[i], b = trianglePts[(i + 1) % 3], dx = b[0] - a[0], dz = b[1] - a[1];
      const beam = this.mesh('box', wood, (a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2, Math.hypot(dx, dz), .025, .012, triangle); beam.rotation.y = -Math.atan2(dz, dx);
    }
    // Head-string markings are deliberately quiet and do not obscure the balls.
    const dotMat = this.material('#d1d4a7', { roughness: 1 });
    for (const x of [-w / 2, w / 2]) {
      const dot = this.mesh('cylinder', dotMat, x, .001, 0, .0035, .0015, .0035); dot.castShadow = false;
    }
  }

  _defaultRails() {
    const { halfW: w, halfH: h } = TABLE, c = TABLE.cornerMouth || .095, s = TABLE.sideMouth || .086;
    return [-1, 1].flatMap(sign => [
      { a: { x: -w + c, z: sign * h }, b: { x: -s, z: sign * h } },
      { a: { x: s, z: sign * h }, b: { x: w - c, z: sign * h } },
      { a: { x: sign * w, z: -h + c }, b: { x: sign * w, z: h - c } },
    ]);
  }

  _cushion(rail, mat) {
    const a = rail.a, b = rail.b, length = Math.hypot(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const nx = Math.abs(mx) > TABLE.halfW - .01 ? Math.sign(mx) : 0;
    const nz = nx ? 0 : Math.sign(mz);
    // The cloth-facing nose is on the exact finite collision segment.
    const geometry = new THREE.BufferGeometry();
    const profile = [[0, .018], [.022, .044], [.069, .040], [.069, .007]];
    const positions = [];
    const va = profile.map(([out, y]) => [a.x + nx * out, y, a.z + nz * out]);
    const vb = profile.map(([out, y]) => [b.x + nx * out, y, b.z + nz * out]);
    const tri = (p, q, r) => positions.push(...p, ...q, ...r);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; tri(va[i], vb[i], vb[j]); tri(va[i], vb[j], va[j]); }
    tri(va[0], va[2], va[1]); tri(va[0], va[3], va[2]); tri(vb[0], vb[1], vb[2]); tri(vb[0], vb[2], vb[3]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); this.resources.add(geometry);
    const cushionMat = this.material('#17634d', { roughness: .96, side: THREE.DoubleSide });
    this.mesh(geometry, cushionMat, 0, 0, 0);
    const seam = this.mesh('box', '#245c45', mx + nx * .066, .044, mz + nz * .066, length, .002, .004); seam.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); seam.castShadow = false;
  }

  _diamond(x, z) {
    const d = this.mesh('box', this.material('#dfd2a4', { roughness: .38 }), x, .051, z, .013, .002, .013); d.rotation.y = Math.PI / 4; d.castShadow = false;
  }

  _floorCue(x, y, z, length, angle) {
    const cue = this.mesh('cylinder', '#ac8856', x, y, z, .005, length, .005); cue.rotation.z = Math.PI / 2; cue.rotation.y = angle;
  }

  _makeBalls() {
    for (let id = 0; id <= 15; id++) {
      const map = ballTexture(id); this.resources.add(map);
      const material = new THREE.MeshPhysicalMaterial({ map, color: '#ffffff', roughness: .16, metalness: 0, clearcoat: .75, clearcoatRoughness: .12, envMapIntensity: .7 }); this.resources.add(material);
      const mesh = this.mesh('ball', material, 0, TABLE.radius, 0); mesh.rotation.x = -Math.PI / 2; mesh.visible = false;
      const shadow = this.mesh('plane', this.shadowMaterial, 0, .002, 0, TABLE.radius * 3.1, TABLE.radius * 3.1, 1); shadow.rotation.x = -Math.PI / 2; shadow.visible = false; shadow.castShadow = false;
      this.balls.set(id, { mesh, shadow, last: null, dropping: false, dropAge: 0 });
    }
  }

  _makeGuides() {
    this.guides = new THREE.Group(); this.scene.add(this.guides);
    const white = new THREE.LineDashedMaterial({ color: '#f1f0d8', transparent: true, opacity: .7, dashSize: .023, gapSize: .016 }); this.resources.add(white);
    const gold = new THREE.LineBasicMaterial({ color: '#f1cb79', transparent: true, opacity: .8 }); this.resources.add(gold);
    const pale = new THREE.LineBasicMaterial({ color: '#e0e7d1', transparent: true, opacity: .48 }); this.resources.add(pale);
    const makeLine = mat => {
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); this.resources.add(geom);
      const line = new THREE.Line(geom, mat); line.frustumCulled = false; this.guides.add(line); return line;
    };
    this.aimLine = makeLine(white); this.objectLine = makeLine(gold); this.deflectLine = makeLine(pale);
    this.ghostMaterial = new THREE.MeshBasicMaterial({ color: '#fbf0c9', transparent: true, opacity: .65, depthWrite: false }); this.resources.add(this.ghostMaterial);
    this.ghost = this.mesh('torus', this.ghostMaterial, 0, .006, 0, TABLE.radius, TABLE.radius, TABLE.radius, this.guides); this.ghost.rotation.x = Math.PI / 2; this.ghost.castShadow = false;
    this.placeMat = new THREE.MeshBasicMaterial({ color: '#b3d7a0', transparent: true, opacity: .35, depthWrite: false }); this.resources.add(this.placeMat);
    this.placement = this.mesh('ball', this.placeMat, 0, TABLE.radius, 0); this.placement.visible = false; this.placement.castShadow = false;
    this.placementRing = this.mesh('torus', this.placeMat, 0, .004, 0, TABLE.radius * 1.25, TABLE.radius * 1.25, TABLE.radius * 1.25); this.placementRing.rotation.x = Math.PI / 2; this.placementRing.visible = false; this.placementRing.castShadow = false;
  }

  _makeCue() {
    this.cue = new THREE.Group(); this.scene.add(this.cue);
    // Group local +Y points towards the butt; rotate +Y to the reverse aim.
    const shaftGeometry = new THREE.CylinderGeometry(.010, .0048, .86, 20); this.resources.add(shaftGeometry);
    this.mesh(shaftGeometry, this.material('#d9ba7a', { roughness: .32 }), 0, .43, 0, 1, 1, 1, this.cue);
    this.mesh('cylinder', '#e9dfbb', 0, -.008, 0, .0049, .016, .0049, this.cue);
    this.mesh('cylinder', '#4c878c', 0, -.02, 0, .0051, .008, .0051, this.cue);
    this.mesh('cylinder', '#36281e', 0, .75, 0, .0105, .30, .0105, this.cue);
    for (let i = 0; i < 13; i++) this.mesh('cylinder', '#625748', 0, .62 + i * .017, 0, .0106, .002, .0106, this.cue);
    this.mesh('cylinder', this.material('#b1a58d', { roughness: .28, metalness: .55 }), 0, .58, 0, .0098, .014, .0098, this.cue);
  }

  setView(view) { const next = view === 'overhead' ? 'overhead' : 'table'; if (this.view !== next) { this.view = next; this.resize(true); } }

  resize(force = false) {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || this.canvas.clientWidth || 960), height = Math.max(1, rect.height || this.canvas.clientHeight || 560);
    if (!force && width === this.width && height === this.height) return;
    this.width = width; this.height = height; this.portrait = width / height < .92;
    const level = this.quality === 'low' ? 2 : this.quality === 'high' ? 0 : this.autoQualityLevel || 0;
    const dpr = Math.min(finite(globalThis.devicePixelRatio ?? globalThis.window?.devicePixelRatio, 1), [1.7, 1.25, 1][level]);
    this.gl.setPixelRatio(dpr); this.gl.setSize(width, height, false);
    this.gl.shadowMap.enabled = level < 2;
    const shadowSize = level ? 512 : 1024;
    if (this._shadowSize !== shadowSize) {
      this._shadowSize = shadowSize; this.key.shadow.mapSize.set(shadowSize, shadowSize);
      this.key.shadow.map?.dispose(); this.key.shadow.map = null;
    }
    const overhead = this.view === 'overhead';
    if (this.portrait) { this.camera.position.set(overhead ? .0001 : 3.4, 5.0, 0); this.camera.up.set(1, 0, 0); }
    else { this.camera.position.set(0, 5, overhead ? .0001 : 3.5); this.camera.up.set(0, 0, -1); }
    this.camera.lookAt(0, -.07, 0); this.camera.updateMatrixWorld(true);
    // Fit the entire rail outline, in both orientations and both camera modes.
    const inv = this.camera.matrixWorldInverse;
    let maxX = 0, maxY = 0;
    for (const x of [-TABLE.halfW - .20, TABLE.halfW + .20]) for (const z of [-TABLE.halfH - .20, TABLE.halfH + .20]) for (const y of [-.22, .07]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv); maxX = Math.max(maxX, Math.abs(p.x)); maxY = Math.max(maxY, Math.abs(p.y));
    }
    const aspect = width / height, halfHeight = Math.max(maxY, maxX / aspect) * 1.055;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight; this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
    this.camera.updateProjectionMatrix();
  }

  screenToTable(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return null;
    this.ndc.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const point = this.raycaster.ray.intersectPlane(FELT_PLANE, new THREE.Vector3());
    return point && Number.isFinite(point.x) && Number.isFinite(point.z) ? { x: point.x, z: point.z } : null;
  }

  _line(line, start, end, y = .006) {
    line.visible = Boolean(start && end && [start.x, start.z, end.x, end.z].every(Number.isFinite));
    if (!line.visible) return;
    const positions = line.geometry.attributes.position;
    positions.setXYZ(0, start.x, y, start.z); positions.setXYZ(1, end.x, y, end.z); positions.needsUpdate = true;
    line.geometry.computeBoundingSphere(); line.computeLineDistances();
  }

  _adaptQuality(dt) {
    if (this.quality && this.quality !== 'auto') return;
    this.frameAverage = (this.frameAverage || dt) * .96 + dt * .04;
    this.qualitySampleTime = (this.qualitySampleTime || 0) + dt;
    this.qualitySampleCount = (this.qualitySampleCount || 0) + 1;
    if (this.qualitySampleCount < 90 || this.qualitySampleTime < 3) return;
    // Stable 30 Hz displays keep their detail. Only sustained slower frames
    // reduce quality, once per observation window; a single tab wake never does.
    if (this.frameAverage > .037 && (this.autoQualityLevel || 0) < 2) {
      this.autoQualityLevel = (this.autoQualityLevel || 0) + 1;
      this.qualitySampleTime = this.qualitySampleCount = 0; this.resize(true);
    } else if (this.qualitySampleTime > 6) this.qualitySampleTime = this.qualitySampleCount = 0;
  }

  render(state, options = {}, dt = 1 / 60) {
    if (!state || this.contextLost) return;
    dt = clamp(finite(dt, 1 / 60), 0, .06); this.time += dt;
    if (options.view) this.setView(options.view);
    if (options.quality && options.quality !== this.quality) { this.quality = options.quality; this.resize(true); }
    this._adaptQuality(dt);
    this.resize();
    const newRack = this.lastGame !== state.id;
    if (newRack) { this.lastGame = state.id; this.lastShot = state.shotNumber; this.balls.forEach(b => { b.last = null; b.dropping = false; }); }
    if (this.lastShot !== state.shotNumber) { this.lastShot = state.shotNumber; this.strikeTime = this.time; }
    for (const ball of state.balls || []) {
      const item = this.balls.get(ball.id); if (!item || !Number.isFinite(ball.x) || !Number.isFinite(ball.z)) continue;
      const { mesh, shadow } = item;
      if (!ball.pocketed) {
        if (item.last && !item.last.pocketed) {
          const dx = ball.x - item.last.x, dz = ball.z - item.last.z, distance = Math.hypot(dx, dz);
          if (distance > 1e-7 && distance < .35) {
            const axis = new THREE.Vector3(dz / distance, 0, -dx / distance);
            mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, distance / TABLE.radius));
          }
        } else if (newRack || !item.last) mesh.rotation.set(-Math.PI / 2, 0, (ball.id % 3 - 1) * .18);
        item.dropping = false; mesh.visible = true; mesh.position.set(ball.x, TABLE.radius, ball.z); mesh.scale.setScalar(1);
        shadow.visible = true; shadow.position.set(ball.x + .006, .002, ball.z - .003);
      } else {
        if (item.last && !item.last.pocketed) { item.dropping = true; item.dropAge = 0; item.dropX = item.last.x; item.dropZ = item.last.z; }
        if (item.dropping) {
          item.dropAge += dt; const t = Math.min(1, item.dropAge / .32);
          const pocket = TABLE.pockets.reduce((best, p) => Math.hypot(p.x - ball.x, p.z - ball.z) < Math.hypot(best.x - ball.x, best.z - ball.z) ? p : best);
          mesh.position.set(item.dropX + (pocket.x - item.dropX) * t, TABLE.radius * (1 - t) - .10 * t * t, item.dropZ + (pocket.z - item.dropZ) * t);
          mesh.scale.setScalar(1 - t * .45); mesh.visible = t < .65; if (t >= 1) item.dropping = false;
        } else mesh.visible = false;
        shadow.visible = false;
      }
      item.last = { x: ball.x, z: ball.z, pocketed: ball.pocketed };
    }
    const cueBall = state.balls?.find(ball => ball.id === 0);
    const aiming = state.phase === 'aiming' && cueBall && !cueBall.pocketed;
    const canGuide = aiming && options.showGuide !== false && !options.placement;
    this.guides.visible = Boolean(canGuide);
    if (canGuide) {
      const guide = predictAim(state, finite(options.aim));
      this._line(this.aimLine, guide.start, guide.end);
      const hit = state.balls.find(ball => ball.id === guide.hitId);
      this._line(this.objectLine, hit || guide.ghost, guide.objectEnd);
      this._line(this.deflectLine, guide.ghost, guide.cueEnd);
      this.ghost.visible = Boolean(guide.ghost);
      if (guide.ghost) this.ghost.position.set(guide.ghost.x, .007, guide.ghost.z);
    }
    const strikeAge = this.time - this.strikeTime;
    const striking = state.phase === 'rolling' && strikeAge < .18 && this.lastCue;
    const showCue = (aiming || striking) && options.showCue !== false && !options.placement;
    this.cue.visible = Boolean(showCue);
    if (showCue) {
      if (aiming) this.lastCue = { x: cueBall.x, z: cueBall.z, angle: finite(options.aim), power: clamp(finite(options.power, .5), 0, 1) };
      const { x, z, angle, power } = this.lastCue;
      const pull = striking ? .025 + power * .09 - Math.sin(Math.min(1, strikeAge / .18) * Math.PI) * (.023 + power * .09) : .025 + power * .09 + Math.sin(this.time * 1.6) * .003;
      this.cue.position.set(x - Math.cos(angle) * (TABLE.radius + pull), TABLE.radius + .008, z - Math.sin(angle) * (TABLE.radius + pull));
      this.cue.quaternion.setFromUnitVectors(UP, new THREE.Vector3(-Math.cos(angle), .035, -Math.sin(angle)).normalize());
    }
    this.placement.visible = this.placementRing.visible = Boolean(options.placement && state.ballInHand);
    if (this.placement.visible) {
      const p = options.placement; this.placement.position.set(p.x, TABLE.radius, p.z); this.placementRing.position.set(p.x, .006, p.z);
      this.placeMat.color.set(p.valid ? '#b7e0a2' : '#e77d68');
    }
    for (let i = 0; i < this.pocketMarkers.length; i++) {
      const marker = this.pocketMarkers[i], called = options.calledPocket === i;
      marker.visible = Boolean(called || options.selectingPocket);
      marker.material.opacity = called ? .92 : .34 + Math.sin(this.time * 3 + i) * .08;
      marker.material.color.set(called ? '#f7d783' : '#e8edce');
      marker.scale.setScalar(called ? .103 + Math.sin(this.time * 3) * .002 : .091);
      const label = this.pocketLabels[i]; label.visible = marker.visible;
      label.material.opacity = called ? 1 : .85;
      label.scale.setScalar((this.camera.top - this.camera.bottom) / this.height * (this.width < 500 ? 19 : 21));
    }
    this.gl.render(this.scene, this.camera);
  }

  dispose() {
    this.canvas.removeEventListener?.('webglcontextlost', this._onLost); this.canvas.removeEventListener?.('webglcontextrestored', this._onRestored);
    for (const resource of this.resources) resource.dispose?.(); this.resources.clear(); this.gl.dispose?.();
  }
}

/**
 * Retain the original input element when a live WebGL context is lost. A second
 * canvas supplies the pixels only; pointer events, capture and focus continue
 * to belong to the original element and its already-installed app listeners.
 */
class ResilientPoolRenderer {
  constructor(renderer) {
    this.active = renderer; this.canvas = renderer.canvas; this.overlay = null;
    this._lost = () => this._useCanvas('The graphics context was lost.');
    this.canvas.addEventListener('pool-renderer-lost', this._lost);
  }

  get kind() { return this.active.kind; }
  get view() { return this.active.view; }
  get contextLost() { return this.active.contextLost || false; }

  _syncOverlay() {
    if (!this.overlay) return;
    const rect = this.canvas.getBoundingClientRect();
    const style = this.overlay.style;
    const next = { left: `${this.canvas.offsetLeft || 0}px`, top: `${this.canvas.offsetTop || 0}px`, width: `${rect.width}px`, height: `${rect.height}px` };
    // The original canvas remains in normal flow. This also follows the menu's
    // calc(100% - 310px) width and margin without modifying either CSS rule.
    for (const [key, value] of Object.entries(next)) if (style[key] !== value) style[key] = value;
    const opacity = globalThis.getComputedStyle?.(this.canvas)?.opacity || '1';
    if (style.opacity !== opacity) style.opacity = opacity;
  }

  _useCanvas(reason) {
    if (this.overlay || this.active.kind === 'canvas') return;
    const overlay = document.createElement('canvas');
    overlay.setAttribute('aria-hidden', 'true'); overlay.setAttribute('role', 'presentation');
    Object.assign(overlay.style, { position: 'absolute', pointerEvents: 'none', display: 'block', margin: '0', padding: '0', border: '0', zIndex: '0' });
    if (!this.canvas.parentNode) return;
    this.canvas.parentNode.insertBefore(overlay, this.canvas.nextSibling);
    this.overlay = overlay; this._syncOverlay();
    let fallback;
    try { fallback = new CanvasPoolRenderer(overlay); }
    catch (error) {
      overlay.remove(); this.overlay = null;
      this.canvas.dispatchEvent(new CustomEvent('pool-renderer-error', { bubbles: true, detail: { message: error.message } }));
      return;
    }
    const view = this.active.view;
    this.active.dispose(); this.active = fallback; this.active.setView(view);
    this.fallbackReason = reason;
    this.previousFilter = this.canvas.style.filter;
    // Opacity filtering preserves pointer hit-testing. Leaving CSS opacity
    // untouched lets the drawing layer mirror responsive menu opacity.
    this.canvas.style.filter = 'opacity(0)';
    if (this.lastState) this.active.render(this.lastState, this.lastOptions, this.lastDelta);
    this.canvas.dispatchEvent(new CustomEvent('pool-renderer-fallback', { bubbles: true, detail: { reason } }));
  }

  setView(view) { this.active.setView(view); }
  resize() { this._syncOverlay(); this.active.resize(); }
  screenToTable(x, y) { this._syncOverlay(); this.active.resize(); return this.active.screenToTable(x, y); }
  render(state, options, dt) {
    this.lastState = state; this.lastOptions = options; this.lastDelta = dt;
    this._syncOverlay(); this.active.render(state, options, dt);
  }
  dispose() {
    this.canvas.removeEventListener('pool-renderer-lost', this._lost); this.active.dispose();
    if (this.overlay) { this.overlay.remove(); this.canvas.style.filter = this.previousFilter || ''; this.overlay = null; }
  }
}

/** Initial failures may replace the canvas before the app installs listeners. */
export function createRenderer(canvas, options) {
  try { return new ResilientPoolRenderer(new PoolRenderer(canvas, options)); }
  catch (error) {
    const replacement = canvas.cloneNode?.(false);
    if (replacement && canvas.parentNode) { canvas.replaceWith(replacement); canvas = replacement; }
    const fallback = new CanvasPoolRenderer(canvas); fallback.fallbackReason = error?.message || 'WebGL unavailable'; return fallback;
  }
}
