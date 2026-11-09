import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMinimapInput } from '../../daily_flyer/themes/pocket_sports_assets/core/minimap-input.js';
import { Input } from '../../daily_flyer/themes/pocket_sports_assets/core/input.js';
import { DEFAULT_SETTINGS } from '../../daily_flyer/themes/pocket_sports_assets/core/storage.js';

class Surface extends EventTarget {
  constructor() {
    super(); this.capture = new Set(); this.ownerDocument = new EventTarget();
    this.ownerDocument.defaultView = new EventTarget(); this.ownerDocument.hidden = false;
    this.classList = { add() {}, remove() {} }; this.focused = false;
  }
  getBoundingClientRect() { return { left: 100, top: 200, width: 100, height: 200 }; }
  setPointerCapture(id) { this.capture.add(id); }
  hasPointerCapture(id) { return this.capture.has(id); }
  releasePointerCapture(id) { this.capture.delete(id); }
  focus() { this.focused = true; }
}
function event(surface, type, options = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 2, pointerType: 'touch', isPrimary: false,
    button: 0, clientX: 150, clientY: 300, ...options });
  surface.dispatchEvent(e); return e;
}
function setup(rect = { x: .3, y: .3, width: .4, height: .4 }) {
  const surface = new Surface(), pans = [], ends = [], follows = [];
  const input = bindMinimapInput(surface, { getViewRect: () => rect,
    onPan: p => pans.push(p), onEnd: e => ends.push(e), onFollow: () => follows.push(true) });
  return { surface, input, pans, ends, follows };
}
const xy = p => ({ x: p.x, y: p.y });

test('a tap inside the viewport centers the exact chosen spot on release', () => {
  const { surface, input, pans } = setup();
  event(surface, 'pointerdown', { clientX: 160, clientY: 320 });
  assert.deepEqual(xy(pans.at(-1)), { x: .5, y: .5 });
  event(surface, 'pointerup', { clientX: 160, clientY: 320 });
  assert.deepEqual(xy(pans.at(-1)), { x: .6, y: .6 });
  assert.equal(input.activePointerId, null);
});

test('dragging the viewport preserves grab offset and captures a nonprimary second thumb', () => {
  const { surface, input, pans } = setup();
  event(surface, 'pointerdown', { clientX: 160, clientY: 320 });
  assert.equal(input.activePointerId, 2); assert.ok(surface.hasPointerCapture(2));
  event(surface, 'pointermove', { clientX: 180, clientY: 350 });
  assert.ok(Math.abs(pans.at(-1).x - .7) < 1e-10);
  assert.ok(Math.abs(pans.at(-1).y - .65) < 1e-10);
  event(surface, 'pointerup', { clientX: 180, clientY: 350 });
  assert.equal(input.activePointerId, null); assert.equal(surface.hasPointerCapture(2), false);
});

test('other pointers cannot steal, move, cancel, or finish an owned camera drag', () => {
  const { surface, input, pans, ends } = setup();
  event(surface, 'pointerdown');
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'])
    event(surface, type, { pointerId: 3, clientX: 199, clientY: 399 });
  assert.equal(input.activePointerId, 2); assert.equal(pans.length, 1); assert.equal(ends.length, 0);
  event(surface, 'pointercancel');
  assert.equal(input.activePointerId, null); assert.equal(ends.at(-1).cancelled, true);
});

test('clicking outside the viewport moves immediately; dragging beyond the minimap clamps', () => {
  const { surface, input, pans } = setup();
  event(surface, 'pointerdown', { clientX: 110, clientY: 220 });
  assert.deepEqual(xy(pans.at(-1)), { x: .1, y: .1 });
  event(surface, 'pointermove', { clientX: 600, clientY: -100 });
  assert.deepEqual(xy(pans.at(-1)), { x: 1, y: 0 });
  event(surface, 'pointerup', { clientX: 600, clientY: -100 });
  assert.equal(input.activePointerId, null);
});

