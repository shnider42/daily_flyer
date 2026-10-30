// One authored, interconnected world. Every boundary link is deliberate: the
// capability gates create new loops through sectors the player has already seen.
export function createUnderworks() {
  const width = 81, height = 81;
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const room = (x1, z1, x2, z2) => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = '.';
  };
  const doors = [];
  const gate = (id, x, z, axis, requires, kind, label) => {
    cells[z][x] = '.';
    if (axis === 'z') { cells[z - 1][x] = '#'; cells[z + 1][x] = '#'; }
    else { cells[z][x - 1] = '#'; cells[z][x + 1] = '#'; }
    doors.push({ id, x: x + .5, z: z + .5, axis, requires, kind, label, open: false });
  };
  const horizontal = (x1, x2, z) => room(x1, z - 1, x2, z + 1);
  const vertical = (x, z1, z2) => room(x - 1, z1, x + 1, z2);

  // Arrival freight terminal: a quiet lift bay, then a broad loading yard.
  room(35, 69, 46, 75); room(40, 65, 41, 68);
  room(31, 57, 49, 64); room(31, 60, 35, 70); room(46, 60, 49, 69);
  room(38, 76, 42, 76); room(40, 77, 40, 77); room(37, 78, 44, 79);
  // Neither side service corridor touches the safe bay before the arrival door.
  cells[69][35] = '#'; cells[70][35] = '#';
  for (let z = 69; z <= 70; z++) cells[z][46] = '#';
  gate('arrival', 40, 67, 'x', null, 'airlock', 'Open the freight airlock');
  cells[67][41] = '.';
  doors.push({ id: 'arrival-side', x: 41.5, z: 67.5, axis: 'x', requires: null, paired: 'arrival', open: false });
  gate('security', 40, 77, 'x', 'key', 'airlock', 'Unlock the arrival lift');

  // Central exchange: four arms, cover banks, refuge and two transit platforms.
  room(31, 34, 49, 46); room(35, 30, 45, 49);
  room(30, 37, 32, 43); room(48, 37, 50, 43);
  for (const [x1, z1, x2, z2] of [[34, 37, 36, 38], [44, 37, 46, 38], [36, 43, 38, 44], [44, 43, 46, 44]]) {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = '#';
  }

  // Foundry: two work halls around a central furnace, connected on both sides.
  room(3, 31, 21, 36); room(3, 43, 21, 49);
  room(3, 34, 7, 45); room(17, 34, 21, 45);
  room(9, 37, 15, 43); horizontal(6, 18, 40);
  room(2, 30, 10, 34); room(20, 37, 24, 43);

  // Pump works: a ring of maintenance halls and a flooded central machine room.
  room(57, 31, 77, 35); room(57, 45, 77, 49);
  room(57, 34, 61, 46); room(73, 34, 77, 46);
  room(64, 38, 70, 43); horizontal(59, 75, 40);
  room(65, 33, 69, 38); room(65, 43, 69, 48);

  // Flood reserve: long reservoir walkways surrounding the insulator workshop.
  room(57, 57, 77, 61); room(57, 73, 77, 77);
  room(57, 60, 61, 74); room(73, 60, 77, 74);
  room(64, 64, 70, 70); horizontal(59, 75, 67);
  room(64, 69, 74, 74); room(65, 58, 69, 64);

  // Old quarters: several small homes and service rooms beside a broad boulevard.
  room(3, 64, 23, 69); room(10, 57, 15, 76);
  room(3, 57, 8, 61); room(18, 57, 23, 62);
  room(3, 72, 8, 77); room(18, 72, 23, 77);
  horizontal(7, 20, 59); horizontal(7, 20, 74);
  room(3, 62, 4, 64); room(22, 61, 23, 65);
  // The expansion is in a separate medical annex, with a phase-protected entry.
  room(3, 72, 8, 77);
  for (let x = 3; x <= 8; x++) cells[71][x] = '#';
  gate('medical-field', 8, 74, 'z', 'phase', 'phase', 'Phase through the medical annex field');

  // Rail crown: dual rail galleries, switch rooms and the western late relay.
  room(3, 18, 23, 23); room(4, 4, 8, 20); room(18, 4, 22, 20);
  room(4, 3, 22, 7); room(3, 3, 13, 11);
  room(10, 12, 16, 16); horizontal(7, 19, 14);
  room(11, 15, 15, 20);

  // Mnemonic archives: phase workshop south, isolated relay reading room north.
  room(57, 4, 61, 23); room(57, 21, 77, 24);
  room(63, 15, 71, 20); room(65, 3, 77, 9);
  horizontal(60, 65, 6); gate('archive-field', 63, 6, 'z', 'phase', 'phase', 'Open the archive relay field');
  room(74, 13, 77, 18); room(75, 19, 75, 21);
  gate('archive-cache-grille', 75, 19, 'x', 'cutter', 'grille', 'Cut open the archive supply grille');

  // Reactor crown: a full outer ring, with one independently sealed core.
  room(31, 3, 49, 6); room(31, 20, 49, 24);
  room(31, 5, 34, 21); room(46, 5, 49, 21);
  room(37, 9, 43, 17); room(40, 18, 40, 20);
  gate('reactor-seal', 40, 18, 'x', 'relays', 'airlock', 'Open reactor containment');

  // The nine sectors form several loops. First visits and later shortcuts share
  // the same terrain; none of the upgrades is a one-use key for a single gate.
  vertical(40, 47, 58);
  horizontal(21, 32, 40); gate('foundry-entry', 26, 40, 'z', 'power', 'airlock', 'Open the powered foundry airlock');
  horizontal(49, 59, 40); gate('pump-grille', 53, 40, 'z', 'cutter', 'grille', 'Cut the pump-works grille');
  vertical(67, 48, 58);
  horizontal(23, 32, 67); gate('quarters-grille', 26, 67, 'z', 'cutter', 'grille', 'Cut the old-quarters grille');
  vertical(13, 48, 58); gate('foundry-return', 13, 53, 'x', 'cutter', 'shortcut', 'Cut the foundry service shortcut');
  horizontal(48, 59, 67); gate('flood-return', 53, 67, 'z', 'insulator', 'hazard', 'Cross the flooded return conduit');
  vertical(13, 22, 32); gate('rail-conduit', 13, 26, 'x', 'insulator', 'hazard', 'Cross the energized rail conduit');
  vertical(67, 23, 32); gate('archive-conduit', 67, 26, 'x', 'insulator', 'hazard', 'Cross the archive power conduit');
  vertical(40, 23, 35); gate('hub-field', 40, 26, 'x', 'phase', 'shortcut', 'Open the reactor return shortcut');
  horizontal(21, 32, 13); gate('rail-field', 26, 13, 'z', 'phase', 'phase', 'Open the rail-crown phase field');
  horizontal(49, 59, 13); gate('archive-return', 53, 13, 'z', 'phase', 'shortcut', 'Open the archive return shortcut');
  // A second foundry-to-hub route rewards revisiting with the insulator.
  horizontal(20, 35, 32); gate('foundry-conduit', 26, 32, 'z', 'insulator', 'hazard', 'Cross the foundry cooling conduit');

  // Optional maintenance cache, reached through an old grille in the rail room.
  room(11, 8, 16, 11); room(14, 8, 16, 11);
  for (let z = 8; z <= 11; z++) cells[z][13] = '#';
  for (let x = 14; x <= 16; x++) { cells[7][x] = '#'; cells[12][x] = '#'; }
  gate('maintenance', 13, 9, 'z', 'cutter', 'grille', 'Inspect the sealed maintenance cache');
  doors.at(-1).secret = true;
  const enemy = (id, type, x, z, health) => ({ id, type, x: x + .5, z: z + .5, health: health || (type === 'brute' ? 145 : type === 'spitter' ? 70 : 52), maxHealth: health || (type === 'brute' ? 145 : type === 'spitter' ? 70 : 52), alive: true });
  const pickup = (id, type, x, z, amount = 1, requires) => ({ id, type, x: x + .5, z: z + .5, amount, ...(requires ? { requires } : {}) });
  const refuge = (id, x, z, label) => ({ id, type: 'refuge', x: x + .5, z: z + .5, label, requires: 'power', repeatable: true });
  const transit = (id, x, z, destination, label, requires = null) => ({ id, type: 'transit', x: x + .5, z: z + .5, destination, label, requires, landing: { x: x + .5, z: z + 1.25 }, repeatable: true });
  const interactables = [
    { id: 'aux-power', type: 'power', x: 33.5, z: 45.5, label: 'Restore exchange power' },
    { id: 'upgrade-cutter', type: 'upgrade', upgrade: 'cutter', x: 5.5, z: 31.5, requires: 'power', label: 'Acquire the industrial cutter' },
    { id: 'upgrade-insulator', type: 'upgrade', upgrade: 'insulator', x: 70.5, z: 71.5, requires: 'cutter', label: 'Acquire the conduit insulator' },
    { id: 'upgrade-phase', type: 'upgrade', upgrade: 'phase', x: 66.5, z: 17.5, requires: 'insulator', label: 'Acquire the phase module' },
    { id: 'relay-west', type: 'relay', x: 5.5, z: 5.5, requires: 'phase', label: 'Activate the rail-crown relay' },
    { id: 'relay-east', type: 'relay', x: 75.5, z: 5.5, requires: 'phase', label: 'Activate the archive relay' },
    { id: 'cache-panel', type: 'secret', x: 12.5, z: 9.5, requires: 'cutter', label: 'Inspect the maintenance panel' },
    { id: 'extraction', type: 'exit', x: 42.5, z: 78.5, label: 'Depart in the arrival lift' },
    refuge('refuge-hub', 40, 45, 'Rest at the central refuge'),
    refuge('refuge-foundry', 4, 46, 'Rest in the foundry shelter'),
    refuge('refuge-pumps', 76, 47, 'Rest in the pump shelter'),
    refuge('refuge-reserve', 59, 75, 'Rest in the reservoir shelter'),
    refuge('refuge-quarters', 20, 76, 'Rest in the old quarters'),
    refuge('refuge-rail', 20, 21, 'Rest in the rail shelter'),
    refuge('refuge-archives', 69, 23, 'Rest in the archive shelter'),
    refuge('refuge-reactor', 47, 22, 'Rest outside reactor containment'),
    transit('transit-arrival', 37, 72, 'transit-reactor', 'Arrival lift transit'),
    transit('transit-reactor', 32, 21, 'transit-arrival', 'Reactor return transit', 'phase'),
    transit('transit-hub-west', 32, 37, 'transit-foundry', 'Foundry transit', 'cutter'),
    transit('transit-foundry', 6, 48, 'transit-hub-west', 'Central exchange transit', 'cutter'),
    transit('transit-hub-east', 47, 35, 'transit-archives', 'Archive transit', 'insulator'),
    transit('transit-archives', 59, 18, 'transit-hub-east', 'Central exchange transit', 'insulator'),
    transit('transit-reserve', 75, 58, 'transit-rail', 'Rail-crown transit', 'insulator'),
    transit('transit-rail', 7, 20, 'transit-reserve', 'Flood-reserve transit', 'insulator'),
  ];
  const pickups = [
    pickup('arrival-ammo', 'ammo', 40, 71, 40), pickup('arrival-armor', 'armor', 43, 73, 35), pickup('pump-shotgun', 'shotgun', 45, 73, 18),
    pickup('access-key', 'key', 40, 10, 1, 'guardian'),
    pickup('health-expansion', 'healthExpansion', 4, 75, 25, 'phase'),
    pickup('cache-armor', 'armor', 15, 8, 75), pickup('cache-shells', 'shells', 15, 10, 24),
    pickup('archive-cache-ammo', 'ammo', 76, 14, 60, 'cutter'), pickup('archive-cache-shells', 'shells', 75, 17, 24, 'cutter'),
  ];
  for (const [id, x, z] of [['freight', 33, 61], ['hub', 48, 45], ['foundry', 19, 47], ['pumps', 75, 33], ['reserve', 65, 75], ['quarters', 19, 60], ['rail', 20, 5], ['archive', 59, 22], ['reactor', 47, 4]]) {
    pickups.push(pickup(`${id}-ammo`, 'ammo', x, z, 40), pickup(`${id}-health`, 'health', x + 1, z, 45), pickup(`${id}-shells`, 'shells', x, z + 1, 14));
  }
  const enemies = [
    enemy('a1', 'runner', 34, 59), enemy('a2', 'runner', 46, 61), enemy('a3', 'spitter', 44, 57),
    enemy('h1', 'runner', 38, 35), enemy('h2', 'runner', 47, 41), enemy('h3', 'spitter', 33, 35), enemy('h4', 'brute', 40, 31),
    enemy('f1', 'runner', 19, 40), enemy('f2', 'spitter', 18, 33), enemy('f3', 'runner', 5, 39), enemy('f4', 'brute', 11, 39), enemy('f5', 'runner', 14, 47),
    enemy('p1', 'runner', 59, 40), enemy('p2', 'spitter', 66, 32), enemy('p3', 'runner', 75, 38), enemy('p4', 'runner', 67, 46), enemy('p5', 'brute', 65, 40),
    enemy('flood1', 'runner', 67, 59), enemy('flood2', 'spitter', 74, 64), enemy('flood3', 'runner', 60, 66), enemy('flood4', 'brute', 68, 67), enemy('flood5', 'runner', 72, 74),
    enemy('q1', 'runner', 13, 64), enemy('q2', 'spitter', 20, 67), enemy('q3', 'runner', 5, 59), { ...enemy('q4', 'sentry', 21, 74, 120), faction: 'security' },
    enemy('r1', 'runner', 13, 21), enemy('r2', 'spitter', 20, 15), enemy('r3', 'brute', 11, 14), enemy('r4', 'stalker', 6, 10, 86), enemy('r5', 'spitter', 11, 5),
    enemy('ar1', 'runner', 67, 22), enemy('ar2', 'spitter', 59, 15), enemy('ar3', 'stalker', 65, 18, 86), enemy('ar4', 'brute', 72, 6), enemy('ar5', 'runner', 76, 8),
    enemy('core1', 'runner', 33, 13), enemy('core2', 'spitter', 47, 14), enemy('core3', 'runner', 39, 15),
    { ...enemy('reactor-guardian', 'brute', 41, 12, 360), guardian: true },
  ];
  const sector = (id, name, x1, z1, x2, z2, palette) => ({ id, name, x1, z1, x2, z2, palette });
  return {
    id: 'underworks-13-v1', missionId: 'underworks-13', name: 'The Underworks', signCode: 'UW-13', width, height,
    exploration: true, enemyAwarenessDistance: 24, guardianId: 'reactor-guardian',
    upgradeNames: { cutter: 'Industrial cutter', insulator: 'Conduit insulator', phase: 'Phase module' },
    grid: cells.map(row => row.join('')),
    spawn: { x: 40.5, z: 73.5, angle: 0 }, coopSpawns: [{ x: 40.5, z: 73.5, angle: 0 }, { x: 42.5, z: 73.5, angle: 0 }],
    doors, interactables, pickups, enemies,
    zones: [
      sector('arrival', 'Arrival freight terminal', 29, 56, 52, 80, 'arrival'),
      sector('hub', 'Central exchange', 29, 29, 52, 52, 'hub'),
      sector('foundry', 'Industrial foundry', 2, 29, 25, 52, 'foundry'),
      sector('pumps', 'Conduit pump works', 56, 29, 79, 52, 'floodworks'),
      sector('reserve', 'Flood reserve', 56, 56, 79, 79, 'floodworks'),
      sector('quarters', 'Old workers’ quarters', 2, 56, 25, 79, 'arrival'),
      sector('rail', 'Rail crown', 2, 2, 25, 25, 'rail'),
      sector('archives', 'Mnemonic archives', 56, 2, 79, 25, 'archives'),
      sector('reactor', 'Reactor crown', 29, 2, 52, 25, 'reactor'),
    ],
    hazards: [
      { x1: 64, x2: 70, z1: 25, z2: 29, type: 'conduit', palette: 'floodworks' },
      { x1: 10, x2: 16, z1: 25, z2: 29, type: 'conduit', palette: 'floodworks' },
      { x1: 51, x2: 56, z1: 65, z2: 69, type: 'flood', palette: 'floodworks' },
      { x1: 24, x2: 29, z1: 30, z2: 34, type: 'conduit', palette: 'floodworks' },
    ],
  };
}

export const UNDERWORKS = createUnderworks();
