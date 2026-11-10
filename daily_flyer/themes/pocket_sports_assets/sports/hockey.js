import { clamp, distance, norm, segmentDistance } from "../core/math.js";
import { planAction, releaseAction } from "../core/ballistics.js";

export const HOCKEY = {
  gravity: 720, stickHeight: 16, keeperHeight: 44, bar: 46,
  glass: 68, reach: 38, slapHold: 0.45, fightHold: 3,
};
export const hockeyActive = (p) => Boolean(p && !p.offIce && !p.retired);
const neutral = () => ({ x: 0, y: 0, sprint: false });
const direction = (p, input = {}) => Math.hypot(input.x || 0, input.y || 0) > 0.15
  ? norm(input.x || 0, input.y || 0) : { x: 0, y: p.side ? 1 : -1 };

export function resetHockeyFlight(ball) {
  ball.z = 0;
  ball.vz = 0;
  ball.airTime = 0;
  ball.airTarget = null;
}

export function canPlayHockeyPuck(g, p = g.user) {
  if (g.sport !== "hockey" || g.phase !== "play" || !hockeyActive(p) || p.stun > 0)
    return false;
  if (g.ball.owner === p.id) return true;
  return g.ball.owner === null && !(g.ball.lock > 0) &&
    !(g.ball.passer === p.id && g.ball.passerLock > 0) &&
    (g.ball.z || 0) <= HOCKEY.stickHeight && distance(p, g.ball) <= HOCKEY.reach;
}

export function hockeyControlContext(g, p = g.user) {
  // Picking up the same reachable loose puck keeps a windup intact. Releases,
  // checks and stoppages advance the epoch, so a later possession cannot revive it.
  return canPlayHockeyPuck(g, p) ? `${p.id}:${g.puckEpoch || 0}` : null;
}

function claim(g, p) {
  if (!canPlayHockeyPuck(g, p)) return false;
  if (g.ball.owner !== p.id) {
    g.ball.owner = p.id;
    g.ball.shot = false;
    g.ball.receiver = null;
    g.ball.passTarget = null;
    resetHockeyFlight(g.ball);
    g.lastTouch = p.side;
  }
  return true;
}

function seatForPlayer(g, id) {
  return (g.controllers || []).find((seat) => seat.playerId === id);
}

export function setHockeyControllers(g, seats = [], localSeatId = null) {
  if (g.sport !== "hockey") return false;
  const ids = new Set(), claimed = new Set(), teamSides = new Set();
  const previous = new Map((g.controllers || []).map((seat) => [seat.id, seat]));
  const requested = [];
  for (const proposed of seats.slice(0, 4)) {
    const id = String(proposed.id || "").slice(0, 80);
    const side = proposed.side === 1 ? 1 : 0;
    const mode = proposed.mode === "skater" ? "skater" : "team";
    if (!id || ids.has(id) || (mode === "team" && teamSides.has(side))) continue;
    ids.add(id);
    if (mode === "team") teamSides.add(side);
    const prior = previous.get(id);
    const valid = (p) => p && p.side === side && !p.keeper && !p.retired &&
      (mode === "skater" || hockeyActive(p));
    let preferred = g.players.find((p) => p.id === proposed.playerId && valid(p));
    if (!preferred && prior?.side === side && prior.mode === mode)
      preferred = g.players.find((p) => p.id === prior.playerId && valid(p));
    requested.push({ id, side, mode, preferred });
  }
  // A team seat can follow the puck; a skater lock cannot. Reserve requested
  // locks before choosing any fallbacks, regardless of lobby seat order.
  const pendingLocks = new Set(requested.filter((seat) => seat.mode === "skater" && seat.preferred)
    .map((seat) => seat.preferred.id));
  const assigned = new Map();
  for (const seat of [...requested.filter((s) => s.mode === "skater"), ...requested.filter((s) => s.mode === "team")]) {
    let player = seat.preferred && !claimed.has(seat.preferred.id) ? seat.preferred : null;
    if (!player) player = g.players.find((p) => p.side === seat.side && !p.keeper && hockeyActive(p) &&
      !claimed.has(p.id) && !pendingLocks.has(p.id));
    if (seat.preferred) pendingLocks.delete(seat.preferred.id);
    if (!player) continue;
    claimed.add(player.id);
    assigned.set(seat.id, { id: seat.id, side: seat.side, mode: seat.mode, playerId: player.id });
  }
  const controllers = requested.map((seat) => assigned.get(seat.id)).filter(Boolean);
  g.controllers = controllers;
  g.localControllerId = controllers.some((s) => s.id === localSeatId) ? localSeatId : null;
  const local = controllers.find((s) => s.id === g.localControllerId);
  g.controlled = local ? local.playerId : controllers.length ? -1 : g.controlled;
  return true;
}

