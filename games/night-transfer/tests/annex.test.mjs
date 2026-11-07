import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, LEVELS, ROOMS, OBJECTS, ITEMS, CAMPAIGNS,
  newGame, reduce, availableRooms, getObjects, objectView, inspect, isDone,
  objective, getGuidance, getHint, getHints, annexSignal, circuitReadout,
  isValidState, validateSave, campaignSummary,
} from '../public/world.mjs';
import { annexCase, CALL_SIGNS, SIGNAL_TONES, SWITCH_LABELS, normalizeSeed } from '../public/annex.mjs';

const interact = id => ({ type: 'interact', id, room: OBJECTS[id]?.room });
const solve = (id, value) => ({ type: 'solve', id, value, room: OBJECTS[id]?.room });
const fresh = seed => newGame({ campaign: 'annex', seed, now: 100 });
function apply(state, action, extra = {}) {
  const before = JSON.stringify(state);
  const result = reduce(state, action, { now: 200 + state.revision, ...extra });
  assert.equal(result.ok, true, `${action.id || action.type}: ${result.message}`);
  assert.equal(JSON.stringify(state), before, 'accepted actions never mutate their input');
  assert.equal(isValidState(result.state), true, 'accepted state remains loadable');
  assert.equal(result.state.revision, state.revision + Number(result.changed));
  assert.equal(result.state.campaign, 'annex'); assert.equal(result.state.seed, state.seed);
  return result;
}
function reject(state, action, extra = {}) {
  const before = JSON.stringify(state);
  const result = reduce(state, action, { now: 1000, ...extra });
  assert.equal(result.ok, false, `${JSON.stringify(action)} should be rejected`);
  assert.equal(result.changed, false); assert.strictEqual(result.state, state);
  assert.equal(JSON.stringify(state), before);
  return result;
}
const chain = (state, actions) => actions.reduce((current, action) => apply(current, action).state, state);
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => j !== i)).map(rest => [value, ...rest])) : [[]];
const ALL_ROUTES = permutations(CALL_SIGNS.map(sign => sign.value));
const ALL_SWITCHES = Array.from({ length: 64 }, (_, mask) => SWITCH_LABELS.map((_, i) => Boolean(mask & (1 << i))));

function routeCandidates(clue) {
  return ALL_ROUTES.filter(route => clue.rules.every(rule => {
    const a = route.indexOf(rule.a), b = route.indexOf(rule.b);
    if (rule.type === 'adjacent-before') return b === a + 1;
    if (rule.type === 'distance-before') return b === a + rule.distance;
    if (rule.type === 'before') return a < b;
    throw new Error(`An undisclosed route rule appeared: ${rule.type}`);
  }));
}
function relayCandidates(wiring, target) {
  return ALL_SWITCHES.filter(values => wiring.every((feeds, i) => Boolean(feeds.reduce((sum, on, j) => sum + (on && values[j] ? 1 : 0), 0) % 2) === target[i]));
}
/** This fixture solves only published clues, independently of annexCase's answers. */
function recoverFromClues(seed) {
  let state = fresh(seed);
  const checkpoints = [state];
  const take = action => { state = apply(state, action).state; checkpoints.push(state); };
  const routeOptions = routeCandidates(objectView(state, 'annexRouteNotice').clue);
  assert.equal(routeOptions.length, 1);
  const route = routeOptions[0];
  const ledger = objectView(state, 'annexCorrections').clue;
  const corrections = ledger.rows.map(row => Number(row[1]));
  take(solve('annexRouteLock', route)); take(interact('annexRelayDoor'));
  const wiring = objectView(state, 'annexWiring').clue.matrix;
  const targets = [...CALL_SIGNS.map(sign => route.indexOf(sign.value) % 2 === 0), true];
  const relayOptions = relayCandidates(wiring, targets);
  assert.equal(relayOptions.length, 1);
  const switches = relayOptions[0];
  take(solve('annexRelayBoard', switches)); take(interact('annexListeningDoor'));
  const receiver = objectView(state, 'annexReceiver', 'moderate');
  const toneValues = Object.fromEntries(receiver.puzzle.legend.map(tone => [tone.id, tone.value]));
  const corrected = {};
  for (const packet of receiver.puzzle.packets) {
    const raw = toneValues[packet.tones[0]] * 3 + toneValues[packet.tones[1]];
    const slot = route.indexOf(packet.symbolId);
    const mirrored = slot % 2 === 0 ? 8 - raw : raw;
    corrected[packet.symbolId] = (mirrored + corrections[slot]) % 10;
  }
  const code = route.map(id => corrected[id]).join('');
  take(solve('annexReceiver', code)); take(interact('annexReleaseDoor'));
  const release = objectView(state, 'annexInterlockPlate').clue;
  const slot = route.indexOf(release.countersign) + 1;
  const load = switches.reduce((sum, on, i) => sum + (on ? i + 1 : 0), 0) % 10;
  const digit = corrected[release.countersign];
  const interlock = [slot, load, digit, (slot + load + digit + ledger.seal) % 10];
  take(solve('annexInterlock', interlock)); take(interact('annexExit'));
  return { state, checkpoints, route, switches, code, interlock };
}
const actionsFor = seed => {
  const data = annexCase(seed);
  return [solve('annexRouteLock', data.route), interact('annexRelayDoor'), solve('annexRelayBoard', data.switches), interact('annexListeningDoor'), solve('annexReceiver', data.code), interact('annexReleaseDoor'), solve('annexInterlock', data.interlock), interact('annexExit')];
};

