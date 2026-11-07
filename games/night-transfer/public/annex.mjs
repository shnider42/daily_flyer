/** Dead Air: deterministic case files and presentation-only guidance.
 * The authoritative state remains in world.mjs. Nothing in this module mutates it.
 */
export const ANNEX_LEVEL_INDEX = 3;
export const GUIDANCE_TIERS = ['simple', 'moderate', 'expert'];
export const CALL_SIGNS = [
  { value: 'delta', symbol: '△', label: 'DELTA' },
  { value: 'ring', symbol: '○', label: 'RING' },
  { value: 'diamond', symbol: '◇', label: 'DIAMOND' },
  { value: 'cross', symbol: '✚', label: 'CROSS' },
  { value: 'wave', symbol: '≈', label: 'WAVE' },
];
export const SIGNAL_TONES = [
  { id: 'low', label: 'LOW', value: 0, frequency: 330 },
  { id: 'mid', label: 'MID', value: 1, frequency: 550 },
  { id: 'high', label: 'HIGH', value: 2, frequency: 880 },
];
export const SWITCH_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const bySign = Object.fromEntries(CALL_SIGNS.map(sign => [sign.value, sign]));
const signName = id => `${bySign[id].symbol} ${bySign[id].label}`;
const clone = value => JSON.parse(JSON.stringify(value));
const same = (value, expected) => Array.isArray(value) && value.length === expected.length && expected.every((entry, i) => value[i] === entry);
export const normalizeGuidance = value => GUIDANCE_TIERS.includes(value) ? value : 'moderate';

