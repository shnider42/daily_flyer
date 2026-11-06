/**
 * LOCKSTEP — shared campaign rules for browser and authoritative co-op server.
 * newGame({now?}) creates a serializable fresh campaign. Local room viewpoint is
 * intentionally outside shared state. availableRooms() returns room objects.
 * reduce(state, {type:'interact', id} | {type:'solve', id, value} |
 *               {type:'hint'} | {type:'advance'}, {now?})
 * returns {state, ok, message, changed, event?}. Failed/read-only/idempotent
 * actions preserve state identity and revision. Only server opts.now determines
 * the scanner window; clients render scanPhase(estimatedServerTime).
 * No reset action exists; start a new solo campaign with newGame().
 */
export const VERSION = '0.1.0';
export const SAVE_VERSION = 1;
export const MAX_HINTS = 3;

export const ITEMS = {
  brassKey: { id: 'brassKey', title: 'Brass key', short: 'Cell key', symbol: '△', color: '#c6a46b', level: 0, description: 'A heavy brass key with a triangular bow. The cell lock bears the same mark.' },
  intakeKey: { id: 'intakeKey', title: 'Intake key', short: 'Intake key', symbol: '□', color: '#aab5ba', level: 0, description: 'A square-headed key recovered from the laundry locker.' },
  transferKey: { id: 'transferKey', title: 'Transfer key', short: 'Transfer key', symbol: '◇', color: '#d2bd89', level: 0, description: 'A diamond stamped into a well-worn key. The secure transfer door has its matching escutcheon.' },
  rustedKey: { id: 'rustedKey', title: 'Rusted key', short: 'Old key', symbol: '×', color: '#ad7054', level: 0, decoy: true, description: 'Its teeth have rusted away. The little tag reads “DECOMMISSIONED”. A convincing distraction.' },
  serviceCard: { id: 'serviceCard', title: 'Service card', short: 'Service card', symbol: '▥', color: '#89b4a0', level: 1, description: 'A punched service card, kept behind a label on the cleaning cart.' },
  evidenceKey: { id: 'evidenceKey', title: 'Evidence key', short: 'Evidence key', symbol: '⬡', color: '#b3cbd0', level: 1, description: 'A hexagonal key lifted from the access cage while the surveillance sweep looked away.' },
  dummyCard: { id: 'dummyCard', title: 'Expired visitor card', short: 'Expired card', symbol: '×', color: '#a77b6b', level: 1, decoy: true, description: 'A visitor card bearing an old date and a clear VOID stamp. It cannot operate a service lock.' },
  maintenanceKey: { id: 'maintenanceKey', title: 'Maintenance key', short: 'Maintenance', symbol: '⚙', color: '#c6a46b', level: 2, description: 'A gear-shaped bow. A small second tooth fits the outer gate’s left keyway.' },
  seawallKey: { id: 'seawallKey', title: 'Seawall key', short: 'Seawall key', symbol: '≈', color: '#a8c8c8', level: 2, description: 'Two waves engraved into steel. It fits the outer gate’s right keyway.' }
};

const obj = (id, room, title, kind, prop, x, y, description, extra = {}) => ({ id, room, title, kind, prop, position: { x, y }, description, ...extra });

