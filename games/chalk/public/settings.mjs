import { createDefaultBindings, normalizeBindings } from './control-bindings.mjs';
import { DEFAULT_SQUAD_ROLES, normalizeSquadRoles } from './squad-roles.mjs';
import { DEFAULT_FOG_DENSITY } from './fog-appearance.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const own = (record, key) => Object.hasOwn(record, key) ? record[key] : undefined;
const numeric = value => typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;

const ENUMS = {
  role: ['leader', 'member'],
  difficulty: ['story', 'standard', 'veteran'],
  guidance: ['simple', 'moderate', 'expert'],
  graphicsQuality: ['performance', 'balanced', 'high'],
  crosshairStyle: ['cross', 'ring', 'dot'],
  aimColor: ['white', 'amber', 'teal'],
  hudDetail: ['standard', 'compact'],
  mobileHudDetail: ['standard', 'compact'],
};
const RANGES = {
  cameraZoom: [.8, 1.4],
  mobileCameraZoom: [.6, 1.25],
  cameraLookahead: [0, 1],
  crosshairScale: [.75, 1.5],
  masterVolume: [0, 1],
  effectsVolume: [0, 1],
  ambienceVolume: [0, 1],
  distressVolume: [0, 1],
  reflectionsVolume: [0, 1],
  squadVoiceVolume: [0, 1],
  flashRingingVolume: [0, 1],
  hudScale: [.85, 1.3],
  mobileHudScale: [.75, 1.15],
  touchFireThreshold: [.72, .96],
  touchMoveSize: [.6, 1.2],
  touchAimSize: [1, 2],
  fogDensity: [0, 1],
};
const BOOLEANS = ['sound', 'reducedMotion', 'aimLine', 'autoReload', 'showFPS', 'bloodEffects'];
const FRAME_LIMITS = [0, 60, 120];

export function createDefaults({ reducedMotion = false, touchControls } = {}) {
  return {
    role: 'leader', difficulty: 'standard', guidance: 'simple', sound: true,
    squadRoles: [...DEFAULT_SQUAD_ROLES], fogDensity: DEFAULT_FOG_DENSITY,
    reducedMotion: reducedMotion === true, completed: {},
    graphicsQuality: 'balanced', renderScale: 'auto', frameLimit: 60,
    cameraZoom: 1, cameraLookahead: 0, crosshairStyle: 'cross', crosshairScale: 1,
    aimColor: 'white', aimLine: true, autoReload: true,
    masterVolume: 1, effectsVolume: 1, ambienceVolume: 1, distressVolume: .65, reflectionsVolume: .8,
    squadVoiceVolume: .85, flashRingingVolume: .35,
    bloodEffects: true,
    hudScale: 1, hudDetail: 'standard', showFPS: false,
    mobileCameraZoom: .75, mobileHudScale: .85, mobileHudDetail: 'compact',
    touchFireThreshold: .88,
    touchMoveSize: .8, touchAimSize: 1.5,
    keyBindings: createDefaultBindings(),
    ...(typeof touchControls === 'boolean' ? { touchControls } : {}),
  };
}

function completions(value) {
  const result = {};
  if (!isRecord(value)) return result;
  for (const [id, completion] of Object.entries(value)) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || id === 'constructor' || id === 'prototype') continue;
    // Keep older completion flags as well as the current mission result shape.
    if (completion === true) { result[id] = true; continue; }
    if (!isRecord(completion)) continue;
    const { time, squad, civilianHarm, role } = completion;
    if (!Number.isFinite(time) || time < 0 || !Number.isInteger(squad) || squad < 0 || squad > 4 ||
        !Number.isSafeInteger(civilianHarm) || civilianHarm < 0 || !ENUMS.role.includes(role)) continue;
    result[id] = { time, squad, civilianHarm, role };
  }
  return result;
}

function clean(raw, fallback) {
  const input = isRecord(raw) ? raw : {};
  const result = {};
  for (const [key, values] of Object.entries(ENUMS)) {
    const value = own(input, key);
    result[key] = values.includes(value) ? value : fallback[key];
  }
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    const value = numeric(own(input, key));
    result[key] = Number.isFinite(value) ? clamp(value, min, max) : fallback[key];
  }
  for (const key of BOOLEANS) {
    const value = own(input, key);
    result[key] = typeof value === 'boolean' ? value : fallback[key];
  }
  const scale = own(input, 'renderScale');
  result.renderScale = scale === 'auto' ? 'auto' : [.75, 1].includes(numeric(scale)) ? numeric(scale) : fallback.renderScale;
  const limit = numeric(own(input, 'frameLimit'));
  result.frameLimit = FRAME_LIMITS.includes(limit) ? limit : fallback.frameLimit;
  result.completed = completions(isRecord(own(input, 'completed')) ? input.completed : fallback.completed);
  result.keyBindings = normalizeBindings(own(input, 'keyBindings'), fallback.keyBindings);
  result.squadRoles = normalizeSquadRoles(own(input, 'squadRoles') ?? fallback.squadRoles);

  const touch = own(input, 'touchControls');
  if (typeof touch === 'boolean') result.touchControls = touch;
  else if (typeof fallback.touchControls === 'boolean') result.touchControls = fallback.touchControls;
  const callsign = own(input, 'callsign');
  if (typeof callsign === 'string') {
    const name = callsign.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (name) result.callsign = name;
  } else if (typeof fallback.callsign === 'string') result.callsign = fallback.callsign;
  return result;
}

// Older saves and malformed storage cannot inject unknown settings or mutate
// the defaults. Numeric strings are accepted because HTML selects return them.
export function normalizePreferences(raw, defaults = createDefaults()) {
  return clean(raw, clean(defaults, createDefaults()));
}

export function renderDensity(width, height, devicePixelRatio, renderScale, quality) {
  const nativeRatio = numeric(devicePixelRatio);
  const native = clamp(Number.isFinite(nativeRatio) && nativeRatio > 0 ? nativeRatio : 1, .5, 2);
  const explicit = numeric(renderScale);
  if ([.75, 1].includes(explicit)) return clamp(native * explicit, .5, 2);

  const presets = {
    performance: { pixels: 1_600_000, maxDpr: 1 },
    balanced: { pixels: 2_073_600, maxDpr: 1.5 },
    high: { pixels: 5_300_000, maxDpr: 2 },
  };
  const preset = Object.hasOwn(presets, quality) ? presets[quality] : presets.balanced;
  const w = numeric(width), h = numeric(height);
  const area = (Number.isFinite(w) && w > 0 ? w : 1) * (Number.isFinite(h) && h > 0 ? h : 1);
  return clamp(Math.min(native, preset.maxDpr, Math.sqrt(preset.pixels / area)), .5, 2);
}