export function normalizeSeed(value = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value) >>> 0;
  if (typeof value !== 'string') return 0;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function randomFor(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(array, random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
// Rows: DELTA, RING, DIAMOND, CROSS, WAVE, SYNC. Columns are permuted per case.
// This matrix has rank six over GF(2); every lamp pattern has exactly one input.
const BASE_WIRING = [
  [0, 0, 1, 1, 0, 0],
  [0, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0],
  [1, 0, 1, 0, 0, 0],
  [0, 1, 1, 0, 0, 1],
  [0, 1, 0, 0, 1, 0],
];
function solveBinary(matrix, target) {
  const rows = matrix.map((row, i) => [...row, Number(target[i])]);
  for (let column = 0; column < rows.length; column++) {
    const pivot = rows.findIndex((row, i) => i >= column && row[column] === 1);
    if (pivot < 0) throw new Error('Dead Air wiring is not invertible.');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = 0; row < rows.length; row++) {
      if (row !== column && rows[row][column]) {
        for (let cell = column; cell <= rows.length; cell++) rows[row][cell] ^= rows[column][cell];
      }
    }
  }
  return rows.map(row => Boolean(row.at(-1)));
}

/** The deterministic rules behind a case; UI must use annexObjectView instead. */
export function annexCase(stateOrSeed) {
  const seed = normalizeSeed(typeof stateOrSeed === 'object' ? stateOrSeed?.seed : stateOrSeed);
  const random = randomFor(seed);
  const route = shuffle(CALL_SIGNS.map(sign => sign.value), random);
  const columns = shuffle([0, 1, 2, 3, 4, 5], random);
  const wiring = BASE_WIRING.map(row => columns.map(column => row[column]));
  const targets = [...CALL_SIGNS.map(sign => route.indexOf(sign.value) % 2 === 0), true];
  const switches = solveBinary(wiring, targets);
  const corrections = route.map(() => 1 + Math.floor(random() * 4));
  const seal = 1 + Math.floor(random() * 9);
  const rawDigits = Object.fromEntries(CALL_SIGNS.map(sign => [sign.value, Math.floor(random() * 9)]));
  let transmissionOrder = shuffle(CALL_SIGNS.map(sign => sign.value), random);
  if (same(transmissionOrder, route)) transmissionOrder = [...transmissionOrder.slice(1), transmissionOrder[0]];
  const packets = transmissionOrder.map((symbolId, i) => {
    const raw = rawDigits[symbolId], sign = bySign[symbolId];
    return { id: `packet-${i + 1}`, symbolId, symbol: sign.symbol, label: sign.label,
      tones: [SIGNAL_TONES[Math.floor(raw / 3)].id, SIGNAL_TONES[raw % 3].id] };
  });
  const digits = route.map((id, i) => ((i % 2 === 0 ? 8 - rawDigits[id] : rawDigits[id]) + corrections[i]) % 10);
  const code = digits.join('');
  const counterIndex = Math.floor(random() * 5), countersign = route[counterIndex];
  const load = switches.reduce((total, on, i) => total + (on ? i + 1 : 0), 0) % 10;
  const interlock = [counterIndex + 1, load, digits[counterIndex], (counterIndex + 1 + load + digits[counterIndex] + seal) % 10];
  // Four constraints deliberately describe two blocks, rather than disclosing a route.
  const routeRules = [
    { type: 'adjacent-before', a: route[0], b: route[1] },
    { type: 'distance-before', a: route[2], b: route[4], distance: 2 },
    { type: 'before', a: route[1], b: route[3] },
    { type: 'adjacent-before', a: route[3], b: route[4] },
  ];
  return { seed, route, routeRules, wiring, targets, switches, corrections, seal, rawDigits, packets, code, countersign, interlock };
}

export const ANNEX_ITEMS = {
  annexServiceKey: { id: 'annexServiceKey', title: 'Annex service key', short: 'Annex key', symbol: '◇', level: 3, color: '#b9c9c2', description: 'A diamond-headed service key. Its extra tooth fits one half of the perimeter release.' },
  annexReleaseKey: { id: 'annexReleaseKey', title: 'Release key', short: 'Release key', symbol: '○', level: 3, color: '#cdb079', description: 'A round-headed key released by the listening console. The perimeter release needs it beside the annex service key.' },
};
const room = (id, title, requires) => ({ id, title, level: 3, style: id, width: 8, depth: 10, height: 3.2, spawn: { x: 0, z: 3.2, yaw: 0 }, objects: [], ...(requires ? { requires } : {}) });
export const ANNEX_ROOMS = {
  annexArchive: room('annexArchive', 'Annex archive'),
  annexRelay: room('annexRelay', 'Relay chamber', 'annexRelayOpen'),
  annexListening: room('annexListening', 'Listening room', 'annexListeningOpen'),
  annexRelease: room('annexRelease', 'Perimeter release', 'annexReleaseOpen'),
};
const note = (heading, lines, extra = {}) => ({ type: 'notice', heading, lines, entries: [], ...extra });
const table = (heading, lines, columns, rows, extra = {}) => ({ type: 'table', heading, lines, entries: [], columns, rows, ...extra });
const object = (id, roomId, title, kind, prop, x, z, y, ry, description, extra = {}) => ({ id, room: roomId, level: 3, title, kind, prop, x, z, y, ry, description, ...extra });
const objects = [
  object('annexRouteLock', 'annexArchive', 'Carrier-route cabinet', 'puzzle', 'archive', -3.3, -.8, 1.25, Math.PI / 2, 'Five call-sign buttons guard a service key. The current routing orders define their sequence.', { puzzle: { type: 'sequence', length: 5, options: CALL_SIGNS.map(sign => ({ ...sign })), prompt: 'Enter every call sign once, in the current route order.' }, clue: note('ROUTE ACCEPTANCE', ['The cabinet retains the route after it is accepted.']), item: 'annexServiceKey', flag: 'annexRouteSolved', success: 'Route accepted. The diamond-headed annex service key is released; the accepted route is retained on the cabinet receipt.', failure: 'The route is not consistent with all four current routing orders.' }),
  object('annexRouteNotice', 'annexArchive', 'Current routing orders', 'clue', 'note', -2.15, -4.78, 1.7, 0, 'Five call signs. Four conditions. Only one route satisfies them all.', { clue: note('CURRENT ROUTING ORDERS', ['Use all five call signs exactly once.']) }),
  object('annexCorrections', 'annexArchive', 'Correction ledger', 'clue', 'note', 2.15, -4.78, 1.7, 0, 'The current ledger lists a correction for each route slot and a sealed case checksum.', { clue: note('CURRENT CORRECTIONS / SEALED COPY', ['Keep this ledger with the route record.']) }),
  object('annexObsolete', 'annexArchive', 'Superseded route sheet', 'clue', 'note', 3.72, 1.1, 1.7, -Math.PI / 2, 'A discarded route has a heavy VOID stamp. The current orders are on the front wall.', { clue: note('PREVIOUS SHIFT / VOID', ['Replaced by the current routing orders.'], { stamp: 'VOID / SUPERSEDED' }) }),
  object('annexArchiveDesk', 'annexArchive', 'The abandoned register', 'flavor', 'desk', 2.4, -.7, 1.1, -Math.PI / 2, 'The register ends mid-sentence. A final annotation reads: “The listening circuit is independent of the prison exchange.”'),
  object('annexRelayDoor', 'annexArchive', 'Relay-chamber door', 'door', 'door', 0, -4.74, 1.45, 0, 'A diamond keyway guards the relay chamber.', { key: 'annexServiceKey', targetRoom: 'annexRelay', flag: 'annexRelayOpen', symbol: '◇', success: 'The annex key turns. The relay chamber is open.' }),

  object('annexRelayReturn', 'annexRelay', 'Back to the archive', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The archive passage remains open.', { targetRoom: 'annexArchive' }),
  object('annexRelayBoard', 'annexRelay', 'Coupled relay board', 'puzzle', 'relay', -3.35, -.75, 1.4, Math.PI / 2, 'Six switches share their lamp feeds. The wiring schedule and route activation notice explain the required state.', { puzzle: { type: 'switches', length: 6, labels: [...SWITCH_LABELS], initial: [false, false, false, false, false, false], prompt: 'Set A–F so the route carriers and SYNC meet the current activation rule.' }, clue: note('RELAY ACCEPTANCE', ['Accepted switch positions are retained here.']), flag: 'annexRelaySolved', success: 'The carrier lamps hold steady. The listening-room interlock releases. Accepted switch positions are retained for the final check.', failure: 'The coupled lamps do not match the route activation rule.' }),
  object('annexWiring', 'annexRelay', 'Current wiring schedule', 'clue', 'note', 2.15, -4.78, 1.7, 0, 'Every lamp lists all switches feeding it. Shared feeds must be considered together.', { clue: note('CURRENT WIRING / PARITY RELAYS', ['An odd number of active feeds lights a lamp. An even number, including zero, leaves it dark.']) }),
  object('annexSignalKey', 'annexRelay', 'Tone-pair decoder', 'clue', 'panel', 3.68, -.8, 1.55, -Math.PI / 2, 'A decoder plate assigns values to LOW, MID and HIGH tones. Reference tones can be replayed at the listening console.', { clue: note('TONE PAIRS / BASE THREE', ['LOW = 0. MID = 1. HIGH = 2.', 'Received digit = three times the first tone value, plus the second tone value.']) }),
  object('annexRelayNotice', 'annexRelay', 'Carrier activation rule', 'clue', 'note', -2.15, -4.78, 1.7, 0, 'The accepted route decides which carrier lamps must be on.', { clue: note('ROUTE ACTIVATION / CURRENT SHIFT', ['Route slots 1, 3 and 5: carrier lamp ON.', 'Route slots 2 and 4: carrier lamp OFF.', 'SYNC must be ON.', 'A switch feeds every lamp listed for it. A lamp is ON with an odd number of its feeds ON; an even number leaves it OFF.'], { caption: 'This is a parity board. One switch may change several lamps.' }) }),
  object('annexListeningDoor', 'annexRelay', 'Listening-room door', 'door', 'door', 0, -4.74, 1.45, 0, 'The listening room requires a stable set of carrier lamps.', { targetRoom: 'annexListening', requires: 'annexRelaySolved', flag: 'annexListeningOpen', symbol: '◌', lockedMessage: 'The listening circuit is still unstable. Set the coupled relay board.', success: 'Stable carriers release the listening-room door.' }),

  object('annexListeningReturn', 'annexListening', 'Back to the relay chamber', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The relay-chamber passage remains open.', { targetRoom: 'annexRelay' }),
  object('annexReceiver', 'annexListening', 'Five-packet receiver', 'puzzle', 'receiver', -3.1, -.9, 1.25, Math.PI / 2, 'Five call-sign packets arrive out of route order. Their two-tone digits need the relay and ledger corrections before the release code will be accepted.', { puzzle: { type: 'signal', length: 5, prompt: 'Recover one corrected digit per call sign, then enter them in accepted route order.' }, clue: note('RECEIVER / FIVE PACKETS', ['Use the tone-pair decoder and the signal recovery protocol.']), item: 'annexReleaseKey', flag: 'annexSignalSolved', success: 'The recovered code is accepted. A round-headed release key drops into the tray; the corrected digits remain on the receiver receipt.', failure: 'The recovered digits do not authenticate. Recheck tone pairs, carrier inversion, slot corrections and route order.' }),
  object('annexSignalProtocol', 'annexListening', 'Signal recovery protocol', 'clue', 'note', 2.15, -4.78, 1.7, 0, 'The order of operations is stamped beside the receiver.', { clue: note('RECOVER BEFORE YOU REORDER', ['1. Decode each two-tone packet with the tone-pair decoder: 3 × first value + second value.', '2. For a carrier whose relay lamp is ON, replace its received digit with 8 minus that digit. For an OFF carrier, keep the received digit.', '3. Add the correction for that carrier’s ROUTE SLOT from the archive ledger. Keep only the units digit: 10 becomes 0, 11 becomes 1.', '4. Enter the five corrected digits in accepted ROUTE ORDER, not transmission order.'], { caption: 'Packet call-sign labels stay visible in every guidance tier. Expert uses the audio tones; Simple and Moderate also provide a visual equivalent.' }) }),
  object('annexOperatorLog', 'annexListening', 'The last operator’s desk', 'flavor', 'desk', 2.55, -.85, 1.1, -Math.PI / 2, 'The margin reads: “Compare with the reference, replay the packet, then write the pair. Speed earns nothing.”'),
  object('annexReleaseDoor', 'annexListening', 'Perimeter-release door', 'door', 'door', 0, -4.74, 1.45, 0, 'The listening console must authenticate the recovered transmission.', { targetRoom: 'annexRelease', requires: 'annexSignalSolved', flag: 'annexReleaseOpen', symbol: '○', lockedMessage: 'The recovered transmission has not authenticated. Use the five-packet receiver.', success: 'The authenticated transmission releases the last chamber.' }),

  object('annexReleaseReturn', 'annexRelease', 'Back to the listening room', 'door', 'door', 0, 4.74, 1.45, Math.PI, 'The listening-room passage remains open.', { targetRoom: 'annexListening' }),
  object('annexInterlock', 'annexRelease', 'Four-dial interlock', 'puzzle', 'interlock', -3.72, -.6, 1.45, Math.PI / 2, 'ROUTE, LOAD, SIGNAL and PROOF. The current release plate defines every dial using records from the annex.', { puzzle: { type: 'valves', length: 4, labels: ['ROUTE', 'LOAD', 'SIGNAL', 'PROOF'], symbols: ['#', 'Σ', '◌', '✓'], min: 0, max: 9, initial: [0, 0, 0, 0], prompt: 'Set the four interlock dials using the current release plate and your accepted records.' }, flag: 'annexInterlockSolved', success: 'All four checks agree. The two-key perimeter release is armed.', failure: 'The interlock checks disagree. Consult the current release plate and the three accepted records.' }),
  object('annexInterlockPlate', 'annexRelease', 'Current release plate', 'clue', 'note', -2.15, -4.78, 1.7, 0, 'The countersign and four check rules tie the annex records together.', { clue: note('CURRENT PERIMETER CHECK', ['Read the current countersign and all four dial definitions.']) }),
  object('annexReleaseDiagram', 'annexRelease', 'Two-key release diagram', 'clue', 'note', 2.15, -4.78, 1.7, 0, 'The diamond and circle keyways operate the perimeter gate together.', { clue: note('PERIMETER RELEASE / DUAL CONTROL', ['Arm the four-dial interlock.', 'The diamond annex key and the round release key are both required.', 'The front gate leaves Ashgate. The side maintenance hatch returns to the exchange.'], { stamp: '◇ + ○ / OUTSIDE', caption: 'The keys are retained throughout the annex. No key is consumed by a door.' }) }),
  object('annexDeadHatch', 'annexRelease', 'Exchange maintenance hatch', 'flavor', 'gate', 3.72, 1, 1.45, -Math.PI / 2, 'A large arrow points back to ASHGATE EXCHANGE. This hatch would lead deeper into the prison.', { clue: note('EXCHANGE RETURN', ['Maintenance circuit. Returns inside the prison perimeter.'], { stamp: 'RETURN / NOT AN EXIT' }) }),
  object('annexExit', 'annexRelease', 'Annex perimeter gate', 'exit', 'gate', 0, -4.74, 1.45, 0, 'Two keyways beneath a steady release indicator. Beyond the gate is the old communications service road.', { keys: ['annexServiceKey', 'annexReleaseKey'], requires: 'annexInterlockSolved', flag: 'act3Exit', symbol: '◇ + ○', lockedMessage: 'The four-dial interlock must agree before either key can turn.', success: 'Both keys turn. The dead line goes quiet behind you. The service road leaves Ashgate.' }),
];
export const ANNEX_OBJECTS = Object.fromEntries(objects.map(item => [item.id, item]));
// world.mjs owns population of room.objects, including these four rooms.
export const ANNEX_LEVEL = { id: 'dead-air', number: '04', title: 'Dead Air', shortTitle: 'The communications annex', mechanic: 'Coupled deductions', startRoom: 'annexArchive', roomIds: Object.keys(ANNEX_ROOMS), intro: 'The communications annex was sealed before the evacuation. A carrier route, shared relay feeds and a broken transmission still hold its perimeter release shut. The case changes with every new run.', outro: 'The last carrier falls silent. There is no voice on the line to call you back.', accent: '#b5a3cf', campaign: 'annex' };

const isAnnex = state => state?.campaign === 'annex' && state.level === 3 && Number.isInteger(state.seed) && state.seed >= 0 && state.seed <= 0xffffffff;
/** Audio consumes only tones. Never render this unfiltered structure in Expert. */
export function annexSignal(state) {
  if (!isAnnex(state)) return null;
  return { legend: clone(SIGNAL_TONES), packets: annexCase(state).packets };
}
export function circuitReadout(state, value, guidance = 'moderate') {
  if (!isAnnex(state)) return { valid: false, lamps: [], complete: false };
  const data = annexCase(state), tier = normalizeGuidance(guidance);
  const valid = Array.isArray(value) && value.length === 6 && Array.from(value).every(item => typeof item === 'boolean');
  const input = valid ? value : [false, false, false, false, false, false];
  const lamps = [...CALL_SIGNS.map(sign => ({ id: sign.value, symbol: sign.symbol, label: sign.label })), { id: 'sync', symbol: '⏚', label: 'SYNC' }].map((lamp, i) => ({
    ...lamp, on: Boolean(data.wiring[i].reduce((total, feed, j) => total + (feed && input[j] ? 1 : 0), 0) % 2), ...(tier === 'simple' ? { target: data.targets[i] } : {}),
  }));
  return { valid, lamps, complete: valid && lamps.every((lamp, i) => lamp.on === data.targets[i]) };
}
export function annexAccepts(state, id, value) {
  if (!isAnnex(state)) return false;
  const data = annexCase(state);
  if (id === 'annexRouteLock') return same(value, data.route);
  if (id === 'annexRelayBoard') return same(value, data.switches);
  if (id === 'annexReceiver') return typeof value === 'string' && value === data.code;
  if (id === 'annexInterlock') return same(value, data.interlock);
  return false;
}
function routeLines(data) {
  return data.routeRules.map(rule => rule.type === 'adjacent-before' ? `${signName(rule.a)} is immediately before ${signName(rule.b)}.` : rule.type === 'distance-before' ? `${signName(rule.a)} is exactly ${rule.distance} positions before ${signName(rule.b)}: one call sign lies between them.` : `${signName(rule.a)} appears somewhere before ${signName(rule.b)}.`);
}

/** Dynamic clues are safe to render; Expert never receives live tone labels/raw digits. */
export function annexObjectView(state, id, guidance = 'moderate') {
  if (!isAnnex(state) || !Object.hasOwn(ANNEX_OBJECTS, id)) return null;
  const view = clone(ANNEX_OBJECTS[id]), data = annexCase(state), tier = normalizeGuidance(guidance);
  if (id === 'annexRouteNotice') view.clue = note('CURRENT ROUTING ORDERS', ['Use all five call signs once. Read positions from source to outlet.', ...routeLines(data)], { stamp: 'CURRENT / VERIFIED', rules: clone(data.routeRules), caption: 'All four conditions apply at the same time. A previous route is void.' });
  if (id === 'annexCorrections') view.clue = table('CURRENT CORRECTIONS / SEALED COPY', ['Apply these corrections after carrier inversion, by accepted ROUTE SLOT.', 'Add the correction and retain only the units digit.', `SEALED CASE CHECKSUM: ${data.seal}. Retain this value for the final PROOF dial.`], ['ROUTE SLOT', 'ADD'], data.corrections.map((correction, i) => [String(i + 1), `+${correction}`]), { stamp: 'CURRENT', seal: data.seal, corrections: [...data.corrections] });
  if (id === 'annexObsolete') view.clue = note('PREVIOUS SHIFT / VOID', [[...data.route.slice(1), data.route[0]].map(signName).join(' → '), 'Superseded. Use the four current routing orders on the front wall.'], { stamp: 'VOID / SUPERSEDED' });
  if (id === 'annexRouteLock' && state.flags.annexRouteSolved) view.clue = { type: 'order', heading: 'ACCEPTED CARRIER ROUTE', lines: ['This accepted route is retained for the relay, receiver and perimeter checks.'], entries: data.route.map((id, i) => ({ symbol: bySign[id].symbol, label: bySign[id].label, value: String(i + 1) })), caption: 'Positions are numbered 1 to 5, left to right.' };
  if (id === 'annexWiring') view.clue = table('CURRENT WIRING / PARITY RELAYS', ['A lamp is ON with an odd number of its listed switches ON; an even number, including zero, leaves it OFF.', 'Each switch changes every lamp whose feed list contains its letter.'], ['LAMP', 'FEED SWITCHES'], data.wiring.map((row, i) => [i < 5 ? signName(CALL_SIGNS[i].value) : 'SYNC', row.flatMap((feed, j) => feed ? [SWITCH_LABELS[j]] : []).join(' + ')]), { matrix: clone(data.wiring), stamp: 'CURRENT' });
  if (id === 'annexRelayBoard' && state.flags.annexRelaySolved) {
    view.clue = table('ACCEPTED RELAY POSITIONS', ['These are the accepted A–F positions. Their letter weights are used in the final LOAD check.'], ['SWITCH', 'STATE', 'WEIGHT'], data.switches.map((on, i) => [SWITCH_LABELS[i], on ? 'ON' : 'OFF', String(i + 1)]));
    view.puzzle.initial = [...data.switches];
  }
  if (id === 'annexSignalKey') view.clue = table('TONE PAIRS / BASE THREE', ['LOW = 0. MID = 1. HIGH = 2.', 'Received digit = 3 × first tone value + second tone value.', 'Use the same reference tones at the receiver; no absolute-pitch knowledge is needed.'], ['FIRST', 'SECOND', 'RECEIVED DIGIT'], Array.from({ length: 9 }, (_, digit) => [SIGNAL_TONES[Math.floor(digit / 3)].label, SIGNAL_TONES[digit % 3].label, String(digit)]));
  if (id === 'annexReceiver') {
    view.puzzle.legend = clone(SIGNAL_TONES);
    view.puzzle.packets = data.packets.map(packet => {
      const { tones, ...header } = packet;
      return { ...header, ...(tier !== 'expert' ? { tones: [...tones] } : {}), ...(tier === 'simple' ? { rawDigit: data.rawDigits[packet.symbolId] } : {}) };
    });
    view.puzzle.audioRequired = tier === 'expert' && !state.flags.annexSignalSolved;
    if (state.flags.annexSignalSolved) {
      view.clue = table('AUTHENTICATED RECEIVER RECEIPT', ['These corrected digits were accepted in ROUTE ORDER. Retain the digit belonging to each call sign for the final check.'], ['ROUTE SLOT', 'CALL SIGN', 'CORRECTED DIGIT'], data.route.map((id, i) => [String(i + 1), signName(id), data.code[i]]));
    } else if (tier === 'expert') {
      view.clue = note('RECEIVER / FIVE AUDIO PACKETS', ['Replay all five packets or isolate one. Compare each pair with LOW, MID and HIGH reference tones.', 'Packet call-sign headers remain visible. Tone values are recovered by listening in Expert.', 'The tone-pair decoder, signal protocol and archive corrections specify every operation.']);
    } else {
      view.clue = table('RECEIVER / VISUAL SIGNAL EQUIVALENT', ['The visual readings carry exactly the same information as the audio packets.', tier === 'simple' ? 'Raw digits are provided. For ON carriers use 8 minus the raw digit; then add the correction for its route slot and keep the units digit.' : 'Decode each tone pair with the decoder plate; then apply the recovery protocol.', 'These rows are in TRANSMISSION order. Submit the corrected digits in ROUTE order.'], tier === 'simple' ? ['PACKET', 'CALL SIGN', 'TONE PAIR', 'RAW DIGIT'] : ['PACKET', 'CALL SIGN', 'TONE PAIR'], data.packets.map((packet, i) => [String(i + 1), signName(packet.symbolId), packet.tones.map(tone => tone.toUpperCase()).join(' · '), ...(tier === 'simple' ? [String(data.rawDigits[packet.symbolId])] : [])]));
    }
  }
  if (id === 'annexInterlockPlate') view.clue = table('CURRENT PERIMETER CHECK', [`COUNTERSIGN: ${signName(data.countersign)}.`, 'Every dial takes one digit. “Units digit” means discard any tens.'], ['DIAL', 'RULE'], [
    ['ROUTE', `The countersign’s position in the accepted carrier route, numbered 1–5.`],
    ['LOAD', 'Add the weights of ON relay switches: A=1, B=2, C=3, D=4, E=5, F=6. Keep the units digit.'],
    ['SIGNAL', 'The corrected, authenticated receiver digit belonging to the countersign.'],
    ['PROOF', 'Add ROUTE + LOAD + SIGNAL + the archive’s SEALED CASE CHECKSUM. Keep the units digit.'],
  ], { countersign: data.countersign, stamp: 'CURRENT / DUAL CONTROL' });
  if (id === 'annexInterlock') {
    if (state.flags.annexInterlockSolved) view.puzzle.initial = [...data.interlock];
    if (tier === 'simple' && !state.flags.annexInterlockSolved) view.clue = note('INTERLOCK WORKSHEET', [`The countersign is ${signName(data.countersign)}. Find its route slot on the cabinet receipt.`, 'Read the accepted relay positions and add only ON letter weights.', 'Use the corrected receiver digit for that same countersign.', 'Add your first three dials and the sealed archive checksum; the units digit is PROOF.']);
  }
  return view;
}

export function annexStage(state) {
  if (state.won) return 'complete';
  if (!state.flags.annexRouteSolved) return 'route';
  if (!state.flags.annexRelayOpen) return 'relay-door';
  if (!state.flags.annexRelaySolved) return 'relay';
  if (!state.flags.annexListeningOpen) return 'listening-door';
  if (!state.flags.annexSignalSolved) return 'signal';
  if (!state.flags.annexReleaseOpen) return 'release-door';
  if (!state.flags.annexInterlockSolved) return 'interlock';
  return 'exit';
}
const STAGE_GUIDANCE = {
  route: { objective: 'Restore the carrier route.', simple: 'Read the current routing orders. Group the two adjacent pairs, fit the two-position gap, then satisfy the remaining before/after condition. Submit all five symbols at the carrier-route cabinet.', moderate: 'The current orders apply together. Adjacent call signs form useful blocks; the VOID route belongs to another shift.', references: ['annexRouteNotice', 'annexRouteLock'] },
  'relay-door': { objective: 'Reach the relay chamber.', simple: 'Use the diamond-headed annex service key on the relay-chamber door at the front of the archive.', moderate: 'The cabinet released a key with the same mark as the relay door.', references: ['annexRelayDoor'] },
  relay: { objective: 'Stabilise the listening circuit.', simple: 'Read the wiring schedule. Each lamp lights when an odd number of its listed switches are ON. Match the displayed target lamps: route slots 1, 3, 5 and SYNC ON; the other carriers OFF.', moderate: 'The accepted route supplies the target carriers. Shared feeds combine by parity; changing one switch may disturb several lamps.', references: ['annexRelayNotice', 'annexWiring', 'annexRouteLock', 'annexRelayBoard'] },
  'listening-door': { objective: 'Reach the listening room.', simple: 'The carriers are stable. Open the listening-room door at the front of the relay chamber.', moderate: 'The steady carrier lamps have released the listening-room interlock.', references: ['annexListeningDoor'] },
  signal: { objective: 'Recover the five-digit authorisation.', simple: 'Read or replay each labeled packet. Raw digits are shown. Invert ON carriers using 8−raw, add the archive correction for that carrier’s route slot, keep the units digit, then arrange all five by route.', moderate: 'Transmission order differs from route order. The protocol specifies carrier inversion before the archive’s slot correction.', references: ['annexSignalKey', 'annexSignalProtocol', 'annexCorrections', 'annexRouteLock', 'annexReceiver'] },
  'release-door': { objective: 'Reach the perimeter release.', simple: 'Take the receiver’s round-headed release key and open the authenticated perimeter-release door.', moderate: 'The authenticated receiver has released the final chamber.', references: ['annexReleaseDoor'] },
  interlock: { objective: 'Reconcile the perimeter checks.', simple: 'Read the release plate’s countersign. Use its route position, the weighted ON-switch sum and its corrected receiver digit. The fourth dial is the units digit of those three plus the sealed archive checksum.', moderate: 'The countersign links the accepted route and receiver. The relay receipt and sealed archive record supply the remaining checks.', references: ['annexInterlockPlate', 'annexRouteLock', 'annexRelayBoard', 'annexReceiver', 'annexCorrections', 'annexInterlock'] },
  exit: { objective: 'Open the two-key perimeter gate.', simple: 'The interlock is armed. Use both retained keys on the front perimeter gate. The side hatch returns inside Ashgate.', moderate: 'The diamond and circle belong together at the perimeter gate.', references: ['annexReleaseDiagram', 'annexExit'] },
  complete: { objective: 'The service road is open. Dead Air is complete.', simple: 'The communications annex is behind you. A new case changes the route, wiring, transmission and final checks.', moderate: 'The last carrier has fallen silent.', references: [] },
};
export function annexGuidance(state, guidance = 'moderate') {
  const tier = normalizeGuidance(guidance), stage = annexStage(state), content = STAGE_GUIDANCE[stage];
  return { tier, stage, objective: content.objective, detail: tier === 'expert' ? '' : content[tier], references: tier === 'expert' ? [] : [...content.references], audioRequired: tier === 'expert' && stage === 'signal' };
}
/** Three paid hints use current progress, not the stage at which a prior hint was used. */
export function annexHints(state) {
  const data = annexCase(state), stage = annexStage(state), sign = data.countersign;
  const help = {
    route: ['Ignore the VOID sheet. The current orders form two blocks that can only be arranged one way.', `${signName(data.route[0])} and ${signName(data.route[1])} are a pair. The other three fit the two-position gap and second adjacent pair.`, `Accepted route: ${data.route.map(signName).join(' → ')}. Enter it at the carrier-route cabinet.`],
    'relay-door': ['The route cabinet released a service key.', 'Its diamond mark matches the relay-chamber door.', 'Open the diamond-marked relay-chamber door with the annex service key.'],
    relay: ['The target depends on ROUTE slots, not the lamp order printed on the board.', 'For each lamp, count only its listed switches that are ON. Odd means ON; even means OFF. Route slots 1, 3, 5 and SYNC must light.', `Set ON: ${SWITCH_LABELS.filter((_, i) => data.switches[i]).join(', ') || 'none'}. Set OFF: ${SWITCH_LABELS.filter((_, i) => !data.switches[i]).join(', ') || 'none'}. Then stabilise the relay board.`],
    'listening-door': ['The stable relay releases a separate door.', 'The listening-room door is at the front of the relay chamber.', 'Open the listening-room door. The accepted switch positions remain on the relay receipt.'],
    signal: ['Each packet has a visible call sign and two tones. The decoder yields a raw digit, not the final code digit.', 'Decode 3×first+second. For ON carriers replace raw with 8−raw, then add that carrier’s ROUTE-slot correction and keep the units digit. Put the results in route order.', `The corrected code in accepted route order is ${data.code}. Enter all five digits at the receiver.`],
    'release-door': ['The receiver authenticated the transmission and released a round key.', 'The perimeter-release door is now ready to open.', 'Open the perimeter-release door. Keep both keys for the final gate.'],
    interlock: [`Use the current countersign ${signName(sign)} consistently for both ROUTE and SIGNAL.`, 'ROUTE is its slot; LOAD is the units digit of weighted ON switches; SIGNAL is its corrected receiver digit. PROOF adds these three and the archive seal, then keeps the units digit.', `Set ROUTE ${data.interlock[0]}, LOAD ${data.interlock[1]}, SIGNAL ${data.interlock[2]}, PROOF ${data.interlock[3]}. Then arm the interlock.`],
    exit: ['Two working keys were retained from earlier stages.', 'The front gate is the perimeter release; the side hatch returns inside.', 'Open the front annex perimeter gate using the diamond annex key and the round release key.'],
    complete: ['Dead Air is complete.', 'The annex perimeter is open.', 'The service road is outside Ashgate.'],
  };
  return help[stage];
}
