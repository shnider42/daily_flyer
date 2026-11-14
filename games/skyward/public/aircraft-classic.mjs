import * as THREE from './vendor/three.module.js';
import { mat, mesh, box, ellipsoid, cylinder, beam, loft, wing, propeller, gear, cockpit, ring, tube } from './model-parts.mjs';

// The silhouettes and broad markings evoke the aircraft, without reproducing
// an individual squadron machine. Nose +Z, up +Y, cockpit right -X.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const detail = data => data.detail !== false;
const paintOptions = { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };

function materials(palette, kind) {
  const fabric = kind === 'avro504' || kind === 'camel';
  return {
    body: mat(palette.body, fabric ? .88 : .68, fabric ? .02 : .16),
    wing: mat(palette.wing || palette.body, fabric ? .9 : .75, fabric ? .01 : .12),
    belly: mat(fabric ? '#b9a77b' : kind === 'hellcat' ? '#bcc7c7' : '#a9b3a8', .8, .09),
    camo: mat(kind === 'spitfire' ? '#64533c' : '#46594b', .82, .07, paintOptions),
    dark: mat('#243137', .8, .12), metal: mat('#77858a', .36, .62),
    leather: mat('#654a32', .9, .01), wood: mat('#785336', .7, .03),
    glass: mat('#668e9c', .19, .21, { transparent: true, opacity: .69, depthWrite: false, side: THREE.DoubleSide }),
    white: mat('#e9e5d7', .86, .03, paintOptions), red: mat('#a23e32', .84, .03, paintOptions),
    blue: mat('#223b54', .83, .04, paintOptions), black: mat('#263036', .87, .03, paintOptions),
    linen: mat('#c5b68a', .9, .01), yellow: mat('#c7ab58', .8, .06),
  };
}

function rod(group, a, b, radius, material, sides = 8) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
  const part = cylinder(group, radius, radius, direction.length(), material, start.clone().add(end).multiplyScalar(.5).toArray(), [0, 0, 0], sides);
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return part;
}

function sectionAt(stations, z) {
  let i = 0;
  while (i < stations.length - 2 && z > stations[i + 1][0]) i++;
  const a = stations[i], b = stations[i + 1], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  const p = stations[Math.max(0, i - 1)], n = stations[Math.min(stations.length - 1, i + 2)];
  const result = [z];
  for (let k = 1; k <= 4; k++) {
    const v0 = p[k] || 0, v1 = a[k] || 0, v2 = b[k] || 0, v3 = n[k] || 0;
    const value = .5 * ((2 * v1) + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (-v0 + 3 * v1 - 3 * v2 + v3) * t * t * t);
    result.push(k < 3 ? Math.max(.018, value) : value);
  }
  return result;
}

function skin(group, stations, material, data, sides = 24, subdivisions = detail(data) ? 4 : 2) {
  const samples = [];
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < subdivisions; j++) samples.push(sectionAt(stations, mix(stations[i][0], stations[i + 1][0], j / subdivisions)));
  samples.push(stations.at(-1));
  return loft(group, samples, material, detail(data) ? sides : Math.max(12, Math.round(sides * .66)));
}

const foil = t => Math.max(0, 5 * (.2969 * Math.sqrt(t) - .126 * t - .3516 * t * t + .2843 * t ** 3 - .1036 * t ** 4));

