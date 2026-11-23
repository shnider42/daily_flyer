const finite = value => Number.isFinite(value) ? value : 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Convert a thumb displacement in CSS pixels to an analog input vector. */
export function stickVector(dx, dy, radius, deadZone = .12) {
  if (![dx, dy, radius, deadZone].every(Number.isFinite) || radius <= 0 || deadZone < 0 || deadZone >= 1) {
    return { x: 0, y: 0, magnitude: 0 };
  }
  const length = Math.hypot(dx, dy);
  const magnitude = clamp(length / radius, 0, 1);
  if (magnitude <= deadZone || !length) return { x: 0, y: 0, magnitude };
  const strength = (magnitude - deadZone) / (1 - deadZone);
  return { x: dx / length * strength, y: dy / length * strength, magnitude };
}

/** Separate precise aiming from firing and keep sprinting out of aimed movement. */
export function touchIntent({ moveX = 0, moveY = 0, aimX = 0, aimY = 0, aimStrength = 0, blocked = false } = {}) {
  const neutral = { moveX: 0, moveY: 0, aiming: false, firing: false, sprint: false };
  if (blocked) return neutral;
  moveX = finite(moveX); moveY = finite(moveY);
  const length = Math.hypot(moveX, moveY);
  if (length > 1) { moveX /= length; moveY /= length; }
  const strength = clamp(finite(aimStrength), 0, 1);
  const hasAim = Number.isFinite(aimX) && Number.isFinite(aimY) && Math.hypot(aimX, aimY) > 0;
  const aiming = hasAim && strength > .12;
  return {
    moveX,
    moveY,
    aiming,
    firing: aiming && strength >= .56,
    sprint: Math.hypot(moveX, moveY) >= .92 && !aiming
  };
}

/** A battlefield tap is independent of either captured joystick pointer. */
export class GroundOrderTap {
  constructor({ slop = 12, duration = 450 } = {}) { this.slop = slop; this.duration = duration; this.pending = null; }
  begin(id, x, y, time) {
    if (this.pending || ![x,y,time].every(Number.isFinite)) return false;
    this.pending = { id, x, y, time }; return true;
  }
  move(id, x, y) {
    const tap = this.pending;
    if (tap?.id === id && (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x-tap.x,y-tap.y) > this.slop)) this.pending = null;
  }
  end(id, x, y, time) {
    const tap = this.pending;
    if (!tap || tap.id !== id) return false;
    this.pending = null;
    return [x,y,time].every(Number.isFinite) && time >= tap.time && time-tap.time <= this.duration && Math.hypot(x-tap.x,y-tap.y) <= this.slop;
  }
  cancel(id) { if (id === undefined || this.pending?.id === id) this.pending = null; }
}
