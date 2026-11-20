/** Seeded additions to the released corridor. Existing walkable space never closes. */
const TILE = 24;
const point = (x, y) => ({ x: (x + .5) * TILE, y: (y + .5) * TILE });
const hash = value => { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const random = seed => { let state = hash(seed); return () => { state = (state + 0x6d2b79f5) >>> 0; let value = state; value = Math.imul(value ^ value >>> 15, 1 | value); value ^= value + Math.imul(value ^ value >>> 7, 61 | value); return ((value ^ value >>> 14) >>> 0) / 4294967296; }; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const rectBetween = (a, b) => ({ x: Math.min(a.x, b.x) - 1, y: Math.min(a.y, b.y) - 1,
  w: Math.abs(a.x - b.x) + 3, h: Math.abs(a.y - b.y) + 3 });

export const CORRIDOR_TEMPLATE_VERSION = 1;
export const CORRIDOR_CUE_DURATIONS = freeze({ 'pressure-vent': 2.4, 'service-cart': 3.2,
  'relay-stutter': 4.8, 'empty-lift': 5.2, 'hanging-sheet': 4.5, 'pipe-knock': 3.6 });

/** A connected passage tree plus a few loops, with several closed branch ends. */
function annex(id, circuit, y, returnY, rng) {
  const cols = 11, rows = 2, nodes = Array.from({ length: cols * rows }, (_, i) => ({ x: 28 + (i % cols) * 7, y: y + Math.floor(i / cols) * 7 }));
  const neighbours = index => { const x = index % cols, row = Math.floor(index / cols); return [x > 0 && index - 1, x < cols - 1 && index + 1, row > 0 && index - cols, row < rows - 1 && index + cols].filter(value => value !== false); };
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const edges = [], linked = new Set(), seen = new Set([0]), stack = [0];
  const connect = (a, b) => { edges.push([a, b]); linked.add(edgeKey(a, b)); };
  while (stack.length) {
    const current = stack.at(-1), next = neighbours(current).filter(value => !seen.has(value));
    if (!next.length) { stack.pop(); continue; }
    const selected = next[Math.floor(rng() * next.length)]; connect(current, selected); seen.add(selected); stack.push(selected);
  }
  const spare = [];
  for (let i = 0; i < nodes.length; i++) for (const other of neighbours(i)) if (i < other && !linked.has(edgeKey(i, other))) spare.push([i, other]);
  for (let i = 0, count = 1 + Math.floor(rng() * 2); i < count && spare.length; i++) { const [edge] = spare.splice(Math.floor(rng() * spare.length), 1); connect(...edge); }
  const mouths = [Math.floor(rng() * 3), 8 + Math.floor(rng() * 3)].map(col => ({ ...nodes[cols + col], returnY }));
  const towardExit = new Map(mouths.map(mouth => [nodes.findIndex(node => node.x === mouth.x && node.y === mouth.y), null]));
  const queue = [...towardExit.keys()];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const [a, b] of edges) {
      const next = a === at ? b : b === at ? a : null;
      if (next === null || towardExit.has(next)) continue;
      towardExit.set(next, at); queue.push(next);
    }
  }
  const returnSigns = [...towardExit].filter(([index, next]) => index % 3 === 0 && next !== null).map(([index, next]) => ({ ...nodes[index],
    direction: nodes[next].x > nodes[index].x ? '→' : nodes[next].x < nodes[index].x ? '←' : nodes[next].y > nodes[index].y ? '↓' : '↑' }));
  const floors = edges.map(([a, b]) => rectBetween(nodes[a], nodes[b]));
  for (const mouth of mouths) floors.push(rectBetween(mouth, { x: mouth.x, y: returnY }));
  const left = 1 + Math.floor(rng() * 3), right = cols + 7 + Math.floor(rng() * 3);
  const anchors = [nodes[left], nodes[right]];
  for (const at of anchors) floors.push({ x: at.x - 2, y: at.y - 2, w: 5, h: 5 });
  return { id, circuit, nodes, edges, mouths, returnSigns, floors, anchors,
    lightZone: { id, section: circuit, x: 25 * TILE, y: (y - 2) * TILE, w: 77 * TILE, h: (returnY - y + 4) * TILE } };
}

/** Keep chapter timing authored; seed changes places, discoveries and mundane disturbances. */
export function createQuietEarthCorridorPlan(seed = 'farwake') {
  const rng = random(`${seed}:relay-nine:annexes:${CORRIDOR_TEMPLATE_VERSION}`);
  const wings = [annex('stores', 'intake', 54, 70, rng), annex('archive', 'middle', 28, 43, rng), annex('service', 'upper', 5, 17, rng)];
  const evidenceAnchors = [wings[0].anchors[0], wings[0].anchors[1], wings[1].anchors[0], wings[1].anchors[1], wings[2].anchors[0]];
  const cues = [
    { id: 'relay-stutter', ...point(wings[0].nodes[5 + Math.floor(rng() * 3)].x, 54), radius: 76, sfx: 'relayStatic', circuit: 'intake' },
    { id: 'empty-lift', ...point(wings[1].anchors[1].x, wings[1].anchors[1].y), radius: 80, sfx: 'corridorClang', circuit: 'middle' },
    { id: 'hanging-sheet', ...point(wings[2].anchors[1].x, wings[2].anchors[1].y), radius: 78, sfx: 'relayStatic', circuit: 'upper' }
  ];
  // Some galaxies have an extra stop/start on the main route; it is never a threat.
  if (rng() < .7) cues.push({ id: 'pipe-knock', ...point(31 + Math.floor(rng() * 8) * 7, 20), radius: 72, sfx: 'corridorClang', circuit: 'upper' });
  return freeze({ version: CORRIDOR_TEMPLATE_VERSION, seedKey: hash(`${seed}:relay-nine`), wings, evidenceAnchors, cues });
}

/** Geometry and local landmarks are data shared by the solo and network authority. */
export function buildQuietEarthAnnexes(m, site, { rect, prop, label, TILE: tiles }) {
  const plan = site.corridorPlan; if (!plan) return;
  m.corridorPlan = plan;
  const names = { stores: 'STORES', archive: 'ARCHIVE', service: 'AUXILIARY' };
  for (const wing of plan.wings) {
    for (const floor of wing.floors) rect(m, floor.x, floor.y, floor.w, floor.h, tiles.FLOOR);
    for (const mouth of wing.mouths) {
      prop(m, 'light', mouth.x - 1, mouth.returnY - 2, 2, .2, '#a0d5ad', false);
      label(m, '↓ HALL', mouth.x - 1, mouth.returnY - 3, '#a0d5ad');
      label(m, names[wing.id] + ' ↑', mouth.x - 1, mouth.returnY, '#b7b5a4');
    }
    for (const sign of wing.returnSigns) {
      prop(m, 'light', sign.x - .5, sign.y + .8, .8, .15, '#83b59a', false);
      label(m, sign.direction, sign.x, sign.y + .4, '#83b59a');
    }
    for (const at of wing.anchors) {
      const light = prop(m, 'light', at.x - 1, at.y - 2, 2, .2, '#b8c5a7', false); light.lightCircuit = wing.circuit;
      prop(m, 'cabinet', at.x + 1, at.y - 1, .6, .8, '#617d76', false);
      prop(m, 'debris', at.x - 1.8, at.y + 1, .8, .5, '#9b9e87', false);
    }
    m.storyZones.push({ id: wing.id, name: names[wing.id], x: 25, y: wing.nodes[0].y - 2, w: 77, h: wing.mouths[0].returnY - wing.nodes[0].y + 4 });
  }
}