// Each span station is [half-span, leading Z, trailing Z, height, thickness].
// This retains dihedral and actual wing section as the planform tapers.
function airfoil(group, stations, upper, lower, data, camber = .025, fuselage = null) {
  // Where a wing meets a body, remove its invisible center skin and terminate
  // both halves on the actual fuselage curve. Interpenetrating whole wings
  // create sawtooth intersections in painter-based compatibility renderers.
  const bodyRadius = fuselage ? Math.max(...fuselage.filter(p => p[0] >= stations[0][2] - 1 && p[0] <= stations[0][1] + 1).map(p => p[1] / 2), 0) : 0;
  const outer = fuselage ? stations.filter((p, i) => i === 0 || p[0] > bodyRadius + .015) : stations;
  const spans = fuselage ? [
    { sign: -1, rows: outer.map(p => [-p[0], ...p.slice(1)]).reverse() },
    { sign: 1, rows: outer },
  ] : [{ sign: 0, rows: [...stations.slice(1).reverse().map(p => [-p[0], ...p.slice(1)]), ...stations] }];
  const ts = detail(data) ? [0, .018, .05, .10, .17, .25, .35, .47, .60, .73, .84, .93, 1] : [0, .04, .13, .28, .49, .72, .9, 1];
  function at(x) {
    const ax = Math.abs(x);
    let i = 0; while (i < stations.length - 2 && ax > stations[i + 1][0]) i++;
    const a = stations[i], b = stations[i + 1], t = clamp((ax - a[0]) / Math.max(.001, b[0] - a[0]), 0, 1);
    return a.map((v, k) => mix(v, b[k], t));
  }
  const surface = (x, z, side = 1, offset = 0) => {
    const p = at(x), t = clamp((p[1] - z) / Math.max(.001, p[1] - p[2]), 0, 1);
    return [x, p[3] + Math.sin(Math.PI * t) * p[4] * camber + side * (foil(t) * p[4] + offset), z];
  };
  for (const part of spans) for (const side of [1, -1]) {
    const vertices = [], indices = [], uv = [];
    for (const p of part.rows) for (const t of ts) {
      const z = mix(p[1], p[2], t), point = surface(p[0], z, side);
      if (fuselage && p[0] === 0) {
        const body = sectionAt(fuselage, z), h = (point[1] - body[3]) / (body[2] / 2);
        point[0] = body[4] + part.sign * (body[1] / 2 * Math.sqrt(Math.max(0, 1 - h * h)) + .006);
      }
      vertices.push(...point); uv.push((p[0] / stations.at(-1)[0] + 1) / 2, t);
    }
    const count = ts.length;
    for (let i = 0; i < part.rows.length - 1; i++) for (let j = 0; j < count - 1; j++) {
      const a = i * count + j, b = a + count, c = a + 1, d = b + 1;
      indices.push(...(side > 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    mesh(group, geometry, side > 0 ? upper : lower);
  }
  // Close the thin tip sections, rather than leaving a hollow shell in banked views.
  for (const s of [-1, 1]) {
    const p = stations.at(-1), vertices = [], indices = [];
    for (const t of ts) { const z = mix(p[1], p[2], t); vertices.push(...surface(s * p[0], z, 1), ...surface(s * p[0], z, -1)); }
    for (let i = 0; i < ts.length - 1; i++) { const a = i * 2; indices.push(...(s > 0 ? [a, a + 1, a + 2, a + 1, a + 3, a + 2] : [a, a + 2, a + 1, a + 1, a + 2, a + 3])); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); mesh(group, geometry, upper);
  }
  return { stations, at, surface };
}

function paintedShape(group, outline, material, project, normal = [0, 1, 0]) {
  const points = outline.map(p => new THREE.Vector2(...p));
  const signs = outline.map((p,i) => { const b=outline[(i+1)%outline.length],c=outline[(i+2)%outline.length];return Math.sign((b[0]-p[0])*(c[1]-b[1])-(b[1]-p[1])*(c[0]-b[0])); }).filter(Boolean);
  const convex=signs.every(s=>s===signs[0]);
  let triangles;
  if(convex){
    points.push(new THREE.Vector2(outline.reduce((sum,p)=>sum+p[0],0)/outline.length,outline.reduce((sum,p)=>sum+p[1],0)/outline.length));
    triangles=outline.map((_,i)=>[points.length-1,i,(i+1)%outline.length]);
  }else triangles=THREE.ShapeUtils.triangulateShape(points,[]);
  const vertices = [], indices = [];
  const wanted = new THREE.Vector3(...normal);
  function emit(a,b,c,pa,pb,pc,depth=0){
    const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);
    const pab=project(ab.x,ab.y),pbc=project(bc.x,bc.y),pca=project(ca.x,ca.y);
    const error=(p,x,y)=>Math.hypot(...p.map((v,i)=>v-(x[i]+y[i])*.5));
    if(depth<4&&Math.max(error(pab,pa,pb),error(pbc,pb,pc),error(pca,pc,pa))>.004){
      emit(a,ab,ca,pa,pab,pca,depth+1);emit(ab,b,bc,pab,pb,pbc,depth+1);emit(ca,bc,c,pca,pbc,pc,depth+1);emit(ab,bc,ca,pab,pbc,pca,depth+1);return;
    }
    const index=vertices.length/3,va=new THREE.Vector3(...pa),vb=new THREE.Vector3(...pb),vc=new THREE.Vector3(...pc);
    vertices.push(...pa,...pb,...pc);
    indices.push(...(vb.sub(va).cross(vc.sub(va)).dot(wanted)>=0?[index,index+1,index+2]:[index,index+2,index+1]));
  }
  for(const[a,b,c]of triangles)emit(points[a],points[b],points[c],project(points[a].x,points[a].y),project(points[b].x,points[b].y),project(points[c].x,points[c].y));
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return mesh(group, geometry, material);
}

function insignia(group, m, style, radius, project, normal = [0, 1, 0]) {
  let layer = 0;
  const draw = (outline, material) => { const offset = .02 + layer++ * .003; paintedShape(group, outline, material, (x, y) => project(x, y, offset), normal); };
  const circle = r => Array.from({ length: 32 }, (_, i) => [Math.cos(i * TAU / 32) * r, Math.sin(i * TAU / 32) * r]);
  const rect = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top]];
  if (style === 'us') {
    draw(rect(-radius * 1.8, -radius * .38, radius * 1.8, radius * .38), m.blue); draw(circle(radius), m.blue);
    for (const s of [-1, 1]) draw(rect(s < 0 ? -radius * 1.64 : radius * .76, -radius * .24, s < 0 ? -radius * .76 : radius * 1.64, radius * .24), m.white);
    draw(Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = radius * (i % 2 ? .35 : .86); return [Math.cos(a) * r, Math.sin(a) * r]; }), m.white);
  } else if (style === 'cross') {
    for (const [width, material] of [[.30, m.white], [.16, m.black]]) {
      draw(rect(-radius, -radius * width, radius, radius * width), material);
      draw(rect(-radius * width, -radius, radius * width, radius), material);
    }
  } else {
    [m.blue, m.white, m.red].forEach((material, i) => draw(circle(radius * [1, .66, .32][i]), material));
  }
}

function wingMark(group, model, m, style, x, z, radius, side = 1) {
  insignia(group, m, style, radius, (u, v, offset) => model.surface(x + u, z + v, side, offset), [0, side, 0]);
}

function sideProject(stations, side, z, y, offset = .012) {
  const p = sectionAt(stations, z), h = Math.max(.001, p[2] / 2), v = clamp((y - p[3]) / h, -.985, .985);
  return [p[4] + side * (p[1] / 2 * Math.sqrt(1 - v * v) + offset), y, z];
}

function fuselageMark(group, stations, m, style, z, y, radius) {
  for (const s of [-1, 1]) insignia(group, m, style, radius, (u, v, offset) => sideProject(stations, s, z + u, y + v, offset), [s, 0, 0]);
}

function fin(group, outline, material, thickness = .12) {
  const shape = new THREE.Shape(), start = outline[0], last = outline.at(-1);
  shape.moveTo(-(start[1] + last[1]) / 2, (start[0] + last[0]) / 2);
  for (let i = 0; i < outline.length; i++) { const p = outline[i], next = outline[(i + 1) % outline.length]; shape.quadraticCurveTo(-p[1], p[0], -(p[1] + next[1]) / 2, (p[0] + next[0]) / 2); }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: .018, bevelSize: .018, bevelSegments: 2, steps: 1, curveSegments: 4 });
  return mesh(group, geometry, material, -thickness / 2, 0, 0, [0, Math.PI / 2, 0]);
}

function finFlash(group, m, z, y, width, height, x = .081) {
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const front = z + width / 2 - i * width / 3;
    paintedShape(group, [[front, y], [front - width / 3, y], [front - width / 3, y + height], [front, y + height]], [m.red, m.white, m.blue][i], (zz, yy) => [s * x, yy, zz], [s, 0, 0]);
  }
}

function framedCanopy(group, sections, m, data, frame = m.body) {
  // Sections: [z, half-width, sill height, roof height]. The angular shoulders
  // deliberately retain the framed greenhouses of these early aircraft.
  const rings = sections.map(([z, w, sill, roof]) => [[-w, sill, z], [-w * .84, roof - .045, z], [-w * .36, roof, z], [w * .36, roof, z], [w * .84, roof - .045, z], [w, sill, z]]);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 5; j++) {
    const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j + 1], d = rings[i][j + 1];
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); geometry.computeVertexNormals(); mesh(group, geometry, m.glass);
  }
  for (const i of [0, rings.length - 1]) {
    const shape = rings[i], geometry = new THREE.BufferGeometry(), vertices = [];
    for (let j = 1; j < shape.length - 1; j++) vertices.push(...shape[0], ...shape[j], ...shape[j + 1]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals(); mesh(group, geometry, m.glass);
  }
  for (const row of rings) for (let j = 0; j < row.length - 1; j++) beam(group, row[j], row[j + 1], .043, frame);
  for (const j of [0, 2, 3, 5]) for (let i = 0; i < rings.length - 1; i++) beam(group, rings[i][j], rings[i + 1][j], .037, frame);
  if (detail(data)) {
    const middle = sections[Math.floor(sections.length / 2)];
    box(group, [middle[1] * 1.05, .35, .23], m.dark, [0, middle[2] + .12, middle[0] - .22]);
    ellipsoid(group, [.16, .2, .17], m.leather, [0, middle[2] + .4, middle[0]], 1);
  }
}

