/** Corner Pocket: shared, deterministic table physics and a small 8-ball ruleset. */
export const FIXED_DT = 1 / 240;
const R = .028575;
const W = 1.27;
const H = .635;
const CORNER_MOUTH = .095;
const SIDE_MOUTH = .086;
const pockets = [
  { id: 0, x: -W, z: -H }, { id: 1, x: 0, z: -H },
  { id: 2, x: W, z: -H }, { id: 3, x: W, z: H },
  { id: 4, x: 0, z: H }, { id: 5, x: -W, z: H }
];
const rails = [];
for (const z of [-H, H]) {
  rails.push({ a: { x: -W + CORNER_MOUTH, z }, b: { x: -SIDE_MOUTH, z } });
  rails.push({ a: { x: SIDE_MOUTH, z }, b: { x: W - CORNER_MOUTH, z } });
}
for (const x of [-W, W]) rails.push({
  a: { x, z: -H + CORNER_MOUTH }, b: { x, z: H - CORNER_MOUTH }
});
export const TABLE = Object.freeze({
  width: W * 2, height: H * 2, halfW: W, halfH: H, radius: R,
  pocketRadius: .067, cornerMouth: CORNER_MOUTH, sideMouth: SIDE_MOUTH,
  pockets, rails
});

const ROLL_DRAG = .38;
const BALL_RESTITUTION = .965;
const RAIL_RESTITUTION = .82;
const STOP_SPEED = .014;
const MAX_SHOT_SECONDS = 24;
const EPS = 1e-8;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const groupOf = id => id > 0 && id < 8 ? 'solids' : id > 8 && id <= 15 ? 'stripes' : null;
const otherGroup = group => group === 'solids' ? 'stripes' : 'solids';
const cleanName = (name, fallback) => String(name || fallback).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || fallback;

