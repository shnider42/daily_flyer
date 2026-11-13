/** Keep saved captains on the connected floor after a place changes shape. */
import { isWalkable } from './surface.mjs';

export function reconcileSurfacePosition(person, surface, { reset = false, fallback } = {}) {
  if (!person || !surface) return false;
  const version = surface.layoutVersion ? `${surface.id}:${surface.layoutVersion}` : null;
  const changed = !!version && person.surfaceLayoutVersion !== version;
  const invalid = !Number.isFinite(person.x) || !Number.isFinite(person.y) || !isWalkable(surface, person.x, person.y);
  if (reset || changed || invalid) {
    const point = !reset && !changed && typeof fallback === 'function' ? fallback(person) : surface.spawn;
    Object.assign(person, point || surface.spawn, { vx: 0, vy: 0, moving: false });
  }
  if (version) person.surfaceLayoutVersion = version;
  else delete person.surfaceLayoutVersion;
  return reset || changed || invalid;
}
