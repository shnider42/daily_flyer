import { clamp, distance, norm, segmentDistance } from "./math.js";

// Arcade role profiles, shared by every club. These are gameplay defaults, not
// claims about the real footballers/skaters in the roster. Explicit ratings may
// override individual actions; missing or malformed values keep the role value.
const FOOTBALL_RATINGS = {
  keeper: { passing: 72, crossing: 56, shooting: 45, lofting: 78 },
  defender: { passing: 76, crossing: 68, shooting: 62, lofting: 72 },
  fullback: { passing: 77, crossing: 82, shooting: 67, lofting: 78 },
  midfield: { passing: 84, crossing: 78, shooting: 76, lofting: 81 },
  wing: { passing: 79, crossing: 84, shooting: 81, lofting: 80 },
  striker: { passing: 77, crossing: 72, shooting: 86, lofting: 75 },
};
const HOCKEY_RATINGS = {
  keeper: { passing: 70, crossing: 64, shooting: 48, lofting: 74 },
  defender: { passing: 80, crossing: 78, shooting: 76, lofting: 83 },
  center: { passing: 85, crossing: 80, shooting: 83, lofting: 80 },
  wing: { passing: 79, crossing: 78, shooting: 85, lofting: 78 },
};
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const active = (p) => p && !p.offIce && !p.retired;
const humanControlled = (g, p) => g.controllers?.length
  ? g.controllers.some((seat) => seat.playerId === p.id)
  : !g.autoplay && p.id === g.controlled;

export function playerActionRatings(player = {}, sport = "soccer") {
  const role = String(player.role || player.position || "").toUpperCase();
  let defaults;
  if (sport === "hockey") {
    defaults = HOCKEY_RATINGS[player.keeper || ["G", "GK", "GOALKEEPER", "GOALIE"].includes(role)
      ? "keeper" : ["D", "DEFENDER", "DEFENSE", "DEFENCE"].includes(role) ? "defender" : ["C", "CENTER", "CENTRE"].includes(role) ? "center" : "wing"];
  } else {
    defaults = FOOTBALL_RATINGS[player.keeper || ["G", "GK", "GOALKEEPER", "GOALIE"].includes(role)
      ? "keeper" : ["LB", "RB", "LWB", "RWB"].includes(role) ? "fullback"
        : ["CB", "D", "DF", "DEFENDER", "DEFENSE", "DEFENCE"].includes(role) ? "defender"
          : ["LW", "RW", "LM", "RM", "WINGER"].includes(role) ? "wing"
            : ["ST", "CF", "F", "FW", "STRIKER", "FORWARD"].includes(role) ? "striker" : "midfield"];
  }
  return Object.fromEntries(Object.entries(defaults).map(([action, value]) => [
    action, clamp(finite(player.ratings?.[action], value), 1, 99),
  ]));
}

function stick(input = {}) {
  const x = finite(input.x), y = finite(input.y), length = Math.hypot(x, y);
  if (length <= 0.2) return { x: 0, y: 0 };
  const divisor = Math.max(1, length);
  return { x: x / divisor, y: y / divisor };
}
function aimDirection(p, input) {
  const axes = stick(input);
  return axes.x || axes.y ? norm(axes.x, axes.y) : { x: 0, y: p.side ? 1 : -1 };
}

