import { clamp, distance, norm } from "../core/math.js";
// Restarts use match coordinates and normal player movement; no magic possession reset.
export function setupFootballRestart(g, type, side, x, y) {
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
      "THROW-IN": 4,
      "GOAL KICK": 5,
      CORNER: 5,
      "KICK-OFF": 3.5,
      "KEEPER BALL": 2.5,
    }[type] || 4;
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
  };
  g.phase = "restart";
  g.timer = wait;
  g.message = type;
  g.ball = { x, y, vx: 0, vy: 0, owner: null, lock: 0, shot: false };
  g.lastTouch = side;
  if (side === 0 && !g.autoplay) g.controlled = taker.id;
  const mates = g.players.filter(
    (p) => p.side === side && !p.keeper && p.id !== taker.id,
  );
  for (const p of g.players) {
    const f = g.rules.formation[p.slot];
    let target = { x: f[0] * w, y: (p.side ? 1 - f[1] : f[1]) * h };
    if (type === "THROW-IN")
      target.y = clamp(target.y + (y - h / 2) * 0.45, 65, h - 65);
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
    p.vx = p.vy = 0;
  }
  // Opening positions are assigned before a match starts; subsequent restarts walk to shape.
  if (g.time === 0)
    for (const p of g.players) Object.assign(p, g.restartData.targets[p.id]);
  g.emit("restart", { label: type });
}
export function stepFootballRestart(g, dt) {
  const r = g.restartData;
  r.elapsed += dt;
  g.timer = Math.max(0, r.wait - r.elapsed);
  let settled = true;
  for (const p of g.players) {
    const target = r.targets[p.id],
      d = distance(p, target);
    if (d > 3) {
      const v = norm(target.x - p.x, target.y - p.y),
        step = Math.min(d, 125 * dt);
      p.x += v.x * step;
      p.y += v.y * step;
      p.vx = v.x * 125;
      p.vy = v.y * 125;
      p.fx = v.x;
      p.fy = v.y;
      settled = false;
    } else {
      p.vx = p.vy = 0;
    }
    p.stamina = clamp(p.stamina + 0.08 * dt, 0, 1);
    p.stun = 0;
  }
  const taker = g.players[r.taker];
  const opponentsReady = g.players
    .filter((p) => p.side !== r.side)
    .every(
      (p) =>
        distance(p, r) > 26 &&
        (r.type !== "GOAL KICK" ||
          (r.side ? p.y >= 220 : p.y <= g.rules.height - 220)),
    );
  if (
    g.phase === "restart" &&
    r.elapsed >= r.wait &&
    distance(taker, r) < 3 &&
    opponentsReady &&
    (settled || r.elapsed > 7)
  ) {
    g.phase = "restart_ready";
    g.message = r.type;
    g.timer = 0;
  }
  if (g.phase === "restart_ready") {
    r.readyElapsed += dt;
    if ((r.side === 1 || g.autoplay) && r.readyElapsed >= 1.2)
      takeFootballRestart(g, "pass");
  }
}
export function takeFootballRestart(
  g,
  action,
  input = { x: 0, y: 0 },
  power = 0.65,
) {
  if (g.phase !== "restart_ready" || !["pass", "shoot"].includes(action))
    return false;
  const r = g.restartData,
    p = g.players[r.taker];
  g.phase = "play";
  g.ball.owner = p.id;
  g.cooldown = 0.8;
  const isThrow = r.type === "THROW-IN";
  if (action === "shoot" && !isThrow && r.type !== "KICK-OFF")
    g.shoot(p, power, input);
  else g.pass(p, input);
  // Release from the actual stationary ball position, not from a teleported receiver.
  g.ball.x = r.x;
  g.ball.y = r.y;
  g.ball.lock = 0.15;
  g.ball.restartKicker = p.id;
  g.ball.noDirectGoal = isThrow;
  g.ball.restartSide = r.side;
  if (isThrow) {
    g.ball.flight = 0.35;
    g.ball.vx *= 0.75;
    g.ball.vy *= 0.75;
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
  if (Math.abs(x - w / 2) < g.rules.goal / 2 && !b.noDirectGoal) {
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
