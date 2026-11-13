import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BaseballGame, STEP, AIM_AREA, BALL_RADIUS, BASES,
  fieldRadius, inStrikeZone, isFair, sweptSphereTime,
} from '../public/engine.mjs';

function advance(game, predicate, maximum = 30) {
  for (let tick = 0; tick < maximum / STEP; tick++) {
    if (predicate(game.state)) return;
    game.update(STEP);
  }
  assert.fail(`Timed out waiting in ${game.state.phase}`);
}
function patch(game, mutate) {
  const snapshot = game.snapshot(); mutate(snapshot.state); game.restore(snapshot); return game;
}
function pitchAt(game, target) {
  advance(game, s => s.phase === 'pitch');
  patch(game, s => { s.pitch.target = { ...target, z: 0 }; s.pitch.aiSwing = null; });
}
function knownContact(game, { power = false, offset = -0.01, aim = { x: 0, y: 0 } } = {}) {
  pitchAt(game, { x: 0, y: 1 });
  advance(game, s => s.time >= s.pitch.contactAt + offset);
  assert.equal(game.command({ type: 'swing', aim, power, time: game.state.time }), true);
  advance(game, s => s.phase === 'live' || s.phase === 'result');
}
const runner = id => ({ id, number: id, side: 0, speed: 7 });

test('a fixed simulation produces the same state at 30, 60 and 120 Hz', () => {
  const states = [30, 60, 120].map(rate => {
    const game = new BaseballGame({ seed: 8291 });
    for (let i = 0; i < rate * 6; i++) game.update(1 / rate);
    return game.state;
  });
  assert.deepEqual(states[0], states[1]);
  assert.deepEqual(states[1], states[2]);
});

test('guidance changes instructions only, preserving identical seeded physics', () => {
  const games = ['simple', 'moderate', 'expert'].map(guidance => new BaseballGame({ seed: 2003, guidance }));
  for (const game of games) {
    knownContact(game);
    advance(game, s => s.phase === 'result');
  }
  const results = games.map(game => ({ ball: game.state.ball, result: game.state.result, contact: game.state.lastContact }));
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});

test('pitch plate crossing includes the ball radius at all four strike-zone edges', () => {
  assert.equal(inStrikeZone({ x: 0.235 + BALL_RADIUS * 0.9, y: 1 }), true);
  assert.equal(inStrikeZone({ x: 0.235 + BALL_RADIUS * 1.1, y: 1 }), false);
  assert.equal(inStrikeZone({ x: 0, y: 0.5 - BALL_RADIUS * 0.9 }), true);
  assert.equal(inStrikeZone({ x: 0, y: 1.45 + BALL_RADIUS * 1.1 }), false);
});

test('taking three strikes retires a batter and next clears the count', () => {
  const game = new BaseballGame({ seed: 4 });
  for (let n = 0; n < 3; n++) {
    pitchAt(game, { x: 0, y: 1 });
    advance(game, s => s.phase === 'result');
    if (n < 2) { assert.equal(game.state.strikes, n + 1); game.command({ type: 'next' }); }
  }
  assert.equal(game.state.result.kind, 'strikeout'); assert.equal(game.state.outs, 1);
  assert.equal(game.command({ type: 'next' }), true);
  assert.equal(game.state.strikes, 0); assert.equal(game.state.balls, 0);
  assert.equal(game.state.batterIndex[0], 1);
});

test('taking ball four only moves forced runners', () => {
  const game = new BaseballGame();
  patch(game, s => { s.balls = 3; s.bases = [null, runner(2), runner(3)]; });
  pitchAt(game, { x: 0.6, y: 1 }); advance(game, s => s.phase === 'result');
  assert.equal(game.state.result.kind, 'walk');
  assert.equal(game.state.bases[1].id, 2); assert.equal(game.state.bases[2].id, 3);
  assert.equal(game.state.score[0], 0);
});

