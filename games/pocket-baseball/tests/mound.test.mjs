import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, STEP, PITCH_AIM_AREA, MOUND_RULES, FIGHT_ACTIONS, getBatterBody, getLineup, getRoster } from '../public/engine.mjs';

const make = options => new BaseballGame({ seed: 2003, humanSides: [0, 1], ...options });
function advance(game, predicate, seconds = 15) {
  for (let i = 0; i < seconds / STEP; i++) {
    if (predicate(game.state)) return;
    game.update(STEP);
  }
  assert.fail(`Timed out: ${game.state.phase}/${game.state.brawl?.stage}`);
}
function hitBatter(game) {
  assert.equal(game.state.phase, 'ready');
  const body = getBatterBody(game.state);
  assert.equal(game.command({ type: 'pitch', side: 1 - game.state.battingSide, pitchType: game.availablePitches.includes('fastball') ? 'fastball' : game.availablePitches[0], quality: 1,
    aim: { x: body.x / PITCH_AIM_AREA.x, y: 0 } }), true, game.lastRejection);
  advance(game, s => s.phase === 'result');
  assert.equal(game.state.result.kind, 'hitByPitch');
}
function eligible(options) {
  const game = make(options);
  hitBatter(game); game.command({ type: 'next' }); hitBatter(game);
  return game;
}
function charge(game = eligible()) {
  assert.equal(game.command({ type: 'chargeMound', side: game.state.battingSide }), true, game.lastRejection);
  advance(game, s => s.brawl.stage === 'fight');
  return game;
}
function finish(game) { advance(game, s => s.phase === 'result'); return game; }

test('a warning follows one awarded HBP; two offer the batting club a voluntary charge', () => {
  const game = make();
  hitBatter(game);
  assert.deepEqual(game.state.temper, [1, 0]); assert.equal(game.state.confrontation, null);
  assert.equal(game.drainEvents().filter(e => e.type === 'mound-warning').length, 1);
  game.command({ type: 'next' }); const batter = game.currentBatter; hitBatter(game);
  assert.deepEqual(game.state.temper, [2, 0]);
  assert.equal(game.state.confrontation.batter.id, batter.id);
  assert.equal(game.state.confrontation.batter.hand, 'L');
  assert.equal(game.state.confrontation.pitcher.id, game.activePitcher.playerId);
  assert.equal(game.state.confrontation.hitCount, MOUND_RULES.hitsToOffer);
  assert.equal(game.state.phase, 'result'); assert.equal(game.state.bases.filter(Boolean).length, 2);
  for (let i = 0; i < 300; i++) game.update(STEP);
  assert.equal(game.state.phase, 'result', 'human choice never times out into a fight');
});

test('taking first clears the offer and keeps the HBP award; a later HBP can renew it', () => {
  const game = eligible(), bases = structuredClone(game.state.bases);
  assert.equal(game.command({ type: 'next', side: 0 }), true);
  assert.equal(game.state.confrontation, null); assert.equal(game.state.brawl, null);
  assert.deepEqual(game.state.bases, bases);
  assert.equal(game.command({ type: 'chargeMound', side: 0 }), false);
  hitBatter(game); assert.equal(game.state.confrontation.hitCount, 3);
});

test('only the hit club may charge, and the defending pitcher cannot be swapped to evade it', () => {
  const game = eligible();
  assert.equal(game.command({ type: 'chargeMound', side: 1 }), false);
  assert.equal(game.command({ type: 'chargeMound', side: 9 }), false);
  assert.equal(game.command({ type: 'changePitcher', side: 1, pitcherId: 'foundry-southpaw' }), false);
  assert.match(game.lastRejection, /hitter/);
  assert.equal(game.command({ type: 'changePitcher', side: 0, pitcherId: 'harbor-southpaw' }), true);
  assert.equal(game.command({ type: 'chargeMound', side: 0 }), true);
  assert.deepEqual(game.state.temper, [0, 0]);
  for (const input of [{ type: 'next' }, { type: 'pitch', side: 1 }, { type: 'swing', side: 0 },
    { type: 'changePitcher', side: 1, pitcherId: 'foundry-southpaw' }]) assert.equal(game.command(input), false);
  assert.equal(game.command({ type: 'fight', action: 'jab', side: 0 }), false, 'no punch during the run to the mound');
});

