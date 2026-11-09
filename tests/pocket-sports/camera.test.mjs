import test from "node:test";
import assert from "node:assert/strict";
import { SportsCamera, placeSportsMinimap } from "../../daily_flyer/themes/pocket_sports_assets/core/sports-camera.js";
import { defaultCameraSettings, sanitizeCameraSettings, loadSettings } from "../../daily_flyer/themes/pocket_sports_assets/core/storage.js";
import { SPORTS } from "../../daily_flyer/themes/pocket_sports_assets/sports/rules.js";
import { bindMinimapInput } from "../../daily_flyer/themes/pocket_sports_assets/core/minimap-input.js";

function fixture(sport = "soccer", width = 428, height = 620) {
  const rules = SPORTS[sport];
  const camera = new SportsCamera();
  camera.resize(width, height, rules);
  const game = {
    rules, sport,
    ball: { x: rules.width / 2, y: rules.height / 2 },
    controlled: 0,
    players: [{ x: rules.width / 2, y: rules.height / 2 }],
  };
  return { camera, game };
}

for (const sport of ["hockey", "soccer"]) {
  for (const [width, height] of [[428, 620], [612, 360], [1440, 720]]) {
    test(`${sport} full view keeps both goals and sidelines visible at ${width}×${height}`, () => {
      const { camera, game } = fixture(sport, width, height);
      camera.update({ game, settings: { mode: "full", zoom: 2.2 } });
      for (const point of [{ x: 0, y: 0 }, { x: game.rules.width, y: game.rules.height }]) {
        const p = camera.project(point);
        assert.ok(p.x >= 0 && p.x <= width);
        assert.ok(p.y >= 0 && p.y <= height);
      }
      const center = { ...camera.center };
      game.ball.y = 0;
      for (let i = 0; i < 120; i++) camera.update({ game, settings: { mode: "full" }, dt: 1 / 60 });
      assert.deepEqual(camera.center, center, "stable view never follows play");
      assert.equal(camera.zoomed, false);
    });
    test(`${sport} fit mode keeps the transverse boundaries visible at ${width}×${height}`, () => {
      const { camera, game } = fixture(sport, width, height);
      for (const x of [0, game.rules.width]) {
        game.ball.x = x;
        game.ball.y = game.rules.height * 0.1;
        for (let i = 0; i < 120; i++) camera.update({ game, settings: { mode: "fit", focus: "ball" }, dt: 1 / 60 });
        for (const sx of [0, game.rules.width]) {
          const p = camera.project({ x: sx, y: camera.center.y });
          const across = camera.rotated ? p.y : p.x;
          assert.ok(across > 0 && across < (camera.rotated ? height : width));
        }
      }
    });
  }
}

test("small movements do not jitter the follow camera; longer travel eases into view", () => {
  const { camera, game } = fixture("soccer", 612, 360);
  const settings = { mode: "follow", zoom: 2, focus: "ball" };
  camera.update({ game, settings });
  const initial = { ...camera.center };
  game.ball.y -= 25;
  camera.update({ game, settings, dt: 1 / 60 });
  assert.deepEqual(camera.center, initial);
  game.ball.y = 100;
  camera.update({ game, settings, dt: 1 / 60 });
  assert.ok(camera.center.y < initial.y);
  assert.ok(initial.y - camera.center.y < 45, "first frame cannot snap to the target");
  for (let i = 0; i < 120; i++) camera.update({ game, settings, dt: 1 / 60 });
  const p = camera.project(game.ball);
  assert.ok(p.x >= 0 && p.x <= camera.width);
  assert.ok(p.y >= 0 && p.y <= camera.height);
});

test("focus uses replay positions and never airborne ball height", () => {
  const { camera, game } = fixture("soccer", 612, 360);
  const settings = { mode: "follow", zoom: 2.2, focus: "ball" };
  game.ball.y = 1200;
  camera.update({ game, settings });
  const liveCenter = camera.center.y;
  const state = { ...game, ball: { x: 440, y: 100, z: 200 } };
  camera.update({ game, state, settings, replay: true });
  assert.ok(camera.center.y < liveCenter - 300, "replay cut frames recorded play, not the live ball");
  const replayCenter = { ...camera.center };
  state.ball.z = 0;
  camera.update({ game, state, settings, replay: true });
  assert.deepEqual(camera.center, replayCenter, "loft height cannot bob the camera");
});

