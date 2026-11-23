import { getSolidWalls } from './building-geometry.mjs';
import { OBSERVE_HALF_ANGLE, visionRange } from './squad-roles.mjs';
import { flashIntensity } from './flash-status.mjs';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Living, seeing eyes only. A casualty or blinded soldier cannot scout. */
export function sightObservers(state) {
  return (state.squad || []).filter(actor => actor.alive !== false && !actor.downed && flashIntensity(actor, state.time) < .8 && Number.isFinite(actor.x) && Number.isFinite(actor.y));
}

/** First intersection of a unit direction with a solid rectangle, without allocations. */
export function rayWallDistance(x, y, dx, dy, wall, limit = Infinity) {
  const right = wall.x + (wall.w ?? wall.width), bottom = wall.y + (wall.h ?? wall.height);
  let near = 0, far = limit;
  if (Math.abs(dx) < 1e-10) {
    if (x < wall.x || x > right) return limit;
  } else {
    let a = (wall.x - x) / dx, b = (right - x) / dx;
    if (a > b) { const swap = a; a = b; b = swap; }
    near = Math.max(near, a); far = Math.min(far, b);
    if (near > far) return limit;
  }
  if (Math.abs(dy) < 1e-10) {
    if (y < wall.y || y > bottom) return limit;
  } else {
    let a = (wall.y - y) / dy, b = (bottom - y) / dy;
    if (a > b) { const swap = a; a = b; b = swap; }
    near = Math.max(near, a); far = Math.min(far, b);
    if (near > far) return limit;
  }
  return far >= 0 ? Math.min(limit, Math.max(0, near)) : limit;
}

// Match combat's three smoke samples: the terrain overlay is advisory, whereas
// this exact point test also guards stale network visibility and muzzle flashes.
function smokeBlocks(state, observer, point, length) {
  const steps = Math.ceil(length / 40);
  for (const smoke of state.smokes || []) {
    if (smoke.ttl < 1 || !(smoke.radius > 0)) continue;
    let inside = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const x = observer.x + (point.x - observer.x) * t - smoke.x;
      const y = observer.y + (point.y - observer.y) * t - smoke.y;
      if (x * x + y * y < smoke.radius * smoke.radius && ++inside > 2) return true;
    }
  }
  return false;
}

