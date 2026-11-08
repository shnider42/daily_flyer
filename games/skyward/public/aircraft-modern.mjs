import * as THREE from './vendor/three.module.js';
import {mat, mesh, box, ellipsoid, cylinder, beam, loft, wing, ring} from './model-parts.mjs';

// All dimensions are metres. Aircraft face +Z; +Y is up and pilot-right is -X.
// These are deliberately different airframes, not skins over one generic jet.
const TAU = Math.PI * 2;
const CHORD_STEPS = [0, .015, .045, .09, .16, .25, .37, .5, .64, .77, .88, .95, 1];

function tint(color, target, amount) {
  return `#${new THREE.Color(color).lerp(new THREE.Color(target), amount).getHexString()}`;
}

function materials(palette, stealth = false) {
  const color = palette.body || '#8997a1';
  return {
    body: mat(color, stealth ? .73 : .61, .18, {flatShading: stealth}),
    wing: mat(palette.wing || tint(color, '#c3cad0', .08), .68, .14),
    belly: mat(tint(color, '#cbd0d1', .22), .75, .1),
    edge: mat(tint(color, '#e1e5e4', .14), .65, .15),
    panel: mat(tint(color, '#27353e', .32), .77, .12),
    radome: mat(tint(color, '#26333d', .44), .84, .02),
    dark: mat('#14212a', .83, .04, {side: THREE.DoubleSide}),
    metal: mat('#758088', .38, .69),
    nozzle: mat('#434c52', .5, .7),
    glass: mat(stealth ? '#686550' : '#355564', .17, .47),
    frame: mat(tint(color, '#26333d', .48), .54, .24),
    rubber: mat('#20292c', .91, .02),
    store: mat('#c7cecc', .67, .12),
    marking: mat(palette.enemy ? '#7e4c3c' : tint(palette.accent || color, '#d4dad9', .14), .84, .05),
  };
}

function detailOf(data) { return data.detail !== false; }
function sidesOf(data) { return detailOf(data) ? 32 : 16; }

function geometry(positions, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (indices) g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function localGroup(parent, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const group = new THREE.Group();
  group.position.set(...position); group.rotation.set(...rotation); parent.add(group);
  return group;
}

function fuselage(group, stations, material, data, x = 0) {
  const body = loft(group, stations, material, sidesOf(data));
  body.position.x = x;
  return body;
}

function openEnds(object, back = false, front = false) {
  const g=object.geometry,p=g.attributes.position,index=g.index,kept=[];
  g.computeBoundingBox();
  const min=g.boundingBox.min.z,max=g.boundingBox.max.z;
  for(let i=0;i<index.count;i+=3) {
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    const at=z=>Math.abs(p.getZ(a)-z)<.00001&&Math.abs(p.getZ(b)-z)<.00001&&Math.abs(p.getZ(c)-z)<.00001;
    if((back&&at(min))||(front&&at(max)))continue;
    kept.push(a,b,c);
  }
  g.setIndex(kept);
  return object;
}

function foilY(station, chord) {
  const [,,, y, thickness] = station;
  const profile = .2969 * Math.sqrt(chord) - .126 * chord - .3516 * chord ** 2 + .2843 * chord ** 3 - .1036 * chord ** 4;
  return y + thickness * (.025 + 4.8 * Math.max(0, profile)) + thickness * .045 * Math.sin(chord * Math.PI);
}

// Spanwise airfoil sections permit a real kink, dihedral, anhedral and washout.
// Each station is [positive span, leading Z, trailing Z, centre Y, thickness].
function foil(group, stations, side, material, data) {
  const chord = detailOf(data) ? CHORD_STEPS : [0, .045, .16, .37, .64, .88, 1];
  const positions = [], indices = [], n = chord.length, count = stations.length * n;
  for (const surface of [1, -1]) for (const station of stations) {
    for (const t of chord) {
      const camber = station[4] * .045 * Math.sin(t * Math.PI);
      const half = foilY(station, t) - station[3] - camber;
      positions.push(side * station[0], station[3] + camber + surface * half, THREE.MathUtils.lerp(station[1], station[2], t));
    }
  }
  const tri = (a, b, c, reverse = false) => {
    if ((side < 0) !== reverse) indices.push(a, c, b); else indices.push(a, b, c);
  };
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = a + n, c = a + 1, d = b + 1;
    tri(a, b, c); tri(b, d, c);
    tri(a + count, b + count, c + count, true); tri(b + count, d + count, c + count, true);
  }
  // Close the leading/trailing edges and the root/tip without zero-area ends.
  for (let i = 0; i < stations.length - 1; i++) {
    for (const j of [0, n - 1]) {
      const a = i * n + j, b = a + n;
      tri(a, a + count, b, j !== 0); tri(b, a + count, b + count, j !== 0);
    }
  }
  for (const i of [0, stations.length - 1]) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = a + 1;
    tri(a, b, a + count, i !== 0); tri(b, b + count, a + count, i !== 0);
  }
  return mesh(group, geometry(positions, indices), material);
}

function foilSeam(group, stations, side, chord, material, data, start = 0) {
  if (!detailOf(data)) return;
  for (let i = start; i < stations.length - 1; i++) {
    const point = s => [side * s[0], foilY(s, chord) + .012, THREE.MathUtils.lerp(s[1], s[2], chord)];
    beam(group, point(stations[i]), point(stations[i + 1]), .016, material);
  }
}

function fin(group, outline, thickness, material, x = 0, y = 0, cant = 0) {
  // The input is a side elevation [height, Z]. A thin wing becomes a fin.
  const f = wing(group, outline, thickness, material);
  f.rotation.z = Math.PI / 2 - cant;
  f.position.set(x, y, 0);
  return f;
}