function openFuselage(group, stations, openings, m, data) {
  const rows = detail(data) ? 88 : 48, sides = detail(data) ? 26 : 16, vertices = [], indices = [];
  const first = stations[0][0], length = stations.at(-1)[0] - first;
  for (let row = 0; row <= rows; row++) {
    const z = first + length * row / rows, p = sectionAt(stations, z);
    let cut = 0;
    for (const opening of openings) { const v = (z - opening.z) / opening.rz; if (Math.abs(v) < 1) cut = Math.max(cut, opening.rx * Math.sqrt(1 - v * v)); }
    const a = Math.acos(clamp(cut / (p[1] * .5), 0, .985)), start = Math.PI - a, arc = Math.PI + 2 * a;
    for (let j = 0; j <= sides; j++) { const theta = start + arc * j / sides; vertices.push(Math.cos(theta) * p[1] / 2, p[3] + Math.sin(theta) * p[2] / 2, z); }
  }
  for (let row = 0; row < rows; row++) for (let j = 0; j < sides; j++) { const a = row * (sides + 1) + j, b = a + sides + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); mesh(group, geometry, m.body);
  for (const opening of openings) {
    const p = sectionAt(stations, opening.z), deck = p[3] + p[2] / 2;
    ellipsoid(group, [opening.rx * .96, .25, opening.rz * .94], m.dark, [0, deck - .25, opening.z], 1);
    const points = [];
    for (let i = 0; i <= 40; i++) { const a = TAU * i / 40, z = opening.z + Math.sin(a) * opening.rz, x = Math.cos(a) * opening.rx, s = sectionAt(stations, z); points.push(new THREE.Vector3(x, s[3] + s[2] / 2 * Math.sqrt(Math.max(.01, 1 - (x / (s[1] / 2)) ** 2)) + .014, z)); }
    mesh(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), detail(data) ? 40 : 24, .036, 5, true), m.leather);
    box(group, [.32, .32, .09], m.leather, [0, deck - .12, opening.z - .22]);
    if (detail(data)) {
      ellipsoid(group, [.18, .22, .2], m.leather, [0, deck + .12, opening.z - .08], 1);
      ellipsoid(group, [.14, .11, .16], m.dark, [0, deck + .24, opening.z - .08], 1);
      rod(group, [0, deck - .15, opening.z + .12], [0, deck + .07, opening.z + .2], .023, m.dark);
    }
    const z = opening.z + opening.rz * .85, panes = [[-.23, deck, z], [.23, deck, z], [.19, deck + .24, z - .055], [-.19, deck + .24, z - .055]];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...panes[0], ...panes[1], ...panes[2], ...panes[0], ...panes[2], ...panes[3]], 3)); g.computeVertexNormals(); mesh(group, g, m.glass);
    for (let i = 0; i < 3; i++) rod(group, panes[i], panes[(i + 1) % 4], .018, m.metal, 6);
  }
}

function radial(group, x, y, z, radius, length, propRadius, m, data, options = {}) {
  const engine = new THREE.Group(); engine.position.set(x, y, z); group.add(engine);
  const cowl = options.metal ? m.metal : m.body;
  skin(engine, [[-length, radius * .42, radius * .58, 0], [-Math.max(.5,length*.65), radius * 1.4, radius * 1.55, 0], [-Math.max(.4,length*.3), radius * 2, radius * 2, 0], [-.3, radius * 1.96, radius * 1.96, 0]], cowl, data, options.efficient ? 20 : 24, detail(data) ? (options.efficient ? 3 : 4) : 2);
  tube(engine, radius, radius * .79, .44, cowl, [0, 0, -.14], [0, 0, 0], detail(data) ? 28 : 16);
  mesh(engine, new THREE.CircleGeometry(radius * .8, 24), m.dark, 0, 0, -.25);
  const cylinders = options.cylinders || 9;
  for (let i = 0; i < cylinders; i++) {
    const a = TAU * i / cylinders, dx = Math.cos(a), dy = Math.sin(a);
    rod(engine, [dx * radius * .24, dy * radius * .24, -.08], [dx * radius * .7, dy * radius * .7, -.08], radius * .115, m.metal, detail(data) ? 8 : 6);
    if (detail(data)) beam(engine, [dx * radius * .18, dy * radius * .18, .025], [dx * radius * .68, dy * radius * .68, .025], radius * .04, m.dark);
  }
  cylinder(engine, radius * .2, radius * .23, radius * .12, m.metal, [0, 0, .02], undefined, 12);
  if (detail(data)) for (let i = 0; i < 10; i++) {
    const a = TAU * i / 10;
    beam(engine, [Math.cos(a) * radius * .994, Math.sin(a) * radius * .994, -.3], [Math.cos(a) * radius * 1.016, Math.sin(a) * radius * 1.016, -.58], radius * .03, m.dark);
  }
  propeller(group, x, y, z + .28, propRadius, options.wood ? m.wood : m.dark, data, options.blades || 3);
  return engine;
}

function exhaustRow(group, x, y, startZ, count, spacing, m, data, side) {
  for (let i = 0; i < count; i++) {
    if (!detail(data) && i % 2) continue;
    tube(group, .07, .043, .24, m.metal, [x, y, startZ - i * spacing], [0, side * Math.PI * .67, 0], 8);
  }
}

function panelLine(group, surface, x, fromZ, toZ, m, data) {
  if (!detail(data)) return;
  const samples = 5;
  for (let i = 0; i < samples; i++) rod(group, surface(x, mix(fromZ, toZ, i / samples), 1, .011), surface(x, mix(fromZ, toZ, (i + 1) / samples), 1, .011), .009, m, 5);
}

function navLights(group, model, m, data) {
  if (!detail(data)) return;
  for (const s of [-1, 1]) { const p = model.stations.at(-1), pos = model.surface(s * (p[0] - .08), mix(p[1], p[2], .35), 1, .04); const light = mesh(group, new THREE.SphereGeometry(1, 8, 5), s > 0 ? m.red : m.metal, ...pos); light.scale.set(.06,.045,.09); }
}

function cockpitMast(group, front, rear, m, data) {
  if (!detail(data)) return;
  rod(group, [front[0], front[1] - .35, front[2]], front, .025, m.dark, 6);
  rod(group, front, rear, .008, m.dark, 5);
}

function undercarriage(group, points, m, data, fixed = false) {
  const result = gear(group, points, data, fixed);
  for (const [x, z, radius = .4, leg = 1.35] of points) if (Math.abs(x) > .3) {
    rod(result, [x, -leg + radius * .6, z], [x, -.4, z], .06, m.metal, 10);
    if (!fixed) box(result, [.1, Math.max(.3, leg - .6), radius * 1.25], m.belly, [x - Math.sign(x) * .13, -leg * .6, z - .06]);
  }
  return result;
}

