import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, BASES, BASE_DISTANCE, STEP } from '../public/engine.mjs';

function advance(game, predicate, seconds = 25) {
  for (let i = 0; i < seconds / STEP; i++) { if (predicate(game.state)) return; game.update(STEP); }
  assert.fail(`Timed out in ${game.state.phase}/${game.state.play?.stage}: ${JSON.stringify(game.state.runners)}`);
}
function seconds(game, duration) { for (let i = 0; i < duration / STEP; i++) game.update(STEP); }
function occupied(bases = [1], options = {}) {
  const game = new BaseballGame({ seed: 2003, difficulty: 'club', humanSides: [0, 1], ...options });
  game.state.bases = [1, 2, 3].map(base => bases.includes(base) ? { id: base + 20, number: base + 4, side: 0, speed: 7 } : null);
  game._ready();
  return game;
}
function lead(game, base, amount) {
  const r = game.state.runners.find(r => r.fromBase === base);
  assert.equal(game.command({ type: 'lead', runnerId: r.id, amount, side: 0 }), true);
  seconds(game, 1);
  return r;
}
function pitch(game, pitchType = 'fastball') {
  assert.equal(game.command({ type: 'pitch', pitchType, quality: 1, aim: { x: 0, y: 0 }, side: 1 }), true);
}
function thrownSteal({ amount = 1, pitchType = 'fastball', outs = 0, strikes = 0, opponentPitcher = 'balanced' } = {}) {
  const game = occupied([1], { opponentPitcher });
  game.state.outs = outs; game.state.strikes = strikes;
  const runner = lead(game, 1, amount);
  assert.equal(game.command({ type: 'steal', runnerId: runner.id, side: 0 }), true);
  pitch(game, pitchType);
  advance(game, s => s.phase === 'live');
  assert.equal(game.state.play.kind, 'steal');
  assert.equal(game.command({ type: 'throw', base: 2, side: 1 }), true);
  advance(game, s => s.phase === 'result');
  return { game, runner };
}
function contact(bases = [3], outs = 0) {
  const game = occupied(bases);
  game.state.outs = outs;
  pitch(game);
  advance(game, s => s.phase === 'pitch' && s.time >= s.pitch.contactAt);
  assert.equal(game.command({ type: 'swing', side: 0, time: game.state.pitch.contactAt, aim: { x: 0, y: 0 } }), true);
  assert.equal(game.state.phase, 'live');
  return game;
}
function placeRunner(runner, path, time) {
  const i = Math.min(3, Math.floor(path)), fraction = path - i;
  runner.pathPosition = runner.prevPathPosition = path;
  runner.x = runner.prevX = BASES[i].x + (BASES[i + 1].x - BASES[i].x) * fraction;
  runner.z = runner.prevZ = BASES[i].z + (BASES[i + 1].z - BASES[i].z) * fraction;
  runner.safe = Math.abs(path - Math.round(path)) < 1e-8;
  runner.base = Math.floor(path); runner.highestBase = Math.max(runner.base, runner.highestBase);
  if (runner.safe) runner.touchedAt[runner.base] = time;
}
function catchBall(game, distance = 105) {
  const f = game.state.fielders.find(f => f.id === 'CF');
  f.x = f.prevX = 0; f.z = f.prevZ = distance;
  game.state.play.maxDistance = distance;
  game._catchFly(f, game.state.time);
}

test('online sides disable CPU pitch/swing and enforce side-specific commands', () => {
  const game = new BaseballGame({ humanSides: [0, 1], localSide: 1, pitcher: 'power', opponentPitcher: 'knuckle' });
  seconds(game, 5); assert.equal(game.state.phase, 'ready');
  assert.equal(game.isBatting, false); assert.equal(game.isHumanBatting, true);
  assert.equal(game.activePitcher.id, 'knuckle');
  assert.equal(game.command({ type: 'pitch', pitchType: 'knuckleball', side: 0 }), false);
  assert.equal(game.command({ type: 'pitch', pitchType: 'knuckleball', side: 1, quality: 1 }), true);
  assert.equal(game.state.pitch.aiSwing, null);
  assert.equal(game.command({ type: 'swing', side: 1 }), false);
  advance(game, s => s.phase === 'result');
  assert.equal(game.state.swing, null);
  game.state.battingSide = 1; assert.equal(game.activePitcher.id, 'power');
  assert.equal(game.isBatting, true);
});

