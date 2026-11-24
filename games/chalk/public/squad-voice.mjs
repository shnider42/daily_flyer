// A small speech director, independent of the simulation RNG and transport.
// Commands always execute; this module only decides whether to speak them.
import { acousticLineBlocked, eventEnvironment } from './audio-environments.mjs';
import { buildingAt } from './building-geometry.mjs';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const ORDER_VOICE_COOLDOWN = 60;
export const VOICE_LINE_COOLDOWN = 180;
const POLICIES = Object.freeze({
  move: { group: 'orders', cooldown: 60, priority: 1 },
  hold: { group: 'orders', cooldown: 60, priority: 1 },
  assist: { group: 'orders', cooldown: 60, priority: 1 },
  cover: { group: 'orders', cooldown: 60, priority: 1 },
  ready: { group: 'orders', cooldown: 60, priority: 1 },
  smoke: { group: 'orders', cooldown: 60, priority: 1 },
  reload: { group: 'reload', cooldown: 25, priority: 1 },
  contact: { group: 'contact', cooldown: 35, priority: 2 },
  suppression: { group: 'contact', cooldown: 35, priority: 2 },
  help: { group: 'help', cooldown: 20, priority: 3 },
  sniper: { group: 'danger', cooldown: 20, priority: 3 },
  warning: { group: 'danger', cooldown: 12, priority: 3 },
  frag: { group: 'grenades', cooldown: 8, priority: 3 },
  flash: { group: 'grenades', cooldown: 8, priority: 3 },
  backup: { group: 'contact', cooldown: 35, priority: 2 },
  dispatch_six: { group: 'danger', cooldown: 20, priority: 2 },
  dispatch_sniper: { group: 'danger', cooldown: 20, priority: 3 },
  dispatch_extraction: { group: 'field-radio', cooldown: 45, priority: 1 },
  dispatch_ammo: { group: 'field-radio', cooldown: 45, priority: 1 },
  dispatch_recovered: { group: 'field-radio', cooldown: 45, priority: 1 },
  dispatch_moving: { group: 'contact', cooldown: 35, priority: 2 },
  dispatch_perimeter: { group: 'orders', cooldown: 60, priority: 1 },
  dispatch_hold: { group: 'orders', cooldown: 60, priority: 1 },
  dispatch_attack: { group: 'contact', cooldown: 35, priority: 2 },
  dispatch_arrival: { group: 'field-radio', cooldown: 45, priority: 1 },
});

export function createVoiceDirector(seed = 0) {
  return { groups: new Map(), lines: new Map(), turns: new Map(), lastLineId: null,
    lastSpokeAt: -Infinity, seed: (Number(seed) >>> 0) % 17 };
}

export function squadVoiceCategory(message) {
  const text = String(message?.text || '').trim();
  if (/^(?:Move to (?:your|the) marker|Regroup on (?:you|the leader))\./i.test(text)) return 'move';
  if (/^(?:Hold this position|Hold up\. Give me a moment)/i.test(text)) return 'hold';
  if (/^Help the wounded\./i.test(text)) return 'assist';
  if (/^Ready\. Moving with you\./i.test(text)) return 'ready';
  if (/^(?:Medic, I need help|\w+ down\. Need help here)/i.test(text)) return 'help';
  if (/^Long rifle report from the /i.test(text)) return 'sniper';
  if (/^Frag out\./i.test(text)) return 'frag';
  if (/^Flashbang out\./i.test(text)) return 'flash';
  if (/^Smoke out\. Keep moving\./i.test(text)) return 'smoke';
  // Story text is not replaced with a generic, potentially contradictory line.
  return null;
}

export function voicePolicy(category) { return POLICIES[category] || null; }

export function chooseVoiceLine(director, category, lines, now, available = () => true) {
  const policy = voicePolicy(category);
  if (!policy || !Number.isFinite(now) || now - director.lastSpokeAt < (policy.priority === 3 ? 1.8 : 5)) return null;
  if (now - (director.groups.get(policy.group) ?? -Infinity) < policy.cooldown) return null;
  // Urgent warnings can recur when needed, but never every click or projectile.
  const lineCooldown = policy.priority === 3 ? 22 : VOICE_LINE_COOLDOWN;
  const sampleCategory = category === 'assist' ? 'help' : category;
  const candidates = lines.filter(line => line.categories.includes(sampleCategory) && available(line) &&
    now - (director.lines.get(line.id) ?? -Infinity) >= lineCooldown);
  if (!candidates.length) return null;
  const varied = candidates.filter(line => line.id !== director.lastLineId);
  const pool = varied.length ? varied : candidates;
  const turn = director.turns.get(category) ?? director.seed;
  const line = pool[turn % pool.length];
  director.turns.set(category, turn + 1); director.groups.set(policy.group, now);
  director.lines.set(line.id, now); director.lastLineId = line.id; director.lastSpokeAt = now;
  return { line, category, ...policy };
}

export function findVoiceSpeaker(state, message) {
  const name = String(message?.speaker || '').toUpperCase();
  const actor = message?.actorId != null ? [...(state?.squad || []), ...(state?.allies || [])].find(actor => actor.id === message.actorId)
    : (state?.squad || []).find(actor => String(actor.name || actor.id).toUpperCase() === name);
  return actor?.alive === false ? null : actor || null;
}

