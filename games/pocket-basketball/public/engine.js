// Pocket College Hoops: deterministic, DOM-free basketball simulation.
// NCAA men's clock / bonus framework; shortened halves and assisted restarts
// are deliberate arcade choices. Ratings are original game balancing values.
export const COURT = Object.freeze({ width: 500, height: 940, W: 500, H: 940,
  hoopInset: 52.5, threeRadius: 221.4583, cornerThree: 216.5,
  laneWidth: 120, freeThrowLine: 190, playerRadius: 14 });
export const POSSESSION_SHOT_GRACE = .5;
export const OFF_BALL_SPEED_MULTIPLIER = 1.25;
export const AFTER_SCORE_HOLD_SECONDS = 1;
export const MADE_BASKET_INBOUND_SECONDS = 1.25;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (x, y) => { const n = Math.hypot(x, y) || 1; return { x: x / n, y: y / n }; };
const lerp = (a, b, t) => a + (b - a) * t;
const STAT_KEYS = ['points', 'fgm', 'fga', 'threesMade', 'threesAttempted', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'];
const freshStats = () => Object.fromEntries(STAT_KEYS.map(k => [k, 0]));
const makeRng = seed => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const defenseProfile = (seed, id) => {
  // A separate seeded stream gives each defender stable habits without
  // changing gameplay rolls or adding fresh randomness to movement frames.
  const random = makeRng((seed >>> 0) ^ Math.imul(id + 1, 0x9e3779b9));
  return { reaction: .16 + random() * .1, cadence: .055 + random() * .035,
    shade: (random() - .5) * 20, cushion: (random() - .5) * 14 };
};
const offenseProfile = (seed, id) => {
  const random = makeRng((seed >>> 0) ^ Math.imul(id + 17, 0x85ebca6b));
  return { patience: .16 + random() * .24, readOffset: random() * .15, side: random() < .5 ? -1 : 1 };
};
const segmentGap = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return { gap: Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t), t };
};
const OFFENSE_IDS = ['pickroll', 'motion', 'spacing', 'post'];
const DEFENSE_IDS = ['man', 'zone', 'press'];
const level = name => ({ rookie: .8, freshman: .8, easy: .8, varsity: 1, pro: 1, allamerican: 1.12, 'all-american': 1.12, legend: 1.12, hard: 1.12 }[name] || 1);
const copy = value => JSON.parse(JSON.stringify(value));

export function isThreePoint(x, y, hoop) {
  const dx = Math.abs(x - hoop.x), dy = Math.abs(y - hoop.y);
  return dx >= COURT.cornerThree || Math.hypot(dx, dy) >= COURT.threeRadius;
}

export function shotQuality({ range = 100, contest = 0, shooting = 75, inside = 75,
  stamina = 1, timing = .65, value = 2, type = 'jumper' } = {}) {
  const accuracy = 1 - clamp(Math.abs(timing - .65) / .65, 0, 1);
  const atRim = type === 'dunk' || type === 'alley-oop';
  let base = atRim ? .87 + (inside - 75) * .003
    : range < 75 ? .72 + (inside - 75) * .004
      : value === 3 ? .36 + (shooting - 75) * .006
        : .49 + (shooting - 75) * .004;
  if (range > 265) base -= (range - 265) * .0022;
  if (range > 460) base *= .2;
  base += (accuracy - .75) * .35;
  base -= clamp(contest, 0, 1) * (atRim ? .2 : .31);
  base -= (1 - clamp(stamina, 0, 1)) * .15;
  return clamp(base, range > 500 ? .004 : .025, .97);
}

export class Match {
  constructor({ home, away, halfSeconds = 180, difficulty = 'varsity', practice = false,
    seed = 42, human = 0 } = {}) {
    if (!home?.players?.length || !away?.players?.length) throw new Error('Two teams with rosters are required.');
    this.teams = [home, away];
    this.halfSeconds = clamp(Number(halfSeconds) || 180, 10, 1200);
    this.difficulty = difficulty; this.difficultyScale = level(difficulty);
    this.practice = !!practice; this.human = human === -1 ? -1 : human === 1 ? 1 : 0;
    this.random = makeRng(seed); this.seed = seed;
    this.score = [0, 0]; this.stats = [freshStats(), freshStats()];
    this.period = 1; this.clock = this.halfSeconds; this.shotClock = 30;
    this.phase = 'inbound'; this.phaseTime = .8; this.playTime = 0; this.elapsed = 0;
    this.possession = 0; this.possessionEpoch = 0; this.possessionChangedAt = null;
    this.shootGraceUntil = 0; this.controlled = null; this.teamFouls = [0, 0];
    this.timeouts = [3, 3]; this.offense = this.teams.map(t => OFFENSE_IDS.includes(t.offense) ? t.offense : 'motion');
    this.defense = this.teams.map(t => DEFENSE_IDS.includes(t.defense) ? t.defense : 'man');
    this.events = []; this.lastEvent = null; this.shotFeedback = null; this.freeThrows = null; this.pendingSubs = []; this.afterScore = null;
    this.winner = null; this.endPending = false; this.lastTouch = 0;
    this.backcourtTime = 0; this.frontcourt = false; this.lastPass = null;
    this.reboundWait = 0; this.screenUntil = 0; this._eventId = 0;
    this.offenseFlow = null; this.defenseHelp = [null, null];
    this.players = this.teams.flatMap((team, side) => team.players.map((p, i) => ({
      ...copy(p), id: side * 100 + i, team: side, rosterIndex: i, slot: i < 5 ? i : -1,
      active: i < 5, x: 250, y: side ? 250 : 690, vx: 0, vy: 0,
      facing: side ? 1 : -1, stamina: 1, fouls: 0, stats: freshStats(),
      actionCooldown: 0, aiTimer: .3 + this.random() * .6, holdTime: 0,
      jump: 0, screen: 0, anim: 'idle', animTime: 0,
      defenseProfile: defenseProfile(seed, side * 100 + i), defenseRead: null,
      offenseProfile: offenseProfile(seed, side * 100 + i), offenseRead: null, attackRead: null,
      ratings: { speed: 75, shooting: 75, inside: 75, passing: 75, handle: 75,
        defense: 75, rebound: 75, stamina: 75, freeThrow: 75, awareness: 75, anticipation: 75, ...p.ratings },
    })));
    this.ball = { x: 250, y: 620, z: 0, vx: 0, vy: 0, vz: 0, owner: null, flight: null };
    this.inbound = null;
    this._prepareInbound(0, { x: 250, y: 620 }, .8, 30, true);
    this._emit('tip', `${home.short} ball. Make the first possession count.`, { team: 0 });
  }

