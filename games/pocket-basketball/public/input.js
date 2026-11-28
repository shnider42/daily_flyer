import { bindGameButton, movementInput, protectGameSurface, stickInput } from './vendor/pgi-controls.js';

const SHOT_HOLD_MS = 1200;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const now = () => globalThis.performance?.now?.() ?? Date.now();
const editable = (target) => !!target?.closest?.('input, select, textarea, [contenteditable="true"]');

/** Pocket Sports input. Coordinates are screen coordinates: positive Y is down. */
export class Controls {
  constructor({ stick, knob, shoot, pass, sprint, steal, block, switcher, through, screen,
    onAction = () => {}, onPause = () => {}, active = () => true, settings = {},
    context = () => ({ offense: true, canShoot: true, token: 'default' }) } = {}) {
    Object.assign(this, { stick, knob, shoot, sprint, onAction, onPause, active, settings, context });
    this.keys = Object.create(null);
    this._stick = { x: 0, y: 0 };
    this._stickPointer = null;
    this._sprintPointers = new Set();
    this._shotOwner = null;
    this._shotAction = null;
    this._shotContext = null;
    this._lastContext = null;
    this._shotStarted = 0;
    this._keyboardShotClickUntil = 0;
    this._listeners = [];

    const listen = (node, name, fn, options) => {
      if (!node?.addEventListener) return;
      node.addEventListener(name, fn, options);
      this._listeners.push(() => node.removeEventListener(name, fn, options));
    };
    const actionButton = (button, name) => {
      if (!button) return;
      protectGameSurface(button);
      bindGameButton(button, () => this._emit(name));
    };
    actionButton(pass, 'pass');
    actionButton(steal, 'steal');
    actionButton(block, 'block');
    actionButton(switcher, 'switch');
    actionButton(through, 'through');
    // Optional legacy surface; L and the main secondary button now use through.
    actionButton(screen, 'screen');

    if (stick) {
      protectGameSurface(stick);
      listen(stick, 'pointerdown', (event) => {
        if (!this._isActive() || this._stickPointer !== null || !this._validPointer(event)) return;
        event.preventDefault();
        this._stickPointer = event.pointerId;
        this._stickRect = stick.getBoundingClientRect();
        this._capture(stick, event.pointerId);
        stick.classList?.add('is-pressed');
        this._moveStick(event);
      });
      listen(stick, 'lostpointercapture', (event) => {
        if (event.pointerId === this._stickPointer) this._resetStick();
      });
    }

    if (shoot) {
      protectGameSurface(shoot);
      listen(shoot, 'pointerdown', (event) => {
        if (!this._available(shoot) || this._shotOwner !== null || !this._validPointer(event)) return;
        event.preventDefault();
        this._capture(shoot, event.pointerId);
        this._startShot(event.pointerId);
      });
      listen(shoot, 'lostpointercapture', (event) => {
        if (event.pointerId === this._shotOwner) this._finishShot(false);
      });
      listen(shoot, 'click', (event) => {
        event.preventDefault();
        // Pointer events already fired the action. Detail 0 preserves assistive clicks.
        if (event.detail === 0 && this._available(shoot) && now() > this._keyboardShotClickUntil)
          this._emit('shoot', { timing: 0.65 });
      });
    }

    if (sprint) {
      protectGameSurface(sprint);
      listen(sprint, 'pointerdown', (event) => {
        if (!this._available(sprint) || !this._validPointer(event)) return;
        event.preventDefault();
        this._sprintPointers.add(event.pointerId);
        this._capture(sprint, event.pointerId);
        sprint.classList?.add('is-pressed');
      });
      listen(sprint, 'lostpointercapture', (event) => this._releaseSprint(event.pointerId));
      listen(sprint, 'click', (event) => {
        event.preventDefault();
        // An assistive click toggles sprint; a physical hold still releases normally.
        if (event.detail === 0 && this._available(sprint)) {
          this._assistiveSprint = !this._assistiveSprint;
          sprint.setAttribute('aria-pressed', String(this._assistiveSprint));
        }
      });
    }

    listen(globalThis.window, 'pointermove', (event) => {
      if (event.pointerId === this._stickPointer) {
        if (event.cancelable) event.preventDefault();
        this._moveStick(event);
      }
    }, { passive: false });
    // Each surface owns its pointer. Releasing another thumb must not cancel it.
    listen(globalThis.window, 'pointerup', (event) => this._endPointer(event, true));
    listen(globalThis.window, 'pointercancel', (event) => this._endPointer(event, false));
    listen(globalThis.window, 'keydown', (event) => this._keyDown(event));
    listen(globalThis.window, 'keyup', (event) => this._keyUp(event));
    listen(globalThis.window, 'blur', () => this.clear());
    listen(globalThis.window, 'pagehide', () => this.clear());
    listen(globalThis.window, 'resize', () => this.clear());
    listen(globalThis.document, 'visibilitychange', () => {
      if (globalThis.document.hidden) this.clear();
    });
    listen(globalThis.document, 'focusin', (event) => {
      if (editable(event.target)) this.clear();
    });
  }

