// Static civilian street fabric, shared by host and clients. Parked vehicles
// are cover, not drivable traffic. Nothing here consumes the combat RNG.
const XS = [200, 680, 1160, 1640, 2120];
const YS = [200, 580, 960, 1340, 1720];
const VEHICLES = ['car', 'car', 'pickup', 'van'];
const PAINT = ['#c5bca0', '#7b9991', '#a58b69', '#a7aca5', '#a17b67', '#747e84'];
const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w > b.x - gap &&
  a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;

function seeded(seed, mission) {
  let value = ((seed >>> 0) ^ Math.imul(mission + 1, 0x85ebca6b) ^ 0x56434954) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let n = Math.imul(value ^ value >>> 15, value | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

/** The exact axis-aligned silhouette used by placement and game collision. */
export function streetPropBounds(prop) {
  const angle = Number.isFinite(prop.angle) ? prop.angle : 0;
  const w = Math.abs(Math.cos(angle)) * prop.w + Math.abs(Math.sin(angle)) * prop.h;
  const h = Math.abs(Math.sin(angle)) * prop.w + Math.abs(Math.cos(angle)) * prop.h;
  return { x: prop.x - w / 2, y: prop.y - h / 2, w, h };
}

/** Run after real doors exist, and before navigation is built. */
export function populateDistrictLife(world, seed = world?.layoutSeed || 0, mission = world?.layoutMission || 0) {
  if (!world?.districts?.length || !world.buildings?.length) return world;
  const random = seeded(seed, mission), pick = items => items[Math.floor(random() * items.length)];
  const props = [], solids = [], fires = [], reserved = [], occupied = [];
  const retained = (world.props || []).filter(prop => !prop.streetDecoration);
  for (const prop of retained) if (prop.layoutBounds) occupied.push(prop.layoutBounds);
  // Retain a continuous 84-unit route through every avenue for the convoy.
  // Parking sits at the dusty kerb; the same margins serve mobile navigation.
  for (const x of XS) reserved.push({ x: x - 43, y: 0, w: 86, h: world.height || 1900 });
  for (const y of YS) reserved.push({ x: 0, y: y - 43, w: world.width || 2400, h: 86 });
  const insertion = world.buildings.find(building => building.id === 'b30a');
  if (insertion) reserved.push({ x: insertion.x - 65, y: insertion.y + 20,
    w: 65, h: Math.min(130, insertion.h - 40) });
  // The two authored crash casualties lie on the corner, beyond the normal
  // avenue corridor. Keep their treatment and stretcher approaches unobstructed.
  if (mission === 1) reserved.push({ x: 1040, y: 835, w: 250, h: 240 });
  for (const building of world.buildings) {
    const district = world.districts.find(item => item.id === building.districtId);
    if (!district) continue;
    // Door-to-street corridors remain clear, even when a neighbouring building
    // is set back or a north/south entry has shifted onto another grid column.
    for (const door of building.doors || []) {
      const streetY = YS[district.row + (door.side === 'south' ? 1 : 0)];
      reserved.push({ x: door.x - door.width / 2 - 19, y: Math.min(door.y, streetY) - 20,
        w: door.width + 38, h: Math.abs(door.y - streetY) + 40 });
    }
    // Preserve at least one usable side breach per house. A 48-unit opening
    // fits even a shallow room; the actual room walls decide which grid row is
    // clear. Other facades may legitimately be sheltered by a parked vehicle.
    let escape = null;
    for (const side of ['west', 'east']) {
      const edge = side === 'west' ? building.x : building.x + building.w;
      for (let y = Math.ceil((building.y + 34 - 20) / 40) * 40 + 20; y <= building.y + building.h - 34; y += 40) {
        const passage = { x: edge - 55, y: y - 17, w: 110, h: 34 };
        if ((world.walls || []).some(wall => wall.id !== `${building.id}:${side}` && overlaps(passage, wall))) continue;
        escape = { x: side === 'west' ? edge - 60 : edge, y: y - 36, w: 60, h: 72 };
        break;
      }
      if (escape) break;
    }
    if (escape) reserved.push(escape);
  }
  for (const district of world.districts) {
    if (!['alley', 'court'].includes(district.variant)) continue;
    const pair = world.buildings.filter(building => building.districtId === district.id).sort((a, b) => a.x - b.x);
    if (pair.length !== 2) continue;
    const x = (pair[0].x + pair[0].w + pair[1].x) / 2;
    reserved.push({ x: x - 22, y: YS[district.row], w: 44, h: YS[district.row + 1] - YS[district.row] });
  }
  const place = (prop, material = null) => {
    const bounds = streetPropBounds(prop);
    if (bounds.x < 24 || bounds.y < 24 || bounds.x + bounds.w > (world.width || 2400) - 24 ||
      bounds.y + bounds.h > (world.height || 1900) - 24 ||
      reserved.some(rect => overlaps(bounds, rect)) ||
      world.buildings.some(building => overlaps(bounds, building, 9)) ||
      occupied.some(rect => overlaps(bounds, rect, 9))) return false;
    prop.id = `street:${props.length}`;
    prop.streetDecoration = true;
    prop.bounds = bounds;
    props.push(prop); occupied.push(bounds);
    if (material) {
      prop.cover = true;
      solids.push({ ...bounds, id: `${prop.id}:cover`, propId: prop.id, kind: 'street-cover', material });
    }
    return true;
  };
  const districtFor = (x, y) => world.districts.reduce((nearest, district) => {
    const d = Math.hypot(x - district.x - district.w / 2, y - district.y - district.h / 2);
    return !nearest || d < nearest.distance ? { district, distance: d } : nearest;
  }, null)?.district;
  const park = (x, y, angle) => {
    const type = pick(VEHICLES), district = districtFor(x, y), condition = random();
    return place({ type, x, y, w: type === 'van' ? 70 : type === 'pickup' ? 66 : 58,
      h: type === 'van' ? 29 : 27, angle, districtId: district?.id,
      paint: pick(PAINT), condition: condition < .17 ? 'burned' : condition < .55 ? 'damaged' : 'abandoned',
      variation: random() }, 'metal');
  };
  // Multiple possible bays per block change the street silhouette each replay.
  // Vehicles are generic period silhouettes; no modern makes or traffic logic.
  for (const x of XS) for (let row = 0; row < YS.length - 1; row++) for (const side of [-1, 1]) {
    if (random() > .72) continue;
    for (let attempt = 0; attempt < 5; attempt++) {
      const y = YS[row] + 114 + random() * (YS[row + 1] - YS[row] - 228);
      if (park(x + side * 65, y, side > 0 ? Math.PI / 2 : -Math.PI / 2)) break;
    }
  }
  for (const y of YS) for (let col = 0; col < XS.length - 1; col++) for (const side of [-1, 1]) {
    if (random() > .68) continue;
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = XS[col] + 112 + random() * (XS[col + 1] - XS[col] - 224);
      if (park(x, y + side * 63, side > 0 ? Math.PI : 0)) break;
    }
  }
  const furnishings = {
    market: [['handcart', 37, 25, 'wood'], ['stall', 50, 31, 'wood'], ['sacks', 28, 22, null], ['barrels', 25, 23, 'metal']],
    workshop: [['materials', 46, 25, 'stone'], ['tires', 29, 23, 'rubber'], ['barrels', 25, 23, 'metal'], ['handcart', 37, 25, 'wood']],
    courtyard: [['washline', 62, 12, null], ['sacks', 28, 22, null], ['palm', 30, 30, null], ['rubble', 32, 23, null]],
    residential: [['washline', 62, 12, null], ['handcart', 37, 25, 'wood'], ['jars', 23, 17, null], ['rubble', 32, 23, null]],
  };
  for (const district of world.districts) {
    // Widen the detail area to the shoulders around each block; the explicit
    // road and entry reservations above still govern every placement.
    const area = { x: XS[district.col] + 78, y: YS[district.row] + 77, w: 324, h: 226 };
    const choices = furnishings[district.kind] || furnishings.residential;
    for (let index = 0; index < 5; index++) {
      const [type, w, h, material] = choices[index % choices.length];
      for (let attempt = 0; attempt < 36; attempt++) {
        const angle = random() < .25 ? Math.PI / 2 : 0;
        if (place({ type, x: area.x + random() * area.w, y: area.y + random() * area.h,
          w, h, angle, districtId: district.id, variation: random() }, material)) break;
      }
    }
    // A seed-specific mix of laundry, faded shade cloth, workshops and market
    // freight gives each block an identity without changing authored missions.
    district.streetActivity = district.kind === 'market' ? 'market' : district.kind === 'workshop' ? 'workyard' : 'household';
    district.surface = pick(['dust', 'patched', 'rutted']);
  }
  // A few isolated smouldering cars imply previous fighting. Most abandoned
  // vehicles are unburned. These are ambient sources, never scripted blasts.
  const vehicles = props.filter(prop => VEHICLES.includes(prop.type));
  const candidates = vehicles.filter(prop => prop.condition === 'burned').sort((a, b) => a.variation - b.variation);
  const wanted = mission === 0 || mission === 5 ? 2 : 3;
  for (const prop of [...candidates, ...vehicles.filter(prop => prop.condition !== 'burned')]) {
    if (fires.length >= wanted) break;
    if (fires.some(fire => Math.hypot(fire.x - prop.x, fire.y - prop.y) < 430)) continue;
    // The glowing engine is just beyond the bumper, so sight does not have to
    // raycast through its own opaque vehicle body to reveal an ambient flame.
    prop.condition = 'burned'; prop.burning = true;
    fires.push({ id: `ambient:${prop.id}`, propId: prop.id,
      x: prop.x + Math.cos(prop.angle) * (prop.w / 2 + 3),
      y: prop.y + Math.sin(prop.angle) * (prop.w / 2 + 3),
      intensity: .45 + random() * .4, kind: 'vehicle', districtId: prop.districtId, phase: random() * 10 });
  }
  world.streetProps = props;
  world.streetSolids = solids;
  world.ambientFires = fires;
  world.props = [...retained, ...props];
  return world;
}
