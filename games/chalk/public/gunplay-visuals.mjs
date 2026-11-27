// Presentation-only feedback. No simulation random numbers, damage, aim,
// movement, visibility state, or projectile paths are changed here.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

export const GUNPLAY_LIMITS = Object.freeze({ remnants: 40, performanceRemnants: 24, memories: 32, streaks: 64 });
const WEAPONS = Object.freeze({
  rifle: Object.freeze({ kick: 2.8, recover: .145, streak: 25, smoke: .31, shell: .38 }),
  hostile: Object.freeze({ kick: 3.1, recover: .155, streak: 25, smoke: .34, shell: .4 }),
  support: Object.freeze({ kick: 2.2, recover: .12, streak: 31, smoke: .37, shell: .42 }),
  hostile_support: Object.freeze({ kick: 2.6, recover: .13, streak: 31, smoke: .39, shell: .42 }),
  sniper: Object.freeze({ kick: 4.1, recover: .21, streak: 35, smoke: .4, shell: .46 }),
});
export function gunplayProfile(weapon) { return WEAPONS[weapon] || WEAPONS.rifle; }

/** A fast shoulder impulse with a smooth return, never a camera/aim offset. */
export function weaponKick(age, weapon, reducedMotion = false) {
  const profile = gunplayProfile(weapon);
  if (reducedMotion || !Number.isFinite(age) || age < 0 || age >= profile.recover) return 0;
  const attack = Math.min(1, age / .014), settle = Math.max(0, 1 - age / profile.recover);
  return profile.kick * attack * settle * settle;
}

/** Variation is stable across repeated/co-op packets and consumes no game RNG. */
export function flashVariation(id) {
  const n = Math.imul((finite(id) | 0) ^ 0x45d9f3b, 0x45d9f3b) >>> 0;
  return { length: .94 + (n % 7) * .02, width: .93 + ((n >>> 4) % 6) * .028, angle: (((n >>> 8) % 7) - 3) * .012 };
}

/** A short tail entirely inside the latest authoritative travel segment.
 * There is no extrapolation or implied continuing flight after a collision.
 */
export function projectileStreak(bullet, reducedMotion = false) {
  if (![bullet?.x, bullet?.y, bullet?.px, bullet?.py].every(Number.isFinite)) return null;
  const dx = bullet.x - bullet.px, dy = bullet.y - bullet.py, travelled = Math.hypot(dx, dy);
  if (travelled < .01) return null;
  const length = Math.min(travelled, gunplayProfile(bullet.weapon).streak * (reducedMotion ? .7 : 1));
  const ux = dx / travelled, uy = dy / travelled;
  return { x: bullet.x, y: bullet.y, tailX: bullet.x - ux * length, tailY: bullet.y - uy * length, ux, uy, length };
}

export function impactStyle(material) {
  if (material === 'metal') return { kind: 'metal', color: '#efc27a', dust: '#aaa391', particles: 5, duration: .27, reach: 25 };
  if (['wood', 'timber'].includes(material)) return { kind: 'wood', color: '#b99862', dust: '#a68d66', particles: 4, duration: .36, reach: 18 };
  if (['sand', 'sandbag', 'sandbags', 'dirt', 'earth'].includes(material)) return { kind: 'sand', color: '#bba77f', dust: '#ad9b78', particles: 3, duration: .39, reach: 13 };
  return { kind: 'concrete', color: '#ded3b5', dust: '#bfb499', particles: 4, duration: .35, reach: 19 };
}

/** The open side of a struck surface is the visible origin of its debris.
 * This subpixel nudge avoids testing a point exactly on solid wall geometry.
 */
export function impactOrigin(event) {
  const angle = finite(event.angle), nx = finite(event.normalX, -Math.cos(angle)), ny = finite(event.normalY, -Math.sin(angle));
  const length = Math.hypot(nx, ny) || 1, normalX = nx / length, normalY = ny / length;
  return { x: event.x + normalX * .8, y: event.y + normalY * .8, normalX, normalY, angle: Math.atan2(normalY, normalX) };
}

const trim = (map, max) => { while (map.size > max) map.delete(map.keys().next().value); };
const put = (map, key, value) => { map.delete(key); map.set(key, value); trim(map, GUNPLAY_LIMITS.memories); };