test('Dead Air launches as its own seeded four-room campaign and never inherits the classic inventory or hint history', () => {
  const state = fresh(41);
  assert.equal(VERSION, '1.1.0'); assert.equal(state.level, 3); assert.equal(state.campaign, 'annex'); assert.equal(state.seed, 41);
  assert.deepEqual(state.inventory, []); assert.deepEqual(state.completedLevels, []);
  assert.deepEqual(state.hintsUsed, [0, 0, 0, 0]); assert.deepEqual(state.hintLog, [[], [], [], []]);
  assert.equal(state.won, false); assert.equal(isValidState(state), true);
  assert.deepEqual(availableRooms(state).map(room => room.id), ['annexArchive']);
  assert.deepEqual(LEVELS[3].roomIds, ['annexArchive', 'annexRelay', 'annexListening', 'annexRelease']);
  assert.equal(getObjects(state, 'annexArchive').length, 6);
  assert.deepEqual(getObjects(state, 'holding'), []);
  assert.deepEqual(CAMPAIGNS.annex.levelIds, [3]);
  assert.equal(campaignSummary(state).roomCount, 4); assert.equal(campaignSummary(state).completed, 0);
  assert.match(objective(state), /carrier route/i);
  for (const property of ['guidance', 'tier', 'room', 'position', 'playerRoom']) assert.equal(property in state, false, `${property} is not shared state`);
});

test('current route clues and coupled relay wiring each have exactly one answer across seeded variants', () => {
  const routeVariants = new Set(), relayVariants = new Set();
  for (let seed = 0; seed < 128; seed++) {
    let state = fresh(seed);
    const clue = objectView(state, 'annexRouteNotice').clue;
    assert.equal(clue.rules.length, 4);
    const routes = routeCandidates(clue);
    assert.equal(routes.length, 1, `seed ${seed}: route must be uniquely deducible`);
    routeVariants.add(routes[0].join(','));
    const expected = annexCase(state);
    assert.deepEqual(routes[0], expected.route);
    for (const rule of clue.rules) {
      const a = CALL_SIGNS.find(sign => sign.value === rule.a).label;
      const b = CALL_SIGNS.find(sign => sign.value === rule.b).label;
      assert.ok(clue.lines.some(line => line.includes(a) && line.includes(b)), 'every machine-checkable rule has visible wording');
    }
    state = chain(state, [solve('annexRouteLock', routes[0]), interact('annexRelayDoor')]);
    const schedule = objectView(state, 'annexWiring').clue;
    assert.equal(schedule.matrix.length, 6);
    schedule.matrix.forEach((row, i) => {
      assert.equal(row.length, 6);
      assert.equal(schedule.rows[i][1], row.flatMap((feed, j) => feed ? [SWITCH_LABELS[j]] : []).join(' + '), 'the displayed feeds match the actual circuit');
    });
    const targets = [...CALL_SIGNS.map(sign => routes[0].indexOf(sign.value) % 2 === 0), true];
    const values = relayCandidates(schedule.matrix, targets);
    assert.equal(values.length, 1, `seed ${seed}: switch settings must be unique`);
    assert.deepEqual(values[0], expected.switches);
    assert.ok(values[0].filter(Boolean).length >= 2 && values[0].filter(Boolean).length <= 4, 'no seeded case collapses to all switches on/off or a single switch');
    relayVariants.add(schedule.rows.map(row => row[1]).join('/'));
    assert.equal(circuitReadout(state, values[0]).complete, true);
    // Every input has a distinct output: uniqueness does not rely on a lucky target.
    const outputs = ALL_SWITCHES.map(input => schedule.matrix.map(row => row.reduce((sum, feed, j) => sum + (feed && input[j] ? 1 : 0), 0) % 2).join(''));
    assert.equal(new Set(outputs).size, 64);
  }
  assert.ok(routeVariants.size > 40, 'new cases vary the route');
  assert.ok(relayVariants.size > 80, 'new cases vary the physical feed assignments');
});

