import { CONTROL_ACTIONS, createDefaultBindings, eventToken, bindingLabel, actionLabel, rebindControl } from './control-bindings.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);

/** The editor captures input before gameplay. A conflicting binding is only moved
 * after the player has reviewed which existing action will lose that shortcut. */
export class ControlsEditor {
  constructor({ getBindings, onChange, onCapture = () => {} }) {
    this.getBindings = getBindings; this.onChange = onChange; this.onCapture = onCapture;
    this.capture = null; this.lastRender = ''; this.swallowClick = false; this.suppressUntil = 0; this.suppressedPointer = null;
    this.rows = document.getElementById('bindingRows');
    this.banner = document.getElementById('bindingCapture');
    this.banner.tabIndex = -1;
    this.title = document.getElementById('bindingCaptureTitle');
    this.detail = document.getElementById('bindingCaptureDetail');
    this.replace = document.getElementById('bindingReplace');
    this.status = document.getElementById('bindingStatus');
    this.rows.addEventListener('click', event => {
      const button = event.target.closest('[data-binding-action]');
      if (button) this.begin(button.dataset.bindingAction, Number(button.dataset.bindingSlot));
    });
    document.getElementById('bindingCancel').addEventListener('click', () => this.cancel());
    document.getElementById('bindingClear').addEventListener('click', () => this.assign(null));
    this.replace.addEventListener('click', () => { if (this.capture) this.assign(this.capture.token, true); });
    document.getElementById('bindingsReset').addEventListener('click', () => {
      this.cancel(false); this.onCapture(); this.onChange(createDefaultBindings());
      this.status.textContent = 'Default keyboard and mouse controls restored.';
    });
    const dialog = document.getElementById('settingsDialog');
    dialog.addEventListener('close', () => this.cancel(false));
    dialog.addEventListener('focusin', event => {
      if (this.capture && !this.banner.contains(event.target) && !this.rows.contains(event.target)) this.cancel(false);
    });
    document.addEventListener('keydown', event => this.captureEvent(event), true);
    document.addEventListener('pointerdown', event => this.captureEvent(event), true);
    document.addEventListener('click', event => {
      if (!this.swallowClick || event.detail === 0 || this.suppressedPointer !== null && Number.isInteger(event.pointerId) && event.pointerId !== this.suppressedPointer) return;
      this.swallowClick = false; event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    document.addEventListener('pointerup', event => {
      if (event.pointerId !== this.suppressedPointer) return;
      const pointer = this.suppressedPointer;
      this.suppressUntil = performance.now() + 150;
      // Click/auxclick follows pointerup in this event turn. A cancelled drag may
      // have no click, so do not leave a flag that eats the player's next click.
      setTimeout(() => {
        if (this.suppressedPointer === pointer) { this.swallowClick = false; this.suppressedPointer = null; }
      }, 0);
    }, true);
    document.addEventListener('pointercancel', event => {
      if (event.pointerId === this.suppressedPointer) { this.swallowClick = false; this.suppressedPointer = null; this.suppressUntil = 0; }
    }, true);
    window.addEventListener('blur', () => { this.swallowClick = false; this.suppressedPointer = null; this.suppressUntil = 0; });
    for (const type of ['auxclick', 'contextmenu']) document.addEventListener(type, event => {
      if (this.capture || this.suppressedPointer !== null || performance.now() < this.suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    this.sync();
  }
  sync() {
    const bindings = this.getBindings(), key = JSON.stringify(bindings);
    if (key !== this.lastRender) {
      let group = '';
      this.rows.innerHTML = CONTROL_ACTIONS.map(action => {
        const heading = action.group !== group ? `<h4>${escape(action.group)}</h4>` : ''; group = action.group;
        return `${heading}<div class="binding-row"><div class="binding-action"><strong>${escape(action.label)}</strong><small>${escape(action.description)}</small></div><div class="binding-slots">${[0,1].map(slot => `<button type="button" data-binding-action="${action.id}" data-binding-slot="${slot}" aria-label="${escape(action.label)}, ${slot ? 'alternate' : 'primary'} binding: ${escape(bindingLabel(bindings[action.id]?.[slot]))}">${escape(bindingLabel(bindings[action.id]?.[slot]))}</button>`).join('')}</div></div>`;
      }).join('');
      const reference = document.getElementById('controlReference');
      if (reference) reference.innerHTML = CONTROL_ACTIONS.map(action => `<div><kbd>${escape(actionLabel(action.id, bindings))}</kbd><span>${escape(action.label)}</span></div>`).join('');
      this.lastRender = key;
    }
    for (const button of this.rows.querySelectorAll('[data-binding-action]')) button.classList.toggle('listening', !!this.capture && button.dataset.bindingAction === this.capture.action && Number(button.dataset.bindingSlot) === this.capture.slot);
  }
  begin(action, slot) {
    this.onCapture(); this.capture = { action, slot, token: null }; this.banner.hidden = false; this.replace.hidden = true;
    const definition = CONTROL_ACTIONS.find(item => item.id === action);
    this.title.textContent = `Set ${definition.label.toLowerCase()}`;
    this.detail.textContent = 'Press a key or click a mouse button on empty space. Tab reaches these buttons. Escape cancels.';
    this.sync(); this.banner.focus({ preventScroll: true }); this.banner.scrollIntoView({ block: 'nearest' });
  }
  captureEvent(event) {
    if (!this.capture) return;
    const captureButton = event.target.closest?.('#bindingCapture button, [data-binding-action], #bindingsReset');
    if (event.type === 'keydown' && (event.code === 'Tab' || captureButton && ['Enter', 'Space'].includes(event.code))) return;
    if (event.type === 'pointerdown') {
      if (captureButton || event.pointerType === 'touch') return;
      if (event.target.closest?.('#settingsDialog button, #settingsDialog input, #settingsDialog select, #settingsDialog a')) { this.cancel(false); return; }
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.type === 'pointerdown') { this.swallowClick = event.button === 0; this.suppressedPointer = event.pointerId; this.suppressUntil = performance.now() + 700; }
    if (event.code === 'Escape') { this.cancel(); return; }
    if (event.repeat) return;
    const token = eventToken(event);
    if (!token) { this.detail.textContent = 'That key is reserved for the browser. Choose a letter, number, arrow, Shift, or a mouse button. Escape cancels.'; return; }
    this.assign(token);
  }
  assign(token, resolveConflict = false) {
    if (!this.capture) return;
    const { action, slot } = this.capture;
    const result = rebindControl(this.getBindings(), action, slot, token, { resolveConflict });
    if (!result.ok) {
      this.capture.token = token;
      this.detail.textContent = result.conflicts.length ? `${bindingLabel(token)} currently controls ${result.conflicts.map(c => c.label.toLowerCase()).join(', ')}. Move it here and remove that shortcut from the other action?` : result.reason;
      this.replace.hidden = !result.conflicts.length;
      if (result.conflicts.length) this.replace.focus({ preventScroll: true });
      return;
    }
    const label = CONTROL_ACTIONS.find(item => item.id === action).label;
    this.capture = null; this.banner.hidden = true; this.onCapture(); this.onChange(result.bindings); this.sync();
    this.status.textContent = `${label}: ${actionLabel(action, result.bindings)}. Saved on this device.`;
    this.rows.querySelector(`[data-binding-action="${action}"][data-binding-slot="${slot}"]`)?.focus({ preventScroll: true });
  }
  cancel(focus = true) {
    const previous = this.capture;
    this.capture = null; this.banner.hidden = true; this.sync();
    if (previous) {
      this.status.textContent = 'Binding unchanged.';
      if (focus) this.rows.querySelector(`[data-binding-action="${previous.action}"][data-binding-slot="${previous.slot}"]`)?.focus({ preventScroll: true });
    }
  }
}
