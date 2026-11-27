// Reference acoustics for the game's displayed scale, not a weather simulation.
import { WORLD_UNITS_PER_METRE } from './combat-profiles.mjs';
export { WORLD_UNITS_PER_METRE };
export const SOUND_SPEED_MPS = 343;
export const MAX_PENDING_ARRIVALS = 96;
export const ARRIVAL_LOOKAHEAD = .075;
export const ARRIVAL_LATE_TOLERANCE = .18;

export function acousticTravelDelay(distanceWorld, soundSpeedMps = SOUND_SPEED_MPS) {
  if (!Number.isFinite(distanceWorld) || !Number.isFinite(soundSpeedMps) || soundSpeedMps <= 0) return 0;
  return Math.max(0, distanceWorld) / WORLD_UNITS_PER_METRE / soundSpeedMps;
}

export function acousticSourceTime(event, fallback = 0) {
  return Number.isFinite(event?.sourceTime) ? event.sourceTime : Number.isFinite(event?.time) ? event.time : fallback;
}

export function acousticArrivalTime(event, listener, fallback = 0) {
  const sourceTime = acousticSourceTime(event, fallback);
  const d = event?.type === 'near_pass' && Number.isFinite(event.missDistance) ? event.missDistance
    : Math.hypot((event?.x ?? listener?.x ?? 0) - (listener?.x ?? 0), (event?.y ?? listener?.y ?? 0) - (listener?.y ?? 0));
  return sourceTime + acousticTravelDelay(d);
}

// Onset-aligned, independently shaped recorded reports. Each bank holds three
// real takes in .6s slots; duration must stop before the next slot even after
// playback-rate variation. Credits describe the source and processing honestly.
const profile = value => Object.freeze({ ...value, offsets: Object.freeze(value.offsets), tone: Object.freeze(value.tone) });
export const REPORT_PROFILES = Object.freeze({
  rifle: profile({ sample: 'rifle', offsets: [0, .6, 1.2], rate: 1, duration: .42, gain: 1.05, highpass: 65, lowpass: 11000, attack: .00035, wet: .58, reflectionDuration: .115,
    tone: { frequency: 1800, gain: 1.6, q: .65 }, burstWindow: .23, burstGain: .95, burstWet: .8 }),
  support: profile({ sample: 'support', offsets: [0, .6, 1.2], rate: 1, duration: .28, gain: 1.04, highpass: 55, lowpass: 8800, attack: .00035, wet: .5, reflectionDuration: .095,
    tone: { frequency: 460, gain: 3, q: .65 }, burstWindow: .16, burstGain: .92, burstWet: .65 }),
  hostile: profile({ sample: 'hostile', offsets: [.003], rate: 1, duration: .5, gain: .7, highpass: 48, lowpass: 9500, attack: .0005, wet: .58, reflectionDuration: .12,
    tone: { frequency: 780, gain: 2, q: .7 }, burstWindow: .2, burstGain: .94, burstWet: .76 }),
  hostile_support: profile({ sample: 'hostile', offsets: [.003], rate: .985, duration: .3, gain: .68, highpass: 58, lowpass: 8200, attack: .0005, wet: .5, reflectionDuration: .1,
    tone: { frequency: 360, gain: 2.5, q: .65 }, burstWindow: .16, burstGain: .92, burstWet: .65 }),
  sniper: profile({ sample: 'hostile', offsets: [.003], rate: .94, duration: .64, gain: .82, highpass: 42, lowpass: 10000, attack: .0005, wet: .62, reflectionDuration: .14,
    tone: { frequency: 240, gain: 2.4, q: .6 }, burstWindow: 0, burstGain: 1, burstWet: 1 }),
  'vehicle-mg': profile({ sample: 'support', offsets: [0, .6, 1.2], rate: .98, duration: .28, gain: .88, highpass: 48, lowpass: 7800, attack: .0004, wet: .54, reflectionDuration: .105,
    tone: { frequency: 340, gain: 1.7, q: .6 }, burstWindow: .19, burstGain: .92, burstWet: .65 }),
  // Original cached sound design, not a claim that a rifle recording is a tank.
  // The shot event receives the same district-wide propagation as any report.
  'tank-cannon': profile({ sample: 'tankCannon', offsets: [0], rate: 1, duration: .82, gain: 1.08, highpass: 25, lowpass: 5200, attack: .0012, wet: .78, reflectionDuration: .24,
    tone: { frequency: 105, gain: 2, q: .65 }, burstWindow: 0, burstGain: 1, burstWet: 1 }),
});
export function reportProfile(weapon) { return REPORT_PROFILES[weapon] || REPORT_PROFILES.rifle; }

// Modest broad EQ uses the body already present in each credited recording.
// Continuing rounds keep their complete attack; a little less accumulating
// tail leaves the cadence readable. Nothing creates extra shots or new echoes.
export function reportBurstMix(weapon, continuation = 0) {
  const p = reportProfile(weapon), amount = Math.max(0, Math.min(1, continuation / 3));
  return { gain: 1 + (p.burstGain - 1) * amount, wet: 1 + (p.burstWet - 1) * amount };
}

export function acousticHearingRange(type, world = null) {
  if (type === 'shot' || type === 'explosion') {
    // Combat belongs to the simulated district, even when the shooters are
    // outside the viewport or behind unexplored terrain. Do not grant sight.
    const diagonal = Math.hypot(Number(world?.width) || 0, Number(world?.height) || 0);
    return Math.min(6000, Math.max(type === 'explosion' ? 2400 : 1800, diagonal + 64));
  }
  return type === 'flashbang' ? 1100 : type === 'near_pass' ? 100 : type === 'grenade_throw' ? 180 :
    type === 'field_voice' ? 290 : type === 'hostile_shout' ? 760 : 550;
}

export function distantCombatMix(type, distance, occluded = false) {
  const far = Math.max(0, Math.min(1, (distance - 500) / 1800));
  const combat = type === 'shot' || type === 'explosion';
  return { gain: combat ? 1 + far * .5 : 1,
    lowpass: combat ? (occluded ? 1350 : 10000) / (1 + far * .8) : Infinity,
    distant: combat && distance > 650 };
}
