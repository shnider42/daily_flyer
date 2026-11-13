import * as THREE from './vendor/three.module.js';
import { BASES, fieldRadius, STRIKE_ZONE, AIM_AREA, inStrikeZone } from './engine.mjs?v=0.2.0';

// The simulation uses +x toward first base. Mirror x in the view so first base
// appears on the right from behind home, without changing authoritative state.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const COLORS = { dirt: 0xb88258, chalk: 0xf1ebd6, wall: 0x173d35,
  home: 0xf0e7cf, homeCap: 0x173d35, away: 0xb5403e, awayCap: 0x1b2f45 };

// Both renderers sample the same joint poses. These are presentation values;
// they never move a runner, change a throw, or influence a collision result.
export function samplePlayerMotion(state, role, { moving = false, actor = {}, index = 0 } = {}) {
  const time = state?.time || 0, phase = state?.phase || 'ready', pitch = state?.pitch, play = state?.play;
  const p = { hipY: 0, lean: 0, twist: 0, head: 0, stride: 0,
    leftHip: .08, rightHip: .08, leftKnee: .12, rightKnee: .12,
    leftArm: -.12, rightArm: -.12, leftElbow: -.16, rightElbow: -.16,
    leftSpread: .08, rightSpread: -.08, bat: [-.25, 0, -.32], batVisible: role === 'batter', slide: 0 };
  if (moving) {
    const cycle = Math.sin(time * 15 + index * .73), opposite = Math.sin(time * 15 + index * .73 + Math.PI);
    p.hipY = Math.abs(cycle) * .045; p.lean = .13; p.stride = cycle;
    p.leftHip = cycle * .72; p.rightHip = -cycle * .72;
    p.leftKnee = .17 + Math.max(0, -cycle) * 1.05; p.rightKnee = .17 + Math.max(0, -opposite) * 1.05;
    p.leftArm = -.20 - cycle * .74; p.rightArm = -.20 + cycle * .74;
    p.leftElbow = p.rightElbow = -1.16;
  } else if (role === 'fielder') {
    p.hipY = -.065; p.lean = .10; p.leftHip = p.rightHip = -.12;
    p.leftKnee = p.rightKnee = .30; p.leftElbow = -.55; p.rightElbow = -.35;
  }
  if (role === 'pitcher' && pitch && ['windup', 'pitch'].includes(phase)) {
    const release = time - pitch.releaseAt;
    if (release < 0) {
      const u = clamp(1 + release / .65, 0, 1), lift = Math.sin(clamp(u / .62, 0, 1) * Math.PI / 2), drive = clamp((u - .55) / .45, 0, 1);
      p.leftHip = -1.35 * lift + drive * .65; p.leftKnee = 1.55 * lift * (1 - drive) + .22;
      p.rightHip = .10; p.rightKnee = .16; p.hipY = .055 * lift - drive * .09;
      p.lean = drive * .23; p.twist = -.58 * Math.sin(u * Math.PI);
      p.leftArm = -1.3 + drive * .6; p.leftElbow = -.9;
      p.rightArm = -.7 - u * 1.9; p.rightElbow = -1.35 + drive * .85; p.rightSpread = -.35 - drive * .25;
    } else if (release < .78) {
      const u = clamp(release / .37, 0, 1), recover = clamp((release - .37) / .41, 0, 1);
      p.rightArm = mix(-2.60 + u * 3.25, -.12, recover); p.rightElbow = mix(-.50 + u * .30, -.16, recover);
      p.leftArm = mix(-.65, -.12, recover); p.leftElbow = -.75 * (1 - recover);
      p.lean = Math.sin(u * Math.PI / 2) * .48 * (1 - recover); p.twist = .38 * (1 - recover);
      p.rightHip = .65 * Math.sin(u * Math.PI) * (1 - recover); p.rightKnee = .65 * (1 - recover) + .12;
      p.leftHip = -.18; p.leftKnee = .30; p.hipY = -.045 * (1 - recover);
    }
  }
  if (role === 'batter') {
    p.hipY = -.045; p.leftHip = -.16; p.rightHip = .12; p.leftKnee = .28; p.rightKnee = .22;
    p.leftArm = -1.05; p.rightArm = -1.42; p.leftElbow = -1.28; p.rightElbow = -1.38;
    p.leftSpread = -.10; p.rightSpread = .12; p.twist = -.17; p.head = -.22;
    const age = state?.swing ? time - state.swing.time : -1;
    if (age >= 0 && age < .72) {
      // Swing intent is impact, so the bat reaches the plate on that frame.
      const u = clamp(age / .42, 0, 1), recover = clamp((age - .42) / .30, 0, 1);
      p.twist = mix(u * 1.45, -.17, recover); p.lean = mix(.12, 0, recover);
      p.leftArm = mix(-1.5 + u * .65, -1.05, recover); p.rightArm = mix(-1.5 - u * .4, -1.42, recover);
      p.leftElbow = mix(-.12 - u * .9, -1.28, recover); p.rightElbow = mix(-.30 - u * 1.3, -1.38, recover);
      p.bat = [mix(1.48 - u * 1.35, -.25, recover), mix(-u * 1.3, 0, recover), mix(.08 - u * .75, -.32, recover)];
      p.rightHip = .24 + u * .16; p.rightKnee = .25; p.head = -.1;
    } else if (pitch && ['windup', 'pitch'].includes(phase)) {
      const load = clamp((time - (pitch.releaseAt - .4)) / .6, 0, 1);
      p.twist = -.17 - Math.sin(load * Math.PI) * .16; p.leftHip -= Math.sin(load * Math.PI) * .10;
    }
  }
  if (role === 'catcher' && !moving && phase !== 'live' && !(phase === 'result' && play)) {
    p.hipY = -.61; p.lean = .14; p.leftHip = p.rightHip = -1.85; p.leftKnee = p.rightKnee = 1.85;
    p.leftArm = -1.08; p.rightArm = -.8; p.leftElbow = -1.1; p.rightElbow = -1.3;
    p.leftSpread = .12; p.rightSpread = -.12;
    // Follow the visible ball only, never its undisclosed target.
    if (phase === 'pitch' && state?.ball?.z < 5) {
      p.leftSpread = clamp(-state.ball.x * .42, -.38, .38);
      p.leftArm -= clamp((state.ball.y - .9) * .3, -.22, .3);
    }
    if (phase === 'result' && !play) { p.leftArm = -.9; p.leftElbow = -1.5; }
  }
  if (play && actor.id === play.fielder && ['held', 'throw'].includes(play.stage)) {
    const thrown = play.stage === 'throw', age = thrown ? time - (play.throw?.startedAt ?? time - (play.throw?.elapsed || 0)) : time - (play.heldAt ?? time);
    if (play.throw?.kind !== 'carry') {
      const u = thrown ? clamp(age / .24, 0, 1) : clamp(age / .32, 0, 1);
      p.hipY = thrown ? -.02 : -.16 * (1 - u); p.lean = thrown ? .25 * Math.sin(u * Math.PI) : .25 * (1 - u);
      p.twist = thrown ? -.32 + u * .72 : -u * .32;
      p.leftArm = thrown ? -.85 + u * .5 : -1.25; p.leftElbow = -1.1;
      p.rightArm = thrown ? -2.4 + u * 2.9 : -.8 - u * 1.6;
      p.rightElbow = thrown ? -.45 + u * .25 : -1.25 + u * .8;
    }
  }
  if (role === 'runner' && (actor.sliding || (moving && actor.targetBase > 1 && actor.pathPosition < actor.targetBase && actor.pathPosition > actor.targetBase - .065))) {
    p.slide = 1; p.hipY = -.56; p.lean = -.95; p.leftHip = -1.2; p.rightHip = -.55;
    p.leftKnee = .06; p.rightKnee = 1.25; p.leftArm = .55; p.rightArm = .65; p.leftElbow = p.rightElbow = -.6;
  }
  return p;
}

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

  uniformMaterial(home, number, back = false) {
    this.uniformMaterials ||= new Map();
    const key = `${home}:${number}:${back}`;
    if (!this.uniformMaterials.has(key)) {
      const { texture } = canvasTexture(256, 256, c => {
        c.clearRect(0, 0, 256, 256); c.fillStyle = home ? '#1b4435' : '#f4e9ce'; c.textAlign = 'center';
        c.font = `bold ${back ? 35 : 36}px Georgia`; c.fillText(home ? 'FOUNDRY' : 'HARBOR', 128, 49);
        c.font = `bold ${back ? 154 : 125}px Arial`; c.fillText(String(number), 128, back ? 218 : 205);
      });
      this.uniformMaterials.set(key, new THREE.MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    }
    return this.uniformMaterials.get(key);
  }

  // Fold rigid colour details into one draw per joint. Faces, piping, cleats and
  // protective gear therefore do not each add another mobile draw call.
  batchRig(model) {
    this.rigMaterial ||= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false });
    model.ownedGeometries = [];
    const groups = []; model.body.traverse(o => { if (o.isGroup) groups.push(o); });
    for (const parent of groups) {
      const parts = parent.children.filter(o => o.isMesh && !o.material.map && !o.material.transparent);
      if (!parts.length) continue;
      const positions = [], normals = [], colors = [];
      for (const part of parts) {
        part.updateMatrix();
        const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        geometry.applyMatrix4(part.matrix);
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        positions.push(...geometry.attributes.position.array); normals.push(...geometry.attributes.normal.array);
        const colour = part.material.color;
        for (let i = 0; i < geometry.attributes.position.count; i++) colors.push(colour.r, colour.g, colour.b);
        parent.remove(part); geometry.dispose();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeBoundingSphere(); model.ownedGeometries.push(geometry);
      parent.add(new THREE.Mesh(geometry, this.rigMaterial));
    }
  }

  releaseModel(model) {
    if (!model) return;
    this.scene.remove(model.group); for (const geometry of model.ownedGeometries || []) geometry.dispose();
  }

  numberPlayer(model, number) {
    if (model.number === number) return;
    model.number = number;
    if (model.frontLabel) model.frontLabel.material = this.uniformMaterial(model.home, number, false);
    if (model.backLabel) model.backLabel.material = this.uniformMaterial(model.home, number, true);
  }

  player(home, number = 1, bat = false, role = 'fielder') {
    this.geometries.jersey ||= new THREE.CylinderGeometry(.255, .205, .50, 10);
    this.geometries.label ||= new THREE.PlaneGeometry(.35, .30);
    this.shadowMaterial ||= new THREE.MeshBasicMaterial({ color: 0x10271b, transparent: true, opacity: .23, depthWrite: false });
    const group = new THREE.Group(), body = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group();
    group.add(body); body.position.y = .93; body.add(torso); torso.add(head); head.position.set(0, .76, .015);
    const jersey = role === 'umpire' ? 0x38454b : home ? COLORS.home : COLORS.away;
    const cap = role === 'umpire' ? 0x263239 : home ? COLORS.homeCap : COLORS.awayCap;
    const skin = [0xc68e62, 0x986444, 0xd6aa80, 0xb57a51][number % 4], pants = home ? 0xe6dfcc : 0xd4d6d0;
    this.mesh('jersey', jersey, 0, .29, 0, 1, 1, .67, torso);
    this.mesh('sphere', pants, 0, .035, 0, .225, .135, .145, body);
    this.mesh('cylinder', cap, 0, .075, 0, .218, .055, .145, body);
    this.box(0xd4b578, 0, .08, .151, .06, .045, .018, body);
    // Collar, placket, sleeve bands and restrained pinstripes.
    this.mesh('cylinder', skin, 0, .61, .01, .067, .12, .065, torso);
    this.box(cap, 0, .52, .126, .14, .025, .022, torso);
    this.box(home ? 0xc0bca7 : 0x913a37, 0, .30, .173, .014, .40, .008, torso);
    for (let i = 0; i < 4; i++) this.mesh('sphere', home ? 0xb9af95 : 0xeadbc4, .017, .40 - i * .075, .18, .012, .012, .008, torso);
    if (home) for (const x of [-.14, -.075, .075, .14]) {
      this.box(0xc9c4af, x, .29, .158, .007, .40, .006, torso);
      this.box(0xc9c4af, x, .29, -.158, .007, .40, .006, torso);
    }
    this.mesh('sphere', skin, 0, 0, 0, .134, .167, .126, head);
    this.mesh('sphere', skin, -.135, -.007, -.005, .031, .052, .032, head);
    this.mesh('sphere', skin, .135, -.007, -.005, .031, .052, .032, head);
    this.mesh('sphere', skin, 0, -.018, .129, .031, .043, .043, head);
    this.box(0x4e382b, 0, -.083, .117, .048, .009, .012, head);
    for (const side of [-1, 1]) {
      this.box(0x382b23, side * .053, .029, .118, .026, .012, .012, head);
      this.box(0x322820, side * .053, .054, .110, .040, .010, .013, head);
    }
    this.mesh('sphere', cap, 0, .123, -.008, .148, .087, .148, head);
    this.box(cap, 0, .111, .144, .235, .022, .152, head);
    this.box(home ? 0xe6d9b7 : 0xe6d8be, 0, .16, .134, .04, .043, .008, head);
    const helmet = bat || role === 'runner' || role === 'catcher';
    if (helmet) {
      this.mesh('sphere', cap, -.135, .004, -.014, .035, .113, .115, head);
      if (role === 'catcher') this.mesh('sphere', cap, .135, .004, -.014, .035, .113, .115, head);
    }
    const limbs = {};
    for (const side of [-1, 1]) {
      // Anatomical right is local -x. Facing home places the throwing hand at
      // scene +x, matching the mirrored engine release at x=-0.32.
      const name = side < 0 ? 'right' : 'left';
      const leg = new THREE.Group(), shin = new THREE.Group(); leg.position.set(side * .125, 0, bat ? side * .06 : 0); body.add(leg);
      this.mesh('cylinder', pants, 0, -.205, 0, .113, .41, .115, leg);
      this.mesh('sphere', pants, 0, -.415, .008, .105, .10, .105, leg);
      shin.position.set(0, -.43, 0); leg.add(shin);
      this.mesh('cylinder', pants, 0, -.16, .005, .090, .32, .09, shin);
      this.mesh('cylinder', cap, 0, -.345, .005, .077, .09, .077, shin);
      this.box(0x26302e, 0, -.42, .078, .17, .11, .30, shin);
      this.box(0x848c81, 0, -.405, .12, .11, .018, .07, shin);
      this.box(0x151e1b, 0, -.476, .08, .17, .018, .29, shin);
      const arm = new THREE.Group(), forearm = new THREE.Group(), hand = new THREE.Group();
      arm.position.set(side * .255, .46, 0); torso.add(arm);
      this.mesh('cylinder', jersey, 0, -.10, 0, .10, .20, .10, arm);
      this.mesh('cylinder', cap, 0, -.19, 0, .101, .035, .101, arm);
      this.mesh('cylinder', skin, 0, -.245, 0, .071, .085, .071, arm);
      forearm.position.set(0, -.29, 0); arm.add(forearm);
      this.mesh('cylinder', skin, 0, -.12, 0, .066, .24, .065, forearm);
      if (bat || role === 'runner') this.mesh('cylinder', cap, 0, -.235, 0, .069, .055, .068, forearm);
      hand.position.set(0, -.285, 0); forearm.add(hand);
      this.mesh('sphere', bat ? 0xe8e5d7 : skin, 0, 0, .004, .067, .082, .060, hand);
      if (name === 'left' && !bat && role !== 'runner') {
        this.mesh('sphere', 0x8e5a30, 0, -.025, .045, .135, .165, .08, hand);
        this.mesh('sphere', 0xbc8853, 0, -.018, .092, .10, .125, .024, hand);
        for (let i = 0; i < 3; i++) this.box(0x6c4829, -.06 + i * .06, .015, .114, .013, .13, .014, hand);
      }
      if (role === 'catcher') {
        this.box(cap, 0, -.16, .091, .17, .30, .05, shin);
        this.mesh('sphere', cap, 0, -.405, .087, .13, .10, .09, leg);
      }
      Object.assign(limbs, { [`${name}Leg`]: leg, [`${name}Shin`]: shin, [`${name}Arm`]: arm, [`${name}Forearm`]: forearm, [`${name}Hand`]: hand });
    }
    if (role === 'catcher') {
      for (let i = 0; i < 5; i++) this.box(i % 2 ? cap : 0x324d41, 0, .16 + i * .068, .178, .34 - i * .014, .055, .046, torso);
      this.box(cap, 0, .48, .18, .27, .07, .04, torso);
      for (const x of [-.12, .12]) this.box(0xb5b5a2, x, -.015, .165, .013, .25, .018, head);
      for (const y of [-.105, -.035, .035, .105]) this.box(0xb9b7a4, 0, y, .17, .26, .012, .02, head);
    }
    const shadow = new THREE.Mesh(this.geometries.disc, this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .018; shadow.scale.set(.43, .34, 1); group.add(shadow);
    let batPivot;
    if (bat) {
      batPivot = new THREE.Group(); batPivot.position.set(-.015, .42, .27); torso.add(batPivot);
      this.mesh('cylinder', 0xc7a474, 0, .60, 0, .047, .66, .047, batPivot);
      this.mesh('cylinder', 0xb89461, 0, .23, 0, .031, .20, .031, batPivot);
      this.mesh('cylinder', 0x423a2c, 0, .105, 0, .024, .20, .024, batPivot);
      this.mesh('sphere', 0xc5a374, 0, -.005, 0, .035, .018, .035, batPivot);
    }
    const model = { group, body, torso, head, ...limbs, batPivot, home, number, role, lastX: null, lastZ: null, facing: 0, shadow };
    this.batchRig(model);
    if (role !== 'catcher' && role !== 'umpire') {
      model.frontLabel = new THREE.Mesh(this.geometries.label, this.uniformMaterial(home, number, false)); model.frontLabel.position.set(0, .30, .178); torso.add(model.frontLabel);
      model.backLabel = new THREE.Mesh(this.geometries.label, this.uniformMaterial(home, number, true)); model.backLabel.position.set(0, .30, -.174); model.backLabel.rotation.y = Math.PI; torso.add(model.backLabel);
    }
    model.heldBall = new THREE.Mesh(this.geometries.sphere, this.material(0xf6f0df));
    model.heldBall.scale.setScalar(.041); model.heldBall.position.set(0, -.025, .045); model.heldBall.visible = false; model.rightHand.add(model.heldBall);
    this.scene.add(group); return model;
  }

  buildActors() {
    this.batter = this.player(false, 1, true, 'batter'); this.batter.group.position.set(1.02, 0, -.04); this.batter.group.rotation.y = -Math.PI / 2;
    this.catcher = this.player(true, 2, false, 'catcher'); this.catcher.group.position.set(0, 0, -2.1);
    this.umpire = this.player(true, 1, false, 'umpire'); this.umpire.group.position.set(.55, 0, -2.75);
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
    this.zone = new THREE.Group();
    const corners = [], thirds = [], z = -.025, width = zone.right - zone.left, height = zone.top - zone.bottom;
    for (const [x, sx] of [[zone.left, 1], [zone.right, -1]]) for (const [y, sy] of [[zone.bottom, 1], [zone.top, -1]]) {
      corners.push(V(-x, y, z), V(-(x + sx * .095), y, z), V(-x, y, z), V(-x, y + sy * .13, z));
    }
    for (const f of [1 / 3, 2 / 3]) {
      const x = zone.left + width * f, y = zone.bottom + height * f;
      thirds.push(V(-x, zone.bottom, z), V(-x, zone.top, z), V(-zone.left, y, z), V(-zone.right, y, z));
    }
    const brackets = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: 0xfff1ce, transparent: true, opacity: .73, depthTest: false }));
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(thirds), new THREE.LineBasicMaterial({ color: 0xf4e8c9, transparent: true, opacity: .17, depthTest: false }));
    this.zone.add(brackets, grid); brackets.renderOrder = grid.renderOrder = 5; this.scene.add(this.zone);
    this.pitchMark = new THREE.Mesh(new THREE.RingGeometry(.043, .059, 24), new THREE.MeshBasicMaterial({ color: 0xf0bd75, transparent: true, opacity: .9, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    this.pitchMark.renderOrder = 7; this.pitchMark.visible = false; this.scene.add(this.pitchMark);
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(.077, .087, 24), new THREE.MeshBasicMaterial({ color: 0xf4ce7b, transparent: true, opacity: .88, side: THREE.DoubleSide, depthTest: false }));
    this.aimRing.renderOrder = 6; this.scene.add(this.aimRing);
    this.aimCross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(-.12, 0, 0), V(-.096, 0, 0), V(.096, 0, 0), V(.12, 0, 0), V(0, -.12, 0), V(0, -.096, 0), V(0, .096, 0), V(0, .12, 0)]), new THREE.LineBasicMaterial({ color: 0xf7d994, transparent: true, opacity: .85, depthTest: false }));
    this.aimRing.add(this.aimCross);
    this.selection = new THREE.Mesh(new THREE.RingGeometry(.65, .74, 32), new THREE.MeshBasicMaterial({ color: 0xe9c672, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
    this.selection.rotation.x = -Math.PI / 2; this.scene.add(this.selection);
    this.ballMark = new THREE.Mesh(new THREE.RingGeometry(.47, .52, 24), new THREE.MeshBasicMaterial({ color: 0xf5e9bd, transparent: true, opacity: .48, side: THREE.DoubleSide, depthWrite: false }));
    this.ballMark.rotation.x = -Math.PI / 2; this.scene.add(this.ballMark);
    this.runnerSelection = new THREE.Mesh(new THREE.RingGeometry(.43, .52, 24), new THREE.MeshBasicMaterial({ color: 0x89d9dc, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
    this.runnerSelection.rotation.x = -Math.PI / 2; this.runnerSelection.visible = false; this.scene.add(this.runnerSelection);
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

  pose(model, x, z, state, { moving = false, facing = model.facing || 0, role = model.role, actor = {}, index = 0 } = {}) {
    model.group.position.set(x, 0, z); model.group.rotation.y = facing; model.facing = facing;
    const p = samplePlayerMotion(state, role, { moving, actor, index });
    model.body.position.y = .93 + p.hipY; model.body.rotation.set(p.lean, 0, 0);
    model.torso.rotation.set(0, p.twist, 0); model.head.rotation.y = p.head;
    model.leftLeg.rotation.set(p.leftHip, 0, .035); model.rightLeg.rotation.set(p.rightHip, 0, -.035);
    model.leftShin.rotation.x = p.leftKnee; model.rightShin.rotation.x = p.rightKnee;
    model.leftArm.rotation.set(p.leftArm, 0, p.leftSpread); model.rightArm.rotation.set(p.rightArm, 0, p.rightSpread);
    model.leftForearm.rotation.x = p.leftElbow; model.rightForearm.rotation.x = p.rightElbow;
    if (model.batPivot) {
      model.batPivot.rotation.set(...p.bat); model.group.updateMatrixWorld(true);
      this.reachHand(model, 'right', model.batPivot.localToWorld(V(0, .055, 0)));
      this.reachHand(model, 'left', model.batPivot.localToWorld(V(0, .145, 0)));
    }
    model.shadow.scale.set(p.slide ? .8 : .43, p.slide ? .25 : .34, 1);
    model.lastX = x; model.lastZ = z; return p;
  }

  reachHand(model, side, target) {
    model.group.updateMatrixWorld(true);
    const arm = model[`${side}Arm`], forearm = model[`${side}Forearm`];
    const local = model.torso.worldToLocal(target.clone()).sub(arm.position), distance = clamp(local.length(), .04, .572);
    const direction = local.normalize(), plane = V(side === 'right' ? -1 : 1, .15, -.25);
    plane.addScaledVector(direction, -plane.dot(direction)).normalize();
    const cos = clamp((.29 * .29 + distance * distance - .285 * .285) / (2 * .29 * distance), -1, 1);
    const elbow = direction.clone().multiplyScalar(.29 * cos).addScaledVector(plane, .29 * Math.sqrt(Math.max(0, 1 - cos * cos)));
    arm.quaternion.setFromUnitVectors(V(0, -1, 0), elbow.normalize()); arm.updateMatrixWorld(true);
    const end = arm.worldToLocal(target.clone()).sub(forearm.position).normalize();
    forearm.quaternion.setFromUnitVectors(V(0, -1, 0), end);
    model.group.updateMatrixWorld(true);
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
      for (const model of this.models.values()) this.releaseModel(model); this.models.clear();
      this.releaseModel(this.batter); this.batter = this.player(!homeDefense, 1, true, 'batter');
      this.releaseModel(this.catcher); this.catcher = this.player(homeDefense, 2, false, 'catcher');
      for (const model of this.runnerModels) this.releaseModel(model); this.runnerModels = [];
    }
    const alpha = clamp(options.interpolationAlpha ?? 1, 0, 1), active = new Set();
    for (const p of fielders) {
      const catching = p.role === 'C' || p.role === 'catcher' || p.id === 'C';
      if (catching && !fielding) continue;
      const id = String(p.id); active.add(id);
      const pitcher = p.role === 'P' || p.role === 'pitcher' || p.id === 'P';
      if (!catching && !this.models.has(id)) this.models.set(id, this.player(homeDefense, p.number || this.models.size + 3, false, pitcher ? 'pitcher' : 'fielder'));
      const model = catching ? this.catcher : this.models.get(id), x = -mix(p.prevX ?? p.x, p.x, alpha), z = mix(p.prevZ ?? p.z, p.z, alpha);
      const dx = -(p.x - (p.prevX ?? p.x)), dz = p.z - (p.prevZ ?? p.z), moving = Math.hypot(dx, dz) > .001;
      let direction = moving ? Math.atan2(dx, dz) : model.facing || Math.atan2(-x, -z);
      if (pitcher && ['ready', 'windup', 'pitch'].includes(phase)) direction = Math.PI;
      const source = state?.play?.fielder === p.id, throwData = state?.play?.throw;
      if (source && ['held', 'throw'].includes(state?.play?.stage)) {
        const base = throwData?.base ?? state.play.throwBase ?? state.play.queuedBase ?? 1, target = throwData?.to || BASES[base] || BASES[1];
        direction = Math.atan2(-target.x - x, target.z - z);
      }
      this.pose(model, x, z, state, { moving, facing: direction, role: catching ? 'catcher' : pitcher ? 'pitcher' : 'fielder', actor: p, index: this.models.size });
      model.group.visible = true;
      model.heldBall.visible = pitcher && !fielding && ['ready', 'windup'].includes(phase);
      const release = state?.pitch ? t - state.pitch.releaseAt : -100;
      if (pitcher && !fielding && release > -.065 && release < .035) {
        const start = state.pitch.start;
        this.reachHand(model, 'right', V(-start.x, start.y, start.z));
      }
      if (source && throwData?.kind !== 'carry' && state?.play?.stage === 'throw' && t - (throwData?.startedAt ?? t) < .05) {
        const from = throwData?.from;
        if (from) this.reachHand(model, 'right', V(-from.x, from.y, from.z));
      }
      if (model.frontLabel) { const near = this.camera.position.distanceTo(model.group.position) < 52; model.frontLabel.visible = model.backLabel.visible = near; }
    }
    for (const [id, model] of this.models) model.group.visible = active.has(id);

    const batterNumber = (state?.batterIndex?.[state?.battingSide || 0] || 0) + 1;
    this.numberPlayer(this.batter, state?.play?.batter?.number || batterNumber);
    this.pose(this.batter, 1.02, -.04, state, { facing: -Math.PI / 2, role: 'batter' });
    this.batter.group.visible = !fielding || (state?.phaseTime || 0) < .08;
    if (!fielding) this.pose(this.catcher, 0, -2.1, state, { facing: 0, role: 'catcher' });
    this.catcher.group.visible = true;
    // The broadcast camera occupies the umpire's view; his model is shown in the
    // establishing shot, without placing his head across the live strike zone.
    this.umpire.group.visible = menu;
    if (menu) this.pose(this.umpire, .55, -2.75, state, { facing: 0, role: 'catcher' });

    const runners = state?.runners || [];
    for (let i = 0; i < Math.max(runners.length, this.runnerModels.length); i++) {
      const runner = runners[i];
      if (runner && !this.runnerModels[i]) this.runnerModels[i] = this.player(!homeDefense, runner.number || 1, false, 'runner');
      const model = this.runnerModels[i]; if (!model) continue;
      model.group.visible = !!runner && !runner.out && !runner.scored && !menu;
      if (runner) {
        this.numberPlayer(model, runner.number || 1);
        const x = -mix(runner.prevX ?? runner.x, runner.x || 0, alpha), z = mix(runner.prevZ ?? runner.z, runner.z || 0, alpha);
        const dx = -(runner.x - (runner.prevX ?? runner.x)), dz = runner.z - (runner.prevZ ?? runner.z);
        const moving = Math.hypot(dx, dz) > .0005;
        const target = BASES[runner.targetBase ?? Math.min(4, (runner.fromBase || 0) + 1)];
        const direction = moving ? Math.atan2(dx, dz) : model.facing || (target ? Math.atan2(-target.x - x, target.z - z) : 0);
        this.pose(model, x, z, state, { moving, facing: direction, role: 'runner', actor: runner, index: i });
        if (model.frontLabel) { const near = this.camera.position.distanceTo(model.group.position) < 52; model.frontLabel.visible = model.backLabel.visible = near; }
      }
    }
    const selectedRunner = runners.find(r => r.id === options.selectedRunnerId && !r.out && !r.scored);
    this.runnerSelection.visible = !!selectedRunner && fielding;
    if (selectedRunner) this.runnerSelection.position.set(-selectedRunner.x, .035, selectedRunner.z);

    const ball = state?.ball;
    this.ball.visible = !menu && !!ball?.visible;
    this.ballShadow.visible = this.ball.visible; this.ballMark.visible = this.ball.visible && fielding && guidance !== 'expert';
    if (ball) {
      const alpha = clamp(options.interpolationAlpha ?? 1, 0, 1);
      const x = mix(ball.prevX ?? ball.x, ball.x, alpha), y = mix(ball.prevY ?? ball.y, ball.y, alpha), z = mix(ball.prevZ ?? ball.z, ball.z, alpha);
      this.ball.position.set(-x, y, z); this.ball.rotation.set(t * 12, t * 16, t * 8);
      if (state?.play?.stage === 'held') {
        const holder = state.play.fielder === 'C' ? this.catcher : this.models.get(String(state.play.fielder));
        if (holder) {
          holder.group.updateMatrixWorld(true);
          const transferAge = t - (state.play.heldAt ?? t);
          (transferAge < .14 ? holder.leftHand : holder.rightHand).getWorldPosition(this.ball.position);
        }
      }
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
    // A completed pitch may be reviewed; an active pitch never exposes its
    // destination or a live ball/strike classification.
    this.pitchMark.visible = !menu && phase === 'result' && !!state?.pitch?.resolved && guidance !== 'expert';
    if (this.pitchMark.visible) {
      const crossing = state.pitch.target;
      this.pitchMark.position.set(-crossing.x, crossing.y, -.04);
      this.pitchMark.material.color.set(inStrikeZone(crossing) ? 0xefbf77 : 0x88d0d7);
    }
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
    for (const material of this.uniformMaterials?.values() || []) { materials.add(material); if (material.map) textures.add(material.map); }
    for (const t of textures) t.dispose(); for (const m of materials) m.dispose(); for (const g of geometries) g.dispose(); this.renderer.dispose();
  }
}
