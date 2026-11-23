// Deterministic interior geometry shared by simulation and rendering.
// Furniture is decorative; perimeter and partition rectangles are the solids.
const WALL = 10;
const DOOR = 80;
const GRID = 40;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const snap = value => Math.round((value - GRID / 2) / GRID) * GRID + GRID / 2;
const contains = (rect, point, margin = 0) => point.x >= rect.x + margin && point.y >= rect.y + margin &&
  point.x <= rect.x + rect.w - margin && point.y <= rect.y + rect.h - margin;

/** Existing/custom worlds without interior geometry retain solid footprints. */
export function getSolidWalls(world) {
  return Array.isArray(world?.walls) ? world.walls : Array.isArray(world?.buildings) ? world.buildings : [];
}

/** The enterable footprint containing a point, including its open threshold. */
export function buildingAt(world, point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
  return world?.buildings?.find(building => building.enterable && contains(building, point)) || null;
}

/** Adds walk-in doors and simple rooms without consuming simulation RNG. */
export function prepareBuildingInteriors(world) {
  const solids = [];
  for (const building of world.buildings || []) {
    const { x, y, w, h, id } = building;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 110 || h < 150) {
      solids.push(building);
      continue;
    }
    const minDoor = x + WALL + DOOR / 2, maxDoor = x + w - WALL - DOOR / 2;
    // Every generated footprint has a legal grid-aligned doorway. The clamped
    // fallback still lets hand-authored footprints use the same helper.
    const firstGrid = Math.ceil((minDoor - GRID / 2) / GRID) * GRID + GRID / 2;
    const lastGrid = Math.floor((maxDoor - GRID / 2) / GRID) * GRID + GRID / 2;
    const doorX = firstGrid <= lastGrid ? clamp(snap(x + w / 2), firstGrid, lastGrid) : (minDoor + maxDoor) / 2;
    const gapLeft = doorX - DOOR / 2, gapRight = doorX + DOOR / 2;
    const walls = [];
    const wall = (key, side, wx, wy, ww, wh, kind = 'perimeter') => {
      if (ww <= 0 || wh <= 0) return;
      walls.push({ id: `${id}:${key}`, x: wx, y: wy, w: ww, h: wh, buildingId: id, kind, side, axis: ww > wh ? 'x' : 'y' });
    };
    wall('west', 'west', x, y, WALL, h); wall('east', 'east', x + w - WALL, y, WALL, h);
    for (const [side, edgeY] of [['north', y], ['south', y + h - WALL]]) {
      wall(`${side}-left`, side, x + WALL, edgeY, gapLeft - x - WALL, WALL);
      wall(`${side}-right`, side, gapRight, edgeY, x + w - WALL - gapRight, WALL);
    }
    const interior = { x: x + WALL, y: y + WALL, w: w - WALL * 2, h: h - WALL * 2 };
    const doors = [
      { x: doorX, y, width: DOOR, side: 'north', inside: { x: doorX, y: y + 38 }, outside: { x: doorX, y: y - 38 } },
      { x: doorX, y: y + h, width: DOOR, side: 'south', inside: { x: doorX, y: y + h - 38 }, outside: { x: doorX, y: y + h + 38 } },
    ];
    const rooms = [];
    if (w >= 190) {
      const partitionY = clamp(snap(y + h / 2), y + 65, y + h - 65);
      wall('partition-left', 'interior', interior.x, partitionY - WALL / 2, gapLeft - interior.x, WALL, 'partition');
      wall('partition-right', 'interior', gapRight, partitionY - WALL / 2, interior.x + interior.w - gapRight, WALL, 'partition');
      rooms.push({ x: interior.x, y: interior.y, w: interior.w, h: partitionY - WALL / 2 - interior.y });
      rooms.push({ x: interior.x, y: partitionY + WALL / 2, w: interior.w, h: interior.y + interior.h - partitionY - WALL / 2 });
    } else rooms.push({ ...interior });
    const furniture = rooms.flatMap((room, index) => {
      // Mats and low edge storage leave the central doorway lane unobstructed.
      const matWidth = Math.min(46, room.w * .28), matHeight = Math.min(48, room.h * .55);
      return [
        { type: 'mat', x: room.x + 13, y: room.y + 20, w: matWidth, h: matHeight, tone: (building.tone + index * .31) % 1 },
        { type: 'shelf', x: room.x + room.w - 12, y: room.y + 18, w: 9, h: Math.min(42, room.h - 30), tone: building.tone },
      ];
    });
    Object.assign(building, { enterable: true, wallThickness: WALL, doors, interior, rooms, walls, furniture,
      baseWalls: walls.map(wall => ({ ...wall })), breaches: [], wallRevision: 0 });
    solids.push(...walls);
  }
  world.walls = solids;
  world.geometryRevision = 0;
  return world;
}