test('a bases-loaded walk scores exactly one run and shifts all forced runners', () => {
  const game = new BaseballGame();
  patch(game, s => { s.balls = 3; s.bases = [runner(11), runner(12), runner(13)]; });
  pitchAt(game, { x: -0.6, y: 1 }); advance(game, s => s.phase === 'result');
  assert.equal(game.state.score[0], 1); assert.equal(game.state.lineScore[0][0], 1);
  assert.equal(game.state.bases[1].id, 11); assert.equal(game.state.bases[2].id, 12);
  assert.equal(game.state.hits[0], 0);
});

test('a foul with two strikes leaves the batter alive and runners in place', () => {
  const game = new BaseballGame({ seed: 1 });
  patch(game, s => { s.strikes = 2; s.bases = [runner(9), null, null]; });
  knownContact(game, { offset: -0.18 }); advance(game, s => s.phase === 'result');
  assert.equal(game.state.result.kind, 'foul'); assert.equal(game.state.strikes, 2);
  assert.equal(game.state.outs, 0); assert.equal(game.state.bases[0].id, 9);
});

test('an on-time swing creates a physical fair ball while a very early swing misses', () => {
  const hit = new BaseballGame({ seed: 31 }); knownContact(hit);
  assert.equal(hit.state.phase, 'live'); assert.equal(hit.state.play.fair, true);
  assert.ok(hit.state.ball.vz > 15); assert.ok(hit.state.lastContact.quality > 0.8);
  const miss = new BaseballGame({ seed: 31 }); pitchAt(miss, { x: 0, y: 1 });
  miss.command({ type: 'swing', aim: { x: 0, y: 0 }, time: miss.state.time });
  advance(miss, s => s.phase === 'result');
  assert.equal(miss.state.result.kind, 'strike'); assert.equal(miss.state.lastContact.timingLabel, 'Too early');
});

test('stale, future and duplicate swing commands cannot rewrite a pitch', () => {
  const game = new BaseballGame(); pitchAt(game, { x: 0, y: 1 });
  assert.equal(game.command({ type: 'swing', time: game.state.time - 0.101 }), false);
  assert.equal(game.command({ type: 'swing', time: game.state.time + 0.026 }), false);
  assert.equal(game.state.swing, null);
  assert.equal(game.command({ type: 'swing', time: game.state.time }), true);
  assert.equal(game.command({ type: 'swing', time: game.state.time }), false);
});

test('pitch IDs prevent a delayed command from being applied to a later pitch', () => {
  const game = new BaseballGame(); pitchAt(game, { x: 0, y: 1 });
  const previousPitchId = game.state.pitch.id;
  advance(game, s => s.phase === 'result'); game.command({ type: 'next', pitchId: previousPitchId });
  pitchAt(game, { x: 0, y: 1 });
  assert.equal(game.state.pitch.id, previousPitchId + 1);
  assert.equal(game.command({ type: 'swing', pitchId: previousPitchId, time: game.state.time }), false);
  assert.equal(game.state.swing, null);
  assert.equal(game.command({ type: 'swing', pitchId: game.state.pitch.id, time: game.state.time }), true);
  assert.equal(new BaseballGame().restore(game.snapshot()).state.nextPitchId, game.state.nextPitchId);
});

test('an optional pitch command ID cannot consume or skip a future pitch', () => {
  const game = new BaseballGame();
  patch(game, s => { s.half = 'bottom'; s.battingSide = 1; });
  assert.equal(game.command({ type: 'pitch', pitchId: 2, pitchType: 'fastball', quality: 1 }), false);
  assert.equal(game.state.nextPitchId, 1);
  assert.equal(game.command({ type: 'pitch', pitchId: 1, pitchType: 'fastball', quality: 1 }), true);
  assert.equal(game.state.pitch.id, 1); assert.equal(game.state.nextPitchId, 2);
});

