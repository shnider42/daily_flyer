/** Shared city protocol. Clients supply controls and named actions, never world state. */
export const PROTOCOL = 1;
export const SIMULATION_HZ = 30;
export const INPUT_HZ = 20;
export const SNAPSHOT_HZ = 10;
export const MAX_PLAYERS = 4;
export const INPUT_TIMEOUT_MS = 500;
export const DISCONNECT_GRACE_MS = 60000;
export const HOST_PROMOTION_MS = 5000;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const normalizeRoomCode = value => String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
export const validRoomCode = value => ROOM_CODE_PATTERN.test(normalizeRoomCode(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => Number.isFinite(value) ? value : 0;
export function cleanInput(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  let mx = clamp(finite(raw.mx), -1, 1), my = clamp(finite(raw.my), -1, 1);
  const length = Math.hypot(mx, my);
  if (length > 1) { mx /= length; my /= length; }
  const input = { mx, my, sprint: raw.sprint === true, fire: raw.fire === true,
    touch: raw.touch === true, brake: raw.brake === true, reverse: raw.reverse === true };
  for (const key of ['throttle', 'steer']) if (Number.isFinite(raw[key])) input[key] = clamp(raw[key], -1, 1);
  if (Number.isFinite(raw.aimX) && Number.isFinite(raw.aimY)) {
    input.aimX = clamp(raw.aimX, -1000, 7000); input.aimY = clamp(raw.aimY, -1000, 4400);
  }
  return input;
}
export const EMPTY_INPUT = Object.freeze(cleanInput());
