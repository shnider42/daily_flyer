import {
  WORLD_RADIUS, WORLD_SEED, terrainHeight, COLLIDERS, LOOT_SPAWNS,
  SPAWNS, TREES, ROCKS, PROPS, PADS,
} from './world.mjs';

export const MAX_PLAYERS = 10;
export const DROP_SECONDS = 13;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.42;
export const BUILD_COST = 10;
export const WEAPONS = Object.freeze([
  { id: 0, name: 'Kestrel AR', short: 'ASSAULT', damage: 19, range: 104, rate: 6.5, magazine: 30, reload: 1.8, color: '#e4c18e', spread: .021, aimedSpread: .0045, pellets: 1 },
  { id: 1, name: 'Sidewinder', short: 'SMG', damage: 13, range: 57, rate: 10.5, magazine: 36, reload: 1.55, color: '#79d6c2', spread: .035, aimedSpread: .016, pellets: 1 },
  { id: 2, name: 'Breakwater', short: 'SHOTGUN', damage: 10, range: 31, rate: 1.1, magazine: 6, reload: 2.3, color: '#ed9e75', spread: .068, aimedSpread: .048, pellets: 8 },
  { id: 3, name: 'Longview', short: 'MARKSMAN', damage: 43, range: 135, rate: 1.65, magazine: 10, reload: 2.1, color: '#b5b4ed', spread: .035, aimedSpread: .0018, pellets: 1 },
]);
export const RARITIES = Object.freeze([
  { name: 'Common', color: '#c2c8c9', multiplier: 1 },
  { name: 'Uncommon', color: '#7bd889', multiplier: 1.08 },
  { name: 'Rare', color: '#6ebeff', multiplier: 1.16 },
  { name: 'Epic', color: '#c19aff', multiplier: 1.25 },
  { name: 'Legendary', color: '#ffd178', multiplier: 1.34 },
]);

const TAU = Math.PI * 2;
const STEP_HEIGHT = .52;
const GRAVITY = 23;
const LIMIT = WORLD_RADIUS + 9;
const GRID = 12;
const MAX_BUILDS = 100;
const MAX_LOOT = 180;
const NAV_SPACING = 1;
const NAV_LIMIT = Math.ceil(WORLD_RADIUS / NAV_SPACING);
const navigationCells = new Map();
const BOT_NAMES = ['Marlowe', 'Scout', 'Finch', 'Rook', 'Juniper', 'Copper', 'Mako', 'Piper', 'Sable', 'Drift'];
const neutral = Object.freeze({ moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, jump: false, fire: false, aim: false });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
const round3 = n => Math.round(n * 1000) / 1000;
function packetNumbers(object) {
  const packet = {};
  for (const [key, value] of Object.entries(object)) packet[key] = typeof value === 'number' ? round3(value) : value;
  return packet;
}
const hypot = Math.hypot;
let matchSerial = 0;