test('a delayed local swing can resolve against its accepted plate timestamp', () => {
  const game = new BaseballGame({ seed: 3 }); pitchAt(game, { x: 0, y: 1 });
  const time = game.state.pitch.contactAt;
  advance(game, s => s.time >= time + 0.075);
  assert.equal(game.command({ type: 'swing', time, aim: { x: 0, y: 0 } }), true);
  assert.equal(game.state.phase, 'live'); assert.equal(game.state.lastContact.timing, 0);
});

test('rookie contact retains the late half of its advertised timing window', () => {
  const game = new BaseballGame({ seed: 3, difficulty: 'rookie' });
  pitchAt(game, { x: 0, y: 1 });
  advance(game, s => s.time >= s.pitch.contactAt + 0.17);
  assert.equal(game.command({ type: 'swing', time: game.state.time, aim: { x: 0, y: 0 } }), true);
  assert.equal(game.state.phase, 'live');
  assert.equal(game.state.lastContact.timingLabel, 'Late');
});

test('third out changes sides and clears occupied bases', () => {
  const game = new BaseballGame();
  patch(game, s => { s.outs = 2; s.strikes = 2; s.bases[2] = runner(8); });
  pitchAt(game, { x: 0, y: 1 }); advance(game, s => s.phase === 'result');
  assert.equal(game.state.pending, 'half'); game.command({ type: 'next' });
  assert.equal(game.state.phase, 'half'); game.command({ type: 'next' });
  assert.equal(game.state.half, 'bottom'); assert.equal(game.state.battingSide, 1);
  assert.equal(game.state.outs, 0); assert.deepEqual(game.state.bases, [null, null, null]);
  assert.equal(game.isBatting, false); assert.equal(game.state.phase, 'ready');
});

test('a home lead skips the final bottom half', () => {
  const game = new BaseballGame({ innings: 3 });
  patch(game, s => { s.inning = 3; s.score = [1, 2]; s.outs = 2; s.strikes = 2; });
  pitchAt(game, { x: 0, y: 1 }); advance(game, s => s.phase === 'result');
  assert.equal(game.state.pending, 'final'); game.command({ type: 'next' });
  assert.equal(game.state.phase, 'final'); assert.equal(game.state.result.winner, 1);
  assert.equal(game.state.half, 'top');
});

test('a tied final bottom sends the game to extra innings', () => {
  const game = new BaseballGame({ innings: 3 });
  patch(game, s => { s.inning = 3; s.half = 'bottom'; s.battingSide = 1; s.score = [2, 2]; s.outs = 2; s.strikes = 2; });
  assert.equal(game.command({ type: 'pitch', pitchType: 'fastball', aim: { x: 0, y: 0 }, quality: 1 }), true);
  patch(game, s => { s.pitch.aiSwing = null; }); advance(game, s => s.phase === 'result');
  assert.equal(game.state.pending, 'half'); game.command({ type: 'next' }); game.command({ type: 'next' });
  assert.equal(game.state.inning, 4); assert.equal(game.state.half, 'top');
  assert.equal(game.state.lineScore[0].length, 4);
});

test('a walkoff walk ends the game immediately after the winning run', () => {
  const game = new BaseballGame({ innings: 3 });
  patch(game, s => { s.inning = 3; s.half = 'bottom'; s.battingSide = 1; s.score = [2, 2]; s.balls = 3; s.bases = [runner(11), runner(12), runner(13)]; });
  game.command({ type: 'pitch', pitchType: 'fastball', aim: { x: 1, y: 0 }, quality: 1 });
  patch(game, s => { s.pitch.aiSwing = null; }); advance(game, s => s.phase === 'result');
  assert.equal(game.state.score[1], 3); assert.equal(game.state.pending, 'final');
  game.command({ type: 'next' }); assert.equal(game.state.phase, 'final');
});

