import test from 'node:test';
import assert from 'node:assert/strict';
import { Voyage } from '../../daily_flyer/themes/saltbound_assets/core.mjs';
import { SeaRenderer } from '../../daily_flyer/themes/saltbound_assets/render.mjs';

// Enforce the Canvas API's geometry contract. The previous combat tests only
// exercised simulation, so a negative particle radius escaped those checks.
function canvas() {
  const context = new Proxy({
    ellipse(x, y, rx, ry) {
      if (rx < 0 || ry < 0) throw new DOMException('The radius is negative.', 'IndexSizeError');
      assert([x, y, rx, ry].every(Number.isFinite));
    },
    arc(x, y, radius) {
      if (radius < 0) throw new DOMException('The radius is negative.', 'IndexSizeError');
      assert([x, y, radius].every(Number.isFinite));
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  return { width: 390, height: 844, getContext: () => context };
}

function setup(t, width = 390, height = 844) {
  for (const [key, value] of Object.entries({
    innerWidth: width, innerHeight: height, devicePixelRatio: 3,
    document: { body: { classList: { contains: () => true } }, createElement: canvas },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const game = new Voyage({ seed: 42 });
  game.addPlayer('p');
  const renderer = new SeaRenderer(canvas());
  renderer.cam = { x: game.ship.x, y: game.ship.y };
  return { game, renderer };
}

for (const type of ['impact', 'sink', 'defeat']) {
  test(`${type} effects survive their entire fade, including the final tenth of a second`, t => {
    const { game, renderer } = setup(t);
    game.emit(type, game.ship.x, game.ship.y);
    for (const age of [0, .5, .999, 1, 1.001, 1.05, 1.099, 1.1, 1.101, 2]) {
      game.time = age;
      assert.doesNotThrow(() => renderer.draw(game, { id: 'p' }), `effect age ${age}`);
    }
  });
}

test('a minute of mobile combat frames keeps rendering through repeated hits and kills', t => {
  const { game, renderer } = setup(t);
  const types = ['impact', 'sink', 'defeat', 'shot', 'cannon', 'sword', 'loot', 'repair', 'hurt'];
  for (let frame = 0; frame < 60 * 60; frame++) {
    game.time = frame / 60;
    if (frame % 23 === 0) game.emit(types[Math.floor(frame / 23) % types.length], game.ship.x, game.ship.y, { a: .7 });
    renderer.draw(game, { id: 'p', guidance: 'simple' }, 1 / 60);
  }
  assert.equal(Math.floor(game.time), 59);
});
