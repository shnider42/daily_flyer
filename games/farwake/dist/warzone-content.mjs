/** Crosswind is additive authored space: released chart entries never move. */
import { decorateGalaxyTypes } from './world-types.mjs';
import { decorateStationGeography } from './station-geography.mjs';
export const CROSSWIND_SYSTEM_ID = 'crosswind';
export const CROSSWIND_BODY_IDS = Object.freeze({ vey: 'crosswind-vey', orsa: 'crosswind-orsa', lorn: 'crosswind-lorn', relief: 'crosswind-third-light' });
export const CROSSWIND_ARRIVAL = Object.freeze({ x: -1450, y: 1450 });
export const CROSSWIND_POSITION = Object.freeze({ gx: 4.2, gy: -.8 });
export const WARZONE_FACTION_STYLE = Object.freeze({
  freewake: Object.freeze({ name: 'Freewake Union', short: 'FREEWAKE', color: '#87b9a8', hull: '#a4b3ae', stripe: 'split', prefix: 'Union' }),
  meridian: Object.freeze({ name: 'Meridian Combine', short: 'MERIDIAN', color: '#c4ae80', hull: '#afa99a', stripe: 'bar', prefix: 'Combine' }),
  concord: Object.freeze({ name: 'Terran Continuity', short: 'CONTINUITY', color: '#8ea9c9', hull: '#a7adb7', stripe: 'bar', prefix: 'Continuity' }),
  lantern: Object.freeze({ name: 'Lantern Assembly', short: 'LANTERN', color: '#b0a1c6', hull: '#aaa6b2', stripe: 'split', prefix: 'Assembly' }),
  cinder: Object.freeze({ name: 'Cinder Clans', short: 'CINDER', color: '#c19a89', hull: '#b1a39b', stripe: 'bar', prefix: 'Clan' })
});

/** Territorial anchors are authored places, rather than scattered generated claims. */
export function nearestWarzoneFactions(galaxy = [], point = CROSSWIND_POSITION) {
  const closest = new Map();
  for (const system of galaxy) {
    if (!system?.authored || system.id === CROSSWIND_SYSTEM_ID || !WARZONE_FACTION_STYLE[system.faction] || !Number.isFinite(system.gx) || !Number.isFinite(system.gy)) continue;
    const distance = Math.hypot(system.gx - point.gx, system.gy - point.gy), previous = closest.get(system.faction);
    if (!previous || distance < previous.distance || distance === previous.distance && system.id.localeCompare(previous.systemId) < 0) closest.set(system.faction, { id: system.faction, systemId: system.id, distance });
  }
  return [...closest.values()].sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, 2);
}

export function appendWarzoneSystem(galaxy = [], seed = 'farwake') {
  if (galaxy.some(system => system.id === CROSSWIND_SYSTEM_ID)) return galaxy;
  const neighbours = nearestWarzoneFactions(galaxy), factions = neighbours.length === 2 ? neighbours.map(side => side.id) : ['freewake', 'meridian'];
  // Keep the published Union west / Combine east staging convention when the
  // two measured distances tie. Both are still the nearest distinct powers.
  factions.sort((a, b) => a === 'freewake' ? -1 : b === 'freewake' ? 1 : a.localeCompare(b));
  const [west, east] = factions, names = factions.map(id => WARZONE_FACTION_STYLE[id].name);
  const system = {
    id: CROSSWIND_SYSTEM_ID, name: 'Crosswind', ...CROSSWIND_POSITION, faction: west, biome: 'industrial', danger: 5, authored: true, index: galaxy.length,
    region: 'The Crosswind Front', systemTypeId: 'contested', warzoneId: CROSSWIND_SYSTEM_ID, warzoneFactions: factions,
    warzoneNeighbours: neighbours.map(({ id, systemId }) => ({ factionId: id, systemId })),
    description: `A full fleet war between the ${names[0]} and ${names[1]} blocks the supply lanes over Vey. Relief ships keep an outer approach open to Orsa. Reinforcements replace losses; a quiet front can erupt again without warning.`,
    bodies: [
      { id: CROSSWIND_BODY_IDS.vey, name: 'Vey', kind: 'planet', biome: 'industrial', planetTypeId: 'rust', faction: west, x: 100, y: -150, warzone: true, portServices: false,
        lore: 'The refinery continent is cut by three fighting corridors. Union and Combine infantry move through shattered rail yards while the south clinic tries to keep an evacuation path open. Its residents count working water taps before flags.' },
      { id: CROSSWIND_BODY_IDS.orsa, name: 'Orsa', kind: 'planet', biome: 'ice', planetTypeId: 'tundra', faction: west, x: -1220, y: 820,
        lore: 'Heated shelters on a cold world receive families evacuated from Vey. The relief port accepts both uniforms, with weapons secured. Every incoming passenger has a name; the departure board has no promise of a return date.' },
      { id: CROSSWIND_BODY_IDS.lorn, name: 'Lorn', kind: 'planet', biome: 'desert', planetTypeId: 'dune', faction: east, x: 1280, y: 540,
        lore: 'Fuel wells and buried freight vaults supply the eastern fleet. Civilian crews keep the pumps running between bombardment alerts. Empty tankers depart in convoys because a single loaded tender can change the next hour of battle.' },
      { id: CROSSWIND_BODY_IDS.relief, name: 'Third Light', kind: 'station', biome: 'station', stationTypeId: 'hospital-octagon', faction: west, x: -980, y: 680,
        lore: 'A relief berth close to Orsa, placed beside its evacuation approach rather than the firing line. Damaged ships and people from both sides pass through the same triage queue. Its traffic controller marks the safe exit to Hearth.' }
    ]
  };
  // Run metadata decorators only on the addition: released systems retain both
  // their object identity and every generated coordinate / random outcome.
  const [decorated] = decorateStationGeography(decorateGalaxyTypes([system], seed), seed);
  const relief = decorated.bodies.find(body => body.id === CROSSWIND_BODY_IDS.relief);
  relief.stationGeography = { ...relief.stationGeography, kind: 'orbital', purpose: 'planetary-relief',
    anchorBodyIds: [CROSSWIND_BODY_IDS.orsa], nearbyBodyIds: [CROSSWIND_BODY_IDS.orsa], servedBodyIds: [CROSSWIND_BODY_IDS.orsa],
    reason: 'A relief hospital on Orsa’s evacuation approach. Shuttles bring families and wounded crews here from the nearby shelters; incoming ships remain clear of Vey’s firing lanes.' };
  return [...galaxy, decorated];
}

export const isWarzoneSystem = value => (typeof value === 'string' ? value : value?.id) === CROSSWIND_SYSTEM_ID;
