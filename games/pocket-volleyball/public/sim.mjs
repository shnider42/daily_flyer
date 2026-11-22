/** Pocket Volleyball — shared, deterministic, DOM-free court authority. */
export const VERSION = '0.1.0';
export const COURT = Object.freeze({ halfLength: 8, halfWidth: 4, netHeight: 2.2 });
export const TEAM_NAMES = Object.freeze(['Tideline', 'Sunbreak']);
const G = 9.8;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const hypot = Math.hypot;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const signFor = team => team === 0 ? -1 : 1;
const other = team => 1 - team;
const otherPlayer = p => p.id ^ 1;
const DIFFICULTY = {
  chill: { speed: 3.65, reach: 0.95, error: 0.34, miss: 0.14, attack: 0.96, reaction: 0.3 },
  club: { speed: 4.3, reach: 1.02, error: 0.16, miss: 0.075, attack: 0.79, reaction: 0.22 },
  pro: { speed: 4.85, reach: 1.12, error: 0.055, miss: 0.035, attack: 0.7, reaction: 0.14 },
};

function random(s) {
  let n = s._rng | 0;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  s._rng = n >>> 0;
  return s._rng / 4294967296;
}
const between = (s, a, b) => a + (b - a) * random(s);
function event(s, type, team = null, playerId = null, extra = {}) {
  s.lastEvent = { id: s.lastEvent.id + 1, type, team, playerId,
    x: s.ball.x, y: s.ball.y, ...extra };
}
function cleanInput(input) {
  const i = input && typeof input === 'object' ? input : {};
  let mx = finite(i.mx) ? clamp(i.mx, -1, 1) : 0;
  let my = finite(i.my) ? clamp(i.my, -1, 1) : 0;
  const length = hypot(mx, my);
  if (length > 1) { mx /= length; my /= length; }
  return { mx, my, pass: i.pass === true, spike: i.spike === true,
    dive: i.dive === true, switch: i.switch === true };
}

/** Returns the next ground contact for the current free flight. */
export function predictLanding(ball) {
  if (!ball || ![ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].every(finite)) {
    return { x: 0, y: 0, time: 0 };
  }
  const time = Math.max(0, (ball.vz + Math.sqrt(Math.max(0, ball.vz * ball.vz + 2 * G * Math.max(0, ball.z)))) / G);
  return { x: ball.x + ball.vx * time, y: ball.y + ball.vy * time, time };
}

export function controllerPlayer(s, index = 0) {
  const id = s.controls[index];
  return Number.isInteger(id) && id >= 0 ? s.players[id] || null : null;
}

export function createMatch(options = {}) {
  const mode = ['solo', 'versus', 'coop'].includes(options.mode) ? options.mode : 'solo';
  const difficulty = DIFFICULTY[options.difficulty] ? options.difficulty : 'club';
  const seed = (finite(options.seed) ? options.seed : 41729) >>> 0 || 41729;
  const target = options.target === 21 ? 21 : 11;
  const s = {
    version: VERSION, time: 0, phase: 'serve', phaseTimer: 0,
    players: Array.from({ length: 4 }, (_, id) => ({ id, team: id < 2 ? 0 : 1,
      x: 0, y: 0, vx: 0, vy: 0, z: 0, facing: id < 2 ? 0 : Math.PI,
      action: 'idle', actionTimer: 0, diveCooldown: 0, ready: '',
      _cooldown: 0, _intent: '', _intentTime: 0, _aimX: 0, _aimY: 0,
      _diveX: 0, _diveY: 0, _missedFlight: -1, _seenFlight: -1, _reactionLeft: 0, _blockPlan: false })),
    ball: { x: 0, y: 0, z: 1.1, vx: 0, vy: 0, vz: 0 },
    controls: options.aiOnly ? [-1, -1] : mode === 'coop' ? [0, 1] : mode === 'versus' ? [0, 2] : [0, -1],
    score: [0, 0], sets: [0, 0], setNumber: 1, target,
    servingTeam: 0, serverId: 0, touches: 0, possession: 0,
    message: 'Serve when ready', winner: null,
    lastEvent: { id: 0, type: 'ready', team: 0, playerId: 0, x: 0, y: 0 },
    options: { mode, difficulty, target, assist: options.assist !== false, seed, aiOnly: options.aiOnly === true },
    stats: { rallies: 0, rallyHits: 0, longestRally: 0, lastPointHits: 0,
      aces: [0, 0], spikes: [0, 0], digs: [0, 0], blocks: [0, 0] },
    _rng: seed, _flight: 0, _receiver: null, _lastHitPlayer: null, _lastHitTeam: null,
    _contactCooldown: 0, _serveAge: 0, _serverTurns: [0, 0],
    _switchLock: [0, 0], _previousInputs: [cleanInput(), cleanInput()],
    _serveInputArmed: false, _shotType: 'serve',
  };
  setupServe(s);
  return s;
}

