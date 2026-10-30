// A connected conservatory: two cultivation wings loop around the atrium,
// meet at the north gallery, and return through the keyed central shortcut.
function createGlasshouse() {
  const width = 53, height = 55;
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const room = (x1, z1, x2, z2) => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = '.';
  };
  const doors = [];
  const gate = (id, x, z, axis, requires = null, extra = {}) => {
    cells[z][x] = '.';
    doors.push({ id, x: x + .5, z: z + .5, axis, requires, open: false, ...extra });
  };
  const doubleGate = (id, x, z, axis, requires, extra = {}) => {
    gate(id, x, z, axis, requires, extra);
    gate(`${id}-side`, x + (axis === 'x' ? 1 : 0), z + (axis === 'z' ? 1 : 0), axis, requires, { ...extra, paired: id });
  };
  room(20, 44, 32, 50);                    // Safe arrival lab and separated practice bay.
  room(6, 43, 18, 50); room(18, 47, 20, 48);
  room(26, 38, 27, 44);
  doubleGate('arrival', 26, 41, 'x');
  room(24, 52, 29, 53); room(26, 50, 26, 52);
  gate('security', 26, 51, 'x', 'key', { label: 'Open the laboratory lift' });

  room(18, 25, 34, 38);                    // The planted atrium is the route landmark.
  room(3, 19, 15, 37);                    // Western cultivation loop.
  room(16, 33, 18, 34); room(16, 26, 18, 27);
  doubleGate('west-south', 16, 33, 'z', 'power');
  doubleGate('west-north', 16, 26, 'z', 'power');
  room(38, 20, 49, 37);                   // Eastern water galleries.
  room(34, 33, 38, 34); room(34, 26, 38, 27);
  doubleGate('east-shutter', 36, 33, 'z', 'power', { kind: 'shutter', controlledBy: 'water-control-west', circuitId: 'GH-1', mark: '1' });
  doubleGate('east-north', 36, 26, 'z', 'power');

  room(3, 7, 17, 17); room(10, 17, 11, 19); // Pumpworks links the west wing to the north.
  room(36, 7, 49, 17); room(44, 17, 45, 20);
  room(17, 15, 36, 16);                    // Both relays may be approached from either wing.
  room(20, 3, 32, 12); room(26, 12, 26, 15);
  gate('arena-seal', 26, 13, 'x', 'relays', { label: 'Open the propagation chamber' });
  room(26, 16, 26, 25);                    // A recognizable return spine, opened by the key.
  gate('return-shortcut', 26, 24, 'x', 'key', { kind: 'shortcut', label: 'Open the atrium return', destinationLabel: 'ATRIUM / LAB LIFT' });

  const landmarks = [
    { id: 'atrium-roots', type: 'root-mass', x: 26.5, z: 31.5, width: 5, depth: 5, axis: 'z', palette: 'green', label: 'CENTRAL ATRIUM' },
    { id: 'west-glass-lab', type: 'glass-lab', x: 9, z: 27, width: 2, depth: 6, axis: 'z', palette: 'green' },
    { id: 'west-cultivation', type: 'cultivation-bed', x: 13.5, z: 21.5, width: 3, depth: 3, axis: 'x', palette: 'green' },
    { id: 'east-vat', type: 'water-vat', x: 44, z: 28, width: 4, depth: 4, axis: 'z', palette: 'violet' },
    { id: 'east-cultivation', type: 'cultivation-bed', x: 40.5, z: 22.5, width: 3, depth: 3, axis: 'x', palette: 'violet' },
    { id: 'pump-bank', type: 'pump-bank', x: 11, z: 13, width: 4, depth: 2, axis: 'x', palette: 'amber' },
    { id: 'north-glass-lab', type: 'glass-lab', x: 41.5, z: 12.5, width: 3, depth: 3, axis: 'z', palette: 'violet' },
    { id: 'chamber-west-cover', type: 'root-mass', x: 23, z: 8, width: 2, depth: 2, axis: 'z', palette: 'violet' },
    { id: 'chamber-east-cover', type: 'root-mass', x: 30, z: 8, width: 2, depth: 2, axis: 'z', palette: 'violet' },
    { id: 'practice-reflector', type: 'glass-lab', x: 9, z: 44.5, width: 4, depth: 1, axis: 'x', palette: 'cyan', label: 'BANK SHOT PRACTICE' },
  ];
  for (const item of landmarks) for (let z = item.z - item.depth / 2; z < item.z + item.depth / 2; z++) {
    for (let x = item.x - item.width / 2; x < item.x + item.width / 2; x++) cells[z][x] = '#';
  }
  const gardenZones = [
    { x: 19, z: 31.5, width: 2, depth: 11, type: 'garden', palette: 'green' },
    { x: 33, z: 31.5, width: 2, depth: 11, type: 'water', palette: 'cyan' },
    { x: 5.5, z: 28, width: 3, depth: 14, type: 'garden', palette: 'green' },
    { x: 47.5, z: 28, width: 3, depth: 14, type: 'water', palette: 'violet' },
    { x: 15, z: 47, width: 4, depth: 4, type: 'lab', palette: 'cyan' },
    { x: 5.5, z: 12, width: 3, depth: 8, type: 'pumpworks', palette: 'amber' },
  ];
  const feature = (id, type, x, z, label, extra = {}) => ({ id, type, x: x + .5, z: z + .5, label, ...extra });
  const pickup = (id, type, x, z, amount = 1, extra = {}) => ({ id, type, x: x + .5, z: z + .5, amount, ...extra });
  const enemy = (id, type, x, z, extra = {}) => {
    const health = { runner: 52, spitter: 70, brute: 145, stalker: 86, sentry: 120, bulwark: 165, mender: 80 }[type];
    return { id, type, x: x + .5, z: z + .5, health, maxHealth: health, alive: true, ...extra };
  };
  return {
    id: 'glasshouse-17-v1', missionId: 'glasshouse-17', name: 'The Glasshouse', signCode: 'GH-17', width, height,
    guardianId: 'glasshouse-guardian', guardianName: 'Propagation guardian',
    landmarks, gardenZones, skylights: [{ x: 26.5, z: 31.5, width: 17, depth: 14 }],
    destinationPreview: { doorId: 'security', label: 'LAB LIFT', mark: '17' },
    grid: cells.map(row => row.join('')), spawn: { x: 26.5, z: 49.5, angle: 0 },
    coopSpawns: [{ x: 26.5, z: 49.5, angle: 0 }, { x: 28.5, z: 49.5, angle: 0 }], doors,
    interactables: [
      feature('aux-power', 'power', 20, 36, 'Restore conservatory power'),
      feature('relay-west', 'relay', 5, 8, 'Reconnect the pumpworks relay', { requires: 'power' }),
      feature('relay-east', 'relay', 47, 8, 'Reconnect the cultivation relay', { requires: 'power' }),
      feature('atrium-refuge', 'refuge', 30, 37, 'Rest at the atrium refuge', { requires: 'power', repeatable: true }),
      feature('north-refuge', 'refuge', 18, 16, 'Rest at the north-gallery refuge', { requires: 'power', repeatable: true }),
      ...[['water-control-west', 34, 35], ['water-control-east', 38, 35]].map(([id, x, z]) => feature(id, 'shutter-switch', x, z, 'Cultivation shutter 1', {
        doorIds: ['east-shutter', 'east-shutter-side'], repeatable: true, requires: 'power', circuitId: 'GH-1', mark: '1',
      })),
      feature('extraction', 'exit', 28, 53, 'Depart in the laboratory lift'),
    ],
    pickups: [
      pickup('arrival-ammo', 'ammo', 26, 47, 36), pickup('arrival-armor', 'armor', 30, 48, 30),
      pickup('pump-shotgun', 'shotgun', 23, 47, 12), pickup('rebound-carbine', 'ricochet', 12, 48, 18),
      pickup('practice-slugs', 'slugs', 7, 49, 10), pickup('thumper', 'grenade', 31, 36, 6, { requires: 'power' }),
      pickup('atrium-shells', 'shells', 19, 34, 12), pickup('atrium-health', 'health', 33, 28, 35),
      pickup('west-slugs', 'slugs', 4, 35, 14), pickup('west-health', 'health', 14, 30, 40),
      pickup('west-grenades', 'grenades', 4, 20, 5), pickup('west-armor', 'armor', 7, 23, 35),
      pickup('pump-slugs', 'slugs', 4, 16, 12), pickup('pump-health', 'health', 16, 8, 40),
      pickup('pump-shells', 'shells', 16, 12, 14), pickup('pump-grenades', 'grenades', 7, 8, 4),
      pickup('arc-caster', 'arc', 48, 36, 12), pickup('east-cells', 'cells', 48, 22, 8),
      pickup('east-health', 'health', 39, 30, 40), pickup('east-slugs', 'slugs', 40, 20, 14),
      pickup('east-armor', 'armor', 48, 32, 40), pickup('north-grenades', 'grenades', 38, 8, 5),
      pickup('north-shells', 'shells', 48, 16, 16), pickup('north-health', 'health', 45, 9, 40),
      pickup('chamber-slugs', 'slugs', 21, 11, 16), pickup('chamber-shells', 'shells', 31, 11, 18),
      pickup('chamber-grenades', 'grenades', 21, 4, 5), pickup('chamber-health', 'health', 31, 4, 45),
      pickup('access-key', 'key', 26, 4, 1, { requires: 'guardian' }),
    ],
    enemies: [
      enemy('atrium-bulwark', 'bulwark', 21, 26), enemy('atrium-runner', 'runner', 32, 26),
      enemy('west-mender', 'mender', 12, 33), enemy('west-brute', 'brute', 11, 35), enemy('west-runner', 'runner', 6, 30),
      enemy('west-spitter', 'spitter', 13, 24), enemy('west-bulwark', 'bulwark', 6, 22),
      enemy('pump-bulwark', 'bulwark', 13, 16), enemy('pump-mender', 'mender', 15, 10),
      enemy('pump-runner', 'runner', 5, 11), enemy('pump-spitter', 'spitter', 8, 8),
      enemy('east-bulwark', 'bulwark', 39, 33), enemy('east-runner', 'runner', 47, 31),
      enemy('east-mender', 'mender', 48, 25), enemy('east-stalker', 'stalker', 40, 25),
      enemy('research-security', 'sentry', 38, 15, { faction: 'security', encounterId: 'research-dispute' }),
      enemy('research-runner', 'runner', 46, 15, { encounterId: 'research-dispute' }),
      enemy('research-mender', 'mender', 47, 10, { encounterId: 'research-dispute' }),
      enemy('research-stalker', 'stalker', 46, 8), enemy('gallery-spitter', 'spitter', 33, 15),
      enemy('glasshouse-guardian', 'brute', 26, 5, { guardian: true, health: 420, maxHealth: 420 }),
      enemy('chamber-bulwark', 'bulwark', 21, 10), enemy('chamber-mender', 'mender', 31, 5),
    ],
    zones: [
      { id: 'arrival', name: 'Arrival laboratory', x1: 19, x2: 34, z1: 39, z2: 55, palette: 'cyan' },
      { id: 'practice', name: 'Ballistics practice bay', x1: 5, x2: 19, z1: 42, z2: 51, palette: 'cyan' },
      { id: 'atrium', name: 'Planted atrium', x1: 17, x2: 38, z1: 24, z2: 39, palette: 'green' },
      { id: 'west', name: 'Western cultivation wing', x1: 2, x2: 17, z1: 18, z2: 38, palette: 'green' },
      { id: 'east', name: 'Water cultivation wing', x1: 38, x2: 51, z1: 18, z2: 38, palette: 'violet' },
      { id: 'pumpworks', name: 'Conservatory pumpworks', x1: 2, x2: 18, z1: 6, z2: 18, palette: 'amber' },
      { id: 'research', name: 'Glass research wing', x1: 36, x2: 51, z1: 6, z2: 18, palette: 'violet' },
      { id: 'north', name: 'North return gallery', x1: 18, x2: 36, z1: 14, z2: 24, palette: 'cyan' },
      { id: 'chamber', name: 'Propagation chamber', x1: 19, x2: 34, z1: 2, z2: 14, palette: 'violet' },
    ],
  };
}

export const GLASSHOUSE = createGlasshouse();
