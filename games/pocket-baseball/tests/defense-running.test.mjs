import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, BASES, STEP, BALL_RADIUS } from '../public/engine.mjs';
import { planThrow, stepThrow, BASE_TOUCH_RADIUS } from '../public/throwing.mjs';

function advance(game, predicate, seconds = 15) {
  for (let i = 0; i < seconds / STEP; i++) { if (predicate()) return; game.update(STEP); }
  assert.fail(`Timed out: ${game.state.phase}/${game.state.play?.stage}`);
}
function live({ occupied = [], outs = 0, humanSides = [0, 1] } = {}) {
  const g = new BaseballGame({ seed: 7143, humanSides }), s = g.state;
  s.time = 5; s.tick = 600; s.phase = 'pitch'; s.outs = outs;
  s.bases = [1, 2, 3].map(base => occupied.includes(base) ? { id: base + 20, number: base, side: 0, speed: 7 } : null);
  s.pitch = { id: 1, type: 'fastball', mph: 94, quality: 1, target: { x: .04, y: 1.04, z: 0 },
    start: { x: -.32, y: 1.88, z: 18.44 }, breakX: .04, breakY: .06, duration: 1, releaseAt: 4, contactAt: 5, resolved: false, aiSwing: null };
  assert.equal(g.command({ type: 'swing', side: 0, time: 5, aim: { x: 0, y: 0 } }), true);
  Object.assign(s.ball, { x: 0, y: BALL_RADIUS, z: 70, vx: 0, vy: 0, vz: 0, bounced: true });
  return g;
}
function place(f, p) { Object.assign(f, p, { prevX: p.x, prevZ: p.z }); }

test('a weak arm needs several real bounces from deep outfield; a cannon can carry the same distance', () => {
  const results = [.25, .60, .95].map(arm => {
    const from = { x: 0, y: 1.45, z: 95 }, plan = planThrow(from, { x: 0, y: 1.25, z: 0 }, { arm, accuracy: .8 });
    const ball = { ...from, vx: plan.vx, vy: plan.vy, vz: plan.vz };
    let hops = 0, time = 0;
    while (ball.z > 0 && time < 15) { hops += Number(stepThrow(ball, STEP)); time += STEP; }
    assert.ok(ball.z <= 0, 'the long throw must remain recoverable rather than disappearing');
    return { hops, time, y: ball.y };
  });
  assert.ok(results[0].hops >= 2); assert.ok(results[1].hops >= 1); assert.equal(results[2].hops, 0);
  assert.ok(results[0].time > results[2].time * 1.7);
  assert.ok(results[2].y > .6 && results[2].y < 1.7);
});

test('holding the ball near a force base is insufficient until the receiver physically touches it', () => {
  const g = live(), s = g.state, batter = s.runners.find(r => r.fromBase === 0), first = s.fielders.find(f => f.id === '1B');
  batter.speed = 0;
  place(first, { x: BASES[1].x + .58, z: BASES[1].z });
  g._fieldBall(first); s.play.coverBase = 1;
  g._resolvePossession(first, s.time);
  assert.equal(batter.out, false, 'catching within glove reach must not invent foot contact');
  advance(g, () => batter.out, 1);
  assert.ok(Math.hypot(first.x - BASES[1].x, first.z - BASES[1].z) <= BASE_TOUCH_RADIUS + 1e-7);
  assert.equal(s.play.outs[0].type, 'force');
});

test('a throw to an uncovered base continues through the real endpoint instead of teleporting a receiver or creating an out', () => {
  const g = live(), s = g.state, source = s.fielders.find(f => f.id === 'RF');
  for (const f of s.fielders) { place(f, { x: 70, z: 55 }); f.speed = 0; }
  place(source, { x: 0, z: 50 });
  for (const r of s.runners) { r.speed = 0; r.manual = true; }
  g._fieldBall(source); g._prepareThrow(3);
  advance(g, () => s.play.stage === 'throw');
  const flight = s.play.throw, receiver = s.fielders.find(f => f.id === flight.receiver), receiverBefore = [receiver.x, receiver.z];
  advance(g, () => s.time > flight.startedAt + flight.duration + .2);
  assert.equal(s.outs, 0); assert.equal(s.play.stage, 'throw');
  assert.deepEqual([receiver.x, receiver.z], receiverBefore);
  assert.ok(Math.hypot(s.ball.x - flight.to.x, s.ball.z - flight.to.z) > .5, 'the ball was snapped onto a virtual base receiver');
  advance(g, () => s.play.stage === 'flight' || s.phase === 'result');
  if (s.phase === 'result') assert.equal(s.play.overthrowAward, true);
  else { assert.equal(s.play.ballKind, 'loose'); assert.ok(Math.hypot(s.ball.vx, s.ball.vz) > 0); }
  assert.equal(s.outs, 0);
});

