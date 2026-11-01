import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_TYPES, roomTypeInfo, describeRoom, authorTomorrowRooms } from '../daily_flyer/themes/breach_assets/room-catalog.mjs';
import { TOMORROW } from '../daily_flyer/themes/breach_assets/tomorrow.mjs';

const level = () => ({ ...TOMORROW, rooms: authorTomorrowRooms(TOMORROW.zones) });
const point = (map, x, z) => describeRoom(map, x, z);

test('the functional catalog has thirteen stable roles and bounded surprise policies', () => {
  assert.deepEqual(Object.keys(ROOM_TYPES), ['arrival', 'training', 'hub', 'transit', 'combat', 'control', 'equipment', 'refuge', 'archive', 'cache', 'traversal', 'boss', 'extraction']);
  assert.deepEqual(Object.values(ROOM_TYPES).filter(t => t.permitsMimic).map(t => t.id), ['archive', 'cache']);
  assert.deepEqual(Object.values(ROOM_TYPES).filter(t => t.permitsTrapdoor).map(t => t.id), ['traversal']);
  for (const info of Object.values(ROOM_TYPES)) {
    assert.equal(roomTypeInfo(info.id), info);
    assert.ok(info.name && info.description);
    assert.ok(Object.isFrozen(info));
  }
  assert.ok(Object.isFrozen(ROOM_TYPES));
  for (const id of ['laboratory', 'toString', '__proto__', undefined]) assert.equal(roomTypeInfo(id), null);
});

test('authored Tomorrow districts classify existing functions without changing geometry or themes', () => {
  const map = level();
  const expected = { orchard: 'combat', arrivals: 'arrival', aquarium: 'combat', wardrobe: 'control', exchange: 'hub', sunday: 'equipment', museum: 'archive', court: 'boss', weather: 'control' };
  for (const zone of map.zones) {
    let found;
    for (let z = zone.z1; z < zone.z2 && !found; z++) for (let x = zone.x1; x < zone.x2; x++) {
      if (map.grid[z]?.[x] !== '.') continue;
      const room = point(map, x + .5, z + .5);
      if (room.id === `district-${zone.id}`) { found = room; break; }
    }
    assert.ok(found, `${zone.id} retains an actual base district floor area`);
    assert.equal(found.primaryType, expected[zone.id]);
    assert.equal(found.roomType, found.type.id);
    assert.equal(found.theme, zone.identity);
    assert.equal(found.motif, zone.motif);
    assert.equal(found.source, 'authored');
    assert.equal(found.authored, true);
    assert.ok(found.activities.every(id => roomTypeInfo(id)), `${zone.id} uses recognized activity roles`);
  }
  assert.equal(map.grid, TOMORROW.grid, 'semantic regions add no collision geometry');
});

test('all split arrivals and actual progression, refuge, memory and ending points reject mimics and trapdoors', () => {
  const map = level();
  const mandatoryIds = new Set(['aux-power', 'relay-west', 'relay-east', 'memory-orchard', 'memory-aquarium', 'memory-museum', 'extraction', 'ending-seal', 'ending-rewrite']);
  const targets = [...map.coopSpawnVariants.flat(),
    ...map.interactables.filter(item => mandatoryIds.has(item.id) || item.type === 'refuge' || item.tomorrowAction === 'fold'),
    ...map.interactables.filter(item => item.tomorrowAction === 'fold').map(item => ({ ...item.landing, id: `${item.id} landing` })),
    ...map.pickups.filter(item => ['access-key', 'null-projector'].includes(item.id))];
  for (const target of targets) for (const [dx, dz] of [[0, 0], [.6, 0], [-.6, 0], [0, .6], [0, -.6]]) {
    const room = point(map, target.x + dx, target.z + dz);
    assert.ok(room?.protected, `${target.id || 'arrival'} has protected approach space`);
    assert.equal(room.permitsMimic, false, target.id);
    assert.equal(room.permitsTrapdoor, false, target.id);
  }
  for (const refuge of map.interactables.filter(item => item.type === 'refuge')) assert.equal(point(map, refuge.x, refuge.z).roomType, 'refuge');
  for (const ending of map.interactables.filter(item => item.tomorrowAction === 'ending')) assert.equal(point(map, ending.x, ending.z).roomType, 'extraction');
});

