/** Isolated exercises. This module has no storage, transport, or DOM access. */
import { Game, WORLD_RADIUS } from './engine.mjs';
import { SHIP_CLASSES, enemyHullProfile } from './fleet.mjs';

const clone = value => structuredClone(value);
const RANGE_ID = 'test-range';
const TARGET_ID = 'test-range:raider';
const ENTRY_CODE = '123';

export const TEST_SCENARIOS = Object.freeze([
  { id: 'ship-combat', title: 'Ship combat', description: 'Fight one pirate with your starting cutter. Practice thrust, turning, braking, and controlled fire.', goal: 'Disable the marked pirate ship. Stop firing when its engines fail, or finish the hull.' },
  { id: 'boarding', title: 'Board a disabled ship', description: 'Start beside a disabled pirate. Cross the tether and clear its crew with your sidearm.', goal: 'Board the marked ship and secure its bridge. Then return to your ship or take its helm.' },
  { id: 'person-combat', title: 'Person combat', description: 'Begin inside the target ship. Practice aiming, firing, cover, and identifying who hit whom.', goal: 'Clear the hostile crew and secure the target bridge. Your sidearm is ready; you have no allied gunners.' },
  { id: 'raid-defense', title: 'Repel a pirate raid', description: 'A pirate is close and your shields are down. Hold position to let the grapples attach, then defend your own deck.', goal: 'Survive the boarding alarm and clear the pirates from your ship.' }
].map(scenario => Object.freeze(scenario)));

function allowedClasses() {
  const ranked = [...SHIP_CLASSES].sort((a, b) =>
    a.stats.renderLength * a.stats.renderWidth - b.stats.renderLength * b.stats.renderWidth ||
    a.stats.renderLength - b.stats.renderLength || a.berths - b.berths);
  return ranked.slice(0, Math.max(1, Math.floor(ranked.length / 2)));
}

/** Returns only the permitted early hulls, without later names, unlocks, or prices. */
export function testEnemyChoices() {
  return allowedClasses().map(hull => Object.freeze({
    id: hull.id, name: hull.name, subtitle: hull.subtitle, berths: hull.berths,
    renderLength: hull.stats.renderLength, renderWidth: hull.stats.renderWidth
  }));
}

export function unlockTestMode(password) { return password === ENTRY_CODE; }

class ExerciseGame extends Game {
  get chapter() { return null; }
  _checkChapters() {}
  availableJobs() { return []; }
  triggerEncounter() { return this._fail('Random transmissions are outside this exercise.', 'test-mode'); }
  travel() { return this._fail('This exercise stays in the test range.', 'test-mode'); }
  travelInfo() { return this._fail('This exercise stays in the test range.', 'test-mode'); }
  dock() { return this._fail('Use the target ship or the test controls for this exercise.', 'test-mode'); }
  buyShip() { return this._fail('Ship progression belongs to your voyage.', 'test-mode'); }
  selectShip() { return this._fail('Your test cutter stays the same for this exercise.', 'test-mode'); }
  buyUpgrade() { return this._fail('Equipment progression belongs to your voyage.', 'test-mode'); }
  interact() {
    const nearby = super.interact();
    return nearby?.type === 'dock' ? null : nearby;
  }
  // A missed UI save guard must not replace the player's normal voyage.
  save() { throw new Error('Test exercises cannot be saved as a voyage.'); }
  serialize() { throw new Error('Test exercises cannot be saved as a voyage.'); }
}

function rangeWorld(seed, danger) {
  const recovery = { id: 'test-recovery', name: 'Recovery beacon', kind: 'station', biome: 'station', faction: 'freewake', x: -1000, y: 900, radius: 42, color: '#80c6bd', lore: 'A recovery point for this exercise.' };
  const asteroids = [
    [-280, -260, 22], [390, 310, 28], [670, -330, 20], [-440, 400, 31]
  ].map(([x, y, radius], index) => ({ id: `${RANGE_ID}:rock:${index}`, x, y, radius, hp: 20, maxHp: 20, ore: 1, crystal: 0, angle: index * .6, spin: .025 * (index % 2 ? 1 : -1), seed: index + seed.length }));
  return {
    id: RANGE_ID, name: 'Test range', faction: 'freewake', danger, biome: 'barren',
    description: 'A separate practice area with one marked target.',
    bodies: [recovery], asteroids, enemies: [], bullets: [], pickups: [], signals: [], traffic: [],
    miningTarget: null, mining: null, miningBeams: {}, width: WORLD_RADIUS * 2, height: WORLD_RADIUS * 2, radius: WORLD_RADIUS
  };
}

/**
 * The session owns a fresh, unsavable Game. It accepts neither an existing Game
 * nor a save/passport, so preparing or resetting it cannot mutate a voyage.
 */
