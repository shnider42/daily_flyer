// Pointer ownership belongs to the minimap only. A second thumb can keep the
// movement stick held while this surface pans the camera.
const clamp = value => Math.max(0, Math.min(1, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function bindMinimapInput(element, {
  getViewRect = () => null,
  onPan,
  onStart = () => {},
  onEnd = () => {},
  onFollow = () => {},
  enabled = () => true,
} = {}) {
  let drag = null;
  const document = element.ownerDocument;
  const window = document?.defaultView;
  const removers = [];
  const consume = event => {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };
  const listen = (target, name, listener) => {
    if (!target?.addEventListener) return;
    const options = { capture: true, passive: false };
    target.addEventListener(name, listener, options);
    removers.push(() => target.removeEventListener(name, listener, options));
  };
  const point = event => {
    const bounds = element.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) / Math.max(1, bounds.height),
    };
  };
  const center = () => {
    const rect = getViewRect();
    return rect ? { x: finite(rect.x + rect.width / 2, 0.5), y: finite(rect.y + rect.height / 2, 0.5) } : { x: 0.5, y: 0.5 };
  };
  const pan = (p, phase, source) => onPan?.({ x: clamp(finite(p.x, 0.5)), y: clamp(finite(p.y, 0.5)), phase, source });
  const finish = (cancelled, event) => {
    if (!drag) return;
    const held = drag;
    drag = null;
    try {
      if (element.hasPointerCapture?.(held.id)) element.releasePointerCapture(held.id);
    } catch { /* A removed element or browser cancellation can release first. */ }
    element.classList?.remove('is-dragging');
    onEnd({ cancelled, source: event?.pointerType || held.source });
  };
  const cancel = () => finish(true);

  listen(element, 'pointerdown', event => {
    if (!enabled() || event.button !== undefined && event.button !== 0) return;
    consume(event);
    if (drag) return;
    const p = point(event), rect = getViewRect();
    const inside = rect && p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
    const c = center();
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: inside ? p.x - c.x : 0, offsetY: inside ? p.y - c.y : 0,
      moved: false, source: event.pointerType || 'mouse' };
    try { element.setPointerCapture(event.pointerId); } catch { /* Capture is best effort if the surface was detached. */ }
    element.focus?.({ preventScroll: true });
    if (!drag) return;
    element.classList?.add('is-dragging');
    onStart();
    if (!drag) return;
    pan({ x: p.x - drag.offsetX, y: p.y - drag.offsetY }, 'start', drag.source);
  });
  listen(element, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    consume(event);
    if (!enabled()) return cancel();
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) drag.moved = true;
    // Ignore tiny touch jitter on a tap; a deliberate drag tracks continuously.
    if (!drag.moved) return;
    const p = point(event);
    pan({ x: p.x - drag.offsetX, y: p.y - drag.offsetY }, 'move', drag.source);
  });
  listen(element, 'pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    consume(event);
    if (enabled()) {
      const p = point(event);
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) drag.moved = true;
      // A tap centers the exact spot. A dragged viewport retains its grab offset.
      pan({ x: p.x - (drag.moved ? drag.offsetX : 0), y: p.y - (drag.moved ? drag.offsetY : 0) }, 'end', drag.source);
    }
    finish(false, event);
  });
  for (const name of ['pointercancel', 'lostpointercapture']) listen(element, name, event => {
    if (!drag || event.pointerId !== drag.id) return;
    consume(event);
    finish(true, event);
  });
  // Do not let compatibility clicks select a player beneath/around the map.
  listen(element, 'click', consume);
  listen(element, 'dblclick', consume);
  const keys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'Enter', ' ']);
  listen(element, 'keydown', event => {
    if (!keys.has(event.key) || !enabled()) return;
    consume(event);
    if (event.key === 'Enter' || event.key === ' ') {
      if (!event.repeat) { cancel(); onFollow(); }
      return;
    }
    const p = center(), step = event.shiftKey ? 0.01 : 0.05;
    if (event.key === 'Home') { p.x = 0.5; p.y = 0.5; }
    else if (event.key === 'ArrowLeft') p.x -= step;
    else if (event.key === 'ArrowRight') p.x += step;
    else if (event.key === 'ArrowUp') p.y -= step;
    else if (event.key === 'ArrowDown') p.y += step;
    onStart();
    pan(p, 'end', 'keyboard');
    onEnd({ cancelled: false, source: 'keyboard' });
  });
  // Key-up must still reach gameplay: a movement key may have been held before
  // the map received focus. Consuming its release would leave that key stuck.
  listen(element, 'keyup', event => { if (keys.has(event.key) && event.cancelable) event.preventDefault(); });
  // Capture sees child blur events too. Moving focus onto the map must not
  // cancel the drag; only the browser window losing focus should do that.
  listen(window, 'blur', event => { if (event.target === window) cancel(); });
  listen(document, 'visibilitychange', () => { if (document.hidden) cancel(); });

  return {
    get activePointerId() { return drag?.id ?? null; },
    cancel,
    destroy() { cancel(); removers.forEach(remove => remove()); },
  };
}
