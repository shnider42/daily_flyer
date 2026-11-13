/**
 * Pocket Baseball: deterministic, headless rules and ball simulation.
 * World units are metres. Home is (0, 0, 0), +z is centre field, +x is first.
 * Input and snapshots are deliberately independent from the browser renderer.
 */
export const STEP = 1 / 120;
export const BALL_RADIUS = 0.037;
export const FENCE_HEIGHT = 3.2;
export const BASE_DISTANCE = Math.hypot(19.4, 19.4);
export const BASES = Object.freeze([
  { x: 0, y: 0, z: 0 }, { x: 19.4, y: 0, z: 19.4 },
  { x: 0, y: 0, z: 38.8 }, { x: -19.4, y: 0, z: 19.4 },
  { x: 0, y: 0, z: 0 },
]);
export const STRIKE_ZONE = Object.freeze({ left: -0.235, right: 0.235, bottom: 0.50, top: 1.45 });
export const AIM_AREA = Object.freeze({ x: 0.65, y: 0.70, centerY: 1.0 });
export const PITCHES = Object.freeze({
  fastball: { label: 'Four-seam', mph: 94, breakX: 0.04, breakY: 0.06 },
  changeup: { label: 'Changeup', mph: 81, breakX: 0.16, breakY: 0.16 },
  curveball: { label: 'Curveball', mph: 76, breakX: -0.18, breakY: 0.44 },
  slider: { label: 'Slider', mph: 86, breakX: -0.36, breakY: 0.12 },
  sinker: { label: 'Sinker', mph: 91, breakX: 0.25, breakY: 0.24, shape: 'late' },
  cutter: { label: 'Cutter', mph: 90, breakX: -0.17, breakY: 0.07, shape: 'late' },
  splitter: { label: 'Splitter', mph: 84, breakX: 0.05, breakY: 0.57, shape: 'late' },
  knuckleball: { label: 'Knuckleball', mph: 68, breakX: 0.02, breakY: 0.12, shape: 'flutter' },
});
/** Fictional gameplay profiles; repertoire and ratings are intentionally game balance. */
export const PITCHERS = Object.freeze({
  balanced: { id: 'balanced', name: 'All-round starter', label: 'Balanced', description: 'Four familiar pitches and dependable command.', pitches: ['fastball', 'changeup', 'curveball', 'slider'], velocity: {}, weights: { fastball: 0.46, changeup: 0.21, curveball: 0.17, slider: 0.16 }, control: 1 },
  power: { id: 'power', name: 'Power pitcher', label: 'Power', description: 'A harder fastball, cutter and slider, with a splitter below the zone.', pitches: ['fastball', 'slider', 'cutter', 'splitter'], velocity: { fastball: 97, slider: 88, cutter: 93, splitter: 86 }, weights: { fastball: 0.48, slider: 0.24, cutter: 0.14, splitter: 0.14 }, control: 0.88 },
  movement: { id: 'movement', name: 'Movement specialist', label: 'Movement', description: 'Sinker, changeup, curve and cutter. Change the shape and eye level.', pitches: ['sinker', 'changeup', 'curveball', 'cutter'], velocity: {}, weights: { sinker: 0.42, changeup: 0.22, curveball: 0.20, cutter: 0.16 }, control: 0.96 },
  knuckle: { id: 'knuckle', name: 'Knuckleball specialist', label: 'Knuckleball', description: 'A dancing knuckler, an 82 mph fastball and a changeup. Limited repertoire; imperfect command and hanging pitches are the tradeoff.', pitches: ['knuckleball', 'fastball', 'changeup'], velocity: { knuckleball: 68, fastball: 82, changeup: 74 }, weights: { knuckleball: 0.73, fastball: 0.17, changeup: 0.10 }, control: 0.83 },
});
export const FIELDING_POSITIONS = Object.freeze([
  { id: 'P', role: 'P', x: 0, z: 18.44, speed: 6.7 },
  { id: 'C', role: 'C', x: 0, z: -2.1, speed: 5.8 },
  { id: '1B', role: '1B', x: 18.5, z: 22, speed: 6.6 },
  { id: '2B', role: '2B', x: 11.5, z: 34, speed: 7.2 },
  { id: 'SS', role: 'SS', x: -12.5, z: 33, speed: 7.4 },
  { id: '3B', role: '3B', x: -22, z: 18, speed: 6.9 },
  { id: 'LF', role: 'LF', x: -43, z: 66, speed: 7.3 },
  { id: 'CF', role: 'CF', x: 0, z: 79, speed: 7.7 },
  { id: 'RF', role: 'RF', x: 43, z: 66, speed: 7.3 },
]);
const DIFFICULTIES = Object.freeze({
  rookie: { timing: 0.205, reachX: 0.63, reachY: 0.69, pitchScale: 1.15, aiTiming: 0.14, aiAim: 0.34, aiTake: 0.80 },
  club: { timing: 0.155, reachX: 0.46, reachY: 0.53, pitchScale: 1, aiTiming: 0.080, aiAim: 0.20, aiTake: 0.82 },
  pro: { timing: 0.12, reachX: 0.36, reachY: 0.43, pitchScale: 0.92, aiTiming: 0.060, aiAim: 0.15, aiTake: 0.87 },
});
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const lerp = (a, b, t) => a + (b - a) * t;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const aimWorld = aim => ({ x: clamp(finite(aim?.x), -1, 1) * AIM_AREA.x, y: AIM_AREA.centerY + clamp(finite(aim?.y), -1, 1) * AIM_AREA.y, z: 0 });
const worldAim = target => ({ x: target.x / AIM_AREA.x, y: (target.y - AIM_AREA.centerY) / AIM_AREA.y });

export function fieldRadius(angle) { return 105 + 10 * Math.cos(2 * angle); }
export const wallRadius = fieldRadius;
export function isFair(x, z) { return z >= 0 && Math.abs(x) <= z + 1e-8; }
export function inStrikeZone(point) {
  return point.x + BALL_RADIUS >= STRIKE_ZONE.left && point.x - BALL_RADIUS <= STRIKE_ZONE.right &&
    point.y + BALL_RADIUS >= STRIKE_ZONE.bottom && point.y - BALL_RADIUS <= STRIKE_ZONE.top;
}

/** First intersection of two swept spheres, including an initial overlap. */
export function sweptSphereTime(a, b, c, d, radius) {
  const rx = a.x - c.x, ry = a.y - c.y, rz = a.z - c.z;
  const vx = b.x - a.x - (d.x - c.x), vy = b.y - a.y - (d.y - c.y), vz = b.z - a.z - (d.z - c.z);
  const cc = rx * rx + ry * ry + rz * rz - radius * radius;
  if (cc <= 0) return 0;
  const aa = vx * vx + vy * vy + vz * vz;
  if (aa < 1e-12) return null;
  const bb = 2 * (rx * vx + ry * vy + rz * vz), discriminant = bb * bb - 4 * aa * cc;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}

export function pitchPosition(pitch, absoluteTime) {
  const t = (absoluteTime - pitch.releaseAt) / pitch.duration;
  const progress = clamp(t, 0, 1), envelope = Math.sin(Math.PI * progress);
  const bend = envelope * (pitch.shape === 'late' ? 0.35 + 0.9 * progress : 1);
  const flutter = pitch.flutter;
  const dx = flutter ? envelope * flutter.amplitude * (Math.sin(progress * 8 * Math.PI + flutter.phaseX) * 0.72 + Math.sin(progress * 13 * Math.PI + flutter.phaseY) * 0.28) : 0;
  const dy = flutter ? envelope * flutter.amplitude * (Math.sin(progress * 7 * Math.PI + flutter.phaseY) * 0.55 + Math.sin(progress * 11 * Math.PI + flutter.phaseX) * 0.25) : 0;
  return {
    x: lerp(pitch.start.x, pitch.target.x, t) + bend * pitch.breakX + dx,
    y: lerp(pitch.start.y, pitch.target.y, t) + bend * pitch.breakY + dy,
    z: lerp(pitch.start.z, 0, t),
  };
}

export class BaseballGame {
  constructor(options = {}) {
    const difficulty = DIFFICULTIES[options.difficulty] ? options.difficulty : 'rookie';
    this.options = {
      seed: (finite(options.seed, 2003) >>> 0) || 2003,
      innings: [3, 6, 9].includes(options.innings) ? options.innings : 3,
      mode: options.mode === 'practice' ? 'practice' : 'exhibition', difficulty,
      guidance: ['simple', 'moderate', 'expert'].includes(options.guidance) ? options.guidance : 'simple',
      pitcher: PITCHERS[options.pitcher] ? options.pitcher : 'balanced',
      opponentPitcher: PITCHERS[options.opponentPitcher] ? options.opponentPitcher : 'balanced',
      humanSides: Array.isArray(options.humanSides) ? [...new Set(options.humanSides.filter(side => side === 0 || side === 1))] : [0],
      localSide: options.localSide === 1 ? 1 : 0,
      inputWindow: clamp(finite(options.inputWindow, 0.1), 0.1, 0.25),
      scenario: options.mode === 'practice' && options.scenario === 'runners' ? 'runners' : null,
    };
    this._accumulator = 0;
    this._events = [];
    this.lastRejection = null;
    this.state = {
      version: 1, options: { ...this.options }, rng: this.options.seed, time: 0, tick: 0,
      phase: 'ready', phaseTime: 0, phaseStartedAt: 0, inning: 1, half: 'top',
      outs: 0, balls: 0, strikes: 0, bases: [null, null, null], score: [0, 0], hits: [0, 0],
      lineScore: [[0], [0]], battingSide: 0, batterIndex: [0, 0], nextRunnerId: 1, nextPitchId: 1,
      ball: { x: 0, y: 1.85, z: 18.44, prevX: 0, prevY: 1.85, prevZ: 18.44, vx: 0, vy: 0, vz: 0, visible: false, bounced: false },
      pitch: null, swing: null, play: null, result: null, lastContact: null,
      fielders: this._newFielders(), runners: [], pending: null,
      pickoffAttempts: 0, readyActionChecked: false,
      practice: { pitches: 0, swings: 0, contacts: 0, hits: 0, homeRuns: 0, bestDistance: 0 },
    };
    if (this.options.scenario === 'runners') this._setupRunningPractice();
  }