test('optional cabinets, exhibits and hatches have small explicit eligible regions', () => {
  const map = level();
  const optional = [
    ['wardrobe-cabinet', 24.5, 50.5, 'cache', true, false],
    ['museum-exhibit', 23.5, 19.5, 'archive', true, false],
    ['museum-hatch', 15.5, 20.5, 'traversal', false, true],
    ['weather-hatch', 80.5, 20.5, 'traversal', false, true],
  ];
  for (const [id, x, z, roomType, mimic, trap] of optional) {
    const room = point(map, x, z);
    assert.equal(map.grid[Math.floor(z)][Math.floor(x)], '.', `${id} occupies real floor`);
    assert.equal(room.id, id);
    assert.equal(room.roomType, roomType);
    assert.equal(room.protected, false);
    assert.equal(room.permitsMimic, mimic);
    assert.equal(room.permitsTrapdoor, trap);
    assert.ok((room.x2 - room.x1) * (room.z2 - room.z1) <= 9, `${id} does not relabel its whole district`);
    assert.notEqual(point(map, x + 1.6, z).id, id, `${id} ends at its marked area`);
  }
  assert.equal(point(map, 26.1, 50.5).roomType, 'control');
  assert.equal(point(map, 17.1, 20.5).permitsTrapdoor, false);
  assert.equal(point(map, 82.1, 20.5).roomType, 'control');
});

test('protected overrides cannot be displaced by an overlapping high-priority surprise area', () => {
  const map = level();
  map.rooms.push({ id: 'bad-spawn-cache', roomType: 'cache', x1: 44, x2: 47, z1: 82, z2: 85, priority: 9999 });
  const spawn = map.coopSpawnVariants[0][0], room = point(map, spawn.x, spawn.z);
  assert.equal(room.roomType, 'arrival');
  assert.equal(room.protected, true);
  assert.equal(room.permitsMimic, false);
  assert.equal(room.permitsTrapdoor, false);
});

test('overlap precedence is explicit, specific, stable and uses half-open bounds', () => {
  const base = { x1: 1, z1: 1, x2: 9, z2: 9, roomType: 'combat' };
  const rooms = [
    { ...base, id: 'base', priority: 0 },
    { ...base, id: 'higher-priority', roomType: 'control', priority: 10 },
    { ...base, id: 'z-small', x2: 5, z2: 5, roomType: 'archive', priority: 10 },
    { ...base, id: 'a-small', x2: 5, z2: 5, roomType: 'cache', priority: 10 },
  ];
  const map = { width: 10, height: 10, rooms };
  assert.equal(point(map, 3, 3).id, 'a-small');
  assert.equal(point({ ...map, rooms: [...rooms].reverse() }, 3, 3).id, 'a-small');
  assert.equal(point(map, 5, 5).id, 'higher-priority');
  assert.equal(point(map, 9, 9).roomType, 'transit');
  const blocked = point({ ...map, rooms: [{ ...base, id: 'explicit-disable', roomType: 'cache', permitsMimic: false }] }, 3, 3);
  assert.equal(blocked.permitsMimic, false);
});

test('legacy named zones stay descriptive and unclassified until given explicit metadata', () => {
  const zone = { name: 'Archive reactor cache', palette: 'archives', x1: 2, x2: 8, z1: 2, z2: 8 };
  const oldMap = { width: 10, height: 10, zones: [zone] };
  const room = point(oldMap, 4, 4);
  assert.equal(room.name, zone.name);
  assert.equal(room.type, null);
  assert.equal(room.primaryType, null);
  assert.equal(room.source, 'zone');
  assert.equal(room.authored, false);
  assert.equal(room.permitsMimic, false);
  assert.equal(room.permitsTrapdoor, false);
  const explicit = point({ ...oldMap, zones: [{ ...zone, roomType: 'control' }] }, 4, 4);
  assert.equal(explicit.type, ROOM_TYPES.control);
  assert.equal(explicit.source, 'zone-metadata');
  const corridor = point(oldMap, 1, 1);
  assert.equal(corridor.roomType, 'transit');
  assert.equal(corridor.source, 'corridor');
});

test('room authorship and lookups are pure and tolerate absent or partial metadata', () => {
  const before = JSON.stringify(TOMORROW.zones);
  const first = authorTomorrowRooms(TOMORROW.zones), second = authorTomorrowRooms(TOMORROW.zones);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map(room => room.id)).size, first.length);
  first[0].activities.push('fake');
  assert.ok(!second[0].activities.includes('fake'));
  assert.equal(JSON.stringify(TOMORROW.zones), before);
  const map = { ...TOMORROW, rooms: second }, mapBefore = JSON.stringify(map);
  const result = point(map, 24.5, 50.5); result.activities.push('fake');
  assert.equal(JSON.stringify(map), mapBefore);
  assert.deepEqual(authorTomorrowRooms(), []);
  const partial = authorTomorrowRooms([TOMORROW.zones.find(zone => zone.id === 'museum')]);
  assert.ok(partial.length > 1 && partial.every(room => room.zoneId === 'museum'));
  assert.equal(describeRoom(null, 1, 1), null);
  for (const [x, z] of [[NaN, 4], [4, Infinity], [-1, 4], [4, -1], [91, 4], [4, 91]]) assert.equal(point(map, x, z), null);
});