test('the full annex is solvable from visible clues alone in lower tiers, including final cross-room deductions', () => {
  const seeds = [0, 1, 7, 41, 314159, 0xffffffff, ...Array.from({ length: 24 }, (_, i) => i * 997 + 85)];
  for (const seed of seeds) {
    const run = recoverFromClues(seed), expected = annexCase(seed);
    assert.deepEqual(run.route, expected.route); assert.deepEqual(run.switches, expected.switches);
    assert.equal(run.code, expected.code); assert.deepEqual(run.interlock, expected.interlock);
    assert.equal(run.state.level, 3); assert.equal(run.state.won, true);
    assert.deepEqual(run.state.completedLevels, [3]);
    assert.deepEqual(run.state.inventory, ['annexServiceKey', 'annexReleaseKey']);
    assert.deepEqual(run.state.hintsUsed, [0, 0, 0, 0]);
    assert.deepEqual(availableRooms(run.state).map(room => room.id), LEVELS[3].roomIds);
    assert.equal(campaignSummary(run.state).completed, 1);
    assert.match(objective(run.state), /Dead Air is complete/i);
    assert.deepEqual(validateSave(JSON.stringify(run.state)), run.state);
    const repeated = apply(run.state, interact('annexExit'));
    assert.equal(repeated.changed, false); assert.strictEqual(repeated.state, run.state);
  }
});

test('annex gates, two retained keys and personal room validation cannot be bypassed', () => {
  const seed = 123, steps = actionsFor(seed);
  let state = fresh(seed);
  for (const action of [interact('annexRelayDoor'), steps[2], steps[4], steps[6], interact('annexExit'), interact('bunkPocket'), { type: 'enter', room: 'annexRelay' }]) reject(state, action);
  assert.equal(inspect(state, 'annexReceiver'), null); assert.equal(objectView(state, 'annexReceiver'), null);
  state = apply(state, steps[0]).state;
  assert.equal(state.inventory.includes('annexServiceKey'), true);
  const firstDoor = apply(state, steps[1]); state = firstDoor.state;
  assert.deepEqual(firstDoor.event, { type: 'room', room: 'annexRelay' });
  assert.deepEqual(apply(state, interact('annexRelayReturn')).event, { type: 'room', room: 'annexArchive' });
  assert.strictEqual(apply(state, { type: 'enter', room: 'annexArchive' }).state, state);
  reject(state, { ...steps[2], room: 'annexArchive' });
  reject(state, steps[2], { playerRoom: 'annexArchive' });
  reject(state, interact('annexListeningDoor'));
  state = apply(state, steps[2], { playerRoom: 'annexRelay' }).state;
  state = apply(state, steps[3]).state;
  reject(state, interact('annexReleaseDoor')); reject(state, steps[6]);
  state = apply(state, steps[4]).state;
  assert.deepEqual(state.inventory, ['annexServiceKey', 'annexReleaseKey']);
  state = apply(state, steps[5]).state;
  reject(state, interact('annexExit'));
  const decoy = apply(state, interact('annexDeadHatch'));
  assert.equal(decoy.state.won, false); assert.deepEqual(decoy.state.inventory, state.inventory);
  state = apply(decoy.state, steps[6]).state;
  assert.deepEqual(OBJECTS.annexExit.keys, ['annexServiceKey', 'annexReleaseKey']);
  assert.equal(OBJECTS.annexExit.requires, 'annexInterlockSolved');
  assert.equal(apply(state, steps[7]).state.won, true);
  assert.deepEqual(ITEMS.annexServiceKey.level, 3); assert.deepEqual(ITEMS.annexReleaseKey.level, 3);
});