function canopy(group, stations, m, data, bows = [], spine = false) {
  const radial = detailOf(data) ? 20 : 10, positions = [], indices = [];
  for (const [z, width, height, base] of stations) for (let i = 0; i <= radial; i++) {
    const angle = Math.PI * i / radial;
    positions.push(Math.cos(angle) * width * .5, base + Math.sin(angle) * height, z);
  }
  for (let j = 0; j < stations.length - 1; j++) for (let i = 0; i < radial; i++) {
    const a = j * (radial + 1) + i, b = a + 1, c = a + radial + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  mesh(group, geometry(positions, indices), m.glass);
  for (const side of [-1, 1]) for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    beam(group, [side * a[1] * .5, a[3] + .01, a[0]], [side * b[1] * .5, b[3] + .01, b[0]], .046, m.frame);
  }
  for (const index of bows) {
    const [z, width, height, base] = stations[index];
    const segments = detailOf(data) ? 12 : 6;
    for (let i = 0; i < segments; i++) {
      const at = j => [Math.cos(Math.PI * j / segments) * (width * .5 + .012), base + Math.sin(Math.PI * j / segments) * (height + .012), z];
      beam(group, at(i), at(i + 1), .042, m.frame);
    }
  }
  if (spine) for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    beam(group, [0, a[3] + a[2] + .012, a[0]], [0, b[3] + b[2] + .012, b[0]], .026, m.frame);
  }
}

function fan(group, radius, z, m, data, blades = 16) {
  mesh(group, new THREE.CircleGeometry(radius, sidesOf(data)), m.dark, 0, 0, z);
  if (detailOf(data)) for (let i = 0; i < blades; i++) {
    const angle = TAU * i / blades;
    const blade = box(group, [radius * .11, radius * .56, .025], m.metal,
      [Math.sin(angle) * radius * .57, Math.cos(angle) * radius * .57, z + .018]);
    blade.rotation.z = -angle - .36;
  }
  cylinder(group, .025, radius * .22, radius * .25, m.nozzle, [0, 0, z + radius * .12], [Math.PI / 2, 0, 0], detailOf(data) ? 24 : 12);
}

function roundDuct(group, position, radii, depth, m, data, options = {}) {
  const g = localGroup(group, position, options.rotation || [0, 0, 0]);
  g.scale.set(radii[0], radii[1], 1);
  const sides = sidesOf(data), outer = options.outer || m.body;
  mesh(g, new THREE.CylinderGeometry(1, options.rearScale || .98, depth, sides, 1, true), outer, 0, 0, -depth * .5, [Math.PI / 2, 0, 0]);
  mesh(g, new THREE.CylinderGeometry(.84, .68, depth * .9, sides, 1, true), m.dark, 0, 0, -depth * .45, [Math.PI / 2, 0, 0]);
  ring(g, 1.015, .84, options.lip || m.edge, [0, 0, .008], [0, 0, 0], sides);
  if (options.fan) fan(g, .69, -depth * .84, m, data, options.blades || 18);
  else mesh(g, new THREE.CircleGeometry(.7, sides), m.dark, 0, 0, -depth * .87);
  return g;
}

// The mouth and throat are separate geometry: an opening is never a painted cap.
function duct(group, outline, depth, m, position, rotation = [0, 0, 0], lip = m.edge) {
  const g = localGroup(group, position, rotation), n = outline.length;
  const wall = [], front = [], inside = [];
  const quad = (array, a, b, c, d) => array.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = outline[i], b = outline[j];
    const ai = [a[0] * .84, a[1] * .84, .016], bi = [b[0] * .84, b[1] * .84, .016];
    const ao = [a[0], a[1], 0], bo = [b[0], b[1], 0];
    const ar = [a[0] * .95, a[1] * .95, -depth], br = [b[0] * .95, b[1] * .95, -depth];
    quad(front, ao, bo, bi, ai); quad(wall, bo, ao, ar, br);
    quad(inside, ai, bi, [b[0] * .63, b[1] * .63, -depth], [a[0] * .63, a[1] * .63, -depth]);
  }
  mesh(g, geometry(wall), m.body); mesh(g, geometry(front), lip); mesh(g, geometry(inside), m.dark);
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p[0] * .64, p[1] * .64)));
  mesh(g, new THREE.ShapeGeometry(shape), m.dark, 0, 0, -depth + .005);
  return g;
}

function flameMaterial() {
  return mat('#a5c7f1', .45, 0, {emissive: '#527cdb', emissiveIntensity: 1.6, transparent: true, opacity: .28, depthWrite: false});
}

function roundNozzle(group, position, radius, m, data) {
  const g = roundDuct(group, position, [radius, radius], .9, m, data,
    {rotation: [0, Math.PI, 0], outer: m.nozzle, lip: m.metal, rearScale: 1.13});
  if (detailOf(data)) for (let i = 0; i < 18; i++) {
    const a = i * TAU / 18;
    beam(g, [Math.cos(a) * 1.005, Math.sin(a) * 1.005, -.02], [Math.cos(a) * 1.1, Math.sin(a) * 1.1, -.72], .025, m.metal);
  }
  const fire = mesh(group, new THREE.ConeGeometry(radius * .7, 1.8, detailOf(data) ? 20 : 10, 1, true), flameMaterial(),
    position[0], position[1], position[2] - .84, [-Math.PI / 2, 0, 0]);
  fire.userData.animated = true; fire.userData.minThrottle = .78; fire.visible = false;
  data.exhausts.push(fire);
  return g;
}

function rectangularNozzle(group, x, y, z, m, data) {
  const outline = [[-.81, -.27], [.81, -.27], [.81, .27], [-.81, .27]];
  duct(group, outline, .94, {...m, body: m.nozzle}, [x, y, z], [0, Math.PI, 0], m.metal);
  // Broad upper and lower vectoring petals, with side hinges and no round tube.
  for (const side of [-1, 1]) {
    box(group, [1.77, .075, .64], m.nozzle, [x, y + side * .29, z + .08], [side * .055, 0, 0]);
    if (detailOf(data)) for (let j = -3; j <= 3; j++) box(group, [.016, .012, .6], m.metal, [x + j * .23, y + side * .334, z + .08]);
  }
  const positions = [
    -.63, 0, -.18, .63, 0, -.18, .04, 1.7, -.025,
    -.63, 0, -.18, .04, 1.7, -.025, -.04, 1.7, -.025,
    .63, 0, .18, -.63, 0, .18, -.04, 1.7, .025,
    .63, 0, .18, -.04, 1.7, .025, .04, 1.7, .025,
    -.63, 0, .18, -.63, 0, -.18, -.04, 1.7, -.025,
    -.63, 0, .18, -.04, 1.7, -.025, -.04, 1.7, .025,
    .63, 0, -.18, .63, 0, .18, .04, 1.7, .025,
    .63, 0, -.18, .04, 1.7, .025, .04, 1.7, -.025,
  ];
  const fire = mesh(group, geometry(positions), flameMaterial(), x, y, z - .04, [-Math.PI / 2, 0, 0]);
  fire.userData.animated = true; fire.userData.minThrottle = .78; fire.visible = false; data.exhausts.push(fire);
}

