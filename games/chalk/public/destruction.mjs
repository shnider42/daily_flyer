import { getSolidWalls } from './building-geometry.mjs';
import { rayWallDistance } from './visibility.mjs';

const WIDTHS = [80, 56, 48], GRID = 40, EDGE = 10, CLEARANCE = 17, MAX_OPENINGS = 4;
const SIDES = ['north', 'south', 'east', 'west'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const span = wall => wall.axis === 'x' ? [wall.x, wall.x + wall.w] : [wall.y, wall.y + wall.h];
const unchanged = revision => ({ changed: false, revision: Number.isSafeInteger(revision) ? revision : 0, buildingIds: [], bounds: null, created: [] });

export function createDestructionState() { return { version: 1, revision: 0, breaches: [] }; }

function openingFor(building, wall, record) {
  const center = (record.from + record.to) / 2, vertical = wall.axis === 'y';
  const x = vertical ? wall.side === 'west' ? building.x : building.x + building.w : center;
  const y = vertical ? center : wall.side === 'north' ? building.y : building.y + building.h;
  const nx = wall.side === 'west' ? -1 : wall.side === 'east' ? 1 : 0;
  const ny = wall.side === 'north' ? -1 : wall.side === 'south' ? 1 : 0;
  return { ...record, x, y, side: wall.side, axis: wall.axis, width: record.to - record.from,
    thickness: vertical ? wall.w : wall.h, angle: wall.side === 'north' ? Math.PI : wall.side === 'east' ? -Math.PI / 2 : wall.side === 'west' ? Math.PI / 2 : 0,
    inside: { x: x - nx * 38, y: y - ny * 38 }, outside: { x: x + nx * 38, y: y + ny * 38 } };
}

function blocksSegment(from, to, walls, ignoredId, padding = 0) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  if (length < .0001) return false;
  for (const wall of walls) {
    if (wall.id === ignoredId) continue;
    const rect = padding ? { x: wall.x - padding, y: wall.y - padding, w: wall.w + padding * 2, h: wall.h + padding * 2 } : wall;
    if (rayWallDistance(from.x, from.y, dx / length, dy / length, rect, length + .001) <= length) return true;
  }
  return false;
}

/** Short rooms need narrower passages than a full doorway. Isolated cuts
 * retain solid end supports and a navigation-grid center. Street facades can
 * instead break into an existing doorway, whose grid lane stays accessible.
 * These exact intervals are also the allowlist for reconstructed co-op walls.
 */
function intervalsFor(building, wall) {
  const [start, end] = span(wall), intervals = [];
  for (const width of WIDTHS) {
    const first = Math.ceil((start + EDGE + width / 2 - GRID / 2) / GRID) * GRID + GRID / 2;
    for (let center = first; center <= end - EDGE - width / 2; center += GRID) {
      intervals.push({ from: center - width / 2, to: center + width / 2 });
    }
  }
  if (wall.axis === 'x') {
    const door = building.doors?.find(door => door.side === wall.side);
    let joined;
    if (door && end === door.x - door.width / 2) joined = { from: Math.max(start + EDGE, end - WIDTHS[0]), to: end };
    else if (door && start === door.x + door.width / 2) joined = { from: start, to: Math.min(end - EDGE, start + WIDTHS[0]) };
    if (joined && joined.to - joined.from >= CLEARANCE * 2 + 2) intervals.push(joined);
  }
  return intervals;
}

function validRecord(building, wall, record, accepted) {
  if (!building?.enterable || !wall || wall.kind !== 'perimeter' || !SIDES.includes(wall.side) || !['x', 'y'].includes(wall.axis)) return false;
  if (!Number.isFinite(record.from) || !Number.isFinite(record.to) || !intervalsFor(building, wall).some(interval => record.from === interval.from && record.to === interval.to)) return false;
  if (record.id !== `${wall.id}:${record.from}:${record.to}` || record.buildingId !== building.id || record.wallId !== wall.id) return false;
  if (accepted.filter(item => item.buildingId === building.id).length >= MAX_OPENINGS) return false;
  return !accepted.some(item => item.wallId === wall.id && record.from < item.to + EDGE && record.to > item.from - EDGE);
}

/** Apply canonical, bounded intervals to original walls. The seed layout and
 * door metadata stay intact; every consumer sees the same remaining solids.
 * A duplicate revision is intentionally a no-op for frequent co-op snapshots.
 */
