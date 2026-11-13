/**
 * Shared, presentation-independent ballpark geometry. World units are metres.
 * Fenway's published distances are exact anchors; intervening corners are a
 * deliberately simplified outline, not a survey of the real park.
 * Sources: mlb.com/redsox/ballpark/facts-figures and /ballpark/tours.
 */
export const FEET_TO_METRES = 0.3048;
export const FENCE_HEIGHT = 3.2;
const QUARTER = Math.PI / 4;
const radians = degrees => degrees * Math.PI / 180;
const point = (degrees, feet) => {
  const angle = radians(degrees), radius = feet * FEET_TO_METRES;
  return Object.freeze({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius });
};
const cross = (a, b) => a.x * b.z - a.z * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
const atRay = (a, b, angle) => {
  const direction = { x: Math.sin(angle), z: Math.cos(angle) }, edge = subtract(b, a);
  return cross(a, edge) / cross(direction, edge);
};
const splitAtAngle = (a, b, degrees) => {
  const angle = radians(degrees), radius = atRay(a, b, angle);
  return Object.freeze({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius });
};
const segment = (a, b, height, zone) => {
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  return Object.freeze({ a, b, height, zone, length,
    normal: Object.freeze({ x: -dz / length, z: dx / length }) });
};
const anchor = (label, feet, degrees) => Object.freeze({ label, feet, angle: radians(degrees) });

const left = point(-45, 310), leftCenter = point(-8, 379), center = point(0, 390);
const triangle = point(8, 420), rightCenter = point(22, 380), right = point(45, 302);
const bullpenStart = splitAtAngle(triangle, rightCenter, 13);
const rightCorner = point(37, 335), shortFence = splitAtAngle(rightCorner, right, 41);
const fenwaySegments = Object.freeze([
  segment(left, leftCenter, (37 + 2 / 12) * FEET_TO_METRES, 'monster'),
  segment(leftCenter, center, 17 * FEET_TO_METRES, 'center'),
  segment(center, triangle, 17 * FEET_TO_METRES, 'triangle'),
  segment(triangle, bullpenStart, 17 * FEET_TO_METRES, 'triangle'),
  segment(bullpenStart, rightCenter, 5 * FEET_TO_METRES, 'bullpen'),
  segment(rightCenter, rightCorner, 5 * FEET_TO_METRES, 'bullpen'),
  segment(rightCorner, shortFence, 4 * FEET_TO_METRES, 'right'),
  segment(shortFence, right, 3 * FEET_TO_METRES, 'right'),
]);
const harborSegments = Object.freeze(Array.from({ length: 96 }, (_, i) => {
  const a = -QUARTER + i / 96 * Math.PI / 2, b = -QUARTER + (i + 1) / 96 * Math.PI / 2;
  const radius = angle => 105 + 10 * Math.cos(2 * angle);
  return segment(Object.freeze({ x: Math.sin(a) * radius(a), z: Math.cos(a) * radius(a) }),
    Object.freeze({ x: Math.sin(b) * radius(b), z: Math.cos(b) * radius(b) }), FENCE_HEIGHT, 'harbor');
}));

export const PARKS = Object.freeze({
  harbor: Object.freeze({
    id: 'harbor', label: 'Harbor Field', shortName: 'HARBOR FIELD',
    description: 'The original symmetrical park, with a deep center field and even fences.',
    dimensionSummary: 'LF 344 · CF 377 · RF 344 ft', maxRadius: 115,
    dimensions: Object.freeze([anchor('Left field', 105 / FEET_TO_METRES, -45), anchor('Center field', 115 / FEET_TO_METRES, 0), anchor('Right field', 105 / FEET_TO_METRES, 45)]),
  }),
  fenway: Object.freeze({
    id: 'fenway', label: 'Fenway-inspired', shortName: 'FENWAY PARK',
    description: 'A tall left-field wall, deep triangle, and short right-field corner.',
    dimensionSummary: 'LF 310 · LC 379 · CF 390 · Triangle 420 · RC 380 · RF 302 ft',
    maxRadius: 420 * FEET_TO_METRES,
    dimensions: Object.freeze([anchor('Left field', 310, -45), anchor('Left-center', 379, -8),
      anchor('Center field', 390, 0), anchor('Deep center', 420, 8),
      anchor('Deep right', 380, 22), anchor('Right field', 302, 45)]),
  }),
});

export function resolveParkId(id) {
  const candidate = typeof id === 'object' && id !== null ? id.id : id;
  return Object.hasOwn(PARKS, candidate) ? candidate : 'harbor';
}
export function getPark(id = 'harbor') { return PARKS[resolveParkId(id)]; }
export function getWallSegments(id = 'harbor') { return resolveParkId(id) === 'fenway' ? fenwaySegments : harborSegments; }
function wallAtAngle(angle) {
  const bounded = Math.max(-QUARTER, Math.min(QUARTER, angle));
  return fenwaySegments.find(s => bounded <= Math.atan2(s.b.x, s.b.z) + 1e-10) || fenwaySegments.at(-1);
}
export function fieldRadius(angle, id = 'harbor') {
  if (resolveParkId(id) !== 'fenway') return 105 + 10 * Math.cos(2 * angle);
  const bounded = Math.max(-QUARTER, Math.min(QUARTER, angle));
  const wall = wallAtAngle(bounded);
  return atRay(wall.a, wall.b, bounded);
}
export function fenceHeight(angle, id = 'harbor') {
  if (resolveParkId(id) !== 'fenway') return FENCE_HEIGHT;
  // The taller adjoining surface owns an exact height-step corner.
  const bounded = Math.max(-QUARTER, Math.min(QUARTER, angle));
  return Math.max(...fenwaySegments.filter(s => bounded >= Math.atan2(s.a.x, s.a.z) - 1e-10 && bounded <= Math.atan2(s.b.x, s.b.z) + 1e-10).map(s => s.height));
}

/** Earliest outward crossing of a Fenway wall, including a corner contact. */
export function sweptParkWall(a, b, id = 'fenway') {
  const movement = subtract(b, a);
  let first = null;
  for (const wall of getWallSegments(id)) {
    const outward = movement.x * wall.normal.x + movement.z * wall.normal.z;
    if (outward <= 1e-12) continue;
    const edge = subtract(wall.b, wall.a), denominator = cross(movement, edge);
    if (Math.abs(denominator) < 1e-12) continue;
    const offset = subtract(wall.a, a);
    const t = cross(offset, edge) / denominator, u = cross(offset, movement) / denominator;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
    if (!first || t < first.t - 1e-9) first = { t: Math.max(0, Math.min(1, t)), height: wall.height, normal: wall.normal, zone: wall.zone, outward };
    else if (Math.abs(t - first.t) <= 1e-9) {
      first.height = Math.max(first.height, wall.height);
      if (outward > first.outward) Object.assign(first, { normal: wall.normal, zone: wall.zone, outward });
    }
  }
  return first;
}
