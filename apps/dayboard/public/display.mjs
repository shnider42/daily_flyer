// Appearance preferences are local to this browser, separate from workspace backups.
// Changing the display must never migrate or rewrite task and area records.
export const DISPLAY_KEY = 'dfe.dayboard.display.v1';
export const DISPLAY_DEFAULTS = Object.freeze({
  textSize: 'larger',
  contrast: 'balanced',
  tint: 'medium',
  urgency: 'standard',
  urgencyLabels: 'shown',
  areaColors: Object.freeze({}),
});
export const DISPLAY_OPTIONS = Object.freeze({
  textSize: Object.freeze(['standard', 'larger', 'largest']),
  contrast: Object.freeze(['standard', 'balanced', 'strong']),
  tint: Object.freeze(['subtle', 'medium', 'rich']),
  urgency: Object.freeze(['subtle', 'standard', 'prominent']),
  urgencyLabels: Object.freeze(['shown', 'hidden']),
});
export const AREA_PALETTE = Object.freeze({
  blue: '#619de8',
  green: '#62b998',
  amber: '#d9af66',
  purple: '#ad8cde',
  teal: '#4eb8c8',
  rose: '#d18cb8',
  slate: '#929ba9',
});

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const validAreaId = value => /^[a-z0-9][a-z0-9_-]{0,199}$/.test(value) && value !== 'all';

export function normalizeDisplayPreferences(saved) {
  const source = record(saved) ? saved : {};
  const preferences = Object.fromEntries(Object.entries(DISPLAY_OPTIONS).map(([key, values]) =>
    [key, own(source, key) && values.includes(source[key]) ? source[key] : DISPLAY_DEFAULTS[key]]));
  preferences.areaColors = Object.fromEntries(own(source, 'areaColors') && record(source.areaColors)
    ? Object.entries(source.areaColors)
      .filter(([id, color]) => validAreaId(id) && validColor(color))
      .map(([id, color]) => [id, color.toLowerCase()])
    : []);
  return preferences;
}

export function readDisplayPreferences(storage) {
  try { return normalizeDisplayPreferences(JSON.parse(storage.getItem(DISPLAY_KEY) || 'null')); }
  catch { return normalizeDisplayPreferences(null); }
}

export function applyDisplayPreferences(preferences, root = document.documentElement) {
  const display = normalizeDisplayPreferences(preferences);
  root.dataset.textSize = display.textSize;
  root.dataset.contrast = display.contrast;
  root.dataset.areaTint = display.tint;
  root.dataset.urgencyProminence = display.urgency;
  root.dataset.urgencyLabels = display.urgencyLabels;
}

export function areaDisplayColor(area, preferences = DISPLAY_DEFAULTS) {
  const id = area?.id, colors = preferences?.areaColors;
  if (typeof id === 'string' && record(colors) && own(colors, id) && validColor(colors[id])) {
    return colors[id].toLowerCase();
  }
  // DFE originally shipped with amber. Keep that saved record intact while
  // reserving warm default colors for deadlines in the recommended appearance.
  if (area?.id === 'dfe' && area.color === 'amber') return AREA_PALETTE.purple;
  // Keep the original Custom area distinct from DFE on legacy workspaces.
  if (area?.id === 'custom' && area.color === 'purple') return AREA_PALETTE.teal;
  return own(AREA_PALETTE, area?.color) ? AREA_PALETTE[area.color] : AREA_PALETTE.slate;
}

export function applyAreaColors(areas, preferences, root = document) {
  const colors = new Map((Array.isArray(areas) ? areas : [])
    .filter(area => area && typeof area.id === 'string')
    .map(area => [area.id, areaDisplayColor(area, preferences)]));
  const elements = [...root.querySelectorAll('[data-area-id]')];
  if (root.matches?.('[data-area-id]')) elements.unshift(root);
  for (const element of elements) {
    const color = colors.get(element.dataset.areaId);
    // CSSOM property assignment works with the existing strict style CSP. Never
    // interpolate area IDs or custom colors into HTML, a selector, or style text.
    if (color) element.style.setProperty('--area-color', color);
    else element.style.removeProperty('--area-color');
  }
}
