import { clamp, distance, norm, segmentDistance } from "../core/math.js";

// New actions have their own ball/contact parameters; existing running speed,
// pitch size, difficulty profiles and restart waits remain in the shared rules.
export const FOOTBALL_HEIGHT = { gravity: 620, foot: 18, keeper: 42, bar: 48 };
const LANDING_SPEED = 0.48;
const SLIDE = { moving: 0.36, recovery: 0.46, speed: 360, drag: 3, reach: 30, cooldown: 1.15 };

export function resetFootballFlight(ball) {
  ball.z = 0;
  ball.vz = 0;
  ball.airTime = 0;
  ball.airTarget = null;
}

export function clearFootballActions(g) {
  const held = g.defensiveHeld || {};
  g.blockedDefensiveHolds = {
    contain: Boolean(held.contain),
    keeperRush: Boolean(held.keeperRush),
  };
  for (const p of g.players) {
    if (p.slideTimer > 0) p.vx = p.vy = 0;
    p.slideTimer = 0;
    p.slideMoveTime = 0;
    p.sliding = false;
    p.slideDir = null;
    p.slideHit = false;
    p.containing = false;
    p.keeperRushing = false;
  }
}

export function footballDefensiveHolds(g, input) {
  const defending = g.phase === "play" && !g.hasBall && !g.autoplay;
  const blocked = g.blockedDefensiveHolds || {};
  const active = {};
  g.defensiveHeld = {};
  for (const name of ["contain", "keeperRush"]) {
    const held = Boolean(input[name]);
    g.defensiveHeld[name] = held;
    if (!held) blocked[name] = false;
    else if (!defending) blocked[name] = true;
    active[name] = defending && held && !blocked[name];
  }
  g.blockedDefensiveHolds = blocked;
  return active;
}

export function footballCanCross(g, p = g.user) {
  if (g.sport !== "soccer" || !p || p.keeper) return false;
  if (g.restartData?.taker === p.id && g.restartData.type === "THROW-IN") return false;
  const restart = ["restart", "restart_ready"].includes(g.phase) && g.restartData;
  if (restart) {
    if (restart.taker !== p.id || restart.type === "THROW-IN") return false;
    if (restart.type === "CORNER") return true;
  } else if (g.phase !== "play" || g.ball.owner !== p.id) return false;
  const fromGoal = p.side ? g.rules.height - p.y : p.y;
  return fromGoal < g.rules.height * 0.32 &&
    Math.abs(p.x - g.rules.width / 2) > g.rules.width * 0.24;
}

function passDirection(p, input) {
  const x = Number.isFinite(input.x) ? input.x : 0;
  const y = Number.isFinite(input.y) ? input.y : 0;
  return Math.hypot(x, y) > 0.2 ? norm(x, y) : { x: 0, y: p.side ? 1 : -1 };
}

function chooseReceiver(g, p, input, kind, power) {
  const direction = passDirection(p, input);
  const mates = g.players.filter((q) => q.side === p.side && q.id !== p.id && !q.keeper);
  const attack = p.side ? 1 : -1;
  const ideal = { x: g.rules.width / 2, y: p.side ? g.rules.height - 155 : 155 };
  const desiredRange = g.rules.width * (0.28 + 0.22 * power);
  const score = (q) => {
    if (kind === "cross") return -distance(q, ideal) - Math.abs(q.x - ideal.x) * 0.18;
    const d = distance(p, q);
    const alignment = ((q.x - p.x) * direction.x + (q.y - p.y) * direction.y) / (d || 1);
    if (kind === "lob") return alignment * 160 - Math.abs(d - desiredRange) * 0.15;
    return alignment * 160 - d * 0.12 + (q.y - p.y) * attack * 0.025;
  };
  return mates.sort((a, b) => score(b) - score(a))[0];
}

export function footballThroughPass(g, p = g.user, input = { x: 0, y: 0 }) {
  if (g.sport !== "soccer" || !p || g.phase !== "play" || g.ball.owner !== p.id || p.slideTimer > 0)
    return false;
  const q = chooseReceiver(g, p, input, "through", 0.65);
  if (!q) return false;
  const flightTime = clamp(distance(p, q) / g.rules.pass + 0.22, 0.42, 1.5);
  const lead = clamp(g.rules.speed * (flightTime - 0.15) * 0.72, 32, 135);
  const running = Math.hypot(q.vx, q.vy) > 30
    ? norm(q.vx, q.vy)
    : passDirection(p, input);
  const target = {
    x: clamp(q.x + running.x * lead, 30, g.rules.width - 30),
    y: clamp(q.y + running.y * lead, 38, g.rules.height - 38),
  };
  // Account for normal ground drag, so a short through ball is playable and a
  // long one still asks the runner to reach space rather than changing owner.
  const speed = clamp(
    distance(p, target) * g.rules.ballDrag / (1 - Math.exp(-g.rules.ballDrag * flightTime)),
    210,
    g.rules.pass * 1.22,
  );
  g.release(p, target.x - p.x, target.y - p.y, speed, false);
  Object.assign(g.ball, {
    receiver: q.id,
    passType: "through",
    passTarget: target,
    passer: p.id,
    passerLock: 0.28,
    lock: clamp((distance(p, q) - 29) / speed, 0.025, 0.18),
  });
  return true;
}