function setupServe(s) {
  s.phase = 'serve'; s.phaseTimer = 0; s._serveAge = 0; s._serveInputArmed = false;
  s.target = s.setNumber === 3 ? 11 : s.options.target;
  s.touches = 0; s.possession = s.servingTeam; s._lastHitPlayer = null;
  s._lastHitTeam = null; s._receiver = null; s._contactCooldown = 0;
  s.stats.rallyHits = 0;
  for (const p of s.players) {
    p.x = signFor(p.team) * 4.6;
    p.y = p.id % 2 === 0 ? -1.65 : 1.65;
    p.vx = 0; p.vy = 0; p.z = 0; p.action = 'idle'; p.actionTimer = 0;
    p.diveCooldown = 0; p._cooldown = 0; p._intent = ''; p._intentTime = 0; p.ready = '';
  }
  s.serverId = s.servingTeam * 2 + (s._serverTurns[s.servingTeam] % 2);
  const server = s.players[s.serverId];
  server.x = signFor(s.servingTeam) * 7.65;
  server.y = server.id % 2 ? 1.9 : -1.9;
  const partner = s.players[otherPlayer(server)];
  partner.x = signFor(s.servingTeam) * 3.2;
  partner.y = -server.y * 0.7;
  s.ball = { x: server.x - signFor(server.team) * 0.35, y: server.y,
    z: 1.15, vx: 0, vy: 0, vz: 0 };
  if (!s.options.aiOnly && s.options.mode !== 'coop') {
    if (s.servingTeam === 0) s.controls[0] = s.serverId;
    if (s.servingTeam === 1 && s.options.mode === 'versus') s.controls[1] = s.serverId;
  }
  s.message = `${TEAM_NAMES[s.servingTeam]} to serve`;
  event(s, 'ready', s.servingTeam, s.serverId);
}

function humanController(s, playerId) { return s.controls.indexOf(playerId); }
function isHuman(s, p) { return humanController(s, p.id) >= 0; }
function outbound(s, team) {
  return s._lastHitTeam === team && ['serve', 'spike', 'block'].includes(s._shotType)
    && s.ball.vx * signFor(team) < 0;
}
function aiProfile(s, team) {
  // A solo player's partner remains dependable at every opponent difficulty.
  return team === 0 && !s.options.aiOnly ? DIFFICULTY.club : DIFFICULTY[s.options.difficulty];
}
function receiverFor(s, team) {
  if (outbound(s, team)) return null;
  if (s._receiver !== null && s.players[s._receiver]?.team === team) return s.players[s._receiver];
  const landing = predictLanding(s.ball);
  let best = null, cost = Infinity;
  for (const p of s.players) if (p.team === team && !(s._lastHitTeam === team && p.id === s._lastHitPlayer)) {
    const d = hypot(p.x - landing.x, p.y - landing.y);
    if (d < cost) { best = p; cost = d; }
  }
  return best || s.players[team * 2];
}
function autoSwitch(s) {
  if (s.options.aiOnly || s.options.mode === 'coop' || s.phase !== 'rally') return;
  const receiver = receiverFor(s, s.possession);
  for (let i = 0; i < 2; i++) {
    const p = controllerPlayer(s, i);
    if (p?.team === s.possession && s._switchLock[i] <= 0 && receiver && p.id !== receiver.id) {
      s.controls[i] = receiver.id;
    }
  }
}

