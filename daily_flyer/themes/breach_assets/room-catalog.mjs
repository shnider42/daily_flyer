// Functional space classification. District scenery and room purpose are separate.
// These are authored areas, not a second collision map or a procedural generator.
const type = (id, name, description, permitsMimic = false, permitsTrapdoor = false) =>
  Object.freeze({ id, name, description, permitsMimic, permitsTrapdoor });

export const ROOM_TYPES = Object.freeze({
  arrival: type('arrival', 'Arrival', 'Orient yourself, collect initial supplies, and find the reunion route.'),
  training: type('training', 'Training', 'Learn a weapon or traversal rule in a readable practice space.'),
  hub: type('hub', 'Hub', 'Regroup and choose which branch of the building to explore.'),
  transit: type('transit', 'Transit', 'Follow a connecting passage or use a clearly identified return route.'),
  combat: type('combat', 'Combat', 'Read the occupants, cover, and firing lanes before entering the fight.'),
  control: type('control', 'Control', 'Operate infrastructure to restore power or change a route.'),
  equipment: type('equipment', 'Equipment', 'Recover a weapon or permanent capability.'),
  refuge: type('refuge', 'Refuge', 'Clear nearby danger, then recover and establish a checkpoint.'),
  archive: type('archive', 'Archive', 'Read records, recover memories, and inspect unusual exhibits.', true),
  cache: type('cache', 'Cache', 'Investigate an optional supply or secret area; inspect what you open.', true),
  traversal: type('traversal', 'Traversal', 'Read the floor and crossing before committing to the route.', false, true),
  boss: type('boss', 'Boss arena', 'Confront a guardian with room to read and evade its attacks.'),
  extraction: type('extraction', 'Extraction / decision', 'Choose a departure or a final outcome for the team.'),
});

export function roomTypeInfo(id) {
  return Object.hasOwn(ROOM_TYPES, id) ? ROOM_TYPES[id] : null;
}

const finite = n => typeof n === 'number' && Number.isFinite(n);
const validBounds = area => area && [area.x1, area.z1, area.x2, area.z2].every(finite)
  && area.x2 > area.x1 && area.z2 > area.z1;
const contains = (area, x, z) => validBounds(area)
  && x >= area.x1 && x < area.x2 && z >= area.z1 && z < area.z2;
const areaSize = area => (area.x2 - area.x1) * (area.z2 - area.z1);
const priority = area => finite(area.priority) ? area.priority : 0;
const stableId = area => String(area.id || area.name || '');
const compare = (a, b) => Number(b.protected === true) - Number(a.protected === true)
  || priority(b) - priority(a) || areaSize(a) - areaSize(b)
  || (stableId(a) < stableId(b) ? -1 : stableId(a) > stableId(b) ? 1 : 0);

function descriptor(area, zone, source) {
  const info = roomTypeInfo(area.roomType || area.primaryType);
  const protectedArea = area.protected === true;
  return {
    ...area,
    id: area.id || zone?.id || zone?.name || 'connecting-passage',
    name: area.name || zone?.name || 'Connecting passage',
    roomType: info?.id || null, primaryType: info?.id || null, type: info,
    activities: Array.isArray(area.activities) ? [...area.activities] : [],
    theme: area.theme || zone?.identity || zone?.name || zone?.palette || null,
    motif: area.motif || zone?.motif || null,
    zoneId: area.zoneId || zone?.id || null,
    protected: protectedArea,
    permitsMimic: !protectedArea && info?.permitsMimic === true && area.permitsMimic !== false,
    permitsTrapdoor: !protectedArea && info?.permitsTrapdoor === true && area.permitsTrapdoor !== false,
    source, authored: source === 'authored',
  };
}

/**
 * Resolve a position without mutating the map. Bounds are half-open, as in zones.
 * Protected areas win; then priority, smallest area, and stable ID break overlaps.
 * An old named zone without room metadata remains unclassified. We do not infer
 * gameplay rules from words such as "archive", "laboratory", or a palette name.
 */
export function describeRoom(level, x, z) {
  if (!level || !finite(x) || !finite(z) || x < 0 || z < 0
    || finite(level.width) && x >= level.width || finite(level.height) && z >= level.height) return null;
  const zones = (level.zones || []).filter(zone => contains(zone, x, z)).sort(compare);
  const rooms = (level.rooms || []).filter(room => contains(room, x, z)).sort(compare);
  const room = rooms[0];
  if (room) {
    const zone = (level.zones || []).find(zone => room.zoneId && zone.id === room.zoneId) || zones[0];
    return descriptor(room, zone, 'authored');
  }
  if (zones.length) {
    const zone = zones[0];
    return descriptor(zone, zone, roomTypeInfo(zone.roomType || zone.primaryType) ? 'zone-metadata' : 'zone');
  }
  return descriptor({ id: 'connecting-passage', name: 'Connecting passage', roomType: 'transit' }, null, 'corridor');
}

const TOMORROW_DISTRICTS = Object.freeze({
  orchard: { roomType: 'combat', activities: ['archive', 'equipment'] },
  arrivals: { roomType: 'arrival', activities: ['training', 'equipment', 'refuge', 'archive', 'transit', 'extraction'] },
  aquarium: { roomType: 'combat', activities: ['archive', 'equipment'] },
  wardrobe: { roomType: 'control', activities: ['combat', 'equipment', 'refuge', 'archive', 'transit'] },
  exchange: { roomType: 'hub', activities: ['control', 'equipment', 'refuge', 'archive'] },
  sunday: { roomType: 'equipment', activities: ['combat', 'refuge', 'transit', 'archive'] },
  museum: { roomType: 'archive', activities: ['combat', 'equipment', 'refuge', 'transit'] },
  court: { roomType: 'boss', activities: ['combat', 'extraction', 'archive'] },
  weather: { roomType: 'control', activities: ['combat', 'equipment', 'transit', 'archive'] },
});

