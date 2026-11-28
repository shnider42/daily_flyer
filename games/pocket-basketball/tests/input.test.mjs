import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../public/input.js';
import { HoopsAudio } from '../public/audio.js';
import { normalizeTouchLayout, assignTouchAction } from '../public/touch-layout.js';

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

function setup({ context, onAction } = {}) {
  const win = globalThis.window = new Surface();
  const doc = globalThis.document = new Surface();
  doc.hidden = false;
  const nodes = Object.fromEntries(['stick','knob','shoot','pass','sprint','steal','block','switcher','screen']
    .map((name) => [name, new Surface()]));
  const actions = [];
  const state = { active: true, pauses: 0 };
  const input = new Controls({ ...nodes, context, onAction: (name, payload) => {
    actions.push({ name, payload }); onAction?.(name, payload);
  },
    onPause: () => state.pauses++, active: () => state.active });
  return { win, doc, ...nodes, input, actions, state };
}

// The app moves these existing semantic button nodes into the chosen face
// positions. Resolve the same node identities here; never recreate listeners.
function faceSurfaces(harness, layout) {
  return Object.fromEntries(Object.entries(normalizeTouchLayout(layout))
    .map(([letter, action]) => [letter, harness[action]]));
}

test('default X holds sprint while B charges and releases a shot on the actual Controls surfaces', () => {
  const h = setup(), face = faceSurfaces(h);
  assert.equal(face.X, h.sprint); assert.equal(face.B, h.shoot);
  face.X.emit('pointerdown', { pointerId: 11 });
  face.B.emit('pointerdown', { pointerId: 12 });
  assert.equal(h.input.read().sprint, true); assert.equal(h.input.charging, true);
  h.win.emit('pointerup', { pointerId: 12 });
  assert.deepEqual(h.actions.map(a => a.name), ['shoot']);
  assert.equal(h.input.charging, false); assert.equal(h.input.read().sprint, true);
  h.win.emit('pointerup', { pointerId: 11 });
  assert.equal(h.input.read().sprint, false);
});

test('swapped X shoot and B sprint retain their listeners and the held-steal possession safeguard', () => {
  let context = { offense: false, canShoot: false, token: 'defending', possessionEpoch: 1 };
  const h = setup({ context: () => context, onAction(name) {
    if (name === 'steal') context = { offense: true, canShoot: false, token: 'won', possessionEpoch: 2 };
  } });
  const face = faceSurfaces(h, assignTouchAction(undefined, 'X', 'shoot'));
  assert.equal(face.X, h.shoot); assert.equal(face.B, h.sprint);
  face.B.emit('pointerdown', { pointerId: 21 });
  face.X.emit('pointerdown', { pointerId: 22 });
  assert.deepEqual(h.actions.map(a => a.name), ['steal']);
  assert.equal(h.input.charging, false); assert.equal(h.input.read().sprint, true);
  context.canShoot = true; h.input.syncContext();
  h.win.emit('pointerup', { pointerId: 22 });
  assert.deepEqual(h.actions.map(a => a.name), ['steal'], 'the remapped held face must not become a shot');
  face.X.emit('pointerdown', { pointerId: 23 });
  assert.equal(h.input.charging, true);
  h.win.emit('pointerup', { pointerId: 23 });
  assert.deepEqual(h.actions.map(a => a.name), ['steal', 'shoot']);
  assert.equal(h.actions.at(-1).payload.possessionEpoch, 2);
  h.win.emit('pointerup', { pointerId: 21 });
  assert.equal(h.input.read().sprint, false);
});

test('changing layout in a menu cancels both old holds and requires fresh inputs at the new faces', () => {
  const h = setup(); let layout = normalizeTouchLayout(), face = faceSurfaces(h, layout);
  face.X.emit('pointerdown', { pointerId: 31 });
  face.B.emit('pointerdown', { pointerId: 32 });
  assert.equal(h.input.read().sprint, true); assert.equal(h.input.charging, true);

  h.state.active = false;
  h.input.clear();
  layout = assignTouchAction(layout, 'B', 'sprint');
  face = faceSurfaces(h, layout);
  assert.equal(face.B, h.sprint); assert.equal(face.X, h.shoot);
  h.state.active = true;
  h.win.emit('pointerup', { pointerId: 32 });
  h.win.emit('pointerup', { pointerId: 31 });
  h.shoot.emit('click', { detail: 1 });
  h.sprint.emit('click', { detail: 1 });
  assert.deepEqual(h.actions, [], 'old releases and compatibility clicks cannot shoot or swipe');
  assert.equal(h.input.charging, false); assert.equal(h.input.read().sprint, false);

  face.B.emit('pointerdown', { pointerId: 33 });
  face.X.emit('pointerdown', { pointerId: 34 });
  assert.equal(h.input.read().sprint, true); assert.equal(h.input.charging, true);
  h.win.emit('pointerup', { pointerId: 34 });
  assert.deepEqual(h.actions.map(a => a.name), ['shoot']);
  assert.equal(h.input.read().sprint, true);
  h.win.emit('pointerup', { pointerId: 33 });
  assert.equal(h.input.read().sprint, false);
});

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

