export function resolveTouchPreset(saved, { coarse = false, width = 1024, height = 768 } = {}) {
  if (['compact', 'standard', 'large'].includes(saved)) return saved;
  return coarse && Math.min(width, height) <= 600 ? 'compact' : 'standard';
}

// Movement follows the live pad dimensions, so all presets reach full speed.
// Pointer capture permits the thumb to continue dragging beyond the visible pad.
export function joystickVector(bounds, clientX, clientY) {
  const radius = Math.max(1, Math.min(bounds.width, bounds.height) * .33);
  let dx = clientX - (bounds.left + bounds.width / 2);
  let dy = clientY - (bounds.top + bounds.height / 2);
  const length = Math.hypot(dx, dy);
  if (length > radius) { dx = dx / length * radius; dy = dy / length * radius; }
  const x = dx / radius, y = dy / radius;
  return { x: Math.abs(x) < .1 ? 0 : x, y: Math.abs(y) < .1 ? 0 : y, dx, dy };
}

export const FIRE_HOLD_MS = 200;
export const FIRE_DRAG_PX = 8;

export function resolveFireGesture(saved) {
  return saved === 'classic' ? 'classic' : 'safe';
}

// The same state machine is used by browser pointer handlers and fake-time tests.
// A pointer's origin is fixed at pointerdown: crossing the fire control cannot
// promote a look gesture. No timers survive cancellation or a lifecycle change.
export class TouchFireGestures {
  constructor({ mode = 'safe', holdMs = FIRE_HOLD_MS, dragPx = FIRE_DRAG_PX } = {}) {
    this.mode = resolveFireGesture(mode);
    this.holdMs = holdMs;
    this.dragPx = dragPx;
    this.pointers = new Map();
  }

  setMode(mode) { this.cancel(); this.mode = resolveFireGesture(mode); }

  begin({ pointerId, x, y, time, source = 'look', mode = this.mode }) {
    if (this.pointers.has(pointerId) || source === 'fire' && [...this.pointers.values()].some(pointer => pointer.source === 'fire')) return { accepted: false, pulse: false };
    const classic = source === 'fire' && resolveFireGesture(mode) === 'classic';
    this.pointers.set(pointerId, { source, phase: source === 'look' ? 'look' : classic ? 'armed' : 'pending', startedAt: time, startX: x, startY: y, lastX: x, lastY: y });
    return { accepted: true, pulse: classic };
  }

  move({ pointerId, x, y }) {
    const pointer = this.pointers.get(pointerId);
    if (!pointer) return { dx: 0, dy: 0, phase: null };
    const dx = x - pointer.lastX, dy = y - pointer.lastY;
    pointer.lastX = x; pointer.lastY = y;
    if (pointer.phase === 'pending' && Math.hypot(x - pointer.startX, y - pointer.startY) >= this.dragPx) pointer.phase = 'look';
    return { dx, dy, phase: pointer.phase };
  }

  sample(time) {
    for (const pointer of this.pointers.values()) {
      if (pointer.phase === 'pending' && time - pointer.startedAt >= this.holdMs) pointer.phase = 'armed';
    }
    const pointers = [...this.pointers.values()];
    return {
      firing: pointers.some(pointer => pointer.phase === 'armed'),
      pending: pointers.some(pointer => pointer.phase === 'pending'),
      fireLooking: pointers.some(pointer => pointer.source === 'fire' && pointer.phase === 'look'),
      blocksAutoFire: pointers.some(pointer => pointer.phase !== 'armed'),
    };
  }

  end({ pointerId, x, y }) {
    const pointer = this.pointers.get(pointerId);
    if (!pointer) return { pulse: false };
    // Some browsers coalesce the final movement into pointerup.
    this.move({ pointerId, x, y });
    const pulse = pointer.phase === 'pending';
    this.pointers.delete(pointerId);
    return { pulse };
  }

  cancel(pointerId) {
    if (pointerId === undefined) this.pointers.clear();
    else this.pointers.delete(pointerId);
  }
}
