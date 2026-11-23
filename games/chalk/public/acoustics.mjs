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

// These are distinct playback designs using the two credited recorded reports.
// They are not recordings of each named weapon. Mechanical/body layers give
// support weapons a tighter repeated report; the sniper has a heavier tail.
const profile = value => Object.freeze(value);
export const REPORT_PROFILES = Object.freeze({
  rifle: profile({ sample: 'rifle', rate: 1, duration: .62, gain: .43, highpass: 55, body: 0, mechanism: .027, tail: 0 }),
  support: profile({ sample: 'rifle', rate: 1.015, duration: .25, gain: .44, highpass: 90, body: .055, mechanism: .062, tail: 0 }),
  hostile: profile({ sample: 'hostile', rate: 1, duration: .65, gain: .47, highpass: 48, body: 0, mechanism: .025, tail: 0 }),
  hostile_support: profile({ sample: 'hostile', rate: .96, duration: .31, gain: .46, highpass: 65, body: .073, mechanism: .055, tail: .025 }),
  sniper: profile({ sample: 'hostile', rate: .91, duration: .76, gain: .52, highpass: 42, body: .09, mechanism: .018, tail: .1 }),
});
export function reportProfile(weapon) { return REPORT_PROFILES[weapon] || REPORT_PROFILES.rifle; }

export function acousticHearingRange(type) {
  return type === 'explosion' ? 2400 : type === 'shot' ? 1800 : type === 'near_pass' ? 100 : 550;
}
