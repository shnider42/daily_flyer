import test from 'node:test';
import assert from 'node:assert/strict';
import { FirstPersonControls } from '../public/controls.js';

const near = (actual, expected, tolerance = 1e-10) => assert(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

function harness(t, {lookPad = true, padded = false, pointerLock = 'unsupported', pauseDisables = true} = {}) {
  const originals = new Map(['window', 'document', 'performance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let clock = 100;
  class Node {
    constructor(id, rect = {}, ownerWindow = null) {
      this.id = id; this.rect = {left:0, top:0, width:0, height:0, ...rect}; this.ownerWindow = ownerWindow;
      this.listeners = new Map(); this.style = {touchAction:'', transform:''}; this.dataset = {};
      this.captures = new Set(); this.captureRequests = []; this.releases = []; this.throwCapture = false;
    }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    get listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
    getBoundingClientRect() { return {...this.rect, right:this.rect.left + this.rect.width, bottom:this.rect.top + this.rect.height}; }
    querySelector(selector) { return selector === '.joystick-ring' ? this.ring : null; }
    setPointerCapture(id) { if (this.throwCapture) throw new Error('Capture unavailable'); this.captures.add(id); this.captureRequests.push(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) {
      if (!this.captures.delete(id)) return;
      this.releases.push(id);
      // Browsers may dispatch this while releasePointerCapture is still on the stack.
      this.emit('lostpointercapture', {pointerId:id});
    }
    dispatch(e) { e.currentTarget = this; for (const fn of [...(this.listeners.get(e.type) || [])]) fn(e); }
    emit(type, details = {}) {
      const e = {type, target:this, currentTarget:this, defaultPrevented:false, cancelBubble:false,
        button:0, buttons:1, pointerType:'touch', clientX:0, clientY:0,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; }, ...details};
      this.dispatch(e);
      if (this.ownerWindow && !e.cancelBubble && (type.startsWith('pointer') || type === 'lostpointercapture')) this.ownerWindow.dispatch(e);
      return e;
    }
  }
  const win = new Node('window'), doc = new Node('document'); doc.hidden = false; doc.pointerLockElement = null;
  const canvas = new Node('world', {width:428, height:926}, win);
  canvas.ownerDocument = doc;
  const lock = {requests:0, exits:0, pending:[], mode:pointerLock, grantOnRequest:false, deferExit:false};
  lock.grant = () => {
    const request = lock.pending.shift();
    doc.pointerLockElement = canvas; doc.emit('pointerlockchange'); request?.resolve?.();
  };
  lock.deny = ({event = true, promise = true} = {}) => {
    const request = lock.pending.shift();
    if (event) doc.emit('pointerlockerror');
    if (promise) request?.reject?.(new Error('Pointer lock denied'));
  };
  lock.browserRelease = () => { doc.pointerLockElement = null; doc.emit('pointerlockchange'); };
  if (pointerLock !== 'unsupported') {
    canvas.requestPointerLock = () => {
      lock.requests++;
      if (lock.mode === 'throw') throw new Error('Capture unavailable');
      const request = {};
      if (lock.mode === 'promise') request.promise = new Promise((resolve, reject) => Object.assign(request, {resolve, reject}));
      lock.pending.push(request);
      if (lock.grantOnRequest) lock.grant();
      return request.promise;
    };
    doc.exitPointerLock = () => { lock.exits++; if (!lock.deferExit) lock.browserRelease(); };
  }
  const ring = new Node('ring', {left:24, top:690, width:96, height:96}, win);
  const joystick = new Node('touch-move', padded ? {left:8, top:674, width:128, height:128} : {...ring.rect}, win); joystick.ring = ring;
  const knob = new Node('joystick-knob', {left:56, top:722, width:32, height:32}, win);
  const right = new Node('touch-look', {left:280, top:690, width:112, height:112}, win);
  const events = {looks:[], moves:[], taps:[], crouches:[], interactions:0, pauses:0, mouseLook:[], shortcuts:[]};
  for (const [key, value] of [['window', win], ['document', doc], ['performance', {now:()=>clock}]]) Object.defineProperty(globalThis, key, {configurable:true, writable:true, value});
  let control;
  control = new FirstPersonControls({canvas, joystick, knob, lookPad:lookPad ? right : null,
    onLook:e=>events.looks.push(e), onMove:e=>events.moves.push(e), onTap:(x,y)=>events.taps.push({x,y}),
    onCrouch:value=>events.crouches.push(value), onInteract:()=>events.interactions++,
    onMouseLook:status=>events.mouseLook.push(status), onShortcut:action=>events.shortcuts.push(action),
    onPause:()=>{events.pauses++; if (pauseDisables) control.setEnabled(false);}});
  control.setPose({x:0, z:0, yaw:0, pitch:0, crouch:false}); control.setEnabled(true);
  t.after(() => {
    control.dispose();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  const pointer = (node, type, id, x, y, extras = {}) => node.emit(type, {pointerId:id, clientX:x, clientY:y, buttons:['pointerup','pointercancel'].includes(type) ? 0 : 1, ...extras});
  return {control, win, doc, canvas, joystick, ring, knob, right, events, pointer, lock,
    advance:ms=>{clock += ms;}, center:()=>({x:ring.rect.left + ring.rect.width / 2, y:ring.rect.top + ring.rect.height / 2})};
}

test('the LOOK pad starts without a jump, drags at the existing sensitivity, and never inspects', t => {
  const h = harness(t), c = h.control;
  c.setPose({x:0, z:0, yaw:.4, pitch:-.2});
  h.pointer(h.right, 'pointerdown', 11, 330, 730, {isPrimary:false});
  near(c.pose.yaw, .4); near(c.pose.pitch, -.2); assert(h.right.captures.has(11));
  assert.equal(h.right.dataset.active, 'true');
  h.pointer(h.right, 'pointermove', 11, 350, 720);
  near(c.pose.yaw, .33); near(c.pose.pitch, -.17);
  assert.equal(h.events.looks.length, 1); assert.equal(h.events.looks[0].source, 'look-pad');
  h.pointer(h.right, 'pointerup', 11, 350, 720);
  assert.equal(c.drag, null); assert.equal(h.right.captures.size, 0); assert.equal(h.right.dataset.active, 'false');
  h.pointer(h.right, 'pointerdown', 12, 330, 730); h.pointer(h.right, 'pointerup', 12, 330, 730);
  assert.deepEqual(h.events.taps, []);
});

test('two thumbs can move and look together; extra fingers cannot steal either gesture', t => {
  const h = harness(t), c = h.control, center = h.center();
  h.pointer(h.joystick, 'pointerdown', 1, center.x, center.y);
  h.pointer(h.joystick, 'pointermove', 1, center.x, center.y - 30);
  h.pointer(h.right, 'pointerdown', 2, 320, 730, {isPrimary:false});
  h.pointer(h.right, 'pointermove', 2, 344, 730);
  const yaw = c.pose.yaw;
  h.pointer(h.joystick, 'pointerdown', 3, center.x + 30, center.y);
  h.pointer(h.canvas, 'pointerdown', 4, 20, 20);
  h.pointer(h.canvas, 'pointermove', 4, 400, 20);
  assert.equal(c.stickId, 1); assert.equal(c.drag.id, 2); near(c.pose.yaw, yaw);
  assert(!h.joystick.captures.has(3)); assert(!h.canvas.captures.has(4));
  assert.equal(c.update(.05, () => true), true); near(c.lastDistance, .1225);
  h.pointer(h.right, 'pointercancel', 2, 344, 730);
  assert.equal(c.drag, null); assert.equal(c.stickId, 1); assert.equal(c.update(.05, () => true), true);
  h.pointer(h.right, 'pointermove', 2, 10, 10); near(c.pose.yaw, yaw);
  h.joystick.emit('lostpointercapture', {pointerId:99}); assert.equal(c.stickId, 1);
  h.pointer(h.joystick, 'pointerup', 1, center.x, center.y - 30);
  assert.equal(c.update(.05, () => true), false); assert.equal(c.lastDistance, 0);
});

test('the fixed stick has a quiet center and proportional speed instead of tiny-input full speed', t => {
  const h = harness(t), c = h.control, p = h.center();
  h.pointer(h.joystick, 'pointerdown', 1, p.x, p.y);
  h.pointer(h.joystick, 'pointermove', 1, p.x + 2, p.y - 1);
  assert.deepEqual(c.stick, {x:0, y:0}); assert.equal(c.update(.05, () => true), false);
  assert.equal(h.events.moves.length, 0);
  h.pointer(h.joystick, 'pointermove', 1, p.x, p.y - 4);
  assert.equal(c.update(.05, () => true), true); const small = c.lastDistance;
  h.pointer(h.joystick, 'pointermove', 1, p.x, p.y - 15);
  c.update(.05, () => true); const half = c.lastDistance;
  h.pointer(h.joystick, 'pointermove', 1, p.x, p.y - 300);
  c.update(.05, () => true); const full = c.lastDistance;
  assert(small > 0 && small < half / 8); assert(half > full / 5 && half < full / 2); near(full, .1225);
  h.pointer(h.joystick, 'pointermove', 1, p.x + 30, p.y - 30);
  c.update(.05, () => true); near(c.lastDistance, full);
  assert.equal(h.events.moves.at(-1).source, 'joystick');
});

test('a padded hit region retains the visible ring center and adapts to 84–132px controls', t => {
  const h = harness(t, {padded:true}), c = h.control;
  for (const [size, knobSize] of [[84,28], [96,32], [132,40]]) {
    c.setEnabled(false); h.ring.rect.width = h.ring.rect.height = size; h.knob.rect.width = h.knob.rect.height = knobSize; c.setEnabled(true);
    const p = h.center(), radius = (size - knobSize) / 2 - 2;
    h.pointer(h.joystick, 'pointerdown', size, p.x, p.y);
    assert.deepEqual(c.stick, {x:0, y:0});
    h.pointer(h.joystick, 'pointermove', size, p.x, p.y - radius);
    c.update(.05, () => true); near(c.lastDistance, .1225);
    const translate = h.knob.style.transform.match(/translate\(([^,]+)px,([^p]+)px\)/);
    assert(translate); near(Math.hypot(Number(translate[1]), Number(translate[2])), radius);
    h.pointer(h.joystick, 'pointerup', size, p.x, p.y - radius);
  }
  assert.equal(h.knob.style.transform, '');
});

test('capture loss clears only its owner and a fresh look gesture uses a fresh origin', t => {
  const h = harness(t), c = h.control, p = h.center();
  h.pointer(h.joystick, 'pointerdown', 1, p.x, p.y - 30);
  h.pointer(h.right, 'pointerdown', 2, 320, 730); h.pointer(h.right, 'pointermove', 2, 340, 725);
  const yaw = c.pose.yaw, pitch = c.pose.pitch;
  h.canvas.emit('lostpointercapture', {pointerId:2}); assert.equal(c.drag.id, 2);
  h.right.emit('lostpointercapture', {pointerId:2});
  assert.equal(c.drag, null); assert.equal(c.stickId, 1); assert.equal(c.update(.05, () => true), true);
  h.pointer(h.right, 'pointermove', 2, 100, 100); near(c.pose.yaw, yaw); near(c.pose.pitch, pitch);
  h.pointer(h.right, 'pointerdown', 3, 390, 800);
  near(c.pose.yaw, yaw); near(c.pose.pitch, pitch);
  h.pointer(h.right, 'pointermove', 3, 393, 800); near(c.pose.yaw, yaw - .0105);
  h.joystick.emit('lostpointercapture', {pointerId:1}); assert.equal(c.stickId, null); assert.equal(c.drag.id, 3);
  assert.equal(c.update(.05, () => true), false); assert.deepEqual(h.events.taps, []);
});

test('capture failure still tracks and ends outside the original pad through window events', t => {
  const h = harness(t), c = h.control, p = h.center();
  h.right.throwCapture = h.joystick.throwCapture = true;
  h.pointer(h.right, 'pointerdown', 2, 330, 730);
  h.pointer(h.win, 'pointermove', 2, 350, 710); near(c.pose.yaw, -.07); near(c.pose.pitch, .06);
  h.pointer(h.joystick, 'pointerdown', 1, p.x, p.y);
  h.pointer(h.win, 'pointermove', 1, p.x, p.y - 30);
  assert.equal(c.update(.05, () => true), true);
  h.pointer(h.win, 'pointerup', 1, 200, 200); assert.equal(c.stickId, null); assert.equal(c.drag.id, 2);
  h.pointer(h.win, 'pointerup', 2, 350, 710); assert.equal(c.drag, null); assert.deepEqual(h.events.taps, []);
});

test('a dialog reset releases both captures and blocks stale pointer or keyboard movement', t => {
  const h = harness(t), c = h.control, p = h.center();
  h.win.emit('keydown', {key:'w'});
  h.pointer(h.joystick, 'pointerdown', 1, p.x, p.y - 15);
  h.pointer(h.right, 'pointerdown', 2, 320, 730);
  c.update(.05, () => true); assert(c.lastDistance > 0);
  c.setEnabled(false); const pose = {...c.pose};
  assert.equal(c.keys.size, 0); assert.equal(c.drag, null); assert.equal(c.stickId, null); assert.equal(c.lastDistance, 0);
  assert.equal(h.joystick.captures.size, 0); assert.equal(h.right.captures.size, 0); assert.equal(h.knob.style.transform, '');
  h.pointer(h.right, 'pointermove', 2, 100, 200); h.pointer(h.joystick, 'pointermove', 1, p.x, p.y - 30);
  h.pointer(h.right, 'pointerup', 2, 100, 200); h.win.emit('keydown', {key:'d'});
  assert.equal(c.update(.2, () => true), false); assert.deepEqual(c.pose, pose); assert.deepEqual(h.events.taps, []);
  c.setEnabled(true); assert.equal(c.update(.05, () => true), false);
});

test('blur, visibility, and resizing cancel gestures without activating anything', t => {
  const h = harness(t), c = h.control, p = h.center();
  for (const trigger of [() => h.win.emit('blur'), () => { h.doc.hidden = true; h.doc.emit('visibilitychange'); }, () => h.win.emit('resize')]) {
    h.doc.hidden = false;
    h.win.emit('keydown', {key:'w'});
    h.pointer(h.canvas, 'pointerdown', 20, 100, 150);
    h.pointer(h.joystick, 'pointerdown', 21, p.x, p.y - 30);
    trigger();
    assert.equal(c.keys.size, 0); assert.equal(c.drag, null); assert.equal(c.stickId, null);
    assert.equal(h.canvas.captures.size, 0); assert.equal(h.joystick.captures.size, 0);
    assert.equal(c.update(.05, () => true), false);
  }
  assert.deepEqual(h.events.taps, []);
});

test('canvas taps remain available; drag, cancellation, long hold, and mouse hover are not taps', t => {
  const h = harness(t, {lookPad:false}), c = h.control;
  h.pointer(h.canvas, 'pointerdown', 1, 150, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointerup', 1, 150, 200, {pointerType:'mouse'});
  assert.deepEqual(h.events.taps, [{x:150, y:200}]);
  h.pointer(h.canvas, 'pointerdown', 2, 150, 200);
  h.pointer(h.canvas, 'pointermove', 2, 170, 200); h.pointer(h.canvas, 'pointermove', 2, 150, 200);
  h.pointer(h.canvas, 'pointerup', 2, 150, 200);
  h.pointer(h.canvas, 'pointerdown', 3, 150, 200); h.pointer(h.canvas, 'pointercancel', 3, 150, 200);
  h.pointer(h.canvas, 'pointerdown', 4, 150, 200); h.advance(500); h.pointer(h.canvas, 'pointerup', 4, 150, 200);
  h.pointer(h.canvas, 'pointerdown', 5, 150, 200); h.pointer(h.canvas, 'pointerup', 5, 220, 200);
  h.pointer(h.canvas, 'pointerdown', 6, 150, 200, {pointerType:'mouse'});
  h.pointer(h.win, 'pointermove', 6, 151, 200, {pointerType:'mouse', buttons:0});
  assert.equal(c.drag, null); assert.equal(h.events.taps.length, 1);
  h.pointer(h.canvas, 'pointerdown', 7, 150, 200, {pointerType:'mouse', button:2}); assert.equal(c.drag, null);
  assert.equal(h.canvas.emit('contextmenu').defaultPrevented, true);
});

test('keyboard input remains compatible and does not steal typing or modified shortcuts', t => {
  const h = harness(t), c = h.control;
  for (const details of [{ctrlKey:true}, {metaKey:true}, {altKey:true}, {target:{tagName:'INPUT'}}, {target:{isContentEditable:true}}]) h.win.emit('keydown', {key:'w', ...details});
  assert.equal(c.keys.size, 0); assert.equal(h.events.moves.length, 0);
  h.win.emit('keydown', {key:'w'}); h.win.emit('keydown', {key:'w', repeat:true});
  assert.equal(h.events.moves.length, 1); assert.equal(h.events.moves[0].source, 'keyboard');
  c.update(.05, () => true); near(c.lastDistance, .1225);
  h.win.emit('keyup', {key:'w'}); assert.equal(c.update(.05, () => true), false);
  h.win.emit('keydown', {key:'ArrowLeft'}); c.update(.1, () => true); near(c.pose.yaw, .17); assert.equal(h.events.looks.at(-1).source, 'keyboard');
  h.win.emit('keyup', {key:'ArrowLeft'});
  h.win.emit('keydown', {key:'e'}); h.win.emit('keydown', {key:'e', repeat:true}); assert.equal(h.events.interactions, 1);
  h.win.emit('keydown', {key:'c'}); h.win.emit('keydown', {key:'c', repeat:true}); assert.equal(c.pose.crouch, true);
  h.win.emit('keydown', {key:'w'}); c.update(.05, () => true); near(c.lastDistance, .0725);
  h.win.emit('keydown', {key:'Escape'}); assert.equal(h.events.pauses, 1); assert.equal(c.enabled, false); assert.equal(c.keys.size, 0);
});

test('reported movement excludes blocked steps and measures the distance of a collision slide', t => {
  const h = harness(t), c = h.control;
  h.win.emit('keydown', {key:'w'}); h.win.emit('keydown', {key:'d'});
  assert.equal(c.update(.05, () => false), false); assert.equal(c.lastDistance, 0); near(c.pose.x, 0); near(c.pose.z, 0);
  assert.equal(c.update(.05, x => x <= 0), true);
  near(c.pose.x, 0); near(c.pose.z, -.1225 / Math.SQRT2); near(c.lastDistance, .1225 / Math.SQRT2);
  c.setPose({x:0, z:0, yaw:0}); h.win.emit('keydown', {key:'w'});
  let checks = 0; assert.equal(c.update(.2, () => { checks++; return true; }), true);
  near(c.lastDistance, .49); near(c.pose.z, -.49); assert.equal(checks, 8);
  assert.equal(c.update(0, () => true), false); assert.equal(c.lastDistance, 0);
});

test('invert and sensitivity work on the pad, with pitch limits and no duplicate bubbled movement', t => {
  const h = harness(t), c = h.control;
  c.sensitivity = 2; c.invert = true;
  h.pointer(h.right, 'pointerdown', 1, 320, 730); h.pointer(h.right, 'pointermove', 1, 330, 740);
  near(c.pose.yaw, -.07); near(c.pose.pitch, .06); assert.equal(h.events.looks.length, 1);
  h.pointer(h.right, 'pointermove', 1, 330, 2000); near(c.pose.pitch, 1.12);
  h.pointer(h.right, 'pointermove', 1, 330, -2000); near(c.pose.pitch, -1.12);
});

test('disposing controls releases ownership and removes listeners without retaining input', t => {
  const h = harness(t), c = h.control, p = h.center();
  assert.equal(h.canvas.style.touchAction, 'none'); assert.equal(h.right.style.touchAction, 'none');
  h.pointer(h.joystick, 'pointerdown', 1, p.x, p.y - 30); h.pointer(h.right, 'pointerdown', 2, 320, 730);
  c.dispose(); c.dispose();
  for (const node of [h.canvas, h.right, h.joystick, h.win, h.doc]) assert.equal(node.listenerCount, 0);
  assert.equal(h.canvas.style.touchAction, ''); assert.equal(h.right.style.touchAction, '');
  assert.equal(h.joystick.captures.size, 0); assert.equal(h.right.captures.size, 0);
  c.setEnabled(true); assert.equal(c.enabled, false);
  h.win.emit('keydown', {key:'w'}); h.pointer(h.right, 'pointerdown', 3, 320, 730);
  assert.equal(c.update(.05, () => true), false); assert.equal(c.drag, null);
});

test('the first mouse press captures without inspection; locked clicks and E inspect once', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control;
  h.lock.grantOnRequest = true;
  h.pointer(h.canvas, 'pointerdown', 1, 200, 300, {pointerType:'mouse'});
  assert.equal(h.lock.requests, 1); assert.equal(c.mouseLookLocked, true);
  assert.equal(c.drag, null); assert.equal(h.canvas.captures.size, 0);
  h.canvas.emit('mousedown', {button:0});
  assert.equal(h.events.interactions, 0);
  h.pointer(h.canvas, 'pointerup', 1, 200, 300, {pointerType:'mouse'});
  h.win.emit('mouseup', {button:0});
  assert.deepEqual(h.events.taps, []);
  h.pointer(h.canvas, 'pointerdown', 1, 200, 300, {pointerType:'mouse'});
  h.canvas.emit('mousedown', {button:0});
  assert.equal(h.events.interactions, 1); assert.equal(h.lock.requests, 1);
  h.canvas.emit('mousedown', {button:2});
  h.canvas.emit('mousedown', {button:0, sourceCapabilities:{firesTouchEvents:true}});
  assert.equal(h.events.interactions, 1);
  h.win.emit('keydown', {key:'e'}); h.win.emit('keydown', {key:'e', repeat:true});
  assert.equal(h.events.interactions, 2);
  assert.equal(await c.requestMouseLook(), true); assert.equal(h.lock.requests, 1);
  assert.deepEqual(h.events.mouseLook.at(-1), {supported:true, enabled:true, locked:true, pending:false, reason:'locked'});
});

test('locked mouse uses relative movement without a button, ignores duplicate pointer moves, and preserves sensitivity', async t => {
  const h = harness(t, {pointerLock:'promise'}), c = h.control;
  c.setPose({x:0, z:0, yaw:.4, pitch:-.2});
  const request = c.requestMouseLook();
  h.doc.emit('mousemove', {movementX:500, movementY:500});
  near(c.pose.yaw, .4); near(c.pose.pitch, -.2);
  assert.deepEqual(h.events.mouseLook.at(-1), {supported:true, enabled:true, locked:false, pending:true, reason:'requesting'});
  assert.equal(c.requestMouseLook(), request); assert.equal(h.lock.requests, 1);
  h.lock.grant(); assert.equal(await request, true);
  near(c.pose.yaw, .4); near(c.pose.pitch, -.2);
  h.doc.emit('mousemove', {movementX:20, movementY:-10, buttons:0, clientX:200, clientY:300});
  near(c.pose.yaw, .33); near(c.pose.pitch, -.17);
  h.pointer(h.canvas, 'pointermove', 1, 200, 300, {pointerType:'mouse', buttons:0, movementX:20, movementY:-10});
  assert.equal(h.events.looks.length, 1); assert.equal(h.events.looks[0].source, 'mouse-lock');
  c.sensitivity = 2; c.invert = true;
  h.doc.emit('mousemove', {movementX:10, movementY:10, buttons:0});
  near(c.pose.yaw, .26); near(c.pose.pitch, -.11);
  h.doc.emit('mousemove', {movementX:0, movementY:10000}); near(c.pose.pitch, 1.12);
  h.doc.emit('mousemove', {movementX:Infinity, movementY:NaN}); near(c.pose.yaw, .26);
});

test('denial is sticky for canvas fallback and repeated settings, while L explicitly retries', async t => {
  const h = harness(t, {pointerLock:'promise'}), c = h.control;
  h.pointer(h.canvas, 'pointerdown', 1, 150, 200, {pointerType:'mouse'});
  const first = c.requestMouseLook();
  h.lock.deny(); assert.equal(await first, false);
  h.pointer(h.canvas, 'pointerup', 1, 150, 200, {pointerType:'mouse'});
  assert.equal(h.events.taps.length, 0); assert.equal(h.events.mouseLook.at(-1).reason, 'denied');
  c.setMouseLookEnabled(true); c.setEnabled(false); c.setEnabled(true);
  assert.equal(h.events.mouseLook.at(-1).reason, 'denied');
  h.pointer(h.canvas, 'pointerdown', 2, 150, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointermove', 2, 170, 190, {pointerType:'mouse'});
  near(c.pose.yaw, -.07); near(c.pose.pitch, .03);
  h.pointer(h.canvas, 'pointerup', 2, 170, 190, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointerdown', 3, 150, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointerup', 3, 150, 200, {pointerType:'mouse'});
  assert.equal(h.lock.requests, 1); assert.deepEqual(h.events.taps, [{x:150, y:200}]);
  h.win.emit('keydown', {key:'l'}); h.win.emit('keydown', {key:'l', repeat:true});
  assert.equal(h.lock.requests, 2); assert.equal(h.events.interactions, 0);
  const retry = c.requestMouseLook(); h.lock.grant(); assert.equal(await retry, true);
  c.setMouseLookEnabled(true);
  assert.equal(c.mouseLookLocked, true); assert.equal(h.lock.exits, 0);
  assert.equal(h.events.mouseLook.at(-1).reason, 'locked');
});

test('void errors, Promise-only rejections, and synchronous denials all leave ordinary drag available', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control;
  let request = c.requestMouseLook(); h.lock.deny({promise:false}); assert.equal(await request, false);
  assert.equal(h.events.mouseLook.at(-1).reason, 'denied');
  h.lock.mode = 'promise';
  request = c.requestMouseLook(); h.lock.deny({event:false}); assert.equal(await request, false);
  assert.equal(h.events.mouseLook.at(-1).reason, 'denied');
  h.lock.mode = 'throw';
  assert.equal(await c.requestMouseLook(), false); assert.equal(h.events.mouseLook.at(-1).reason, 'denied');
  h.pointer(h.canvas, 'pointerdown', 1, 100, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointermove', 1, 130, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointerup', 1, 130, 200, {pointerType:'mouse'});
  near(c.pose.yaw, -.105); assert.equal(h.lock.requests, 3); assert.equal(h.events.pauses, 0);
});

test('turning mouse look off releases intentionally and keeps desktop drag and tap available', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control;
  const request = c.requestMouseLook(); h.lock.grant(); await request;
  h.win.emit('keydown', {key:'w'});
  c.setMouseLookEnabled(false);
  assert.equal(c.mouseLookLocked, false); assert.equal(h.lock.exits, 1); assert.equal(h.events.pauses, 0);
  assert.equal(c.keys.size, 0); assert.equal(h.events.mouseLook.at(-1).reason, 'disabled');
  c.setMouseLookEnabled(false); assert.equal(h.lock.exits, 1);
  assert.equal(await c.requestMouseLook(), false); assert.equal(h.lock.requests, 1);
  h.pointer(h.canvas, 'pointerdown', 1, 150, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointermove', 1, 180, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointerup', 1, 180, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointerdown', 2, 150, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointerup', 2, 150, 200, {pointerType:'mouse'});
  near(c.pose.yaw, -.105); assert.equal(h.events.taps.length, 1); assert.equal(h.lock.requests, 1);
  c.setMouseLookEnabled(true); assert.equal(h.events.mouseLook.at(-1).reason, 'ready');
  assert.equal(h.lock.requests, 1); // Preference changes never capture by themselves.
});

test('unsupported native capture retains desktop canvas taps without issuing a request', async t => {
  const h = harness(t), c = h.control;
  assert.equal(await c.requestMouseLook(), false);
  assert.equal(h.events.mouseLook.at(-1).supported, false); assert.equal(h.events.mouseLook.at(-1).reason, 'unsupported');
  h.pointer(h.canvas, 'pointerdown', 1, 100, 200, {pointerType:'mouse'});
  h.pointer(h.canvas, 'pointerup', 1, 100, 200, {pointerType:'mouse'});
  assert.equal(h.events.taps.length, 1); assert.equal(h.lock.requests, 0);
});

test('modal disable intentionally releases capture and never pauses or recaptures on enable', async t => {
  const h = harness(t, {pointerLock:'promise'}), c = h.control;
  const request = c.requestMouseLook(); h.lock.grant(); await request;
  h.lock.deferExit = true;
  c.setEnabled(false);
  assert.equal(c.mouseLookLocked, false); assert.equal(h.lock.exits, 1); assert.equal(h.events.pauses, 0);
  assert.equal(await c.requestMouseLook(), false); assert.equal(h.lock.requests, 1);
  const yaw = c.pose.yaw;
  h.doc.emit('mousemove', {movementX:100, movementY:0}); near(c.pose.yaw, yaw);
  h.lock.browserRelease(); assert.equal(h.events.pauses, 0);
  c.setEnabled(true); assert.equal(c.mouseLookLocked, false); assert.equal(h.lock.requests, 1);
});

test('a late grant after modal disable is rejected even after resume, and requests do not overlap', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control;
  const first = c.requestMouseLook(); c.setEnabled(false); assert.equal(await first, false);
  c.setEnabled(true);
  assert.equal(await c.requestMouseLook(), false); assert.equal(h.lock.requests, 1);
  h.lock.grant();
  assert.equal(c.mouseLookLocked, false); assert.equal(h.doc.pointerLockElement, null);
  assert.equal(h.lock.exits, 1); assert.equal(h.events.pauses, 0);
  assert(!h.events.mouseLook.some(status => status.locked));
  const next = c.requestMouseLook(); h.lock.grant(); assert.equal(await next, true);
  assert.equal(h.lock.requests, 2); assert.equal(c.mouseLookLocked, true);
});

test('Escape and browser lock-loss events pause once in either event order', async t => {
  const h = harness(t, {pointerLock:'void', pauseDisables:false}), c = h.control;
  let request = c.requestMouseLook(); h.lock.grant(); await request;
  h.win.emit('keydown', {key:'w'});
  h.win.emit('keydown', {key:'Escape'});
  h.lock.browserRelease(); h.win.emit('keydown', {key:'Escape', repeat:true});
  assert.equal(h.events.pauses, 1); assert.equal(c.keys.size, 0); assert.equal(c.mouseLookLocked, false);
  c.setEnabled(false); c.setEnabled(true);
  request = c.requestMouseLook(); h.lock.grant(); await request;
  h.lock.browserRelease();
  h.win.emit('keydown', {key:'Escape'}); h.doc.emit('pointerlockchange');
  assert.equal(h.events.pauses, 2); assert.equal(c.keys.size, 0);
});

test('an Escape delivered after native unlock cannot dismiss the pause it just opened', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control;
  let dismissed = 0;
  // Mirror the app's later window listener, which dismisses any open panel on Escape.
  h.win.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.repeat && !e.defaultPrevented && !c.enabled) {
      dismissed++; c.setEnabled(true);
    }
  });
  let request = c.requestMouseLook(); h.lock.grant(); await request;
  h.lock.browserRelease(); assert.equal(h.events.pauses, 1); assert.equal(c.enabled, false);
  assert.equal(h.win.emit('keydown', {key:'Escape'}).defaultPrevented, true);
  assert.equal(dismissed, 0); assert.equal(c.enabled, false);
  h.win.emit('keyup', {key:'Escape'});
  h.win.emit('keydown', {key:'Escape'});
  assert.equal(dismissed, 1); assert.equal(c.enabled, true);

  // Browsers may swallow the original key entirely. A later intentional Escape
  // still closes the panel, without having to press an extra time.
  request = c.requestMouseLook(); h.lock.grant(); await request; h.lock.browserRelease();
  h.advance(300); h.win.emit('keydown', {key:'Escape'});
  assert.equal(dismissed, 2); assert.equal(c.enabled, true);
  request = c.requestMouseLook(); h.lock.grant(); await request; h.lock.browserRelease();
  h.win.emit('keyup', {key:'Escape'}); h.win.emit('keydown', {key:'Escape'});
  assert.equal(dismissed, 3); assert.equal(c.enabled, true);
});

