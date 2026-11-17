import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, STEP, PITCHERS, PITCHES, PITCHOUT, DEFENSIVE_ALIGNMENTS, fieldRadius, inStrikeZone } from '../public/engine.mjs';

function advance(game, predicate, seconds = 25) {
  for (let i = 0; i < seconds / STEP; i++) { if (predicate(game.state)) return; game.update(STEP); }
  assert.fail(`Timed out in ${game.state.phase}/${game.state.play?.stage}`);
}
function seconds(game, duration) { for (let i = 0; i < duration / STEP; i++) game.update(STEP); }
function game(options = {}, bases = []) {
  const g = new BaseballGame({ seed: 2003, humanSides: [0, 1], ...options });
  g.state.bases = [1, 2, 3].map(base => bases.includes(base) ? { id: 20 + base, number: base + 7, side: 0, speed: 7.4 } : null);
  g._ready();
  return g;
}
function pitch(g, pitchType = 'fastball', quality = 1) {
  assert.equal(g.command({ type: 'pitch', side: 1 - g.state.battingSide, pitchType, quality, aim: { x: 0, y: 0 } }), true, g.lastRejection);
}
function bunt(g, { offset = 0, aim = { x: 0, y: 0 }, power = false } = {}) {
  pitch(g);
  advance(g, s => s.phase === 'pitch' && s.time >= s.pitch.contactAt + Math.max(0, offset));
  assert.equal(g.command({ type: 'swing', side: g.state.battingSide, time: g.state.pitch.contactAt + offset, aim, bunt: true, power }), true, g.lastRejection);
}
function throwFirst(g) {
  assert.equal(g.command({ type: 'throw', side: 1, base: 1 }), true);
  advance(g, s => s.phase === 'result');
}

test('a timed bunt deadens the ball and cannot combine power with bunt', () => {
  const g = game(); bunt(g, { power: true });
  assert.equal(g.state.phase, 'live');
  assert.equal(g.state.swing.bunt, true); assert.equal(g.state.swing.power, false);
  assert.equal(g.state.play.bunt, true); assert.equal(g.state.lastContact.bunt, true);
  assert.ok(g.state.lastContact.exitVelocity >= 10 && g.state.lastContact.exitVelocity < 30);
  assert.ok(g.state.ball.vy < 0, 'clean bunt should be directed to the ground');
  const events = g.drainEvents();
  assert.equal(events.find(e => e.type === 'swing').bunt, true);
  assert.equal(events.find(e => e.type === 'contact').bunt, true);
  throwFirst(g);
  assert.equal(g.state.result.kind, 'groundout', 'bunting is not an automatic hit');
  assert.equal(g.state.hits[0], 0);
});

test('bunt aim directs the ball to either baseline for both batting hands', () => {
  for (const batterIndex of [0, 1]) for (const direction of [-1, 1]) {
    const g = game(); g.state.batterIndex[0] = batterIndex;
    bunt(g, { aim: { x: direction * .6, y: 0 } });
    assert.equal(g.state.phase, 'live');
    assert.equal(Math.sign(g.state.ball.vx), direction);
    assert.equal(g.state.play.fair, true);
  }
});

test('poor bunt location can pop up to the catcher while a badly timed bunt misses', () => {
  const popup = game(); bunt(popup, { aim: { x: 0, y: -.9 } });
  assert.ok(popup.state.lastContact.launchAngle > 45);
  advance(popup, s => s.phase === 'result');
  assert.equal(popup.state.result.kind, 'catch'); assert.equal(popup.state.play.catchFielder, 'C');
  assert.equal(popup.state.outs, 1); assert.equal(popup.state.hits[0], 0);
  const miss = game(); pitch(miss);
  assert.equal(miss.command({ type: 'swing', side: 0, time: miss.state.time, aim: { x: 0, y: 0 }, bunt: true }), true);
  advance(miss, s => s.phase === 'result');
  assert.equal(miss.state.result.kind, 'strike'); assert.equal(miss.state.lastContact.exitVelocity, 0);
  assert.equal(miss.state.lastContact.bunt, true);
});

test('a sacrifice bunt advances a runner through real running and throwing without adding a hit', () => {
  const g = game({}, [1]); bunt(g);
  const runner = g.state.runners.find(r => r.fromBase === 1);
  assert.equal(runner.highestBase, 1);
  throwFirst(g);
  assert.equal(g.state.result.kind, 'sacrificeBunt');
  assert.equal(g.state.outs, 1); assert.equal(g.state.hits[0], 0); assert.equal(g.state.batterIndex[0], 1);
  assert.equal(g.state.bases[0], null); assert.equal(g.state.bases[1].id, 21);
  assert.ok(runner.touchedAt[2] > g.state.play.contactAt);
  assert.ok(g.state.play.outs[0].time > g.state.play.contactAt);
});