export function squadCanSeePoint(state, point, { ignoreRange = false } = {}) {
  if (!state?.world || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
  const walls = getSolidWalls(state.world);
  for (const observer of sightObservers(state)) {
    const dx = point.x - observer.x, dy = point.y - observer.y, length = Math.hypot(dx, dy);
    const dazzle = flashIntensity(observer, state.time);
    // A stale authoritative contact or a distant report cannot bypass the
    // current listener's impairment. Unaffected squad eyes still share sight.
    if ((!ignoreRange || dazzle > 0) && length > visionRange(observer, state.missionIndex, point) * (1 - dazzle * .8)) continue;
    if (length < .001) return true;
    let blocked = false;
    for (const wall of walls) {
      if (rayWallDistance(observer.x, observer.y, dx / length, dy / length, wall, length + .001) <= length) { blocked = true; break; }
    }
    if (!blocked && !smokeBlocks(state, observer, point, length)) return true;
  }
  return false;
}

/** Authority can hide a contact; it never bypasses a wall or fresh smoke here. */
export function enemyInSharedSight(state, actor) {
  return actor.visible !== false && squadCanSeePoint(state, actor, { ignoreRange: actor.visible === true });
}

function smokeRayLimit(observer, dx, dy, smoke, limit) {
  if (smoke.ttl < 1 || !(smoke.radius > 0)) return limit;
  const x = observer.x - smoke.x, y = observer.y - smoke.y;
  const projection = x * dx + y * dy;
  const disc = projection * projection - (x * x + y * y - smoke.radius * smoke.radius);
  if (disc <= 0) return limit;
  const root = Math.sqrt(disc), entry = Math.max(0, -projection - root), exit = Math.min(limit, -projection + root);
  // Do not punch a clear cone through a thick smoke cloud. A short visible rim
  // reads as smoke rather than a hard wall; actual contacts use smokeBlocks.
  return exit - entry > 70 ? Math.min(limit, entry + 32) : limit;
}

/** Corner rays preserve doorways and hard occlusion; a small regular fan rounds range limits. */
export function sightPolygon(state, observer) {
  const dazzle = flashIntensity(observer, state.time), recovery = 1 - dazzle * .8;
  if (dazzle >= .8) return { observerId: observer.id, origin: { x: observer.x, y: observer.y }, points: [] };
  const world = state.world, maxRange = visionRange(observer, state.missionIndex) * recovery;
  const walls = getSolidWalls(world).filter(wall => {
    const x = clamp(observer.x, wall.x, wall.x + (wall.w ?? wall.width));
    const y = clamp(observer.y, wall.y, wall.y + (wall.h ?? wall.height));
    return (x - observer.x) ** 2 + (y - observer.y) ** 2 <= maxRange * maxRange;
  });
  const angles = new Set();
  const addAngle = angle => angles.add(Math.round((((angle % TAU) + TAU) % TAU) * 1e6) / 1e6);
  const corners = new Map();
  const corner = (x, y) => corners.set(`${x}:${y}`, { x, y });
  for (let i = 0; i < 72; i++) addAngle(i * TAU / 72);
  for (const wall of walls) {
    const right = wall.x + (wall.w ?? wall.width), bottom = wall.y + (wall.h ?? wall.height);
    corner(wall.x, wall.y); corner(right, wall.y); corner(right, bottom); corner(wall.x, bottom);
  }
  // Hidden corners cannot change a visibility silhouette. Reject them once,
  // rather than casting three nearly identical rays into every distant room.
  // Shared masonry endpoints are also deduplicated before this bounded pass.
  for (const point of corners.values()) {
    const dx = point.x - observer.x, dy = point.y - observer.y, distance = Math.hypot(dx, dy);
    if (distance < .001 || distance > visionRange(observer, state.missionIndex, point) * recovery + .01) continue;
    let blocked = false;
    for (const wall of walls) {
      if (rayWallDistance(observer.x, observer.y, dx / distance, dy / distance, wall, distance) < distance - .01) { blocked = true; break; }
    }
    if (blocked) continue;
    const angle = Math.atan2(dy, dx);
    addAngle(angle - .00012); addAngle(angle); addAngle(angle + .00012);
  }
  if (observer.role === 'grenadier' && observer.observing) {
    for (const side of [-1, 1]) {
      const angle = (observer.angle || 0) + side * OBSERVE_HALF_ANGLE;
      addAngle(angle - .00012); addAngle(angle); addAngle(angle + .00012);
    }
  }
  const smokes = (state.smokes || []).filter(smoke => smoke.ttl >= 1 && smoke.radius > 0);
  const points = [];
  for (const angle of [...angles].sort((a, b) => a - b)) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let length = visionRange(observer, state.missionIndex, { x: observer.x + dx * maxRange, y: observer.y + dy * maxRange }) * recovery;
    // Keep the mask inside the district; overscan remains an unobtrusive border.
    if (dx > .000001) length = Math.min(length, (world.width - observer.x) / dx);
    else if (dx < -.000001) length = Math.min(length, -observer.x / dx);
    if (dy > .000001) length = Math.min(length, (world.height - observer.y) / dy);
    else if (dy < -.000001) length = Math.min(length, -observer.y / dy);
    for (const wall of walls) length = rayWallDistance(observer.x, observer.y, dx, dy, wall, length);
    for (const smoke of smokes) length = smokeRayLimit(observer, dx, dy, smoke, length);
    points.push({ x: observer.x + dx * Math.max(0, length), y: observer.y + dy * Math.max(0, length) });
  }
  return { observerId: observer.id, origin: { x: observer.x, y: observer.y }, points };
}

function canvasFactory(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
  }
  return null;
}