test('online human batting uses the selected difficulty on both teams', () => {
  const game = new BaseballGame({ humanSides: [0, 1], difficulty: 'rookie' });
  game.state.battingSide = 1; game.state.half = 'bottom';
  game.command({ type: 'pitch', pitchType: 'fastball', side: 0, quality: 1 });
  advance(game, s => s.phase === 'pitch' && s.time >= s.pitch.contactAt + 0.18);
  assert.equal(game.command({ type: 'swing', side: 1, time: game.state.time, aim: { x: 0, y: 0 } }), true);
  assert.equal(game.state.phase, 'live', 'home human should retain Rookie late contact window');
});

test('configured network swing budget accepts bounded late delivery and refuses excess rewind', () => {
  const game = new BaseballGame({ humanSides: [0, 1], inputWindow: 0.2 });
  game.command({ type: 'pitch', pitchType: 'fastball', side: 1, quality: 1 });
  advance(game, s => s.phase === 'pitch' && s.time >= s.pitch.contactAt + 0.15);
  assert.equal(game.command({ type: 'swing', side: 0, time: game.state.time - 0.21 }), false);
  assert.equal(game.command({ type: 'swing', side: 0, time: game.state.pitch.contactAt, aim: { x: 0, y: 0 } }), true);
  assert.equal(game.state.phase, 'live');
  assert.equal(new BaseballGame({ inputWindow: 10 }).options.inputWindow, 0.25);
});

test('lead choices move a runner physically and a smaller lead returns to the bag', () => {
  const game = occupied(), runner = lead(game, 1, 2);
  assert.ok(Math.abs((runner.pathPosition - 1) * BASE_DISTANCE - 4.8) < 1e-8);
  assert.equal(runner.safe, false);
  assert.equal(game.command({ type: 'lead', side: 0, runnerId: runner.id, amount: 0 }), true);
  advance(game, () => runner.safe);
  assert.equal(runner.pathPosition, 1);
  pitch(game);
  assert.equal(game.command({ type: 'lead', side: 0, runnerId: runner.id, amount: 2 }), false);
});

test('queued steals toggle before delivery and launch during the windup', () => {
  const game = occupied(), runner = game.state.runners[0];
  assert.equal(game.command({ type: 'steal', side: 0, runnerId: runner.id }), true);
  assert.equal(runner.stealQueued, true); seconds(game, 0.3);
  assert.equal(runner.pathPosition, 1);
  game.command({ type: 'steal', side: 0, runnerId: runner.id }); assert.equal(runner.stealQueued, false);
  game.command({ type: 'steal', side: 0, runnerId: runner.id }); pitch(game); seconds(game, 0.25);
  assert.equal(runner.stealing, true); assert.ok(runner.pathPosition > 1);
  assert.equal(game.command({ type: 'steal', side: 1, runnerId: runner.id }), false);
});

test('a steal cannot target an occupied bag unless the lead runner is also going', () => {
  const game = occupied([1, 2]), first = game.state.runners.find(r => r.fromBase === 1), second = game.state.runners.find(r => r.fromBase === 2);
  assert.equal(game.command({ type: 'steal', side: 0, runnerId: first.id }), false);
  assert.match(game.lastRejection, /occupied/);
  assert.equal(game.command({ type: 'steal', side: 0, runnerId: second.id }), true);
  assert.equal(game.command({ type: 'steal', side: 0, runnerId: first.id }), true);
});

test('a successful steal changes base occupancy without adding a hit or consuming the batter', () => {
  const { game, runner } = thrownSteal({ amount: 2 });
  assert.equal(game.state.result.kind, 'stolenBase');
  assert.equal(game.state.bases[0], null); assert.equal(game.state.bases[1].id, runner.id);
  assert.equal(game.state.hits[0], 0); assert.equal(game.state.batterIndex[0], 0);
  assert.equal(game.state.strikes, 1); assert.equal(game.state.pending, 'pitch');
  game.command({ type: 'next', side: 0 }); assert.equal(game.state.strikes, 1);
});

test('a runner without a lead can be thrown out stealing by a physical tag', () => {
  const { game, runner } = thrownSteal({ amount: 0 });
  assert.equal(game.state.result.kind, 'caughtStealing'); assert.equal(runner.out, true);
  assert.equal(game.state.outs, 1); assert.equal(game.state.bases[1], null);
  assert.equal(game.state.play.outs[0].type, 'tag'); assert.equal(game.state.batterIndex[0], 0);
});

test('the slower knuckleball gives a normal lead more time than a fastball', () => {
  const hard = thrownSteal({ amount: 1, pitchType: 'fastball', opponentPitcher: 'power' });
  const slow = thrownSteal({ amount: 1, pitchType: 'knuckleball', opponentPitcher: 'knuckle' });
  assert.equal(hard.runner.out, true); assert.equal(slow.runner.out, false);
});