test('owned pointer and compatibility click do not leak into game controls', () => {
  const { surface, pans } = setup(); let underlyingActions = 0;
  surface.addEventListener('pointerdown', () => underlyingActions++);
  surface.addEventListener('click', () => underlyingActions++);
  assert.equal(event(surface, 'pointerdown').defaultPrevented, true);
  event(surface, 'pointerup'); const count = pans.length;
  event(surface, 'click'); event(surface, 'dblclick');
  assert.equal(underlyingActions, 0); assert.equal(pans.length, count);
});

test('mouse right-click is ignored and lost capture ends only the camera interaction', () => {
  const { surface, input, pans, ends } = setup();
  event(surface, 'pointerdown', { pointerType: 'mouse', button: 2 });
  assert.equal(input.activePointerId, null); assert.equal(pans.length, 0);
  event(surface, 'pointerdown', { pointerType: 'mouse' });
  event(surface, 'lostpointercapture', { pointerType: 'mouse' });
  assert.equal(input.activePointerId, null); assert.equal(ends.at(-1).cancelled, true);
});

test('arrow keys pan without moving the game player, and Enter restores following', () => {
  const { surface, pans, follows } = setup(); let gameKeys = 0;
  surface.addEventListener('keydown', () => gameKeys++);
  event(surface, 'keydown', { key: 'ArrowRight' });
  assert.deepEqual(xy(pans.at(-1)), { x: .55, y: .5 });
  event(surface, 'keydown', { key: 'ArrowUp', shiftKey: true });
  assert.deepEqual(xy(pans.at(-1)), { x: .5, y: .49 });
  event(surface, 'keydown', { key: 'Home' });
  assert.deepEqual(xy(pans.at(-1)), { x: .5, y: .5 });
  event(surface, 'keydown', { key: 'Enter' });
  event(surface, 'keydown', { key: 'Enter', repeat: true });
  assert.equal(follows.length, 1); assert.equal(gameKeys, 0);
});

test('window blur, hidden document, and disposal release capture without resuming follow', () => {
  const { surface, input, follows } = setup();
  event(surface, 'pointerdown'); surface.ownerDocument.defaultView.dispatchEvent(new Event('blur'));
  assert.equal(input.activePointerId, null);
  event(surface, 'pointerdown'); surface.ownerDocument.hidden = true;
  surface.ownerDocument.dispatchEvent(new Event('visibilitychange'));
  assert.equal(input.activePointerId, null); assert.equal(follows.length, 0);
  event(surface, 'pointerdown'); input.destroy();
  assert.equal(surface.capture.size, 0);
  event(surface, 'pointerdown'); assert.equal(input.activePointerId, null);
});

test('key releases still reach gameplay for keys held before focusing the minimap', () => {
  const { surface } = setup(); let releases = 0;
  surface.addEventListener('keyup', () => releases++);
  event(surface, 'keydown', { key: 'ArrowRight' });
  event(surface, 'keyup', { key: 'ArrowRight' });
  assert.equal(releases, 1);
});

