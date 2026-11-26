/** The complete playable chart. Every system has a deliberate destination role. */
import { NAMED_SYSTEMS } from './content.mjs';
import { FRONTIER_SYSTEMS } from './galaxy-expansion.mjs';
import { appendNeonSystem } from './neon-content.mjs';
import { appendFactionPorts } from './port-content.mjs';
import { appendWarzoneSystem } from './warzone-content.mjs';
import { decorateGalaxyTypes } from './world-types.mjs';
import { decorateStationGeography } from './station-geography.mjs';
import { decorateRingHabitats } from './ring-habitats.mjs';
import { applySystemIdentity } from './system-identity.mjs';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const COMPACT_SYSTEM_COUNT = 26;

// Chart positions describe playable fold routes, not measured stellar distances.
// Only the broad stellar identities are astronomical. All of the worlds,
// settlements and political arrangements below are fictional Farwake settings.
// Alpha Centauri: https://www.nasa.gov/image-article/alpha-centauri-triple-star-system-about-4-light-years-from-earth/
// Sirius: https://science.nasa.gov/asset/hubble/an-artists-impression-of-sirius-a-and-sirius-b/
// Epsilon Eridani (K2V), Tau Ceti (G8V): https://chara.gsu.edu/files/papers/Paper14.pdf
export const REAL_STAR_SYSTEMS = freeze([
  {
    id: 'alpha-centauri', name: 'Alpha Centauri', gx: -9, gy: -8,
    faction: 'freewake', biome: 'temperate', danger: 2, encounterRegion: 'settled',
    region: 'The Centauri Settlements', systemTypeId: 'binary', realStarSystem: true,
    stellarProfile: { colors: ['#f1dcad', '#e7b77b'], companions: 1, scale: 1 },
    description: 'Alpha Centauri A and B share the sky, with the red dwarf Proxima farther away. Passenger ferries connect the broad settled continent of Haven with the ice moon Shelf. Supply ships and long-haul crews meet at Centauri Exchange.',
    bodies: [
      { id: 'alpha-centauri-port', name: 'Centauri Exchange', kind: 'station', biome: 'station', stationTypeId: 'hive-habitat', portType: 'hub', x: 90, y: 100,
        lore: 'A busy passenger port serves Haven and Shelf. Families live above the freight decks, while ferry crews and maintenance workers share the public arrival hall.' },
      { id: 'alpha-centauri-haven', name: 'Haven', kind: 'planet', biome: 'temperate', planetTypeId: 'supercontinent', sizeClass: 'supermassive', portType: 'regional', x: 350, y: 100,
        lore: 'One vast continent holds farms, old settlements and long overland routes. The landing town supplies survey crews heading into the interior, and its café stays open for the last ferry.' },
      { id: 'alpha-centauri-shelf', name: 'Shelf', kind: 'moon', biome: 'ice', planetTypeId: 'glacier', portType: 'outpost', x: -900, y: 620,
        lore: 'Survey teams work beneath a moving ice shelf. Heated paths join the landing field to their shelters; the glacier caves need fresh markers after every thaw.' }
    ]
  },
  {
    id: 'epsilon-eridani', name: 'Epsilon Eridani', gx: 1, gy: 4,
    faction: 'meridian', biome: 'industrial', danger: 3, encounterRegion: 'frontier',
    region: 'The Eridani Works', systemTypeId: 'mineral-belt', realStarSystem: true,
    stellarProfile: { colors: ['#e8ad72'], companions: 0, scale: .85 },
    description: 'An orange star lights the mining routes around Forge and Bough. Forge supplies ore and geothermal power; Bough supports fungal forests and field laboratories. Eridani Yard repairs the working ships and keeps both settlements supplied.',
    bodies: [
      { id: 'epsilon-eridani-yard', name: 'Eridani Yard', kind: 'station', biome: 'station', stationTypeId: 'refinery-cross', portType: 'industrial', x: 250, y: 180,
        lore: 'Mining crews bring ore to the refinery arms and damaged equipment to the central workshop. Survey teams from Bough use the same freight counter for their field supplies.' },
      { id: 'epsilon-eridani-forge', name: 'Forge', kind: 'moon', biome: 'volcanic', planetTypeId: 'lava', portType: 'industrial', x: 520, y: 180,
        lore: 'Geothermal plants and small mines stand on cooled ground between active lava channels. Crews inspect the old lava tubes before opening new extraction routes.' },
      { id: 'epsilon-eridani-forest', name: 'Bough', kind: 'planet', biome: 'forest', planetTypeId: 'fungal', portType: 'research', x: -540, y: -500,
        lore: 'Tall fungal growths shelter a small research settlement. Field teams follow marked paths through the forest and use the root caverns to study how its living layers connect.' }
    ]
  },
  {
    id: 'tau-ceti', name: 'Tau Ceti', gx: -15, gy: 4,
    faction: 'lantern', biome: 'ocean', danger: 1, encounterRegion: 'settled',
    region: 'The Ceti Survey', systemTypeId: 'research', realStarSystem: true,
    stellarProfile: { colors: ['#ead6a0'], companions: 0, scale: .9 },
    description: 'A Sun-like star lights the island seas of Tidemark and the dry limestone canyons of Whitecliff. Small settlements support marine and geological surveys. The detached survey station handles samples, repairs field instruments and keeps visiting crews supplied.',
    bodies: [
      { id: 'tau-ceti-observatory', name: 'Ceti Survey Station', kind: 'station', biome: 'station', stationTypeId: 'survey-sphere', portType: 'research', x: -1500, y: 1400,
        lore: 'The station stands clear of the busy planetary approaches so its instruments can work without local interference. Sample couriers and repair crews make the regular crossing to the inhabited worlds.' },
      { id: 'tau-ceti-tide', name: 'Tidemark', kind: 'planet', biome: 'ocean', planetTypeId: 'archipelago', portType: 'regional', x: 360, y: 220,
        lore: 'Ferries connect small island towns above a broad tidal shelf. Pump crews and marine researchers share the shore paths; the sea caves can be entered when the local tide markers show a safe approach.' },
      { id: 'tau-ceti-karst', name: 'Whitecliff', kind: 'planet', biome: 'desert', planetTypeId: 'canyon', sizeClass: 'dwarf', portType: 'outpost', x: -850, y: -420,
        lore: 'Limestone canyons shelter a small field settlement. Surveyors map the cave water beneath the dry ground, and the local watch maintains the route between their shelters.' }
    ]
  },
  {
    id: 'sirius', name: 'Sirius', gx: 12, gy: -5,
    faction: 'cinder', biome: 'volcanic', danger: 3, encounterRegion: 'frontier',
    region: 'The Sirius Transfer', systemTypeId: 'crossroads', realStarSystem: true,
    stellarProfile: { colors: ['#c8e0f4', '#edf5fa'], companions: 1, scale: 1.15 },
    description: 'The bright blue-white Sirius A has a small white-dwarf companion, Sirius B. Ashbank and Prism supply the ships studying the pair. Their transfer port also handles passengers, repairs and stores for crews heading into the outer lanes.',
    bodies: [
      { id: 'sirius-port', name: 'Sirius Transfer', kind: 'station', biome: 'station', stationTypeId: 'transit-hub', portType: 'hub', x: 180, y: -120,
        lore: 'Passengers change ships beside the survey supply counters. Long-haul crews can arrange repairs, replenish their stores or take a local ferry to Ashbank while they wait for departure.' },
      { id: 'sirius-ash', name: 'Ashbank', kind: 'planet', biome: 'volcanic', planetTypeId: 'ash', portType: 'regional', x: 420, y: -120,
        lore: 'Ash drifts cover the abandoned landing pads outside town. The inhabited quarter keeps its air filters working, and visiting repair crews rent rooms near the current ferry field.' },
      { id: 'sirius-crystal', name: 'Prism', kind: 'moon', biome: 'ice', planetTypeId: 'crystal', portType: 'outpost', x: -620, y: 560,
        lore: 'Mineral spires rise through the ice around a heated survey settlement. The residents maintain the landing beacon, the sample stores and a small public meeting house.' }
    ]
  }
].map(system => ({
  ...system,
  bodies: system.bodies.map(body => ({ ...body, systemId: system.id, systemName: system.name, faction: body.faction || system.faction }))
})));

/** Build only these 26 systems; local variation still uses the galaxy seed. */
export function buildCompactGalaxy(seed = 'farwake') {
  const original = [...NAMED_SYSTEMS, ...FRONTIER_SYSTEMS].map((source, index) => ({
    ...structuredClone(source), authored: true, index,
    ...(FRONTIER_SYSTEMS.includes(source) ? { frontier: true } : {})
  }));
  const established = appendFactionPorts(appendNeonSystem(original));
  const decorated = decorateStationGeography(decorateGalaxyTypes(established, seed), seed);
  const withCrosswind = appendWarzoneSystem(decorated, seed);
  const additions = REAL_STAR_SYSTEMS.map((source, index) => ({
    ...structuredClone(source), authored: true, index: withCrosswind.length + index
  }));
  return decorateRingHabitats([...withCrosswind, ...decorateStationGeography(decorateGalaxyTypes(additions, seed), seed)]).map(applySystemIdentity);
}
