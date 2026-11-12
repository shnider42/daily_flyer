import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const PROTOCOL_VERSION = 1;
export const SIMULATION_HZ = 30;
export const INPUT_HZ = 20;
export const SNAPSHOT_HZ = 10;
export const MOTION_STATE_FIELDS = Object.freeze(['mode', 'stationView', 'militaryCareer', 'militaryOperationsView', 'systemId', 'locationId', 'ship', 'person', 'boarding', 'exploration', 'interior', 'multiplayer', 'credits', 'cargo', 'stats', 'pendingEncounter', 'cosmicWarning', 'startMode', 'livelihoods', 'npcContract', 'openingMission', 'openingMissionAvailability', 'npcLife']);
export const MOTION_WORLD_FIELDS = Object.freeze(['enemies', 'bullets', 'pickups', 'traffic', 'parkedShips', 'signals', 'miningTarget', 'mining', 'miningBeams']);
export const MAX_ONLINE = 10;
export const DISCONNECT_GRACE_MS = 30000;
export const INPUT_TIMEOUT_MS = 500;
export const SURFACE_RANGE = 46;
export const clone = value => structuredClone(value);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const normaliseRealmCode = code => String(code || '').trim().toUpperCase();
export const validRealmCode = code => /^[A-Z0-9]{6,12}$/.test(code);
export const newRealmCode = () => randomBytes(5).toString('hex').slice(0, 8).toUpperCase();
export const newCaptainId = () => `captain_${randomBytes(12).toString('hex')}`;
export const newSecret = () => randomBytes(32).toString('base64url');
export const secretHash = secret => createHash('sha256').update(String(secret)).digest('hex');
export function verifySecret(secret, expected) {
  if (typeof secret !== 'string' || secret.length < 30 || secret.length > 120 || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  return timingSafeEqual(Buffer.from(secretHash(secret), 'hex'), Buffer.from(expected, 'hex'));
}
export function cleanName(value, fallback = 'Independent captain') { return String(value || fallback).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 32) || fallback; }
export function cleanInput(raw = {}) {
  const axis = key => clamp(finite(raw[key]), -1, 1);
  return { thrust: axis('thrust'), strafe: axis('strafe'), turn: axis('turn'), x: axis('x'), y: axis('y'), brake: !!raw.brake, boost: !!raw.boost, fire: !!raw.fire, mine: !!raw.mine, flightAssist: raw.flightAssist !== false, aimX: clamp(finite(raw.aimX), -1, 1), aimY: clamp(finite(raw.aimY), -1, 1), aiming: !!raw.aiming };
}
export const EMPTY_INPUT = Object.freeze(cleanInput());
export const fail = (reason, code = 'unavailable') => ({ ok: false, reason, message: reason, code });
export const ok = (value = {}) => ({ ok: true, ...value });

export class RateLimit {
  constructor(rate, burst = rate) { this.rate = rate; this.burst = burst; this.tokens = burst; this.at = Date.now(); }
  take(now = Date.now()) { this.tokens = Math.min(this.burst, this.tokens + (now - this.at) / 1000 * this.rate); this.at = now; if (this.tokens < 1) return false; this.tokens--; return true; }
}
