/** Repeatable, unsaved fold-drive fixtures. No DOM, storage, or transport access. */
import { Game, WORLD_RADIUS } from './engine.mjs';
import { SHIP_CLASSES } from './fleet.mjs';
import { getHullSystems } from './hull-systems.mjs';
import { UPGRADES } from './content.mjs';
import { upgradeChecklist } from './upgrade-guidance.mjs';

const clone = value => structuredClone(value);
const ORIGIN = 'fold-test-origin', NEARBY = 'fold-test-nearby', DISTANT = 'fold-test-distant';
const PARTS = Object.freeze(['thrusters_1', 'scanner_1', 'fold_1']);
const systemIds = new Set([ORIGIN, NEARBY, DISTANT]);
const portId = id => `${id}:port`;
const denied = game => game._fail('This action is outside the isolated fold-drive exercise.', 'test-mode');
const TRAINING_STARS = Object.freeze([
  Object.freeze({ id: ORIGIN, name: 'Proving Ground', gx: 0, gy: 0 }),
  Object.freeze({ id: NEARBY, name: 'Nearpoint', gx: 4, gy: 0 }),
  Object.freeze({ id: DISTANT, name: 'Far Marker', gx: 0, gy: 8 })
]);
const expectedResult = code => ({ ok: code === 'ok', code });
const readCheck = operation => {
  try { return operation(); } catch (error) { return { ok: false, code: 'exception', reason: `The game check threw an error: ${error.message || error}` }; }
};

// The test oracle deliberately does not call travelInfo/upgradeInfo. If one of
// those production gates regresses, its result must disagree with this fixture.
function trainingQuote(game, id) {
  const from = TRAINING_STARS.find(item => item.id === game.state.systemId), to = TRAINING_STARS.find(item => item.id === id);
  const distance = Math.hypot(to.gx - from.gx, to.gy - from.gy);
  return { distance, fuelCost: id === from.id ? 0 : Math.ceil((2 + distance * .65) * getHullSystems(game.state.ship.classId).foldFuelMultiplier) };
}

function expectedTravel(game, id, quote) {
  const state = game.state;
  if (id === state.systemId) return expectedResult('same-system');
  if (state.mode !== 'ship') return expectedResult('mode');
  if (state.npcContract?.active) return expectedResult('contract');
  if (state.ship.unowned === true) return expectedResult('no-ship');
  if (!state.upgrades.fold_1) return expectedResult('hyperdrive');
  if (quote.distance > 5) return expectedResult('range');
  if (state.ship.fuel < quote.fuelCost) return expectedResult('fuel');
  if (state.pendingEncounter) return expectedResult('encounter');
  return expectedResult('ok');
}

function expectedUpgrade(game, id) {
  const state = game.state, upgrade = UPGRADES.find(item => item.id === id);
  if (!game.atInhabitedPort) return expectedResult('mode');
  if (state.npcContract?.active) return expectedResult('contract');
  if (state.ship.unowned === true) return expectedResult('no-ship');
  const body = game.currentBody, berth = state.livelihoods?.parkedShip;
  if (berth?.vesselId === state.ship.id && (berth.systemId !== state.systemId || berth.bodyId !== body.id) || Math.hypot(state.ship.x - body.x, state.ship.y - body.y) > body.radius + 160) return expectedResult('ship-location');
  if (state.upgrades[id]) return expectedResult('owned');
  if (id === 'fold_1' && (!state.upgrades.thrusters_1 || !state.upgrades.scanner_1)) return expectedResult('prerequisite');
  if (id === 'fold_1' && !state.flags.includes('belt_signal_found')) return expectedResult('story');
  if (state.credits < upgrade.cost || state.cargo.ore < (upgrade.ore || 0)) return expectedResult('cost');
  return expectedResult('ok');
}