test('jabs telegraph, spend stamina once, and reject button-mashing during recovery', () => {
  const game = charge(); const before = game.state.time;
  assert.equal(game.command({ type: 'fight', action: 'jab', side: 0 }), true);
  assert.equal(game.state.brawl.fighters[0].stamina, 100 - FIGHT_ACTIONS.jab.cost);
  assert.equal(game.state.brawl.fighters[0].impactAt, before + FIGHT_ACTIONS.jab.impact);
  assert.equal(game.state.brawl.fighters[1].health, 100);
  for (let i = 0; i < 100; i++) assert.equal(game.command({ type: 'fight', action: 'jab', side: 0 }), false);
  advance(game, s => s.brawl.fighters[0].impactDone);
  assert.equal(game.state.brawl.fighters[1].health, 83);
  assert.equal(game.state.brawl.fighters[0].hits, 1);
  assert.equal(game.drainEvents().filter(e => e.type === 'fight-hit').length, 1);
});

test('guard absorbs most damage and dodge avoids it; a timed defense opens a counter', () => {
  for (const action of ['guard', 'dodge']) {
    const game = charge();
    game.command({ type: 'fight', action: 'jab', side: 0 });
    game.command({ type: 'fight', action, side: 1 });
    advance(game, s => s.brawl.fighters[0].impactDone);
    const defender = game.state.brawl.fighters[1];
    assert.equal(defender.health, action === 'guard' ? 97 : 100);
    assert.equal(defender[action === 'guard' ? 'blocks' : 'dodges'], 1);
    assert.ok(defender.counterUntil > game.state.time);
    advance(game, s => s.time >= defender.cooldownUntil);
    assert.equal(game.command({ type: 'fight', action: 'jab', side: 1 }), true);
    assert.equal(defender.counter, true);
    advance(game, s => s.brawl.fighters[1].impactDone);
    assert.equal(game.state.brawl.fighters[0].health, 76);
  }
});

test('simultaneous impacts resolve symmetrically rather than favoring an input seat', () => {
  const game = charge();
  game.command({ type: 'fight', action: 'jab', side: 1 });
  game.command({ type: 'fight', action: 'jab', side: 0 });
  advance(game, s => s.brawl.fighters.every(f => f.impactDone));
  assert.deepEqual(game.state.brawl.fighters.map(f => f.health), [83, 83]);
  assert.equal(game.command({ type: 'fight', action: '__proto__', side: 0 }), false);
});

test('fight ends on its own and ejects both participants without changing count, score or occupied bags', () => {
  const game = eligible(), s = game.state, offer = structuredClone(s.confrontation);
  s.balls = 2; s.strikes = 1;
  const before = { score: [...s.score], lineScore: structuredClone(s.lineScore), hits: [...s.hits],
    outs: s.outs, bases: s.bases.map(r => r?.id), batterIndex: [...s.batterIndex] };
  charge(game); finish(game);
  assert.equal(s.result.kind, 'brawl'); assert.equal(s.brawl.stage, 'done'); assert.equal(s.brawl.winner, null);
  assert.deepEqual(s.score, before.score); assert.deepEqual(s.lineScore, before.lineScore);
  assert.deepEqual(s.hits, before.hits); assert.equal(s.outs, before.outs);
  assert.deepEqual(s.bases.map(r => r?.id), before.bases); assert.deepEqual(s.batterIndex, before.batterIndex);
  assert.equal(s.balls, 2); assert.equal(s.strikes, 1);
  assert.ok(s.ejections[0].includes(offer.batter.id)); assert.ok(s.ejections[1].includes(offer.pitcher.id));
  assert.notEqual(s.bases[0].playerId, offer.batter.id); assert.equal(s.bases[0].playerId, getRoster(0).bench[0].id);
  assert.equal(getLineup(s, 0)[1].id, s.bases[0].playerId); assert.equal(getLineup(s, 0)[1].position, 'CF');
  assert.equal(game.getBullpen(1).find(p => p.id === offer.pitcher.id).ejected, true);
  assert.equal(game.command({ type: 'changePitcher', side: 1, pitcherId: offer.pitcher.id }), false);
  assert.equal(game.command({ type: 'next' }), true); assert.equal(s.phase, 'ready'); assert.equal(s.brawl, null);
  assert.ok(s.runners.some(r => r.playerId === getRoster(0).bench[0].id));
});

test('a reserve keeps the ejected hitter’s batting slot and defensive position after innings change', () => {
  const game = finish(charge()); const reserve = getRoster(0).bench[0];
  game.state.batterIndex[0] = 1;
  assert.equal(game.currentBatter.id, reserve.id);
  game.state.battingSide = 1; game.state.half = 'bottom'; game._ready();
  const cf = game.state.fielders.find(f => f.id === 'CF');
  assert.equal(cf.playerId, reserve.id); assert.equal(cf.number, reserve.number);
  assert.equal(game.getBench(0).find(p => p.id === reserve.id).active, true);
});