export const LEVELS = [
  {
    id: 'deadbolt', number: '01', title: 'The things they missed', shortTitle: 'Deadbolt', subtitle: 'An empty cell. A borrowed opportunity.', mechanic: 'Observation', accent: '#c6a46b',
    intro: 'The count is over. The corridor is empty. Someone left a way out of Cell 09—if you can see it.',
    outro: 'The transfer door closes behind you. Ahead: a row of lenses, and nowhere to hide.',
    startRoom: 'cell',
    rooms: [
      { id: 'cell', title: 'Cell 09', number: '09', style: 'cell', description: 'A bunk, a drain, and years of marks in the concrete.' },
      { id: 'gallery', title: 'B Block', number: 'B', style: 'gallery', requires: 'cellOpen', description: 'Laundry waits beneath a dead fluorescent strip.' },
      { id: 'intake', title: 'Intake office', number: '14', style: 'office', requires: 'intakeOpen', description: 'Everything confiscated. Everything catalogued.' }
    ],
    objects: [
      obj('bunk', 'cell', 'Unmade bunk', 'pickup', 'bed', 2.2, 3.2, 'The blanket sits oddly high at one corner. Something hard presses against the fabric.', { item: 'brassKey', success: 'Beneath the blanket: a brass key. Its bow is triangular.' }),
      obj('scratches', 'cell', 'Marks in the wall', 'clue', 'note', 5.4, 0.45, 'These are not days. Each little group belongs to a symbol.', { clue: { type: 'tallies', entries: [{ symbol: '○', count: 4 }, { symbol: '△', count: 7 }, { symbol: '□', count: 1 }], caption: 'The groups are separated by deliberate gaps.' } }),
      obj('drain', 'cell', 'Floor drain', 'pickup', 'grate', 7.2, 7.6, 'Something catches the light between the bars.', { item: 'rustedKey', success: 'A rusted key. The attached label reads DECOMMISSIONED.' }),
      obj('sink', 'cell', 'Cold washbasin', 'flavor', 'sink', 8.1, 2.8, 'A tap without water. In the basin: one tiny feather. Nothing useful beneath it.'),
      obj('cellDoor', 'cell', 'Cell door', 'unlock', 'door', 9.3, 5.1, 'A triangular mark is cut into the brass keyhole.', { key: 'brassKey', symbol: '△', flag: 'cellOpen', opens: 'gallery', success: 'The brass key turns. B Block is open.' }),
      obj('laundryLocker', 'gallery', 'Laundry locker', 'puzzle', 'locker', 2.0, 2.5, 'Three number wheels. Above them, three familiar shapes.', { puzzle: { type: 'code', length: 3, symbols: ['△', '□', '○'], prompt: 'Set the three wheels in the order printed on the lock.' }, item: 'intakeKey', flag: 'laundryOpen', success: 'The locker opens. A square-headed key hangs behind the towels.' }),
      obj('oldNotice', 'gallery', 'Old inspection notice', 'clue', 'note', 6.4, 0.5, 'A faded number looks promising—until you notice the stamp.', { clue: { type: 'notice', heading: 'INSPECTION 0915', stamp: 'SUPERSEDED', text: 'Previous locker combination. Replaced after last inspection.' } }),
      obj('intakeDoor', 'gallery', 'Intake door', 'unlock', 'door', 9.3, 5.2, 'A small square is stamped into the lock plate.', { key: 'intakeKey', symbol: '□', flag: 'intakeOpen', opens: 'intake', success: 'The square key fits. Intake is open.' }),
      obj('emptyBasket', 'gallery', 'Laundry basket', 'flavor', 'basket', 5.0, 6.4, 'Grey uniforms. One has a name scratched out. There is nothing underneath.'),
      obj('transferDesk', 'intake', 'Transfer desk', 'pickup', 'desk', 4.0, 3.9, 'An open ledger. A key is hooked behind the drawer lip.', { item: 'transferKey', success: 'You take the diamond-marked transfer key.' }),
      obj('intakeLedger', 'intake', 'Property ledger', 'clue', 'note', 2.0, 1.5, 'One line has been left unfinished.', { clue: { type: 'notice', heading: 'PRISONER 09', stamp: 'TRANSFER PENDING', text: 'Next destination: lower service corridor. One escort. No personal effects.' } }),
      obj('transferDoor', 'intake', 'Secure transfer', 'exit', 'door', 9.3, 5.2, 'The lock bears a diamond. Beyond the frosted glass, a green light waits.', { keys: ['transferKey'], symbol: '◇', flag: 'level0Exit', success: 'You leave B Block behind.' })
    ]
  },
  {
    id: 'blindspot', number: '02', title: 'Between the sweeps', shortTitle: 'Blind spot', subtitle: 'Every system has a moment of doubt.', mechanic: 'Surveillance', accent: '#8bb9a2',
    intro: 'A camera travels across the evidence cage. Watch its sweep. A steady hand is worth more than speed.',
    outro: 'The archive door yields. The building beyond has stopped pretending it is still maintained.',
    startRoom: 'service',
    rooms: [
      { id: 'service', title: 'Service passage', number: 'S1', style: 'service', description: 'The service route runs behind the public corridors.' },
      { id: 'control', title: 'Security control', number: 'C2', style: 'control', requires: 'controlOpen', description: 'Three circuits. One of them is a trap.' },
      { id: 'evidence', title: 'Evidence cage', number: 'E6', style: 'evidence', requires: 'circuitsSet', description: 'The last mechanical camera runs on its own reserve.' }
    ],
    objects: [
      obj('cleaningCart', 'service', 'Cleaning cart', 'pickup', 'cart', 3.3, 5.1, 'A corner of plastic peeks from behind the cart’s service label.', { item: 'serviceCard', success: 'A current service card. Its punched edge matches the control-room reader.' }),
      obj('visitorCard', 'service', 'Discarded visitor card', 'pickup', 'note', 6.8, 7.6, 'A card lies face-down in the wet concrete.', { item: 'dummyCard', success: 'The visitor card is marked VOID. It is no use at the service reader.' }),
      obj('controlDoor', 'service', 'Control-room reader', 'unlock', 'door', 9.3, 5.1, 'The reader accepts a punched service card.', { key: 'serviceCard', symbol: '▥', flag: 'controlOpen', opens: 'control', success: 'The service card releases the control-room lock.' }),
      obj('serviceWindow', 'service', 'Wired-glass window', 'flavor', 'window', 4.4, 0.35, 'A surveillance lamp sweeps the opposite wall. It pauses in darkness before returning.'),
      obj('wiringDiagram', 'control', 'Circuit diagram', 'clue', 'note', 2.1, 0.5, 'The line drawings identify what each switch feeds. Only two should receive power.', { clue: { type: 'circuits', entries: [{ symbol: '○', label: 'ACCESS', on: true }, { symbol: '△', label: 'ALARM', on: false }, { symbol: '□', label: 'SHUTTER', on: true }], caption: 'Power the access relay and shutter. Leave the alarm isolated.' } }),
      obj('switchboard', 'control', 'Isolation panel', 'puzzle', 'panel', 6.0, 1.8, 'Three tactile switches. The shapes match the maintenance drawing.', { puzzle: { type: 'switches', symbols: ['○', '△', '□'], labels: ['Circuit 1', 'Circuit 2', 'Circuit 3'], initial: [false, false, false], prompt: 'Apply power to the right circuits.' }, flag: 'circuitsSet', opens: 'evidence', success: 'The access relay engages. The evidence shutter rises.' }),
      obj('cameraMonitor', 'control', 'Camera monitor', 'clue', 'monitor', 3.5, 4.2, 'A warning under the screen: the evidence camera is on a separate reserve circuit.', { clue: { type: 'scan', caption: 'Bright sweep: watched. Dark sweep: reach. The camera’s cycle is visible on the cage indicator.' } }),
      obj('evidenceDoor', 'control', 'Evidence shutter', 'passage', 'door', 9.3, 5.1, 'A steel shutter protects the evidence cage.', { requires: 'circuitsSet', opens: 'evidence' }),
      obj('keyCage', 'evidence', 'Guarded key cage', 'timed', 'cage', 3.5, 3.5, 'The hexagonal key hangs within reach. A mechanical camera sweeps the cage. Wait until its light has passed.', { item: 'evidenceKey', puzzle: { type: 'scan', prompt: 'Reach during the dark interval.' }, success: 'Your hand is in and out before the lens returns. The hexagonal key is yours.' }),
      obj('evidenceLog', 'evidence', 'Evidence inventory', 'clue', 'note', 7.2, 0.5, 'A seal on an empty shelf points to the next wing.', { clue: { type: 'notice', heading: 'ARCHIVE ACCESS', stamp: '⬡', text: 'Reserve key. Do not leave the cage unlocked.' } }),
      obj('archiveDoor', 'evidence', 'Archive bulkhead', 'exit', 'door', 9.3, 5.1, 'The heavy archive door has a hexagonal keyway.', { keys: ['evidenceKey'], symbol: '⬡', flag: 'level1Exit', success: 'The archive bulkhead unlocks.' })
    ]
  },
  {
    id: 'lastcurrent', number: '03', title: 'The last current', shortTitle: 'The outer wall', subtitle: 'A route out. A route back. Read the difference.', mechanic: 'Systems', accent: '#82b5c1',
    intro: 'The outer gate has two locks and no power. The old plans survive. Their arrows may be your last honest guide.',
    outro: 'Cold air. Open water. For the first time tonight, nothing is counting you.',
    startRoom: 'archive',
    rooms: [
      { id: 'archive', title: 'Records archive', number: 'A3', style: 'archive', description: 'Dusty plans chart a prison that has changed around them.' },
      { id: 'turbine', title: 'Switch house', number: 'P0', style: 'turbine', requires: 'turbineOpen', description: 'A dead grid separates the building from the outer wall.' },
      { id: 'yard', title: 'Outer yard', number: 'Y', style: 'yard', requires: 'powerRestored', description: 'Two gates. One leads back inside.' }
    ],
    objects: [
      obj('maintenanceDesk', 'archive', 'Maintenance drawer', 'pickup', 'desk', 3.4, 3.3, 'A maintenance key rests in a drawer outlined in dust.', { item: 'maintenanceKey', success: 'You take the gear-marked maintenance key. It has a second, smaller tooth.' }),
      obj('evacuationPlan', 'archive', 'Evacuation plan', 'clue', 'note', 6.7, 0.5, 'Follow the arrows beyond the outer wall. One printed route circles back to intake.', { clue: { type: 'routes', routes: [{ symbol: '△', label: 'TRANSFER', destination: 'INTAKE', escape: false }, { symbol: '≈', label: 'SEAWALL', destination: 'OPEN COAST', escape: true }], caption: 'The transfer route returns to custody. The seawall path crosses the perimeter.' } }),
      obj('turbineDoor', 'archive', 'Switch-house door', 'unlock', 'door', 9.3, 5.1, 'A gear-shaped impression surrounds the lock.', { key: 'maintenanceKey', symbol: '⚙', flag: 'turbineOpen', opens: 'turbine', success: 'The maintenance key opens the switch house.' }),
      obj('closedFiles', 'archive', 'Sealed files', 'flavor', 'shelf', 1.4, 7.0, 'An entire shelf of closed appeals. The drawers are sealed; this is not the way out.'),
      obj('powerGrid', 'turbine', 'Routing board', 'puzzle', 'panel', 5.2, 1.7, 'Turn the conduit pieces to carry current from the left terminal to the right terminal.', { puzzle: { type: 'pipes', width: 3, height: 3, tiles: ['elbow', 'straight', 'elbow', 'elbow', 'block', 'elbow', 'elbow', 'straight', 'elbow'], initial: [0, 0, 0, 0, 0, 2, 2, 0, 1], source: { index: 3, side: 'W' }, target: { index: 5, side: 'E' }, prompt: 'Tap a conduit to rotate it. Connect IN to OUT, then energise.' }, flag: 'powerRestored', opens: 'yard', success: 'Current reaches the outer gate. A line of lamps wakes across the yard.' }),
      obj('generator', 'turbine', 'Reserve generator', 'clue', 'generator', 2.4, 6.2, 'The generator is sound. Only the connections are broken.', { clue: { type: 'notice', heading: 'RESERVE SUPPLY', stamp: 'READY', text: 'Inlet: left middle terminal. Outlet: right middle terminal. Turn the conduits to complete a continuous path.' } }),
      obj('yardDoor', 'turbine', 'Yard shutter', 'passage', 'door', 9.3, 5.1, 'A narrow strip of sky is visible above the shutter.', { requires: 'powerRestored', opens: 'yard' }),
      obj('seawallBox', 'yard', 'Wall keeper’s box', 'unlockPickup', 'locker', 2.2, 3.6, 'A small maintenance lock protects a second key.', { key: 'maintenanceKey', symbol: '⚙', item: 'seawallKey', flag: 'seawallBoxOpen', success: 'The wall keeper’s box opens. Inside: a steel key marked with two waves.' }),
      obj('returnGate', 'yard', 'Transfer gate', 'decoyExit', 'gate', 5.0, 0.45, 'The plaque has a triangular transfer mark. Its arrow curls back toward the intake block.', { symbol: '△', clue: { type: 'notice', heading: 'PRISONER TRANSFER', stamp: 'RETURN TO INTAKE', text: 'This route returns to the prison. The old evacuation plan shows another path.' } }),
      obj('seawallGate', 'yard', 'Seawall gate', 'exit', 'gate', 9.3, 5.0, 'Two keyways. One gear. Two waves. Beyond the bars, the coast.', { keys: ['maintenanceKey', 'seawallKey'], symbol: '≈', requires: 'powerRestored', flag: 'level2Exit', success: 'Both keys turn. The seawall gate opens. You are out.' }),
      obj('yardSign', 'yard', 'Weathered direction plate', 'clue', 'note', 7.0, 6.8, 'The arrows have survived the rain.', { clue: { type: 'routes', routes: [{ symbol: '△', label: 'TRANSFER', destination: 'INTAKE', escape: false }, { symbol: '≈', label: 'SEAWALL', destination: 'OPEN COAST', escape: true }], caption: 'The perimeter ends at the water.' } })
    ]
  }
];

