const LOOK_LIMIT = 1.12;
const TAP_DISTANCE = 7;
const TAP_TIME = 450;
const STICK_DEADZONE = .12;
const UNLOCK_ESCAPE_WINDOW = 250;
const SHORTCUTS = {n:'notes', i:'pockets', h:'hints', m:'sound', o:'settings'};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isEditable = target => target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);

export function movementVector(yaw, forward, side, speed, dt) {
  const length = Math.hypot(forward, side) || 1;
  const seconds = Number.isFinite(dt) ? clamp(dt, 0, .05) : 0;
  const scale = speed * seconds / Math.max(1, length);
  return { x: (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * scale,
    z: (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * scale };
}

/** Fixed left stick, independent right-thumb look, and desktop keyboard/canvas input. */
export class FirstPersonControls {
  constructor({canvas, joystick, knob, lookPad = null, onInteract, onPause, onTap, onCrouch, onLook, onMove, onMouseLook, onShortcut}) {
    this.pose = {x:0, z:3.2, yaw:0, pitch:0, crouch:false};
    this.enabled = false;
    this.sensitivity = 1;
    this.invert = false;
    this.keys = new Set();
    this.stick = {x:0, y:0};
    this.drag = null;
    this.stickId = null;
    this.lastDistance = 0;
    this.canvas = canvas;
    this.joystick = joystick;
    this.stickBase = joystick?.querySelector?.('.joystick-ring') || joystick;
    this.knob = knob;
    this.lookPad = lookPad;
    this.onCrouch = onCrouch;
    this.onLook = onLook;
    this.onMove = onMove;
    this.onTap = onTap;
    this.onInteract = onInteract;
    this.onPause = onPause;
    this.onMouseLook = onMouseLook;
    this.onShortcut = onShortcut;
    this._doc = canvas.ownerDocument || document;
    this.mouseLookEnabled = true;
    this._mouseLockOwned = false;
    this._lockWanted = false;
    this._nativeLockRequest = null;
    this._lockAutoAllowed = true;
    this._lockPressId = null;
    this._lockPressBlocked = false;
    this._pauseSent = false;
    this._unlockEscapeUntil = 0;
    this._mouseLookReason = this._supportsMouseLook() ? 'ready' : 'unsupported';
    this._lastMouseLookStatus = '';
    this._listeners = [];
    this._touchActions = [];
    this._handledMoves = new WeakSet();
    this._stickGeometry = null;
    this._disposed = false;
    this.reset = this.reset.bind(this);

    const lookSurfaces = [...new Set([canvas, lookPad].filter(Boolean))];
    const surfaces = [...new Set([...lookSurfaces, joystick].filter(Boolean))];
    for (const surface of surfaces) {
      if (surface.style) {
        this._touchActions.push([surface, surface.style.touchAction]);
        surface.style.touchAction = 'none';
      }
      this._listen(surface, 'contextmenu', e => e.preventDefault());
      this._listen(surface, 'pointermove', e => this._movePointer(e), {passive:false});
      this._listen(surface, 'pointerup', e => this._endPointer(e), {passive:false});
      this._listen(surface, 'pointercancel', e => this._endPointer(e), {passive:false});
      this._listen(surface, 'lostpointercapture', e => {
        if (this.drag?.id === e.pointerId && this.drag.surface === surface) this._finishLook(e, false);
        if (this.stickId === e.pointerId && this.joystick === surface) this._finishStick();
      });
    }
    for (const surface of lookSurfaces) this._listen(surface, 'pointerdown', e => {
      if (!this.enabled || (e.button != null && e.button !== 0)) return;
      const mouse = e.pointerType === 'mouse';
      if (!mouse && (this._mouseLockOwned || this._lockWanted)) this.releaseMouseLook();
      // Locked mouse clicks are handled by mousedown, which Pointer Lock guarantees.
      // Do not prevent the compatibility mouse event on an already locked canvas.
      if (mouse && this.mouseLookLocked && surface === canvas) return;
      // A second finger cannot take over an existing gesture or the other thumb's pointer.
      if (this.drag || this.stickId === e.pointerId) return;
      const captureMouse = mouse && surface === canvas && this.mouseLookEnabled && this._supportsMouseLook() &&
        this._lockAutoAllowed && this.stickId === null && !this._nativeLockRequest?.canceled;
      this.drag = {id:e.pointerId, surface, x:e.clientX, y:e.clientY,
        startX:e.clientX, startY:e.clientY, time:performance.now(), moved:false,
        pointerType:e.pointerType, suppressTap:captureMouse};
      this._active(surface, true);
      this._capture(surface, e.pointerId);
      if (captureMouse) {
        this._lockPressBlocked = true;
        this._lockPressId = e.pointerId;
        this.requestMouseLook();
      }
      e.preventDefault();
      e.stopPropagation?.();
    }, {passive:false});
    if (joystick) this._listen(joystick, 'pointerdown', e => {
      if (!this.enabled || (e.button != null && e.button !== 0) || this.stickId !== null || this.drag?.id === e.pointerId) return;
      if (e.pointerType !== 'mouse' && (this._mouseLockOwned || this._lockWanted)) this.releaseMouseLook();
      const box = this.stickBase.getBoundingClientRect();
      const size = Math.min(box.width, box.height);
      if (!(size > 0)) return;
      const knobSize = this.knob?.getBoundingClientRect?.().width || size * .36;
      this._stickGeometry = {x:box.left + box.width / 2, y:box.top + box.height / 2,
        radius:Math.max(1, (size - Math.min(knobSize, size * .65)) / 2 - 2)};
      this.stickId = e.pointerId;
      this._active(joystick, true);
      this._capture(joystick, e.pointerId);
      this._moveStick(e);
      e.preventDefault();
      e.stopPropagation?.();
    }, {passive:false});

    // These also finish gestures if a browser declines capture or a pointer leaves its pad.
    this._listen(window, 'pointermove', e => this._movePointer(e), {passive:false});
    this._listen(window, 'pointerup', e => this._endPointer(e), {passive:false});
    this._listen(window, 'pointercancel', e => this._endPointer(e), {passive:false});
    this._listen(canvas, 'mousedown', e => {
      if (this.enabled && this.mouseLookLocked && e.button === 0 && !this._lockPressBlocked && !e.sourceCapabilities?.firesTouchEvents) {
        e.preventDefault();
        this.onInteract?.();
      }
    });
    this._listen(window, 'mouseup', e => {
      if (e.button === 0) { this._lockPressBlocked = false; this._lockPressId = null; }
    });
    this._listen(this._doc, 'mousemove', e => {
      if (this.enabled && this.mouseLookLocked) this._applyLook(e.movementX || 0, e.movementY || 0, 'mouse-lock');
    });
    this._listen(this._doc, 'pointerlockchange', () => this._handleLockChange());
    this._listen(this._doc, 'pointerlockerror', () => this._denyMouseLook(this._nativeLockRequest));
    this._listen(window, 'keydown', e => {
      // Some browsers report the native Escape unlock before delivering its key.
      // Consume that trailing key even after onPause has disabled these controls,
      // otherwise the app's modal handler would immediately close the new pause.
      if (e.key === 'Escape' && this._unlockEscapeUntil) {
        const followsUnlock = performance.now() <= this._unlockEscapeUntil;
        this._unlockEscapeUntil = 0;
        if (followsUnlock) { e.preventDefault(); return; }
      }
      if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || isEditable(e.target) || isEditable(this._doc.activeElement)) return;
      if (e.key === 'Escape') {
        if (!e.repeat) { e.preventDefault(); this._pauseOnce(); }
        return;
      }
      const key = String(e.key || '').toLowerCase();
      if ((SHORTCUTS[key] || key === 'l') && e.shiftKey) return;
      const accepted = ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','c',' ','l'].includes(key) || !!SHORTCUTS[key];
      if (!accepted) return;
      e.preventDefault();
      const wasDown = this.keys.has(key);
      this.keys.add(key);
      if (!wasDown && ['w','a','s','d','arrowup','arrowdown'].includes(key)) this._announceMove('keyboard');
      if (e.repeat || wasDown) return;
      if (key === 'l') this.requestMouseLook();
      else if (SHORTCUTS[key]) {
        const action = SHORTCUTS[key];
        if (action !== 'sound') { this.releaseMouseLook(); this.keys.add(key); }
        this.onShortcut?.(action);
      } else if (key === 'e') this.onInteract?.();
      else if (key === 'c' || key === ' ') this.toggleCrouch();
    });
    this._listen(window, 'keyup', e => {
      this.keys.delete(String(e.key || '').toLowerCase());
      if (e.key === 'Escape') this._unlockEscapeUntil = 0;
    });
    this._listen(window, 'blur', () => this.releaseMouseLook());
    this._listen(window, 'resize', this.reset);
    this._listen(window, 'pagehide', () => this.releaseMouseLook());
    this._listen(this._doc, 'visibilitychange', () => { if (this._doc.hidden) this.releaseMouseLook(); });
  }
  _supportsMouseLook() {
    return typeof this.canvas?.requestPointerLock === 'function' && typeof this._doc?.exitPointerLock === 'function';
  }
  get mouseLookLocked() {
    return !!(this._mouseLockOwned && this.enabled && this.mouseLookEnabled && !this._disposed && this._doc.pointerLockElement === this.canvas);
  }
  _notifyMouseLook(reason = this._mouseLookReason) {
    this._mouseLookReason = reason;
    if (this._disposed) return;
    const status = {supported:this._supportsMouseLook(), enabled:this.mouseLookEnabled, locked:this.mouseLookLocked,
      pending:!!(this._nativeLockRequest && !this._nativeLockRequest.canceled), reason};
    const key = JSON.stringify(status);
    if (key !== this._lastMouseLookStatus) { this._lastMouseLookStatus = key; this.onMouseLook?.(status); }
  }
  setMouseLookEnabled(enabled) {
    const next = !!enabled;
    // Audio and other settings reapply this preference; preserve both capture and denial.
    if (this.mouseLookEnabled === next) { this._notifyMouseLook(); return; }
    this.mouseLookEnabled = next;
    if (!next) { this.releaseMouseLook(); this._notifyMouseLook('disabled'); }
    else { this._lockAutoAllowed = true; this._notifyMouseLook(this._supportsMouseLook() ? 'ready' : 'unsupported'); }
  }
  requestMouseLook() {
    if (!this.enabled || !this.mouseLookEnabled || this._disposed || this._doc.hidden) return Promise.resolve(false);
    if (!this._supportsMouseLook()) { this._notifyMouseLook('unsupported'); return Promise.resolve(false); }
    if (this.mouseLookLocked) return Promise.resolve(true);
    // A pending native request cannot be canceled. Wait for its result before another
    // gesture can request capture, so a late modal-era grant can never become active.
    if (this._nativeLockRequest) return this._nativeLockRequest.canceled ? Promise.resolve(false) : this._nativeLockRequest.promise;
    if (this.stickId !== null || (this.drag && this.drag.pointerType !== 'mouse')) return Promise.resolve(false);
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const request = {promise, resolve, settled:false, canceled:false};
    this._nativeLockRequest = request;
    this._lockWanted = true;
    this._pauseSent = false;
    this._notifyMouseLook('requesting');
    try {
      // Keep this synchronous inside the click or key event's user activation.
      // Older browsers return void; document events are authoritative in both forms.
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.then === 'function') result.then(() => {
        if (this._nativeLockRequest === request && this._doc.pointerLockElement === this.canvas) this._handleLockChange();
      }, () => this._denyMouseLook(request));
    } catch { this._denyMouseLook(request); }
    return promise;
  }
  _settleLockRequest(request, accepted, complete = true) {
    if (!request) return;
    if (!request.settled) { request.settled = true; request.resolve(accepted); }
    if (complete && this._nativeLockRequest === request) this._nativeLockRequest = null;
  }
  _denyMouseLook(request) {
    if (!request || this._nativeLockRequest !== request) return;
    const canceled = request.canceled || !this._lockWanted || !this.enabled || !this.mouseLookEnabled || this._disposed;
    this._lockWanted = false;
    this._settleLockRequest(request, false);
    if (!canceled) this._lockAutoAllowed = false;
    this._notifyMouseLook(canceled ? (this.mouseLookEnabled ? 'released' : 'disabled') : 'denied');
    this._pruneDisposedListeners();
  }
  _handleLockChange() {
    const request = this._nativeLockRequest;
    if (this._doc.pointerLockElement === this.canvas) {
      if (!this._lockWanted || !this.enabled || !this.mouseLookEnabled || this._disposed || request?.canceled) {
        this._mouseLockOwned = false;
        this._lockWanted = false;
        this._settleLockRequest(request, false);
        this._exitOwnedLock();
        this._notifyMouseLook(this.mouseLookEnabled ? 'released' : 'disabled');
        this._pruneDisposedListeners();
        return;
      }
      this._mouseLockOwned = true;
      this._lockAutoAllowed = true;
      if (this.drag?.pointerType === 'mouse') this._finishLook({pointerId:this.drag.id, clientX:this.drag.x, clientY:this.drag.y}, false);
      this._settleLockRequest(request, true);
      this._notifyMouseLook('locked');
    } else if (this._mouseLockOwned) {
      this._mouseLockOwned = false;
      this._lockWanted = false;
      this._unlockEscapeUntil = performance.now() + UNLOCK_ESCAPE_WINDOW;
      this._notifyMouseLook('released');
      this._pauseOnce();
    }
  }
  _exitOwnedLock() {
    if (this._doc.pointerLockElement !== this.canvas) return;
    try {
      const result = this._doc.exitPointerLock();
      result?.catch?.(() => {});
    } catch { /* A browser can already have released capture during focus loss. */ }
  }
  releaseMouseLook() {
    const request = this._nativeLockRequest;
    const ownsCanvas = this._doc.pointerLockElement === this.canvas;
    const active = this._mouseLockOwned || this._lockWanted || ownsCanvas;
    // Clear ownership before exitPointerLock: events may arrive synchronously in
    // integrations, and asynchronously in browsers. Neither is an Escape pause.
    this._mouseLockOwned = false;
    this._lockWanted = false;
    if (request) {
      request.canceled = true;
      this._settleLockRequest(request, false, ownsCanvas);
    }
    this.reset();
    this._exitOwnedLock();
    if (active) this._notifyMouseLook(this.mouseLookEnabled ? 'released' : 'disabled');
    this._pruneDisposedListeners();
  }
  _pauseOnce() {
    if (!this.enabled || this._pauseSent) return;
    this._pauseSent = true;
    this.releaseMouseLook();
    this.onPause?.();
  }
  _listen(target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    this._listeners.push([target, type, handler, options]);
  }
  _active(surface, active) {
    if (surface?.dataset) surface.dataset.active = String(active);
  }
  _capture(surface, id) {
    try { surface?.setPointerCapture?.(id); } catch { /* Window handlers remain a fallback. */ }
  }
  _release(surface, id) {
    if (id == null) return;
    try {
      if (!surface?.hasPointerCapture || surface.hasPointerCapture(id)) surface?.releasePointerCapture?.(id);
    } catch { /* Cancellation may have released capture before this handler runs. */ }
  }
  _movePointer(e) {
    if (!this.enabled || this._handledMoves.has(e)) return;
    if (e.pointerType === 'mouse' && this.mouseLookLocked) return;
    if (this.drag?.id !== e.pointerId && this.stickId !== e.pointerId) return;
    this._handledMoves.add(e);
    // A missed mouseup must not leave a hover gesture rotating or moving the player.
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      if (this.drag?.id === e.pointerId) this._finishLook(e, false);
      if (this.stickId === e.pointerId) this._finishStick();
      return;
    }
    if (this.drag?.id === e.pointerId) {
      const drag = this.drag, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      drag.moved ||= Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > TAP_DISTANCE;
      drag.x = e.clientX; drag.y = e.clientY;
      this._applyLook(dx, dy, drag.surface === this.lookPad ? 'look-pad' : 'canvas');
    } else this._moveStick(e);
    e.preventDefault();
  }
  _applyLook(dx, dy, source) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const sensitivity = Number.isFinite(this.sensitivity) ? this.sensitivity : 1;
    const deltaYaw = -dx * .0035 * sensitivity, previousPitch = this.pose.pitch;
    this.pose.yaw += deltaYaw;
    this.pose.pitch = clamp(this.pose.pitch - dy * .003 * sensitivity * (this.invert ? -1 : 1), -LOOK_LIMIT, LOOK_LIMIT);
    const deltaPitch = this.pose.pitch - previousPitch;
    if (deltaYaw || deltaPitch) this.onLook?.({source, deltaYaw, deltaPitch});
  }
  _moveStick(e) {
    if (!this._stickGeometry) return;
    const {x, y, radius} = this._stickGeometry;
    const dx = e.clientX - x, dy = e.clientY - y, length = Math.hypot(dx, dy);
    if (!Number.isFinite(length)) return;
    const factor = Math.min(1, radius / (length || 1));
    const deflection = Math.min(1, length / radius);
    const magnitude = deflection <= STICK_DEADZONE ? 0 : Math.pow((deflection - STICK_DEADZONE) / (1 - STICK_DEADZONE), 1.25);
    const next = magnitude ? {x:dx / (length || 1) * magnitude, y:dy / (length || 1) * magnitude} : {x:0, y:0};
    const changed = Math.abs(next.x - this.stick.x) + Math.abs(next.y - this.stick.y) > 1e-6;
    this.stick = next;
    if (this.knob?.style) this.knob.style.transform = `translate(${dx * factor}px,${dy * factor}px)`;
    if (changed && magnitude > 0) this._announceMove('joystick');
  }
  _announceMove(source) {
    this.onMove?.({source,
      forward:(this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - this.stick.y,
      side:(this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0) + this.stick.x});
  }
  _endPointer(e) {
    if (this.drag?.id === e.pointerId) this._finishLook(e, e.type === 'pointerup');
    if (this.stickId === e.pointerId) this._finishStick();
    if (this._lockPressId === e.pointerId) { this._lockPressBlocked = false; this._lockPressId = null; }
  }
  _finishLook(e, mayTap) {
    const drag = this.drag;
    if (!drag || drag.id !== e.pointerId) return;
    const box = this.canvas.getBoundingClientRect();
    const inside = e.clientX >= box.left && e.clientX <= box.left + box.width && e.clientY >= box.top && e.clientY <= box.top + box.height;
    const tap = mayTap && this.enabled && drag.surface === this.canvas && !drag.suppressTap && !drag.moved && inside &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) <= TAP_DISTANCE && performance.now() - drag.time < TAP_TIME;
    // Clear ownership before release: lostpointercapture can fire synchronously.
    this.drag = null;
    this._active(drag.surface, false);
    this._release(drag.surface, drag.id);
    if (tap) this.onTap?.(e.clientX, e.clientY);
  }
  _finishStick() {
    const id = this.stickId;
    this.stickId = null;
    this._stickGeometry = null;
    this.stick = {x:0, y:0};
    if (this.knob?.style) this.knob.style.transform = '';
    this._active(this.joystick, false);
    this._release(this.joystick, id);
  }
  reset() {
    const drag = this.drag;
    this.drag = null;
    this.keys.clear();
    this.lastDistance = 0;
    this._lockPressBlocked = false;
    this._lockPressId = null;
    this._finishStick();
    if (drag) { this._active(drag.surface, false); this._release(drag.surface, drag.id); }
  }
  setEnabled(enabled) {
    const next = !!enabled && !this._disposed;
    if (next && !this.enabled) { this._pauseSent = false; this._unlockEscapeUntil = 0; }
    this.enabled = next;
    if (!next) this.releaseMouseLook();
    this._notifyMouseLook();
  }
  setPose(pose) {
    this.pose = {x:pose.x, z:pose.z, yaw:pose.yaw || 0, pitch:clamp(pose.pitch || 0, -LOOK_LIMIT, LOOK_LIMIT), crouch:!!pose.crouch};
    this.reset(); this.onCrouch?.(this.pose.crouch);
  }
  toggleCrouch() { if (!this.enabled) return; this.pose.crouch = !this.pose.crouch; this.onCrouch?.(this.pose.crouch); }
  update(dt, canMove) {
    this.lastDistance = 0;
    if (!this.enabled) return false;
    dt = Number.isFinite(dt) ? clamp(dt, 0, .25) : 0;
    const forward = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - this.stick.y;
    const side = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0) + this.stick.x;
    const sensitivity = Number.isFinite(this.sensitivity) ? this.sensitivity : 1;
    const deltaYaw = ((this.keys.has('arrowleft') ? 1 : 0) - (this.keys.has('arrowright') ? 1 : 0)) * dt * 1.7 * sensitivity;
    this.pose.yaw += deltaYaw;
    if (deltaYaw) this.onLook?.({source:'keyboard', deltaYaw, deltaPitch:0});
    if (!this.enabled) return false;
    const steps = Math.max(1, Math.ceil(dt / .05));
    const vector = movementVector(this.pose.yaw, forward, side, this.pose.crouch ? 1.45 : 2.45, dt / steps);
    for (let i = 0; i < steps; i++) {
      const x = this.pose.x, z = this.pose.z;
      if (canMove(this.pose.x + vector.x, this.pose.z, .23)) this.pose.x += vector.x;
      if (canMove(this.pose.x, this.pose.z + vector.z, .23)) this.pose.z += vector.z;
      this.lastDistance += Math.hypot(this.pose.x - x, this.pose.z - z);
    }
    return this.lastDistance > 1e-8;
  }
  dispose() {
    if (this._disposed) return;
    this.setEnabled(false); this._disposed = true;
    this._pruneDisposedListeners();
    for (const [surface, touchAction] of this._touchActions) surface.style.touchAction = touchAction;
    this._touchActions = [];
  }
  _pruneDisposedListeners() {
    if (!this._disposed) return;
    // Void-returning requests can still grant after disposal. Retain only the two
    // native completion listeners until that grant is rejected or the request fails.
    this._listeners = this._listeners.filter(([target, type, handler, options]) => {
      if (this._nativeLockRequest && target === this._doc && (type === 'pointerlockchange' || type === 'pointerlockerror')) return true;
      target?.removeEventListener(type, handler, options);
      return false;
    });
  }
}