// Choosing a teammate is separate from placing the delivery. The chosen point
// then receives a modest absolute world-stick lead, including on instant taps.
function chooseReceiver(g, p, input, kind, power, override) {
  if (override && override.id !== p.id && override.side === p.side && active(override)) return override;
  const direction = aimDirection(p, input), axes = stick(input);
  let mates = g.players.filter((q) => q.side === p.side && q.id !== p.id && !q.keeper && active(q));
  const alignment = (q) => ((q.x - p.x) * direction.x + (q.y - p.y) * direction.y) / (distance(p, q) || 1);
  const profile = kind === "ground" && !p.side ? g.touchProfile : null;
  const opponents = profile ? g.players.filter((q) => q.side !== p.side && active(q)) : [];
  if (profile && mates.length) {
    const best = Math.max(...mates.map(alignment));
    const directed = mates.filter((q) => alignment(q) >= Math.max(-0.2, best - 0.6));
    if (directed.length) mates = directed;
  }
  const ideal = { x: g.rules.width / 2, y: p.side ? g.rules.height - 155 : 155 };
  const desiredRange = g.rules.width * (0.28 + 0.22 * power);
  const score = (q) => {
    const d = distance(p, q);
    if (kind === "cross") return -distance(q, ideal) - Math.abs(q.x - ideal.x) * 0.18 +
      (axes.x || axes.y ? alignment(q) * 75 : 0);
    if (kind === "lob") return alignment(q) * 160 - Math.abs(d - desiredRange) * 0.15;
    let value = alignment(q) * (kind === "saucer" ? 170 : 150) - d * 0.16;
    if (kind === "through") value += (q.y - p.y) * (p.side ? 1 : -1) * 0.025;
    if (profile) {
      let laneRisk = 0, nearestOpponent = Infinity;
      for (const opponent of opponents) {
        nearestOpponent = Math.min(nearestOpponent, distance(opponent, q));
        const projection = ((opponent.x - p.x) * (q.x - p.x) + (opponent.y - p.y) * (q.y - p.y)) / (d * d || 1);
        if (projection > 0.08 && projection < 1)
          laneRisk = Math.max(laneRisk, clamp((44 - segmentDistance(opponent, p, q)) / 44, 0, 1));
      }
      value -= profile.passSafety * (laneRisk * 155 + Math.max(0, 70 - nearestOpponent) * 1.2);
    }
    return value;
  };
  return mates.sort((a, b) => score(b) - score(a) || a.id - b.id)[0] || null;
}

function actionKind(g, p, name, options) {
  if (["ground", "pass", "hockey-pass"].includes(name)) return "ground";
  if (name === "through") return "through";
  if (name === "cross") return "cross";
  if (name === "lob") return g.canCross?.(p) ? "cross" : "lob";
  if (["saucer", "hockey-saucer"].includes(name)) return "saucer";
  if (["dump", "hockey-dump"].includes(name)) return "dump";
  if (["shoot", "shot", "hockey-shot", "slap", "wrist"].includes(name))
    return g.sport === "hockey" ? options.style || (name === "slap" || p.shotHold >= 0.45 ? "slap" : "wrist") : "shot";
  return null;
}

