// Facade reflections supplement the shared outdoor resonance. This small
// image-source approximation runs for a shot, never for a render frame.
import { buildingAt, getSolidWalls } from './building-geometry.mjs';
import { SOUND_SPEED_MPS, WORLD_UNITS_PER_METRE } from './acoustics.mjs';

const MAX_DIRECT = 960, MAX_FACE_DISTANCE = 280, MAX_PATH = 1360;
const MAX_CANDIDATES = 12, MAX_EARLY_TAPS = 2, EDGE = 2, EPSILON = .05;
const FAR_FACE_DISTANCE = 760, FAR_PATH = 2360, MIN_FAR_FACE = 120;
const MAX_FAR_CANDIDATES = 8, LATE_SEPARATION = .065;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const validWall = wall => finitePoint(wall) && Number.isFinite(wall.w) && Number.isFinite(wall.h) && wall.w > 0 && wall.h > 0;

function intersects(from, to, wall) {
  if (Math.max(from.x, to.x) < wall.x || Math.min(from.x, to.x) > wall.x + wall.w ||
      Math.max(from.y, to.y) < wall.y || Math.min(from.y, to.y) > wall.y + wall.h) return false;
  const dx = to.x - from.x, dy = to.y - from.y;
  let low = 0, high = 1;
  for (const [p, q] of [[-dx, from.x - wall.x], [dx, wall.x + wall.w - from.x],
    [-dy, from.y - wall.y], [dy, wall.y + wall.h - from.y]]) {
    if (Math.abs(p) < 1e-8) { if (q < 0) return false; }
    else {
      const time = q / p;
      if (p < 0) low = Math.max(low, time); else high = Math.min(high, time);
      if (low > high) return false;
    }
  }
  return true;
}

function faceFor(wall) {
  if (wall.kind !== 'perimeter') return null;
  if (wall.side === 'west') return { vertical: true, normal: -1, plane: wall.x, from: wall.y, to: wall.y + wall.h };
  if (wall.side === 'east') return { vertical: true, normal: 1, plane: wall.x + wall.w, from: wall.y, to: wall.y + wall.h };
  if (wall.side === 'north') return { vertical: false, normal: -1, plane: wall.y, from: wall.x, to: wall.x + wall.w };
  if (wall.side === 'south') return { vertical: false, normal: 1, plane: wall.y + wall.h, from: wall.x, to: wall.x + wall.w };
  return null;
}

/** Returns at most three { kind, delay, gain, pan, lowpass, x, y, wallId } taps:
 * up to two early reflections and one quieter late echo from a larger facade.
 * Delay is EXTRA travel time after the already-delayed direct report. Gain is
 * a multiplier of that report's spatial level; these quiet, darkened taps must
 * remain lower priority than direct shots. Indoors and obstructed hearing use
 * the existing room/indirect mixer instead. No random echoes or stored state.
 */