test('the same pass key and touch surface switch on defense, with block kept separate', () => {
  let context = { offense: true, canShoot: true, token: 'offense', possessionEpoch: 2 };
  const { win, pass, block, screen, actions } = setup({ context: () => context });
  screen.emit('pointerdown', { pointerId: 9 });
  win.emit('keydown', { key: 'j' });
  win.emit('keyup', { key: 'j' });
  context = { offense: false, canShoot: false, token: 'defense', possessionEpoch: 3 };
  win.emit('keydown', { key: 'j' });
  win.emit('keyup', { key: 'j' });
  pass.emit('pointerdown', { pointerId: 1 });
  block.emit('pointerdown', { pointerId: 2 });
  screen.emit('pointerdown', { pointerId: 10 });
  win.emit('keydown', { key: 'r' });
  assert.deepEqual(actions.map(a => a.name), ['screen', 'pass', 'switch', 'switch', 'block', 'block', 'block']);
  assert.equal(actions[1].payload.possessionEpoch, 2);
  assert.equal(actions[2].payload.possessionEpoch, 3);
});

test('a touch steal acts on press and its held thumb cannot shoot after winning the ball', () => {
  let context = { offense: false, canShoot: false, token: 'defense', possessionEpoch: 1 };
  const { win, stick, sprint, shoot, input, actions } = setup({ context: () => context,
    onAction(name) {
      if (name === 'steal') context = { offense: true, canShoot: false, token: 'won', possessionEpoch: 2 };
    }
  });
  stick.emit('pointerdown', { pointerId: 1, clientX: 115, clientY: 60 });
  sprint.emit('pointerdown', { pointerId: 2 });
  shoot.emit('pointerdown', { pointerId: 3 });
  assert.deepEqual(actions.map(a => a.name), ['steal']);
  assert.equal(input.charging, false);
  context.canShoot = true; // The settling period expires while the thumb remains down.
  input.syncContext();
  assert.equal(input.charging, false);
  win.emit('pointerup', { pointerId: 3 });
  assert.deepEqual(actions.map(a => a.name), ['steal']);
  assert.equal(input.read().x, 1);
  assert.equal(input.read().sprint, true);
  shoot.emit('pointerdown', { pointerId: 4 });
  assert.equal(input.charging, true);
  win.emit('pointerup', { pointerId: 4 });
  assert.deepEqual(actions.map(a => a.name), ['steal', 'shoot']);
});

test('held Space and keyboard repeat cannot turn a steal into a shot', () => {
  let context = { offense: false, canShoot: false, token: 'defense', possessionEpoch: 1 };
  const { win, input, actions } = setup({ context: () => context });
  win.emit('keydown', { key: ' ', code: 'Space' });
  assert.deepEqual(actions.map(a => a.name), ['steal']);
  context = { offense: true, canShoot: true, token: 'won', possessionEpoch: 2 };
  input.syncContext();
  win.emit('keydown', { key: ' ', code: 'Space', repeat: true });
  win.emit('keydown', { key: ' ', code: 'Space', repeat: false });
  win.emit('keyup', { key: ' ', code: 'Space' });
  assert.deepEqual(actions.map(a => a.name), ['steal']);
  win.emit('keydown', { key: ' ', code: 'Space' });
  win.emit('keyup', { key: ' ', code: 'Space' });
  assert.deepEqual(actions.map(a => a.name), ['steal', 'shoot']);
});

test('a press during the shooting guard is discarded, never queued for its expiry', () => {
  const context = { offense: true, canShoot: false, token: 'won', possessionEpoch: 4 };
  const { win, shoot, input, actions } = setup({ context: () => context });
  shoot.emit('pointerdown', { pointerId: 1 });
  assert.equal(input.charging, false);
  context.canShoot = true;
  input.syncContext();
  win.emit('pointerup', { pointerId: 1 });
  assert.deepEqual(actions, []);
  shoot.emit('pointerdown', { pointerId: 2 });
  win.emit('pointerup', { pointerId: 2 });
  assert.deepEqual(actions.map(a => a.name), ['shoot']);
});

test('losing and regaining possession invalidates an old shot even with the same player', () => {
  let context = { offense: true, canShoot: true, token: '1/player0', possessionEpoch: 1 };
  const { win, shoot, input, actions } = setup({ context: () => context });
  shoot.emit('pointerdown', { pointerId: 1 });
  assert.equal(input.charging, true);
  // Both turnovers can happen before the next input read; the epoch preserves them.
  context = { offense: true, canShoot: true, token: '3/player0', possessionEpoch: 3 };
  win.emit('pointerup', { pointerId: 1 });
  assert.equal(input.charging, false);
  assert.deepEqual(actions, []);
});

test('changing controlled players cancels the held shot without clearing movement', () => {
  let context = { offense: true, canShoot: true, token: 'player0' };
  const { win, input, actions } = setup({ context: () => context });
  win.emit('keydown', { key: 'w' });
  win.emit('keydown', { key: 'Shift' });
  win.emit('keydown', { key: ' ', code: 'Space' });
  context = { offense: true, canShoot: true, token: 'player1' };
  input.syncContext();
  win.emit('keyup', { key: ' ', code: 'Space' });
  assert.deepEqual(actions, []);
  assert.equal(input.read().y, -1);
  assert.equal(input.read().sprint, true);
});

test('assistive clicks follow possession and respect the shot guard', () => {
  let context = { offense: false, canShoot: false, token: 'defense' };
  const { pass, shoot, actions } = setup({ context: () => context });
  pass.emit('click', { detail: 0 });
  shoot.emit('click', { detail: 0 });
  context = { offense: true, canShoot: false, token: 'won' };
  shoot.emit('click', { detail: 0 });
  context.canShoot = true;
  shoot.emit('click', { detail: 0 });
  assert.deepEqual(actions.map(a => a.name), ['switch', 'steal', 'shoot']);
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
