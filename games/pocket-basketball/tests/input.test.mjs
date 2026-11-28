import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../public/input.js';
import { HoopsAudio } from '../public/audio.js';

class Surface {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.captured = new Set();
    this.style = {};
    this.classList = { add() {}, remove() {} };
  }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  closest() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 120 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  emit(type, values = {}) {
    const event = { type, target: this, cancelable: true, detail: 1, pointerType: 'touch',
      button: 0, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const handler of this.listeners.get(type) || []) handler(event);
    return event;
  }
}

function setup() {
  const win = globalThis.window = new Surface();
  const doc = globalThis.document = new Surface();
  doc.hidden = false;
  const nodes = Object.fromEntries(['stick','knob','shoot','pass','sprint','steal','switcher','screen']
    .map((name) => [name, new Surface()]));
  const actions = [];
  const state = { active: true, pauses: 0 };
  const input = new Controls({ ...nodes, onAction: (name, payload) => actions.push({ name, payload }),
    onPause: () => state.pauses++, active: () => state.active });
  return { win, doc, ...nodes, input, actions, state };
}

test('shooting thumb releases without stopping movement held by the other thumb', () => {
  const { win, stick, shoot, input, actions } = setup();
  stick.emit('pointerdown', { pointerId: 11, clientX: 110, clientY: 60 });
  shoot.emit('pointerdown', { pointerId: 12 });
  assert.equal(input.charging, true);
  win.emit('pointerup', { pointerId: 12 });
  assert.equal(actions.filter((event) => event.name === 'shoot').length, 1);
  assert.equal(input.charging, false);
  assert.equal(input.read().x, 1);
  win.emit('pointerup', { pointerId: 11 });
  assert.equal(input.read().x, 0);
});

test('releasing movement or a third-finger pass does not release the held shot', () => {
  const { win, stick, shoot, pass, input, actions } = setup();
  stick.emit('pointerdown', { pointerId: 1, clientX: 60, clientY: 100 });
  shoot.emit('pointerdown', { pointerId: 2 });
  pass.emit('pointerdown', { pointerId: 3 });
  win.emit('pointerup', { pointerId: 3 });
  win.emit('pointerup', { pointerId: 1 });
  assert.equal(input.charging, true);
  assert.deepEqual(actions.map((event) => event.name), ['pass']);
  win.emit('pointerup', { pointerId: 2 });
  assert.deepEqual(actions.map((event) => event.name), ['pass', 'shoot']);
});

test('pointer cancellation, blur and hidden tabs cancel shots without firing', () => {
  const { win, doc, shoot, input, actions } = setup();
  shoot.emit('pointerdown', { pointerId: 2 });
  win.emit('pointercancel', { pointerId: 2 });
  win.emit('keydown', { key: ' ', code: 'Space' });
  win.emit('blur');
  win.emit('keyup', { key: ' ', code: 'Space' });
  shoot.emit('pointerdown', { pointerId: 3 });
  doc.hidden = true;
  doc.emit('visibilitychange');
  win.emit('pointerup', { pointerId: 3 });
  assert.equal(input.charging, false);
  assert.deepEqual(actions, []);
});

test('screen coordinates use positive down and diagonal movement is normalized', () => {
  const { win, input, stick } = setup();
  win.emit('keydown', { key: 'ArrowDown' });
  assert.equal(input.read().y, 1);
  win.emit('keydown', { key: 'd' });
  assert.ok(Math.abs(Math.hypot(input.read().x, input.read().y) - 1) < 1e-9);
  input.clear();
  stick.emit('pointerdown', { pointerId: 1, clientX: 60, clientY: 115 });
  assert.equal(input.read().y, 1);
});

test('opening a menu clears movement, sprint and charging without releasing a shot', () => {
  const { win, sprint, shoot, input, actions, state } = setup();
  win.emit('keydown', { key: 'w' });
  sprint.emit('pointerdown', { pointerId: 2 });
  shoot.emit('pointerdown', { pointerId: 3 });
  state.active = false;
  assert.deepEqual(input.read(), { x: 0, y: 0, sprint: false, contain: false });
  state.active = true;
  win.emit('pointerup', { pointerId: 3 });
  assert.equal(input.charging, false);
  assert.equal(input.read().sprint, false);
  assert.deepEqual(actions, []);
});

