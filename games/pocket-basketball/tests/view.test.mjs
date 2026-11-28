import test from 'node:test';
import assert from 'node:assert/strict';
import { CourtView } from '../public/view.js';

function fixture(width, height) {
  const rect = { left: 17, top: 23, width, height };
  // Camera and hit testing run through the real renderer. Paint operations are
  // harmless no-ops; arena asset generation is independent of viewport fitting.
  const ctx = new Proxy({ measureText: text => ({ width: text.length * 6 }) }, {
    get: (target, key) => key in target ? target[key] : () => {},
  });
  const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ ...rect }) };
  const view = new CourtView(canvas); view._makeArena = () => { view.arena = {}; };
  const game = { teams: [{ id: 'home' }, { id: 'away' }], score: [0, 0], period: 1,
    human: 0, possession: 0, controlled: 0, phase: 'live', elapsed: 0,
    players: [
      { id: 0, team: 0, slot: 0, active: true, x: 100, y: 200, height: 79, number: 1 },
      { id: 1, team: 0, slot: 1, active: true, x: 430, y: 760, height: 82, number: 2 },
    ], ball: { x: 250, y: 470, z: 0, owner: null } };
  const render = options => view.render(game, { guidance: 'expert', showNames: false, ...options });
  return { view, game, rect, render };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test('compact full court grows the playing surface while retaining every boundary', () => {
  for (const [width, height, minimumGain] of [[390, 796, 1.18], [812, 306, 1.07]]) {
    const { view, render } = fixture(width, height);
    render(); const original = view.scale;
    render({ compactViewport: true });
    assert.ok(view.scale > original * minimumGain);
    for (const [x, y] of [[0, 0], [500, 0], [0, 940], [500, 940]]) {
      const point = view._point(x, y);
      assert.ok(point.x >= 8 - 1e-8 && point.x <= width - 8 + 1e-8);
      assert.ok(point.y >= 32 - 1e-8 && point.y <= height - 8 + 1e-8);
    }
  }
});

test('drawing, inverse coordinates and player taps agree in both rotations and cameras', () => {
  for (const [width, height] of [[390, 796], [812, 306]]) for (const camera of ['full', 'follow']) {
    const { view, game, rect, render } = fixture(width, height);
    render({ compactViewport: true, camera });
    for (const [x, y] of [[0, 0], [500, 940], [250, 52.5], [123.5, 456.7]]) {
      const screen = view._point(x, y), world = view.worldPoint(screen.x + rect.left, screen.y + rect.top);
      close(world.x, x); close(world.y, y);
    }
    const player = game.players[0], screen = view._point(player.x, player.y);
    assert.equal(view.hitPlayer(screen.x + rect.left, screen.y + rect.top - 11 * view._spriteUnit(player), game), player.id);
    const translations = [];
    view._worldTransform({ translate: (x, y) => translations.push({ x, y }), rotate() {}, scale() {} });
    assert.deepEqual(translations[0], view.origin, 'arena and player drawing use the same screen origin');
    const direction = view.screenDirection({ x: 1, y: 0 });
    assert.deepEqual(direction, view.rotated ? { x: 0, y: -1 } : { x: 1, y: 0 });
  }
});

test('noncompact rendering and lobby previews preserve the original arena fit', () => {
  for (const [width, height] of [[390, 796], [812, 306], [1366, 768]]) {
    const { view, render } = fixture(width, height), rotated = width / height >= 1.15;
    const expected = Math.min(width / (rotated ? 1060 : 620), height / (rotated ? 620 : 1060));
    render(); close(view.scale, expected);
    assert.deepEqual(view.origin, { x: width / 2, y: height / 2 });
    render({ compactViewport: true, preview: true }); close(view.scale, expected);
    assert.deepEqual(view.origin, { x: width / 2, y: height / 2 });
  }
});

test('compact follow camera retains near-rim coverage and upright heads at court edges', () => {
  for (const [width, height] of [[390, 796], [812, 306]]) {
    for (const [x, y] of [[12, 14], [488, 14], [12, 926], [488, 926]]) {
      const { view, game, render } = fixture(width, height), player = game.players[0];
      Object.assign(player, { x, y, height: 88, jump: .45 });
      Object.assign(game.ball, { x, y, owner: player.id });
      for (let i = 0; i < 180; i++) render({ compactViewport: true, camera: 'follow' });
      const sprite = view.screenPlayers.find(p => p.id === player.id);
      assert.ok(sprite.top >= 0 && sprite.bottom <= height, 'an upright jumping silhouette remains inside the canvas');
      const hoop = view._point(250, y < 470 ? 52.5 : 887.5);
      assert.ok(hoop.x > 8 && hoop.x < width - 8 && hoop.y > 8 && hoop.y < height - 8);
    }
  }
});

test('rotating a compact viewport recomputes the same origin used by touch input', () => {
  const { view, rect, render } = fixture(390, 796);
  render({ compactViewport: true }); assert.equal(view.rotated, false);
  rect.width = 812; rect.height = 306;
  render({ compactViewport: true }); assert.equal(view.rotated, true);
  const screen = view._point(123, 654), world = view.worldPoint(rect.left + screen.x, rect.top + screen.y);
  close(world.x, 123); close(world.y, 654);
  assert.deepEqual(view.origin, { x: 406, y: 165 });
});
