export const SETTINGS_KEY = 'night-transfer.settings.v1';

export const SETTING_RANGES = Object.freeze({
  brightness: [0.8, 1.8], sensitivity: [0.5, 2],
  buttonScale: [0.85, 1.35], stickSize: [84, 124], controlOpacity: [0.4, 1],
  volume: [0, 1], atmosphere: [0, 1],
});

export const DEFAULT_SETTINGS = Object.freeze({
  brightness: 1.2, sensitivity: 1, invert: false, reduced: false,
  buttonScale: 1, stickSize: 88, controlOpacity: 0.7,
  leftHanded: false, lookGuide: true, desktopMouseLook: true,
  sound: false, volume: 0.6, atmosphere: 0.55,
});

export function normalizeSettings(raw, reducedDefault = false) {
  const clean = { ...DEFAULT_SETTINGS, reduced: !!reducedDefault };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
  for (const [key, [min, max]] of Object.entries(SETTING_RANGES)) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) {
      clean[key] = Math.min(max, Math.max(min, raw[key]));
    }
  }
  for (const key of ['invert', 'reduced', 'leftHanded', 'lookGuide', 'desktopMouseLook', 'sound']) {
    if (typeof raw[key] === 'boolean') clean[key] = raw[key];
  }
  return clean;
}

export function loadSettings(storage, reducedDefault = false) {
  try { return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY) || 'null'), reducedDefault); }
  catch { return normalizeSettings(null, reducedDefault); }
}

export function saveSettings(storage, value) {
  const clean = normalizeSettings(value);
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(clean)); return true; }
  catch { return false; }
}