  get isBatting() { return this.options.mode === 'practice' || this.state.battingSide === this.options.localSide; }
  get isHumanBatting() { return this.options.mode === 'practice' || this.options.humanSides.includes(this.state.battingSide); }
  get isHumanFielding() { return this.options.mode !== 'practice' && this.options.humanSides.includes(1 - this.state.battingSide); }
  _commandIsBatting(input) { return (input.side ?? this.options.localSide) === this.state.battingSide; }
  get interpolationAlpha() { return this._accumulator / STEP; }
  get difficulty() { return DIFFICULTIES[this.options.difficulty]; }
  get activePitcher() { return PITCHERS[this.state.battingSide === 0 ? this.options.opponentPitcher : this.options.pitcher] || PITCHERS.balanced; }
  get availablePitches() { return [...this.activePitcher.pitches]; }
  resetClock() { this._accumulator = 0; }

  _setupRunningPractice() {
    const s = this.state;
    const first = { ...this._runner(), number: 7, speed: 7.2 }, third = { ...this._runner(), number: 9, speed: 7.0 };
    s.bases = [first, null, third];
    s.runners = [this._liveRunner(first, 1), this._liveRunner(third, 3)];
  }

  _syncPreRunners() {
    const s = this.state;
    s.runners = s.bases.flatMap((baseRunner, i) => {
      if (!baseRunner) return [];
      const runner = s.runners.find(r => r.id === baseRunner.id && !r.out);
      return [runner || this._liveRunner(baseRunner, i + 1)];
    });
  }

  _leadCommand(input) {
    const s = this.state;
    if (s.phase !== 'ready') return this._reject('Set your lead before the pitcher starts the delivery.');
    this._syncPreRunners();
    const runner = s.runners.find(r => r.id === input.runnerId);
    if (!runner || runner.stealing) return this._reject('Choose a runner holding a base.');
    let amount = input.amount;
    if (input.action === 'extend') amount = Math.min(2, (runner.leadLevel || 0) + 1);
    if (input.action === 'shorten') amount = Math.max(0, (runner.leadLevel || 0) - 1);
    if (!Number.isInteger(amount) || amount < 0 || amount > 2) return this._reject('Choose an on-base, normal or aggressive lead.');
    runner.leadLevel = amount; runner.leadDistance = [0, 2.4, 4.8][amount];
    this._event('lead', { runnerId: runner.id, level: amount });
    return true;
  }

  _stealCommand(input) {
    const s = this.state;
    if (!['ready', 'windup', 'pitch'].includes(s.phase)) return this._reject('Call the steal before or during the pitch.');
    this._syncPreRunners();
    const runner = s.runners.find(r => r.id === input.runnerId && !r.out && !r.scored);
    if (!runner || runner.fromBase < 1 || runner.fromBase > 3) return this._reject('Choose a runner on first, second or third.');
    if (runner.stealing) return this._reject('The runner is already going. Use RETURN when the throw is live.');
    if (s.phase === 'ready' && (input.action === 'cancel' || runner.stealQueued)) {
      runner.stealQueued = false; this._event('steal-cancel', { runnerId: runner.id }); return true;
    }
    const occupied = s.runners.find(r => r.id !== runner.id && !r.out && r.fromBase === runner.fromBase + 1);
    if (occupied && !occupied.stealQueued && !occupied.stealing) return this._reject('Advance the lead runner before stealing into an occupied base.');
    if (s.phase === 'ready') {
      runner.stealQueued = true;
      this._event('steal-queued', { runnerId: runner.id, base: runner.fromBase + 1 });
    } else this._beginSteal(runner, s.time + 0.12);
    return true;
  }

  _beginSteal(runner, reactionAt) {
    const s = this.state;
    runner.stealQueued = false; runner.stealing = true; runner.manual = true;
    runner.targetBase = Math.min(4, runner.fromBase + 1); runner.reactionAt = reactionAt; runner.safe = false;
    runner.stealStartedAt = reactionAt;
    this._event('steal', { runnerId: runner.id, base: runner.targetBase });
  }

  _updatePreRunners() {
    const s = this.state;
    this._syncPreRunners();
    const ordered = [...s.runners].sort((a, b) => b.fromBase - a.fromBase);
    for (const runner of ordered) {
      runner.prevX = runner.x; runner.prevZ = runner.z; runner.prevPathPosition = runner.pathPosition;
      let destination = runner.stealing ? runner.targetBase : runner.fromBase + (runner.leadDistance || 0) / BASE_DISTANCE;
      if (runner.reactionAt > s.time) destination = runner.pathPosition;
      const direction = Math.sign(destination - runner.pathPosition), amount = runner.speed * STEP / BASE_DISTANCE;
      let next = runner.pathPosition + direction * Math.min(amount, Math.abs(destination - runner.pathPosition));
      const lead = ordered.find(r => r.fromBase > runner.fromBase && !r.scored);
      if (direction > 0 && lead) next = Math.min(next, Math.max(runner.pathPosition, lead.pathPosition - 0.045));
      runner.pathPosition = clamp(next, runner.fromBase, 4);
      if (runner.stealing && Math.abs(runner.pathPosition - runner.targetBase) < 1e-8) {
        runner.base = runner.targetBase; runner.highestBase = Math.max(runner.highestBase, runner.base);
        runner.touchedAt[runner.base] ??= s.time;
        if (runner.base === 4) { runner.scored = true; runner.scoredAt ??= s.time; }
      }
      const index = Math.min(3, Math.floor(runner.pathPosition)), fraction = runner.pathPosition - index;
      runner.x = lerp(BASES[index].x, BASES[index + 1].x, fraction); runner.z = lerp(BASES[index].z, BASES[index + 1].z, fraction);
      runner.progress = runner.pathPosition - runner.fromBase;
      runner.safe = Math.abs(runner.pathPosition - Math.round(runner.pathPosition)) < 1e-8;
      runner.sliding = runner.stealing && !runner.safe && Math.abs(runner.targetBase - runner.pathPosition) < 0.075;
    }
  }

  _cpuRunningDecisions() {
    const s = this.state;
    if (!s.runners.length) return;
    if (!this.isHumanBatting && !s.cpuRunnerChecked && s.phaseTime >= 0.45) {
      s.cpuRunnerChecked = true;
      for (const runner of [...s.runners].sort((a, b) => b.fromBase - a.fromBase)) {
        runner.leadLevel = this._random() < 0.24 ? 2 : 1;
        runner.leadDistance = [0, 2.4, 4.8][runner.leadLevel];
        const occupied = s.bases[runner.fromBase];
        // Stealing home is exceptional; the CPU usually saves the risk for second.
        const chance = runner.fromBase === 1 ? 0.24 : runner.fromBase === 2 ? 0.10 : 0.012;
        if (!occupied && this._random() < chance) runner.stealQueued = true;
      }
    }
    if (!this.isHumanFielding && !s.readyActionChecked && s.phaseTime >= 2.55) {
      s.readyActionChecked = true;
      const candidate = [...s.runners].sort((a, b) => b.leadLevel - a.leadLevel || a.fromBase - b.fromBase)[0];
      if ((s.pickoffAttempts || 0) < 2 && candidate?.leadLevel > 0 && this._random() < (candidate.leadLevel === 2 ? 0.48 : 0.08)) this._startPickoff(candidate.fromBase);
    }
  }

  _pickoffCommand(input) {
    const s = this.state, base = input.base;
    if (s.phase !== 'ready') return this._reject('A pickoff must start before the delivery.');
    if (!Number.isInteger(base) || base < 1 || base > 3 || !s.bases[base - 1]) return this._reject('Choose an occupied base for the pickoff.');
    if ((s.pickoffAttempts || 0) >= 2) return this._reject('Two pickoff attempts used for this batter. Deliver a pitch.');
    this._syncPreRunners(); this._startPickoff(base); return true;
  }

  _startPickoff(base) {
    const s = this.state;
    s.pickoffAttempts = (s.pickoffAttempts || 0) + 1;
    this._beginRunningPlay('pickoff', null, base);
    this._event('pickoff', { base, attempts: s.pickoffAttempts });
  }

  _beginRunningPlay(kind, pitchCall = null, pickoffBase = null) {
    const s = this.state;
    s.play = {
      kind, stage: 'held', fair: true, hitAt: s.time, age: 0, initialBases: clone(s.bases), initialOuts: s.outs,
      batter: null, outs: [], runCrossings: s.runners.filter(r => r.scored).map(r => ({ runnerId: r.id, time: r.scoredAt })),
      maxDistance: 0, ballKind: 'running', fielder: kind === 'pickoff' ? 'P' : 'C', heldAt: s.time,
      possessionAt: s.time, throw: null, throwBase: null, queuedBase: null, receiver: null,
      throwReadyAt: s.time + 0.18, transferUntil: null, decisionUntil: s.time + 1.8,
      lastActionAt: s.time, coverBase: kind === 'steal' ? 4 : null, recommendedBase: null, pitchCall,
    };
    for (const runner of s.runners) {
      runner.forcedBase = null;
      if (!runner.stealing || kind === 'pickoff') {
        runner.targetBase = runner.fromBase; runner.manual = false; runner.stealQueued = false;
        // A larger lead costs real return distance and a slower first reaction.
        runner.reactionAt = kind === 'pickoff' ? s.time + (runner.leadLevel === 2 ? 0.48 : 0.20) : s.time;
      }
    }
    this._phase('live');
    const holder = s.fielders.find(f => f.id === s.play.fielder);
    this._fieldBall(holder);
    s.play.coverBase = kind === 'steal' ? 4 : null;
    if (kind === 'pickoff') this._prepareThrow(pickoffBase);
    else if (!this.isHumanFielding) {
      const target = this._recommendBase(); if (target) this._prepareThrow(target);
    }
    this._event('running-play', { kind });
  }