function fabricRibs(group, model, m, data, spacing) {
  if (!detail(data)) return;
  for (let x = spacing; x < model.stations.at(-1)[0] - .24; x += spacing) for (const s of [-1, 1]) {
    const p = model.at(x); panelLine(group, model.surface, s * x, p[1] - .09, p[2] + .09, m.linen, data);
  }
}

function biplane(group, kind, palette, data) {
  const avro = kind === 'avro504', m = materials(palette, kind), half = avro ? 5.485 : 4.265;
  const stations = avro
    ? [[-4.48,.075,.14,.04],[-3.9,.24,.35,.02],[-2.8,.43,.57,.01],[-1.4,.63,.78,0],[-.3,.77,.91,0],[.9,.9,1,0],[2.2,.98,1.04,0],[3.3,.93,.98,0],[3.88,.85,.88,0]]
    : [[-2.85,.08,.16,.02],[-2.3,.34,.46,.02],[-1.5,.58,.68,0],[-.65,.83,.88,0],[.3,1.1,1.1,0],[1.2,1.18,1.17,0],[2.1,1.13,1.12,0],[2.46,1.02,1.04,0]];
  openFuselage(group, stations, avro ? [{z:.12,rx:.275,rz:.43},{z:-1.15,rx:.255,rz:.42}] : [{z:-.58,rx:.29,rz:.4}], m, data);
  const lead = avro ? 2.13 : 1.5, trail = avro ? .5 : -.02, topY = avro ? 1.43 : 1.26;
  const upper = airfoil(group, [[0,lead,trail,topY,.15],[.7,lead,trail,topY,.15],[half*.42,lead,trail,topY+.015,.145],[half*.78,lead-.015,trail+.03,topY+.04,.135],[half-.2,lead-.07,trail+.12,topY+.055,.11],[half,lead-.25,trail+.31,topY+.055,.025]], m.wing, m.belly, data);
  const lower = airfoil(group, [[0,lead-.17,trail-.17,-.23,.15],[.7,lead-.17,trail-.17,-.23,.15],[half*.62,lead-.19,trail-.15,-.14,.14],[half-.22,lead-.25,trail-.04,-.07,.11],[half*.985,lead-.43,trail+.13,-.06,.025]], m.wing, m.belly, data, .025, stations);
  const bays = avro ? [1.85, 3.95] : [2.75];
  for (const s of [-1, 1]) {
    for (const x of bays) for (const z of [lead - .23, trail + .2]) beam(group, lower.surface(s*x,z-.16,1), upper.surface(s*x,z, -1), .066, m.wood);
    for (const z of [lead - .34, trail + .23]) beam(group, [s*.36,.4,z-.17], [s*.7,topY-.025,z], .062, m.wood);
    let previous = .72;
    for (const x of bays) {
      for (const z of [lead - .25, trail + .21]) {
        rod(group, upper.surface(s*previous,z,-1), lower.surface(s*x,z-.16,1), .012, m.metal, 5);
        rod(group, lower.surface(s*previous,z-.16,1), upper.surface(s*x,z,-1), .012, m.metal, 5);
      }
      previous = x;
    }
    wingMark(group, upper, m, palette.enemy ? 'cross' : 'raf', s * (half - .95), (lead + trail) / 2, avro ? .53 : .5);
  }
  fabricRibs(group, upper, m, data, avro ? .63 : .57); fabricRibs(group, lower, m, data, avro ? .63 : .57);
  const tailZ = avro ? -3.65 : -2.23, tailSpan = avro ? 1.53 : 1.35;
  airfoil(group, [[0,tailZ+.68,tailZ-.56,.11,.1],[.6,tailZ+.58,tailZ-.58,.12,.1],[tailSpan*.82,tailZ+.3,tailZ-.44,.13,.07],[tailSpan,tailZ-.02,tailZ-.19,.13,.02]], m.wing, m.belly, data, .025, stations);
  fin(group, avro ? [[.07,-4.4],[.65,-4.53],[1.3,-4.05],[1.18,-3.53],[.17,-3.31]] : [[.1,-2.79],[.78,-2.98],[1.22,-2.55],[1.13,-2.1],[.66,-1.67],[.08,-1.78]], m.wing, .095);
  finFlash(group,m,avro?-4.0:-2.51,.36,avro?.52:.4,.53,.067);
  radial(group,0,0,avro?3.99:2.43,avro?.49:.61,avro?.65:.73,avro?1.45:1.32,m,data,{wood:true,metal:true,blades:2});
  if (!avro) {
    ellipsoid(group,[.42,.2,.68],m.body,[0,.57,1.11],1);
    for (const s of [-1,1]) { box(group,[.14,.17,.54],m.dark,[s*.22,.73,.87]); tube(group,.058,.025,.82,m.dark,[s*.22,.73,1.49],[0,0,0],10); }
  }
  const wheels=undercarriage(group,[[-(avro?.93:.84),avro?1.95:1.17,avro?.4:.38,avro?1.27:1.2],[(avro?.93:.84),avro?1.95:1.17,avro?.4:.38,avro?1.27:1.2]],m,data,true);
  rod(wheels,[-(avro?.93:.84),avro?-1.27:-1.2,avro?1.95:1.17],[(avro?.93:.84),avro?-1.27:-1.2,avro?1.95:1.17],.062,m.metal,10);
  rod(wheels,[0,-.11,tailZ],[0,-.58,tailZ-.37],.06,m.wood,8); rod(wheels,[0,-.58,tailZ-.37],[0,-.56,tailZ-.66],.055,m.metal,8);
  if(avro){rod(wheels,[0,-1.26,.58],[0,-1.32,2.99],.065,m.wood,8);rod(wheels,[0,-1.32,2.99],[0,-1.05,3.53],.065,m.wood,8);rod(wheels,[0,-.35,2.28],[0,-1.29,2.55],.055,m.wood,8);}
  fuselageMark(group,stations,m,palette.enemy?'cross':'raf',avro?-2.15:-1.53,.02,avro?.28:.245);
  // Exposed tail-control cables belong on these early airframes; the tall
  // radio aerial used by the later fighters does not.
  if(detail(data))for(const s of[-1,1])rod(group,[s*(avro?.27:.31),.02,avro?-1.7:-1.13],[s*.12,.12,tailZ-.28],.009,m.dark,5);
  data.span=half*2;data.length=avro?8.97:5.7;
}