test('a third out caught stealing ends the half without advancing the unfinished batter', () => {
  const { game } = thrownSteal({ amount: 0, outs: 2 });
  assert.equal(game.state.outs, 3); assert.equal(game.state.pending, 'half'); assert.equal(game.state.batterIndex[0], 0);
});

test('a strikeout followed by caught stealing records both outs and advances the batter once', () => {
  const { game } = thrownSteal({ amount: 0, outs: 1, strikes: 2 });
  assert.equal(game.state.outs, 3); assert.equal(game.state.pending, 'half'); assert.equal(game.state.batterIndex[0], 1);
  assert.match(game.state.result.detail, /Strike three/);
});

for (const [amount, expected] of [[0, false], [1, false], [2, true]]) test(`pickoff respects the physical return race at lead level ${amount}`, () => {
  const game = occupied(), runner = lead(game, 1, amount);
  const count = [game.state.balls, game.state.strikes, game.state.batterIndex[0]];
  assert.equal(game.command({ type: 'pickoff', side: 1, base: 1 }), true);
  assert.equal(game.state.play.kind, 'pickoff'); assert.equal(game.state.phase, 'live');
  advance(game, s => s.phase === 'result');
  assert.equal(runner.out, expected);
  assert.deepEqual([game.state.balls, game.state.strikes, game.state.batterIndex[0]], count);
  assert.equal(game.state.nextPitchId, 1);
});

test('manual retreat can beat the slower automatic reaction from an aggressive lead', () => {
  const game = occupied(), runner = lead(game, 1, 2);
  game.command({ type: 'pickoff', side: 1, base: 1 });
  assert.equal(game.command({ type: 'run', side: 0, runnerId: runner.id, action: 'retreat' }), true);
  advance(game, s => s.phase === 'result'); assert.equal(runner.out, false);
});

test('pickoff attempts are limited and invalid targets or stale pitch scope do not consume attempts', () => {
  const game = occupied();
  assert.equal(game.command({ type: 'pickoff', side: 1, base: 2 }), false);
  assert.equal(game.command({ type: 'pickoff', side: 1, base: 1, pitchId: 0 }), false);
  for (let i = 0; i < 2; i++) {
    assert.equal(game.command({ type: 'pickoff', side: 1, base: 1, pitchId: 1 }), true);
    advance(game, s => s.phase === 'result'); game.command({ type: 'next', side: 1 });
  }
  assert.equal(game.command({ type: 'pickoff', side: 1, base: 1 }), false); assert.match(game.lastRejection, /Two pickoff/);
  assert.equal(game.command({ type: 'pitch', side: 1, pitchType: 'fastball', quality: 1, pitchId: 1 }), true);
});

test('new baserunning practice starts with useful runners and allows time to choose', () => {
  const game = new BaseballGame({ mode: 'practice', scenario: 'runners' });
  assert.deepEqual(game.state.runners.map(r => r.fromBase), [1, 3]);
  seconds(game, 2); assert.equal(game.state.phase, 'ready');
  advance(game, s => s.phase === 'pitch'); assert.ok(game.state.pitch.releaseAt >= 4.65 - STEP);
});

test('contact preserves a steal runner’s position and a foul returns to the time-of-pitch bases', () => {
  const game = occupied(), runner = lead(game, 1, 2);
  game.command({ type: 'steal', runnerId: runner.id, side: 0 }); pitch(game);
  advance(game, s => s.phase === 'pitch' && s.time >= s.pitch.contactAt);
  const position = runner.pathPosition;
  game.command({ type: 'swing', side: 0, time: game.state.pitch.contactAt });
  assert.equal(game.state.runners.find(r => r.id === runner.id).pathPosition, position);
  game._foul();
  assert.equal(game.state.bases[0].id, runner.id); assert.equal(game.state.bases[1], null);
  assert.equal(game.state.runners.find(r => r.id === runner.id).pathPosition, 1);
});

test('a fly catch leaves a live tag-up decision and retires only the batter', () => {
  const game = contact([1, 3]), lead = game.state.runners.find(r => r.fromBase === 3);
  catchBall(game);
  assert.equal(game.state.phase, 'live'); assert.equal(game.state.outs, 1);
  assert.equal(game.state.play.caught, true); assert.equal(lead.tagReady, true); assert.equal(lead.out, false);
  assert.equal(game._forceBase(lead), 0);
});