function directionToward(p, x, y, speed) {
  const dx = x - p.x, dy = y - p.y, distance = hypot(dx, dy);
  if (distance < 0.055) return [0, 0];
  const actual = Math.min(speed, distance * 9);
  return [dx / distance * actual, dy / distance * actual];
}
function placePlayer(p, dt) {
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.x = p.team === 0 ? clamp(p.x, -9.2, -0.42) : clamp(p.x, 0.42, 9.2);
  p.y = clamp(p.y, -5.1, 5.1);
  if (hypot(p.vx, p.vy) > 0.15) p.facing = Math.atan2(p.vy, p.vx);
}
function beginDive(s, p, input, landing) {
  if (p.diveCooldown > 0 || p.action === 'dive' || p.action === 'block') return;
  if (Math.abs(p.x) < 1.25 && s.ball.z > 1.65 && Math.abs(s.ball.x) < 2.3) {
    p.action = 'block'; p.actionTimer = 0.5; p.diveCooldown = 0.9;
    p._intent = 'block'; p._intentTime = 0.5;
    return;
  }
  let dx = input.mx, dy = input.my;
  if (hypot(dx, dy) < 0.15) { dx = landing.x - p.x; dy = landing.y - p.y; }
  const length = hypot(dx, dy) || 1;
  p._diveX = dx / length; p._diveY = dy / length;
  p.action = 'dive'; p.actionTimer = 0.58; p.diveCooldown = 1.2;
  p._intent = 'pass'; p._intentTime = 0.62;
  event(s, 'dive', p.team, p.id);
}
function updatePlayers(s, dt, inputs) {
  const landing = predictLanding(s.ball), receiver = receiverFor(s, s.possession);
  for (const p of s.players) {
    p._cooldown = Math.max(0, p._cooldown - dt);
    p.diveCooldown = Math.max(0, p.diveCooldown - dt);
    p.actionTimer = Math.max(0, p.actionTimer - dt);
    p._intentTime = Math.max(0, p._intentTime - dt);
    if (p._intentTime === 0) p._intent = '';
    if (p.actionTimer === 0) p.action = 'idle';
    p.z = p.action === 'block' ? Math.sin(clamp(p.actionTimer / 0.5, 0, 1) * Math.PI) * 0.72
      : p.action === 'spike' ? Math.sin(clamp(p.actionTimer / 0.38, 0, 1) * Math.PI) * 0.58 : 0;
    const controller = humanController(s, p.id), human = controller >= 0;
    if (human) {
      const input = inputs[controller];
      p.vx = input.mx * 4.75; p.vy = input.my * 4.75;
      if (hypot(input.mx, input.my) > 0.13) { p._aimX = input.mx; p._aimY = input.my; }
      if (input.spike || input.pass) {
        p._intent = input.spike ? 'spike' : 'pass'; p._intentTime = 0.38;
      }
      if (input.dive && !s._previousInputs[controller].dive && s.phase === 'rally') beginDive(s, p, input, landing);
    } else {
      const profile = aiProfile(s, p.team);
      if (p._seenFlight !== s._flight) {
        p._seenFlight = s._flight;
        p._reactionLeft = s._lastHitTeam === p.team ? 0.055 : profile.reaction;
        if (s._shotType === 'set' && s._lastHitTeam !== p.team && p.id % 2 === 0) {
          p._blockPlan = random(s) < (s.options.difficulty === 'pro' ? 0.33 : s.options.difficulty === 'club' ? 0.22 : 0);
        } else if (s._shotType !== 'spike') p._blockPlan = false;
      }
      p._reactionLeft = Math.max(0, p._reactionLeft - dt);
      let tx = signFor(p.team) * 4.3, ty = p.id % 2 ? 1.8 : -1.8;
      if (s.phase === 'rally') {
        if (p.team === s.possession && p.id === receiver?.id) {
          // Meet the descending ball at hand height rather than chasing its shadow late.
          const contactZ = s.touches >= 2 ? 2.65 : s.touches === 1 ? 1.9 : 1.35;
          const discriminant = s.ball.vz * s.ball.vz + 2 * G * (s.ball.z - contactZ);
          const contactT = discriminant >= 0 ? Math.max(0, (s.ball.vz + Math.sqrt(discriminant)) / G) : landing.time;
          tx = s.ball.x + s.ball.vx * contactT; ty = s.ball.y + s.ball.vy * contactT;
          tx = p.team === 0 ? clamp(tx, -8.7, -0.62) : clamp(tx, 0.62, 8.7);
          ty = clamp(ty, -4.6, 4.6);
          if (p._reactionLeft > 0) { tx = p.x; ty = p.y; }
          p._intent = s.touches >= 2 ? 'spike' : 'pass'; p._intentTime = 0.1;
          const distance = hypot(tx - p.x, ty - p.y);
          if (landing.time < 0.35 && distance > 0.85 && distance < 2.5 && Math.abs(p.x) > 1.2 && s.ball.z < 1.3) {
            beginDive(s, p, { mx: tx - p.x, my: ty - p.y }, landing);
          }
        } else if (p.team === s.possession && !outbound(s, p.team)) {
          tx = signFor(p.team) * (s.touches === 0 ? 2.9 : 1.65);
          ty = p.id % 2 ? 1.55 : -1.55;
        } else {
          // One defender protects the net while the other covers the back court.
          const preparingBlock = s.touches >= 2 && p._blockPlan;
          tx = signFor(p.team) * (p.id % 2 ? 5.2 : preparingBlock ? 1.05 : 3.0);
          ty = preparingBlock ? clamp(s.ball.y, -2.8, 2.8) : p.id % 2 ? 1.8 : -1.8;
        }
        if (p._blockPlan && s._shotType === 'spike' && s._lastHitTeam !== p.team && Math.abs(p.x) < 1.3
          && s.ball.z > 2.1 && s.ball.z < 3.5 && hypot(p.x - s.ball.x, p.y - s.ball.y) < 1.5) {
          beginDive(s, p, { mx: 0, my: 0 }, landing);
        }
      }
      [p.vx, p.vy] = directionToward(p, tx, ty, profile.speed);
      if (s.phase === 'serve') { p.vx = 0; p.vy = 0; }
    }
    if (p.action === 'dive' && p.actionTimer > 0.26) {
      p.vx = p._diveX * 7.3; p.vy = p._diveY * 7.3;
    } else if (p.action === 'block') { p.vx *= 0.25; p.vy *= 0.25; }
    p.ready = p._intent;
    // Server stays behind the baseline until the ball is put in play.
    if (s.phase === 'serve' && p.id === s.serverId) {
      p.vx = 0; p.vy *= 0.65; p.y = clamp(p.y + p.vy * dt, -3.35, 3.35);
    } else placePlayer(p, dt);
  }
  // Gentle separation: teammates cannot occupy exactly the same patch of sand.
  for (let team = 0; team < 2; team++) {
    const a = s.players[team * 2], b = s.players[team * 2 + 1];
    const dx = b.x - a.x, dy = b.y - a.y, distance = hypot(dx, dy);
    if (distance > 0.001 && distance < 0.6) {
      const correction = (0.6 - distance) * 0.5;
      a.x -= dx / distance * correction; a.y -= dy / distance * correction;
      b.x += dx / distance * correction; b.y += dy / distance * correction;
      placePlayer(a, 0); placePlayer(b, 0);
    }
  }
}

