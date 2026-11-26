/** Deliberately placed field caves; no existing story or entrance is replaced. */
import { planetSettlementPlan } from './planet-layout.mjs';
import { planetTypeFor } from './world-types.mjs';
import { settlementFootprints } from './settlement-footprints.mjs';
import { CAVERN_FAMILIES, CAVERN_LAYOUT_VERSION, createCavernLayout } from './cavern-layouts.mjs';
import { selectHabitatCreatures } from './creature-catalog.mjs';
const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; return h >>> 0; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
const reward = (credits = 0, ore = 0, crystal = 0, heal = 0) => ({ credits, ore, crystal, heal });
const sites = new Map();

// Each geological family has a permanent home in the compact galaxy. The
// survey routes and wildlife still vary with the galaxy seed, never the visit.
export const COMPACT_CAVERN_HOMES = Object.freeze({
  'alpha-centauri-shelf': 'glacial',
  'epsilon-eridani-forge': 'lava-tube',
  'epsilon-eridani-forest': 'root-grotto',
  'tau-ceti-tide': 'tidal',
  'tau-ceti-karst': 'limestone'
});

const descriptions = {
  limestone: { name: 'Skylight Karst', summary: 'Pale arches divide a dry cavern. Sun shafts reach the upper galleries.',
    note: 'Water cut these chambers before the surface dried. The round passages loop around older stone ribs; thin high cracks still admit daylight.',
    sample: 'Layered chalk outcrop', result: 'The dated chalk layers preserve a record of the old water table.' },
  'root-grotto': { name: 'Root Galleries', summary: 'Living roots divide a connected network of low galleries and side pockets.',
    note: 'The roots follow moisture, not the survey trail. Several apparent dead ends turn back around the same root knot. Fallen growth feeds the smaller cavern animals.',
    sample: 'Root-water sampler', result: 'The sampler records how the living canopy shares water with the buried galleries.' },
  tidal: { name: 'Tidal Shelves', summary: 'Rock islands and old footbridges cross clear pools beneath an open sea arch.',
    note: 'The low-tide route crosses dry shelves and raised grating. Water fills the channels between them. Both sides of the loop return to the entrance.',
    sample: 'High-water marker', result: 'The high-water marks establish a useful local tide record.' },
  glacial: { name: 'Blue-Ice Fractures', summary: 'Stepped ice galleries cross deep meltwater cuts and sheltered blue chambers.',
    note: 'Pressure opened these angular fractures over many winters. Crossings follow the solid shelves; blue water beneath the ice is too deep to walk through.',
    sample: 'Ice-layer recorder', result: 'The recorder dates the bands in the ice without damaging the supporting shelf.' },
  'lava-tube': { name: 'Basalt Flow Tubes', summary: 'Cooled passages curve around glowing vents and a broad basalt island.',
    note: 'The outer tube cooled first. Later flows left a warm inner chamber and two routes around it. The orange pools are separated from the walkable stone.',
    sample: 'Cooling-front gauge', result: 'The gauge preserves a record of the old flow and the vents still warming it.' }
};

export function cavernFamilyFor(body = {}, seed = 'farwake') {
  if (COMPACT_CAVERN_HOMES[body.id]) return COMPACT_CAVERN_HOMES[body.id];
  const type = planetTypeFor(body).id;
  if (['glacier', 'tundra', 'frozen-sea'].includes(type) || /ice|froz|snow/.test(String(body.biome))) return 'glacial';
  if (['archipelago', 'reef', 'storm-ocean'].includes(type) || body.biome === 'ocean') return 'tidal';
  if (['lava', 'obsidian', 'ash', 'forge'].includes(type) || /volcan|lava/.test(String(body.biome))) return 'lava-tube';
  if (['canopy', 'fungal', 'mangrove', 'garden'].includes(type) || body.biome === 'forest') return 'root-grotto';
  if (['prairie', 'supercontinent', 'twilight', 'reclaimed'].includes(type) && hash(`${seed}:${body.id}:cavern-family`) % 2) return 'root-grotto';
  return 'limestone';
}

