export const DEFAULT_SETTINGS = {
  stick: 96,
  buttons: 62,
  sensitivity: 1,
  assist: 0.7,
  sound: true,
  guidance: true,
  reduced: false,
  leftHanded: false,
  keys: { shoot: "Space", pass: "KeyJ", sprint: "KeyK", switch: "KeyQ" },
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
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    keys: { ...DEFAULT_SETTINGS.keys, ...s.keys },
  };
}