function randomGenerator(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function normalizeInput(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  let moveX = clamp(finite(value.moveX), -1, 1);
  let moveZ = clamp(finite(value.moveZ), -1, 1);
  const m = Math.max(1, hypot(moveX, moveZ));
  moveX /= m; moveZ /= m;
  return {
    moveX, moveZ,
    yaw: angle(finite(value.yaw)),
    pitch: clamp(finite(value.pitch), -1.35, 1.35),
    aimYaw: angle(finite(value.aimYaw, finite(value.yaw))),
    aimPitch: clamp(finite(value.aimPitch, finite(value.pitch)), -1.35, 1.35),
    sprint: value.sprint === true,
    jump: value.jump === true,
    fire: value.fire === true,
    aim: value.aim === true,
    seq: Number.isSafeInteger(value.seq) && value.seq >= 0 ? value.seq : 0,
  };
}

export function aimDirection(yaw, pitch = 0) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

function localPoint(x, z, box) {
  const c = Math.cos(box.yaw || 0), s = Math.sin(box.yaw || 0);
  const dx = x - box.x, dz = z - box.z;
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

function globalPoint(x, z, box) {
  const c = Math.cos(box.yaw || 0), s = Math.sin(box.yaw || 0);
  return { x: box.x + c * x + s * z, z: box.z - s * x + c * z };
}

function buildBox(b) {
  return { ...b, w: 5, d: b.type === 'wall' ? .35 : 5, h: 3, kind: b.type };
}

const staticGrid = new Map();
for (const box of COLLIDERS) {
  const r = hypot(box.w || 0, box.d || 0) / 2 + 1;
  for (let gx = Math.floor((box.x - r) / GRID); gx <= Math.floor((box.x + r) / GRID); gx++) {
    for (let gz = Math.floor((box.z - r) / GRID); gz <= Math.floor((box.z + r) / GRID); gz++) {
      const key = gx + ',' + gz;
      if (!staticGrid.has(key)) staticGrid.set(key, []);
      staticGrid.get(key).push(box);
    }
  }
}

function nearbyBoxes(x, z, builds, radius = 2) {
  const result = [], seen = new Set();
  for (let gx = Math.floor((x - radius) / GRID); gx <= Math.floor((x + radius) / GRID); gx++) {
    for (let gz = Math.floor((z - radius) / GRID); gz <= Math.floor((z + radius) / GRID); gz++) {
      for (const box of staticGrid.get(gx + ',' + gz) || []) {
        if (!seen.has(box)) { seen.add(box); result.push(box); }
      }
    }
  }
  for (const b of builds || []) if (b.hp > 0 && hypot(b.x - x, b.z - z) < radius + 5) result.push(buildBox(b));
  return result;
}

function insideFootprint(x, z, box, padding = 0) {
  const local = localPoint(x, z, box);
  return Math.abs(local.x) <= box.w / 2 + padding && Math.abs(local.z) <= box.d / 2 + padding;
}

function rampTop(box, x, z) {
  const local = localPoint(x, z, box);
  return box.y + clamp(.5 - local.z / 5, 0, 1) * 3;
}

export function supportHeight(x, z, upperY = Infinity, builds = []) {
  let ground = Math.max(.05, terrainHeight(x, z));
  for (const box of nearbyBoxes(x, z, builds, 1)) {
    if (!insideFootprint(x, z, box, .08)) continue;
    const top = box.kind === 'ramp' ? rampTop(box, x, z) : box.y + box.h;
    if (top <= upperY + .001 && top > ground) ground = top;
  }
  return ground;
}

function resolveHorizontal(player, x, z, builds) {
  let px = x, pz = z;
  for (let iteration = 0; iteration < 2; iteration++) {
    for (const box of nearbyBoxes(px, pz, builds, 2)) {
      const local = localPoint(px, pz, box);
      const nx = clamp(local.x, -box.w / 2, box.w / 2);
      const nz = clamp(local.z, -box.d / 2, box.d / 2);
      const dx = local.x - nx, dz = local.z - nz;
      const distance = hypot(dx, dz);
      if (distance >= PLAYER_RADIUS || player.y + PLAYER_HEIGHT <= box.y + .08) continue;
      const top = box.kind === 'ramp' ? rampTop(box, px, pz) : box.y + box.h;
      if (player.y >= top - .12) continue;
      if (top <= player.y + STEP_HEIGHT && player.vy <= .5) {
        player.y = top;
        player.grounded = true;
        player.vy = 0;
        continue;
      }
      let tx = local.x, tz = local.z;
      if (distance > .0001) {
        const push = (PLAYER_RADIUS - distance + .002) / distance;
        tx += dx * push; tz += dz * push;
      } else {
        const xPush = box.w / 2 + PLAYER_RADIUS - Math.abs(local.x);
        const zPush = box.d / 2 + PLAYER_RADIUS - Math.abs(local.z);
        if (xPush < zPush) tx = (local.x < 0 ? -1 : 1) * (box.w / 2 + PLAYER_RADIUS + .002);
        else tz = (local.z < 0 ? -1 : 1) * (box.d / 2 + PLAYER_RADIUS + .002);
      }
      const point = globalPoint(tx, tz, box);
      px = point.x; pz = point.z;
    }
  }
  return { x: px, z: pz };
}

/** Mutates only kinematic player state; the same routine runs in browser prediction. */
export function movePlayer(player, rawInput, elapsed, builds = []) {
  if (!player?.alive) return player;
  const input = normalizeInput(rawInput);
  const dt = clamp(finite(elapsed), 0, .1);
  if (dt === 0) return player;
  player.yaw = input.yaw; player.pitch = input.pitch;
  const cs = Math.cos(input.yaw), sn = Math.sin(input.yaw);
  const dx = input.moveX * cs - input.moveZ * sn;
  const dz = -input.moveX * sn - input.moveZ * cs;
  let speed = player.gliding ? 9.0 : input.aim ? 4.25 : input.sprint ? 10.1 : 6.7;
  if (player.using) speed *= .28;
  const oldX = player.x, oldZ = player.z;
  const steps = Math.max(1, Math.ceil(speed * dt / .22));
  for (let i = 0; i < steps; i++) {
    let nx = clamp(player.x + dx * speed * dt / steps, -LIMIT, LIMIT);
    let nz = clamp(player.z + dz * speed * dt / steps, -LIMIT, LIMIT);
    // Steep cliff edges cannot be climbed by walking; ramps, jumps and gliders can gain height.
    const surface = Math.max(.05, terrainHeight(nx, nz));
    if (surface > player.y + .72 && !player.gliding) {
      if (Math.max(.05, terrainHeight(nx, player.z)) <= player.y + .72) nz = player.z;
      else if (Math.max(.05, terrainHeight(player.x, nz)) <= player.y + .72) nx = player.x;
      else { nx = player.x; nz = player.z; }
    }
    const point = resolveHorizontal(player, nx, nz, builds);
    player.x = point.x; player.z = point.z;
  }
  player.vx = (player.x - oldX) / dt;
  player.vz = (player.z - oldZ) / dt;
  const previousY = player.y;
  const support = supportHeight(player.x, player.z, player.y + STEP_HEIGHT, builds);
  if (input.jump && !player._jumpHeld && player.grounded && !player.gliding) {
    player.vy = 8.7;
    player.grounded = false;
    player.using = ''; player.useRemaining = 0;
  }
  player._jumpHeld = input.jump;
  if (player.gliding) {
    player.vy = player.vy > 0 ? Math.max(-5.5, player.vy - 16 * dt) : -5.5;
    player.y += player.vy * dt;
  } else if (player.grounded && support >= player.y - .68 && support <= player.y + STEP_HEIGHT && player.vy <= 0) {
    player.y = support;
    player.vy = 0;
  } else {
    player.grounded = false;
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
  }
  if (player.y <= support && previousY >= support - STEP_HEIGHT) {
    player.y = support; player.vy = 0; player.grounded = true; player.gliding = false;
  }
  if (player.y < Math.max(.05, terrainHeight(player.x, player.z))) {
    player.y = Math.max(.05, terrainHeight(player.x, player.z));
    player.vy = 0; player.grounded = true; player.gliding = false;
  }
  // Ceiling collision prevents jumping through a roof to gain height.
  if (player.vy > 0) {
    for (const box of nearbyBoxes(player.x, player.z, builds, 1)) {
      if (box.kind === 'ramp' || !insideFootprint(player.x, player.z, box, PLAYER_RADIUS * .7)) continue;
      if (previousY + PLAYER_HEIGHT <= box.y + .1 && player.y + PLAYER_HEIGHT > box.y) {
        player.y = box.y - PLAYER_HEIGHT - .005;
        player.vy = 0;
      }
    }
  }
  return player;
}

function rayBox(origin, direction, box, limit) {
  const p = localPoint(origin.x, origin.z, box);
  const c = Math.cos(box.yaw || 0), s = Math.sin(box.yaw || 0);
  const d = { x: c * direction.x - s * direction.z, y: direction.y, z: s * direction.x + c * direction.z };
  const o = { x: p.x, y: origin.y - box.y, z: p.z };
  const mins = { x: -box.w / 2, y: 0, z: -box.d / 2 }, maxs = { x: box.w / 2, y: box.h, z: box.d / 2 };
  let near = 0, far = limit;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(d[axis]) < .000001) {
      if (o[axis] < mins[axis] || o[axis] > maxs[axis]) return null;
    } else {
      let a = (mins[axis] - o[axis]) / d[axis], b = (maxs[axis] - o[axis]) / d[axis];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (far < near) return null;
    }
  }
  if (box.kind === 'ramp') {
    // A solid triangular wedge: y <= 1.5 - .6*z in the ramp's coordinates.
    const start = o.y + .6 * o.z - 1.5;
    const slope = d.y + .6 * d.z;
    if (Math.abs(slope) < .000001) { if (start > 0) return null; }
    else {
      const t = -start / slope;
      if (slope > 0) far = Math.min(far, t);
      else near = Math.max(near, t);
      if (far < near) return null;
    }
  }
  return near >= 0 && near <= limit ? near : null;
}

/** Returns distance and collider of first cover/terrain intersection. */
export function raycastWorld(origin, direction, range, builds = []) {
  let distance = range, collider = null, ground = false;
  const candidates = new Set();
  for (let t = 0; t <= range + GRID; t += GRID * .55) {
    const x = origin.x + direction.x * Math.min(t, range), z = origin.z + direction.z * Math.min(t, range);
    const gx = Math.floor(x / GRID), gz = Math.floor(z / GRID);
    for (const box of staticGrid.get(gx + ',' + gz) || []) candidates.add(box);
  }
  for (const box of candidates) {
    const hit = rayBox(origin, direction, box, distance);
    if (hit !== null && hit < distance) { distance = hit; collider = box; }
  }
  for (const b of builds) {
    if (b.hp <= 0) continue;
    const hit = rayBox(origin, direction, buildBox(b), distance);
    if (hit !== null && hit < distance) { distance = hit; collider = b; }
  }
  // Smooth terrain intersection is refined after a coarse march.
  for (let t = .25; t <= distance; t += 1.3) {
    const x = origin.x + direction.x * t, y = origin.y + direction.y * t, z = origin.z + direction.z * t;
    if (y <= Math.max(0, terrainHeight(x, z)) + .025) {
      let lo = Math.max(0, t - 1.3), hi = t;
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) / 2;
        const mh = terrainHeight(origin.x + direction.x * mid, origin.z + direction.z * mid);
        if (origin.y + direction.y * mid <= Math.max(0, mh) + .025) hi = mid; else lo = mid;
      }
      distance = hi; collider = null; ground = true;
      break;
    }
  }
  return { distance, collider, ground, x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance };
}