function wheel(group, x, y, z, radius, width, m, data) {
  const tire = mesh(group, new THREE.TorusGeometry(radius * .74, radius * .26, detailOf(data) ? 8 : 5, detailOf(data) ? 28 : 16), m.rubber,
    x, y, z, [0, Math.PI / 2, 0]);
  tire.scale.z = width / (radius * .52);
  cylinder(group, radius * .51, radius * .51, width * .94, m.metal, [x, y, z], [0, 0, Math.PI / 2], detailOf(data) ? 20 : 10);
  cylinder(group, radius * .2, radius * .2, width * 1.06, m.nozzle, [x, y, z], [0, 0, Math.PI / 2], 12);
}

function landingGear(group, legs, m, data) {
  const g = localGroup(group); g.name = 'gear'; g.userData.animated = true;
  for (const leg of legs) {
    const {x, z, y = -1.45, radius = .36, width = .25, top = [x * .76, -.38, z - .2], dual = false, bogie = false} = leg;
    beam(g, top, [x, y + .1, z], .11, m.metal);
    if (detailOf(data)) {
      beam(g, [top[0], top[1], top[2] - .42], [x, y + .36, z], .065, m.nozzle);
      box(g, [.2, .55, .055], m.belly, [top[0], top[1] - .27, top[2] - .06], [-.16, 0, 0]);
    }
    const xs = dual ? [-width * .68, width * .68] : [0];
    const zs = bogie ? [-radius * .88, radius * .88] : [0];
    for (const dx of xs) for (const dz of zs) wheel(g, x + dx, y, z + dz, radius, width, m, data);
  }
  data.gear = g; data.fixedGear = false;
}

function missile(group, x, y, z, length, radius, m, data) {
  const g = localGroup(group, [x, y, z]), h = length / 2;
  loft(g, [[-h, radius * 1.65, radius * 1.65], [-h * .72, radius * 2, radius * 2], [h * .65, radius * 2, radius * 2], [h * .88, radius * .95, radius * .95], [h, .012, .012]], m.store, detailOf(data) ? 16 : 10);
  for (let i = 0; i < 4; i++) {
    const f = wing(g, [[radius * .65, -h * .36], [radius * 3.2, -h * .69], [radius * 3.2, -h * .91], [radius * .65, -h * .83]], .025, m.panel);
    f.rotation.z = i * Math.PI / 2;
    if (detailOf(data)) {
      const nose = wing(g, [[radius * .7, h * .51], [radius * 2.1, h * .32], [radius * 1.9, h * .15], [radius * .7, h * .18]], .018, m.edge);
      nose.rotation.z = i * Math.PI / 2;
    }
  }
  ring(g, radius * 1.005, radius * .94, m.marking, [0, 0, h * .55], [0, 0, 0], 12);
  return g;
}

function fuelTank(group, x, y, z, length, radius, m, data) {
  const g = localGroup(group, [x, y, z]);
  loft(g, [[-length * .5, .04, .04], [-length * .34, radius * 1.6, radius * 1.6], [-length * .12, radius * 2, radius * 2], [length * .24, radius * 1.9, radius * 1.9], [length * .42, radius, radius], [length * .5, .04, .04]], m.belly, detailOf(data) ? 24 : 12);
  return g;
}

function pylon(group, x, y, z, m, length = .85, height = .4) {
  fin(group, [[0, z + length * .5], [-height, z + length * .25], [-height, z - length * .48], [0, z - length * .5]], .13, m.panel, x, y);
}

function navLights(group, span, y, z, data) {
  if (!detailOf(data)) return;
  // Pilot-right is -X: starboard green, port red.
  for (const side of [-1, 1]) {
    const color = side < 0 ? '#4caa8b' : '#c75d4b';
    const light = mat(color, .25, .08, {emissive: color, emissiveIntensity: .65});
    ellipsoid(group, [.065, .045, .12], light, [side * span, y, z], 1);
  }
}

function panelPath(group, points, m, data, width = .018) {
  if (!detailOf(data)) return;
  for (let i = 0; i < points.length - 1; i++) beam(group, points[i], points[i + 1], width, m.panel);
}

function f4(group, palette, data) {
  const m = materials(palette);
  fuselage(group, [[-8.75,1.5,1.15,-.05],[-7.4,2.1,1.65,.02],[-4.5,2.45,1.85,0],[-1,2.5,1.95,0],[1.6,2.35,2.05,.06],[2.5,1.5,1.95,.08],[3.8,1.45,1.85,.08],[5.7,1.26,1.4,.04],[6.9,.95,1.03,-.03]],m.body,data);
  fuselage(group, [[6.65,1.03,1.1,-.03],[7.4,.86,.88,-.08],[8.4,.5,.58,-.13],[9.6,.025,.04,-.16]],m.radome,data);
  fuselage(group, [[5.7,.54,.46,-.63],[7.1,.57,.47,-.69],[8.7,.3,.28,-.62],[9.25,.15,.13,-.53]],m.belly,data);
  cylinder(group,.075,.09,.22,m.nozzle,[0,-.53,9.3],[Math.PI/2,0,0],16);
  canopy(group, [[1.1,.56,.12,.88],[1.7,.91,.72,.92],[2.7,1.03,1.05,.96],[3.45,1.04,.91,1],[4.15,1.03,.91,1],[5.15,.85,.92,.92],[5.9,.5,.28,.84],[6.15,.16,.04,.82]],m,data,[1,3,5,6],true);
  const main = [[.65,2.1,-3.2,-.31,.3],[2.45,.66,-3.6,-.29,.23],[3.75,-.66,-3.86,-.26,.17],[5.855,-2.05,-3.62,.22,.09]];
  const tail = [[.43,-5.7,-8.55,.15,.17],[1.7,-6.55,-8.91,-.3,.13],[3.18,-7.7,-9.25,-.94,.06]];
  for (const side of [-1,1]) {
    fuselage(group,[[-8.7,1.1,1.15,-.3],[-6.5,1.35,1.55,-.14],[-1.8,1.22,1.6,-.01],[2.38,1.06,1.55,.02]],m.body,data,side*1.02);
    duct(group,[[-.53,-.66],[.53,-.66],[.55,.68],[-.44,.79]],1.35,m,[side*1.2,.02,3.88]);
    box(group,[.055,1.55,2.2],m.edge,[side*.87,.02,3.02],[0,side*.035,0]);
    foil(group,main,side,m.wing,data); foilSeam(group,main,side,.76,m.panel,data,1);
    foil(group,tail,side,m.wing,data); foilSeam(group,tail,side,.7,m.panel,data);
    roundNozzle(group,[side*.69,-.23,-9.6],.56,m,data);
    pylon(group,side*2.65,-.33,-.18,m,1.3,.43);
    missile(group,side*2.65,-.91,-.02,3.15,.12,m,data);
    if(detailOf(data)) {
      missile(group,side*.57,-1.04,1.0,3.55,.15,m,data);
      pylon(group,side*4.25,-.14,-2.1,m,1.1,.45);
      fuelTank(group,side*4.25,-.84,-1.55,4.1,.35,m,data);
    }
  }
  fin(group,[[.08,-4.3],[.9,-5.25],[2.7,-6.8],[2.62,-7.88],[.2,-9.0]],.17,m.body,0,.49);
  panelPath(group,[[.1,2.84,-7.58],[.1,1.12,-8.63]],m,data,.025);
  landingGear(group,[{x:-1.45,z:-.7,radius:.4},{x:1.45,z:-.7,radius:.4},{x:0,z:4.25,radius:.3,dual:true,width:.18}],m,data);
  navLights(group,5.78,.28,-2.8,data);
  data.span=11.71;data.length=19.2;
}