function accuracy(g, p, target, kind, action, power, input) {
  const rating = playerActionRatings(p, g.sport)[action];
  const skillGap = Math.pow(clamp((99 - rating) / 59, 0, 1.65), 1.3);
  const range = distance(p, target), direction = norm(target.x - p.x, target.y - p.y);
  const velocity = Math.hypot(finite(p.vx), finite(p.vy));
  const moving = clamp(velocity / g.rules.speed, 0, 1);
  const facing = velocity > 1 ? norm(p.vx, p.vy) : direction;
  const balance = moving * clamp((1 - facing.x * direction.x - facing.y * direction.y) / 2, 0, 1);
  const sprint = Math.max(clamp((velocity / g.rules.speed - 0.94) / 0.3, 0, 1), input.sprint ? moving * 0.7 : 0);
  const fatigue = 1 - clamp(finite(p.stamina, 1), 0, 1);
  const pressureReach = g.sport === "hockey" ? 112 : 96;
  const pressure = clamp(g.players.filter((q) => q.side !== p.side && active(q) && !(q.stun > 0))
    .reduce((sum, q) => sum + Math.max(0, 1 - distance(p, q) / pressureReach), 0), 0, 1.3);
  const force = ["shot", "wrist", "slap", "dump", "cross", "lob", "saucer"].includes(kind)
    ? clamp((power - 0.65) / 0.35, 0, 1) : 0;
  const factors = { pressure, fatigue, sprint, balance, range, power: force };
  let lateralRadius, depthRadius;
  if (action === "shooting") {
    const rangeScale = 0.75 + range / g.rules.height * 2;
    const technique = kind === "slap" ? 1.22 : 1;
    lateralRadius = g.rules.goal * rangeScale * technique *
      (0.006 + 0.36 * skillGap + pressure * 0.11 + fatigue * 0.045 + sprint * 0.045 + balance * 0.065 + force * 0.075);
    // Preserve the solo difficulty handicap as added uncertainty, never as an
    // advantage for an away human in team-versus-team hockey.
    const humansAway = g.sport === "hockey" && g.controllers?.some((seat) => seat.side === 1);
    const human = humanControlled(g, p);
    if (!human && (p.side || humansAway)) lateralRadius += g.difficulty.accuracy * 65;
    depthRadius = 0;
  } else {
    const aerial = ["cross", "lob", "saucer", "dump"].includes(kind);
    // Crosses have enough visible placement error to alter a receiving run;
    // shorter ground/saucer deliveries remain dependable. A 99 retains only
    // the small floor plus situational difficulty, regardless of technique.
    const base = kind === "cross" ? 0.34 : kind === "lob" ? 0.26 : kind === "dump" ? 0.13 : kind === "saucer" ? 0.1 : 0.067;
    const stress = pressure * (aerial ? 0.035 : 0.026) + fatigue * (aerial ? 0.024 : 0.014) +
      sprint * (aerial ? 0.024 : 0.015) + balance * (aerial ? 0.035 : 0.02) + force * 0.025;
    lateralRadius = (aerial ? 0.8 : 0.6) + range * ((aerial ? 0.002 : 0.001) + base * skillGap + stress);
    depthRadius = lateralRadius * (aerial ? 1.28 : 0.8);
  }
  return { rating, lateralRadius, depthRadius, uncertaintyRadius: Math.max(lateralRadius, depthRadius), factors };
}

