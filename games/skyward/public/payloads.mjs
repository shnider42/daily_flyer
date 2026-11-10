/* Fictional arcade balance. These distances, timing and damage are game rules,
 * not weapon yields, delivery procedures or real-world safe distances. */
export const NUCLEAR_PAYLOADS = Object.freeze({
  atomic: Object.freeze({ id: 'atomic', label: 'Atomic · Hiroshima class', shortName: 'ATOMIC', minimumAltitude: 900, blastRadius: 2600, damage: 650, waveSpeed: 650, effectLife: 22 }),
  hydrogen: Object.freeze({ id: 'hydrogen', label: 'Hydrogen bomb', shortName: 'HYDROGEN', minimumAltitude: 1700, blastRadius: 5000, damage: 1000, waveSpeed: 750, effectLife: 28 }),
  tsar: Object.freeze({ id: 'tsar', label: 'Tsar Bomba class', shortName: 'TSAR', minimumAltitude: 2800, blastRadius: 8500, damage: 1600, waveSpeed: 850, effectLife: 34 }),
});

export const getNuclearPayload = value => typeof value === 'string' && Object.hasOwn(NUCLEAR_PAYLOADS, value) ? NUCLEAR_PAYLOADS[value] : null;

export function normalizePayload(aircraft, value, fallback = 'conventional') {
  if ((typeof aircraft === 'string' ? aircraft : aircraft?.id) !== 'b2') return 'conventional';
  return value === 'conventional' || getNuclearPayload(value) ? value : getNuclearPayload(fallback) ? fallback : 'conventional';
}

export function nuclearDamageAtDistance(profile, distance) {
  if (!profile || !Number.isFinite(distance) || distance >= profile.blastRadius) return 0;
  const fraction = Math.max(0, distance) / profile.blastRadius;
  return profile.damage * (0.08 + Math.pow(1 - fraction, 1.25));
}

// Sweep a moving aircraft against a simultaneously expanding sphere. Checking
// only the end point misses a fast crossing between authority updates.
export function expandingBlastTime(from, to, center, beforeRadius, afterRadius) {
  const x = from.x - center.x, y = from.y - center.y, z = from.z - center.z;
  const vx = to.x - from.x, vy = to.y - from.y, vz = to.z - from.z;
  const dr = afterRadius - beforeRadius;
  const c = x * x + y * y + z * z - beforeRadius * beforeRadius;
  if (c <= 0) return 0;
  const a = vx * vx + vy * vy + vz * vz - dr * dr;
  const b = 2 * (x * vx + y * vy + z * vz - beforeRadius * dr);
  if (Math.abs(a) < 1e-9) {
    const t = Math.abs(b) > 1e-9 ? -c / b : -1;
    return t >= 0 && t <= 1 ? t : null;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant), first = (-b - root) / (2 * a), second = (-b + root) / (2 * a);
  const hits = [first, second].filter(t => t >= 0 && t <= 1);
  return hits.length ? Math.min(...hits) : null;
}
