// Camera settings belong to a captain, never to a ship or the world simulation.
export const SHIP_ZOOM = Object.freeze({ min: .25, max: 1.6, step: .05, default: 1 });
export const PERSON_ZOOM = Object.freeze({ min: .5, max: 1.6, step: .05, default: 1 });

export function zoomLimits(mode) {
  return mode === 'ship' ? SHIP_ZOOM : PERSON_ZOOM;
}

const numeric = value => typeof value === 'number' || typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;

export function normalizeModeZoom(value, mode, fallback = 1) {
  const limits = zoomLimits(mode), initial = numeric(value), backup = numeric(fallback);
  const number = Number.isFinite(initial) ? initial : Number.isFinite(backup) ? backup : limits.default;
  const bounded = Math.max(limits.min, Math.min(limits.max, number));
  return Math.round((limits.min + Math.round((bounded - limits.min) / limits.step) * limits.step) * 100) / 100;
}

export function normalizeCameraPreferences(value, fallback = {}) {
  return {
    shipZoom: normalizeModeZoom(value?.shipZoom, 'ship', fallback?.shipZoom),
    personZoom: normalizeModeZoom(value?.personZoom, 'person', fallback?.personZoom),
  };
}
