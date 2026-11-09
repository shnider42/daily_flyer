import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../dist/input.mjs';

// These fixtures exercise the actual registered input handlers without a browser
// dependency. Each pointer owns its capture independently, as on the touch HUD.
class Classes {
  values = new Set();
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force = !this.values.has(name)) {
    if (force) this.values.add(name); else this.values.delete(name);
    return force;
  }
}

class Surface {
  handlers = new Map();
  captures = new Set();
  attributes = new Map();
  classList = new Classes();
  style = { setProperty(name, value) { this[name] = value; } };
  constructor(button = false) { this.button = button; }
  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.handlers.get(type)?.delete(handler); }
  emit(type, properties = {}) {
    const event = {
      type, target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      ...properties,
    };
    for (const handler of [...(this.handlers.get(type) || [])]) handler(event);
    // Pointer capture is implicitly released by the browser when a touch ends.
    if (['pointerup', 'pointercancel', 'lostpointercapture'].includes(type)) this.captures.delete(event.pointerId);
    return event;
  }
  closest(selector) { return this.button && selector === 'button' ? this : null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
}

function fixture(t, { coarse = true, controls = 'auto' } = {}) {
  const original = new Map(['window', 'document', 'matchMedia'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const win = new Surface(), doc = new Surface(), media = new Surface();
  doc.body = new Surface(); doc.documentElement = new Surface();
  doc.hidden = false; doc.pointerLockElement = null; media.matches = coarse;
  doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.emit('pointerlockchange'); };
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: win },
    document: { configurable: true, value: doc },
    matchMedia: { configurable: true, value: () => media },
  });
  const canvas = new Surface(), moveZone = new Surface(), lookZone = new Surface();
  const buttons = Object.fromEntries(['run', 'crouch', 'jump', 'use', 'tool', 'flashlight'].map(name => [name, new Surface(true)]));
  const pauses = [], actions = [];
  let input;
  input = new Input({
    canvas, moveZone, lookZone, stick: new Surface(), stickKnob: new Surface(), buttons,
    settings: { controls },
    onAction: action => actions.push(action),
    onPause: reason => { pauses.push(reason); input.setEnabled(false); },
  });
  input.setEnabled(true);
  t.after(() => {
    input.destroy();
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const pointer = (id, x = 80, y = 170) => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y });
  const holdControls = () => {
    moveZone.emit('pointerdown', pointer(1));
    moveZone.emit('pointermove', pointer(1, 98, 135));
    lookZone.emit('pointerdown', pointer(2, 240, 180));
    lookZone.emit('pointermove', pointer(2, 262, 171));
    buttons.run.emit('pointerdown', pointer(3));
    buttons.run.emit('pointerup', pointer(3));
    buttons.use.emit('pointerdown', pointer(4));
  };
  return { win, doc, canvas, moveZone, lookZone, buttons, pauses, actions, input, pointer, holdControls };
}

function assertCleared(rig) {
  const { input, canvas, moveZone, lookZone, buttons } = rig;
  assert.equal(input.movePointer, null);
  assert.equal(input.lookPointer, null);
  assert.equal(input.buttonPointers.size, 0);
  assert.equal(input.keys.size, 0);
  assert.deepEqual(input.touchMove, { x: 0, z: 0 });
  assert.deepEqual(input.look, { x: 0, y: 0 });
  assert.equal(input.runToggle, false);
  assert.equal(input.jumpPending, false);
  for (const target of [canvas, moveZone, lookZone, ...Object.values(buttons)]) assert.equal(target.captures.size, 0);
}

for (const options of [{ coarse: true, controls: 'auto' }, { coarse: false, controls: 'touch' }]) {
  test(`foreground blur preserves mobile movement, look, action and RUN (${options.controls})`, t => {
    const rig = fixture(t, options);
    rig.holdControls();
    const before = { move: { ...rig.input.touchMove }, look: { ...rig.input.look } };
    for (let i = 0; i < 8; i++) rig.win.emit('blur');
    assert.deepEqual(rig.pauses, [], 'Foreground focus changes are not a request to pause touch play');
    assert.equal(rig.input.enabled, true);
    assert.equal(rig.input.movePointer.id, 1);
    assert.equal(rig.input.lookPointer.id, 2);
    assert.equal(rig.input.buttonPointers.get(4).action, 'use');
    assert.deepEqual(rig.input.touchMove, before.move);
    assert.deepEqual(rig.input.look, before.look);
    assert.equal(rig.input.runToggle, true);
    assert.equal(rig.moveZone.hasPointerCapture(1), true);
    assert.equal(rig.lookZone.hasPointerCapture(2), true);
    assert.equal(rig.buttons.use.hasPointerCapture(4), true);
  });
}

