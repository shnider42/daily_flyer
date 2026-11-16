// Reading preferences are local to this browser, separate from workspace backups.
// Keep the v1 board format unchanged so existing data and imports remain compatible.
export const DISPLAY_KEY = 'dfe.dayboard.display.v1';
export const DISPLAY_DEFAULTS = Object.freeze({textSize: 'larger', contrast: 'standard'});
export const DISPLAY_OPTIONS = Object.freeze({
  textSize: Object.freeze(['standard', 'larger', 'largest']),
  contrast: Object.freeze(['standard', 'strong']),
});

export function readDisplayPreferences(storage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(DISPLAY_KEY) || 'null'); }
  catch { return {...DISPLAY_DEFAULTS}; }
  return Object.fromEntries(Object.entries(DISPLAY_DEFAULTS).map(([key, fallback]) =>
    [key, DISPLAY_OPTIONS[key].includes(saved?.[key]) ? saved[key] : fallback]));
}

export function applyDisplayPreferences(preferences, root = document.documentElement) {
  root.dataset.textSize = preferences.textSize;
  root.dataset.contrast = preferences.contrast;
}
