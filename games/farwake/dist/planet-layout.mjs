/** Regional settlement plans. A world keeps its plan for the life of its seed. */
import { planetTypeFor } from './world-types.mjs';
import { isPreflightBody } from './social-world.mjs';

export const PLANET_LAYOUT_VERSION = 1;
const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; return h >>> 0; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const plan = (id, name, description, landform, anchors, links) => ({ id, name, description, landform, anchors: Object.fromEntries(['landing', 'workshop', 'clinic', 'common', 'keeper', 'square'].map((key, index) => [key, anchors[index]])), links });
export const PLANET_LAYOUTS = freeze([
  plan('river-town', 'River town', 'Two banks share a market crossing; farms and service yards follow the river instead of a square street grid.', 'river',
    [[22, 58], [30, 39], [43, 18], [77, 38], [78, 64], [44, 47]],
    [['landing', 'workshop'], ['workshop', 'square'], ['workshop', 'clinic'], ['square', 'common'], ['common', 'keeper'], ['keeper', 'square']]),
  plan('island-chain', 'Island causeways', 'Separate inhabited islands carry the landing, clinic and workshops. Narrow causeways cross the open water between them.', 'islands',
    [[17, 48], [38, 23], [78, 18], [81, 53], [53, 66], [53, 43]],
    [['landing', 'workshop'], ['workshop', 'clinic'], ['clinic', 'common'], ['common', 'keeper'], ['keeper', 'landing'], ['keeper', 'square']]),
  plan('coastal-harbor', 'Coastal harbor', 'A long quay links the shore district to separate landing and survey piers, with open water beside the approach.', 'coast',
    [[21, 54], [25, 27], [52, 18], [81, 28], [80, 60], [53, 39]],
    [['landing', 'workshop'], ['workshop', 'square'], ['square', 'clinic'], ['square', 'common'], ['common', 'keeper']]),
  plan('canyon-terraces', 'Canyon terraces', 'Shelters occupy separate rock shelves; stepped trails and short bridges cross the cuts between districts.', 'canyon',
    [[20, 19], [43, 22], [83, 28], [73, 58], [28, 64], [49, 45]],
    [['landing', 'workshop'], ['workshop', 'square'], ['square', 'clinic'], ['clinic', 'common'], ['common', 'keeper'], ['keeper', 'square']]),
  plan('oasis-courts', 'Oasis courtyards', 'Low buildings gather around a protected water court, with shaded paths leading out to scattered shelters.', 'oasis',
    [[19, 43], [37, 23], [72, 25], [75, 57], [35, 62], [53, 51]],
    [['landing', 'workshop'], ['workshop', 'clinic'], ['clinic', 'common'], ['common', 'keeper'], ['keeper', 'landing'], ['keeper', 'square'], ['square', 'common']]),
  plan('thermal-compound', 'Thermal compound', 'Insulated buildings share a heated inner route; ice cuts and exposed survey country lie outside the shelter line.', 'ice',
    [[54, 65], [28, 43], [80, 41], [52, 19], [18, 17], [53, 43]],
    [['landing', 'square'], ['square', 'workshop'], ['workshop', 'keeper'], ['keeper', 'common'], ['common', 'clinic'], ['clinic', 'square']]),
  plan('works-district', 'Works district', 'A freight avenue separates working yards from the residential quarter, with service buildings distributed along its branches.', 'industrial',
    [[18, 19], [45, 20], [82, 20], [81, 50], [44, 63], [46, 42]],
    [['landing', 'workshop'], ['workshop', 'clinic'], ['workshop', 'square'], ['square', 'common'], ['common', 'clinic'], ['square', 'keeper']]),
  plan('woodland-villages', 'Woodland villages', 'Small clearings hold separate neighborhoods; winding paths meet at a sheltered common rather than a central landing square.', 'woodland',
    [[82, 62], [73, 34], [41, 19], [26, 51], [17, 19], [52, 49]],
    [['landing', 'square'], ['square', 'workshop'], ['workshop', 'clinic'], ['clinic', 'keeper'], ['keeper', 'common'], ['common', 'square']]),
  plan('crater-rim', 'Crater rim', 'The landing and pressure shelters follow the rim of an old impact basin. Survey tracks descend into the broken inner country.', 'crater',
    [[23, 52], [26, 24], [60, 16], [84, 40], [75, 65], [51, 61]],
    [['landing', 'workshop'], ['workshop', 'clinic'], ['clinic', 'common'], ['common', 'keeper'], ['keeper', 'square'], ['square', 'landing']])
]);
const byId = new Map(PLANET_LAYOUTS.map(value => [value.id, value]));
const choices = {
  garden: ['river-town', 'woodland-villages'], prairie: ['river-town', 'woodland-villages', 'oasis-courts'], twilight: ['canyon-terraces', 'thermal-compound'],
  supercontinent: ['woodland-villages', 'river-town', 'canyon-terraces'], canopy: ['woodland-villages', 'river-town'], fungal: ['woodland-villages', 'island-chain'], mangrove: ['island-chain', 'river-town'],
  dune: ['oasis-courts', 'canyon-terraces'], salt: ['oasis-courts', 'crater-rim'], canyon: ['canyon-terraces', 'crater-rim'], obsidian: ['canyon-terraces', 'works-district'], lava: ['canyon-terraces', 'works-district'], ash: ['crater-rim', 'works-district'],
  glacier: ['thermal-compound', 'canyon-terraces'], tundra: ['thermal-compound', 'river-town'], 'frozen-sea': ['thermal-compound', 'coastal-harbor'],
  archipelago: ['island-chain', 'coastal-harbor'], reef: ['island-chain', 'coastal-harbor'], 'storm-ocean': ['coastal-harbor', 'island-chain'],
  forge: ['works-district', 'canyon-terraces'], ecumenopolis: ['works-district', 'coastal-harbor'], reclaimed: ['works-district', 'woodland-villages'],
  crater: ['crater-rim', 'canyon-terraces'], rust: ['crater-rim', 'canyon-terraces', 'oasis-courts'], crystal: ['crater-rim', 'canyon-terraces']
};

