export const DEFAULT_SETTINGS = {
  stick: 96,
  buttons: 62,
  sensitivity: 1,
  assist: 0.7,
  touchAssist: true,
  sound: true,
  guidance: true,
  reduced: false,
  leftHanded: false,
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
  const s = readStore("settings", {});
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
    keys,
  };
}
