/** The first Quiet Earth field mission. Authored coordinates are tiles unless noted. */
const TILE_SIZE = 24;
const point = (x, y) => ({ x: (x + .5) * TILE_SIZE, y: (y + .5) * TILE_SIZE });
const reward = (credits = 0, ore = 0, crystal = 0, heal = 0) => ({ credits, ore, crystal, heal });
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const QUIET_EARTH_SITE_ID = 'relay-nine';
export const isQuietEarth = site => site?.quietEarth === true && site.id === QUIET_EARTH_SITE_ID;

/** Proximity cues are harmless, once-only events; the authority owns their timing. */
export const QUIET_EARTH_BEATS = freeze([
  {
    id: 'pressure-vent', ...point(43, 73), radius: 80, sfx: 'bulkhead',
    text: ''
  },
  {
    id: 'service-cart', ...point(61, 46), radius: 84, sfx: 'bulkhead',
    text: ''
  }
]);

const dormant = (id, name, species, combatProfile, x, y) => ({
  id, name, species, combatProfile, profile: combatProfile, tileX: x, tileY: y, ...point(x, y),
  quietEarthDormant: true, hostileToPlayer: false, hostileTo: [], factionId: 'quiet-earth-contact',
  hidden: true, concealed: true, revealed: false
});

const site = freeze({
  id: QUIET_EARTH_SITE_ID,
  name: 'Relay Nine · The Silent Mile',
  bodyId: 'morrow', key: 'morrow:site:relay-nine', tileX: 68, tileY: 69, entrance: point(68, 69),
  cols: 128, rows: 84, kind: 'vault', expedition: true, quietEarth: true,
  archetypeId: 'quiet-earth-silent-mile', layout: 'quiet-earth-corridor', outdoors: false,
  terrainBiome: 'shelter', atmosphere: 'quiet-earth', hostile: false, empty: false,
  summary: 'Quiet Earth · Opening mission. Follow a fresh Earth signal through Relay Nine’s silent service halls.',
  briefing: 'Check in beside the entrance. Follow the single marked route, restore the breaker, and copy the far receiver. Green floor lights always lead back outside. You can leave at any time.',
  objective: 'Use the check-in terminal beside the entrance. Green lights mark your way back.',
  story: 'Relay Nine has received a fresh Earth return address. Its intake desk answers, but the operator does not. The receiver is at the far end of three long service halls. The outside door remains available.',
  completionChoiceId: 'evacuate',
  records: [
    {
      id: 'voices', name: 'Relay fault transcript', x: 70, y: 73,
      objective: 'Walk east along Service Hall 01. Read the fault transcript at the gold marker.',
      text: 'FAULT 09: callers hear their own arrival message before transmitting it. Six replacement clocks made no difference. The breaker at the far end supplies the next hall.'
    },
    {
      id: 'service', name: 'Service strip · Receiver route', x: 49, y: 46,
      objective: 'Turn west into Service Hall 02. Read the service strip at the gold marker.',
      requireChoices: { breaker: 'restore' },
      text: 'RECEIVER: continue to the west turn, then follow the upper hall east. Local recordings remain available while the return line is down. GREEN LIGHTS: return to intake.'
    }
  ],
  choices: [
    {
      id: 'check-in', name: 'Intake check-in', x: 13, y: 73,
      text: 'The desk shows no operator on shift. Record your entry so the landing team knows where you went.',
      objective: 'Check in at the intake desk beside the entrance.',
      options: [{
        id: 'begin', label: 'Check in and follow the receiver route', reward: reward(),
        text: 'Entry recorded. Follow the lower hall east. Read the fault transcript, then restore the breaker at the far turn.'
      }]
    },
    {
      id: 'breaker', name: 'Far-hall breaker', x: 118, y: 55,
      requireChoices: { 'check-in': 'begin' }, requireRecords: ['voices'],
      text: 'The next hall is on reserve power. The breaker can restore its receiver line without closing the way back.',
      objective: 'At the far eastern turn, use the orange breaker console to restore receiver power.',
      options: [{
        id: 'restore', label: 'Restore receiver power', reward: reward(),
        text: 'The receiver line is live. Turn west into the middle hall, read the service strip, and continue around the far bend.'
      }]
    },
    {
      id: 'receiver', name: 'Deep receiver · Local buffer', x: 119, y: 12,
      requireChoices: { breaker: 'restore' }, requireRecords: ['service'],
      text: 'A fresh Earth address appears above a local recording. The local buffer is ready to copy.',
      objective: 'At the west end, turn north. Follow Service Hall 03 east to the deep receiver.',
      options: [{
        id: 'copy', label: 'Copy the local recording', reward: reward(),
        text: 'GET BACK TO THE ENTRY. Follow the green floor lights and seal the inner door.'
      }]
    },
    {
      id: 'evacuate', name: 'Intake emergency seal', x: 8, y: 73,
      requireChoices: { receiver: 'copy' },
      text: 'The emergency seal is beside the outside door. You only need the recording and a clear way out. You do not need to kill everything behind you.',
      objective: 'GET OUT. Follow the green lights back to intake. Use the emergency seal beside the exit.',
      options: [{
        id: 'seal', label: 'Seal the inner door and send the recording', reward: reward(200),
        text: 'The inner door locks. The landing team receives the recording and your return signal. You are paid 200 cr. Step through the nearby exit to return to Morrow.',
        effects: { aftermath: 'You returned from the Silent Mile with the recording. The outside door is beside the intake seal. The signal’s source is still unknown.' }
      }]
    }
  ],
  caches: [
    {
      id: 'entry-dressings', name: 'Intake emergency dressings', x: 18, y: 69,
      reward: reward(0, 0, 0, 45),
      text: 'Sealed dressings restore up to 45 health. The empty packet stays in the intake bin.'
    },
    {
      // Preserve the released claim ID and payment so old saves cannot receive it twice.
      id: 'signal-buffer', name: 'Recoverable signal buffer', x: 18, y: 77,
      requireChoices: { evacuate: 'seal' }, reward: reward(80, 0, 1),
      text: 'The intake rack holds a spool of public navigation records. The exchange pays for the intact copies.'
    }
  ],
  residents: [],
  hostiles: [
    dormant('receiver-shadow', 'Receiver shadow', 'glassmaw', 'pack-stalker', 112, 10),
    dormant('return-echo', 'Return echo', 'shardling', 'fast-melee', 121, 17),
    dormant('service-crawler', 'Service crawler', 'glassmaw', 'pack-stalker', 117, 27),
    dormant('unlisted-contact', 'Unlisted contact', 'shardling', 'fast-melee', 111, 28)
  ],
  monsterCount: 4
});

