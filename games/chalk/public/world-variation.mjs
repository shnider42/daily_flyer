// Replay variation stays inside the established street grid. Geometry, props,
// and district finishes are derived only from the mission seed, so the server
// and every co-op client build the same neighbourhood without extra packets.
const XS = [200, 680, 1160, 1640, 2120];
const YS = [200, 580, 960, 1340, 1720];
const KINDS = ['residential', 'residential', 'market', 'workshop', 'courtyard'];
const STYLES = { residential: 'plaster', market: 'plaster', workshop: 'workshop', courtyard: 'masonry' };

function seeded(seed, mission) {
  let state = ((seed >>> 0) ^ Math.imul(mission + 1, 0x9e3779b9) ^ 0x64316a7f) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad &&
  a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;

/** Mutates only static layout; does not consume the combat simulation RNG. */
export function varyWorldLayout(world, seed = 1, missionIndex = 0) {
  if (!world || !Array.isArray(world.buildings)) return world;
  const mission = Math.max(0, Math.min(5, Math.floor(Number.isFinite(missionIndex) ? missionIndex : 0)));
  const random = seeded(seed, mission), pick = choices => choices[Math.floor(random() * choices.length)];
  const original = world.buildings;
  const buildings = [], districts = [], decorations = [];

  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const bx = XS[col] + 90, by = YS[row] + 86, id = `d${row}${col}`;
    let kind = pick(KINDS);
    if (mission === 1 && row >= 1 && row <= 2 && col >= 1 && col <= 2) kind = 'market';
    else if (mission === 2 && row === 2 && col <= 2) kind = pick(['workshop', 'courtyard']);
    else if (mission === 3 && row === 0) kind = pick(['courtyard', 'residential']);
    else if (mission === 4 && col >= 2) kind = pick(['workshop', 'residential']);
    else if (mission === 5 && row <= 1) kind = pick(['courtyard', 'residential']);
    const variant = row === 1 && col === 1 ? 0 : Math.floor(random() * 4);
    const district = { id, row, col, x: XS[col] + 76, y: YS[row] + 72, w: 328, h: 236,
      kind, tone: random(), variant: ['frontage', 'alley', 'court', 'setback'][variant] };
    districts.push(district);
    const add = (suffix, dx, dy, w, h) => buildings.push({
      id: `b${row}${col}${suffix}`, x: bx + dx, y: by + dy, w, h, tone: random(),
      districtId: id, districtKind: kind, style: STYLES[kind], variation: random(),
    });

    // The insertion block remains a familiar starting point in each mission.
    // In Cordon this retains b30a and its south doorway at (340, 1631).
    if (row === 3 && col === 0) {
      const insertion = original.filter(building => /^b30(?:a|b)?$/.test(building.id || ''));
      if (insertion.length) {
        for (const building of insertion) {
          const { id: buildingId, x, y, w, h, tone } = building;
          buildings.push({ id: buildingId, x, y, w, h, tone, districtId: id,
            districtKind: 'residential', style: 'plaster', variation: random() });
        }
        district.kind = 'residential'; district.variant = 'insertion';
        continue;
      }
    }

    if (variant === 0) {
      const dx = pick([0, 20]), dy = pick([0, 20]);
      add('', dx, dy, 300 - dx - pick([0, 20, 40]), dy ? pick([160, 180]) : pick([180, 200]));
    } else if (variant === 1) {
      add('a', 0, pick([0, 20]), pick([120, 140]), pick([160, 180]));
      add('b', 180, pick([0, 20]), 120, pick([160, 180]));
    } else if (variant === 2) {
      // Staggered homes leave a small shared court and two different approaches.
      add('a', 0, 0, 120, pick([160, 180]));
      add('b', 180, 40, 120, 160);
    } else {
      // A smaller setback building opens a usable yard around its street entries.
      add('', pick([40, 60]), pick([20, 40]), pick([180, 200, 220]), 160);
    }
  }

  for (const district of districts) {
    if (district.variant === 'insertion') continue;
    const localBuildings = buildings.filter(building => building.districtId === district.id);
    const items = district.kind === 'market' ? ['stall', 'stall', 'crate']
      : district.kind === 'workshop' ? ['oil-stain', 'crate', 'crate']
      : district.kind === 'courtyard' ? ['rubble', 'debris'] : ['rubble', 'crate'];
    for (const type of items) {
      const [w, h] = type === 'stall' ? [40, 25] : type === 'oil-stain' ? [27, 52] : type === 'rubble' ? [22, 15] : [12, 12];
      const angle = type === 'rubble' || type === 'debris' ? random() * Math.PI * 2 : 0;
      const halfW = (Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h) / 2;
      const halfH = (Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h) / 2;
      const padX = halfW + 8, padY = halfH + 8;
      for (let attempt = 0; attempt < 32; attempt++) {
        const x = district.x + padX + random() * (district.w - padX * 2);
        const y = district.y + padY + random() * (district.h - padY * 2);
        const footprint = { x: x - halfW, y: y - halfH, w: halfW * 2, h: halfH * 2 };
        const nearBuilding = localBuildings.some(building => overlaps(footprint, building, 8));
        // Leave the complete door approach clear. Furnishings remain decoration,
        // not hidden collision that could invalidate a planned route.
        const inEntranceLane = localBuildings.some(building => Math.abs(x - (building.x + building.w / 2)) < 66 + halfW &&
          y > building.y - 65 - halfH && y < building.y + building.h + 65 + halfH);
        const overlapsDecoration = decorations.some(prop => overlaps(footprint, prop.layoutBounds, 8));
        if (nearBuilding || inEntranceLane || overlapsDecoration) continue;
        decorations.push({ type, x, y, w, h, angle,
          districtId: district.id, layoutDecoration: true, layoutBounds: footprint });
        break;
      }
    }
  }

  world.buildings = buildings;
  world.districts = districts;
  world.layoutSeed = seed >>> 0;
  world.layoutMission = mission;
  world.layoutVersion = 2;
  world.props = [...(world.props || []).filter(prop => !prop.layoutDecoration && !prop.streetDecoration && !['rubble', 'car', 'stall'].includes(prop.type)), ...decorations];
  return world;
}
