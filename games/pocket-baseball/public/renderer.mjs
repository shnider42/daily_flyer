import * as THREE from './vendor/three.module.js';
import { BASES, fieldRadius, STRIKE_ZONE, AIM_AREA } from './engine.mjs';

// The simulation uses +x toward first base. Mirror x in the view so first base
// appears on the right from behind home, without changing authoritative state.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const COLORS = { dirt: 0xb88258, chalk: 0xf1ebd6, wall: 0x173d35,
  home: 0xf0e7cf, homeCap: 0x173d35, away: 0xb5403e, awayCap: 0x1b2f45 };

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

function fieldTexture() {
  return canvasTexture(2048, 2048, (c, w) => {
    const scale = w / 360, px = x => (x + 180) * scale, pz = z => (z + 135) * scale;
    c.fillStyle = '#355f3e'; c.fillRect(0, 0, w, w);
    for (let z = -130; z < 225; z += 12) {
      c.fillStyle = (Math.round(z / 12) & 1) ? '#416f47' : '#4a7950';
      c.fillRect(0, pz(z), w, 12 * scale);
    }
    const path = (points, fill) => {
      c.beginPath(); points.forEach(([x, z], i) => i ? c.lineTo(px(x), pz(z)) : c.moveTo(px(x), pz(z)));
      c.closePath(); c.fillStyle = fill; c.fill();
    };
    // Warning track and fence share the same radius function as ball physics.
    const outer = [], inner = [];
    for (let i = 0; i <= 90; i++) {
      const a = -Math.PI / 4 + i / 90 * Math.PI / 2;
      outer.push([Math.sin(a) * fieldRadius(a), Math.cos(a) * fieldRadius(a)]);
      inner.unshift([Math.sin(a) * (fieldRadius(a) - 4.2), Math.cos(a) * (fieldRadius(a) - 4.2)]);
    }
    path([...outer, ...inner], '#b2926a');
    // Skin infield with a grass diamond, individual dirt circles and paths.
    c.beginPath(); c.arc(px(0), pz(0), 32 * scale, Math.PI / 4, Math.PI * .75);
    c.lineTo(px(0), pz(-2)); c.closePath(); c.fillStyle = '#b98459'; c.fill();
    path([[-22, 22], [0, 44], [22, 22], [0, -3]], '#b98459');
    path([[-14.9, 21.2], [0, 35.8], [14.9, 21.2], [0, 6.4]], '#477548');
    const disc = (x, z, r, color) => {
      c.beginPath(); c.arc(px(x), pz(z), r * scale, 0, TAU); c.fillStyle = color; c.fill();
    };
    disc(0, 0, 4.2, '#b98459'); disc(0, 18.44, 2.9, '#b98459');
    for (const x of [-19.4, 19.4]) disc(x, 19.4, 2.3, '#b98459');
    disc(0, 38.8, 2.3, '#b98459');
    c.strokeStyle = '#efe7cb'; c.lineWidth = .10 * scale;
    for (const sign of [-1, 1]) {
      c.beginPath(); c.moveTo(px(sign * .25), pz(-.25));
      c.lineTo(px(sign * 82), pz(82)); c.stroke();
    }
    c.lineWidth = .06 * scale;
    for (const sign of [-1, 1]) c.strokeRect(px(sign < 0 ? -1.43 : .57), pz(-.65), .86 * scale, 1.8 * scale);
    // Deterministic subtle grain, generated once. It never swims with the camera.
    let seed = 38721;
    for (let i = 0; i < 28000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const x = seed % w;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const y = seed % w;
      c.fillStyle = i & 1 ? 'rgba(0,0,0,.028)' : 'rgba(255,255,230,.025)'; c.fillRect(x, y, 2, 2);
    }
  }).texture;
}