export const FOLD_TEST_SCENARIO = Object.freeze({
  id: 'fold-drive', title: 'Fold-drive proving ground',
  description: 'Try a real jump immediately, fit a first drive, or test the rules that stop a jump. Seven repeatable setups; no saved progress.',
  goal: 'Choose a fold-drive test, perform its real actions, and compare the observed result with the expected result.'
});

export const FOLD_TEST_CASES = Object.freeze([
  { id: 'round-trip', title: 'Jump out and return', description: 'A Fold Drive I is fitted. Fly the four-light-year crossing and return to the starting system.', goal: 'Jump to Nearpoint, then jump back to the Proving Ground. Check both arrivals and both fuel deductions.', expectedAction: 'travel', expectedCode: 'ok' },
  { id: 'installation', title: 'Install your first drive', description: 'Begin at a shipwright with 500 credits, 12 ore, and calibration supplied for this test. Fit the three required upgrades yourself.', goal: 'Install Vector thrusters, an Echo scanner, and Fold Drive I. Launch, jump to Nearpoint, and return.', expectedAction: 'buyUpgrade', expectedCode: 'ok' },
  { id: 'no-drive', title: 'No drive fitted', description: 'Your ship is in space with no fold equipment. Attempt the nearby crossing to see the missing-drive rule.', goal: 'Attempt a jump to Nearpoint. Expect a missing-drive rejection with no fuel spent and no system change.', expectedAction: 'travel', expectedCode: 'hyperdrive' },
  { id: 'calibration', title: 'Missing story calibration', description: 'The thrusters and scanner are fitted, and the drive cost is aboard. The campaign calibration is deliberately missing.', goal: 'Attempt to install Fold Drive I. Expect the Something in the belt requirement, with credits and ore unchanged.', expectedAction: 'buyUpgrade', expectedCode: 'story' },
  { id: 'fuel', title: 'Insufficient fuel', description: 'Fold Drive I is ready, but the tank contains less than the nearby jump costs.', goal: 'Attempt a jump to Nearpoint. Expect a fuel rejection without moving or spending the remaining fuel.', expectedAction: 'travel', expectedCode: 'fuel' },
  { id: 'range', title: 'Destination out of range', description: 'Fold Drive I reaches 5 light-years. The Far Marker is 8 light-years from this starting system.', goal: 'Attempt a jump to the Far Marker. Expect a range rejection with no fuel spent and no system change.', expectedAction: 'travel', expectedCode: 'range' },
  { id: 'docked', title: 'Launch before jumping', description: 'Your equipped ship is parked at the training port and your captain is on foot.', goal: 'Attempt a jump to Nearpoint while docked. Expect a launch-first rejection. You may then launch and try again.', expectedAction: 'travel', expectedCode: 'mode' }
].map(item => Object.freeze(item)));

function trainingGalaxy() {
  return TRAINING_STARS.map((system, index) => ({
    ...system, authored: true, index, faction: 'freewake', danger: 0, biome: 'barren',
    description: 'An isolated fold-drive test system. No campaign progress or shared galaxy is changed here.',
    bodies: [{ id: portId(system.id), name: `${system.name} Port`, kind: 'station', biome: 'station', faction: 'freewake', portServices: true, x: 0, y: 0, radius: 70, color: '#80c6bd', lore: 'A training berth with a shipwright. Equipment uses the normal prices and requirements.' }]
  }));
}

function trainingWorld(system) {
  return {
    id: system.id, name: system.name, faction: system.faction, danger: 0, biome: 'barren', description: system.description,
    bodies: clone(system.bodies), asteroids: [], enemies: [], parkedShips: [], bullets: [], pickups: [], signals: [], traffic: [],
    miningTarget: null, mining: null, miningBeams: {}, width: WORLD_RADIUS * 2, height: WORLD_RADIUS * 2, radius: WORLD_RADIUS
  };
}

