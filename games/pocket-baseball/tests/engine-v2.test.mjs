import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, BASES, STEP, BALL_RADIUS, PITCHERS, PITCHES, pitchPosition } from '../public/engine.mjs';

function advance(game, predicate, seconds = 30) {
  for (let i = 0; i < seconds / STEP; i++) { if (predicate(game.state)) return; game.update(STEP); }
  assert.fail(`Timed out: ${game.state.phase}/${game.state.play?.stage} ${JSON.stringify(game.state.runners)}`);
}
function runner(id, side = 0) { return { id, number: id, side, speed: 6.8 }; }
function live({ occupied = [], defense = false, outs = 0 } = {}) {
  const game = new BaseballGame({ seed: 7143 });
  const s = game.state;
  s.time = 5; s.tick = 600; s.phase = 'pitch'; s.outs = outs;
  s.bases = [1, 2, 3].map(base => occupied.includes(base) ? runner(base + 20) : null);
  s.pitch = { id: 1, type: 'fastball', mph: 94, quality: 1, target: { x: 0.04, y: 1.04, z: 0 },
    start: { x: -0.32, y: 1.88, z: 18.44 }, breakX: 0.04, breakY: 0.06,
    duration: 1, releaseAt: 4, contactAt: 5, resolved: false, aiSwing: null };
  assert.equal(game.command({ type: 'swing', time: 5, aim: { x: 0, y: 0 } }), true);
  if (defense) { s.half = 'bottom'; s.battingSide = 1; for (const r of s.runners) r.side = 1; }
  Object.assign(s.ball, { x: 0, y: BALL_RADIUS, z: 60, vx: 0, vy: 0, vz: 0, bounced: true });
  s.play.maxDistance = 30;
  for (const [base, id] of [[1, '1B'], [2, '2B'], [3, '3B'], [4, 'C']]) {
    const f = s.fielders.find(p => p.id === id); Object.assign(f, BASES[base], { prevX: BASES[base].x, prevZ: BASES[base].z });
  }
  return game;
}
function position(game, r, path, target = Math.ceil(path)) {
  const base = Math.min(3, Math.floor(path)), fraction = path - base;
  Object.assign(r, { pathPosition: path, prevPathPosition: path, progress: path - r.fromBase,
    base: Math.floor(path), highestBase: Math.floor(path), targetBase: target, manual: true,
    x: BASES[base].x + (BASES[base + 1].x - BASES[base].x) * fraction,
    z: BASES[base].z + (BASES[base + 1].z - BASES[base].z) * fraction,
    safe: Math.abs(path - Math.round(path)) < 1e-8, scored: path >= 4 });
  r.prevX = r.x; r.prevZ = r.z;
  for (let b = Math.max(1, r.fromBase); b <= Math.floor(path); b++) r.touchedAt[b] = game.state.time - 1;
  if (path >= 1 && r.fromBase === 0) r.firstBaseAt = game.state.time - 1;
}
function possession(game, id, point) {
  const s = game.state, f = s.fielders.find(p => p.id === id);
  if (point) Object.assign(f, point, { prevX: point.x, prevZ: point.z });
  for (const other of s.fielders) other.hasBall = other.id === id;
  Object.assign(s.play, { stage: 'held', fielder: id, heldAt: s.time, throwReadyAt: s.time,
    decisionUntil: s.time + 2, possessionAt: s.time, transferUntil: null });
  Object.assign(s.ball, { x: f.x, y: 1.4, z: f.z, vx: 0, vy: 0, vz: 0 });
  return f;
}

test('each pitcher enforces a distinct repertoire and knuckle specialist has only three choices', () => {
  assert.deepEqual(PITCHERS.knuckle.pitches, ['knuckleball', 'fastball', 'changeup']);
  for (const id of Object.keys(PITCHERS)) {
    const game = new BaseballGame({ pitcher: id }); game.state.half = 'bottom'; game.state.battingSide = 1;
    assert.equal(game.activePitcher.id, id); assert.deepEqual(game.availablePitches, PITCHERS[id].pitches);
    const invalid = Object.keys(PITCHES).find(key => !game.availablePitches.includes(key));
    assert.equal(game.command({ type: 'pitch', pitchType: invalid, quality: 1 }), false);
    assert.equal(game.state.nextPitchId, 1);
    assert.equal(game.command({ type: 'pitch', pitchType: game.availablePitches[0], quality: 1 }), true);
  }
});