test('snapshots preserve a pending jab, roster consequences and deterministic CPU decisions', () => {
  const game = charge(); game.options.humanSides = [0]; game.state.options.humanSides = [0];
  game.command({ type: 'fight', action: 'jab', side: 0 });
  for (let i = 0; i < 10; i++) game.update(STEP);
  const restored = new BaseballGame().restore(game.snapshot());
  assert.deepEqual(restored.snapshot(), game.snapshot());
  for (let i = 0; i < 1600; i++) { game.update(STEP); restored.update(STEP); }
  assert.deepEqual(restored.snapshot(), game.snapshot());
  assert.equal(game.state.phase, 'result'); assert.ok(game.state.brawl.fighters[1].hits + game.state.brawl.fighters[1].blocks + game.state.brawl.fighters[1].dodges > 0);
});

test('computer hit batters can charge and computer fighters finish without human input', () => {
  const game = eligible(); game.options.humanSides = []; game.state.options.humanSides = [];
  assert.equal(game.command({ type: 'next' }), false, 'the opposing side cannot skip a CPU decision');
  advance(game, s => s.phase === 'brawl');
  assert.equal(game.state.brawl.cpuCharge, true);
  assert.equal(game.command({ type: 'fight', action: 'jab', side: 0 }), false);
  finish(game); assert.equal(game.state.result.kind, 'brawl');
  assert.ok(game.state.brawl.fighters.every(f => f.hits + f.blocks + f.dodges > 0));
});

test('ordinary batting practice and a game-winning HBP never offer a fight', () => {
  const practice = make({ mode: 'practice' });
  for (let i = 0; i < 3; i++) { hitBatter(practice); assert.equal(practice.state.confrontation, null); practice.command({ type: 'next' }); }
  const game = make(); game.state.battingSide = 1; game.state.half = 'bottom'; game.state.inning = 3;
  game.state.temper[1] = 1; game.state.lineScore = [[0, 0, 0], [0, 0, 0]];
  game.state.bases = [game._runner(), game._runner(), game._runner()]; game._ready();
  hitBatter(game); assert.equal(game.state.pending, 'final'); assert.equal(game.state.confrontation, null);
  assert.equal(game.command({ type: 'chargeMound', side: 1 }), false);
});

test('an exhausted bench or bullpen suppresses the offer rather than trapping the match', () => {
  const game = make();
  game.state.ejections[0] = getRoster(0).bench.map(p => p.id);
  hitBatter(game); game.command({ type: 'next' }); hitBatter(game);
  assert.equal(game.state.confrontation, null); assert.equal(game.command({ type: 'next' }), true);
  const other = make(); other.state.pitching[1].usedIds = getRoster(1).pitchers.filter(p => p.id !== other.state.pitching[1].activeId).map(p => p.id);
  hitBatter(other); other.command({ type: 'next' }); hitBatter(other);
  assert.equal(other.state.confrontation, null); assert.equal(other.command({ type: 'next' }), true);
});

test('all three reserves can enter and no ejected player returns after repeated incidents', () => {
  const game = make();
  for (let i = 0; i < 3; i++) {
    hitBatter(game); game.command({ type: 'next' }); hitBatter(game);
    assert.ok(game.state.confrontation); finish(charge(game));
    assert.equal(game.getBench(0).filter(p => p.active).length, i + 1);
    assert.equal(game.state.ejections[0].length, i + 1);
    game.command({ type: 'next' });
  }
  hitBatter(game); game.command({ type: 'next' }); hitBatter(game);
  assert.equal(game.state.confrontation, null);
  assert.ok(getLineup(game.state, 0).every(p => !game.state.ejections[0].includes(p.id)));
});

test('the mound drill starts at the choice and reliably restocks itself for another attempt', () => {
  const game = make({ mode: 'practice', scenario: 'mound', humanSides: [0] });
  assert.equal(game.state.phase, 'result'); assert.ok(game.state.confrontation);
  const initialPitcher = game.activePitcher.playerId;
  assert.equal(game.state.bases[0].playerId, game.state.confrontation.batter.id);
  finish(charge(game)); assert.equal(game.state.ejections[0].length, 1);
  game.command({ type: 'next' });
  assert.equal(game.state.phase, 'result'); assert.ok(game.state.confrontation);
  assert.equal(game.activePitcher.playerId, initialPitcher);
  assert.deepEqual(game.state.ejections, [[], []]); assert.equal(game.getBench(0).filter(p => p.available).length, 3);
});

test('legacy snapshots receive empty escalation and reserve usage without altering batting state', () => {
  const game = make(), old = game.snapshot();
  for (const field of ['lineupChanges', 'ejections', 'temper', 'confrontation', 'brawl']) delete old.state[field];
  const restored = new BaseballGame().restore(old);
  assert.equal(restored.currentBatter.id, game.currentBatter.id);
  assert.deepEqual(restored.state.temper, [0, 0]); assert.deepEqual(restored.state.lineupChanges, [{}, {}]);
  assert.equal(restored.getBench(0).filter(p => p.available).length, 3);
});
