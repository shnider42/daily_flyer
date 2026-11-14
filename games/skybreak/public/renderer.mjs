import * as THREE from './vendor/three.module.js';
import * as WORLD from './world.mjs';

const { terrainHeight, buildingBase, BUILDINGS, TREES, ROCKS, PROPS, COLLIDERS, LANDMARKS, PADS } = WORLD;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const PALETTE = [0x64b9bd, 0xe8ad56, 0xb5a2d6, 0xd67f6c, 0xa6bd83, 0xe6ce8c, 0x6598c7, 0xd699b5, 0x9db6b1, 0xcf8f54];
const RARITY = [0xc7d0d1, 0x8fd572, 0x61bff5, 0xbc8bfa, 0xffcb62];
const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(1, 12, 8);
const unitIco = new THREE.IcosahedronGeometry(1, 1);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const unitCone = new THREE.ConeGeometry(1, 1, 8);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const unitCapsule = new THREE.CapsuleGeometry(1, 1, 3, 8);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function cssColor(color, fallback = 0xe4c996) { try { return new THREE.Color(color ?? fallback); } catch { return new THREE.Color(fallback); } }
function mesh(geometry, material, parent, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geometry, material); m.position.set(...pos); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
function material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .86, ...extra }); }
function colorNoiseTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), rnd = rng(663), pixels = ctx.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) { const n = 239 + Math.floor(rnd() * 16); pixels.data[i] = n; pixels.data[i + 1] = n; pixels.data[i + 2] = n; pixels.data[i + 3] = 255; }
  ctx.putImageData(pixels, 0, 0); const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; texture.repeat.set(3, 3); return texture;
}
function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.65)'); g.addColorStop(.55, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(canvas);
}
function roofGeometry() {
  const p = [-.5,0,-.5, .5,0,-.5, 0,.5,-.5, -.5,0,.5, 0,.5,.5, .5,0,.5, -.5,0,-.5, 0,.5,-.5, 0,.5,.5, -.5,0,-.5, 0,.5,.5, -.5,0,.5, .5,0,-.5, .5,0,.5, 0,.5,.5, .5,0,-.5, 0,.5,.5, 0,.5,-.5];
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.computeVertexNormals(); return geo;
}
const unitRoof = roofGeometry();
// The server treats a ramp as a solid triangular prism, including its sides and back.
const unitRampSides = new THREE.BufferGeometry();
unitRampSides.setAttribute('position',new THREE.Float32BufferAttribute([
  -.5,0,.5, -.5,1,-.5, -.5,0,-.5,
  .5,0,.5, .5,0,-.5, .5,1,-.5,
  -.5,0,-.5, -.5,1,-.5, .5,1,-.5,
  -.5,0,-.5, .5,1,-.5, .5,0,-.5,
],3));
unitRampSides.computeVertexNormals();

/** A few instanced batches carry the island's thousands of architectural details. */
class StaticBatches {
  constructor(scene, noise) { this.scene = scene; this.entries = new Map(); this.materials = {
    solid: material(0xffffff, { map: noise }), flat: material(0xffffff, { flatShading: true }),
    metal: material(0xffffff, { roughness: .42, metalness: .45 }), glass: material(0xffffff, { roughness: .20, metalness: .4 }),
    leaf: material(0xffffff, { flatShading: true }), grass: material(0xffffff, { side: THREE.DoubleSide, roughness: 1 }),
    dark: material(0xffffff, { roughness: 1 }),
  }; this.object = new THREE.Object3D(); }
  add(shape, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, style = 'solid', shadow = true) {
    const key = shape + ':' + style + ':' + shadow; let entry = this.entries.get(key);
    if (!entry) { entry = { geo: { box: unitBox, sphere: unitSphere, ico: unitIco, cylinder: unitCylinder, cone: unitCone, plane: unitPlane, roof: unitRoof }[shape], material: this.materials[style], values: [], shadow }; this.entries.set(key, entry); }
    this.object.position.set(x, y, z); this.object.scale.set(sx, sy, sz); this.object.rotation.set(rx, ry, rz); this.object.updateMatrix();
    entry.values.push([this.object.matrix.clone(), cssColor(color)]);
  }
  build() {
    for (const entry of this.entries.values()) { if (!entry.values.length) continue; const batch = new THREE.InstancedMesh(entry.geo, entry.material, entry.values.length); entry.values.forEach(([matrix, color], i) => { batch.setMatrixAt(i, matrix); batch.setColorAt(i, color); }); batch.castShadow = entry.shadow; batch.receiveShadow = true; batch.computeBoundingSphere(); this.scene.add(batch); }
  }
}