export const ALL_OBJECTS = Object.fromEntries(LEVELS.flatMap(level => level.objects).map(object => [object.id, object]));
const objectLevels = Object.fromEntries(LEVELS.flatMap((level, i) => level.objects.map(object => [object.id, i])));
export const PIPE_SOLUTION = [1, 1, 2, 3, 0, 0, 0, 1, 3];
export const PIPE_KINDS = LEVELS[2].objects.find(o => o.id === 'powerGrid').puzzle.tiles;

export function newGame(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  return { saveVersion: SAVE_VERSION, version: VERSION, level: 0, revision: 0, inventory: [], flags: {}, collected: [], inspected: [], hintsUsed: [0, 0, 0], hintLog: [[], [], []], completedLevels: [], won: false, startedAt: now, updatedAt: now };
}

export function availableRooms(state) {
  const level = LEVELS[state.level];
  if (!level) return [];
  return level.rooms.filter(room => !room.requires || Boolean(state.flags[room.requires]));
}
export function getObjects(state, roomId) {
  if (!availableRooms(state).some(r => r.id === roomId)) return [];
  return LEVELS[state.level].objects.filter(o => o.room === roomId);
}
export function hasItem(state, id) { return state.inventory.includes(id); }
export function isInspected(state, id) { return state.inspected.includes(id); }
export function isDone(state, objectOrId) {
  const o = typeof objectOrId === 'string' ? ALL_OBJECTS[objectOrId] : objectOrId;
  if (!o) return false;
  return Boolean(o.flag && state.flags[o.flag]) || Boolean(o.item && state.collected.includes(o.id));
}
export function isLevelComplete(state) { return state.completedLevels.includes(state.level); }
export function objective(state) {
  if (state.won) return 'The coast is open. You escaped Blackwell.';
  if (isLevelComplete(state)) return 'Leave this wing and continue your escape.';
  if (state.level === 0) {
    if (!state.flags.cellOpen) return 'Find a way out of Cell 09.';
    if (!state.flags.laundryOpen) return 'Look for something that opens Intake.';
    if (!state.flags.intakeOpen) return 'Reach the Intake office.';
    return 'Find the secure transfer route.';
  }
  if (state.level === 1) {
    if (!state.flags.controlOpen) return 'Get into Security control.';
    if (!state.flags.circuitsSet) return 'Release the evidence shutter.';
    if (!hasItem(state, 'evidenceKey')) return 'Wait for an unwatched moment at the key cage.';
    return 'Open the archive bulkhead.';
  }
  if (!state.flags.turbineOpen) return 'Reach the old switch house.';
  if (!state.flags.powerRestored) return 'Restore a path for the current.';
  if (!hasItem(state, 'seawallKey')) return 'Find the second outer-gate key.';
  return 'Choose the route beyond the perimeter.';
}

