// Gameplay-scale hand grenades. These values are authored for CHALK's compact
// districts; they are not measurements or handling guidance for real devices.
import { buildingAt, getSolidWalls } from './building-geometry.mjs';
import { rayWallDistance } from './visibility.mjs';
import { flashIntensity } from './flash-status.mjs';
export { flashIntensity } from './flash-status.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const HAND_GRENADES = Object.freeze({
  frag: Object.freeze({ inventory: 'frags', range: 225, minimumRange: 32, defaultRange: 180, fuse: 2.4, radius: 96, cooldown: 1.05 }),
  flashbang: Object.freeze({ inventory: 'flashbangs', range: 225, minimumRange: 32, defaultRange: 180, fuse: 1.3, radius: 240, roomRadius: 380, cooldown: 1.05 }),
});

/** A wall or a closed corner fully shields the flash. An open doorway does not.
 * Facing is deliberately ignored: direct room exposure affects everyone. */
export function flashExposure(world, origin, actor) {
  if (!world || !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y) || !Number.isFinite(actor?.x) || !Number.isFinite(actor?.y)) return 0;
  const sourceRoom = buildingAt(world, origin), listenerRoom = buildingAt(world, actor);
  const sameBuilding = sourceRoom != null && sourceRoom === listenerRoom;
  const config = HAND_GRENADES.flashbang, radius = sameBuilding ? config.roomRadius : config.radius;
  const dx = actor.x - origin.x, dy = actor.y - origin.y, d = Math.hypot(dx, dy);
  if (d >= radius) return 0;
  if (d > .001 && getSolidWalls(world).some(wall => rayWallDistance(origin.x, origin.y, dx / d, dy / d, wall, d + .001) <= d)) return 0;
  return sameBuilding ? clamp(1 - d / config.roomRadius * .17, .83, 1) : clamp(1 - d / radius * .8, .2, 1);
}

export function applyFlashStatus(actor, strength, time) {
  strength = clamp(Number(strength) || 0, 0, 1);
  if (!actor || !actor.alive || strength <= 0 || !Number.isFinite(time)) return false;
  const current = flashIntensity(actor, time), until = time + 1.15 + strength * 2.35;
  actor.flashStrength = Math.max(current, strength);
  actor.flashUntil = Math.max(Number(actor.flashUntil) || 0, until);
  actor.flashStartedAt = time;
  actor.aimCharge = 0; actor.aimTargetId = null; actor.braced = false; actor.braceProgress = 0;
  actor.perceivedTargetId = null; actor.target = null; actor.senseTimer = 0;
  actor.path = []; actor.pathTimer = 0;
  if (actor.team === 'civilian') actor.panicked = Math.max(actor.panicked || 0, 10);
  return true;
}