function f15(group,palette,data) {
  const m=materials(palette);
  fuselage(group,[[-8.9,2.55,1.05,.03],[-6.2,3.3,1.5,.02],[-2.4,3.8,1.6,.06],[.7,2.4,1.65,.1],[1.95,1.65,1.65,.1],[3.5,1.5,1.72,.18],[5.25,1.5,1.65,.13],[6.9,1.04,1.15,.02]],m.body,data);
  fuselage(group,[[6.7,1.1,1.19,.02],[7.75,.8,.83,-.03],[8.8,.43,.48,-.06],[9.72,.018,.025,-.07]],m.radome,data);
  canopy(group,[[3.5,.72,.11,.91],[4.0,1.1,.68,.97],[4.65,1.16,.94,1.0],[5.5,.99,.91,.94],[6.2,.7,.43,.8],[6.6,.22,.06,.69]],m,data,[1,4],false);
  const main=[[1.95,2.85,-3.4,.03,.34],[2.65,2.0,-3.55,.02,.26],[4.55,.2,-3.58,.04,.16],[6.5,-1.35,-3.35,.1,.08]];
  const tail=[[1.15,-5.15,-8.75,.04,.21],[2.45,-5.95,-9.1,.07,.14],[4.08,-7.28,-9.35,.1,.065]];
  for(const side of[-1,1]) {
    openEnds(fuselage(group,[[-9.3,1.35,1.28,-.16],[-7.25,1.6,1.62,-.09],[-3.8,1.68,1.72,.02],[.5,1.64,1.66,.01],[1.98,1.56,1.5,.05]],m.body,data,side*1.12),true);
    duct(group,[[-.68,-.7],[.61,-.7],[.73,.74],[-.7,.74]],1.75,m,[side*1.2,.04,3.78],[0,side*.025,0]);
    box(group,[1.57,.09,1.6],m.edge,[side*1.2,.81,3.0],[-.08,0,0]);
    foil(group,main,side,m.wing,data);foilSeam(group,main,side,.76,m.panel,data,1);
    foil(group,tail,side,m.wing,data);foilSeam(group,tail,side,.73,m.panel,data);
    fin(group,[[.03,-4.4],[2.85,-5.76],[3.04,-7.47],[.2,-8.75]],.17,m.body,side*1.55,.61,side*.055);
    roundNozzle(group,[side*1.12,-.16,-9.72],.66,m,data);
    pylon(group,side*2.7,-.16,.25,m,1.3,.44);
    missile(group,side*2.7,-.82,.5,3.5,.14,m,data);
    if(detailOf(data))missile(group,side*3.32,-.74,-.25,2.9,.11,m,data);
    panelPath(group,[[side*1.7,.94,-4.65],[side*1.7,.94,-7.7]],m,data);
  }
  if(detailOf(data)) {
    pylon(group,0,-.82,-.7,m,1.3,.26);fuelTank(group,0,-1.27,-.8,4.6,.37,m,data);
    box(group,[.04,.14,.6],m.dark,[-1.53,.73,2.7]);
    panelPath(group,[[-.55,.92,2.45],[-.55,.95,.15],[.55,.95,.15],[.55,.92,2.45]],m,data);
  }
  landingGear(group,[{x:-1.35,z:-1.7,radius:.43},{x:1.35,z:-1.7,radius:.43},{x:0,z:4.1,radius:.31}],m,data);
  navLights(group,6.43,.16,-2.1,data);
  data.span=13;data.length=19.44;
}

