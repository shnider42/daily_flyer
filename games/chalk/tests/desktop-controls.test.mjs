import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createDefaultBindings, rebindControl, eventToken, actionsForToken, actionHeld } from '../public/control-bindings.mjs';

// Exercise the actual app listeners, not a second implementation of dispatch.
// The event surfaces model a multi-button mouse: pointerdown on the first press,
// mousedown/up for every transition, pointerup only after the last release.
const app = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
const start = app.indexOf("canvas.addEventListener('pointerdown', event => {", app.indexOf('function dispatchControl'));
const end = app.indexOf("window.addEventListener('keydown'", start);
assert.ok(start > 0 && end > start, 'the production desktop/touch listener block must be available');
const listeners = app.slice(start, end);
const confirmation = app.match(/^const orderConfirmButton = .*$/m)?.[0];
assert.ok(confirmation, 'use the app’s actual destination-confirmation rule');

class Surface {
  handlers = new Map();
  captured = null;
  addEventListener(type, handler) { this.handlers.set(type, [...this.handlers.get(type) || [], handler]); }
  setPointerCapture(id) { this.captured = id; }
  focus() {}
  emit(type, options = {}) {
    const event = { type, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100,
      prevented: false, preventDefault() { this.prevented = true; }, ...options };
    for (const handler of this.handlers.get(type) || []) handler(event);
    return event;
  }
}

function fixture(bindings = createDefaultBindings()) {
  const canvas = new Surface(), window = new Surface(), keys = new Set(), calls = [];
  const state = {
    canvas, window, keys, preferences: { keyBindings: bindings }, pointer: { x: 0, y: 0, valid: false, fire: false },
    desktopPointerId: null, mode: 'playing', paused: false, showMap: false, placingOrder: false,
    document: { querySelector: () => null }, game: { role: 'leader' },
    screenPoint: event => ({ x: event.clientX, y: event.clientY, inside: true }),
    renderer: { screenToWorld: (x, y) => ({ x, y }) },
    groundOrderTap: { begin: () => true, end: () => false, cancel() {} }, eventToken, actionsForToken,
    dispatchControl: action => calls.push(action),
    doOrder: (type, point) => { calls.push({ type, point }); state.placingOrder = false; },
  };
  state.canAct = () => !state.paused && !state.showMap && !state.placingOrder;
  state.held = action => actionHeld(action, keys, state.preferences.keyBindings);
  vm.runInNewContext(confirmation + '\n' + listeners, state);
  return { state, canvas, window, keys, calls };
}

test('middle mouse pings while fire is held and releasing fire does not await every mouse button', () => {
  const { canvas, window, keys, calls } = fixture();
  const firstPress = canvas.emit('pointerdown', { button: 0, buttons: 1 });
  assert.equal(firstPress.prevented, false, 'desktop pointerdown must allow compatibility mouse transitions');
  canvas.emit('mousedown', { button: 0, buttons: 1 });
  canvas.emit('mousedown', { button: 1, buttons: 5 });
  assert.deepEqual(calls, ['fire', 'ping']);
  assert.equal(keys.has('Mouse0'), true);
  window.emit('mouseup', { button: 0, buttons: 4 });
  assert.equal(keys.has('Mouse0'), false, 'fire releases before the final pointerup');
  assert.equal(calls.includes('moveOrder'), false);
});

test('lost pointer capture neutralizes held mouse actions without releasing keyboard movement', () => {
  const { canvas, keys, state } = fixture();
  keys.add('Mouse0'); keys.add('Mouse4'); keys.add('KeyW');
  canvas.emit('lostpointercapture');
  assert.deepEqual([...keys], ['KeyW']);
  assert.equal(state.pointer.fire, false);
  assert.equal(state.desktopPointerId, null);
});

test('ping rebound to left mouse stays separate from destination confirmation', () => {
  const bindings = rebindControl(createDefaultBindings(), 'ping', 0, 'Mouse0', { resolveConflict: true }).bindings;
  const { canvas, state, calls } = fixture(bindings);
  state.placingOrder = true;
  canvas.emit('mousedown', { button: 0 });
  assert.deepEqual(calls, ['ping']);
  assert.equal(state.placingOrder, true);
  canvas.emit('mousedown', { button: 2 });
  assert.equal(state.placingOrder, false);
  assert.equal(calls[1].type, 'move');
  assert.deepEqual({ ...calls[1].point }, { x: 100, y: 100 });
});

test('two mouse ping bindings leave a usable third destination-confirmation button', () => {
  let bindings = rebindControl(createDefaultBindings(), 'ping', 0, 'Mouse0', { resolveConflict: true }).bindings;
  bindings = rebindControl(bindings, 'ping', 1, 'Mouse2', { resolveConflict: true }).bindings;
  const { canvas, state, calls } = fixture(bindings);
  state.placingOrder = true;
  canvas.emit('mousedown', { button: 2 });
  assert.deepEqual(calls, ['ping']);
  assert.equal(state.placingOrder, true);
  canvas.emit('mousedown', { button: 1 });
  assert.equal(calls[1].type, 'move');
  assert.equal(state.placingOrder, false);
});

test('touch taps do not generate desktop fire or duplicate orders', () => {
  const { canvas, state, calls, keys } = fixture();
  const touch = canvas.emit('pointerdown', { pointerType: 'touch', pointerId: 8 });
  assert.equal(touch.prevented, true);
  assert.equal(state.pointer.valid, false);
  canvas.emit('mousedown', { sourceCapabilities: { firesTouchEvents: true } });
  assert.deepEqual(calls, []);
  assert.equal(keys.size, 0);
});
