/** Bounded deterministic eight-ball simulation; units are table pixels. */
import { gamblingRandom } from './poker.mjs';

export const POOL_TABLE = Object.freeze({ width: 1000, height: 500, ballRadius: 11, pocketRadius: 26, pockets: Object.freeze([{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 500 }, { x: 500, y: 500 }, { x: 1000, y: 500 }]) });
const { width: W, height: H, ballRadius: R } = POOL_TABLE;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const groupOf = id => id > 0 && id < 8 ? 'solids' : id > 8 && id <= 15 ? 'stripes' : null;
const opposite = group => group === 'solids' ? 'stripes' : 'solids';
const note = (session, text) => { session.log.push(text); session.log = session.log.slice(-16); };
const round = n => Math.round(n * 100) / 100;
const remaining = (pool, group) => pool.balls.filter(ball => !ball.pocketed && groupOf(ball.id) === group).length;
const copyBalls = balls => balls.map(ball => ({ id: ball.id, x: round(ball.x), y: round(ball.y), pocketed: !!ball.pocketed }));

export function createPool(session) {
  const balls = [{ id: 0, x: 250, y: 250, pocketed: false }];
  // Eight in the center and opposite groups in the back corners.
  const rack = [1, 10, 2, 3, 8, 11, 12, 4, 13, 5, 6, 14, 7, 15, 9];
  let index = 0;
  for (let row = 0; row < 5; row++) for (let col = 0; col <= row; col++) balls.push({ id: rack[index++], x: 700 + row * Math.sqrt(3) * (R + .16), y: 250 + (col * 2 - row) * (R + .16), pocketed: false });
  session.pool = { balls: balls.sort((a, b) => a.id - b.id), groups: [null, null], ballInHand: false, shotNumber: 0, lastShot: null, recentShots: [], isBreak: true };
  session.turn = 0;
  note(session, 'You break. Pocket your group, then the 8. A foul gives the other player ball in hand.');
}
function clearPosition(pool, x, y) {
  return x >= R + 2 && x <= W - R - 2 && y >= R + 2 && y <= H - R - 2 && !pool.balls.some(ball => ball.id !== 0 && !ball.pocketed && Math.hypot(x - ball.x, y - ball.y) < 2 * R + 1);
}
export function placePoolCue(session, action) {
  const pool = session.pool;
  if (!pool.ballInHand) return { ok: false, reason: 'The cue ball can only be moved after a foul.' };
  if (typeof action.x !== 'number' || typeof action.y !== 'number' || !Number.isFinite(action.x) || !Number.isFinite(action.y) || !clearPosition(pool, action.x, action.y)) return { ok: false, reason: 'Place the cue ball on clear cloth, away from cushions and other balls.' };
  const cue = pool.balls.find(ball => ball.id === 0);
  cue.x = action.x; cue.y = action.y; cue.pocketed = false; pool.ballInHand = false;
  return { ok: true };
}
function pocketAt(x, y) {
  for (let index = 0; index < POOL_TABLE.pockets.length; index++) {
    const pocket = POOL_TABLE.pockets[index];
    if (Math.hypot(x - pocket.x, y - pocket.y) < POOL_TABLE.pocketRadius || (y < -5 || y > H + 5) && Math.abs(x - pocket.x) < 29 || (x < -5 || x > W + 5) && Math.abs(y - pocket.y) < 29) return index;
  }
  return null;
}
export function simulatePoolShot(sourceBalls, angle, power) {
  if (!Array.isArray(sourceBalls) || sourceBalls.length > 16 || typeof angle !== 'number' || !Number.isFinite(angle) || typeof power !== 'number' || !Number.isFinite(power) || power < .05 || power > 1) return null;
  const balls = sourceBalls.map(ball => ({ ...ball, vx: 0, vy: 0 })), cue = balls.find(ball => ball.id === 0 && !ball.pocketed);
  if (!cue) return null;
  const speed = 110 + power * 1190; cue.vx = Math.cos(angle) * speed; cue.vy = Math.sin(angle) * speed;
  const frames = [{ t: 0, balls: copyBalls(balls) }], pocketed = [], railBalls = new Set();
  const dt = 1 / 180, drag = Math.exp(-.48 * dt); let firstContact = null, railAfterContact = false, duration = 0;
  for (let step = 0; step < 1800; step++) {
    let moving = false; duration = (step + 1) * dt;
    for (const ball of balls) {
      if (ball.pocketed) continue;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      const pocket = pocketAt(ball.x, ball.y);
      if (pocket !== null) { ball.pocketed = true; ball.vx = 0; ball.vy = 0; pocketed.push(ball.id); continue; }
      let rail = false;
      const horizontalMouth = ball.x < 30 || ball.x > W - 30 || Math.abs(ball.x - W / 2) < 30;
      const verticalMouth = ball.y < 30 || ball.y > H - 30;
      if (!verticalMouth && ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx) * .86; rail = true; }
      if (!verticalMouth && ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx) * .86; rail = true; }
      if (!horizontalMouth && ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy) * .86; rail = true; }
      if (!horizontalMouth && ball.y > H - R) { ball.y = H - R; ball.vy = -Math.abs(ball.vy) * .86; rail = true; }
      // Jaw misses return to the playing bed rather than escaping its bounds.
      if (ball.x < -32 || ball.x > W + 32 || ball.y < -32 || ball.y > H + 32) {
        ball.x = clamp(ball.x, R, W - R); ball.y = clamp(ball.y, R, H - R); ball.vx *= -.65; ball.vy *= -.65; rail = true;
      }
      if (rail) { railBalls.add(ball.id); if (firstContact !== null) railAfterContact = true; }
    }
    for (let a = 0; a < balls.length - 1; a++) for (let b = a + 1; b < balls.length; b++) {
      const left = balls[a], right = balls[b]; if (left.pocketed || right.pocketed) continue;
      const dx = right.x - left.x, dy = right.y - left.y, d = Math.hypot(dx, dy);
      if (d >= 2 * R) continue;
      const nx = d ? dx / d : 1, ny = d ? dy / d : 0, overlap = (2 * R - d) / 2 + .002;
      left.x -= nx * overlap; left.y -= ny * overlap; right.x += nx * overlap; right.y += ny * overlap;
      const velocity = (right.vx - left.vx) * nx + (right.vy - left.vy) * ny;
      if (velocity >= 0) continue;
      if (firstContact === null && (left.id === 0 || right.id === 0)) firstContact = left.id === 0 ? right.id : left.id;
      const impulse = -(1 + .97) * velocity / 2;
      left.vx -= impulse * nx; left.vy -= impulse * ny; right.vx += impulse * nx; right.vy += impulse * ny;
    }
    for (const ball of balls) {
      if (ball.pocketed) continue;
      const velocity = Math.hypot(ball.vx, ball.vy), next = Math.max(0, velocity * drag - 30 * dt), scale = velocity > 0 ? next / velocity : 0;
      ball.vx *= scale; ball.vy *= scale;
      if (next < 4) { ball.vx = 0; ball.vy = 0; } else moving = true;
    }
    if (step % 18 === 17) frames.push({ t: round(duration), balls: copyBalls(balls) });
    if (!moving) break;
  }
  const final = copyBalls(balls); frames.push({ t: round(duration), balls: final });
  const sampled = frames.length <= 50 ? frames : Array.from({ length: 50 }, (_, i) => frames[Math.round(i * (frames.length - 1) / 49)]);
  return { balls: final, frames: sampled, pocketed, firstContact, railAfterContact, railBalls: [...railBalls], duration: round(duration) };
}
function spotBall(pool, id) {
  const ball = pool.balls.find(value => value.id === id);
  for (let step = 0; step < 70; step++) {
    const x = clamp(700 + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 24, R + 2, W - R - 2), y = 250;
    if (!pool.balls.some(other => other.id !== id && !other.pocketed && Math.hypot(x - other.x, y - other.y) < R * 2 + 1)) { Object.assign(ball, { x, y, pocketed: false }); return; }
  }
  for (let y = 40; y < H; y += 26) for (let x = 40; x < W; x += 26) if (!pool.balls.some(other => other.id !== id && !other.pocketed && Math.hypot(x - other.x, y - other.y) < R * 2 + 1)) { Object.assign(ball, { x, y, pocketed: false }); return; }
}
function finishPool(session, winner, reason) {
  session.status = 'complete'; session.turn = null; session.payout = [winner === 0 ? session.stake * 2 : 0, winner === 1 ? session.stake * 2 : 0];
  session.result = { winner, outcome: winner === 0 ? 'win' : 'loss', reason, returned: session.payout[0], net: session.payout[0] - session.escrow };
  note(session, reason);
}
export function forfeitPool(session, seat) { finishPool(session, 1 - seat, `${session.names[seat]} concedes the rack.`); return { ok: true }; }
export function actPool(session, action, seat) {
  const pool = session.pool;
  if (action.type === 'place') return placePoolCue(session, action);
  if (action.type !== 'shoot') return { ok: false, reason: 'Aim the cue and take a shot.' };
  if (pool.ballInHand) return { ok: false, reason: 'Place the cue ball on clear cloth before shooting.' };
  if (typeof action.angle !== 'number' || !Number.isFinite(action.angle) || Math.abs(action.angle) > Math.PI * 100 || typeof action.power !== 'number' || !Number.isFinite(action.power) || action.power < .05 || action.power > 1) return { ok: false, reason: 'Choose a valid aim and power from 5% to 100%.' };
  const group = pool.groups[seat], onEight = !!group && remaining(pool, group) === 0, wasBreak = pool.isBreak;
  const shot = simulatePoolShot(pool.balls, action.angle, action.power);
  if (!shot) return { ok: false, reason: 'The cue ball is not ready.' };
  pool.balls = shot.balls; pool.shotNumber++;
  const scratch = shot.pocketed.includes(0), eight = shot.pocketed.includes(8), objectPots = shot.pocketed.filter(id => id !== 0 && id !== 8);
  const wrongFirst = shot.firstContact !== null && (onEight ? shot.firstContact !== 8 : group ? groupOf(shot.firstContact) !== group : shot.firstContact === 8);
  let foul = scratch ? 'Scratch' : shot.firstContact === null ? 'No object ball hit' : wrongFirst ? 'Wrong ball hit first' : !shot.railAfterContact && !shot.pocketed.length ? 'No ball reached a cushion or pocket after contact' : null;
  if (wasBreak && !foul && !objectPots.length && shot.railBalls.filter(id => id !== 0).length < 4) foul = 'Soft break: pocket a ball or send four object balls to cushions';
  if (wasBreak && eight) { spotBall(pool, 8); note(session, 'Eight on the break: spotted back on the table.'); }
  if (eight && !wasBreak) {
    finishPool(session, onEight && !foul ? seat : 1 - seat, onEight && !foul ? `${session.names[seat]} pockets the 8 and wins.` : `${session.names[seat]} ${scratch ? 'scratches while pocketing the 8' : 'pockets the 8 before a legal finish'}; ${session.names[1 - seat]} wins.`);
  } else {
    if (!foul && !wasBreak && !group && objectPots.length) {
      pool.groups[seat] = groupOf(objectPots[0]); pool.groups[1 - seat] = opposite(pool.groups[seat]);
      note(session, `${session.names[seat]} takes ${pool.groups[seat]}.`);
    }
    const ownPot = objectPots.some(id => !pool.groups[seat] || groupOf(id) === pool.groups[seat]);
    if (foul) { session.turn = 1 - seat; pool.ballInHand = true; if (scratch) spotBall(pool, 0); }
    else { session.turn = ownPot ? seat : 1 - seat; pool.ballInHand = false; }
  }
  pool.isBreak = false;
  const message = foul ? `${session.names[seat]}: ${foul.toLowerCase()}. Ball in hand for ${session.names[1 - seat]}.` : `${session.names[seat]} ${objectPots.length ? `pockets ${objectPots.join(', ')}` : 'finishes the shot'}.`;
  // Update the final replay frame after spotting the cue/eight.
  shot.frames[shot.frames.length - 1].balls = copyBalls(pool.balls);
  pool.lastShot = { actor: seat, number: pool.shotNumber, frames: shot.frames, pocketed: shot.pocketed, firstContact: shot.firstContact, foul, message, duration: shot.duration };
  pool.recentShots.push(pool.lastShot); pool.recentShots = pool.recentShots.slice(-16);
  if (session.status !== 'complete') note(session, message);
  return { ok: true };
}
function segmentDistance(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
  const t = length2 ? clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / length2, 0, 1) : 0;
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}
function targetBalls(pool, seat) {
  const group = pool.groups[seat], onEight = group && remaining(pool, group) === 0;
  return pool.balls.filter(ball => !ball.pocketed && (onEight ? ball.id === 8 : group ? groupOf(ball.id) === group : groupOf(ball.id)));
}
function cuePlacement(pool, seat) {
  const cue = pool.balls.find(ball => ball.id === 0), targets = targetBalls(pool, seat), candidates = [];
  for (const ball of targets) for (const pocket of POOL_TABLE.pockets) {
    const dx = ball.x - pocket.x, dy = ball.y - pocket.y, length = Math.hypot(dx, dy) || 1;
    candidates.push({ x: ball.x + dx / length * 130, y: ball.y + dy / length * 130 });
  }
  candidates.push({ x: 250, y: 250 });
  for (let y = 60; y < H; y += 60) for (let x = 60; x < W; x += 80) candidates.push({ x, y });
  const safe = candidates.find(point => clearPosition(pool, point.x, point.y));
  if (safe) Object.assign(cue, safe, { pocketed: false }); pool.ballInHand = false;
}
export function npcPoolAction(session) {
  const pool = session.pool, seat = 1;
  if (pool.ballInHand) cuePlacement(pool, seat);
  const cue = pool.balls.find(ball => ball.id === 0), targets = targetBalls(pool, seat);
  let best = null;
  for (const target of targets) for (const pocket of POOL_TABLE.pockets) {
    const dx = pocket.x - target.x, dy = pocket.y - target.y, travel = Math.hypot(dx, dy) || 1;
    const ghost = { x: target.x - dx / travel * R * 2, y: target.y - dy / travel * R * 2 };
    if (ghost.x < R || ghost.x > W - R || ghost.y < R || ghost.y > H - R) continue;
    const shotLength = Math.hypot(ghost.x - cue.x, ghost.y - cue.y), alignment = ((ghost.x - cue.x) * dx + (ghost.y - cue.y) * dy) / Math.max(1, shotLength * travel);
    if (alignment < .2) continue;
    const blocked = pool.balls.some(ball => !ball.pocketed && ball.id !== 0 && ball.id !== target.id && (segmentDistance(ball, cue, ghost) < R * 2 + 1 || segmentDistance(ball, target, pocket) < R * 2 + 1));
    if (blocked) continue;
    const score = shotLength + travel * .6 + (1 - alignment) * 950;
    if (!best || score < best.score) best = { angle: Math.atan2(ghost.y - cue.y, ghost.x - cue.x), power: clamp(.26 + (shotLength + travel) / 2200, .25, .85), score };
  }
  if (!best) {
    const target = targets.sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0];
    best = { angle: target ? Math.atan2(target.y - cue.y, target.x - cue.x) : 0, power: .4 + gamblingRandom(session) * .27 };
  }
  return { type: 'shoot', angle: best.angle + (gamblingRandom(session) - .5) * .028, power: clamp(best.power + (gamblingRandom(session) - .5) * .05, .05, 1) };
}
export function poolLegal(session, seat = 0) {
  if (session.status !== 'playing' || session.turn !== seat) return [];
  return [session.pool.ballInHand ? 'place' : 'shoot', 'forfeit'];
}
export function poolRemaining(pool) { return [remaining(pool, 'solids'), remaining(pool, 'stripes')]; }