/** Cheap descriptive/planning API: no map generation, global RNG or input mutation. */
export function planetSettlementPlan(body = {}, seed = 'farwake') {
  if (body.id === 'morrow') return { id: 'morrow-landing', name: 'Morrow landing district', description: 'The established landing district opens onto orchards, a river crossing and the outer ridge paths.', version: 0 };
  if (isPreflightBody(body)) return { id: 'reedbound-village', name: 'River households', description: 'Reed houses, shared gardens and river paths belong to a culture that has not adopted spaceport services.', version: 0 };
  const type = planetTypeFor(body), key = `${seed}:${body.id || body.name || 'world'}:settlement-v${PLANET_LAYOUT_VERSION}`, h = hash(key);
  const pool = choices[type.id] || ['woodland-villages', 'river-town'], source = byId.get(pool[h % pool.length]);
  const orientation = (h >>> 5) % 4, reflected = !!((h >>> 8) % 2);
  const transform = ([x, y]) => {
    let u = (x + .5) / 108, v = (y + .5) / 80;
    if (reflected) u = 1 - u;
    for (let i = 0; i < orientation; i++) [u, v] = [1 - v, u];
    return { x: clamp(Math.floor(u * 108), 11, 96), y: clamp(Math.floor(v * 80), 10, 68) };
  };
  const anchors = Object.fromEntries(Object.entries(source.anchors).map(([name, p]) => {
    const n = hash(`${key}:${name}`), anchor = transform(p);
    return [name, { x: anchor.x + (n % 5) - 2, y: anchor.y + ((n >>> 7) % 5) - 2 }];
  }));
  const barren = (body.kind === 'moon' || body.kind === 'asteroid') && /barren|rock|dust/.test(String(body.biome));
  return { id: source.id, name: barren ? 'Uncrewed survey region' : source.name, description: barren ? 'An isolated landing beacon and field shelters follow the local rock formations. No settlement services operate here.' : source.description, version: PLANET_LAYOUT_VERSION, landform: source.landform, anchors, links: source.links.map(edge => [...edge]), orientation, reflected, phase: (h % 997) / 997 * Math.PI * 2, typeId: type.id, barren };
}

/** Return a terrain family in canonical plan space, before roads and buildings. */
export function settlementLandformAt(plan, x, y) {
  let u = (x + .5) / 108, v = (y + .5) / 80;
  for (let i = 0; i < plan.orientation; i++) [u, v] = [v, 1 - u];
  if (plan.reflected) u = 1 - u;
  const a = u * 108, b = v * 80, phase = plan.phase;
  switch (plan.landform) {
    case 'river': return Math.abs(a - (57 + Math.sin(b / 9 + phase) * 5)) < 3.2 ? 'water' : 'ground';
    case 'islands': {
      const centers = [[17, 48, 12, 12], [38, 23, 14, 13], [78, 18, 17, 11], [81, 53, 16, 14], [53, 66, 15, 10], [53, 43, 10, 9]];
      return centers.some(([cx, cy, rx, ry]) => ((a - cx) / rx) ** 2 + ((b - cy) / ry) ** 2 < 1 + .12 * Math.sin(a * .4 + b * .3 + phase)) ? 'ground' : 'water';
    }
    case 'coast': return b > 46 + Math.sin(a / 12 + phase) * 5 && Math.hypot((a - 21) / 1.3, b - 54) > 9 && Math.hypot((a - 80) / 1.3, b - 60) > 9 ? 'water' : 'ground';
    case 'canyon': return Math.abs(a - (58 + Math.sin(b / 11 + phase) * 9)) < 3.6 || b > 43 && Math.abs(b - (50 + Math.sin(a / 9 + phase) * 6)) < 2.5 ? 'water' : (Math.floor(a / 10) + Math.floor(b / 8)) % 4 === 0 ? 'rubble' : 'ground';
    case 'oasis': return ((a - 53) / 11) ** 2 + ((b - 35) / 7) ** 2 < 1 ? 'water' : 'ground';
    case 'ice': return Math.abs(b - (28 + Math.sin(a / 8 + phase) * 4)) < 1.6 || Math.abs(a - (89 + Math.sin(b / 9) * 4)) < 1.3 ? 'water' : 'ground';
    case 'industrial': return a % 17 < 12 && b % 15 < 10 ? (plan.typeId === 'reclaimed' ? 'rubble' : 'metal') : 'ground';
    case 'woodland': return Math.abs(b - (66 + Math.sin(a / 12 + phase) * 4)) < 2 ? 'water' : 'ground';
    case 'crater': { const r = Math.hypot((a - 54) / 1.35, b - 39); return r > 18 && r < 23 || Math.sin(a * .18 + b * .11 + phase) > .83 ? 'rubble' : 'ground'; }
    default: return 'ground';
  }
}