function attackTarget(s, p, intent, input) {
  const enemy = other(p.team), side = signFor(enemy), defenders = s.players.filter(q => q.team === enemy);
  const candidates = [
    { x: side * 7.25, y: -3.5 }, { x: side * 7.25, y: 3.5 },
    { x: side * 1.15, y: -3.5 }, { x: side * 1.15, y: 3.5 },
    { x: side * 5.7, y: 0 },
  ];
  let chosen = candidates[0], room = -Infinity;
  for (const target of candidates) {
    const space = Math.min(...defenders.map(q => hypot(q.x - target.x, q.y - target.y))) + between(s, -0.3, 0.3);
    if (space > room) { room = space; chosen = target; }
  }
  let x = chosen.x, y = chosen.y;
  if (isHuman(s, p)) {
    const ax = input?.mx || 0, ay = input?.my || 0;
    if (Math.abs(ay) > 0.2) y = ay * 3.5;
    if (Math.abs(ax) > 0.2) x = side * (ax * side > 0 ? 7.25 : 1.15);
    // Releasing the stick restores a useful open-court target, so casual play stays readable.
    x += between(s, -0.1, 0.1); y += between(s, -0.1, 0.1);
  } else {
    const error = aiProfile(s, p.team).error;
    x += between(s, -error * 1.8, error * 1.8);
    y += between(s, -error, error);
  }
  if (intent === 'block') x = side * 2.3;
  return { x, y };
}
function launch(s, p, target, duration, options = {}) {
  const b = s.ball;
  const dx = target.x - b.x, dy = target.y - b.y;
  // Lift any cross-net shot enough to clear the tape. A low dig becomes a slower free ball.
  if (b.x * target.x < 0) {
    const fraction = -b.x / dx;
    const minHeight = COURT.netHeight + (options.spike ? 0.12 : 0.32);
    const requiredSquared = 2 * (minHeight - b.z * (1 - fraction)) / (G * fraction * (1 - fraction));
    if (requiredSquared > 0) duration = Math.max(duration, Math.sqrt(requiredSquared));
  }
  b.vx = dx / duration; b.vy = dy / duration;
  b.vz = (G * duration * duration / 2 - b.z) / duration;
  s._flight++; s._lastHitPlayer = p.id; s._lastHitTeam = p.team;
  s._contactCooldown = 0.18; p._cooldown = 0.46;
  p._intent = ''; p._intentTime = 0;
  s.stats.rallyHits++;
}
function serve(s, p, input) {
  const fast = input?.spike === true;
  const target = attackTarget(s, p, fast ? 'spike' : 'pass', input);
  target.x = signFor(other(p.team)) * between(s, 5.0, 6.5);
  s.ball.x = p.x - signFor(p.team) * 0.32; s.ball.y = p.y; s.ball.z = fast ? 1.75 : 1.25;
  launch(s, p, target, fast ? 1.55 : 1.85);
  s.phase = 'rally'; s.phaseTimer = 0; s.touches = 0; s._receiver = null;
  s._shotType = 'serve';
  p.action = fast ? 'spike' : 'pass'; p.actionTimer = 0.4;
  s.message = fast ? 'Power serve' : 'Serve';
  event(s, 'serve', p.team, p.id, { power: fast });
}