test("selected-player focus and landscape edge arrows retain direction", () => {
  const { camera, game } = fixture("soccer", 612, 360);
  game.ball.y = 0;
  game.players[0].y = 1200;
  camera.update({ game, settings: { mode: "follow", zoom: 2.2, focus: "player" } });
  const player = camera.project(game.players[0]);
  assert.ok(player.x >= 0 && player.x <= camera.width);
  const edge = camera.edge(game.ball);
  assert.ok(edge);
  assert.ok(edge.x > camera.width / 2, "world-up is screen-right in landscape");
  assert.ok(Math.abs(edge.angle) < 0.01);
  assert.equal(camera.edge(game.players[0]), null);
});

test("possession switches do not change the chosen zoom", () => {
  const { camera, game } = fixture();
  const settings = { mode: "follow", zoom: 1.65, focus: "play" };
  camera.update({ game, settings });
  const scale = camera.scale;
  for (let i = 0; i < 120; i++) {
    game.ball.owner = i % 2 ? 0 : null;
    game.ball.y = 300 + i * 5;
    camera.update({ game, settings, dt: 1 / 60 });
    assert.equal(camera.scale, scale);
  }
});

test("new match and orientation changes discard old camera state", () => {
  const { camera, game } = fixture();
  const settings = { mode: "follow", zoom: 2.2, focus: "ball" };
  game.ball.y = 1300;
  camera.update({ game, settings });
  const next = { ...game, ball: { x: 440, y: 100 } };
  camera.update({ game: next, settings });
  assert.ok(camera.center.y < 500);
  camera.resize(612, 360, SPORTS.soccer);
  camera.update({ game: next, settings });
  assert.equal(camera.rotated, true);
  const p = camera.project(next.ball);
  assert.ok(p.x >= 0 && p.x <= 612 && p.y >= 0 && p.y <= 360);
});