export function hockeyHumanInputs(g, input, inputsBySeat = {}) {
  const result = new Map();
  if (g.controllers?.length) {
    for (const seat of g.controllers) {
      const value = inputsBySeat[seat.id] || (seat.id === g.localControllerId ? input : neutral());
      result.set(seat.playerId, value);
    }
    const local = g.controllers.find((s) => s.id === g.localControllerId);
    if (local) g.controlled = local.playerId;
  } else if (!g.autoplay && g.controlled >= 0) result.set(g.controlled, input);
  return result;
}

export function hockeySwitchPlayer(g, seat = null) {
  if (seat?.mode === "skater") return callHockeyPass(g, g.players[seat.playerId]);
  const current = seat ? g.players[seat.playerId] : g.user;
  const side = seat?.side ?? current?.side ?? 0;
  const reserved = new Set((g.controllers || []).filter((s) => s !== seat).map((s) => s.playerId));
  let choices = g.players.filter((p) => p.side === side && !p.keeper && hockeyActive(p) && !reserved.has(p.id));
  if (!choices.length) return false;
  const owner = g.owner;
  let next = owner?.side === side && choices.includes(owner) ? owner : null;
  if (!next) {
    const others = choices.filter((p) => p.id !== current?.id);
    if (others.length) choices = others;
    next = choices.sort((a, b) => distance(a, g.ball) - distance(b, g.ball))[0];
  }
  if (seat) seat.playerId = next.id;
  if (!seat || seat.id === g.localControllerId) g.controlled = next.id;
  return true;
}

export function hockeyPossessionControl(g, p) {
  if (!hockeyActive(p) || p.keeper) return;
  if (g.controllers?.length) {
    if (seatForPlayer(g, p.id)) return;
    const seat = g.controllers.find((s) => s.side === p.side && s.mode === "team");
    if (seat) {
      seat.playerId = p.id;
      if (seat.id === g.localControllerId) g.controlled = p.id;
    }
  } else if (!g.autoplay && p.side === 0) g.controlled = p.id;
}

export function callHockeyPass(g, p) {
  if (g.phase !== "play" || !hockeyActive(p) || p.callCooldown > 0) return false;
  p.callCooldown = 1.5;
  p.callFlash = 0.75;
  g.emit("call-pass", { side: p.side, player: p.id });
  const owner = g.owner;
  if (!owner || owner.side !== p.side || owner.id === p.id || seatForPlayer(g, owner.id) ||
      distance(owner, p) > g.rules.width * 0.9) return true;
  const blocked = g.players.some((q) => q.side !== p.side && hockeyActive(q) &&
    segmentDistance(q, owner, p) < 28 && distance(owner, q) < distance(owner, p));
  if (blocked || owner.decision > 0.5) return true;
  const plan = planAction(g, owner, "ground", {}, 0.65, { receiver: p });
  const result = releaseAction(g, owner, plan);
  if (!result) return true;
  g.ball.receiver = p.id;
  g.ball.passTarget = { ...result.target };
  g.ball.lock = Math.min(0.14, Math.max(0.02, (distance(owner, p) - 38) / result.speed));
  return true;
}

function strike(g, p, input, power, style) {
  if (g.ball.owner !== p.id || !hockeyActive(p) || g.phase !== "play") return false;
  const plan = planAction(g, p, "hockey-shot", input, power, { style });
  if (!plan) return false;
  releaseAction(g, p, plan);
  p.shotStyle = style;
  p.shotPoseTime = style === "slap" ? 0.36 : 0.18;
  g.ball.shotStyle = style;
  if (style === "slap") g.emit("slapshot", { side: p.side, player: p.id });
  return true;
}

