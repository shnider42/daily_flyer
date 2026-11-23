import { MISSIONS } from './mission-definitions.mjs';

// Fictional gameplay loadouts, shared by simulation, prediction and presentation.
// The values describe game balance rather than real weapon specifications.
export const SQUAD_ROLES = Object.freeze({
  leader: Object.freeze({ id: 'leader', label: 'Squad lead', shortLabel: 'LEAD', weapon: 'rifle', weaponLabel: 'Carbine', description: 'Direct the squad and place movement orders.', moveScale: 1, magSize: 30, reserve: 180, fireInterval: .15, reloadDuration: 2.2, medkits: 2, reviveDuration: 4 }),
  grenadier: Object.freeze({ id: 'grenadier', label: 'Grenadier', shortLabel: 'GREN', weapon: 'rifle', weaponLabel: 'Carbine + launcher', description: 'Binoculars and four launcher rounds. Slower with the heavy load. Launcher is under your control; keep people clear of the blast.', moveScale: .8, magSize: 30, reserve: 150, fireInterval: .18, reloadDuration: 2.5, medkits: 2, reviveDuration: 4 }),
  medic: Object.freeze({ id: 'medic', label: 'Medic', shortLabel: 'MEDIC', weapon: 'rifle', weaponLabel: 'Carbine + aid kit', description: 'Faster casualty aid and six medical supplies.', moveScale: 1, magSize: 30, reserve: 150, fireInterval: .17, reloadDuration: 2.2, medkits: 6, reviveDuration: 2.6 }),
  support: Object.freeze({ id: 'support', label: 'Machine gunner', shortLabel: 'SAW', weapon: 'support', weaponLabel: 'M249 SAW', description: 'A 100-round belt and sustained suppressive fire. Longer reloads.', moveScale: .94, magSize: 100, reserve: 300, fireInterval: .095, reloadDuration: 4.1, medkits: 2, reviveDuration: 4 }),
});

export const OBSERVE_HALF_ANGLE = .55;
// AI fire uses the same weapon cadence as a human, with finite, audible strings
// and pauses. Ammunition, reloads and civilian-safe sight checks still apply to
// every round. The slower grenadier/medic conserve ammunition between contacts.
export const AI_FIRE_DISCIPLINE = Object.freeze({
  leader: Object.freeze({ burst: 3, recovery: [1.05, 1.45] }),
  grenadier: Object.freeze({ burst: 2, recovery: [1.2, 1.7] }),
  medic: Object.freeze({ burst: 2, recovery: [1.3, 1.85] }),
  support: Object.freeze({ burst: 12, recovery: [.85, 1.35] }),
});
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function roleProfile(actorOrRole) {
  const role = typeof actorOrRole === 'string' ? actorOrRole : actorOrRole?.role;
  return SQUAD_ROLES[role] || SQUAD_ROLES.leader;
}

export function movementSpeed(actor, sprint = false) {
  const profile = roleProfile(actor), observing = profile.id === 'grenadier' && actor?.observing;
  return (sprint && !observing ? 166 : 112) * profile.moveScale *
    (1 - clamp(finite(actor?.suppression), 0, 1) * .22) * (observing ? .24 : 1);
}

/** Shared day/night range; point-dependent use keeps binoculars directional. */
export function visionRange(actor, missionIndex = 0, point) {
  const night = MISSIONS[missionIndex]?.lighting === 'night';
  const base = night ? 390 : 540;
  if (actor?.role !== 'grenadier' || !actor.observing) return base;
  if (point) {
    const direction = Math.atan2(point.y - actor.y, point.x - actor.x);
    const difference = Math.atan2(Math.sin(direction - finite(actor.angle)), Math.cos(direction - finite(actor.angle)));
    if (Math.abs(difference) > OBSERVE_HALF_ANGLE) return base;
  }
  return night ? 650 : 900;
}
