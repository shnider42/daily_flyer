const LOOK_LIMIT = 1.12;
const TAP_DISTANCE = 7;
const TAP_TIME = 450;
const STICK_DEADZONE = .12;
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
  constructor({canvas, joystick, knob, lookPad = null, onInteract, onPause, onTap, onCrouch, onLook, onMove}) {
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
      // A second finger cannot take over an existing gesture or the other thumb's pointer.
      if (this.drag || this.stickId === e.pointerId) return;
      this.drag = {id:e.pointerId, surface, x:e.clientX, y:e.clientY,
        startX:e.clientX, startY:e.clientY, time:performance.now(), moved:false};
      this._active(surface, true);
      this._capture(surface, e.pointerId);
      e.preventDefault();
      e.stopPropagation?.();
    }, {passive:false});
    if (joystick) this._listen(joystick, 'pointerdown', e => {
      if (!this.enabled || (e.button != null && e.button !== 0) || this.stickId !== null || this.drag?.id === e.pointerId) return;
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
    this._listen(window, 'keydown', e => {
      if (e.key === 'Escape') {
        if (this.enabled) { e.preventDefault(); this.reset(); onPause?.(); }
        return;
      }
      if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
      const key = String(e.key || '').toLowerCase();
      const accepted = ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','c',' '].includes(key);
      if (!accepted) return;
      e.preventDefault();
      const wasDown = this.keys.has(key);
      this.keys.add(key);
      if (!wasDown && ['w','a','s','d','arrowup','arrowdown'].includes(key)) this._announceMove('keyboard');
      if (!e.repeat && key === 'e') onInteract?.();
      if (!e.repeat && (key === 'c' || key === ' ')) this.toggleCrouch();
    });
    this._listen(window, 'keyup', e => this.keys.delete(String(e.key || '').toLowerCase()));
    this._listen(window, 'blur', this.reset);
    this._listen(window, 'resize', this.reset);
    this._listen(window, 'pagehide', this.reset);
    this._listen(document, 'visibilitychange', () => { if (document.hidden) this.reset(); });
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
      const sensitivity = Number.isFinite(this.sensitivity) ? this.sensitivity : 1;
      const deltaYaw = -dx * .0035 * sensitivity, previousPitch = this.pose.pitch;
      this.pose.yaw += deltaYaw;
      this.pose.pitch = clamp(this.pose.pitch - dy * .003 * sensitivity * (this.invert ? -1 : 1), -LOOK_LIMIT, LOOK_LIMIT);
      const deltaPitch = this.pose.pitch - previousPitch;
      if (deltaYaw || deltaPitch) this.onLook?.({source:drag.surface === this.lookPad ? 'look-pad' : 'canvas', deltaYaw, deltaPitch});
    } else this._moveStick(e);
    e.preventDefault();
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
  }
  _finishLook(e, mayTap) {
    const drag = this.drag;
    if (!drag || drag.id !== e.pointerId) return;
    const box = this.canvas.getBoundingClientRect();
    const inside = e.clientX >= box.left && e.clientX <= box.left + box.width && e.clientY >= box.top && e.clientY <= box.top + box.height;
    const tap = mayTap && this.enabled && drag.surface === this.canvas && !drag.moved && inside &&
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
    this._finishStick();
    if (drag) { this._active(drag.surface, false); this._release(drag.surface, drag.id); }
  }
  setEnabled(enabled) { this.enabled = !!enabled && !this._disposed; if (!this.enabled) this.reset(); }
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
    for (const [target, type, handler, options] of this._listeners) target?.removeEventListener(type, handler, options);
    for (const [surface, touchAction] of this._touchActions) surface.style.touchAction = touchAction;
    this._listeners = []; this._touchActions = [];
  }
}