test('focus and visibility loss release owned capture and reset movement without exiting another element', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control;
  for (const loseFocus of [() => h.win.emit('blur'), () => { h.doc.hidden = true; h.doc.emit('visibilitychange'); }, () => h.win.emit('pagehide')]) {
    h.doc.hidden = false;
    const request = c.requestMouseLook(); h.lock.grant(); await request;
    h.win.emit('keydown', {key:'w'}); loseFocus();
    assert.equal(c.mouseLookLocked, false); assert.equal(c.keys.size, 0); assert.equal(c.update(.05, () => true), false);
  }
  assert.equal(h.lock.exits, 3); assert.equal(h.events.pauses, 0);
  const other = {}; h.doc.pointerLockElement = other;
  c.releaseMouseLook(); c.setEnabled(false); c.dispose();
  assert.equal(h.lock.exits, 3); assert.equal(h.doc.pointerLockElement, other);
});

test('desktop shortcuts open panels, M preserves capture, and typing, modifiers, repeats, and disabled input are ignored', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control;
  let request = c.requestMouseLook(); h.lock.grant(); await request;
  for (const details of [{ctrlKey:true}, {metaKey:true}, {altKey:true}, {shiftKey:true}, {target:{tagName:'INPUT'}}, {target:{tagName:'TEXTAREA'}}, {target:{tagName:'SELECT'}}, {target:{isContentEditable:true}}, {isComposing:true}]) {
    for (const key of ['n','i','h','m','o','l']) assert.equal(h.win.emit('keydown', {key, ...details}).defaultPrevented, false);
  }
  h.doc.activeElement = {tagName:'INPUT'}; h.win.emit('keydown', {key:'n'}); h.doc.activeElement = null;
  assert.deepEqual(h.events.shortcuts, []); assert.equal(h.lock.requests, 1);
  h.win.emit('keydown', {key:'m'}); h.win.emit('keydown', {key:'m', repeat:true}); h.win.emit('keydown', {key:'m'});
  assert.deepEqual(h.events.shortcuts, ['sound']); assert.equal(c.mouseLookLocked, true); assert.equal(h.lock.exits, 0);
  c.setMouseLookEnabled(true); assert.equal(c.mouseLookLocked, true);
  h.win.emit('keyup', {key:'m'});
  for (const [key, action] of [['n','notes'], ['i','pockets'], ['h','hints'], ['o','settings']]) {
    h.win.emit('keydown', {key}); h.win.emit('keydown', {key, repeat:true}); h.win.emit('keydown', {key});
    assert.equal(h.events.shortcuts.at(-1), action); assert.equal(c.mouseLookLocked, false);
    h.win.emit('keyup', {key});
    request = c.requestMouseLook(); h.lock.grant(); await request;
  }
  assert.deepEqual(h.events.shortcuts, ['sound','notes','pockets','hints','settings']);
  assert.equal(h.events.interactions, 0); assert.equal(h.events.pauses, 0);
  c.setEnabled(false);
  for (const key of ['n','i','h','m','o','l','e']) h.win.emit('keydown', {key});
  assert.equal(h.events.shortcuts.length, 5); assert.equal(h.events.interactions, 0);
});