  _isActive() {
    return !this._destroyed && !globalThis.document?.hidden &&
      (typeof this.active === 'function' ? this.active() : this.active !== false);
  }

  _available(button) {
    return this._isActive() && !button?.disabled && button?.getAttribute?.('aria-disabled') !== 'true';
  }

  _validPointer(event) {
    return event.pointerType !== 'mouse' || event.button === 0;
  }

  _emit(name, payload) {
    if (!this._isActive()) return;
    const context = this.syncContext();
    if (name === 'pass' && !context.offense) name = 'switch';
    if ((name === 'through' || name === 'screen') && !context.offense) name = 'block';
    // Assistive clicks do not have a physical hold/release pair.
    if (name === 'shoot') {
      if (!context.offense) name = 'steal';
      else if (!context.canShoot) return;
    }
    const actionPayload = context.possessionEpoch === undefined ? payload :
      { ...payload, possessionEpoch: context.possessionEpoch };
    this.onAction(name, actionPayload);
    this.syncContext();
  }

  syncContext() {
    const context = typeof this.context === 'function' ? this.context() : this.context;
    if (this._lastContext && context.token !== this._lastContext.token) this.cancelShot();
    this._lastContext = context;
    return context;
  }

  _capture(node, id) {
    try { node?.setPointerCapture?.(id); } catch { /* A global release listener is the fallback. */ }
  }

  _release(node, id) {
    if (id === null || id === 'keyboard') return;
    try { if (node?.hasPointerCapture?.(id)) node.releasePointerCapture(id); } catch { /* Already released. */ }
  }

  _moveStick(event) {
    if (!this._isActive()) { this.clear(); return; }
    const rect = this._stickRect;
    if (!rect) return;
    const radius = Math.max(18, Math.min(rect.width, rect.height) * 0.34);
    const input = stickInput(event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2, radius);
    this._stick = { x: input.x, y: input.y };
    // Individual translate composes with any CSS transform used to center the knob.
    if (this.knob) this.knob.style.translate = `${input.px}px ${input.py}px`;
  }

  _resetStick() {
    this._stickPointer = null;
    this._stick = { x: 0, y: 0 };
    this.stick?.classList?.remove('is-pressed');
    if (this.knob) this.knob.style.translate = '0px 0px';
  }

  _releaseSprint(id) {
    this._sprintPointers.delete(id);
    if (!this._sprintPointers.size) this.sprint?.classList?.remove('is-pressed');
  }

  _startShot(owner) {
    if (this._shotOwner !== null) return;
    const context = this.syncContext();
    // Own the physical press even when shooting is temporarily unavailable.
    // Expiring a guard or gaining possession must not turn it into a new press.
    this._shotOwner = owner;
    this._shotAction = context.offense ? (context.canShoot ? 'shoot' : null) : 'steal';
    this._shotContext = context.token;
    this._shotStarted = now();
    this.shoot?.classList?.add('is-pressed');
    if (this._shotAction === 'steal') this._emit('steal');
  }