function contact(s, p, intent, input) {
  const b = s.ball, wasDiving = p.action === 'dive', block = intent === 'block';
  if (s._lastHitTeam === p.team && s._lastHitPlayer === p.id && !block) return false;
  if (s.possession !== p.team) { s.possession = p.team; s.touches = 0; }
  if (!block && s.touches >= 3) { awardPoint(s, other(p.team), 'Four touches'); return true; }
  const count = s.touches;
  if (!block) s.touches++;
  const partner = s.players[otherPlayer(p)];
  const attack = block || intent === 'spike' || count >= 2;
  if (attack) {
    const target = attackTarget(s, p, intent, input);
    const speed = isHuman(s, p) ? 0.73 : aiProfile(s, p.team).attack;
    const duration = block ? 0.83 : Math.max(speed, Math.abs(target.x - b.x) / 14.5);
    launch(s, p, target, duration, { spike: true });
    s._receiver = null;
    s._shotType = block ? 'block' : 'spike';
    if (block) {
      p.action = 'block'; p.actionTimer = 0.42; s.stats.blocks[p.team]++;
      s.message = 'Block!'; event(s, 'block', p.team, p.id);
    } else {
      p.action = 'spike'; p.actionTimer = 0.38; s.stats.spikes[p.team]++;
      s.message = b.z > 2 ? 'Spike!' : 'Over the net'; event(s, 'spike', p.team, p.id);
    }
  } else {
    const isSet = count === 1;
    let target = { x: signFor(p.team) * (isSet ? 1.55 : 2.8),
      y: clamp(partner.y * 0.55 + (partner.id % 2 ? 0.7 : -0.7), -2.6, 2.6) };
    // Give a human teammate a reachable pass instead of forcing an automatic run to the net.
    if (isHuman(s, partner) && s.options.mode === 'coop') {
      target = { x: partner.x - signFor(p.team) * (isSet ? 0.65 : 0.35), y: partner.y };
      target.x = p.team === 0 ? clamp(target.x, -6.7, -1.0) : clamp(target.x, 1.0, 6.7);
    }
    const distance = hypot(target.x - b.x, target.y - b.y);
    const duration = Math.max(isSet ? 1.55 : 1.25, distance / 4.7);
    launch(s, p, target, duration);
    s._receiver = partner.id;
    s._shotType = isSet ? 'set' : 'pass';
    p.action = isSet ? 'set' : wasDiving ? 'dive' : 'pass';
    p.actionTimer = wasDiving ? Math.max(0.2, p.actionTimer) : 0.32;
    if (wasDiving) s.stats.digs[p.team]++;
    s.message = isSet ? 'Set • attack the open court' : wasDiving ? 'Saved! Get to the set' : 'Bump • find your teammate';
    event(s, isSet ? 'set' : wasDiving ? 'dig' : 'pass', p.team, p.id);
  }
  return true;
}