export function hockeyShot(g, p, input, power = 0.65, details = {}) {
  if (p?.shotWindup > 0 || !claim(g, p)) return false;
  p.shotHold = 0; p.shotChargeContext = null;
  const held = Math.max(0, Number(details.heldSeconds) || 0);
  const strength = clamp(Number(power) || 0, 0, 1);
  if (held >= HOCKEY.slapHold) {
    p.shotStyle = "slap";
    p.shotWindup = 0.12;
    p.pendingShot = { input: { x: input.x || 0, y: input.y || 0 }, power: strength, epoch: g.puckEpoch || 0 };
    return true;
  }
  return strike(g, p, input, strength, "wrist");
}

function launch(g, p, input, power, kind) {
  if (!claim(g, p)) return false;
  const plan = planAction(g, p, kind, input, power);
  if (!plan) return false;
  const result = releaseAction(g, p, plan, kind === "dump" ? "dump" : "pass");
  if (kind === "saucer") {
    g.ball.receiver = plan.receiverId;
    g.ball.passTarget = { ...result.target };
    g.emit("saucer", { side: p.side, player: p.id });
  }
  Object.assign(g.ball, {
    z: 0, vz: HOCKEY.gravity * result.duration / 2, airTime: result.duration,
    airTarget: { ...result.target }, flightKind: kind,
    vx: (result.target.x - g.ball.x) / result.duration,
    vy: (result.target.y - g.ball.y) / result.duration,
    launch: { side: p.side, playerId: p.id, x: g.ball.x, y: g.ball.y, deflected: false },
  });
  return true;
}

export function hockeyContact(g, p, input = {}, poke = false) {
  if (g.phase !== "play" || !hockeyActive(p) || p.keeper || p.stun > 0 || p.tackleCooldown > 0 || canPlayHockeyPuck(g, p))
    return false;
  p.tackleCooldown = poke ? 0.45 : 0.8;
  p.decision = Math.max(p.decision, p.tackleCooldown);
  const owner = g.owner;
  const target = owner?.side !== p.side && owner ? owner : g.ball;
  const aim = Math.hypot(input.x || 0, input.y || 0) > 0.15 ? direction(p, input) : norm(target.x - p.x, target.y - p.y);
  p.fx = aim.x; p.fy = aim.y;
  if (poke) p.pokeTime = 0.2;
  else {
    p.hitTime = 0.26;
    p.vx += aim.x * 170; p.vy += aim.y * 170;
    p.stamina = Math.max(0, p.stamina - 0.06);
  }
  const reach = poke ? 59 : 73;
  const dx = target.x - p.x, dy = target.y - p.y;
  if (distance(p, target) > reach || (dx * aim.x + dy * aim.y) < -12 || (g.ball.z || 0) > HOCKEY.stickHeight)
    return true;
  if (owner && owner.side === p.side) return true;
  if (owner) {
    owner.stun = poke ? 0.1 : 0.65;
    g.stats[p.side].tackles++;
  }
  g.puckEpoch = (g.puckEpoch || 0) + 1;
  resetHockeyFlight(g.ball);
  Object.assign(g.ball, {
    owner: null, receiver: null, passTarget: null, shot: false,
    vx: aim.x * (poke ? 190 : 270), vy: aim.y * (poke ? 190 : 270),
    lock: poke ? 0.07 : 0.12, passer: null, passerLock: 0,
  });
  if (g.ball.launch) g.ball.launch.deflected = true;
  g.lastTouch = p.side;
  g.emit(poke ? "poke" : "hit", { side: p.side, player: p.id });
  return true;
}

export function hockeyAction(g, name, input = {}, power = 0.65, details = {}, seat = null) {
  if (g.sport !== "hockey" || g.phase !== "play") return false;
  const p = seat ? g.players[seat.playerId] : g.user;
  if (!p || !hockeyActive(p)) return false;
  if (name === "switch") return hockeySwitchPlayer(g, seat);
  if (name === "hockey-pass" || name === "pass") {
    if (claim(g, p)) return g.pass(p, input);
    return hockeySwitchPlayer(g, seat);
  }
  if (name === "hockey-shot") return hockeyShot(g, p, input, power, details);
  if (name === "shoot") return canPlayHockeyPuck(g, p)
    ? hockeyShot(g, p, input, power, details) : hockeyContact(g, p, input);
  if (name === "hockey-dump") return launch(g, p, input, power, "dump");
  if (name === "hockey-saucer") return launch(g, p, input, power, "saucer");
  if (name === "hockey-hit") return hockeyContact(g, p, input);
  if (name === "hockey-poke") return hockeyContact(g, p, input, true);
  if (name === "hockey-fight" && p.fightHold >= HOCKEY.fightHold) return attemptFight(g, p);
  return false;
}

