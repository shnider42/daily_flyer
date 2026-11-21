/** Five seeded geological routes. Only new cavern IDs use these layouts. */
const T = { FLOOR: 1, WALL: 2, PATH: 3, WATER: 5, RUBBLE: 8, GRATE: 9 };
const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; return h >>> 0; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const CAVERN_LAYOUT_VERSION = 1;
export const CAVERN_FAMILIES = Object.freeze(['limestone', 'root-grotto', 'tidal', 'glacial', 'lava-tube']);

const shapes = {
  limestone: { name: 'Skylight karst', biome: 'cave', terrain: 'crystals',
    nodes: [[6,30,4,3],[15,25,5,4],[16,13,5,5],[31,7,6,3],[40,16,4,6],[34,28,6,4],[8,6,3,3]],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,1],[2,6]], optional: [[2,5]],
    color: '#c5b99c', floor: '#68645b', wall: '#514c46', wallTop: '#aeaa91', water: '#5c9291', decor: 'stalagmite',
    labels: ['LOW GALLERY','SKYLIGHT','CHALK ARCH','ECHO CHAMBER','RETURN LOOP','DRY POCKET'] },
  'root-grotto': { name: 'Root galleries', biome: 'cave', terrain: 'spores',
    nodes: [[6,30,4,3],[17,30,5,3],[13,19,4,4],[10,7,5,3],[28,9,5,5],[38,21,5,4],[35,31,5,3],[25,20,3,3]],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,1],[2,7]], optional: [[7,5]],
    color: '#a8bf8c', floor: '#3f5747', wall: '#293d35', wallTop: '#758774', water: '#345e5b', decor: 'story-mushroom',
    labels: ['ROOT FORK','HANGING ROOTS','DRY NEST','CANOPY BREAK','SPORE GALLERY','OUTER LOOP','ROOT KNOT'] },
  tidal: { name: 'Tidal shelves', biome: 'ocean', terrain: 'wetlands',
    nodes: [[6,30,4,3],[15,26,4,3],[11,10,5,4],[26,7,5,3],[38,15,6,4],[34,28,5,4],[25,20,3,3]],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,1],[3,6]], optional: [[6,5]],
    color: '#9dcbc1', floor: '#537e78', wall: '#304f55', wallTop: '#91b0ad', water: '#204f64', decor: 'crystal',
    labels: ['LOW TIDE','SHELL SHELF','REEF WINDOW','TIDE BASIN','DRY RETURN','POOL OBSERVATORY'] },
  glacial: { name: 'Blue-ice fractures', biome: 'ice', terrain: 'icefields',
    nodes: [[6,30,4,3],[17,29,5,3],[19,18,4,4],[10,7,5,3],[29,8,4,4],[40,17,4,5],[35,29,5,3],[7,17,3,3]],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,1],[3,7]], optional: [[2,5]],
    color: '#b7dfe0', floor: '#547888', wall: '#294d64', wallTop: '#9dbbc5', water: '#1b3e5a', decor: 'ice',
    labels: ['THAW SHELF','ICE ELBOW','BLUE WINDOW','FROZEN ARCH','MELTWATER CUT','RETURN BRIDGE','COLD POCKET'] },
  'lava-tube': { name: 'Basalt flow tubes', biome: 'volcanic', terrain: 'obsidian',
    nodes: [[6,30,4,3],[15,25,4,4],[11,11,5,3],[25,7,6,3],[39,11,4,4],[38,27,6,4],[25,26,3,3]],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,1]], optional: [[3,6]],
    color: '#d6a18a', floor: '#574447', wall: '#2e303a', wallTop: '#85676d', water: '#a85636', decor: 'rock',
    labels: ['COOLED TUBE','VENT SHELF','FLOW SPLIT','BASALT ARCH','WARM CHAMBER','INNER RETURN'] }
};
const cache = new Map();
function rect(p, x, y, w, h, tile) {
  for (let yy = Math.max(1, Math.floor(y)); yy < Math.min(p.rows - 1, Math.ceil(y + h)); yy++)
    for (let xx = Math.max(1, Math.floor(x)); xx < Math.min(p.cols - 1, Math.ceil(x + w)); xx++) p.tiles[yy][xx] = tile;
}
function ellipse(p, cx, cy, rx, ry, tile) {
  for (let y = Math.max(1, cy - ry); y <= Math.min(p.rows - 2, cy + ry); y++) for (let x = Math.max(1, cx - rx); x <= Math.min(p.cols - 2, cx + rx); x++)
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) p.tiles[y][x] = tile;
}
function route(p, points, width, tile) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let n = 0; n <= steps; n++) rect(p, Math.round(a.x + (b.x - a.x) * n / steps) - Math.floor(width / 2), Math.round(a.y + (b.y - a.y) * n / steps) - Math.floor(width / 2), width, width, tile);
  }
}