test('knuckle pitches are seeded, slower, imperfectly located and markedly different when they hang', () => {
  function pitch(seed, quality) {
    const g = new BaseballGame({ seed, pitcher: 'knuckle' }); g.state.battingSide = 1; g.state.half = 'bottom';
    g.command({ type: 'pitch', pitchType: 'knuckleball', quality, aim: { x: 0, y: 0 } });
    return g.state.pitch;
  }
  let goodHangs = 0, badHangs = 0, locationError = 0;
  for (let seed = 2000; seed < 2200; seed++) {
    const good = pitch(seed, 1), bad = pitch(seed, 0.05);
    assert.deepEqual(good, pitch(seed, 1));
    assert.ok(good.mph < 73); locationError += Math.abs(good.target.x) + Math.abs(good.target.y - 1);
    goodHangs += Number(good.execution.hanging); badHangs += Number(bad.execution.hanging);
    assert.ok(bad.execution.hanging ? bad.flutter.amplitude < 0.04 : bad.flutter.amplitude >= 0.2);
    const mid = pitchPosition(good, good.releaseAt + good.duration * 0.6);
    assert.ok(Number.isFinite(mid.x) && Number.isFinite(mid.y));
    const atPlate = pitchPosition(good, good.contactAt);
    assert.ok(Math.abs(atPlate.x - good.target.x) < 1e-10);
  }
  assert.ok(locationError > 5, 'perfect release incorrectly guarantees precise knuckleball command');
  assert.ok(badHangs > goodHangs + 60, `${badHangs} poor-release hangs vs ${goodHangs} good-release hangs`);
});

test('the knuckle specialist’s fallback fastball cannot borrow the power pitcher velocity', () => {
  const speeds = ['knuckle', 'power'].map(pitcher => {
    const g = new BaseballGame({ seed: 12, pitcher }); g.state.battingSide = 1;
    g.command({ type: 'pitch', pitchType: 'fastball', quality: 1 }); return g.state.pitch.mph;
  });
  assert.ok(speeds[0] <= 84); assert.ok(speeds[1] >= 95);
});

test('batting practice uses the selected opposing pitcher and never chooses outside the repertoire', () => {
  const g = new BaseballGame({ mode: 'practice', opponentPitcher: 'knuckle', seed: 733 });
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    advance(g, s => s.phase === 'pitch'); seen.add(g.state.pitch.type);
    assert.ok(PITCHERS.knuckle.pitches.includes(g.state.pitch.type));
    advance(g, s => s.phase === 'result'); g.command({ type: 'next' });
  }
  assert.ok(seen.has('knuckleball')); assert.ok(seen.has('fastball'));
});

test('a batter can choose second immediately after contact and physically run both legs', () => {
  const g = live(), batter = g.state.runners.find(r => r.fromBase === 0);
  for (const f of g.state.fielders) { f.x = -70; f.z = 40; f.speed = 0; }
  Object.assign(g.state.ball, { x: 60, z: 70 });
  assert.equal(g.command({ type: 'run', runnerId: batter.id, action: 'advance' }), true);
  assert.equal(batter.targetBase, 2); assert.equal(batter.base, 0);
  advance(g, () => batter.base === 2, 10);
  assert.equal(batter.safe, true); assert.equal(batter.pathPosition, 2);
  assert.ok(Math.hypot(batter.x - BASES[2].x, batter.z - BASES[2].z) < 1e-8);
  assert.ok(g.state.time - g.state.play.hitAt > 7.5, 'runner was awarded a double before running the distance');
});

test('hold stops at the upcoming bag and retreat returns to the last touched base', () => {
  const g = live(), batter = g.state.runners.find(r => r.fromBase === 0);
  position(g, batter, 1.45, 3); possession(g, 'CF', { x: 0, z: 90 });
  assert.equal(g.command({ type: 'run', runnerId: batter.id, action: 'hold' }), true);
  assert.equal(batter.targetBase, 2);
  assert.equal(g.command({ type: 'run', runnerId: batter.id, action: 'retreat' }), true);
  assert.equal(batter.targetBase, 1);
  advance(g, () => batter.safe && batter.base === 1, 4);
  assert.equal(batter.out, false); assert.equal(batter.pathPosition, 1);
});

