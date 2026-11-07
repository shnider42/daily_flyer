/**
 * NIGHT TRANSFER — Ashgate's shared campaign rules.
 * No player position is stored here. The client renders a local first-person view;
 * the server authorizes shared keys, doors, puzzles, hints and act transitions.
 * reduce(state, action, {now?, playerRoom?}) returns
 * {state, ok, message, changed, event?}. Read-only/idempotent actions preserve state.
 */
import { ANNEX_ITEMS, ANNEX_ROOMS, ANNEX_OBJECTS, ANNEX_LEVEL, normalizeSeed, normalizeGuidance, annexCase, annexObjectView, annexAccepts, annexGuidance, annexHints } from './annex.mjs';
export { GUIDANCE_TIERS, SIGNAL_TONES, annexSignal, circuitReadout } from './annex.mjs';
export const VERSION = '1.1.0';
export const SAVE_VERSION = 1;
export const MAX_HINTS = 3;
export const CAMPAIGNS = {
  escape: { id: 'escape', title: 'Night Transfer', levelIds: [0, 1, 2], startLevel: 0, endLevel: 2, roomCount: 9 },
  annex: { id: 'annex', title: 'Dead Air', levelIds: [3], startLevel: 3, endLevel: 3, roomCount: 4 },
};

export const ITEMS = {
  holdingKey: { id: 'holdingKey', title: 'Holding key', short: 'Holding key', symbol: '▭', level: 0, color: '#d1ae74', description: 'A flat brass bow. The holding-room lock bears the same rectangle.' },
  fileKey: { id: 'fileKey', title: 'Records key', short: 'Records key', symbol: '◆', level: 0, color: '#b7c9cf', description: 'A diamond bow. It belongs to the records-room lock.' },
  transferKey: { id: 'transferKey', title: 'Transfer key', short: 'Transfer key', symbol: '○', level: 0, color: '#c6b07d', description: 'A round brass bow, worn smooth by the night escort.' },
  bentKey: { id: 'bentKey', title: 'Bent storeroom key', short: 'Bent key', symbol: '×', level: 0, color: '#a66c56', decoy: true, description: 'The shaft is bent. Its tag reads RETIRED — STORE 4. It cannot turn a working lock.' },
  laundryCard: { id: 'laundryCard', title: 'Laundry service card', short: 'Service card', symbol: '▥', level: 1, color: '#96b9ae', description: 'A current punched card. The watchroom reader accepts the same stripe pattern.' },
  visitorPass: { id: 'visitorPass', title: 'Void visitor pass', short: 'Void pass', symbol: '×', level: 1, color: '#ad7c6c', decoy: true, description: 'A visitor pass with a large VOID stamp. No service access.' },
  shuttleKey: { id: 'shuttleKey', title: 'Dispatch key', short: 'Dispatch key', symbol: '⬡', level: 1, color: '#b4c4ca', description: 'A hexagonal steel bow. It opens the maintenance transfer door.' },
  plantKey: { id: 'plantKey', title: 'Plant key', short: 'Plant key', symbol: '✚', level: 2, color: '#c6ac70', description: 'The cross-shaped bow marks plant equipment. Its second tooth fits an outer gate.' },
  quayKey: { id: 'quayKey', title: 'River key', short: 'River key', symbol: '↗', level: 2, color: '#aacbc7', description: 'An outward arrow is engraved in the steel. The river gate has its matching keyway.' },
  ...ANNEX_ITEMS,
};

const room = (id, title, level, style, requires) => ({ id, title, level, style, width: 8, depth: 10, height: 3.2, spawn: { x: 0, z: 3.2, yaw: 0 }, objects: [], ...(requires ? { requires } : {}) });
export const ROOMS = {
  holding: room('holding', 'Holding 41', 0, 'holding'),
  washroom: room('washroom', 'Wash block', 0, 'washroom', 'washOpen'),
  records: room('records', 'Night records', 0, 'records', 'recordsOpen'),
  laundry: room('laundry', 'After-hours laundry', 1, 'laundry'),
  watchroom: room('watchroom', 'The watchroom', 1, 'watchroom', 'watchroomOpen'),
  dispatch: room('dispatch', 'Transfer dispatch', 1, 'dispatch', 'dispatchOpen'),
  boiler: room('boiler', 'Boiler room', 2, 'boiler'),
  sluice: room('sluice', 'Sluice control', 2, 'sluice', 'sluiceOpen'),
  quay: room('quay', 'The prison quay', 2, 'quay', 'quayOpen'),
  ...ANNEX_ROOMS,
};