test('an early runner physically retouches before a queued tag-up starts', () => {
  const game = contact([3]), runner = game.state.runners.find(r => r.fromBase === 3);
  placeRunner(runner, 3.15, game.state.time);
  catchBall(game);
  assert.equal(runner.tagRequired, true);
  game.command({ type: 'run', runnerId: runner.id, action: 'advance', side: 0 });
  assert.equal(runner.targetBase, 3); assert.equal(runner.tagQueued, true);
  advance(game, () => runner.tagReady);
  assert.equal(runner.pathPosition, 3); assert.equal(runner.targetBase, 4);
  assert.ok(runner.taggedAt >= game.state.play.catchAt);
  game.update(STEP); assert.ok(runner.pathPosition > 3);
});

test('throwing to the original base can double off a runner who has not retouched', () => {
  const game = contact([1]), runner = game.state.runners.find(r => r.fromBase === 1);
  placeRunner(runner, 1.4, game.state.time); runner.speed = 0;
  catchBall(game, 55);
  const f = game.state.fielders.find(f => f.id === '1B'); Object.assign(f, BASES[1], { prevX: BASES[1].x, prevZ: BASES[1].z });
  game._fieldBall(f); game.state.play.coverBase = 1;
  game.update(STEP);
  assert.equal(runner.out, true); assert.equal(game.state.outs, 2); assert.equal(game.state.play.outs.at(-1).type, 'retouch');
});

test('a legal tag from third on a deep fly scores a sacrifice without a hit', () => {
  const game = contact([3]), runner = game.state.runners.find(r => r.fromBase === 3);
  catchBall(game, 105);
  game.command({ type: 'run', side: 0, runnerId: runner.id, action: 'advance' });
  game.command({ type: 'throw', side: 1, base: 4 });
  advance(game, s => s.phase === 'result');
  assert.equal(game.state.result.kind, 'sacrificeFly'); assert.equal(game.state.score[0], 1);
  assert.equal(game.state.hits[0], 0); assert.equal(game.state.outs, 1); assert.equal(game.state.batterIndex[0], 1);
});

test('a shallow tag-up can be thrown out at home and a third-out catch cancels the attempt', () => {
  const game = contact([3]), runner = game.state.runners.find(r => r.fromBase === 3);
  catchBall(game, 50); game.command({ type: 'run', side: 0, runnerId: runner.id, action: 'advance' });
  game.command({ type: 'throw', side: 1, base: 4 });
  advance(game, s => s.phase === 'result'); assert.equal(runner.out, true); assert.equal(game.state.score[0], 0);
  const final = contact([3], 2); catchBall(final);
  assert.equal(final.state.phase, 'result'); assert.equal(final.state.outs, 3); assert.equal(final.state.score[0], 0);
  assert.equal(final.state.pending, 'half');
});

test('steal and tag-up snapshots preserve the same physical outcome and random state', () => {
  for (const kind of ['steal', 'tag']) {
    const game = kind === 'steal' ? occupied() : contact([3]);
    const runner = game.state.runners.find(r => r.fromBase === (kind === 'steal' ? 1 : 3));
    if (kind === 'steal') { game.command({ type: 'steal', side: 0, runnerId: runner.id }); pitch(game); seconds(game, 0.4); }
    else { placeRunner(runner, 3.15, game.state.time); catchBall(game); game.command({ type: 'run', side: 0, runnerId: runner.id, action: 'advance' }); }
    const restored = new BaseballGame().restore(game.snapshot());
    for (let i = 0; i < 1200; i++) { game.update(STEP); restored.update(STEP); }
    assert.deepEqual(game.snapshot(), restored.snapshot());
  }
});

test('a foul fly can be physically caught and still permits a legal tag-up', () => {
  const game = contact([3]), s = game.state, runner = s.runners.find(r => r.fromBase === 3), f = s.fielders.find(f => f.id === 'LF');
  Object.assign(s.ball, { x: -30, y: 1.7, z: 20, vx: 0, vy: 0, vz: 0, bounced: false });
  Object.assign(f, { x: -30, prevX: -30, z: 20, prevZ: 20 });
  Object.assign(s.play, { fair: false, hitAt: s.time - 0.5, landing: { x: -30, z: 20 }, maxDistance: 35 });
  game.update(STEP);
  assert.equal(s.play.caught, true); assert.equal(s.play.foulCatch, true); assert.equal(s.play.fair, true);
  assert.equal(s.phase, 'live'); assert.equal(s.outs, 1); assert.equal(runner.tagReady, true);
  assert.equal(game.command({ type: 'run', side: 0, runnerId: runner.id, action: 'advance' }), true);
});

