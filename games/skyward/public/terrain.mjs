// One surface for rendering, flight collision, weapons and radar masking.
// Canyon cells use the same fixed diagonal as the terrain meshes. A mountain
// that hides a contact on screen therefore also intercepts its missile.
import { basis, orientationOf } from './orientation.mjs';
import { modeledAirframeBounds } from './airframes.mjs';
export const TERRAIN_CELL_SIZE = 64;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mix = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const biomeOf = mission => typeof mission === 'string' ? mission : mission?.biome;

export function runwayCoordinates(x, z, runway) {
  const dx = x - runway.x, dz = z - runway.z;
  return { across: dx * Math.cos(runway.heading) - dz * Math.sin(runway.heading), along: dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading) };
}

export function runwayAt(x, z, mission = {}, margin = 0) {
  return (mission.runways || []).findIndex(runway => {
    const q = runwayCoordinates(x, z, runway);
    return Math.abs(q.across) <= runway.width / 2 + margin && Math.abs(q.along) <= runway.length / 2 + margin;
  });
}

export function carrierLaunchLane(runway) { return finite(runway.launchLaneX, -0.12 * finite(runway.width, 40)); }

/** Exact solid boxes consumed by both renderers and the flight collider. */
export function carrierIslandParts(runway) {
  const w = finite(runway.width, 40), l = finite(runway.length, 310);
  return [
    { id: 'island', x: w * 0.37, y: 5, z: -l * 0.12, width: w * 0.24, height: 10, length: l * 0.23, material: 'body' },
    { id: 'bridge', x: w * 0.4, y: 13, z: -l * 0.13, width: w * 0.2, height: 6, length: l * 0.11, material: 'bridge' },
    { id: 'glass', x: w * 0.4, y: 13.7, z: -l * 0.13, width: w * 0.205, height: 1.6, length: l * 0.114, material: 'glass' },
    { id: 'mast', x: w * 0.4, y: 18, z: -l * 0.17, width: 1, height: 10, length: 1, material: 'mast' },
    { id: 'radar', x: w * 0.4, y: 21, z: -l * 0.17, width: w * 0.23, height: 0.5, length: 0.5, material: 'paint' },
  ];
}

function aircraftBox(pose, aircraft, runway) {
  const bounds = modeledAirframeBounds(aircraft), frame = basis(orientationOf(pose));
  const center = bounds.min.map((value, index) => (value + bounds.max[index]) / 2);
  const radius = bounds.min.map((value, index) => (bounds.max[index] - value) / 2);
  const x = pose.x - frame.right.x * center[0] + frame.up.x * center[1] + frame.forward.x * center[2];
  const y = pose.y - frame.right.y * center[0] + frame.up.y * center[1] + frame.forward.y * center[2];
  const z = pose.z - frame.right.z * center[0] + frame.up.z * center[1] + frame.forward.z * center[2];
  const c = Math.cos(runway.heading || 0), s = Math.sin(runway.heading || 0);
  const axes = [frame.right, frame.up, frame.forward];
  return { center: { x: (x - runway.x) * c - (z - runway.z) * s, y: y - runway.y, z: (x - runway.x) * s + (z - runway.z) * c },
    radius: { x: axes.reduce((sum, axis, i) => sum + Math.abs(axis.x * c - axis.z * s) * radius[i], 0),
      y: axes.reduce((sum, axis, i) => sum + Math.abs(axis.y) * radius[i], 0),
      z: axes.reduce((sum, axis, i) => sum + Math.abs(axis.x * s + axis.z * c) * radius[i], 0) } };
}

function sweptBoxTime(from, to, part, radius) {
  let enter = 0, leave = 1;
  for (const [axis, size] of [['x', 'width'], ['y', 'height'], ['z', 'length']]) {
    const half = part[size] / 2 + radius[axis], low = part[axis] - half, high = part[axis] + half;
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-10) { if (from[axis] < low || from[axis] > high) return null; continue; }
    let a = (low - from[axis]) / delta, b = (high - from[axis]) / delta;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a); leave = Math.min(leave, b);
    if (enter > leave) return null;
  }
  return enter >= 0 && enter <= 1 ? enter : null;
}

