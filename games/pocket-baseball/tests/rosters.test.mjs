import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, STEP, BALL_RADIUS, AIM_AREA, PITCH_AIM_AREA, PITCHERS, PITCHES, TEAM_ROSTERS,
  DELIVERIES, getBatterBody, getBatterHand, getPitcher, sweptBatterTime, pitchPosition } from '../public/engine.mjs';

function advance(game, predicate, seconds = 10) {
  for (let i = 0; i < seconds / STEP; i++) { if (predicate(game.state)) return; game.update(STEP); }
  assert.fail(`Timed out in ${game.state.phase}: ${JSON.stringify(game.state.result)}`);
}
function game(options = {}) { return new BaseballGame({ seed: 2003, humanSides: [0, 1], ...options }); }
function pitch(g, x = 0, type = g.availablePitches[0]) {
  assert.equal(g.command({ type: 'pitch', side: 1 - g.state.battingSide, pitchType: type, quality: 1, aim: { x: x / PITCH_AIM_AREA.x, y: 0 } }), true, g.lastRejection);
}
function bodyPitch(g) { pitch(g, getBatterBody(g.state).x); }
function baseRunner(id, side = 0) { return { id, number: id, name: `Runner ${id}`, side, speed: 7 }; }
function loaded(g) { g.state.bases = [baseRunner(21, g.state.battingSide), baseRunner(22, g.state.battingSide), baseRunner(23, g.state.battingSide)]; g._ready(); }

