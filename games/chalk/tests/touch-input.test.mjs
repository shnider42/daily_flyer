import test from 'node:test';
import assert from 'node:assert/strict';
import { stickVector, touchIntent, GroundOrderTap, ThrowableDrag } from '../public/touch-input.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} is not close to ${expected}`);

test('thumb dead zone prevents drift and starts smoothly at its boundary', () => {
  assert.deepEqual(stickVector(0, 0, 50), { x: 0, y: 0, magnitude: 0 });
  assert.deepEqual(stickVector(6, 0, 50), { x: 0, y: 0, magnitude: .12 });
  const justOutside = stickVector(6.00005, 0, 50);
  assert.ok(justOutside.x > 0 && justOutside.x < .00001);
  const halfway = stickVector(28, 0, 50);
  near(halfway.x, .5); near(halfway.y, 0); near(halfway.magnitude, .56);
});

test('diagonal and overextended thumb movement preserve direction without increasing speed', () => {
  const diagonal = stickVector(40, 40, 40);
  near(diagonal.x, Math.SQRT1_2); near(diagonal.y, Math.SQRT1_2);
  near(Math.hypot(diagonal.x, diagonal.y), 1);
  assert.equal(diagonal.magnitude, 1);
  assert.deepEqual(stickVector(-200, 0, 40), { x: -1, y: 0, magnitude: 1 });
  const diagonalIntent = touchIntent({ moveX: 1, moveY: 1 });
  near(Math.hypot(diagonalIntent.moveX, diagonalIntent.moveY), 1);
  assert.equal(diagonalIntent.sprint, true);
});

test('invalid thumb geometry becomes neutral input', () => {
  for (const args of [[NaN, 0, 40], [0, Infinity, 40], [1, 1, 0], [1, 1, -4], [1, 1, Infinity], [1, 1, 40, -1], [1, 1, 40, 1]]) {
    assert.deepEqual(stickVector(...args), { x: 0, y: 0, magnitude: 0 });
  }
});

test('light aim drag turns without firing, and outer drag fires at the threshold', () => {
  const base = { aimX: 1, aimY: 0 };
  assert.equal(touchIntent({ ...base, aimStrength: .12 }).aiming, false);
  const aiming = touchIntent({ ...base, aimStrength: .13 });
  assert.equal(aiming.aiming, true); assert.equal(aiming.firing, false);
  assert.equal(touchIntent({ ...base, aimStrength: .559 }).firing, false);
  assert.equal(touchIntent({ ...base, aimStrength: .56 }).firing, true);
});

test('sprint needs a deliberate movement drag and stops when aiming', () => {
  assert.equal(touchIntent({ moveX: .919 }).sprint, false);
  assert.equal(touchIntent({ moveX: .92 }).sprint, true);
  const movingAim = touchIntent({ moveX: 1, aimX: 0, aimY: -1, aimStrength: .3 });
  assert.equal(movingAim.moveX, 1); assert.equal(movingAim.aiming, true);
  assert.equal(movingAim.firing, false); assert.equal(movingAim.sprint, false);
  const firing = touchIntent({ moveX: 1, aimX: 0, aimY: -1, aimStrength: 1 });
  assert.equal(firing.firing, true); assert.equal(firing.sprint, false);
});

test('map or order placement blocks movement, aim, fire, and sprint together', () => {
  assert.deepEqual(touchIntent({ moveX: 1, moveY: 1, aimX: -1, aimY: -1, aimStrength: 1, blocked: true }), {
    moveX: 0, moveY: 0, aiming: false, firing: false, sprint: false
  });
});

test('absent or malformed input cannot trigger aiming or firing', () => {
  const neutral = { moveX: 0, moveY: 0, aiming: false, firing: false, sprint: false };
  assert.deepEqual(touchIntent(), neutral);
  assert.deepEqual(touchIntent({ moveX: NaN, moveY: Infinity, aimX: 1, aimStrength: NaN }), neutral);
  assert.deepEqual(touchIntent({ aimX: NaN, aimY: 1, aimStrength: 1 }), neutral);
  assert.deepEqual(touchIntent({ aimStrength: 1 }), neutral);
});

test('a ground order tap remains independent from a second held joystick pointer', () => {
  const tap = new GroundOrderTap();
  assert.equal(tap.begin(8,200,320,100),true);
  assert.equal(tap.begin(9,30,700,120),false);
  tap.move(9,30,640); tap.cancel(9);
  assert.equal(tap.end(9,30,640,200),false);
  assert.equal(tap.end(8,204,324,260),true);
  assert.equal(tap.end(8,204,324,270),false);
});

test('ground drags, long holds, cancellations and invalid coordinates never issue orders', () => {
  const tap = new GroundOrderTap();
  tap.begin(1,200,300,100); tap.move(1,250,300); tap.move(1,200,300);
  assert.equal(tap.end(1,200,300,200),false);
  tap.begin(2,200,300,300); assert.equal(tap.end(2,200,300,1000),false);
  tap.begin(3,200,300,1100); tap.cancel(); assert.equal(tap.end(3,200,300,1150),false);
  assert.equal(tap.begin(4,NaN,300,1200),false);
  tap.begin(4,200,300,1200); assert.equal(tap.end(4,Infinity,300,1230),false);
});

test('throwing requires a deliberate captured drag, while taps and return-to-center cancel', () => {
  const drag = new ThrowableDrag();
  assert.equal(drag.begin(1, 200, 500), true);
  assert.equal(drag.end(1, 200, 500), null);
  drag.begin(2, 200, 500); drag.move(2, 205, 500);
  assert.equal(drag.vector(), null);
  drag.move(2, 280, 500); assert.ok(drag.vector());
  assert.equal(drag.end(2, 202, 501), null, 'bringing a prepared throw back to the button cancels it');
});

test('throw dragging preserves direction and bounds range without consuming another pointer', () => {
  const drag = new ThrowableDrag();
  drag.begin(1, 100, 100);
  assert.equal(drag.begin(2, 200, 200), false);
  drag.move(2, 250, 300); drag.cancel(2);
  assert.equal(drag.end(2, 250, 300), null);
  drag.move(1, 300, -100);
  const vector = drag.end(1, 300, -100);
  near(vector.x, Math.SQRT1_2); near(vector.y, -Math.SQRT1_2); assert.equal(vector.strength, 1);
  assert.equal(drag.end(1, 300, -100), null, 'release cannot create a duplicate throw');
});

test('cancellation and invalid throw coordinates cannot leave an armed gesture behind', () => {
  const drag = new ThrowableDrag();
  assert.equal(drag.begin(1, NaN, 100), false);
  drag.begin(1, 100, 100); drag.move(1, 200, 100); drag.cancel();
  assert.equal(drag.end(1, 200, 100), null);
  drag.begin(2, 100, 100); drag.move(2, Infinity, 100);
  assert.equal(drag.pending, null);
  drag.begin(3, 100, 100); assert.equal(drag.end(3, 100, NaN), null);
});