function drawPolygons(ctx, polygons, scaleX, scaleY) {
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.fillStyle = '#fff';
  for (const polygon of polygons) {
    if (!polygon.points.length) continue;
    ctx.beginPath(); ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
    for (let i = 1; i < polygon.points.length; i++) ctx.lineTo(polygon.points[i].x, polygon.points[i].y);
    ctx.closePath(); ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Three small surfaces, eight updates/second, one cropped composite per frame.
 * Ground always remains readable. This layer never controls hostile visibility.
 */
export class SharedSightLayer {
  constructor({ createCanvas = canvasFactory, interval = .125, maxSize = 640 } = {}) {
    this.createCanvas = createCanvas; this.interval = interval; this.maxSize = maxSize;
    this.polygons = []; this.lastUpdate = -Infinity; this.revision = 0; this.resetCount = 0;
    this.current = null; this.remembered = null; this.overlay = null;
  }

  update(state, now = state.time || 0) {
    const world = state.world;
    const geometryRevision = Number.isSafeInteger(world.geometryRevision) ? world.geometryRevision : 0;
    const geometryChanged = this.geometryRevision !== geometryRevision;
    const key = `${state.seed ?? 'unseeded'}:${state.missionIndex}:${world.width}:${world.height}:${world.layoutVersion ?? ''}:${world.layoutSeed ?? ''}`;
    const changed = this.sceneKey !== key || now < this.lastUpdate || (!Number.isFinite(state.seed) && this.world !== world);
    if (changed) {
      this.sceneKey = key; this.lastUpdate = -Infinity; this.resetCount++;
      const scale = Math.min(.25, this.maxSize / Math.max(world.width, world.height));
      this.width = Math.max(1, Math.ceil(world.width * scale)); this.height = Math.max(1, Math.ceil(world.height * scale));
      this.scaleX = this.width / world.width; this.scaleY = this.height / world.height;
      if (!this.current || this.current.width !== this.width || this.current.height !== this.height) {
        this.current = this.createCanvas(this.width, this.height);
        this.remembered = this.createCanvas(this.width, this.height);
        this.overlay = this.createCanvas(this.width, this.height);
      }
      this.remembered?.getContext('2d').clearRect(0, 0, this.width, this.height);
    }
    this.world = world;
    this.geometryRevision = geometryRevision;
    if (!geometryChanged && now - this.lastUpdate < this.interval - 1e-8) return false;
    this.lastUpdate = now; this.revision++;
    this.polygons = sightObservers(state).map(observer => sightPolygon(state, observer));
    if (!this.current || !this.remembered || !this.overlay) return true;
    const current = this.current.getContext('2d'), memory = this.remembered.getContext('2d'), overlay = this.overlay.getContext('2d');
    current.clearRect(0, 0, this.width, this.height);
    drawPolygons(current, this.polygons, this.scaleX, this.scaleY);
    // Mask pixels accumulate explored terrain only, never units or contacts.
    memory.drawImage(this.current, 0, 0);
    overlay.clearRect(0, 0, this.width, this.height);
    overlay.globalCompositeOperation = 'source-over';
    overlay.fillStyle = 'rgba(77,91,83,.105)'; overlay.fillRect(0, 0, this.width, this.height);
    overlay.globalCompositeOperation = 'destination-out'; overlay.drawImage(this.remembered, 0, 0);
    overlay.globalCompositeOperation = 'source-over';
    overlay.fillStyle = 'rgba(41,55,49,.085)'; overlay.fillRect(0, 0, this.width, this.height);
    overlay.globalCompositeOperation = 'destination-out'; overlay.drawImage(this.current, 0, 0);
    overlay.globalCompositeOperation = 'source-over';
    return true;
  }

  draw(ctx, bounds, { night = false, map = false } = {}) {
    if (!this.overlay || bounds.right <= bounds.left || bounds.bottom <= bounds.top) return;
    const w = bounds.right - bounds.left, h = bounds.bottom - bounds.top;
    ctx.save(); ctx.globalAlpha = night ? .6 : map ? .8 : 1;
    // Bilinear upsampling of the quarter-resolution mask gives a quiet, soft
    // sight edge without a full-resolution blur or per-frame ray tracing.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.overlay, bounds.left * this.scaleX, bounds.top * this.scaleY, w * this.scaleX, h * this.scaleY, bounds.left, bounds.top, w, h);
    ctx.restore();
  }
}