export function createTestSession({ scenario = 'ship-combat', enemyClassId = allowedClasses()[0].id, seed = 'practice' } = {}) {
  const exercise = TEST_SCENARIOS.find(item => item.id === scenario);
  if (!exercise) throw new RangeError('Choose one of the available test exercises.');
  const permitted = allowedClasses(), hull = permitted.find(item => item.id === enemyClassId);
  if (!hull) throw new RangeError('That hull is not available in test mode.');
  const sessionSeed = String(seed).slice(0, 128), game = new ExerciseGame(`farwake-test:${sessionSeed}`);
  const danger = 1 + permitted.indexOf(hull) * 2;
  game.isTestMode = true;
  game.state.testMode = true;
  game.state.systemId = RANGE_ID;
  game.state.locationId = null;
  game.state.mode = 'ship';
  game.state.lastBodyId = 'test-recovery';
  game.state.interior = null;
  game.state.pendingEncounter = null;
  game.state.nextEncounterAt = Number.MAX_SAFE_INTEGER;
  game.state.credits = 0;
  game.state.cargo = { ore: 0, crystal: 0 };
  game.state.upgrades = {};
  game.state.fleet = { owned: [SHIP_CLASSES[0].id], history: [] };
  for (const key of ['crew', 'formerCrew', 'memorial', 'boardingHistory', 'missions', 'completedJobs', 'journal', 'knownLore', 'completedChapters', 'encounterHistory', 'activityTokens', 'storyActions', 'flags']) game.state[key] = [];
  game.state.boarding = null;
  game.state.worlds = {};
  game.state.visited = [RANGE_ID];
  game.state.discovered = [RANGE_ID];
  Object.assign(game.state.ship, { id: 'test-cutter', name: 'Test cutter', classId: SHIP_CLASSES[0].id, x: 0, y: 0, vx: 0, vy: 0, angle: 0, angularVelocity: 0 });
  game._updateStats(true);
  game.state.person = { ...game.state.person, health: 100, down: false, facing: 'right' };
  game._runtime = rangeWorld(sessionSeed, danger);
  game.galaxy = [{ id: RANGE_ID, name: 'Test range', gx: 0, gy: 0, authored: true, faction: 'freewake', danger, biome: 'barren', description: game.system.description, bodies: clone(game.system.bodies) }];
  const maxHp = 36 + danger * 10;
  const close = scenario !== 'ship-combat';
  const disabled = scenario === 'boarding' || scenario === 'person-combat';
  const enemy = {
    id: TARGET_ID, name: `Practice pirate · ${hull.name}`, faction: 'cinder',
    ...enemyHullProfile(hull.id), x: close ? 140 : 430, y: 0, vx: 0, vy: 0, angle: Math.PI,
    hp: disabled ? Math.floor(maxHp * .35) : maxHp, maxHp, disabled,
    active: !disabled, speed: 80 + danger * 10, damage: 5 + danger,
    cooldown: scenario === 'raid-defense' ? 4 : 2.4, reward: 0, boardingCooldown: 0, boardingCharge: 0
  };
  game.system.enemies.push(enemy);
  if (scenario === 'raid-defense') {
    game.state.ship.shield = 0;
    game._hitTimer = 8; // The ordinary damage-recovery delay lets the normal grapple complete.
  }
  if (scenario === 'person-combat') {
    const boarded = game.boardEnemy(enemy.id);
    if (!boarded.ok) throw new Error('The boarding exercise could not be prepared.');
  }
  game.events.length = 0;
  game.state.journal.length = 0;
  const config = Object.freeze({ scenario: exercise.id, enemyClassId: hull.id, seed: sessionSeed });
  return {
    game, config, scenario: exercise, scenarioId: exercise.id, enemyClassId: hull.id,
    targetId: enemy.id, goal: exercise.goal, startedAt: game.state.stats.time
  };
}

export function resetTestSession(session) {
  if (!session?.game?.isTestMode || !session.config) throw new TypeError('Choose a test exercise first.');
  return createTestSession(session.config);
}

/** A read-only goal summary; it never consumes events or awards progression. */
export function testSessionStatus(session) {
  const game = session?.game;
  if (!game?.isTestMode) return null;
  const target = game.system.enemies.find(enemy => enemy.id === session.targetId);
  const boarding = game.state.boarding;
  const remaining = boarding?.enemies?.filter(actor => actor.health > 0).length || 0;
  const priorOutcome = [...game.state.boardingHistory].reverse().find(action => action.id?.startsWith(`boarding:${session.targetId}:`));
  const outcome = boarding?.phase === 'active' ? null : boarding?.phase ? boarding : priorOutcome;
  const result = (phase, title, detail) => ({ phase, complete: phase === 'complete', title, detail, objective: session.goal, targetId: session.targetId, enemiesRemaining: remaining });
  if (game.state.stats.rescues > 0 || outcome?.phase === 'lost') return result('failed', 'Exercise ended', 'Your captain was recovered. Retry the exercise with a fresh ship and crew deck.');
  if (outcome?.phase === 'won') return result('complete', 'Deck secure', outcome.kind === 'defense' ? 'The pirates are cleared from your ship. Retry or choose another exercise.' : 'The hostile crew is cleared. Return across the tether or take the target helm.');
  if (outcome?.phase === 'retreated') return result('withdrawn', 'Back across the tether', 'You withdrew safely. Retry when you want another boarding attempt.');
  if (boarding?.phase === 'active') return result('active', boarding.kind === 'defense' ? 'Defend your deck' : 'Clear the target deck', `${remaining} hostile ${remaining === 1 ? 'crew member remains' : 'crew members remain'}. Your sidearm is ready; no allied gunners are present.`);
  if (session.scenarioId === 'ship-combat') {
    if (!target || target.hp <= 0) return result('complete', 'Target destroyed', 'The hull is gone. Retry to practice disabling it without destroying it.');
    if (target.disabled) return result('complete', 'Target disabled', 'Release FIRE. Approach the marked hull to board it, or retry the ship fight.');
    return result('active', 'Disable the pirate', `Target hull ${Math.ceil(target.hp)} / ${Math.ceil(target.maxHp)}. Aim your cutter and fire controlled bursts.`);
  }
  if (session.scenarioId === 'raid-defense') return result('ready', 'Pirate grapples closing', 'Your shields are down. Stay close to let the tether attach, or use thrust to escape its reach.');
  if (!target || target.hp <= 0) return result('failed', 'No boarding target', 'The target hull was destroyed. Retry to cross aboard while it is disabled.');
  return result('ready', 'Cross the tether', 'Approach the disabled ship and use Board. Its exterior and crew deck belong to the same hull.');
}