/** Sweep the modeled airframe envelope against visible carrier superstructure. */
export function carrierObstacleTime(from, to, aircraft, mission = {}) {
  let first = null;
  for (const runway of mission.runways || []) {
    if (!runway.carrier) continue;
    const span = Math.max(100, finite(runway.length, 310));
    if (Math.min(Math.hypot(from.x - runway.x, from.z - runway.z), Math.hypot(to.x - runway.x, to.z - runway.z)) > span * 2
      && Math.hypot(to.x - from.x, to.z - from.z) < span) continue;
    const a = aircraftBox(from, aircraft, runway), b = aircraftBox(to, aircraft, runway);
    const radius = { x: Math.max(a.radius.x, b.radius.x), y: Math.max(a.radius.y, b.radius.y), z: Math.max(a.radius.z, b.radius.z) };
    for (const part of carrierIslandParts(runway)) {
      const time = sweptBoxTime(a.center, b.center, part, radius);
      if (time !== null && (first === null || time < first)) first = time;
    }
  }
  return first;
}

/** Node heights. Call terrainHeight for an arbitrary point on the mesh. */
export function terrainGridHeight(x, z, mission = {}) {
  x = finite(x); z = finite(z);
  let height;
  const biome = biomeOf(mission);
  if (biome === 'canyon') {
    const main = 550 * Math.sin(z / 1700) + 210 * Math.sin(z / 680);
    const mainSlope = 550 / 1700 * Math.cos(z / 1700) + 210 / 680 * Math.cos(z / 680);
    const branch = 2200 + x * 0.45 + 420 * Math.sin(x / 1100);
    const branchSlope = 0.45 + 420 / 1100 * Math.cos(x / 1100);
    const cross = -4200 + 1100 * Math.sin(x / 2400);
    const crossSlope = 1100 / 2400 * Math.cos(x / 2400);
    const distance = Math.min(Math.abs(x - main) / Math.hypot(1, mainSlope),
      Math.abs(z - branch) / Math.hypot(1, branchSlope),
      Math.abs(z - cross) / Math.hypot(1, crossSlope));
    const floor = 75 + 22 * Math.sin(z / 2900) + 16 * Math.cos(x / 1800);
    const plateau = 1250 + 250 * Math.sin(x / 3100) * Math.cos(z / 2600)
      + 170 * Math.sin((x + z) / 4300);
    // A readable floor and steep, solid walls; intersections open into bowls.
    const wall = clamp((distance - 155) / 520, 0, 1);
    height = floor + (plateau - floor) * (wall * wall * (3 - 2 * wall));
    const coast = clamp((x + 13300) / 2400, 0, 1);
    height = mix(-8, height, coast * coast * (3 - 2 * coast));
  } else if (biome === 'pacific' || biome === 'south_atlantic') {
    const islandA = 1 - Math.hypot((x - 6500) / 3300, (z - 7000) / 4300);
    const islandB = 1 - Math.hypot((x + 7000) / 2200, (z - 13500) / 2900);
    const island = Math.max(islandA, islandB);
    height = island > 0 ? 4 + Math.pow(island, 1.3) * (biome === 'pacific' ? 550 : 360) : -8;
  } else if (biome === 'channel' && z > 3400 && z < 11500) height = -8;
  else if (biome === 'coast' && x > 2600 + Math.sin(z / 2500) * 500) height = -8;
  else if (biome === 'mountains') height = 45 + Math.pow(Math.max(0, Math.sin((x + z * 0.32) / 1700)), 2) * 1100
      + Math.pow(Math.max(0, Math.cos((z - x * 0.22) / 2400)), 2) * 620;
  else if (biome === 'jungle') height = 35 + Math.pow(Math.sin(x / 1600 + z / 2800), 2) * 135 + Math.pow(Math.sin(z / 1900), 2) * 95;
  else if (biome === 'desert') height = 18 + Math.sin(x / 650) * 6 + Math.cos(z / 930) * 7 + Math.max(0, Math.abs(x) - 6000) * 0.035;
  else if (biome === 'night') height = 19 + Math.sin(x / 2400) * 7 + Math.cos(z / 3100) * 8;
  else height = Math.max(2, 20 + Math.sin(x / 1800) * 12 + Math.sin(z / 2300) * 15 + Math.sin((x + z) / 3400) * 8);
  if (typeof mission === 'object' && mission.carrierWater) {
    const water = mission.carrierWater;
    const edge = clamp((Math.hypot(x - water.x, z - water.z) - water.radius) / (water.shore || 1000), 0, 1);
    height = mix(-8, height, edge * edge * (3 - 2 * edge));
  }
  if (typeof mission === 'object') for (const runway of mission.runways || []) {
    if (runway.carrier) continue;
    const q = runwayCoordinates(x, z, runway);
    const outside = Math.max(Math.abs(q.across) - runway.width * 1.1, Math.abs(q.along) - runway.length * 0.56, 0);
    if (outside < 250) height = mix(runway.y, height, outside / 250);
  }
  return height;
}