export class IslandRenderer {
  constructor(canvas, { quality = 'auto', mobile = false } = {}) {
    this.canvas = canvas; this.mobile = mobile; this.quality = quality; this.time = 0; this.cameraReady = false; this.lastMenu = null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x91cad8); this.scene.fog = new THREE.Fog(0xb8d6d5, 95, 360);
    this.camera = new THREE.PerspectiveCamera(66, 1, .12, 1800); this.camera.position.set(48, 35, 65);
    this.sun = new THREE.DirectionalLight(0xffe7bd, 3.0); this.sun.position.set(-55, 95, 45); this.sun.castShadow = true;
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -48; this.sun.shadow.camera.right = this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.near = 2; this.sun.shadow.camera.far = 210; this.sun.shadow.bias = -.00025; this.sun.shadow.normalBias = .045;
    this.scene.add(this.sun, this.sun.target); this.scene.add(new THREE.HemisphereLight(0xc0e5ff, 0x697345, 2.25));
    this.noise = colorNoiseTexture(); this.glow = glowTexture(); this.batches = new StaticBatches(this.scene, this.noise);
    this.characters = new Map(); this.lootObjects = new Map(); this.buildObjects = new Map(); this.effects = []; this.eventIds = new Set(); this.flags = [];
    this.particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff }); this.particles = [];
    this.particleMesh = new THREE.InstancedMesh(unitBox, this.particleMaterial, 320); this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particleMesh.count = 0; this.particleMesh.frustumCulled = false; this.scene.add(this.particleMesh);
    this.createSky(); this.createTerrain(); this.createWater(); this.createWorld(); this.batches.build(); this.createStorm();
    this.preview = null; this.setQuality(quality); this.resize();
  }

  createSky() {
    const shader = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { sunDirection: { value: new THREE.Vector3(-.51, .64, .39).normalize() } }, vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: [
      'varying vec3 vDirection;uniform vec3 sunDirection;',
      'void main(){vec3 d=normalize(vDirection);float h=clamp(d.y,0.,1.);vec3 c=mix(vec3(.92,.83,.65),vec3(.24,.58,.75),pow(h,.5));',
      'float sun=max(dot(d,sunDirection),0.);c+=vec3(1.,.66,.27)*pow(sun,18.)*.23;c+=vec3(1.,.92,.71)*pow(sun,1300.)*2.;',
      'gl_FragColor=vec4(c,1.);}'
    ].join('\n') });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 12), shader); this.sky.frustumCulled = false; this.sky.renderOrder = -100; this.scene.add(this.sky);
    const rnd = rng(2374), cloudGeo = new THREE.IcosahedronGeometry(1, 2), cloudMat = new THREE.MeshStandardMaterial({ color: 0xfff4df, roughness: 1, flatShading: false });
    const cloud = new THREE.InstancedMesh(cloudGeo, cloudMat, 150); const obj = new THREE.Object3D();
    for (let i = 0; i < 150; i++) { const cluster = Math.floor(i / 6), a = cluster * 2.39996, r = 160 + (cluster % 4) * 60; obj.position.set(Math.cos(a) * r + rnd() * 28, 105 + rnd() * 12 + cluster % 3 * 12, Math.sin(a) * r + rnd() * 16); obj.scale.set(13 + rnd() * 17, 3 + rnd() * 4, 7 + rnd() * 12); obj.rotation.set(0, rnd() * TAU, .04); obj.updateMatrix(); cloud.setMatrixAt(i, obj.matrix); cloud.setColorAt(i, new THREE.Color().setHSL(.12, .19, .87 + rnd() * .10)); }
    this.clouds = cloud; this.scene.add(cloud);
    // Distant archipelago silhouettes make the shoreline read as an island rather than a floating disk.
    for (let i = 0; i < 14; i++) { const a = i * .52, radius = 420 + rnd() * 220; const h = 25 + rnd() * 45; this.batches.add('ico', 0x799e9b, Math.cos(a) * radius, h * .18 - 6, Math.sin(a) * radius, 70 + rnd() * 70, h, 40 + rnd() * 50, 0, a, 0, 'flat', false); }
  }

  createTerrain() {
    const size = 360, resolution = 180, geometry = new THREE.PlaneGeometry(size, size, resolution, resolution); geometry.rotateX(-Math.PI / 2);
    const p = geometry.attributes.position, colors = new Float32Array(p.count * 3); const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), h = terrainHeight(x, z); p.setY(i, h); const gradient = Math.hypot(terrainHeight(x + 1, z) - h, terrainHeight(x, z + 1) - h); const variation = .5 + .5 * Math.sin(x * .67 + Math.sin(z * .3)) * Math.cos(z * .49);
      if (h < 1.65) c.set(0xdcd1a5).lerp(new THREE.Color(0xd9c493), variation * .25);
      else if (gradient > 1.15) c.set(0x9e9d7f).lerp(new THREE.Color(0x778777), clamp((gradient - 1) / 3, 0, .6));
      else c.set(0x719e4a).lerp(new THREE.Color(0xa9ba5e), variation * .34).lerp(new THREE.Color(0x71895c), clamp((h - 18) / 45, 0, .4));
      c.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    this.terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: this.noise })); this.terrain.receiveShadow = true; this.scene.add(this.terrain);
    // Roads are continuous terrain-following ribbons; a narrow shoulder softens the edge.
    let roads = WORLD.ROADS;
    if (!roads || !roads.length) roads = [ [{x:-85,z:-60},{x:-53,z:-35},{x:-25,z:-12},{x:0,z:0},{x:38,z:35},{x:79,z:55}], [{x:-76,z:56},{x:-42,z:30},{x:-25,z:-12},{x:15,z:-37},{x:63,z:-59}], [{x:0,z:0},{x:8,z:35},{x:38,z:35}] ];
    for (const r of roads) { const points = Array.isArray(r) ? r : r.points; if (!points?.length) continue; const w = r.width || 5; this.roadRibbon(points, w + 1.2, 0xb1b67d, .026); this.roadRibbon(points, w, r.kind === 'path' ? 0xc4b28a : 0xb4ad8a, .045); }
  }

  roadRibbon(points, width, color, offset) {
    const vectors = points.map(p => new THREE.Vector3(p.x ?? p[0], 0, p.z ?? p[1]));
    const curve = new THREE.CatmullRomCurve3(vectors, false, 'catmullrom', .28), count = Math.max(60, points.length * 30), pos = [], idx = [];
    for (let i = 0; i <= count; i++) { const t = i / count, p = curve.getPoint(t), tangent = curve.getTangent(t); const nx = -tangent.z, nz = tangent.x;
      for (const sign of [-1, 1]) { const x = p.x + nx * width * .5 * sign, z = p.z + nz * width * .5 * sign; pos.push(x, terrainHeight(x, z) + offset, z); }
      if (i < count) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); const road = new THREE.Mesh(geo, material(color, { map: this.noise, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide })); road.receiveShadow = true; this.scene.add(road);
  }

  createWater() {
    const geo = new THREE.PlaneGeometry(1600, 1600, 180, 180); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position, depth = [];
    for (let i = 0; i < p.count; i++) depth.push(clamp(-terrainHeight(p.getX(i), p.getZ(i)), 0, 18));
    geo.setAttribute('seaDepth', new THREE.Float32BufferAttribute(depth, 1));
    const uniforms = { time: { value: 0 } };
    const shader = new THREE.ShaderMaterial({ uniforms, vertexShader: [
      'uniform float time;attribute float seaDepth;varying vec3 vWorld;varying float vDepth;',
      'void main(){vec3 p=position;p.y=-.18+sin(p.x*.105+time*.62)*.10+sin(p.z*.15+time*.83)*.06;vWorld=p;vDepth=seaDepth;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}'
    ].join('\n'), fragmentShader: [
      'uniform float time;varying vec3 vWorld;varying float vDepth;',
      'void main(){vec2 p=vWorld.xz;float wave=sin(p.x*.29+p.y*.16+time*1.2)+sin(p.x*.11-p.y*.37-time*.7);',
      'vec3 c=mix(vec3(.23,.72,.65),vec3(.035,.39,.52),clamp(vDepth*.08,0.,1.));c+=wave*.019;',
      'float crest=pow(max(0.,sin(p.x*.41+p.y*.19+sin(p.y*.05+time)*1.1-time)),22.)*.11;',
      'c+=vec3(.6,.84,.77)*crest;vec3 v=normalize(cameraPosition-vWorld);float fres=pow(1.-max(v.y,0.),4.);c=mix(c,vec3(.62,.78,.78),fres*.48);',
      'float reflection=pow(max(dot(reflect(-normalize(vec3(-.51,.64,.39)),vec3(wave*.045,1.,cos(p.x*.2+time)*.05)),v),0.),140.);c+=vec3(1.,.83,.5)*reflection*.35;gl_FragColor=vec4(c,1.);}'
    ].join('\n') });
    this.water = new THREE.Mesh(geo, shader); this.water.renderOrder = -1; this.scene.add(this.water);
    // A fine white lace of surf follows the actual shoreline.
    const verts = [], uvs = [], indices = [], segments = 320;
    for (let i = 0; i <= segments; i++) { const a = i / segments * TAU; let radius = 70; for (; radius < 185; radius += .7) if (terrainHeight(Math.cos(a) * radius, Math.sin(a) * radius) < .12) break;
      for (const add of [-.1, 2.0]) { verts.push(Math.cos(a) * (radius + add), .065, Math.sin(a) * (radius + add)); uvs.push(i / segments * 30, add < 0 ? 0 : 1); }
      if (i < segments) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    }
    const foamGeo = new THREE.BufferGeometry(); foamGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); foamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); foamGeo.setIndex(indices);
    this.foam = new THREE.Mesh(foamGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform float time;varying vec2 vUv;void main(){float v=sin(vUv.x*8.+time)*.12+vUv.y;float f=smoothstep(.03,.3,v)*(1.-smoothstep(.45,1.,v));float bits=.55+.45*sin(vUv.x*31.+sin(time+vUv.x)*3.);gl_FragColor=vec4(.91,.97,.85,f*bits*.52);}' })); this.scene.add(this.foam);
  }

  createWorld() {
    for (const b of BUILDINGS || []) this.addBuilding(b);
    for (const p of PROPS || []) this.addProp(p);
    for (const r of ROCKS || []) this.addRock(r);
    this.addVegetation(); this.addLandmarks();
    for (const p of PADS || []) { const y = p.y ?? terrainHeight(p.x, p.z); this.batches.add('cylinder', 0x405054, p.x, y + .13, p.z, 1.8, .25, 1.8, 0, 0, 0, 'metal'); this.batches.add('cylinder', 0x5dbab6, p.x, y + .27, p.z, 1.42, .06, 1.42, 0, 0, 0, 'metal'); for (let k=0;k<4;k++){const a=k*Math.PI/2;this.batches.add('box',0xf5ca68,p.x+Math.sin(a)*1.28,y+.33,p.z+Math.cos(a)*1.28,.4,.05,.55,0,-a,0,'metal');} }
  }

  addBuilding(b) {
    const base = typeof buildingBase === 'function' ? buildingBase(b) : terrainHeight(b.x, b.z); const y = Number.isFinite(b.y) ? b.y : base;
    const yaw = b.yaw || 0, w = b.w || 7, d = b.d || 8, h = b.h || 4, kind = b.kind || 'house';
    const col = b.color ?? 0xe7d9b1, roof = b.roof ?? 0xb96844; const cos=Math.cos(yaw),sin=Math.sin(yaw);
    const put=(shape,color,x,yy,z,sx,sy,sz,rx=0,ry=0,rz=0,style='solid')=>this.batches.add(shape,color,b.x+x*cos+z*sin,y+yy,b.z-x*sin+z*cos,sx,sy,sz,rx,yaw+ry,rz,style);
    // All gameplay walls use their exported geometry, including door openings.
    const walls=(COLLIDERS || []).filter(c=>['wall','roof','floor'].includes(c.kind)&&(c.building===b.id || c.buildingId===b.id || String(c.id).startsWith(String(b.id)+':') || String(c.id).startsWith(String(b.id)+'-')));
    if(walls.length) for(const c of walls) { if(c.kind==='roof') continue; this.batches.add('box',col,c.x,c.y+c.h/2,c.z,c.w,c.h,c.d,0,c.yaw||0,0,'solid'); }
    else {
      const door=1.6,thick=.3;
      put('box',col,0,h/2,-d/2,w,h,thick); put('box',col,-w/2,h/2,0,thick,h,d);put('box',col,w/2,h/2,0,thick,h,d);
      put('box',col,-(w+door)/4,h/2,d/2,(w-door)/2,h,thick);put('box',col,(w+door)/4,h/2,d/2,(w-door)/2,h,thick);put('box',col,0,(h+2.4)/2,d/2,door,h-2.4,thick);
    }
    const flat = true;
    if(flat) {
      put('box',roof,0,h+.125,0,w+.35,.25,d+.35,0,0,0,'solid');
      for(const x of [-w*.5,w*.5])put('box',roof,x,h+.37,0,.22,.24,d+.4); for(const z of [-d*.5,d*.5])put('box',roof,0,h+.37,z,w+.4,.24,.22); put('box',0xead8b2,0,h-.14,0,w+.58,.18,d+.58); put('box',roof,0,h+.02,0,w+.65,.10,d+.65);
      for(let i=0;i<Math.ceil(w/.8);i++) put('box',new THREE.Color(roof).multiplyScalar(.85),-w/2+i*.8,h+.26,0,.025,.012,d+.3,0,0,0,'solid');
      if(kind==='warehouse'||kind==='industrial') { for(const side of [-1,1]) for(let i=0;i<Math.ceil(d/.7);i++) put('box',0x9caaa0,side*(w/2+.18),h/2,-d/2+i*.7,.07,h-.25,.08,0,0,0,'metal'); }
    } else {
      const rise=Math.min(2.35,w*.31);put('roof',roof,0,h,0,w+.7,rise*2,d+.7,0,0,0,'flat');
      const slope=Math.atan2(rise,w/2+.35), length=Math.hypot(w/2+.35,rise);
      for(const side of [-1,1]) {
        put('box',0xe9d8ad,side*(w/4+.17),h+rise/2-.07,0,length,.15,d+.83,0,0,-side*slope);
        // Thin terracotta courses break the roof planes into believable tilework.
        for(let i=1;i<8;i++) {const f=i/8,x=side*(w/2+.37)*f, yy=h+rise*(1-f)+.10;put('box',new THREE.Color(roof).multiplyScalar(i%2?.88:1.04),x,yy,0,.065,.055,d+.78,0,0,-side*slope,'flat');}
      }
      put('cylinder',0xbb754e,0,h+rise+.055,0,.11,d+.85,.11,Math.PI/2,0,0,'flat');
      put('box',0xb8866b,w*.23,h+rise*.6+.5,-d*.21,.66,1.35,.66);put('box',0x8c6654,w*.23,h+rise*.6+1.2,-d*.21,.87,.17,.87);
    }
    // Timber frames, shutters, awnings and flower boxes give each house a readable scale.
    const windowColor=0x365c62, frame=0xf0ddba, trim=0x527f78;
    for(const side of [-1,1]) {
      const x=side*w*.28,z=d/2+.17;
      put('box',frame,x,2.05,z,1.43,1.6,.17);put('box',windowColor,x,2.06,z+.105,1.15,1.33,.05,0,0,0,'glass');
      put('box',frame,x,2.06,z+.14,.06,1.4,.05);put('box',frame,x,2.06,z+.14,1.2,.06,.05);
      for(const s of [-1,1]) {put('box',trim,x+s*.88,2.05,z,.31,1.48,.12);for(let k=0;k<5;k++)put('box',0x3f6a65,x+s*.88,1.50+k*.24,z+.09,.33,.04,.06);}
      put('box',0xb87b57,x,1.15,z+.12,1.45,.24,.4);for(let k=0;k<4;k++)put('ico',k%2?0xefbd64:0xdc7b5c,x-.5+k*.33,1.45,z+.13,.17,.19,.17,0,0,0,'flat');
      for(const s of [-1,1]) {const sx=s*(w/2+.17);put('box',frame,sx,2.05,-d*.15,.13,1.65,1.6);put('box',windowColor,sx+s*.09,2.05,-d*.15,.045,1.35,1.35,0,0,0,'glass');put('box',frame,sx+s*.12,2.05,-d*.15,.05,.06,1.42);}
    }
    // Open doorway: dark recess and two door posts, never a solid invisible door.
    put('box',0x8b684a,-1.2,1.3,d/2+.12,.12,2.65,.22);put('box',0x8b684a,1.2,1.3,d/2+.12,.12,2.65,.22);put('box',0x8b684a,0,2.7,d/2+.12,2.55,.12,.22);
    put('box',0x466f68,0,2.9,d/2+.58,2.4,.13,1.15,.14,0,0);put('box',0x9e9879,0,.08,d/2+.45,2.2,.13,.75);
    if(kind!=='warehouse') {put('cylinder',0x806b52,-w*.42,h*.46,d/2+.21,.055,h*.92,.055);put('cylinder',0x806b52,w*.42,h*.46,d/2+.21,.055,h*.92,.055);}
    // Warm interior rafters are visible through the open doorway.
    for(let z=-d*.3;z<d*.4;z+=2.2)put('box',0x977c57,0,h-.16,z,w-.1,.18,.17);
  }

  addProp(p) {
    const x=p.x,z=p.z,y=p.y??terrainHeight(x,z),w=p.w||2,d=p.d||2,h=p.h||1.4,a=p.yaw||0,col=p.color??0xc5a170;
    const cos=Math.cos(a),sin=Math.sin(a),put=(shape,color,xx,yy,zz,sx,sy,sz,rx=0,ry=0,rz=0,style='solid')=>this.batches.add(shape,color,x+xx*cos+zz*sin,y+yy,z-xx*sin+zz*cos,sx,sy,sz,rx,a+ry,rz,style);
    if(p.kind==='lighthouse'){
      for(let i=0;i<6;i++){const rr=2.85-i*.18;put('cylinder',i%2?0xcf765c:0xf0e4c5,0,(i+.5)*h/7,0,rr,h/7,rr,0,0,0,'solid');}
      put('cylinder',0x41686d,0,h*.87,0,2.55,.35,2.55,0,0,0,'metal');put('cylinder',0x91b7b1,0,h*.93,0,1.7,h*.1,1.7,0,0,0,'glass');
      for(let k=0;k<8;k++){const aa=k*TAU/8;put('box',0x41686d,Math.sin(aa)*1.75,h*.93,Math.cos(aa)*1.75,.10,h*.13,.10,0,0,0,'metal');}
      put('cone',0x467779,0,h+1,0,2.45,1.5,2.45,0,0,0,'metal');put('cylinder',0xffd88e,0,h*.93,0,.6,.8,.6,0,0,0,'glass');
      for(const yy of [3.4,8.5,13.4]){put('box',0x3f656a,0,yy,2.75,.8,1.3,.08,0,0,0,'glass');put('box',0xf2dab4,0,yy-.74,2.8,1,.12,.18);}
      return;
    }
    if(p.kind==='crane'){
      put('box',col,0,h/2,0,1.3,h,1.3,0,0,0,'metal');put('box',0x566f71,0,.4,0,3.3,.8,3.3,0,0,0,'metal');
      put('box',col,0,h-.6,-3,.65,.65,14,0,0,0,'metal');put('box',col,0,h+1.3,-3,.25,.25,14,0,0,0,'metal');
      for(let k=0;k<8;k++)put('box',col,0,h+.35,-9+k*1.7,.16,2.1,.16,.65,0,0,'metal');
      put('box',0x455f63,0,h-1,2.7,2.7,1.4,3.4,0,0,0,'metal');put('box',0xb3c6b6,0,h-2,-1.2,2.3,2.6,1.9,0,0,0,'metal');put('box',0x497780,0,h-1.8,-2.17,1.85,1.1,.05,0,0,0,'glass');
      put('cylinder',0x475b5d,0,h*.66,-9,.035,h*.65,.035,0,0,0,'metal');put('box',0x495958,0,h*.34,-9,1.3,.25,.7,0,0,0,'metal');return;
    }
    if(p.kind==='radio'){
      put('box',0xa1aaa2,0,h/2,0,1.3,h,1.3,0,0,0,'metal');
      for(let k=0;k<7;k++){put('box',k%2?0xca6e56:0xc0c1ac,0,1+k*h/7,0,1.5,.18,1.5,0,0,0,'metal');put('box',0xd1c7a7,0,2+k*h/7,.74,.13,h/7,.13,0,0,.3,'metal');}
      put('cylinder',0x6e7a75,0,h+2,0,.07,4,.07,0,0,0,'metal');put('box',0x9fafa5,0,h*.87,0,8,.15,.15,0,0,0,'metal');
      for(const xx of [-3,-1,1,3])put('box',0x9fafa5,xx,h*.87,0,.13,.13,3,0,0,0,'metal');
      const dish=mesh(new THREE.SphereGeometry(2.1,16,10,0,TAU,0,Math.PI*.30),material(0xe5dfbe,{side:THREE.DoubleSide}),this.scene,[x+1.5,y+h*.67,z]);dish.rotation.set(.8,0,.4);return;
    }
    if(p.kind==='fountain'){
      put('cylinder',col,0,h*.25,0,w*.5,h*.5,d*.5);put('cylinder',0x86c0b5,0,h*.53,0,w*.41,.07,d*.41,0,0,0,'glass');put('cylinder',0xd5c9a4,0,h*.72,0,.24,h,.24);put('sphere',0xf1dfb0,0,h*1.28,0,.32,.32,.32,0,0,0,'solid');return;
    }
    if(p.kind==='planter'){
      put('box',col,0,h/2,0,w,h,d);put('box',0x574f39,0,h+.015,0,w*.83,.035,d*.83);for(let k=0;k<5;k++){const aa=k*2.4;put('ico',k%2?0x6d9250:0x8ba35a,Math.cos(aa)*w*.24,h+.35,Math.sin(aa)*d*.24,.45,.45,.45,0,aa,0,'leaf');}return;
    }
    if(p.kind==='container'){
      put('box',col,0,h/2,0,w,h,d,0,0,0,'metal');for(let q=-w/2+.2;q<w/2;q+=.5)for(const s of [-1,1])put('box',new THREE.Color(col).multiplyScalar(.78),q,h/2,s*(d/2+.025),.055,h-.12,.05,0,0,0,'metal');
      for(const s of [-1,1]){put('box',0x4c6364,s*(w/2-.06),h/2,d/2+.05,.07,h,.06,0,0,0,'metal');put('box',0xced6b7,s*w*.24,h/2,d/2+.06,.045,h-.2,.05,0,0,0,'metal');}return;
    }
    if(['barrel','drum'].includes(p.kind)){
      put('cylinder',col,0,h/2,0,w*.5,h,d*.5,0,0,0,'metal');for(const yy of [.18,h-.18])put('cylinder',0x53615a,0,yy,0,w*.52,.07,d*.52,0,0,0,'metal');put('cylinder',0xbab995,0,h+.01,0,w*.47,.03,d*.47,0,0,0,'metal');return;
    }
    if(['fence','wall','barrier','sandbag'].includes(p.kind)){
      if(p.kind==='wall'||p.kind==='barrier'){put('box',col,0,h/2,0,w,h,d);put('box',0xd9d0ad,0,h+.03,0,w+.15,.14,d+.12);}else{for(let xx=-w/2;xx<=w/2;xx+=Math.max(.65,w/10))put('box',col,xx,h/2,0,.12,h,.14);for(const yy of [h*.25,h*.75])put('box',0xb09b70,0,yy,0,w,.10,.13);}return;
    }
    if(['car','truck','van'].includes(p.kind)){
      put('box',col,0,h*.43,0,w*.94,h*.45,d*.96,0,0,0,'metal');put('box',col,0,h*.77,d*.05,w*.80,h*.34,d*.49,0,0,0,'metal');put('box',0x4f7b86,0,h*.79,-d*.21,w*.71,h*.21,.06,0,0,0,'glass');for(const sx of [-1,1])for(const zz of [-d*.30,d*.30]){put('cylinder',0x283d3e,sx*w*.48,h*.22,zz,h*.23,.18,h*.23,0,0,Math.PI/2,'dark');put('cylinder',0xadb7ad,sx*w*.54,h*.22,zz,h*.12,.025,h*.12,0,0,Math.PI/2,'metal');}for(const sx of [-1,1])put('box',0xf8d89c,sx*w*.3,h*.48,-d*.49,.25,.2,.06,0,0,0,'glass');return;
    }
    if(['rock','boulder'].includes(p.kind)){put('ico',col,0,h*.45,0,w*.57,h*.63,d*.57,0,a,.08,'flat');return;}
    if(p.kind==='bench'){put('box',col,0,.5,0,w,.16,d);put('box',col,0,.95,d*.4,w,.7,.1,.12);for(const xx of [-w*.35,w*.35])put('box',0x435657,xx,.27,0,.14,.5,d*.7);return;}
    if(p.kind==='lamp'){put('cylinder',0x4b6261,0,h/2,0,.08,h,.08,0,0,0,'metal');put('box',0x4b6261,.32,h-.08,0,.75,.1,.12,0,0,0,'metal');put('box',0xffd297,.66,h-.17,0,.28,.20,.28,0,0,0,'glass');return;}
    // Supply stacks and wooden cases have individual boards, bands and corner protectors.
    put('box',col,0,h/2,0,w,h,d);for(const yy of [.14,h-.14])for(const s of [-1,1])put('box',0x71684b,0,yy,s*(d/2+.015),w,.10,.055);for(const xx of [-w*.32,w*.32])put('box',0x66716a,xx,h/2,d/2+.035,.08,h,.05,0,0,0,'metal');
    for(let k=1;k<Math.max(2,Math.round(w/.3));k++)put('box',0x9c825a,-w/2+k*w/Math.max(2,Math.round(w/.3)),h+.015,0,.02,.02,d);
  }

  addRock(r) {
    const size=r.size||1.5,y=r.y??terrainHeight(r.x,r.z), seed=(Math.abs(r.x*331+r.z*177)|0),random=rng(seed);this.batches.add('ico',0x8d9684,r.x,y+size*.35,r.z,size*.78,size*.46,size*.67,.1,random()*TAU,.1,'flat');this.batches.add('ico',0xb3b599,r.x-size*.18,y+size*.62,r.z-.15,size*.53,size*.18,size*.50,.1,random()*TAU,.1,'flat');
    if(size>2)this.batches.add('ico',0x698d55,r.x+.3,y+size*.65,r.z+.35,size*.55,.20,size*.40,0,0,0,'leaf');
  }

  addVegetation() {
    const random=rng(271), leaves=[0x4d8244,0x5b9345,0x729d4b,0x7ca150,0x4a7d50];
    for(const t of TREES||[]) {
      const s=(t.size||8)/6,y=t.y??terrainHeight(t.x,t.z);const pine=t.kind==='pine';
      this.batches.add('cylinder',0x826d4a,t.x,y+1.6*s,t.z,.26,3.2*s,.26,0,random()*TAU,.015,'solid');
      if(pine){for(let k=0;k<3;k++)this.batches.add('cone',leaves[k],t.x,y+(3+k*1.2)*s,t.z,(2.1-k*.4)*s,3.2*s,(2.1-k*.4)*s,0,k*.6,0,'leaf');}
      else {for(let k=0;k<4;k++){const a=k*2.4, r=k===0?0:1.1*s;this.batches.add('ico',leaves[Math.floor(random()*leaves.length)],t.x+Math.cos(a)*r,y+(4.4+(k===0?.8:random()*.45))*s,t.z+Math.sin(a)*r,(1.6+random()*.5)*s,(1.5+random()*.7)*s,(1.65+random()*.4)*s,.08,a,.12,'leaf');}this.batches.add('cylinder',0x88714a,t.x+.55*s,y+3*s,t.z,.12*s,2*s,.12*s,0,0,-.65);}
    }
    // A sea of small, unshadowed grass tufts gives the foreground texture without a draw-call penalty.
    const grassGeo = new THREE.BufferGeometry(); const vertices = [];
    for (let i=0;i<3;i++){const a=i*Math.PI/3,c=Math.cos(a)*.27,s=Math.sin(a)*.27;vertices.push(-c,0,-s,c,0,s,.07,.67,0);}
    grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));grassGeo.computeVertexNormals();
    const grassMat=material(0xffffff,{side:THREE.DoubleSide,roughness:1}); this.windUniform={value:0};
    grassMat.onBeforeCompile=shader=>{shader.uniforms.windTime=this.windUniform;shader.vertexShader='uniform float windTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec4 worldAnchor=instanceMatrix*vec4(0.,0.,0.,1.); transformed.x+=sin(windTime*1.5+worldAnchor.x*.22+worldAnchor.z*.16)*position.y*.14;');};
    const count=this.mobile?1800:4300, positions=[];
    for(let i=0;i<count*3&&positions.length<count;i++){const x=(random()-.5)*255,z=(random()-.5)*255,y=terrainHeight(x,z);if(y<2.6||y>31)continue;if((BUILDINGS||[]).some(b=>Math.abs(b.x-x)<b.w*.7+2&&Math.abs(b.z-z)<b.d*.7+2))continue;if(Math.hypot(x,z)<9 || (WORLD.distanceToRoad && WORLD.distanceToRoad(x,z)<.8))continue;positions.push({x,y,z,s:.5+random()*.9});}
    const grass=new THREE.InstancedMesh(grassGeo,grassMat,positions.length),obj=new THREE.Object3D();positions.forEach((p,i)=>{obj.position.set(p.x,p.y+.01,p.z);obj.rotation.set(0,random()*TAU,0);obj.scale.set(p.s,p.s,p.s);obj.updateMatrix();grass.setMatrixAt(i,obj.matrix);grass.setColorAt(i,new THREE.Color().setHSL(.23+random()*.045,.31+random()*.15,.32+random()*.13));});grass.receiveShadow=true;this.scene.add(grass);this.grass=grass;
    // Wildflowers and stones placed in loose clusters beside the trees.
    for(let i=0;i<240;i++){const t=TREES?.[Math.floor(random()*(TREES?.length||0))];if(!t)break;const x=t.x+(random()-.5)*10,z=t.z+(random()-.5)*10,y=terrainHeight(x,z);if(y<2)continue;this.batches.add('ico',i%3===0?0xd6ac6a:0xe9d997,x,y+.28,z,.12,.11,.12,0,0,0,'flat',false);this.batches.add('box',0x718d45,x,y+.14,z,.025,.28,.025,0,0,0,'solid',false);}
  }

  addLandmarks() {
    const light=LANDMARKS?.find(l=>/lighthouse|beacon/i.test(l.kind+' '+l.name));
    if(light && !(PROPS||[]).some(p=>p.kind==='lighthouse')){const x=light.x,z=light.z,y=terrainHeight(x,z);for(let i=0;i<5;i++){const r=2.3-i*.18;this.batches.add('cylinder',i%2?0xc86e52:0xefe3be,x,y+1.3+i*2.5,z,r,2.5,r,0,0,0,'solid');}this.batches.add('cylinder',0x3c6268,x,y+13.0,z,1.8,.45,1.8,0,0,0,'metal');this.batches.add('cylinder',0xb0d1be,x,y+14.1,z,1.3,1.9,1.3,0,0,0,'glass');for(let k=0;k<8;k++){const a=k*TAU/8;this.batches.add('box',0x3b6263,x+Math.sin(a)*1.35,y+14.1,z+Math.cos(a)*1.35,.10,2,.10);}this.batches.add('cone',0x447279,x,y+15.65,z,2,1.25,2,0,0,0,'metal');this.batches.add('cylinder',0xffde85,x,y+14.1,z,.45,.70,.45,0,0,0,'glass');}
    const radio=LANDMARKS?.find(l=>/radio|high|ridge|watch/i.test(l.kind+' '+l.name));
    if(radio && !(PROPS||[]).some(p=>p.kind==='radio')){const x=radio.x,z=radio.z,y=terrainHeight(x,z);for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;this.batches.add('box',0xcbc0a1,x+Math.sin(a)*1.4,y+7,z+Math.cos(a)*1.4,.22,14,.22,0,0,.04,'metal');}for(let i=0;i<6;i++){this.batches.add('box',i%2?0xcb6c52:0xc6c3a4,x,y+1+i*2.2,z,3.3,.12,3.3,0,0,0,'metal');}this.batches.add('cylinder',0x746f61,x,y+17,z,.10,7,.10,0,0,0,'metal');const dish=mesh(new THREE.SphereGeometry(2,16,10,0,Math.PI*2,0,Math.PI*.28),material(0xeee5ca,{side:THREE.DoubleSide}),this.scene,[x+1,y+14,z]);dish.rotation.set(.8,0,.4);this.batches.add('box',0xc8c7aa,x+1,y+14.2,z,.15,2.7,.15,0,0,-.4,'metal');}
    const harbor=LANDMARKS?.find(l=>/harbor|port|dock|yard/i.test(l.kind+' '+l.name));
    if(harbor && !(PROPS||[]).some(p=>p.kind==='crane')){const x=harbor.x,z=harbor.z,y=terrainHeight(x,z);for(const side of [-1,1]){this.batches.add('box',0xcca45a,x+side*5,y+6,z+8,.65,12,.65,0,0,0,'metal');this.batches.add('box',0x9b824f,x+side*5,y+.4,z+8,2.2,.8,3,0,0,0,'metal');}this.batches.add('box',0xdab768,x,y+12,z+8,12,.65,1.1,0,0,0,'metal');this.batches.add('box',0xd1a755,x+5,y+12,z+3,.45,.65,14,0,0,0,'metal');this.batches.add('cylinder',0x596567,x+5,y+8,z-3,.045,8,.045,0,0,0,'metal');this.batches.add('box',0x415d62,x+5,y+4,z-3,1.2,.3,.6,0,0,0,'metal');for(let i=0;i<9;i++)this.batches.add('box',0xf1d080,x-5+i*1.2,y+12.7,z+8,.07,1.2,.07,0,0,0,'metal');}
    for(const l of LANDMARKS||[]){const y=terrainHeight(l.x,l.z);this.addSign(l.name,l.x+5,y,l.z+6);}
  }

  addSign(text,x,y,z) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#365956';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#ddcf9b';ctx.lineWidth=5;ctx.strokeRect(7,7,498,114);ctx.fillStyle='#f0e4bd';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 44px Arial';ctx.fillText(String(text).toUpperCase(),256,67,470);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const sign=mesh(new THREE.PlaneGeometry(3.5,.88),new THREE.MeshStandardMaterial({map:tex,roughness:.8,side:THREE.DoubleSide}),this.scene,[x,y+2,z]);sign.rotation.y=.3;this.batches.add('box',0x7b7351,x,y+.95,z,.16,1.9,.16);
  }

  createStorm() {
    this.storm = new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,128,1,true), new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0},outside:{value:0}},vertexShader:'varying vec3 vWorld;varying vec2 vUv;void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',fragmentShader:[
      'uniform float time;uniform float outside;varying vec3 vWorld;varying vec2 vUv;',
      'void main(){float bands=pow(.5+.5*sin(vWorld.y*.4-time*1.4),9.);float weave=pow(.5+.5*sin(vUv.x*800.+vWorld.y*.28+time*.7),16.);float low=1.-smoothstep(25.,95.,vWorld.y);',
      'vec3 c=mix(vec3(.39,.46,.92),vec3(.66,.75,1.),bands*.6+weave*.3);gl_FragColor=vec4(c,(.13+bands*.12+weave*.08)*low+outside*.06);}'
    ].join('\n')})); this.storm.visible=false;this.storm.renderOrder=4;this.scene.add(this.storm);
    const ringGeo=new THREE.BufferGeometry(),ringVertices=new Float32Array(193*2*3),ringIndices=[];
    for(let i=0;i<192;i++){const n=i*2;ringIndices.push(n,n+1,n+2,n+1,n+3,n+2);}
    ringGeo.setAttribute('position',new THREE.BufferAttribute(ringVertices,3).setUsage(THREE.DynamicDrawUsage));ringGeo.setIndex(ringIndices);
    this.stormRing=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0xc0b5ff,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false}));this.stormRing.visible=false;this.stormRing.frustumCulled=false;this.stormRing.renderOrder=3;this.nextStormRing=0;this.scene.add(this.stormRing);
  }

  updateStormRing(storm) {
    if(this.time<this.nextStormRing)return;this.nextStormRing=this.time+.2;
    const vertices=this.stormRing.geometry.attributes.position;
    for(let i=0;i<=192;i++){const angle=i/192*TAU,cos=Math.cos(angle),sin=Math.sin(angle);
      for(let side=0;side<2;side++){const radius=Math.max(0,storm.radius+(side? .22:-.22)),x=(storm.x||0)+cos*radius,z=(storm.z||0)+sin*radius;vertices.setXYZ(i*2+side,x,Math.max(.08,terrainHeight(x,z))+.11,z);}
    }
    vertices.needsUpdate=true;
  }

  makeWeapon(index = 0, rarityColor = null) {
    const group=new THREE.Group(),gunMetal=material(0x31474b,{roughness:.43,metalness:.58}),grip=material(0x5f6655),accent=material(rarityColor||0xdeb46c,{roughness:.46,metalness:.25});
    const barrelLength=[.52,.24,.42,.82][index]||.5;
    mesh(unitBox,gunMetal,group,[0,0,-.12],[.13,.17,.43]);mesh(unitBox,accent,group,[0,.015,.13],[.12,.14,.23]);
    mesh(unitBox,grip,group,[0,-.15,-.03],[.09,.22,.12]).rotation.x=-.20;
    mesh(unitBox,gunMetal,group,[0,-.16,-.24],[.09,index===1?.25:.19,.13]).rotation.x=.16;
    const barrel=mesh(unitCylinder,gunMetal,group,[0,.03,-.35-barrelLength/2],[.034,barrelLength,.034]);barrel.rotation.x=Math.PI/2;
    mesh(unitBox,accent,group,[0,.045,-.34],[.17,.12,.19]);mesh(unitBox,gunMetal,group,[0,.14,-.08],[.08,.08,.13]);
    if(index===3){const scope=mesh(unitCylinder,gunMetal,group,[0,.19,-.15],[.055,.32,.055]);scope.rotation.x=Math.PI/2;mesh(unitSphere,material(0x7dbbc6,{metalness:.45,roughness:.1}),group,[0,.19,-.32],[.044,.044,.014]);}
    if(index===2){const barrel2=mesh(unitCylinder,gunMetal,group,[.05,-.015,-.35-barrelLength/2],[.028,barrelLength,.028]);barrel2.rotation.x=Math.PI/2;}
    group.userData.muzzleZ=-.35-barrelLength;
    return group;
  }

  makeCharacter(colorIndex=0) {
    const group=new THREE.Group(),color=typeof colorIndex==='number'?PALETTE[Math.abs(colorIndex)%PALETTE.length]:colorIndex;
    const suit=material(color),pants=material(0x3e5353),boots=material(0x314445),skin=material(0xd9ad84),vest=material(0x526865),trim=material(0xf1d49b),visor=material(0x254e59,{metalness:.62,roughness:.17}),straps=material(0x34494a);
    const torso=new THREE.Group();torso.position.y=1.13;group.add(torso);
    mesh(unitCapsule,suit,torso,[0,.05,0],[.23,.22,.17]);mesh(unitBox,vest,torso,[0,.03,-.125],[.43,.46,.13]);mesh(unitBox,trim,torso,[0,.15,-.202],[.065,.09,.025]);
    mesh(unitBox,straps,torso,[0,-.28,0],[.49,.13,.35]);mesh(unitBox,trim,torso,[0,-.28,-.19],[.09,.07,.03]);
    for(const sx of [-1,1]) {mesh(unitBox,straps,torso,[sx*.18,.10,-.188],[.055,.54,.045]);mesh(unitBox,vest,torso,[sx*.16,-.13,-.24],[.13,.17,.10]);}
    mesh(unitCapsule,vest,torso,[0,.03,.24],[.24,.21,.105]);mesh(unitBox,suit,torso,[0,.04,.35],[.34,.32,.10]);mesh(unitBox,trim,torso,[0,.05,.41],[.08,.13,.04]);
    const head=new THREE.Group();head.position.y=.43;torso.add(head);
    mesh(unitSphere,skin,head,[0,0,0],[.225,.245,.22]);mesh(unitSphere,suit,head,[0,.055,.025],[.255,.23,.24]);mesh(unitSphere,visor,head,[0,.015,-.168],[.224,.115,.10]);mesh(unitBox,trim,head,[-.12,.08,-.253],[.1,.018,.018]);
    mesh(unitBox,vest,head,[0,-.18,-.08],[.29,.12,.22]);for(const s of [-1,1])mesh(unitCylinder,boots,head,[s*.254,.015,0],[.085,.07,.085]).rotation.z=Math.PI/2;
    const legs=[],arms=[];
    for(const sx of [-1,1]) {
      const leg=new THREE.Group();leg.position.set(sx*.145,.87,0);group.add(leg);mesh(unitCapsule,pants,leg,[0,-.19,0],[.105,.14,.11]);
      const shin=new THREE.Group();shin.position.y=-.37;leg.add(shin);mesh(unitCapsule,pants,shin,[0,-.17,.012],[.09,.125,.10]);mesh(unitBox,boots,shin,[0,-.36,-.065],[.22,.15,.35]);mesh(unitBox,vest,leg,[0,-.33,-.09],[.14,.17,.08]);legs.push({hip:leg,knee:shin});
      const arm=new THREE.Group();arm.position.set(sx*.30,.25,0);torso.add(arm);mesh(unitCapsule,suit,arm,[0,-.19,0],[.105,.14,.115]);mesh(unitSphere,vest,arm,[0,-.035,0],[.135,.13,.13]);
      const forearm=new THREE.Group();forearm.position.y=-.38;arm.add(forearm);mesh(unitCapsule,suit,forearm,[0,-.125,0],[.085,.09,.09]);mesh(unitSphere,boots,forearm,[0,-.29,0],[.09,.105,.09]);arms.push({upper:arm,lower:forearm});
    }
    const gunPivot=new THREE.Group();gunPivot.position.set(.30,.10,-.35);torso.add(gunPivot);const gun=this.makeWeapon(0);gunPivot.add(gun);
    const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:0xffd779,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));flash.scale.set(.75,.75,.75);flash.position.set(0,.03,-1.0);flash.visible=false;gunPivot.add(flash);
    const glider=new THREE.Group();glider.position.y=3.15;group.add(glider);
    const canopyGeo=new THREE.BufferGeometry(),pos=[],colors=[],indices=[];
    for(let i=0;i<=16;i++){const x=(i/16-.5)*5.5,y=.65*Math.cos(x/5.5*Math.PI);for(const z of [-.82,.82]){pos.push(x,y,z);const cc=new THREE.Color(i%4<2?color:0xf3dfb8);cc.toArray(colors,colors.length);}if(i<16){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}}
    canopyGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));canopyGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));canopyGeo.setIndex(indices);canopyGeo.computeVertexNormals();mesh(canopyGeo,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.8}),glider);
    for(const sx of [-1,1])for(const sz of [-1,1]){const a=new THREE.Vector3(sx*.3,-1.8,0),b=new THREE.Vector3(sx*2.1,.22,sz*.65),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:0x5c6a5d}));glider.add(line);}
    glider.visible=false;
    group.userData={torso,head,legs,arms,gunPivot,gun,weapon:0,flash,glider,walk:0,lastPosition:null,hitMaterial:suit,colorIndex};
    this.scene.add(group);return group;
  }

  updateCharacter(avatar,p,dt,snapshotTime,local=false) {
    const d=avatar.userData;avatar.visible=p.alive!==false;if(!avatar.visible)return;
    if(p.color!==undefined&&p.color!==d.colorIndex){const color=PALETTE[Math.abs(p.color)%PALETTE.length];d.hitMaterial.color.setHex(color);const canopy=d.glider.children.find(o=>o.isMesh);if(canopy?.geometry.attributes.color){const attr=canopy.geometry.attributes.color;for(let i=0;i<attr.count;i++){const c=new THREE.Color(Math.floor(i/2)%4<2?color:0xf3dfb8);attr.setXYZ(i,c.r,c.g,c.b);}attr.needsUpdate=true;}d.colorIndex=p.color;}
    if(!d.lastPosition||Math.hypot(p.x-avatar.position.x,p.z-avatar.position.z)>12){avatar.position.set(p.x,p.y,p.z);d.lastPosition=new THREE.Vector3(p.x,p.y,p.z);}else avatar.position.lerp(tmpV.set(p.x,p.y,p.z),1-Math.exp(-dt*(local?28:18)));
    let yaw=(p.yaw||0)-avatar.rotation.y;yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));avatar.rotation.y+=yaw*(1-Math.exp(-dt*20));
    const speed=Math.hypot(p.vx||0,p.vz||0),moving=clamp(speed/7,0,1.4);d.walk+=dt*(speed>1?9.3+speed*.35:2.2);
    const stride=Math.sin(d.walk)*.65*moving,gliding=!!p.gliding;d.glider.visible=gliding;
    d.legs[0].hip.rotation.x=gliding?.25:stride;d.legs[1].hip.rotation.x=gliding?.45:-stride;d.legs[0].knee.rotation.x=gliding?.3:Math.max(0,-stride)*.85;d.legs[1].knee.rotation.x=gliding?.3:Math.max(0,stride)*.85;
    d.torso.position.y=1.13+Math.abs(Math.cos(d.walk))*moving*.045;d.torso.rotation.z=gliding?Math.sin(this.time*2)*.045:Math.sin(d.walk)*moving*.035;d.head.rotation.x=clamp(p.pitch||0,-.55,.65);
    d.arms[0].upper.rotation.set(gliding?2.7:1.25+(p.pitch||0)*.65,0,gliding?-.42:-.32);d.arms[1].upper.rotation.set(gliding?2.7:1.43+(p.pitch||0)*.65,0,gliding?.42:.12);d.arms[0].lower.rotation.x=gliding?-.3:.35;d.arms[1].lower.rotation.x=gliding?-.3:.23;
    d.gunPivot.visible=!gliding;d.gunPivot.rotation.order='YXZ';d.gunPivot.rotation.x=Number.isFinite(p.aimPitch)?p.aimPitch:(p.pitch||0);
    const gunYaw=Number.isFinite(p.aimYaw)?p.aimYaw-(p.yaw||0):0;d.gunPivot.rotation.y=Math.atan2(Math.sin(gunYaw),Math.cos(gunYaw));
    if((p.weapon||0)!==d.weapon){d.gunPivot.remove(d.gun);this.disposeObject(d.gun);d.gun=this.makeWeapon(p.weapon||0);d.gunPivot.add(d.gun);d.weapon=p.weapon||0;}
    const fired=p.shotAt>0&&snapshotTime-p.shotAt>=0&&snapshotTime-p.shotAt<.085;d.flash.visible=fired;d.flash.position.z=d.gun.userData.muzzleZ;d.flash.material.rotation=this.time*32;d.flash.scale.setScalar(fired?.75:0);d.gun.position.z=fired?.065:0;
    const hit=p.hitAt>0&&snapshotTime-p.hitAt<.16;d.hitMaterial.emissive.setHex(hit?0x824b25:0x000000);
    if(p.reloading){d.gunPivot.rotation.z=.30+Math.sin(this.time*9)*.06;d.arms[0].upper.rotation.x=.5;}else d.gunPivot.rotation.z=0;
    if(p.using){d.gunPivot.visible=false;d.arms[0].upper.rotation.x=1.55;d.arms[1].upper.rotation.x=1.55;}
  }

  makeLoot(item) {
    const group=new THREE.Group(),rarity=RARITY[clamp(Number(item.rarity)||0,0,4)],metal=material(0x4c6767,{metalness:.4,roughness:.48});let body=new THREE.Group();group.add(body);
    if(item.kind==='weapon') {body=this.makeWeapon(item.weapon||0,rarity);body.scale.setScalar(1.45);body.rotation.z=-.17;group.add(body);}
    else if(item.kind==='chest'){const wood=material(0x9b7244),gold=material(0xe8c678,{metalness:.45,roughness:.4});mesh(unitBox,wood,body,[0,.20,0],[1.25,.7,.85]);mesh(unitCylinder,wood,body,[0,.58,0],[.425,1.26,.425]).rotation.z=Math.PI/2;for(const x of [-.43,.43])mesh(unitBox,gold,body,[x,.31,0],[.12,.85,.90]);mesh(unitBox,gold,body,[0,.33,-.46],[.22,.25,.09]);}
    else if(item.kind==='shield'){const bottle=material(0x5bbdcc,{roughness:.22,metalness:.15});mesh(unitCylinder,bottle,body,[0,.08,0],[.22,.55,.22]);mesh(unitCylinder,metal,body,[0,.40,0],[.14,.12,.14]);mesh(unitBox,material(0xd8f4e8),body,[0,.11,-.22],[.20,.24,.025]);}
    else if(item.kind==='medkit'){const red=material(0xd86d52),cream=material(0xf1e3bb);mesh(unitBox,cream,body,[0,.05,0],[.65,.40,.43]);mesh(unitBox,red,body,[0,.05,-.225],[.14,.28,.025]);mesh(unitBox,red,body,[0,.05,-.225],[.35,.11,.026]);mesh(unitBox,metal,body,[0,.31,0],[.25,.12,.08]);}
    else if(item.kind==='materials'){const wood=material(0xbda575);for(let k=0;k<3;k++)mesh(unitBox,wood,body,[0,k*.11,0],[.75,.08,.32]);mesh(unitBox,metal,body,[0,.12,0],[.10,.4,.36]);}
    else {mesh(unitBox,material(0x768470),body,[0,.05,0],[.6,.34,.45]);for(const x of [-.19,0,.19])mesh(unitCylinder,material(0xdbc482,{metalness:.4}),body,[x,.30,0],[.055,.24,.055]);}
    const ring=mesh(new THREE.RingGeometry(.45,.59,24),new THREE.MeshBasicMaterial({color:rarity,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}),group,[0,-.16,0]);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
    const beam=mesh(new THREE.CylinderGeometry(.09,.24,2.8,8,1,true),new THREE.MeshBasicMaterial({color:rarity,transparent:true,opacity:item.kind==='chest'?.14:.07,depthWrite:false,side:THREE.DoubleSide}),group,[0,1.1,0]);beam.castShadow=false;
    group.userData={body,ring,beam,kind:item.kind};this.scene.add(group);return group;
  }

  updateLoot(loot,focus) {
    const ids=new Set();for(const item of loot||[]){if(item.taken||item.active===false)continue;ids.add(item.id);let object=this.lootObjects.get(item.id);if(focus&&Math.hypot(item.x-focus.x,item.z-focus.z)>65){if(object)object.visible=false;continue;}if(!object){object=this.makeLoot(item);this.lootObjects.set(item.id,object);}const base=item.y??terrainHeight(item.x,item.z)+.2;object.position.set(item.x,base+.25,item.z);object.userData.body.position.y=Math.sin(this.time*2+item.x)*.075;object.userData.body.rotation.y=this.time*.48+item.x;object.userData.beam.material.opacity=(item.kind==='chest'?.14:.055)*(1+.2*Math.sin(this.time*2.4+item.z));object.visible=true;}
    for(const [id,object] of this.lootObjects)if(!ids.has(id)){this.scene.remove(object);this.disposeObject(object);this.lootObjects.delete(id);}
  }

  makeBuild(build,preview=false) {
    const group=new THREE.Group(),wood=material(preview?0x8cd2c4:0xbf9d65,preview?{transparent:true,opacity:.36,depthWrite:false}:{}),brace=material(preview?0x8cd2c4:0x7a816d,preview?{transparent:true,opacity:.40,depthWrite:false}:{metalness:.20});
    if(build.type==='ramp'){
      mesh(unitRampSides,wood,group,[0,0,0],[5,3,5]);
      const slope=Math.atan2(3,5),length=Math.hypot(3,5);const surface=mesh(unitBox,wood,group,[0,1.5,0],[5,.16,length]);surface.rotation.x=slope;
      for(const x of [-2.25,2.25]){const rail=mesh(unitBox,brace,group,[x,1.42,0],[.18,.23,length]);rail.rotation.x=slope;}
      for(let i=0;i<10;i++)mesh(unitBox,brace,group,[0,.10+i*.3,2.4-i*.5],[4.95,.055,.08]);
      for(const x of [-2.25,2.25])mesh(unitBox,brace,group,[x,1.5,-2.35],[.17,3,.17]);
      for(const x of [-2.51,2.51])for(let i=0;i<5;i++){const y=.3+i*.5,length=5-y/3*5;mesh(unitBox,brace,group,[x,y,-2.5+length/2],[.035,.045,length]);}
    }else{
      for(let i=0;i<9;i++)mesh(unitBox,wood,group,[-2.22+i*.555,1.5,0],[.54,3,.22]);
      for(const y of [.4,2.6])mesh(unitBox,brace,group,[0,y,.14],[5,.15,.11]);
      const diagonal=mesh(unitBox,brace,group,[0,1.5,.15],[.15,5.2,.10]);diagonal.rotation.z=-Math.atan2(4.5,2.6);
      for(const x of [-2.25,2.25])mesh(unitBox,brace,group,[x,1.5,0],[.18,3,.36]);
    }
    group.position.set(build.x,build.y,build.z);group.rotation.y=build.yaw||0;group.userData={wood,brace};this.scene.add(group);return group;
  }

  updateBuilds(builds,preview) {
    const ids=new Set();for(const b of builds||[]){ids.add(b.id);let object=this.buildObjects.get(b.id);if(!object){object=this.makeBuild(b);this.buildObjects.set(b.id,object);}const health=clamp((b.hp??100)/(b.maxHp||100),0,1);object.userData.wood.color.setHex(0xbf9d65).multiplyScalar(.55+.45*health);}
    for(const [id,object] of this.buildObjects)if(!ids.has(id)){this.scene.remove(object);this.disposeObject(object);this.buildObjects.delete(id);}
    if(preview){const key=preview.type||'wall';if(!this.preview||this.preview.userData.type!==key){if(this.preview){this.scene.remove(this.preview);this.disposeObject(this.preview);}this.preview=this.makeBuild({...preview,type:key},true);this.preview.userData.type=key;}this.preview.visible=true;this.preview.position.set(preview.x,preview.y,preview.z);this.preview.rotation.y=preview.yaw||0;this.preview.userData.wood.color.setHex(preview.valid===false?0xe58068:0x8cd2c4);}else if(this.preview)this.preview.visible=false;
  }

  spawnParticles(x,y,z,color,count=12,force=3) {
    const random=rng((this.time*1000+x*29+z*11)|0);for(let i=0;i<count&&this.particles.length<320;i++){this.particles.push({x,y,z,vx:(random()-.5)*force,vy:random()*force*.7+.6,vz:(random()-.5)*force,life:.35+random()*.55,max:1,size:.035+random()*.09,color:cssColor(color)});}
  }

  processEvents(snapshot) {
    if(this.matchId!==snapshot.id){this.matchId=snapshot.id;this.eventIds.clear();}
    for(const event of snapshot.events||[]){if(this.eventIds.has(event.id))continue;this.eventIds.add(event.id);if(this.eventIds.size>300){const first=this.eventIds.values().next().value;this.eventIds.delete(first);}if(snapshot.time-event.time>.4)continue;
      if(event.type==='shot'&&Number.isFinite(event.toX)){
        const start=new THREE.Vector3(event.x,event.y,event.z),end=new THREE.Vector3(event.toX,event.toY,event.toZ);const delta=end.clone().sub(start),length=delta.length();
        if(length>.01){const tracer=mesh(unitCylinder,new THREE.MeshBasicMaterial({color:0xffdc88,transparent:true,opacity:.75,depthWrite:false}),this.scene,start.clone().add(end).multiplyScalar(.5).toArray(),[.025,length,.025]);tracer.quaternion.setFromUnitVectors(yAxis,delta.normalize());tracer.castShadow=false;this.effects.push({object:tracer,life:.09,max:.09});}
        this.spawnParticles(event.toX,event.toY,event.toZ,0xefce8f,4,2);
      }
      if(event.type==='hit'){const p=snapshot.players?.find(p=>p.id===event.target);if(p)this.spawnParticles(p.x,p.y+1,p.z,p.shield>0?0x85e1e9:0xf2ba72,8,3);}
      if(event.type==='elimination'){const p=snapshot.players?.find(p=>p.id===(event.target??event.player));if(p)this.spawnParticles(p.x,p.y+1,p.z,0xc6e2d5,27,5);}
      if(event.type==='loot'){const p=snapshot.players?.find(p=>p.id===event.player);if(p)this.spawnParticles(p.x,p.y+.8,p.z,0xf1da97,12,2);}
    }
  }

  updateEffects(dt) {
    for(let i=this.effects.length-1;i>=0;i--){const f=this.effects[i];f.life-=dt;f.object.material.opacity=clamp(f.life/f.max,0,1)*.8;if(f.life<=0){this.scene.remove(f.object);f.object.material.dispose();this.effects.splice(i,1);}}
    const obj=new THREE.Object3D();for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){this.particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=5*dt;}
    this.particles.forEach((p,i)=>{obj.position.set(p.x,p.y,p.z);obj.scale.setScalar(p.size*clamp(p.life*3,0,1));obj.rotation.set(p.life*4,p.life*5,0);obj.updateMatrix();this.particleMesh.setMatrixAt(i,obj.matrix);this.particleMesh.setColorAt(i,p.color);});this.particleMesh.count=this.particles.length;this.particleMesh.instanceMatrix.needsUpdate=true;if(this.particleMesh.instanceColor)this.particleMesh.instanceColor.needsUpdate=true;
  }

  cameraObstruction(origin,end,builds) {
    let fraction=1;const dx=end.x-origin.x,dy=end.y-origin.y,dz=end.z-origin.z;
    const boxes=(COLLIDERS||[]).concat((builds||[]).map(b=>({x:b.x,z:b.z,y:b.y,w:5,d:b.type==='ramp'?5:.35,h:3,yaw:b.yaw||0})));
    for(const c of boxes){if(Math.abs(c.x-origin.x)>12||Math.abs(c.z-origin.z)>12)continue;const cos=Math.cos(c.yaw||0),sin=Math.sin(c.yaw||0);const ox=(origin.x-c.x)*cos-(origin.z-c.z)*sin,oz=(origin.x-c.x)*sin+(origin.z-c.z)*cos;const vx=dx*cos-dz*sin,vz=dx*sin+dz*cos;let lo=0,hi=fraction;
      for(const [o,v,min,max]of[[ox,vx,-c.w/2-.16,c.w/2+.16],[origin.y,dy,c.y-.16,c.y+c.h+.16],[oz,vz,-c.d/2-.16,c.d/2+.16]]){if(Math.abs(v)<1e-7){if(o<min||o>max){lo=2;break;}}else{let a=(min-o)/v,b=(max-o)/v;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)break;}}
      if(lo<=hi&&lo>0)fraction=Math.min(fraction,Math.max(.08,lo-.06));
    }
    for(let i=1;i<=18;i++){const t=i/18*fraction,x=origin.x+dx*t,z=origin.z+dz*t,y=origin.y+dy*t;if(y<terrainHeight(x,z)+.22){fraction=Math.max(.08,(i-1)/18*fraction);break;}}
    return fraction;
  }

  updateCamera(snapshot,dt,options) {
    const {localId=0,yaw=0,pitch=-.12,aim=false,menu=false}=options;
    const player=snapshot.players?.find(p=>p.id===localId)||snapshot.players?.[0];
    if(menu){
      const angle=Math.sin(this.time*.045)*.08;this.camera.position.set(28+Math.sin(angle)*22,12.4,40+Math.cos(angle)*1.5);this.camera.lookAt(1.5,7,-10);this.camera.fov=58;
      if(!this.menuHero){this.menuHero=this.makeCharacter(player?.color||0);this.menuHero.scale.setScalar(1.65);}
      const hero={...player,x:18,y:terrainHeight(18,29),z:29,yaw:3.8,pitch:.02,vx:0,vz:0,alive:true,gliding:false,weapon:0,shotAt:-99};this.updateCharacter(this.menuHero,hero,dt,0);this.menuHero.visible=true;this.cameraReady=false;
    }else if(player){
      if(this.menuHero)this.menuHero.visible=false;
      const cp=Math.cos(pitch),forward=new THREE.Vector3(-Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
      const target=new THREE.Vector3(player.x,player.y+(player.gliding?1.25:1.40),player.z),distance=player.gliding?8.5:aim?2.6:5.2,shoulder=aim?.53:.82;
      const desired=target.clone().addScaledVector(forward,-distance).addScaledVector(right,shoulder);if(player.gliding)desired.y+=1.3;
      const fraction=this.cameraObstruction(target,desired,snapshot.builds);desired.lerpVectors(target,desired,fraction);
      if(!this.cameraReady||this.lastMenu!==menu||this.lastLocalId!==localId){this.camera.position.copy(desired);this.cameraReady=true;}else this.camera.position.lerp(desired,1-Math.exp(-dt*22));
      const look=target.clone().addScaledVector(forward,60);this.camera.lookAt(look);this.camera.fov=lerp(this.camera.fov,aim?52:player.gliding?73:67,1-Math.exp(-dt*12));
    }
    this.camera.updateProjectionMatrix();this.lastMenu=menu;this.lastLocalId=localId;
    const focus=menu?new THREE.Vector3(0,6,0):player?new THREE.Vector3(player.x,player.y,player.z):new THREE.Vector3();
    this.sun.position.set(focus.x-55,focus.y+95,focus.z+45);this.sun.target.position.copy(focus);this.sun.target.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
  }

  render(snapshot,dt,options={}) {
    if(!snapshot)return;dt=Math.min(Math.max(dt||.016,.001),.10);this.time+=dt;this.resize();
    this.water.material.uniforms.time.value=this.time;this.foam.material.uniforms.time.value=this.time;this.windUniform.value=this.time;this.clouds.rotation.y=this.time*.00065;
    const players=snapshot.players||[];for(const p of players){let avatar=this.characters.get(p.id);if(!avatar){avatar=this.makeCharacter(p.color??p.id);this.characters.set(p.id,avatar);}this.updateCharacter(avatar,p,dt,snapshot.time||0,p.id===options.localId);avatar.visible=avatar.visible&&!options.menu;}
    this.updateLoot(snapshot.loot,options.menu?{x:0,z:0}:players.find(p=>p.id===options.localId)||players[0]);this.updateBuilds(snapshot.builds,options.buildPreview);this.processEvents(snapshot);this.updateEffects(dt);this.updateCamera(snapshot,dt,options);
    if(!options.menu){const local=this.characters.get(options.localId),p=players.find(p=>p.id===options.localId);if(local&&p&&this.camera.position.distanceTo(tmpV.set(p.x,p.y+1.15,p.z))<1.05)local.visible=false;}
    const storm=snapshot.storm,visible=!!storm&&!options.menu&&snapshot.phase!=='lobby';this.storm.visible=this.stormRing.visible=visible;
    if(visible){this.storm.position.set(storm.x||0,45,storm.z||0);this.storm.scale.set(storm.radius,120,storm.radius);this.storm.material.uniforms.time.value=this.time;this.updateStormRing(storm);const p=players.find(p=>p.id===options.localId);const outside=p&&Math.hypot(p.x-storm.x,p.z-storm.z)>storm.radius;this.storm.material.uniforms.outside.value=outside?1:0;this.scene.fog.color.setHex(outside?0xa5a2d6:0xb8d6d5);this.scene.fog.near=outside?30:95;this.scene.fog.far=outside?180:360;}else{this.scene.fog.color.setHex(0xb8d6d5);this.scene.fog.near=95;this.scene.fog.far=360;}
    this.renderer.render(this.scene,this.camera);
  }

  resize() {
    const width=this.canvas.clientWidth||window.innerWidth,height=this.canvas.clientHeight||window.innerHeight;
    if(this.width===width&&this.height===height)return;this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();
  }

  setQuality(value='auto') {
    this.quality=value;const low=value==='low'||(value==='auto'&&this.mobile),pixelRatio=Math.min(window.devicePixelRatio||1,low?1.15:1.65);
    this.renderer.setPixelRatio(pixelRatio);this.renderer.shadowMap.enabled=!low;this.sun.shadow.mapSize.set(low?1024:2048,low?1024:2048);if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}if(this.grass)this.grass.visible=value!=='low';
    this.width=0;this.resize();
  }

  project(x,y,z) { const vector=tmpW.set(x,y,z).project(this.camera);return{x:(vector.x*.5+.5)*this.width,y:(-.5*vector.y+.5)*this.height,visible:vector.z>=-1&&vector.z<=1&&Math.abs(vector.x)<1.2&&Math.abs(vector.y)<1.2}; }
  disposeObject(object) { object.traverse(o=>{if(o.isMesh||o.isSprite||o.isLine){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials||[])m?.dispose();if(o.geometry&&![unitBox,unitSphere,unitIco,unitCylinder,unitCone,unitPlane,unitCapsule,unitRoof,unitRampSides].includes(o.geometry))o.geometry.dispose();}}); }
  dispose() { this.scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});this.noise.dispose();this.glow.dispose();this.renderer.dispose(); }
}