function snapshot(game) {
  const state = game.state, ship = state.ship;
  return {
    systemId: state.systemId, systemName: game.currentSystem?.name || state.systemId, locationId: state.locationId, mode: state.mode,
    atPort: game.atInhabitedPort, portId: game.system.bodies[0]?.id || null,
    range: ship.warpRange, fuel: ship.fuel, maxFuel: ship.maxFuel, credits: state.credits, ore: state.cargo.ore,
    calibration: game.hasFlag('belt_signal_found'), jumps: state.stats.jumps, shipId: ship.id,
    x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy, upgrades: { ...state.upgrades }, flags: [...state.flags], visited: [...state.visited]
  };
}

const observation = (label, expected, actual) => ({ label, expected, actual, passed: Object.is(expected, actual) });

class FoldDriveExerciseGame extends Game {
  get chapter() { return null; }
  _checkChapters() {}
  availableJobs() { return []; }
  triggerEncounter() { return denied(this); }
  buyShip() { return denied(this); }
  selectShip() { return denied(this); }
  acceptJob() { return denied(this); }
  turnInJob() { return denied(this); }
  applyChoice() { return denied(this); }
  recruitCrew() { return denied(this); }
  enlistProfession() { return denied(this); }
  professionAction() { return denied(this); }
  militaryCareerAction() { return denied(this); }
  acceptNpcContract() { return denied(this); }
  takePassengerTransit() { return denied(this); }
  service() { return denied(this); }
  bindSharedWorld() { return denied(this); }
  save() { throw new Error('Test exercises cannot be saved as a voyage.'); }
  serialize() { throw new Error('Test exercises cannot be saved as a voyage.'); }

  _loadSystem(id) {
    // Game's constructor loads its ordinary initial world before this fixture is
    // configured. Every subsequent training arrival uses this small private sky.
    if (!this._foldExercise) return super._loadSystem(id);
    const system = this.galaxy.find(item => item.id === id);
    if (!system || !systemIds.has(id)) throw new RangeError('That system is outside the fold-drive exercise.');
    this._runtime = trainingWorld(system);
    this._record().visits = (this._record().visits || 0) + 1;
  }

  step(delta, input = {}) {
    // Keep the real pilot, weapons, and hull simulation; no galaxy event director
    // may populate an otherwise peaceful controlled test with unrelated traffic.
    const dt = Math.max(0, Math.min(.1, Number(delta) || 0));
    if (!dt) return;
    this.stepPilot(dt, input);
    this.stepWorld(dt, [this]);
  }

  travelInfo(id) {
    if (!systemIds.has(id)) return denied(this);
    return super.travelInfo(id);
  }

  upgradeInfo(id) {
    if (!PARTS.includes(id)) return denied(this);
    return super.upgradeInfo(id);
  }