// Nearby speech can spill through an actual open doorway. A solid partition
// cannot be bypassed just because two soldiers share a building footprint.
function audibleDoorway(world, speaker, listener, directDistance) {
  if (directDistance > 150) return null;
  const houses = [...new Set([buildingAt(world, speaker), buildingAt(world, listener)].filter(Boolean))];
  for (const house of houses) for (const door of [...(house.doors || []), ...(house.breaches || [])]) {
    if (!Number.isFinite(door.x) || !Number.isFinite(door.y)) continue;
    const path = distance(speaker, door) + distance(door, listener);
    if (path <= 180 && !acousticLineBlocked(world, speaker, door) && !acousticLineBlocked(world, door, listener)) return { path, door };
  }
  return null;
}

export function squadVoiceRoute(world, speaker, listener, previous = 'radio') {
  if (!speaker || !listener) return { mode: 'radio', local: 0, radio: 1, gain: 1, pan: 0,
    lowpass: 8200, highpass: 90, space: { room: 0, street: 0 }, distance: Infinity };
  const d = distance(speaker, listener), own = speaker.id === listener.id;
  const space = eventEnvironment(world, speaker, listener);
  const portal = !own && space.occluded ? audibleDoorway(world, speaker, listener, d) : null;
  const canHear = own || !space.occluded || Boolean(portal);
  // The separate enter/leave thresholds prevent radio chatter at one boundary.
  const mode = canHear && (own || d <= (previous === 'local' ? 290 : 240)) ? 'local' : 'radio';
  const heardDistance = portal?.path || d;
  const gain = own ? 1 : (portal ? .7 : 1) / (1 + (heardDistance / 165) ** 1.25);
  const origin = portal?.door || speaker;
  return { mode, local: mode === 'local' ? 1 : 0, radio: mode === 'radio' ? 1 : 0,
    gain, pan: own ? 0 : clamp((origin.x - listener.x) / 210, -.85, .85), distance: d,
    lowpass: portal ? 2600 : clamp(10000 / (1 + heardDistance / 420), 3500, 10000),
    highpass: space.sourceKind === 'room' ? 75 : 110, space, portal: Boolean(portal) };
}

// Field squads have their own radio net. Hearing one speak nearby does not
// connect that soldier to the player's headset or reveal their coordinates.
export function fieldVoiceRoute(world, speaker, listener, previous = 'local') {
  const route = squadVoiceRoute(world, speaker, listener, previous);
  if (route.mode === 'local') return { ...route, radio: 0 };
  return { ...route, mode: 'inaudible', local: 0, radio: 0 };
}

export const FIELD_RADIO_SPEAKER = Object.freeze({ id: 'field-radio', name: 'RADIO', alive: true, radioOnly: true });

export function createFieldRadioDirector(atTime = 0) {
  return { startedAt: atTime, nextCheck: atTime, lastTime: atTime, objective: null, objectiveAt: -Infinity,
    arrivalDone: atTime > 2, downed: new Set(), lastOffer: -Infinity, offers: new Map() };
}

// Sparse and factual. This reads only friendly status, the active objective,
// and enemies already seen by the player's squad. No kill totals or hidden
// patrol positions become radio intelligence. No overdue speech is queued.
export function fieldRadioCue(director, state, player) {
  const now = state?.time;
  if (!director || !Number.isFinite(now) || !player || player.alive === false || player.downed ||
    state.status !== 'playing' || state.paused || now < director.nextCheck) return null;
  director.nextCheck = now + 1.1;
  const gap = now - director.lastTime; director.lastTime = now;
  const objective = state.objective;
  if (objective?.id !== director.objective) {
    if (director.objective != null) director.objectiveAt = now;
    director.objective = objective?.id ?? null;
  }
  const recovered = (state.squad || []).some(actor => director.downed.has(actor.id) && actor.alive && !actor.downed);
  director.downed = new Set((state.squad || []).filter(actor => actor.alive && actor.downed).map(actor => actor.id));
  if (gap > 4 || now - director.lastOffer < 20) return null;
  const candidates = [];
  if (now - director.objectiveAt < 10 && objective?.kind === 'extract') candidates.push('extraction');
  if (recovered) candidates.push('recovered');
  if (player.ammo <= 4 && player.ammo >= 0 && player.reserve > 0 && state.stats?.shots > 0 && !player.reloadTimer) candidates.push('ammo');
  if (now - director.objectiveAt < 10 && objective?.kind === 'hold') candidates.push('perimeter');
  if (!director.arrivalDone && now >= 8 && now <= 16 && !(player.suppression > .2)) candidates.push('arrival');
  if ((state.enemies || []).some(enemy => enemy.visible === true && enemy.alive && enemy.moving && distance(enemy, player) < 500)) candidates.push('moving');
  const cue = candidates.find(kind => now - (director.offers.get(kind) ?? -Infinity) >= 180);
  if (!cue) return null;
  director.lastOffer = now; director.offers.set(cue, now);
  if (cue === 'arrival') director.arrivalDone = true;
  return `dispatch_${cue}`;
}
