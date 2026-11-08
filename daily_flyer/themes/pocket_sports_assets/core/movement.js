import { clamp } from "./math.js";
// Callers supply normalized axes. Shared by live play and dead-ball marking.
export function movePlayer(p, rules, dt, input, carrying = false) {
  let tx = Number.isFinite(input.x) ? input.x : 0;
  let ty = Number.isFinite(input.y) ? input.y : 0;
  const burst = input.sprint && p.stamina > 0.12;
  if (p.stun > 0) tx = ty = 0;
  p.stamina = clamp(p.stamina + (burst ? -0.24 : 0.13) * dt, 0, 1);
  const speed =
    (p.keeper ? rules.keeperSpeed : rules.speed) *
    (burst ? 1.32 : 1) *
    (carrying ? 0.93 : 1);
  const gain = 1 - Math.exp(-rules.accel * dt);
  if (Math.hypot(tx, ty) > 0.02) {
    p.vx += (tx * speed - p.vx) * gain;
    p.vy += (ty * speed - p.vy) * gain;
    p.fx = tx;
    p.fy = ty;
  } else {
    const drag = Math.exp(-rules.drag * dt);
    p.vx *= drag;
    p.vy *= drag;
  }
  p.x = clamp(p.x + p.vx * dt, 18, rules.width - 18);
  p.y = clamp(p.y + p.vy * dt, 18, rules.height - 18);
}