// A pure intention/uncertainty preview. It neither advances the match RNG nor
// changes players, target selection, or the ball. Launches call this same plan.
export function planAction(g, p, name, input = {}, power = 0.65, options = {}) {
  if (!p || !active(p)) return null;
  const kind = actionKind(g, p, name, options);
  if (!kind) return null;
  const strength = clamp(finite(power, 0.65), 0, 1), axes = stick(input);
  const attack = p.side ? 1 : -1;
  const origin = { x: p.x, y: p.y };
  let target, receiver = null, duration = 0, speed = g.rules.pass;
  const shooting = ["shot", "wrist", "slap"].includes(kind);
  if (shooting) {
    // The user's assistance slider controls their intended aim, not the CPU's.
    // Both still execute through the same role/pressure/launch-error model.
    const assist = humanControlled(g, p) ? clamp(finite(g.aimAssist, 0.65), 0, 1) : 1;
    let width;
    if (g.sport === "hockey") width = g.rules.goal * (0.36 + 0.44 * (1 - assist));
    else {
      width = g.rules.goal * 0.8 + 110 * (1 - assist);
      if (!p.side && g.touchProfile) width += (g.rules.goal * 0.35 - width) * (1 - Math.pow(1 - assist, 3));
    }
    target = { x: g.rules.width / 2 + axes.x * width, y: p.side ? g.rules.height + 5 : -5 };
    speed = g.rules.shot * (kind === "slap" ? 1.04 + strength * 0.2 : kind === "wrist" ? 0.74 + strength * 0.12 : 0.65 + strength * 0.35);
  } else if (kind === "dump") {
    const aim = aimDirection(p, input);
    duration = 0.58 + strength * 1.16;
    speed = 420 + strength * 340;
    target = { x: p.x + aim.x * (21 + speed * duration), y: p.y + aim.y * (21 + speed * duration) };
  } else {
    receiver = chooseReceiver(g, p, input, kind, strength, options.receiver);
    if (!receiver) return null;
    const d = distance(p, receiver), vx = finite(receiver.vx), vy = finite(receiver.vy);
    let lead;
    if (kind === "through") {
      duration = clamp(d / g.rules.pass + 0.22, 0.42, 1.5);
      const runLead = clamp(g.rules.speed * (duration - 0.15) * 0.72, 32, 135);
      const running = Math.hypot(vx, vy) > 30 ? norm(vx, vy) : aimDirection(p, input);
      target = { x: receiver.x + running.x * runLead, y: receiver.y + running.y * runLead };
      lead = clamp(d * 0.12, 0, 72);
    } else {
      const prediction = kind === "lob" ? 0.24 : kind === "ground" ? 0.16 : 0.18;
      target = { x: receiver.x + vx * prediction, y: receiver.y + vy * prediction + (kind === "cross" ? attack * 24 : kind === "lob" ? attack * 12 : 0) };
      lead = Math.min(kind === "cross" ? 56 : kind === "lob" ? 46 : kind === "saucer" ? 30 : 38,
        d * (kind === "cross" ? 0.11 : kind === "lob" ? 0.08 : kind === "saucer" ? 0.045 : 0.065));
    }
    target.x += axes.x * lead;
    target.y += axes.y * lead;
    const travel = distance(p, target);
    if (kind === "through") speed = clamp(travel * g.rules.ballDrag / (1 - Math.exp(-g.rules.ballDrag * duration)), 210, g.rules.pass * 1.22);
    if (["cross", "lob"].includes(kind)) duration = clamp(0.65 + travel / 760, 0.7, 1.65);
    if (kind === "saucer") duration = clamp(travel / g.rules.pass, 0.38, 0.7);
    if (["cross", "lob", "saucer"].includes(kind)) speed = travel / duration;
  }
  const action = shooting ? "shooting" : kind === "cross" ? "crossing"
    : ["lob", "saucer", "dump"].includes(kind) ? "lofting" : "passing";
  return {
    actorId: p.id, receiverId: receiver?.id ?? null, kind, action,
    origin, target, intendedTarget: { ...target }, speed, duration, power: strength,
    ...accuracy(g, p, target, kind, action, strength, input),
  };
}

// Two centered triangular samples, once per launch. The result is never clamped
// into the pitch, goal or a receiver's reach; bad placement can genuinely miss.
export function sampleAction(g, plan) {
  let lateral = g.random() - g.random(), depth = g.random() - g.random();
  const radius = Math.max(1, Math.hypot(lateral, depth));
  lateral /= radius;
  depth /= radius;
  const direction = norm(plan.target.x - plan.origin.x, plan.target.y - plan.origin.y);
  const shot = plan.action === "shooting";
  const target = shot ? { x: plan.target.x + lateral * plan.lateralRadius, y: plan.target.y }
    : {
        x: plan.target.x - direction.y * lateral * plan.lateralRadius + direction.x * depth * plan.depthRadius,
        y: plan.target.y + direction.x * lateral * plan.lateralRadius + direction.y * depth * plan.depthRadius,
      };
  const ratio = distance(plan.origin, target) / Math.max(1, distance(plan.origin, plan.target));
  // Ground depth error changes pace as well as direction. Airborne deliveries
  // derive both horizontal components from this fixed point and flight time.
  const speed = shot ? plan.speed : plan.speed * clamp(ratio, 0.76, 1.24);
  return { target, speed, duration: plan.duration, lateral, depth };
}

export function releaseAction(g, p, plan, eventKind = "pass") {
  if (!plan) return null;
  const result = sampleAction(g, plan);
  g.release(p, result.target.x - p.x, result.target.y - p.y, result.speed, plan.action === "shooting", eventKind);
  Object.assign(g.ball, {
    intendedTarget: { ...plan.target }, actionRating: plan.rating,
    accuracyRadius: plan.uncertaintyRadius, actionKey: plan.action,
  });
  return result;
}
