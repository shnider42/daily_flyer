export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const norm = (x, y) => {
  const n = Math.hypot(x, y) || 1;
  return { x: x / n, y: y / n };
};
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = clamp(
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      0,
      1,
    );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export class FixedClock {
  constructor(step) {
    this.step = step;
    this.acc = 0;
  }
  advance(dt) {
    this.acc += clamp(dt, 0, 0.12);
    while (this.acc >= 1 / 60) {
      this.step(1 / 60);
      this.acc -= 1 / 60;
    }
  }
  reset() {
    this.acc = 0;
  }
}

// A clockwise landscape camera turns world-up into screen-right.
export function screenToWorld(input, rotated = false) {
  return rotated ? { ...input, x: input.y, y: -input.x } : { ...input };
}