  _finishShot(fire) {
    if (this._shotOwner === null) return;
    const context = this.syncContext();
    const canFire = this._shotAction === 'shoot' && context.offense && context.canShoot &&
      this._shotContext === context.token;
    const timing = this.charge;
    const owner = this._shotOwner;
    this._shotOwner = null;
    this._shotAction = null;
    this._shotContext = null;
    this._shotStarted = 0;
    this.shoot?.classList?.remove('is-pressed');
    if (owner === 'keyboard') this._keyboardShotClickUntil = now() + 100;
    if (fire && canFire) this._emit('shoot', { timing });
  }

  _endPointer(event, fire) {
    if (event.pointerId === this._stickPointer) this._resetStick();
    this._releaseSprint(event.pointerId);
    if (event.pointerId === this._shotOwner) this._finishShot(fire);
  }

  _keyDown(event) {
    if (editable(event.target)) return;
    const key = String(event.key || '').toLowerCase();
    if (key === 'p' || key === 'escape') {
      event.preventDefault();
      if (!event.repeat) { this.clear(); this.onPause(); }
      return;
    }
    if (!this._isActive()) return;
    const space = event.code === 'Space' || key === ' ' || key === 'spacebar';
    const gameplay = space || ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',
      'j','k','shift','e','r','q','tab','l','t','1','2','3','4','c','control'].includes(key);
    if (!gameplay) return;
    event.preventDefault();
    const held = this.keys[key];
    this.keys[key] = true;
    if (event.repeat || held) return;
    if (space) this._startShot('keyboard');
    else if (key === 'j') this._emit('pass');
    else if (key === 'e') this._emit('steal');
    else if (key === 'r') this._emit('block');
    else if (key === 'q' || key === 'tab') this._emit('switch');
    else if (key === 'l') this._emit('through');
    else if (key === 't') this._emit('timeout');
    else if (/^[1-4]$/.test(key)) this._emit('play', { index: Number(key) - 1 });
  }

  _keyUp(event) {
    const key = String(event.key || '').toLowerCase();
    delete this.keys[key];
    if (event.code === 'Space' || key === ' ' || key === 'spacebar') {
      if (this._shotOwner === 'keyboard') {
        event.preventDefault();
        this._finishShot(this._isActive() && !editable(event.target));
      }
    }
  }

  get charging() { return this._shotOwner !== null && this._shotAction === 'shoot'; }
  get charge() { return this.charging ? clamp01((now() - this._shotStarted) / SHOT_HOLD_MS) : 0; }

  cancelShot() {
    // Cancel intent, not ownership: a held thumb/key must still be released.
    this._shotAction = null;
    this._shotContext = null;
    this._shotStarted = 0;
    this.shoot?.classList?.remove('is-pressed');
  }

  read() {
    if (!this._isActive()) { this.clear(); return { x: 0, y: 0, sprint: false, contain: false }; }
    this.syncContext();
    const movement = movementInput(this._stick, this.keys);
    const settings = typeof this.settings === 'function' ? this.settings() : this.settings;
    return { x: movement.x, y: -movement.y,
      sprint: !!(this.keys.k || this.keys.shift || this._sprintPointers.size || this._assistiveSprint),
      contain: !!(this.keys.c || this.keys.control || settings?.contain) };
  }

  clear() {
    const stickId = this._stickPointer;
    const shotId = this._shotOwner;
    const sprintIds = [...this._sprintPointers];
    this.keys = Object.create(null);
    this._resetStick();
    this._finishShot(false);
    this._lastContext = null;
    this._sprintPointers.clear();
    this._assistiveSprint = false;
    this.sprint?.classList?.remove('is-pressed');
    this.sprint?.setAttribute?.('aria-pressed', 'false');
    this._release(this.stick, stickId);
    this._release(this.shoot, shotId);
    for (const id of sprintIds) this._release(this.sprint, id);
  }

  destroy() {
    this.clear();
    this._destroyed = true;
    for (const remove of this._listeners) remove();
    this._listeners.length = 0;
  }
}