test('wrong or malformed submissions leave every stage unchanged, including the plausible VOID route', () => {
  const seed = 606, data = annexCase(seed), steps = actionsFor(seed);
  let state = fresh(seed);
  for (const value of [null, [], new Array(5), data.route.join(','), [...data.route, data.route[0]], [...data.route.slice(1), data.route[0]], data.route.map(() => data.route[0])]) reject(state, solve('annexRouteLock', value));
  const old = objectView(state, 'annexObsolete').clue;
  assert.match(old.stamp, /VOID/); assert.match(old.lines[1], /Superseded/);
  state = chain(state, steps.slice(0, 2));
  for (const value of [null, [], new Array(6), '101010', data.switches.map(Number), [...data.switches, false], data.switches.map((on, i) => i ? on : !on)]) reject(state, solve('annexRelayBoard', value));
  for (const value of [null, [], new Array(6), [true, 0, false, false, false, false]]) assert.equal(circuitReadout(state, value).valid, false);
  state = chain(state, steps.slice(2, 4));
  for (const value of [null, [], Number(data.code), data.code.split(''), `${data.code} `, `${data.code}0`, `${(Number(data.code[0]) + 1) % 10}${data.code.slice(1)}`]) reject(state, solve('annexReceiver', value));
  state = chain(state, steps.slice(4, 6));
  for (const value of [null, [], new Array(4), data.interlock.map(String), [...data.interlock, 0], data.interlock.map((number, i) => i ? number : (number + 1) % 10), [-1, 0, 0, 0]]) reject(state, solve('annexInterlock', value));
});

test('Expert omits the live signal transcript while all tiers use the same packets, calibration and answers', () => {
  const seed = 440, steps = actionsFor(seed), state = chain(fresh(seed), steps.slice(0, 4));
  const before = JSON.stringify(state), audio = annexSignal(state);
  assert.deepEqual(audio.legend, SIGNAL_TONES);
  assert.deepEqual(audio.legend.map(tone => tone.frequency), [330, 550, 880]);
  assert.deepEqual(audio.legend.map(tone => tone.value), [0, 1, 2]);
  assert.equal(audio.packets.length, 5);
  assert.equal(new Set(audio.packets.map(packet => packet.symbolId)).size, 5);
  const expert = objectView(state, 'annexReceiver', 'expert');
  const moderate = objectView(state, 'annexReceiver', 'moderate');
  const simple = objectView(state, 'annexReceiver', 'simple');
  assert.equal(expert.puzzle.audioRequired, true); assert.equal(moderate.puzzle.audioRequired, false); assert.equal(simple.puzzle.audioRequired, false);
  assert.equal('rows' in expert.clue, false);
  for (let i = 0; i < 5; i++) {
    const packet = audio.packets[i], hidden = expert.puzzle.packets[i];
    assert.deepEqual(Object.keys(hidden).sort(), ['id', 'label', 'symbol', 'symbolId']);
    assert.deepEqual(moderate.puzzle.packets[i].tones, packet.tones);
    assert.equal('rawDigit' in moderate.puzzle.packets[i], false);
    assert.deepEqual(simple.puzzle.packets[i].tones, packet.tones);
    const values = packet.tones.map(id => audio.legend.find(tone => tone.id === id).value);
    assert.equal(simple.puzzle.packets[i].rawDigit, 3 * values[0] + values[1]);
    assert.equal(simple.clue.rows[i][3], String(simple.puzzle.packets[i].rawDigit));
    assert.equal(moderate.clue.rows[i][2], packet.tones.map(tone => tone.toUpperCase()).join(' · '));
  }
  for (const object of [expert, moderate, simple]) {
    for (const field of ['solution', 'code', 'answer', 'correctedDigits']) assert.equal(field in object.puzzle, false, field);
  }
  assert.equal(JSON.stringify(state), before, 'viewing or changing guidance never changes shared progress');
  const accepted = apply(state, steps[4]).state;
  const receipt = objectView(accepted, 'annexReceiver', 'expert');
  assert.equal(receipt.puzzle.audioRequired, false);
  assert.equal(receipt.clue.rows.map(row => row[2]).join(''), accepted.flags.annexSignalCode, 'earned corrected digits remain available for the final deduction');
  assert.equal('tones' in receipt.puzzle.packets[0], false);
  assert.equal(annexSignal(newGame({ now: 0 })), null);
});