/** Negative height is open water; sea level is zero. */
export function terrainHeight(x, z, mission = {}) {
  x = finite(x); z = finite(z);
  if (biomeOf(mission) !== 'canyon') return terrainGridHeight(x, z, mission);
  const size = TERRAIN_CELL_SIZE, x0 = Math.floor(x / size) * size, z0 = Math.floor(z / size) * size;
  const fx = (x - x0) / size, fz = (z - z0) / size;
  const h10 = terrainGridHeight(x0 + size, z0, mission), h01 = terrainGridHeight(x0, z0 + size, mission);
  if (fx + fz <= 1) {
    const h00 = terrainGridHeight(x0, z0, mission);
    return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  }
  const h11 = terrainGridHeight(x0 + size, z0 + size, mission);
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

export function surfaceHeight(x, z, mission = {}) {
  const runway = mission.runways?.[runwayAt(x, z, mission, 3)];
  return Math.max(0, terrainHeight(x, z, mission), finite(runway?.y));
}

function segmentCuts(a, b, mission) {
  const cuts = [0, 1], dx = b.x - a.x, dz = b.z - a.z;
  if (biomeOf(mission) === 'canyon') {
    const size = TERRAIN_CELL_SIZE;
    for (const axis of ['x', 'z']) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-9) continue;
      const first = Math.floor(Math.min(a[axis], b[axis]) / size) + 1;
      const last = Math.floor(Math.max(a[axis], b[axis]) / size);
      for (let node = first; node <= last && node - first < 8192; node++) cuts.push((node * size - a[axis]) / delta);
    }
    cuts.sort((u, v) => u - v);
    const diagonals = [];
    if (Math.abs(dx + dz) > 1e-9) for (let i = 1; i < cuts.length; i++) {
      const mid = (cuts[i - 1] + cuts[i]) / 2;
      const x0 = Math.floor((a.x + dx * mid) / size) * size, z0 = Math.floor((a.z + dz * mid) / size) * size;
      const cross = (x0 + z0 + size - a.x - a.z) / (dx + dz);
      if (cross > cuts[i - 1] + 1e-10 && cross < cuts[i] - 1e-10) diagonals.push(cross);
    }
    cuts.push(...diagonals); cuts.sort((u, v) => u - v);
  } else {
    const samples = Math.max(1, Math.min(8192, Math.ceil(Math.hypot(dx, b.y - a.y, dz) / 18)));
    for (let i = 1; i < samples; i++) cuts.push(i / samples);
    cuts.sort((u, v) => u - v);
  }
  return cuts;
}

/** Earliest swept hit against the shared surface, including water and decks. */
export function segmentTerrainTime(from, to, mission = {}, clearance = 3, includeDecks = false) {
  const height = includeDecks ? surfaceHeight : (x, z, m) => Math.max(0, terrainHeight(x, z, m));
  const separation = t => mix(from.y, to.y, t) - height(mix(from.x, to.x, t), mix(from.z, to.z, t), mission) - clearance;
  let previous = 0, previousGap = separation(0);
  if (previousGap <= 0) return 0;
  const cuts = segmentCuts(from, to, mission);
  for (let i = 1; i < cuts.length; i++) {
    const t = cuts[i], gap = separation(t);
    if (gap <= 0) {
      let low = previous, high = t;
      for (let iteration = 0; iteration < 12; iteration++) {
        const middle = (low + high) / 2;
        if (separation(middle) <= 0) high = middle; else low = middle;
      }
      return high;
    }
    previous = t; previousGap = gap;
  }
  return null;
}

export function lineOfSight(a, b, mission = {}, clearance = 2) {
  return segmentTerrainTime(a, b, mission, clearance) === null;
}

/** A ground-distance cue uses actual flight velocity, including bank slip. */
export function terrainClearance(player, mission = {}, lookAheadSeconds = 2.5) {
  const agl = Math.max(0, finite(player.y) - surfaceHeight(player.x, player.z, mission));
  const end = { x: finite(player.x) + finite(player.vx) * lookAheadSeconds,
    y: finite(player.y) + finite(player.verticalSpeed) * lookAheadSeconds,
    z: finite(player.z) + finite(player.vz) * lookAheadSeconds };
  const impact = segmentTerrainTime(player, end, mission, 7, true);
  let minClearance = agl;
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    minClearance = Math.min(minClearance, mix(player.y, end.y, t) - surfaceHeight(mix(player.x, end.x, t), mix(player.z, end.z, t), mission));
  }
  return { agl, minClearance, timeToImpact: impact === null ? null : impact * lookAheadSeconds,
    pullUp: !player.onGround && player.health > 0 && (impact !== null || agl < 80 && finite(player.verticalSpeed) < -12) };
}