function substitute(g, player) {
  let reserve = g.players.find((p) => p.replacementFor === player.id);
  if (!reserve) {
    reserve = { ...player, id: g.players.length, name: "Bench skater", number: "B", replacementFor: player.id };
    g.players.push(reserve);
  }
  Object.assign(reserve, {
    x: clamp(player.x, 25, g.rules.width - 25), y: clamp(player.y, 25, g.rules.height - 25),
    offIce: false, retired: false, penalty: null, stun: 0, vx: 0, vy: 0, stamina: 1,
    pendingShot: null, shotWindup: 0, fightHold: 0, fightTriggered: false, fightBlocked: false,
  });
  return reserve;
}

export function addHockeyPenalty(g, player, kind, minutes = 2, coincidental = false) {
  if (!hockeyActive(player) || player.penalty) return null;
  const penalty = {
    playerId: player.id, side: player.side, kind, minutes, coincidental,
    remaining: Math.max(minutes === 2 ? 12 : 25, g.duration * minutes / 20),
    queued: !coincidental && g.players.filter((p) => p.side === player.side && !p.keeper && hockeyActive(p)).length <= 3,
  };
  if (coincidental || penalty.queued) substitute(g, player);
  player.offIce = true;
  player.penalty = penalty;
  player.pendingShot = null; player.shotWindup = 0;
  player.vx = player.vy = 0;
  player.x = player.side ? g.rules.width + 36 : -36;
  player.y = g.rules.height / 2 + (player.slot - 3) * 30;
  (g.penalties ||= []).push(penalty);
  if (g.ball.owner === player.id) {
    g.ball.owner = null;
    g.puckEpoch = (g.puckEpoch || 0) + 1;
  }
  const seat = seatForPlayer(g, player.id);
  if (seat?.mode === "team") hockeySwitchPlayer(g, seat);
  else if (!g.controllers?.length && g.controlled === player.id) hockeySwitchPlayer(g);
  g.emit("penalty", { side: player.side, player: player.id, kind, minutes });
  return penalty;
}

function releasePenalty(g, penalty) {
  const p = g.players[penalty.playerId];
  if (!p) return;
  p.penalty = null;
  g.penalties = g.penalties.filter((item) => item !== penalty);
  const penalizedReserve = g.players.find((q) => q.replacementFor === p.id && q.penalty);
  if (penalizedReserve) {
    // A replacement's remaining minor still removes this roster slot from the
    // ice. Ending the original player's major cannot erase that disadvantage.
    p.waitingForReplacement = penalizedReserve.id;
    p.offIce = true;
    g.emit("penalty-over", { side: p.side, player: p.id });
    return;
  }
  let returning = p;
  const retiring = [];
  while (returning.replacementFor !== undefined) {
    const original = g.players[returning.replacementFor];
    if (!original || original.penalty || original.waitingForReplacement !== returning.id) break;
    retiring.push(returning);
    original.waitingForReplacement = null;
    returning = original;
  }
  let displacedSeat = null;
  const reserve = g.players.find((q) => q.replacementFor === p.id && hockeyActive(q));
  if (reserve) {
    Object.assign(returning, { x: reserve.x, y: reserve.y, vx: reserve.vx, vy: reserve.vy, fx: reserve.fx, fy: reserve.fy });
    if (g.ball.owner === reserve.id) g.ball.owner = returning.id;
    if (g.ball.receiver === reserve.id) g.ball.receiver = returning.id;
    const seat = seatForPlayer(g, reserve.id);
    if (seat) {
      if (seatForPlayer(g, returning.id)) displacedSeat = seat;
      else {
        seat.playerId = returning.id;
        if (seat.id === g.localControllerId) g.controlled = returning.id;
      }
    }
    if (!g.controllers?.length && g.controlled === reserve.id) g.controlled = returning.id;
    reserve.offIce = true; reserve.retired = true;
  } else Object.assign(returning, { x: 30, y: g.rules.height * (p.side ? 0.44 : 0.56), vx: 0, vy: 0 });
  for (const retired of retiring) {
    retired.offIce = true; retired.retired = true;
  }
  returning.offIce = false; returning.retired = false; returning.stun = 0;
  if (displacedSeat) hockeySwitchPlayer(g, displacedSeat);
  g.emit("penalty-over", { side: p.side, player: p.id });
}