test('native desktop capture never steals either thumb, and touch can take over from a locked mouse', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control, p = h.center();
  h.pointer(h.joystick, 'pointerdown', 1, p.x, p.y - 15);
  h.pointer(h.right, 'pointerdown', 2, 320, 730);
  assert.equal(await c.requestMouseLook(), false); assert.equal(h.lock.requests, 0);
  h.pointer(h.right, 'pointermove', 2, 340, 720);
  assert.equal(c.stickId, 1); assert.equal(c.drag.id, 2); assert.equal(c.update(.05, () => true), true);
  h.pointer(h.joystick, 'pointerup', 1, p.x, p.y - 15); h.pointer(h.right, 'pointerup', 2, 340, 720);
  const request = c.requestMouseLook(); h.lock.grant(); await request;
  const yaw = c.pose.yaw;
  h.pointer(h.joystick, 'pointerdown', 3, p.x, p.y - 15);
  h.pointer(h.right, 'pointerdown', 4, 320, 730);
  near(c.pose.yaw, yaw); assert.equal(c.mouseLookLocked, false); assert.equal(h.lock.exits, 1);
  assert.equal(c.stickId, 3); assert.equal(c.drag.id, 4); assert.equal(h.events.pauses, 0);
  h.pointer(h.right, 'pointermove', 4, 340, 730); near(c.pose.yaw, yaw - .07);
  assert.equal(c.update(.05, () => true), true); assert.equal(h.lock.requests, 1);
});

test('disposal keeps only a completion guard for a late void grant, then removes every listener', async t => {
  const h = harness(t, {pointerLock:'void'}), c = h.control;
  const request = c.requestMouseLook(); c.dispose(); assert.equal(await request, false);
  for (const node of [h.canvas, h.right, h.joystick, h.win]) assert.equal(node.listenerCount, 0);
  assert.equal(h.doc.listenerCount, 2);
  const reports = h.events.mouseLook.length;
  h.lock.grant();
  assert.equal(h.lock.exits, 1); assert.equal(h.doc.pointerLockElement, null); assert.equal(c.mouseLookLocked, false);
  assert.equal(h.doc.listenerCount, 0); assert.equal(h.events.mouseLook.length, reports);
  assert.equal(h.events.pauses, 0); assert.equal(await c.requestMouseLook(), false);
});