/** Author semantic regions for the existing Tomorrow floor plan; add no walls. */
export function authorTomorrowRooms(zones = []) {
  const known = new Map(zones.filter(zone => Object.hasOwn(TOMORROW_DISTRICTS, zone.id)).map(zone => [zone.id, zone]));
  const rooms = [...known.values()].map(zone => ({
    id: `district-${zone.id}`, name: zone.name, zoneId: zone.id,
    x1: zone.x1, z1: zone.z1, x2: zone.x2, z2: zone.z2,
    roomType: TOMORROW_DISTRICTS[zone.id].roomType,
    activities: [...TOMORROW_DISTRICTS[zone.id].activities],
    theme: zone.identity || zone.name, motif: zone.motif || null,
    priority: 0, protected: false,
  }));
  const region = (id, name, zoneId, roomType, bounds, extra = {}) => {
    const zone = known.get(zoneId);
    if (!zone) return;
    const [x1, z1, x2, z2] = bounds;
    rooms.push({ id, name, zoneId, roomType, activities: [], x1, z1, x2, z2,
      theme: zone.identity || zone.name, motif: zone.motif || null,
      priority: 30, protected: false, ...extra });
  };
  const point = (id, name, zoneId, roomType, x, z, radius = 1.5, extra = {}) =>
    region(id, name, zoneId, roomType, [x - radius, z - radius, x + radius, z + radius], extra);
  const protectedPoint = (id, name, zoneId, roomType, x, z, extra = {}) =>
    point(id, name, zoneId, roomType, x, z, 1.5, { priority: 110, protected: true, ...extra });

  // Small optional areas. Their floor markings identify a role; no new wall is implied.
  point('wardrobe-cabinet', 'Wardrobe supply cabinet', 'wardrobe', 'cache', 24.5, 50.5);
  point('museum-exhibit', 'Museum exhibit alcove', 'museum', 'archive', 23.5, 19.5);
  point('museum-hatch', 'Museum service hatch', 'museum', 'traversal', 15.5, 20.5);
  point('weather-hatch', 'Weather service hatch', 'weather', 'traversal', 80.5, 20.5);

  // All four possible arrival vestibules stay readable reunion spaces.
  for (const [id, name, zoneId, bounds] of [
    ['waiting-arrival', 'Waiting-room arrival', 'arrivals', [34, 78, 57, 87]],
    ['west-arrival', 'West arrival vestibule', 'orchard', [4, 79, 27, 87]],
    ['east-arrival', 'East arrival vestibule', 'aquarium', [64, 79, 87, 87]],
    ['sunday-arrival', 'Sunday arrival vestibule', 'sunday', [64, 49, 87, 57]],
  ]) region(id, name, zoneId, 'arrival', bounds, { priority: 80, protected: true, activities: ['transit'] });

  for (const [id, zoneId, x, z] of [
    ['waiting-refuge', 'arrivals', 37.5, 83.5], ['exchange-refuge', 'exchange', 52.5, 53.5],
    ['wardrobe-refuge', 'wardrobe', 7.5, 53.5], ['sunday-refuge', 'sunday', 81.5, 53.5],
    ['museum-refuge', 'museum', 7.5, 24.5],
  ]) protectedPoint(`room-${id}`, 'Blue waiting-light refuge', zoneId, 'refuge', x, z, { priority: 100 });

  for (const [id, name, zoneId, x, z] of [
    ['aux-power', 'Municipal power control', 'exchange', 39.5, 50.5],
    ['relay-west', 'Names register', 'wardrobe', 8.5, 38.5],
    ['relay-east', 'Hours register', 'weather', 82.5, 8.5],
  ]) protectedPoint(`room-${id}`, name, zoneId, 'control', x, z);
  protectedPoint('room-access-key', 'Departure-pass collection', 'exchange', 'equipment', 50.5, 50.5);
  protectedPoint('room-null-projector', 'Null projector recovery', 'museum', 'equipment', 8.5, 20.5);

  for (const [id, name, zoneId, x, z] of [
    ['memory-orchard', 'Gardener memory', 'orchard', 7.5, 68.5],
    ['memory-aquarium', 'Clockmaker memory', 'aquarium', 82.5, 68.5],
    ['memory-museum', 'Child-at-the-door memory', 'museum', 7.5, 8.5],
  ]) protectedPoint(`room-${id}`, name, zoneId, 'archive', x, z);

  for (const [id, zoneId, x, z] of [
    ['fold-waiting', 'arrivals', 53.5, 67.5], ['fold-sunday', 'sunday', 67.5, 38.5],
    ['fold-museum', 'museum', 23.5, 23.5], ['fold-weather', 'weather', 68.5, 24.5],
  ]) region(`room-${id}`, 'Folded-door landing', zoneId, 'transit', [x - 1.5, z - 1.5, x + 1.5, z + 2.5], { priority: 110, protected: true });

  for (const [id, name, zoneId, x, z] of [
    ['extraction', 'Southern departure lift', 'arrivals', 50.5, 83.5],
    ['ending-seal', 'Containment decision', 'court', 38.5, 8.5],
    ['ending-rewrite', 'Restoration decision', 'court', 52.5, 8.5],
  ]) protectedPoint(`room-${id}`, name, zoneId, 'extraction', x, z, { priority: 120 });
  return rooms;
}