export function hockeyGoalPenalties(g, scoringSide) {
  if (g.manpower[scoringSide] <= g.manpower[1 - scoringSide]) return;
  const penalty = (g.penalties || []).find((p) => p.side !== scoringSide && p.minutes === 2 && !p.coincidental && !p.queued);
  if (penalty) releasePenalty(g, penalty);
}

function beginFight(g, p, q) {
  if (!hockeyActive(p) || !hockeyActive(q) || distance(p, q) > 90) return false;
  g.fightChallenge = null;
  g.fight = { players: [p.id, q.id], remaining: 2.4, stage: "exchange" };
  g.phase = "fight";
  g.message = "FIGHT";
  g.puckEpoch = (g.puckEpoch || 0) + 1;
  g.ball.owner = null; g.ball.vx = g.ball.vy = 0;
  resetHockeyFlight(g.ball);
  for (const skater of g.players) {
    skater.shotHold = 0; skater.shotChargeContext = null; skater.shotChargeBlocked = true;
  }
  for (const skater of [p, q]) {
    skater.vx = skater.vy = 0;
    skater.pendingShot = null; skater.shotWindup = 0;
    skater.fightCooldown = 12;
  }
  g.emit("fight", { players: [p.id, q.id] });
  return true;
}

function attemptFight(g, p) {
  if (!hockeyActive(p) || p.keeper || p.replacementFor !== undefined || p.fightCooldown > 0 ||
      g.phase !== "play" || canPlayHockeyPuck(g, p)) return false;
  p.fightTriggered = true;
  const challenge = g.fightChallenge;
  if (challenge?.target === p.id) return beginFight(g, g.players[challenge.from], p);
  const opponent = g.players.filter((q) => q.side !== p.side && !q.keeper && hockeyActive(q) &&
    q.replacementFor === undefined && !(q.fightCooldown > 0) && distance(p, q) <= 80)
    .sort((a, b) => distance(p, a) - distance(p, b))[0];
  if (!opponent) {
    p.fightCooldown = 2;
    g.emit("fight-declined", { player: p.id, reason: "No nearby opponent" });
    return false;
  }
  g.fightChallenge = { from: p.id, target: opponent.id, remaining: 6 };
  g.emit("fight-challenge", { player: p.id, target: opponent.id });
  if (seatForPlayer(g, opponent.id)) return true;
  if (g.random() < 0.72) return beginFight(g, p, opponent);
  g.fightChallenge = null;
  p.fightCooldown = opponent.fightCooldown = 6;
  g.emit("fight-declined", { player: p.id, target: opponent.id, reason: "Opponent declined" });
  return false;
}