export function syncBuildingDamage(world, destruction) {
  if (!world || destruction?.version !== 1 || !Number.isSafeInteger(destruction.revision) || destruction.revision < 0 || !Array.isArray(destruction.breaches) || destruction.revision !== destruction.breaches.length) return unchanged(world?.geometryRevision);
  if (world.geometryRevision === destruction.revision) return unchanged(world.geometryRevision);
  const buildings = new Map((world.buildings || []).map(building => [building.id, building])), accepted = [];
  for (const record of destruction.breaches) {
    const building = buildings.get(record?.buildingId), wall = building?.baseWalls?.find(wall => wall.id === record.wallId);
    if (!validRecord(building, wall, record, accepted)) return unchanged(world.geometryRevision);
    accepted.push(record);
  }
  const buildingIds = [], bounds = { x: Infinity, y: Infinity, w: 0, h: 0 };
  let right = -Infinity, bottom = -Infinity;
  for (const building of buildings.values()) {
    if (!building.baseWalls) continue;
    const records = accepted.filter(record => record.buildingId === building.id);
    if ((building.breaches || []).map(record => record.id).join('|') === records.map(record => record.id).join('|')) continue;
    const solids = [];
    for (const wall of building.baseWalls) {
      const cuts = records.filter(record => record.wallId === wall.id).sort((a, b) => a.from - b.from);
      let [cursor, end] = span(wall);
      const append = stop => {
        if (stop <= cursor) return;
        solids.push(wall.axis === 'x' ? { ...wall, x: cursor, w: stop - cursor } : { ...wall, y: cursor, h: stop - cursor });
      };
      for (const cut of cuts) { append(cut.from); cursor = cut.to; }
      append(end);
    }
    building.walls = solids;
    building.breaches = records.map(record => openingFor(building, building.baseWalls.find(wall => wall.id === record.wallId), record));
    building.wallRevision = destruction.revision;
    buildingIds.push(building.id);
    bounds.x = Math.min(bounds.x, building.x); bounds.y = Math.min(bounds.y, building.y);
    right = Math.max(right, building.x + building.w); bottom = Math.max(bottom, building.y + building.h);
  }
  if (buildingIds.length) {
    const owned = new Set((world.buildings || []).filter(building => building.enterable && building.baseWalls).map(building => building.id));
    const retained = Array.isArray(world.walls) ? world.walls.filter(wall => !owned.has(wall.buildingId)) : (world.buildings || []).filter(building => !owned.has(building.id));
    const solids = [...retained, ...(world.buildings || []).flatMap(building => owned.has(building.id) ? building.walls : [])];
    if (Array.isArray(world.walls)) world.walls.splice(0, world.walls.length, ...solids); else world.walls = solids;
    bounds.w = right - bounds.x; bounds.h = bottom - bounds.y;
  }
  world.geometryRevision = destruction.revision;
  return { changed: buildingIds.length > 0, revision: destruction.revision, buildingIds, bounds: buildingIds.length ? bounds : null, created: [] };
}

/** Called only for an authoritative explosive impact. Each blast opens at
 * most one soldier-width passage or widens a doorway. Four localized cuts per
 * house retain structural supports without frame-by-frame wall work or RNG.
 */
export function breachAtBlast(world, destruction, impact = {}) {
  if (!world || !finitePoint(impact) || destruction?.version !== 1 || !Number.isSafeInteger(destruction.revision) || !Array.isArray(destruction.breaches) || destruction.revision !== destruction.breaches.length) return unchanged(world?.geometryRevision);
  if (world.geometryRevision !== destruction.revision) syncBuildingDamage(world, destruction);
  if (world.geometryRevision !== destruction.revision) return unchanged(world?.geometryRevision);
  const radius = Number.isFinite(impact.radius) ? impact.radius : 76, reach = Math.min(54, Math.max(0, radius) * .7);
  if (reach < 1) return unchanged(world.geometryRevision);
  const walls = getSolidWalls(world), candidates = [];
  for (const building of world.buildings || []) {
    if (!building.enterable || destruction.breaches.filter(record => record.buildingId === building.id).length >= MAX_OPENINGS) continue;
    for (const wall of building.baseWalls || []) {
      if (wall.kind !== 'perimeter' || impact.wallId && wall.id !== impact.wallId) continue;
      const closest = { x: clamp(impact.x, wall.x, wall.x + wall.w), y: clamp(impact.y, wall.y, wall.y + wall.h) };
      if (Math.hypot(closest.x - impact.x, closest.y - impact.y) > reach || blocksSegment(impact, closest, walls, wall.id)) continue;
      for (const { from, to } of intervalsFor(building, wall)) {
        const record = { id: `${wall.id}:${from}:${to}`, buildingId: building.id, wallId: wall.id, from, to };
        if (!validRecord(building, wall, record, destruction.breaches)) continue;
        const opening = openingFor(building, wall, record), distance = Math.hypot(opening.x - impact.x, opening.y - impact.y);
        if (distance > reach || blocksSegment(opening.outside, opening.inside, walls, wall.id, CLEARANCE)) continue;
        candidates.push({ record, opening, distance });
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || b.opening.width - a.opening.width || a.record.id.localeCompare(b.record.id));
  const candidate = candidates[0];
  if (!candidate) return unchanged(world.geometryRevision);
  destruction.breaches.push(candidate.record); destruction.revision++;
  const result = syncBuildingDamage(world, destruction);
  result.created = result.changed ? [candidate.opening] : [];
  return result;
}