  attackDir(team) { return ((this.period === 1 ? 1 : -1) * (team === 0 ? -1 : 1)); }
  hoop(team) { return { x: 250, y: this.attackDir(team) < 0 ? 52.5 : 887.5 }; }
  ownHoop(team) { return this.hoop(1 - team); }
  active(team) { return this.players.filter(p => p.active && (team === undefined || p.team === team)); }
  player(id) { return this.players.find(p => p.id === id) || null; }
  controlledPlayer() { return this.player(this.controlled); }
  carrier() { return this.player(this.ball.owner); }
  inOffense() { return this.human >= 0 && this.possession === this.human; }
  receivers() { return this.active(this.human < 0 ? this.possession : this.human).filter(p => p.id !== this.ball.owner).sort((a, b) => a.slot - b.slot); }
  nearestDefender(team = this.human) {
    if (team !== 0 && team !== 1) return null;
    return this.active(team).sort((a, b) => {
      const gap = distance(a, this.ball) - distance(b, this.ball);
      if (Math.abs(gap) > 1e-8) return gap;
      // Repeated presses and exact ties must not toggle away from the best player.
      if (a.id === this.controlled) return -1;
      if (b.id === this.controlled) return 1;
      return a.id - b.id;
    })[0] || null;
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
  _emit(type, text, fields = {}) {
    const event = { id: ++this._eventId, type, text, time: this.elapsed, ...fields };
    this.events.push(event); if (this.events.length > 80) this.events.shift(); this.lastEvent = event;
    return event;
  }
  _stat(team, player, key, amount = 1) { this.stats[team][key] += amount; if (player) player.stats[key] += amount; }
  _controlledForPossession() {
    if (this.human < 0) { this.controlled = null; return; }
    const c = this.carrier();
    if (c?.team === this.human) this.controlled = c.id;
    else {
      this.controlled = this.nearestDefender()?.id ?? null;
    }
  }
  setPlay(id) { if (OFFENSE_IDS.includes(id)) { this.offense[this.human < 0 ? this.possession : this.human] = id; this.playTime = 0; this._resetOffenseFlow(); return true; } return false; }
  setDefense(id) {
    if (!DEFENSE_IDS.includes(id)) return false;
    const team = this.human < 0 ? 1 - this.possession : this.human;
    if (this.defense[team] !== id) { this.defense[team] = id; this._resetDefenseTracking(team); }
    return true;
  }
  shotInfo(p = this.carrier()) {
    if (!p) return { range: 0, contest: 0, quality: 0, value: 2, type: 'jumper' };
    const hoop = this.hoop(p.team), range = distance(p, hoop);
    let contest = 0;
    for (const d of this.active(1 - p.team)) {
      const gap = distance(p, d), toward = Math.abs(distance(d, hoop) - range) < 65;
      if (gap < 66) contest = Math.max(contest, clamp((66 - gap) / 55, 0, 1) * (toward ? 1 : .65) * (.7 + d.ratings.defense / 280));
      if (d.jump > 0 && gap < 88) contest = Math.max(contest, .86);
    }
    const type = range < 46 && p.ratings.inside >= 77 && (p.height || 76) >= 76 ? 'dunk' : range < 85 ? 'layup' : 'jumper';
    const value = isThreePoint(p.x, p.y, hoop) ? 3 : 2;
    const quality = shotQuality({ range, contest, value, type, ...p.ratings, stamina: p.stamina });
    return { range, contest: clamp(contest, 0, 1), quality, value, type };
  }

  // Preview is pure: it shares the release planner but never consumes RNG or
  // changes a receiver's assignment. Both styles travel to this fixed point.
  throughPassInfo(p = this.carrier(), aim) {
    const holder = this.carrier();
    if (this.phase !== 'live' || !holder || !p || p.id !== holder.id || !holder.active
      || this.ball.flight || holder.actionCooldown > 0) return null;
    p = holder;
    const ax = Number.isFinite(aim?.x) ? aim.x : 0, ay = Number.isFinite(aim?.y) ? aim.y : 0;
    const magnitude = Math.hypot(ax, ay), direction = magnitude >= .2 ? norm(ax, ay) : null;
    const hoop = this.hoop(p.team), towardHoop = norm(hoop.x - p.x, hoop.y - p.y);
    const teammates = this.active(p.team).filter(t => t.id !== p.id);
    if (!teammates.length) return null;
    const lobIntent = magnitude >= .35 && direction.x * towardHoop.x + direction.y * towardHoop.y >= .7;
    if (lobIntent && this._isFrontcourt(p, p.team) && distance(p, hoop) <= 280) {
      const lobs = teammates.filter(t => distance(t, hoop) <= 90).map(t => {
        const predicted = { x: t.x + t.vx * .2, y: t.y + t.vy * .2 };
        let radial = norm(predicted.x - hoop.x, predicted.y - hoop.y);
        if (!radial.x && !radial.y) radial = { x: 0, y: -this.attackDir(p.team) };
        const radius = clamp(distance(predicted, hoop), 30, 52);
        const end = { x: clamp(hoop.x + radial.x * radius, 22, 478), y: clamp(hoop.y + radial.y * radius, 25, 915) };
        const range = distance(p, end), duration = clamp(.55 + range / 550, .62, 1.1);
        const footSpeed = (92 + (t.ratings.speed - 50) * 1.14) * OFF_BALL_SPEED_MULTIPLIER * (.81 + t.stamina * .19);
        return { type: 'lob', targetId: t.id, end, duration, range, arc: 105 + range * .12,
          catchHeight: 42, catchRadius: 30, finishRange: 80,
          reachable: distance(t, end) <= footSpeed * duration * .72 + 18,
          grade: t.ratings.inside * .5 + this._nearestDefenderDistance(t) * .3 - distance(t, hoop) * .3 };
      }).filter(plan => plan.reachable && plan.range >= 40).sort((a, b) => b.grade - a.grade);
      if (lobs.length) {
        const { grade, reachable, ...plan } = lobs[0];
        return plan;
      }
    }
    const plans = teammates.map(t => {
      const initialDuration = clamp(distance(p, t) / 440 + .1, .28, 1.05);
      const speed = Math.hypot(t.vx, t.vy), leadDirection = speed > 15 ? norm(t.vx, t.vy) : norm(hoop.x - t.x, hoop.y - t.y);
      const leadDistance = speed > 15 ? clamp(speed * (initialDuration * .8 + .16), 24, 88) : 28;
      const end = { x: clamp(t.x + leadDirection.x * leadDistance, 22, 478), y: clamp(t.y + leadDirection.y * leadDistance, 22, 918) };
      const range = distance(p, end), duration = clamp(range / 440 + .1, .28, 1.1);
      const lane = norm(end.x - p.x, end.y - p.y);
      const grade = (direction ? (lane.x * direction.x + lane.y * direction.y) * 170 : (distance(p, hoop) - distance(end, hoop)) * .3)
        + Math.min(110, this._nearestDefenderDistance({ ...end, team: p.team })) * .55 - range * .08 - (range < 60 ? 30 : 0);
      return { type: 'bounce', targetId: t.id, end, duration, range, bounceAt: .6, catchHeight: 14, catchRadius: 36,
        lead: { x: end.x - t.x, y: end.y - t.y }, grade };
    }).sort((a, b) => b.grade - a.grade);
    const { grade, ...plan } = plans[0];
    return plan;
  }

  action(name, payload = {}) {
    // Input captures this token on press. A release from an earlier possession
    // cannot become a shot, pass, or swipe in the new possession.
    if (['shoot', 'steal', 'pass', 'through'].includes(name) && payload.possessionEpoch !== undefined
      && payload.possessionEpoch !== this.possessionEpoch) return false;
    if (name === 'continue') {
      if (this.phase === 'halftime') {
        this.period = 2; this.clock = this.halfSeconds; this.teamFouls = [0, 0];
        this.endPending = false; this.players.forEach(p => p.stamina = Math.min(1, p.stamina + .28));
        this._prepareInbound(1, this._backcourtSpot(1), 1, 30, true);
        this._emit('half', 'Second half. Switch ends.', { team: 1 }); return true;
      }
      return false;
    }
    if (this.phase === 'finished') return false;
    if (name === 'play') return this.setPlay(payload.id);
    if (name === 'defense') return this.setDefense(payload.id);
    if (name === 'substitute') {
      const out = this.player(payload.outId), incoming = this.player(payload.inId);
      if (!out || !incoming || !out.active || incoming.active || out.team !== incoming.team || incoming.fouls >= 5) return false;
      if (this.phase === 'live') {
        this.pendingSubs = this.pendingSubs.filter(s => s.outId !== out.id && s.inId !== incoming.id);
        this.pendingSubs.push({ outId: out.id, inId: incoming.id }); return true;
      }
      return this._substitute(out.id, incoming.id);
    }
    if (name === 'switch') {
      const list = this.active(this.human);
      const chosen = list.find(p => p.id === payload.id) || this.nearestDefender();
      if (chosen) this.controlled = chosen.id; return !!chosen;
    }
    if (name === 'timeout') {
      const team = this.human < 0 ? this.possession : this.human;
      if (this.timeouts[team] <= 0 || this.phase !== 'live' || this.possession !== team || !this.carrier()) return false;
      this.timeouts[team]--; this.active(team).forEach(p => p.stamina = clamp(p.stamina + .18, 0, 1));
      this._prepareInbound(team, { x: this.ball.x, y: this.ball.y }, 1.8, this.shotClock, false);
      this._emit('timeout', `${this.teams[team].short} timeout. Catch your breath.`, { team }); return true;
    }
    if (name === 'shoot' && this.phase === 'freeThrow') {
      if (this.freeThrows?.team !== this.human || this.ball.flight) return false;
      return this._shootFreeThrow(payload.timing ?? .65);
    }
    if (this.phase !== 'live') return false;
    const p = this.controlledPlayer(); if (!p || !p.active) return false;
    if (name === 'shoot' && this.ball.owner === p.id) {
      if (p.team === this.human && this.elapsed < this.shootGraceUntil) return false;
      return this._shoot(p, payload.timing ?? .65);
    }
    if (name === 'pass' && this.ball.owner === p.id) return this._pass(p, payload.targetId, payload.aim);
    if (name === 'through' && this.ball.owner === p.id) return this._throughPass(p, payload.aim);
    if (name === 'steal') return this._steal(p);
    if (name === 'block') return this._block(p);
    if (name === 'screen' && p.team === this.possession) {
      this.screenUntil = this.elapsed + 3; this.playTime = 0; this._resetOffenseFlow();
      this._emit('screen', 'Screen coming. Turn the corner or find the roller.', { team: p.team }); return true;
    }
    return false;
  }

  _backcourtSpot(team) { return { x: 250, y: this.attackDir(team) < 0 ? 894 : 46 }; }
  _setPossession(team) {
    if (this.possession === team) return false;
    this.possession = team; this.possessionEpoch++; this.possessionChangedAt = this.elapsed;
    this.shootGraceUntil = team === this.human ? this.elapsed + POSSESSION_SHOT_GRACE : 0;
    this._resetDefenseTracking(); this._resetOffenseFlow();
    return true;
  }
  _prepareInbound(team, spot, delay = .75, shotClock = 30, resetShape = false) {
    this._flushSubs();
    this._resetDefenseTracking(); this._resetOffenseFlow();
    this.afterScore = null;
    this.phase = 'inbound'; this.phaseTime = delay; this._setPossession(team); this.shotClock = shotClock;
    this.ball.flight = null; this.ball.owner = null; this.ball.z = 0; this.ball.vx = this.ball.vy = this.ball.vz = 0;
    this.ball.passTurnover = null;
    this.ball.x = clamp(spot.x, 20, 480); this.ball.y = clamp(spot.y, 25, 915);
    this.inbound = { team, spot: { x: this.ball.x, y: this.ball.y } };
    this.freeThrows = null; this.playTime = 0; this.backcourtTime = 0; this.frontcourt = false; this.lastPass = null;
    this.lastTouch = team;
    if (resetShape) {
      const dir = this.attackDir(team), baseY = this.ball.y;
      for (const p of this.active()) {
        const slot = Math.max(0, p.slot), own = p.team === team;
        const offsets = [[0, 0], [-165, 100], [165, 120], [-90, 225], [90, 255]];
        const o = offsets[slot % 5];
        p.x = clamp(250 + o[0] + (own ? 0 : 20), 20, 480);
        p.y = clamp(baseY + dir * (o[1] + (own ? 0 : 145)), 30, 910);
        p.vx = p.vy = 0; p.holdTime = 0;
      }
    }
    this._controlledForPossession();
  }
  _beginAfterScore({ team, value, shooter, type }) {
    const nextTeam = 1 - team, hoop = this.hoop(team);
    this.phase = 'afterScore'; this.phaseTime = AFTER_SCORE_HOLD_SECONDS;
    this.afterScore = { scoringTeam: team, points: value, scorerId: shooter, nextTeam, shotType: type,
      hoop: { ...hoop }, holdSeconds: AFTER_SCORE_HOLD_SECONDS, inboundSeconds: MADE_BASKET_INBOUND_SECONDS };
    this.inbound = null; this.freeThrows = null;
    this.ball.owner = null; this.ball.flight = null; this.ball.x = hoop.x; this.ball.y = hoop.y; this.ball.z = 0;
    this.ball.vx = this.ball.vy = this.ball.vz = 0;
    this._setPossession(nextTeam); this.shotClock = 30;
    this.active().forEach(p => { p.vx = 0; p.vy = 0; });
    this._controlledForPossession();
  }
  _releaseInbound() {
    const t = this.inbound.team, candidates = this.active(t).sort((a, b) => a.slot - b.slot);
    const p = candidates[0]; if (!p) { this.winner = 1 - t; this.phase = 'finished'; return; }
    p.x = this.inbound.spot.x; p.y = this.inbound.spot.y; p.vx = p.vy = 0; p.actionCooldown = 0;
    this.phase = 'live'; this.phaseTime = 0; this.inbound = null;
    this._giveBall(p, false); this.frontcourt = this._isFrontcourt(p, t);
  }
  _isFrontcourt(p, team) { return this.attackDir(team) < 0 ? p.y < 462 : p.y > 478; }
  _giveBall(p, change = true) {
    const oldTeam = this.possession;
    this.ball.owner = p.id; this.ball.flight = null; this.ball.z = 0;
    this.ball.passTurnover = null;
    this.ball.vx = this.ball.vy = this.ball.vz = 0; this.ball.x = p.x; this.ball.y = p.y;
    const changedTeam = this._setPossession(p.team);
    if (changedTeam) p.actionCooldown = 0;
    this.lastTouch = p.team; p.holdTime = 0; p.attackRead = null;
    p.aiTimer = .25 + this.random() * .35;
    if (change && oldTeam !== p.team) {
      this.shotClock = 30; this.backcourtTime = 0; this.frontcourt = this._isFrontcourt(p, p.team);
      this.playTime = 0; this.lastPass = null;
    }
    this._controlledForPossession();
  }
  _turnover(team, text, spot = this.ball) {
    const old = this.carrier(); this._stat(team, old?.team === team ? old : null, 'turnovers');
    this._emit('turnover', text, { team: 1 - team });
    this._prepareInbound(1 - team, { x: clamp(spot.x, 30, 470), y: clamp(spot.y, 35, 905) }, .85,
      this._isFrontcourt(spot, 1 - team) ? 20 : 30, false);
  }

  _pass(p, targetId, aim) {
    if (this.ball.owner !== p.id || p.actionCooldown > 0) return false;
    const eligible = this.active(p.team).filter(t => t.id !== p.id);
    let target = eligible.find(t => t.id === targetId);
    if (!target) {
      const dir = aim && Math.hypot(aim.x || 0, aim.y || 0) > .15 ? norm(aim.x, aim.y) : null;
      const hoop = this.hoop(p.team);
      target = eligible.sort((a, b) => {
        const grade = t => {
          const v = norm(t.x - p.x, t.y - p.y), openness = this._nearestDefenderDistance(t);
          return (dir ? (v.x * dir.x + v.y * dir.y) * 170 : (distance(p, hoop) - distance(t, hoop)) * .25)
            + Math.min(openness, 100) * .7 - distance(p, t) * .08;
        };
        return grade(b) - grade(a);
      })[0];
    }
    if (!target) return false;
    const duration = clamp(distance(p, target) / 520, .18, .8);
    const pressure = this.shotInfo(p).contest;
    const error = (100 - p.ratings.passing) * .22 + pressure * 14;
    const end = { x: target.x + clamp(target.vx * duration * .7, -28, 28) + (this.random() - .5) * error,
      y: target.y + clamp(target.vy * duration * .7, -28, 28) + (this.random() - .5) * error };
    this.ball.owner = null; this.ball.x = p.x; this.ball.y = p.y; this.ball.z = 15;
    this.ball.flight = { kind: 'pass', from: p.id, target: target.id, team: p.team,
      start: { x: p.x, y: p.y }, end, time: 0, duration, interceptedBy: [] };
    p.actionCooldown = .3; p.anim = 'pass'; p.animTime = .35;
    this.lastPass = { from: p.id, to: target.id, team: p.team, time: this.elapsed };
    this._emit('pass', `${p.name.split(' ').at(-1)} finds ${target.name.split(' ').at(-1)}.`, { team: p.team, playerId: p.id });
    return true;
  }
  _throughPass(p, aim) {
    const plan = this.throughPassInfo(p, aim);
    if (!plan) return false;
    const target = this.player(plan.targetId);
    this.ball.owner = null; this.ball.x = p.x; this.ball.y = p.y; this.ball.z = 18;
    this.ball.flight = { ...plan, kind: 'pass', style: plan.type, from: p.id, target: target.id, team: p.team,
      start: { x: p.x, y: p.y }, startZ: 18, endZ: plan.catchHeight, time: 0,
      passing: p.ratings.passing, interceptedBy: [], bounced: false };
    p.actionCooldown = .35; p.anim = 'pass'; p.animTime = .4;
    this.lastPass = { from: p.id, to: target.id, team: p.team, time: this.elapsed };
    this._emit('pass', plan.type === 'lob' ? `Up for ${target.name.split(' ').at(-1)}!` : `Lead bounce pass for ${target.name.split(' ').at(-1)}.`,
      { team: p.team, playerId: p.id, targetId: target.id, style: plan.type });
    return true;
  }
  _nearestDefenderDistance(p) { return Math.min(250, ...this.active(1 - p.team).map(d => distance(d, p))); }
  _shoot(p, timing = .65, options = {}) {
    if (this.ball.owner !== p.id || p.actionCooldown > 0) return false;
    const info = this.shotInfo(p), hoop = this.hoop(p.team);
    if (options.type === 'alley-oop') { info.type = 'alley-oop'; info.value = 2; }
    const t = clamp(Number(timing) || 0, 0, 1);
    const quality = shotQuality({ ...info, ...p.ratings, stamina: p.stamina, timing: t }) * (info.type === 'alley-oop' ? .92 : 1);
    const made = this.random() < quality;
    const defender = this.active(1 - p.team).sort((a, b) => distance(a, p) - distance(b, p))[0];
    const foul = defender && distance(defender, p) < 42 && this.random() < .055 + Math.max(0, 75 - defender.ratings.defense) * .0015;
    this._stat(p.team, p, 'fga'); if (info.value === 3) this._stat(p.team, p, 'threesAttempted');
    if (foul && !made) { this.stats[p.team].fga--; p.stats.fga--; if (info.value === 3) { this.stats[p.team].threesAttempted--; p.stats.threesAttempted--; } }
    const alley = info.type === 'alley-oop', startZ = alley ? Math.max(35, this.ball.z) : 22;
    this.ball.owner = null; this.ball.x = p.x; this.ball.y = p.y; this.ball.z = startZ;
    const duration = alley ? .4 : clamp(.4 + info.range / 430, .5, 1.65);
    const missAngle = this.random() * Math.PI * 2, missAmount = 13 + this.random() * 24;
    this.ball.flight = { kind: 'shot', team: p.team, shooter: p.id, start: { x: p.x, y: p.y }, end: hoop,
      time: 0, duration, startZ, endZ: 0, arc: alley ? 32 : info.type === 'dunk' ? 40 : 58 + info.range * .17,
      made, value: info.value, type: info.type, quality, timing: t, contest: info.contest,
      rim: info.range < 430 || this.random() < .6,
      miss: { x: Math.cos(missAngle) * missAmount, y: Math.sin(missAngle) * missAmount },
      foul: foul ? defender.id : null, blocked: false };
    p.actionCooldown = .8; p.anim = info.type; p.animTime = .65; p.jump = .45;
    this.shotFeedback = { text: alley ? 'ALLEY-OOP' : Math.abs(t - .65) < .09 ? 'GREAT RELEASE' : t < .48 ? 'EARLY' : t > .82 ? 'LATE' : 'GOOD RELEASE',
      team: p.team, playerId: p.id, timing: t, quality, contest: info.contest, value: info.value, type: info.type, expires: this.elapsed + 2 };
    this._emit('shot', `${p.name.split(' ').at(-1)} ${alley ? 'goes up for the alley-oop!' : info.type === 'dunk' ? 'goes up strong!' : info.value === 3 ? 'for three…' : 'puts it up…'}`,
      { team: p.team, playerId: p.id, shotType: info.type });
    return true;
  }
  _steal(p) {
    const c = this.carrier();
    if (!c || c.team === p.team || p.actionCooldown > 0 || distance(p, c) > 49) return false;
    p.actionCooldown = 1.05; p.anim = 'steal'; p.animTime = .35;
    const gap = distance(p, c), odds = clamp(.31 + (p.ratings.defense - c.ratings.handle) * .006 - Math.max(0, gap - 24) * .005, .06, .58);
    const roll = this.random();
    if (roll < odds) {
      this._stat(p.team, p, 'steals'); this._stat(c.team, c, 'turnovers');
      this._giveBall(p); this._emit('steal', `${p.name.split(' ').at(-1)} picks the pocket!`, { team: p.team, playerId: p.id }); return true;
    }
    if (roll > .86) this._foul(p, c, { shooting: false });
    return true;
  }
  _block(p) {
    if (p.team === this.possession || p.actionCooldown > 0) return false;
    p.jump = .6; p.actionCooldown = .95; p.anim = 'block'; p.animTime = .6;
    const f = this.ball.flight;
    if (f?.kind === 'shot' && f.team !== p.team && !f.blocked && f.time / f.duration < .6
      && distance(p, this.ball) < 66 && this.ball.z < 120) {
      const chance = clamp(.3 + (p.ratings.defense - 70) * .009 + ((p.height || 76) - 76) * .012, .12, .7);
      if (this.random() < chance) {
        f.blocked = true; this._stat(p.team, p, 'blocks');
        this._emit('block', `${p.name.split(' ').at(-1)} sends it back!`, { team: p.team, playerId: p.id });
        this._looseBall(this.ball.x, this.ball.y, (this.random() - .5) * 180, -this.attackDir(f.team) * 115, 110, false, f.team);
        this.lastTouch = p.team;
        if (this.endPending) this._endPeriod();
      }
    }
    return true;
  }

  _foul(defender, victim, { shooting = false, shots = 2, scored = false } = {}) {
    if (!defender || !victim) return;
    defender.fouls++; this.teamFouls[defender.team]++;
    this._emit('foul', `${defender.name.split(' ').at(-1)}: ${shooting ? 'shooting foul' : 'reach-in foul'}${defender.fouls >= 5 ? ' — fouled out' : ''}.`, { team: victim.team, playerId: defender.id });
    if (defender.fouls >= 5) {
      const reserve = this.players.filter(p => p.team === defender.team && !p.active && p.fouls < 5).sort((a, b) => b.stamina - a.stamina)[0];
      if (reserve) this._substitute(defender.id, reserve.id, true);
      else { defender.active = false; if (this.controlled === defender.id) this._controlledForPossession(); }
    }
    const total = this.teamFouls[defender.team];
    if (shooting || total >= 7) {
      const count = shooting ? scored ? 1 : shots : 2;
      this._startFreeThrows(victim, count, !shooting && total >= 7 && total < 10);
    } else this._prepareInbound(victim.team, { x: victim.x, y: victim.y }, 1.05,
      this._isFrontcourt(victim, victim.team) ? Math.max(20, this.shotClock) : 30, false);
  }
  _startFreeThrows(p, count, oneAndOne = false) {
    this._flushSubs(p.id);
    this._resetDefenseTracking(); this._resetOffenseFlow();
    this.afterScore = null;
    this.phase = 'freeThrow'; this.phaseTime = .8;
    this.freeThrows = { team: p.team, shooter: p.id, remaining: count, total: count, taken: 0,
      made: 0, oneAndOne, awaiting: true };
    this.ball.flight = null; this.ball.owner = p.id; this.ball.z = 0;
    const hoop = this.hoop(p.team), dir = this.attackDir(p.team);
    p.x = 250; p.y = hoop.y - dir * 137.5; p.vx = p.vy = 0;
    let index = 0;
    for (const q of this.active()) if (q.id !== p.id) {
      q.x = 250 + (index % 2 ? 77 : -77); q.y = hoop.y - dir * (65 + Math.floor(index / 2) * 33); q.vx = q.vy = 0; index++;
    }
    this.ball.x = p.x; this.ball.y = p.y;
    this._setPossession(p.team);
    if (p.team === this.human) this.controlled = p.id;
    this._emit('freeThrow', oneAndOne ? 'One-and-one. Earn the second at the line.' : `${count} free throw${count === 1 ? '' : 's'}.`, { team: p.team, playerId: p.id });
  }
  _shootFreeThrow(timing = .65) {
    const ft = this.freeThrows, p = this.player(ft?.shooter);
    if (!p || !ft || this.ball.flight || this.phaseTime > 0) return false;
    timing = Number.isFinite(timing) ? clamp(timing, 0, 1) : .65;
    const quality = clamp(.57 + (p.ratings.freeThrow - 65) * .009 + (.23 - Math.abs(timing - .65)) * .45, .2, .95);
    const made = this.random() < quality;
    this.ball.owner = null;
    this.ball.flight = { kind: 'freeThrow', team: p.team, shooter: p.id, start: { x: p.x, y: p.y },
      end: this.hoop(p.team), time: 0, duration: .9, arc: 85, made, value: 1 };
    ft.awaiting = false;
    this.shotFeedback = { text: Math.abs(timing - .65) < .09 ? 'GREAT RELEASE' : timing < .48 ? 'EARLY' : timing > .82 ? 'LATE' : 'GOOD RELEASE',
      team: p.team, playerId: p.id, timing, quality, expires: this.elapsed + 1.6 };
    p.anim = 'jumper'; p.animTime = .5; p.jump = .25;
    return true;
  }
  _resolveFreeThrow(f) {
    const ft = this.freeThrows, p = this.player(f.shooter); if (!ft) return;
    ft.taken++; ft.remaining--; if (f.made) {
      this.score[f.team]++; this._stat(f.team, p, 'points'); ft.made++;
      this._emit('score', 'Good from the line.', { team: f.team, playerId: p.id, points: 1, shotType: 'freeThrow' });
    } else this._emit('freeThrowMiss', 'Off the rim.', { team: f.team, playerId: p.id });
    if (ft.oneAndOne && ft.taken === 1 && !f.made) ft.remaining = 0;
    this.ball.flight = null;
    if (ft.remaining > 0) {
      this.ball.owner = p.id; this.ball.x = p.x; this.ball.y = p.y; this.ball.z = 0;
      this.phaseTime = .6; ft.awaiting = true; return;
    }
    this.freeThrows = null;
    if (this.endPending) { this._endPeriod(); return; }
    if (f.made) this._beginAfterScore({ ...f, type: 'freeThrow' });
    else {
      this.phase = 'live'; this.shotClock = 20;
      this._looseBall(f.end.x + (this.random() - .5) * 32, f.end.y - this.attackDir(f.team) * 22,
        (this.random() - .5) * 110, -this.attackDir(f.team) * 90, 100, true, f.team);
    }
  }
  _substitute(outId, inId, forced = false) {
    const out = this.player(outId), incoming = this.player(inId);
    if (!out || !incoming || out.team !== incoming.team || !out.active || incoming.active || incoming.fouls >= 5) return false;
    if (!forced && this.freeThrows?.shooter === out.id) return false;
    incoming.active = true; incoming.slot = out.slot; incoming.x = out.x; incoming.y = out.y;
    incoming.vx = incoming.vy = 0; out.active = false; out.slot = -1; out.vx = out.vy = 0;
    if (this.controlled === out.id) this.controlled = incoming.id;
    if (this.ball.owner === out.id) this.ball.owner = incoming.id;
    this._resetDefenseTracking(); this._resetOffenseFlow();
    this._emit('substitution', `${incoming.name.split(' ').at(-1)} checks in for ${out.name.split(' ').at(-1)}.`, { team: out.team, playerId: incoming.id });
    return true;
  }
  _flushSubs(excludeId = null) {
    const queued = this.pendingSubs;
    this.pendingSubs = queued.filter(s => s.outId === excludeId);
    for (const sub of queued) if (sub.outId !== excludeId) this._substitute(sub.outId, sub.inId);
  }

  step(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'finished' || this.phase === 'halftime') return;
    let remaining = Math.min(dt, .25);
    const clean = { x: Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0,
      y: Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0, sprint: !!input.sprint, contain: !!input.contain };
    const length = Math.hypot(clean.x, clean.y); if (length > 1) { clean.x /= length; clean.y /= length; }
    while (remaining > 0 && this.phase !== 'finished' && this.phase !== 'halftime') {
      const h = Math.min(remaining, 1 / 60); this._step(h, clean); remaining -= h;
    }
  }
  _step(dt, input) {
    this.elapsed += dt;
    for (const p of this.players) {
      p.actionCooldown = Math.max(0, p.actionCooldown - dt); p.jump = Math.max(0, p.jump - dt);
      p.animTime = Math.max(0, p.animTime - dt); if (!p.animTime) p.anim = 'idle';
      if (!p.active) p.stamina = Math.min(1, p.stamina + dt * .026);
    }
    if (this.shotFeedback && this.shotFeedback.expires < this.elapsed) this.shotFeedback = null;
    if (this.phase === 'afterScore') {
      this.phaseTime = Math.max(0, this.phaseTime - dt);
      if (this.phaseTime <= 0) {
        const nextTeam = this.afterScore.nextTeam;
        this._prepareInbound(nextTeam, this._backcourtSpot(nextTeam), MADE_BASKET_INBOUND_SECONDS, 30, true);
      }
      return;
    }
    if (this.phase === 'inbound') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) this._releaseInbound();
      return;
    }
    if (this.phase === 'freeThrow') {
      this.phaseTime = Math.max(0, this.phaseTime - dt);
      if (this.ball.flight) this._stepBall(dt);
      else if (this.freeThrows?.team !== this.human && this.phaseTime <= 0) this._shootFreeThrow(.54 + this.random() * .2);
      return;
    }
    if (this.phase !== 'live') return;
    this.playTime += dt;
    if (!this.practice && !this.endPending) this.clock = Math.max(0, this.clock - dt);
    this.shotClock = Math.max(0, this.shotClock - dt);
    const c = this.carrier();
    if (c) {
      c.holdTime += dt;
      if (this._isFrontcourt(c, c.team)) this.frontcourt = true;
      else if (this.frontcourt && (this.attackDir(c.team) < 0 ? c.y > 482 : c.y < 458)) {
        this._turnover(c.team, 'Backcourt violation. Ball goes the other way.'); return;
      }
    }
    if (!this.frontcourt) {
      this.backcourtTime += dt;
      if (this.backcourtTime >= 10 && !this.ball.flight) { this._turnover(this.possession, 'Ten seconds. Backcourt violation.'); return; }
    }
    if (!this.practice && this.clock <= 0 && !this.endPending) {
      if (this.ball.flight?.kind === 'shot') this.endPending = true;
      else { this._endPeriod(); return; }
    }
    if (this.shotClock <= 0 && this.ball.flight?.kind !== 'shot') {
      this._turnover(this.possession, 'Shot-clock violation. Get a shot away sooner.'); return;
    }
    this._updateOffenseFlow();
    this._updateDefenseHelp();
    this._updateDefenseTracking();
    for (const p of this.active()) {
      if (p.id === this.controlled && this.human >= 0) this._moveHuman(p, input, dt);
      else this._moveAI(p, dt);
      if (this.phase !== 'live') return;
    }
    this._separatePlayers(dt);
    if (this.phase === 'live') this._stepBall(dt);
  }
  _endPeriod() {
    this._resetDefenseTracking(); this._resetOffenseFlow();
    this.ball.flight = null; this.ball.owner = null; this.ball.z = 0; this.endPending = false; this.afterScore = null;
    if (this.period === 1) {
      this._flushSubs();
      this.phase = 'halftime'; this.clock = 0;
      this._emit('halftime', 'Halftime. Regroup and switch ends.'); return;
    }
    if (this.score[0] === this.score[1]) {
      this.period++; this.clock = this.halfSeconds >= 1200 ? 300 : 60;
      const team = this.period % 2;
      this._prepareInbound(team, { x: 250, y: this.attackDir(team) < 0 ? 600 : 340 }, 1.2, 30, true);
      this._emit('overtime', `Overtime ${this.period - 2}. Somebody has to win this one.`); return;
    }
    this.winner = this.score[0] > this.score[1] ? 0 : 1; this.phase = 'finished'; this.clock = 0;
    this._emit('finished', `${this.teams[this.winner].name} wins ${this.score[this.winner]}–${this.score[1 - this.winner]}.`, { team: this.winner });
  }

  _move(p, tx, ty, sprint, dt, arrive = false, pace = 1) {
    let dx = tx, dy = ty;
    if (arrive) { dx = tx - p.x; dy = ty - p.y; const n = Math.hypot(dx, dy); const speed = Math.min(1, n / 22); const u = norm(dx, dy); dx = u.x * speed; dy = u.y * speed; }
    const running = Math.hypot(dx, dy) > .08;
    const burst = sprint && p.stamina > .12;
    const offBall = this.ball.owner === p.id ? 1 : OFF_BALL_SPEED_MULTIPLIER;
    const speed = (92 + (p.ratings.speed - 50) * 1.14) * offBall * (burst ? 1.37 : 1) * (.81 + p.stamina * .19) * pace;
    const acceleration = 1 - Math.exp(-dt * (running ? 13 : 19));
    p.vx = lerp(p.vx, dx * speed, acceleration); p.vy = lerp(p.vy, dy * speed, acceleration);
    p.x = clamp(p.x + p.vx * dt, 12, 488); p.y = clamp(p.y + p.vy * dt, 14, 926);
    if (running) p.facing = Math.atan2(dy, dx);
    p.stamina = clamp(p.stamina + dt * (burst && running ? -.12 : running ? -.009 : .022) * (burst ? 1.2 - p.ratings.stamina / 250 : 1), .03, 1);
  }
  _moveHuman(p, input, dt) {
    let x = input.x, y = input.y;
    if (input.contain && p.team !== this.possession && Math.hypot(x, y) < .1) {
      const c = this.carrier() || this.ball, hoop = this.ownHoop(p.team);
      const toward = norm(hoop.x - c.x, hoop.y - c.y);
      const tx = c.x + toward.x * 34, ty = c.y + toward.y * 34;
      this._move(p, tx, ty, false, dt, true); return;
    }
    if (input.contain && p.team !== this.possession) { x *= .8; y *= .8; }
    this._move(p, x, y, input.sprint, dt);
  }
  _resetOffenseFlow() {
    this.offenseFlow = null;
    for (const p of this.players) { p.offenseRead = null; p.attackRead = null; }
  }
  _offenseContext() {
    const play = this.screenUntil > this.elapsed ? 'pickroll' : this.offense[this.possession];
    return `${this.period}:${this.possessionEpoch}:${play}:${this.active(this.possession).map(p => p.id).join(',')}`;
  }
  _readTime(p) {
    // Reading a developing opening is separate from running speed. Profiles
    // supply stable habits, not fresh random steering on every frame.
    return .18 + (100 - clamp(p.ratings.awareness, 50, 99)) * .011 + p.offenseProfile.readOffset;
  }
  _flowPoint(team, x, depth, purpose = 'space') {
    return { x: clamp(x, 30, 470), y: clamp(this.hoop(team).y - this.attackDir(team) * depth, 25, 915), purpose };
  }
  _baseOffensiveTarget(p, side = this.offenseFlow?.side || 1) {
    const play = this.screenUntil > this.elapsed ? 'pickroll' : this.offense[p.team];
    const shapes = {
      motion: [[250, 285], [36, 100], [464, 100], [250 + side * 155, 265], [250 + side * 80, 80]],
      spacing: [[250, 285], [34, 75], [466, 75], [250 + side * 160, 255], [250 + side * 65, 70]],
      post: [[250, 285], [48, 225], [462, 80], [250 + side * 155, 175], [250 - side * 48, 85]],
      pickroll: [[250, 285], [34, 90], [466, 90], [250 + side * 155, 260], [250 + side * 65, 75]],
    };
    const a = shapes[play][p.slot % 5];
    return this._flowPoint(p.team, a[0], a[1], p.slot === 4 ? 'post' : 'space');
  }
  _setIntent(p, intent, target, seconds, extra = {}) {
    const previous = p.offenseRead;
    p.offenseRead = { context: this._offenseContext(), intent,
      target: { ...target }, started: this.elapsed, until: this.elapsed + seconds,
      nextRead: this.elapsed + this._readTime(p), pace: intent === 'setup' ? .48 : intent === 'cut' || intent === 'roll' ? 1 : .88,
      anchor: { ...(this.offenseFlow?.anchors[p.id] || previous?.anchor || target) },
      blockedSince: previous?.blockedSince ?? null, ...extra };
  }
  _passingWindow(p, point = p, holder = this.carrier()) {
    if (!holder) return { gap: 0, openness: this._nearestDefenderDistance({ ...point, team: p.team }), score: 0 };
    let gap = 100;
    for (const d of this.active(1 - p.team)) {
      const lane = segmentGap(d, holder, point);
      if (lane.t > .12 && lane.t < .94) gap = Math.min(gap, lane.gap);
    }
    const openness = this._nearestDefenderDistance({ ...point, team: p.team });
    return { gap, openness, score: Math.min(gap, 75) * .8 + Math.min(openness, 100) * .55 };
  }
  _findPassingWindow(p, holder, anchor) {
    // Sidestep out of a defender's shadow; smart players compare actual angles.
    // A lower reader makes the familiar short adjustment before reassessing.
    const radial = norm(p.x - holder.x, p.y - holder.y), tangent = { x: -radial.y, y: radial.x };
    const reconsidered = p.offenseRead?.blockedSince !== null
      && this.elapsed - (p.offenseRead?.blockedSince ?? this.elapsed) > 1.5 + p.offenseProfile.patience;
    const amounts = p.ratings.awareness >= 80 || reconsidered ? [-82, -46, 0, 46, 82] : [0, p.offenseProfile.side * 34];
    const hoop = this.hoop(p.team), dir = this.attackDir(p.team);
    const candidates = amounts.map(n => ({ x: clamp(anchor.x + tangent.x * n, 34, 466),
      y: hoop.y - dir * clamp((anchor.y + tangent.y * n - hoop.y) * -dir, 55, 330), purpose: 'relocate' }));
    let best = candidates[0], bestScore = -Infinity;
    for (const point of candidates) {
      let score = this._passingWindow(p, point, holder).score - distance(p, point) * .1;
      for (const mate of this.active(p.team)) {
        if (mate.id === p.id) continue;
        const reserved = mate.id === holder.id ? mate : mate.offenseRead?.target || mate;
        score -= Math.max(0, 92 - distance(point, reserved)) * 1.2;
      }
      // Stay outside the handler's driving lane and do not migrate into the rim.
      if (distance(point, this.hoop(p.team)) < 115) score -= 70;
      if (score > bestScore) { bestScore = score; best = point; }
    }
    return best;
  }
  _cutOpportunity(p, holder) {
    if (!holder || holder.id === p.id || p.slot === 4 || distance(holder, this.hoop(p.team)) < 140) return null;
    const mark = this.active(1 - p.team).find(d => d.slot === p.slot);
    const toBall = norm(holder.x - p.x, holder.y - p.y);
    const ballSide = mark ? (mark.x - p.x) * toBall.x + (mark.y - p.y) * toBall.y : 0;
    const window = this._passingWindow(p, p, holder);
    const denied = mark && distance(mark, p) < 75 && ballSide > 12 && window.gap < 38;
    const watchedBall = mark && (mark.defenseRead?.role === 'help' || mark.defenseRead?.role === 'gap' && window.gap < 44)
      && distance(mark, p) > 45 && distance(mark, p) < 150;
    if (!denied && !watchedBall && window.gap >= 27) return null;
    const hoop = this.hoop(p.team), side = p.x < 250 ? -1 : 1;
    if (distance(p, hoop) < 120 || distance(p, holder) < 85) return null;
    const canFill = this.active(p.team).some(q => q.id !== p.id && q.id !== holder.id && q.slot !== 4
      && distance(q, this.offenseFlow?.anchors[p.id] || p) < 260);
    if (!canFill) return null;
    return { denied, watchedBall, mark, target: this._flowPoint(p.team, 250 + side * 24, 62, 'cut'),
      score: (denied ? 65 : watchedBall ? 32 : 16) + p.ratings.awareness * .5 - distance(p, hoop) * .035 };
  }
  _clearLaneTarget(p, holder) {
    const preferredSide = holder.x > 265 ? -1 : holder.x < 235 ? 1 : this.offenseFlow?.side || 1;
    const candidates = [[115, 105], [385, 105], [150, 175], [350, 175], [95, 245], [405, 245]]
      .map(([x, depth]) => this._flowPoint(p.team, x, depth, 'clear'));
    const grade = point => {
      let score = (Math.sign(point.x - 250) === preferredSide ? 12 : 0) - distance(p, point) * .04;
      for (const mate of this.active(p.team)) {
        if (mate.id === p.id) continue;
        const isHolder = mate.id === holder.id;
        const reserved = isHolder ? { x: holder.x + holder.vx * .5, y: holder.y + holder.vy * .5 }
          : mate.offenseRead?.target || mate;
        const gap = Math.min(distance(point, reserved), distance(point, mate));
        score -= Math.max(0, (isHolder ? 125 : 110) - gap) * 2;
      }
      return score;
    };
    return candidates.sort((a, b) => grade(b) - grade(a))[0];
  }
  _startCut(p, holder, opportunity, passCut = false) {
    const destination = opportunity?.target || this._flowPoint(p.team, 250 + (p.x < 250 ? -24 : 24), 62, 'cut');
    const blocked = this.active(p.team).some(q => q.id !== p.id && q.id !== holder.id && q.slot !== 4
      && distance(q, this.hoop(p.team)) < 145 && segmentGap(q, p, destination).gap < 46);
    if (blocked) return false;
    const flow = this.offenseFlow, oldAnchor = { ...flow.anchors[p.id] };
    const fillers = this.active(p.team).filter(q => q.id !== p.id && q.id !== holder.id && q.slot !== 4
      && !['cut', 'roll', 'screen'].includes(q.offenseRead?.intent));
    const filler = fillers.sort((a, b) => distance(a, oldAnchor) - distance(b, oldAnchor))[0];
    let exit = { ...oldAnchor };
    if (filler) {
      exit = { ...flow.anchors[filler.id] };
      flow.anchors[filler.id] = oldAnchor; flow.anchors[p.id] = exit;
      this._setIntent(filler, 'fill', oldAnchor, 2.5, { waitUntil: this.elapsed + .25 + this._readTime(filler) * .5 });
    }
    const toMark = opportunity?.mark ? norm(opportunity.mark.x - p.x, opportunity.mark.y - p.y) : { x: 0, y: 0 };
    const setup = { x: clamp(p.x + toMark.x * 18, 30, 470), y: clamp(p.y + toMark.y * 18, 25, 915), purpose: 'setup' };
    const big = this.active(p.team).find(q => q.slot === 4 && q.id !== holder.id);
    if (big && distance(big, this.hoop(p.team)) < 170) {
      this._setIntent(big, 'clear', this._clearLaneTarget(big, holder), 1.3);
    }
    flow.cutId = p.id; flow.nextCut = this.elapsed + 2.6;
    this._setIntent(p, passCut ? 'cut' : 'setup', passCut ? destination : setup,
      passCut ? 2.5 : .24 + this._readTime(p) * .5,
      { destination: { ...destination }, exit, reason: passCut ? 'give-and-go' : opportunity?.denied ? 'backdoor' : 'blind-side' });
    return true;
  }
  _updateOffenseFlow() {
    const c = this.carrier(), flowHolder = c || (this.ball.flight?.kind === 'pass' ? this.player(this.ball.flight.target) : null);
    if (!flowHolder || flowHolder.team !== this.possession) return;
    const context = this._offenseContext(), team = this.possession, hoop = this.hoop(team), dir = this.attackDir(team);
    let flow = this.offenseFlow;
    if (!flow || flow.context !== context) {
      const side = flowHolder.x < 235 ? 1 : flowHolder.x > 265 ? -1 : 1;
      flow = this.offenseFlow = { context, side, anchors: {}, cutId: null, nextCut: this.elapsed + .85,
        lastPass: -1, screenOwner: null, nextScreen: 0, transition: distance(flowHolder, hoop) > 430 };
      for (const p of this.active(team)) {
        flow.anchors[p.id] = this._baseOffensiveTarget(p, side);
        this._setIntent(p, 'space', flow.anchors[p.id], this._readTime(p));
      }
    }
    const transition = distance(flowHolder, hoop) > 430;
    if (transition) {
      flow.transition = true;
      for (const p of this.active(team)) {
        if (p.id === flowHolder.id || this.elapsed < (p.offenseRead?.nextRead || 0)) continue;
        const side = p.slot % 2 ? -1 : 1;
        const target = { x: p.slot === 0 ? 250 : 250 + side * (p.slot < 3 ? 200 : 105),
          y: clamp(flowHolder.y + dir * (p.slot === 0 ? 100 : p.slot < 3 ? 175 : 255), 70, 870), purpose: 'transition' };
        this._setIntent(p, 'transition', target, .55);
      }
      return;
    }
    if (flow.transition) {
      flow.transition = false; flow.nextCut = this.elapsed + 1.1;
      for (const p of this.active(team)) this._setIntent(p, 'space', flow.anchors[p.id], .8 + this._readTime(p));
    }
    const play = this.screenUntil > this.elapsed ? 'pickroll' : this.offense[team];
    // Complete a committed action before considering another. Only the ball's
    // receiver or a blocked driving lane can interrupt the route immediately.
    for (const p of this.active(team)) {
      if (p.id === flowHolder.id) {
        if (flow.cutId === p.id) flow.cutId = null;
        p.offenseRead = null;
        continue;
      }
      let read = p.offenseRead;
      if (!read) { this._setIntent(p, 'space', flow.anchors[p.id], .6); read = p.offenseRead; }
      if (read.intent === 'setup' && this.elapsed >= read.until) {
        this._setIntent(p, 'cut', read.destination, 2.6, { destination: read.destination, exit: read.exit, reason: read.reason });
      } else if (read.intent === 'screen') {
        if (distance(p, read.target) < 27 && !read.arrivedAt) read.arrivedAt = this.elapsed;
        if ((read.arrivedAt && this.elapsed - read.arrivedAt > 1.3) || this.elapsed >= read.until) {
          const roll = this._flowPoint(team, 250 + flow.side * 24, 65, 'roll');
          this._setIntent(p, 'roll', roll, 3.2, { exit: roll }); flow.cutId = p.id;
        }
      } else if (['cut', 'roll'].includes(read.intent)) {
        const driveInLane = distance(flowHolder, hoop) < 180 && distance(p, flowHolder) < 140
          && segmentGap(p, flowHolder, hoop).gap < 70;
        if (this.elapsed >= read.until || (read.intent === 'cut' && distance(p, read.target) < 22 && this.elapsed - read.started > .7) || driveInLane) {
          const exit = driveInLane ? this._clearLaneTarget(p, flowHolder) : read.exit || flow.anchors[p.id];
          if (read.intent === 'roll' && !driveInLane) flow.anchors[p.id] = { ...exit, purpose: 'post' };
          this._setIntent(p, read.intent === 'roll' && !driveInLane ? 'hold' : 'clear', exit, .9 + this._readTime(p));
          if (flow.cutId === p.id) flow.cutId = null;
          flow.nextCut = Math.max(flow.nextCut, this.elapsed + 1);
        }
      } else if (['clear', 'fill', 'relocate', 'space', 'transition'].includes(read.intent) && distance(p, read.target) < 16) {
        this._setIntent(p, 'hold', read.target, .7 + p.offenseProfile.patience,
          { holdUntil: ['relocate', 'clear', 'fill'].includes(read.intent) ? this.elapsed + .65 : 0 });
      }
    }
    if (!c || this.ball.flight) return;
    const bigInLane = this.active(team).find(p => p.slot === 4 && p.id !== c.id);
    if (bigInLane && !['screen', 'roll', 'cut'].includes(bigInLane.offenseRead?.intent)) {
      const corridor = segmentGap(bigInLane, c, hoop);
      const downhill = c.vy * dir > 18;
      const threatensLane = distance(c, hoop) < 250 && downhill && corridor.t > .05 && corridor.gap < 105;
      const crowded = distance(c, bigInLane) < 105 && distance(c, hoop) < 210;
      const read = bigInLane.offenseRead;
      if ((threatensLane || crowded) && read?.intent !== 'clear') {
        this._setIntent(bigInLane, 'clear', this._clearLaneTarget(bigInLane, c), 1.4,
          { reason: 'drive-lane', waitUntil: this.elapsed + this._readTime(bigInLane) * .24 });
      }
    }
    const cutter = this.player(flow.cutId);
    if (flow.cutId !== null && (!cutter?.active || !['setup', 'cut', 'roll', 'screen'].includes(cutter.offenseRead?.intent))) flow.cutId = null;
    // Screens are set at a real spot, held, then slipped. The screener does not
    // chase every dribble and there is no global seven-second animation loop.
    const screener = this.active(team).find(p => p.slot === (c.slot === 4 ? 3 : 4));
    if (play === 'pickroll' && screener && flow.cutId === null && flow.screenOwner !== c.id
      && this.elapsed >= flow.nextScreen && distance(c, hoop) > 145) {
      const point = { x: clamp(c.x + (c.x > 250 ? -34 : 34), 50, 450), y: c.y + dir * 24, purpose: 'screen' };
      flow.screenOwner = c.id; flow.nextScreen = this.elapsed + 4; flow.cutId = screener.id;
      this._setIntent(screener, 'screen', point, 2.7);
    }
    if (this.lastPass && this.lastPass.time !== flow.lastPass && this.lastPass.to === c.id) {
      flow.lastPass = this.lastPass.time;
      const passer = this.player(this.lastPass.from);
      if (play === 'motion' && passer?.active && passer.slot !== 4 && distance(passer, hoop) > 145
        && distance(c, hoop) > 145 && flow.cutId === null && this.elapsed - this.lastPass.time < 1.5) {
        this._startCut(passer, c, null, true);
      }
    }
    if (flow.cutId === null && this.elapsed >= flow.nextCut && play === 'motion') {
      const candidates = this.active(team).filter(p => p.id !== c.id && p.slot !== 4
        && !(p.id === this.controlled && this.human === team)
        && p.offenseRead && this.elapsed >= p.offenseRead.nextRead
        && ['hold', 'space', 'relocate'].includes(p.offenseRead.intent)
        && distance(p, flow.anchors[p.id]) < 55 && Math.hypot(p.vx, p.vy) < 70)
        .map(p => ({ p, opportunity: this._cutOpportunity(p, c) })).filter(item => item.opportunity)
        .sort((a, b) => b.opportunity.score - a.opportunity.score);
      if (candidates.length) this._startCut(candidates[0].p, c, candidates[0].opportunity);
    }
    for (const p of this.active(team)) {
      if (p.id === c.id) continue;
      const read = p.offenseRead;
      if (!read || this.elapsed < read.nextRead || this.elapsed < (read.holdUntil || 0)
        || ['setup', 'cut', 'roll', 'screen', 'fill', 'clear', 'relocate'].includes(read.intent)
        && this.elapsed < read.until) continue;
      read.nextRead = this.elapsed + this._readTime(p);
      let anchor = { ...flow.anchors[p.id] };
      // A big vacates the lane for a cutter or a dribbler instead of following
      // the ball under the hoop. Everybody else preserves useful width.
      if (p.slot === 4 && (flow.cutId !== null && flow.cutId !== p.id || distance(c, hoop) < 130)) {
        anchor = this._clearLaneTarget(p, c);
      }
      const currentWindow = this._passingWindow(p, p, c);
      if (currentWindow.gap < 32) read.blockedSince ??= this.elapsed; else read.blockedSince = null;
      const mark = this.active(1 - team).find(d => d.slot === p.slot);
      const helperLeft = mark?.defenseRead?.role === 'help' || mark?.defenseRead?.role === 'recover';
      const needAngle = currentWindow.gap < 32 || helperLeft || distance(p, c) < 95;
      const desired = needAngle && p.slot !== 4 ? this._findPassingWindow(p, c, anchor) : anchor;
      const improvement = this._passingWindow(p, desired, c).score - currentWindow.score;
      if (distance(p, desired) > 28 && (distance(p, anchor) > 70 || needAngle && improvement > 8 || distance(p, c) < 90 || p.slot === 4)) {
        this._setIntent(p, needAngle ? 'relocate' : 'space', desired, .9 + p.offenseProfile.patience);
      } else if (!['hold', 'relocate'].includes(read.intent) && this.elapsed >= read.until) {
        this._setIntent(p, 'hold', { x: p.x, y: p.y, purpose: 'space' }, .8);
      }
    }
  }
  _offensiveTarget(p) {
    const read = p.offenseRead;
    if (read?.context === this._offenseContext()) {
      if (read.waitUntil > this.elapsed) return { x: p.x, y: p.y, purpose: 'hold', pace: .5 };
      return { ...read.target, pace: read.pace, intent: read.intent };
    }
    return this._baseOffensiveTarget(p);
  }
  _spaceOffensiveTarget(p, target) {
    // Anchors and fill assignments handle strategic spacing. This small local
    // steering layer only avoids imminent teammate contact; it cannot drag a
    // whole formation after a nearby player or continually move its goalposts.
    let x = target.x, y = target.y;
    if (target.purpose === 'screen') return { ...target };
    const forward = norm(x - p.x, y - p.y), travel = distance(p, target);
    let obstacle = null;
    if (travel > 48) for (const mate of this.active(p.team)) {
      if (mate.id === p.id) continue;
      const dx = mate.x - p.x, dy = mate.y - p.y;
      const ahead = dx * forward.x + dy * forward.y, across = dx * -forward.y + dy * forward.x;
      if (ahead > 0 && ahead < 67 && Math.abs(across) < 37 && (!obstacle || ahead < obstacle.ahead))
        obstacle = { ahead, across };
    }
    if (obstacle) {
      // Route around a teammate instead of spending a second pushing through
      // their body. A consistent passing side avoids head-on left/right flips.
      const side = obstacle.across > 7 ? -1 : 1;
      x = p.x + forward.x * 58 - forward.y * 52 * side;
      y = p.y + forward.y * 58 + forward.x * 52 * side;
    }
    for (const mate of this.active(p.team)) {
      if (mate.id === p.id) continue;
      const gap = distance(p, mate);
      if (gap < 43) {
        const away = gap > .01 ? norm(p.x - mate.x, p.y - mate.y) : { x: p.slot % 2 ? -1 : 1, y: 0 };
        x += away.x * (43 - gap) * .7; y += away.y * (43 - gap) * .7;
      }
    }
    return { ...target, x: clamp(x, 28, 472), y: clamp(y, 25, 915) };
  }
  _resetDefenseTracking(team) {
    for (const p of this.players) if (team === undefined || p.team === team) p.defenseRead = null;
    if (team === undefined) this.defenseHelp = [null, null]; else this.defenseHelp[team] = null;
  }
  _defenseContext(p) { return `${this.period}:${this.possessionEpoch}:${this.defense[p.team]}:${p.slot}`; }
  _defenseTiming(p) {
    const scale = p.team === this.human ? 1 : this.difficultyScale;
    const fatigue = 1 - clamp(p.stamina, 0, 1), rating = p.ratings.defense;
    return {
      // Cadence adds at most .09s to a cut's observed reaction: together these
      // remain about .15–.4 simulation seconds, including on tired defenders.
      reaction: clamp(p.defenseProfile.reaction + (75 - rating) * .0012 + fatigue * .08 + (75 - p.ratings.anticipation) * .001 + (1 - scale) * .12, .15, .31),
      cadence: p.defenseProfile.cadence,
      error: clamp(1 + (75 - rating) * .012 + fatigue * .35 + (1 - scale) * .4, .6, 1.6),
    };
  }
  _updateDefenseTracking() {
    const defenders = this.active(1 - this.possession);
    // Sample all assignments before updating any state. Press-role hysteresis
    // must not depend on which defender happens to be visited first.
    const reads = defenders.map(p => {
      const context = this._defenseContext(p), current = p.defenseRead;
      return { p, context, timing: this._defenseTiming(p), observation: !current || current.context !== context
        || this.elapsed >= current.nextObserve ? this._defensiveObservation(p) : null };
    });
    for (const { p, context, timing, observation } of reads) {
      let read = p.defenseRead;
      if (!read || read.context !== context) {
        // A new possession/restart establishes sensible coverage immediately;
        // subsequent cuts and changes must travel through the reaction queue.
        p.defenseRead = { context, key: observation.key,
          role: observation.role, target: { x: observation.x, y: observation.y }, observations: [],
          nextObserve: this.elapsed + timing.cadence };
        continue;
      }
      if (observation) {
        if (observation.key !== read.key) { read.key = observation.key; read.observations = []; }
        read.observations.push({ at: this.elapsed, x: observation.x, y: observation.y, role: observation.role });
        read.nextObserve = this.elapsed + timing.cadence;
      }
      while (read.observations.length && read.observations[0].at <= this.elapsed - timing.reaction) {
        const known = read.observations.shift();
        if (known.role !== read.role || known.role === 'on-ball' || distance(read.target, known) > 10) {
          read.target = { x: known.x, y: known.y }; read.role = known.role;
        }
      }
    }
  }
  _updateDefenseHelp() {
    const team = 1 - this.possession, c = this.carrier(), mode = this.defense[team];
    let help = this.defenseHelp[team];
    if (!c || mode !== 'man') {
      if (help && help.role !== 'recover') this.defenseHelp[team] = { ...help, role: 'recover', until: this.elapsed + .6 };
      else if (help && this.elapsed >= help.until) this.defenseHelp[team] = null;
      return;
    }
    const hoop = this.hoop(c.team), primary = this.active(team).find(p => p.slot === c.slot);
    const range = distance(c, hoop), primaryRange = primary ? distance(primary, hoop) : 1000;
    const driving = c.vy * this.attackDir(c.team) > 18 || range < 125;
    const beaten = !primary || distance(primary, c) > 48 && (primaryRange > range + 8 || distance(primary, c) > 82);
    const needHelp = range < 225 && driving && beaten;
    if (help) {
      if (help.role === 'recover') { if (this.elapsed >= help.until) this.defenseHelp[team] = null; return; }
      if (help.owner !== c.id || !needHelp && this.elapsed > help.until) {
        this.defenseHelp[team] = { ...help, role: 'recover', until: this.elapsed + .7 }; return;
      }
      if (help.role === 'read' && this.elapsed >= help.at) { help.role = 'help'; help.until = this.elapsed + .45; }
      return;
    }
    if (!needHelp) return;
    const point = { x: lerp(c.x, hoop.x, .42), y: lerp(c.y, hoop.y, .42) };
    const candidates = this.active(team).filter(p => p.id !== primary?.id && !(p.id === this.controlled && this.human === team));
    const grade = p => {
      const mark = this.active(c.team).find(q => q.slot === p.slot);
      return distance(p, point) + (mark?.ratings.shooting || 75) * .45 - (p.slot >= 3 ? 18 : 0);
    };
    const helper = candidates.sort((a, b) => grade(a) - grade(b))[0];
    if (helper) this.defenseHelp[team] = { id: helper.id, owner: c.id, role: 'read',
      at: this.elapsed + .1 + (100 - helper.ratings.anticipation) * .009,
      until: this.elapsed + .7 };
  }
  _defensiveObservation(p) {
    const c = this.carrier(), offense = this.possession, hoop = this.hoop(offense), dir = this.attackDir(offense);
    const opponents = this.active(offense).sort((a, b) => a.slot - b.slot), mode = this.defense[p.team];
    let mark = opponents.find(o => o.slot === p.slot) || opponents[p.slot % Math.max(1, opponents.length)] || this.ball;
    let key = `${mode}:mark:${mark.id ?? 'ball'}`, role = mark.id === this.ball.owner ? 'on-ball' : 'gap';
    const { error } = this._defenseTiming(p), shade = p.defenseProfile.shade * error, cushion = p.defenseProfile.cushion * error;
    if (mode === 'press' && c) {
      const pressureKey = `press:ball:${c.id}`;
      const pressureDistance = q => distance(q, c) - (q.defenseRead?.key === pressureKey ? 28 : 0);
      const pressers = this.active(p.team).sort((a, b) => pressureDistance(a) - pressureDistance(b)).slice(0, 2);
      if (pressers.includes(p)) { mark = c; key = pressureKey; role = 'on-ball'; }
    }
    if (mode === 'zone' && distance(this.ball, hoop) < 420) {
      const positions = [[175, 205], [325, 205], [105, 75], [395, 75], [250, 70]];
      const base = positions[p.slot % 5];
      const helpKey = `zone:ball:${c?.id}`;
      const helpRange = p.defenseRead?.key === helpKey ? 115 : 85;
      const closeout = c ? this.active(p.team).slice().sort((a, b) =>
        (distance(a, c) - (a.defenseRead?.key === helpKey ? 25 : 0))
        - (distance(b, c) - (b.defenseRead?.key === helpKey ? 25 : 0)))[0] : null;
      if (c && closeout?.id === p.id && distance(p, c) < helpRange) { mark = c; key = helpKey; role = 'on-ball'; }
      else return { key: `zone:area:${p.slot}`, role: 'zone', x: clamp(base[0] + (this.ball.x - 250) * .16 + shade * .7, 15, 485),
        y: clamp(hoop.y - dir * (base[1] + cushion * .6), 18, 922) };
    }
    const helper = this.defenseHelp[p.team];
    if (mode === 'man' && c && helper?.id === p.id && helper.role === 'help') {
      return { key, role: 'help', x: clamp(lerp(c.x, hoop.x, .34) + shade * .4, 15, 485),
        y: clamp(lerp(c.y, hoop.y, .34), 18, 922) };
    }
    const toward = norm(hoop.x - mark.x, hoop.y - mark.y);
    const onBall = mark.id === this.ball.owner;
    let gap = onBall ? (mode === 'press' ? 24 : 31) : 36;
    if (distance(mark, hoop) > 440 && mode !== 'press') gap = 70;
    gap = clamp(gap + cushion, 18, 82);
    let x = mark.x + toward.x * gap - toward.y * shade;
    let y = mark.y + toward.y * gap + toward.x * shade;
    if (!onBall && c && distance(mark, hoop) <= 440) {
      const toBall = norm(c.x - mark.x, c.y - mark.y), ballGap = distance(c, mark);
      const weakSide = (c.x < 220 && mark.x > 280) || (c.x > 280 && mark.x < 220);
      const nearRim = distance(mark, hoop) < 105;
      if (!nearRim && !weakSide && ballGap < 205 && (mark.ratings?.shooting >= 80 || mode === 'press')) {
        // One pass away: deny an easy catch. This overplay can be beaten by a
        // backdoor cut; it is not a universal tight-marking instruction.
        role = 'deny'; x = mark.x + toBall.x * (31 + cushion * .4) + toward.x * 15;
        y = mark.y + toBall.y * (31 + cushion * .4) + toward.y * 15;
      } else if (!nearRim && mode !== 'press') {
        role = 'gap';
        const gapPoint = { x: lerp(c.x, hoop.x, .6), y: hoop.y - dir * 135 };
        const amount = weakSide ? .38 : ballGap > 210 ? .25 : .16;
        x = lerp(x, gapPoint.x, amount); y = lerp(y, gapPoint.y, amount);
      }
      if (helper?.id === p.id && helper.role === 'recover') role = 'recover';
    }
    return { key, role, x: clamp(x, 15, 485), y: clamp(y, 18, 922) };
  }
  _defensiveTarget(p) {
    const read = p.defenseRead;
    if (read?.context === this._defenseContext(p)) return { ...read.target };
    const { x, y } = this._defensiveObservation(p);
    return { x, y };
  }
  _carrierTarget(p, info) {
    if (p.attackRead && this.elapsed < p.attackRead.until) return { ...p.attackRead.target };
    const hoop = this.hoop(p.team), dir = this.attackDir(p.team), flow = this.offenseFlow;
    const screening = this.active(p.team).some(q => q.offenseRead?.intent === 'screen');
    let target;
    if (info.range > 360) target = { x: clamp(p.x, 150, 350), y: hoop.y - dir * 280 };
    else if (screening && p.holdTime < 1.2) target = { x: p.x, y: p.y };
    else {
      const preferred = this.offense[p.team] === 'spacing' && p.ratings.shooting > 78 ? 238 : 53;
      const candidates = (preferred > 200 ? [115, 250, 385] : [185, 250, 315])
        .map(x => ({ x, y: hoop.y - dir * preferred }));
      const grade = point => {
        const nearest = this._nearestDefenderDistance({ ...point, team: p.team });
        let lane = 100;
        for (const d of this.active(1 - p.team)) {
          const v = segmentGap(d, p, point); if (v.t > .1 && v.t < .95) lane = Math.min(lane, v.gap);
        }
        return Math.min(lane, 85) * .55 + Math.min(nearest, 95) * .4 - distance(p, point) * .08;
      };
      target = candidates.sort((a, b) => grade(b) - grade(a))[0];
      // Give a developing cutter a brief passing window before driving into
      // the same lane. This wait is a decision, not a global animation clock.
      if (flow?.cutId !== null && flow?.cutId !== undefined && info.range < 330 && p.holdTime < 1.1)
        target = { x: p.x, y: p.y };
    }
    p.attackRead = { target: { ...target }, until: this.elapsed + .55 + this._readTime(p) * .5 };
    return target;
  }
  _bestPass(p) {
    const hoop = this.hoop(p.team);
    return this.active(p.team).filter(q => {
      if (q.id === p.id) return false;
      if (!this.frontcourt) return true;
      const duration = clamp(distance(p, q) / 520, .18, .8);
      const errorMargin = (100 - p.ratings.passing) * .11 + 7;
      const landing = { x: q.x, y: q.y + clamp(q.vy * duration * .7, -28, 28) - this.attackDir(p.team) * errorMargin };
      // An automatic decision cannot throw back across halfcourt or lead a
      // trailing receiver into a violation. Explicit human aims stay manual.
      return this._isFrontcourt(q, p.team) && this._isFrontcourt(landing, p.team);
    }).map(q => {
      const window = this._passingWindow(q, q, p), info = this.shotInfo(q);
      const arriving = ['cut', 'roll'].includes(q.offenseRead?.intent);
      return { player: q, window, info, arriving, grade: window.score + info.quality * 45
        + (arriving ? 20 : 0) + (distance(p, hoop) - info.range) * .09 - distance(p, q) * .04 };
    }).filter(option => option.window.gap > 24 && option.window.openness > 32)
      .sort((a, b) => b.grade - a.grade)[0];
  }
  _moveAI(p, dt) {
    const carrier = this.carrier(), isCarrier = carrier?.id === p.id;
    p.aiTimer -= dt;
    // Read the pass while it travels. The landing point was fixed on release;
    // receivers must arrive there on foot instead of abandoning a transition
    // catch for the next halfcourt formation as soon as possession is airborne.
    const pass = this.ball.flight;
    if (pass?.kind === 'pass' && pass.target === p.id) {
      this._move(p, pass.end.x, pass.end.y, false, dt, true);
      if (pass.style === 'lob' && pass.time / pass.duration > .75 && distance(p, pass.end) < 35) {
        p.jump = Math.max(p.jump, .25); p.anim = 'catch'; p.animTime = .25;
      }
      return;
    }
    if (this.ball.owner === null && !this.ball.flight) {
      const chasers = this.active(p.team).sort((a, b) => (distance(a, this.ball) - a.ratings.rebound * .15)
        - (distance(b, this.ball) - b.ratings.rebound * .15)).slice(0, 2);
      if (chasers.includes(p)) this._move(p, this.ball.x, this.ball.y, distance(p, this.ball) > 80, dt, true);
      else {
        const outlet = p.team === this.possession ? this._spaceOffensiveTarget(p, this._offensiveTarget(p)) : this._defensiveTarget(p);
        this._move(p, outlet.x, outlet.y, false, dt, true);
      }
      return;
    }
    if (isCarrier) {
      const hoop = this.hoop(p.team), info = this.shotInfo(p), tempo = this.teams[p.team].tempo || 1;
      const crowded = info.contest > .5;
      const target = this._carrierTarget(p, info);
      this._move(p, target.x, target.y, info.range > 360 || this.shotClock < 5, dt, true);
      if (p.aiTimer <= 0 && this.phase === 'live') {
        p.aiTimer = (.48 + this.random() * .45) / tempo;
        const ratingScale = p.team !== this.human ? this.difficultyScale : 1;
        const pass = this._bestPass(p), clearPass = pass && pass.window.gap > 24 && pass.window.openness > 32;
        const usefulPass = clearPass && p.holdTime > .6 && (pass.arriving && pass.info.range < 150
          || pass.info.quality > info.quality + .14 || crowded && p.holdTime > 1.35);
        if (this.shotClock >= 3 && usefulPass && this.random() < .55 + (p.ratings.awareness - 50) * .006) {
          this._pass(p, pass.player.id);
        } else if (this.shotClock < 2.5 || info.range < 85 || (p.holdTime > 1.4 && info.range < 285
          && (info.contest < .72 || p.holdTime > 3.6) && this.random() < (.25 + info.quality * .75) * ratingScale)) {
          this._shoot(p, clamp(.65 + (this.random() - .5) * (.35 / ratingScale), .2, 1));
        } else if (clearPass && p.holdTime > 1.8 && this.random() < (crowded ? .48 : .3)) this._pass(p, pass.player.id);
      }
    } else {
      const target = p.team === this.possession ? this._spaceOffensiveTarget(p, this._offensiveTarget(p)) : this._defensiveTarget(p);
      this._move(p, target.x, target.y, target.purpose === 'transition' && distance(p, target) > 220, dt, true, target.pace || 1);
      if (p.team !== this.possession && p.aiTimer <= 0) {
        p.aiTimer = .65 + this.random() * .8;
        const c = this.carrier();
        const opponentScale = p.team !== this.human ? this.difficultyScale : 1;
        if (c && distance(p, c) < 34 && this.random() < (this.defense[p.team] === 'press' ? .24 : .12) * opponentScale) this._steal(p);
        else if (this.ball.flight?.kind === 'shot' && distance(p, this.ball) < 58 && this.random() < .45) this._block(p);
        else if (this.ball.flight?.style === 'lob' && this.ball.flight.time / this.ball.flight.duration > .6
          && distance(p, this.ball) < 65 && this.random() < .55) this._block(p);
      }
    }
  }
  _separatePlayers(dt) {
    const list = this.active();
    // Two capped passes resolve crowded contacts without large position jumps.
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy);
      const radius = a.team === b.team ? 30 : COURT.playerRadius * 2;
      if (n >= radius) continue;
      const u = n < .01 ? { x: i % 2 ? 1 : -1, y: .2 } : { x: dx / n, y: dy / n };
      const push = Math.min((radius - n) * .5, dt * 75);
      a.x = clamp(a.x - u.x * push, 12, 488); a.y = clamp(a.y - u.y * push, 14, 926);
      b.x = clamp(b.x + u.x * push, 12, 488); b.y = clamp(b.y + u.y * push, 14, 926);
      if (a.team !== b.team && this.offense[this.possession] === 'pickroll') {
        const screen = a.team === this.possession ? a : b, defender = a.team === this.possession ? b : a;
        if (screen.slot >= 3 && screen.id !== this.ball.owner && Math.hypot(screen.vx, screen.vy) < 50) {
          defender.vx *= Math.max(0, 1 - dt * 11); defender.vy *= Math.max(0, 1 - dt * 11); screen.screen = this.elapsed + .15;
        }
      }
    }
  }

  _stepBall(dt) {
    const c = this.carrier();
    if (c) { this.ball.x = c.x + Math.sin(this.elapsed * 15) * 8; this.ball.y = c.y + this.attackDir(c.team) * 8;
      this.ball.z = 3 + Math.abs(Math.sin(this.elapsed * 12)) * 12; return; }
    const f = this.ball.flight;
    if (f) {
      const oldZ = this.ball.z;
      f.time += dt; const t = clamp(f.time / f.duration, 0, 1), old = { x: this.ball.x, y: this.ball.y };
      this.ball.x = lerp(f.start.x, f.end.x, t); this.ball.y = lerp(f.start.y, f.end.y, t);
      if (f.style === 'bounce') {
        const split = f.bounceAt;
        if (t < split) this.ball.z = 18 * (1 - (t / split) ** 2);
        else { const u = (t - split) / (1 - split); this.ball.z = u * (30 - 16 * u); }
        if (!f.bounced && t >= split) { f.bounced = true; if (t < 1) this.ball.z = 0; }
      } else this.ball.z = Math.sin(t * Math.PI) * (f.arc || 22) + lerp(f.startZ ?? 15, f.endZ ?? 0, t);
      if (f.kind === 'pass') {
        if (t > .15) for (const p of this.active(1 - f.team)) {
          if (f.interceptedBy.includes(p.id)) continue;
          const vx = this.ball.x - old.x, vy = this.ball.y - old.y;
          const q = clamp(((p.x - old.x) * vx + (p.y - old.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
          const gap = Math.hypot(p.x - old.x - q * vx, p.y - old.y - q * vy);
          const reach = f.style ? this._passReach(p) : Infinity;
          if (gap < 17 && lerp(oldZ, this.ball.z, q) <= reach) {
            f.interceptedBy.push(p.id);
            if (this.random() < .18 + p.ratings.defense / 500) {
              this._stat(p.team, p, 'steals'); this._stat(f.team, this.player(f.from), 'turnovers'); this._giveBall(p);
              this._emit('steal', `${p.name.split(' ').at(-1)} jumps the passing lane!`, { team: p.team, playerId: p.id }); return;
            }
          }
        }
        if (t >= 1) this._receivePass(f);
      } else if (t >= 1) {
        this.ball.flight = null;
        if (f.kind === 'freeThrow') this._resolveFreeThrow(f);
        else this._resolveShot(f);
      }
      return;
    }
    this.reboundWait = Math.max(0, this.reboundWait - dt);
    this.ball.x += this.ball.vx * dt; this.ball.y += this.ball.vy * dt;
    this.ball.z += this.ball.vz * dt; this.ball.vz -= 380 * dt;
    this.ball.vx *= Math.exp(-dt * 1.3); this.ball.vy *= Math.exp(-dt * 1.3);
    if (this.ball.z < 0) { this.ball.z = 0; this.ball.vz = Math.abs(this.ball.vz) > 30 ? -this.ball.vz * .48 : 0; }
    if (this.ball.x < 0 || this.ball.x > 500 || this.ball.y < 0 || this.ball.y > 940) {
      const team = this.lastTouch; this._emit('out', 'Out of bounds.', { team: 1 - team });
      if (this.ball.passTurnover && this.ball.passTurnover.team !== 1 - team)
        this._stat(this.ball.passTurnover.team, this.player(this.ball.passTurnover.from), 'turnovers');
      this._prepareInbound(1 - team, { x: clamp(this.ball.x, 25, 475), y: clamp(this.ball.y, 30, 910) }, .75,
        1 - team === this.possession ? this.shotClock : this._isFrontcourt(this.ball, 1 - team) ? 20 : 30, false); return;
    }
    if (this.reboundWait <= 0 && this.ball.z < 34) {
      const eligible = this.active().filter(p => distance(p, this.ball) < 24 + (p.ratings.rebound - 60) * .12)
        .sort((a, b) => (distance(a, this.ball) - a.ratings.rebound * .12) - (distance(b, this.ball) - b.ratings.rebound * .12));
      const winner = eligible[0];
      if (winner) {
        const shotTeam = this.ball.reboundTeam, isRebound = this.ball.isRebound;
        if (isRebound) { this._stat(winner.team, winner, 'rebounds');
          this._emit('rebound', `${winner.name.split(' ').at(-1)} ${winner.team === shotTeam ? 'keeps it alive!' : 'secures the rebound.'}`, { team: winner.team, playerId: winner.id }); }
        const rim = this.ball.rim;
        const failedPass = this.ball.passTurnover;
        if (failedPass && winner.team !== failedPass.team) {
          this._stat(failedPass.team, this.player(failedPass.from), 'turnovers');
          this._stat(winner.team, winner, 'steals');
          this._emit('steal', `${winner.name.split(' ').at(-1)} gathers the loose pass.`, { team: winner.team, playerId: winner.id });
        }
        this._giveBall(winner);
        if (isRebound && winner.team === shotTeam && rim) this.shotClock = 20;
        this.ball.isRebound = false; this.ball.reboundTeam = null;
      }
    }
  }
  _passReach(p) { return 31 + Math.max(0, (p.height || 76) - 72) * .5 + (p.jump > 0 ? 29 : 0); }
  _receivePass(f) {
    const radius = f.catchRadius || 46;
    const receivers = this.active().filter(p => distance(p, this.ball) < radius
      && (f.style !== 'lob' || p.id === f.target || this.ball.z <= this._passReach(p)))
      .sort((a, b) => distance(a, this.ball) - distance(b, this.ball));
    const receiver = receivers[0];
    if (!receiver) { this._dropPass(f); return; }
    if (receiver.team !== f.team) {
      this._stat(receiver.team, receiver, 'steals'); this._stat(f.team, this.player(f.from), 'turnovers');
      this._emit('steal', `${receiver.name.split(' ').at(-1)} takes away the pass.`, { team: receiver.team, playerId: receiver.id });
      this._giveBall(receiver); return;
    }
    if (f.style) {
      const gap = distance(receiver, this.ball), contest = this.shotInfo(receiver).contest;
      const catchChance = f.style === 'lob'
        ? clamp(.7 + (f.passing - 70) * .003 + (receiver.ratings.inside - 70) * .003
          + (receiver.ratings.handle - 70) * .0015 + ((receiver.height || 76) - 76) * .002 - contest * .28 - gap * .002, .25, .97)
        : clamp(.92 + (f.passing - 70) * .0015 + (receiver.ratings.handle - 70) * .001 - gap * .0015, .8, .995);
      if (this.random() >= catchChance) {
        this._emit('passMiss', f.style === 'lob' ? 'Could not gather the lob. Loose ball!' : 'The bounce skips through. Loose ball!', { team: f.team, playerId: receiver.id });
        this._dropPass(f); return;
      }
    }
    const height = this.ball.z;
    this._giveBall(receiver);
    if (f.style === 'lob' && receiver.id === f.target && distance(receiver, this.hoop(receiver.team)) <= f.finishRange
      && (this.practice || this.clock > 0) && this.shotClock > 0) {
      // The catch occurred within reach; only now does an actual two-point
      // attempt begin. A lob in flight can never itself count as a shot.
      receiver.actionCooldown = 0; this.ball.z = height;
      this._shoot(receiver, .65, { type: 'alley-oop' });
    }
  }
  _dropPass(f) {
    const height = this.ball.z;
    this._looseBall(this.ball.x, this.ball.y, (f.end.x - f.start.x) * .25, (f.end.y - f.start.y) * .25,
      f.style === 'lob' ? -25 : 20, false, f.team, false);
    if (f.style) { this.ball.z = height; this.ball.passTurnover = { from: f.from, team: f.team }; }
  }
  _looseBall(x, y, vx, vy, vz, rim = false, shotTeam = this.possession, isRebound = true) {
    this.ball.owner = null; this.ball.flight = null; this.ball.x = x; this.ball.y = y; this.ball.z = 32;
    this.ball.vx = vx; this.ball.vy = vy; this.ball.vz = vz; this.ball.rim = rim;
    this.ball.isRebound = isRebound; this.ball.reboundTeam = shotTeam; this.reboundWait = .12;
    this.ball.passTurnover = null;
    if (rim) this.shotClock = 20;
  }
  _resolveShot(f) {
    const p = this.player(f.shooter), defender = this.player(f.foul);
    if (f.made) {
      this.score[f.team] += f.value; this._stat(f.team, p, 'points', f.value); this._stat(f.team, p, 'fgm');
      if (f.value === 3) this._stat(f.team, p, 'threesMade');
      if (this.lastPass && this.lastPass.team === f.team && this.lastPass.to === p.id && this.elapsed - this.lastPass.time < 4)
        this._stat(f.team, this.player(this.lastPass.from), 'assists');
      this._emit('score', f.type === 'alley-oop' ? 'ALLEY-OOP!' : f.type === 'dunk' ? 'THROW IT DOWN!' : f.value === 3 ? 'THREE! Nothing but net.' : 'Bucket!',
        { team: f.team, playerId: p.id, points: f.value, shotType: f.type });
      if (defender) { this._foul(defender, p, { shooting: true, shots: 1, scored: true }); return; }
      if (this.endPending) { this._endPeriod(); return; }
      this._beginAfterScore(f);
    } else {
      this._emit('miss', f.rim ? 'Off the iron. Get the rebound!' : 'Airball. The clock keeps running.', { team: f.team, playerId: p.id });
      if (defender) { this._foul(defender, p, { shooting: true, shots: f.value }); return; }
      if (this.endPending) { this._endPeriod(); return; }
      if (!f.rim && this.shotClock <= 0) { this._turnover(f.team, 'Shot-clock violation. The shot missed the rim.'); return; }
      this._looseBall(f.end.x + f.miss.x, f.end.y + f.miss.y,
        f.miss.x * 3, -this.attackDir(f.team) * (75 + this.random() * 80), 110, f.rim, f.team);
    }
  }

  snapshot() {
    return {
      teams: this.teams, players: this.players.map(p => ({ ...p, ratings: { ...p.ratings }, stats: { ...p.stats },
        offenseProfile: { ...p.offenseProfile }, offenseRead: p.offenseRead ? copy(p.offenseRead) : null,
        attackRead: p.attackRead ? copy(p.attackRead) : null,
        defenseProfile: { ...p.defenseProfile }, defenseRead: p.defenseRead ? { ...p.defenseRead,
          target: { ...p.defenseRead.target }, observations: p.defenseRead.observations.map(o => ({ ...o })) } : null })),
      offenseFlow: this.offenseFlow ? copy(this.offenseFlow) : null, defenseHelp: copy(this.defenseHelp),
      ball: copy(this.ball), score: [...this.score], stats: this.stats.map(s => ({ ...s })),
      period: this.period, clock: this.clock, shotClock: this.shotClock, phase: this.phase, phaseTime: this.phaseTime,
      controlled: this.controlled, possession: this.possession, possessionEpoch: this.possessionEpoch,
      possessionChangedAt: this.possessionChangedAt, shootGraceUntil: this.shootGraceUntil,
      human: this.human, teamFouls: [...this.teamFouls],
      timeouts: [...this.timeouts], offense: [...this.offense], defense: [...this.defense],
      freeThrows: this.freeThrows ? { ...this.freeThrows } : null, shotFeedback: this.shotFeedback ? { ...this.shotFeedback } : null,
      afterScore: this.afterScore ? { ...this.afterScore, hoop: { ...this.afterScore.hoop } } : null,
      lastEvent: this.lastEvent ? { ...this.lastEvent } : null, playTime: this.playTime, elapsed: this.elapsed,
      winner: this.winner, practice: this.practice, attackDirs: [this.attackDir(0), this.attackDir(1)],
      halfSeconds: this.halfSeconds, endPending: this.endPending,
      pendingSubs: this.pendingSubs.map(s => ({ ...s })),
    };
  }
}