test('Simple has explicit targets/scaffolding, Moderate has nudges and Expert has minimal tasks without mutating hints', () => {
  let state = fresh(77);
  for (const action of [null, ...actionsFor(77)]) {
    if (action) state = apply(state, action).state;
    const before = JSON.stringify(state);
    const simple = getGuidance(state, 'simple'), moderate = getGuidance(state, 'moderate'), expert = getGuidance(state, 'expert');
    assert.equal(simple.stage, moderate.stage); assert.equal(moderate.stage, expert.stage);
    assert.equal(typeof simple.detail, 'string'); assert.ok(simple.detail.length > 0);
    assert.equal(typeof moderate.detail, 'string'); assert.ok(moderate.detail.length > 0);
    assert.equal(expert.detail, ''); assert.deepEqual(expert.references, []);
    for (const id of [...simple.references, ...moderate.references]) {
      assert.ok(OBJECTS[id], id); assert.ok(objectView(state, id, 'moderate'), `${id} refers only to accessible evidence`);
    }
    assert.equal(getGuidance(state, 'invalid').tier, 'moderate');
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(state.hintsUsed, [0, 0, 0, 0]);
  }
  const relay = chain(fresh(77), actionsFor(77).slice(0, 2));
  const values = [false, false, false, false, false, false];
  assert.equal(circuitReadout(relay, values, 'simple').lamps.every(lamp => typeof lamp.target === 'boolean'), true);
  for (const tier of ['moderate', 'expert']) assert.equal(circuitReadout(relay, values, tier).lamps.some(lamp => 'target' in lamp), false);
  reject(relay, { type: 'guidance', tier: 'simple' });
});

test('three contextual annex hints are shared and durable while prior campaign slots remain empty', () => {
  const seed = 48, steps = actionsFor(seed);
  let state = fresh(seed);
  assert.match(getHint(state), /current orders/i);
  state = apply(state, { type: 'hint' }).state;
  const first = state.hintLog[3][0];
  state = chain(state, steps.slice(0, 2));
  assert.match(getHint(state), /Odd means ON/i);
  state = apply(state, { type: 'hint' }).state;
  state = chain(state, steps.slice(2, 4));
  assert.ok(getHint(state).includes(annexCase(seed).code));
  state = apply(state, { type: 'hint' }).state;
  assert.equal(state.hintLog[3][0], first);
  assert.deepEqual(state.hintsUsed, [0, 0, 0, 3]);
  assert.equal(getHint(state), null); assert.equal(getHints(state).remaining, 0);
  reject(state, { type: 'hint' });
  state = chain(state, steps.slice(4));
  assert.equal(getHint(state), null); reject(state, { type: 'hint' });
  assert.equal(validateSave(state).hintLog[3].length, 3);
  assert.deepEqual(fresh(seed).hintsUsed, [0, 0, 0, 0]);
});

test('accepted inputs and repeated actions cannot mutate arrays, duplicate keys or roll gates back', () => {
  const seed = 812, values = annexCase(seed), steps = actionsFor(seed);
  let state = fresh(seed);
  const route = [...values.route]; state = apply(state, solve('annexRouteLock', route)).state; route[0] = 'bad';
  assert.deepEqual(state.flags.annexRouteOrder, values.route);
  const again = apply(state, steps[0]); assert.strictEqual(again.state, state);
  state = apply(state, steps[1]).state;
  const switches = [...values.switches]; state = apply(state, solve('annexRelayBoard', switches)).state; switches[0] = !switches[0];
  assert.deepEqual(state.flags.annexRelaySettings, values.switches);
  state = apply(state, steps[3]).state;
  state = apply(state, steps[4]).state;
  assert.strictEqual(apply(state, steps[4]).state, state);
  assert.equal(state.inventory.filter(id => id === 'annexReleaseKey').length, 1);
  state = apply(state, steps[5]).state;
  const dials = [...values.interlock]; state = apply(state, solve('annexInterlock', dials)).state; dials[0] = 99;
  assert.deepEqual(state.flags.annexInterlockSettings, values.interlock);
  const before = JSON.stringify(state);
  const view = objectView(state, 'annexRelayBoard'); view.puzzle.initial[0] = !view.puzzle.initial[0];
  const guide = getGuidance(state, 'simple'); guide.references.push('invented');
  const signal = annexSignal(state); signal.packets[0].tones[0] = 'invented';
  assert.equal(JSON.stringify(state), before, 'presentation structures do not alias saved data');
  assert.deepEqual(annexSignal(state).packets, annexCase(seed).packets);
  assert.equal(availableRooms(state).length, 4);
  assert.deepEqual(apply(state, interact('annexRelayDoor')).event, { type: 'room', room: 'annexRelay' });
});

