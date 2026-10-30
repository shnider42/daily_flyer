import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchFireGestures, resolveFireGesture } from '../daily_flyer/themes/breach_assets/touch-controls.mjs';

const down = (gesture, values = {}) => gesture.begin({ pointerId: 1, source: 'fire', x: 100, y: 100, time: 0, ...values });
const up = (gesture, values = {}) => gesture.end({ pointerId: 1, x: 100, y: 100, ...values });

test('existing settings without a fire mode get the safe mode; Classic is explicit', () => {
  assert.equal(resolveFireGesture(undefined), 'safe');
  assert.equal(resolveFireGesture('unknown'), 'safe');
  assert.equal(resolveFireGesture('classic'), 'classic');
});

test('a drag beginning on Fire turns into look without firing, even after a long hold', () => {
  const gesture = new TouchFireGestures();
  assert.deepEqual(down(gesture), { accepted: true, pulse: false });
  assert.equal(gesture.sample(100).firing, false);
  const move = gesture.move({ pointerId: 1, x: 108, y: 100 });
  assert.equal(move.dx, 8);
  assert.equal(gesture.sample(1200).firing, false);
  assert.equal(gesture.sample(1200).blocksAutoFire, true);
  assert.equal(up(gesture, { x: 180 }).pulse, false);
});

test('movement crossing the threshold on pointerup cancels the shot too', () => {
  const gesture = new TouchFireGestures();
  down(gesture);
  assert.equal(up(gesture, { x: 110 }).pulse, false);
});

test('a short stationary tap fires exactly once on release, tolerating small thumb jitter', () => {
  const gesture = new TouchFireGestures();
  down(gesture);
  gesture.move({ pointerId: 1, x: 103, y: 102 });
  assert.equal(gesture.sample(100).firing, false);
  assert.equal(up(gesture, { x: 103, y: 102 }).pulse, true);
  assert.equal(up(gesture).pulse, false);
  assert.equal(gesture.sample(1000).firing, false);
});

test('stationary hold arms at 200ms and can then track while firing', () => {
  const gesture = new TouchFireGestures();
  down(gesture);
  assert.equal(gesture.sample(199).firing, false);
  assert.equal(gesture.sample(200).firing, true);
  gesture.move({ pointerId: 1, x: 180, y: 100 });
  assert.equal(gesture.sample(600).firing, true);
  assert.equal(up(gesture, { x: 180 }).pulse, false);
  assert.equal(gesture.sample(601).firing, false);
});

test('world-origin look cannot become fire when it crosses the button or stops there', () => {
  const gesture = new TouchFireGestures();
  down(gesture, { source: 'look', x: 20 });
  gesture.move({ pointerId: 1, x: 100, y: 100 });
  assert.deepEqual(down(gesture, { source: 'fire', time: 100 }), { accepted: false, pulse: false });
  assert.equal(gesture.sample(1000).firing, false);
  assert.equal(gesture.sample(1000).blocksAutoFire, true);
  assert.equal(up(gesture).pulse, false);
});

test('pointercancel and lost capture cancel pending and held fire without a release shot', () => {
  for (const arm of [false, true]) {
    const gesture = new TouchFireGestures();
    down(gesture);
    if (arm) gesture.sample(250);
    gesture.cancel(1);
    assert.equal(up(gesture).pulse, false);
    assert.equal(gesture.sample(1000).firing, false);
  }
});

test('lifecycle reset clears every touch; stale pointerup cannot fire after resume', () => {
  const gesture = new TouchFireGestures();
  down(gesture, { pointerId: 1, source: 'look' });
  down(gesture, { pointerId: 2 });
  gesture.sample(250);
  gesture.cancel();
  assert.equal(up(gesture, { pointerId: 2 }).pulse, false);
  assert.deepEqual(gesture.sample(1000), { firing: false, pending: false, fireLooking: false, blocksAutoFire: false });
});

test('simultaneous look and deliberate fire retain independent pointer ownership', () => {
  const gesture = new TouchFireGestures();
  down(gesture, { pointerId: 1, source: 'look' });
  down(gesture, { pointerId: 2 });
  assert.equal(down(gesture, { pointerId: 3 }).accepted, false, 'a second fire pointer cannot steal ownership');
  assert.equal(gesture.sample(250).firing, true);
  assert.equal(gesture.sample(250).blocksAutoFire, true);
  gesture.cancel(1);
  assert.equal(gesture.sample(251).firing, true);
  gesture.cancel(2);
  assert.equal(gesture.sample(252).firing, false);
});

test('Classic fires on down and permits immediate drag; changing mode cancels the gesture', () => {
  const gesture = new TouchFireGestures({ mode: 'classic' });
  assert.equal(down(gesture).pulse, true);
  gesture.move({ pointerId: 1, x: 180, y: 100 });
  assert.equal(gesture.sample(10).firing, true);
  gesture.setMode('safe');
  assert.equal(gesture.sample(1000).firing, false);
  assert.equal(up(gesture, { x: 180 }).pulse, false);
});