function raySphere(origin, direction, x, y, z, radius, limit) {
  const ox = origin.x - x, oy = origin.y - y, oz = origin.z - z;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= limit ? t : null;
}

function occupiedByStatic(x, y, z, w, d, h, yaw) {
  const proposal = { x, y, z, w, d, h, yaw };
  // Oriented box separating-axis check in X/Z, with vertical separation first.
  for (const box of nearbyBoxes(x, z, [], hypot(w, d))) {
    if (y + h <= box.y + .08 || y >= box.y + box.h - .08) continue;
    if (boxesOverlap(proposal, box, .08)) return true;
  }
  return false;
}

function boxesOverlap(a, b, margin = 0) {
  const axes = [a.yaw || 0, (a.yaw || 0) + Math.PI / 2, b.yaw || 0, (b.yaw || 0) + Math.PI / 2];
  for (const r of axes) {
    const ax = Math.cos(r), az = -Math.sin(r);
    const distance = Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
    const ar = Math.abs(Math.cos((a.yaw || 0) - r)) * a.w / 2 + Math.abs(Math.sin((a.yaw || 0) - r)) * a.d / 2;
    const br = Math.abs(Math.cos((b.yaw || 0) - r)) * b.w / 2 + Math.abs(Math.sin((b.yaw || 0) - r)) * b.d / 2;
    if (distance >= ar + br - margin) return false;
  }
  return true;
}

export function buildPlacement(player, type = 'wall', builds = []) {
  if (!player || !['wall', 'ramp'].includes(type)) return { valid: false, reason: 'Choose a wall or ramp.' };
  const yaw = Math.round(player.yaw / (Math.PI / 2)) * (Math.PI / 2);
  const forward = aimDirection(yaw);
  const reach = type === 'wall' ? 3.2 : 3.3;
  const x = Math.round((player.x + forward.x * reach) * 2) / 2;
  const z = Math.round((player.z + forward.z * reach) * 2) / 2;
  const base = Math.max(.05, terrainHeight(x, z));
  const y = Math.max(base, Math.floor((player.y + .15) * 2) / 2);
  const result = { valid: true, reason: '', type, x, y, z, yaw, w: 5, d: type === 'wall' ? .35 : 5, h: 3, hp: type === 'wall' ? 170 : 150, maxHp: type === 'wall' ? 170 : 150 };
  if (!player.alive || player.gliding || !player.grounded) { result.valid = false; result.reason = 'Land before building.'; }
  else if (player.materials < BUILD_COST) { result.valid = false; result.reason = 'Need 10 materials.'; }
  else if (hypot(x, z) > WORLD_RADIUS + 2 || base <= .15 || y - base > 14) { result.valid = false; result.reason = 'Cannot build here.'; }
  else if (occupiedByStatic(x, y + .12, z, result.w, result.d, 2.75, yaw)) { result.valid = false; result.reason = 'Something is in the way.'; }
  else if (builds.some(b => b.hp > 0 && Math.abs(b.y - y) < 2.8 && boxesOverlap(result, buildBox(b), .13))) { result.valid = false; result.reason = 'A structure is in the way.'; }
  else {
    const samples = [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]];
    const hs = samples.map(([dx, dz]) => terrainHeight(x + dx, z + dz));
    if (Math.max(...hs) - Math.min(...hs) > 2.8 || Math.max(...hs) > y + .7) { result.valid = false; result.reason = 'The ground is too steep.'; }
  }
  return result;
}

function navCell(ix, iz) {
  const key = ix + ',' + iz;
  if (navigationCells.has(key)) return navigationCells.get(key);
  const x = ix * NAV_SPACING, z = iz * NAV_SPACING, y = terrainHeight(x, z);
  const cell = { key, ix, iz, x, z, y, open: true };
  if (Math.abs(ix) > NAV_LIMIT || Math.abs(iz) > NAV_LIMIT || y < .7) cell.open = false;
  else {
    for (const box of nearbyBoxes(x, z, [], 1)) {
      if (box.y + box.h <= y + STEP_HEIGHT || box.y >= y + PLAYER_HEIGHT) continue;
      if (insideFootprint(x, z, box, PLAYER_RADIUS + .07)) { cell.open = false; break; }
    }
  }
  navigationCells.set(key, cell);
  return cell;
}

function nearestNav(x, z) {
  const ix = Math.round(x / NAV_SPACING), iz = Math.round(z / NAV_SPACING);
  let best = null, distance = Infinity;
  for (let ring = 0; ring < 5; ring++) {
    for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
      if (ring && Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
      const cell = navCell(ix + dx, iz + dz);
      const d = hypot(cell.x - x, cell.z - z);
      if (cell.open && d < distance) { best = cell; distance = d; }
    }
    if (best) break;
  }
  return best;
}

function heapPush(heap, item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].f <= item.f) break;
    heap[i] = heap[parent]; i = parent;
  }
  heap[i] = item;
}
function heapPop(heap) {
  const first = heap[0], last = heap.pop();
  if (!heap.length) return first;
  let i = 0;
  while (true) {
    let child = i * 2 + 1;
    if (child >= heap.length) break;
    if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;
    if (heap[child].f >= last.f) break;
    heap[i] = heap[child]; i = child;
  }
  heap[i] = last;
  return first;
}

/** Small cached terrain navigation graph; only bots use paths, never client movement. */
function routeTo(x, z, goalX, goalZ) {
  const start = nearestNav(x, z), goal = nearestNav(goalX, goalZ);
  if (!start || !goal) return [];
  const open = [], costs = new Map([[start.key, 0]]), closed = new Set();
  const heuristic = cell => hypot(cell.ix - goal.ix, cell.iz - goal.iz);
  const first = { cell: start, g: 0, f: heuristic(start), parent: null };
  heapPush(open, first);
  let best = first, bestH = first.f, iterations = 0;
  while (open.length && iterations++ < 4500) {
    const current = heapPop(open), cell = current.cell;
    if (closed.has(cell.key)) continue;
    closed.add(cell.key);
    const h = heuristic(cell);
    if (h < bestH) { best = current; bestH = h; }
    if (cell.key === goal.key) { best = current; break; }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const next = navCell(cell.ix + dx, cell.iz + dz);
      if (!next.open || closed.has(next.key) || Math.abs(next.y - cell.y) > 1.7) continue;
      if (dx && dz && (!navCell(cell.ix + dx, cell.iz).open || !navCell(cell.ix, cell.iz + dz).open)) continue;
      const g = current.g + (dx && dz ? Math.SQRT2 : 1) + Math.abs(next.y - cell.y) * .12;
      if ((costs.get(next.key) ?? Infinity) <= g) continue;
      costs.set(next.key, g);
      heapPush(open, { cell: next, g, f: g + heuristic(next), parent: current });
    }
  }
  const path = [];
  for (let node = best; node && node.parent; node = node.parent) path.push({ x: node.cell.x, z: node.cell.z });
  return path.reverse();
}