test('a forced runner cannot retreat into the trailing runner’s required base', () => {
  const g = live({ occupied: [1] }), lead = g.state.runners.find(r => r.fromBase === 1);
  position(g, lead, 1.3, 2);
  assert.equal(g.command({ type: 'run', runnerId: lead.id, action: 'retreat' }), false);
  assert.match(g.lastRejection, /forced/);
  assert.equal(g.command({ type: 'run', runnerId: lead.id, action: 'hold' }), true);
  assert.equal(lead.targetBase, 2);
});

for (const base of [2, 3, 4]) test(`a throw to ${base === 4 ? 'home' : `base ${base}`} records a real force when the chain is intact`, () => {
  const occupied = Array.from({ length: base - 1 }, (_, i) => i + 1);
  const g = live({ occupied, defense: true });
  for (const r of g.state.runners) position(g, r, r.fromBase + 0.12, r.fromBase + 1);
  possession(g, 'SS', { x: -7, z: 24 });
  assert.equal(g.command({ type: 'throw', base }), true);
  advance(g, s => s.play.outs.some(out => out.base === base), 5);
  assert.equal(g.state.play.outs.find(out => out.base === base).type, 'force');
  assert.equal(g.state.outs, 1);
});

test('a relay can record a genuine second-to-first double play', () => {
  const g = live({ occupied: [1], defense: true });
  for (const r of g.state.runners) position(g, r, r.fromBase + 0.10, r.fromBase + 1);
  possession(g, 'SS', { x: -7, z: 29 });
  g.command({ type: 'throw', base: 2 });
  advance(g, s => s.play.stage === 'throw');
  assert.equal(g.command({ type: 'throw', base: 1 }), true);
  advance(g, s => s.phase === 'result');
  assert.equal(g.state.outs, 2); assert.equal(g.state.result.kind, 'doublePlay');
  assert.deepEqual(g.state.play.outs.map(out => [out.base, out.type]), [[2, 'force'], [1, 'force']]);
});

test('retiring the batter removes the leading runner’s force; touching second alone is not an out', () => {
  const g = live({ occupied: [1], defense: true });
  const batter = g.state.runners.find(r => r.fromBase === 0), lead = g.state.runners.find(r => r.fromBase === 1);
  position(g, lead, 1.15, 2); lead.speed = 0;
  position(g, batter, 0.1, 1); batter.speed = 0;
  possession(g, '1B', BASES[1]);
  g.update(STEP);
  assert.equal(batter.out, true); assert.equal(lead.forcedBase, null);
  g.command({ type: 'throw', base: 2 });
  advance(g, s => s.play.stage === 'held' && s.play.fielder !== '1B');
  assert.equal(lead.out, false); assert.equal(g.state.outs, 1);
});

test('a nonforced runner trying for second is tagged, not forced', () => {
  const g = live({ defense: true }), batter = g.state.runners.find(r => r.fromBase === 0);
  position(g, batter, 1.45, 2);
  possession(g, 'SS', { x: -5, z: 34 });
  g.command({ type: 'throw', base: 2 });
  advance(g, () => batter.out, 5);
  assert.equal(g.state.play.outs[0].type, 'tag'); assert.equal(g.state.play.outs[0].base, 2);
});

test('throwing to an unrelated empty base does not invent an out', () => {
  const g = live({ defense: true }), batter = g.state.runners[0];
  position(g, batter, 0.15, 1); possession(g, 'SS', { x: -8, z: 29 });
  g.command({ type: 'throw', base: 3 });
  advance(g, s => s.play.stage === 'throw');
  advance(g, s => s.play.stage === 'held');
  assert.equal(g.state.outs, 0); assert.equal(batter.out, false);
});

test('a new base selection queues the next throw without redirecting the current flight', () => {
  const g = live({ occupied: [1], defense: true }); possession(g, 'SS', { x: -7, z: 29 });
  g.command({ type: 'throw', base: 2 }); advance(g, s => s.play.stage === 'throw');
  const before = structuredClone(g.state.play.throw);
  assert.equal(g.command({ type: 'throw', base: 4 }), true);
  assert.equal(g.state.play.queuedBase, 4);
  assert.deepEqual(g.state.play.throw, before);
  g.update(STEP); assert.equal(g.state.play.throw.base, 2); assert.deepEqual(g.state.play.throw.to, before.to);
});