/** Public materializer supports exhaustive geometry and shared-authority checks. */
export function materializeCavern(family, body = {}, seed = 'farwake', entrance = { tileX: 95, tileY: 69 }) {
  if (!CAVERN_FAMILIES.includes(family)) return null;
  const bodyId = String(body.id || 'world'), id = `cavern-${family}`, cavernSeed = `${seed}:${bodyId}:cavern-v${CAVERN_LAYOUT_VERSION}`;
  const p = createCavernLayout(family, cavernSeed), description = descriptions[family], disposition = hash(`${cavernSeed}:disposition`) % 5;
  const empty = disposition === 0, peaceful = disposition === 1, mixed = disposition === 2;
  // Most caves have daylight, luminous ice or vent glow. Darkness is an authored
  // environmental condition; it is deliberately independent of the population.
  const restricted = ['root-grotto', 'glacial'].includes(family) && hash(`${cavernSeed}:enclosure`) % 3 === 0;
  const visibility = restricted ? {
    mode: 'local', range: family === 'glacial' ? 280 : 250,
    reason: family === 'glacial' ? 'The survey lamps failed in this deep ice shaft. Your suit lamp shows the nearby shelves.' : 'Warm mist gathers below the closed root canopy. Your suit lamp shows the passages nearby.'
  } : { mode: 'clear', reason: family === 'limestone' ? 'Daylight reaches this cavern through high skylights.' : family === 'tidal' ? 'The open sea arch lights the dry shelves.' : family === 'glacial' ? 'Thin blue ice carries daylight into these galleries.' : family === 'lava-tube' ? 'Warm vent glow lights the cooled stone.' : 'Open canopy breaks and luminous growth light these galleries.' };
  const count = peaceful ? 2 : 2 + (hash(`${cavernSeed}:density`) % 2);
  let profiles = empty ? [] : selectHabitatCreatures(family, `${cavernSeed}:population`, { count, peaceful });
  if (mixed) {
    const quiet = selectHabitatCreatures(family, `${cavernSeed}:quiet-neighbour`, { count: 1, peaceful: true })[0];
    profiles = [quiet, ...selectHabitatCreatures(family, `${cavernSeed}:population`, { count: 15 }).filter(profile => profile.id !== quiet.id)].slice(0, count);
  }
  const hostiles = profiles.map((profile, index) => {
    const at = p.anchors.wildlife[index], hostile = !peaceful && !(mixed && index === 0);
    return { id: `wildlife-${index}`, name: profile.name, species: profile.id, combatProfile: profile.combatProfile, profile: profile.combatProfile,
      tileX: at.x, tileY: at.y, ...point(at.x, at.y), color: profile.color, factionId: `fauna:${profile.id}`,
      hostileToPlayer: hostile, hostileTo: [], hostile };
  });
  const ecology = profiles.length ? profiles.map(profile => `${profile.name}: ${profile.shortHint}`).join('\n') : 'The current survey finds no resident animals. Water, settling stone and the movement of air still make this place audible.';
  return freeze({ id, name: `${body.name || 'Field'} · ${description.name}`, bodyId, key: `${bodyId}:site:${id}`, ...entrance,
    entrance: point(entrance.tileX, entrance.tileY), cols: p.cols, rows: p.rows, kind: 'cave', expedition: true, cavern: true,
    cavernFamily: family, cavernSeed, cavernVersion: CAVERN_LAYOUT_VERSION, layout: `cavern-${family}`, archetypeId: `cavern-${family}`,
    outdoors: false, terrainBiome: p.biome, atmosphere: 'cave', genre: 'field-survey', hostile: !empty && !peaceful, empty, visibility,
    summary: description.summary, briefing: `${visibility.reason} The entry remains open. Read the survey marker and field notes, then record the marked formation.`,
    story: `${description.note}\n\n${visibility.reason}`, objective: 'Read the survey marker and field notes. Record the marked formation; the exit stays open.', completionChoiceId: 'survey-complete',
    records: [
      { id: 'survey', name: 'Cavern survey marker', ...p.anchors.survey, text: description.note },
      { id: 'ecology', name: 'Local field notes', ...p.anchors.ecology, text: `${visibility.reason}\n\n${ecology}` }
    ],
    choices: [{ id: 'survey-complete', name: description.sample, ...p.anchors.sample, requireRecords: ['survey', 'ecology'],
      text: 'The field recorder can preserve this formation for the local survey. Taking a reading leaves the routes open.',
      options: [{ id: 'record', label: 'Record the formation', reward: reward(75, 1, 1), text: description.result,
        effects: { aftermath: 'The local survey now has a dated record of these passages. The exit and both return routes remain available.' } }] }],
    caches: [{ id: 'survey-kit', name: 'Sealed survey dressings', x: p.nodes[1].x + 2, y: p.nodes[1].y,
      reward: reward(0, 0, 0, 30), text: 'The remaining field dressings restore up to 30 health. The empty case stays beside the marker.' }],
    residents: [], hostiles, monsterCount: hostiles.length });
}

function freeEntrance(body, seed, existingSites) {
  const plan = planetSettlementPlan(body, seed);
  if (!plan.anchors) return null;
  const { reserved } = settlementFootprints(plan, existingSites);
  const candidates = [];
  // Sample only outside established footprints, after the original fit has
  // settled. This new entrance cannot push a saved workshop or landing aside.
  for (let y = 8; y <= 72; y += 4) for (let x = 8; x <= 100; x += 4) {
    if (reserved.some(q => Math.abs(q.x - x) < q.w / 2 + 7 && Math.abs(q.y - y) < q.h / 2 + 7)) continue;
    const order = hash(`${seed}:${body.id}:cavern-entrance:${x}:${y}`);
    candidates.push({ tileX: x, tileY: y, order });
  }
  candidates.sort((a, b) => a.order - b.order || a.tileY - b.tileY || a.tileX - b.tileX);
  if (!candidates.length) return null;
  return { tileX: candidates[0].tileX, tileY: candidates[0].tileY };
}

export function cavernSites(body = {}, seed = 'farwake', existingSites = []) {
  if (!['planet', 'moon', 'asteroid'].includes(body.kind) || body.landable === false || body.military || body.portType === 'military' || body.techLevel === 'preflight') return [];
  // Existing named worlds keep their space. Compact hosts do not depend on a
  // rarity roll; the procedural path remains available to standalone fixtures.
  if (!COMPACT_CAVERN_HOMES[body.id]) {
    if (!/^(?:(?:world|moon)-\d+|frontier-[a-z0-9_]+-(?:world|moon))$/.test(String(body.id))) return [];
    if (hash(`${seed}:${body.id}:cavern-distribution-v1`) % 6 !== 0) return [];
  }
  const key = JSON.stringify([String(seed), body.id, body.name, body.kind, body.biome, planetTypeFor(body).id,
    existingSites.map(site => [site.id, site.tileX, site.tileY])]);
  if (sites.has(key)) return sites.get(key);
  const entrance = freeEntrance(body, seed, existingSites);
  const result = freeze(entrance ? [materializeCavern(cavernFamilyFor(body, seed), body, seed, entrance)] : []);
  sites.set(key, result); while (sites.size > 192) sites.delete(sites.keys().next().value);
  return result;
}
