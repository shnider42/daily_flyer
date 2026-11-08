import { movePlayer } from "../core/movement.js";
import { clamp, distance, norm } from "../core/math.js";
import { FOOTBALL_HEIGHT, clearFootballActions, footballHeightAt } from "./football-controls.js";
// Restarts use match coordinates and normal player movement; no magic possession reset.
export function setupFootballRestart(g, type, side, x, y) {
  clearFootballActions(g);
  const { width: w, height: h } = g.rules;
  if (type === "THROW-IN") x = x < w / 2 ? 0 : w;
  if (type === "GOAL KICK") {
    x = w / 2;
    y = side ? 55 : h - 55;
  }
  if (type === "CORNER") {
    x = x < w / 2 ? 0 : w;
    y = y < h / 2 ? 0 : h;
  }
  if (type === "KICK-OFF") {
    x = w / 2;
    y = h / 2;
  }
  x = clamp(x, 0, w);
  y = clamp(y, 0, h);
  const options = g.players.filter(
    (p) =>
      p.side === side &&
      (["GOAL KICK", "KEEPER BALL"].includes(type) ? p.keeper : !p.keeper),
  );
  const taker =
    type === "KICK-OFF"
      ? options.find((p) => p.slot === g.rules.count - 1)
      : options.sort(
          (a, b) => distance(a, { x, y }) - distance(b, { x, y }),
        )[0];
  const wait =
    {
      "THROW-IN": 0.65,
      "GOAL KICK": 0.9,
      CORNER: 0.9,
      "KICK-OFF": 0.6,
      "KEEPER BALL": 0.35,
    }[type] || 0.7;
  g.restartData = {
    type,
    side,
    x,
    y,
    taker: taker.id,
    elapsed: 0,
    readyElapsed: 0,
    wait,
    targets: {},
    takerSpeed: Math.max(g.rules.speed * 1.8, distance(taker, { x, y }) / 1.8),
    pending: null,
  };
  g.phase = "restart";
  g.timer = wait;
  g.message = type;
  g.ball = {
    x, y, vx: 0, vy: 0, owner: null, lock: 0, shot: false,
    z: 0, vz: 0, airTime: 0, airTarget: null, passTarget: null,
  };
  g.lastTouch = side;
  if (side === 0 && !g.autoplay) g.controlled = taker.id;
  // Recover an outfield defender if a previous goalkeeper distribution held control.
  if (side === 1 && !g.autoplay && (!g.user || g.user.keeper)) g.switchPlayer();
  const mates = g.players
    .filter((p) => p.side === side && !p.keeper && p.id !== taker.id)
    .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }));
  for (const p of g.players) {
    const f = g.rules.formation[p.slot];
    let target = { x: f[0] * w, y: (p.side ? 1 - f[1] : f[1]) * h };
    if (type === "THROW-IN") target = { x: p.x, y: p.y };
    if (type === "CORNER" && !p.keeper)
      target.y = clamp(
        target.y + (y < h / 2 ? -h * 0.28 : h * 0.28),
        85,
        h - 85,
      );
    if (type === "KEEPER BALL") target = { x: p.x, y: p.y };
    const index = mates.indexOf(p);
    if (type === "THROW-IN" && index >= 0 && index < 2)
      target = {
        x: x === 0 ? 100 : w - 100,
        y: clamp(y + (index ? 145 : -115), 55, h - 55),
      };
    if (type === "GOAL KICK" && index >= 0 && index < 2)
      target = { x: w * (index ? 0.72 : 0.28), y: side ? 190 : h - 190 };
    if (type === "CORNER" && index >= 0 && index < 3)
      target = { x: w * 0.34 + index * w * 0.16, y: y === 0 ? 170 : h - 170 };
    if (type === "KICK-OFF") {
      target.y = p.side
        ? Math.min(target.y, h / 2 - 35)
        : Math.max(target.y, h / 2 + 35);
      if (p.side !== side && distance(target, { x, y }) < 125)
        target.y = p.side ? h / 2 - 130 : h / 2 + 130;
    }
    if (type === "GOAL KICK" && p.side !== side)
      target.y = side ? Math.max(240, target.y) : Math.min(h - 240, target.y);
    if (p.side !== side && distance(target, { x, y }) < 45) {
      const v = norm(target.x - x, target.y - y || 1);
      target = {
        x: clamp(x + v.x * 55, 20, w - 20),
        y: clamp(y + v.y * 55, 20, h - 20),
      };
    }
    if (p.id === taker.id) target = { x, y };
    g.restartData.targets[p.id] = target;
    if (p.id !== g.controlled || side === 0) p.vx = p.vy = 0;
    p.decision = Math.max(0.3, p.decision);
  }
  // Opening positions are assigned before a match starts; subsequent restarts walk to shape.
  if (g.time === 0)
    for (const p of g.players) Object.assign(p, g.restartData.targets[p.id]);
  g.emit("restart", { label: type });
}
// Keep marking freedom outside only the restart's restricted space. Apply to
// every defender so camping on the ball cannot delay a CPU restart indefinitely.
function respectRestartSpace(g, p, r) {
  if (p.id === r.taker) return;
  const { width: w, height: h } = g.rules;
  if (r.type === "KICK-OFF")
    p.y = p.side ? Math.min(p.y, h / 2 - 18) : Math.max(p.y, h / 2 + 18);
  if (p.side === r.side) return;
  if (r.type === "GOAL KICK") {
    const left = (w * 143) / 680,
      right = (w * 537) / 680,
      depth = (h * 170) / 1080 + 4;
    const inside =
      p.x > left && p.x < right && (r.side ? p.y < depth : p.y > h - depth);
    if (inside) {
      const exits = [
        { d: p.x - left, x: left - 4, y: p.y },
        { d: right - p.x, x: right + 4, y: p.y },
        {
          d: r.side ? depth - p.y : p.y - (h - depth),
          x: p.x,
          y: r.side ? depth : h - depth,
        },
      ];
      const e = exits.sort((a, b) => a.d - b.d)[0];
      p.x = e.x;
      p.y = e.y;
    }
  }
  const radius = ["CORNER", "KICK-OFF"].includes(r.type) ? 122 : 30;
  if (distance(p, r) < radius) {
    const v = norm(p.x - r.x || (r.x < w / 2 ? 1 : -1), p.y - r.y);
    p.x = clamp(r.x + v.x * radius, 18, w - 18);
    p.y = clamp(r.y + v.y * radius, 18, h - 18);
  }
}
export function stepFootballRestart(
  g,
  dt,
  input = { x: 0, y: 0, sprint: false },
) {
  const r = g.restartData;
  r.elapsed += dt;
  g.timer = Math.max(0, r.wait - r.elapsed);
  for (const p of g.players) {
    p.stun = 0;
    if (r.side === 1 && p.id === g.controlled && !g.autoplay) {
      const x = Number.isFinite(input.x) ? input.x : 0,
        y = Number.isFinite(input.y) ? input.y : 0,
        n = Math.max(1, Math.hypot(x, y));
      movePlayer(p, g.rules, dt, { x: x / n, y: y / n, sprint: input.sprint });
    } else {
      const target = r.targets[p.id],
        d = distance(p, target);
      if (d > 2) {
        const v = norm(target.x - p.x, target.y - p.y);
        const speed = p.id === r.taker ? r.takerSpeed : g.rules.speed * 1.3;
        const step = Math.min(d, speed * dt);
        p.x += v.x * step;
        p.y += v.y * step;
        p.vx = v.x * speed;
        p.vy = v.y * speed;
        p.fx = v.x;
        p.fy = v.y;
      } else {
        p.vx = p.vy = 0;
      }
      p.stamina = clamp(p.stamina + 0.08 * dt, 0, 1);
    }
    respectRestartSpace(g, p, r);
  }
  if (
    g.phase === "restart" &&
    r.elapsed >= r.wait &&
    distance(g.players[r.taker], r) < 3
  ) {
    g.phase = "restart_ready";
    g.timer = 0;
  }
  if (g.phase === "restart_ready") {
    r.readyElapsed += dt;
    if (r.side === 0 && !g.autoplay && r.pending)
      takeFootballRestart(g, r.pending.name, input, r.pending.power);
    else if ((r.side === 1 || g.autoplay) && r.readyElapsed >= 0.25)
      takeFootballRestart(g, "pass");
  }
}
export function takeFootballRestart(
  g,
  action,
  input = { x: 0, y: 0 },
  power = 0.65,
) {
  if (g.phase !== "restart_ready" || !["pass", "ground", "lob", "through", "shoot"].includes(action))
    return false;
  const r = g.restartData,
    p = g.players[r.taker];
  g.phase = "play";
  g.ball.owner = p.id;
  g.cooldown = 0.8;
  const isThrow = r.type === "THROW-IN";
  let played;
  if (action === "lob") played = g.lobPass(p, input, power);
  else if (action === "through") played = g.throughPass(p, input);
  else if (action === "shoot" && ["KEEPER BALL", "GOAL KICK"].includes(r.type))
    played = g.lobPass(p, input, 1);
  else if (action === "shoot" && !isThrow && r.type !== "KICK-OFF")
    played = g.shoot(p, power, input);
  else played = g.pass(p, input);
  if (!played) {
    g.phase = "restart_ready";
    g.ball.owner = null;
    return false;
  }
  // Release from the actual stationary ball position, not from a teleported receiver.
  g.ball.x = r.x;
  g.ball.y = r.y;
  if (g.ball.airTarget && g.ball.airTime > 0) {
    g.ball.vx = (g.ball.airTarget.x - r.x) / g.ball.airTime;
    g.ball.vy = (g.ball.airTarget.y - r.y) / g.ball.airTime;
  }
  g.ball.lock = 0.15;
  g.ball.restartKicker = p.id;
  g.ball.noDirectGoal = isThrow;
  g.ball.restartSide = r.side;
  if (isThrow) {
    g.ball.flight = 0.35;
    if (!g.ball.airTarget) {
      g.ball.vx *= 0.75;
      g.ball.vy *= 0.75;
    }
  }
  if (r.side === 0 && !g.autoplay) {
    const next =
      (Number.isInteger(g.ball.receiver) ? g.players[g.ball.receiver] : null) ||
      g.players
        .filter((q) => q.side === 0 && !q.keeper && q.id !== p.id)
        .sort((a, b) => distance(a, g.ball) - distance(b, g.ball))[0];
    g.controlled = next.id;
  }
  g.restartData = null;
  g.message = "";
  return true;
}
export function footballBoundary(g, old) {
  const b = g.ball,
    { width: w, height: h } = g.rules;
  if (b.x >= 0 && b.x <= w && b.y >= 0 && b.y <= h) return false;
  // Earliest crossed boundary wins, including a diagonal ball at the corner.
  const crossings = [];
  const dx = b.x - old.x,
    dy = b.y - old.y;
  if (b.x < 0 && dx < 0)
    crossings.push({ t: (0 - old.x) / dx, kind: "touch", x: 0 });
  if (b.x > w && dx > 0)
    crossings.push({ t: (w - old.x) / dx, kind: "touch", x: w });
  if (b.y < 0 && dy < 0)
    crossings.push({ t: (0 - old.y) / dy, kind: "goal", y: 0 });
  if (b.y > h && dy > 0)
    crossings.push({ t: (h - old.y) / dy, kind: "goal", y: h });
  const edge = crossings
    .filter((c) => c.t >= 0 && c.t <= 1)
    .sort((a, c) => a.t - c.t)[0];
  if (!edge) return false;
  const x = old.x + dx * edge.t,
    y = old.y + dy * edge.t;
  if (edge.kind === "touch") {
    setupFootballRestart(g, "THROW-IN", 1 - g.lastTouch, edge.x, y);
    return true;
  }
  const defender = edge.y === 0 ? 1 : 0;
  const height = footballHeightAt(old, b, edge.t);
  if (Math.abs(x - w / 2) < g.rules.goal / 2 &&
      height <= FOOTBALL_HEIGHT.bar && !b.noDirectGoal) {
    g.goal(1 - defender);
    return true;
  }
  const corner = g.lastTouch === defender;
  setupFootballRestart(
    g,
    corner ? "CORNER" : "GOAL KICK",
    corner ? 1 - defender : defender,
    corner ? (x < w / 2 ? 0 : w) : w / 2,
    edge.y,
  );
  return true;
}
