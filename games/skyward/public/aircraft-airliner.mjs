import * as THREE from './vendor/three.module.js';
import { mat, mesh, box, ellipsoid, cylinder, beam, loft, wing, gear, tube } from './model-parts.mjs';

// Original, bounded game art: a long twin-engine passenger widebody. Dimensions,
// window count and livery are authored for SKYWARD, not an aircraft specification.
// Nose +Z, up +Y, port +X. Wheels bottom at -3 to match the flight ground origin.
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const hull = [
  [-27, .13, .18, 2], [-25, 1.3, 1.4, 1.85], [-22, 3.4, 3.5, 1.7],
  [-18, 4.9, 5.1, 1.6], [-13, 5.25, 5.35, 1.6], [15, 5.25, 5.35, 1.6],
  [19, 5, 5.1, 1.6], [22, 4.3, 4.4, 1.5], [24.3, 3.1, 3, 1.1],
  [26, 1.6, 1.55, .9], [27, .05, .12, .82],
];

function smoothStations(stations, steps = 3) {
  const result = [];
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < steps; j++) {
    const t = j / steps, a = stations[Math.max(0, i - 1)], b = stations[i], c = stations[i + 1], d = stations[Math.min(stations.length - 1, i + 2)];
    const row = [mix(b[0], c[0], t)];
    for (let k = 1; k < 4; k++) {
      const value = .5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t);
      row.push(k < 3 ? Math.max(.035, value) : value);
    }
    result.push(row);
  }
  result.push(stations.at(-1));
  return result;
}

function hullAt(stations, z) {
  const index = Math.max(0, stations.findIndex((station, i) => i < stations.length - 1 && z >= station[0] && z <= stations[i + 1][0]));
  const a = stations[index], b = stations[index + 1], t = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
  return [z, mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t)];
}

function skinPoint(stations, side, y, z, offset = .035) {
  const [, width, height, cy] = hullAt(stations, z);
  return [side * (width * .5 * Math.sqrt(Math.max(0, 1 - ((y - cy) / (height * .5)) ** 2)) + side * offset), y, z];
}

function pane(group, points, material) {
  const geometry = new THREE.BufferGeometry(), indices = [];
  for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return mesh(group, geometry, material);
}

function fin(group, outline, thickness, material) {
  const shape = new THREE.Shape();
  outline.forEach(([z, y], i) => i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 1, steps: 1 });
  geometry.translate(0, 0, -thickness / 2);
  return mesh(group, geometry, material, 0, 0, 0, [0, Math.PI / 2, 0]);
}

function cockpitPane(group, stations, side, z0, z1, theta0, theta1, material) {
  const vertices = [], indices = [], steps = 4;
  for (let j = 0; j <= steps; j++) for (let i = 0; i <= steps; i++) {
    const z = mix(z0, z1, j / steps), theta = mix(theta0, theta1, i / steps);
    const [, width, height, cy] = hullAt(stations, z);
    vertices.push(side * Math.cos(theta) * (width * .5 + .045), cy + Math.sin(theta) * (height * .5 + .045), z);
  }
  for (let j = 0; j < steps; j++) for (let i = 0; i < steps; i++) {
    const a = j * (steps + 1) + i, b = a + 1, c = a + steps + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); mesh(group, geometry, material);
}

function turbofan(group, side, materials, detailed) {
  const engine = new THREE.Group(); engine.name = side > 0 ? 'port-turbofan' : 'starboard-turbofan';
  engine.position.set(side * 7, -.75, .7); group.add(engine);
  const stations = smoothStations([[-2.3, 1.35, 1.35, 0], [-1.5, 2.2, 2.3, 0], [-.4, 2.7, 2.7, 0], [1.7, 2.96, 2.96, 0], [2.7, 2.86, 2.86, 0], [3.2, 2.8, 2.8, 0]], detailed ? 3 : 2);
  loft(engine, stations, materials.body, detailed ? 24 : 14);
  tube(engine, 1.43, 1.22, .42, materials.metal, [0, 0, 3.27], [0, 0, 0], detailed ? 28 : 16);
  mesh(engine, new THREE.CircleGeometry(1.225, detailed ? 28 : 16), materials.dark, 0, 0, 3.32);
  const blades = detailed ? 18 : 10;
  for (let i = 0; i < blades; i++) {
    const angle = TAU * i / blades;
    beam(engine, [Math.cos(angle) * .32, Math.sin(angle) * .32, 3.345], [Math.cos(angle + .23) * 1.14, Math.sin(angle + .23) * 1.14, 3.345], detailed ? .052 : .075, materials.fan);
  }
  ellipsoid(engine, [.30, .30, .31], materials.metal, [0, 0, 3.37]);
  tube(engine, .79, .62, .65, materials.dark, [0, 0, -2.20], [0, 0, 0], detailed ? 20 : 12);
  cylinder(engine, .50, .20, .85, materials.metal, [0, 0, -2.57]);
  // The pylon rises into the wing. No fighter pylons, missile rails or flames.
  box(group, [.44, 1.32, 2.7], materials.wing, [side * 7, .15, .95]);
}