/** Same deterministic visible cycle on browser and server. No action deadline is hidden from the UI. */
export function scanPhase(now = Date.now()) {
  const period = 8000;
  const phase = ((now % period) + period) % period;
  const safe = phase >= 5000;
  return { safe, progress: phase / period, remaining: (safe ? period - phase : 5000 - phase) / 1000, label: safe ? 'BLIND SPOT' : 'CAMERA WATCHING', period, phase };
}

/** N,E,S,W ports after clockwise rotation; 0 = north, 1 = east, 2 = south, 3 = west. */
export function pipePorts(kind, rotation = 0) {
  const base = kind === 'elbow' ? [0, 1] : kind === 'straight' ? [0, 2] : [];
  return base.map(direction => (direction + rotation) % 4);
}
export function evaluateCircuit(rotations) {
  if (!Array.isArray(rotations) || rotations.length !== 9 || rotations.some(n => !Number.isInteger(n) || n < 0 || n > 3)) return { connected: false, path: [], energized: [], valid: false };
  const ports = PIPE_KINDS.map((kind, index) => pipePorts(kind, rotations[index]));
  if (!ports[3].includes(3)) return { connected: false, path: [], energized: [], valid: true };
  const queue = [3];
  const parents = new Map([[3, -1]]);
  while (queue.length) {
    const index = queue.shift();
    if (index === 5 && ports[index].includes(1)) {
      const path = [];
      for (let step = index; step !== -1; step = parents.get(step)) path.unshift(step);
      return { connected: true, path, energized: [...parents.keys()], valid: true };
    }
    for (const direction of ports[index]) {
      const row = Math.floor(index / 3), col = index % 3;
      const nr = row + (direction === 2 ? 1 : direction === 0 ? -1 : 0);
      const nc = col + (direction === 1 ? 1 : direction === 3 ? -1 : 0);
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue;
      const next = nr * 3 + nc;
      if (!parents.has(next) && ports[next].includes((direction + 2) % 4)) { parents.set(next, index); queue.push(next); }
    }
  }
  return { connected: false, path: [], energized: [...parents.keys()], valid: true };
}

