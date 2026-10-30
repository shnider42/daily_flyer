// A short authored loop: observe the freight battle, choose an approach, learn
// the arc caster, then use familiar routes and shutter controls under pressure.
export function createSwitchyard() {
  const width = 45, height = 49;
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const room = (x1, z1, x2, z2) => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = '.';
  };
  const horizontal = (x1, x2, z) => room(x1, z, x2, z + 1);
  const vertical = (x, z1, z2) => room(x, z1, x + 1, z2);
  const doors = [];
  const gate = (id, x, z, axis, requires, kind = 'airlock', extra = {}) => {
    cells[z][x] = '.';
    if (axis === 'x') { cells[z][x - 1] = '#'; cells[z][x + 1] = '#'; }
    else { cells[z - 1][x] = '#'; cells[z + 1][x] = '#'; }
    doors.push({ id, x: x + .5, z: z + .5, axis, requires, kind, open: false, ...extra });
  };

  room(18, 40, 26, 44);                          // Safe freight-lift landing.
  vertical(22, 38, 40); gate('arrival', 22, 39, 'x', null);
  room(19, 46, 25, 47); gate('security', 22, 45, 'x', 'key', 'airlock', { label: 'Unlock the freight lift' });
  room(17, 32, 29, 37);                          // Sheltered observation concourse.
  room(31, 24, 41, 37);                          // Security / infestation freight battle.
  horizontal(29, 33, 34);
  gate('yard-shutter', 30, 34, 'z', 'power', 'shutter', { controlledBy: 'yard-control-west', circuitId: 'SY-1', mark: '1' });

  // The western service route permanently bypasses the battle and its shutter.
  horizontal(6, 18, 34); vertical(6, 27, 34);
  room(3, 25, 14, 29); vertical(4, 19, 26);
  horizontal(5, 19, 19); vertical(18, 19, 23);
  room(17, 22, 27, 28);                          // Arc workshop: both approaches meet.
  horizontal(26, 35, 22); vertical(34, 22, 25);
  vertical(22, 28, 32);
  gate('return-grille', 22, 31, 'x', 'cutter', 'grille', { label: 'Cut the workshop return grille', destinationLabel: 'WORKSHOP / LIFT RETURN' });

  // Cable galleries make a small readable maze around two loops. Wider bays
  // at its corners hold landmarks and supplies rather than identical dead ends.
  room(3, 8, 15, 20);
  for (let z = 8; z <= 17; z++) if (![12, 13].includes(z)) cells[z][8] = '#';
  for (let x = 8; x <= 15; x++) if (![12, 13].includes(x)) cells[14][x] = '#';
  for (let z = 15; z <= 20; z++) if (z !== 18) cells[z][12] = '#';
  room(1, 9, 1, 12); gate('maintenance', 2, 10, 'z', null, 'airlock', { secret: true });

  // One visible stalker in the lower gallery, then a mixed upper encounter.
  room(33, 17, 41, 23); room(29, 9, 41, 14);
  vertical(37, 14, 17); vertical(29, 13, 21); horizontal(29, 35, 20);
  gate('gallery-shutter', 37, 15, 'x', 'power', 'shutter', { controlledBy: 'gallery-control-south', circuitId: 'SY-2', mark: '2' });
  for (const [x, z] of [[35, 19], [35, 20], [33, 11], [34, 11], [38, 12]]) cells[z][x] = '#';

  // The containment arena has two cover banks, broad side loops and a fixed
  // entrance. The return path remains open after the guardian is defeated.
  room(18, 3, 27, 13); vertical(22, 13, 22);
  gate('arena-seal', 22, 15, 'x', 'relays', 'airlock', { label: 'Open the switching-engine chamber' });
  for (const [x, z] of [[20, 7], [20, 8], [25, 7], [25, 8]]) cells[z][x] = '#';

  const landmarks = [
    { id: 'freight-car', type: 'freight-car', x: 36.5, z: 32, width: 3, depth: 4, axis: 'z' },
    { id: 'service-transformer', type: 'transformer', x: 10.5, z: 27, width: 3, depth: 2, axis: 'x' },
    { id: 'security-cabin', type: 'security-cabin', x: 40, z: 35.5, width: 2, depth: 3, axis: 'z' },
  ];
  for (const item of landmarks) for (let z = item.z - item.depth / 2; z < item.z + item.depth / 2; z++) {
    for (let x = item.x - item.width / 2; x < item.x + item.width / 2; x++) cells[z][x] = '#';
  }
  const feature = (id, type, x, z, label, extra = {}) => ({ id, type, x: x + .5, z: z + .5, label, ...extra });
  const control = (id, x, z, doorId, mark) => feature(id, 'shutter-switch', x, z, `Freight shutter ${mark}`, {
    doorIds: [doorId], repeatable: true, requires: 'power', circuitId: `SY-${mark}`, mark: String(mark),
  });
  const pickup = (id, type, x, z, amount = 1, extra = {}) => ({ id, type, x: x + .5, z: z + .5, amount, ...extra });
  const enemy = (id, type, x, z, extra = {}) => {
    const health = { runner: 52, spitter: 70, brute: 145, stalker: 86, sentry: 120 }[type];
    return { id, type, x: x + .5, z: z + .5, health, maxHealth: health, alive: true, ...extra };
  };
  return {
    id: 'switchyard-15-v1', missionId: 'switchyard-15', name: 'Switchyard', signCode: 'SY-15', width, height,
    guardianId: 'switchyard-guardian', guardianName: 'Switching-engine guardian',
    upgradeNames: { cutter: 'Industrial cutter' }, landmarks,
    destinationPreview: { doorId: 'security', label: 'FREIGHT LIFT', mark: '15' },
    grid: cells.map(row => row.join('')), spawn: { x: 22.5, z: 43.5, angle: 0 }, doors,
    interactables: [
      feature('aux-power', 'power', 18, 35, 'Restore switchyard power'),
      feature('upgrade-cutter', 'upgrade', 18, 24, 'Acquire the industrial cutter', { upgrade: 'cutter', requires: 'power' }),
      control('yard-control-west', 28, 35, 'yard-shutter', 1), control('yard-control-east', 32, 35, 'yard-shutter', 1),
      control('gallery-control-south', 38, 16, 'gallery-shutter', 2), control('gallery-control-north', 38, 13, 'gallery-shutter', 2),
      feature('relay-west', 'relay', 4, 9, 'Reconnect the cable-gallery relay', { requires: 'power' }),
      feature('relay-east', 'relay', 40, 10, 'Reconnect the phase-gallery relay', { requires: 'power' }),
      feature('workshop-refuge', 'refuge', 25, 26, 'Rest at the workshop refuge', { requires: 'power', repeatable: true }),
      feature('cache-panel', 'secret', 3, 10, 'Inspect the old cable panel'),
      feature('extraction', 'exit', 22, 47, 'Depart in the freight lift'),
    ],
    pickups: [
      pickup('arrival-ammo', 'ammo', 22, 41, 36), pickup('arrival-armor', 'armor', 25, 42, 25),
      pickup('pump-shotgun', 'shotgun', 22, 42, 12), pickup('service-health', 'health', 4, 28, 35),
      pickup('service-shells', 'shells', 13, 26, 10), pickup('arc-caster', 'arc', 22, 24, 12),
      pickup('workshop-ammo', 'ammo', 24, 25, 32), pickup('workshop-cells', 'cells', 24, 23, 6),
      pickup('yard-cache-cells', 'cells', 41, 36, 8), pickup('yard-cache-armor', 'armor', 41, 35, 40),
      pickup('gallery-health', 'health', 14, 9, 40), pickup('gallery-shells', 'shells', 11, 18, 12),
      pickup('phase-cells', 'cells', 40, 21, 6), pickup('phase-health', 'health', 29, 18, 40),
      pickup('arena-ammo', 'ammo', 19, 12, 40), pickup('arena-shells', 'shells', 26, 12, 16),
      pickup('arena-health', 'health', 26, 4, 35), pickup('access-key', 'key', 22, 4, 1, { requires: 'guardian' }),
      pickup('cache-armor', 'armor', 1, 9, 50), pickup('cache-shells', 'shells', 1, 12, 12),
    ],
    enemies: [
      enemy('service-runner', 'runner', 7, 28), enemy('service-spitter', 'spitter', 13, 19),
      enemy('yard-security', 'sentry', 33, 34, { faction: 'security', encounterId: 'freight-battle' }),
      enemy('yard-runner', 'runner', 34, 26, { encounterId: 'freight-battle' }),
      enemy('yard-spitter', 'spitter', 38, 25, { encounterId: 'freight-battle' }),
      enemy('yard-brute', 'brute', 38, 27, { encounterId: 'freight-battle' }),
      enemy('cable-runner', 'runner', 5, 16), enemy('cable-spitter', 'spitter', 13, 11), enemy('cable-brute', 'brute', 5, 9),
      enemy('phase-intro', 'stalker', 39, 19), enemy('phase-mixed', 'stalker', 39, 11), enemy('phase-spitter', 'spitter', 30, 10),
      enemy('switchyard-guardian', 'brute', 23, 5, { guardian: true, health: 360, maxHealth: 360 }),
    ],
    zones: [
      { id: 'lift', name: 'Freight lift', x1: 17, x2: 28, z1: 38, z2: 49, palette: 'arrival' },
      { id: 'concourse', name: 'Observation concourse', x1: 16, x2: 31, z1: 30, z2: 38, palette: 'hub' },
      { id: 'freight', name: 'Freight battle yard', x1: 30, x2: 44, z1: 24, z2: 39, palette: 'rail' },
      { id: 'service', name: 'Transformer service loop', x1: 2, x2: 16, z1: 23, z2: 37, palette: 'foundry' },
      { id: 'workshop', name: 'Arc workshop', x1: 16, x2: 33, z1: 21, z2: 30, palette: 'hub' },
      { id: 'cables', name: 'Cable galleries', x1: 1, x2: 17, z1: 7, z2: 23, palette: 'rail' },
      { id: 'phase', name: 'Phase galleries', x1: 28, x2: 44, z1: 8, z2: 24, palette: 'archives' },
      { id: 'engine', name: 'Switching-engine chamber', x1: 17, x2: 28, z1: 2, z2: 21, palette: 'reactor' },
    ],
  };
}

export const SWITCHYARD = createSwitchyard();