const makeObject = (id, roomId, title, kind, prop, x, z, y, ry, description, extra = {}) => ({ id, room: roomId, level: ROOMS[roomId].level, title, kind, prop, x, z, y, ry, description, ...extra });
const note = (heading, lines, extra = {}) => ({ type: 'notice', heading, lines, entries: [], ...extra });
const turnDiagram = () => ({ type: 'balance', heading: 'EMERGENCY PRESSURE BALANCE', lines: ['Count clockwise turns from fully closed.', 'All three settings add to seven.'], entries: [{ symbol: 'Σ', label: 'TOTAL', value: '7 turns' }, { symbol: '⇉', label: 'BYPASS', value: '2 × FEED' }, { symbol: '▽', label: 'DRAIN', value: 'FEED − 1' }], caption: 'The feed sets the other two. Keep every valve between 0 and 6 turns.' });
const objects = [
  makeObject('bunkPocket', 'holding', 'The folded blanket', 'pickup', 'bed', -2.55, -0.8, 0.85, Math.PI / 2, 'One corner of the blanket is stitched shut with fresh thread. A hard shape sits inside.', { item: 'holdingKey', success: 'A flat brass key slips from the blanket seam.' }),
  makeObject('routeMarks', 'holding', 'The transfer route', 'clue', 'note', 1.95, -4.78, 1.7, 0, 'Four enamel symbols follow a painted line from IN to OUT.', { clue: { type: 'order', heading: 'IN → NIGHT TRANSFER → OUT', lines: ['Follow the line from left to right.'], entries: [{ symbol: '▥', label: 'GATE', value: '1' }, { symbol: '◉', label: 'EYE', value: '2' }, { symbol: '✦', label: 'LAMP', value: '3' }, { symbol: '☾', label: 'MOON', value: '4' }], caption: 'The same enamel symbols were fitted to the wash-block service cabinet.' } }),
  makeObject('floorDrain', 'holding', 'The loose drain', 'pickup', 'drain', 2.65, 2.1, 0.12, 0, 'A piece of metal catches the light under the loose grate.', { item: 'bentKey', success: 'A bent key. Its tag reads RETIRED — STORE 4.' }),
  makeObject('dryBasin', 'holding', 'Dry washbasin', 'flavor', 'sink', 3.5, -1.8, 0.9, -Math.PI / 2, 'The tap has been isolated. A ring of mineral dust marks the last water level.'),
  makeObject('holdingDoor', 'holding', 'Holding-room door', 'door', 'door', 0, -4.74, 1.45, 0, 'A rectangular impression surrounds the brass keyway.', { targetRoom: 'washroom', key: 'holdingKey', flag: 'washOpen', symbol: '▭', success: 'The holding lock turns. The wash block is open.' }),

  makeObject('washReturn', 'washroom', 'Back to Holding 41', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The holding-room door remains open.', { targetRoom: 'holding' }),
  makeObject('routeCabinet', 'washroom', 'Enamel service cabinet', 'puzzle', 'locker', -3.35, -0.75, 1.2, Math.PI / 2, 'Four enamel buttons. The latch asks for the transfer route, from IN to OUT.', { puzzle: { type: 'sequence', length: 4, options: [{ symbol: '☾', label: 'MOON', value: 'moon' }, { symbol: '✦', label: 'LAMP', value: 'lamp' }, { symbol: '▥', label: 'GATE', value: 'gate' }, { symbol: '◉', label: 'EYE', value: 'eye' }], prompt: 'Press four symbols in route order, then release the latch.' }, item: 'fileKey', flag: 'routeReleased', success: 'The route is accepted. A diamond-headed records key hangs inside.' }),
  makeObject('washNotice', 'washroom', 'An old route card', 'clue', 'note', 2.2, -4.78, 1.7, 0, 'The paper has been crossed out with a thick diagonal line.', { clue: note('PREVIOUS TRANSFER ROUTE', ['Moon → Gate → Lamp → Eye.', 'Replaced by the enamel route beside Holding 41.'], { stamp: 'OBSOLETE', caption: 'A dated instruction is not always a useful one.' }) }),
  makeObject('linenBin', 'washroom', 'The linen bin', 'flavor', 'basket', 2.7, 1.5, 0.65, 0, 'A pile of damp uniforms. Nothing is sewn into these seams.'),
  makeObject('recordsDoor', 'washroom', 'Records-room door', 'door', 'door', 0, -4.74, 1.45, 0, 'The lock plate is diamond-shaped.', { targetRoom: 'records', key: 'fileKey', flag: 'recordsOpen', symbol: '◆', success: 'The records key turns. Night records is open.' }),

  makeObject('recordsReturn', 'records', 'Back to the wash block', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The wash-block passage is clear.', { targetRoom: 'washroom' }),
  makeObject('transferDesk', 'records', 'Escort desk', 'pickup', 'desk', -2.2, -1.8, 1.1, 0, 'An escort key lies beneath the edge of an unfinished transfer sheet.', { item: 'transferKey', success: 'You take the round-headed night-transfer key.' }),
  makeObject('departureBoard', 'records', 'The departure sheet', 'clue', 'note', -2.25, -4.78, 1.75, 0, 'The night route continues behind the service rooms.', { clue: note('ASHGATE / NIGHT TRANSFER', ['03:20 — Holding 41.', 'Escort route: records → laundry → dispatch.'], { stamp: 'ESCORT PENDING', caption: 'The round key is assigned to the service transfer door.' }) }),
  makeObject('lostProperty', 'records', 'Unclaimed property', 'flavor', 'locker', 3.35, -0.8, 1.2, -Math.PI / 2, 'Receipts, wallets, and old spectacles. The cabinet is sealed for audit.'),
  makeObject('transferExit', 'records', 'Service transfer door', 'exit', 'door', 0, -4.74, 1.45, 0, 'A round keyway. Beyond the wired glass, the laundry lights are still on.', { keys: ['transferKey'], flag: 'act0Exit', symbol: '○', success: 'You leave the holding wing through the night-transfer route.' }),

  makeObject('laundryCart', 'laundry', 'The last laundry cart', 'pickup', 'cart', -2.4, -0.7, 1.0, 0, 'A punched card is tucked into the cart’s inspection sleeve.', { item: 'laundryCard', success: 'A current laundry service card. Its punched edge matches the watchroom reader.' }),
  makeObject('voidPass', 'laundry', 'Discarded visitor pass', 'pickup', 'note', 2.9, 2.0, 0.25, 0, 'A plastic pass lies face-down beside the dryer.', { item: 'visitorPass', success: 'The visitor pass bears a large VOID stamp. No service access.' }),
  makeObject('laundrySchedule', 'laundry', 'The patrol schedule', 'clue', 'note', 2.1, -4.78, 1.75, 0, 'A maintenance notice describes the live camera cycle.', { clue: note('AUTO PATROL / RESERVE POWER', ['5 seconds watched. 3 seconds blind.', 'An authorised shutter can be opened during the blind interval.'], { stamp: 'VISUAL INDICATOR ACTIVE', caption: 'The indicator at the shutter shows the current state.' }) }),
  makeObject('dryer', 'laundry', 'Silent spin dryer', 'flavor', 'generator', 3.15, -0.9, 1.1, -Math.PI / 2, 'The dryer is cold. Its work is finished for the night.'),
  makeObject('watchroomDoor', 'laundry', 'Watchroom reader', 'door', 'door', 0, -4.74, 1.45, 0, 'A punched service-card reader holds this door shut.', { targetRoom: 'watchroom', key: 'laundryCard', flag: 'watchroomOpen', symbol: '▥', success: 'The card releases the watchroom lock.' }),

  makeObject('watchReturn', 'watchroom', 'Back to laundry', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The laundry passage is clear.', { targetRoom: 'laundry' }),
  makeObject('cameraArchive', 'watchroom', 'Camera contact sheet', 'clue', 'monitor', -3.5, -0.8, 1.55, Math.PI / 2, 'Five saved frames. Some are watched; others show a dark interval.', { clue: { type: 'frames', heading: 'MAINTENANCE CONTACT SHEET', lines: ['Read only the DARK frames, from left to right.'], entries: [{ symbol: '◉', label: '01 · WATCHED', value: '2', watched: true }, { symbol: '◌', label: '02 · DARK', value: '8', watched: false }, { symbol: '◌', label: '03 · DARK', value: '4', watched: false }, { symbol: '◉', label: '04 · WATCHED', value: '1', watched: true }, { symbol: '◌', label: '05 · DARK', value: '6', watched: false }], caption: 'Three unwatched readings authorise the shutter override.' } }),
  makeObject('authorisationPanel', 'watchroom', 'Shutter authorisation', 'puzzle', 'panel', 3.68, -0.5, 1.45, -Math.PI / 2, 'The override asks for three readings from the maintenance contact sheet.', { puzzle: { type: 'code', length: 3, symbols: ['I', 'II', 'III'], prompt: 'Enter the three dark-frame readings in their original order.' }, flag: 'overrideReady', success: 'The override is armed. Open the shutter when the live camera reaches its blind interval.' }),
  makeObject('watchCamera', 'watchroom', 'The patrol lens', 'flavor', 'camera', 2.05, -4.7, 2.3, 0, 'The camera has its own reserve supply. Its visible indicator darkens between sweeps.'),
  makeObject('dispatchShutter', 'watchroom', 'The watched shutter', 'timed', 'gate', 0, -4.74, 1.45, 0, 'The service override must be armed first. Then wait for the visible BLIND interval.', { targetRoom: 'dispatch', requires: 'overrideReady', flag: 'dispatchOpen', symbol: '◌', puzzle: { type: 'scan', prompt: 'Open the shutter during the BLIND interval.' }, success: 'The shutter unlatches while the lens looks away. Dispatch is open.' }),

  makeObject('dispatchReturn', 'dispatch', 'Back to the watchroom', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The released shutter stays open.', { targetRoom: 'watchroom' }),
  makeObject('dispatchDesk', 'dispatch', 'The dispatch tray', 'pickup', 'desk', -2.1, -1.7, 1.1, 0, 'A hexagonal key remains in the tray marked MAINTENANCE TRANSFER.', { item: 'shuttleKey', success: 'You take the hexagonal dispatch key.' }),
  makeObject('transferManifest', 'dispatch', 'Cancelled movement order', 'clue', 'note', -2.25, -4.78, 1.75, 0, 'The official transport is not coming.', { clue: note('ASHGATE NIGHT MOVEMENT', ['Transport cancelled. Escort staff reassigned.', 'Maintenance passage remains accessible with the dispatch key.'], { stamp: 'CANCELLED', caption: 'A route was left behind when the plan changed.' }) }),
  makeObject('emptyCage', 'dispatch', 'An empty holding cage', 'flavor', 'cage', 3.0, 0.3, 1.35, -Math.PI / 2, 'The cage is empty. It would take you farther inside, not out.'),
  makeObject('dispatchExit', 'dispatch', 'Maintenance transfer', 'exit', 'door', 0, -4.74, 1.45, 0, 'A hexagonal keyway guards the old plant passage.', { keys: ['shuttleKey'], flag: 'act1Exit', symbol: '⬡', success: 'The maintenance transfer door opens onto the old plant.' }),

  makeObject('toolChest', 'boiler', 'The plant tool chest', 'pickup', 'locker', -3.3, -0.8, 1.05, Math.PI / 2, 'The tool chest is unlocked. A cross-headed plant key lies beneath a rag.', { item: 'plantKey', success: 'You take the plant key. It has a second, smaller tooth.' }),
  makeObject('pressurePlate', 'boiler', 'Emergency balance diagram', 'clue', 'note', 2.1, -4.78, 1.65, 0, 'A diagram relates the three sluice valves to one another.', { clue: turnDiagram() }),
  makeObject('coldBoiler', 'boiler', 'The cooling boiler', 'flavor', 'generator', 3.15, -0.8, 1.2, -Math.PI / 2, 'The reserve pressure is intact. The sluice controls decide where it can go.'),
  makeObject('routeBoard', 'boiler', 'Flood evacuation plate', 'clue', 'note', 2.1, 4.78, 1.75, Math.PI, 'The perimeter route follows the old river outlet.', { clue: note('FLOOD EVACUATION', ['Balance the sluice pressure before entering the quay.', 'The outward arrow leads to the river path. The return arrow leads to receiving.'], { stamp: 'RIVER OUTFALL', caption: 'Every route has a destination. Read the arrows.' }) }),
  makeObject('sluiceDoor', 'boiler', 'Sluice-room door', 'door', 'door', 0, -4.74, 1.45, 0, 'A cross-shaped mark surrounds the keyway.', { targetRoom: 'sluice', key: 'plantKey', flag: 'sluiceOpen', symbol: '✚', success: 'The plant key releases the sluice-room lock.' }),

  makeObject('sluiceReturn', 'sluice', 'Back to the boiler room', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The plant passage is clear.', { targetRoom: 'boiler' }),
  makeObject('valveBank', 'sluice', 'Emergency valve bank', 'puzzle', 'valve', -3.6, -0.5, 1.3, Math.PI / 2, 'Three numbered valves: FEED, BYPASS and DRAIN. Their relationships are shown on the emergency diagram.', { puzzle: { type: 'valves', labels: ['FEED', 'BYPASS', 'DRAIN'], symbols: ['●', '⇉', '▽'], min: 0, max: 6, initial: [0, 0, 0], prompt: 'Set the clockwise turns from closed, then balance the pressure.' }, flag: 'pressureBalanced', success: 'The gauges settle together. The quay lock has pressure.' }),
  makeObject('pressureGauge', 'sluice', 'The current balance plate', 'clue', 'panel', 3.68, -0.7, 1.55, -Math.PI / 2, 'A second copy of the emergency settings survives beside the gauges.', { clue: turnDiagram() }),
  makeObject('oldSettings', 'sluice', 'An old calibration card', 'clue', 'note', -2.25, -4.78, 1.7, 0, 'Someone has rejected these settings in red ink.', { clue: note('OLD CALIBRATION / 3 · 3 · 3', ['Valid before the drain was rerouted.', 'Use the current emergency balance diagram.'], { stamp: 'DO NOT USE', caption: 'The old settings no longer balance the system.' }) }),
  makeObject('quayDoor', 'sluice', 'Pressure-locked quay door', 'door', 'door', 0, -4.74, 1.45, 0, 'The door will release only when the three valves balance the pressure.', { targetRoom: 'quay', requires: 'pressureBalanced', flag: 'quayOpen', symbol: 'Σ', success: 'The pressure lock releases. Cold river air enters the sluice room.' }),

  makeObject('quayReturn', 'quay', 'Back to sluice control', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The sluice passage remains open.', { targetRoom: 'sluice' }),
  makeObject('keeperBox', 'quay', 'The river keeper’s box', 'pickup', 'locker', -3.3, -0.9, 1.2, Math.PI / 2, 'A plant lock protects the keeper’s spare gate key.', { key: 'plantKey', item: 'quayKey', flag: 'keeperOpen', symbol: '✚', success: 'The plant key opens the box. Inside is a steel key marked with an outward arrow.' }),
  makeObject('canalPlan', 'quay', 'Quay direction plate', 'clue', 'note', -2.15, -4.78, 1.65, 0, 'Two routes leave the quay. Only one crosses the perimeter.', { clue: { type: 'routes', heading: 'QUAY / NIGHT ACCESS', lines: ['Follow the destination, not the nearest gate.'], entries: [{ symbol: '↶', label: 'RECEIVING', value: 'BACK TO ASHGATE' }, { symbol: '↗', label: 'RIVER PATH', value: 'BEYOND THE PERIMETER' }], caption: 'The outward arrow leaves the prison boundary.' } }),
  makeObject('returnGate', 'quay', 'Receiving gate', 'flavor', 'gate', 3.72, 1.0, 1.45, -Math.PI / 2, 'The return arrow points to ASHGATE RECEIVING. This gate would lead back into custody.', { symbol: '↶', clue: note('ASHGATE RECEIVING', ['Return route to the prison intake block.'], { stamp: '↶ RETURN', caption: 'The river path is the other route.' }) }),
  makeObject('quayExit', 'quay', 'The river gate', 'exit', 'gate', 0, -4.74, 1.45, 0, 'Two keyways: a cross and an outward arrow. Beyond the bars, the river path leaves Ashgate.', { keys: ['plantKey', 'quayKey'], requires: 'pressureBalanced', flag: 'act2Exit', symbol: '↗', success: 'Both keys turn. The river gate opens. Ashgate is behind you.' }),
  ...Object.values(ANNEX_OBJECTS),
];

export const OBJECTS = Object.fromEntries(objects.map(object => [object.id, object]));
for (const object of objects) ROOMS[object.room].objects.push(object.id);
export const LEVELS = [
  { id: 'the-route', number: '01', title: 'The route they left', shortTitle: 'The holding wing', mechanic: 'Observation', startRoom: 'holding', roomIds: ['holding', 'washroom', 'records'], intro: 'The night transfer never arrived. Someone left the service route within reach.', outro: 'The official route takes you behind the prison’s public face.', accent: '#d6a66f' },
  { id: 'dark-frames', number: '02', title: 'Between the frames', shortTitle: 'The watch', mechanic: 'Surveillance', startRoom: 'laundry', roomIds: ['laundry', 'watchroom', 'dispatch'], intro: 'The staff have left. The cameras have not. Their blind intervals are visible.', outro: 'Dispatch is empty. The old plant passage is your remaining route out.', accent: '#9ac2b2' },
  { id: 'the-outfall', number: '03', title: 'The river remembers', shortTitle: 'The outfall', mechanic: 'Mechanical systems', startRoom: 'boiler', roomIds: ['boiler', 'sluice', 'quay'], intro: 'Three valves hold the quay shut. Beyond it, one gate leads to the river.', outro: 'Cold air. Running water. No roll call waiting at the end of the path.', accent: '#a4c4d4' },
  ANNEX_LEVEL,
].map((level, index) => ({ campaign: 'escape', ...level, level: index, rooms: level.roomIds.map(id => ROOMS[id]), objects: objects.filter(object => object.level === index) }));

const ROUTE = ['gate', 'eye', 'lamp', 'moon'];
const FRAME_CODE = '846';
const VALVES = [2, 4, 1];
const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
const nowFrom = options => Number.isFinite(options?.now) ? options.now : Date.now();

export function newGame(options = {}) {
  const now = nowFrom(options);
  const campaign = options.campaign === 'annex' ? 'annex' : 'escape';
  const seed = campaign === 'annex' ? normalizeSeed(options.seed ?? Math.floor(Math.random() * 4294967296)) : 0;
  return { game: 'night-transfer', version: VERSION, saveVersion: SAVE_VERSION, campaign, seed, level: CAMPAIGNS[campaign].startLevel, revision: 0, inventory: [], flags: {}, collected: [], inspected: [], hintsUsed: [0, 0, 0, 0], hintLog: [[], [], [], []], completedLevels: [], won: false, startedAt: now, updatedAt: now };
}
export function availableRooms(state) { return LEVELS[state.level]?.campaign === state.campaign ? LEVELS[state.level].rooms.filter(room => !room.requires || state.flags[room.requires]) : []; }
export function getObjects(state, roomId, guidance = 'moderate') { return availableRooms(state).some(room => room.id === roomId) ? ROOMS[roomId].objects.map(id => objectView(state, id, guidance)) : []; }
/** Current-room objects and previously recorded clues can be rendered without mutating state. */
export function objectView(state, id, guidance = 'moderate') {
  if (!own(OBJECTS, id)) return null;
  const object = OBJECTS[id];
  if (LEVELS[object.level].campaign !== state.campaign || (!state.inspected.includes(id) && (object.level !== state.level || !availableRooms(state).some(room => room.id === object.room)))) return null;
  return state.campaign === 'annex' ? annexObjectView(state, id, guidance) : JSON.parse(JSON.stringify(object));
}
export function campaignSummary(state) {
  const campaign = CAMPAIGNS[state.campaign];
  return campaign ? { ...campaign, levelIds: [...campaign.levelIds], completed: state.completedLevels.length, won: state.won, level: state.level, seed: state.seed } : null;
}
export function hasItem(state, id) { return state.inventory.includes(id); }
export function isDone(state, objectOrId) {
  const object = typeof objectOrId === 'string' ? (own(OBJECTS, objectOrId) ? OBJECTS[objectOrId] : null) : objectOrId;
  if (!object) return false;
  if (object.item) return state.collected.includes(object.id);
  if (object.flag) return state.flags[object.flag] === true;
  return (object.kind === 'clue' || object.kind === 'flavor') && state.inspected.includes(object.id);
}
export function inspect(state, id) {
  if (!own(OBJECTS, id)) return null;
  const object = OBJECTS[id];
  if (object.level !== state.level || !availableRooms(state).some(room => room.id === object.room)) return null;
  return { ...object, done: isDone(state, object), viewed: state.inspected.includes(id), owned: Boolean(object.item && hasItem(state, object.item)), canUnlock: (!object.key || hasItem(state, object.key)) && (!object.keys || object.keys.every(key => hasItem(state, key))) && (!object.requires || state.flags[object.requires] === true) };
}

/** The final three seconds of each eight-second cycle are visibly blind. */
export function scanPhase(now = Date.now()) {
  const period = 8000;
  const phase = ((now % period) + period) % period;
  const safe = phase >= 5000;
  return { safe, progress: phase / period, remaining: (safe ? period - phase : 5000 - phase) / 1000, label: safe ? 'BLIND INTERVAL' : 'CAMERA WATCHING', phase, period };
}

export function objective(state) {
  if (state.campaign === 'annex') return annexGuidance(state, 'expert').objective;
  if (state.won) return 'The river path is open. You escaped Ashgate.';
  if (state.level === 0) {
    if (!state.flags.washOpen) return 'Find a way out of Holding 41.';
    if (!state.flags.routeReleased) return 'Follow the enamel transfer route.';
    if (!state.flags.recordsOpen) return 'Open the records-room lock.';
    return 'Find the night escort’s way into the service wing.';
  }
  if (state.level === 1) {
    if (!state.flags.watchroomOpen) return 'Reach the watchroom through the laundry route.';
    if (!state.flags.overrideReady) return 'Read what the cameras did not watch.';
    if (!state.flags.dispatchOpen) return 'Open the authorised shutter during a blind interval.';
    return 'Find the key to the maintenance transfer.';
  }
  if (!state.flags.sluiceOpen) return 'Reach the sluice controls.';
  if (!state.flags.pressureBalanced) return 'Balance the three emergency valves.';
  if (!state.flags.quayOpen) return 'Release the pressure-locked quay door.';
  if (!hasItem(state, 'quayKey')) return 'Find the river gate’s second key.';
  return 'Follow the outward arrow beyond the perimeter.';
}

function hintStage(state) {
  if (state.campaign === 'annex') return annexHints(state);
  if (state.level === 0) {
    if (!hasItem(state, 'holdingKey')) return ['The blanket has been repaired more recently than the room.', 'Look inside the freshly stitched corner of the folded blanket.', 'Search the folded blanket for the holding key, then use the rectangular holding-room lock.'];
    if (!state.flags.washOpen) return ['The brass key and a lock share a rectangular mark.', 'The holding-room door uses the flat brass key.', 'Use the holding key on the door to enter the wash block.'];
    if (!state.flags.routeReleased) return ['The cabinet’s enamel symbols also appear beside Holding 41.', 'Follow the transfer-route line from IN to OUT, left to right.', 'Press GATE → EYE → LAMP → MOON on the enamel cabinet, then release the latch.'];
    if (!state.flags.recordsOpen) return ['The new key has a diamond bow.', 'The records-room door has the matching diamond mark.', 'Use the records key on the door beyond the wash block.'];
    if (!hasItem(state, 'transferKey')) return ['The night escort left something beneath an unfinished sheet.', 'Search the escort desk in Night records.', 'Take the round-headed transfer key from the escort desk, then open the service transfer door.'];
    return ['The escort’s key follows the service route.', 'The service transfer door has a round keyway.', 'Open the service transfer door with the round transfer key.'];
  }
  if (state.level === 1) {
    if (!hasItem(state, 'laundryCard')) return ['A working card would travel with the equipment.', 'Inspect the sleeve on the last laundry cart.', 'Search the laundry cart for the service card, then use the watchroom reader.'];
    if (!state.flags.watchroomOpen) return ['The punched edge identifies a service credential.', 'The watchroom reader accepts the current laundry card.', 'Use the laundry service card at the watchroom door.'];
    if (!state.flags.overrideReady) return ['The contact sheet separates watched frames from dark ones.', 'Ignore both WATCHED frames. Read the three DARK digits left to right.', 'The dark frames read 8, 4, 6. Enter 846 on Shutter authorisation.'];
    if (!state.flags.dispatchOpen) return ['Authorisation and timing are separate parts of the shutter lock.', 'The live camera leaves a three-second blind interval in every eight seconds.', 'At the watched shutter, wait for BLIND INTERVAL, then open it. A mistimed try loses nothing.'];
    if (!hasItem(state, 'shuttleKey')) return ['Dispatch retained one route when the transport was cancelled.', 'Inspect the tray marked MAINTENANCE TRANSFER.', 'Take the hexagonal dispatch key from the desk, then open Maintenance transfer.'];
    return ['The dispatch key has a hexagonal bow.', 'Maintenance transfer has the same hexagonal mark.', 'Use the dispatch key to open the maintenance transfer door.'];
  }
  if (!hasItem(state, 'plantKey')) return ['Plant equipment has its own key.', 'The tool chest in the boiler room was left unlocked.', 'Search the plant tool chest for the cross-headed key, then open the sluice-room door.'];
  if (!state.flags.sluiceOpen) return ['The plant key and sluice lock share a cross.', 'The cross-headed key opens the sluice-room door.', 'Use the plant key to enter Sluice control.'];
  if (!state.flags.pressureBalanced) return ['The emergency diagram relates the valves; the old calibration card is crossed out.', 'BYPASS is twice FEED. DRAIN is one below FEED. The three values must total seven.', 'Set FEED to 2, BYPASS to 4 and DRAIN to 1. Then balance the pressure.'];
  if (!state.flags.quayOpen) return ['The balanced pressure has released another lock.', 'The quay door is now ready to open.', 'Open the pressure-locked quay door to reach the river side of the prison.'];
  if (!hasItem(state, 'quayKey')) return ['The river gate needs a second key.', 'The keeper’s box uses a plant lock.', 'Use the plant key on the river keeper’s box to collect the arrow-marked river key.'];
  return ['Read the destinations on the quay direction plate.', 'The return arrow leads to receiving. The outward arrow follows the river.', 'Open the river gate, marked ↗, with both the plant key and river key.'];
}
export function getHint(state) { return state.won || state.hintsUsed[state.level] >= MAX_HINTS ? null : hintStage(state)[state.hintsUsed[state.level]]; }
export function getHints(state) { const used = state.hintsUsed[state.level]; return { used, remaining: MAX_HINTS - used, log: [...state.hintLog[state.level]], next: getHint(state) }; }
/** Guidance is a local presentation choice. It never consumes or modifies shared hints. */
export function getGuidance(state, guidance = 'moderate') {
  if (state.campaign === 'annex') return annexGuidance(state, guidance);
  const tier = normalizeGuidance(guidance);
  return { tier, stage: state.won ? 'complete' : `wing-${state.level}`, objective: objective(state), detail: state.won || tier === 'expert' ? '' : hintStage(state)[tier === 'simple' ? 1 : 0], references: [], audioRequired: false };
}

const unchanged = (state, ok, message, event) => ({ state, ok, message, changed: false, ...(event ? { event } : {}) });
function cloneState(state) { return { ...state, inventory: [...state.inventory], flags: Object.fromEntries(Object.entries(state.flags).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])), collected: [...state.collected], inspected: [...state.inspected], hintsUsed: [...state.hintsUsed], hintLog: state.hintLog.map(log => [...log]), completedLevels: [...state.completedLevels] }; }
function changed(state, draft, message, now, event) { draft.revision = state.revision + 1; draft.updatedAt = now; return { state: draft, ok: true, message, changed: true, ...(event ? { event } : {}) }; }
const sameArray = (value, expected) => Array.isArray(value) && value.length === expected.length && expected.every((entry, index) => value[index] === entry);

export function reduce(state, action, options = {}) {
  if (!isValidState(state)) return unchanged(state, false, 'This save is not compatible. Start a new night transfer.');
  if (!action || typeof action !== 'object' || Array.isArray(action)) return unchanged(state, false, 'No action received.');
  if (!['interact', 'solve', 'hint', 'enter'].includes(action.type)) return unchanged(state, false, 'Unknown action.');
  const now = nowFrom(options);
  if (action.type === 'hint') {
    const next = getHint(state);
    if (!next) return unchanged(state, false, state.won ? 'You are already outside.' : 'All three hints for this act have been used. You can reread them any time.');
    const draft = cloneState(state);
    draft.hintsUsed[state.level]++;
    draft.hintLog[state.level].push(next);
    return changed(state, draft, next, now, { type: 'hint', level: state.level });
  }
  if (state.won) return unchanged(state, true, 'You have already escaped Ashgate.', { type: 'win' });
  if (action.type === 'enter') {
    if (typeof action.room !== 'string' || !availableRooms(state).some(room => room.id === action.room)) return unchanged(state, false, 'That room is still locked or belongs to another act.');
    return unchanged(state, true, ROOMS[action.room].title, { type: 'room', room: action.room });
  }
  const object = inspect(state, action.id);
  if (!object) return unchanged(state, false, 'That object is not reachable in this act.');
  if ((action.room !== undefined && action.room !== object.room) || (options.playerRoom !== undefined && options.playerRoom !== object.room)) return unchanged(state, false, 'Move into the object’s room before interacting.');
  if (action.type === 'solve' && object.kind !== 'puzzle') return unchanged(state, false, 'That object does not accept a combination.');
  if (object.kind === 'clue' || object.kind === 'flavor') {
    if (state.inspected.includes(object.id)) return unchanged(state, true, object.description, { type: 'inspect', id: object.id });
    const draft = cloneState(state); draft.inspected.push(object.id);
    return changed(state, draft, object.description, now, { type: 'inspect', id: object.id });
  }
  if (isDone(state, object)) return unchanged(state, true, object.success || 'You already investigated this.', object.targetRoom ? { type: 'room', room: object.targetRoom } : { type: 'inspect', id: object.id });
  if (object.requires && state.flags[object.requires] !== true) return unchanged(state, false, object.lockedMessage || (object.id === 'dispatchShutter' ? 'The shutter override is not authorised. Read the maintenance contact sheet.' : 'The pressure lock is still closed. Balance the emergency valves.'));
  if (object.key && !hasItem(state, object.key)) return unchanged(state, false, `Locked. The ${ITEMS[object.key].title.toLowerCase()} belongs here${object.symbol ? ` (${object.symbol})` : ''}.`);
  if (object.keys && !object.keys.every(key => hasItem(state, key))) return unchanged(state, false, `You still need ${object.keys.filter(key => !hasItem(state, key)).map(key => ITEMS[key].title.toLowerCase()).join(' and ')}.`);
  if (object.kind === 'puzzle' && action.type !== 'solve') return unchanged(state, true, object.description, { type: 'puzzle', id: object.id });
  if (object.kind === 'timed' && !scanPhase(now).safe) return unchanged(state, false, 'The camera is watching. Wait for BLIND INTERVAL. Nothing was lost.', { type: 'watched', id: object.id });
  if (object.kind === 'puzzle') {
    const correct = state.campaign === 'annex' ? annexAccepts(state, object.id, action.value) : object.puzzle.type === 'sequence' ? sameArray(action.value, ROUTE) : object.puzzle.type === 'code' ? typeof action.value === 'string' && action.value === FRAME_CODE : object.puzzle.type === 'valves' ? sameArray(action.value, VALVES) : false;
    if (!correct) return unchanged(state, false, object.failure || (object.puzzle.type === 'sequence' ? 'The route is wrong. The cabinet stays shut.' : object.puzzle.type === 'code' ? 'Those readings do not authorise the shutter.' : 'The gauges disagree. Recheck the emergency balance diagram.'), { type: 'wrong', id: object.id });
  }
  if (object.kind === 'door' && !object.flag) {
    if (!availableRooms(state).some(room => room.id === object.targetRoom)) return unchanged(state, false, 'The passage is still locked.');
    return unchanged(state, true, `Return to ${ROOMS[object.targetRoom].title}.`, { type: 'room', room: object.targetRoom });
  }
  const draft = cloneState(state);
  if (!draft.inspected.includes(object.id)) draft.inspected.push(object.id);
  if (object.item) { draft.inventory.push(object.item); draft.collected.push(object.id); }
  if (object.flag) draft.flags[object.flag] = true;
  if (object.id === 'valveBank') draft.flags.valveSettings = [...action.value];
  if (object.id === 'annexRouteLock') draft.flags.annexRouteOrder = [...action.value];
  if (object.id === 'annexRelayBoard') draft.flags.annexRelaySettings = [...action.value];
  if (object.id === 'annexReceiver') draft.flags.annexSignalCode = action.value;
  if (object.id === 'annexInterlock') draft.flags.annexInterlockSettings = [...action.value];
  if (object.kind === 'exit') {
    draft.completedLevels.push(state.level);
    if (state.level === CAMPAIGNS[state.campaign].endLevel) { draft.won = true; return changed(state, draft, object.success, now, { type: 'win', level: state.level }); }
    draft.level++;
    return changed(state, draft, object.success, now, { type: 'level', level: draft.level, room: LEVELS[draft.level].startRoom });
  }
  return changed(state, draft, object.success || 'Done.', now, object.targetRoom ? { type: 'room', room: object.targetRoom } : { type: object.item ? 'pickup' : 'solved', id: object.id });
}

const booleanFlags = new Set(objects.map(object => object.flag).filter(Boolean));
const isRecord = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};
/** Validate a local save before the UI can use its indexes or render its contents. */
export function isValidState(state) {
  if (!isRecord(state) || state.game !== 'night-transfer' || state.version !== VERSION || state.saveVersion !== SAVE_VERSION || !own(CAMPAIGNS, state.campaign)) return false;
  const campaign = CAMPAIGNS[state.campaign];
  if (!campaign.levelIds.includes(state.level) || !Number.isInteger(state.revision) || state.revision < 0) return false;
  if (!Number.isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff || (state.campaign === 'escape' && state.seed !== 0)) return false;
  if (!Number.isFinite(state.startedAt) || !Number.isFinite(state.updatedAt) || typeof state.won !== 'boolean') return false;
  const knownUnique = (array, catalog) => Array.isArray(array) && array.length <= Object.keys(catalog).length && new Set(array).size === array.length && Array.from(array).every(id => own(catalog, id) && campaign.levelIds.includes(catalog[id].level));
  if (!knownUnique(state.inventory, ITEMS) || !knownUnique(state.collected, OBJECTS) || !knownUnique(state.inspected, OBJECTS)) return false;
  if (!isRecord(state.flags)) return false;
  const annex = state.campaign === 'annex' ? annexCase(state) : null;
  const savedValues = {
    valveSettings: value => state.campaign === 'escape' && sameArray(value, VALVES),
    annexRouteOrder: value => annex && sameArray(value, annex.route),
    annexRelaySettings: value => annex && sameArray(value, annex.switches),
    annexSignalCode: value => annex && typeof value === 'string' && value === annex.code,
    annexInterlockSettings: value => annex && sameArray(value, annex.interlock),
  };
  if (Object.entries(state.flags).some(([key, value]) => own(savedValues, key) ? !savedValues[key](value) : !booleanFlags.has(key) || value !== true)) return false;
  if (Boolean(state.flags.pressureBalanced) !== Boolean(state.flags.valveSettings)) return false;
  for (const [flag, saved] of [['annexRouteSolved', 'annexRouteOrder'], ['annexRelaySolved', 'annexRelaySettings'], ['annexSignalSolved', 'annexSignalCode'], ['annexInterlockSolved', 'annexInterlockSettings']]) if (Boolean(state.flags[flag]) !== Boolean(state.flags[saved])) return false;
  if (state.collected.some(id => !OBJECTS[id].item || !state.inventory.includes(OBJECTS[id].item) || !state.inspected.includes(id) || (OBJECTS[id].flag && !state.flags[OBJECTS[id].flag]))) return false;
  if (state.inventory.length !== state.collected.length) return false;
  if (state.inspected.some(id => OBJECTS[id].level > state.level || (ROOMS[OBJECTS[id].room].requires && !state.flags[ROOMS[OBJECTS[id].room].requires]))) return false;
  for (const object of objects) {
    if (object.flag && state.flags[object.flag]) {
      if (!campaign.levelIds.includes(object.level) || object.level > state.level || !state.inspected.includes(object.id) || (ROOMS[object.room].requires && !state.flags[ROOMS[object.room].requires]) || (object.requires && !state.flags[object.requires]) || (object.key && !hasItem(state, object.key)) || (object.keys && !object.keys.every(key => hasItem(state, key))) || (object.item && !state.collected.includes(object.id))) return false;
    }
  }
  if (!Array.isArray(state.hintsUsed) || state.hintsUsed.length !== LEVELS.length || Array.from(state.hintsUsed).some((n, i) => !Number.isInteger(n) || n < 0 || n > MAX_HINTS || ((!campaign.levelIds.includes(i) || i > state.level) && n !== 0))) return false;
  if (!Array.isArray(state.hintLog) || state.hintLog.length !== LEVELS.length || Array.from(state.hintLog).some((log, i) => !Array.isArray(log) || log.length !== state.hintsUsed[i] || Array.from(log).some(text => typeof text !== 'string' || text.length > 1000))) return false;
  const completed = campaign.levelIds.slice(0, campaign.levelIds.indexOf(state.level) + (state.won ? 1 : 0));
  if (!sameArray(state.completedLevels, completed) || (state.won && state.level !== campaign.endLevel)) return false;
  if (LEVELS.some((level, i) => Boolean(state.flags[`act${i}Exit`]) !== state.completedLevels.includes(i))) return false;
  return true;
}
/** Returns a detached valid state, or null. Accepts an object or a JSON string. */
export function validateSave(data) {
  try {
    let candidate = typeof data === 'string' ? JSON.parse(data) : data;
    // Version 1.0 had exactly three wings. Preserve completed runs as completed;
    // the annex is a separate campaign, never an automatic fourth act.
    if (candidate?.version === '1.0.0') {
      if (!isRecord(candidate) || (candidate.campaign !== undefined && candidate.campaign !== 'escape') || !Array.isArray(candidate.hintsUsed) || candidate.hintsUsed.length !== 3 || !Array.isArray(candidate.hintLog) || candidate.hintLog.length !== 3) return null;
      candidate = { ...candidate, version: VERSION, campaign: 'escape', seed: 0, hintsUsed: [...candidate.hintsUsed, 0], hintLog: [...candidate.hintLog, []] };
    }
    if (!isValidState(candidate)) return null;
    const detached = JSON.parse(JSON.stringify(candidate));
    return isValidState(detached) ? detached : null;
  } catch { return null; }
}