test('the receiving infielder begins covering only when a stealing runner visibly goes', () => {
  const g = new BaseballGame({ humanSides: [0, 1] });
  g.state.bases = [{ id: 21, number: 4, side: 0, speed: 7 }, null, null]; g._ready();
  const f = g.state.fielders.find(f => f.id === '2B'), original = { x: f.x, z: f.z };
  g.command({ type: 'steal', side: 0, runnerId: 21 });
  for (let i = 0; i < 30; i++) g.update(STEP);
  assert.equal(f.x, original.x); assert.equal(f.z, original.z, 'queued intent is not visible to the defense');
  g.command({ type: 'pitch', side: 1, pitchType: 'fastball', quality: 1 });
  for (let i = 0; i < 60; i++) g.update(STEP);
  assert.ok(Math.hypot(f.x - BASES[2].x, f.z - BASES[2].z) < Math.hypot(original.x - BASES[2].x, original.z - BASES[2].z));
});

test('runners go on airborne contact with two outs and hold for the catch with fewer than two', () => {
  for (const outs of [1, 2]) {
    const g = live({ occupied: [1], outs }), s = g.state, runner = s.runners.find(r => r.fromBase === 1);
    for (const f of s.fielders) { place(f, { x: -60, z: 10 }); f.speed = 0; }
    Object.assign(s.ball, { x: 15, y: 25, z: 75, vx: 0, vy: 2, vz: 0, bounced: false });
    s.play.landing = { x: 15, z: 75, time: 3 };
    for (let i = 0; i < 48; i++) g.update(STEP);
    if (outs === 2) assert.ok(runner.pathPosition > 1.08);
    else assert.equal(runner.pathPosition, 1);
  }
});

test('choosing a distant destination cannot run through an occupied intermediate bag', () => {
  const g = live({ occupied: [2] }), batter = g.state.runners.find(r => r.fromBase === 0);
  assert.equal(g.command({ type: 'run', side: 0, runnerId: batter.id, base: 4 }), false);
  assert.match(g.lastRejection, /occupied/);
});

test('the batter stops behind the nearest lead runner when first and second both hold for a fly', () => {
  const g = live({ occupied: [1, 2] }), s = g.state;
  for (const f of s.fielders) { place(f, { x: -60, z: 10 }); f.speed = 0; }
  Object.assign(s.ball, { x: 10, y: 70, z: 80, vx: 0, vy: 20, vz: 0, bounced: false });
  s.play.landing = { x: 10, z: 80, time: 10 };
  for (let i = 0; i < 600; i++) g.update(STEP);
  const batter = s.runners.find(r => r.fromBase === 0), first = s.runners.find(r => r.fromBase === 1), second = s.runners.find(r => r.fromBase === 2);
  assert.ok(batter.pathPosition <= first.pathPosition - .0449);
  assert.ok(first.pathPosition < second.pathPosition); assert.equal(batter.highestBase, 0);
});

test('a small-park overthrow beyond playable foul territory awards bases and cannot strand the game', () => {
  const g = live({ occupied: [1] }), s = g.state;
  g.options.park = s.options.park = 'maple';
  Object.assign(s.play, { stage: 'flight', ballKind: 'loose', fielder: null,
    throw: { badThrow: true, receiver: '1B', fromPitch: false, awardOrigins: Object.fromEntries(s.runners.map(r => [r.id, r.fromBase])) } });
  Object.assign(s.ball, { x: 63.4, y: BALL_RADIUS, z: -37.7, vx: 0, vy: 0, vz: 0, bounced: true });
  g.update(STEP);
  assert.equal(s.phase, 'result'); assert.equal(s.play.overthrowAward, true); assert.match(s.result.title, /Overthrow/);
  assert.ok(s.bases[1]); assert.ok(s.bases[2]); assert.equal(s.bases[0], null); assert.equal(s.outs, 0);
});