function humanName(value, fallback) {
  return (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 18) : '') || fallback;
}

function safeSpawn(index) {
  const chosen = SPAWNS[index % SPAWNS.length] || { x: Math.cos(index * TAU / 10) * 65, z: Math.sin(index * TAU / 10) * 65 };
  let x = chosen.x, z = chosen.z;
  for (let i = 0; i < 35; i++) {
    if (i) { x = chosen.x + Math.cos(i * 2.399) * Math.sqrt(i) * 2; z = chosen.z + Math.sin(i * 2.399) * Math.sqrt(i) * 2; }
    const y = Math.max(.05, terrainHeight(x, z));
    if (!nearbyBoxes(x, z, [], 1).some(c => insideFootprint(x, z, c, .7) && c.y < y + 2 && c.y + c.h > y + .2)) return { x, y, z };
  }
  return { x, y: supportHeight(x, z), z };
}

function makePlayer(index, previous = null) {
  const spawn = safeSpawn(index);
  return {
    id: index, name: previous?.name || BOT_NAMES[index], bot: previous?.bot !== false,
    color: Number.isInteger(previous?.color) ? previous.color : index,
    ...spawn, yaw: Math.atan2(spawn.x, spawn.z), pitch: -.06,
    aimYaw: Math.atan2(spawn.x, spawn.z), aimPitch: -.06,
    vx: 0, vy: 0, vz: 0, hp: 100, shield: 50, alive: true,
    kills: 0, damage: 0, weapon: 0, owned: [true, false, false, false],
    ammo: [30, 0, 0, 0], reserve: [90, 0, 0, 0], rarity: [0, 0, 0, 0],
    materials: 60, medkits: 1, shieldCells: 2,
    reloading: 0, using: '', useRemaining: 0,
    grounded: true, gliding: false, shotAt: -100, hitAt: -100,
    placement: null, sprinting: false, aiming: false,
    _shotCooldown: 0, _buildCooldown: 0, _harvestCooldown: 0, _padCooldown: 0,
    _jumpHeld: false, _reloadWeapon: -1, _usingAt: 0, _damageBy: null,
    _bot: { nextThink: 0, target: null, goal: null, react: 0, side: index % 2 ? 1 : -1, stuck: 0, previousX: spawn.x, previousZ: spawn.z, jitter: index * .73, path: [], pathGoal: null, nextPath: 0 },
  };
}

const STORM_STAGES = [
  { hold: 30, shrink: 40, radius: 96, damage: 1 },
  { hold: 22, shrink: 34, radius: 64, damage: 2 },
  { hold: 18, shrink: 30, radius: 40, damage: 3.5 },
  { hold: 12, shrink: 25, radius: 22, damage: 5 },
  { hold: 8, shrink: 20, radius: 8, damage: 8 },
  { hold: 4, shrink: 16, radius: 0, damage: 16 },
];

export class Match {
  constructor({ seed = WORLD_SEED || 42, difficulty = 'regular', buildEnabled = true } = {}) {
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 42;
    this.difficulty = ['casual', 'regular', 'expert'].includes(difficulty) ? difficulty : 'regular';
    this.buildEnabled = buildEnabled !== false;
    this.random = randomGenerator(this.seed);
    this.id = this.newId();
    this.phase = 'lobby'; this.time = 0; this.dropRemaining = DROP_SECONDS;
    this.players = Array.from({ length: MAX_PLAYERS }, (_, i) => makePlayer(i));
    this.loot = []; this.builds = []; this.events = []; this.winner = null;
    this._eventId = 0; this._buildId = 0; this._lootId = 0; this._stage = 0; this._stageTime = 0;
    this.storm = { x: 0, z: 0, radius: 145, nextX: 0, nextZ: 0, nextRadius: 96, remaining: 30, phase: 'waiting', label: 'Storm forms in', damage: 1, stage: 1 };
    this.resetLoot();
  }

  newId() { return this.seed.toString(36) + '-' + Date.now().toString(36) + '-' + (++matchSerial).toString(36); }