export function buildAirlinerAircraft(group, palette, data) {
  const detailed = data.detail !== false;
  const materials = {
    body: mat(palette.body, .54, .15), wing: mat(palette.wing, .63, .23),
    accent: mat(palette.accent, .55, .15, { side: THREE.DoubleSide }),
    white: mat('#f0eee5', .62, .07, { side: THREE.DoubleSide }),
    glass: mat('#203e4c', .21, .4, { side: THREE.DoubleSide }),
    dark: mat('#1d2b33', .78, .20), fan: mat('#60747e', .47, .45),
    metal: mat('#a6b4bc', .31, .65), seam: mat('#65747a', .76, .12),
    red: mat('#c35a45', .42, .12, { emissive: '#d13e2b', emissiveIntensity: .45 }),
    green: mat('#4fa28a', .42, .12, { emissive: '#25896d', emissiveIntensity: .45 }),
  };
  data.span = 48.2; data.length = 54;
  const stations = smoothStations(hull, detailed ? 4 : 2);
  loft(group, stations, materials.body, detailed ? 32 : 18);
  ellipsoid(group, [3.12, .72, 7.6], materials.wing, [0, -.45, -1.9]);
  const mainWing = wing(group, [
    [-24, -10.6], [-16, -5.2], [-6, 2.6], [-2, 4], [2, 4], [6, 2.6], [16, -5.2], [24, -10.6],
    [24, -12.5], [16, -10.7], [6, -7.9], [2, -7.8], [-2, -7.8], [-6, -7.9], [-16, -10.7], [-24, -12.5],
  ], .67, materials.wing, .10);
  const wingPositions = mainWing.geometry.attributes.position;
  for (let i = 0; i < wingPositions.count; i++) wingPositions.setY(i, wingPositions.getY(i) + Math.max(0, Math.abs(wingPositions.getX(i)) - 3) * .055);
  mainWing.geometry.computeVertexNormals();
  wing(group, [[-9.7, -23], [-2, -17.8], [2, -17.8], [9.7, -23], [9.7, -25.1], [2, -24.2], [-2, -24.2], [-9.7, -25.1]], .36, materials.wing, 2.82);
  fin(group, [[-14.8, 3.1], [-19, 10.8], [-21.5, 12.15], [-25.3, 12.15], [-26, 2.5]], .38, materials.accent);
  for (const side of [-1, 1]) {
    // A simple fictional airline tail mark and cheatline keep the hull readable.
    pane(group, [[side * .231, 9.9, -22.1], [side * .231, 8.8, -20.6], [side * .231, 5.1, -23.8], [side * .231, 7.2, -23.0]], materials.white);
    for (let z = -20; z < 20; z += 1) pane(group, [skinPoint(stations, side, .85, z), skinPoint(stations, side, 1.16, z), skinPoint(stations, side, 1.16, z + 1), skinPoint(stations, side, .85, z + 1)], materials.accent);
    // The row lies on the actual curved skin, including the narrower aft cabin.
    const spacing = detailed ? .94 : 1.40;
    for (let z = -17.5; z < 19; z += spacing) {
      if ([18.7, 10.2, -16.8].some(door => Math.abs(z - door) < .7)) continue;
      const points = [];
      for (let i = 0; i < (detailed ? 12 : 8); i++) {
        const angle = TAU * i / (detailed ? 12 : 8);
        points.push(skinPoint(stations, side, 2.37 + Math.sin(angle) * .27, z + Math.cos(angle) * .205, .045));
      }
      pane(group, points, materials.glass);
    }
    for (const z of [18.7, 10.2, -16.8]) {
      const corners = [[.15, z - .50], [2.85, z - .50], [2.85, z + .50], [.15, z + .50]];
      for (let i = 0; i < corners.length; i++) beam(group, skinPoint(stations, side, ...corners[i], .055), skinPoint(stations, side, ...corners[(i + 1) % corners.length], .055), .035, materials.seam);
      if (detailed) beam(group, skinPoint(stations, side, 1.52, z - .28, .07), skinPoint(stations, side, 1.52, z + .02, .07), .055, materials.metal);
    }
    cockpitPane(group, stations, side, 21.25, 22.15, .35, .77, materials.glass);
    cockpitPane(group, stations, side, 22.27, 23.13, .48, 1.06, materials.glass);
    cockpitPane(group, stations, side, 23.25, 24.05, .68, 1.49, materials.glass);
    turbofan(group, side, materials, detailed);
    if (detailed) {
      const seam = (x, z) => [side * x, .35 + Math.max(0, x - 3) * .055, z];
      beam(group, seam(4, -7.0), seam(15.6, -9.85), .045, materials.seam);
      beam(group, seam(16.1, -9.95), seam(23.2, -11.70), .045, materials.seam);
      for (const x of [5.6, 9.9, 14.6]) beam(group, seam(x, -4.1 - x * .23), seam(x, -6.5 - x * .18), .035, materials.seam);
      // Small fairings below the flaps read from behind without extra animations.
      for (const [x, z] of [[5.4, -7.6], [10.0, -8.9], [15, -10.2]]) ellipsoid(group, [.16, .23, 1.6], materials.wing, [side * x, -.05 + (x - 3) * .055, z]);
    }
  }
  const wheels = [];
  for (const side of [-1, 1]) for (const across of [-.34, .34]) for (const z of [-4.6, -3.3]) wheels.push([side * 3.65 + across, z, .62, 2.38]);
  wheels.push([-.24, 18.25, .40, 2.60], [.24, 18.25, .40, 2.60]);
  const undercarriage = gear(group, wheels, data, false);
  for (const side of [-1, 1]) {
    beam(undercarriage, [side * 3.65, -2.38, -4.75], [side * 3.65, -2.38, -3.15], .20, materials.metal);
    box(undercarriage, [.12, 1.3, 2.35], materials.body, [side * 3.10, -1.38, -3.95]);
  }
  ellipsoid(group, [.14, .11, .19], materials.red, [23.98, 1.25, -11.35]);
  ellipsoid(group, [.14, .11, .19], materials.green, [-23.98, 1.25, -11.35]);
  ellipsoid(group, [.14, .12, .17], materials.red, [0, 4.29, 3.8]);
  if (detailed) {
    beam(group, [0, 4.18, -5], [0, 4.75, -5.6], .07, materials.seam);
    ellipsoid(group, [.40, .20, .92], materials.body, [0, 4.18, -.3]);
  }
  return group;
}