test('a blocked assisted runner returns, and a covered defender can leave the bag to complete a nearby tag', () => {
  for (const manual of [false, true]) {
    const g = live({ occupied: [1] }), s = g.state, lead = s.runners.find(r => r.fromBase === 1), batter = s.runners.find(r => r.fromBase === 0);
    Object.assign(lead, { base: 2, highestBase: 2, targetBase: 2, pathPosition: 2, prevPathPosition: 2,
      x: 0, prevX: 0, z: 38.8, prevZ: 38.8, touchedAt: { 1: 4, 2: 4.9 }, safe: true, manual: true });
    const path = 1.955, x = BASES[1].x * (2 - path), z = BASES[1].z + (BASES[2].z - BASES[1].z) * (path - 1);
    Object.assign(batter, { base: 1, highestBase: 1, targetBase: 2, pathPosition: path, prevPathPosition: path,
      x, prevX: x, z, prevZ: z, touchedAt: { 1: 4.5 }, safe: false, manual });
    const second = s.fielders.find(f => f.id === '2B'); place(second, BASES[2]);
    g._fieldBall(second); s.play.coverBase = 2;
    g.update(STEP);
    if (!manual) assert.equal(batter.targetBase, 1, 'automatic running must yield when a lead runner holds the destination');
    else {
      advance(g, () => batter.out, 3);
      assert.equal(s.play.outs.at(-1).type, 'tag');
      assert.equal(lead.out, false, 'the lead runner remains safe on the occupied base');
    }
  }
});

test('manual HOLD overrides an obvious automatic extra base for the remainder of the play', () => {
  const g = live(), s = g.state, batter = s.runners.find(r => r.fromBase === 0);
  for (const f of s.fielders) { place(f, { x: -70, z: 15 }); f.speed = 0; }
  Object.assign(s.ball, { x: 55, z: 80 });
  g.update(STEP); assert.ok(batter.targetBase >= 2);
  assert.equal(g.command({ type: 'run', side: 0, runnerId: batter.id, action: 'hold' }), true);
  for (let i = 0; i < 240; i++) g.update(STEP);
  assert.equal(batter.targetBase, 1); assert.equal(batter.manual, true);
});

test('routine stationary pickups stay dependable while a poor fielder moving into hard contact can bobble', () => {
  const counts = [0, 0];
  for (let i = 1; i <= 800; i++) for (const hard of [0, 1]) {
    const g = new BaseballGame({ seed: (i * 2654435761) >>> 0 }), f = g.state.fielders[2];
    g.state.play = { stage: 'flight' }; f.fielding = hard ? .15 : .9;
    f.prevX = f.x - (hard ? f.speed * STEP : 0); f.prevZ = f.z;
    if (!g._cleanFielding(f, 'pickup', hard ? 40 : 4)) counts[hard]++;
  }
  assert.ok(counts[0] < 12, `routine error rate ${counts[0]}/800`);
  assert.ok(counts[1] > counts[0] + 18 && counts[1] < 125, `difficult error rate ${counts[1]}/800`);
});

test('a bouncing throw and its recovery replay identically from a mid-flight snapshot', () => {
  const g = live(), s = g.state, source = s.fielders.find(f => f.id === 'LF');
  place(source, { x: -20, z: 92 }); source.arm = .25; source.accuracy = .6;
  for (const runner of s.runners) { runner.speed = 0; runner.manual = true; }
  g._fieldBall(source); g._prepareThrow(4); advance(g, () => s.play.stage === 'throw');
  advance(g, () => s.play.throw.hops >= 1);
  const replay = new BaseballGame().restore(g.snapshot());
  for (let i = 0; i < 480; i++) { g.update(STEP); replay.update(STEP); }
  assert.deepEqual(replay.snapshot(), g.snapshot());
});

test('a player retains name, handedness and appearance after becoming a held baserunner', () => {
  const g = live(), s = g.state, batter = s.runners.find(r => r.fromBase === 0);
  Object.assign(batter, { pathPosition: 1, base: 1, highestBase: 1, targetBase: 1, safe: true, touchedAt: { 1: s.time } });
  g._finishLive();
  assert.equal(s.bases[0].playerId, batter.playerId); assert.equal(s.bases[0].name, batter.name);
  assert.deepEqual(s.bases[0].appearance, batter.appearance);
  g.command({ type: 'next' }); assert.equal(s.runners[0].name, batter.name);
});