test('changing the base during transfer retargets the upcoming release before the ball leaves the hand', () => {
  const g = live({ defense: true }); possession(g, 'SS', { x: -7, z: 29 });
  g.command({ type: 'throw', base: 1 });
  const releaseAt = g.state.play.transferUntil;
  g.update(STEP);
  assert.equal(g.state.play.stage, 'held'); assert.ok(g.state.play.transferUntil > g.state.time);
  assert.equal(g.command({ type: 'throw', base: 1 }), true);
  assert.equal(g.state.play.transferUntil, releaseAt, 'same-base taps must not restart the gather');
  g.command({ type: 'throw', base: 4 });
  assert.ok(g.state.play.transferUntil > releaseAt, 'changing the base gives the fielder time to reset');
  assert.equal(g.state.play.throwBase, 4); assert.equal(g.state.play.queuedBase, null);
  advance(g, s => s.play.stage === 'throw');
  assert.equal(g.state.play.throw.base, 4);
});

test('stale pitch IDs reject runner and throw commands without changing their destinations', () => {
  const batting = live(), r = batting.state.runners[0];
  assert.equal(batting.command({ type: 'run', pitchId: 0, runnerId: r.id, base: 2 }), false);
  assert.equal(r.targetBase, 1);
  const fielding = live({ defense: true });
  assert.equal(fielding.command({ type: 'throw', pitchId: 0, base: 2 }), false);
  assert.equal(fielding.state.play.queuedBase, null);
});

test('a runner cannot select a bag occupied by a holding lead runner', () => {
  const g = live({ occupied: [2] }), batter = g.state.runners.find(r => r.fromBase === 0);
  assert.equal(g.command({ type: 'run', runnerId: batter.id, base: 2 }), false);
  assert.match(g.lastRejection, /occupied/);
});

test('a third-out force cancels a run that crossed home earlier in the play', () => {
  const g = live({ occupied: [3], defense: true, outs: 2 });
  const scorer = g.state.runners.find(r => r.fromBase === 3), batter = g.state.runners.find(r => r.fromBase === 0);
  position(g, scorer, 4, 4); scorer.scoredAt = 4.9;
  g.state.play.runCrossings = [{ runnerId: scorer.id, time: 4.9 }];
  position(g, batter, 0.5, 1); possession(g, '1B', BASES[1]);
  g.update(STEP);
  assert.equal(g.state.phase, 'result'); assert.equal(g.state.outs, 3);
  assert.deepEqual(g.state.score, [0, 0]); assert.match(g.state.result.detail, /No run/);
});

test('a third-out tag after the batter reached first preserves an earlier run', () => {
  const g = live({ occupied: [3], defense: true, outs: 2 });
  const scorer = g.state.runners.find(r => r.fromBase === 3), batter = g.state.runners.find(r => r.fromBase === 0);
  position(g, scorer, 4, 4); scorer.scoredAt = 4.9;
  g.state.play.runCrossings = [{ runnerId: scorer.id, time: 4.9 }];
  position(g, batter, 1.5, 2); possession(g, '2B', { x: batter.x, z: batter.z });
  g.update(STEP);
  assert.equal(g.state.phase, 'result'); assert.equal(g.state.play.outs[0].type, 'tag');
  assert.equal(g.state.score[1], 1); assert.equal(g.state.lineScore[1][0], 1);
});

test('tagging a runner who is still forced is a force out and cancels earlier runs on the third out', () => {
  const g = live({ occupied: [1, 3], defense: true, outs: 2 });
  const scorer = g.state.runners.find(r => r.fromBase === 3), forced = g.state.runners.find(r => r.fromBase === 1);
  position(g, scorer, 4, 4); scorer.scoredAt = 4.9;
  g.state.play.runCrossings = [{ runnerId: scorer.id, time: 4.9 }];
  position(g, forced, 1.5, 2); possession(g, 'SS', { x: forced.x, z: forced.z });
  g.update(STEP);
  assert.equal(g.state.phase, 'result'); assert.equal(g.state.play.outs[0].type, 'force');
  assert.equal(g.state.score[1], 0);
});

test('a queued multi-base play resumes deterministically from a snapshot', () => {
  const original = live({ occupied: [1], defense: true }); possession(original, 'SS', { x: -7, z: 29 });
  original.command({ type: 'throw', base: 2 }); advance(original, s => s.play.stage === 'throw');
  original.command({ type: 'throw', base: 1 });
  const restored = new BaseballGame().restore(original.snapshot());
  for (let i = 0; i < 600; i++) { original.update(STEP); restored.update(STEP); }
  assert.deepEqual(restored.snapshot(), original.snapshot());
});