test('a bunt can move an unforced runner from second, while a runner on third waits for a squeeze command', () => {
  const advanceRunner = game({}, [2]); bunt(advanceRunner); throwFirst(advanceRunner);
  assert.equal(advanceRunner.state.result.kind, 'sacrificeBunt');
  assert.equal(advanceRunner.state.bases[2].id, 22);
  const holdThird = game({}, [3]); bunt(holdThird); throwFirst(holdThird);
  assert.equal(holdThird.state.bases[2].id, 23); assert.equal(holdThird.state.score[0], 0);
  assert.equal(holdThird.state.result.kind, 'groundout');
});

test('a two-strike foul bunt retires the batter and returns running baserunners', () => {
  const g = game({}, [1]); g.state.strikes = 2; g.state.outs = 2;
  assert.equal(g.command({ type: 'steal', side: 0, runnerId: 21 }), true);
  bunt(g, { offset: .17, aim: { x: .3, y: 0 } });
  assert.equal(g.state.play.fair, false);
  advance(g, s => s.phase === 'result');
  assert.equal(g.state.result.kind, 'strikeout'); assert.match(g.state.result.title, /Foul bunt/);
  assert.equal(g.state.outs, 3); assert.equal(g.state.strikes, 3); assert.equal(g.state.pending, 'half');
  assert.equal(g.state.batterIndex[0], 1); assert.equal(g.state.bases[0].id, 21);
  assert.equal(g.state.runners[0].pathPosition, 1); assert.equal(g.state.score[0], 0);
});

test('a foul bunt before two strikes adds one strike and leaves the same batter up', () => {
  const g = game(); bunt(g, { offset: .17, aim: { x: .3, y: 0 } });
  advance(g, s => s.phase === 'result');
  assert.equal(g.state.result.kind, 'foul'); assert.equal(g.state.result.title, 'Foul bunt');
  assert.equal(g.state.strikes, 1); assert.equal(g.state.outs, 0); assert.equal(g.state.batterIndex[0], 0);
});

test('pitchout is available to every staff member without entering their normal repertoire', () => {
  assert.equal(PITCHOUT.label, 'Pitchout'); assert.equal(PITCHES.pitchout, undefined);
  for (const profile of Object.keys(PITCHERS)) {
    const g = game({ opponentPitcher: profile });
    assert.equal(g.availablePitches.includes('pitchout'), false);
    const pitcherId = g.activePitcher.playerId;
    pitch(g, 'pitchout');
    assert.equal(g.state.pitch.type, 'pitchout'); assert.equal(inStrikeZone(g.state.pitch.target), false);
    assert.equal(g.state.pitching[1].pitchCounts[pitcherId], 1);
    advance(g, s => s.phase === 'result');
    assert.equal(g.state.result.kind, 'ball'); assert.equal(g.state.balls, 1); assert.equal(g.state.strikes, 0);
  }
});

test('pitchouts stay away from left- and right-handed hitters even with a poor release and inside aim', () => {
  for (const batterIndex of [0, 1]) for (const quality of [0, .5, 1]) {
    const g = game(); g.state.batterIndex[0] = batterIndex;
    const hand = g.currentBatter.hand;
    assert.equal(g.command({ type: 'pitch', side: 1, pitchType: 'pitchout', quality, aim: { x: hand === 'R' ? -1 : 1, y: -1 } }), true);
    assert.equal(Math.sign(g.state.pitch.target.x), hand === 'R' ? 1 : -1);
    assert.ok(Math.abs(g.state.pitch.target.x) >= 1.18);
    advance(g, s => s.phase === 'result');
    assert.equal(g.state.result.kind, 'ball'); assert.equal(g.state.hitByPitches[0], 0);
  }
});

test('a fourth-ball pitchout walks only forced runners and ends an in-progress steal', () => {
  const g = game({}, [1]); g.state.balls = 3;
  g.command({ type: 'steal', side: 0, runnerId: 21 }); pitch(g, 'pitchout');
  advance(g, s => s.phase === 'result');
  assert.equal(g.state.result.kind, 'walk'); assert.equal(g.state.bases[1].id, 21);
  assert.ok(g.state.bases[0]); assert.equal(g.state.bases[2], null);
  assert.equal(new Set(g.state.bases.filter(Boolean).map(r => r.id)).size, 2);
  assert.equal(g.state.outs, 0); assert.equal(g.state.hits[0], 0);
});

function stealAttempt(type) {
  const g = game({ difficulty: 'club' }, [1]);
  g.command({ type: 'lead', side: 0, runnerId: 21, amount: 1 }); seconds(g, 1);
  g.command({ type: 'steal', side: 0, runnerId: 21 }); pitch(g, type);
  advance(g, s => s.phase === 'live');
  const receiveAt = g.state.time;
  assert.equal(g.command({ type: 'throw', side: 1, base: 2 }), true);
  advance(g, s => s.play.stage === 'throw');
  const transfer = g.state.play.throw.startedAt - receiveAt;
  advance(g, s => s.phase === 'result');
  return { g, transfer };
}

