import { MISSIONS } from './mission-definitions.mjs';

// Fictional gameplay loadouts, shared by simulation, prediction and presentation.
// Combat equipment never grants command: Hale keeps that identity in every kit.
const base = {
  weapon: 'rifle', weaponLabel: 'Carbine', moveScale: 1, healthScale: 1,
  bulletDamageScale: 1, damage: 24, range: 600, magSize: 30, reserve: 150,
  fireInterval: .17, reloadDuration: 2.2, medkits: 2, reviveDuration: 4,
  aidRate: 1, smokes: 2, grenades: 0, spread: .018, movingSpread: .02,
  aiSpread: .045, aiMovingSpread: .045, aiRange: 440, aiNightRange: 350,
  observationMode: null, observeMoveScale: .24, observeRange: 900,
  observeNightRange: 650, observeHalfAngle: .55,
};
const profile = values => Object.freeze({ ...base, ...values });
export const SQUAD_ROLES = Object.freeze({
  rifleman: profile({ id: 'rifleman', label: 'Rifleman', shortLabel: 'RIFLE',
    description: 'A balanced carbine loadout with extra ammunition and smoke.',
    advantage: 'Flexible carbine, extra reserve ammunition and three smoke rounds.',
    tradeoff: 'No launcher, scope, medical specialization or armor.',
    reserve: 180, fireInterval: .15, smokes: 3 }),
  grenadier: profile({ id: 'grenadier', label: 'Grenadier', shortLabel: 'GREN',
    weaponLabel: 'Carbine + launcher',
    description: 'Binoculars and four launcher rounds. Slower with the heavy load. Keep people clear of the blast.',
    advantage: 'Four launcher rounds, three smoke rounds and directional binoculars.',
    tradeoff: 'Slower movement; binoculars must be lowered before firing.',
    moveScale: .8, fireInterval: .18, reloadDuration: 2.5, smokes: 3,
    grenades: 4, observationMode: 'binoculars' }),
  medic: profile({ id: 'medic', label: 'Medic', shortLabel: 'MEDIC',
    weaponLabel: 'Carbine + aid kit', description: 'Faster casualty aid and six medical supplies.',
    advantage: 'Six medical supplies and faster reviving and treatment.',
    tradeoff: 'Standard carbine; fewer reserve rounds than a rifleman.',
    medkits: 6, reviveDuration: 2.6, aidRate: 1.35 }),
  support: profile({ id: 'support', label: 'Machine gunner', shortLabel: 'SAW',
    weapon: 'support', weaponLabel: 'M249 SAW',
    description: 'A 100-round belt and sustained suppressive fire. Longer reloads.',
    advantage: 'A 100-round belt and the strongest sustained suppression.',
    tradeoff: 'Long belt reloads and reduced accuracy while moving.',
    moveScale: .94, magSize: 100, reserve: 300, fireInterval: .095,
    reloadDuration: 4.1, movingSpread: .035, aiSpread: .065 }),
  sniper: profile({ id: 'sniper', label: 'Sniper', shortLabel: 'SNIPER',
    weapon: 'sniper', weaponLabel: 'Scoped rifle',
    description: 'Precise, powerful long-range shots through a narrow scope. Small magazine and slow follow-up shots.',
    advantage: 'Long-range scope and powerful, accurate stationary shots.',
    tradeoff: 'Five rounds, slow follow-up shots, limited reserve and poor moving or unscoped accuracy.',
    moveScale: .9, healthScale: .9, damage: 80, range: 900, magSize: 5,
    reserve: 25, fireInterval: 1.25, reloadDuration: 3.2, spread: .065,
    scopedSpread: .004, movingSpread: .085, aiSpread: .008,
    aiMovingSpread: .09, aiRange: 760, aiNightRange: 520,
    observationMode: 'scope', observeMoveScale: .38, observeHalfAngle: .32,
    observeNightRange: 700 }),
  heavy: profile({ id: 'heavy', label: 'Armored assault', shortLabel: 'HEAVY',
    weapon: 'support', weaponLabel: 'Assault machine gun',
    description: 'Extra protection and a 60-round belt for close and medium-range fighting. Armor does not stop blast damage.',
    advantage: 'Twenty percent more health and eighteen percent less bullet damage.',
    tradeoff: 'Slow movement, a long reload and a shorter useful range. Explosions bypass the armor.',
    moveScale: .72, healthScale: 1.2, bulletDamageScale: .82, damage: 26,
    range: 460, magSize: 60, reserve: 180, fireInterval: .13,
    reloadDuration: 4.6, spread: .032, movingSpread: .055,
    aiSpread: .06, aiMovingSpread: .065, aiRange: 390, aiNightRange: 320 }),
});