  _finishRunningPlay() {
    const s = this.state, p = s.play, before = s.score[s.battingSide];
    const third = s.outs >= 3 ? p.outs.at(-1) : null;
    for (const crossing of p.runCrossings) {
      if (third && crossing.time >= third.time - 1e-9) continue;
      const runner = s.runners.find(r => r.id === crossing.runnerId && !r.out);
      if (runner) this._scoreRun(runner);
    }
    const bases = [null, null, null];
    for (const runner of s.runners) {
      if (runner.out || runner.scored) continue;
      const base = Math.round(runner.pathPosition);
      if (base >= 1 && base <= 3 && !bases[base - 1]) bases[base - 1] = { id: runner.id, number: runner.number, side: runner.side, speed: runner.speed };
    }
    s.bases = this.options.mode === 'practice' ? [null, null, null] : bases;
    const advanced = s.runners.filter(r => !r.out && r.highestBase > r.fromBase);
    const outs = p.outs.length, runs = s.score[s.battingSide] - before;
    const title = p.kind === 'pickoff' ? (outs ? 'Picked off!' : 'Back safely') : outs ? 'Caught stealing' : advanced.length ? 'Stolen base' : 'Runner holds';
    const detail = [p.pitchCall?.detail, ...p.outs.map(out => `Out at ${this._baseName(out.base)} (${out.type})`),
      ...advanced.map(r => `Runner ${r.number} reaches ${this._baseName(r.highestBase)}`), runs ? `${runs} run${runs === 1 ? '' : 's'} score` : ''].filter(Boolean).join(' · ');
    const next = s.outs >= 3 ? this._halfEndDecision() : this._isWalkoff() ? 'final' : p.pitchCall?.next || 'pitch';
    this._complete(title, detail || 'Runner returns to the bag. The count is unchanged.', p.kind === 'pickoff' ? (outs ? 'pickoff' : 'pickoffSafe') : outs ? 'caughtStealing' : advanced.length ? 'stolenBase' : p.pitchCall?.kind || 'runnerHold', next, { runs, outsOnPlay: outs });
  }

  _catchFly(fielder, time) {
    const s = this.state, p = s.play, batter = s.runners.find(r => r.id === p.batter.id);
    p.foulCatch = !p.fair; p.fair = true;
    p.caught = true; p.catchAt = time; p.catchFielder = fielder.id;
    this._fieldBall(fielder);
    for (const runner of s.runners) {
      if (runner === batter || runner.out) continue;
      runner.tagRequired = Math.abs(runner.pathPosition - runner.fromBase) > 1e-8;
      runner.tagReady = !runner.tagRequired; runner.taggedAt = runner.tagReady ? time : null;
      const cpuAdvance = !this.isHumanBatting && (runner.fromBase === 3 && p.maxDistance > 96 || runner.fromBase === 2 && p.maxDistance > 105);
      runner.tagQueued = (runner.manual && runner.targetBase > runner.fromBase) || cpuAdvance;
      runner.tagDestination = runner.tagQueued ? Math.min(4, Math.max(runner.fromBase + 1, runner.targetBase)) : null;
      runner.targetBase = runner.tagRequired ? runner.fromBase : runner.tagQueued ? runner.tagDestination : runner.fromBase;
      runner.manual = true; runner.forcedBase = null;
      if (runner.tagReady) runner.tagQueued = false;
    }
    this._event('catch', { fielder: fielder.id, tagUp: s.runners.some(r => r !== batter && !r.out) });
    this._retireRunner(batter, 1, 'catch', time);
    if (s.phase === 'live') {
      p.decisionUntil = Math.max(p.decisionUntil, s.time + (this.isHumanBatting ? 2.4 : 1.0));
      p.lastCall = { title: 'Caught', detail: 'Tag the starting base before advancing.', time };
      if (s.runners.every(r => r.out || r.scored)) this._finishLive();
    }
  }

  _newFielders() {
    return FIELDING_POSITIONS.map(p => ({ ...p, y: 0, prevX: p.x, prevZ: p.z, target: { x: p.x, z: p.z }, hasBall: false }));
  }
  _random() {
    let n = this.state.rng >>> 0;
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    this.state.rng = n >>> 0;
    return this.state.rng / 4294967296;
  }
  _centered() { return this._random() + this._random() + this._random() - 1.5; }
  _event(type, data = {}) { this._events.push({ type, time: this.state.time, tick: this.state.tick, ...data }); }
  drainEvents() { const events = this._events; this._events = []; return events; }
  snapshot() { return clone({ version: 1, state: this.state, accumulator: this._accumulator }); }
  restore(snapshot) {
    if (snapshot?.version !== 1 || snapshot?.state?.version !== 1 || !snapshot.state.options || !Number.isFinite(snapshot.state.time)) throw new Error('Unsupported baseball snapshot');
    this.state = clone(snapshot.state);
    this.state.nextPitchId = finite(this.state.nextPitchId, finite(this.state.pitch?.id, 0) + 1);
    this.options = { humanSides: [0], localSide: 0, inputWindow: 0.1, scenario: null, ...this.state.options };
    this.state.options = { ...this.options };
    this._accumulator = clamp(finite(snapshot.accumulator), 0, STEP);
    this._events = [];
    this.lastRejection = null;
    if (this.state.phase === 'live') this._normaliseLive();
    return this;
  }
  _phase(phase) { this.state.phase = phase; this.state.phaseStartedAt = this.state.time; this.state.phaseTime = 0; }
  _reject(reason) { this.lastRejection = reason; return false; }

  command(input = {}) {
    const s = this.state;
    this.lastRejection = null;
    if (input.side !== undefined && (input.side !== 0 && input.side !== 1 || !this.options.humanSides.includes(input.side))) return this._reject('That player does not control a side in this game.');
    const battingCommand = ['swing', 'run', 'lead', 'steal'].includes(input.type);
    const fieldingCommand = ['pitch', 'throw', 'pickoff'].includes(input.type);
    if (battingCommand && !this._commandIsBatting(input) || fieldingCommand && this._commandIsBatting(input)) return this._reject('That action belongs to the other side.');
    // A transport can bind a command to the pitch the player actually saw.
    // Unscoped commands remain convenient for local play; IDs survive snapshots.
    if (input.pitchId !== undefined) {
      const expected = s.phase === 'ready' ? s.nextPitchId : s.pitch?.id ?? s.nextPitchId;
      if (!Number.isInteger(input.pitchId) || input.pitchId !== expected) return this._reject('This command belongs to a different pitch.');
    }
    if (input.type === 'next') {
      if (s.phase === 'result') {
        if (s.pending === 'half') { this._phase('half'); this._event('half', { inning: s.inning, half: s.half }); }
        else if (s.pending === 'final') this._final();
        else this._ready();
        return true;
      }
      if (s.phase === 'half') { this._nextHalf(); return true; }
      return this._reject('There is no completed play to advance.');
    }
    if (input.type === 'pitch') {
      if (s.phase !== 'ready' || this._commandIsBatting(input)) return this._reject('Wait until your pitcher is ready.');
      if (!PITCHES[input.pitchType]) return this._reject('Unknown pitch.');
      if (!this.availablePitches.includes(input.pitchType)) return this._reject('That pitch is not in this pitcher’s repertoire.');
      this._startPitch(input.pitchType, aimWorld(input.aim), clamp(finite(input.quality, 0.5), 0, 1));
      return true;
    }
    if (input.type === 'swing') {
      if (!this._commandIsBatting(input) || !['windup', 'pitch'].includes(s.phase) || s.swing) return this._reject('A swing is not available.');
      const time = finite(input.time, s.time);
      // The transport may provide a smaller measured budget; the engine enforces its configured hard limit.
      if (time < s.time - this.options.inputWindow - 0.000001 || time > s.time + 0.025 || time < s.pitch.releaseAt - 0.65) return this._reject('Swing timestamp is outside the local input window.');
      s.swing = { time, power: Boolean(input.power), aim: { x: clamp(finite(input.aim?.x), -1, 1), y: clamp(finite(input.aim?.y), -1, 1) } };
      if (this.options.mode === 'practice') s.practice.swings++;
      this._event('swing', { power: s.swing.power });
      if (s.time >= s.pitch.contactAt) this._evaluateSwing();
      return true;
    }
    if (input.type === 'throw') {
      if (this._commandIsBatting(input) || s.phase !== 'live' || !['flight', 'held', 'throw'].includes(s.play?.stage)) return this._reject('There is no live defensive play.');
      const base = input.base ?? 1;
      if (!Number.isInteger(base) || base < 1 || base > 4) return this._reject('Choose first, second, third or home.');
      if (s.play.stage === 'held' && s.play.transferUntil && s.play.throwBase === base) return true;
      s.play.queuedBase = base; s.play.lastActionAt = s.time;
      if (s.play.stage === 'held' && s.time >= s.play.throwReadyAt) this._prepareThrow(base);
      return true;
    }
    if (input.type === 'run') return this._runCommand(input);
    if (input.type === 'lead') return this._leadCommand(input);
    if (input.type === 'steal') return this._stealCommand(input);
    if (input.type === 'pickoff') return this._pickoffCommand(input);
    return this._reject('Unknown command.');
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // The caller can pause rather than simulating a background-tab backlog.
    this._accumulator += Math.min(dt, 0.25);
    while (this._accumulator + 1e-10 >= STEP) {
      this._accumulator = Math.max(0, this._accumulator - STEP);
      this._tick();
    }
  }