test('pitchout speeds the catcher’s first steal response and can change a close play at the cost of a ball', () => {
  const normal = stealAttempt('fastball'), pitchout = stealAttempt('pitchout');
  assert.equal(normal.g.state.result.kind, 'stolenBase');
  assert.equal(pitchout.g.state.result.kind, 'caughtStealing');
  assert.ok(normal.transfer - pitchout.transfer > .20);
  assert.equal(pitchout.g.state.balls, 1); assert.equal(pitchout.g.state.strikes, 0);
  const p = pitchout.g.state.play, catcher = pitchout.g.state.fielders.find(f => f.id === 'C');
  pitchout.g._fieldBall(catcher); pitchout.g._prepareThrow(3);
  assert.equal(p.pitchoutReady, false, 'a return relay cannot reuse the initial pitchout bonus');
  assert.ok(p.transferUntil - pitchout.g.state.time >= .419);
});

test('alignment is side-authorized, remains locked during play, and persists separately for each club', () => {
  const g = game(); const before = g.state.fielders.map(f => [f.x, f.z]);
  assert.equal(g.command({ type: 'defense', side: 0, alignment: 'infieldIn' }), false);
  assert.equal(g.command({ type: 'defense', side: 1, alignment: '__proto__' }), false);
  assert.deepEqual(g.state.fielders.map(f => [f.x, f.z]), before);
  assert.equal(g.command({ type: 'defense', side: 1, alignment: 'infieldIn' }), true);
  const third = g.state.fielders.find(f => f.id === '3B'); assert.ok(Math.hypot(third.x, third.z) < 23);
  pitch(g);
  assert.equal(g.command({ type: 'defense', side: 1, alignment: 'deep' }), false);
  advance(g, s => s.phase === 'result');
  assert.equal(g.command({ type: 'defense', side: 1, alignment: 'doublePlay' }), true);
  g.command({ type: 'next', side: 0 });
  assert.equal(g.state.defensiveAlignment[1], 'doublePlay');
  const second = g.state.fielders.find(f => f.id === '2B'); assert.ok(Math.abs(second.x) < 8);
  g.state.phase = 'half'; g._nextHalf();
  assert.equal(g.state.defensiveAlignment[0], 'normal'); assert.equal(g.state.defensiveAlignment[1], 'doublePlay');
  assert.equal(g.command({ type: 'defense', side: 0, alignment: 'deep' }), true);
  assert.equal(g.state.fielders.find(f => f.id === 'CF').z, 94);
});

test('all defensive alignments fit inside either park and preserve player identities and speed', () => {
  for (const park of ['fenway', 'harbor']) for (const alignment of Object.keys(DEFENSIVE_ALIGNMENTS)) {
    const g = game({ park }), original = g.state.fielders.map(f => [f.id, f.playerId, f.speed]);
    g.command({ type: 'defense', side: 1, alignment });
    assert.deepEqual(g.state.fielders.map(f => [f.id, f.playerId, f.speed]), original);
    for (const f of g.state.fielders) {
      assert.ok(Math.hypot(f.x, f.z) < fieldRadius(Math.atan2(f.x, f.z), park));
      assert.equal(f.prevX, f.x); assert.equal(f.prevZ, f.z);
    }
  }
});

test('CPU alignment responds to visible situation without reading the steal command', () => {
  function align(bases, outs, inning, stealQueued) {
    const g = game({ humanSides: [0] }, bases); g.state.outs = outs; g.state.inning = inning;
    for (const runner of g.state.runners) runner.stealQueued = stealQueued;
    g._cpuDefense(); return g.state.defensiveAlignment[1];
  }
  assert.equal(align([1], 0, 1, false), 'doublePlay');
  assert.equal(align([1], 0, 1, true), 'doublePlay');
  assert.equal(align([3], 0, 2, false), 'infieldIn');
  assert.equal(align([], 0, 1, false), 'normal');
});

test('bunts and defensive positioning replay deterministically through a snapshot; old alignment data defaults safely', () => {
  const original = game({}, [1]);
  original.command({ type: 'defense', side: 1, alignment: 'infieldIn' }); bunt(original, { aim: { x: -.6, y: 0 } });
  seconds(original, .3);
  const restored = new BaseballGame().restore(original.snapshot());
  original.command({ type: 'throw', side: 1, base: 1 }); restored.command({ type: 'throw', side: 1, base: 1 });
  advance(original, s => s.phase === 'result'); advance(restored, s => s.phase === 'result');
  assert.deepEqual(restored.snapshot(), original.snapshot());
  const legacy = game().snapshot(); delete legacy.state.defensiveAlignment;
  assert.deepEqual(new BaseballGame().restore(legacy).state.defensiveAlignment, ['normal', 'normal']);
  legacy.state.defensiveAlignment = ['__proto__', 'deep'];
  assert.deepEqual(new BaseballGame().restore(legacy).state.defensiveAlignment, ['normal', 'deep']);
});