test('swept collision catches a fast ball that neither endpoint overlaps', () => {
  const t = sweptSphereTime({ x: -4, y: 1, z: 0 }, { x: 4, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5);
  assert.ok(t > 0 && t < 1);
  assert.equal(sweptSphereTime({ x: -4, y: 4, z: 0 }, { x: 4, y: 4, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5), null);
});

test('fair territory, base geometry and fence curvature use a single coordinate system', () => {
  assert.equal(isFair(10, 10), true); assert.equal(isFair(10.01, 10), false); assert.equal(isFair(0, -1), false);
  assert.equal(fieldRadius(0), 115); assert.equal(fieldRadius(Math.PI / 4), 105);
  assert.equal(BASES[1].x, -BASES[3].x); assert.equal(BASES[2].z, BASES[1].z * 2);
});

test('snapshot restore replays the same pitch and contact with no random divergence', () => {
  const original = new BaseballGame({ seed: 933 }); pitchAt(original, { x: 0.1, y: 1.1 });
  const resumed = new BaseballGame().restore(original.snapshot());
  for (const game of [original, resumed]) {
    advance(game, s => s.time >= s.pitch.contactAt - 0.01);
    game.command({ type: 'swing', time: game.state.time, aim: { x: 0.1 / AIM_AREA.x, y: 0.1 / AIM_AREA.y } });
    advance(game, s => s.phase === 'result');
  }
  assert.deepEqual(original.state, resumed.state);
});

test('practice stays in batting mode after repeated strikeouts', () => {
  const game = new BaseballGame({ mode: 'practice' });
  for (let n = 0; n < 9; n++) {
    pitchAt(game, { x: 0, y: 1 }); advance(game, s => s.phase === 'result'); game.command({ type: 'next' });
  }
  assert.equal(game.state.half, 'top'); assert.equal(game.state.outs, 0); assert.equal(game.isBatting, true);
  assert.equal(game.state.practice.pitches, 9);
});

test('a home run over the fair fence clears all bases and scores every runner', () => {
  const game = new BaseballGame({ seed: 100 });
  patch(game, s => { s.bases = [runner(11), runner(12), runner(13)]; });
  knownContact(game);
  patch(game, s => {
    s.ball = { ...s.ball, x: 0, y: 8, z: 114.9, vx: 0, vy: -1, vz: 45, bounced: false };
    s.play.maxDistance = 114.9; s.play.hitAt = s.time - 4; s.play.age = 4;
  });
  game.update(STEP);
  assert.equal(game.state.result.kind, 'homeRun'); assert.deepEqual(game.state.score, [4, 0]);
  assert.deepEqual(game.state.bases, [null, null, null]); assert.equal(game.state.hits[0], 1);
});

test('a bounced ball cannot become a home run and remains in play off the wall', () => {
  const game = new BaseballGame({ seed: 100 }); knownContact(game);
  patch(game, s => {
    s.ball = { ...s.ball, x: 0, y: 0.8, z: 114.9, vx: 0, vy: 1, vz: 45, bounced: true };
    s.play.maxDistance = 114.9;
  });
  game.update(STEP);
  assert.equal(game.state.phase, 'live'); assert.ok(game.state.ball.vz < 0);
  assert.equal(game.state.score[0], 0);
});

test('outfielders cannot chase a predicted landing point through the fence', () => {
  const game = new BaseballGame({ seed: 10 }); knownContact(game);
  patch(game, s => {
    s.ball = { ...s.ball, x: 0, y: 25, z: 105, vx: 0, vy: 8, vz: 20, bounced: false };
    s.play.landing = { x: 0, z: 180, time: 7 };
    const center = s.fielders.find(f => f.id === 'CF'); center.x = 0; center.z = 114.4;
  });
  game.update(0.25);
  for (const f of game.state.fielders) assert.ok(Math.hypot(f.x, f.z) <= fieldRadius(Math.atan2(f.x, f.z)) - 0.55 + 1e-8);
  assert.equal(game.state.phase, 'live');
});
