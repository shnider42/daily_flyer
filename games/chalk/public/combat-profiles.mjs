// Shared game balance, not a claim about a particular historical loadout.
export const WORLD_UNITS_PER_METRE = 8;

const freeze = value => Object.freeze(value);
export const BALLISTIC_PROFILES = freeze({
  rifle: freeze({ speedMps: 800, range: 600 }),
  support: freeze({ speedMps: 800, range: 600 }),
  hostile: freeze({ speedMps: 700, range: 600 }),
  hostile_support: freeze({ speedMps: 750, range: 600 }),
  sniper: freeze({ speedMps: 850, range: 900 }),
  'tank-cannon': freeze({ speedMps: 1150 / WORLD_UNITS_PER_METRE, range: 1100 }),
  'vehicle-mg': freeze({ speedMps: 900 / WORLD_UNITS_PER_METRE, range: 850 }),
});
export function ballisticProfile(weapon) {
  return BALLISTIC_PROFILES[weapon] || BALLISTIC_PROFILES.rifle;
}

export const ENEMY_ROLES = freeze({
  rifleman: freeze({ kind:'rifleman', name:'Armed fighter', weapon:'hostile', cost:1, speed:57, advanceSpeed:49,
    range:450, nightRange:370, stop:270, magazine:30, reserve:300, reload:2.2,
    burst:4, interval:.13, recovery:[1.35,1.95], spread:[.1,.17], suppression:.1 }),
  gunner: freeze({ kind:'gunner', name:'Support gunner', weapon:'hostile_support', cost:3, speed:42, advanceSpeed:35,
    range:460, nightRange:380, stop:330, magazine:60, reserve:180, reload:4.4,
    burst:12, interval:.1, recovery:[1.65,2.35], spread:[.15,.22], suppression:.16, braceDuration:.8 }),
  flanker: freeze({ kind:'flanker', name:'Mobile fighter', weapon:'hostile', cost:1, speed:70, advanceSpeed:60,
    range:390, nightRange:340, stop:225, magazine:30, reserve:180, reload:2.4,
    burst:3, interval:.14, recovery:[1.5,2.1], spread:[.11,.17], suppression:.1, flankInterval:3.5, memorySeconds:6 }),
  sniper: freeze({ kind:'sniper', name:'Sniper', weapon:'sniper', cost:3, speed:35, advanceSpeed:35,
    range:760, nightRange:520, stop:410, magazine:5, reserve:25, reload:3,
    burst:1, interval:3.4, recovery:[3.4,4.2], spread:[.012,.012], suppression:.1, braceDuration:1.55 }),
});
export function enemyProfile(actorOrKind) {
  const kind = typeof actorOrKind === 'string' ? actorOrKind : actorOrKind?.kind;
  return ENEMY_ROLES[kind] || ENEMY_ROLES.rifleman;
}

export const ENCOUNTER_BUDGETS = freeze({
  story: freeze({ maxAlive:13, weight:15, initial:6, reinforcementCount:1, spawnDelay:17, gunners:1, flankers:1, snipers:1 }),
  standard: freeze({ maxAlive:19, weight:23, initial:8, reinforcementCount:2, spawnDelay:18, gunners:2, flankers:2, snipers:1 }),
  veteran: freeze({ maxAlive:23, weight:29, initial:9, reinforcementCount:2, spawnDelay:14, gunners:2, flankers:3, snipers:1 }),
});
export function encounterBudget(difficulty) {
  return ENCOUNTER_BUDGETS[difficulty] || ENCOUNTER_BUDGETS.standard;
}

export const INITIAL_FIELD_RESERVE = 3;
const initialFieldReservations = new WeakSet();

/** Only the synchronous initial encounter pass reserves the three added field
 * rifles. Later authored entries use every free slot; no hidden cap survives
 * setup, and this temporary bookkeeping never enters a network snapshot.
 */
export function withInitialFieldReserve(state, seedEncounters) {
  const alreadyReserved = initialFieldReservations.has(state);
  initialFieldReservations.add(state);
  try { return seedEncounters(); }
  finally { if (!alreadyReserved) initialFieldReservations.delete(state); }
}

/** Count and role budgets apply to living actors; bodies never consume a slot. */
export function canAddEnemy(state, kind) {
  const profile=enemyProfile(kind),budget=encounterBudget(state.difficulty),living=state.enemies.filter(a=>a.alive);
  const reserve=initialFieldReservations.has(state)?INITIAL_FIELD_RESERVE:0;
  if(living.length>=Math.max(0,Math.min(state.maxEnemies,budget.maxAlive)-reserve))return false;
  if(living.reduce((total,a)=>total+enemyProfile(a).cost,0)+profile.cost>budget.weight-reserve)return false;
  const cap=kind==='gunner'?budget.gunners:kind==='flanker'?budget.flankers:kind==='sniper'?budget.snipers:Infinity;
  return living.filter(a=>a.kind===kind).length<cap;
}