test('ball four on a steal awards only the forced bases and cannot duplicate the runner', () => {
  const game = occupied([1, 2, 3]), runner = lead(game, 1, 2);
  game.state.balls = 3;
  // Moving the lead runners first permits a loaded-base attempt without targeting a stationary runner.
  for (const r of [...game.state.runners].reverse()) game.command({ type: 'steal', side: 0, runnerId: r.id });
  pitch(game); advance(game, s => s.phase === 'pitch');
  game.state.pitch.resolved = true; game._calledPitch(false, false);
  assert.equal(game.state.result.kind, 'walk'); assert.equal(game.state.score[0], 1);
  assert.equal(game.state.bases[1].id, runner.id);
  const ids = game.state.bases.filter(Boolean).map(r => r.id); assert.equal(new Set(ids).size, ids.length);
  assert.equal(game.state.batterIndex[0], 1);
});

test('a third strike for the third out immediately ends a simultaneous steal attempt', () => {
  const game = occupied(), runner = lead(game, 1, 2);
  game.state.outs = 2; game.state.strikes = 2;
  game.command({ type: 'steal', runnerId: runner.id, side: 0 }); pitch(game);
  advance(game, s => s.phase === 'result');
  assert.equal(game.state.result.kind, 'strikeout'); assert.equal(game.state.outs, 3);
  assert.equal(game.state.pending, 'half'); assert.equal(game.state.batterIndex[0], 1);
  assert.equal(game.state.hits[0], 0);
});

for (const before of [true, false]) test(`a retouch appeal third out ${before ? 'after' : 'before'} a legal home crossing uses time-play scoring`, () => {
  const game = contact([1, 3], 1), s = game.state;
  const first = s.runners.find(r => r.fromBase === 1), third = s.runners.find(r => r.fromBase === 3);
  placeRunner(first, 1.4, s.time); first.speed = 0;
  catchBall(game);
  assert.equal(s.outs, 2);
  third.scored = true; third.pathPosition = third.prevPathPosition = 4; third.base = third.highestBase = 4;
  third.scoredAt = s.time + (before ? -0.05 : 0.05); s.play.runCrossings = [{ runnerId: third.id, time: third.scoredAt }];
  const f = s.fielders.find(f => f.id === '1B'); Object.assign(f, BASES[1], { prevX: BASES[1].x, prevZ: BASES[1].z });
  game._fieldBall(f); s.play.coverBase = 1;
  game.update(STEP);
  assert.equal(s.phase, 'result'); assert.equal(s.play.outs.at(-1).type, 'retouch');
  assert.equal(s.score[0], before ? 1 : 0);
});

test('CPU runner choices are seeded, can attempt home rarely, and never target a stationary occupied bag', () => {
  let attempts = 0, homeAttempts = 0;
  for (let seed = 1; seed <= 1800; seed++) {
    const game = occupied([1, 2, 3], { seed, humanSides: [1], localSide: 1 });
    game.state.phaseTime = 0.5; game._cpuRunningDecisions();
    assert.equal(game.state.runners.find(r => r.fromBase === 1).stealQueued, false);
    assert.equal(game.state.runners.find(r => r.fromBase === 2).stealQueued, false);
    if (game.state.runners.find(r => r.fromBase === 3).stealQueued) homeAttempts++;
    const open = occupied([1], { seed, humanSides: [1], localSide: 1 });
    open.state.phaseTime = 0.5; open._cpuRunningDecisions();
    if (open.state.runners[0].stealQueued) attempts++;
  }
  assert.ok(attempts > 250 && attempts < 700, `${attempts} second-base attempts`);
  assert.ok(homeAttempts > 0 && homeAttempts < 65, `${homeAttempts} home attempts`);
});

test('a third-out catch never scores a run even if the batter physically reached first during flight', () => {
  const game = contact([3], 2), s = game.state;
  const scorer = s.runners.find(r => r.fromBase === 3), batter = s.runners.find(r => r.fromBase === 0);
  placeRunner(batter, 1.3, s.time - 0.1); batter.touchedAt[1] = s.time - 0.1;
  scorer.scored = true; scorer.scoredAt = s.time - 0.1; scorer.pathPosition = 4;
  s.play.runCrossings = [{ runnerId: scorer.id, time: scorer.scoredAt }];
  catchBall(game);
  assert.equal(s.phase, 'result'); assert.equal(s.outs, 3); assert.equal(s.score[0], 0);
  assert.match(s.result.detail, /No run/);
});
