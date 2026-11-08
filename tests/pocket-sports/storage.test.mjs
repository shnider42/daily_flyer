import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  loadSettings,
} from "../../daily_flyer/themes/pocket_sports_assets/core/storage.js";

function loadSaved(settings) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) {
      assert.equal(key, "dfe.sports.v1.settings");
      return settings === undefined ? null : JSON.stringify(settings);
    },
  };
  try {
    return loadSettings();
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

const reserved = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown",
  "ArrowLeft", "ArrowRight", "Escape", "KeyP", "Tab",
]);

test("a fresh install keeps the documented keyboard defaults", () => {
  const settings = loadSaved();
  assert.deepEqual(settings, DEFAULT_SETTINGS);
  assert.equal(settings.keys.lob, "KeyL");
  assert.equal(settings.keys.through, "KeyI");
});

for (const pass of ["KeyL", "KeyI"]) {
  test(`legacy pass on ${pass} survives without hiding a new face action`, () => {
    const saved = {
      buttons: 70,
      sound: false,
      keys: { shoot: "Space", pass, sprint: "KeyK", switch: "KeyQ" },
    };
    const settings = loadSaved(saved);
    assert.equal(settings.buttons, 70);
    assert.equal(settings.sound, false);
    for (const [name, code] of Object.entries(saved.keys))
      assert.equal(settings.keys[name], code);
    assert.equal(new Set(Object.values(settings.keys)).size, 6);
    for (const name of ["lob", "through"]) {
      assert.equal(typeof settings.keys[name], "string");
      assert.equal(reserved.has(settings.keys[name]), false);
    }
  });
}

test("both missing face actions get usable keys when I and L were remapped", () => {
  const saved = {
    keys: { shoot: "KeyI", pass: "KeyL", sprint: "KeyU", switch: "KeyO" },
  };
  const settings = loadSaved(saved);
  for (const [name, code] of Object.entries(saved.keys))
    assert.equal(settings.keys[name], code);
  assert.equal(new Set(Object.values(settings.keys)).size, 6);
  for (const name of ["lob", "through"]) {
    assert.equal(typeof settings.keys[name], "string");
    assert.equal(reserved.has(settings.keys[name]), false);
  }
});

test("saved explicit face-button mappings remain unchanged", () => {
  const keys = {
    shoot: "Space", pass: "KeyL", lob: "KeyX", through: "KeyY",
    sprint: "ShiftRight", switch: "Enter",
  };
  assert.deepEqual(loadSaved({ keys }).keys, keys);
});

test("an explicit new mapping takes priority over another missing action's default", () => {
  const settings = loadSaved({ keys: { through: "KeyL" } });
  assert.equal(settings.keys.through, "KeyL");
  assert.notEqual(settings.keys.lob, "KeyL");
  assert.equal(new Set(Object.values(settings.keys)).size, 6);
  assert.equal(reserved.has(settings.keys.lob), false);
});