function hintStage(state) {
  const i = state.level;
  if (i === 0) {
    if (!hasItem(state, 'brassKey')) return [ 'The blanket is lifted at one corner. Look at the bunk.', 'Inspect the unmade bunk; something hard is hidden underneath the blanket.', 'Tap the bunk and take the brass key. Then use the triangular cell-door lock.' ];
    if (!state.flags.cellOpen) return [ 'The key and one lock share a shape.', 'The brass key has a triangle. So does the cell door.', 'Open the cell door with the brass key to reach B Block.' ];
    if (!state.flags.laundryOpen) return [ 'The laundry lock’s shapes also appear in Cell 09.', 'Count the marks beside each wall symbol, then use the order on the locker: triangle, square, circle.', 'The counts are triangle 7, square 1, circle 4. Enter 714 on the laundry locker.' ];
    if (!state.flags.intakeOpen) return [ 'The new key has a square head.', 'The Intake door in B Block has a square lock plate.', 'Use the square-headed Intake key on the Intake door.' ];
    if (!hasItem(state, 'transferKey')) return [ 'The transfer clerk left the drawer open.', 'Inspect the desk in the Intake office.', 'Take the diamond transfer key from the desk, then open Secure transfer.' ];
    return [ 'Find the lock with the same diamond as your last key.', 'Secure transfer is the way onward from Intake.', 'Open the Secure transfer door using the diamond key, then continue.' ];
  }
  if (i === 1) {
    if (!hasItem(state, 'serviceCard')) return [ 'A working member of staff would leave equipment in the service passage.', 'Something is tucked behind the label on the cleaning cart.', 'Inspect the cleaning cart, collect the service card, and open the control-room reader.' ];
    if (!state.flags.controlOpen) return [ 'The punched card belongs to the service route.', 'The control-room reader accepts the current service card.', 'Open the control-room reader with the service card.' ];
    if (!state.flags.circuitsSet) return [ 'The maintenance diagram identifies the three circuits.', 'Power Access and Shutter. Leave the Alarm isolated.', 'Set circle ON, triangle OFF, and square ON. Then apply the isolation panel.' ];
    if (!hasItem(state, 'evidenceKey')) return [ 'Watch the visible camera sweep before reaching into the key cage.', 'The camera has a three-second blind interval after every sweep.', 'At the key cage, wait until BLIND SPOT appears, then press Reach for key.' ];
    return [ 'The reserve key has a hexagonal bow.', 'The archive bulkhead has the matching hexagonal keyway.', 'Open the archive bulkhead with the evidence key, then continue.' ];
  }
  if (!hasItem(state, 'maintenanceKey')) return [ 'Maintenance left a drawer untouched in the archive.', 'Inspect the maintenance drawer.', 'Take the gear-marked maintenance key and open the switch-house door.' ];
  if (!state.flags.turbineOpen) return [ 'Your gear-marked key fits a working door.', 'The switch-house door has the same gear impression.', 'Open the switch-house door with the maintenance key.' ];
  if (!state.flags.powerRestored) return [ 'Current enters at the middle left and must leave at the middle right.', 'Use the upper row to take the current around the blocked centre.', 'From the left inlet, turn the path up, across the top row, then down and out right: middle-left W–N; top-left S–E; top-middle W–E; top-right W–S; middle-right N–E.' ];
  if (!hasItem(state, 'seawallKey')) return [ 'The outer gate needs a second key.', 'The wall keeper’s box uses a maintenance lock.', 'Open the wall keeper’s box with the maintenance key to collect the seawall key.' ];
  return [ 'The old plan distinguishes an escape route from a transfer route.', 'The triangular transfer arrow returns to Intake. The waves lead toward open water.', 'Open the Seawall gate with both keys. The Transfer gate leads back to custody.' ];
}
export function getHints(state) {
  const used = state.hintsUsed[state.level] || 0;
  return { used, remaining: MAX_HINTS - used, log: [...state.hintLog[state.level]], next: used < MAX_HINTS ? hintStage(state)[Math.min(used, 2)] : null };
}

