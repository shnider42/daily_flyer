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
const profile = value => Object.freeze({ ...value, offsets: Object.freeze(value.offsets) });
export const REPORT_PROFILES = Object.freeze({
  rifle: profile({ sample: 'rifle', offsets: [0, .6, 1.2], rate: 1, duration: .42, gain: 1.05, highpass: 65, attack: .00035, wet: .58, reflectionDuration: .115 }),
  support: profile({ sample: 'support', offsets: [0, .6, 1.2], rate: 1, duration: .28, gain: 1.1, highpass: 55, attack: .00035, wet: .5, reflectionDuration: .095 }),
  hostile: profile({ sample: 'hostile', offsets: [.003], rate: 1, duration: .5, gain: .7, highpass: 48, attack: .0005, wet: .58, reflectionDuration: .12 }),
  hostile_support: profile({ sample: 'hostile', offsets: [.003], rate: .985, duration: .3, gain: .68, highpass: 58, attack: .0005, wet: .5, reflectionDuration: .1 }),
  sniper: profile({ sample: 'hostile', offsets: [.003], rate: .94, duration: .64, gain: .82, highpass: 42, attack: .0005, wet: .62, reflectionDuration: .14 }),
});
export function reportProfile(weapon) { return REPORT_PROFILES[weapon] || REPORT_PROFILES.rifle; }

export function acousticHearingRange(type, world = null) {
  if (type === 'shot' || type === 'explosion') {
    // Combat belongs to the simulated district, even when the shooters are
    // outside the viewport or behind unexplored terrain. Do not grant sight.
    const diagonal = Math.hypot(Number(world?.width) || 0, Number(world?.height) || 0);
    return Math.min(6000, Math.max(type === 'explosion' ? 2400 : 1800, diagonal + 64));
  }
  return type === 'flashbang' ? 1100 : type === 'near_pass' ? 100 : type === 'grenade_throw' ? 180 : type === 'field_voice' ? 290 : 550;
}

export function distantCombatMix(type, distance, occluded = false) {
  const far = Math.max(0, Math.min(1, (distance - 500) / 1800));
  const combat = type === 'shot' || type === 'explosion';
  return { gain: combat ? 1 + far * .5 : 1,
    lowpass: combat ? (occluded ? 1350 : 10000) / (1 + far * .8) : Infinity,
    distant: combat && distance > 650 };
}