function f16(group,palette,data) {
  const m=materials(palette);
  const body=openEnds(fuselage(group,[[-7.1,1.28,1.2,-.04],[-5.4,1.5,1.45,.02],[-2.5,1.7,1.68,.05],[.1,1.81,1.7,.03],[1.45,1.75,1.65,.04],[2.35,1.65,1.62,.06],[3.35,1.45,1.48,.03],[4.15,1.23,1.3,.03],[5.0,.94,.94,0]],m.body,data),true);
  // Leave the intake's internal roof above its throat instead of intersecting it
  // with the rounded main fuselage's belly.
  const bp=body.geometry.attributes.position;
  for(let i=0;i<bp.count;i++)if(bp.getZ(i)>1.4&&bp.getZ(i)<3.4&&bp.getY(i)<-.19)bp.setY(i,-.19);
  body.geometry.computeVertexNormals();
  fuselage(group,[[4.84,1.0,1.01,0],[5.75,.76,.74,-.03],[6.7,.39,.39,-.08],[7.53,.016,.022,-.1]],m.radome,data);
  // The characteristic chin intake is below the canopy, with an open oval throat.
  fuselage(group,[[-3.7,.86,.75,-.4],[-.8,1.36,1.03,-.63],[1.45,1.44,1.07,-.66]],m.belly,data);
  roundDuct(group,[0,-.7,3.12],[.73,.52],1.6,m,data,{rearScale:.92});
  box(group,[.12,.2,.58],m.body,[0,-.2,2.9]);
  canopy(group,[[1.12,.38,.1,.8],[1.6,.86,.62,.88],[2.35,1.03,.92,.89],[3.15,1.01,.96,.85],[3.8,.86,.81,.79],[4.35,.46,.31,.68],[4.5,.16,.03,.63]],m,data,[1,5]);
  const main=[[.65,1.64,-3.05,-.12,.27],[1.75,1.1,-3.11,-.1,.21],[3.2,-.04,-3.12,-.05,.14],[4.8,-1.4,-2.98,.03,.065]];
  const tail=[[.54,-4.06,-6.98,.02,.16],[1.4,-4.7,-7.21,.04,.12],[2.58,-5.75,-7.35,.06,.055]];
  const strake=[[.48,4.12,-1.15,.12,.14],[.95,3.22,-1.24,.13,.11],[1.47,1.55,-1.2,.12,.055],[2.1,.05,-.85,.04,.035]];
  for(const side of[-1,1]) {
    foil(group,strake,side,m.body,data);foil(group,main,side,m.wing,data);foilSeam(group,main,side,.75,m.panel,data,1);
    foil(group,tail,side,m.wing,data);foilSeam(group,tail,side,.73,m.panel,data);
    box(group,[.11,.13,1.75],m.panel,[side*4.85,.02,-2.13]);
    missile(group,side*4.87,.01,-1.85,2.82,.105,m,data);
    fin(group,[[0,-4.0],[-.66,-4.8],[-.65,-6.13],[0,-6.42]],.09,m.body,side*.63,-.45,side*-.22);
    if(detailOf(data)) {
      pylon(group,side*2.65,-.14,-1.0,m,1,.4);
      missile(group,side*2.65,-.75,-.55,3.1,.13,m,data);
    }
  }
  fin(group,[[0,-1.25],[.5,-2.56],[2.55,-4.17],[2.43,-5.88],[.1,-6.7]],.17,m.body,0,.62);
  panelPath(group,[[.1,2.88,-5.48],[.1,1.15,-6.25]],m,data,.024);
  roundNozzle(group,[0,-.04,-7.53],.64,m,data);
  if(detailOf(data)) {pylon(group,0,-.91,-1.6,m,1.1,.2);fuelTank(group,0,-1.27,-1.7,3.65,.32,m,data);}
  landingGear(group,[{x:-1.03,z:-1.6,radius:.34},{x:1.03,z:-1.6,radius:.34},{x:0,z:2.48,radius:.26,y:-1.4,top:[0,-.62,2.1]}],m,data);
  data.span=9.96;data.length=15.06;
}

function angularBody(group,stations,material,x=0) {
  // Eight longitudinal chines, with broad upper/lower panels instead of a tube.
  const positions=[],indices=[],n=24,rows=[];
  // Short facets also keep the compatibility renderer's painter ordering stable
  // where a wing or engine shoulder meets a broad centrebody panel.
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<5;j++)rows.push(stations[i].map((v,k)=>THREE.MathUtils.lerp(v,stations[i+1][k],j/5)));
  rows.push(stations.at(-1));
  for(const [z,width,top,bottom] of rows) {
    const middle=THREE.MathUtils.lerp(bottom,top,.53);
    const chine=Math.min(.08,(top-bottom)*.22);
    const section=[[width*.7,top],[-width*.7,top],[-width,middle],[-width*.8,bottom+chine],[-width*.38,bottom],[width*.38,bottom],[width*.8,bottom+chine],[width,middle]];
    for(let i=0;i<section.length;i++)for(let j=0;j<3;j++) {
      const a=section[i],b=section[(i+1)%section.length];
      positions.push(THREE.MathUtils.lerp(a[0],b[0],j/3),THREE.MathUtils.lerp(a[1],b[1],j/3),z);
    }
  }
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<n;j++) {
    const a=i*n+j,b=i*n+(j+1)%n,c=a+n,d=b+n;
    indices.push(a,b,c,b,d,c);
  }
  for(let i=1;i<n-1;i++){indices.push(0,i+1,i);const end=(rows.length-1)*n;indices.push(end,end+i,end+i+1);}
  return mesh(group,geometry(positions,indices),material,x);
}

function f22(group,palette,data) {
  const m=materials(palette,true);
  openEnds(angularBody(group,[[-8.6,1.65,.42,-.54],[-6.1,2.05,.64,-.71],[-2.5,2.24,.77,-.83],[.7,1.95,.75,-.74],[1.94,.74,.75,-.42],[3.6,.8,.73,-.34],[5.45,1.04,.65,-.41],[7.03,.64,.42,-.23]],m.body),true);
  angularBody(group,[[6.76,.69,.44,-.24],[7.9,.39,.28,-.17],[9.45,.012,.025,-.02]],m.radome);
  canopy(group,[[3.0,.5,.09,.73],[3.55,.99,.57,.81],[4.35,1.19,.87,.83],[5.2,1.02,.79,.75],[5.8,.68,.37,.64],[6.15,.13,.02,.56]],m,data,[1,4]);
  const main=[[1.95,3.24,-4.27,.02,.34],[2.8,2.68,-4.22,.02,.28],[4.8,.8,-4.05,.03,.18],[6.8,-1.08,-3.53,.05,.07]];
  const tail=[[1.08,-4.98,-8.31,.12,.22],[2.35,-5.7,-8.82,.15,.15],[4.2,-7.03,-9.23,.18,.065]];
  for(const side of[-1,1]) {
    openEnds(angularBody(group,[[-8.9,.85,.42,-.48],[-6.4,.94,.69,-.59],[-2.6,.95,.76,-.65],[1.3,.87,.55,-.59]],m.body,side*1.02),true);
    // Edge-aligned trapezoid intake lips and shaded ducts under the chines.
    const mouth=[[-.67,-.56],[.7,-.41],[.59,.55],[-.54,.6]];
    if(side<0)mouth.forEach(p=>p[0]*=-1);
    if(side<0)mouth.reverse();
    duct(group,mouth,1.64,m,[side*1.36,-.08,3.62],[0,side*.03,0],m.edge);
    foil(group,main,side,m.wing,data);foilSeam(group,main,side,.76,m.panel,data,1);
    foil(group,tail,side,m.wing,data);foilSeam(group,tail,side,.73,m.panel,data);
    fin(group,[[0,-3.95],[2.72,-5.34],[2.8,-6.74],[.2,-7.91]],.15,m.body,side*1.55,.54,side*.43);
    rectangularNozzle(group,side*1.04,-.06,-9.21,m,data);
    if(detailOf(data)) {
      panelPath(group,[[side*2.3,.73,.9],[side*2.9,.55,.2],[side*3.8,.34,-.65]],m,data,.025);
      panelPath(group,[[side*.48,-.827,1.75],[side*1.36,-.84,.75],[side*1.32,-.84,-2.8],[side*.47,-.827,-3.4]],m,data,.022);
      panelPath(group,[[side*1.7,.86,-2.5],[side*1.7,.86,-4.0]],m,data);
    }
  }
  landingGear(group,[{x:-1.2,z:-1.7,radius:.38},{x:1.2,z:-1.7,radius:.38},{x:0,z:3.85,radius:.28}],m,data);
  data.span=13.6;data.length=18.9;
}

