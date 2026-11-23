// Shared game balance, not a claim about a particular historical loadout.
export const WORLD_UNITS_PER_METRE = 8;

const freeze = value => Object.freeze(value);
export const BALLISTIC_PROFILES = freeze({
  rifle: freeze({ speedMps: 800, range: 600 }),
  support: freeze({ speedMps: 800, range: 600 }),
  hostile: freeze({ speedMps: 700, range: 600 }),
  hostile_support: freeze({ speedMps: 750, range: 600 }),
  sniper: freeze({ speedMps: 850, range: 900 }),
});
export function ballisticProfile(weapon) {
  return BALLISTIC_PROFILES[weapon] || BALLISTIC_PROFILES.rifle;
}

export const ENEMY_ROLES = freeze({
  rifleman: freeze({ kind:'rifleman', name:'Armed fighter', weapon:'hostile', cost:1, speed:57, advanceSpeed:49,
    range:450, nightRange:370, stop:270, magazine:30, reserve:300, reload:2.2,
    burst:3, interval:.19, recovery:[1.25,1.75], spread:[.09,.16], suppression:.1 }),
  gunner: freeze({ kind:'gunner', name:'Support gunner', weapon:'hostile_support', cost:3, speed:42, advanceSpeed:35,
    range:460, nightRange:380, stop:330, magazine:60, reserve:180, reload:4.4,
    burst:6, interval:.13, recovery:[2.4,3.2], spread:[.13,.19], suppression:.16, braceDuration:.8 }),
  flanker: freeze({ kind:'flanker', name:'Mobile fighter', weapon:'hostile', cost:1, speed:70, advanceSpeed:60,
    range:390, nightRange:340, stop:225, magazine:30, reserve:180, reload:2.4,
    burst:2, interval:.2, recovery:[1.6,2.2], spread:[.1,.16], suppression:.1, flankInterval:3.5, memorySeconds:6 }),
  sniper: freeze({ kind:'sniper', name:'Sniper', weapon:'sniper', cost:3, speed:35, advanceSpeed:35,
    range:760, nightRange:520, stop:410, magazine:5, reserve:25, reload:3,
    burst:1, interval:3.4, recovery:[3.4,4.2], spread:[.012,.012], suppression:.1, braceDuration:1.55 }),
});
export function enemyProfile(actorOrKind) {
  const kind = typeof actorOrKind === 'string' ? actorOrKind : actorOrKind?.kind;
  return ENEMY_ROLES[kind] || ENEMY_ROLES.rifleman;
}

export const ENCOUNTER_BUDGETS = freeze({
  story: freeze({ maxAlive:10, weight:12, initial:6, reinforcementCount:1, spawnDelay:17, gunners:1, flankers:1, snipers:1 }),
  standard: freeze({ maxAlive:16, weight:20, initial:8, reinforcementCount:2, spawnDelay:18, gunners:2, flankers:2, snipers:1 }),
  veteran: freeze({ maxAlive:20, weight:26, initial:9, reinforcementCount:2, spawnDelay:14, gunners:2, flankers:3, snipers:1 }),
});
export function encounterBudget(difficulty) {
  return ENCOUNTER_BUDGETS[difficulty] || ENCOUNTER_BUDGETS.standard;
}

/** Count and role budgets apply to living actors; bodies never consume a slot. */
export function canAddEnemy(state, kind) {
  const profile=enemyProfile(kind),budget=encounterBudget(state.difficulty),living=state.enemies.filter(a=>a.alive);
  if(living.length>=Math.min(state.maxEnemies,budget.maxAlive))return false;
  if(living.reduce((total,a)=>total+enemyProfile(a).cost,0)+profile.cost>budget.weight)return false;
  const cap=kind==='gunner'?budget.gunners:kind==='flanker'?budget.flankers:kind==='sniper'?budget.snipers:Infinity;
  return living.filter(a=>a.kind===kind).length<cap;
}