test("camera defaults and corrupt preferences are safe and sport-specific", () => {
  assert.equal(defaultCameraSettings(true).mode, "follow");
  assert.equal(defaultCameraSettings(false).mode, "full");
  assert.equal(defaultCameraSettings(true).zoom, 1.45);
  assert.deepEqual(sanitizeCameraSettings({ mode: "bad", zoom: "nope", focus: "bad", minimap: 7 }, true), defaultCameraSettings(true));
  assert.equal(sanitizeCameraSettings({ zoom: 99 }).zoom, 2.2);
  assert.equal(sanitizeCameraSettings({ zoom: 0.2 }).zoom, 1);
  const previousStore = globalThis.localStorage;
  const previousMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.localStorage = { getItem: () => JSON.stringify({ camera: { hockey: { mode: "fit", zoom: 1.8, focus: "player", minimap: false } } }) };
  try {
    const settings = loadSettings();
    assert.equal(settings.camera.hockey.mode, "fit");
    assert.equal(settings.camera.hockey.focus, "player");
    assert.equal(settings.camera.soccer.mode, "follow");
    settings.camera.hockey.zoom = 2;
    assert.equal(settings.camera.soccer.zoom, 1.45);
  } finally {
    if (previousStore === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStore;
    if (previousMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previousMedia;
  }
});

test("manual camera remains where it was released while ball and selected player move", () => {
  const { camera, game } = fixture("soccer", 612, 360);
  const settings = { mode: "follow", zoom: 2.2, focus: "play" };
  camera.update({ game, settings });
  const scale = camera.scale;
  camera.setManualCenter({ x: 350, y: 1000 });
  const center = { ...camera.center };
  for (let i = 0; i < 300; i++) {
    game.ball.y = 40 + i * 3;
    game.players[0].x = 20 + i * 2;
    camera.update({ game, settings, dt: 1 / 60 });
    assert.deepEqual(camera.center, center);
    assert.equal(camera.scale, scale);
  }
  assert.equal(camera.manual, true);
  game.ball.y = 50;
  camera.followPlay();
  assert.equal(camera.manual, false);
  camera.update({ game, settings, dt: 1 / 60 });
  assert.ok(camera.center.y < center.y && camera.center.y > center.y - 50,
    "Follow play starts a smooth return instead of teleporting");
  assert.equal(camera.scale, scale);
});

test("manual view clamps at the field edges and survives phone rotation", () => {
  const { camera, game } = fixture("soccer", 612, 360);
  const settings = { mode: "follow", zoom: 2.2, focus: "ball" };
  camera.update({ game, settings });
  camera.setManualCenter({ x: -1000, y: 4000 });
  const requested = { ...camera.manualCenter };
  assert.equal(camera.center.x, camera.viewWidth / 2 - 22);
  assert.equal(camera.center.y, game.rules.height + 36 - camera.viewHeight / 2);
  camera.resize(428, 620, game.rules);
  camera.update({ game, settings });
  assert.equal(camera.manual, true);
  assert.deepEqual(camera.manualCenter, requested, "layout changes preserve the requested world center");
  assert.deepEqual(camera.center, camera.clampCenter(requested));
  camera.resize(612, 360, game.rules);
  camera.update({ game, settings });
  assert.deepEqual(camera.center, requested, "returning to the original layout restores its exact framing");
});

test("replay navigation is independent and restores the live manual view", () => {
  const { camera, game } = fixture("hockey", 612, 360);
  const settings = { mode: "follow", zoom: 2.2, focus: "ball" };
  camera.update({ game, settings });
  camera.setManualCenter({ x: 250, y: 750 });
  const live = { ...camera.manualCenter };
  const state = { ...game, ball: { x: 300, y: 100 } };
  camera.update({ game, state, settings, replay: true });
  assert.equal(camera.manual, false, "a replay starts by following its own recorded play");
  camera.setManualCenter({ x: 450, y: 300 });
  const recorded = { ...camera.manualCenter };
  state.ball.y = 900;
  camera.update({ game, state, settings, replay: true });
  assert.deepEqual(camera.center, recorded);
  camera.update({ game, settings, replay: false });
  assert.equal(camera.manual, true);
  assert.deepEqual(camera.center, live);
  camera.update({ game, state, settings, replay: true });
  assert.equal(camera.manual, false, "the next replay does not inherit the previous replay's camera");
  camera.setManualCenter({ x: 450, y: 300 });
  camera.followPlay();
  camera.update({ game, settings, replay: false });
  assert.deepEqual(camera.center, live, "following a replay cannot erase the live manual center");
});

test("new matches and changing sport clear manual centers without storing them in preferences", () => {
  const { camera, game } = fixture("soccer", 612, 360);
  const settings = { mode: "follow", zoom: 2.2, focus: "ball" };
  camera.update({ game, settings });
  camera.setManualCenter({ x: 350, y: 1000 });
  camera.update({ game: { ...game }, settings });
  assert.equal(camera.manual, false);
  camera.setManualCenter({ x: 350, y: 1000 });
  camera.resize(612, 360, SPORTS.hockey);
  assert.equal(camera.manual, false);
  assert.deepEqual(settings, { mode: "follow", zoom: 2.2, focus: "ball" });
});

for (const [width, height] of [[428, 620], [612, 360]]) {
  test(`minimap inverse mapping and viewport center agree at ${width}×${height}`, () => {
    const { camera, game } = fixture("soccer", width, height);
    camera.update({ game, settings: { mode: "follow", zoom: 2.2 } });
    const layout = camera.minimapLayout(camera.rotated ? 132 : 100, camera.rotated ? 76 : 108);
    for (const p of [{ x: 0, y: 0 }, { x: 880, y: 1400 }, { x: 243, y: 971 }]) {
      const mapped = camera.minimapProject(p, layout);
      const result = camera.minimapUnproject(mapped, layout);
      assert.ok(Math.abs(result.x - p.x) < 1e-8 && Math.abs(result.y - p.y) < 1e-8);
    }
    const rect = camera.minimapViewRect(layout);
    const world = camera.minimapUnproject({ x: (rect.x + rect.width / 2) * layout.width,
      y: (rect.y + rect.height / 2) * layout.height }, layout);
    assert.ok(Math.abs(world.x - camera.center.x) < 1e-8 && Math.abs(world.y - camera.center.y) < 1e-8);
    const outside = camera.minimapUnproject({ x: 10000, y: -10000 }, layout);
    assert.deepEqual(outside, camera.rotated ? { x: 0, y: 0 } : { x: 880, y: 0 });
  });
}

test("a landscape minimap drag preserves the grabbed viewport offset and stays manual after release", () => {
  const { camera, game } = fixture("soccer", 612, 360);
  const settings = { mode: "follow", zoom: 2.2, focus: "ball" };
  camera.update({ game, settings });
  const layout = camera.minimapLayout(132, 76);
  class Surface extends EventTarget {
    constructor() { super(); this.capture = new Set(); this.classList = { add() {}, remove() {} }; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 132, height: 76 }; }
    setPointerCapture(id) { this.capture.add(id); }
    hasPointerCapture(id) { return this.capture.has(id); }
    releasePointerCapture(id) { this.capture.delete(id); }
    focus() {}
  }
  const surface = new Surface();
  const input = bindMinimapInput(surface, {
    getViewRect: () => camera.minimapViewRect(layout),
    onPan: ({ x, y }) => camera.setManualCenter(camera.minimapUnproject({ x: x * 132, y: y * 76 }, layout)),
    onFollow: () => camera.followPlay(),
  });
  const send = (type, x, y) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 9, pointerType: "touch", isPrimary: false, button: 0, clientX: x, clientY: y });
    surface.dispatchEvent(event);
  };
  const initial = { ...camera.center };
  const p = camera.minimapProject(initial, layout);
  send("pointerdown", p.x + 5, p.y + 3);
  assert.ok(Math.abs(camera.center.y - initial.y) < 1e-8, "grabbing the rectangle cannot jump the center");
  send("pointermove", p.x + 17, p.y + 3);
  send("pointerup", p.x + 17, p.y + 3);
  assert.equal(input.activePointerId, null);
  assert.ok(Math.abs(camera.center.y - (initial.y - 12 / layout.scale)) < 1e-8,
    "dragging right moves the landscape camera toward world-up by the dragged distance");
  const moved = { ...camera.center };
  game.ball.y = 1300;
  camera.update({ game, settings });
  assert.deepEqual(camera.center, moved);
  assert.equal(camera.manual, true);
  input.destroy();
});