function fighter(group, kind, palette, data) {
  const spit=kind==='spitfire',hellcat=kind==='hellcat',m=materials(palette,kind);
  const stations=hellcat
    ? [[-5.2,.09,.2,.2],[-4.25,.44,.64,.2],[-3.0,.82,1.06,.18],[-1.8,1.16,1.46,.13],[-.7,1.48,1.83,.1],[.6,1.74,1.9,.02],[1.7,1.85,1.86,0],[2.7,1.96,1.89,0],[3.6,1.92,1.8,0]]
    : spit ? [[-4.56,.09,.2,.14],[-3.7,.3,.49,.16],[-2.8,.53,.79,.15],[-1.7,.82,1.1,.12],[-.7,1.1,1.35,.03],[.7,1.2,1.37,0],[1.7,1.12,1.31,0],[2.8,.95,1.13,0],[3.8,.77,.86,.04],[4.05,.68,.72,.04]]
    : [[-4.38,.07,.16,.15],[-3.4,.3,.5,.17],[-2.5,.51,.8,.14],[-1.3,.76,1.06,.1],[-.25,1.0,1.2,.06],[.9,1.02,1.25,0],[2.1,.98,1.17,0],[3.25,.86,.95,-.01],[3.94,.66,.72,.02]];
  skin(group,stations,m.body,data,28);
  const wingStations=hellcat
    ? [[0,1.55,-2.1,-.41,.31],[1.1,1.55,-2.1,-.41,.31],[2.7,1.35,-1.96,-.29,.27],[4.6,1.01,-1.63,-.08,.2],[6.2,.69,-1.27,.1,.13],[6.53,.42,-.94,.14,.035]]
    : spit ? [[0,1.45,-1.63,-.34,.26],[.65,1.47,-1.6,-.34,.26],[1.6,1.41,-1.55,-.25,.24],[2.7,1.24,-1.46,-.14,.2],[3.75,.94,-1.27,-.02,.16],[4.65,.53,-1.02,.08,.12],[5.25,.13,-.72,.14,.075],[5.61,-.24,-.42,.18,.018]]
    : [[0,1.3,-1.22,-.37,.23],[.55,1.32,-1.23,-.37,.23],[1.4,1.1,-1.18,-.3,.21],[3.2,.61,-1.08,-.1,.16],[4.7,.19,-.95,.06,.105],[4.96,-.04,-.72,.1,.024]];
  const main=airfoil(group,wingStations,m.wing,m.belly,data,.025,stations);
  const tailZ=hellcat?-4.17:spit?-3.77:-3.67,tailSpan=hellcat?2.32:spit?1.7:1.5;
  airfoil(group,[[0,tailZ+.64,tailZ-.67,.3,.16],[.7,tailZ+.57,tailZ-.67,.32,.15],[tailSpan*.73,tailZ+.22,tailZ-.57,.36,.105],[tailSpan,tailZ-.12,tailZ-.38,.39,.022]],m.wing,m.belly,data,.025,stations);
  fin(group,hellcat?[[.28,-5.17],[1.28,-5.08],[2.35,-4.62],[2.62,-3.92],[2.02,-3.53],[.65,-3.34],[.25,-2.83]]:spit?[[.22,-4.57],[.9,-4.65],[1.86,-4.13],[1.96,-3.69],[1.32,-3.4],[.48,-3.14],[.2,-2.93]]:[[.2,-4.38],[1.11,-4.41],[1.94,-4.04],[1.95,-3.46],[1.49,-3.25],[.52,-3.06],[.2,-2.88]],m.body,.13);
  if(hellcat)framedCanopy(group,[[-1.55,.08,1.0,1.13],[-.94,.47,.93,1.73],[.04,.48,.91,1.8],[.66,.37,.89,1.62],[.96,.26,.85,1.12]],m,data);
  else if(spit)framedCanopy(group,[[-1.44,.18,.69,.91],[-.94,.4,.67,1.29],[.07,.41,.68,1.32],[.48,.33,.66,1.2],[.77,.22,.62,.88]],m,data);
  else framedCanopy(group,[[-1.14,.24,.62,1.03],[-.77,.38,.61,1.3],[.18,.39,.62,1.34],[.61,.34,.59,1.27],[.89,.24,.56,.83]],m,data);
  if(hellcat){
    radial(group,0,-.03,4.55,1.02,1.75,1.94,m,data,{blades:3});
    ellipsoid(group,[.52,.17,.035],m.dark,[0,-.63,4.59],1);
    box(group,[.83,.07,.12],m.body,[0,-.48,4.59]);
    for(const s of[-1,1])tube(group,.11,.07,.52,m.metal,[s*.84,-.52,2.55],[0,s*.85,0],10);
  } else {
    const propZ=spit?4.1:4.01;propeller(group,0,.025,propZ,spit?1.55:1.5,m.dark,data,3);
    skin(group,[[propZ-.1,.81,.81,.025],[propZ+.16,.68,.68,.025],[propZ+.42,.25,.25,.025],[propZ+.49,.025,.025,.025]],spit?m.dark:m.yellow,data,24);
    for(const s of[-1,1])exhaustRow(group,s*(spit?.53:.51),.22,spit?3.15:3.22,6,.21,m,data,s);
  }
  for(const s of[-1,1]){
    const count=spit?4:hellcat?3:1;
    for(let i=0;i<count;i++){const x=s*(spit?2.17+i*.43:hellcat?2.96+i*.31:2.06),p=main.at(x);cylinder(group,spit?.027:.039,spit?.027:.039,.11,m.dark,[x,p[3]+.025,p[1]+.015],[Math.PI/2,0,0],8);}
    panelLine(group,main.surface,s*(hellcat?2.63:spit?3.79:3.2),main.at(hellcat?2.63:spit?3.79:3.2)[1]-.08,main.at(hellcat?2.63:spit?3.79:3.2)[2]+.07,m.dark,data);
    if(spit||!hellcat){
      const x=s*(spit?2.0:1.65),wide=spit?(s<0?.72:.4):.63,z=spit?-.4:-.45;
      const duct=new THREE.Group();duct.position.set(x,-.61,z);group.add(duct);
      skin(duct,[[-.65,wide*.65,.17,0],[-.25,wide,.31,-.04],[.53,wide,.31,-.04],[.67,wide*.92,.25,-.02]],m.belly,data,16);
      box(duct,[wide*.8,.18,.025],m.dark,[0,-.04,.69]);
    }
  }
  if(!hellcat&&!spit){
    skin(group,[[1.7,.43,.28,-.61],[2.1,.6,.4,-.62],[2.88,.52,.4,-.6],[3.09,.4,.23,-.55]],m.belly,data,16);
    box(group,[.38,.15,.035],m.dark,[0,-.61,3.1]);
  }
  if(spit){
    for(const s of[-1,1]){
      const patch=[[s*.7,.8],[s*1.8,1.3],[s*2.6,1.2],[s*2.15,.3],[s*2.7,-.9],[s*2.2,-1.47],[s*1.0,-1.53]];
      paintedShape(group,patch,m.camo,(x,z)=>main.surface(x,z,1,.014));
      wingMark(group,main,m,'raf',s*3.97,-.28,.57);
    }
    finFlash(group,m,-3.91,.81,.4,.69,.086);fuselageMark(group,stations,m,'raf',-2.14,.12,.32);
  }else if(hellcat){
    wingMark(group,main,m,'us',4.47,-.17,.61);wingMark(group,main,m,'us',-4.47,-.17,.61,-1);fuselageMark(group,stations,m,'us',-2.05,.16,.39);
  }else{
    for(const s of[-1,1])wingMark(group,main,m,'cross',s*3.51,-.24,.52);
    fuselageMark(group,stations,m,'cross',-1.97,.13,.32);
  }
  undercarriage(group,[[-(hellcat?1.84:spit?1.68:1.17),hellcat?.56:.66,hellcat?.49:.38,hellcat?1.7:1.45],[(hellcat?1.84:spit?1.68:1.17),hellcat?.56:.66,hellcat?.49:.38,hellcat?1.7:1.45],[0,tailZ-.23,hellcat?.22:.18,.69]],m,data);
  if(hellcat)rod(data.gear,[0,-.33,-3.5],[0,-.66,-4.58],.045,m.metal,8);
  cockpitMast(group,[0,hellcat?1.63:1.35,hellcat?-1.73:-1.44],[0,hellcat?2.23:1.65,tailZ-.05],m,data);
  navLights(group,main,m,data);
  data.span=hellcat?13.06:spit?11.22:9.92;data.length=hellcat?10.24:spit?9.12:8.95;
}