export function inspect(state, id) {
  const object = typeof id === 'string' && Object.hasOwn(ALL_OBJECTS, id) ? ALL_OBJECTS[id] : null;
  if (!object || objectLevels[id] !== state.level || !availableRooms(state).some(r => r.id === object.room)) return null;
  return { ...object, done: isDone(state, object), owned: object.item ? hasItem(state, object.item) : false, viewed: isInspected(state, id), canUnlock: object.key ? hasItem(state, object.key) : true };
}

function unchanged(state, ok, message, event) { return { state, ok, message, changed: false, ...(event ? { event } : {}) }; }
function changed(state, draft, message, now, event) { draft.revision = state.revision + 1; draft.updatedAt = now; return { state: draft, ok: true, message, changed: true, ...(event ? { event } : {}) }; }
function cloneState(state) { return { ...state, inventory: [...state.inventory], flags: { ...state.flags }, collected: [...state.collected], inspected: [...state.inspected], hintsUsed: [...state.hintsUsed], hintLog: state.hintLog.map(log => [...log]), completedLevels: [...state.completedLevels] }; }
function pickup(draft, object) { if (!draft.inventory.includes(object.item)) draft.inventory.push(object.item); if (!draft.collected.includes(object.id)) draft.collected.push(object.id); }

export function reduce(state, action, opts = {}) {
  if (!isValidState(state)) return unchanged(state, false, 'This save is not compatible with this version. Start a new escape.');
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  if (!action || typeof action !== 'object' || Array.isArray(action)) return unchanged(state, false, 'No action received.');
  if (action.type === 'hint') {
    if (state.won || isLevelComplete(state)) return unchanged(state, false, 'This wing is already clear.');
    const hints = getHints(state);
    if (!hints.remaining) return unchanged(state, false, 'All three hints for this level have been used. You can reread them any time.');
    const draft = cloneState(state);
    draft.hintLog[state.level].push(hints.next);
    draft.hintsUsed[state.level]++;
    return changed(state, draft, hints.next, now, 'hint');
  }
  if (action.type === 'advance') {
    if (!isLevelComplete(state)) return unchanged(state, false, 'The way out of this wing is still locked.');
    if (state.won) return unchanged(state, true, 'You have already escaped.');
    const draft = cloneState(state);
    draft.level++;
    return changed(state, draft, LEVELS[draft.level].intro, now, 'level');
  }
  if (action.type !== 'interact' && action.type !== 'solve') return unchanged(state, false, 'Unknown action.');
  if (state.won) return unchanged(state, true, 'You have already escaped.');
  if (isLevelComplete(state)) return unchanged(state, false, 'This wing is clear. Continue to the next level.');
  const o = inspect(state, action.id);
  if (!o) return unchanged(state, false, 'That object is not reachable from this wing.');
  if (isDone(state, o)) return unchanged(state, true, o.item ? 'You already collected what was here.' : 'This is already open.', o.opens ? 'passage' : undefined);
  if (o.requires && !state.flags[o.requires]) return unchanged(state, false, o.id === 'yardDoor' || o.id === 'seawallGate' ? 'The outer gate has no power yet.' : 'The shutter is still locked. Check the isolation panel.');
  if (o.key && !hasItem(state, o.key)) return unchanged(state, false, `Locked. Look for ${ITEMS[o.key].title.toLowerCase()}${o.symbol ? ` (${o.symbol})` : ''}.`);
  if (o.keys && !o.keys.every(key => hasItem(state, key))) return unchanged(state, false, `You still need ${o.keys.filter(key => !hasItem(state, key)).map(key => ITEMS[key].title.toLowerCase()).join(' and ')}.`);
  if (action.type === 'solve' && o.kind !== 'puzzle') return unchanged(state, false, 'This object does not use that kind of combination.');
  if (o.kind === 'puzzle' && action.type !== 'solve') return unchanged(state, true, o.description, 'puzzle');
  if (o.kind === 'flavor' || o.kind === 'clue' || o.kind === 'decoyExit') {
    const message = o.kind === 'decoyExit' ? 'That gate returns to Intake. Read the arrow and look for the seawall route.' : o.description;
    if (state.inspected.includes(o.id)) return unchanged(state, true, message, 'inspect');
    const draft = cloneState(state); draft.inspected.push(o.id);
    return changed(state, draft, message, now, 'inspect');
  }
  if (o.kind === 'passage') return unchanged(state, true, `The route to ${LEVELS[state.level].rooms.find(r => r.id === o.opens)?.title || 'the next room'} is open.`, 'passage');
  if (o.kind === 'timed' && !scanPhase(now).safe) return unchanged(state, false, 'The camera is watching. Wait for the dark interval. Nothing was lost.', 'watched');
  if (o.kind === 'puzzle') {
    let correct = false;
    if (o.puzzle.type === 'code') correct = typeof action.value === 'string' && action.value === '714';
    if (o.puzzle.type === 'switches') correct = Array.isArray(action.value) && action.value.length === 3 && action.value.every((v, i) => v === [true, false, true][i]);
    if (o.puzzle.type === 'pipes') correct = evaluateCircuit(action.value).connected;
    if (!correct) return unchanged(state, false, o.puzzle.type === 'code' ? 'The wheels settle. The lock stays closed.' : o.puzzle.type === 'switches' ? 'The circuit diagram does not match. The shutter stays down.' : 'Current does not reach the outlet. Check the connections.', 'wrong');
  }
  const draft = cloneState(state);
  if (!draft.inspected.includes(o.id)) draft.inspected.push(o.id);
  if (o.item) pickup(draft, o);
  if (o.flag) draft.flags[o.flag] = true;
  if (o.id === 'powerGrid') draft.flags.pipeRotations = [...action.value];
  if (o.kind === 'exit') {
    draft.completedLevels.push(state.level);
    if (state.level === LEVELS.length - 1) draft.won = true;
    return changed(state, draft, o.success, now, draft.won ? 'win' : 'clear');
  }
  return changed(state, draft, o.success || 'Done.', now, o.opens ? 'unlock' : o.item ? 'pickup' : 'solved');
}