function tryContacts(s, inputs) {
  if (s._contactCooldown > 0) return;
  const b = s.ball;
  // Contact only occurs on the ball's side of the net, with a tiny reach over the tape for blocks.
  const team = b.x < 0 ? 0 : 1;
  let candidates = s.players.filter(p => p.team === team)
    .sort((a, c) => hypot(a.x - b.x, a.y - b.y) - hypot(c.x - b.x, c.y - b.y));
  for (const p of candidates) {
    if (p._cooldown > 0 || p._missedFlight === s._flight) continue;
    if (s._lastHitPlayer === p.id && s._lastHitTeam === p.team) continue;
    const controller = humanController(s, p.id), human = controller >= 0;
    if (outbound(s, p.team)) continue;
    let intent = p._intent;
    const descending = b.vz < 0.3;
    const distance = hypot(p.x - b.x, p.y - b.y);
    const diving = p.action === 'dive';
    const blocking = p.action === 'block' && Math.abs(p.x) < 1.3 && b.z > 1.8 && b.z < 3.8;
    if (blocking) intent = 'block';
    let reach = human ? (s.options.assist ? 1.2 : 0.9) : aiProfile(s, p.team).reach;
    if (diving) reach += 0.55;
    // Assisted defense is a low emergency bump only; movement and attacks remain the player's choices.
    if (!intent && human && s.options.assist && b.z < 0.95 && descending && distance <= 1.05) intent = 'pass';
    if (!intent || distance > reach) continue;
    const maxHeight = intent === 'block' ? 3.8 : intent === 'spike' ? 3.25 : s.touches === 1 ? 2.3 : 1.85;
    const minHeight = diving ? 0.08 : intent === 'block' ? 1.8 : 0.12;
    if (b.z < minHeight || b.z > maxHeight || (!descending && intent !== 'block')) continue;
    const pressure = s._lastHitTeam !== p.team && (s._shotType === 'spike' || s._shotType === 'block');
    const mistakeChance = pressure ? aiProfile(s, p.team).miss : 0.004;
    if (!human && (p.team === 1 || s.options.aiOnly) && random(s) < mistakeChance) {
      p._missedFlight = s._flight; continue;
    }
    if (contact(s, p, intent, inputs[controller])) return;
  }
}

/** Scoring is exported to exercise rule outcomes independently of hand placement. */
export function awardPoint(s, team, reason = 'Ball down') {
  if (s.phase !== 'rally' || (team !== 0 && team !== 1)) return false;
  s.score[team]++; s.stats.rallies++; s.stats.lastPointHits = s.stats.rallyHits;
  s.stats.longestRally = Math.max(s.stats.longestRally, s.stats.rallyHits);
  if (s.stats.rallyHits === 1 && s._lastHitTeam === team) s.stats.aces[team]++;
  if (s.servingTeam !== team) s._serverTurns[team]++;
  s.servingTeam = team;
  s.ball.vx = 0; s.ball.vy = 0; s.ball.vz = 0; s.ball.z = Math.max(0.07, s.ball.z);
  for (const p of s.players) { p.vx = 0; p.vy = 0; }
  s.message = `${reason} • ${TEAM_NAMES[team]} point`;
  s.phase = 'point'; s.phaseTimer = 1.65;
  event(s, 'point', team, null, { reason });
  if (s.score[team] >= s.target && s.score[team] - s.score[other(team)] >= 2) {
    s.sets[team]++;
    if (s.sets[team] >= 2) {
      s.phase = 'match'; s.phaseTimer = 0; s.winner = team;
      s.message = `${TEAM_NAMES[team]} wins the match`;
      event(s, 'match', team);
    } else {
      s.phase = 'set'; s.phaseTimer = 3.0;
      s.message = `${TEAM_NAMES[team]} takes set ${s.setNumber}`;
      event(s, 'setWon', team);
    }
  }
  return true;
}