test('cancelShot preserves joystick and sprint while preventing a later release from firing', () => {
  const { win, stick, sprint, shoot, input, actions } = setup();
  stick.emit('pointerdown', { pointerId: 1, clientX: 115, clientY: 60 });
  sprint.emit('pointerdown', { pointerId: 2 });
  shoot.emit('pointerdown', { pointerId: 3 });
  assert.equal(input.charging, true);
  input.cancelShot();
  assert.equal(input.charging, false);
  assert.equal(input.read().x, 1);
  assert.equal(input.read().sprint, true);
  win.emit('pointerup', { pointerId: 3 });
  assert.equal(input.read().x, 1);
  assert.equal(input.read().sprint, true);
  assert.deepEqual(actions, []);
});

test('game buttons ignore compatibility clicks but retain assistive clicks', () => {
  const { pass, shoot, win, actions } = setup();
  pass.emit('pointerdown', { pointerId: 1 });
  pass.emit('click', { detail: 1 });
  pass.emit('click', { detail: 0 });
  shoot.emit('pointerdown', { pointerId: 2 });
  win.emit('pointerup', { pointerId: 2 });
  shoot.emit('click', { detail: 1 });
  shoot.emit('click', { detail: 0 });
  assert.deepEqual(actions.map((event) => event.name), ['pass','pass','shoot','shoot']);
  assert.equal(actions.at(-1).payload.timing, 0.65);
});

test('keyboard mappings act once and holding sprint is independent of movement', () => {
  const { win, input, actions, state } = setup();
  for (const key of ['j','e','q','Tab','l','t','1','4']) win.emit('keydown', { key });
  win.emit('keydown', { key: 'j', repeat: true });
  assert.deepEqual(actions.map((event) => event.name), ['pass','steal','switch','switch','screen','timeout','play','play']);
  assert.deepEqual(actions.slice(-2).map((event) => event.payload.index), [0, 3]);
  win.emit('keydown', { key: 'Shift' });
  win.emit('keydown', { key: 'a' });
  assert.equal(input.read().sprint, true);
  win.emit('keyup', { key: 'a' });
  assert.equal(input.read().sprint, true);
  win.emit('keydown', { key: 'Escape' });
  assert.equal(state.pauses, 1);
  assert.equal(input.read().sprint, false);
});

test('audio defaults muted and visibility restoration alone cannot create an AudioContext', () => {
  const { doc } = setup();
  let contexts = 0;
  const previousAudio = globalThis.AudioContext;
  globalThis.AudioContext = class { constructor() { contexts++; } };
  try {
    const audio = new HoopsAudio();
    assert.equal(audio.enabled, false);
    audio.update(1, { phase: 'live', ball: { owner: 1 } });
    audio.event('net');
    audio.setEnabled(true);
    doc.hidden = true;
    doc.emit('visibilitychange');
    doc.hidden = false;
    doc.emit('visibilitychange');
    assert.equal(contexts, 0);
  } finally { globalThis.AudioContext = previousAudio; }
});

test('dribble audio accepts player id zero and stays silent for a loose ball', () => {
  const { doc } = setup();
  const audio = new HoopsAudio();
  const events = [];
  audio.enabled = true;
  audio.ctx = { state: 'running' };
  audio.event = (name) => events.push(name);
  audio._noise = () => {};
  audio.update(0.016, { phase: 'live', ball: { owner: 0 } });
  assert.ok(events.includes('dribble'));
  events.length = 0;
  audio._dribbleTimer = 0;
  audio.update(0.016, { phase: 'live', ball: { owner: null }, carrier() { return null; } });
  assert.ok(!events.includes('dribble'));
  doc.hidden = true;
  audio.update(0.016, { phase: 'live', ball: { owner: 0 } });
  assert.ok(!events.includes('dribble'));
});