/** Defensive local-save validation. Network clients never supply authoritative state. */
export function isValidState(state) {
  if (!state || state.saveVersion !== SAVE_VERSION || state.version !== VERSION) return false;
  if (!Number.isInteger(state.level) || state.level < 0 || state.level >= LEVELS.length || !Number.isInteger(state.revision) || state.revision < 0) return false;
  const uniqueKnownIds = (list, catalog) => Array.isArray(list) && new Set(list).size === list.length && list.every(id => typeof id === 'string' && Object.hasOwn(catalog, id));
  if (!uniqueKnownIds(state.inventory, ITEMS) || !uniqueKnownIds(state.collected, ALL_OBJECTS) || !uniqueKnownIds(state.inspected, ALL_OBJECTS)) return false;
  if (!state.flags || typeof state.flags !== 'object' || Array.isArray(state.flags)) return false;
  if (!Array.isArray(state.hintsUsed) || state.hintsUsed.length !== LEVELS.length || state.hintsUsed.some(n => !Number.isInteger(n) || n < 0 || n > MAX_HINTS)) return false;
  if (!Array.isArray(state.hintLog) || state.hintLog.length !== LEVELS.length || state.hintLog.some((log, i) => !Array.isArray(log) || log.length !== state.hintsUsed[i] || log.some(text => typeof text !== 'string'))) return false;
  if (!Array.isArray(state.completedLevels) || ![state.level, state.level + 1].includes(state.completedLevels.length) || state.completedLevels.some((level, i) => level !== i)) return false;
  if (typeof state.won !== 'boolean' || state.won !== (state.completedLevels.length === LEVELS.length)) return false;
  return Number.isFinite(state.startedAt) && Number.isFinite(state.updatedAt);
}
