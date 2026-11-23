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
  const actor = message?.actorId != null ? (state?.squad || []).find(actor => actor.id === message.actorId)
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