function moveBall(s, dt) {
  const b = s.ball, oldX = b.x, oldZ = b.z;
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.z += b.vz * dt - G * dt * dt / 2; b.vz -= G * dt;
  if (oldX * b.x <= 0 && oldX !== b.x && Math.abs(b.y) <= COURT.halfWidth + 0.3) {
    const fraction = clamp(-oldX / (b.x - oldX), 0, 1);
    const crossingHeight = oldZ + (b.z - oldZ) * fraction;
    if (crossingHeight < COURT.netHeight) {
      b.x = oldX < 0 ? -0.08 : 0.08;
      b.z = Math.max(0.15, crossingHeight);
      awardPoint(s, other(s._lastHitTeam ?? (oldX < 0 ? 0 : 1)), 'Into the net');
      return;
    }
    s.possession = b.x < 0 ? 0 : 1; s.touches = 0; s._receiver = null;
    s.message = 'Get under the ball';
  }
  if (b.z <= 0) {
    b.z = 0;
    const inBounds = Math.abs(b.x) <= COURT.halfLength + 0.06 && Math.abs(b.y) <= COURT.halfWidth + 0.06;
    const landedTeam = b.x < 0 ? 0 : 1;
    const winningTeam = inBounds ? other(landedTeam) : other(s._lastHitTeam ?? landedTeam);
    awardPoint(s, winningTeam, inBounds ? 'Ball down' : 'Out');
  }
}

function updateFrame(s, dt, inputs) {
  s.time += dt;
  for (let i = 0; i < 2; i++) s._switchLock[i] = Math.max(0, s._switchLock[i] - dt);
  if (s.phase === 'match') return;
  if (s.phase === 'point' || s.phase === 'set') {
    s.phaseTimer = Math.max(0, s.phaseTimer - dt);
    for (const p of s.players) { p.actionTimer = Math.max(0, p.actionTimer - dt); p.z = 0; }
    if (s.phaseTimer <= 0) {
      if (s.phase === 'set') {
        s.setNumber++; s.score = [0, 0]; s.servingTeam = (s.setNumber - 1) % 2;
      }
      setupServe(s);
    }
    return;
  }
  for (let i = 0; i < 2; i++) {
    const p = controllerPlayer(s, i);
    if (p && inputs[i].switch && !s._previousInputs[i].switch && s.options.mode !== 'coop' && s.phase === 'rally') {
      s.controls[i] = otherPlayer(p); s._switchLock[i] = 1.8;
    }
  }
  autoSwitch(s);
  updatePlayers(s, dt, inputs);
  if (s.phase === 'serve') {
    s._serveAge += dt;
    const server = s.players[s.serverId];
    s.ball.x = server.x - signFor(server.team) * 0.35; s.ball.y = server.y;
    const controller = humanController(s, server.id);
    const input = inputs[controller];
    if (controller < 0) {
      if (s._serveAge >= 0.95) serve(s, server, { spike: s.options.difficulty === 'pro' });
    } else {
      if (!input.pass && !input.spike) s._serveInputArmed = true;
      if (s._serveAge > 0.25 && (s._serveInputArmed || s._serveAge > 1.25) && (input.pass || input.spike)) serve(s, server, input);
    }
  } else if (s.phase === 'rally') {
    s._contactCooldown = Math.max(0, s._contactCooldown - dt);
    // Human and AI hands get their opportunity before floor contact is resolved.
    tryContacts(s, inputs);
    if (s.phase === 'rally') moveBall(s, dt);
  }
}

export function step(s, dt = 1 / 60, rawInputs = [{}, {}]) {
  if (!s || !finite(dt) || dt <= 0) return s;
  const inputs = [cleanInput(rawInputs?.[0]), cleanInput(rawInputs?.[1])];
  let remaining = Math.min(dt, 0.25);
  while (remaining > 0.000001) {
    const slice = Math.min(1 / 60, remaining);
    updateFrame(s, slice, inputs);
    s._previousInputs = inputs.map(i => ({ ...i }));
    remaining -= slice;
  }
  return s;
}

/** Plain values only. No mutable state is shared between authority and consumers. */
export function snapshot(s) { return JSON.parse(JSON.stringify(s)); }