  _tick() {
    const s = this.state, b = s.ball;
    s.tick++; s.time = s.tick * STEP; s.phaseTime = s.time - s.phaseStartedAt;
    b.prevX = b.x; b.prevY = b.y; b.prevZ = b.z;
    for (const f of s.fielders) { f.prevX = f.x; f.prevZ = f.z; }
    if (['ready', 'windup', 'pitch'].includes(s.phase)) this._updatePreRunners();
    if (s.phase === 'ready') {
      this._cpuRunningDecisions();
      if (s.phase === 'ready' && !this.isHumanFielding && s.phaseTime >= (s.bases.some(Boolean) ? 4 : 1.6)) this._cpuPitch();
    }
    else if (s.phase === 'windup') {
      if (s.time + 1e-9 >= s.pitch.releaseAt) {
        this._phase('pitch'); b.visible = true;
        this._event('pitch', { pitchId: s.pitch.id, pitchType: s.pitch.type, mph: s.pitch.mph });
      }
    } else if (s.phase === 'pitch') this._tickPitch();
    else if (s.phase === 'live') this._tickLive();
  }

  _cpuPitch() {
    const s = this.state, practice = this.options.mode === 'practice';
    const choice = this._random(), pitcher = this.activePitcher;
    let type = pitcher.pitches[0];
    if (practice && pitcher.id === 'balanced') type = choice < 0.80 ? 'fastball' : 'changeup';
    else {
      let total = 0;
      for (const key of pitcher.pitches) { total += pitcher.weights[key]; if (choice <= total) { type = key; break; } }
    }
    const strike = practice || this._random() < (s.balls === 3 ? 0.85 : 0.68);
    const target = strike
      ? { x: this._centered() * (practice ? 0.11 : 0.18), y: 1.0 + this._centered() * (practice ? 0.16 : 0.32), z: 0 }
      : { x: (this._random() > 0.5 ? 1 : -1) * (0.31 + this._random() * 0.24), y: 0.65 + this._random() * 0.85, z: 0 };
    this._startPitch(type, target, 0.82 + this._random() * 0.17, true);
  }

  _startPitch(type, intendedTarget, quality, cpu = false) {
    const s = this.state, profile = PITCHES[type], pitcher = this.activePitcher;
    const knuckle = type === 'knuckleball';
    const miss = (1 - quality) * (type === 'fastball' ? 0.51 : 0.65) / pitcher.control + (knuckle ? 0.14 : 0);
    const target = { ...intendedTarget };
    target.x += this._centered() * miss;
    target.y += this._centered() * miss;
    // A poorly released breaking pitch can hang; a bad fastball loses velocity.
    if (!cpu && type !== 'fastball' && quality < 0.45) target.y = lerp(target.y, 1.16, (0.45 - quality) * 1.5);
    target.y = clamp(target.y, 0.15, 2.0);
    const mph = Math.round((pitcher.velocity[type] || profile.mph) + this._centered() * 2 - (type === 'fastball' ? (1 - quality) * 7 : (1 - quality) * 3));
    let flutter = null, hanging = false;
    if (knuckle) {
      hanging = this._random() < 0.07 + Math.pow(1 - quality, 1.65) * 0.68;
      flutter = { amplitude: hanging ? 0.028 : 0.20 + quality * 0.08, phaseX: this._random() * Math.PI * 2, phaseY: this._random() * Math.PI * 2 };
      if (hanging) { target.x = lerp(target.x, 0, 0.78); target.y = lerp(target.y, 1.17, 0.84); }
    }
    const duration = 0.86 * (94 / mph) * this.difficulty.pitchScale;
    const releaseAt = s.time + 0.65;
    s.pitch = {
      id: s.nextPitchId++, type, mph, quality, target, intendedTarget: { ...intendedTarget }, start: { x: -0.32, y: 1.88, z: 18.44 },
      pitcherId: pitcher.id, shape: profile.shape || 'standard', flutter, execution: { hanging },
      breakX: profile.breakX * (0.55 + quality * 0.45), breakY: profile.breakY * (0.55 + quality * 0.45),
      duration, elapsed: 0, releaseAt, contactAt: releaseAt + duration, resolved: false, aiSwing: null,
    };
    s.swing = null; s.result = null; s.pending = null; s.play = null;
    Object.assign(s.ball, { x: -0.32, y: 1.88, z: 18.44, prevX: -0.32, prevY: 1.88, prevZ: 18.44, visible: false, bounced: false, vx: 0, vy: 0, vz: 0 });
    if (!this.isHumanBatting) {
      const strike = inStrikeZone(target), willSwing = this._random() < (strike ? 0.86 : 1 - this.difficulty.aiTake);
      const reading = knuckle ? (hanging ? 0.78 : 1.28) : 1;
      if (willSwing) s.pitch.aiSwing = {
        time: s.pitch.contactAt + this._centered() * this.difficulty.aiTiming * 2.2 * reading,
        power: this._random() < 0.20,
        aim: { x: clamp(target.x / AIM_AREA.x + this._centered() * this.difficulty.aiAim * 2 * reading, -1, 1), y: clamp((target.y - AIM_AREA.centerY) / AIM_AREA.y + this._centered() * this.difficulty.aiAim * 2 * reading, -1, 1) },
      };
    }
    if (this.options.mode === 'practice') s.practice.pitches++;
    this._phase('windup');
    for (const runner of s.runners) if (runner.stealQueued) this._beginSteal(runner, s.time + 0.10);
    this._event('windup', { pitchId: s.pitch.id, pitchType: type });
  }

  _tickPitch() {
    const s = this.state, p = s.pitch;
    p.elapsed = Math.max(0, s.time - p.releaseAt);
    // The catcher receives the rendered ball while the bounded input deadline
    // remains open; it must not fly through the camera during that grace period.
    Object.assign(s.ball, pitchPosition(p, Math.min(s.time, p.contactAt + 0.10)));
    s.ball.visible = s.time <= p.contactAt + 0.12;
    if (p.aiSwing && !s.swing && s.time >= p.aiSwing.time) {
      s.swing = { ...p.aiSwing }; this._event('swing', { power: s.swing.power, cpu: true });
    }
    if (s.swing && !p.resolved && s.time + 1e-9 >= Math.max(p.contactAt, s.swing.time)) this._evaluateSwing();
    if (s.phase !== 'pitch') return;
    // Preserve the complete late timing window plus the local delivery budget.
    // Resolving sooner would silently make an advertised symmetric window early-biased.
    const deadline = p.contactAt + (this.isHumanBatting ? this.difficulty.timing + this.options.inputWindow + 0.001 : 0.26);
    if (!p.resolved && s.time >= deadline) {
      p.resolved = true;
      this._calledPitch(inStrikeZone(p.target), false);
    }
  }

  _evaluateSwing() {
    const s = this.state, p = s.pitch, swing = s.swing;
    if (!p || p.resolved || !swing || s.phase !== 'pitch') return;
    p.resolved = true;
    const aim = aimWorld(swing.aim), timing = swing.time - p.contactAt;
    const isHuman = this.isHumanBatting;
    const profile = isHuman ? this.difficulty : DIFFICULTIES.club;
    const window = profile.timing * (swing.power ? 0.76 : 1);
    const spatial = Math.hypot((p.target.x - aim.x) / profile.reachX, (p.target.y - aim.y) / profile.reachY);
    if (Math.abs(timing) > window || spatial > 1.16) {
      s.lastContact = { timing, timingLabel: Math.abs(timing) > window ? (timing < 0 ? 'Too early' : 'Too late') : 'Missed location', quality: 0, exitVelocity: 0 };
      this._calledPitch(true, true);
      return;
    }
    const timingQuality = Math.max(0, 1 - Math.abs(timing) / window);
    const quality = clamp(timingQuality * 0.66 + Math.max(0, 1 - spatial / 1.16) * 0.34, 0, 1);
    const angle = clamp((timing / window) * 1.23 + this._centered() * 0.13 + (aim.x - p.target.x) * 0.28, -1.45, 1.45);
    const verticalDifference = p.target.y - aim.y;
    const launchAngle = clamp(0.17 + verticalDifference * 1.40 + this._centered() * 0.22 + (swing.power ? 0.18 : 0), -0.20, 1.08);
    const speed = 19 + quality * 27 + (swing.power ? 5.5 : 0) + this._centered() * 2;
    const horizontal = speed * Math.cos(launchAngle);
    Object.assign(s.ball, {
      ...p.target, z: 0.18, prevX: p.target.x, prevY: p.target.y, prevZ: 0.18,
      vx: Math.sin(angle) * horizontal, vy: Math.sin(launchAngle) * speed, vz: Math.cos(angle) * horizontal,
      bounced: false, visible: true,
    });
    const label = Math.abs(timing) < 0.035 ? 'On time' : timing < 0 ? 'Early' : 'Late';
    s.lastContact = { timing, timingLabel: label, quality, exitVelocity: Math.round(speed * 2.236936), launchAngle: Math.round(launchAngle * 180 / Math.PI), distance: 0, foul: Math.abs(angle) > Math.PI / 4 };
    const batter = this._runner(), existingRunners = s.runners;
    s.play = {
      stage: 'flight', hitAt: s.time, contactAt: p.contactAt, age: 0, initialBases: clone(s.bases), batter,
      fair: Math.abs(angle) <= Math.PI / 4, maxDistance: 0, fielder: null, heldAt: null,
      throw: null, award: 1, landing: this._predictLanding(), firstArrival: s.time + BASE_DISTANCE / batter.speed,
      initialOuts: s.outs, outs: [], runCrossings: [], ballKind: 'batted', queuedBase: null,
      throwBase: null, recommendedBase: 1, transferUntil: null, throwReadyAt: 0,
      decisionUntil: s.time + 4, lastActionAt: s.time, lastCall: null, coverBase: null,
    };
    s.runners = s.bases.flatMap((runner, i) => {
      if (!runner) return [];
      const running = existingRunners.find(r => r.id === runner.id);
      return [running ? { ...running, fromBase: i + 1, stealing: false, stealQueued: false } : this._liveRunner(runner, i + 1)];
    });
    s.runners.push(this._liveRunner(batter, 0));
    for (const runner of s.runners) { runner.forcedBase = this._forceBase(runner) || null; runner.targetBase = Math.max(runner.manual ? runner.targetBase : runner.fromBase, runner.forcedBase || 0); }
    if (this.options.mode === 'practice') s.practice.contacts++;
    this._phase('live');
    this._event('contact', { ...s.lastContact });
  }

