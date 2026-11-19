import test from 'node:test';
import assert from 'node:assert/strict';
import { quietEarthSites } from '../dist/quiet-earth-content.mjs';
import { createQuietEarthPresentation, drawQuietEarthPresentation } from '../dist/quiet-earth-presentation.mjs';

const site = quietEarthSites('morrow')[0], surface = { id: site.key, site, quietEarth: true };
const event = (beatId, extra = {}) => ({ type: 'quiet-earth-beat', id: `${site.key}:quiet-earth:${beatId}`, siteId: site.key, beatId, ...extra });
class Canvas {
  constructor() { this.canvas = { width: 360, height: 280 }; this.ops = []; this.globalAlpha = 1; this.stack = []; }
  save() { this.stack.push([this.globalAlpha, this.fillStyle]); }
  restore() { [this.globalAlpha, this.fillStyle] = this.stack.pop(); }
  fillRect(x, y, w, h) { this.ops.push({ color: this.fillStyle, alpha: this.globalAlpha, x, y, w, h }); }
}
const render = (exploration = {}, presentation, options = {}) => {
  const ctx = new Canvas();
  drawQuietEarthPresentation(ctx, surface, { exploration, presentation, cameraX: 1350, cameraY: 980, width: 360, height: 280, layer: 'floor', ...options });
  assert.equal(ctx.globalAlpha, 1, 'Scene effects restore canvas state.');
  return ctx.ops;
};

test('shared receipts play once, stay in their site, and expire without replaying on a return visit', () => {
  const presenter = createQuietEarthPresentation();
  assert.equal(presenter.receive(event('service-cart'), 5), true);
  assert.equal(presenter.receive(event('service-cart'), 5.1), false);
  assert.equal(presenter.receive(event('ambush', { siteId: 'elsewhere' }), 5), false);
  assert.equal(presenter.receive(event('unknown'), 5), false);
  const frame = presenter.sample(5.6, { siteId: site.key });
  assert.equal(frame.events.length, 1); assert.ok(Math.abs(frame.events[0].age - .6) < 1e-6);
  assert.equal(presenter.sample(5.7, { siteId: 'morrow' }).events.length, 0);
  assert.equal(presenter.sample(5.8, { siteId: site.key }).events.length, 0);
  assert.equal(presenter.receive(event('service-cart'), 6), false, 'An old network receipt cannot follow the player back in.');
  presenter.reset(); assert.equal(presenter.receive(event('service-cart'), 8), true);
  assert.equal(presenter.sample(12, { siteId: site.key }).events.length, 0);
});

test('the cart visibly rolls; a restored cue retains its moved location without needing its event', () => {
  const presenter = createQuietEarthPresentation(), state = { quietEarth: { cues: ['service-cart'] } };
  const wheels = ops => ops.filter(op => op.color === '#0b1920').map(op => op.x);
  const initial = wheels(render());
  presenter.receive(event('service-cart'), 1);
  const midway = wheels(render(state, presenter.sample(1.5, { siteId: site.key })));
  const restored = wheels(render(state, presenter.sample(5, { siteId: site.key })));
  assert.equal(initial.length, 2); assert.equal(midway.length, 2); assert.equal(restored.length, 2);
  assert.ok(midway[0] > initial[0] && midway[0] < restored[0]);
  assert.equal(restored[0] - initial[0], 48, 'The cart stays beside the wall instead of blocking the walkable corridor.');
  const reducedEarly = render(state, { events: [{ beatId: 'service-cart', siteId: site.key, age: .1 }] }, { reduceMotion: true });
  const reducedLate = render(state, { events: [{ beatId: 'service-cart', siteId: site.key, age: 1 }] }, { reduceMotion: true });
  assert.deepEqual(reducedEarly, reducedLate, 'Reduced motion keeps the physical clue without sliding or shaking.');
});

test('the vent opens physically and emits local steam, with no actors, health, or mission changes', () => {
  const state = { choices: {}, quietEarth: { cues: ['pressure-vent'] }, monsters: [{ hidden: true, x: 1050, y: 1730, health: 90 }] };
  const before = JSON.stringify(state), presentation = { events: [{ beatId: 'pressure-vent', siteId: site.key, age: .45 }] };
  const options = { cameraX: 900, cameraY: 1610 };
  const grille = ops => ops.find(op => op.color === '#71817d');
  const closed = grille(render({}, null, options)), opened = grille(render(state, null, options));
  assert.equal(opened.y - closed.y, 22);
  const steam = render(state, presentation, { ...options, layer: 'air' });
  assert.ok(steam.some(op => op.color === '#b7c7ba' && op.alpha > 0));
  assert.ok(steam.filter(op => op.color === '#b7c7ba').every(op => op.w < 30 && op.h < 20), 'Pressure puffs remain small world-space shapes.');
  assert.equal(render(state, presentation, { ...options, layer: 'air', reduceMotion: true }).length, 0);
  assert.equal(JSON.stringify(state), before);
});

test('lighting changes follow actual encounter choices, never the existence of hidden actors', () => {
  const quiet = { choices: { breaker: 'restore' }, monsters: [{ hidden: true, hostile: false }] };
  const normal = render(quiet);
  assert.deepEqual(render({ ...quiet, monsters: [{ hidden: false, hostile: true }] }), normal);
  const danger = render({ ...quiet, choices: { breaker: 'restore', receiver: 'copy' } });
  assert.ok(!normal.some(op => op.color === '#d1a36c'));
  assert.ok(danger.some(op => op.color === '#d1a36c'));
  assert.ok(danger.every(op => op.w < 150 && op.h < 150), 'There is no full-screen warning flash or darkness overlay.');
  const ctx = new Canvas();
  drawQuietEarthPresentation(ctx, { id: 'morrow' }, { exploration: quiet, layer: 'floor' });
  assert.equal(ctx.ops.length, 0, 'Other planets and corridors do not inherit these authored effects.');
});

test('deep wall shadow keeps the walkable route and its complete boundary visible', () => {
  const tiles = Array.from({ length: 9 }, () => Array(12).fill(2));
  for (let x = 2; x < 10; x++) tiles[4][x] = 1;
  const scene = { ...surface, tiles, cols: 12, rows: 9 }, before = JSON.stringify(tiles), ctx = new Canvas();
  drawQuietEarthPresentation(ctx, scene, { cameraX: 0, cameraY: 0, width: 288, height: 216, layer: 'floor' });
  const shadow = ctx.ops.filter(op => op.color === '#08141b');
  assert.ok(shadow.length > 0);
  const covered = (x, y) => shadow.some(op => (x + .5) * 24 >= op.x && (x + .5) * 24 < op.x + op.w && (y + .5) * 24 >= op.y && (y + .5) * 24 < op.y + op.h);
  for (let x = 1; x <= 10; x++) for (let y = 3; y <= 5; y++) assert.equal(covered(x, y), false);
  assert.equal(covered(5, 1), true); assert.equal(covered(5, 7), true);
  assert.equal(JSON.stringify(tiles), before, 'Wall shading does not change collision.');
});