function lightning(group, palette, data) {
  const m = materials(palette, 'p38');
  const nacelle = [
    [-3.67,.05,.08,.05], [-2.9,.61,.76,.07], [-1.7,1.14,1.18,.14],
    [.2,1.35,1.48,.15], [2.2,1.27,1.24,.1], [3.75,.76,.72,.07], [4.8,.07,.1,.08],
  ];
  skin(group, nacelle, m.body, data);
  framedCanopy(group, [[-.3,.44,.78,.98],[.35,.54,.88,1.6],[1.35,.52,.84,1.62],
    [1.86,.51,.77,1.46],[2.42,.37,.66,.89]], m, data);

  const main = airfoil(group, [[0,1.45,-1.76,-.19,.43],[2.72,1.27,-1.36,-.14,.46],
    [4.1,1,-1.13,.08,.33],[6.2,.48,-.94,.3,.22],[7.35,.16,-.8,.44,.15],
    [7.83,-.21,-.63,.53,.06],[7.91,-.4,-.49,.55,.025]], m.wing, m.belly, data, .028, nacelle);
  // The shared horizontal tail ends at the two vertical fins.
  airfoil(group, [[0,-4.03,-5.45,.29,.22],[2.73,-4.15,-5.48,.29,.18]],
    m.wing, m.belly, data);
  const booms = [[-5.74,.09,.16,.14],[-5.12,.44,.62,.11],[-3.8,.63,.72,.07],
    [-2.24,.93,1.02,.04],[-.05,1.12,1.39,.08],[1.1,1.36,1.58,.11],
    [2.63,1.2,1.31,.12],[3.8,.76,.84,.11],[4.15,.56,.6,.11]];
  for (const side of [-1, 1]) {
    const x = side * 2.73;
    const boom = new THREE.Group();
    boom.position.x = x;
    group.add(boom);
    skin(boom, booms, m.body, data, 24);
    fin(boom, [[.03,-5.7],[.93,-5.67],[1.84,-5.39],[1.93,-4.84],[1.59,-4.38],[.6,-4.08],[.14,-3.82]],
      m.wing, .17);
    skin(boom, [[4.01,.59,.61,.11],[4.23,.57,.58,.11],[4.5,.33,.33,.11],[4.65,.04,.04,.11]], m.red, data, 20);
    propeller(group, x, .11, 4.23, 1.69, m.dark, data, 3);
    const radiator = new THREE.Group();
    radiator.position.set(x,-.21,-2.39);
    group.add(radiator);
    skin(radiator,[[-.74,.5,.39,0],[-.46,1.06,.62,0],[.27,1.16,.73,0],[.53,.88,.4,.04]],m.belly,data,20);
    box(radiator,[.72,.29,.045],m.dark,[0,.015,.548]);
    exhaustRow(boom,side*.57,.29,2.97,6,.2,m,data,side);
    const aileron = main.at(side * 6.08);
    panelLine(group,main.surface,side*6.08,aileron[1]-.11,aileron[2]+.08,m.dark,data);
    if (detail(data)) {
      beam(group,main.surface(side*5.03,-.59,1,.014),main.surface(side*7.44,-.55,1,.014),.018,m.dark);
      wingMark(group,main,m,'us',side*5.46,-.27,.54,side);
    }
  }
  for (const [x, y, z, radius, length] of [[0,.06,4.82,.057,.49],[-.21,.19,4.56,.035,.31],
    [.21,.19,4.56,.035,.31],[-.27,-.15,4.39,.034,.31],[.27,-.15,4.39,.034,.31]]) {
    cylinder(group,radius,radius,length,m.dark,[x,y,z],[Math.PI/2,0,0],10);
  }
  undercarriage(group,[[-2.73,.05,.48,1.65],[2.73,.05,.48,1.65],[0,2.88,.34,1.79]],m,data);
  navLights(group,main,m,data);
  data.span = 15.82;
  data.length = 10.82;
}

function framedNose(group, stations, m, data) {
  skin(group,stations,m.glass,data,24);
  const circumference=detail(data)?20:12;
  for(const [index,p]of stations.slice(0,-1).entries()){
    if(!detail(data)&&index%2)continue;
    let previous=null;
    for(let i=0;i<=circumference;i++){const a=TAU*i/circumference,current=[(p[4]||0)+Math.cos(a)*p[1]/2,(p[3]||0)+Math.sin(a)*p[2]/2,p[0]];if(previous)beam(group,previous,current,.05,m.body);previous=current;}
  }
  for(let i=0;i<8;i++){
    const a=TAU*i/8;let previous=null;
    for(const p of stations){const current=[(p[4]||0)+Math.cos(a)*p[1]/2,(p[3]||0)+Math.sin(a)*p[2]/2,p[0]];if(previous)beam(group,previous,current,.045,m.body);previous=current;}
  }
}

function sideWindow(group, stations, side, z, y, width, height, m, outline = false) {
  const coords=[[z-width/2,y-height/2],[z+width/2,y-height/2],[z+width/2,y+height/2],[z-width/2,y+height/2]];
  paintedShape(group,coords,m.dark,(zz,yy)=>sideProject(stations,side,zz,yy,.017),[side,0,0]);
  if(outline)for(let i=0;i<4;i++)rod(group,sideProject(stations,side,...coords[i],.025),sideProject(stations,side,...coords[(i+1)%4],.025),.021,m.metal,6);
}

