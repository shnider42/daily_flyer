import { squadCanSeePoint } from './visibility.mjs';

// Corpse state is plain serializable mission data. The weak clock is only a
// local work throttle; replacing a snapshot or restarting never depends on it.
const sightClocks = new WeakMap();
const groups = ['squad', 'enemies', 'civilians', 'survivors'];
const MAX_BLOOD_STAINS = 512;
const STAIN_CELL = 28;

function hashId(id) {
  let hash = 2166136261;
  for (const character of String(id)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** A small, permanent ground mark and a brief directional impact. Nearby hits
 * share a fixed mark rather than accumulating particles or enlarging a known
 * stain during an unseen fight. Only the first mark in a cell is retained.
 */
export function recordBloodHit(state, actor, { cause = 'bullet', damage = 0, sourceId = null, angle } = {}) {
  if (!state || !Number.isFinite(actor?.x) || !Number.isFinite(actor?.y) || !Number.isFinite(damage) || damage <= 0 || !['bullet', 'blast'].includes(cause)) return null;
  if (!Array.isArray(state.bloodstains)) state.bloodstains = [];
  if (!Array.isArray(state.effects)) state.effects = [];
  const now = Number.isFinite(state.time) ? state.time : 0;
  const seed = hashId(`${actor.id}:${sourceId}:${now.toFixed(4)}:${cause}`);
  if (!Number.isFinite(angle)) {
    let source;
    for (const group of groups) {
      source = (state[group] || []).find(candidate => candidate.id === sourceId);
      if (source) break;
    }
    angle = source ? Math.atan2(actor.y - source.y, actor.x - source.x) : (Number.isFinite(actor.angle) ? actor.angle + Math.PI : 0);
  }
  const amount = Math.max(.35, Math.min(1, damage / 65));
  const farWitness = actor.team === 'enemy' && actor.visible === true;
  const seen = squadCanSeePoint(state, actor, { ignoreRange: farWitness });
  const id = `blood:${Math.floor(actor.x / STAIN_CELL)}:${Math.floor(actor.y / STAIN_CELL)}`;
  let stain = state.bloodstains.find(mark => mark.id === id);
  if (!stain && state.bloodstains.length < MAX_BLOOD_STAINS) {
    stain = { id, x: actor.x, y: actor.y, angle, amount, seed, at: now, seen };
    state.bloodstains.push(stain);
  } else if (stain && !stain.seen) {
    // Cell merging must not let a visible hit on the other side of a partition
    // reveal the original mark. Test that mark's own point.
    stain.seen = squadCanSeePoint(state, stain, { ignoreRange: farWitness });
  }
  state.effects.push({ type: 'blood', x: actor.x, y: actor.y, angle, amount, seed, ttl: .24, maxTtl: .24, seen, farWitness });
  if (state.effects.length > 220) state.effects.splice(0, state.effects.length - 220);
  return stain || null;
}

/** Capture a true death once, before the original actor can be cleaned up.
 * A downed living actor remains an aid target and never becomes a corpse.
 * Bodies and their observed locations persist until the mission is reset.
 */
export function recordDeadActors(state) {
  if (!state || typeof state !== 'object') return 0;
  if (!Array.isArray(state.bodies)) state.bodies = [];
  const recorded = new Set(state.bodies.map(body => String(body.actorId)));
  const now = Number.isFinite(state.time) ? state.time : 0;
  let added = 0;
  for (const group of groups) for (const actor of state[group] || []) {
    if (actor.alive !== false || actor.id === undefined || actor.id === null || !Number.isFinite(actor.x) || !Number.isFinite(actor.y)) continue;
    const key = String(actor.id);
    if (recorded.has(key)) continue;
    const body = {
      id: `body:${key}`, actorId: actor.id, team: actor.team || (group === 'enemies' ? 'enemy' : group === 'civilians' ? 'civilian' : group === 'survivors' ? 'survivor' : 'squad'),
      kind: actor.kind || actor.role || 'rifleman', role: actor.role || '',
      x: actor.x, y: actor.y, angle: Number.isFinite(actor.angle) ? actor.angle : 0,
      pose: hashId(actor.id) % 3, diedAt: Number.isFinite(actor.deathTime) ? actor.deathTime : now,
      seen: false,
    };
    // A currently visible sniper can be seen beyond ordinary range. Preserve
    // that witnessed death, but recheck walls and smoke rather than trusting a
    // stale visible flag from the previous visibility update.
    body.seen = squadCanSeePoint(state, body, { ignoreRange: body.team === 'enemy' && actor.visible === true });
    state.bodies.push(body); recorded.add(key); added++;
  }
  const previous = sightClocks.get(state);
  if (added || !previous || previous.bodies !== state.bodies || previous.stains !== state.bloodstains || now < previous.at || now - previous.at >= .125) {
    for (const body of state.bodies) if (!body.seen && squadCanSeePoint(state, body)) body.seen = true;
    for (const stain of state.bloodstains || []) if (!stain.seen && squadCanSeePoint(state, stain)) stain.seen = true;
    sightClocks.set(state, { bodies: state.bodies, stains: state.bloodstains, at: now });
  }
  return added;
}