/** Every anchor is inside a chamber joined by a wide, finite graph edge. */
export function createCavernLayout(family = 'limestone', seed = 'farwake') {
  if (!CAVERN_FAMILIES.includes(family)) family = 'limestone';
  const key = `${family}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const source = shapes[family], h = hash(`${key}:layout-v${CAVERN_LAYOUT_VERSION}`);
  const p = { family, version: CAVERN_LAYOUT_VERSION, seed: String(seed), cols: 48, rows: 36, outdoors: false, biome: source.biome,
    terrain: source.terrain, tiles: Array.from({ length: 36 }, () => Array(48).fill(T.WALL)), decor: [], zones: [], spawn: { x: 4, y: 31 }, exit: { x: 2, y: 31 },
    palette: { ground: source.floor, ground2: source.floor, floor: source.floor, floor2: source.wall, edge: source.wallTop, wall: source.wall, wallTop: source.wallTop, path: source.floor, water: source.water, light: source.color, accent: source.color } };
  p.nodes = source.nodes.map(([x, y, rx, ry], index) => {
    const n = hash(`${key}:chamber:${index}`);
    return { id: `chamber-${index}`, x: index ? x + (n % 3) - 1 : x, y: index ? y + ((n >>> 4) % 3) - 1 : y, rx: rx + ((n >>> 8) % 2), ry,
      name: index ? source.labels[index - 1] : 'DAYLIGHT / RETURN' };
  });
  p.edges = [...source.links, ...source.optional.filter((edge, index) => ((h >>> (index + 2)) & 1) === 1)];
  if (family === 'tidal') ellipse(p, 25, 18, 21, 15, T.WATER);
  if (family === 'glacial') { rect(p, 25, 2, 4, 31, T.WATER); rect(p, 4, 15, 39, 3, T.WATER); }
  if (family === 'lava-tube') { ellipse(p, 25, 17, 10, 6, T.WATER); ellipse(p, 40, 31, 4, 2, T.WATER); }
  p.edges.forEach(([a, b], index) => {
    const start = p.nodes[a], end = p.nodes[b], n = hash(`${key}:passage:${index}`), width = family === 'tidal' ? 3 : 3 + (n % 2);
    let bend;
    if (family === 'glacial' || family === 'root-grotto') bend = n & 1 ? { x: start.x, y: end.y } : { x: end.x, y: start.y };
    else bend = { x: Math.round((start.x + end.x) / 2) + (n % 5) - 2, y: Math.round((start.y + end.y) / 2) + ((n >>> 4) % 5) - 2 };
    route(p, [start, bend, end], width, family === 'tidal' ? T.GRATE : T.PATH);
  });
  p.nodes.forEach((node, index) => {
    if (family === 'glacial') rect(p, node.x - node.rx, node.y - node.ry, node.rx * 2 + 1, node.ry * 2 + 1, T.FLOOR);
    else ellipse(p, node.x, node.y, node.rx, node.ry, T.FLOOR);
    p.zones.push({ id: node.id, name: node.name, x: node.x - node.rx, y: node.y - node.ry, w: node.rx * 2 + 1, h: node.ry * 2 + 1 });
    if (index) {
      p.decor.push({ kind: source.decor, x: node.x - node.rx + 1, y: node.y - node.ry, w: 1, h: 1, color: source.color });
      p.decor.push({ kind: 'label', x: node.x - 2, y: node.y + node.ry - 1, w: 1, h: 1, color: source.color, text: node.name });
      if ((index + h) % 3 === 0) p.decor.push({ kind: 'trail-light', x: node.x + node.rx - 1, y: node.y, w: 1, h: 1, color: source.color });
    }
  });
  // The entry apron and its sole connecting edge never depend on optional loops.
  rect(p, 1, 28, 7, 7, T.FLOOR); route(p, [p.spawn, p.nodes[0]], 3, T.PATH);
  p.decor.push({ kind: 'label', x: 2, y: 33, w: 1, h: 1, color: '#c4dec0', text: 'DAYLIGHT ←' });
  if (family === 'limestone') for (const index of [2, 3]) { const node = p.nodes[index]; p.decor.push({ kind: 'light', x: node.x - 2, y: node.y - node.ry, w: 4, h: .4, color: '#e6e3b4' }); }
  p.anchors = { survey: { x: p.nodes[1].x, y: p.nodes[1].y }, ecology: { x: p.nodes[2].x, y: p.nodes[2].y },
    sample: { x: p.nodes[4].x, y: p.nodes[4].y }, wildlife: [3, 5, p.nodes.length - 1].map(index => ({ x: p.nodes[index].x, y: p.nodes[index].y })) };
  freeze(p); cache.set(key, p); while (cache.size > 128) cache.delete(cache.keys().next().value);
  return p;
}

export function buildCavernInterior(m, site, { prop, point }) {
  const p = createCavernLayout(site.cavernFamily, site.cavernSeed);
  m.tiles = p.tiles.map(row => [...row]); m.outdoors = false; m.expedition = true; m.cavern = true; m.cavernFamily = p.family;
  m.expeditionLayout = `cavern-${p.family}`; m.biome = p.biome; m.terrain = p.terrain; m.palette = p.palette;
  m.spawn = point(p.spawn.x, p.spawn.y); m.exit = point(p.exit.x, p.exit.y); m.storyZones = p.zones;
  m.storyAnchors = [p.exit, p.anchors.survey, p.anchors.ecology, p.anchors.sample, ...p.anchors.wildlife].map(anchor => point(anchor.x, anchor.y));
  for (const item of p.decor) { const { kind, x, y, w, h, color, ...extra } = item; prop(m, kind, x, y, w, h, color, false, extra); }
  return m;
}
