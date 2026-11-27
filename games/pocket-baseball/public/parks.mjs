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

const outline = (rows, zone) => {
  const points = rows.map(([angle, feet]) => point(angle, feet));
  return Object.freeze(points.slice(0, -1).map((p, i) => segment(p, points[i + 1], rows[i][2] * FEET_TO_METRES, zone)));
};
// Wrigley's published markers are anchors; angles and wall height are playable
// approximations. The three neighborhood fields are original game designs.
// Source: https://www.mlb.com/cubs/ballpark/information/history
const wrigleySegments = outline([[-45,355,11.5],[-22.5,368,11.5],[0,400,11.5],[22.5,368,11.5],[45,353,11.5]], 'ivy');
const mapleSegments = outline([[-45,250,5],[-22,280,5],[0,300,5],[24,255,4],[45,230,4]], 'wood');
const sandlotSegments = outline([[-45,285,7],[-25,315,8],[-5,350,8],[9,335,6],[28,295,6],[45,265,6]], 'sandlot');
const schoolyardSegments = outline([[-45,250,17],[-18,285,17],[0,305,9],[25,290,7],[45,278,7]], 'brick');

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
  wrigley: Object.freeze({
    id:'wrigley', label:'Wrigley-inspired', shortName:'IVY & BRICK', style:'wrigley',
    description:'Ivy-covered brick, a manual center scoreboard, rooftop bleachers, and deep alleys.',
    dimensionSummary:'LF 355 · LC 368 · CF 400 · RC 368 · RF 353 ft', maxRadius:400 * FEET_TO_METRES,
    dimensions:Object.freeze([anchor('Left field',355,-45),anchor('Left-center',368,-22.5),anchor('Center field',400,0),anchor('Right-center',368,22.5),anchor('Right field',353,45)]),
    palette:Object.freeze({grass:'#527f43',stripe:'#618b4c',dirt:'#b68a5b',wall:'#2f633b',sky:'#5380a1',horizon:'#d9c597'}),
  }),
  maple: Object.freeze({
    id:'maple', label:'Maple Yard', shortName:'MAPLE YARD', style:'backyard', neighborhood:true,
    description:'A short right-field picket fence, weathered sheds, big trees, and family porches.',
    dimensionSummary:'LF 250 · CF 300 · RF 230 ft', maxRadius:300 * FEET_TO_METRES,
    dimensions:Object.freeze([anchor('Left field',250,-45),anchor('Center field',300,0),anchor('Right field',230,45)]),
    palette:Object.freeze({grass:'#678747',stripe:'#729450',dirt:'#b79b6c',wall:'#b29970',sky:'#6599b6',horizon:'#e1d8b4'}),
  }),
  sandlot: Object.freeze({
    id:'sandlot', label:'Railway Sandlot', shortName:'RAILWAY SANDLOT', style:'sandlot', neighborhood:true,
    description:'A dusty lot with a deep left-center pocket, warehouse walls, and railway cars beyond the fence.',
    dimensionSummary:'LF 285 · Deep LC 350 · RF 265 ft', maxRadius:350 * FEET_TO_METRES,
    dimensions:Object.freeze([anchor('Left field',285,-45),anchor('Deep left-center',350,-5),anchor('Right field',265,45)]),
    palette:Object.freeze({grass:'#817a4e',stripe:'#8c8457',dirt:'#b9a17a',wall:'#6a7165',sky:'#756b84',horizon:'#e7b680'}),
  }),
  schoolyard: Object.freeze({
    id:'schoolyard', label:'Schoolyard Commons', shortName:'SCHOOLYARD', style:'schoolyard', neighborhood:true,
    description:'A tall brick wall in left, an angled wire fence in right, and a school playground outside the lines.',
    dimensionSummary:'LF 250 · CF 305 · RF 278 ft', maxRadius:305 * FEET_TO_METRES,
    dimensions:Object.freeze([anchor('Left field',250,-45),anchor('Center field',305,0),anchor('Right field',278,45)]),
    palette:Object.freeze({grass:'#537e60',stripe:'#5e8b6b',dirt:'#b4936d',wall:'#9e6652',sky:'#608aab',horizon:'#d7c9ac'}),
  }),
});

const SEGMENTS = Object.freeze({harbor:harborSegments,fenway:fenwaySegments,wrigley:wrigleySegments,maple:mapleSegments,sandlot:sandlotSegments,schoolyard:schoolyardSegments});

export function resolveParkId(id) {
  const candidate = typeof id === 'object' && id !== null ? id.id : id;
  return Object.hasOwn(PARKS, candidate) ? candidate : 'harbor';
}
export function getPark(id = 'harbor') { return PARKS[resolveParkId(id)]; }
export function getWallSegments(id = 'harbor') { return SEGMENTS[resolveParkId(id)]; }
function wallAtAngle(angle, id) {
  const bounded = Math.max(-QUARTER, Math.min(QUARTER, angle));
  const walls = getWallSegments(id);
  return walls.find(s => bounded <= Math.atan2(s.b.x, s.b.z) + 1e-10) || walls.at(-1);
}
export function fieldRadius(angle, id = 'harbor') {
  if (resolveParkId(id) === 'harbor') return 105 + 10 * Math.cos(2 * angle);
  const bounded = Math.max(-QUARTER, Math.min(QUARTER, angle));
  const wall = wallAtAngle(bounded, id);
  return atRay(wall.a, wall.b, bounded);
}
export function fenceHeight(angle, id = 'harbor') {
  if (resolveParkId(id) === 'harbor') return FENCE_HEIGHT;
  // The taller adjoining surface owns an exact height-step corner.
  const bounded = Math.max(-QUARTER, Math.min(QUARTER, angle));
  return Math.max(...getWallSegments(id).filter(s => bounded >= Math.atan2(s.a.x, s.a.z) - 1e-10 && bounded <= Math.atan2(s.b.x, s.b.z) + 1e-10).map(s => s.height));
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
