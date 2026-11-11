/** System-space geometry. Galaxy-chart and on-foot coordinates use other units. */
export const SYSTEM_SPACE_VERSION = 1;
export const SYSTEM_SPACE_SCALE = 3;
export const LEGACY_WORLD_RADIUS = 2700;
export const WORLD_RADIUS = LEGACY_WORLD_RADIUS * SYSTEM_SPACE_SCALE;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Keep the released placement stream, identities and physical body sizes. */
export function systemBodyPosition(body, index, systemId, scale = SYSTEM_SPACE_SCALE) {
  const angle = -.55 + index * 2.3;
  let x = index === 0 ? 0 : Math.cos(angle) * (780 + index * 190);
  let y = index === 0 ? 0 : Math.sin(angle) * (780 + index * 190);
  if (systemId === 'hearth' && body.id === 'morrow') { x = 840; y = -420; }
  return { x: finite(body.x, x) * scale, y: finite(body.y, y) * scale };
}

/** A position transform only: radii, local deck coordinates and velocity stay put. */
export function scaleSpacePoint(point, factor = SYSTEM_SPACE_SCALE) {
  if (!point || typeof point !== 'object') return point;
  if (Number.isFinite(point.x)) point.x *= factor;
  if (Number.isFinite(point.y)) point.y *= factor;
  return point;
}