  setHuman(slot, name, color = slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) return false;
    const p = this.players[slot];
    p.bot = false; p.name = humanName(name, 'Player ' + (slot + 1));
    p.color = Number.isInteger(color) ? clamp(color, 0, 9) : slot;
    return true;
  }

  removeHuman(slot) {
    const p = this.players[slot];
    if (!p) return false;
    p.bot = true;
    p._bot.nextThink = 0;
    return true;
  }

  start() {
    this.id = this.newId();
    this.random = randomGenerator(this.seed);
    this.players = this.players.map((p, i) => makePlayer(i, p));
    for (const p of this.players) {
      p.y += 43 + (p.id % 3) * 2;
      p.gliding = true; p.grounded = false; p.vy = -5.5;
    }
    this.phase = 'drop'; this.time = 0; this.dropRemaining = DROP_SECONDS;
    this.builds = []; this.events = []; this.winner = null;
    this._eventId = 0; this._buildId = 0; this._lootId = 0;
    this._stage = 0; this._stageTime = 0;
    this.storm = { x: 0, z: 0, radius: 145, nextX: 0, nextZ: 0, nextRadius: 96, remaining: 30, phase: 'waiting', label: 'Storm forms in', damage: 1, stage: 1 };
    this.planStorm();
    this.resetLoot();
    return this.snapshot();
  }

  resetLoot() {
    this.loot = LOOT_SPAWNS.slice(0, MAX_LOOT).map((item, i) => ({
      id: String(item.id ?? 'loot-' + i), x: item.x, y: finite(item.y, terrainHeight(item.x, item.z)) + .12, z: item.z,
      kind: ['weapon', 'ammo', 'medkit', 'shield', 'materials', 'chest'].includes(item.kind) ? item.kind : 'chest',
      weapon: Number.isInteger(item.weapon) ? clamp(item.weapon, 0, 3) : i % 4,
      rarity: Number.isInteger(item.rarity) ? clamp(item.rarity, 0, 4) : (i % 17 === 0 ? 3 : i % 5 === 0 ? 2 : 1),
      amount: item.amount || 1,
    }));
  }

  emit(type, data = {}) {
    this.events.push({ id: ++this._eventId, type, time: this.time, ...data });
    if (this.events.length > 30) this.events.splice(0, this.events.length - 30);
  }

  planStorm() {
    const target = STORM_STAGES[Math.min(this._stage, STORM_STAGES.length - 1)];
    const offset = Math.max(0, this.storm.radius - target.radius) * .45;
    const a = this.random() * TAU, r = this.random() * offset;
    this.storm.nextX = this.storm.x + Math.cos(a) * r;
    this.storm.nextZ = this.storm.z + Math.sin(a) * r;
    // Keep final fights on land, rather than ending a match in the sea.
    if (hypot(this.storm.nextX, this.storm.nextZ) > 80 || terrainHeight(this.storm.nextX, this.storm.nextZ) < 2) {
      this.storm.nextX *= .6; this.storm.nextZ *= .6;
    }
    this.storm.nextRadius = target.radius;
    this.storm.remaining = target.hold;
    this.storm.damage = target.damage;
    this.storm.stage = this._stage + 1;
    this.storm.phase = 'waiting'; this.storm.label = this._stage ? 'Next circle in' : 'Storm forms in';
    this._fromStorm = { x: this.storm.x, z: this.storm.z, radius: this.storm.radius };
    this._stageTime = 0;
  }

  stepStorm(dt) {
    if (this._stage >= STORM_STAGES.length) {
      this.storm.phase = 'final'; this.storm.remaining = 0; this.storm.damage = 24; this.storm.label = 'Final storm';
      return;
    }
    const stage = STORM_STAGES[this._stage];
    this._stageTime += dt;
    if (this._stageTime < stage.hold) {
      this.storm.remaining = stage.hold - this._stageTime;
      return;
    }
    if (this.storm.phase !== 'shrinking') {
      this.storm.phase = 'shrinking'; this.storm.label = 'Storm closing';
      this.emit('storm', { text: 'Storm closing · get inside the circle' });
    }
    const progress = clamp((this._stageTime - stage.hold) / stage.shrink, 0, 1);
    this.storm.x = this._fromStorm.x + (this.storm.nextX - this._fromStorm.x) * progress;
    this.storm.z = this._fromStorm.z + (this.storm.nextZ - this._fromStorm.z) * progress;
    this.storm.radius = this._fromStorm.radius + (stage.radius - this._fromStorm.radius) * progress;
    this.storm.remaining = Math.max(0, stage.shrink - (this._stageTime - stage.hold));
    if (progress >= 1) {
      this._stage++;
      if (this._stage < STORM_STAGES.length) this.planStorm();
    }
  }

  action(slot, action) {
    const p = this.players[slot];
    if (!p?.alive || this.phase !== 'active' || typeof action !== 'string') return false;
    if (action.startsWith('slot') && /^slot[0-3]$/.test(action)) {
      const weapon = Number(action.slice(4));
      if (!p.owned[weapon]) return false;
      p.weapon = weapon; p.reloading = 0; p.using = ''; p.useRemaining = 0;
      p._shotCooldown = Math.max(p._shotCooldown, .18);
      return true;
    }
    if (action === 'reload') {
      if (p.reloading || p.using || p.ammo[p.weapon] >= WEAPONS[p.weapon].magazine || p.reserve[p.weapon] <= 0) return false;
      p.reloading = WEAPONS[p.weapon].reload; p._reloadWeapon = p.weapon;
      return true;
    }
    if (action === 'heal' || action === 'shield') {
      if (p.using || p.reloading || p.gliding) return false;
      if (action === 'heal' && (p.medkits < 1 || p.hp >= 100)) return false;
      if (action === 'shield' && (p.shieldCells < 1 || p.shield >= 100)) return false;
      p.using = action; p.useRemaining = action === 'heal' ? 3.0 : 1.8;
      p._usingAt = this.time;
      return true;
    }
    if (action === 'interact') return this.pickup(p);
    if (action === 'wall' || action === 'ramp') return this.build(p, action);
    if (action === 'harvest') return this.harvest(p);
    return false;
  }

  pickup(p) {
    if (p.gliding) return false;
    let nearest = null, distance = 3.7;
    for (const item of this.loot) {
      const d = hypot(item.x - p.x, item.z - p.z, (item.y - p.y) * .6);
      if (d < distance && Math.abs(item.y - p.y) < 3.1) {
        // Nearby loot must also be reachable: prevent pickups through a closed wall.
        const horizontal = hypot(item.x - p.x, item.z - p.z);
        if (horizontal > .15) {
          const direction = { x: (item.x - p.x) / horizontal, y: 0, z: (item.z - p.z) / horizontal };
          const ray = raycastWorld({ x: p.x, y: p.y + .8, z: p.z }, direction, horizontal, this.builds);
          if (ray.distance < horizontal - .6) continue;
        }
        nearest = item; distance = d;
      }
    }
    if (!nearest) return false;
    const item = nearest;
    let text;
    if (item.kind === 'weapon') {
      this.giveWeapon(p, item.weapon, item.rarity);
      text = RARITIES[item.rarity].name + ' ' + WEAPONS[item.weapon].name;
    } else if (item.kind === 'ammo') {
      for (let i = 0; i < 4; i++) p.reserve[i] = Math.min(240, p.reserve[i] + (i === 2 ? 8 : i === 3 ? 12 : 45));
      text = 'Ammunition';
    } else if (item.kind === 'medkit') { p.medkits = Math.min(4, p.medkits + 1); text = 'Medkit'; }
    else if (item.kind === 'shield') { p.shieldCells = Math.min(6, p.shieldCells + 2); text = '2 shield cells'; }
    else if (item.kind === 'materials') { p.materials = Math.min(200, p.materials + 40); text = '40 materials'; }
    else {
      const weapon = item.weapon;
      const rarity = Math.max(1, item.rarity);
      this.giveWeapon(p, weapon, rarity);
      p.materials = Math.min(200, p.materials + 30);
      p.shieldCells = Math.min(6, p.shieldCells + 1);
      p.medkits = Math.min(4, p.medkits + (this.random() < .5 ? 1 : 0));
      text = 'Supply crate · ' + RARITIES[rarity].name + ' ' + WEAPONS[weapon].name;
    }
    this.loot.splice(this.loot.indexOf(item), 1);
    this.emit('loot', { player: p.id, x: item.x, y: item.y, z: item.z, text });
    return true;
  }

  giveWeapon(p, weapon, rarity) {
    weapon = clamp(Math.floor(finite(weapon)), 0, 3);
    rarity = clamp(Math.floor(finite(rarity)), 0, 4);
    const previouslyOwned = p.owned[weapon];
    p.owned[weapon] = true;
    p.rarity[weapon] = Math.max(p.rarity[weapon], rarity);
    p.reserve[weapon] = Math.min(240, p.reserve[weapon] + (weapon === 2 ? 12 : weapon === 3 ? 20 : 60));
    if (!previouslyOwned) {
      p.ammo[weapon] = WEAPONS[weapon].magazine;
      p.weapon = weapon; p.reloading = 0;
    }
  }

  build(p, type) {
    if (!this.buildEnabled || p._buildCooldown > 0 || p.using) return false;
    const placement = buildPlacement(p, type, this.builds);
    if (!placement.valid) return false;
    const shape = buildBox(placement);
    for (const other of this.players) {
      if (!other.alive || other.y > placement.y + 3 || other.y + PLAYER_HEIGHT < placement.y) continue;
      if (insideFootprint(other.x, other.z, shape, PLAYER_RADIUS)) return false;
    }
    if (this.builds.length >= MAX_BUILDS) return false;
    const { valid, reason, w, d, h, ...data } = placement;
    this.builds.push({ id: 'build-' + (++this._buildId), ...data, owner: p.id });
    p.materials -= BUILD_COST; p._buildCooldown = .5;
    this.emit('build', { player: p.id, x: placement.x, y: placement.y, z: placement.z, text: type });
    return true;
  }

  harvest(p) {
    if (p._harvestCooldown > 0 || p.gliding || p.materials >= 200) return false;
    let nearest = null, distance = 4.0;
    for (const source of [...TREES, ...ROCKS, ...PROPS]) {
      const d = hypot(source.x - p.x, source.z - p.z);
      if (d < distance) { nearest = source; distance = d; }
    }
    if (!nearest) return false;
    p.materials = Math.min(200, p.materials + 20); p._harvestCooldown = 1.05;
    this.emit('loot', { player: p.id, x: nearest.x, y: terrainHeight(nearest.x, nearest.z) + 1, z: nearest.z, text: '+20 materials', harvest: true });
    return true;
  }

  tickPlayer(p, input, dt) {
    p._shotCooldown = Math.max(0, p._shotCooldown - dt);
    p._buildCooldown = Math.max(0, p._buildCooldown - dt);
    p._harvestCooldown = Math.max(0, p._harvestCooldown - dt);
    p._padCooldown = Math.max(0, p._padCooldown - dt);
    p.aimYaw = input.aimYaw; p.aimPitch = input.aimPitch;
    p.sprinting = input.sprint && hypot(input.moveX, input.moveZ) > .1 && !input.aim;
    p.aiming = input.aim;
    if (p.using) {
      if (hypot(input.moveX, input.moveZ) > .15 || input.fire || input.jump || p.hitAt > p._usingAt) {
        p.using = ''; p.useRemaining = 0;
      } else {
        p.useRemaining -= dt;
        if (p.useRemaining <= 0) {
          if (p.using === 'heal') { p.hp = Math.min(100, p.hp + 65); p.medkits--; }
          else { p.shield = Math.min(100, p.shield + 50); p.shieldCells--; }
          this.emit('loot', { player: p.id, x: p.x, y: p.y + 1, z: p.z, text: p.using === 'heal' ? '+65 health' : '+50 shield' });
          p.using = ''; p.useRemaining = 0;
        }
      }
    }
    if (p.reloading > 0) {
      p.reloading = Math.max(0, p.reloading - dt);
      if (p.reloading === 0 && p.weapon === p._reloadWeapon) {
        const add = Math.min(WEAPONS[p.weapon].magazine - p.ammo[p.weapon], p.reserve[p.weapon]);
        p.ammo[p.weapon] += add; p.reserve[p.weapon] -= add;
      }
    }
    movePlayer(p, input, dt, this.builds);
    if (this.phase !== 'active') return;
    if (p.grounded && p._padCooldown <= 0) {
      for (const pad of PADS) {
        if (hypot(p.x - pad.x, p.z - pad.z) < 1.7 && Math.abs(p.y - finite(pad.y, terrainHeight(pad.x, pad.z))) < 1.6) {
          p.vy = 23; p.grounded = false; p.gliding = true; p._padCooldown = 4;
          this.emit('loot', { player: p.id, x: p.x, y: p.y, z: p.z, text: 'Updraft · steer your glider', launch: true });
          break;
        }
      }
    }
    if (input.fire && !p.gliding && !p.using && p.reloading <= 0 && p._shotCooldown <= 0) {
      if (p.ammo[p.weapon] > 0) this.fire(p, input);
      else this.action(p.id, 'reload');
    }
    if (hypot(p.x - this.storm.x, p.z - this.storm.z) > this.storm.radius) {
      this.hurt(p, this.storm.damage * dt, null, true);
    }
  }

  fire(p, input) {
    const weapon = WEAPONS[p.weapon];
    p.ammo[p.weapon]--;
    p._shotCooldown = 1 / weapon.rate;
    p.shotAt = this.time;
    const origin = { x: p.x, y: p.y + 1.4, z: p.z };
    let spread = input.aim ? weapon.aimedSpread : weapon.spread;
    if (!p.grounded) spread *= 1.7;
    if (p.bot) spread += this.difficulty === 'casual' ? .036 : this.difficulty === 'expert' ? .012 : .025;
    const hits = new Map();
    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      const yaw = finite(input.aimYaw, p.yaw) + (this.random() - .5) * spread * 2;
      const pitch = finite(input.aimPitch, p.pitch) + (this.random() - .5) * spread * 2;
      const direction = aimDirection(yaw, pitch);
      const ray = raycastWorld(origin, direction, weapon.range, this.builds);
      let target = null, headshot = false, distance = ray.distance;
      for (const other of this.players) {
        if (other.id === p.id || !other.alive) continue;
        const head = raySphere(origin, direction, other.x, other.y + 1.52, other.z, .31, distance);
        const chest = raySphere(origin, direction, other.x, other.y + 1.03, other.z, .51, distance);
        const legs = raySphere(origin, direction, other.x, other.y + .45, other.z, .43, distance);
        const candidates = [head, chest, legs].filter(x => x !== null);
        if (candidates.length) {
          const hit = Math.min(...candidates);
          if (hit < distance) { target = other; distance = hit; headshot = head !== null && head <= hit + .001; }
        }
      }
      if (target) {
        const falloff = p.weapon === 2 ? clamp(1 - distance / 48, .35, 1) : p.weapon === 1 ? clamp(1 - Math.max(0, distance - 16) / 70, .45, 1) : 1;
        const amount = weapon.damage * RARITIES[p.rarity[p.weapon]].multiplier * (headshot ? 1.55 : 1) * falloff;
        const entry = hits.get(target.id) || { amount: 0, headshot: false };
        entry.amount += amount; entry.headshot ||= headshot;
        hits.set(target.id, entry);
      } else if (ray.collider?.owner !== undefined) {
        const build = this.builds.find(b => b.id === ray.collider.id);
        if (build) build.hp -= weapon.damage * RARITIES[p.rarity[p.weapon]].multiplier;
      }
      if (pellet === 0 || (weapon.pellets > 1 && pellet === 4)) {
        this.emit('shot', { player: p.id, weapon: p.weapon, x: origin.x, y: origin.y, z: origin.z,
          toX: origin.x + direction.x * distance, toY: origin.y + direction.y * distance, toZ: origin.z + direction.z * distance,
          target: target?.id ?? null });
      }
    }
    for (const [id, hit] of hits) {
      const target = this.players[id];
      if (!target.alive) continue;
      const damage = Math.min(target.hp + target.shield, hit.amount);
      this.hurt(target, hit.amount, p.id);
      p.damage += damage;
      this.emit('hit', { player: p.id, target: id, amount: Math.round(damage), headshot: hit.headshot, x: target.x, y: target.y + 1.7, z: target.z });
    }
    this.builds = this.builds.filter(b => b.hp > 0);
  }

  hurt(p, amount, attacker = null, bypassShield = false) {
    if (!p.alive || amount <= 0 || !Number.isFinite(amount)) return;
    let healthDamage = amount;
    if (!bypassShield) {
      const absorbed = Math.min(p.shield, amount);
      p.shield -= absorbed; healthDamage -= absorbed;
    }
    p.hp = Math.max(0, p.hp - healthDamage);
    p.hitAt = this.time;
    p.using = ''; p.useRemaining = 0;
    if (attacker !== null) {
      p._damageBy = attacker;
      if (p.bot) { p._bot.target = attacker; p._bot.nextThink = Math.min(p._bot.nextThink, this.time + .12); }
    }
    if (p.hp <= 0) this.eliminate(p, attacker, bypassShield ? 'storm' : 'weapon');
  }

  eliminate(p, attacker = null, reason = 'weapon') {
    if (!p.alive) return;
    const alive = this.players.filter(q => q.alive).length;
    p.alive = false; p.hp = 0; p.vx = 0; p.vz = 0; p.vy = 0; p.gliding = false;
    p.placement = alive; p.reloading = 0; p.using = ''; p.useRemaining = 0;
    if (attacker !== null && attacker !== p.id && this.players[attacker]) this.players[attacker].kills++;
    const killer = attacker !== null ? this.players[attacker] : null;
    this.emit('elimination', { player: attacker, target: p.id, x: p.x, y: p.y, z: p.z,
      text: killer ? killer.name + ' eliminated ' + p.name : p.name + ' was caught in the storm', reason });
    this.addLoot({ kind: 'weapon', weapon: p.weapon, rarity: p.rarity[p.weapon], x: p.x + .7, y: p.y + .12, z: p.z });
    this.addLoot({ kind: 'ammo', weapon: 0, rarity: 0, x: p.x - .7, y: p.y + .12, z: p.z });
    if (p.shieldCells) this.addLoot({ kind: 'shield', weapon: 0, rarity: 1, x: p.x, y: p.y + .12, z: p.z + .8 });
    if (p.materials) this.addLoot({ kind: 'materials', weapon: 0, rarity: 0, x: p.x, y: p.y + .12, z: p.z - .8 });
  }

  addLoot(item) {
    if (this.loot.length >= MAX_LOOT) this.loot.shift();
    this.loot.push({ id: 'drop-' + (++this._lootId), amount: 1, ...item });
  }

  clearSight(a, b) {
    const origin = { x: a.x, y: a.y + 1.4, z: a.z };
    const dx = b.x - a.x, dy = b.y + 1.02 - origin.y, dz = b.z - a.z;
    const d = hypot(dx, dy, dz);
    if (d < .1) return true;
    return raycastWorld(origin, { x: dx / d, y: dy / d, z: dz / d }, d, this.builds).distance > d - .6;
  }

  botInput(p, dt) {
    const brain = p._bot;
    if (this.phase === 'drop') {
      const spawn = safeSpawn(p.id);
      const dx = spawn.x - p.x, dz = spawn.z - p.z;
      const yaw = hypot(dx, dz) > 2 ? Math.atan2(-dx, -dz) : p.yaw;
      return normalizeInput({ yaw, pitch: -.08, moveZ: hypot(dx, dz) > 2 ? .4 : 0 });
    }
    if (p.using) return normalizeInput({ yaw: p.yaw, pitch: p.pitch });
    if (this.time >= brain.nextThink) {
      brain.nextThink = this.time + .25 + this.random() * .2;
      let best = null, distance = this.difficulty === 'expert' ? 78 : this.difficulty === 'casual' ? 49 : 64;
      for (const other of this.players) {
        if (!other.alive || other.id === p.id) continue;
        const d = hypot(other.x - p.x, other.z - p.z);
        if (d < distance && this.clearSight(p, other)) { best = other; distance = d; }
      }
      if (best && best.id !== brain.target) brain.react = this.time + (this.difficulty === 'casual' ? 1.05 : this.difficulty === 'expert' ? .28 : .62) + this.random() * .35;
      brain.target = best?.id ?? null;
      const moved = hypot(p.x - brain.previousX, p.z - brain.previousZ);
      brain.stuck = moved < .35 ? brain.stuck + 1 : 0;
      brain.previousX = p.x; brain.previousZ = p.z;
      if (brain.stuck > 2) brain.side *= -1;
      if (!best) {
        let loot = null, distance = 23;
        for (const item of this.loot) {
          if (item.y - terrainHeight(item.x, item.z) > 2.5) continue;
          const d = hypot(item.x - p.x, item.z - p.z);
          if (d < distance && hypot(item.x - this.storm.x, item.z - this.storm.z) < this.storm.radius - 7) { loot = item; distance = d; }
        }
        if (loot) brain.goal = { x: loot.x, z: loot.z };
        else if (!brain.goal || hypot(p.x - brain.goal.x, p.z - brain.goal.z) < 6 || this.random() < .09) {
          const a = this.random() * TAU;
          const r = Math.min(67, this.storm.radius * .72) * Math.sqrt(this.random());
          brain.goal = { x: this.storm.x + Math.cos(a) * r, z: this.storm.z + Math.sin(a) * r };
        }
      }
      if (p.hp < 65 && p.medkits > 0 && (!best || distance > 35) && this.time - p.hitAt > 3.5) this.action(p.id, 'heal');
      else if (p.shield < 55 && p.shieldCells > 0 && (!best || distance > 30) && this.time - p.hitAt > 2.5) this.action(p.id, 'shield');
      this.pickup(p);
      if (p.ammo[p.weapon] === 0 || (!best && p.ammo[p.weapon] < WEAPONS[p.weapon].magazine * .45)) this.action(p.id, 'reload');
      if (best && this.buildEnabled && this.time - p.hitAt < 1 && p._buildCooldown <= 0 && p.materials >= 10 && this.random() < .1) {
        this.build(p, 'wall'); p._buildCooldown = 6;
      }
    }
    if (p.using) return normalizeInput({ yaw: p.yaw, pitch: p.pitch });
    const target = brain.target !== null ? this.players[brain.target] : null;
    const validTarget = target?.alive;
    const edge = hypot(p.x - this.storm.x, p.z - this.storm.z);
    const unsafe = edge > this.storm.radius - 9 || (this.storm.phase === 'shrinking' && hypot(p.x - this.storm.nextX, p.z - this.storm.nextZ) > this.storm.nextRadius + 6);
    let goal = unsafe ? { x: this.storm.nextX, z: this.storm.nextZ } : brain.goal || { x: 0, z: 0 };
    let yaw = p.yaw, pitch = -.05, fire = false, aim = false, sprint = false;
    let worldX = 0, worldZ = 0;
    if (validTarget && !unsafe) {
      const dx = target.x - p.x, dz = target.z - p.z, distance = hypot(dx, dz);
      let desiredWeapon = p.weapon;
      if (distance < 13 && p.owned[2] && p.ammo[2] > 0) desiredWeapon = 2;
      else if (distance < 24 && p.owned[1] && p.ammo[1] > 0) desiredWeapon = 1;
      else if (distance > 42 && p.owned[3] && p.ammo[3] > 0) desiredWeapon = 3;
      else if (p.ammo[0] > 0) desiredWeapon = 0;
      if (desiredWeapon !== p.weapon) this.action(p.id, 'slot' + desiredWeapon);
      const aimYaw = Math.atan2(-dx, -dz);
      const jitterScale = this.difficulty === 'casual' ? .065 : this.difficulty === 'expert' ? .015 : .035;
      const jitter = Math.sin(this.time * 2.1 + brain.jitter) * jitterScale;
      yaw = p.yaw + clamp(angle(aimYaw - p.yaw), -dt * 5, dt * 5) + jitter * dt;
      pitch = Math.atan2(target.y + 1.0 - (p.y + 1.4), distance) + Math.sin(this.time * 2.7 + p.id) * jitterScale * .5;
      const ideal = p.weapon === 2 ? 9 : p.weapon === 1 ? 17 : p.weapon === 3 ? 49 : 27;
      const approach = distance > ideal + 5 ? .8 : distance < ideal - 6 ? -.5 : 0;
      const strafe = Math.sin(this.time * .8 + p.id) * .6;
      worldX = dx / Math.max(1, distance) * approach + dz / Math.max(1, distance) * strafe;
      worldZ = dz / Math.max(1, distance) * approach - dx / Math.max(1, distance) * strafe;
      fire = this.time > brain.react && Math.abs(angle(aimYaw - yaw)) < .1 && distance < WEAPONS[p.weapon].range * .85 && this.clearSight(p, target);
      // Short bursts give players a readable opportunity to move and return fire.
      const cycle = (this.time + p.id * .31) % (this.difficulty === 'expert' ? 1.7 : 2.4);
      fire &&= cycle < (this.difficulty === 'casual' ? .75 : this.difficulty === 'expert' ? 1.3 : 1.25);
      aim = distance > 20;
      goal = { x: p.x + worldX * 10, z: p.z + worldZ * 10 };
    } else {
      const goalDistance = hypot(goal.x - p.x, goal.z - p.z);
      if (this.time >= brain.nextPath && (goalDistance > 5 || brain.stuck > 2)) {
        if (!brain.path.length || !brain.pathGoal || hypot(goal.x - brain.pathGoal.x, goal.z - brain.pathGoal.z) > 5 || brain.stuck > 3) {
          brain.path = routeTo(p.x, p.z, goal.x, goal.z);
          brain.pathGoal = { ...goal };
        }
        brain.nextPath = this.time + 1.2 + this.random() * .4;
      }
      while (brain.path.length && hypot(p.x - brain.path[0].x, p.z - brain.path[0].z) < 1.35) brain.path.shift();
      const waypoint = brain.path.length && goalDistance > 3 ? brain.path[0] : goal;
      const dx = waypoint.x - p.x, dz = waypoint.z - p.z, distance = hypot(dx, dz);
      if (distance > .3) { worldX = dx / distance; worldZ = dz / distance; }
      const desired = Math.atan2(-worldX, -worldZ);
      yaw = p.yaw + clamp(angle(desired - p.yaw), -dt * 5, dt * 5);
      sprint = unsafe || goalDistance > 18;
    }
    // Local feelers steer around walls/trees. Never use hidden positions to shoot.
    const magnitude = hypot(worldX, worldZ);
    if (magnitude > .05) {
      const heading = Math.atan2(worldX, worldZ);
      let best = { score: -Infinity, x: worldX, z: worldZ };
      for (const offset of [0, brain.side * .65, -brain.side * .65, brain.side * 1.25, -brain.side * 1.25, Math.PI * brain.side / 2]) {
        const tx = Math.sin(heading + offset), tz = Math.cos(heading + offset);
        const origin = { x: p.x, y: p.y + .9, z: p.z };
        const ray = raycastWorld(origin, { x: tx, y: 0, z: tz }, 3.2, this.builds);
        const floor = terrainHeight(p.x + tx * 2.6, p.z + tz * 2.6);
        const terrainPenalty = floor > p.y + 1.3 || floor < p.y - 4 ? 8 : 0;
        const score = ray.distance * 1.8 - Math.abs(offset) * .6 - terrainPenalty;
        if (score > best.score) best = { score, x: tx * magnitude, z: tz * magnitude };
        if (offset === 0 && ray.distance > 3 && !terrainPenalty) break;
      }
      worldX = best.x; worldZ = best.z;
    }
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    return normalizeInput({ moveX: worldX * cs - worldZ * sn, moveZ: -worldX * sn - worldZ * cs, yaw, pitch, sprint, aim, fire,
      jump: brain.stuck > 3 && (Math.floor(this.time * 2) + p.id) % 3 === 0 });
  }

  step(elapsed, inputs = new Map()) {
    if (this.phase !== 'drop' && this.phase !== 'active') return;
    const dt = clamp(finite(elapsed), 0, .1);
    if (!dt) return;
    this.time += dt;
    if (this.phase === 'drop') {
      this.dropRemaining = Math.max(0, DROP_SECONDS - this.time);
      if (!this.dropRemaining) {
        this.phase = 'active';
        this.emit('storm', { text: 'You are live. Loot up. Last player standing wins.' });
      }
    }
    if (this.phase === 'active') this.stepStorm(dt);
    for (const p of this.players) {
      if (!p.alive) continue;
      const supplied = inputs instanceof Map ? inputs.get(p.id) : inputs[p.id];
      const input = p.bot ? this.botInput(p, dt) : normalizeInput(supplied ?? { yaw: p.yaw, pitch: p.pitch });
      this.tickPlayer(p, input, dt);
    }
    if (this.phase === 'active') {
      const alive = this.players.filter(p => p.alive);
      if (alive.length <= 1) {
        this.phase = 'finished';
        this.winner = alive[0]?.id ?? null;
        if (alive[0]) alive[0].placement = 1;
        this.emit('win', { player: this.winner, text: alive[0] ? alive[0].name + ' wins Skybreak' : 'The storm takes everyone' });
      }
    }
  }

  snapshot() {
    return {
      id: this.id, seed: this.seed, difficulty: this.difficulty, buildEnabled: this.buildEnabled,
      phase: this.phase, time: round3(this.time), dropRemaining: round3(this.dropRemaining),
      players: this.players.map(p => {
        const { _bot, _shotCooldown, _buildCooldown, _harvestCooldown, _padCooldown, _jumpHeld, _reloadWeapon, _usingAt, _damageBy, ...publicPlayer } = p;
        return { ...packetNumbers(publicPlayer), owned: [...p.owned], ammo: [...p.ammo], reserve: [...p.reserve], rarity: [...p.rarity] };
      }),
      loot: this.loot.map(packetNumbers), builds: this.builds.map(packetNumbers),
      storm: packetNumbers(this.storm), winner: this.winner, events: this.events.map(packetNumbers),
    };
  }
}