function harrierNozzle(group,side,z,hot,m,data) {
  // Pegasus has four outlets on the flanks. These are in forward-flight position.
  const x=side*(hot?1.11:1.43),y=-.34;
  box(group,[.24,.59,.53],hot?m.nozzle:m.body,[side*(hot?.91:1.23),y,z+.19]);
  const outline=[[-.24,-.2],[-.15,-.32],[.15,-.32],[.24,-.2],[.24,.2],[.15,.32],[-.15,.32],[-.24,.2]];
  const nozzle=duct(group,outline,.46,{...m,body:hot?m.nozzle:m.body},[x,y,z-.28],[0,Math.PI,0],hot?m.metal:m.edge);
  nozzle.name=`harrier-${hot?'hot':'cold'}-nozzle-${side<0?'right':'left'}`;
  if(detailOf(data))for(const yy of[-.13,0,.13])box(nozzle,[.37,.035,.21],m.nozzle,[0,yy,-.08],[.13,0,0]);
}

function harrier(group,palette,data) {
  const m=materials(palette);
  fuselage(group,[[-7.1,.17,.3,.32],[-5.7,.6,.76,.22],[-3.9,1.04,1.34,.09],[-1.6,1.61,1.9,.02],[.8,1.82,2.06,.02],[2.6,1.7,1.94,.12],[4.15,1.33,1.72,.32],[5.16,.92,1.18,.27]],m.body,data);
  // FRS.1 has the raised cockpit and pointed radar nose, not the GR.3 laser nose.
  fuselage(group,[[4.98,1.0,1.24,.27],[5.85,.79,.85,.24],[6.55,.42,.43,.17],[7.1,.02,.025,.12]],m.radome,data);
  canopy(group,[[2.82,.56,.09,1.04],[3.28,.9,.67,1.11],[3.97,1.02,.91,1.15],[4.69,.86,.77,1.06],[5.18,.48,.28,.88],[5.37,.15,.03,.77]],m,data,[1,4]);
  const main=[[.58,1.43,-1.69,.77,.27],[1.6,.99,-1.85,.65,.23],[2.8,.12,-1.96,.4,.16],[3.85,-.8,-1.91,.21,.075]];
  const tail=[[.3,-4.56,-6.53,.16,.16],[1.22,-5.06,-6.8,-.04,.1],[2.25,-5.85,-6.98,-.35,.05]];
  for(const side of[-1,1]) {
    openEnds(fuselage(group,[[-.05,1.13,1.66,.17],[1.15,1.22,1.81,.18],[2.49,1.25,1.78,.2],[2.85,1.17,1.67,.22]],m.body,data,side*.78),false,true);
    roundDuct(group,[side*.93,.22,3.07],[.63,.84],1.23,m,data,{rearScale:.98});
    if(detailOf(data)) {
      for(let i=0;i<5;i++) {
        const angle=-.6+i*.3;
        box(group,[.035,.26,.36],m.panel,[side*(1.47+.02*Math.cos(angle)),.3+Math.sin(angle)*.55,2.47-i*.055],[0,0,side*angle*.5]);
      }
    }
    foil(group,main,side,m.wing,data);foilSeam(group,main,side,.74,m.panel,data,1);
    foil(group,tail,side,m.wing,data);foilSeam(group,tail,side,.71,m.panel,data);
    harrierNozzle(group,side,1.26,false,m,data);harrierNozzle(group,side,-1.24,true,m,data);
    // Retracting outrigger fairings remain visible when their wheels are stowed.
    fuselage(group,[[-1.78,.22,.27,-.02],[-1.19,.35,.44,.0],[-.51,.28,.35,.03],[-.19,.07,.09,.08]],m.body,data,side*3.47);
    pylon(group,side*2.77,.33,-.86,m,.83,.35);
    missile(group,side*2.77,-.26,-.51,2.75,.103,m,data);
    if(detailOf(data)) {
      pylon(group,side*1.8,.5,-.3,m,1.03,.42);fuelTank(group,side*1.8,-.29,-.15,3.25,.29,m,data);
      const pod=localGroup(group,[side*.49,-.91,-.18]);
      loft(pod,[[-1.75,.1,.16],[-1.3,.39,.39],[.83,.44,.43],[1.53,.2,.24]],m.belly,20);
      cylinder(pod,.044,.065,.17,m.nozzle,[0,-.03,1.59],[Math.PI/2,0,0],12);
    }
  }
  fin(group,[[.05,-3.16],[.61,-3.91],[1.71,-5.07],[1.66,-6.11],[.13,-6.81]],.15,m.body,0,.45);
  fin(group,[[0,-3.7],[-.43,-4.38],[-.4,-5.2],[0,-5.61]],.12,m.body,0,-.46);
  landingGear(group,[
    {x:0,z:3.65,radius:.3,width:.2,y:-1.39,top:[0,-.56,3.93]},
    {x:0,z:-.66,radius:.38,width:.25,dual:true,y:-1.33,top:[0,-.68,-.3]},
    {x:-3.47,z:-1.03,radius:.19,width:.13,y:-1.52,top:[-3.47,.1,-1.02]},
    {x:3.47,z:-1.03,radius:.19,width:.13,y:-1.52,top:[3.47,.1,-1.02]},
  ],m,data);
  navLights(group,3.78,.25,-1.14,data);
  data.span=7.7;data.length=14.2;
}

