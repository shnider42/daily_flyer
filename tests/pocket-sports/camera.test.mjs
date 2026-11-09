import test from "node:test";
import assert from "node:assert/strict";
import { SportsCamera } from "../../daily_flyer/themes/pocket_sports_assets/core/sports-camera.js";
import { defaultCameraSettings, sanitizeCameraSettings, loadSettings } from "../../daily_flyer/themes/pocket_sports_assets/core/storage.js";
import { SPORTS } from "../../daily_flyer/themes/pocket_sports_assets/sports/rules.js";

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