  _predictLanding() {
    const b = this.state.ball;
    let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz;
    for (let time = 0; time < 9; time += 0.05) {
      const drag = 0.0038 * Math.hypot(vx, vy, vz);
      vx -= vx * drag * 0.05; vz -= vz * drag * 0.05; vy -= (9.81 + vy * drag) * 0.05;
      x += vx * 0.05; z += vz * 0.05; y += vy * 0.05;
      if (y <= BALL_RADIUS) return { x, z, time };
    }
    return { x, z, time: 9 };
  }

  _moveFielder(f, target, speed = f.speed) {
    const targetDistance = Math.hypot(target.x, target.z), radius = fieldRadius(Math.atan2(target.x, target.z)) - 0.55;
    if (targetDistance > radius) target = { x: target.x / targetDistance * radius, z: target.z / targetDistance * radius };
    f.target = { x: target.x, z: target.z };
    const dx = target.x - f.x, dz = target.z - f.z, d = Math.hypot(dx, dz), amount = Math.min(d, speed * STEP);
    if (d > 1e-6) { f.x += dx / d * amount; f.z += dz / d * amount; }
    const playerDistance = Math.hypot(f.x, f.z), playerLimit = fieldRadius(Math.atan2(f.x, f.z)) - 0.55;
    if (playerDistance > playerLimit) { f.x *= playerLimit / playerDistance; f.z *= playerLimit / playerDistance; }
  }

  _tickLive() {
    const s = this.state, b = s.ball, play = s.play;
    play.age = s.time - play.hitAt;
    this._updateRunners();
    if (play.stage === 'held') { this._tickHeld(); return; }
    if (play.stage === 'throw') { this._tickThrow(); return; }
    if (play.stage !== 'flight') return;
    const old = { x: b.x, y: b.y, z: b.z };
    const grounded = b.bounced && b.y <= BALL_RADIUS + 1e-6 && Math.abs(b.vy) < 0.05;
    const speed = Math.hypot(b.vx, b.vy, b.vz), drag = grounded ? 0.72 : 0.0038 * speed;
    b.vx -= b.vx * drag * STEP; b.vz -= b.vz * drag * STEP;
    if (grounded) b.vy = 0; else b.vy -= (9.81 + b.vy * drag) * STEP;
    const next = { x: b.x + b.vx * STEP, y: b.y + b.vy * STEP, z: b.z + b.vz * STEP };
    play.maxDistance = Math.max(play.maxDistance, Math.hypot(next.x, next.z));
    if (s.lastContact && play.ballKind === 'batted') s.lastContact.distance = play.maxDistance;
    if (this.options.mode === 'practice') s.practice.bestDistance = Math.max(s.practice.bestDistance, play.maxDistance);
    const target = !b.bounced && b.y > 2.7 ? play.landing : { x: b.x + b.vx * 0.25, z: b.z + b.vz * 0.25 };
    const candidates = s.fielders.filter(f => f.id !== 'C' || !play.fair).map(f => ({ f, time: distance(f, target) / f.speed })).sort((a, c) => a.time - c.time);
    for (let i = 0; i < Math.min(2, candidates.length); i++) this._moveFielder(candidates[i].f, target);
    this._coverBases(candidates.slice(0, 2).map(candidate => candidate.f.id));
    const groundT = next.y < BALL_RADIUS && old.y > BALL_RADIUS ? (old.y - BALL_RADIUS) / (old.y - next.y) : 1;
    const wallT = this._wallCrossing(old, next);
    const limitT = Math.min(groundT, wallT ?? 1);
    let catchResult = null;
    if (play.ballKind === 'batted' && !b.bounced && play.age > 0.16) {
      for (const f of s.fielders) {
        const t = sweptSphereTime(old, next, { x: f.prevX, y: 1.35, z: f.prevZ }, { x: f.x, y: 1.35, z: f.z }, 1.26);
        if (t !== null && t <= limitT && (!catchResult || t < catchResult.t)) catchResult = { f, t };
      }
    }
    if (catchResult) {
      this._catchFly(catchResult.f, s.time - STEP + catchResult.t * STEP); return;
    }
    Object.assign(b, next);
    if (!play.fair) {
      if (next.y <= BALL_RADIUS || play.age > 12 || Math.hypot(next.x, next.z) > fieldRadius(Math.atan2(next.x, next.z))) this._foul();
      return;
    }
    if (wallT !== null) {
      const hit = { x: lerp(old.x, next.x, wallT), y: lerp(old.y, next.y, wallT), z: lerp(old.z, next.z, wallT) };
      if (!b.bounced && wallT <= groundT && hit.y - BALL_RADIUS > FENCE_HEIGHT) {
        Object.assign(b, hit); this._hit(4, true); return;
      }
      const length = Math.hypot(hit.x, hit.z), nx = hit.x / length, nz = hit.z / length;
      const outward = b.vx * nx + b.vz * nz;
      b.vx -= outward * nx * 1.38; b.vz -= outward * nz * 1.38;
      b.x = hit.x - nx * 0.15; b.z = hit.z - nz * 0.15;
      b.bounced = true;
      this._event('wall', { x: b.x, y: b.y, z: b.z });
    }
    if (b.y < BALL_RADIUS) {
      b.y = BALL_RADIUS;
      b.vy = Math.abs(b.vy) > 1.4 ? Math.abs(b.vy) * 0.33 : 0;
      b.vx *= 0.83; b.vz *= 0.83; b.bounced = true;
      this._event('bounce');
    }
    if (b.bounced && b.y < 1.0) {
      for (const f of s.fielders) {
        const t = sweptSphereTime({ x: old.x, y: 0, z: old.z }, { x: b.x, y: 0, z: b.z }, { x: f.prevX, y: 0, z: f.prevZ }, { x: f.x, y: 0, z: f.z }, 1.15);
        if (t !== null) { this._fieldBall(f); return; }
      }
    }
  }

  _wallCrossing(a, b) {
    const signed = p => Math.hypot(p.x, p.z) - fieldRadius(Math.atan2(p.x, p.z));
    if (signed(a) > 0 || signed(b) <= 0) return null;
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const t = (lo + hi) / 2, point = { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
      if (signed(point) > 0) hi = t; else lo = t;
    }
    return hi;
  }

  _liveRunner(runner, base) {
    return { ...runner, fromBase: base, base, highestBase: base, targetBase: Math.max(1, base),
      pathPosition: base, prevPathPosition: base, progress: 0, x: BASES[base].x, y: 0, z: BASES[base].z,
      prevX: BASES[base].x, prevZ: BASES[base].z, safe: base > 0, out: false, scored: false,
      manual: false, sliding: false, forcedBase: null, touchedAt: base ? { [base]: this.state.time } : {}, outAt: null,
      leadLevel: 0, leadDistance: 0, stealQueued: false, stealing: false,
      tagRequired: false, tagReady: false, tagQueued: false };
  }

  _normaliseLive() {
    const s = this.state, p = s.play;
    if (!p) return;
    Object.assign(p, { initialOuts: p.initialOuts ?? s.outs, outs: p.outs || [], runCrossings: p.runCrossings || [],
      ballKind: p.ballKind || 'batted', queuedBase: p.queuedBase ?? null, throwBase: p.throwBase ?? null,
      recommendedBase: p.recommendedBase ?? 1, transferUntil: p.transferUntil ?? null,
      throwReadyAt: p.throwReadyAt ?? (p.heldAt || 0) + 0.18, decisionUntil: p.decisionUntil ?? s.time + 1.5,
      lastActionAt: p.lastActionAt ?? s.time, coverBase: p.coverBase ?? null });
    s.runners = s.runners.map(r => {
      if (Number.isFinite(r.pathPosition)) return r;
      const position = r.fromBase + (r.progress || 0), base = Math.floor(position + 1e-8);
      return { ...this._liveRunner(r, r.fromBase), ...r, pathPosition: position, prevPathPosition: position,
        base, highestBase: base, targetBase: Math.max(1, Math.ceil(position)), touchedAt: base ? { [base]: s.time } : {} };
    });
  }

  _pathAt(runner, time = this.state.time) {
    const portion = clamp((time - (this.state.time - STEP)) / STEP, 0, 1);
    return lerp(runner.prevPathPosition ?? runner.pathPosition, runner.pathPosition, portion);
  }

  _forceBase(runner, time = this.state.time) {
    if (this.state.play?.kind === 'steal' || this.state.play?.kind === 'pickoff' || this.state.play?.caught) return 0;
    if (runner.out && (runner.outAt ?? -Infinity) <= time || runner.scored && runner.scoredAt <= time) return 0;
    const destination = runner.fromBase + 1;
    if (destination > 4) return 0;
    for (let base = 0; base < runner.fromBase; base++) {
      const trailing = this.state.runners.find(r => r.fromBase === base);
      if (!trailing || trailing.out && (trailing.outAt ?? -Infinity) <= time) return 0;
    }
    const touched = runner.touchedAt?.[destination];
    if (touched !== undefined && touched <= time + 1e-9 && this._pathAt(runner, time) >= destination - 1e-8) return 0;
    return destination;
  }

