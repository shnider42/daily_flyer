export function defaultCameraSettings(touch = false) {
  return { mode: touch ? "follow" : "full", zoom: 1.45, focus: "play", minimap: true };
}
export function sanitizeCameraSettings(value, touch = false) {
  const defaults = defaultCameraSettings(touch);
  const saved = value && typeof value === "object" ? value : {};
  const zoom = Number(saved.zoom);
  return {
    mode: ["full", "fit", "follow"].includes(saved.mode) ? saved.mode : defaults.mode,
    zoom: Number.isFinite(zoom) && zoom > 0 ? Math.max(1, Math.min(2.2, zoom)) : defaults.zoom,
    focus: ["play", "ball", "player"].includes(saved.focus) ? saved.focus : defaults.focus,
    minimap: typeof saved.minimap === "boolean" ? saved.minimap : defaults.minimap,
  };
}
export const DEFAULT_SETTINGS = {
  stick: 96,
  buttons: 62,
  sensitivity: 1,
  assist: 0.7,
  touchAssist: true,
  sound: true,
  crowd: 0.55,
  guidance: true,
  reduced: false,
  leftHanded: false,
  camera: {
    hockey: defaultCameraSettings(),
    soccer: defaultCameraSettings(),
  },
  keys: {
    shoot: "Space",
    pass: "KeyJ",
    lob: "KeyL",
    through: "KeyI",
    sprint: "KeyK",
    switch: "KeyQ",
  },
};
export function readStore(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem("dfe.sports.v1." + key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeStore(key, value) {
  try {
    localStorage.setItem("dfe.sports.v1." + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function loadSettings() {
  const stored = readStore("settings", {});
  const s = stored && typeof stored === "object" ? stored : {};
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const savedKeys = s.keys ?? {},
    keys = { ...DEFAULT_SETTINGS.keys, ...savedKeys },
    newActions = ["lob", "through"],
    occupied = new Set(
      Object.entries(keys)
        .filter(([name]) => !newActions.includes(name) || Object.hasOwn(savedKeys, name))
        .map(([, code]) => code),
    );
  // New actions must not steal a key that an earlier version let users remap.
  // Existing explicit bindings stay intact; only missing actions get a fallback.
  for (const name of newActions) {
    if (Object.hasOwn(savedKeys, name)) continue;
    keys[name] = [
      DEFAULT_SETTINGS.keys[name],
      "KeyU", "KeyO", "KeyH", "KeyN", "KeyM", "KeyV", "KeyC", "KeyB",
      "KeyR", "KeyF", "KeyG", "KeyT", "KeyY", "Digit1", "Digit2",
    ].find((code) => !occupied.has(code));
    occupied.add(keys[name]);
  }
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    crowd: Number.isFinite(Number(s.crowd)) ? Math.max(0, Math.min(1, Number(s.crowd))) : DEFAULT_SETTINGS.crowd,
    keys,
    camera: {
      hockey: sanitizeCameraSettings(s.camera?.hockey, touch),
      soccer: sanitizeCameraSettings(s.camera?.soccer, touch),
    },
  };
}
