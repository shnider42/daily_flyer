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
  const bend = Math.sin(Math.PI * clamp(t, 0, 1));
  return {
    x: lerp(pitch.start.x, pitch.target.x, t) + bend * pitch.breakX,
    y: lerp(pitch.start.y, pitch.target.y, t) + bend * pitch.breakY,
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
      practice: { pitches: 0, swings: 0, contacts: 0, hits: 0, homeRuns: 0, bestDistance: 0 },
    };
  }

  get isBatting() { return this.options.mode === 'practice' || this.state.battingSide === 0; }
  get interpolationAlpha() { return this._accumulator / STEP; }
  get difficulty() { return DIFFICULTIES[this.options.difficulty]; }
  resetClock() { this._accumulator = 0; }

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
    this.options = { ...this.state.options };
    this._accumulator = clamp(finite(snapshot.accumulator), 0, STEP);
    this._events = [];
    this.lastRejection = null;
    return this;
  }
  _phase(phase) { this.state.phase = phase; this.state.phaseStartedAt = this.state.time; this.state.phaseTime = 0; }
  _reject(reason) { this.lastRejection = reason; return false; }

  command(input = {}) {
    const s = this.state;
    this.lastRejection = null;
    // A transport can bind a command to the pitch the player actually saw.
    // Unscoped commands remain convenient for local play; IDs survive snapshots.
    if (input.pitchId !== undefined) {
      const expected = input.type === 'pitch' ? s.nextPitchId : s.pitch?.id;
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
      if (s.phase !== 'ready' || this.isBatting) return this._reject('Wait until your pitcher is ready.');
      if (!PITCHES[input.pitchType]) return this._reject('Unknown pitch.');
      this._startPitch(input.pitchType, aimWorld(input.aim), clamp(finite(input.quality, 0.5), 0, 1));
      return true;
    }
    if (input.type === 'swing') {
      if (!this.isBatting || !['windup', 'pitch'].includes(s.phase) || s.swing) return this._reject('A swing is not available.');
      const time = finite(input.time, s.time);
      // This is bounded local event scheduling, not an online anti-cheat or network protocol.
      if (time < s.time - 0.100001 || time > s.time + 0.025 || time < s.pitch.releaseAt - 0.65) return this._reject('Swing timestamp is outside the local input window.');
      s.swing = { time, power: Boolean(input.power), aim: { x: clamp(finite(input.aim?.x), -1, 1), y: clamp(finite(input.aim?.y), -1, 1) } };
      if (this.options.mode === 'practice') s.practice.swings++;
      this._event('swing', { power: s.swing.power });
      if (s.time >= s.pitch.contactAt) this._evaluateSwing();
      return true;
    }
    if (input.type === 'throw') {
      if (this.isBatting || s.phase !== 'live' || s.play?.stage !== 'held' || (input.base !== undefined && input.base !== 1)) return this._reject('The fielder is not ready to throw to first.');
      this._throwFirst();
      return true;
    }
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
    if (s.phase === 'ready' && this.isBatting && s.phaseTime >= 1.6) this._cpuPitch();
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
    const choice = this._random(), type = practice ? (choice < 0.80 ? 'fastball' : 'changeup') : choice < 0.46 ? 'fastball' : choice < 0.67 ? 'changeup' : choice < 0.84 ? 'curveball' : 'slider';
    const strike = practice || this._random() < (s.balls === 3 ? 0.85 : 0.68);
    const target = strike
      ? { x: this._centered() * (practice ? 0.11 : 0.18), y: 1.0 + this._centered() * (practice ? 0.16 : 0.32), z: 0 }
      : { x: (this._random() > 0.5 ? 1 : -1) * (0.31 + this._random() * 0.24), y: 0.65 + this._random() * 0.85, z: 0 };
    this._startPitch(type, target, 0.82 + this._random() * 0.17, true);
  }

  _startPitch(type, intendedTarget, quality, cpu = false) {
    const s = this.state, profile = PITCHES[type];
    const miss = (1 - quality) * (type === 'fastball' ? 0.51 : 0.65);
    const target = { ...intendedTarget };
    target.x += this._centered() * miss;
    target.y += this._centered() * miss;
    // A poorly released breaking pitch can hang; a bad fastball loses velocity.
    if (!cpu && type !== 'fastball' && quality < 0.45) target.y = lerp(target.y, 1.16, (0.45 - quality) * 1.5);
    target.y = clamp(target.y, 0.15, 2.0);
    const mph = Math.round(profile.mph + this._centered() * 2 - (type === 'fastball' ? (1 - quality) * 7 : (1 - quality) * 3));
    const duration = 0.86 * (94 / mph) * this.difficulty.pitchScale;
    const releaseAt = s.time + 0.65;
    s.pitch = {
      id: s.nextPitchId++, type, mph, quality, target, intendedTarget: { ...intendedTarget }, start: { x: -0.32, y: 1.88, z: 18.44 },
      breakX: profile.breakX * (0.55 + quality * 0.45), breakY: profile.breakY * (0.55 + quality * 0.45),
      duration, elapsed: 0, releaseAt, contactAt: releaseAt + duration, resolved: false, aiSwing: null,
    };
    s.swing = null; s.result = null; s.pending = null; s.play = null;
    Object.assign(s.ball, { x: -0.32, y: 1.88, z: 18.44, prevX: -0.32, prevY: 1.88, prevZ: 18.44, visible: false, bounced: false, vx: 0, vy: 0, vz: 0 });
    if (!this.isBatting) {
      const strike = inStrikeZone(target), willSwing = this._random() < (strike ? 0.86 : 1 - this.difficulty.aiTake);
      if (willSwing) s.pitch.aiSwing = {
        time: s.pitch.contactAt + this._centered() * this.difficulty.aiTiming * 2.2,
        power: this._random() < 0.20,
        aim: { x: clamp(target.x / AIM_AREA.x + this._centered() * this.difficulty.aiAim * 2, -1, 1), y: clamp((target.y - AIM_AREA.centerY) / AIM_AREA.y + this._centered() * this.difficulty.aiAim * 2, -1, 1) },
      };
    }
    if (this.options.mode === 'practice') s.practice.pitches++;
    this._phase('windup');
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
    const deadline = p.contactAt + (this.isBatting ? this.difficulty.timing + 0.101 : 0.26);
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
    const isHuman = this.isBatting;
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
    const batter = this._runner();
    s.play = {
      stage: 'flight', hitAt: s.time, contactAt: p.contactAt, age: 0, initialBases: clone(s.bases), batter,
      fair: Math.abs(angle) <= Math.PI / 4, maxDistance: 0, fielder: null, heldAt: null,
      throw: null, award: 1, landing: this._predictLanding(), firstArrival: s.time + BASE_DISTANCE / batter.speed,
    };
    s.runners = s.bases.filter(Boolean).map(r => ({ ...r, fromBase: s.bases.findIndex(b => b?.id === r.id) + 1, progress: 0, x: BASES[s.bases.findIndex(b => b?.id === r.id) + 1].x, y: 0, z: BASES[s.bases.findIndex(b => b?.id === r.id) + 1].z }));
    s.runners.push({ ...batter, fromBase: 0, progress: 0, x: 0, y: 0, z: 0 });
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
    if (play.stage === 'held') {
      const f = s.fielders.find(player => player.id === play.fielder);
      Object.assign(b, { x: f.x, y: 1.4, z: f.z });
      const first = s.fielders.find(player => player.id === '1B');
      if (first.id !== f.id) this._moveFielder(first, BASES[1]);
      if (s.time - play.heldAt >= 0.7) this._throwFirst();
      return;
    }
    if (play.stage === 'throw') {
      const t = clamp((s.time - play.throw.startedAt) / play.throw.duration, 0, 1);
      const a = play.throw.from, c = play.throw.to;
      const receiver = s.fielders.find(f => f.id === '1B');
      this._moveFielder(receiver, BASES[1]);
      Object.assign(b, { x: lerp(a.x, c.x, t), y: lerp(a.y, c.y, t) + (play.throw.kind === 'carry' ? 0 : Math.sin(t * Math.PI) * 1.0), z: lerp(a.z, c.z, t) });
      if (t >= 1) {
        receiver.hasBall = distance(receiver, BASES[1]) <= 1.1;
        if (receiver.hasBall && s.time < play.firstArrival - 1e-7) this._out('Groundout', play.throw.kind === 'carry' ? 'First baseman reaches the bag ahead of the runner.' : `${play.fielder} to first. The throw beats the runner.`, 'groundout');
        else this._hit(play.award);
      }
      return;
    }
    if (play.stage !== 'flight') return;
    const old = { x: b.x, y: b.y, z: b.z };
    const grounded = b.bounced && b.y <= BALL_RADIUS + 1e-6 && Math.abs(b.vy) < 0.05;
    const speed = Math.hypot(b.vx, b.vy, b.vz), drag = grounded ? 0.72 : 0.0038 * speed;
    b.vx -= b.vx * drag * STEP; b.vz -= b.vz * drag * STEP;
    if (grounded) b.vy = 0; else b.vy -= (9.81 + b.vy * drag) * STEP;
    const next = { x: b.x + b.vx * STEP, y: b.y + b.vy * STEP, z: b.z + b.vz * STEP };
    play.maxDistance = Math.max(play.maxDistance, Math.hypot(next.x, next.z));
    if (s.lastContact) s.lastContact.distance = play.maxDistance;
    if (this.options.mode === 'practice') s.practice.bestDistance = Math.max(s.practice.bestDistance, play.maxDistance);
    if (!play.fair) {
      Object.assign(b, next);
      if (b.y < BALL_RADIUS) { b.y = BALL_RADIUS; b.vy = Math.abs(b.vy) * 0.35; }
      if (play.age > 1.25) this._foul();
      return;
    }
    const target = !b.bounced && b.y > 2.7 ? play.landing : { x: b.x + b.vx * 0.25, z: b.z + b.vz * 0.25 };
    const candidates = s.fielders.filter(f => f.id !== 'C').map(f => ({ f, time: distance(f, target) / f.speed })).sort((a, c) => a.time - c.time);
    for (let i = 0; i < Math.min(2, candidates.length); i++) this._moveFielder(candidates[i].f, target);
    const groundT = next.y < BALL_RADIUS && old.y > BALL_RADIUS ? (old.y - BALL_RADIUS) / (old.y - next.y) : 1;
    const wallT = this._wallCrossing(old, next);
    const limitT = Math.min(groundT, wallT ?? 1);
    let catchResult = null;
    if (!b.bounced && play.age > 0.16) {
      for (const f of s.fielders) {
        const t = sweptSphereTime(old, next, { x: f.prevX, y: 1.35, z: f.prevZ }, { x: f.x, y: 1.35, z: f.z }, 1.26);
        if (t !== null && t <= limitT && (!catchResult || t < catchResult.t)) catchResult = { f, t };
      }
    }
    if (catchResult) {
      const f = catchResult.f; f.hasBall = true;
      Object.assign(b, { x: f.x, y: 1.35, z: f.z }); play.fielder = f.id;
      this._event('catch', { fielder: f.id });
      this._out('Caught', `${f.id} makes the catch. Runners hold.`, 'catch'); return;
    }
    Object.assign(b, next);
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
    if (play.age > 18) {
      // A bounded recovery for a ball no fielder can reach, retaining the actual travel result.
      this._hit(Math.min(3, Math.max(1, Math.floor(play.age * play.batter.speed / BASE_DISTANCE))));
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

  _fieldBall(f) {
    const s = this.state, p = s.play;
    f.hasBall = true; p.stage = 'held'; p.fielder = f.id; p.heldAt = s.time;
    p.award = clamp(Math.ceil((s.time - p.hitAt) * p.batter.speed / BASE_DISTANCE - 0.10), 1, 3);
    Object.assign(s.ball, { x: f.x, y: 1.4, z: f.z, vx: 0, vy: 0, vz: 0 });
    this._event('fielded', { fielder: f.id });
  }

  _throwFirst() {
    const s = this.state, p = s.play, f = s.fielders.find(player => player.id === p.fielder);
    if (!p || p.stage !== 'held' || !f) return;
    f.hasBall = false;
    const from = { x: f.x, y: 1.45, z: f.z }, to = { x: BASES[1].x, y: 1.35, z: BASES[1].z };
    const carry = f.id === '1B';
    p.throw = { from, to, startedAt: s.time, kind: carry ? 'carry' : 'throw', duration: Math.max(0.17, distance(from, to) / (carry ? f.speed : 29)) };
    p.stage = 'throw'; this._event('throw', { from: f.id, base: 1 });
  }

  _updateRunners() {
    const s = this.state, p = s.play;
    for (const r of s.runners) {
      const rawProgress = r.progress + STEP * r.speed / BASE_DISTANCE;
      const maxProgress = r.fromBase && !s.ball.bounced ? 0.25 : (p.stage === 'flight' ? 4 - r.fromBase : Math.min(p.award, 4 - r.fromBase));
      r.progress = Math.max(0, Math.min(rawProgress, maxProgress));
      const base = Math.min(3, r.fromBase + Math.floor(r.progress)), fraction = r.progress - Math.floor(r.progress);
      const a = BASES[base], b = BASES[Math.min(4, base + 1)];
      r.x = lerp(a.x, b.x, fraction); r.z = lerp(a.z, b.z, fraction); r.y = 0;
      if (r.fromBase + r.progress >= 4) { r.x = 0; r.z = 0; }
    }
  }

  _runner() { return { id: this.state.nextRunnerId++, number: this.state.batterIndex[this.state.battingSide] + 1, side: this.state.battingSide, speed: 6.8 + (this.state.batterIndex[this.state.battingSide] % 3) * 0.2 }; }
  _complete(title, detail, kind, next = 'pitch', extra = {}) {
    const s = this.state;
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
    if (newBatter) { s.balls = 0; s.strikes = 0; }
    s.pending = null; s.pitch = null; s.swing = null; s.play = null; s.result = null;
    s.fielders = this._newFielders();
    Object.assign(s.ball, { visible: false, x: 0, y: 1.85, z: 18.44, prevX: 0, prevY: 1.85, prevZ: 18.44, bounced: false });
    s.runners = s.bases.flatMap((runner, i) => runner ? [{ ...runner, fromBase: i + 1, progress: 0, x: BASES[i + 1].x, y: 0, z: BASES[i + 1].z }] : []);
    this._phase('ready');
  }
  _nextHalf() {
    const s = this.state;
    if (s.half === 'top') { s.half = 'bottom'; s.battingSide = 1; }
    else { s.half = 'top'; s.battingSide = 0; s.inning++; }
    for (const line of s.lineScore) while (line.length < s.inning) line.push(0);
    s.outs = 0; s.balls = 0; s.strikes = 0; s.bases = [null, null, null]; s.pending = null;
    this._ready();
  }
  _final() {
    const s = this.state;
    this._phase('final'); s.pending = null;
    s.result = { title: s.score[0] > s.score[1] ? 'Visitors win' : 'Home team wins', detail: `${s.score[0]}–${s.score[1]} · Final${s.inning > this.options.innings ? ` in ${s.inning}` : ''}`, kind: 'final', winner: s.score[0] > s.score[1] ? 0 : 1 };
    this._event('final', { score: [...s.score], winner: s.result.winner });
  }
}
