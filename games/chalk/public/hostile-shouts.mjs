// Rare, nonverbal contact calls from actual hostile actors. These are physical
// sound events, never radio intelligence, reveal markers, or invented fighting.
import { flashIntensity } from './flash-status.mjs';

export const HOSTILE_SHOUT_POLICY = Object.freeze({
  checkInterval: .4, globalGap: 20, actorGap: 60, groupGap: 45,
  contactAge: .65, maxContactRange: 780,
});
const directors = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const standing = actor => actor?.alive && !actor.downed;
const hash = value => {
  let n = 2166136261;
  for (const character of String(value)) n = Math.imul(n ^ character.charCodeAt(0), 16777619);
  return n >>> 0;
};

/** Call after authoritative enemy movement/perception. The WeakMap keeps
 * private cadence out of actors, saved game data, and cooperative snapshots.
 * A missed offer is discarded; there is no pending speech or delayed contact.
 */
export function updateHostileShouts(state, dt, { soundEvent } = {}) {
  if (!state || state.status !== 'playing' || state.paused || state.maxEnemies <= 0 ||
    !Number.isFinite(state.time) || !Number.isFinite(dt) || dt < 0 || typeof soundEvent !== 'function') return 0;
  const now = state.time, key = String(state.seed) + ':' + state.missionIndex;
  let director = directors.get(state);
  if (!director || director.key !== key || now < director.lastTime) {
    director = { key, lastTime: now, nextCheck: 0, nextGlobal: 3, actors: new Map(), groups: new Map(), turn: 0 };
    directors.set(state, director);
  }
  director.lastTime = now;
  if (now < director.nextCheck) return 0;
  director.nextCheck = now + HOSTILE_SHOUT_POLICY.checkInterval;
  const enemies = (state.enemies || []).filter(actor => standing(actor) && actor.team === 'enemy'), ids = new Set(enemies.map(actor => actor.id));
  for (const id of director.actors.keys()) if (!ids.has(id)) director.actors.delete(id);
  for (const [group, nextAt] of director.groups) if (nextAt < now - 60) director.groups.delete(group);
  const targets = [...(state.squad || []), ...(state.allies || [])].filter(standing);
  let emitted = 0;
  for (const actor of enemies) {
    const seed = hash(key + ':' + actor.id);
    let history = director.actors.get(actor.id);
    if (!history) {
      history = { x: actor.x, y: actor.y, at: now, nextOffer: 3 + seed % 9, nextVoice: 0, turn: 0 };
      director.actors.set(actor.id, history);
    }
    const target = targets.find(candidate => candidate.id === actor.target);
    const elapsed = now - history.at, dx = actor.x - history.x, dy = actor.y - history.y;
    const closingSpeed = target && elapsed > 0 ? (dx * (target.x - actor.x) + dy * (target.y - actor.y)) /
      Math.max(1, distance(actor, target)) / elapsed : 0;
    history.x = actor.x; history.y = actor.y; history.at = now;
    if (now < history.nextOffer) continue;
    const variation = hash(seed + ':' + history.turn++);
    history.nextOffer = now + 8 + variation % 7;
    if (emitted || now < director.nextGlobal || now < history.nextVoice || variation % 4 !== 0 ||
      !target || !actor.alert || now - actor.lastSeenAt > HOSTILE_SHOUT_POLICY.contactAge ||
      !Number.isFinite(actor.lastSeenAt) || distance(actor, target) > HOSTILE_SHOUT_POLICY.maxContactRange ||
      actor.fieldRetreat || actor.reloadTimer > 0 || actor.ammo <= 0 || actor.suppression > .78 ||
      flashIntensity(actor, now) > .25) continue;
    const group = actor.fieldSquadId || actor.encounterId || 'unassigned-hostiles';
    if (now < (director.groups.get(group) || 0)) continue;
    const advancing = actor.moving && closingSpeed > 12 &&
      !['cover', 'reload', 'withdraw', 'search', 'disoriented', 'brace'].includes(actor.tactic);
    soundEvent(state, 'hostile_shout', actor, {
      sourceTime: now, alive: true, variant: (seed + director.turn++) % 2,
      intent: advancing ? 'advance' : 'contact',
    });
    history.nextVoice = now + HOSTILE_SHOUT_POLICY.actorGap + variation % 18;
    director.groups.set(group, now + HOSTILE_SHOUT_POLICY.groupGap + variation % 17);
    director.nextGlobal = now + HOSTILE_SHOUT_POLICY.globalGap + variation % 6;
    emitted++;
  }
  return emitted;
}