function assertMapClear(stage, size, controls, position) {
  const box = { left: stage.left + stage.width - position.right - size.width,
    top: stage.top + stage.height - position.bottom - size.height };
  for (const control of controls) {
    const overlaps = box.left < control.left + control.width + 8 &&
      box.left + size.width > control.left - 8 &&
      box.top < control.top + control.height + 8 &&
      box.top + size.height > control.top - 8;
    assert.equal(overlaps, false, "the map must keep an 8px gap from visible controls");
  }
  assert.ok(box.left >= stage.left && box.top >= stage.top);
  assert.ok(box.left + size.width <= stage.left + stage.width);
  assert.ok(box.top + size.height <= stage.top + stage.height);
}

test("landscape map clears the measured 844×390 hockey action buttons", () => {
  const stage = { left: 145, top: 48, width: 554, height: 342 };
  const size = { width: 132, height: 127 };
  const controls = [{ left: 678, top: 227, width: 148, height: 145 },
    { left: 18, top: 256, width: 116, height: 116 },
    { left: 142, top: 310, width: 50, height: 62 }];
  const position = placeSportsMinimap(stage, size, controls);
  assert.equal(position.bottom, 10, "ordinary overlap only needs horizontal repositioning");
  assert.equal(position.right, 29);
  assertMapClear(stage, size, controls, position);
});

test("landscape map accounts for enlarged and swapped control clusters", () => {
  const stage = { left: 145, top: 48, width: 554, height: 342 };
  const size = { width: 132, height: 127 };
  for (const controls of [
    [{ left: 648, top: 201, width: 178, height: 171 }, { left: 18, top: 226, width: 146, height: 146 }],
    [{ left: 18, top: 201, width: 178, height: 171 }, { left: 680, top: 226, width: 146, height: 146 },
      { left: 620, top: 310, width: 50, height: 62 }],
  ]) assertMapClear(stage, size, controls, placeSportsMinimap(stage, size, controls));
});

test("when custom controls leave too little horizontal room, the map moves above them", () => {
  const stage = { left: 100, top: 20, width: 310, height: 320 };
  const size = { width: 132, height: 127 };
  const controls = [{ left: 100, top: 190, width: 100, height: 150 },
    { left: 260, top: 190, width: 150, height: 150 }];
  const position = placeSportsMinimap(stage, size, controls);
  assert.ok(position.bottom > 10);
  assertMapClear(stage, size, controls, position);
});