export function stepHockeyDiscipline(g, dt, humanInputs) {
  for (const p of g.players) {
    const input = humanInputs.get(p.id) || neutral();
    const context = hockeyControlContext(g, p);
    if (!input.shotHeld) {
      p.shotHold = 0; p.shotChargeContext = null; p.shotChargeBlocked = false;
    } else if (!context || p.shotChargeBlocked || (p.shotChargeContext && p.shotChargeContext !== context)) {
      p.shotHold = 0; p.shotChargeContext = null; p.shotChargeBlocked = true;
    } else {
      p.shotChargeContext = context;
      p.shotHold = Math.min(3, (p.shotHold || 0) + dt);
    }
  }
  if (g.phase === "fight" && g.fight) {
    g.fight.remaining -= dt;
    if (g.fight.remaining <= 0) {
      const [p, q] = g.fight.players.map((id) => g.players[id]);
      g.fight = null;
      addHockeyPenalty(g, p, "Fighting", 5, true);
      addHockeyPenalty(g, q, "Fighting", 5, true);
      g.restart("FACE-OFF · FIGHTING", g.lastTouch, g.ball.x, g.ball.y);
    }
    return true;
  }
  if (g.phase === "play") {
    for (const penalty of [...(g.penalties || [])]) {
      if (penalty.queued) {
        const activeMinors = g.penalties.filter((x) => x.side === penalty.side && !x.coincidental && !x.queued);
        if (activeMinors.length >= 2) continue;
        penalty.queued = false;
        const reserve = g.players.find((q) => q.replacementFor === penalty.playerId && hockeyActive(q));
        if (reserve) {
          if (g.ball.owner === reserve.id) {
            g.ball.owner = null;
            g.ball.lock = 0.1;
            g.puckEpoch = (g.puckEpoch || 0) + 1;
          }
          if (g.ball.receiver === reserve.id) g.ball.receiver = null;
          reserve.offIce = true; reserve.retired = true;
          const seat = seatForPlayer(g, reserve.id);
          if (seat?.mode === "team") hockeySwitchPlayer(g, seat);
          else if (!g.controllers?.length && g.controlled === reserve.id) hockeySwitchPlayer(g);
        }
      }
      penalty.remaining -= dt;
      if (penalty.remaining <= 0) releasePenalty(g, penalty);
    }
  }
  if (g.fightChallenge) {
    g.fightChallenge.remaining -= dt;
    if (g.fightChallenge.remaining <= 0 || g.phase !== "play" ||
        !hockeyActive(g.players[g.fightChallenge.from]) || !hockeyActive(g.players[g.fightChallenge.target]))
      g.fightChallenge = null;
  }
  for (const p of g.players) {
    const input = humanInputs.get(p.id) || neutral();
    p.fightCooldown = Math.max(0, (p.fightCooldown || 0) - dt);
    p.callCooldown = Math.max(0, (p.callCooldown || 0) - dt);
    p.callFlash = Math.max(0, (p.callFlash || 0) - dt);
    if (!input.fightHeld) {
      p.fightHold = 0; p.fightTriggered = false; p.fightBlocked = false;
    } else if (g.phase !== "play" || !hockeyActive(p) || canPlayHockeyPuck(g, p)) {
      p.fightHold = 0; p.fightBlocked = true;
    } else if (!p.fightBlocked && !p.fightTriggered) {
      p.fightHold = Math.min(HOCKEY.fightHold, (p.fightHold || 0) + dt);
      if (p.fightHold + 0.000001 >= HOCKEY.fightHold) attemptFight(g, p);
    }
  }
  return g.phase === "fight";
}

export function stepHockeyPlayer(g, p, dt) {
  p.hitTime = Math.max(0, (p.hitTime || 0) - dt);
  p.pokeTime = Math.max(0, (p.pokeTime || 0) - dt);
  p.shotPoseTime = Math.max(0, (p.shotPoseTime || 0) - dt);
  if (p.shotWindup > 0) {
    if (g.ball.owner !== p.id || p.pendingShot?.epoch !== (g.puckEpoch || 0) || !hockeyActive(p) || p.stun > 0) {
      p.shotWindup = 0; p.pendingShot = null;
    } else {
      p.shotWindup = Math.max(0, p.shotWindup - dt);
      if (!p.shotWindup) {
        const shot = p.pendingShot;
        p.pendingShot = null;
        strike(g, p, shot.input, shot.power, "slap");
      }
    }
  }
}

const landingSpeed = (kind) => kind === "dump" ? 0.82 : 0.6;
export function stepHockeyPuck(g, dt) {
  const b = g.ball;
  let groundTime = dt;
  if ((b.z || 0) > 0 || (b.vz || 0) > 0) {
    const z = Math.max(0, b.z || 0), vz = b.vz || 0;
    const remaining = (vz + Math.sqrt(vz * vz + 2 * HOCKEY.gravity * z)) / HOCKEY.gravity;
    const airStep = Math.min(dt, remaining);
    b.x += b.vx * airStep; b.y += b.vy * airStep;
    b.z = Math.max(0, z + vz * airStep - HOCKEY.gravity * airStep * airStep / 2);
    b.vz = vz - HOCKEY.gravity * airStep;
    b.airTime = Math.max(0, remaining - airStep);
    groundTime -= airStep;
    if (b.airTime < 0.000001) {
      resetHockeyFlight(b);
      b.passTarget = null;
      b.vx *= landingSpeed(b.flightKind); b.vy *= landingSpeed(b.flightKind);
    }
  }
  if (groundTime > 0) {
    b.x += b.vx * groundTime; b.y += b.vy * groundTime;
    const decay = Math.exp(-g.rules.ballDrag * groundTime);
    b.vx *= decay; b.vy *= decay;
  }
}