function turret(group, x, y, z, radius, m, data, aft = false) {
  cylinder(group,radius,radius,.14,m.body,[x,y,z],[0,0,0],24);
  cockpit(group,x,y+.04,z,[radius*.95,radius*.73,radius*.95],m.glass,{frame:m.body,hoops:[0],spine:true,seat:false,width:.027});
  const direction=aft?-1:1;
  for(const s of[-1,1])rod(group,[x+s*.12,y+radius*.4,z+direction*radius*.35],[x+s*.12,y+radius*.43,z+direction*(radius+1.05)],.043,m.dark,8);
}

function bomber(group, palette, data) {
  const m=materials(palette,'b17');
  const stations=[[-10.9,.24,.42,.22],[-9.67,.62,.86,.24],[-7.7,1.02,1.4,.15],[-5.2,1.6,2.02,.06],[-2.5,2.05,2.46,0],[.5,2.28,2.62,0],[3.6,2.35,2.65,0],[6.1,2.19,2.46,.05],[8.1,1.94,2.1,.02],[9.55,1.7,1.73,-.03]];
  skin(group,stations,m.body,data,30);
  const main=airfoil(group,[[0,3.54,-2.97,-.12,.52],[1.3,3.55,-2.95,-.12,.52],[4.6,3.02,-2.69,.11,.44],[8.0,2.28,-2.19,.38,.34],[11.8,1.3,-1.57,.72,.22],[15.2,.17,-.84,1.03,.11],[15.81,-.24,-.51,1.07,.025]],m.wing,m.belly,data,.025,stations);
  airfoil(group,[[0,-7.07,-10.55,.48,.26],[1.2,-7.16,-10.52,.53,.25],[3.95,-8.0,-10.15,.66,.17],[5.05,-8.56,-9.72,.71,.08],[5.32,-9.0,-9.43,.72,.025]],m.wing,m.belly,data,.025,stations);
  fin(group,[[.25,-10.97],[1.83,-11.07],[3.75,-10.51],[4.1,-9.65],[3.65,-8.96],[2.02,-8.42],[.53,-6.5],[.21,-6.9]],m.body,.18);
  framedCanopy(group,[[5.82,.61,1.05,1.53],[6.33,.94,1.07,2.0],[7.34,.91,1.03,2.08],[8.18,.68,.92,1.68],[8.57,.53,.83,1.1]],m,data);
  framedNose(group,[[9.35,1.74,1.75,-.03],[9.91,1.63,1.62,-.035],[10.53,1.24,1.31,-.04],[10.99,.69,.85,-.06],[11.27,.12,.24,-.08]],m,data);
  if(detail(data)){box(group,[.57,.29,.51],m.dark,[0,-.28,10.1]);ellipsoid(group,[.23,.16,.28],m.dark,[0,-.74,10.34],1);}
  for(const s of[-1,1])for(const [x,z]of[[4.65,4.57],[9.65,3.48]]){
    radial(group,s*x,-.02+x*.022,z,.87,3.8,1.84,m,data,{efficient:true});
    tube(group,.12,.076,.65,m.metal,[s*(x+.52),-.58,z-1.13],[0,s*.35,0],10);
  }
  turret(group,0,1.34,4.58,.69,m,data);
  ellipsoid(group,[.62,.65,.62],m.glass,[0,-1.58,-.9],detail(data)?2:1);
  ring(group,.63,.57,m.body,[0,-1.58,-.9],[0,Math.PI/2,0],24);
  for(const s of[-1,1])rod(group,[s*.13,-1.82,-.48],[s*.13,-2.04,.92],.039,m.dark,8);
  for(const s of[-1,1]){
    sideWindow(group,stations,s,-4.25,.15,1.17,.72,m,true);
    const start=sideProject(stations,s,-4.25,.16,.04);rod(group,start,[start[0]+s*1.15,start[1]-.06,start[2]-.28],.044,m.dark,8);
    if(detail(data)){sideWindow(group,stations,s,3.72,.48,.48,.56,m);sideWindow(group,stations,s,8.72,.18,.52,.52,m);}
  }
  ellipsoid(group,[.3,.3,.6],m.glass,[0,.39,-10.39],1);
  for(const s of[-1,1])rod(group,[s*.12,.22,-10.5],[s*.12,.21,-11.41],.042,m.dark,8);
  undercarriage(group,[[-4.65,1.4,.65,1.94],[4.65,1.4,.65,1.94],[0,-9.23,.29,.88]],m,data);
  wingMark(group,main,m,'us',11.24,-.14,.89);wingMark(group,main,m,'us',-11.24,-.14,.89,-1);
  fuselageMark(group,stations,m,'us',-6.03,.13,.53);
  for(const s of[-1,1])panelLine(group,main.surface,s*11.3,main.at(11.3)[1]-.06,main.at(11.3)[2]+.06,m.dark,data);
  cockpitMast(group,[0,2.02,2.2],[0,3.73,-9.72],m,data);navLights(group,main,m,data);
  data.span=31.62;data.length=22.66;
}

