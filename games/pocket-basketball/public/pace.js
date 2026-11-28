// One time scale for the court and the shooting meter. Input events and UI
// rendering still run immediately at the browser's normal rate.
export const DEFAULT_GAME_PACE = .8;
export function normalizeGamePace(value, fallback = DEFAULT_GAME_PACE) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && value.trim() === '')) return fallback;
  const pace = Number(value);
  return Number.isFinite(pace) ? Math.max(.6, Math.min(1, pace)) : fallback;
}