test('hiding the mobile page pauses once and clears every held input', t => {
  const rig = fixture(t);
  rig.holdControls();
  rig.doc.hidden = true;
  rig.doc.emit('visibilitychange');
  rig.win.emit('blur');
  rig.win.emit('pagehide');
  assert.deepEqual(rig.pauses, ['visibility']);
  assert.equal(rig.input.enabled, false);
  assertCleared(rig);
});

test('pagehide pauses mobile play even before visibilitychange arrives', t => {
  const rig = fixture(t);
  rig.holdControls();
  rig.win.emit('pagehide');
  assert.equal(rig.pauses.length, 1, 'Page lifecycle exit must pause without relying on a later visibility event');
  assert.equal(rig.input.enabled, false);
  assertCleared(rig);
  rig.doc.hidden = true;
  rig.doc.emit('visibilitychange');
  rig.win.emit('blur');
  assert.equal(rig.pauses.length, 1);
  assert.equal(rig.input.enabled, false);
  assertCleared(rig);
});

test('blur still pauses a touch game when the document is already hidden', t => {
  const rig = fixture(t);
  rig.holdControls();
  rig.doc.hidden = true;
  rig.win.emit('blur');
  assert.equal(rig.pauses.length, 1);
  assert.equal(rig.input.enabled, false);
  assertCleared(rig);
});

test('desktop blur pauses and clears held movement keys', t => {
  const rig = fixture(t, { coarse: false });
  rig.win.emit('keydown', { code: 'KeyW' });
  rig.win.emit('keydown', { code: 'ShiftLeft' });
  assert.equal(rig.input.sample().moveZ, 1);
  rig.win.emit('blur');
  assert.deepEqual(rig.pauses, ['blur']);
  assert.equal(rig.input.enabled, false);
  assertCleared(rig);
});

test('a stray pointer lock notification does not pause touch play', t => {
  const rig = fixture(t);
  rig.holdControls();
  rig.doc.emit('pointerlockchange');
  rig.doc.emit('pointerlockerror');
  assert.deepEqual(rig.pauses, []);
  assert.equal(rig.input.movePointer.id, 1);
  assert.equal(rig.input.lookPointer.id, 2);
});

for (const controls of ['desktop', 'touch']) {
  test(`losing an actually acquired pointer lock pauses ${controls} layout once`, t => {
    const rig = fixture(t, { coarse: false, controls });
    rig.doc.pointerLockElement = rig.canvas;
    rig.doc.emit('pointerlockchange');
    assert.deepEqual(rig.pauses, []);
    rig.doc.pointerLockElement = null;
    rig.doc.emit('pointerlockchange');
    rig.doc.emit('pointerlockchange');
    assert.deepEqual(rig.pauses, ['pointerlock']);
    assert.equal(rig.input.enabled, false);
    assertCleared(rig);
  });
}

test('foreground blur still pauses when touch layout has a real mouse lock', t => {
  const rig = fixture(t);
  rig.doc.pointerLockElement = rig.canvas;
  rig.doc.emit('pointerlockchange');
  rig.win.emit('blur');
  assert.deepEqual(rig.pauses, ['blur']);
  assert.equal(rig.doc.pointerLockElement, null);
  assertCleared(rig);
});

test('Escape pauses touch play, and resume cannot enter a foreground-blur pause loop', t => {
  const rig = fixture(t);
  rig.holdControls();
  const escape = rig.win.emit('keydown', { code: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.deepEqual(rig.pauses, ['escape']);
  assertCleared(rig);
  rig.input.setEnabled(true);
  rig.holdControls();
  for (let i = 0; i < 8; i++) rig.win.emit('blur');
  assert.deepEqual(rig.pauses, ['escape']);
  assert.equal(rig.input.enabled, true);
  assert.equal(rig.input.movePointer.id, 1);
  assert.equal(rig.input.lookPointer.id, 2);
  assert.equal(rig.input.runToggle, true);
});

test('cancelling look or releasing an action leaves the movement thumb active', t => {
  const rig = fixture(t);
  rig.holdControls();
  const move = { ...rig.input.touchMove };
  rig.lookZone.emit('pointercancel', rig.pointer(2));
  rig.buttons.use.emit('pointerup', rig.pointer(4));
  assert.equal(rig.input.lookPointer, null);
  assert.equal(rig.input.buttonPointers.size, 0);
  assert.equal(rig.input.movePointer.id, 1);
  assert.deepEqual(rig.input.touchMove, move);
  assert.equal(rig.input.runToggle, true);
  assert.deepEqual(rig.pauses, []);
});