export class BallparkRenderer {
  constructor(canvas, { onContextLost = () => {} } = {}) {
    this.canvas = canvas; this.width = this.height = 0; this.quality = 'auto';
    this.touch = matchMedia('(pointer:coarse)').matches; this.frameAverage = 1 / 60;
    this.adaptiveScale = 1; this.frameCount = 0; this.menuTime = 0; this.lastTick = -1;
    this.models = new Map(); this.runnerModels = []; this.lastBoard = ''; this.wasMenu = true;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x354852);
    this.scene.fog = new THREE.Fog(0x43535a, 190, 430);
    this.camera = new THREE.PerspectiveCamera(51, 1, .075, 700);
    this.camera.position.set(82, 53, -31); this.look = V(0, 3, 38);
    this.targetCamera = V(); this.targetLook = V(); this.scratch = V();
    this.geometries = { box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 10, 8), cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
      plane: new THREE.PlaneGeometry(1, 1), disc: new THREE.CircleGeometry(1, 24) };
    this.materials = new Map();
    this.scene.add(new THREE.HemisphereLight(0xf4e3c4, 0x42503c, 2.5));
    const sun = new THREE.DirectionalLight(0xffd2a1, 2.6); sun.position.set(-60, 75, -20); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc8dfe8, .8); fill.position.set(30, 45, 70); this.scene.add(fill);
    this.buildSky(); this.buildField(); this.buildStadium(); this.buildActors(); this.buildGuides();
    this.onLost = event => { event.preventDefault(); this.contextLost = true; onContextLost(); };
    this.onRestored = () => { this.contextLost = false; this.resize(true); };
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.resize();
  }

  material(color, options = {}) {
    const key = `${color}:${JSON.stringify(options)}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshLambertMaterial({ color, ...options }));
    return this.materials.get(key);
  }
  mesh(type, color, x, y, z, sx = 1, sy = 1, sz = 1, parent = this.scene, options = {}) {
    const m = new THREE.Mesh(this.geometries[type], this.material(color, options));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
  }
  box(color, x, y, z, sx, sy, sz, parent) { return this.mesh('box', color, x, y, z, sx, sy, sz, parent); }
  segment(a, b, radius, color, parent = this.scene) {
    const delta = b.clone().sub(a), length = delta.length();
    const m = this.mesh('cylinder', color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2,
      radius, length, radius, parent);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize()); return m;
  }

  buildSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(540, 20, 14), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#16364d') }, horizon: { value: new THREE.Color('#d6ae8f') } },
      vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 p;uniform vec3 top;uniform vec3 horizon;void main(){float t=smoothstep(-.05,.65,normalize(p).y);gl_FragColor=vec4(mix(horizon,top,t),1.);}'
    }));
    this.scene.add(sky);
    const sun = new THREE.Mesh(this.geometries.sphere, new THREE.MeshBasicMaterial({ color: 0xffd2a0 }));
    sun.position.set(-205, 48, 255); sun.scale.setScalar(12); this.scene.add(sun);
    // A quiet industrial skyline gives this original ballpark a local identity.
    for (let i = 0; i < 33; i++) {
      const x = -235 + i * 14, h = 9 + ((i * 29) % 33), z = 180 + (i % 5) * 10;
      this.box(i % 3 ? 0x3e5558 : 0x495b5c, x, h / 2, z, 11 + (i % 4) * 2, h, 15);
      if (i % 4 === 0) this.box(0x2d464b, x + 2, h + 4, z, 2, 8, 2);
    }
  }

  buildField() {
    const field = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), new THREE.MeshLambertMaterial({ map: fieldTexture() }));
    field.rotation.x = -Math.PI / 2; field.position.set(0, -.025, 45); this.scene.add(field);
    const mound = this.mesh('cylinder', 0xb8865d, 0, .10, 18.44, 2.7, .22, 2.7);
    this.box(COLORS.chalk, 0, .235, 18.44, .61, .035, .15);
    for (const p of [[19.4, 19.4], [0, 38.8], [-19.4, 19.4]]) {
      const base = this.box(COLORS.chalk, p[0], .07, p[1], .46, .14, .46); base.rotation.y = Math.PI / 4;
    }
    const homeShape = new THREE.Shape(); homeShape.moveTo(-.215, .215); homeShape.lineTo(.215, .215);
    homeShape.lineTo(.215, 0); homeShape.lineTo(0, -.215); homeShape.lineTo(-.215, 0); homeShape.closePath();
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(homeShape), this.material(COLORS.chalk));
    plate.rotation.x = -Math.PI / 2; plate.position.y = .012; this.scene.add(plate);
    // Outfield padding is actual geometry at the simulation boundary, 3.2m high.
    for (let i = 0; i < 48; i++) {
      const a = -Math.PI / 4 + i / 48 * Math.PI / 2, b = -Math.PI / 4 + (i + 1) / 48 * Math.PI / 2;
      const p = V(Math.sin(a) * fieldRadius(a), 0, Math.cos(a) * fieldRadius(a));
      const q = V(Math.sin(b) * fieldRadius(b), 0, Math.cos(b) * fieldRadius(b));
      const wall = this.box(i % 2 ? 0x204b3d : 0x244f40, (p.x + q.x) / 2, 1.6, (p.z + q.z) / 2, p.distanceTo(q) + .08, 3.2, .6);
      wall.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      this.segment(p.clone().setY(3.24), q.clone().setY(3.24), .065, 0xd3ab62);
    }
    for (const sign of [-1, 1]) {
      const a = sign * Math.PI / 4, r = fieldRadius(a), x = Math.sin(a) * r, z = Math.cos(a) * r;
      this.mesh('cylinder', 0xd9b453, x, 8.2, z, .16, 16.4, .16);
      for (let i = 0; i < 9; i++) this.box(0xcdaa52, x - sign * .65, 8.3 + i * .9, z, 1.2, .04, .06);
      // Dugout walls and benches sit beyond the chalk, clear of live plays.
      const d = new THREE.Group(); d.position.set(sign * 28, 0, 13); d.rotation.y = sign * .66; this.scene.add(d);
      this.box(0x294b40, 0, 1.0, 0, 16, 2, .4, d);
      this.box(0x1e3832, 0, 2.1, -1.5, 16.5, .2, 3.5, d);
      this.box(0x8c7652, 0, .5, -.7, 14, .18, .5, d);
    }
  }

  standRadius(a) {
    const t = Math.abs(a);
    if (t <= Math.PI / 4) return fieldRadius(a) + 5;
    return mix(110, 36, clamp((t - Math.PI / 4) / (Math.PI * .53), 0, 1));
  }

  buildStadium() {
    const positions = [], colors = [];
    const vertex = (x, y, z, color) => { positions.push(x, y, z); colors.push(color.r, color.g, color.b); };
    const quad = (p, q, r, s, color) => { [p, q, r, p, r, s].forEach(v => vertex(...v, color)); };
    for (let seg = 0; seg < 100; seg++) {
      const a = -Math.PI + seg / 100 * TAU, b = -Math.PI + (seg + 1) / 100 * TAU;
      for (let row = 0; row < 12; row++) {
        const r0 = this.standRadius(a) + row * 1.15, r1 = this.standRadius(b) + row * 1.15;
        const y = 1.6 + row * .58;
        const color = new THREE.Color(row % 3 ? 0x3b514b : 0x536258);
        quad([Math.sin(a) * r0, y, Math.cos(a) * r0], [Math.sin(b) * r1, y, Math.cos(b) * r1],
          [Math.sin(b) * (r1 + 1.15), y, Math.cos(b) * (r1 + 1.15)], [Math.sin(a) * (r0 + 1.15), y, Math.cos(a) * (r0 + 1.15)], color);
        quad([Math.sin(a) * r0, y - .58, Math.cos(a) * r0], [Math.sin(b) * r1, y - .58, Math.cos(b) * r1],
          [Math.sin(b) * r1, y, Math.cos(b) * r1], [Math.sin(a) * r0, y, Math.cos(a) * r0], color);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // One instanced draw for a crowd: no individual spectator update loops.
    const count = 2300, crowd = new THREE.InstancedMesh(this.geometries.box, new THREE.MeshLambertMaterial(), count);
    const dummy = new THREE.Object3D(), palette = [0xb8ab93, 0x233c4b, 0x9c4944, 0xd1bd96, 0x55717a, 0x57705a];
    for (let i = 0; i < count; i++) {
      const a = -Math.PI + (i * .61803398875 % 1) * TAU, row = (i * 7) % 12;
      const r = this.standRadius(a) + row * 1.15 + .52;
      dummy.position.set(Math.sin(a) * r, 2.05 + row * .58, Math.cos(a) * r);
      dummy.scale.set(.44, .64 + (i % 3) * .07, .38); dummy.rotation.set(0, a, 0); dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix); crowd.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    }
    this.scene.add(crowd); this.crowd = crowd;
    for (const [x, z] of [[-93, 87], [93, 87], [-69, -12], [69, -12]]) {
      this.mesh('cylinder', 0x5f6964, x, 18, z, .36, 36, .36);
      this.box(0x465657, x, 35.8, z, 8.0, 3.2, .5);
      const lamps = new THREE.MeshBasicMaterial({ color: 0xfff1ca });
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(this.geometries.box, lamps); m.scale.set(.9, .8, .13);
        m.position.set(x - 3 + (i % 5) * 1.5, 35.15 + Math.floor(i / 5) * 1.3, z - .4); this.scene.add(m);
      }
      const glow = canvasTexture(64, 64, (c, w) => {
        const g = c.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255,236,177,.32)'); g.addColorStop(1, 'rgba(255,236,177,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w);
      }).texture;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.position.set(x, 35.8, z - .5); sprite.scale.set(19, 13, 1); this.scene.add(sprite);
    }
    this.box(0x263c39, 0, 11.5, 122, 31, 14, 1.8);
    this.box(0xdecda6, 0, 18.7, 122, 32, .6, 2);
    this.board = canvasTexture(1024, 400, () => {});
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(28.7, 11.2), new THREE.MeshBasicMaterial({ map: this.board.texture }));
    screen.position.set(0, 12, 120.95); screen.rotation.y = Math.PI; this.scene.add(screen);
    this.updateBoard(null);
    this.sign('HARBOR FIELD', 0, 21.1, 122, 32, 3.2, '#e5d6af', '#223e35');
    this.sign('EST. 2003', 43, 4.6, 105, 13, 2.8, '#e8d8ae', '#264b3c', .45);
    this.sign('DFE SPORTS', -43, 4.6, 105, 17, 2.8, '#d8cfb3', '#264b3c', -.45);
    for (let i = 0; i < 3; i++) {
      const x = -23 + i * 23;
      this.mesh('cylinder', 0xc4c8bc, x, 20, 139, .09, 15, .09);
      this.box([0xac4940, 0xe9dfc2, 0x254b69][i], x + 1.8, 26, 139, 3.5, 1.9, .04);
    }
  }

  sign(label, x, y, z, w, h, ink, bg, angle = 0) {
    const { texture } = canvasTexture(768, 128, c => {
      c.fillStyle = bg; c.fillRect(0, 0, 768, 128); c.fillStyle = ink;
      c.font = 'bold 72px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 384, 68);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    m.position.set(x, y, z); m.rotation.y = Math.PI + angle; this.scene.add(m); return m;
  }

  updateBoard(state) {
    const key = state ? `${state.score}/${state.hits}/${state.lineScore}/${state.inning}/${state.half}/${state.balls}/${state.strikes}/${state.outs}` : 'menu';
    if (key === this.lastBoard) return; this.lastBoard = key;
    const { ctx: c } = this.board; c.fillStyle = '#112c28'; c.fillRect(0, 0, 1024, 400);
    c.strokeStyle = '#bda975'; c.lineWidth = 4; c.strokeRect(16, 16, 992, 368);
    c.fillStyle = '#e4d3a1'; c.font = 'bold 40px Georgia'; c.textAlign = 'center'; c.fillText('HARBOR FIELD', 512, 73);
    c.font = '26px monospace'; c.fillStyle = '#94a78b'; c.fillText('1  2  3  4  5  6  7  8  9    R  H', 623, 126);
    c.textAlign = 'left'; c.fillStyle = '#f0dfae'; c.font = 'bold 35px monospace';
    for (let side = 0; side < 2; side++) {
      const y = 193 + side * 64; c.fillText(side ? 'FOUNDRY' : 'HARBOR', 46, y);
      c.font = '32px monospace';
      for (let i = 0; i < 9; i++) c.fillText(String(state?.lineScore?.[side]?.[i] ?? '·'), 332 + i * 52, y);
      c.fillText(String(state?.score?.[side] ?? 0), 848, y); c.fillText(String(state?.hits?.[side] ?? 0), 926, y);
      c.font = 'bold 35px monospace';
    }
    c.fillStyle = '#d6ae67'; c.font = '30px monospace'; c.textAlign = 'center';
    c.fillText(state ? `BALL ${state.balls}    STRIKE ${state.strikes}    OUT ${state.outs}` : 'GOOD EVENING, BASEBALL.', 512, 338);
    this.board.texture.needsUpdate = true;
  }

  player(home, number = 1, bat = false) {
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const jersey = home ? COLORS.home : COLORS.away, cap = home ? COLORS.homeCap : COLORS.awayCap;
    const skin = [0xc68e62, 0x986444, 0xd6aa80, 0xb57a51][number % 4];
    this.mesh('cylinder', jersey, 0, 1.23, 0, .245, .55, .17, body);
    this.box(cap, 0, .97, 0, .39, .06, .26, body);
    this.mesh('sphere', skin, 0, 1.65, .015, .142, .177, .14, body);
    this.mesh('sphere', cap, 0, 1.77, .008, .156, .078, .155, body);
    this.box(cap, 0, 1.755, .17, .27, .035, .16, body);
    const limbs = {};
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * .12, .94, 0); body.add(leg);
      this.mesh('cylinder', 0xdedbc9, 0, -.25, 0, .105, .5, .11, leg);
      this.mesh('cylinder', 0xdedbc9, 0, -.61, .015, .085, .28, .085, leg);
      this.mesh('cylinder', cap, 0, -.79, .015, .075, .13, .075, leg);
      this.box(0x27312e, 0, -.89, .085, .16, .12, .31, leg);
      limbs[side < 0 ? 'leftLeg' : 'rightLeg'] = leg;
      const arm = new THREE.Group(); arm.position.set(side * .235, 1.43, 0); body.add(arm);
      this.mesh('cylinder', jersey, 0, -.13, 0, .095, .26, .095, arm);
      this.mesh('cylinder', skin, 0, -.36, 0, .067, .24, .067, arm);
      this.mesh('sphere', skin, 0, -.49, 0, .074, .087, .074, arm);
      if (side === -1 && !bat) this.mesh('sphere', 0x9f693d, 0, -.49, .035, .14, .17, .09, arm);
      limbs[side < 0 ? 'leftArm' : 'rightArm'] = arm;
    }
    const shadow = new THREE.Mesh(this.geometries.disc, new THREE.MeshBasicMaterial({ color: 0x12251b, transparent: true, opacity: .22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .018; shadow.scale.set(.44, .35, 1); group.add(shadow);
    let batPivot;
    if (bat) {
      batPivot = new THREE.Group(); batPivot.position.set(-.10, 1.37, .10); body.add(batPivot);
      const wood = this.mesh('cylinder', 0xc39c60, 0, .47, 0, .045, .94, .045, batPivot);
      this.mesh('cylinder', 0x352e28, 0, .10, 0, .028, .28, .028, batPivot);
      batPivot.rotation.z = -.45; batPivot.rotation.x = -.30;
    }
    this.scene.add(group);
    return { group, body, ...limbs, batPivot, lastX: null, lastZ: null };
  }

  buildActors() {
    this.batter = this.player(false, 17, true); this.batter.group.position.set(1.02, 0, -.04); this.batter.group.rotation.y = -Math.PI / 2;
    this.catcher = this.player(true, 2); this.catcher.group.position.set(0, -.35, -1.35); this.catcher.group.scale.setScalar(.92);
    this.umpire = this.player(true, 1); this.umpire.group.position.set(0, 0, -2.05);
    this.umpire.body.children.filter(x => x.material?.color).forEach(m => m.material = this.material(0x3d4543));
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(.10, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff6dd })); this.scene.add(this.ball);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(.095, .008, 4, 18), new THREE.MeshBasicMaterial({ color: 0xad4939 })); this.ball.add(seam);
    this.ballShadow = new THREE.Mesh(this.geometries.disc, new THREE.MeshBasicMaterial({ color: 0x13251b, transparent: true, opacity: .3, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.position.y = .025; this.scene.add(this.ballShadow);
    this.trailData = new Float32Array(18 * 3); const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailData, 3)); trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xf9e7af, transparent: true, opacity: .32, depthWrite: false }));
    this.trail.frustumCulled = false; this.scene.add(this.trail); this.trailLength = 0;
  }

  buildGuides() {
    const zone = STRIKE_ZONE;
    const points = [V(-zone.left, zone.bottom, -.02), V(-zone.right, zone.bottom, -.02), V(-zone.right, zone.top, -.02), V(-zone.left, zone.top, -.02)];
    this.zone = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xf1e4be, transparent: true, opacity: .32, depthTest: false }));
    this.zone.renderOrder = 5; this.scene.add(this.zone);
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(.12, .136, 32), new THREE.MeshBasicMaterial({ color: 0xf4ce7b, transparent: true, opacity: .8, side: THREE.DoubleSide, depthTest: false }));
    this.aimRing.renderOrder = 6; this.scene.add(this.aimRing);
    this.aimCross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(-.18, 0, 0), V(-.09, 0, 0), V(.09, 0, 0), V(.18, 0, 0), V(0, -.18, 0), V(0, -.09, 0), V(0, .09, 0), V(0, .18, 0)]), new THREE.LineBasicMaterial({ color: 0xf7d994, transparent: true, opacity: .85, depthTest: false }));
    this.aimRing.add(this.aimCross);
    this.selection = new THREE.Mesh(new THREE.RingGeometry(.65, .74, 32), new THREE.MeshBasicMaterial({ color: 0xe9c672, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
    this.selection.rotation.x = -Math.PI / 2; this.scene.add(this.selection);
    this.ballMark = new THREE.Mesh(new THREE.RingGeometry(.47, .52, 24), new THREE.MeshBasicMaterial({ color: 0xf5e9bd, transparent: true, opacity: .48, side: THREE.DoubleSide, depthWrite: false }));
    this.ballMark.rotation.x = -Math.PI / 2; this.scene.add(this.ballMark);
  }

  setQuality(quality) { this.quality = ['low', 'high', 'auto'].includes(quality) ? quality : 'auto'; this.adaptiveScale = 1; this.resize(true); }
  resize(force = false) {
    const w = Math.max(1, this.canvas.clientWidth || innerWidth), h = Math.max(1, this.canvas.clientHeight || innerHeight);
    const cap = this.quality === 'low' ? .85 : this.quality === 'high' ? 2 : this.touch ? 1.25 : 1.5;
    const dpr = Math.min(devicePixelRatio || 1, cap) * (this.quality === 'auto' ? this.adaptiveScale : 1);
    // Avoid reallocating the WebGL drawing buffer every frame (Skyward lesson).
    if (force || w !== this.width || h !== this.height || Math.abs(dpr - (this.dpr || 0)) > .02) {
      this.width = w; this.height = h; this.dpr = dpr;
      this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
  }

  pose(model, x, z, time, moving = false, facing = 0) {
    model.group.position.set(x, 0, z); model.group.rotation.y = facing;
    const run = moving ? Math.sin(time * 13) * .65 : Math.sin(time * 1.8) * .015;
    model.leftLeg.rotation.x = run; model.rightLeg.rotation.x = -run;
    model.leftArm.rotation.x = -run * .65; model.rightArm.rotation.x = run * .65;
    model.body.position.y = moving ? Math.abs(Math.sin(time * 13)) * .045 : 0;
    model.lastX = x; model.lastZ = z;
  }

  render(state, dt = 1 / 60, options = {}) {
    if (this.contextLost) return;
    dt = clamp(Number.isFinite(dt) ? dt : 1 / 60, 0, .08); this.resize();
    this.frameAverage = mix(this.frameAverage, dt || 1 / 60, .02);
    if (this.quality === 'auto' && ++this.frameCount % 240 === 0) {
      const previous = this.adaptiveScale;
      if (this.frameAverage > .027) this.adaptiveScale = Math.max(.70, this.adaptiveScale - .1);
      else if (this.frameAverage < .019) this.adaptiveScale = Math.min(1, this.adaptiveScale + .05);
      if (previous !== this.adaptiveScale) this.resize(true);
    }
    const menu = Boolean(options.menu || !state), t = state?.time || 0;
    this.menuTime += dt;
    const phase = state?.phase || 'ready';
    const fielding = !menu && (phase === 'live' || (phase === 'result' && !!state?.play));
    const aim = options.aim || { x: 0, y: 0 }, guidance = options.guidance || state?.guidance || 'simple';
    if (menu) {
      const a = .5 + Math.sin(this.menuTime * .035) * .12;
      this.targetCamera.set(Math.sin(a) * 94, 42, -Math.cos(a) * 44);
      this.targetLook.set(-4, 2, 40);
    } else if (fielding) {
      const b = state.ball || { x: 0, y: 0, z: 40 };
      this.targetCamera.set(-b.x * .24, 25 + clamp(b.y * .25, 0, 13), -18 + clamp(b.z * .18, 0, 20));
      this.targetLook.set(-b.x * .65, Math.max(2, b.y * .38), Math.max(27, b.z * .68));
    } else {
      this.targetCamera.set(0, this.width / this.height < 1 ? 3.5 : 2.9, this.width / this.height < 1 ? -7.6 : -6.8);
      this.targetLook.set(0, 1.6, 16);
    }
    const ease = 1 - Math.exp(-dt * (menu ? 1.5 : fielding ? 5.5 : 7));
    // Starting a game settles immediately; subsequent baseball camera cuts ease.
    if (this.wasMenu && !menu) { this.camera.position.copy(this.targetCamera); this.look.copy(this.targetLook); }
    else { this.camera.position.lerp(this.targetCamera, ease); this.look.lerp(this.targetLook, ease); }
    const fov = menu ? 52 : fielding ? (this.width / this.height < 1 ? 71 : 58) : (this.width / this.height < .8 ? 61 : 51);
    this.camera.fov = mix(this.camera.fov, fov, ease); this.camera.updateProjectionMatrix(); this.camera.lookAt(this.look); this.wasMenu = menu;

    const fallback = [ ['P',0,18.44],['1B',19,21],['2B',12,35],['SS',-12,35],['3B',-21,21],['LF',-48,73],['CF',0,88],['RF',48,73] ];
    const fielders = state?.fielders?.length ? state.fielders : fallback.map(([role,x,z], id) => ({ id, role, x, z }));
    const homeDefense = !state || state.battingSide === 0;
    if (this.homeDefense !== homeDefense) {
      this.homeDefense = homeDefense;
      for (const model of this.models.values()) this.scene.remove(model.group); this.models.clear();
      this.scene.remove(this.batter.group); this.batter = this.player(!homeDefense, 17, true);
      this.batter.group.position.set(1.02, 0, -.04); this.batter.group.rotation.y = -Math.PI / 2;
      this.scene.remove(this.catcher.group); this.catcher = this.player(homeDefense, 2);
      this.catcher.group.position.set(0, -.35, -1.35); this.catcher.group.scale.setScalar(.92);
      for (const model of this.runnerModels) if (model) this.scene.remove(model.group);
      this.runnerModels = [];
    }
    const active = new Set();
    for (const p of fielders) {
      if (p.role === 'C' || p.role === 'catcher') continue;
      const id = String(p.id); active.add(id);
      if (!this.models.has(id)) this.models.set(id, this.player(homeDefense, this.models.size + 3));
      const model = this.models.get(id), x = -p.x, z = p.z;
      const moving = model.lastX != null && Math.hypot(x - model.lastX, z - model.lastZ) > .002;
      const direction = moving ? Math.atan2(x - model.lastX, z - model.lastZ) : Math.atan2(-x, -z);
      this.pose(model, x, z, t, moving, direction); model.group.visible = true;
      const pitcher = p.role === 'P' || p.role === 'pitcher';
      if (pitcher && phase === 'windup') {
        const u = clamp((state.phaseTime || 0) / .65, 0, 1);
        model.leftLeg.rotation.x = -Math.sin(u * Math.PI) * 1.1;
        model.rightArm.rotation.x = -Math.sin(u * Math.PI) * 2.7;
        model.body.rotation.y = Math.sin(u * Math.PI) * .6;
      } else { model.body.rotation.y = 0; }
    }
    for (const [id, model] of this.models) model.group.visible = active.has(id);

    const swingAge = state?.swing ? t - state.swing.time : 100;
    // Swing intent is the contact instant. Show impact immediately, then follow
    // through, instead of launching the ball 170ms before the visual bat arrives.
    const swing = swingAge >= 0 && swingAge < .5 ? Math.cos(clamp(swingAge / .5, 0, 1) * Math.PI / 2) : 0;
    this.batter.body.rotation.y = -swing * 1.9;
    this.batter.leftArm.rotation.x = -.55 - swing * .9; this.batter.rightArm.rotation.x = -.75 - swing * .7;
    this.batter.batPivot.rotation.set(-.30 - swing * 1.1, 0, -.45 - swing * 1.3);
    this.batter.group.visible = !fielding || (state?.phaseTime || 0) < .3;
    this.catcher.body.scale.y = .78; this.catcher.leftArm.rotation.x = -.75; this.catcher.rightArm.rotation.x = -.75;
    this.catcher.group.visible = !fielding; this.umpire.group.visible = !fielding;

    const runners = state?.runners || [];
    for (let i = 0; i < Math.max(runners.length, 4); i++) {
      const runner = runners[i];
      if (runner && !this.runnerModels[i]) this.runnerModels[i] = this.player(!homeDefense, 20 + i);
      const model = this.runnerModels[i]; if (!model) continue;
      model.group.visible = !!runner && (phase === 'live' || phase === 'result');
      if (runner) {
        const x = -(runner.x || 0), z = runner.z || 0;
        const direction = model.lastX != null ? Math.atan2(x - model.lastX, z - model.lastZ) : Math.PI / 4;
        this.pose(model, x, z, t + i, true, direction);
      }
    }
    const ball = state?.ball;
    this.ball.visible = !menu && !!ball?.visible;
    this.ballShadow.visible = this.ball.visible; this.ballMark.visible = this.ball.visible && fielding && guidance !== 'expert';
    if (ball) {
      const alpha = clamp(options.interpolationAlpha ?? 1, 0, 1);
      const x = mix(ball.prevX ?? ball.x, ball.x, alpha), y = mix(ball.prevY ?? ball.y, ball.y, alpha), z = mix(ball.prevZ ?? ball.z, ball.z, alpha);
      this.ball.position.set(-x, y, z); this.ball.rotation.set(t * 12, t * 16, t * 8);
      // A modest visual ball scale keeps it legible on a phone; physics radius is unchanged.
      this.ball.scale.setScalar(fielding ? clamp(this.camera.position.distanceTo(this.ball.position) / 45, 1.2, 3) : 1.15);
      this.ballShadow.position.set(-x, .028, z); this.ballShadow.scale.setScalar(.18 + Math.min(y, 20) * .018);
      this.ballMark.position.set(-x, .035, z);
      if (state.tick !== this.lastTick && this.ball.visible && ['pitch', 'live'].includes(phase)) {
        this.trailData.copyWithin(3, 0, 51); this.trailData[0] = -x; this.trailData[1] = y; this.trailData[2] = z;
        this.trailLength = Math.min(18, this.trailLength + 1);
        this.trail.geometry.attributes.position.needsUpdate = true; this.trail.geometry.setDrawRange(0, this.trailLength);
      }
    }
    if (!['pitch', 'live'].includes(phase)) this.trailLength = 0;
    this.trail.visible = !menu && this.ball.visible && this.trailLength > 1;
    this.lastTick = state?.tick;
    this.zone.visible = !menu && !fielding && guidance !== 'expert' && !['half', 'final'].includes(phase);
    this.aimRing.visible = !menu && !fielding && !['half', 'final', 'result'].includes(phase);
    this.aimRing.position.set(-(aim.x || 0) * AIM_AREA.x, AIM_AREA.centerY + (aim.y || 0) * AIM_AREA.y, -.045);
    const fielder = fielders.find(p => p.hasBall) || fielders.find(p => p.id === state?.play?.fielder);
    this.selection.visible = !menu && fielding && !!fielder;
    if (fielder) this.selection.position.set(-fielder.x, .035, fielder.z);
    if (!menu) this.updateBoard(state);
    this.renderer.render(this.scene, this.camera);
  }

  project(x, y, z) {
    const p = this.scratch.set(-x, y, z).project(this.camera);
    return { x: (p.x * .5 + .5) * this.width, y: (-p.y * .5 + .5) * this.height, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2 };
  }
  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost); this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { materials.add(m); if (m.map) textures.add(m.map); } });
    for (const t of textures) t.dispose(); for (const m of materials) m.dispose(); for (const g of geometries) g.dispose(); this.renderer.dispose();
  }
}