  _attempt(action, targetId, expected, operation, quote = null) {
    const before = snapshot(this);
    let answer;
    try { answer = operation(); } catch (error) { answer = { ok: false, code: 'exception', reason: `The game action threw an error: ${error.message || error}` }; }
    const after = snapshot(this);
    if (!this._foldExercise?.recording) return answer;
    const actual = { ok: answer?.ok === true, code: answer?.ok ? 'ok' : answer?.code || 'unknown', reason: answer?.reason || '' };
    const desired = { ok: expected?.ok === true, code: expected?.ok ? 'ok' : expected?.code || 'unknown' };
    const observations = [observation('Result', desired.code, actual.code)];
    if (!actual.ok) {
      for (const [key, label] of [['systemId', 'System unchanged'], ['locationId', 'Landing unchanged'], ['mode', 'Captain position unchanged'], ['fuel', 'Fuel unchanged'], ['credits', 'Credits unchanged'], ['ore', 'Ore unchanged'], ['jumps', 'Jump count unchanged'], ['x', 'Ship position X unchanged'], ['y', 'Ship position Y unchanged']]) observations.push(observation(label, before[key], after[key]));
      for (const [key, label] of [['upgrades', 'Equipment unchanged'], ['flags', 'Progress unchanged'], ['visited', 'Visits unchanged']]) observations.push(observation(label, JSON.stringify(before[key]), JSON.stringify(after[key])));
    } else if (action === 'travel') {
      observations.push(observation('Arrival system', targetId, after.systemId), observation('Fuel after jump', before.fuel - quote.fuelCost, after.fuel), observation('Jump count', before.jumps + 1, after.jumps), observation('Same ship', before.shipId, after.shipId), observation('Arrival sideways speed', 0, after.vx), observation('Arrival forward speed', 0, after.vy));
    } else if (action === 'buyUpgrade') {
      const upgrade = UPGRADES.find(item => item.id === targetId);
      observations.push(observation('Credits after purchase', before.credits - upgrade.cost, after.credits), observation('Ore after purchase', before.ore - (upgrade.ore || 0), after.ore), observation('Equipment installed', true, !!after.upgrades[targetId]));
      if (targetId === 'fold_1') observations.push(observation('Fold Drive I range', 5, after.range));
    } else if (action === 'launch') observations.push(observation('Captain at ship controls', 'ship', after.mode), observation('Same system', before.systemId, after.systemId), observation('Fuel unchanged', before.fuel, after.fuel));
    else if (action === 'dock') observations.push(observation('Captain at port', true, after.atPort), observation('Same system', before.systemId, after.systemId), observation('Fuel unchanged', before.fuel, after.fuel));
    const attempts = this._foldExercise.attempts;
    const attempt = { id: ++this._foldExercise.serial, action, targetId, expected: desired, actual, passed: desired.ok === actual.ok && observations.every(item => item.passed), before, after, observations };
    attempts.push(attempt);
    if (attempt.passed) {
      const progress = this._foldExercise.progress;
      if (actual.ok && action === 'buyUpgrade' && !progress.installed.includes(targetId)) progress.installed.push(targetId);
      if (actual.ok && action === 'travel') {
        if (before.systemId === ORIGIN && targetId === NEARBY && !progress.outboundId) progress.outboundId = attempt.id;
        if (before.systemId === NEARBY && targetId === ORIGIN && progress.outboundId && attempt.id > progress.outboundId) progress.returned = true;
      }
      const key = `${action}:${targetId}:${actual.code}`;
      if (!actual.ok && !progress.rejections.includes(key)) progress.rejections.push(key);
    }
    if (attempts.length > 60) attempts.shift();
    return answer;
  }

  travel(id) {
    if (!systemIds.has(id)) return denied(this);
    const quote = trainingQuote(this, id), expected = expectedTravel(this, id, quote);
    return this._attempt('travel', id, expected, () => super.travel(id), quote);
  }

  buyUpgrade(id) {
    if (!PARTS.includes(id)) return denied(this);
    const expected = expectedUpgrade(this, id);
    return this._attempt('buyUpgrade', id, expected, () => super.buyUpgrade(id));
  }

  launch() {
    const expected = this.state.mode !== 'person' ? this._fail('You are already flying.', 'mode') : this.state.pendingEncounter ? this._fail('Finish this conversation first.', 'encounter') : this.ownShipAccess({ atPort: true });
    return this._attempt('launch', this.state.systemId, expected, () => super.launch());
  }

  dock(id) {
    if (id !== portId(this.state.systemId)) return denied(this);
    const body = this.system.bodies.find(item => item.id === id), ship = this.state.ship;
    const expected = this.state.mode !== 'ship' ? this._fail('You are already on foot.', 'mode') : this.state.pendingEncounter ? this._fail('Resolve the open transmission first.', 'encounter') : Math.hypot(ship.x - body.x, ship.y - body.y) > body.radius + 150 ? this._fail('Fly closer to the training port to dock.', 'distance') : this.ownShipAccess();
    return this._attempt('dock', id, expected, () => super.dock(id));
  }
}