export const DEFAULT_SQUAD_ROLES = Object.freeze(['rifleman', 'grenadier', 'medic', 'support']);
export const OBSERVE_HALF_ANGLE = .55;
export const AI_FIRE_DISCIPLINE = Object.freeze({
  rifleman: Object.freeze({ burst: 3, recovery: [1.05, 1.45] }),
  grenadier: Object.freeze({ burst: 2, recovery: [1.2, 1.7] }),
  medic: Object.freeze({ burst: 2, recovery: [1.3, 1.85] }),
  support: Object.freeze({ burst: 12, recovery: [.85, 1.35] }),
  sniper: Object.freeze({ burst: 1, recovery: [1.6, 2.2] }),
  heavy: Object.freeze({ burst: 6, recovery: [1.25, 1.7] }),
});
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const canonicalRole = role => role === 'leader' ? 'rifleman' : role;

/** Storage migration is forgiving; wire configuration uses strict validation. */
export function normalizeSquadRoles(raw) {
  return DEFAULT_SQUAD_ROLES.map((fallback, slot) => {
    const role = canonicalRole(Array.isArray(raw) ? raw[slot] : null);
    return typeof role === 'string' && Object.hasOwn(SQUAD_ROLES, role) ? role : fallback;
  });
}
export function validSquadRoles(raw) {
  return Array.isArray(raw) && raw.length === 4 && raw.every(role => typeof role === 'string' && Object.hasOwn(SQUAD_ROLES, role));
}
export function roleProfile(actorOrRole) {
  const role = canonicalRole(typeof actorOrRole === 'string' ? actorOrRole : actorOrRole?.role);
  return typeof role === 'string' && Object.hasOwn(SQUAD_ROLES, role) ? SQUAD_ROLES[role] : SQUAD_ROLES.rifleman;
}
export function isSquadCommander(actor) {
  // Legacy actors may still be used by saved presentation fixtures. New actors
  // always carry an explicit boolean, so choosing a combat kit cannot grant it.
  return actor?.commander === true || (actor?.commander === undefined && actor?.role === 'leader' && actor?.team !== 'allied');
}
export function canObserve(actorOrRole) { return roleProfile(actorOrRole).observationMode !== null; }
export function observationBlocksFire(actorOrRole) { return roleProfile(actorOrRole).observationMode === 'binoculars'; }

export function movementSpeed(actor, sprint = false) {
  const loadout = roleProfile(actor), observing = canObserve(actor) && actor?.observing;
  return (sprint && !observing ? 166 : 112) * loadout.moveScale *
    (1 - clamp(finite(actor?.suppression), 0, 1) * .22) * (observing ? loadout.observeMoveScale : 1);
}

/** Shared day/night range; point-dependent use keeps optics directional. */
export function visionRange(actor, missionIndex = 0, point) {
  const night = MISSIONS[missionIndex]?.lighting === 'night', loadout = roleProfile(actor);
  const baseRange = night ? 390 : 540;
  if (!canObserve(actor) || !actor?.observing) return baseRange;
  if (point) {
    const direction = Math.atan2(point.y - actor.y, point.x - actor.x);
    const difference = Math.atan2(Math.sin(direction - finite(actor.angle)), Math.cos(direction - finite(actor.angle)));
    if (Math.abs(difference) > loadout.observeHalfAngle) return baseRange;
  }
  return night ? loadout.observeNightRange : loadout.observeRange;
}
