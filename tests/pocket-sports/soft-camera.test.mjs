import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftCamera, easeValue } from '../../daily_flyer/themes/pocket_sports_assets/core/camera.js';

const frame = { x: 500, y: 700, viewWidth: 400, viewHeight: 600, worldWidth: 1000, worldHeight: 1400, dt: 1 / 60 };

test('small ball movements inside the central dead zone do not move the view', () => {
  const c = new SoftCamera();
  c.update(frame);
  for (let n = 0; n < 120; n++) c.update({ ...frame, x: 500 + Math.sin(n) * 45, y: 700 + Math.cos(n) * 60 });
  assert.deepEqual({ x: c.x, y: c.y }, { x: 500, y: 700 });
});

test('a long pass pans progressively instead of locking to the ball', () => {
  const c = new SoftCamera();
  c.update(frame);
  let previous = c.y;
  for (let n = 0; n < 60; n++) {
    c.update({ ...frame, y: 1150 });
    assert.ok(c.y >= previous);
    assert.ok(c.y - previous <= frame.viewHeight * 3 * frame.dt + 1e-6);
    previous = c.y;
  }
  assert.ok(c.y > 1000 && c.y < 1150);
});

test('bounds keep sidelines and end lines in view without empty space', () => {
  const c = new SoftCamera();
  assert.deepEqual(c.update({ ...frame, x: -999, y: 9999 }), { x: 200, y: 1100 });
  assert.deepEqual(c.update({ ...frame, viewWidth: 1600, viewHeight: 2000 }), { x: 500, y: 700 });
});

test('smooth follow is consistent at 30, 60, and 120 frames per second', () => {
  const positions = [30, 60, 120].map(fps => {
    const c = new SoftCamera();
    c.update(frame);
    for (let n = 0; n < fps; n++) c.update({ ...frame, x: 660, y: 920, dt: 1 / fps });
    return c;
  });
  for (const c of positions) {
    assert.ok(Math.abs(c.x - positions[1].x) < 1);
    assert.ok(Math.abs(c.y - positions[1].y) < 1);
  }
});

test('steady follow dampens motion more and new worlds reset stale position', () => {
  const soft = new SoftCamera(), steady = new SoftCamera();
  soft.update(frame); steady.update(frame);
  soft.update({ ...frame, x: 680 });
  steady.update({ ...frame, x: 680, steady: true });
  assert.ok(steady.x < soft.x);
  assert.deepEqual(steady.update({ ...frame, x: 100, y: 200, worldWidth: 680, worldHeight: 1080 }), { x: 200, y: 300 });
  steady.reset();
  assert.equal(steady.update({ ...frame, x: 700 }).x, 700);
});

test('invalid elapsed times and stale tabs do not cause huge steps or NaN', () => {
  const c = new SoftCamera(); c.update(frame);
  const held = c.update({ ...frame, y: 1200, dt: -2 });
  assert.equal(held.y, 700);
  c.update({ ...frame, x: NaN, y: Infinity, dt: 600 });
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
  assert.equal(easeValue(1, 2, 0), 1);
  assert.ok(easeValue(1, 2, 1 / 60) > 1 && easeValue(1, 2, 1 / 60) < 2);
});