export function streetReflectionPlan(world, source, listener) {
  if (!world || !finitePoint(source) || !finitePoint(listener)) return [];
  if (Array.isArray(world.buildings) && (buildingAt(world, source) || buildingAt(world, listener))) return [];
  const direct = Math.hypot(listener.x - source.x, listener.y - source.y);
  if (direct > MAX_DIRECT) return [];
  const walls = getSolidWalls(world).filter(validWall);
  if (!walls.length || walls.some(wall => intersects(source, listener, wall))) return [];

  const candidates = [], distant = [];
  for (const wall of walls) {
    const face = faceFor(wall);
    // Tiny surviving corner/jamb fragments do not become full facade echoes.
    if (!face || face.to - face.from < 32) continue;
    const sourceNormal = face.vertical ? source.x : source.y;
    const listenerNormal = face.vertical ? listener.x : listener.y;
    const sourceDistance = (sourceNormal - face.plane) * face.normal;
    const listenerDistance = (listenerNormal - face.plane) * face.normal;
    if (sourceDistance < 1 || listenerDistance < 1 || sourceDistance > FAR_FACE_DISTANCE || listenerDistance > FAR_FACE_DISTANCE) continue;
    const sourceAcross = face.vertical ? source.y : source.x;
    const listenerAcross = face.vertical ? listener.y : listener.x;
    // Intersect the ray from the mirrored source to the listener with this
    // actual wall fragment. A door or breach has no fragment at the hit point.
    const across = sourceAcross + (listenerAcross - sourceAcross) * sourceDistance / (sourceDistance + listenerDistance);
    if (across < face.from + EDGE || across > face.to - EDGE) continue;
    const path = Math.hypot(sourceDistance + listenerDistance, listenerAcross - sourceAcross);
    const extra = path - direct, delay = extra / (WORLD_UNITS_PER_METRE * SOUND_SPEED_MPS);
    const incidence = (sourceDistance + listenerDistance) / path;
    const early = sourceDistance <= MAX_FACE_DISTANCE && listenerDistance <= MAX_FACE_DISTANCE && path <= MAX_PATH && delay >= .008 && delay <= .18;
    const late = delay > .18 && delay <= .55 && path <= FAR_PATH && face.to - face.from >= MIN_FAR_FACE && incidence >= .55;
    if (!early && !late) continue;
    const x = face.vertical ? face.plane : across, y = face.vertical ? across : face.plane;
    // Stop just outside the reflecting surface, so it does not occlude its
    // own endpoint. Every other remaining solid must clear both travel legs.
    const point = { x: x + (face.vertical ? face.normal * EPSILON : 0), y: y + (face.vertical ? 0 : face.normal * EPSILON) };
    const size = clamp((face.to - face.from) / 100, .32, 1);
    const farSize = clamp((face.to - face.from) / 200, .6, 1);
    (early ? candidates : distant).push({ kind: early ? 'early' : 'late', face, point, wallId: wall.id ?? null, x, y, path, delay,
      gain: early ? clamp(.32 * (direct + 160) / (path + 160) * (.5 + incidence * .5) * size, .025, .22)
        : clamp(.24 * (direct + 240) / (path + 240) * (.45 + incidence * .55) * farSize, .012, .095),
      pan: clamp((x - listener.x) / 390, -.8, .8),
      lowpass: early ? clamp(6500 - extra * 8 - (1 - incidence) * 1300, 2400, 6200)
        : clamp(3400 - extra * .9 - (1 - incidence) * 650, 1400, 2800) });
  }
  const order = (a, b) => a.path - b.path || b.gain - a.gain || a.x - b.x || a.y - b.y;
  candidates.sort(order); distant.sort(order);
  const taps = [], chosenFaces = new Set();
  const append = candidate => {
    const key = `${candidate.face.vertical}:${candidate.face.normal}:${candidate.face.plane}`;
    if (chosenFaces.has(key) || walls.some(wall => intersects(source, candidate.point, wall) || intersects(candidate.point, listener, wall))) return false;
    if (taps.some(tap => Math.abs(tap.delay - candidate.delay) < .004 && Math.hypot(tap.x - candidate.x, tap.y - candidate.y) < 28)) return false;
    const { kind, delay, gain, pan, lowpass, x, y, wallId } = candidate;
    taps.push({ kind, delay, gain, pan, lowpass, x, y, wallId }); chosenFaces.add(key);
    return true;
  };
  for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
    append(candidate);
    if (taps.length === MAX_EARLY_TAPS) break;
  }
  // Only an unobstructed longer path to a broad facade earns a late echo.
  // Keep it separated from the early cluster instead of thickening every shot.
  for (const candidate of distant.slice(0, MAX_FAR_CANDIDATES)) {
    if (taps.some(tap => candidate.delay - tap.delay < LATE_SEPARATION)) continue;
    if (append(candidate)) break;
  }
  return taps;
}