function a10(group,palette,data) {
  const m=materials(palette);
  fuselage(group,[[-8.13,.18,.35,.2],[-6.64,.71,.91,.1],[-4.45,1.17,1.4,.04],[-1.52,1.47,1.79,-.04],[1.51,1.65,1.92,-.03],[4.3,1.62,1.86,0],[6.28,1.31,1.53,-.06],[7.5,.93,1.1,-.14],[7.93,.45,.66,-.18]],m.body,data);
  canopy(group,[[2.71,.5,.09,.9],[3.27,1.04,.6,1.0],[4.22,1.15,.85,1.05],[5.18,1.02,.8,1.02],[5.9,.65,.36,.91],[6.12,.18,.04,.79]],m,data,[1,4],true);
  const main=[[.67,2.44,-1.41,-.3,.42],[2.7,2.27,-1.48,-.27,.35],[5.8,1.7,-1.5,-.1,.24],[8.58,1.17,-1.37,.1,.14],[8.765,.85,-1.09,.12,.09]];
  const tail=[[.3,-5.65,-7.71,.28,.22],[1.65,-5.82,-7.85,.29,.17],[2.98,-6.15,-7.96,.3,.1]];
  for(const side of[-1,1]) {
    foil(group,main,side,m.wing,data);foilSeam(group,main,side,.75,m.panel,data,1);
    foil(group,tail,side,m.wing,data);foilSeam(group,tail,side,.7,m.panel,data);
    fin(group,[[-.63,-6.24],[.02,-5.94],[2.02,-6.26],[2.07,-7.4],[1.6,-8.02],[-.62,-8.03]],.17,m.body,side*2.59,.3);
    // Engine pods sit high behind the wing, leaving the tailplane unobstructed.
    box(group,[.34,.94,1.7],m.body,[side*1.39,.71,-3.23],[0,0,side*-.3]);
    const engine=localGroup(group,[side*1.78,1.39,-2.91]);
    openEnds(loft(engine,[[-1.87,1.42,1.42],[-1.42,1.93,1.93],[.86,2.03,2.03],[1.77,1.99,1.99]],m.body,sidesOf(data)),true,true);
    roundDuct(group,[side*1.78,1.39,-1.1],[1.01,1.01],1.06,m,data,{fan:true,blades:24,outer:m.body});
    roundDuct(group,[side*1.78,1.39,-4.91],[.72,.72],.65,m,data,{rotation:[0,Math.PI,0],outer:m.nozzle,lip:m.metal});
    if(detailOf(data)) {
      for(const zz of[-2.1,-3.9])ring(group,1.018,.997,m.panel,[side*1.78,1.39,zz],[0,0,0],32);
      panelPath(group,[[side*1.79,2.414,-1.4],[side*1.79,2.414,-3.8]],m,data);
    }
    // Main wheels retract partly into these underwing sponsons.
    const fairing=localGroup(group,[side*2.48,-.46,.64]);
    loft(fairing,[[-1.53,.17,.2],[-.67,.68,.67],[.92,.71,.7],[1.64,.27,.29]],m.body,detailOf(data)?24:12);
    for(const [x,z] of[[3.53,.45],[5.12,.13]]) {
      pylon(group,side*x,-.25,z,m,1.03,.51);
      missile(group,side*x,-1.01,z+.23,2.7,x<4?.19:.15,m,data);
    }
    if(detailOf(data)) {
      pylon(group,side*6.64,-.03,-.12,m,.95,.45);
      const bomb=localGroup(group,[side*6.64,-.69,-.04]);
      loft(bomb,[[-1.07,.19,.19],[-.72,.39,.39],[.58,.47,.47],[.97,.21,.21],[1.11,.035,.035]],m.panel,20);
      for(let i=0;i<4;i++){const f=wing(bomb,[[.1,-.5],[.41,-.89],[.41,-1.05],[.1,-1.05]],.025,m.edge);f.rotation.z=i*Math.PI/2;}
    }
  }
  // The seven-barrel GAU-8 muzzle is offset within the blunt nose fairing.
  roundDuct(group,[.2,-.34,8.03],[.23,.23],.55,m,data,{outer:m.nozzle,lip:m.nozzle});
  for(let i=0;i<7;i++) {
    const a=i*TAU/7;
    cylinder(group,.035,.035,.2,m.dark,[.2+Math.sin(a)*.13,-.34+Math.cos(a)*.13,8.03],[Math.PI/2,0,0],8);
  }
  if(detailOf(data)) {
    box(group,[.06,.21,.32],m.dark,[-.65,.29,6.47]);
    panelPath(group,[[-.65,.66,6.7],[-.8,.73,5.5]],m,data);
  }
  landingGear(group,[
    {x:-2.48,z:.58,radius:.43,y:-1.46,top:[-2.48,-.6,.35]},
    {x:2.48,z:.58,radius:.43,y:-1.46,top:[2.48,-.6,.35]},
    {x:-.34,z:5.57,radius:.31,y:-1.57,top:[-.34,-.64,5.2]},
  ],m,data);
  navLights(group,8.69,.15,.09,data);
  data.span=17.53;data.length=16.26;
}