export function createFoldDriveTestSession({ foldCase = 'round-trip', seed = 'practice' } = {}) {
  const fixture = FOLD_TEST_CASES.find(item => item.id === foldCase);
  if (!fixture) throw new RangeError('Choose one of the available fold-drive test cases.');
  const sessionSeed = String(seed).slice(0, 128), game = new FoldDriveExerciseGame(`farwake-test:fold:${sessionSeed}`), state = game.state;
  game.isTestMode = true; state.testMode = true;
  game._foldExercise = { caseId: foldCase, recording: false, serial: 0, attempts: [], progress: { installed: [], outboundId: null, returned: false, rejections: [] } };
  game.galaxy = trainingGalaxy();
  state.systemId = ORIGIN; state.locationId = null; state.mode = 'ship'; state.lastBodyId = portId(ORIGIN);
  state.interior = null; state.pendingEncounter = null; state.nextEncounterAt = Number.MAX_SAFE_INTEGER;
  state.credits = foldCase === 'installation' ? 500 : foldCase === 'calibration' ? 320 : 0;
  state.cargo = { ore: foldCase === 'installation' ? 12 : foldCase === 'calibration' ? 8 : 0, crystal: 0 };
  state.upgrades = ['installation', 'no-drive'].includes(foldCase) ? {} : foldCase === 'calibration' ? { thrusters_1: 1, scanner_1: 1 } : { thrusters_1: 1, scanner_1: 1, fold_1: 1 };
  state.fleet = { owned: [SHIP_CLASSES[0].id], history: [] };
  for (const key of ['crew', 'formerCrew', 'memorial', 'boardingHistory', 'missions', 'completedJobs', 'journal', 'knownLore', 'completedChapters', 'encounterHistory', 'activityTokens', 'storyActions', 'flags']) state[key] = [];
  if (foldCase !== 'calibration') state.flags.push('belt_signal_found');
  state.boarding = null; state.exploration = null; state.worlds = {}; state.visited = [ORIGIN]; state.discovered = [ORIGIN, NEARBY, DISTANT];
  state.npcContract = null; state.livelihoods.parkedShip = null; state.openingMission = null;
  for (const key of Object.keys(state.stats)) state.stats[key] = 0;
  Object.assign(state.ship, { id: 'fold-test-cutter', name: 'Fold-test cutter', classId: SHIP_CLASSES[0].id, x: 0, y: 145, vx: 0, vy: 0, angle: 0, angularVelocity: 0, dockedAt: null });
  game._updateStats(true);
  Object.assign(state.ship, { hull: state.ship.maxHull, shield: state.ship.maxShield, energy: state.ship.maxEnergy, fuel: state.ship.maxFuel });
  state.person = { ...state.person, health: 100, down: false, facing: 'up' };
  game._loadSystem(ORIGIN);
  if (foldCase === 'fuel') state.ship.fuel = Math.max(0, trainingQuote(game, NEARBY).fuelCost - 1);
  if (['installation', 'calibration', 'docked'].includes(foldCase)) {
    const docked = game.dock(portId(ORIGIN));
    if (!docked.ok) throw new Error(`The fold-drive port fixture could not be prepared: ${docked.reason}`);
  }
  game.events.length = 0; state.journal.length = 0;
  game._foldExercise.recording = true;
  const config = Object.freeze({ scenario: 'fold-drive', foldCase, enemyClassId: null, seed: sessionSeed });
  return { game, config, scenario: FOLD_TEST_SCENARIO, scenarioId: 'fold-drive', foldCase, enemyClassId: null, targetId: null, goal: fixture.goal, startedAt: state.stats.time };
}

/** Narrow exceptions for the app's existing practice-command boundary. */
export function foldTestActionAllowed(session, name, args = {}) {
  const game = session?.game;
  if (session?.scenarioId !== 'fold-drive' || !game?.isTestMode || !game._foldExercise || game.state.multiplayer?.serverAuthoritative || game._sharedWorld) return false;
  if (name === 'buyUpgrade') return PARTS.includes(args.id);
  if (name === 'travel') return systemIds.has(args.id);
  if (name === 'dock') return args.id === portId(game.state.systemId);
  return name === 'launch';
}

