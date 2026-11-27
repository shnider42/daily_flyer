/** Shared throw model. Distances are metres, velocities metres/second. */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
export const BASE_TOUCH_RADIUS = .28;
export const THROW_GRAVITY = 9.81;

export function armVelocity(arm = .6) { return 18 + clamp(arm, 0, 1) * 23; }

/**
 * A fielder chooses an initial trajectory, not a guaranteed receiver. A short
 * throw uses a low arc; a long throw exceeds a weak arm's airborne carry and
 * naturally skips. Noise is supplied by the authoritative seeded simulation.
 */
export function planThrow(from, target, { arm = .6, accuracy = .75, rush = 0, lateral = 0, depth = 0, badThrow = false } = {}) {
  const dx = target.x - from.x, dz = target.z - from.z, range = Math.hypot(dx, dz);
  const ux = range > 1e-6 ? dx / range : 0, uz = range > 1e-6 ? dz / range : 1;
  const scatter = .045 + range * .004 * (1 - clamp(accuracy, 0, 1)) + rush * .16;
  const miss = scatter + (badThrow ? 1.35 + range * .025 : 0);
  const to = { x: target.x + uz * lateral * miss + ux * depth * miss * .35,
    y: target.y ?? 1.25, z: target.z - ux * lateral * miss + uz * depth * miss * .35 };
  const vxz = Math.hypot(to.x - from.x, to.z - from.z);
  const speed = Math.min(armVelocity(arm) * (1 - rush * .065), 12 + vxz * .8);
  const height = to.y - from.y, speed2 = speed * speed;
  const root = speed2 * speed2 - THROW_GRAVITY * (THROW_GRAVITY * vxz * vxz + 2 * height * speed2);
  // Above about 23 degrees the deliberate long hop is faster than a rainbow.
  const ideal = root >= 0 && vxz > .01 ? Math.atan((speed2 - Math.sqrt(root)) / (THROW_GRAVITY * vxz)) : Math.PI / 4;
  const angle = clamp(ideal, .015, (.32 + clamp(arm, 0, 1) * .10));
  const horizontal = Math.cos(angle) * speed, vertical = Math.sin(angle) * speed;
  return { to, speed, angle, vx: (to.x - from.x) / Math.max(.001, vxz) * horizontal,
    vy: vertical, vz: (to.z - from.z) / Math.max(.001, vxz) * horizontal,
    duration: Math.max(.12, vxz / Math.max(1, horizontal)), carry: horizontal * (vertical + Math.sqrt(vertical * vertical + 2 * THROW_GRAVITY * from.y)) / THROW_GRAVITY,
    badThrow };
}

/** One fixed tick with true gravity, energy loss and low grass hops. */
export function stepThrow(ball, dt, radius = .037) {
  const grounded = ball.y <= radius + 1e-7 && Math.abs(ball.vy) < .10;
  if (grounded) {
    const speed = Math.hypot(ball.vx, ball.vz), loss = Math.max(0, speed - 2.65 * dt) / Math.max(1e-9, speed);
    ball.vx *= loss; ball.vz *= loss; ball.vy = 0;
    ball.x += ball.vx * dt; ball.z += ball.vz * dt; ball.y = radius;
    return false;
  }
  const nextY = ball.y + ball.vy * dt - .5 * THROW_GRAVITY * dt * dt;
  ball.x += ball.vx * dt; ball.z += ball.vz * dt;
  ball.vy -= THROW_GRAVITY * dt;
  ball.y = nextY;
  if (nextY < radius) {
    ball.y = radius;
    ball.vy = Math.abs(ball.vy) > .75 ? Math.abs(ball.vy) * .43 : 0;
    ball.vx *= .90; ball.vz *= .90;
    ball.bounced = true; ball.groundBounced = true;
    return true;
  }
  return false;
}