function b2(group,palette,data) {
  const m=materials(palette,true);
  // Planform breakpoints follow Virginia Tech's measured B-2 drawing (Appendix
  // D.2.1, Configuration Aerodynamics), normalized to USAF 52.12 x 20.9 m.
  // In particular, the outer trailing peaks are aft of the centre trailing edge.
  const halfSpan=26.06,length=20.9,nose=length/2;
  const drawing=[[0,65.46],[12.66,56.82],[22.50,63.24],[43.90,48.26],[72.74,67.90],[86,59.47]];
  const thickness=[1.57,1.05,.73,.46,.22,.045];
  const section=drawing.map(([span,aft],i)=>{
    const x=span/86*halfSpan;
    return [x,nose-span/86*(59.47/67.9*length),nose-aft/67.9*length,0,thickness[i]];
  });
  // A tiny tip chord closes the wing without folded or degenerate triangles.
  section.at(-1)[2]-=.035;
  for(const side of[-1,1]) {
    foil(group,section,side,m.wing,data);
    foilSeam(group,section,side,.83,m.panel,data,1);
    // Wide submerged intake pairs and shallow exhaust troughs are blended into
    // the centrebody, not freestanding nacelles or aft flame cones.
    openEnds(fuselage(group,[[-4.82,1.76,.19,.52],[-2.8,2.3,.6,.68],[.0,2.51,.9,.79],[2.38,2.16,.82,.84],[3.68,1.86,.43,.86]],m.body,data,side*2.46),true,true);
    const intake=duct(group,[[-.88,-.18],[.88,-.18],[.81,.25],[-.81,.25]],2.06,m,[side*2.46,.88,3.83],[-.11,0,0],m.edge);
    box(intake,[.055,.37,.81],m.panel,[0,.018,-.35]);
    const exhaust=duct(group,[[-1.04,-.11],[1.04,-.11],[1.04,.11],[-1.04,.11]],1.12,{...m,body:m.nozzle},[side*2.46,.46,-4.98],[0,Math.PI,0],m.panel);
    box(exhaust,[2.15,.045,1.25],m.panel,[0,-.13,.24]);
    if(detailOf(data)) {
      panelPath(group,[[side*4.2,.72,3.5],[side*7.5,.45,1.3],[side*12.3,.29,-1.95]],m,data,.028);
      panelPath(group,[[side*6.8,.33,-7.72],[side*9.2,.26,-5.98],[side*12.6,.19,-4.02]],m,data,.026);
      panelPath(group,[[side*.45,-.77,3.3],[side*1.69,-.7,2.5],[side*1.69,-.65,-2.8],[side*.45,-.7,-3.7],[side*.45,-.77,3.3]],m,data,.025);
    }
  }
  // The crew cabin is a low, integrated hump with a six-panel windscreen.
  fuselage(group,[[3.5,1.58,.27,.84],[5.11,2.35,.74,1.02],[6.65,2.23,.83,1.03],[7.92,1.53,.58,.87],[8.73,.64,.21,.53]],m.body,data);
  canopy(group,[[5.96,1.71,.08,1.39],[6.48,1.91,.23,1.42],[7.27,1.59,.26,1.28],[7.93,.84,.12,1.06],[8.16,.19,.025,.86]],m,data,[1,2],true);
  landingGear(group,[
    {x:-2.5,z:-.8,radius:.38,width:.24,dual:true,bogie:detailOf(data),y:-1.53,top:[-2.5,-.45,-.52]},
    {x:2.5,z:-.8,radius:.38,width:.24,dual:true,bogie:detailOf(data),y:-1.53,top:[2.5,-.45,-.52]},
    {x:0,z:6.0,radius:.28,width:.17,dual:true,y:-1.64,top:[0,-.44,5.72]},
  ],m,data);
  data.span=52.12;data.length=20.9;
}

function mig21(group,palette,data) {
  const m=materials(palette);
  openEnds(fuselage(group,[[-6.97,1.08,1.08,-.02],[-5.8,1.29,1.32,0],[-3.6,1.48,1.5,.02],[-.7,1.51,1.55,.04],[2.15,1.39,1.43,.07],[4.4,1.22,1.27,.04],[5.69,1.13,1.13,.02]],m.body,data),true,true);
  // A deep annular nose intake around the translating shock cone is the MiG's
  // identifying front view; there is no closed fighter-style radar nose here.
  roundDuct(group,[0,.02,5.79],[.58,.58],1.13,m,data,{outer:m.body,lip:m.metal});
  cylinder(group,.02,.36,1.36,m.radome,[0,.02,5.96],[Math.PI/2,0,0],sidesOf(data));
  cylinder(group,.012,.018,.96,m.metal,[.09,.36,6.88],[Math.PI/2,0,0],8);
  fuselage(group,[[-4.69,.52,.39,.66],[-2.45,.81,.61,.72],[.03,.81,.7,.75],[1.14,.61,.41,.77]],m.body,data);
  canopy(group,[[.42,.38,.08,.83],[.88,.8,.47,.85],[1.64,.91,.7,.87],[2.4,.75,.63,.85],[2.99,.43,.25,.77],[3.2,.14,.035,.71]],m,data,[1,4],true);
  const main=[[.52,2.15,-3.39,-.28,.25],[1.65,.16,-3.45,-.24,.17],[3.575,-3.01,-3.55,-.13,.055]];
  const tail=[[.32,-4.65,-6.56,.07,.14],[1.2,-5.25,-6.85,.06,.1],[2.18,-6.11,-6.99,.04,.05]];
  for(const side of[-1,1]) {
    foil(group,main,side,m.wing,data);foilSeam(group,main,side,.76,m.panel,data);
    foil(group,tail,side,m.wing,data);foilSeam(group,tail,side,.7,m.panel,data);
    pylon(group,side*2.1,-.24,-1.68,m,.88,.35);missile(group,side*2.1,-.82,-1.18,2.62,.1,m,data);
    if(detailOf(data)) {
      // Long wing fences are characteristic and stay perpendicular to the skin.
      fin(group,[[0,.32],[.18,.18],[.18,-2.95],[0,-3.17]],.035,m.edge,side*1.57,-.13);
      cylinder(group,.045,.06,.55,m.nozzle,[side*.36,-.64,1.35],[Math.PI/2,0,0],12);
    }
  }
  fin(group,[[0,-2.0],[.7,-2.96],[2.79,-4.91],[2.65,-5.85],[.14,-6.56]],.14,m.body,0,.62);
  fin(group,[[0,-4.0],[-.55,-4.83],[-.5,-5.92],[0,-6.22]],.09,m.body,0,-.52);
  roundNozzle(group,[0,-.02,-7.35],.55,m,data);
  if(detailOf(data)) {pylon(group,0,-.77,-.59,m,1.12,.2);fuelTank(group,0,-1.13,-.57,3.46,.29,m,data);}
  landingGear(group,[{x:-1.15,z:-1.05,radius:.34},{x:1.15,z:-1.05,radius:.34},{x:0,z:3.57,radius:.27,y:-1.47}],m,data);
  data.span=7.15;data.length=14.7;
}

/** Build a modern aircraft in-place. Returns false only for an unknown kind. */
export function buildModernAircraft(group,kind,palette,data) {
  const builders={f4,f15,f16,f22,harrier,a10,b2,mig21};
  const build=builders[kind];
  if(!build)return false;
  data.propellers ||= [];data.exhausts ||= [];
  build(group,palette,data);
  return true;
}
