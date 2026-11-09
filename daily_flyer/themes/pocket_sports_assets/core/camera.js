// Shared presentation-only camera. All measurements are in playing-area units;
// input, collision positions, and the simulation never pass through this module.
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const elapsed = dt => clamp(finite(dt, 1 / 60), 0, 0.1);

export function easeValue(current, target, dt, seconds = 0.22) {
  if (!Number.isFinite(current)) return finite(target, 0);
  target = finite(target, current);
  const amount = 1 - Math.exp(-elapsed(dt) / Math.max(0.01, finite(seconds, 0.22)));
  return Math.abs(target - current) < 0.00001 ? target : current + (target - current) * amount;
}

export function clampCameraCenter(center, viewSize, worldSize) {
  const world = Math.max(1, finite(worldSize, 1));
  const view = Math.max(1, finite(viewSize, world));
  return view >= world ? world / 2 : clamp(finite(center, world / 2), view / 2, world - view / 2);
}

function followAxis(current, focus, viewSize, dt, steady) {
  const delta = focus - current;
  const deadZone = viewSize * (steady ? 0.22 : 0.15);
  if (Math.abs(delta) <= deadZone || dt <= 0) return current;

  // The play may move naturally in the central region. A pass or loose puck
  // nearing an edge gets progressively faster catch-up, still velocity limited.
  const edge = clamp((Math.abs(delta) / viewSize - 0.34) / 0.24, 0, 1);
  const seconds = (steady ? 0.48 : 0.24) * (1 - edge) + 0.09 * edge;
  const desired = focus - Math.sign(delta) * deadZone;
  const next = easeValue(current, desired, dt, seconds);
  const limit = viewSize * ((steady ? 1.0 : 1.5) + 1.5 * edge) * dt;
  return current + clamp(next - current, -limit, limit);
}

export class SoftCamera {
  constructor() { this.reset(); }

  reset() {
    this.x = null;
    this.y = null;
    this.worldWidth = null;
    this.worldHeight = null;
  }

  update({ x, y, dt = 1 / 60, viewWidth, viewHeight, worldWidth, worldHeight, snap = false, steady = false } = {}) {
    const width = Math.max(1, finite(worldWidth, 1));
    const height = Math.max(1, finite(worldHeight, 1));
    const vw = Math.max(1, finite(viewWidth, width));
    const vh = Math.max(1, finite(viewHeight, height));
    const focusX = clamp(finite(x, width / 2), 0, width);
    const focusY = clamp(finite(y, height / 2), 0, height);
    const changedWorld = width !== this.worldWidth || height !== this.worldHeight;
    if (this.x === null || snap || changedWorld) {
      this.x = focusX;
      this.y = focusY;
    } else {
      this.x = followAxis(this.x, focusX, vw, elapsed(dt), Boolean(steady));
      this.y = followAxis(this.y, focusY, vh, elapsed(dt), Boolean(steady));
    }
    this.x = clampCameraCenter(this.x, vw, width);
    this.y = clampCameraCenter(this.y, vh, height);
    this.worldWidth = width;
    this.worldHeight = height;
    return { x: this.x, y: this.y };
  }
}