export function footballLobPass(g, p = g.user, input = { x: 0, y: 0 }, power = 0.65) {
  if (g.sport !== "soccer" || !p || g.phase !== "play" || g.ball.owner !== p.id || p.slideTimer > 0)
    return false;
  const strength = clamp(power, 0, 1);
  const kind = footballCanCross(g, p) ? "cross" : "lob";
  const q = chooseReceiver(g, p, input, kind, strength);
  if (!q) return false;
  const attack = p.side ? 1 : -1;
  const depth = p.side ? g.rules.height - q.y : q.y;
  const target = kind === "cross"
    ? {
        x: clamp(q.x + q.vx * 0.18, g.rules.width / 2 - g.rules.goal * 1.05, g.rules.width / 2 + g.rules.goal * 1.05),
        y: p.side ? g.rules.height - clamp(depth - 32, 70, 255) : clamp(depth - 32, 70, 255),
      }
    : {
        x: clamp(q.x + q.vx * 0.24, 30, g.rules.width - 30),
        y: clamp(q.y + q.vy * 0.24 + attack * 12, 38, g.rules.height - 38),
      };
  const duration = clamp(0.65 + distance(p, target) / 760, 0.7, 1.65);
  g.release(p, target.x - p.x, target.y - p.y, distance(p, target) / duration, false);
  Object.assign(g.ball, {
    z: 0,
    vz: FOOTBALL_HEIGHT.gravity * duration / 2,
    airTime: duration,
    airTarget: { ...target },
    passTarget: { ...target },
    passType: kind,
    receiver: q.id,
    passer: p.id,
    passerLock: 0.28,
  });
  g.emit(kind, { side: p.side });
  return true;
}

export function stepFootballBall(g, dt) {
  const b = g.ball;
  let groundTime = dt;
  if ((b.z || 0) > 0 || (b.vz || 0) > 0) {
    const z = Math.max(0, b.z || 0), vz = b.vz || 0;
    const remaining = (vz + Math.sqrt(vz * vz + 2 * FOOTBALL_HEIGHT.gravity * z)) / FOOTBALL_HEIGHT.gravity;
    const airStep = Math.min(dt, remaining);
    b.x += b.vx * airStep;
    b.y += b.vy * airStep;
    b.z = Math.max(0, z + vz * airStep - FOOTBALL_HEIGHT.gravity * airStep * airStep / 2);
    b.vz = vz - FOOTBALL_HEIGHT.gravity * airStep;
    b.airTime = Math.max(0, remaining - airStep);
    groundTime -= airStep;
    if (b.airTime < 0.000001) {
      resetFootballFlight(b);
      b.vx *= LANDING_SPEED;
      b.vy *= LANDING_SPEED;
    }
  }
  if (groundTime > 0) {
    b.x += b.vx * groundTime;
    b.y += b.vy * groundTime;
    const decay = Math.exp(-g.rules.ballDrag * groundTime);
    b.vx *= decay;
    b.vy *= decay;
  }
  if (b.passTarget && !b.airTarget &&
      (b.passTarget.x - b.x) * b.vx + (b.passTarget.y - b.y) * b.vy < 0)
    b.passTarget = null;
}

// Height at the contact/crossing fraction, rather than the frame's final height.
export function footballHeightAt(old, ball, fraction) {
  if (old.dt && ((old.z || 0) > 0 || (old.vz || 0) > 0)) {
    const z = Math.max(0, old.z || 0), vz = old.vz || 0;
    const landingTime = (vz + Math.sqrt(vz * vz + 2 * FOOTBALL_HEIGHT.gravity * z)) / FOOTBALL_HEIGHT.gravity;
    let time = old.dt * clamp(fraction, 0, 1);
    if (landingTime < old.dt) {
      // Touchdown slows horizontal travel within this step. A fraction of the
      // swept line is therefore not the same fraction of elapsed time.
      const travel = clamp(fraction, 0, 1) * (landingTime + LANDING_SPEED * (old.dt - landingTime));
      time = travel <= landingTime ? travel : landingTime + (travel - landingTime) / LANDING_SPEED;
    }
    return Math.max(0, z + vz * time - FOOTBALL_HEIGHT.gravity * time * time / 2);
  }
  return Math.max(0, (old.z || 0) + ((ball.z || 0) - (old.z || 0)) * clamp(fraction, 0, 1));
}