test('annex saves preserve seeded cases at every checkpoint and reject malformed or cross-campaign progress', () => {
  const run = recoverFromClues(1729);
  for (const state of run.checkpoints) {
    const restored = validateSave(JSON.stringify(state));
    assert.deepEqual(restored, state); assert.notStrictEqual(restored, state);
    assert.deepEqual(annexCase(restored), annexCase(state));
  }
  const completed = run.state;
  for (const altered of [
    { ...completed, seed: -1 }, { ...completed, seed: NaN }, { ...completed, seed: 1.5 }, { ...completed, seed: 4294967296 },
    { ...completed, seed: '1729' }, { ...completed, seed: 1730 },
    { ...completed, campaign: 'escape' }, { ...completed, campaign: '__proto__' }, { ...completed, level: 2 },
    { ...completed, completedLevels: [0, 1, 2, 3] }, { ...completed, completedLevels: [] },
    { ...completed, hintsUsed: [1, 0, 0, 0], hintLog: [['wrong campaign'], [], [], []] },
    { ...completed, hintsUsed: [0, 0, 0] }, { ...completed, hintLog: [[], [], []] },
    { ...completed, inventory: [...completed.inventory, 'plantKey'] }, { ...completed, inspected: [...completed.inspected, 'routeMarks'] },
    { ...completed, flags: { ...completed.flags, annexRouteOrder: ['delta'] } },
    { ...completed, flags: { ...completed.flags, annexRelaySettings: [true, true, true, true, true, true] } },
    { ...completed, flags: { ...completed.flags, annexSignalCode: 'bad' } },
    { ...completed, flags: { ...completed.flags, annexInterlockSettings: [9, 9, 9, 9] } },
    { ...completed, flags: { ...completed.flags, act2Exit: true } },
    { ...completed, flags: new Date() },
  ]) {
    assert.equal(isValidState(altered), false, 'invalid campaign structure or seeded solutions are rejected');
    assert.equal(validateSave(altered), null);
    assert.equal(reduce(altered, interact('annexExit')).ok, false);
  }
  const noKey = structuredClone(completed); noKey.inventory.pop();
  assert.equal(validateSave(noKey), null, 'the final run cannot omit either retained key');
  const noReceipt = structuredClone(completed); delete noReceipt.flags.annexSignalCode;
  assert.equal(validateSave(noReceipt), null, 'a solved flag requires its accepted receipt');
});

test('case generation is deterministic without borrowing clocks or guidance settings', () => {
  const first = newGame({ campaign: 'annex', seed: 'dead-air-case-41', now: 10 });
  const second = newGame({ campaign: 'annex', seed: 'dead-air-case-41', now: 9999 });
  assert.equal(first.seed, normalizeSeed('dead-air-case-41'));
  assert.deepEqual(annexCase(first), annexCase(second));
  assert.deepEqual(annexSignal(first), annexSignal(second));
  assert.notDeepEqual(annexCase(first), annexCase(newGame({ campaign: 'annex', seed: first.seed + 1 })));
  assert.equal(normalizeSeed(0), 0); assert.equal(fresh(0).seed, 0);
  assert.equal(fresh(0xffffffff).seed, 0xffffffff);
  for (const state of [first, second]) {
    assert.equal(Number.isInteger(state.seed), true); assert.equal(isValidState(state), true);
    const classic = newGame({ campaign: 'escape', seed: state.seed, now: 0 });
    assert.equal(classic.seed, 0); assert.equal(classic.level, 0);
  }
});