  _baseBlocked(runner, base) {
    return base < 4 && this.state.runners.some(other => other.id !== runner.id && !other.out && !other.scored &&
      other.fromBase > runner.fromBase && other.targetBase === base && other.pathPosition <= base + 1e-8);
  }

  _runCommand(input) {
    const s = this.state, p = s.play;
    if (!this._commandIsBatting(input) || s.phase !== 'live' || !p?.fair) return this._reject('There is no live runner to direct.');
    const runner = s.runners.find(r => r.id === input.runnerId);
    if (!runner || runner.out || runner.scored) return this._reject('Choose an active runner.');
    let target = input.base;
    if (runner.tagRequired) {
      if (input.action === 'advance' || Number.isInteger(target) && target > runner.fromBase) {
        const destination = clamp(target || runner.fromBase + 1, runner.fromBase + 1, 4);
        if (this._baseBlocked(runner, destination)) return this._reject(`${this._baseName(destination)} is occupied. Advance the lead runner first.`);
        runner.tagQueued = true; runner.tagDestination = destination;
      } else { runner.tagQueued = false; runner.tagDestination = null; }
      runner.targetBase = runner.fromBase; runner.manual = true; p.lastActionAt = s.time; p.decisionUntil = Math.max(p.decisionUntil, s.time + 1.5);
      this._event('runner-command', { runnerId: runner.id, base: runner.fromBase, tagQueued: runner.tagQueued });
      return true;
    }
    if (input.action === 'advance') target = Math.min(4, Math.max(runner.targetBase + 1, Math.floor(runner.pathPosition) + 1));
    if (input.action === 'hold') target = runner.targetBase < runner.pathPosition
      ? Math.floor(runner.pathPosition + 1e-8) : Math.ceil(runner.pathPosition - 1e-8);
    if (input.action === 'retreat') target = Math.max(1, runner.base);
    if (input.action === 'hold') target = Math.max(1, target);
    if (!Number.isInteger(target) || target < 1 || target > 4) return this._reject('Choose a base from first through home.');
    target = Math.max(runner.fromBase || 1, target);
    const forced = this._forceBase(runner);
    if (forced && target < forced) {
      if (input.action === 'hold') target = forced;
      else return this._reject(`This runner is forced to ${this._baseName(forced)}.`);
    }
    if (this._baseBlocked(runner, target)) return this._reject(`${this._baseName(target)} is occupied. Advance the lead runner first.`);
    runner.targetBase = target; runner.manual = true;
    if (p.kind === 'pickoff' || p.kind === 'steal') runner.reactionAt = Math.min(runner.reactionAt || s.time, s.time);
    runner.safe = Math.abs(runner.pathPosition - target) < 1e-8 && !forced;
    p.lastActionAt = s.time; p.decisionUntil = Math.max(p.decisionUntil, s.time + 1.25);
    this._event('runner-command', { runnerId: runner.id, base: target });
    return true;
  }

  _baseName(base) { return ['home', 'first', 'second', 'third', 'home'][base] || 'base'; }

  _updateRunners() {
    const s = this.state, p = s.play;
    const ordered = [...s.runners].sort((a, b) => b.pathPosition - a.pathPosition || b.fromBase - a.fromBase);
    for (const runner of ordered) {
      runner.prevX = runner.x; runner.prevZ = runner.z; runner.prevPathPosition = runner.pathPosition;
      if (runner.out || runner.scored) continue;
      const force = this._forceBase(runner);
      if (force) runner.targetBase = Math.max(runner.targetBase, force);
      if (!runner.manual && s.ball.bounced && p.ballKind === 'batted') {
        const automatic = runner.fromBase > 0 && p.maxDistance > 33 ? Math.min(4, runner.fromBase + 1)
          : !this.isHumanBatting && runner.fromBase === 0 && p.maxDistance > 76 ? 2 : runner.targetBase;
        if (automatic > runner.targetBase && !this._baseBlocked(runner, automatic)) runner.targetBase = automatic;
      }
      let destination = runner.targetBase;
      // Read airborne contact; a caught ball requires a physical return to the original bag.
      if (runner.fromBase > 0 && !s.ball.bounced && p.ballKind === 'batted' && !p.caught) destination = Math.min(destination, runner.fromBase + (runner.manual ? 0.18 : 0));
      if (runner.tagRequired) destination = runner.fromBase;
      if (runner.reactionAt > s.time) destination = runner.pathPosition;
      const direction = Math.sign(destination - runner.pathPosition), amount = runner.speed * STEP / BASE_DISTANCE;
      let next = runner.pathPosition + direction * Math.min(amount, Math.abs(destination - runner.pathPosition));
      // Runners cannot pass the lead runner or occupy the same bag.
      if (direction > 0) {
        const lead = ordered.find(other => other.id !== runner.id && !other.out && !other.scored && other.fromBase > runner.fromBase && other.pathPosition >= runner.pathPosition - 1e-8);
        if (lead) next = Math.min(next, Math.max(runner.pathPosition, lead.pathPosition - 0.045));
      }
      const old = runner.pathPosition;
      runner.pathPosition = clamp(next, Math.max(0, runner.fromBase), 4);
      if (direction > 0) {
        for (let base = Math.floor(old + 1e-8) + 1; base <= Math.floor(runner.pathPosition + 1e-8); base++) {
          const time = s.time - STEP + STEP * (base - old) / Math.max(1e-12, runner.pathPosition - old);
          runner.base = base; runner.highestBase = Math.max(runner.highestBase, base); runner.touchedAt[base] = time;
          if (base === 1 && runner.fromBase === 0) runner.firstBaseAt = time;
          if (base === 4) {
            runner.scored = true; runner.safe = true; runner.scoredAt = time;
            p.runCrossings.push({ runnerId: runner.id, time });
            this._event('runner-home', { runnerId: runner.id });
          } else {
            this._event('safe', { runnerId: runner.id, base });
            if (this.isHumanBatting) p.decisionUntil = Math.max(p.decisionUntil, s.time + 1.15);
          }
        }
      } else if (direction < 0 && Math.abs(runner.pathPosition - Math.round(runner.pathPosition)) < 1e-8) {
        runner.base = Math.round(runner.pathPosition); runner.touchedAt[runner.base] = s.time;
      }
      if (runner.tagRequired && Math.abs(runner.pathPosition - runner.fromBase) < 1e-8) {
        runner.tagRequired = false; runner.tagReady = true; runner.taggedAt = s.time;
        runner.touchedAt[runner.fromBase] = s.time;
        if (runner.tagQueued) { runner.targetBase = runner.tagDestination || Math.min(4, runner.fromBase + 1); runner.tagQueued = false; }
        this._event('tag-ready', { runnerId: runner.id, base: runner.fromBase });
      }
      const index = Math.min(3, Math.floor(runner.pathPosition)), fraction = runner.pathPosition - index;
      const a = BASES[index], b = BASES[index + 1];
      runner.x = lerp(a.x, b.x, fraction); runner.z = lerp(a.z, b.z, fraction); runner.y = 0;
      runner.progress = runner.pathPosition - runner.fromBase;
      runner.safe = !runner.out && (runner.scored || runner.pathPosition >= 1 && Math.abs(runner.pathPosition - Math.round(runner.pathPosition)) < 1e-8 && !this._forceBase(runner));
      runner.forcedBase = this._forceBase(runner) || null;
      runner.sliding = !runner.safe && !runner.out && Math.abs(destination - runner.pathPosition) < 0.075 && p.stage !== 'flight';
    }
    p.recommendedBase = this._recommendBase();
  }

  _receiverForBase(base, sourceId = null) {
    const choices = { 1: ['1B', 'P'], 2: ['2B', 'SS'], 3: ['3B', 'SS'], 4: ['C', 'P'] }[base];
    const source = this.state.fielders.find(f => f.id === sourceId);
    return this.state.fielders.filter(f => choices.includes(f.id)).map(f => ({ f,
      score: distance(f, BASES[base]) / Math.max(0.1, f.speed) + (f.id === sourceId ? 0 : (source ? distance(source, BASES[base]) / 29 : 0)) * 0.2,
    })).sort((a, b) => a.score - b.score || a.f.id.localeCompare(b.f.id))[0].f;
  }

  _coverBases(excluded = []) {
    const assigned = new Set(excluded), p = this.state.play;
    const bases = [p?.throwBase, p?.queuedBase, 1, 2, 3, 4].filter((base, i, all) => base && all.indexOf(base) === i);
    for (const base of bases) {
      const f = this._receiverForBase(base, p?.fielder);
      if (!assigned.has(f.id)) { this._moveFielder(f, BASES[base]); assigned.add(f.id); }
    }
  }

  _recommendBase() {
    const s = this.state, p = s.play;
    if (!p) return null;
    const ball = s.fielders.find(f => f.id === p.fielder) || s.ball;
    let best = null, bestScore = -Infinity;
    for (const runner of s.runners) {
      if (runner.out || runner.scored || runner.safe && runner.targetBase === runner.base) continue;
      const forced = this._forceBase(runner), base = runner.tagRequired ? runner.fromBase : forced || runner.targetBase;
      if (!base || base < 1 || base > 4) continue;
      const receiver = this._receiverForBase(base, p.fielder);
      const runnerTime = Math.abs(base - runner.pathPosition) * BASE_DISTANCE / runner.speed;
      const ballTime = Math.max(distance(ball, BASES[base]) / 29 + 0.28, distance(receiver, BASES[base]) / Math.max(0.1, receiver.speed));
      const score = (runner.tagRequired ? 6 : 0) + (ballTime < runnerTime + 0.15 ? 10 : 0) + (forced ? 4 : 0) + base * 0.8 - Math.max(0, ballTime - runnerTime) * 2;
      if (score > bestScore) { bestScore = score; best = base; }
    }
    return best;
  }

