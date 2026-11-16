import test from 'node:test';
import assert from 'node:assert/strict';
import { CompatibilityRenderer } from '../public/fallback-renderer.mjs';
import { BaseballGame } from '../public/engine.mjs';

// Count real renderer work without claiming that an inert canvas measures FPS.
function setup() {
  const calls = new Map();
  const makeCanvas = (width = 430, height = 932) => {
    const context = new Proxy({}, {
      get(target, key) {
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
        return target[key] ?? ((...args) => { calls.set(key, (calls.get(key) || 0) + 1); });
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    return { width: 1, height: 1, clientWidth: width, clientHeight: height, getContext: () => context };
  };
  globalThis.document = { createElement: () => makeCanvas() };
  globalThis.devicePixelRatio = 1;
  const canvas = makeCanvas(), renderer = new CompatibilityRenderer(canvas);
  const game = new BaseballGame({ mode: 'practice', park: 'fenway', seed: 2003 });
  return { renderer, canvas, game, calls };
}

test('stationary batting view reuses stadium painting while players continue animating', () => {
  const { renderer, game } = setup();
  let poses = 0;
  const person = renderer.person.bind(renderer);
  renderer.person = (...args) => { poses++; return person(...args); };
  renderer.render(game.state, 1/60, {});
  const first = renderer.getDiagnostics(), originalPoses = poses;
  for (let i = 0; i < 5; i++) { game.state.time += 1/60; renderer.render(game.state, 1/60, {}); }
  const next = renderer.getDiagnostics();
  assert.equal(next.backgroundBuilds, first.backgroundBuilds);
  assert.equal(next.backgroundReused, true);
  assert(poses > originalPoses, 'a cached stadium must not freeze player poses');
});

test('background follows score/count, moving camera, venue, and viewport changes', () => {
  const { renderer, game, canvas } = setup();
  renderer.render(game.state, 1/60, {});
  let builds = renderer.getDiagnostics().backgroundBuilds;
  game.state.balls++;
  renderer.render(game.state, 1/60, {});
  assert.equal(renderer.getDiagnostics().backgroundBuilds, ++builds);
  game.state.score[0]++;
  renderer.render(game.state, 1/60, {});
  assert.equal(renderer.getDiagnostics().backgroundBuilds, ++builds);
  renderer.render(game.state, 1/60, { menu: true });
  assert.equal(renderer.getDiagnostics().backgroundBuilds, ++builds);
  renderer.render(game.state, 1/60, { menu: true });
  assert.equal(renderer.getDiagnostics().backgroundBuilds, ++builds);
  game.state.options.park = 'harbor';
  renderer.render(game.state, 1/60, {});
  assert.equal(renderer.getDiagnostics().backgroundBuilds, ++builds);
  canvas.clientWidth = 932; canvas.clientHeight = 430; renderer.resize();
  renderer.render(game.state, 1/60, {});
  assert.equal(renderer.getDiagnostics().backgroundBuilds, ++builds);
  assert.equal(renderer.getDiagnostics().width, 932);
  assert.equal(renderer.getDiagnostics().height, 430);
  assert.equal(renderer.getDiagnostics().backgroundCached, false, 'never reuse the old-sized layer during a camera transition');
});

test('animation frames do not request layout dimensions after HUD updates', () => {
  const { renderer, game, canvas } = setup();
  Object.defineProperty(canvas, 'clientWidth', { get() { throw Error('forced layout read'); } });
  Object.defineProperty(canvas, 'clientHeight', { get() { throw Error('forced layout read'); } });
  assert.doesNotThrow(() => renderer.render(game.state, 1/60, {}));
});

test('a completely offscreen Fenway scoreboard never rasterizes its texture', () => {
  const { renderer, game, calls } = setup();
  renderer.render(game.state, 1/60, {});
  const corners = renderer.boardSurface.map(p => renderer.project(p.x, p.y, p.z));
  assert(corners.every(p => p.x < 0));
  const draws = calls.get('drawImage') || 0;
  renderer.drawSurface(renderer.boardCanvas, renderer.boardSurface);
  assert.equal(calls.get('drawImage') || 0, draws);
});
