/** Relay Nine's settled power circuits; no actor, reward, or save mutations. */
const TILE_SIZE = 24;
const list = value => Array.isArray(value) ? value : [];
const owns = (object, key) => Object.hasOwn(object || {}, key);
const accepted = (actual, expected) => expected === true ? !!actual : Array.isArray(expected) ? expected.includes(actual) : actual === expected;
const zone = (id, section, x, y, w, h) => Object.freeze({ id, section, x: x * TILE_SIZE, y: y * TILE_SIZE, w: w * TILE_SIZE, h: h * TILE_SIZE });

export const QUIET_EARTH_DARK_RANGE = 230;
export const QUIET_EARTH_LIT_RANGE = 650;
/** World-space rectangles match the released main halls, not their labels. */
export const QUIET_EARTH_LIGHT_ZONES = Object.freeze([
  zone('intake', 'intake', 3, 66, 21, 15),
  zone('lower-hall', 'intake', 21, 70, 102, 7),
  zone('east-turn', 'middle', 116, 43, 7, 34),
  zone('breaker', 'middle', 108, 53, 16, 14),
  zone('middle-hall', 'middle', 7, 43, 116, 7),
  zone('west-turn', 'upper', 7, 17, 7, 33),
  zone('shift-room', 'upper', 4, 29, 20, 13),
  zone('upper-hall', 'upper', 7, 17, 115, 7),
  zone('receiver', 'upper', 107, 6, 18, 27)
]);

export function isQuietEarthSurface(surface) {
  return !!surface && (surface.id === 'morrow:site:relay-nine' || surface.key === 'morrow:site:relay-nine' ||
    (surface.parentId === 'morrow' || surface.bodyId === 'morrow') && (surface.siteId === 'relay-nine' || surface.id === 'relay-nine'));
}

const fallbackChoices = [
  { id: 'check-in', options: [{ id: 'begin' }] },
  { id: 'intake-lights', requireChoices: { 'check-in': 'begin' }, options: [{ id: 'restore' }] },
  { id: 'breaker', requireChoices: { 'check-in': 'begin' }, requireRecords: ['voices'], options: [{ id: 'restore' }] },
  { id: 'upper-lights', requireChoices: { breaker: 'restore' }, requireRecords: ['service'], options: [{ id: 'restore' }] },
  { id: 'receiver', requireChoices: { breaker: 'restore' }, requireRecords: ['service'], options: [{ id: 'copy' }] }
];
const states = new Map();
for (const key of ['000', '100', '110', '111']) {
  const powered = Object.freeze({ intake: key[0] === '1', middle: key[1] === '1', upper: key[2] === '1' });
  states.set(key, Object.freeze({ key, powered,
    completedChoices: Object.freeze([powered.intake && 'intake-lights', powered.middle && 'breaker', powered.upper && 'upper-lights'].filter(Boolean)),
    zones: Object.freeze(QUIET_EARTH_LIGHT_ZONES.filter(item => powered[item.section])) }));
}

const siteStates = new WeakMap();
function statesFor(site) {
  if (!site?.corridorPlan) return states;
  if (!siteStates.has(site)) {
    const zones = [...QUIET_EARTH_LIGHT_ZONES, ...site.corridorPlan.wings.map(wing => wing.lightZone)];
    siteStates.set(site, new Map([...states].map(([key, state]) => [key, Object.freeze({ ...state,
      zones: Object.freeze(zones.filter(item => state.powered[item.section])) })])));
  }
  return siteStates.get(site);
}

/**
 * A later saved choice only restores power when its preceding authored evidence
 * is valid. The existing main feed backfeeds intake; copying the receiver also
 * connects its emergency feed, preserving progress from before local switches.
 */
export function quietEarthLightState(state, site = null) {
  if (!state || site && (site.quietEarth !== true || site.id !== 'relay-nine')) return states.get('000');
  const read = new Set(list(state.story?.readRecords)), choices = {};
  for (const choice of site ? list(site.choices) : fallbackChoices) {
    const value = state.choices?.[choice.id], option = list(choice.options).find(item => item.id === value);
    if (!option || list(choice.requireRecords).some(id => !read.has(id)) || list(option.requireRecords).some(id => !read.has(id))) continue;
    if ([choice.requireChoices, option.requireChoices].some(required => Object.entries(required || {}).some(([id, expected]) =>
      !owns(choices, id) || !accepted(choices[id], expected)))) continue;
    choices[choice.id] = value;
  }
  const started = choices['check-in'] === 'begin';
  const middle = started && read.has('voices') && choices.breaker === 'restore';
  const intake = started && choices['intake-lights'] === 'restore' || middle;
  const upper = middle && read.has('service') && (choices['upper-lights'] === 'restore' || choices.receiver === 'copy');
  return statesFor(site).get(`${intake ? 1 : 0}${middle ? 1 : 0}${upper ? 1 : 0}`);
}

const sourceLayouts = new WeakMap(), layoutViews = new WeakMap(), surfaceViews = new WeakMap();
/** Geometry identity is stable across power changes; fog memory is per captain. */
export const quietEarthLightingSource = layout => sourceLayouts.get(layout) || layout;

/** Project one immutable visibility policy for rendering, weapon authority and music. */
export function projectQuietEarthLighting(surface, state) {
  if (!isQuietEarthSurface(surface) || !surface.combatLayout?.walkable) return surface;
  const lighting = quietEarthLightState(state, surface.site);
  if (surface.quietEarthLighting === lighting && surface.combatLayout.siteLighting?.key === lighting.key) return surface;
  let views = surfaceViews.get(surface);
  if (!views) { views = new Map(); surfaceViews.set(surface, views); }
  if (views.has(lighting.key)) return views.get(lighting.key);
  const source = quietEarthLightingSource(surface.combatLayout);
  let layouts = layoutViews.get(source);
  if (!layouts) { layouts = new Map(); layoutViews.set(source, layouts); }
  if (!layouts.has(lighting.key)) {
    const layout = { ...source, siteLighting: Object.freeze({ ...lighting, kind: 'relay-nine', darkRange: QUIET_EARTH_DARK_RANGE, litRange: QUIET_EARTH_LIT_RANGE }) };
    sourceLayouts.set(layout, source); layouts.set(lighting.key, layout);
  }
  const view = { ...surface, quietEarthLighting: lighting, combatLayout: layouts.get(lighting.key) };
  views.set(lighting.key, view);
  return view;
}