  _fieldBall(f) {
    const s = this.state, p = s.play;
    for (const other of s.fielders) other.hasBall = false;
    f.hasBall = true; p.stage = 'held'; p.fielder = f.id; p.heldAt = s.time;
    p.possessionAt = s.time;
    p.throwReadyAt = s.time + 0.18; p.transferUntil = null; p.coverBase = null;
    p.recommendedBase = this._recommendBase();
    p.decisionUntil = Math.max(p.decisionUntil, s.time + (this.isHumanBatting ? 1.8 : 1.2));
    Object.assign(s.ball, { x: f.x, y: 1.4, z: f.z, vx: 0, vy: 0, vz: 0, visible: true });
    this._event('fielded', { fielder: f.id });
  }

  _prepareThrow(base) {
    const s = this.state, p = s.play;
    if (p.stage !== 'held') return;
    p.queuedBase = null; p.throwBase = base;
    p.receiver = this._receiverForBase(base, p.fielder).id;
    p.transferUntil = Math.max(s.time, p.throwReadyAt) + 0.24;
    p.lastActionAt = s.time;
    this._event('transfer', { from: p.fielder, base, receiver: p.receiver });
  }

  _releaseThrow() {
    const s = this.state, p = s.play, source = s.fielders.find(f => f.id === p.fielder);
    const receiver = s.fielders.find(f => f.id === p.receiver), base = p.throwBase;
    const carry = source.id === receiver.id;
    const from = { x: source.x, y: 1.45, z: source.z }, to = { ...BASES[base], y: 1.35 };
    source.hasBall = carry;
    p.throw = { from, to, startedAt: s.time, elapsed: 0, kind: carry ? 'carry' : 'throw', base,
      receiver: receiver.id, duration: Math.max(0.17, distance(from, to) / (carry ? Math.max(0.1, source.speed) : 29)) };
    p.stage = 'throw'; p.transferUntil = null;
    this._event('throw', { from: source.id, base, receiver: receiver.id });
  }

  // Kept as a tiny compatibility adapter for an earlier local test harness.
  _throwFirst() { this._prepareThrow(1); }

  _tickThrow() {
    const s = this.state, p = s.play, flight = p.throw, b = s.ball;
    const receiver = s.fielders.find(f => f.id === flight.receiver);
    this._moveFielder(receiver, BASES[flight.base]);
    this._coverBases([receiver.id, p.fielder]);
    flight.elapsed = s.time - flight.startedAt;
    const t = clamp(flight.elapsed / flight.duration, 0, 1);
    if (flight.kind === 'carry') Object.assign(b, { x: receiver.x, y: 1.4, z: receiver.z });
    else Object.assign(b, { x: lerp(flight.from.x, flight.to.x, t), y: lerp(flight.from.y, flight.to.y, t) + Math.sin(t * Math.PI) * 0.9, z: lerp(flight.from.z, flight.to.z, t) });
    if (t < 1) return;
    if (distance(receiver, BASES[flight.base]) > 1.45) {
      // A covering player still has to reach the throw; an empty bag cannot record an out.
      Object.assign(b, { x: flight.to.x, y: BALL_RADIUS, z: flight.to.z, vx: 0, vy: 0, vz: 0, bounced: true });
      p.stage = 'flight'; p.ballKind = 'loose'; p.fielder = null; return;
    }
    this._fieldBall(receiver);
    p.possessionAt = flight.startedAt + flight.duration;
    p.coverBase = flight.base; p.lastActionAt = s.time;
    this._resolvePossession(receiver, flight.startedAt + flight.duration);
    if (s.phase === 'live') p.decisionUntil = Math.max(p.decisionUntil, s.time + 0.7);
  }

  _tickHeld() {
    const s = this.state, p = s.play, f = s.fielders.find(player => player.id === p.fielder);
    if (!f) return;
    if (p.coverBase && distance(f, BASES[p.coverBase]) > 0.1) this._moveFielder(f, BASES[p.coverBase]);
    else if (!p.transferUntil) {
      const nearby = s.runners.filter(r => !r.out && !r.scored && !r.safe && distance(r, f) < 4).sort((a, b) => distance(a, f) - distance(b, f))[0];
      if (nearby) this._moveFielder(f, nearby);
    }
    this._coverBases([f.id]);
    Object.assign(s.ball, { x: f.x, y: 1.4, z: f.z });
    this._resolvePossession(f, s.time);
    if (s.phase !== 'live') return;
    p.recommendedBase = this._recommendBase();
    if (p.transferUntil) {
      if (s.time >= p.transferUntil) this._releaseThrow();
      return;
    }
    if (p.queuedBase && s.time >= p.throwReadyAt) { this._prepareThrow(p.queuedBase); return; }
    const autoDelay = this.isHumanFielding ? 1.0 : p.kind === 'steal' ? 0.08 : 0.30;
    if (p.recommendedBase && s.time - p.heldAt >= autoDelay) {
      const atRecommended = distance(f, BASES[p.recommendedBase]) < 0.6;
      if (!atRecommended) { this._prepareThrow(p.recommendedBase); return; }
    }
    const allSettled = s.runners.every(r => r.out || r.scored || r.safe && Math.abs(r.targetBase - r.pathPosition) < 1e-8);
    if (allSettled && s.time >= p.decisionUntil && s.time - p.lastActionAt >= 0.75) this._finishLive();
  }

  _runnerSafeAt(r, time) {
    const position = this._pathAt(r, time), base = Math.round(position);
    return base >= 1 && base <= 3 && Math.abs(position - base) * BASE_DISTANCE < 0.35 &&
      r.touchedAt?.[base] !== undefined && r.touchedAt[base] <= time + 1e-9 && !this._forceBase(r, time);
  }

  _resolvePossession(fielder, time) {
    const s = this.state;
    // Resolve the earliest physical play first, then re-evaluate the force chain.
    // This matters when one retirement removes a force during the same fixed tick.
    for (let count = 0; count < s.runners.length && s.phase === 'live'; count++) {
      const candidates = [];
      for (const r of s.runners) {
        if (r.out || r.scored && r.scoredAt <= time) continue;
        if (s.play.caught && r.tagRequired && distance(fielder, BASES[r.fromBase]) <= 0.65) candidates.push({ runner: r, base: r.fromBase, type: 'retouch', time });
        const forced = this._forceBase(r, time);
        if (forced && distance(fielder, BASES[forced]) <= 0.65) candidates.push({ runner: r, base: forced, type: 'force', time });
        const start = clamp(((s.play.possessionAt ?? s.time) - (s.time - STEP)) / STEP, 0, 1);
        const t = sweptSphereTime({ x: lerp(r.prevX, r.x, start), y: 0, z: lerp(r.prevZ, r.z, start) }, { x: r.x, y: 0, z: r.z },
          { x: lerp(fielder.prevX, fielder.x, start), y: 0, z: lerp(fielder.prevZ, fielder.z, start) }, { x: fielder.x, y: 0, z: fielder.z }, 0.90);
        const tagTime = t === null ? null : s.time - STEP + (start + (1 - start) * t) * STEP;
        if (tagTime !== null && !this._runnerSafeAt(r, tagTime)) {
          // Tagging a runner who is still forced is itself a force play.
          const tagForce = this._forceBase(r, tagTime);
          candidates.push({ runner: r, base: tagForce || Math.max(1, Math.round(r.pathPosition)), type: tagForce ? 'force' : 'tag', time: tagTime });
        }
      }
      candidates.sort((a, b) => a.time - b.time || Number(b.type === 'force') - Number(a.type === 'force') || a.runner.fromBase - b.runner.fromBase);
      if (!candidates.length) return;
      const first = candidates[0];
      this._retireRunner(first.runner, first.base, first.type, first.time);
    }
  }

  _retireRunner(runner, base, type, time) {
    const s = this.state, p = s.play;
    if (runner.out || runner.scored && runner.scoredAt <= time) return;
    if (runner.scored) { runner.scored = false; p.runCrossings = p.runCrossings.filter(crossing => crossing.runnerId !== runner.id); }
    const batterBeforeFirst = !p.kind && runner.fromBase === 0 && (runner.touchedAt[1] === undefined || runner.touchedAt[1] > time);
    runner.out = true; runner.outAt = time; runner.safe = false; runner.sliding = false;
    for (const other of s.runners) other.forcedBase = this._forceBase(other) || null;
    p.outs.push({ runnerId: runner.id, base, type, time, batterBeforeFirst });
    if (this.options.mode !== 'practice') s.outs++;
    p.lastCall = { title: `Out at ${this._baseName(base)}`, detail: type === 'force' ? 'Force play' : type === 'retouch' ? 'Doubled off before tagging up' : 'Tagged off the bag', time };
    p.lastActionAt = s.time;
    if (p.transferUntil) p.queuedBase ??= p.throwBase;
    p.transferUntil = null;
    this._event('out', { outs: s.outs, runnerId: runner.id, base: type === 'catch' ? null : base, kind: type });
    if (s.outs >= 3 || this.options.mode === 'practice' && runner.fromBase === 0 && !p.caught) this._finishLive();
  }

