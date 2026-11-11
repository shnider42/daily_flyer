/** Retain confirmed combat cues on the render clock, independent of snapshot rate. */
const DURATIONS = Object.freeze({ shot: .24, hit: .82, down: 2.1 });
const finite = value => Number.isFinite(Number(value));
const point = (nested, x, y) => {
  const px = nested?.x ?? x, py = nested?.y ?? y;
  return finite(px) && finite(py) ? { x: Number(px), y: Number(py) } : null;
};
const eventId = (event, now) => String(event.id || `${event.type}:${event.siteId || event.boardingId || ''}:${event.attackerId || ''}:${event.targetId || event.actorId || ''}:${event.at ?? event.until ?? now}`);

export class CombatPresentation {
  constructor() { this.reset(); }
  reset() { this.effects = []; this.seen = new Map(); this.targetPositions = new Map(); }

  /** Also used for an audible reveal that has no drawable shot or damage effect. */
  claim(event, now = 0) {
    if (!event || !Number.isFinite(now)) return false;
    const id = eventId(event, now); if (this.seen.has(id)) return false;
    this.seen.set(id, now);
    while (this.seen.size > 512) this.seen.delete(this.seen.keys().next().value);
    return true;
  }

  /** Returns true only for a new, drawable authoritative event. Never changes game state. */
  push(event, now = 0) {
    if (!event || !Number.isFinite(now)) return false;
    const kind = event.type === 'person-shot' ? 'shot' : event.type === 'person-hit' ? 'hit' :
      ['boarder-down', 'person-down', 'crew-death'].includes(event.type) ? 'down' : null;
    if (!kind) return false;
    const id = eventId(event, now);
    if (this.seen.has(id)) return false;
    let from = null, to = null;
    if (kind === 'shot') {
      from = point(event.from, event.x, event.y);
      to = point(event.to, event.targetX, event.targetY);
      if (!from || !to) return false;
    } else {
      to = point(event.to, event.x ?? event.targetX, event.y ?? event.targetY) || this.targetPositions.get(`${event.siteId || event.boardingId || ''}|${event.targetId || event.actorId}`);
      if (!to) return false;
    }
    this.claim(event, now);
    if (event.targetId || event.actorId) this.targetPositions.set(`${event.siteId || event.boardingId || ''}|${event.targetId || event.actorId}`, { ...to });
    while (this.targetPositions.size > 96) this.targetPositions.delete(this.targetPositions.keys().next().value);
    this.effects.push({
      id, kind, boardingId:event.boardingId || null, siteId:event.siteId || null, startedAt: now, duration: DURATIONS[kind], from, to: { ...to },
      team: event.team || 'player', attackerId: event.attackerId, actorName: event.actorName || '',
      targetId: event.targetId || event.actorId, targetName: event.targetName || '',
      damage: Math.max(0, Number(event.damage) || 0), hit: event.hit === true,
      blocked: event.blocked === true, weaponId: event.weaponId || 'pulse-sidearm'
    });
    if (this.effects.length > 96) this.effects.splice(0, this.effects.length - 96);
    return true;
  }

  sample(now = 0) {
    this.effects = this.effects.filter(effect => now - effect.startedAt < effect.duration);
    return this.effects.map(effect => {
      const age = Math.max(0, now - effect.startedAt);
      return { ...effect, from: effect.from && { ...effect.from }, to: { ...effect.to }, age, progress: Math.min(1, age / effect.duration) };
    });
  }
}