test('both clubs have unique named lineups and eight usable pitchers with distinct profiles', () => {
  const names = new Set();
  for (const [side, roster] of TEAM_ROSTERS.entries()) {
    assert.equal(roster.lineup.length, 9); assert.equal(roster.pitchers.length, 8);
    const numbers = new Set();
    for (const player of [...roster.lineup, ...roster.pitchers]) {
      assert.ok(!names.has(player.name)); names.add(player.name);
      assert.ok(!numbers.has(player.number)); numbers.add(player.number);
      assert.ok(['R', 'L'].includes(player.throws));
    }
    assert.ok(roster.lineup.some(p => p.bats === 'L'));
    assert.ok(roster.lineup.some(p => p.bats === 'R'));
    assert.ok(roster.lineup.some(p => p.bats === 'S'));
    for (const person of roster.pitchers) {
      const g = game({ [side === 0 ? 'pitcher' : 'opponentPitcher']: person.profileId });
      assert.equal(getPitcher(g.state, side).id, person.id);
      assert.ok(DELIVERIES[person.delivery]);
    }
  }
  assert.equal(Object.keys(PITCHES).length, 13);
  for (const profile of Object.values(PITCHERS)) {
    assert.ok(profile.pitches.length >= 3 && profile.pitches.length <= 4);
    assert.equal(profile.pitches.every(id => Object.hasOwn(PITCHES, id)), true);
    assert.ok(Math.abs(Object.values(profile.weights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
});

test('left-handed and switch hitters take the appropriate batter box against each pitching hand', () => {
  const g = game();
  assert.equal(getBatterHand(g.state), 'R'); assert.equal(getBatterBody(g.state).x, -1.02);
  g.state.batterIndex[0] = 1;
  assert.equal(getBatterHand(g.state), 'L'); assert.equal(getBatterBody(g.state).x, 1.02);
  g.state.batterIndex[0] = 4;
  assert.equal(getBatterHand(g.state), 'L');
  assert.equal(g.setStartingPitcher(1, 'southpaw'), true);
  assert.equal(getBatterHand(g.state), 'R'); assert.equal(getBatterBody(g.state).x, -1.02);
});

test('left-handed pitching mirrors release and arm-side break and respects delivery release time', () => {
  const g = game({ opponentPitcher: 'southpaw' });
  pitch(g, 0, 'twoSeam');
  const p = g.state.pitch;
  assert.equal(p.hand, 'L'); assert.ok(p.start.x > 0); assert.ok(p.breakX < 0);
  assert.equal(p.delivery, 'highKick'); assert.equal(p.windupDuration, DELIVERIES.highKick.duration);
  assert.equal(p.releaseAt, p.windupDuration);
  advance(g, s => s.phase === 'pitch');
  assert.ok(g.state.time >= p.releaseAt);
  const r = game({ opponentPitcher: 'sidearm' }); pitch(r, 0, 'twoSeam');
  assert.ok(r.state.pitch.start.x < 0); assert.ok(r.state.pitch.breakX > 0);
  assert.ok(r.state.pitch.start.y < p.start.y);
});

test('new pitch shapes have different velocity, sweep, reverse break and lob trajectories', () => {
  const shots = {};
  for (const [profile, type] of [['southpaw', 'twoSeam'], ['southpaw', 'sweeper'], ['sidearm', 'slurve'], ['finesse', 'screwball'], ['finesse', 'eephus']]) {
    const g = game({ opponentPitcher: profile }); pitch(g, 0, type);
    shots[type] = g.state.pitch;
    const mid = pitchPosition(g.state.pitch, g.state.pitch.releaseAt + g.state.pitch.duration * .5);
    assert.ok(Object.values(mid).every(Number.isFinite));
  }
  assert.ok(shots.sweeper.mph < shots.twoSeam.mph);
  assert.ok(Math.abs(shots.sweeper.breakX) > Math.abs(shots.twoSeam.breakX));
  assert.ok(shots.sweeper.breakX * shots.screwball.breakX < 0);
  assert.ok(shots.eephus.duration > shots.twoSeam.duration * 1.5);
  assert.ok(pitchPosition(shots.eephus, shots.eephus.releaseAt + shots.eephus.duration * .5).y > 2.5);
});

test('the fresh flamethrower can reach 104 mph but never exceed it', () => {
  const speeds = [];
  for (let seed = 1; seed <= 80; seed++) {
    const g = game({ seed, opponentPitcher: 'heat104' }); pitch(g);
    speeds.push(g.state.pitch.mph);
  }
  assert.equal(Math.max(...speeds), 104);
  assert.ok(speeds.some(speed => speed < 104));
  assert.ok(PITCHERS.heat104.control < PITCHERS.balanced.control);
  assert.ok(PITCHERS.heat104.stamina < PITCHERS.balanced.stamina);
});

test('pitch count wears down velocity and command while practice remains fresh', () => {
  const fresh = game({ opponentPitcher: 'heat104' }), tired = game({ opponentPitcher: 'heat104' });
  tired.state.pitching[1].pitchCounts['foundry-heat104'] = PITCHERS.heat104.stamina;
  pitch(fresh); pitch(tired);
  assert.ok(tired.state.pitch.mph <= fresh.state.pitch.mph - 6);
  assert.ok(Math.abs(tired.state.pitch.execution.fatigue - 1) < 1e-9);
  assert.notDeepEqual(tired.state.pitch.target, fresh.state.pitch.target);
  assert.equal(tired.getBullpen(1).find(p => p.active).energy, 0);
  const practice = game({ mode: 'practice', opponentPitcher: 'heat104' });
  practice.state.pitching[1].pitchCounts['foundry-heat104'] = 500; pitch(practice);
  assert.equal(practice.state.pitch.mph, fresh.state.pitch.mph);
  assert.deepEqual(practice.state.pitch.target, fresh.state.pitch.target);
  assert.equal(practice.getBullpen(1).find(p => p.active).energy, 1);
});

test('pitching changes preserve count, runners and fatigue, forbid reentry, and survive a snapshot', () => {
  const g = game(); loaded(g); g.state.balls = 2; g.state.strikes = 1;
  g.state.pitching[1].pitchCounts['foundry-balanced'] = 19;
  const before = structuredClone(g.state.bases);
  assert.equal(g.command({ type: 'changePitcher', side: 1, pitcherId: 'foundry-southpaw' }), true);
  assert.equal(g.activePitcher.playerId, 'foundry-southpaw'); assert.equal(g.activePitcher.hand, 'L');
  assert.equal(g.state.balls, 2); assert.equal(g.state.strikes, 1); assert.deepEqual(g.state.bases, before);
  assert.equal(g.getBullpen(1).find(p => p.profileId === 'balanced').pitchCount, 19);
  assert.equal(g.command({ type: 'changePitcher', side: 1, pitcherId: 'foundry-balanced' }), false);
  assert.match(g.lastRejection, /cannot return/);
  assert.equal(g.command({ type: 'changePitcher', side: 0, pitcherId: 'foundry-sidearm' }), false);
  const restored = new BaseballGame().restore(g.snapshot()); assert.deepEqual(restored.snapshot(), g.snapshot());
  pitch(restored, 0, 'sweeper'); assert.equal(restored.state.pitch.hand, 'L');
  assert.equal(restored.command({ type: 'changePitcher', side: 1, pitcherId: 'foundry-heat104' }), false);
});

test('the batting team can change its own next-inning pitcher only during a dead ball', () => {
  const g = game();
  assert.equal(g.command({ type: 'changePitcher', side: 0, pitcherId: 'harbor-heat104' }), true);
  assert.equal(g.activePitcher.playerId, 'foundry-balanced');
  pitch(g);
  assert.equal(g.command({ type: 'changePitcher', side: 0, pitcherId: 'harbor-southpaw' }), false);
  advance(g, s => s.phase === 'result');
  assert.equal(g.command({ type: 'changePitcher', side: 0, pitcherId: 'harbor-southpaw' }), true);
  g.state.battingSide = 1; g.state.half = 'bottom'; g._ready();
  assert.equal(g.activePitcher.playerId, 'harbor-southpaw');
});

test('CPU replaces a fatigued pitcher, but cannot recycle a removed arm', () => {
  const g = new BaseballGame({ opponentPitcher: 'heat104' });
  g.state.pitching[1].pitchCounts['foundry-heat104'] = 24;
  g.update(STEP);
  assert.notEqual(g.activePitcher.playerId, 'foundry-heat104');
  assert.ok(g.state.pitching[1].usedIds.includes('foundry-heat104'));
  assert.equal(g.getBullpen(1).find(p => p.profileId === 'heat104').available, false);
  assert.ok(g.drainEvents().some(e => e.type === 'pitching-change' && e.cpu));
});

test('old snapshots and invalid inherited profile names get safe starting rosters', () => {
  const g = game({ pitcher: 'constructor', opponentPitcher: '__proto__' });
  assert.equal(g.options.pitcher, 'balanced'); assert.equal(g.options.opponentPitcher, 'balanced');
  assert.equal(g.setStartingPitcher(1, 'constructor'), false);
  assert.equal(g.command({ type: 'pitch', side: 1, pitchType: '__proto__', quality: 1 }), false);
  const old = g.snapshot(); delete old.state.pitching;
  for (const f of old.state.fielders) delete f.playerId;
  const restored = new BaseballGame().restore(old);
  assert.equal(restored.activePitcher.playerId, 'foundry-balanced');
  assert.equal(restored.state.fielders.find(f => f.id === 'P').playerId, 'foundry-balanced');
});

test('a continuous body sweep catches a pitch whose sampled endpoints miss the batter', () => {
  const body = { x: -1.02, z: -.04, bottom: .30, top: 1.52, radius: .22 };
  const a = { x: body.x, y: 1, z: 1 }, b = { x: body.x, y: 1, z: -1 };
  assert.ok(Math.abs(a.z - body.z) > body.radius + BALL_RADIUS);
  assert.ok(Math.abs(b.z - body.z) > body.radius + BALL_RADIUS);
  const hit = sweptBatterTime(a, b, body); assert.ok(hit > 0 && hit < 1);
  assert.equal(sweptBatterTime({ ...a, x: 0 }, { ...b, x: 0 }, body), null);
});

for (const [index, hand] of [[0, 'R'], [1, 'L']]) test(`a 104-capable fastball physically hits a ${hand}-handed batter and awards first without a hit`, () => {
  const g = game({ opponentPitcher: 'heat104' }); g.state.batterIndex[0] = index;
  const batter = g.currentBatter; bodyPitch(g);
  advance(g, s => s.phase === 'result');
  assert.equal(g.state.result.kind, 'hitByPitch'); assert.equal(g.state.pitch.hitByPitch.hand, hand);
  assert.equal(g.state.bases[0].playerId, batter.id); assert.equal(g.state.bases[0].name, batter.name);
  assert.equal(g.state.batterIndex[0], index + 1); assert.equal(g.state.hits[0], 0); assert.equal(g.state.outs, 0);
  assert.equal(g.state.pitch.deadBall, true); assert.equal(g.state.ball.visible, false);
  assert.equal(g.state.hitByPitches[0], 1);
  assert.ok(g.drainEvents().some(e => e.type === 'hit-by-pitch' && e.award));
});

test('HBP advances only forced runners and a loaded HBP scores exactly one run', () => {
  const g = game(); g.state.bases = [null, baseRunner(22), baseRunner(23)]; g._ready(); bodyPitch(g);
  advance(g, s => s.phase === 'result'); assert.equal(g.state.bases[1].id, 22); assert.equal(g.state.bases[2].id, 23); assert.equal(g.state.score[0], 0);
  const full = game(); loaded(full); bodyPitch(full); advance(full, s => s.phase === 'result');
  assert.equal(full.state.score[0], 1); assert.equal(full.state.lineScore[0][0], 1);
  assert.equal(full.state.bases[1].id, 21); assert.equal(full.state.bases[2].id, 22);
  assert.equal(new Set(full.state.bases.map(r => r.id)).size, 3); assert.equal(full.state.hits[0], 0);
});

test('a bases-loaded HBP can end the game on the winning run', () => {
  const g = game(); g.state.inning = 3; g.state.half = 'bottom'; g.state.battingSide = 1;
  g.state.lineScore = [[0, 0, 0], [0, 0, 0]]; loaded(g); bodyPitch(g);
  advance(g, s => s.phase === 'result');
  assert.equal(g.state.pending, 'final'); assert.deepEqual(g.state.score, [0, 1]); assert.equal(g.state.hits[1], 0);
  g.command({ type: 'next', side: 0 }); assert.equal(g.state.phase, 'final');
});

test('a delayed legal swing at a pitch that hit the batter is a dead-ball strike, never first base', () => {
  const g = game({ inputWindow: .2 }); loaded(g); g.state.strikes = 2;
  const runner = g.state.runners.find(r => r.fromBase === 3);
  g.command({ type: 'steal', side: 0, runnerId: runner.id }); bodyPitch(g);
  advance(g, s => s.time >= s.pitch.contactAt + .08);
  assert.ok(g.state.pitch.hitByPitch); assert.equal(g.state.phase, 'pitch'); assert.equal(g.state.hitByPitches[0], 0);
  assert.equal(g.command({ type: 'swing', side: 0, time: g.state.pitch.contactAt, aim: { x: 0, y: 0 } }), true);
  assert.equal(g.state.phase, 'result'); assert.equal(g.state.result.kind, 'strikeout'); assert.equal(g.state.outs, 1);
  assert.deepEqual(g.state.bases.map(r => r.id), [21, 22, 23]); assert.equal(g.state.score[0], 0);
  assert.equal(g.state.play, null); assert.equal(g.state.hitByPitches[0], 0);
  assert.ok(g.state.runners.every(r => !r.stealing && r.pathPosition === r.fromBase));
});

test('a recorded body touch on a strike-zone pitch is a dead-ball strike with no award', () => {
  const g = game(); pitch(g);
  g.state.pitch.hitByPitch = { at: g.state.pitch.contactAt, point: { x: 0, y: 1, z: 0 }, hand: 'R', playerId: g.currentBatter.id };
  advance(g, s => s.phase === 'result');
  assert.equal(g.state.result.kind, 'strike'); assert.equal(g.state.strikes, 1);
  assert.equal(g.state.bases[0], null); assert.equal(g.state.hitByPitches[0], 0); assert.equal(g.state.pitch.deadBall, true);
});

test('a snapshot during HBP input grace gives the same dead-ball award on resume', () => {
  const g = game(); loaded(g); bodyPitch(g);
  advance(g, s => !!s.pitch.hitByPitch);
  const copy = new BaseballGame().restore(g.snapshot());
  advance(g, s => s.phase === 'result'); advance(copy, s => s.phase === 'result');
  assert.deepEqual(copy.snapshot(), g.snapshot());
});

test('left-handed early contact pulls right while right-handed early contact pulls left', () => {
  const velocities = [];
  for (const hand of ['R', 'L']) {
    const g = game(); pitch(g); advance(g, s => s.time >= s.pitch.contactAt);
    g.state.pitch.batter = { ...g.state.pitch.batter, hand, contact: 1, power: 1 };
    assert.equal(g.command({ type: 'swing', side: 0, time: g.state.pitch.contactAt - .08, aim: { x: 0, y: 0 } }), true);
    assert.equal(g.state.phase, 'live'); velocities.push(g.state.ball.vx);
  }
  assert.ok(velocities[0] < 0); assert.ok(velocities[1] > 0);
  assert.ok(Math.abs(velocities[0] + velocities[1]) < 1e-9);
  assert.equal(AIM_AREA.x, .65, 'batting aim retains the original reach');
});

test('a swing miss waits for a glancing body impact just behind the plate before any steal throw', () => {
  const g = game(); loaded(g); bodyPitch(g);
  Object.assign(g.state, { time: 5, tick: 600, phase: 'pitch', phaseStartedAt: 4, phaseTime: 1 });
  Object.assign(g.state.pitch, { target: { x: -.765, y: 1, z: 0 }, start: { x: -.32, y: 1.88, z: 18.44 },
    breakX: 0, breakY: 0, releaseAt: 4, contactAt: 5, duration: 1, hitByPitch: null });
  const runner = g.state.runners[0]; runner.stealing = true; runner.targetBase = 2;
  assert.equal(g.command({ type: 'swing', side: 0, time: 5, aim: { x: 0, y: 0 } }), true);
  assert.equal(g.state.phase, 'pitch'); assert.equal(g.state.pitch.resolved, false);
  advance(g, s => s.phase === 'result');
  assert.ok(g.state.pitch.hitByPitch.at > g.state.pitch.contactAt);
  assert.equal(g.state.result.kind, 'strike'); assert.equal(g.state.pitch.deadBall, true);
  assert.equal(g.state.play, null); assert.deepEqual(g.state.bases.map(r => r.id), [21, 22, 23]);
});

test('a contact specialist retains the full late timing window plus the accepted input budget', () => {
  const g = game({ difficulty: 'club', inputWindow: .2 }); g.state.batterIndex[0] = 8;
  pitch(g);
  const p = g.state.pitch, window = g.difficulty.timing * p.batter.contact;
  assert.ok(window > g.difficulty.timing);
  advance(g, s => s.time >= p.contactAt + .357);
  assert.equal(g.state.phase, 'pitch');
  assert.equal(g.command({ type: 'swing', side: 0, time: p.contactAt + window - .001, aim: { x: 0, y: 0 } }), true, g.lastRejection);
  assert.equal(g.state.phase, 'live');
});