  _finishLive() {
    const s = this.state, p = s.play;
    if (s.phase !== 'live') return;
    if (p.kind === 'steal' || p.kind === 'pickoff') { this._finishRunningPlay(); return; }
    const third = s.outs >= 3 ? p.outs.at(-1) : null;
    const invalidateRuns = third && (third.type === 'force' || third.type === 'catch' || third.batterBeforeFirst);
    const before = s.score[s.battingSide];
    if (!invalidateRuns) for (const crossing of p.runCrossings) {
      if (third && crossing.time >= third.time - 1e-9) continue;
      const runner = s.runners.find(r => r.id === crossing.runnerId);
      if (runner) this._scoreRun(runner);
    }
    const bases = [null, null, null];
    for (const runner of s.runners) {
      if (runner.out || runner.scored || runner.base < 1 || runner.base > 3) continue;
      const base = Math.round(runner.pathPosition);
      if (base >= 1 && base <= 3 && !bases[base - 1]) bases[base - 1] = { id: runner.id, number: runner.number, side: runner.side, speed: runner.speed };
    }
    s.bases = this.options.mode === 'practice' ? [null, null, null] : bases;
    const batter = s.runners.find(r => r.id === p.batter.id), reaches = batter?.highestBase || 0;
    const choice = p.outs.some(out => out.runnerId !== p.batter.id && out.type === 'force');
    const isHit = reaches >= 1 && !choice && !p.caught;
    const award = Math.min(3, reaches);
    if (isHit) { s.hits[s.battingSide]++; if (this.options.mode === 'practice') s.practice.hits++; this._event('hit', { bases: award, homeRun: false }); }
    const multiple = p.outs.length >= 2;
    let title = multiple ? (p.outs.length > 2 ? 'Triple play!' : 'Double play!')
      : isHit ? (award === 3 ? 'Triple' : award === 2 ? 'Double' : 'Single')
        : p.caught ? 'Caught' : choice ? 'Fielder’s choice' : batter?.out ? 'Groundout' : 'Play complete';
    const runs = s.score[s.battingSide] - before;
    if (p.caught && runs > 0) title = multiple ? 'Sacrifice fly · double play' : 'Sacrifice fly';
    const detail = [p.caught ? `${p.catchFielder} makes the catch` : isHit ? `${s.lastContact?.exitVelocity || 0} mph off the bat` : '',
      ...p.outs.filter(out => out.type !== 'catch').map(out => `Out at ${this._baseName(out.base)} (${out.type})`),
      runs ? `${runs} run${runs === 1 ? '' : 's'} score` : '',
      invalidateRuns && p.runCrossings.length ? (third.type === 'catch' ? 'No run: third out was the caught batter' : 'No run: third out was a force') : ''].filter(Boolean).join(' · ');
    this._advanceBatter();
    const next = s.outs >= 3 ? this._halfEndDecision() : this._isWalkoff() ? 'final' : 'batter';
    this._complete(title, detail || 'Runners hold their bases.', multiple ? 'doublePlay' : p.caught ? (runs > 0 ? 'sacrificeFly' : 'catch') : isHit ? 'hit' : choice ? 'fieldersChoice' : 'groundout', next,
      { bases: award, runs, outsOnPlay: p.outs.length, distance: Math.round(p.maxDistance * 3.28084) });
  }

  _restoreHeldRunners() {
    const s = this.state;
    s.runners = s.bases.flatMap((runner, i) => runner ? [this._liveRunner(runner, i + 1)] : []);
    if (s.play) s.play.runCrossings = [];
  }

  _runner() { return { id: this.state.nextRunnerId++, number: this.state.batterIndex[this.state.battingSide] + 1, side: this.state.battingSide, speed: 6.8 + (this.state.batterIndex[this.state.battingSide] % 3) * 0.2 }; }
  _complete(title, detail, kind, next = 'pitch', extra = {}) {
    const s = this.state;
    if (s.phase === 'pitch' && ['strike', 'ball', 'strikeout'].includes(kind) && s.outs < 3 && s.runners.some(r => r.stealing && !r.out)) {
      this._beginRunningPlay('steal', { title, detail, kind, next, ...extra }); return;
    }
    if (s.play) s.play.stage = 'settled';
    s.result = { title, detail, kind, ...extra };
    s.pending = next;
    this._phase('result'); this._event('result', { ...s.result });
  }
  _advanceBatter() { this.state.batterIndex[this.state.battingSide] = (this.state.batterIndex[this.state.battingSide] + 1) % 9; }

  _calledPitch(strike, swinging) {
    const s = this.state;
    if (strike) {
      s.strikes++;
      if (s.strikes >= 3) { this._out('Strikeout', swinging ? `${s.lastContact?.timingLabel || 'Swing and miss'}. Three strikes.` : 'Strike three looking.', 'strikeout'); return; }
      this._complete(swinging ? 'Swing and miss' : 'Called strike', swinging ? `${s.lastContact?.timingLabel || 'Missed the pitch'} · ${s.balls}–${s.strikes} count` : `Caught the zone · ${s.balls}–${s.strikes} count`, 'strike');
    } else {
      s.balls++;
      if (s.balls >= 4) { this._walk(); return; }
      this._complete('Ball', `Outside the zone · ${s.balls}–${s.strikes} count`, 'ball');
    }
  }
  _foul() {
    const s = this.state;
    this._restoreHeldRunners();
    if (s.strikes < 2) s.strikes++;
    this._complete('Foul ball', `${s.lastContact?.timingLabel || 'Off the barrel'} · ${s.balls}–${s.strikes} count`, 'foul');
  }
  _out(title, detail, kind) {
    const s = this.state;
    if (this.options.mode === 'practice') {
      this._advanceBatter(); this._complete(title, detail, kind, 'batter'); return;
    }
    s.outs++; this._advanceBatter(); this._event('out', { outs: s.outs, kind });
    this._complete(title, detail, kind, s.outs >= 3 ? this._halfEndDecision() : 'batter');
  }
  _scoreRun(runner, allowBeyondWalkoff = false) {
    const s = this.state;
    if (this.options.mode === 'practice') return false;
    if (!allowBeyondWalkoff && s.half === 'bottom' && s.inning >= this.options.innings && s.score[1] > s.score[0]) return false;
    s.score[s.battingSide]++;
    while (s.lineScore[s.battingSide].length < s.inning) s.lineScore[s.battingSide].push(0);
    s.lineScore[s.battingSide][s.inning - 1]++;
    this._event('run', { side: s.battingSide, runner: runner.id });
    return true;
  }
  _isWalkoff() { const s = this.state; return this.options.mode !== 'practice' && s.half === 'bottom' && s.inning >= this.options.innings && s.score[1] > s.score[0]; }
  _walk() {
    const s = this.state, batter = this._runner();
    if (this.options.mode !== 'practice') {
      if (s.bases[0]) {
        if (s.bases[1]) { if (s.bases[2]) this._scoreRun(s.bases[2]); s.bases[2] = s.bases[1]; }
        s.bases[1] = s.bases[0];
      }
      s.bases[0] = batter;
    }
    this._advanceBatter();
    this._complete('Walk', 'Ball four. Take first base.', 'walk', this._isWalkoff() ? 'final' : 'batter');
  }
  _hit(bases, homeRun = false) {
    const s = this.state, batter = s.play?.batter || this._runner(), scoredBefore = s.score[s.battingSide];
    s.hits[s.battingSide]++;
    if (this.options.mode === 'practice') {
      s.practice.hits++; if (homeRun) s.practice.homeRuns++;
    } else {
      const next = [null, null, null];
      for (let i = 2; i >= 0; i--) {
        if (!s.bases[i]) continue;
        const destination = i + 1 + bases;
        if (destination >= 4) this._scoreRun(s.bases[i], homeRun); else next[destination - 1] = s.bases[i];
      }
      if (bases === 4) this._scoreRun(batter, true); else next[bases - 1] = batter;
      s.bases = next;
    }
    const title = homeRun ? 'Home run!' : bases === 3 ? 'Triple' : bases === 2 ? 'Double' : 'Single';
    const runs = s.score[s.battingSide] - scoredBefore;
    const feet = Math.round((s.play?.maxDistance || 0) * 3.28084);
    const detail = `${s.lastContact?.exitVelocity || 0} mph off the bat${homeRun ? ` · ${feet} ft to the wall` : ''}${runs ? ` · ${runs} run${runs === 1 ? '' : 's'} score` : ''}`;
    this._advanceBatter(); this._event('hit', { bases, homeRun, runs });
    this._complete(title, detail, homeRun ? 'homeRun' : 'hit', this._isWalkoff() ? 'final' : 'batter', { bases, runs, distance: feet });
  }

  _halfEndDecision() {
    const s = this.state;
    if (s.inning >= this.options.innings) {
      if (s.half === 'top' && s.score[1] > s.score[0]) return 'final';
      if (s.half === 'bottom' && s.score[0] !== s.score[1]) return 'final';
    }
    return 'half';
  }
  _ready() {
    const s = this.state, newBatter = s.pending === 'batter';
    if (newBatter) { s.balls = 0; s.strikes = 0; s.pickoffAttempts = 0; }
    s.pending = null; s.pitch = null; s.swing = null; s.play = null; s.result = null; s.readyActionChecked = false; s.cpuRunnerChecked = false;
    s.fielders = this._newFielders();
    Object.assign(s.ball, { visible: false, x: 0, y: 1.85, z: 18.44, prevX: 0, prevY: 1.85, prevZ: 18.44, bounced: false });
    s.runners = s.bases.flatMap((runner, i) => runner ? [this._liveRunner(runner, i + 1)] : []);
    if (this.options.scenario === 'runners') this._setupRunningPractice();
    this._phase('ready');
  }
  _nextHalf() {
    const s = this.state;
    if (s.half === 'top') { s.half = 'bottom'; s.battingSide = 1; }
    else { s.half = 'top'; s.battingSide = 0; s.inning++; }
    for (const line of s.lineScore) while (line.length < s.inning) line.push(0);
    s.outs = 0; s.balls = 0; s.strikes = 0; s.bases = [null, null, null]; s.pending = null; s.pickoffAttempts = 0;
    this._ready();
  }
  _final() {
    const s = this.state;
    this._phase('final'); s.pending = null;
    s.result = { title: s.score[0] > s.score[1] ? 'Visitors win' : 'Home team wins', detail: `${s.score[0]}–${s.score[1]} · Final${s.inning > this.options.innings ? ` in ${s.inning}` : ''}`, kind: 'final', winner: s.score[0] > s.score[1] ? 0 : 1 };
    this._event('final', { score: [...s.score], winner: s.result.winner });
  }
}