/** Small local event history survives short simulation effects and snapshots.
 * Visibility is checked at admission by the renderer and again when drawn.
 */
export class GunplayPresentation {
  constructor() { this.cursor = 0; this.scene = null; this.baseScene = null; this.lastStateTime = null; this.remnants = []; this.shots = new Map(); this.hits = new Map(); }
  clear() { this.remnants.length = 0; this.shots.clear(); this.hits.clear(); }
  update(state, view = {}, canSee = () => false) {
    const now = finite(view.time, finite(state.time)), gameTime = finite(state.time);
    const baseScene = `${state.seed}:${state.missionIndex}`, scene = `${baseScene}:${view.effectEpoch ?? ''}`;
    const rewound = this.lastStateTime !== null && gameTime < this.lastStateTime - .001;
    if (this.scene !== scene || rewound) {
      this.clear();
      if (this.baseScene !== baseScene || rewound || gameTime < .25) this.cursor = 0;
      this.scene = scene; this.baseScene = baseScene;
    }
    this.lastStateTime = gameTime;
    const events = state.soundEvents || [];
    if (view.menu || view.showMap || view.paused || state.status && state.status !== 'playing') {
      this.clear();
      for (const event of events) this.cursor = Math.max(this.cursor, finite(event.id));
      return;
    }
    this.remnants = this.remnants.filter(effect => now >= effect.born && now - effect.born < effect.duration);
    for (const [id, shot] of this.shots) if (now < shot.born || now - shot.born >= .23) this.shots.delete(id);
    for (const [id, hit] of this.hits) if (now < hit.born || now - hit.born >= .16) this.hits.delete(id);
    for (const event of events) {
      if (!Number.isFinite(event.id) || event.id <= this.cursor) continue;
      this.cursor = event.id;
      if (!['shot', 'impact', 'victim_hit'].includes(event.type) || !Number.isFinite(event.x) || !Number.isFinite(event.y)) continue;
      const age = gameTime - finite(event.sourceTime, finite(event.time, gameTime));
      if (age < -.05 || age > .28) continue;
      const origin = event.type === 'impact' ? impactOrigin(event) : { x: event.x, y: event.y };
      if (!canSee(origin, event)) continue;
      // Limit catch-up presentation while preserving a brief response to a
      // real round delivered between two 10 Hz authority snapshots.
      const born = now - Math.min(Math.max(0, age), .055);
      if (event.type === 'victim_hit') {
        if (event.cause === 'bullet' && event.victimId != null && Number.isFinite(event.angle))
          put(this.hits, event.victimId, { born, angle: event.angle, amount: clamp(finite(event.damage, 10) / 22, .5, 1.5) });
        continue;
      }
      if (event.type === 'shot') {
        const profile = gunplayProfile(event.weapon);
        put(this.shots, event.actorId, { born, weapon: event.weapon });
        if (!view.reducedMotion) this.remnants.push({ ...origin, id: event.id, type: 'shot', actorId: event.actorId, weapon: event.weapon,
          angle: finite(event.angle), born, duration: profile.shell, profile });
      } else {
        const style = impactStyle(event.material);
        this.remnants.push({ ...origin, id: event.id, type: 'impact', born, duration: style.duration, style,
          segmentStart: event.segmentStart, segmentEnd: event.segmentEnd, weapon: event.weapon });
      }
    }
    const limit = view.quality === 'performance' ? GUNPLAY_LIMITS.performanceRemnants : GUNPLAY_LIMITS.remnants;
    if (this.remnants.length > limit) this.remnants.splice(0, this.remnants.length - limit);
  }
  kick(actorId, now, reducedMotion = false) {
    const shot = this.shots.get(actorId);
    return shot ? weaponKick(now - shot.born, shot.weapon, reducedMotion) : 0;
  }
  flinch(actorId, now, reducedMotion = false) {
    const hit = this.hits.get(actorId), age = hit && now - hit.born;
    if (reducedMotion || !hit || age < 0 || age > .16) return { x: 0, y: 0 };
    const amount = Math.sin(clamp(age / .16, 0, 1) * Math.PI) * hit.amount * 1.7;
    return { x: Math.cos(hit.angle) * amount, y: Math.sin(hit.angle) * amount };
  }
}