export function quietEarthSites(body = {}) {
  if (typeof body === 'string') body = { id: body };
  return body?.id === 'morrow' && (body.kind == null || body.kind === 'planet') ? [site] : [];
}

/** Geometry stays fixed through the ambush; no hidden teleport or new escape wall. */
export function buildQuietEarthInterior(m, site, { rect, prop, label, point, TILE }) {
  m.expedition = true; m.quietEarth = true; m.expeditionLayout = site.layout;
  m.outdoors = false; m.biome = 'shelter'; m.terrain = 'factory'; m.atmosphere = 'quiet-earth';
  m.palette = { ground: '#1b2b30', floor: '#28373d', floor2: '#26343b', wall: '#17262f', wallTop: '#526b70', edge: '#557174', path: '#41645a', light: '#c5d7b6', water: '#173641', accent: '#93c3af' };
  rect(m, 0, 0, m.cols, m.rows, TILE.WALL);

  // These separated halls connect only at alternating ends. The return route is the same physical route.
  rect(m, 3, 66, 21, 15, TILE.FLOOR);                  // Intake / safe outside threshold.
  rect(m, 21, 70, 102, 7, TILE.FLOOR);                 // Hall one: eastbound.
  rect(m, 116, 43, 7, 34, TILE.FLOOR);                 // Far eastern turn.
  rect(m, 108, 53, 16, 14, TILE.FLOOR);                // Breaker room.
  rect(m, 7, 43, 116, 7, TILE.FLOOR);                  // Hall two: westbound.
  rect(m, 7, 17, 7, 33, TILE.FLOOR);                   // Western turn.
  rect(m, 4, 29, 20, 13, TILE.FLOOR);                  // Empty shift room.
  rect(m, 7, 17, 115, 7, TILE.FLOOR);                  // Hall three: eastbound.
  rect(m, 107, 6, 18, 27, TILE.FLOOR);                 // Receiver room.

  rect(m, 23, 73, 94, 1, TILE.GRATE);
  rect(m, 119, 47, 1, 26, TILE.GRATE);
  rect(m, 10, 46, 110, 1, TILE.GRATE);
  rect(m, 10, 20, 1, 27, TILE.GRATE);
  rect(m, 10, 20, 108, 1, TILE.GRATE);
  m.spawn = point(6, 73); m.exit = point(4, 73);
  m.musicCorridors = [{ x: 3 * TILE_SIZE, y: 6 * TILE_SIZE, w: 122 * TILE_SIZE, h: 75 * TILE_SIZE }];
  m.storyZones = [
    { id: 'intake', name: 'Intake · Outside door', x: 3, y: 66, w: 21, h: 15 },
    { id: 'lower-hall', name: 'Service hall 01', x: 24, y: 70, w: 99, h: 7 },
    { id: 'breaker', name: 'Far-hall breaker', x: 108, y: 53, w: 16, h: 14 },
    { id: 'middle-hall', name: 'Service hall 02', x: 7, y: 43, w: 116, h: 7 },
    { id: 'shift-room', name: 'Empty shift room', x: 4, y: 29, w: 20, h: 13 },
    { id: 'upper-hall', name: 'Service hall 03', x: 14, y: 17, w: 93, h: 7 },
    { id: 'receiver', name: 'Deep receiver', x: 107, y: 6, w: 18, h: 27 }
  ];

  const green = '#a0d5ad', steel = '#607b80', amber = '#d1b67f';
  const decor = (kind, x, y, w = 1, h = 1, color = steel, solid = false) => prop(m, kind, x, y, w, h, color, solid);
  const returnLight = (x, y, direction) => {
    decor('light', x, y, 2, .25, green);
    label(m, direction, x + .15, y + .35, green);
  };
  for (const x of [27, 39, 51, 63, 75, 87, 99, 111]) returnLight(x, 75, '←');
  for (const y of [49, 61, 70]) returnLight(120, y, '↓');
  for (const x of [18, 30, 42, 54, 66, 78, 90, 102]) returnLight(x, 48, '→');
  for (const y of [23, 31, 39]) returnLight(11, y, '↓');
  for (const x of [20, 32, 44, 56, 68, 80, 92, 104]) returnLight(x, 22, '←');
  returnLight(112, 12, '↓'); returnLight(111, 19, '←');

  // Static equipment and abandoned domestic details carry the scene between the few authored sounds.
  decor('airlock', 3, 71, 1, 5, green);
  decor('console', 11, 67, 5, 1, '#91b2a6', true);
  decor('bench', 7, 78, 6, 1, '#7f8c82', true);
  decor('coat', 21, 67, 1, 1, '#a69c80');
  decor('boots', 20, 78, 1, 1, '#8e8272');
  decor('cabinet', 20, 70, 2, 3, '#70877e', true);
  label(m, 'OUTSIDE ←', 4, 69, green); label(m, 'INTAKE / CHECK IN', 10, 66, '#c3d5cc');
  label(m, 'GREEN = RETURN', 7, 80, green);

  for (const x of [30, 54, 78, 102]) {
    decor('pipe', x, 70, .5, 2, '#6e8079');
    decor('light', x + 4, 69, 5, .25, '#829a91');
    decor('doorframe', x + 10, 70, 1, 7, '#475d62');
  }
  // The vent grille and service cart are drawn by the scene presenter, so they can move.
  decor('pipe', 40.5, 70, .5, 2, '#6b8782');
  decor('debris', 45, 71, 2, 1, '#b9ad90');
  decor('bench', 67, 70, 5, 1, '#7e8c85', true);
  label(m, 'SERVICE 01 →', 25, 70, '#9eafb0'); label(m, 'NO OPERATOR ON SHIFT', 79, 70, '#9eafb0');

  decor('engine', 110, 58, 2, 6, '#71817b', true);
  decor('pipe', 112, 55, .5, 9, '#899181');
  decor('console', 118, 53, 4, 1, amber, true);
  decor('cargo', 110, 54, 3, 2, '#748079', true);
  label(m, 'RECEIVER BREAKER', 111, 52, amber); label(m, 'NEXT HALL ↑', 116, 50, '#b1c0b5');

  for (const x of [25, 49, 73, 97]) {
    decor('window', x, 42, 7, 1, '#54747b');
    decor('light', x + 10, 42, 4, .25, '#83978e');
    decor('pipe', x + 15, 43, .5, 2, '#647975');
  }
  decor('cabinet', 57, 43, 1, 1, '#6d857d', true);
  decor('boots', 64, 44, 1, 1, '#8e8272');
  label(m, '← SERVICE 02', 105, 43, '#9eafb0');

  decor('table', 17, 31, 5, 2, '#827c6c', true);
  decor('bench', 17, 35, 5, 1, '#827c6c', true);
  decor('coat', 20, 38, 1, 1, '#a69c80');
  decor('boots', 19, 39, 1, 1, '#8e8272');
  decor('cabinet', 5, 30, 1, 4, '#657d75', true);
  decor('light', 17, 29, 5, .25, '#899486');
  label(m, 'SHIFT ENDS 06:00', 16, 29, '#b7b6a1');
  label(m, 'RECEIVER ↑ THEN →', 5, 25, '#b1c0b5');

  for (const x of [25, 49, 73, 97]) {
    decor('pipe', x, 17, .5, 2, '#6e8079');
    decor('light', x + 10, 16, 5, .25, '#708c87');
    decor('doorframe', x + 17, 17, 1, 7, '#40575d');
  }
  decor('debris', 87, 18, 2, 1, '#a99b88');
  decor('debris', 100, 17, 2, 1, '#8e8270');
  label(m, 'SERVICE 03 →', 17, 17, '#9eafb0'); label(m, 'LOCAL RECORDINGS', 89, 16, '#b8b3a0');

  decor('window', 109, 5, 12, 1, '#527578');
  decor('console', 114, 7, 9, 1, '#89aaa3', true);
  decor('equipment', 123, 11, 1, 4, '#708983', true);
  decor('antenna', 109, 7, 1, 2, '#90a39b');
  decor('cabinet', 108, 24, 1, 4, '#617f78', true);
  decor('debris', 121, 29, 2, 1, '#9c9683');
  label(m, 'EARTH / RETURN ADDRESS', 109, 6, '#bfd0bd');
  label(m, 'COPY LOCAL BUFFER', 116, 10, '#c8d9c8');
  label(m, 'INTAKE ←', 108, 22, green);
  m.storyAnchors = [m.spawn, m.exit, ...site.records, ...site.choices, ...site.caches].map(item => item === m.spawn || item === m.exit ? { ...item } : point(item.x, item.y));
  return m;
}