export function hockeyHeightAt(old, ball, fraction) {
  const f = clamp(fraction, 0, 1);
  if (old.dt && ((old.z || 0) > 0 || (old.vz || 0) > 0)) {
    const z = Math.max(0, old.z || 0), vz = old.vz || 0;
    const landing = (vz + Math.sqrt(vz * vz + 2 * HOCKEY.gravity * z)) / HOCKEY.gravity;
    let t = old.dt * f;
    if (landing < old.dt) {
      const speed = landingSpeed(old.flightKind);
      const travel = f * (landing + speed * (old.dt - landing));
      t = travel <= landing ? travel : landing + (travel - landing) / speed;
    }
    return Math.max(0, z + vz * t - HOCKEY.gravity * t * t / 2);
  }
  return Math.max(0, (old.z || 0) + ((ball.z || 0) - (old.z || 0)) * f);
}

export function hockeyReachable(p, old, b) {
  const dx = b.x - old.x, dy = b.y - old.y;
  const t = ((p.x - old.x) * dx + (p.y - old.y) * dy) / (dx * dx + dy * dy || 1);
  return hockeyHeightAt(old, b, t) <= (p.keeper ? HOCKEY.keeperHeight : HOCKEY.stickHeight);
}

export function hockeyBoundary(g, old) {
  const b = g.ball, w = g.rules.width, h = g.rules.height;
  const crossings = [];
  if (b.x < 0) crossings.push({ axis: "x", value: 0, t: (0 - old.x) / (b.x - old.x || 1) });
  if (b.x > w) crossings.push({ axis: "x", value: w, t: (w - old.x) / (b.x - old.x || 1) });
  if (b.y < 0) crossings.push({ axis: "y", value: 0, t: (0 - old.y) / (b.y - old.y || 1) });
  if (b.y > h) crossings.push({ axis: "y", value: h, t: (h - old.y) / (b.y - old.y || 1) });
  const edge = crossings.filter((e) => e.t >= 0 && e.t <= 1).sort((a, c) => a.t - c.t)[0];
  if (edge) {
    const z = hockeyHeightAt(old, b, edge.t);
    const crossX = old.x + (b.x - old.x) * edge.t;
    if (edge.axis === "y" && Math.abs(crossX - w / 2) < g.rules.goal / 2 && z <= HOCKEY.bar) {
      g.goal(edge.value === 0 ? 0 : 1);
      return true;
    }
    if (z > HOCKEY.glass) {
      const launch = b.launch;
      const defendingZone = launch && (launch.side === 0 ? launch.y > h * 2 / 3 : launch.y < h / 3);
      const offender = launch && g.players[launch.playerId];
      const delay = launch && !launch.deflected && defendingZone && hockeyActive(offender);
      if (delay) addHockeyPenalty(g, offender, "Delay of game", 2);
      const side = delay ? 1 - launch.side : 1 - g.lastTouch;
      const x = clamp(crossX, w * 0.24, w * 0.76);
      const y = delay ? (launch.side ? h * 0.22 : h * 0.78) : clamp(old.y, 80, h - 80);
      g.restart(delay ? "DELAY OF GAME · PUCK OVER GLASS" : "PUCK OUT · FACE-OFF", side, x, y);
      return true;
    }
  }
  let bounced = false;
  const belowGlass = edge ? hockeyHeightAt(old, b, edge.t) <= HOCKEY.glass : (b.z || 0) <= HOCKEY.glass;
  if ((b.x < 8 || b.x > w - 8) && belowGlass) {
    b.x = clamp(b.x, 8, w - 8); b.vx *= -0.83; bounced = true;
  }
  const inMouth = edge?.axis !== "y" && Math.abs(b.x - w / 2) < g.rules.goal / 2 && (b.z || 0) <= HOCKEY.bar;
  if ((b.y < 8 || b.y > h - 8) && !inMouth && belowGlass) {
    b.y = clamp(b.y, 8, h - 8); b.vy *= -0.82; bounced = true;
  }
  if (bounced) {
    if (b.launch) b.launch.deflected = true;
    g.emit("board");
  }
  return bounced;
}