function transport(group,palette,data){
  const m=materials(palette,'c47');
  const stations=[[-9.76,.11,.23,.18],[-8.63,.5,.77,.18],[-7.1,.97,1.47,.13],[-5.3,1.61,2.06,.03],[-3.1,2.17,2.59,0],[-.5,2.49,2.81,0],[2.6,2.54,2.78,0],[5.32,2.31,2.49,.015],[7.17,1.99,2.0,-.08],[8.62,1.47,1.33,-.25],[9.48,.49,.69,-.28],[9.84,.055,.15,-.28]];
  skin(group,stations,m.body,data,28);
  const main=airfoil(group,[[0,3.07,-2.84,-.63,.48],[1.5,3.07,-2.84,-.63,.48],[4.45,2.63,-2.66,-.4,.4],[8.1,1.62,-2.13,.03,.29],[12.72,.17,-1.37,.53,.14],[14.48,-.47,-1.05,.68,.025]],m.wing,m.belly,data,.025,stations);
  airfoil(group,[[0,-6.8,-9.53,.53,.24],[1,-6.84,-9.49,.56,.23],[3.8,-7.63,-9.13,.69,.13],[4.55,-8.13,-8.73,.73,.025]],m.wing,m.belly,data,.025,stations);
  fin(group,[[.22,-9.72],[1.63,-9.65],[3.15,-9.0],[3.56,-8.23],[2.97,-7.62],[1.13,-7.08],[.29,-5.95]],m.body,.17);
  framedCanopy(group,[[5.97,.54,1.02,1.39],[6.52,.92,.93,1.67],[7.38,.85,.83,1.66],[8.21,.6,.58,1.13],[8.54,.42,.39,.63]],m,data);
  for(const s of[-1,1])radial(group,s*4.56,-.34,4.18,.96,3.91,1.88,m,data,{cylinders:7});
  // Five broad bands wrap the rear body and both wings. They remain geometry
  // conforming rather than hovering rectangles on the curved skins.
  for(let i=0;i<5;i++){
    const start=-4.63+i*.49,end=start+.49,sections=[];
    for(let j=0;j<=6;j++){const p=sectionAt(stations,mix(start,end,j/6));sections.push([p[0],p[1]+.05,p[2]+.05,p[3]]);}
    loft(group,sections,i%2?m.black:m.white,detail(data)?28:18);
  }
  for(const s of[-1,1])for(let i=0;i<5;i++){
    const a=5.85+i*.55,b=a+.55,frontA=main.at(a)[1]-.012,frontB=main.at(b)[1]-.012,backA=main.at(a)[2]+.012,backB=main.at(b)[2]+.012;
    const outline=[[s*a,frontA],[s*b,frontB],[s*b,backB],[s*a,backA]];
    for(const face of[-1,1])paintedShape(group,outline,i%2?m.black:m.white,(x,z)=>main.surface(x,z,face,.02),[0,face,0]);
  }
  for(const s of[-1,1])for(let i=0;i<7;i++)sideWindow(group,stations,s,4.58-i*1.15,.55,.56,.47,m,detail(data));
  // Cargo opening is on the aircraft's port side (+X), behind the wing.
  const door=[[ -5.26,-.76],[-3.78,-.76],[-3.78,.99],[-5.26,.99]];
  for(let i=0;i<4;i++)rod(group,sideProject(stations,1,...door[i],.045),sideProject(stations,1,...door[(i+1)%4],.045),.027,m.dark,8);
  rod(group,sideProject(stations,1,-4.49,-.76,.048),sideProject(stations,1,-4.49,.99,.048),.021,m.dark,6);
  const handle=sideProject(stations,1,-4.28,.0,.071);rod(group,[handle[0],handle[1],handle[2]-.13],[handle[0],handle[1],handle[2]+.13],.027,m.metal,8);
  undercarriage(group,[[-4.56,1.05,.67,1.97],[4.56,1.05,.67,1.97],[0,-8.55,.28,.88]],m,data);
  wingMark(group,main,m,'us',10.85,-.62,.85);wingMark(group,main,m,'us',-10.85,-.62,.85,-1);
  fuselageMark(group,stations,m,'us',-.77,.2,.55);
  cockpitMast(group,[0,1.75,4.8],[0,3.12,-8.44],m,data);navLights(group,main,m,data);
  data.span=28.96;data.length=19.66;
}

function heinkel(group,palette,data){
  const m=materials(palette,'he111');
  const stations=[[-8.12,.15,.32,.12],[-7.15,.48,.77,.14],[-5.7,.89,1.23,.12],[-3.7,1.43,1.84,.07],[-1.3,1.92,2.23,.03],[1.3,2.12,2.32,0],[3.8,2.08,2.23,0],[5.2,1.93,2.07,.01]];
  skin(group,stations,m.body,data,28);
  const main=airfoil(group,[[0,2.16,-2.47,-.23,.43],[1.3,2.17,-2.47,-.23,.43],[3.3,1.94,-2.38,-.09,.37],[6.4,1.47,-2.03,.15,.28],[8.7,.83,-1.63,.32,.18],[10.46,.1,-1.12,.46,.11],[11.29,-.44,-.72,.52,.025]],m.wing,m.belly,data,.025,stations);
  airfoil(group,[[0,-5.5,-7.97,.4,.21],[.9,-5.52,-7.95,.43,.2],[2.82,-6.0,-7.69,.53,.12],[3.75,-6.62,-7.21,.59,.025]],m.wing,m.belly,data,.025,stations);
  fin(group,[[.15,-8.12],[1.29,-8.13],[2.8,-7.56],[3.07,-6.92],[2.61,-6.44],[1.09,-6.03],[.23,-4.9]],m.body,.16);
  framedNose(group,[[4.92,1.99,2.12,0,0],[5.85,1.87,2.02,.02,.05],[6.7,1.54,1.75,-.02,.1],[7.44,.94,1.23,-.1,.14],[8.09,.22,.47,-.15,.15]],m,data);
  framedCanopy(group,[[4.72,.24,1.02,1.15],[5.16,.46,1.03,1.45],[5.86,.41,.99,1.38],[6.29,.18,.9,1.09]],m,data);
  rod(group,[.15,-.02,7.94],[.15,-.12,8.81],.044,m.dark,8);
  for(const s of[-1,1]){
    const x=s*3.65,engine=new THREE.Group();engine.position.set(x,-.17,0);group.add(engine);
    skin(engine,[[-2.42,.24,.43,.04],[-1.2,.91,1.21,0],[.9,1.19,1.43,0],[2.73,1.13,1.3,-.01],[3.65,.77,.9,0]],m.body,data,24);
    propeller(group,x,-.17,3.83,1.76,m.dark,data,3);
    skin(engine,[[3.65,.78,.85,0],[3.98,.61,.67,0],[4.24,.12,.16,0]],m.dark,data,20);
    box(engine,[.75,.32,.94],m.body,[0,-.74,2.02]);box(engine,[.62,.22,.026],m.dark,[0,-.74,2.51]);
    exhaustRow(group,x+s*.59,.11,2.76,6,.21,m,data,s);
    for(let i=0;i<3;i++)sideWindow(group,stations,s,2.84-i*1.31,.42,.45,.48,m,detail(data));
    wingMark(group,main,m,'cross',s*8.16,-.48,.75);
    const patch=[[s*1.2,1.98],[s*4.9,1.74],[s*4.1,.1],[s*6.8,-1.74],[s*3.45,-2.26],[s*2.05,-.68]];
    paintedShape(group,patch,m.camo,(xx,z)=>main.surface(xx,z,1,.014));
  }
  turret(group,0,1.04,-2.1,.54,m,data,true);
  skin(group,[[.03,.36,.27,-1.15],[.66,.88,.62,-1.25],[2.76,.82,.62,-1.2],[3.44,.26,.29,-1.1]],m.glass,data,18);
  for(const s of[-1,1])rod(group,[s*.34,-1.19,.62],[s*.34,-1.15,2.82],.027,m.body,6);
  undercarriage(group,[[-3.65,.77,.59,1.8],[3.65,.77,.59,1.8],[0,-7.19,.25,.8]],m,data);
  fuselageMark(group,stations,m,'cross',-4.26,.08,.46);
  cockpitMast(group,[0,1.65,-.16],[0,2.68,-7.1],m,data);navLights(group,main,m,data);
  data.span=22.58;data.length=16.4;
}

export function buildClassicAircraft(group, kind, palette, data) {
  if(kind==='avro504'||kind==='camel')biplane(group,kind,palette,data);
  else if(kind==='spitfire'||kind==='hellcat'||kind==='bf109')fighter(group,kind,palette,data);
  else if(kind==='p38')lightning(group,palette,data);
  else if(kind==='b17')bomber(group,palette,data);
  else if(kind==='c47')transport(group,palette,data);
  else if(kind==='he111')heinkel(group,palette,data);
  else return false;
  return true;
}