/** Only observations of actions count. Merely opening the panel is read-only. */
export function foldDriveTestState(session) {
  const game = session?.game;
  if (session?.scenarioId !== 'fold-drive' || !game?.isTestMode || !game._foldExercise) return null;
  const fixture = FOLD_TEST_CASES.find(item => item.id === game._foldExercise.caseId), current = snapshot(game), attempts = clone(game._foldExercise.attempts);
  const progress = game._foldExercise.progress;
  const good = (action, targetId, code = 'ok') => code === 'ok' ? action === 'buyUpgrade' && progress.installed.includes(targetId) : progress.rejections.includes(`${action}:${targetId}:${code}`);
  const outbound = progress.outboundId, returned = progress.returned;
  const roundTrip = [{ id: 'outbound', label: 'Arrive at Nearpoint and spend the quoted fuel', complete: !!outbound }, { id: 'return', label: 'Return to the Proving Ground and spend the quoted fuel', complete: !!returned }];
  let checks;
  if (fixture.id === 'installation') checks = [...PARTS.map(id => ({ id, label: `Install ${UPGRADES.find(item => item.id === id).name} at its normal price`, complete: good('buyUpgrade', id) })), ...roundTrip];
  else if (fixture.id === 'round-trip') checks = roundTrip;
  else {
    const target = fixture.id === 'calibration' ? 'fold_1' : fixture.id === 'range' ? DISTANT : NEARBY;
    checks = [{ id: fixture.id, label: fixture.goal, complete: good(fixture.expectedAction, target, fixture.expectedCode) }];
  }
  const lastAttempt = attempts.at(-1) || null;
  const unexpected = lastAttempt && !lastAttempt.passed;
  const complete = checks.every(item => item.complete) && !unexpected;
  const phase = unexpected ? 'failed' : complete ? 'complete' : attempts.length ? 'active' : 'ready';
  const title = unexpected ? 'Unexpected test result' : complete ? 'Test passed' : fixture.title;
  const detail = unexpected ? 'The observed result differs from the expected result. Read the attempt details, then retry to reproduce it.' : complete ? 'The requested checks passed through the normal game rules. Retry this case or choose another setup.' : fixture.goal;
  const upgrades = PARTS.map(id => {
    const upgrade = UPGRADES.find(item => item.id === id), checklist = readCheck(() => upgradeChecklist(game, id)), info = game.atInhabitedPort ? readCheck(() => game.upgradeInfo(id)) : game._fail('Visit an inhabited port outfitter to fit an upgrade.', 'mode');
    return { id, name: upgrade.name, installed: !!game.state.upgrades[id], cost: upgrade.cost, ore: upgrade.ore || 0, ok: info.ok === true, code: info.ok ? 'ok' : info.code, reason: info.reason || 'Ready to install.', requirements: checklist.requirements || [{ id: 'diagnostic', label: 'Equipment check', complete: false, detail: checklist.reason }] };
  });
  const destinations = game.galaxy.map(system => {
    const info = readCheck(() => game.travelInfo(system.id)), quote = trainingQuote(game, system.id);
    return { id: system.id, name: system.name, distance: quote.distance, fuelCost: quote.fuelCost, range: current.range, current: system.id === current.systemId, ok: info.ok === true, code: info.ok ? 'ok' : info.code, reason: info.reason || 'Ready to engage the fold drive.' };
  });
  return {
    case: { ...fixture }, current, upgrades, destinations,
    targetId: fixture.id === 'range' ? DISTANT : current.systemId === NEARBY ? ORIGIN : NEARBY,
    attempts, lastAttempt, checks, phase, complete, title, detail
  };
}