function randomSource(seed) {
  let value = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : 1;
  return () => {
    value += 0x6D2B79F5;
    let n = value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function event(state, kind, data = {}) {
  const item = { id: ++state.eventId, kind, time: state.time, ...data };
  state.events.push(item);
  if (state.events.length > 40) state.events.splice(0, state.events.length - 40);
  return item;
}

export function createGame({ names = ['Player 1', 'Player 2'], mode = 'local', seed = 1, breaker = 0 } = {}) {
  const rng = randomSource(seed);
  const ids = Array.from({ length: 15 }, (_, i) => i + 1).filter(id => ![1, 7, 8, 15].includes(id));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const balls = [{ id: 0, x: -.635, z: 0, vx: 0, vz: 0, pocketed: false, pocket: null }];
  for (let row = 0; row < 5; row++) for (let col = 0; col <= row; col++) {
    const id = row === 0 ? 1 : row === 2 && col === 1 ? 8 :
      row === 4 && col === 0 ? 7 : row === 4 && col === 4 ? 15 : ids.pop();
    balls.push({ id, x: .635 + row * Math.sqrt(3) * R * 1.001,
      z: (2 * col - row) * R * 1.001, vx: 0, vz: 0, pocketed: false, pocket: null });
  }
  balls.sort((a, b) => a.id - b.id);
  const turn = breaker === 1 ? 1 : 0;
  const players = [0, 1].map(i => ({
    name: cleanName(names?.[i], `Player ${i + 1}`), group: null,
    shots: 0, pots: 0, fouls: 0
  }));
  return {
    id: globalThis.crypto?.randomUUID?.() || `rack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    mode, seed, phase: 'aiming', balls, players, turn, breakShot: true,
    ballInHand: false, cuePlaced: false, winner: null, reason: '',
    message: `${players[turn].name} to break. Aim at the rack and give it some power.`,
    shotNumber: 0, calledPocket: null, events: [], eventId: 0,
    time: 0, shot: null, lastShot: null, stillTime: 0, physicsRemainder: 0
  };
}

export function legalTargets(state, playerIndex = state.turn) {
  const remaining = state.balls.filter(ball => ball.id !== 0 && !ball.pocketed);
  if (state.breakShot) return remaining.map(ball => ball.id);
  const group = state.players[playerIndex]?.group;
  if (!group) return remaining.filter(ball => ball.id !== 8).map(ball => ball.id);
  const own = remaining.filter(ball => groupOf(ball.id) === group).map(ball => ball.id);
  return own.length ? own : remaining.some(ball => ball.id === 8) ? [8] : [];
}

function canPlaceBall(state, x, z, ignoredId) {
  if (!finite(x) || !finite(z) || Math.abs(x) > W - R - .001 || Math.abs(z) > H - R - .001) return false;
  if (pockets.some(p => Math.hypot(x - p.x, z - p.z) < TABLE.pocketRadius + .012)) return false;
  return !state.balls.some(ball => ball.id !== ignoredId && !ball.pocketed && Math.hypot(x - ball.x, z - ball.z) < R * 2 + .0005);
}

export function canPlaceCue(state, x, z) {
  return state.phase === 'aiming' && state.ballInHand && canPlaceBall(state, x, z, 0);
}

export function placeCue(state, { x, z } = {}) {
  if (state.phase !== 'aiming' || !state.ballInHand) return { ok: false, error: 'The cue ball can only be moved when you have ball in hand.' };
  if (!canPlaceCue(state, x, z)) return { ok: false, error: 'Place the cue ball on clear felt, away from the pockets and other balls.' };
  const cue = state.balls.find(ball => ball.id === 0);
  Object.assign(cue, { x, z, vx: 0, vz: 0, pocketed: false, pocket: null, offTable: false });
  state.cuePlaced = true;
  state.message = `${state.players[state.turn].name}: cue ball placed. Aim and shoot, or move it again.`;
  return { ok: true };
}

export function shoot(state, { angle, power, spin = 0, calledPocket = null } = {}) {
  if (state.phase !== 'aiming') return { ok: false, error: state.phase === 'finished' ? 'This rack has finished.' : 'Wait for the balls to stop.' };
  if (!finite(angle) || !finite(power) || power <= 0 || power > 1 || !finite(spin) || spin < -1 || spin > 1)
    return { ok: false, error: 'Choose a valid aim, power, and cue spin.' };
  if (calledPocket !== null && (!Number.isInteger(calledPocket) || calledPocket < 0 || calledPocket > 5))
    return { ok: false, error: 'Choose one of the six pockets.' };
  if (state.ballInHand && !state.cuePlaced) return { ok: false, error: 'Place the cue ball on the table first.' };
  const targets = legalTargets(state);
  const onEight = !state.breakShot && targets.length === 1 && targets[0] === 8;
  if (onEight && calledPocket === null) return { ok: false, error: 'Call a pocket for the 8 ball before shooting.' };
  const cue = state.balls.find(ball => ball.id === 0);
  if (!cue || cue.pocketed) return { ok: false, error: 'The cue ball is not on the table.' };
  const speed = .10 + 8 * Math.pow(power, 1.35);
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  state.shot = {
    player: state.turn, breakShot: state.breakShot, group: state.players[state.turn].group,
    legalTargets: targets, onEight, calledPocket, angle, power, spin, spinApplied: false,
    firstContact: null, railAfterContact: false, objectRailIds: [],
    pocketed: [], offTable: [], scratch: false, elapsed: 0,
    impactTimes: {}, startedAt: state.time
  };
  state.phase = 'rolling';
  state.ballInHand = false;
  state.cuePlaced = false;
  state.calledPocket = calledPocket;
  state.shotNumber++;
  state.players[state.turn].shots++;
  state.reason = '';
  state.stillTime = 0;
  state.physicsRemainder = 0;
  state.message = `${state.players[state.turn].name}'s shot…`;
  cue.vx = Math.cos(angle) * speed;
  cue.vz = Math.sin(angle) * speed;
  event(state, 'shot', { player: state.turn, ballId: 0, speed, power });
  return { ok: true };
}

function pocketBall(state, ball, pocket) {
  const speed = Math.hypot(ball.vx, ball.vz);
  Object.assign(ball, { pocketed: true, pocket: pocket.id, pocketAt: state.time, vx: 0, vz: 0 });
  state.shot.pocketed.push({ id: ball.id, pocket: pocket.id, time: state.time });
  if (ball.id === 0) state.shot.scratch = true;
  event(state, 'pocket', { ballId: ball.id, pocket: pocket.id, speed });
}

function nearestPoint(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return { x: a.x + t * dx, z: a.z + t * dz };
}

function enterPocket(state, ball, previous) {
  for (const p of pockets) {
    // A swept test also catches a fast ball crossing the mouth between substeps.
    const dx = ball.x - previous.x, dz = ball.z - previous.z;
    const length2 = dx * dx + dz * dz;
    const u = length2 > EPS ? clamp(((p.x - previous.x) * dx + (p.z - previous.z) * dz) / length2, 0, 1) : 1;
    const x = previous.x + dx * u, z = previous.z + dz * u;
    if ((x - p.x) ** 2 + (z - p.z) ** 2 <= TABLE.pocketRadius ** 2) {
      pocketBall(state, ball, p);
      return true;
    }
  }
  return false;
}

function noteRail(state, ball, speed) {
  const shot = state.shot;
  if (shot.firstContact !== null) {
    shot.railAfterContact = true;
    if (ball.id !== 0 && !shot.objectRailIds.includes(ball.id)) shot.objectRailIds.push(ball.id);
  }
  const key = `r${ball.id}`;
  if (speed > .12 && state.time - (shot.impactTimes[key] ?? -1) > .06) {
    shot.impactTimes[key] = state.time;
    event(state, 'rail', { ballId: ball.id, speed });
  }
}

function collideRails(state, ball) {
  for (const rail of rails) {
    const closest = nearestPoint(ball, rail.a, rail.b);
    let nx = ball.x - closest.x, nz = ball.z - closest.z;
    const distance = Math.hypot(nx, nz);
    if (distance >= R) continue;
    if (distance > EPS) { nx /= distance; nz /= distance; }
    else if (Math.abs(rail.a.x - rail.b.x) < EPS) { nx = -Math.sign(rail.a.x); nz = 0; }
    else { nx = 0; nz = -Math.sign(rail.a.z); }
    ball.x += nx * (R - distance + .000002);
    ball.z += nz * (R - distance + .000002);
    const into = ball.vx * nx + ball.vz * nz;
    if (into < -EPS) {
      ball.vx -= (1 + RAIL_RESTITUTION) * into * nx;
      ball.vz -= (1 + RAIL_RESTITUTION) * into * nz;
      noteRail(state, ball, -into);
    }
  }
}

function collidePair(state, a, b) {
  let nx = b.x - a.x, nz = b.z - a.z;
  const distance2 = nx * nx + nz * nz;
  if (distance2 >= 4 * R * R) return;
  const distance = Math.sqrt(distance2);
  if (distance > EPS) { nx /= distance; nz /= distance; }
  else { nx = a.id < b.id ? 1 : -1; nz = 0; }
  const correction = (2 * R - distance + .000001) * .5;
  a.x -= nx * correction; a.z -= nz * correction;
  b.x += nx * correction; b.z += nz * correction;
  const along = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (along >= -EPS) return;
  const impulse = -(1 + BALL_RESTITUTION) * along * .5;
  const cue = a.id === 0 ? a : b.id === 0 ? b : null;
  const cueSpeed = cue ? Math.hypot(cue.vx, cue.vz) : 0;
  a.vx -= impulse * nx; a.vz -= impulse * nz;
  b.vx += impulse * nx; b.vz += impulse * nz;
  const shot = state.shot;
  if (cue && shot.firstContact === null) {
    shot.firstContact = a.id === 0 ? b.id : a.id;
    // Longitudinal english is intentionally modest. It decays over the cloth
    // before impact and gives the cue ball follow/draw after its first contact.
    const spinKick = clamp(shot.spin * cueSpeed * .28 * Math.exp(-shot.elapsed * .9), -1.5, 1.5);
    cue.vx += Math.cos(shot.angle) * spinKick;
    cue.vz += Math.sin(shot.angle) * spinKick;
    shot.spinApplied = true;
  }
  const key = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
  if (impulse > .08 && state.time - (shot.impactTimes[key] ?? -1) > .045) {
    shot.impactTimes[key] = state.time;
    event(state, 'collision', { ballId: a.id, otherId: b.id, speed: impulse });
  }
}

function physicalStep(state, h) {
  state.time += h;
  state.shot.elapsed += h;
  let active = state.balls.filter(ball => !ball.pocketed);
  for (const ball of active) {
    const previous = { x: ball.x, z: ball.z };
    ball.x += ball.vx * h;
    ball.z += ball.vz * h;
    enterPocket(state, ball, previous);
  }
  active = active.filter(ball => !ball.pocketed);
  // Multiple passes release a close-packed break without leaving overlaps.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) collidePair(state, active[i], active[j]);
    for (const ball of active) collideRails(state, ball);
  }
  for (const ball of active) {
    if (Math.abs(ball.x) > W + .10 || Math.abs(ball.z) > H + .10) {
      ball.pocketed = true; ball.offTable = true; ball.vx = ball.vz = 0;
      state.shot.offTable.push(ball.id);
      if (ball.id === 0) state.shot.scratch = true;
      continue;
    }
    const speed = Math.hypot(ball.vx, ball.vz);
    const next = speed - ROLL_DRAG * h;
    if (next <= STOP_SPEED) ball.vx = ball.vz = 0;
    else {
      const multiplier = Math.min(9, next) / speed;
      ball.vx *= multiplier; ball.vz *= multiplier;
    }
  }
  const moving = state.balls.some(ball => !ball.pocketed && (ball.vx !== 0 || ball.vz !== 0));
  state.stillTime = moving ? 0 : state.stillTime + h;
}

export function step(state, dt = FIXED_DT) {
  if (state.phase !== 'rolling' || !state.shot || !finite(dt) || dt <= 0) return state;
  state.physicsRemainder = (state.physicsRemainder || 0) + Math.min(dt, .25);
  while (state.physicsRemainder + EPS >= FIXED_DT && state.phase === 'rolling') {
    state.physicsRemainder = Math.max(0, state.physicsRemainder - FIXED_DT);
    const maxSpeed = Math.max(0, ...state.balls.filter(ball => !ball.pocketed).map(ball => Math.hypot(ball.vx, ball.vz)));
    const substeps = Math.max(1, Math.ceil(maxSpeed * FIXED_DT / (R * .40)));
    const h = FIXED_DT / substeps;
    for (let i = 0; i < substeps && state.phase === 'rolling'; i++) {
      physicalStep(state, h);
      if (state.stillTime >= .12 || state.shot.elapsed >= MAX_SHOT_SECONDS) {
        for (const ball of state.balls) ball.vx = ball.vz = 0;
        settleShot(state);
        state.physicsRemainder = 0;
      }
    }
  }
  return state;
}

function findSpot(state, ignoredId, preferredX = .635, preferredZ = 0) {
  if (canPlaceBall(state, preferredX, preferredZ, ignoredId)) return { x: preferredX, z: preferredZ };
  // Spot along the long string toward the foot rail, then toward the head rail.
  for (const sign of [1, -1]) for (let i = 1; i <= 34; i++) {
    const x = preferredX + sign * i * (R * 2 + .001);
    if (canPlaceBall(state, x, preferredZ, ignoredId)) return { x, z: preferredZ };
  }
  for (let z = -H + R * 2; z < H - R; z += R * 2.1) for (let x = -W + R * 2; x < W - R; x += R * 2.1)
    if (canPlaceBall(state, x, z, ignoredId)) return { x, z };
  return { x: 0, z: 0 }; // Sixteen balls cannot fill the table; unreachable in a valid rack.
}

function respot(state, id, preferredX = .635, preferredZ = 0) {
  const ball = state.balls.find(ball => ball.id === id);
  const spot = findSpot(state, id, preferredX, preferredZ);
  Object.assign(ball, spot, { vx: 0, vz: 0, pocketed: false, pocket: null, offTable: false });
}

function foulReason(shot) {
  if (shot.scratch) return 'Cue ball scratched';
  if (shot.offTable.length) return 'A ball left the table';
  if (shot.firstContact === null) return 'No object ball hit';
  if (!shot.legalTargets.includes(shot.firstContact)) return shot.firstContact === 8 ? 'The 8 ball was hit first' : 'The wrong group was hit first';
  if (shot.breakShot) {
    if (!shot.pocketed.some(ball => ball.id !== 0) && shot.objectRailIds.length < 4) return 'Soft break: pocket a ball or send four object balls to a rail';
  } else if (!shot.railAfterContact && !shot.pocketed.some(ball => ball.id !== 0)) return 'No ball reached a rail after contact';
  return '';
}

export function settleShot(state) {
  if (state.phase !== 'rolling' || !state.shot) return state;
  const shot = state.shot;
  const shooter = state.players[shot.player];
  const opponent = 1 - shot.player;
  const foul = foulReason(shot);
  const eight = shot.pocketed.find(ball => ball.id === 8);
  const objects = shot.pocketed.filter(ball => ball.id !== 0 && ball.id !== 8);
  for (const ball of state.balls) ball.vx = ball.vz = 0;
  state.lastShot = {
    player: shot.player, firstContact: shot.firstContact, pocketed: shot.pocketed.map(ball => ball.id),
    foul: !!foul, foulReason: foul, keptTurn: false, calledPocket: shot.calledPocket,
    breakShot: shot.breakShot
  };
  shooter.pots += objects.length + (eight && !shot.breakShot ? 1 : 0);
  if (foul) shooter.fouls++;
  state.breakShot = false;
  state.phase = 'aiming';
  state.calledPocket = null;
  state.reason = foul;
  state.ballInHand = false;
  state.cuePlaced = false;

  if (shot.breakShot) {
    if (eight || shot.offTable.includes(8)) respot(state, 8);
  } else if (eight || shot.offTable.includes(8)) {
    let lossReason = foul;
    if (!shot.onEight) lossReason = 'The 8 ball went down before the group was cleared';
    else if (eight && eight.pocket !== shot.calledPocket) lossReason = 'The 8 ball went into a different pocket';
    const won = !!eight && shot.onEight && !foul && eight.pocket === shot.calledPocket;
    state.winner = won ? shot.player : opponent;
    state.phase = 'finished';
    state.reason = won ? 'Called 8 ball pocketed legally' : lossReason || 'The 8 ball left the table';
    state.message = won ? `${shooter.name} wins. The 8 ball goes in the called pocket.` :
      `${state.players[opponent].name} wins. ${state.reason}.`;
    event(state, 'result', { player: shot.player, winner: state.winner, foul: !!foul, message: state.message });
    state.shot = null;
    return state;
  }

  for (const id of shot.offTable) if (id !== 0 && id !== 8) respot(state, id);
  if (foul) {
    state.turn = opponent;
    state.ballInHand = true;
    // Show the ball on the cloth as a placement reference, but require a choice.
    respot(state, 0, -.635, 0);
    state.message = `Foul: ${foul.charAt(0).toLowerCase() + foul.slice(1)}. ${state.players[opponent].name} has ball in hand.`;
  } else {
    if (!shot.breakShot && !shooter.group && objects.length) {
      shooter.group = groupOf(objects[0].id);
      state.players[opponent].group = otherGroup(shooter.group);
    }
    const ownPot = shot.breakShot ? shot.pocketed.some(ball => ball.id !== 0) :
      objects.some(ball => groupOf(ball.id) === shooter.group);
    state.turn = ownPot ? shot.player : opponent;
    state.lastShot.keptTurn = ownPot;
    if (shot.breakShot && eight) state.message = `8 on the break: spotted. ${state.players[state.turn].name} to shoot; the table is open.`;
    else if (shot.breakShot) state.message = `${state.players[state.turn].name} to shoot. The table is open.`;
    else if (!shot.group && shooter.group) state.message = `${shooter.name} takes ${shooter.group}. Keep shooting.`;
    else if (ownPot) state.message = `${shooter.name} keeps the table.${legalTargets(state).includes(8) ? ' Call a pocket for the 8 ball.' : ''}`;
    else state.message = `${state.players[state.turn].name} to shoot.${legalTargets(state).includes(8) ? ' Call a pocket for the 8 ball.' : ''}`;
  }
  event(state, 'result', { player: shot.player, turn: state.turn, foul: !!foul, message: state.message });
  state.shot = null;
  return state;
}

function rayCircle(start, dx, dz, center, radius) {
  const ox = start.x - center.x, oz = start.z - center.z;
  const b = ox * dx + oz * dz;
  const c = ox * ox + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return Infinity;
  const near = -b - Math.sqrt(discriminant);
  if (near >= -EPS) return Math.max(0, near);
  return c <= 0 ? 0 : Infinity;
}

export function predictAim(state, angle) {
  const cue = state.balls.find(ball => ball.id === 0);
  const start = { x: cue?.x || 0, z: cue?.z || 0 };
  if (!finite(angle) || !cue || cue.pocketed) return { start, end: { ...start }, hitId: null, ghost: null, objectEnd: null, cueEnd: null };
  const dx = Math.cos(angle), dz = Math.sin(angle);
  let distance = 5;
  for (const rail of rails) {
    // The ray hits the same round-ended cushion segments used by physics.
    if (Math.abs(rail.a.z - rail.b.z) < EPS && Math.abs(dz) > EPS) {
      const z = rail.a.z - Math.sign(rail.a.z) * R;
      const t = (z - start.z) / dz, x = start.x + dx * t;
      if (t >= 0 && x >= rail.a.x && x <= rail.b.x) distance = Math.min(distance, t);
    }
    if (Math.abs(rail.a.x - rail.b.x) < EPS && Math.abs(dx) > EPS) {
      const x = rail.a.x - Math.sign(rail.a.x) * R;
      const t = (x - start.x) / dx, z = start.z + dz * t;
      if (t >= 0 && z >= rail.a.z && z <= rail.b.z) distance = Math.min(distance, t);
    }
    distance = Math.min(distance, rayCircle(start, dx, dz, rail.a, R), rayCircle(start, dx, dz, rail.b, R));
  }
  for (const pocket of pockets) distance = Math.min(distance, rayCircle(start, dx, dz, pocket, TABLE.pocketRadius));
  let hit = null;
  for (const ball of state.balls) if (ball.id !== 0 && !ball.pocketed) {
    const t = rayCircle(start, dx, dz, ball, 2 * R);
    if (t < distance) { distance = t; hit = ball; }
  }
  distance = Math.min(distance, 3.2);
  const end = { x: start.x + dx * distance, z: start.z + dz * distance };
  if (!hit) return { start, end, hitId: null, ghost: null, objectEnd: null, cueEnd: null };
  const separation = Math.hypot(hit.x - end.x, hit.z - end.z) || 1;
  const nx = (hit.x - end.x) / separation, nz = (hit.z - end.z) / separation;
  const normal = dx * nx + dz * nz;
  const tx = dx - nx * normal, tz = dz - nz * normal;
  return { start, end, hitId: hit.id, ghost: { ...end },
    objectEnd: { x: hit.x + nx * .32, z: hit.z + nz * .32 },
    cueEnd: { x: end.x + tx * .30, z: end.z + tz * .30 } };
}