export function footballReachable(p, old, ball) {
  const dx = ball.x - old.x, dy = ball.y - old.y;
  const fraction = clamp(((p.x - old.x) * dx + (p.y - old.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return footballHeightAt(old, ball, fraction) <= (p.keeper ? FOOTBALL_HEIGHT.keeper : FOOTBALL_HEIGHT.foot);
}

export function footballContainAxes(g, p, axes) {
  const threat = g.owner || g.ball;
  const goal = { x: g.rules.width / 2, y: g.rules.height - 25 };
  const goalSide = norm(goal.x - threat.x, goal.y - threat.y);
  const target = {
    x: clamp(threat.x + goalSide.x * 64 + (threat.vx || 0) * 0.12, 18, g.rules.width - 18),
    y: clamp(threat.y + goalSide.y * 64 + (threat.vy || 0) * 0.12, 18, g.rules.height - 18),
  };
  const d = distance(p, target), direction = norm(target.x - p.x, target.y - p.y);
  const weight = clamp(1 - Math.hypot(axes.x, axes.y) / 0.8, 0, 1);
  const speed = Math.min(0.88, d / 65);
  const x = axes.x + direction.x * speed * weight;
  const y = axes.y + direction.y * speed * weight;
  const n = Math.max(1, Math.hypot(x, y));
  return { x: x / n, y: y / n };
}

export function footballRushTarget(g) {
  const { width, height } = g.rules;
  return {
    x: clamp(g.ball.x + g.ball.vx * 0.16, width * 143 / 680 + 12, width * 537 / 680 - 12),
    y: clamp(g.ball.y + g.ball.vy * 0.16, height - height * 170 / 1080 + 22, height - 26),
  };
}

export function startFootballSlide(g, p = g.user, input = { x: 0, y: 0 }) {
  if (g.sport !== "soccer" || !p || p.keeper || g.phase !== "play" ||
      g.hasBall || p.stun > 0 || p.slideTimer > 0 || p.tackleCooldown > 0) return false;
  const target = g.owner || g.ball;
  const x = Number.isFinite(input.x) ? input.x : 0, y = Number.isFinite(input.y) ? input.y : 0;
  let direction = Math.hypot(x, y) > 0.2 ? norm(x, y) : norm(target.x - p.x, target.y - p.y);
  if (!direction.x && !direction.y) direction = norm(p.fx, p.fy || -1);
  Object.assign(p, {
    slideTimer: SLIDE.moving + SLIDE.recovery,
    slideMoveTime: SLIDE.moving,
    sliding: true,
    slideDir: direction,
    slideHit: false,
    tackleCooldown: SLIDE.cooldown,
    decision: Math.max(p.decision, SLIDE.cooldown),
    vx: direction.x * SLIDE.speed,
    vy: direction.y * SLIDE.speed,
    fx: direction.x,
    fy: direction.y,
    stamina: Math.max(0, p.stamina - 0.08),
  });
  g.emit("slide", { side: p.side });
  return true;
}

export function stepFootballSlide(g, p, dt) {
  if (!(p.slideTimer > 0)) return false;
  const old = { x: p.x, y: p.y };
  const moving = Math.min(dt, p.slideMoveTime || 0);
  if (moving > 0) {
    const decay = Math.exp(-SLIDE.drag * moving);
    p.x = clamp(p.x + p.vx * (1 - decay) / SLIDE.drag, 18, g.rules.width - 18);
    p.y = clamp(p.y + p.vy * (1 - decay) / SLIDE.drag, 18, g.rules.height - 18);
    p.vx *= decay;
    p.vy *= decay;
    const owner = g.owner;
    const target = owner || g.ball;
    if (!p.slideHit && (!owner || owner.side !== p.side) &&
        g.ball.restartKicker !== p.id && !(g.ball.flight > 0) &&
        (g.ball.z || 0) <= FOOTBALL_HEIGHT.foot &&
        segmentDistance(target, old, p) < SLIDE.reach) {
      p.slideHit = true;
      if (owner) {
        const facing = norm(owner.fx, owner.fy);
        g.ball.x = owner.x + facing.x * 16;
        g.ball.y = owner.y + facing.y * 16;
        owner.stun = 0.45;
        g.stats[p.side].tackles++;
        g.emit("tackle", { side: p.side, style: "slide" });
      }
      resetFootballFlight(g.ball);
      Object.assign(g.ball, {
        owner: null, receiver: null, passTarget: null, passType: null,
        firstTouch: 0, firstTouchOwner: null, shot: false,
        vx: p.slideDir.x * 260, vy: p.slideDir.y * 260,
        lock: 0.13, flight: 0, restartKicker: null, noDirectGoal: false,
      });
      g.lastTouch = p.side;
    }
  }
  p.slideMoveTime = Math.max(0, (p.slideMoveTime || 0) - dt);
  p.slideTimer = Math.max(0, p.slideTimer - dt);
  p.sliding = p.slideMoveTime > 0;
  p.stamina = clamp(p.stamina + 0.13 * dt, 0, 1);
  if (!p.sliding) p.vx = p.vy = 0;
  if (!p.slideTimer) p.slideDir = null;
  return true;
}