test('actual sports input retains movement, sprint and shot ownership while the second thumb pans, releases or cancels', (t) => {
  const surface = new Surface(), doc = surface.ownerDocument, win = doc.defaultView;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.window = win; globalThis.document = doc;
  const controls = Object.fromEntries(['stick', 'knob', 'shoot', 'pass', 'lob', 'through', 'sprint', 'switcher'].map(name => {
    const control = new Surface(); control.style = {}; control.ownerDocument = doc;
    return [name, control];
  }));
  const actions = [], pans = []; let pauses = 0;
  const sports = new Input({ ...controls, settings: structuredClone(DEFAULT_SETTINGS),
    active: () => true, onAction: (...args) => actions.push(args), onPause: () => pauses++ });
  const map = bindMinimapInput(surface, {
    getViewRect: () => ({ x: .3, y: .3, width: .4, height: .4 }), onPan: p => pans.push(p),
  });
  t.after(() => {
    map.destroy(); sports.clear();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
  });
  // Model a gameplay listener below the map's capture handler using the real
  // command path: any leaked contact/click would produce an actual pass.
  surface.addEventListener('pointerdown', () => sports.command('pass'));
  surface.addEventListener('click', () => sports.command('pass'));
  // EventTarget has no DOM ancestor tree. Forward unconsumed keyboard events
  // to the real Input window listeners to exercise focus/keyboard coexistence.
  for (const type of ['keydown', 'keyup']) surface.addEventListener(type, e => {
    const bubbled = new Event(type, { cancelable: true });
    Object.assign(bubbled, { key: e.key, code: e.code, repeat: e.repeat });
    win.dispatchEvent(bubbled);
  });

  event(controls.stick, 'pointerdown', { pointerId: 1, isPrimary: true, clientX: 195, clientY: 300 });
  event(controls.sprint, 'pointerdown', { pointerId: 3 });
  event(controls.shoot, 'pointerdown', { pointerId: 4 });
  const movement = sports.vector(), chargedAt = sports.chargeStart, stickPose = controls.knob.style.transform;
  assert.ok(movement.x > .9 && movement.sprint);

  for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    event(surface, 'pointerdown', { pointerId: 2, isPrimary: false, clientX: 160, clientY: 320 });
    event(surface, 'pointermove', { pointerId: 2, isPrimary: false, clientX: 180, clientY: 350 });
    assert.equal(map.activePointerId, 2); assert.ok(surface.hasPointerCapture(2));
    event(surface, end, { pointerId: 2, clientX: 180, clientY: 350 });
    event(surface, 'click', { pointerId: 2, detail: 1 });
    // Late events carrying the camera pointer cannot release another control.
    for (const control of [controls.stick, controls.sprint, controls.shoot]) event(control, end, { pointerId: 2 });
    assert.equal(map.activePointerId, null); assert.equal(surface.hasPointerCapture(2), false);
    assert.equal(sports.pointer, 1); assert.ok(controls.stick.hasPointerCapture(1));
    assert.equal(sports.sprinting, true); assert.ok(controls.sprint.hasPointerCapture(3));
    assert.equal(sports.chargeSource, 'pointer:4'); assert.equal(sports.chargeStart, chargedAt);
    assert.ok(controls.shoot.hasPointerCapture(4));
    assert.deepEqual(sports.vector(), movement); assert.equal(controls.knob.style.transform, stickPose);
    assert.equal(actions.length, 0, `${end} must not shoot, pass, or reset an owned control`);
  }
  assert.ok(pans.some(p => p.phase === 'move'));

  event(surface, 'keydown', { key: 'ArrowRight', code: 'ArrowRight' });
  assert.equal(sports.keys.has('ArrowRight'), false, 'map arrow must not move the player');
  event(surface, 'keydown', { key: 'w', code: 'KeyW' });
  assert.equal(sports.keys.has('KeyW'), true, 'ordinary gameplay keys still work while the map has focus');
  event(surface, 'keyup', { key: 'w', code: 'KeyW' });
  assert.equal(sports.keys.has('KeyW'), false);
  event(surface, 'keydown', { key: 'p', code: 'KeyP' });
  assert.equal(pauses, 1); assert.deepEqual(sports.vector(), movement);

  event(controls.shoot, 'pointerup', { pointerId: 4 });
  event(controls.shoot, 'click', { pointerId: 4, detail: 1 });
  assert.equal(actions.length, 1); assert.equal(actions[0][0], 'shoot');
  assert.deepEqual(actions[0][1], movement); assert.equal(sports.chargeSource, null);
  event(controls.sprint, 'pointerup', { pointerId: 3 });
  assert.equal(sports.vector().sprint, false); assert.ok(sports.vector().x > .9);
  event(controls.stick, 'pointerup', { pointerId: 1 });
  assert.deepEqual(sports.vector(), { x: 0, y: 0, sprint: false });
});
